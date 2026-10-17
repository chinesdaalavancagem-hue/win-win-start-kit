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

const ACCOUNT_SIZE = 50_000;

const NO_DAILY_LOSS_LIMIT_INSTRUCTIONS: Record<string, string> = {
  "lucid-trading": "Na Lucid Trading, escolha o plano Lucid Flex.",
  tradeify: "Na Tradeify, escolha o plano Select.",
  "my-funded-futures": "Na My Funded Futures, escolha o plano Rapid EOD.",
  topstep: "Na Topstep, não há nome específico de plano para isso: depois de entrar na plataforma da Topstep, ative a opção que remove o limite de perda diária (Daily Loss Limit).",
};

export function ComprarDesafioModal({ open, onOpenChange, source, onRegister }: {
  open: boolean; onOpenChange: (open: boolean) => void; source: Banca;
  onRegister: (banca: Banca) => Promise<boolean>;
}) {
  const list = useServerFn(listPropFirms);
  const { data: firms = [], isPending, isError } = useQuery({ queryKey: ["prop-firms"], queryFn: () => list(), enabled: open });
  const [firmId, setFirmId] = useState(source.challengeAccount?.prop_firm_id ?? "lucid-trading");
  const [externalId, setExternalId] = useState("");
  const [usedLink, setUsedLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const firm = firms.find((item) => item.id === firmId);
  useEffect(() => { setUsedLink(""); setError(""); }, [firmId]);
  return <Dialog open={open} onOpenChange={(value) => { if (!busy) onOpenChange(value); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto">
      <DialogHeader><DialogTitle>Novo teste na mesa</DialogTitle><DialogDescription>Nova conta para {source.nome}. O histórico atual será preservado.</DialogDescription></DialogHeader>
      {isPending ? <p>Carregando mesas…</p> : isError ? <p role="alert" className="text-destructive">Não foi possível carregar as mesas.</p> : <>
        <label className="space-y-1 text-sm">Mesa<select aria-label="Mesa do desafio" className="w-full rounded-md border bg-background p-2 text-foreground" value={firmId} onChange={(event) => setFirmId(event.target.value as typeof firmId)}>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="space-y-1 rounded-md border bg-muted/30 p-3 text-sm">
          <p className="font-medium">Tamanho da conta: US$ 50.000</p>
          <p className="text-muted-foreground">O tamanho é fixo nesta plataforma e não precisa ser selecionado.</p>
        </div>
        <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="font-semibold">Importante: a conta deve estar sem limite de perda diária (Daily Loss Limit).</p>
          <p>{NO_DAILY_LOSS_LIMIT_INSTRUCTIONS[firmId]}</p>
          <p className="text-muted-foreground">Antes de comprar, confira se selecionou o plano correto ou ativou essa configuração na própria plataforma da mesa. A nossa plataforma não altera essa regra por você.</p>
        </div>
        {firm?.coupon && <p className="border-l-2 border-primary pl-3 text-sm">Use o cupom: <strong className="text-primary">{firm.coupon}</strong></p>}
        {firm?.affiliate_url ? <Button asChild><a href={firm.affiliate_url} target="_blank" rel="noopener noreferrer" onClick={() => setUsedLink(firm.affiliate_url)}><ExternalLink className="size-4" />Ir para a mesa e ativar desafio</a></Button> : <Button disabled><ExternalLink className="size-4" />Link de compra em breve</Button>}
        <details className="border-t pt-4" open={!!externalId}>
          <summary className="cursor-pointer text-sm font-semibold">Já comprou? Cadastre a nova conta</summary>
          <form className="mt-4 space-y-3" onSubmit={async (event) => {
            event.preventDefault(); setError("");
            const parsed = challengeAccountSchema.safeParse({ prop_firm_id: firmId, account_external_id: externalId, account_size: ACCOUNT_SIZE, link_compra_utilizado: usedLink, registered_at: Date.now(), source_banca_id: source.id });
            if (!parsed.success || !firm?.account_sizes.includes(ACCOUNT_SIZE)) { setError("Informe o identificador da conta e confirme que ela foi configurada sem limite de perda diária."); return; }
            setBusy(true);
            try { const ok = await onRegister(createChallengeBanca(source, parsed.data, firm.name)); if (!ok) { setError("Não foi possível salvar. Tente novamente."); return; } onOpenChange(false); }
            catch { setError("Não foi possível cadastrar a conta."); }
            finally { setBusy(false); }
          }}>
            <label className="block space-y-1 text-sm">Identificador da nova conta
              <Input aria-label="Identificador da nova conta" required maxLength={100} value={externalId} onChange={(event) => setExternalId(event.target.value)} />
              <span className="block text-xs text-muted-foreground">Digite o número ou código da conta atribuído pela mesa após a compra. Não é seu e-mail, senha nem número do pedido.</span>
            </label>
            <Button type="submit" disabled={busy || !firm?.account_sizes.includes(ACCOUNT_SIZE)}>{busy ? "Salvando…" : "Cadastrar e iniciar ciclo"}</Button>
          </form>
        </details>
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}