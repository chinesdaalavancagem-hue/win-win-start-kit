import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, CheckCircle2, ExternalLink, ShieldCheck, Sparkles } from "lucide-react";
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
    <DialogContent className="max-h-[92dvh] w-[calc(100%-1.25rem)] max-w-xl overflow-y-auto rounded-2xl border border-cyan-400/20 bg-[#071426] p-0 text-slate-100 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:w-full">
      <div className="relative overflow-hidden border-b border-cyan-900/70 bg-[linear-gradient(120deg,rgba(8,35,58,0.98),rgba(5,19,34,0.98)_65%,rgba(4,39,39,0.95))] px-5 pb-5 pt-6 sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-16 size-40 rounded-full bg-cyan-400/10 blur-3xl" />
        <DialogHeader className="relative space-y-3 text-left">
          <div className="flex size-11 items-center justify-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-200"><Sparkles className="size-5" /></div>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300">Nova avaliação</p><DialogTitle className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">Adquirir novo teste</DialogTitle><DialogDescription className="mt-1.5 text-sm leading-relaxed text-slate-300">Configure a nova conta para <span className="font-semibold text-cyan-100">{source.nome}</span>. O histórico atual será preservado.</DialogDescription></div>
        </DialogHeader>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">
      {isPending ? <p>Carregando mesas…</p> : isError ? <p role="alert" className="text-destructive">Não foi possível carregar as mesas.</p> : <>
        <label className="block space-y-2 text-sm font-semibold text-slate-200">Escolha a mesa<select aria-label="Mesa do desafio" className="w-full rounded-xl border border-cyan-900/80 bg-[#0a1b30] p-3 text-slate-100 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15" value={firmId} onChange={(event) => setFirmId(event.target.value as typeof firmId)}>{firms.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="flex items-start gap-3 rounded-xl border border-cyan-900/70 bg-cyan-400/[0.05] p-3.5 text-sm"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-200"><CheckCircle2 className="size-4" /></div><div><p className="font-semibold text-slate-100">Tamanho da conta: US$ 50.000</p><p className="mt-1 text-xs leading-relaxed text-slate-400">O tamanho é fixo nesta plataforma e não precisa ser selecionado.</p></div></div>
        <div className="space-y-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm">
          <p className="flex items-start gap-2 font-bold leading-relaxed text-amber-200"><ShieldCheck className="mt-0.5 size-4 shrink-0" />Importante: a conta deve estar sem limite de perda diária (Daily Loss Limit).</p>
          <p>{NO_DAILY_LOSS_LIMIT_INSTRUCTIONS[firmId]}</p>
          <p className="text-xs leading-relaxed text-slate-400">Antes de comprar, confira se selecionou o plano correto ou ativou essa configuração na própria plataforma da mesa. A nossa plataforma não altera essa regra por você.</p>
        </div>
        {firm?.coupon && <p className="rounded-lg border border-emerald-300/20 bg-emerald-300/[0.06] px-3 py-2.5 text-sm text-slate-200">Use o cupom: <strong className="ml-1 font-bold text-emerald-300">{firm.coupon}</strong></p>}
        {firm?.affiliate_url ? <Button asChild className="h-11 w-full rounded-xl bg-gradient-to-r from-emerald-300 to-cyan-300 font-bold text-slate-950 shadow-[0_8px_24px_rgba(0,220,160,0.12)] hover:from-emerald-200 hover:to-cyan-200"><a href={firm.affiliate_url} target="_blank" rel="noopener noreferrer" onClick={() => setUsedLink(firm.affiliate_url)}><ExternalLink className="size-4" />Ir para a mesa e ativar desafio<ArrowUpRight className="size-4" /></a></Button> : <Button disabled className="h-11 w-full rounded-xl"><ExternalLink className="size-4" />Link de compra em breve</Button>}
        <details className="overflow-hidden rounded-xl border border-cyan-900/70 bg-[#091a2d]" open={!!externalId}>
          <summary className="cursor-pointer list-inside px-4 py-3.5 text-sm font-bold text-cyan-100 marker:text-cyan-300">Já comprou? Cadastre a nova conta</summary>
          <form className="space-y-3 border-t border-cyan-950 px-4 py-4" onSubmit={async (event) => {
            event.preventDefault(); setError("");
            const parsed = challengeAccountSchema.safeParse({ prop_firm_id: firmId, account_external_id: externalId, account_size: ACCOUNT_SIZE, link_compra_utilizado: usedLink, registered_at: Date.now(), source_banca_id: source.id });
            if (!parsed.success || !firm?.account_sizes.includes(ACCOUNT_SIZE)) { setError("Informe o identificador da conta e confirme que ela foi configurada sem limite de perda diária."); return; }
            setBusy(true);
            try { const ok = await onRegister(createChallengeBanca(source, parsed.data, firm.name)); if (!ok) { setError("Não foi possível salvar. Tente novamente."); return; } onOpenChange(false); }
            catch { setError("Não foi possível cadastrar a conta."); }
            finally { setBusy(false); }
          }}>
            <label className="block space-y-2 text-sm font-semibold text-slate-200">Identificador da nova conta
              <Input aria-label="Identificador da nova conta" required maxLength={100} value={externalId} onChange={(event) => setExternalId(event.target.value)} className="h-11 rounded-xl border-cyan-900/80 bg-[#071426] text-slate-100 placeholder:text-slate-500 focus-visible:ring-cyan-400" />
              <span className="block text-xs font-normal leading-relaxed text-slate-400">Digite o número ou código da conta atribuído pela mesa após a compra. Não é seu e-mail, senha nem número do pedido.</span>
            </label>
            <Button type="submit" disabled={busy || !firm?.account_sizes.includes(ACCOUNT_SIZE)} className="h-11 w-full rounded-xl bg-cyan-300 font-bold text-slate-950 hover:bg-cyan-200">{busy ? "Salvando…" : "Cadastrar e iniciar ciclo"}</Button>
          </form>
        </details>
      </>}
      {error && <p role="alert" className="mx-5 mb-5 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] px-3 py-2.5 text-sm text-rose-300 sm:mx-6">{error}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}