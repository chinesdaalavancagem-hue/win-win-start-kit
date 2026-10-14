import { createFileRoute } from "@tanstack/react-router";

const CATEGORIES = new Set(["auth", "strategy", "integration", "navigation", "system", "ui"]);
const OUTCOMES = new Set(["success", "failed", "denied", "started", "unknown"]);
const CLIENT_ACTIONS = new Set(["login.success", "signup.success", "logout", "integration.key_failed", "integration.download_requested", "integration.download_failed", "integration.file_published", "navigation.opened", "ui.button_clicked", "system.error"]);
type D = Record<string, unknown>;
type Row = { id: string; user_id: string | null; created_at: string; category: string; action: string; outcome: string; details: D; source: "audit" | "activity" | "device" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
async function authenticatedUser(request: Request) {
  const h = request.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}
const obj = (v: unknown): D => v && typeof v === "object" && !Array.isArray(v) ? v as D : {};

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 30;
// Process-local sliding window; no schema or other files are needed.
const postEventTimestamps = new Map<string, number[]>();

function validateDetails(value: unknown): D | null {
  // Keep existing callers that omit details compatible.
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 10) return null;
  for (const [, item] of entries) {
    if (typeof item === "string") {
      if (item.length > 500) return null;
    } else if (
      item !== null &&
      typeof item !== "boolean" &&
      (typeof item !== "number" || !Number.isFinite(item))
    ) {
      // Depth 1: scalar values only; nested objects and arrays are rejected.
      return null;
    }
  }
  return value as D;
}

function consumePostRateLimit(userId: string, now = Date.now()): boolean {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const recent = (postEventTimestamps.get(userId) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= RATE_LIMIT_MAX_EVENTS) {
    postEventTimestamps.set(userId, recent);
    return false;
  }

  recent.push(now);
  postEventTimestamps.set(userId, recent);

  // Bound stale-key accumulation in long-lived server processes.
  if (postEventTimestamps.size > 1_000) {
    for (const [id, timestamps] of postEventTimestamps) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length) postEventTimestamps.set(id, active);
      else postEventTimestamps.delete(id);
    }
  }
  return true;
}
function safe(v: unknown, max = 90): string {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "")
    .replace(/\b(?:[a-f0-9]{32,}|wow_[A-Za-z0-9_-]{12,})\b/gi, "").replace(/\s+/g, " ").trim().slice(0, max);
}
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 }).format(v) : null;
const fields: Record<string, string> = { meta: "meta", lotes: "lotes", taxa: "taxa", banca: "banca", capital: "capital", capitalAvailable: "capital disponível", alvo: "alvo", stopLoss: "limite de perda", takeProfit: "alvo de ganho", enabled: "ativação", value: "valor", amount: "quantidade", quantity: "quantidade", price: "preço", nasdaq: "Nasdaq", ouro: "Ouro", saque2: "Saque 2" };
function field(v: unknown): string {
  if (typeof v !== "string" || /id|hash|token|cookie|secret|password|email|phone|cpf|key|chave/i.test(v)) return "parâmetro";
  const m = v.match(/^assets\.(nasdaq|ouro|saque2)\.days\.(\d+)\.(.+)$/);
  if (m) { const f = fields[m[3]!] ?? safe(m[3], 40).replace(/[._-]+/g, " "); return `${f[0]?.toLocaleUpperCase("pt-BR")}${f.slice(1)} do dia ${Number(m[2]) + 1} (${fields[m[1]!]})`; }
  return safe(v.split(/[._-]+/).filter(Boolean).map(p => fields[p] ?? p).join(" "), 80) || "parâmetro";
}
function category(r: Row): string {
  if (r.source === "device" || r.action.startsWith("device.")) return "Sistema";
  if (r.action === "ai.analysis.completed" || r.category === "ai") return "Análise de IA";
  if (r.action.startsWith("login.") || r.action === "logout" || r.action === "signup.success" || r.category === "auth") return "Acesso";
  if (r.category === "navigation" || r.action === "navigation.opened") return "Navegação";
  if (r.category === "integration" || r.action.startsWith("integration.")) return "Integração";
  if (r.category === "strategy" || r.category === "ui" || ["create", "update", "delete"].includes(r.action)) return "Ação";
  return "Sistema";
}
function actionLabel(r: Row): string {
  const d = r.details;
  const labels: Record<string, string> = {
    "login.success": "Entrou na plataforma", "login.failed": "Tentativa de entrada falhou", "signup.success": "Criou uma conta", logout: "Saiu da plataforma",
    "integration.key_generated": "Gerou uma chave do EA", "integration.key_failed": "Falha ao gerar a chave do EA",
    "integration.download_requested": "Solicitou o download da integração", "integration.download_failed": "Falha no download da integração",
    "integration.file_published": "Publicou um arquivo de integração", "integration.order_dispatched": "Enviou uma ordem para o robô",
    "integration.order_confirmed": "Ordem confirmada pelo MetaTrader 5", "integration.order_failed": "Falha na ordem enviada ao MetaTrader 5",
    "strategy.updated": "Alterou os dados da banca", "strategy.action": "Registrou uma ação na estratégia", "strategy.undo": "Desfez uma ação da estratégia",
    "strategy.save_failed": "Falha ao salvar os dados da banca", "system.error": "Ocorreu um erro no sistema",
    "ai.analysis.completed": "Concluiu uma análise de IA", "device.registered": "Cadastrou um aparelho confiável", "device.revoked": "Revogou um aparelho confiável",
  };
  if (labels[r.action]) return labels[r.action]!;
  if (r.action === "navigation.opened") {
    const p = safe(d.page ?? d.tela, 60).toLowerCase();
    const pages: Record<string, string> = { "/plataforma": "Plataforma", plataforma: "Plataforma", "/analise-ia": "Análise de IA", "analise-ia": "Análise de IA", "/integracao": "Integração", integracao: "Integração", "/admin": "Administração", admin: "Administração", "/auditoria": "Auditoria", auditoria: "Auditoria", "/auth": "Entrada", auth: "Entrada" };
    return `Abriu a tela ${pages[p] ?? (p && !/[?#/]/.test(p) ? p : "da plataforma")}`;
  }
  if (r.action === "ui.button_clicked") return `Clicou em ${safe(d.button ?? d.botao, 60) || "um botão"}`;
  if (r.action === "create") return d.tipo === "chave_ea" ? "Gerou uma chave do EA" : "Criou um registro na plataforma";
  if (r.action === "update") return typeof d.campo === "string" && typeof d.valor_antigo === "number" && typeof d.valor_novo === "number" ? "Alterou um número da banca" : "Atualizou os dados da plataforma";
  if (r.action === "delete") return "Removeu um registro da plataforma";
  return "Evento registrado";
}
function detailsLabel(r: Row): string {
  const d = r.details;
  if (r.action === "update" && typeof d.campo === "string") {
    const a = num(d.valor_antigo), b = num(d.valor_novo);
    if (a !== null && b !== null) return `Banca configurada, ${field(d.campo)}: de ${a} para ${b}.`;
  }
  if (r.action.startsWith("strategy.")) {
    const changes = Array.isArray(d.changes) ? d.changes : [];
    const useful = changes.slice(0, 3).flatMap(item => { const c = obj(item), a = num(c.previous), b = num(c.next); return a === null || b === null ? [] : [`${field(c.field)}: de ${a} para ${b}`]; });
    if (useful.length) return useful.join("; ") + ".";
    return d.initial_state_saved === true ? "Salvou os dados iniciais da banca." : "Os dados da banca foram atualizados.";
  }
  if (["integration.order_dispatched", "integration.order_confirmed", "integration.order_failed"].includes(r.action)) {
    const p: string[] = [], s = safe(d.symbol, 20), q = num(d.qty), l = num(d.lot);
    if (s && /^[A-Za-z0-9._-]+$/.test(s)) p.push(`Ativo ${s}`);
    if (q !== null) p.push(`quantidade ${q}`);
    if (l !== null) p.push(`lote ${l}`);
    return p.length ? p.join(", ") + "." : "Evento de ordem registrado.";
  }
  if (r.action === "ai.analysis.completed") return safe(d.ativo, 30) ? `Análise concluída para ${safe(d.ativo, 30)}.` : "Análise concluída sem armazenar seu conteúdo.";
  if (r.action === "navigation.opened") { const p = safe(d.page ?? d.tela, 60); return p && !/[?#/]/.test(p) ? `Tela acessada: ${p}.` : "Acesso a uma tela da plataforma."; }
  if (r.action === "ui.button_clicked") return safe(d.button ?? d.botao, 60) ? `Botão: ${safe(d.button ?? d.botao, 60)}.` : "Clique registrado na plataforma.";
  if (r.action === "create" && d.tipo === "chave_ea") return "Nova chave do EA gerada. O valor da chave não é exibido.";
  if (r.action === "integration.key_generated") return "A chave foi gerada e armazenada de forma protegida; seu valor não é exibido.";
  if (r.source === "device") return safe(d.device_name, 60) ? `Aparelho: ${safe(d.device_name, 60)}.` : "Registro de aparelho confiável.";
  if (r.action === "login.failed") return "A tentativa não criou uma sessão. Dados de identificação não são exibidos.";
  if (r.action === "create") return "Novo registro criado na plataforma.";
  if (r.action === "update") return "Dados atualizados na plataforma.";
  if (r.action === "delete") return "Registro removido da plataforma.";
  return "";
}
function outcomeLabel(v: string): string { return ({ success: "Concluído", failed: "Falhou", denied: "Recusado", started: "Iniciado", unknown: "Não confirmado" } as Record<string, string>)[v] ?? "Registrado"; }

export const Route = createFileRoute("/api/auditoria")({
  server: { handlers: {
    POST: async ({ request }) => {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      let body: unknown;
      try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid_body" }, 400);
      const event = body as Record<string, unknown>;
      if (typeof event.category !== "string" || !CATEGORIES.has(event.category) || typeof event.action !== "string" || !CLIENT_ACTIONS.has(event.action) || (event.outcome !== undefined && (typeof event.outcome !== "string" || !OUTCOMES.has(event.outcome)))) return json({ error: "invalid_event" }, 400);
      const details = validateDetails(event.details);
      if (details === null) return json({ error: "invalid_details" }, 400);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      if (event.action === "integration.file_published") {
        const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
        if (!roles?.some(row => row.role === "admin")) return json({ error: "forbidden" }, 403);
      }
      const expected: Record<string, string> = { "login.success": "auth", "signup.success": "auth", logout: "auth", "integration.key_failed": "integration", "integration.download_requested": "integration", "integration.download_failed": "integration", "integration.file_published": "integration", "navigation.opened": "navigation", "ui.button_clicked": "ui", "system.error": "system" };
      if (expected[event.action] !== event.category) return json({ error: "invalid_event_category" }, 400);
      if (!consumePostRateLimit(user.id)) return json({ error: "rate_limit_exceeded" }, 429);
      const { error } = await supabaseAdmin.from("audit_logs").insert({ user_id: user.id, category: event.category, action: event.action, outcome: typeof event.outcome === "string" ? event.outcome : "success", details: details as unknown as Json, request_id: crypto.randomUUID() });
      if (error) { console.error("[audit] insert failed", error.message); return json({ error: "audit_write_failed" }, 500); }
      return json({ ok: true }, 201);
    },
    GET: async ({ request }) => {
      const user = await authenticatedUser(request);
      if (!user) return json({ error: "unauthorized" }, 401);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: roles, error: roleError } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
      if (roleError || !roles?.some(row => row.role === "admin")) return json({ error: "forbidden" }, 403);

      const url = new URL(request.url), cat = url.searchParams.get("category"), userId = url.searchParams.get("userId");
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
      if (userId && !/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "invalid_user_id" }, 400);
      let aq = supabaseAdmin.from("audit_logs").select("id,user_id,category,action,outcome,details,created_at").order("created_at", { ascending: false }).limit(100);
      let hq = supabaseAdmin.from("activity_logs").select("id,user_id,action,details,created_at").order("created_at", { ascending: false }).limit(100);
      let dq = supabaseAdmin.from("trusted_devices").select("id,user_id,device_name,created_at,revoked_at").order("created_at", { ascending: false }).limit(100);
      if (userId) { aq = aq.eq("user_id", userId); hq = hq.eq("user_id", userId); dq = dq.eq("user_id", userId); }
      const [a, h, d] = await Promise.all([aq, hq, dq]);
      if (a.error) { console.error("[audit] read failed", a.error.message); return json({ error: "audit_read_failed" }, 500); }
      if (h.error) { console.error("[activity] read failed", h.error.message); return json({ error: "activity_read_failed" }, 500); }
      if (d.error) { console.error("[devices] read failed", d.error.message); return json({ error: "device_read_failed" }, 500); }
      const auditRows: Row[] = (a.data ?? []).map(r => ({ id: "audit-" + r.id, user_id: r.user_id, created_at: r.created_at, category: r.category, action: r.action, outcome: r.outcome, details: obj(r.details), source: "audit" }));
      const activityRows: Row[] = (h.data ?? []).map(r => ({ id: "activity-" + r.id, user_id: r.user_id, created_at: r.created_at, category: r.action.startsWith("login.") || r.action === "logout" ? "auth" : r.action === "ai.analysis.completed" ? "ai" : "strategy", action: r.action, outcome: r.action === "login.failed" ? "failed" : "success", details: obj(r.details), source: "activity" }));
      const deviceRows: Row[] = (d.data ?? []).flatMap(r => {
        const base = { user_id: r.user_id, category: "system", details: { device_name: safe(r.device_name, 60) }, source: "device" as const, outcome: "success" };
        const out: Row[] = [{ ...base, id: "device-created-" + r.id, created_at: r.created_at, action: "device.registered" }];
        if (r.revoked_at) out.push({ ...base, id: "device-revoked-" + r.id, created_at: r.revoked_at, action: "device.revoked" });
        return out;
      });
      const all = [...auditRows, ...activityRows, ...deviceRows].sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));
      const rows = (cat ? all.filter(r => category(r) === cat) : all).slice(0, limit);
      const ids = [...new Set(rows.map(r => r.user_id).filter((v): v is string => !!v))];
      const profilesResult = ids.length ? await supabaseAdmin.from("profiles").select("id,full_name").in("id", ids) : { data: [] as { id: string; full_name: string | null }[], error: null };
      if (profilesResult.error) console.error("[audit] profile labels unavailable", profilesResult.error.message);
      const names = new Map((profilesResult.data ?? []).map(p => [p.id, safe(p.full_name, 100) || "Usuário"]));
      return json({ logs: rows.map(r => ({ id: r.id, created_at: r.created_at, user: r.user_id ? names.get(r.user_id) ?? "Usuário" : "Acesso não identificado", category: category(r), action: actionLabel(r), outcome: outcomeLabel(r.outcome), details: detailsLabel(r) })) });
    },
  } },
});
