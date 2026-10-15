import { createFileRoute } from "@tanstack/react-router";
import { challengeAccountSchema } from "@/lib/prop-firms";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

type SupabaseAdminModule = typeof import("@/integrations/supabase/client.server");
let supabaseAdminModulePromise: Promise<SupabaseAdminModule> | undefined;

function getSupabaseAdmin() {
  // Reuse one lazy import across simultaneous requests; this also keeps the server-only
  // client out of the browser bundle while avoiding duplicate concurrent module loads.
  supabaseAdminModulePromise ??= import("@/integrations/supabase/client.server");
  return supabaseAdminModulePromise;
}

async function authenticatedUser(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;
  const { supabaseAdmin } = await getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user;
}

function compareStates(previous: string | null, next: string) {
  const changes: Array<{ field: string; previous: unknown; next: unknown }> = [];
  let operation: Record<string, unknown> | undefined;
  let operationChanged = false;
  let operationRemoved = false;
  let removedOperation: Record<string, unknown> | undefined;
  try {
    const before = previous ? JSON.parse(previous) as Record<string, unknown> : null;
    const after = JSON.parse(next) as Record<string, unknown>;
    const walk = (a: unknown, b: unknown, path: string) => {
      if (path === "activeTab" || path === "log" || path.startsWith("log.") || changes.length >= 20) return;
      if (a && b && typeof a === "object" && typeof b === "object") {
        if (Array.isArray(a) && Array.isArray(b)) {
          for (let i = 0; i < Math.min(a.length, b.length) && changes.length < 20; i++) walk(a[i], b[i], path ? path + "." + i : String(i));
          if (a.length !== b.length && changes.length < 20) changes.push({ field: path + ".length", previous: a.length, next: b.length });
          return;
        }
        if (!Array.isArray(a) && !Array.isArray(b)) {
          const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
          for (const key of keys) walk((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], path ? path + "." + key : key);
          return;
        }
      }
      if (a !== b && (a === null || ["string", "number", "boolean", "undefined"].includes(typeof a))
        && (b === null || ["string", "number", "boolean", "undefined"].includes(typeof b))) {
        changes.push({ field: path.slice(0, 180), previous: a ?? null, next: b ?? null });
      }
    };
    if (before) walk(before, after, "");
    const beforeLog = before && Array.isArray(before.log) ? before.log as Array<Record<string, unknown>> : [];
    const afterLog = Array.isArray(after.log) ? after.log as Array<Record<string, unknown>> : [];
    const oldOperation = beforeLog.at(-1);
    const newOperation = afterLog.at(-1);
    operationChanged = JSON.stringify(oldOperation ?? null) !== JSON.stringify(newOperation ?? null);
    operationRemoved = beforeLog.length > afterLog.length;
    if (operationRemoved && oldOperation) {
      removedOperation = { asset: oldOperation.asset, day: oldOperation.day, type: oldOperation.tipo };
    }
    if (operationChanged && newOperation) {
      operation = { asset: newOperation.asset, day: newOperation.day, type: newOperation.tipo };
    }
    return { changes, operation, operationChanged, operationRemoved, removedOperation, initialSave: !before };
  } catch {
    return { changes: [], operation: undefined, operationChanged: false, operationRemoved: false, removedOperation: undefined, initialSave: !previous };
  }
}

function numericChanges(previous: string | null, next: Record<string, unknown>) {
  const changes: Array<{ banca_id: string; campo: string; valor_antigo: number; valor_novo: number }> = [];
  if (!previous) return changes;
  const before = JSON.parse(previous) as Record<string, unknown>;
  const bancas = (doc: Record<string, unknown>) => Array.isArray(doc.bancas)
    ? doc.bancas.filter((b): b is Record<string, unknown> => !!b && typeof b === "object" && !Array.isArray(b))
    : [{ id: "legado", state: doc }];
  const oldBancas = bancas(before);
  const walk = (oldValue: unknown, newValue: unknown, campo: string, bancaId: string) => {
    if (typeof oldValue === "number" && typeof newValue === "number") {
      if (Number.isFinite(oldValue) && Number.isFinite(newValue) && oldValue !== newValue) {
        changes.push({ banca_id: bancaId, campo, valor_antigo: oldValue, valor_novo: newValue });
      }
      return;
    }
    if (!oldValue || !newValue || typeof oldValue !== "object" || typeof newValue !== "object") return;
    if (Array.isArray(oldValue) !== Array.isArray(newValue)) return;
    for (const key of Object.keys(newValue)) {
      if (!Object.prototype.hasOwnProperty.call(oldValue, key)) continue;
      walk((oldValue as Record<string, unknown>)[key], (newValue as Record<string, unknown>)[key], campo ? `${campo}.${key}` : key, bancaId);
    }
  };
  for (const banca of bancas(next)) {
    if (typeof banca.id !== "string") continue;
    const oldBanca = oldBancas.find((b) => b.id === banca.id)
      ?? (!Array.isArray(before.bancas) ? oldBancas[0] : undefined);
    if (oldBanca) walk(oldBanca.state, banca.state, "", banca.id);
  }
  return changes;
}

export const Route = createFileRoute("/api/plataforma/dados")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const user = await authenticatedUser(request);
        if (!user) return json({ error: "unauthorized" }, 401);

        try {
          const { getTermsStatusForUser } = await import("@/lib/terms.server");
          const termsStatus = await getTermsStatusForUser(user.id);
          if (!termsStatus.accepted) {
            return json({ error: "terms_acceptance_required" }, 403);
          }
        } catch {
          return json({ error: "terms_verification_unavailable" }, 503);
        }

        let body: unknown;
        try { body = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        if (!body || typeof body !== "object" || typeof (body as Record<string, unknown>).data !== "string" || !Object.prototype.hasOwnProperty.call(body, "expectedVersion") || !((body as Record<string, unknown>).expectedVersion === null || (Number.isSafeInteger((body as Record<string, unknown>).expectedVersion) && Number((body as Record<string, unknown>).expectedVersion) >= 1))) {
          return json({ error: "invalid_body" }, 400);
        }
        const value = (body as { data: string }).data;
        const expectedVersion = (body as { data: string; expectedVersion: number | null }).expectedVersion;
        if (value.length > 200_000) return json({ error: "payload_too_large" }, 413);
        let parsedState: Record<string, unknown>;
        try {
          const parsed = JSON.parse(value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_state" }, 400);
          parsedState = parsed as Record<string, unknown>;
          if (Array.isArray(parsedState.bancas) && parsedState.bancas.some((banca: unknown) => {
            if (!banca || typeof banca !== "object") return true;
            const account = (banca as Record<string, unknown>).challengeAccount;
            return account !== undefined && !challengeAccountSchema.safeParse(account).success;
          })) return json({ error: "invalid_state" }, 400);
          const states = Array.isArray(parsedState.bancas)
            ? parsedState.bancas.map((banca: unknown) =>
                banca && typeof banca === "object" ? (banca as Record<string, unknown>).state : null)
            : [parsedState];
          if (!states.length || !states.every((state: unknown) => {
            if (!state || typeof state !== "object" || Array.isArray(state)) return false;
            const assets = (state as Record<string, unknown>).assets as Record<string, unknown> | undefined;
            const nasdaq = assets?.nasdaq as Record<string, unknown> | undefined;
            const ouro = assets?.ouro as Record<string, unknown> | undefined;
            return !!nasdaq && Array.isArray(nasdaq.days) && !!ouro && Array.isArray(ouro.days);
          })) {
            return json({ error: "invalid_state" }, 400);
          }
        } catch {
          return json({ error: "invalid_state" }, 400);
        }

        const { supabaseAdmin } = await getSupabaseAdmin();
        const { data: profile, error: profileError } = await supabaseAdmin.from("profiles")
          .select("approved,rejected").eq("id", user.id).maybeSingle();
        if (profileError || !profile?.approved || profile.rejected) return json({ error: "account_not_approved" }, 403);

        const { data: previousRow, error: readError } = await supabaseAdmin.from("app_data")
          .select("data,version").eq("user_id", user.id).maybeSingle();
        if (readError) {
          console.error("[strategy] previous state read failed", readError.message);
          return json({ error: "read_failed" }, 500);
        }

        let saveError: { message: string } | null = null;
        if (expectedVersion === null) {
          if (previousRow) return json({ error: "version_conflict", version: previousRow.version }, 409);
          const result = await supabaseAdmin.from("app_data").insert({
            user_id: user.id, data: value, version: 1, updated_at: new Date().toISOString(),
          });
          saveError = result.error;
          if (saveError && /duplicate|unique/i.test(saveError.message)) return json({ error: "version_conflict" }, 409);
        } else {
          const result = await supabaseAdmin.from("app_data").update({
            data: value, version: expectedVersion + 1, updated_at: new Date().toISOString(),
          }).eq("user_id", user.id).eq("version", expectedVersion).select("version").maybeSingle();
          saveError = result.error;
          if (!saveError && !result.data) return json({ error: "version_conflict", version: previousRow?.version ?? null }, 409);
        }
        if (saveError) {
          console.error("[strategy] state save failed", saveError.message);
          const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
            user_id: user.id,
            category: "strategy",
            action: "strategy.save_failed",
            outcome: "failed",
            details: { reason: "database_write_failed" },
          });
          if (auditError) console.error("[audit] failed-save event could not be stored", auditError.message);
          return json({ error: "save_failed" }, 500);
        }

        // Quando a Master estiver com a sincronização liberada, publica apenas os campos autorizados.
        // Falhas nessa publicação não impedem o salvamento dos dados privados da conta.
        try {
          const configuredMasterId = process.env.MASTER_USER_ID?.trim();
          const { data: adminRole } = await supabaseAdmin.from("user_roles").select("role")
            .eq("user_id", user.id).eq("role", "admin").maybeSingle();
          // A publicação automática exige a mesma identidade explícita da rota de configuração.
          // Sem MASTER_USER_ID, ou se a configuração pertencer a outro usuário, não publica.
          if (configuredMasterId && user.id === configuredMasterId && adminRole) {
            const { data: syncConfig } = await supabaseAdmin.from("master_number_sync")
              .select("enabled,allowed_fields,admin_user_id").eq("id", "default").maybeSingle();
            if (syncConfig?.enabled && syncConfig.admin_user_id === configuredMasterId) {
              const { extractMasterSyncValues } = await import("@/lib/platform/master-sync");
              const fields = Array.isArray(syncConfig.allowed_fields)
                ? syncConfig.allowed_fields.filter((field: unknown): field is string => typeof field === "string")
                : [];
              const values = extractMasterSyncValues(value, fields);
              const { error: publishError } = await supabaseAdmin.from("master_number_sync").update({
                published_values: values,
                updated_at: new Date().toISOString(),
              }).eq("id", "default").eq("admin_user_id", user.id);
              if (publishError) console.error("[master-number-sync] publish failed", publishError.message);
            }
          }
        } catch {
          console.error("[master-number-sync] publish failed");
        }

        try {
          const changes = numericChanges(previousRow?.data ?? null, parsedState);
          for (let i = 0; i < changes.length; i += 100) {
            const { error } = await supabaseAdmin.from("activity_logs").insert(changes.slice(i, i + 100).map((details) => ({
              user_id: user.id, action: "update", details,
            })));
            if (error) console.error("[activity] numeric change logging failed");
          }
        } catch {
          // O estado já foi salvo; falhas no log nunca alteram o resultado.
          console.error("[activity] numeric change logging failed");
        }

        try {
        const diff = compareStates(previousRow?.data ?? null, value);
        if (diff.initialSave || diff.changes.length || diff.operationChanged) {
          const { error: auditError } = await supabaseAdmin.from("audit_logs").insert({
            user_id: user.id,
            category: "strategy",
            action: diff.operationRemoved ? "strategy.undo" : diff.operationChanged ? "strategy.action" : "strategy.updated",
            outcome: "success",
            details: {
              changes: diff.changes,
              operation: diff.operation,
              operation_removed: diff.removedOperation,
              initial_state_saved: diff.initialSave,
            } as import("@/integrations/supabase/types").Json,
          });
          if (auditError) console.error("[audit] strategy change could not be stored", auditError.message);
        }
        } catch {
          console.error("[audit] strategy change logging failed");
        }
        return json({ ok: true, version: expectedVersion === null ? 1 : expectedVersion + 1 });
      },
    },
  },
});
