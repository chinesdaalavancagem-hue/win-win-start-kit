import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { firmSchema, type Firm } from "@/lib/prop-firms";
import { listPropFirms, savePropFirm } from "@/lib/prop-firms.functions";

export function PropFirmSettings() {
  const list = useServerFn(listPropFirms);
  const query = useQuery({ queryKey: ["prop-firms"], queryFn: () => list() });
  return <section className="mt-10 border-t pt-6">
    <h2 className="font-heading text-xl">Mesas e desafios</h2>
    <p className="mt-1 text-sm text-muted-foreground">Todas as opções usam contas de US$ 50.000. Configure o link de indicação da Topstep ou links de afiliado quando forem aprovados; as demais usam o site oficial.</p>
    {query.isPending && <p className="mt-4 text-muted-foreground">Carregando mesas…</p>}
    {query.isError && <p role="alert" className="text-destructive">Não foi possível carregar as mesas.</p>}
    <div className="mt-4 space-y-6">{query.data?.map((firm) => <FirmForm key={firm.id} firm={firm} />)}</div>
  </section>;
}

function FirmForm({ firm }: { firm: Firm }) {
  const [url, setUrl] = useState(firm.affiliate_url);
  const [coupon, setCoupon] = useState(firm.coupon);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const save = useServerFn(savePropFirm);
  const cache = useQueryClient();
  return <form className="space-y-3 border-b pb-6" onSubmit={async (event) => {
    event.preventDefault(); setMessage("");
    const parsed = firmSchema.safeParse({ id: firm.id, affiliate_url: url, coupon, account_sizes: [50_000] });
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Confira os dados."); return; }
    setBusy(true);
    try { await save({ data: parsed.data }); await cache.invalidateQueries({ queryKey: ["prop-firms"] }); setMessage("Configuração salva."); }
    catch { setMessage("Não foi possível salvar a configuração."); }
    finally { setBusy(false); }
  }}>
    <h3 className="font-semibold">{firm.name}</h3>
    <div className="grid gap-3 md:grid-cols-2">
      <label className="space-y-1 text-sm md:col-span-2">Link oficial / indicação<Input aria-label={`Link oficial ou de indicação ${firm.name}`} value={url} onChange={(event) => setUrl(event.target.value)} maxLength={2048} placeholder="https://" /></label>
      <label className="space-y-1 text-sm">Cupom de desconto (se houver)<Input value={coupon} onChange={(event) => setCoupon(event.target.value)} maxLength={80} /></label>
      <p className="self-center text-sm text-muted-foreground">Tamanho fixo da conta: US$ 50.000</p>
    </div>
    <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={busy} size="sm"><Save className="size-4" />{busy ? "Salvando…" : "Salvar mesa"}</Button>
      {!url.trim() && <span className="text-sm text-muted-foreground">O site oficial será usado como alternativa.</span>}
      <span role="status" className="text-sm">{message}</span>
    </div>
  </form>;
}
