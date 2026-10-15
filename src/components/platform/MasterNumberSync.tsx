import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MASTER_SYNC_FIELDS } from "@/lib/platform/master-sync";

type SyncConfig = { enabled: boolean; allowedFields: string[]; updatedAt: string | null };

function hasActiveAsset(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw) as { activeId?: unknown; bancas?: Array<{ id?: unknown; ativo?: unknown }> };
    const bancas = Array.isArray(parsed.bancas) ? parsed.bancas : [];
    const active = bancas.find((b) => b.id === parsed.activeId) ?? bancas[0];
    return active?.ativo === "nasdaq" || active?.ativo === "ouro";
  } catch {
    return false;
  }
}

export function MasterNumberSync({ loadMasterData }: { loadMasterData: () => Promise<string | null> }) {
  const [config, setConfig] = useState<SyncConfig>({ enabled: false, allowedFields: [], updatedAt: null });
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [masterHasActiveAsset, setMasterHasActiveAsset] = useState<boolean | null>(null);

  const request = useCallback(async (method: "GET" | "POST", body?: unknown) => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
    const response = await fetch("/api/plataforma/sincronizacao-numeros", {
      method,
      headers: { authorization: "Bearer " + token, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const messages: Record<string, string> = {
        master_not_configured: "A identidade da conta Master ainda não foi configurada no servidor (MASTER_USER_ID).",
        master_mismatch: "Esta conta não é a Master autorizada para publicar os parâmetros.",
        account_not_approved: "A conta precisa estar aprovada para acessar a sincronização.",
        sync_unavailable: "A configuração da sincronização está indisponível ou precisa ser revisada.",
      };
      throw new Error(messages[String(result.error)] || "Não foi possível acessar a sincronização.");
    }
    return result;
  }, []);

  useEffect(() => {
    let alive = true;
    request("GET").then((result) => {
      if (!alive) return;
      const next = { enabled: !!result.enabled, allowedFields: Array.isArray(result.allowedFields) ? result.allowedFields : [], updatedAt: result.updatedAt ?? null };
      setConfig(next); setSelected(next.allowedFields);
    }).catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Falha ao carregar configuração."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [request]);

  useEffect(() => {
    let alive = true;
    const refreshMasterAsset = async () => {
      try {
        const raw = await loadMasterData();
        if (alive) setMasterHasActiveAsset(hasActiveAsset(raw));
      } catch {
        if (alive) setMasterHasActiveAsset(null);
      }
    };
    void refreshMasterAsset();
    const timer = window.setInterval(() => { void refreshMasterAsset(); }, 2000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [loadMasterData]);

  const groups = useMemo(() => [...new Set(MASTER_SYNC_FIELDS.map((field) => field.group))], []);
  const toggleField = (id: string) => setSelected((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);

  async function save(enabled: boolean) {
    setSaving(true); setError("");
    try {
      const result = await request("POST", { enabled, allowedFields: selected });
      setConfig({ enabled: !!result.enabled, allowedFields: result.allowedFields ?? selected, updatedAt: result.updatedAt ?? new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally { setSaving(false); }
  }

  return (
    <section className="border-b bg-muted/20 px-4 py-4">
      <div className="mx-auto w-full max-w-5xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Sincronização de números para contas comuns</h2>
            <p className="mt-1 text-sm text-muted-foreground">Marque somente os parâmetros que você autoriza compartilhar. Depósitos, saques, ciclos e históricos nunca são sincronizados.</p>
            <p className="mt-1 text-xs text-muted-foreground">Nas contas comuns, os campos publicados são aplicados somente à banca que estiver ativa.</p>
          </div>
          <span className={config.enabled ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"}>
            {loading ? "Carregando…" : config.enabled ? "Atualizações liberadas" : "Atualizações travadas"}
          </span>
        </div>
        {config.enabled && masterHasActiveAsset === false && <p role="alert" className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-200">Selecione Nasdaq ou Ouro na sua banca ativa para publicar.</p>}
        {loading ? <p className="text-sm text-muted-foreground">Carregando parâmetros autorizáveis…</p> : (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {groups.map((group) => (
                <fieldset key={group} className="rounded-lg border bg-background p-3">
                  <legend className="px-1 text-sm font-semibold">{group}</legend>
                  <div className="grid gap-2">
                    {MASTER_SYNC_FIELDS.filter((field) => field.group === group).map((field) => (
                      <label key={field.id} className="flex cursor-pointer items-start gap-2 text-sm">
                        <input type="checkbox" className="mt-1 accent-primary" checked={selected.includes(field.id)} onChange={() => toggleField(field.id)} disabled={saving} />
                        <span>{field.label}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void save(false)} variant="outline" disabled={saving}>{saving ? "Salvando…" : "Travar atualizações"}</Button>
              <Button onClick={() => void save(true)} disabled={saving || selected.length === 0}>{saving ? "Salvando…" : "Liberar campos selecionados"}</Button>
              <span className="text-xs text-muted-foreground">{selected.length} campo(s) autorizado(s)</span>
            </div>
            {config.updatedAt && <p className="text-xs text-muted-foreground">Última configuração publicada: {new Date(config.updatedAt).toLocaleString("pt-BR")}</p>}
          </>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
