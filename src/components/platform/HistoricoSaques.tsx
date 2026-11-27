import { useState } from "react";
import type { Banca } from "@/lib/platform/bancas";
import { fmt, fmtSigned, resultadoHistoricoCiclo, type AssetKey, type LogEntry, type State, type PayoutRegistro } from "@/lib/platform/engine";

const ativoNome: Record<AssetKey, string> = { ouro: "Gold", nasdaq: "Nasdaq", saque2: "Saque 2" };
const dataHora = (ts: number) => new Date(ts).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
const dinheiro = (v: number) => `US$ ${fmt(v)}`;

interface Ciclo {
  numero: number;
  origem: AssetKey;
  eventos: LogEntry[];
  fechamento?: LogEntry;
}

function montarCiclos(estado: State, ativo: "ouro" | "nasdaq"): Ciclo[] {
  const registros = estado.log.filter(e =>
    (e.asset === ativo && e.tipo === "aprovada") ||
    (e.asset === "saque2" && (e.origemSaque === ativo || (!e.origemSaque && estado.assets.saque2.params.ativoReal === ativo)))
  ).sort((a, b) => a.ts - b.ts || a.id - b.id);
  const primeiro = registros.find(e => e.asset === ativo && e.tipo === "aprovada" && Number(e.saque) > 0);
  if (!primeiro) return [];
  // O primeiro payout inclui os lucros/perdas registrados desde a última reprovação,
  // preservando o histórico da avaliação/financiada que levou ao saque.
  const eventosIniciais = estado.log.filter(e => e.asset === ativo && (e.ts < primeiro.ts || (e.ts === primeiro.ts && e.id <= primeiro.id)))
    .sort((a, b) => a.ts - b.ts || a.id - b.id);
  const ultimaReprovacao = eventosIniciais.findLastIndex(e => e.tipo === "reprovada");
  const ciclos: Ciclo[] = [{ numero: 1, origem: ativo, eventos: eventosIniciais.slice(ultimaReprovacao + 1), fechamento: primeiro }];
  const seguintes = registros.filter(e => e.asset === "saque2" && (e.ts > primeiro.ts || (e.ts === primeiro.ts && e.id > primeiro.id)));
  let atual: Ciclo = { numero: 2, origem: ativo, eventos: [] };
  for (const evento of seguintes) {
    atual.eventos.push(evento);
    if (evento.tipo === "aprovada" && Number(evento.saque) > 0) {
      atual.fechamento = evento;
      ciclos.push(atual);
      atual = { numero: atual.numero + 1, origem: ativo, eventos: [] };
    }
  }
  // Exibe o próximo ciclo, mesmo antes do primeiro registro do Saque 2.
  ciclos.push(atual);
  return ciclos;
}

function RegistroSaque({ ciclo, estado, editavel, onUpdate }: {
  ciclo: Ciclo;
  estado: State;
  editavel: boolean;
  onUpdate: (id: number, valor: PayoutRegistro) => void;
}) {
  const [aberto, setAberto] = useState(ciclo.numero === 1 || !ciclo.fechamento);
  const [valorInput, setValorInput] = useState("");
  const fechamento = ciclo.fechamento;
  const salvo = fechamento ? estado.payoutRegistros?.[String(fechamento.id)] : undefined;
  const projetado = fechamento && typeof fechamento.saque === "number" && Number.isFinite(fechamento.saque) ? fechamento.saque : null;
  const status = !fechamento ? "andamento" : salvo?.status ?? "elegivel";
  const valorRecebido = status === "recebido" && typeof salvo?.valorRecebido === "number" && Number.isFinite(salvo.valorRecebido) ? salvo.valorRecebido : null;
  const somaCustos = ciclo.eventos.reduce((total, evento) =>
    total + (typeof evento.custoProprioDia === "number" && Number.isFinite(evento.custoProprioDia) ? Math.max(0, evento.custoProprioDia) : 0), 0);
  const custoProprio = fechamento && typeof fechamento.custoProprioCiclo === "number" && Number.isFinite(fechamento.custoProprioCiclo)
    ? Math.max(0, fechamento.custoProprioCiclo) : somaCustos;
  const custoBonus = ciclo.eventos.reduce((s, e) => s + (typeof e.custoBonusDia === "number" && Number.isFinite(e.custoBonusDia) ? Math.max(0, e.custoBonusDia) : 0), 0);
  const resultado = fechamento ? resultadoHistoricoCiclo(estado, fechamento, custoProprio) : null;
  const progressos = ciclo.eventos.filter(e => e.tipo === "profit").length;
  const rotuloStatus = { andamento: "Em andamento", elegivel: "Elegível · não solicitado", solicitado: "Solicitado", recebido: "Recebido" }[status];
  return <article className="overflow-hidden rounded-xl border border-[#254966] bg-[#081726]">
    <button type="button" aria-expanded={aberto} onClick={() => setAberto(v => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-cyan-950/30">
      <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-lg border border-cyan-500/40 bg-cyan-900/30 font-mono font-bold text-cyan-200">{ciclo.numero}º</span><div><h4 className="font-bold text-slate-100">{ciclo.numero}º saque · {ativoNome[ciclo.origem]}</h4><p className="text-[11px] text-slate-400">{fechamento ? `Encerrado em ${dataHora(fechamento.ts)}` : `${progressos} dia(s) com Profit registrado no ciclo`}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${status === "recebido" ? "border-emerald-500/40 text-emerald-300" : status === "solicitado" ? "border-sky-500/40 text-sky-300" : "border-amber-500/40 text-amber-200"}`}>{rotuloStatus}</span><strong className="font-mono text-sm text-slate-100">{valorRecebido !== null ? dinheiro(valorRecebido) : projetado !== null ? dinheiro(projetado) : "—"}</strong><span className="text-cyan-400">{aberto ? "−" : "+"}</span></div>
    </button>
    {aberto && <div className="space-y-3 border-t border-cyan-900/60 p-4">
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-lg bg-[#0b2034] p-3"><p className="text-slate-400">Payout projetado</p><strong className="mt-1 block font-mono text-sm text-cyan-200">{projetado === null ? "Em cálculo" : dinheiro(projetado)}</strong></div>
        <div className="rounded-lg bg-[#0b2034] p-3"><p className="text-slate-400">Custo do bolso</p><strong className="mt-1 block font-mono text-sm text-rose-300">{dinheiro(custoProprio)}</strong></div>
        <div className="rounded-lg bg-[#0b2034] p-3"><p className="text-slate-400">Bônus consumido</p><strong className="mt-1 block font-mono text-sm text-amber-300">{dinheiro(custoBonus)}</strong></div>
        <div className="rounded-lg bg-[#0b2034] p-3"><p className="text-slate-400">Resultado histórico do ciclo</p><strong className={`mt-1 block font-mono text-sm ${(resultado ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{resultado === null ? "Aguardando" : fmtSigned(resultado)}</strong></div>
      </div>
      <p className="text-xs leading-relaxed text-slate-400">O payout projetado e o resultado histórico são estimativas ou lançamentos internos. Apenas o valor confirmado como recebido abaixo entra na soma de saques efetivamente recebidos. Acompanhamento não movimenta recursos e não muda os cálculos legados do Profit.</p>
      {fechamento && <div className="rounded-lg border border-cyan-800/60 bg-[#061321] p-3">
        <label className="block text-xs text-slate-300">Situação do payout
          <select disabled={!editavel} value={status} onChange={e => {
            const proximo = e.target.value as PayoutRegistro["status"];
            onUpdate(fechamento.id, proximo === "recebido" ? {status: proximo, ...(valorRecebido !== null ? {valorRecebido} : {}), atualizadoEm: Date.now()} : {status: proximo, atualizadoEm: Date.now()});
          }} className="mt-1.5 block w-full max-w-sm rounded-lg border border-cyan-700/60 bg-[#0c2236] p-2 text-sm text-slate-100 disabled:opacity-50">
            <option value="elegivel">Elegível / ainda não solicitado</option><option value="solicitado">Saque solicitado</option><option value="recebido">Saque recebido</option>
          </select>
        </label>
        {status === "recebido" && valorRecebido === null && <p className="mt-2 text-xs text-amber-200">Informe o valor recebido para que ele entre na soma de saques confirmados. A previsão não será usada automaticamente.</p>}
        {status === "recebido" && <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={e => {
          e.preventDefault();
          const txt = valorInput.trim();
          const parsed = txt ? Number(txt.replace(",", ".")) : valorRecebido;
          if (parsed === null || !Number.isFinite(parsed) || parsed < 0) return;
          onUpdate(fechamento.id, {status: "recebido", valorRecebido: parsed, atualizadoEm: Date.now()});
          setValorInput("");
        }}>
          <label className="text-xs text-slate-300">Valor efetivamente recebido (US$)
            <input disabled={!editavel} type="text" inputMode="decimal" placeholder={valorRecebido === null ? "Informe o valor" : fmt(valorRecebido)} value={valorInput} onChange={e => setValorInput(e.target.value)} className="mt-1 block w-48 rounded-lg border border-cyan-700/60 bg-[#0c2236] p-2 font-mono text-slate-100 disabled:opacity-50"/>
          </label>
          <button disabled={!editavel || !valorInput.trim()} type="submit" className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-[#041322] disabled:opacity-40">Salvar valor recebido</button>
        </form>}
        {!editavel && <p className="mt-2 text-[11px] text-amber-200/80">Para atualizar o recebimento, selecione esta banca como conta ativa.</p>}
      </div>}
      <div><h5 className="mb-2 text-xs font-bold uppercase tracking-wider text-cyan-200">Operações deste ciclo</h5>
        {ciclo.eventos.length ? <div className="divide-y divide-cyan-950/80 rounded-lg border border-cyan-950">
          {ciclo.eventos.map(e => <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs"><span className="text-slate-300">{dataHora(e.ts)} · {e.tipo === "profit" ? `D${e.day} · Profit` : e.tipo === "aprovada" ? "Fechamento do ciclo" : `D${e.day} · Reprovada`}</span><span className="font-mono text-slate-200">{typeof e.cfdReal === "number" && Number.isFinite(e.cfdReal) ? `Forex ${fmtSigned(e.cfdReal)}` : `Lançamento ${fmtSigned(e.delta)}`}</span></div>)}
        </div> : <p className="text-xs text-slate-400">Nenhuma operação do novo ciclo registrada até agora.</p>}
      </div>
    </div>}
  </article>;
}

export function HistoricoSaques({ bancas, state, bancaAtivaId, mutate }: {
  bancas?: Banca[];
  state: State;
  bancaAtivaId?: string;
  mutate: (fn: (s: State) => void) => void;
}) {
  const dados = (bancas ?? []).flatMap(b => {
    const atual = b.id === bancaAtivaId ? state : b.state;
    const ativo = b.ativo === "nasdaq" ? "nasdaq" : b.ativo === "ouro" ? "ouro" : (atual.log.find(e => e.tipo === "aprovada" && e.asset !== "saque2")?.asset === "nasdaq" ? "nasdaq" : "ouro");
    return montarCiclos(atual, ativo).map(ciclo => ({ banco: b, atual, ciclo }));
  });
  const concluidos = dados.filter(x => !!x.ciclo.fechamento);
  const recebidos = concluidos.reduce((total, x) => {
    const e = x.ciclo.fechamento!;
    const p = x.atual.payoutRegistros?.[String(e.id)];
    return total + (p?.status === "recebido" && typeof p.valorRecebido === "number" && Number.isFinite(p.valorRecebido) ? p.valorRecebido : 0);
  }, 0);
  const [expandido, setExpandido] = useState(true);
  return <section className="mb-4 overflow-hidden rounded-2xl border border-cyan-600/50 bg-[#061525]">
    <button type="button" onClick={() => setExpandido(v => !v)} aria-expanded={expandido} className="flex w-full flex-wrap items-center justify-between gap-2 border-b border-cyan-900/70 px-4 py-4 text-left hover:bg-cyan-950/20"><div><h3 className="text-lg font-extrabold text-cyan-100">Histórico de Saques</h3><p className="mt-1 text-xs text-slate-400">Ciclos independentes por payout, vinculados à mesma banca</p></div><span className="text-sm font-bold text-cyan-200">{expandido ? "Recolher −" : "Expandir +"}</span></button>
    {expandido && <div className="space-y-4 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-700/35 bg-emerald-950/15 p-4"><div><p className="text-xs text-emerald-200/75">Saques confirmados como recebidos nesta seleção</p><strong className="mt-1 block font-mono text-xl font-bold text-emerald-300">{dinheiro(recebidos)}</strong></div><span className="text-xs text-slate-400">{concluidos.length} payout(s) com encerramento registrado</span></div>
      {!dados.length ? <p className="py-4 text-sm text-slate-400">Quando a primeira sequência de dias financiados for concluída e registrada, os ciclos de saque aparecerão aqui.</p> : (bancas ?? []).map(b => {
        const ciclos = dados.filter(d => d.banco.id === b.id);
        if (!ciclos.length) return null;
        const ativo = ciclos[0]!.ciclo.origem;
        return <div key={b.id} className="space-y-2"><div className="flex flex-wrap items-center gap-2 border-b border-cyan-900/70 pb-2"><h4 className="font-bold text-slate-100">{b.nome}</h4><span className="rounded-full border border-cyan-700/40 px-2 py-0.5 text-[10px] text-cyan-300">{ativoNome[ativo]} · mesma conta</span></div>
          {ciclos.map(({ciclo,atual}) => <RegistroSaque key={`${b.id}-${ciclo.numero}`} ciclo={ciclo} estado={atual} editavel={b.id === bancaAtivaId} onUpdate={(id, valor) => mutate(s => {
            s.payoutRegistros ??= {};
            if (!s.log.some(e => e.id === id && e.tipo === "aprovada" && Number(e.saque) > 0)) return;
            s.payoutRegistros[String(id)] = valor;
          })} />)}
        </div>;
      })}
      <p className="text-[11px] leading-relaxed text-slate-500">Esta área não cria bancas, não reinicia taxas e não limita o número de saques. Os históricos e valores financeiros anteriores continuam preservados.</p>
    </div>}
  </section>;
}
