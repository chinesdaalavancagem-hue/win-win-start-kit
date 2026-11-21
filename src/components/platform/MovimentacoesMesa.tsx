import { useState } from "react";
import { Button } from "@/components/ui/button";
import { fmtSigned, fmt, type AssetKey, type State } from "@/lib/platform/engine";
import { ativoDaAba, chaveCiclo, cicloAberto, ciclosUsados, resumoCiclo, storeVazio, type AtivoMesa, type MovimentacaoMesa } from "@/lib/platform/movimentacoes-mesa";
import { cn } from "@/lib/utils";

const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dataBr = (iso: string) => iso.split("-").reverse().join("/");
const input = "w-full rounded-lg border border-cyan-900/70 bg-[#071426] px-3 py-2 text-sm text-slate-100 focus:border-cyan-400 focus:outline-none";
const nomes: Record<AtivoMesa, string> = { ouro: "Gold", nasdaq: "Nasdaq" };

export function MovimentacoesMesa({ state, tab, mutate }: { state: State; tab: AssetKey | "historico"; mutate: (fn: (s: State) => void) => void }) {
  const [ativo, setAtivo] = useState<AtivoMesa>(() => ativoDaAba(state, tab));
  const aberto = cicloAberto(state, ativo);
  const [ciclo, setCiclo] = useState(aberto);
  const store = state.movimentacoesMesa;
  const ciclos = ciclosUsados(store, ativo, aberto);
  const r = resumoCiclo(store, ativo, ciclo);
  const vazio = { data: hoje(), dia: "", resultado: "", obs: "" };
  const [form, setForm] = useState(vazio);
  const [editando, setEditando] = useState<string | null>(null);
  const [baseInput, setBaseInput] = useState("");

  const trocarAtivo = (a: AtivoMesa) => { setAtivo(a); setCiclo(cicloAberto(state, a)); setEditando(null); setForm(vazio); };
  const salvar = () => {
    const resultado = Number(form.resultado.replace(",", "."));
    if (form.resultado.trim() === "" || !Number.isFinite(resultado) || !/^\d{4}-\d{2}-\d{2}$/.test(form.data)) return;
    mutate(s => {
      const st = s.movimentacoesMesa ?? (s.movimentacoesMesa = storeVazio());
      const dados = { data: form.data, ativo, ciclo, resultado, dia: form.dia.trim() || undefined, obs: form.obs.trim() || undefined };
      if (editando) { const m = st.lancamentos.find(x => x.id === editando); if (m) Object.assign(m, dados); }
      else st.lancamentos.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, criadoEm: Date.now(), ...dados } as MovimentacaoMesa);
    });
    setEditando(null); setForm(vazio);
  };
  const excluir = (id: string) => {
    if (!window.confirm("Excluir este lançamento? Isso não afeta nenhum outro cálculo.")) return;
    mutate(s => { if (s.movimentacoesMesa) s.movimentacoesMesa.lancamentos = s.movimentacoesMesa.lancamentos.filter(m => m.id !== id); });
  };
  const salvarBase = () => {
    const v = Number(baseInput.replace(",", "."));
    if (!Number.isFinite(v) || baseInput.trim() === "") return;
    mutate(s => { (s.movimentacoesMesa ?? (s.movimentacoesMesa = storeVazio())).bases[chaveCiclo(ativo, ciclo)] = v; });
    setBaseInput("");
  };
  const card = (label: string, valor: string, cor: string) => <div className="rounded-xl border border-cyan-950 bg-[#071426] p-3"><p className="text-[11px] uppercase tracking-wider text-slate-400">{label}</p><p className={cn("mt-1 font-mono text-lg font-bold", cor)}>{valor}</p></div>;

  return <section className="space-y-4 rounded-2xl border border-cyan-900/60 bg-[#06101f] p-4 sm:p-5" aria-label="Movimentações da Mesa">
    <div>
      <h2 className="text-lg font-bold text-cyan-200">Movimentações da Mesa</h2>
      <p className="text-xs text-slate-400">Controle informativo do resultado real na mesa, desta banca. Não altera Profit, Stop, saques nem nenhum cálculo.</p>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {(["ouro", "nasdaq"] as AtivoMesa[]).map(a => <button key={a} type="button" aria-pressed={ativo === a} onClick={() => trocarAtivo(a)} className={cn("rounded-lg border px-3 py-1.5 text-sm", ativo === a ? "border-cyan-400 bg-cyan-700/20 text-cyan-100" : "border-cyan-950 text-slate-300")}>{nomes[a]}</button>)}
      <span className="mx-1 h-5 w-px bg-cyan-950" />
      {ciclos.map(c => <button key={c} type="button" aria-pressed={ciclo === c} onClick={() => { setCiclo(c); setEditando(null); setForm(vazio); }} className={cn("rounded-lg border px-3 py-1.5 text-sm", ciclo === c ? "border-teal-400 bg-teal-700/20 text-teal-100" : "border-cyan-950 text-slate-300")}>Ciclo {c}{c === aberto ? " (atual)" : ""}</button>)}
      <button type="button" onClick={() => setCiclo(Math.max(...ciclos) + 1)} className="rounded-lg border border-dashed border-cyan-900 px-3 py-1.5 text-xs text-slate-400">+ ciclo</button>
    </div>
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      {card("Saldo base", `US$ ${fmt(r.base)}`, "text-slate-100")}
      {card("Ganhos", `US$ ${fmt(r.ganhos)}`, "text-emerald-400")}
      {card("Perdas", `US$ ${fmt(r.perdas)}`, "text-rose-400")}
      {card("Líquido do ciclo", fmtSigned(r.liquido), r.liquido >= 0 ? "text-emerald-300" : "text-rose-300")}
      {card("Saldo atual da mesa", `US$ ${fmt(r.saldo)}`, "text-cyan-200")}
    </div>
    <div className="flex flex-wrap items-end gap-2 rounded-xl border border-cyan-950 p-3">
      <label className="text-xs text-slate-400">Ajustar saldo base de {nomes[ativo]} · ciclo {ciclo} (US$)
        <input className={cn(input, "mt-1 w-40")} inputMode="decimal" value={baseInput} placeholder={String(r.base)} onChange={e => setBaseInput(e.target.value)} />
      </label>
      <Button type="button" variant="outline" className="border-cyan-800 bg-transparent text-cyan-100" onClick={salvarBase}>Salvar base</Button>
      <p className="basis-full text-[11px] text-slate-500">Saldo atual = saldo base + soma dos lançamentos deste ciclo.</p>
    </div>
    <div className="grid gap-2 rounded-xl border border-cyan-950 p-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs text-slate-400">Data<input type="date" className={cn(input, "mt-1")} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></label>
      <label className="text-xs text-slate-400">Dia do ciclo<input className={cn(input, "mt-1")} placeholder="ex.: D2" value={form.dia} onChange={e => setForm({ ...form, dia: e.target.value })} /></label>
      <label className="text-xs text-slate-400">Resultado (US$)<input className={cn(input, "mt-1")} inputMode="decimal" placeholder="+ ganho / − perda" value={form.resultado} onChange={e => setForm({ ...form, resultado: e.target.value })} /></label>
      <label className="text-xs text-slate-400 lg:col-span-2">Observação<input className={cn(input, "mt-1")} value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} /></label>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-5">
        <Button type="button" onClick={salvar} className="bg-cyan-600 text-slate-950 hover:bg-cyan-500">{editando ? "Salvar alteração" : "Adicionar lançamento"}</Button>
        {editando && <Button type="button" variant="ghost" onClick={() => { setEditando(null); setForm(vazio); }}>Cancelar</Button>}
      </div>
    </div>
    {r.linhas.length === 0 ? <p className="text-sm text-slate-500">Nenhum lançamento em {nomes[ativo]} · ciclo {ciclo}.</p> :
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm">
      <thead><tr className="text-left text-[11px] uppercase text-slate-400"><th className="p-2">Data</th><th className="p-2">Dia</th><th className="p-2 text-right">Resultado</th><th className="p-2 text-right">Acumulado</th><th className="p-2">Obs.</th><th /></tr></thead>
      <tbody>{r.linhas.map(m => <tr key={m.id} className="border-t border-cyan-950">
        <td className="p-2 font-mono">{dataBr(m.data)}</td><td className="p-2">{m.dia ?? "—"}</td>
        <td className={cn("p-2 text-right font-mono", m.resultado >= 0 ? "text-emerald-400" : "text-rose-400")}>{fmtSigned(m.resultado)}</td>
        <td className="p-2 text-right font-mono text-cyan-200">{fmt(m.acumulado)}</td><td className="p-2 text-slate-400">{m.obs ?? ""}</td>
        <td className="whitespace-nowrap p-2 text-right"><button type="button" className="mr-3 text-xs text-cyan-300" onClick={() => { setEditando(m.id); setForm({ data: m.data, dia: m.dia ?? "", resultado: String(m.resultado), obs: m.obs ?? "" }); }}>Editar</button><button type="button" className="text-xs text-rose-300" onClick={() => excluir(m.id)}>Excluir</button></td>
      </tr>)}</tbody></table></div>}
  </section>;
}
