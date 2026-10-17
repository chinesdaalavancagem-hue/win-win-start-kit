import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Calculator, CircleDollarSign, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Win or Win Platform — Controle sua operação" },
      { name: "description", content: "Organize os parâmetros da sua operação, acompanhe bancas e planeje seus ciclos com mais clareza." },
      { property: "og:title", content: "Win or Win Platform" },
      { property: "og:description", content: "Mais clareza para planejar suas operações em prop firms." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  const benefits = [
    {
      number: "01",
      title: "Risco definido",
      text: "Antes de operar, você visualiza quanto colocar em risco e toma a decisão com números claros.",
      icon: ShieldCheck,
      tone: "text-cyan-300",
    },
    {
      number: "02",
      title: "Retorno calculado",
      text: "A plataforma mostra a projeção da operação antes da entrada, sem depender de conta feita às pressas.",
      icon: Calculator,
      tone: "text-sky-300",
    },
    {
      number: "03",
      title: "Estratégia organizada",
      text: "Organize as informações da sua estratégia e acompanhe os parâmetros da operação em um só ambiente.",
      icon: Target,
      tone: "text-emerald-300",
    },
  ];

  return (
    <main className="min-h-screen overflow-hidden bg-[#070b14] text-white">
      <header className="sticky top-0 z-50 border-b border-white/[0.08] bg-[#070b14]/85 backdrop-blur-2xl">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Win or Win — início">
            <span className="flex size-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] shadow-lg shadow-cyan-950/20">
              <img src="/logo.png" alt="" className="size-10 object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" />
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.16em]">WIN OR WIN</span>
              <span className="mt-0.5 block text-[9px] tracking-[0.25em] text-cyan-200/65">TRADING PLATFORM</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-slate-400 md:flex" aria-label="Navegação principal">
            <a href="#beneficios" className="transition-colors hover:text-cyan-200">Benefícios</a>
            <a href="#como-funciona" className="transition-colors hover:text-cyan-200">Como funciona</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-slate-300 hover:bg-white/[0.06] hover:text-white">
              <Link to="/auth">Entrar</Link>
            </Button>
            <Button asChild size="sm" className="rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 hover:brightness-110">
              <Link to="/auth" search={{ mode: "signup" }}>Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative isolate border-b border-white/[0.08]">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -left-40 top-10 h-[30rem] w-[30rem] rounded-full bg-cyan-500/[0.12] blur-[110px]" />
          <div className="absolute -right-24 top-24 h-[28rem] w-[28rem] rounded-full bg-emerald-500/[0.08] blur-[110px]" />
          <div className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(148,163,184,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.4)_1px,transparent_1px)] [background-size:42px_42px]" />
        </div>
        <div className="mx-auto grid min-h-[650px] max-w-7xl items-center gap-12 px-5 py-16 sm:px-8 md:grid-cols-[1.1fr_0.9fr] md:py-24 lg:min-h-[730px]">
          <div className="relative z-10 max-w-3xl">
            <p className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
              <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
              Planejamento para prop firms
            </p>
            <h1 className="text-4xl font-semibold leading-[1.04] tracking-tight sm:text-5xl lg:text-7xl">
              Sua operação começa com
              <span className="mt-2 block bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 bg-clip-text pb-2 text-transparent">números claros.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-slate-300/80 sm:text-lg sm:leading-8">
              Organize os parâmetros da sua estratégia, acompanhe suas bancas e planeje cada ciclo com mais clareza — antes de tomar sua decisão.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-6 font-semibold text-slate-950 shadow-xl shadow-cyan-950/30 transition hover:brightness-110">
                <Link to="/auth" search={{ mode: "signup" }}>Criar minha conta <ArrowRight className="ml-1 size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-12 rounded-xl border-white/15 bg-white/[0.025] px-6 text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-300/[0.06] hover:text-white">
                <a href="#como-funciona">Conhecer a plataforma <ArrowDown className="ml-1 size-4" /></a>
              </Button>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs text-slate-400">
              <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-emerald-300" /> Área pessoal</span>
              <span className="inline-flex items-center gap-2"><Calculator className="size-4 text-cyan-300" /> Cálculos organizados</span>
              <span className="inline-flex items-center gap-2"><Target className="size-4 text-sky-300" /> Gestão de ciclos</span>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-md">
            <div aria-hidden="true" className="absolute inset-6 rounded-[2rem] bg-cyan-400/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-[#111e30]/95 via-[#0b1422]/95 to-[#0a101b]/95 p-6 shadow-2xl shadow-black/40 sm:p-8">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-5">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Seu ambiente</p>
                  <p className="mt-1 text-lg font-semibold">Win or Win Platform</p>
                </div>
                <span className="flex size-14 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08]">
                  <img src="/logo.png" alt="Win or Win" className="size-[52px] object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" />
                </span>
              </div>
              <div className="mt-6 rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] to-sky-300/[0.025] p-5">
                <p className="text-xs text-slate-400">Planejamento da operação</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight">Mais clareza<span className="text-cyan-300">.</span></p>
                <div className="mt-5 flex h-20 items-end gap-2" aria-hidden="true">
                  {[28, 42, 34, 57, 45, 65, 53, 76, 61, 88, 72, 96, 80, 100].map((height, index) => (
                    <span key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-cyan-500/30 to-cyan-300/90" style={{ height: `${height}%`, opacity: 0.45 + index * 0.04 }} />
                  ))}
                </div>
                <p className="mt-3 text-[10px] text-slate-500">Ilustração visual • não representa resultados reais</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-cyan-300/[0.09] text-cyan-200"><Calculator className="size-4" /></span>
                  <p className="mt-4 text-sm font-semibold">Parâmetros</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Números organizados antes da entrada</p>
                </div>
                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-300/[0.09] text-emerald-200"><Target className="size-4" /></span>
                  <p className="mt-4 text-sm font-semibold">Ciclos</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">Acompanhamento do seu planejamento</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3">
                <span className="size-2 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.7)]" />
                <p className="text-xs text-slate-300">Seu plano. Seus dados. Sua estratégia.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-white/[0.08] bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-5 sm:px-8 md:grid-cols-4">
          {[
            ["Planejamento", "Organizado", "antes da operação"],
            ["Parâmetros", "Visíveis", "com mais clareza"],
            ["Bancas", "Centralizadas", "em um só ambiente"],
            ["Ciclos", "Acompanhados", "passo a passo"],
          ].map(([label, value, detail], index) => (
            <div key={label} className={`border-white/[0.08] px-4 py-6 sm:px-6 md:py-8 ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b md:border-b-0" : ""} ${index < 3 ? "md:border-r" : ""}`}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-3 text-lg font-semibold tracking-tight sm:text-xl">{value}</p>
              <p className="mt-1 text-xs text-cyan-200/70">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="beneficios" className="border-b border-white/[0.08] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="grid gap-10 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Feito para organizar</p>
              <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Menos improviso.<br /><span className="text-slate-400">Mais controle.</span></h2>
              <p className="mt-6 max-w-sm leading-7 text-slate-400">
                Transforme os dados da sua operação em uma visão mais simples, organizada e preparada antes de tomar uma decisão.
              </p>
            </div>
            <div className="space-y-3">
              {benefits.map(({ number, title, text, icon: Icon, tone }) => (
                <article key={number} className="group rounded-2xl border border-white/[0.08] bg-gradient-to-r from-white/[0.035] to-transparent p-5 transition-colors hover:border-cyan-300/20 sm:p-7">
                  <div className="flex items-start gap-4 sm:gap-5">
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.035] ${tone}`}><Icon className="size-5" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold sm:text-lg">{title}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-400 sm:text-base sm:leading-7">{text}</p>
                    </div>
                    <span className="ml-auto hidden text-3xl font-semibold text-white/[0.08] transition-colors group-hover:text-cyan-200/20 sm:block">{number}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="border-b border-white/[0.08] py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Como funciona</p>
              <h2 className="mt-4 max-w-2xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Uma rotina mais clara, passo a passo.</h2>
            </div>
            <p className="max-w-md leading-7 text-slate-400">Você informa os dados da operação. A plataforma ajuda a organizar os valores e os parâmetros que orientam seu planejamento.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["01", "Prepare", "Informe os parâmetros da operação e o cenário que pretende executar."],
              ["02", "Calcule", "Consulte os valores e projeções disponíveis antes de confirmar a entrada."],
              ["03", "Acompanhe", "Use o planejamento definido para acompanhar sua rotina e seus ciclos."],
            ].map(([step, title, text]) => (
              <article key={step} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-6 sm:min-h-64 sm:p-8">
                <span className="inline-flex rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-semibold tracking-[0.16em] text-cyan-200">ETAPA {step}</span>
                <h3 className="mt-8 text-xl font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-7 text-slate-400">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-300/[0.05] to-sky-300/[0.025] p-5 text-sm leading-6 text-slate-400">
            <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-cyan-200" />
            <p>A plataforma apoia a organização e o planejamento da operação. Não garante resultados financeiros; os resultados dependem da execução, das regras da prop firm e das condições de mercado.</p>
          </div>
        </div>
      </section>

      <section className="relative isolate overflow-hidden py-24 text-center sm:py-32">
        <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-cyan-950/20 to-transparent" />
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 -z-10 size-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/[0.08] blur-[100px]" />
        <div className="relative mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Comece por aqui</p>
          <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Sua estratégia merece mais clareza.</h2>
          <p className="mx-auto mt-5 max-w-xl leading-7 text-slate-400">Crie sua conta e conheça um ambiente para organizar seus parâmetros, suas bancas e seu planejamento de operações.</p>
          <Button asChild size="lg" className="mt-8 h-12 rounded-xl bg-gradient-to-r from-cyan-400 to-sky-400 px-7 font-semibold text-slate-950 shadow-xl shadow-cyan-950/30 hover:brightness-110">
            <Link to="/auth" search={{ mode: "signup" }}>Criar minha conta <ArrowRight className="ml-1 size-4" /></Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-white/[0.08] bg-black/10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-7 text-xs text-slate-500 sm:flex-row sm:px-8">
          <div className="flex items-center gap-3"><img src="/logo.png" alt="" className="size-10 rounded-lg object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" /><span>Win or Win Platform</span></div>
          <p>Planejamento, organização e controle.</p>
          <Link to="/auth" className="text-slate-300 transition-colors hover:text-cyan-200">Entrar na plataforma</Link>
        </div>
      </footer>
    </main>
  );
}
