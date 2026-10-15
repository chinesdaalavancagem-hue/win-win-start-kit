import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { MASTER_SYNC_FIELDS } from "@/lib/platform/master-sync";

type SyncConfig = { enabled: boolean; allowedFields: string[]; updatedAt: string | null };

export function MasterNumberSync() {
  const [config, setConfig] = useState<SyncConfig>({ enabled: false, allowedFields: [], updatedAt: null });
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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
    if (!response.ok) throw new Error(result.error || "Não foi possível acessar a sincronização.");
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
          </div>
          <span className={config.enabled ? "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300" : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"}>
            {loading ? "Carregando…" : config.enabled ? "Atualizações liberadas" : "Atualizações travadas"}
          </span>
        </div>
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
