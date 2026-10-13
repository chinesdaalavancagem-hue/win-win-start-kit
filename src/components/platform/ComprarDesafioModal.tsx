import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { challengeAccountSchema } from "@/lib/prop-firms";
import { listPropFirms } from "@/lib/prop-firms.functions";
import { type Banca } from "@/lib/platform/bancas";
import { createChallengeBanca } from "@/lib/platform/challenges";

export function ComprarDesafioModal({ open, onOpenChange, source, onRegister }: {
  open: boolean; onOpenChange: (open: boolean) => void; source: Banca;
  onRegister: (banca: Banca) => Promise<boolean>;
}) {
  const list = useServerFn(listPropFirms);
  const { data: firms = [], isPending, isError } = useQuery({ queryKey: ["prop-firms"], queryFn: () => list(), enabled: open });
  const [firmId, setFirmId] = useState(source.challengeAccount?.prop_firm_id ?? "lucid-trading");
  const [size, setSize] = useState("");
  const [externalId, setExternalId] = useState("");
  const [usedLink, setUsedLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firm = firms.find((item) => item.id === firmId);
  useEffect(() => { setSize(""); setUsedLink(""); setError(""); }, [firmId]);
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogHeader><DialogTitle>Novo teste na mesa</DialogTitle><DialogDescription>Nova conta para {source.nome}. O histórico atual será preservado.</DialogDescription></DialogHeader>
      {isPending ? <p>Carregando mesas…</p> : isError ? <p role="alert" className="text-destructive">Não foi possível carregar as mesas.</p> : <>
        <label className="space-y-1 text-sm">Mesa<select aria-label="Mesa do desafio" className="w-full rounded-md border bg-background p-2 text-foreground" value={firmId} onChange={(event) => setFirmId(event.target.value as typeof firmId)}>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="space-y-1 text-sm">Tamanho da conta (USD)<select aria-label="Tamanho da conta" value={size} onChange={(event) => setSize(event.target.value)} className="w-full rounded-md border bg-background p-2 text-foreground"><option value="">Selecionar</option>{firm?.account_sizes.map((value) => <option key={value} value={value}>${value.toLocaleString("pt-BR")}</option>)}</select></label>
        {!firm?.account_sizes.length && <p className="text-sm text-muted-foreground">Tamanhos ainda não configurados pela master.</p>}
        {firm?.coupon && <p className="border-l-2 border-primary pl-3 text-sm">Use o cupom: <strong className="text-primary">{firm.coupon}</strong></p>}
        {firm?.affiliate_url ? <Button asChild><a href={firm.affiliate_url} target="_blank" rel="noopener noreferrer" onClick={() => setUsedLink(firm.affiliate_url)}><ExternalLink className="size-4" />Ir para a mesa e ativar desafio</a></Button> : <Button disabled><ExternalLink className="size-4" />Link de compra em breve</Button>}
        <details className="border-t pt-4" open={!!externalId}>
          <summary className="cursor-pointer text-sm font-semibold">Já comprou? Cadastre a nova conta</summary>
          <form className="mt-4 space-y-3" onSubmit={async (event) => {
            event.preventDefault(); setError("");
            const parsed = challengeAccountSchema.safeParse({ prop_firm_id: firmId, account_external_id: externalId, account_size: Number(size), link_compra_utilizado: usedLink, registered_at: Date.now(), source_banca_id: source.id });
            if (!parsed.success || !firm?.account_sizes.includes(Number(size))) { setError("Informe o identificador e selecione um tamanho disponível."); return; }
            setBusy(true);
            try { const ok = await onRegister(createChallengeBanca(source, parsed.data, firm.name)); if (!ok) { setError("Não foi possível salvar. Tente novamente."); return; } onOpenChange(false); }
            catch { setError("Não foi possível cadastrar a conta."); }
            finally { setBusy(false); }
          }}>
            <label className="block space-y-1 text-sm">Identificador da nova conta<Input aria-label="Identificador da nova conta" required maxLength={100} value={externalId} onChange={(event) => setExternalId(event.target.value)} /></label>
            <Button type="submit" disabled={busy || !firm?.account_sizes.length}>{busy ? "Salvando…" : "Cadastrar e iniciar ciclo"}</Button>
          </form>
        </details>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}