import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, Calculator, CircleDollarSign, ShieldCheck, Target } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Win or Win Platform" },
      { name: "description", content: "Controle de bancas, depósitos, saques e bônus — acesso exclusivo para membros aprovados." },
      { property: "og:title", content: "Win or Win Platform" },
      { property: "og:description", content: "Controle de bancas, depósitos, saques e bônus para membros aprovados." },
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
      tone: "text-market-up border-market-up",
    },
    {
      number: "02",
      title: "Retorno calculado",
      text: "A plataforma mostra a projeção da operação antes da entrada, sem depender de conta feita às pressas.",
      icon: Calculator,
      tone: "text-brand-gold border-brand-gold",
    },
    {
      number: "03",
      title: "Direção neutralizada",
      text: "A estratégia organiza as duas pontas para reduzir a dependência de acertar se o mercado sobe ou desce.",
      icon: Target,
      tone: "text-market-down border-market-down",
    },
  ];

  return (
    <main className="marketing-page min-h-screen overflow-hidden bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 md:h-20 md:px-8">
          <Link to="/" className="flex items-center gap-3" aria-label="Win or Win — início">
            <img src="/favicon.ico" alt="" className="size-10 rounded-md object-cover md:size-11" />
            <span className="hidden font-heading text-sm uppercase sm:inline">Win or Win</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex" aria-label="Navegação principal">
            <a href="#beneficios" className="transition-colors hover:text-foreground">Benefícios</a>
            <a href="#como-funciona" className="transition-colors hover:text-foreground">Como funciona</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Entrar</Link></Button>
            <Button asChild size="sm" className="bg-foreground text-background hover:bg-brand-gold hover:text-brand-ink">
              <Link to="/auth" search={{ mode: "signup" }}>Criar conta</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative border-b border-border/70">
        <div className="market-grid absolute inset-0 opacity-35" aria-hidden="true" />
        <div className="mx-auto grid min-h-[720px] max-w-7xl items-center gap-10 px-5 py-16 md:grid-cols-[1.2fr_0.8fr] md:px-8 md:py-20 lg:min-h-[780px]">
          <div className="relative z-10 max-w-4xl">
            <p className="mb-7 inline-flex items-center gap-2 border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-[11px] font-semibold uppercase text-brand-gold">
              <span className="size-1.5 bg-market-up" /> Para quem opera prop firm
            </p>
            <h1 className="font-heading max-w-4xl text-5xl uppercase leading-[0.98] sm:text-6xl lg:text-8xl">
              Entre na operação sabendo <span className="text-brand-gold">os seus números.</span>
            </h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted-foreground md:text-lg md:leading-8">
              Saiba quanto arriscar, qual retorno buscar e quanto poderá sacar antes de executar sua estratégia — sem depender de cálculo mental no momento da decisão.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-14 rounded-none bg-foreground px-7 font-semibold text-background hover:bg-brand-gold hover:text-brand-ink">
                <Link to="/auth" search={{ mode: "signup" }}>Criar minha conta <ArrowRight /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-14 rounded-none px-7">
                <a href="#como-funciona">Entender o processo <ArrowDown /></a>
              </Button>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-64 md:max-w-80 lg:max-w-96">
            <img src="/logo.png" width="240" height="240" className="h-auto w-full object-contain" />
            <div className="mt-4 border-l border-brand-gold/30 px-4 py-2">
              <p className="text-[10px] uppercase text-muted-foreground">Decisão</p>
              <p className="font-heading mt-1 text-sm uppercase text-market-up">Antes da entrada</p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/70">
        <div className="mx-auto grid max-w-7xl grid-cols-2 md:grid-cols-4">
          {[
            ["Risco", "Definido", "antes da operação"],
            ["Retorno", "Calculado", "com antecedência"],
            ["Direção", "Neutralizada", "na estratégia"],
            ["Saque", "Projetado", "com clareza"],
          ].map(([label, value, detail], index) => (
            <div key={label} className={`p-6 md:p-8 ${index < 3 ? "md:border-r" : ""} ${index % 2 === 0 ? "border-r" : ""} ${index < 2 ? "border-b md:border-b-0" : ""} border-border/70`}>
              <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
              <p className="font-heading mt-3 text-xl uppercase md:text-2xl">{value}</p>
              <p className="mt-1 text-xs text-brand-gold">{detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="beneficios" className="bg-section py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="grid gap-8 md:grid-cols-[0.8fr_1.2fr] md:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-gold">Por que usar</p>
              <h2 className="font-heading mt-4 text-4xl uppercase leading-none md:text-6xl">Menos dúvida.<br />Mais controle.</h2>
              <p className="mt-6 max-w-sm leading-7 text-muted-foreground">
                A Win or Win transforma os dados da sua operação em uma decisão simples, visual e preparada antes do mercado exigir uma resposta.
              </p>
            </div>
            <div className="space-y-4">
              {benefits.map(({ number, title, text, icon: Icon, tone }) => (
                <article key={number} className={`group relative border-l-4 bg-card p-6 md:p-8 ${tone}`}>
                  <div className="flex items-start gap-5">
                    <Icon className="mt-1 size-6 shrink-0" aria-hidden="true" />
                    <div>
                      <p className="font-heading text-lg uppercase text-foreground md:text-xl">{title}</p>
                      <p className="mt-3 max-w-xl leading-7 text-muted-foreground">{text}</p>
                    </div>
                    <span className="font-heading ml-auto text-4xl text-foreground/5 transition-colors group-hover:text-foreground/10">{number}</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="border-y border-border/70 py-24 md:py-32">
        <div className="mx-auto max-w-7xl px-5 md:px-8">
          <div className="mb-14 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-gold">Como funciona</p>
              <h2 className="font-heading mt-4 max-w-2xl text-4xl uppercase leading-none md:text-6xl">Da análise ao saque, sem improviso.</h2>
            </div>
            <p className="max-w-md leading-7 text-muted-foreground">Você informa os dados da operação. A plataforma organiza os valores que orientam sua decisão.</p>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-3">
            {[
              ["01", "Prepare", "Informe os parâmetros da operação e o cenário que pretende executar."],
              ["02", "Calcule", "Veja risco, retorno e projeção de saque antes de confirmar a entrada."],
              ["03", "Opere", "Use os números definidos para executar com mais clareza e menos conta de cabeça."],
            ].map(([step, title, text]) => (
              <article key={step} className="min-h-64 bg-background p-7 md:p-9">
                <span className="font-heading text-sm text-brand-gold">PASSO {step}</span>
                <h3 className="font-heading mt-12 text-2xl uppercase">{title}</h3>
                <p className="mt-4 leading-7 text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 border border-border bg-card p-5 text-sm text-muted-foreground">
            <CircleDollarSign className="mt-0.5 size-5 shrink-0 text-brand-gold" />
            <p>A plataforma apoia a gestão da operação. Resultados dependem da execução, das regras da prop firm e das condições de mercado.</p>
          </div>
        </div>
      </section>

      <section className="relative py-28 text-center md:py-36">
        <div className="market-grid absolute inset-0 opacity-20" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl px-5">
          <p className="text-xs font-semibold uppercase text-brand-gold">Sua próxima operação começa antes</p>
          <h2 className="font-heading mt-5 text-4xl uppercase leading-none md:text-6xl">Mais clareza na tela. Mais controle no bolso.</h2>
          <p className="mx-auto mt-6 max-w-xl leading-7 text-muted-foreground">Crie sua conta e conheça uma forma mais organizada de planejar suas operações em prop firm.</p>
          <Button asChild size="lg" className="mt-10 h-14 rounded-none bg-brand-gold px-8 font-semibold text-brand-ink hover:bg-foreground">
            <Link to="/auth" search={{ mode: "signup" }}>Começar agora <ArrowRight /></Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-8 text-sm text-muted-foreground sm:flex-row md:px-8">
          <div className="flex items-center gap-3"><img src="/favicon.ico" alt="" className="size-8 rounded object-cover" /><span>Win or Win</span></div>
          <Link to="/auth" className="transition-colors hover:text-foreground">Entrar</Link>
        </div>
      </footer>
    </main>
  );
}
