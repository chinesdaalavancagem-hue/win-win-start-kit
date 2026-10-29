import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MESAS_FUTUROS, fmt } from "@/lib/platform/engine";
import { type MesaPersonalizada, validarMesaPersonalizada, metasAvaliacao } from "@/lib/platform/mesas-personalizadas";

export function CadastrarMesa({ nomes, onSave, onClose }: {
  nomes: string[]; onSave: (mesa: MesaPersonalizada, taxa: number) => Promise<boolean>; onClose: () => void;
}) {
  const [nome, setNome] = useState("");
  const [valores, setValores] = useState({avaliacao:"3", payout:"5", consistencia:"40", consistenciaFinanciada:"0", target:"3000", lossLimit:"2000", metaFinanciada:"200", saque:"0", taxa:"0"});
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const fields = [
    ["avaliacao", "Dias de avaliação", 1, 30, 1], ["payout", "Dias de conta financiada", 1, 30, 1],
    ["consistencia", "Consistência na avaliação (%) · 0 = sem regra", 0, 100, 0.01],
    ["consistenciaFinanciada", "Consistência na financiada (%) · 0 = sem regra", 0, 100, 0.01],
    ["target", "Target total da avaliação ($)", 0.01, 1000000, 0.01],
    ["lossLimit", "Loss limit geral ($)", 0.01, 1000000, 0.01],
    ["metaFinanciada", "Meta por dia financiado ($)", 0.01, 1000000, 0.01],
    ["saque", "Saque previsto ao concluir ($)", 0, 1000000, 0.01],
    ["taxa", "Custo da primeira banca ($)", 0, 1000000, 0.01],
  ] as const;
  const regra: MesaPersonalizada = {id:"custom_preview00", nome:nome.trim(),
    avaliacao:Number(valores.avaliacao), payout:Number(valores.payout), consistencia:Number(valores.consistencia),
    consistenciaFinanciada:Number(valores.consistenciaFinanciada), target:Number(valores.target),
    lossLimit:Number(valores.lossLimit), metaFinanciada:Number(valores.metaFinanciada), saque:Number(valores.saque)};
  const erroRegras = validarMesaPersonalizada({...regra, nome:regra.nome || "Prévia"});
  return <section className="mx-auto my-4 w-[calc(100%-2rem)] max-w-4xl rounded-2xl border border-cyan-800 bg-[#071426] p-4 sm:p-6 lg:w-[calc(100%-10rem)]" aria-label="Cadastrar mesa proprietária">
    <h3 className="text-lg font-bold text-cyan-100">Cadastrar mesa proprietária</h3>
    <p className="mt-1 text-sm text-slate-400">As regras ficam salvas na sua conta. A primeira banca será criada junto com a mesa.</p>
    <form className="mt-4" onSubmit={async e => {
      e.preventDefault(); if (busy) return;
      const problema = validarMesaPersonalizada(regra);
      if (problema) {setErro(problema); return;}
      if (nomes.some(n => n.trim().toLocaleLowerCase() === regra.nome.toLocaleLowerCase())) {setErro("Já existe uma mesa com esse nome."); return;}
      const taxa = Number(valores.taxa);
      if (!Number.isFinite(taxa) || taxa < 0 || taxa > 1000000) {setErro("Informe um custo válido para a banca."); return;}
      setBusy(true); setErro("");
      try {
        if (await onSave({...regra, id:`custom_${crypto.randomUUID()}`}, taxa)) onClose();
        else setErro("Não foi possível salvar. Confira sua conexão e tente novamente.");
      } catch {setErro("Não foi possível salvar. Tente novamente.");}
      finally {setBusy(false);}
    }}>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm text-slate-200">Nome da mesa<Input value={nome} onChange={setNome} maxLength={60} /></label>
        <label className="text-sm text-slate-200">Usar regras iniciais de
          <select defaultValue="tradefive" className="mt-1 block w-full rounded-lg border border-cyan-900 bg-[#030b15] p-2" onChange={e => {
            const m = MESAS_FUTUROS[e.target.value as keyof typeof MESAS_FUTUROS];
            if (m) setValores(v => ({...v, avaliacao:String(m.avaliacao), payout:String(m.payout), consistencia:String(m.consistencia), consistenciaFinanciada:"0", target:"3000", lossLimit:"2000", metaFinanciada:e.target.value === "topstep" ? "150" : "200"}));
          }}>{Object.entries(MESAS_FUTUROS).map(([id,m]) => <option key={id} value={id}>{m.nome}</option>)}</select>
        </label>
        {fields.map(([key,label,min,max,step]) => <label key={key} className="text-sm text-slate-200">{label}<input required type="number" min={min} max={max} step={step} value={valores[key]} onChange={e => setValores(v => ({...v,[key]:e.target.value}))} className="mt-1 block w-full rounded-lg border border-cyan-900 bg-[#030b15] p-2" /></label>)}
      </fieldset>
      <div className="mt-4 rounded-xl border border-cyan-950 bg-[#030b15] p-3 text-sm text-slate-300" aria-live="polite">
        {erroRegras ? erroRegras : <><strong>{regra.avaliacao + regra.payout} cards por ativo: {regra.avaliacao} de avaliação + {regra.payout} de financiada.</strong><p className="mt-1">Metas da avaliação: {metasAvaliacao(regra).map(v => `$${fmt(v)}`).join(" · ")}. Financiada: ${fmt(regra.metaFinanciada)} por dia.</p><p className="mt-1">O loss limit informado será fixo por padrão e poderá ser ajustado nos cards. Contratos e lotes começam em zero para você preencher. Saque 2 recebe somente os dias financiados.</p></>}
      </div>
      {erro && <p role="alert" className="mt-3 text-sm text-rose-300">{erro}</p>}
      <div className="mt-4 flex gap-3"><Button type="submit" disabled={busy || !!erroRegras}>{busy ? "Salvando…" : "Criar mesa e primeira banca"}</Button><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancelar</Button></div>
    </form>
  </section>;
}
function Input({value,onChange,maxLength}:{value:string;onChange:(v:string)=>void;maxLength:number}) {
  return <input required value={value} maxLength={maxLength} onChange={e=>onChange(e.target.value)} className="mt-1 block w-full rounded-lg border border-cyan-900 bg-[#030b15] p-2" />;
}
