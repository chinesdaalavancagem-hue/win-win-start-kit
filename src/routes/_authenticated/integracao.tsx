import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { gerarChave } from "@/lib/integracao.functions";
import { registrarAuditoria } from "@/lib/auditoria-registro";

export const Route = createFileRoute("/_authenticated/integracao")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.from("profiles").select("approved,rejected").eq("id", context.user.id).maybeSingle();
    if (!data?.approved || data.rejected) throw redirect({ to: "/plataforma" });
  },
  head: () => ({ meta: [{ title: "Integração — Win or Win" }, { name: "description", content: "Conecte a mesa Tradovate ao MetaTrader 5." }, { property: "og:title", content: "Integração — Win or Win" }, { property: "og:description", content: "Receba as ordens da mesa e espelhe no CFD." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Integracao,
});

type Row = { id: string; symbol: string; side: string; mirror_side: string; qty: number; status: string; error: string | null; created_at: string };
const STATUS: Record<string, string> = { pending: "Na fila", sent: "Enviada ao MT5", done: "Executada no CFD", error: "Falhou" };
const ARQ = {
  robo: { path: "robo/WinOrWin_Hedge.ex5", nome: "WinOrWin_Hedge.ex5", accept: ".ex5", label: "Robô MT5 (.ex5)" },
  ext: { path: "extensao/WinOrWin_Extensao.zip", nome: "WinOrWin_Extensao.zip", accept: ".zip", label: "Extensão Chrome (.zip)" },
} as const;
type Tipo = keyof typeof ARQ;


function CopiarTexto({ texto }: { texto: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch {
      window.prompt("Copie o texto abaixo:", texto);
    }
  }
  return (
    <button type="button" onClick={copiar} className="ml-2 inline-flex items-center rounded border px-2 py-1 text-xs font-medium hover:bg-muted">
      {copiado ? "Copiado!" : "Copiar"}
    </button>
  );
}

function Integracao() {
  const { user } = Route.useRouteContext();
  const gerar = useServerFn(gerarChave);
  const [temChave, setTemChave] = useState<boolean | null>(null);
  const [chave, setChave] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [disp, setDisp] = useState<Record<Tipo, boolean>>({ robo: false, ext: false });
  const [base, setBase] = useState("");

  async function load() {
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from("integration_tokens").select("created_at").maybeSingle(),
      supabase.from("order_queue").select("id,symbol,side,mirror_side,qty,status,error,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setTemChave(!!t);
    setRows((o as Row[]) ?? []);
  }
  async function loadArquivos() {
    const [r, e] = await Promise.all([supabase.storage.from("downloads").list("robo"), supabase.storage.from("downloads").list("extensao")]);
    setDisp({ robo: !!r.data?.some((f) => f.name === ARQ.robo.nome), ext: !!e.data?.some((f) => f.name === ARQ.ext.nome) });
  }
  useEffect(() => {
    void registrarAuditoria({ category: "navigation", action: "navigation.opened", outcome: "success", details: { page: "integration" } });
    setBase(window.location.origin);
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => setIsAdmin(!!data?.some((r) => r.role === "admin")));
    load(); loadArquivos();
    const i = setInterval(load, 10000); return () => clearInterval(i);
  }, [user.id]);

  async function novaChave() {
    if (temChave && !confirm("A chave atual vai parar de funcionar. Continuar?")) return;
    try {
      const r = await gerar();
      setChave(r.token);
      setTemChave(true);
    } catch {
      void registrarAuditoria({ category: "integration", action: "integration.key_failed", outcome: "failed", details: { reason: "key_generation_failed" } });
      alert("Não foi possível gerar a chave. Tente novamente.");
    }
  }
  async function baixar(t: Tipo) {
    const { data, error } = await supabase.storage.from("downloads").createSignedUrl(ARQ[t].path, 60, { download: ARQ[t].nome });
    if (error || !data) {
      void registrarAuditoria({ category: "integration", action: "integration.download_failed", outcome: "failed", details: { asset: t, reason: "signed_url_failed" } });
      return alert("Arquivo ainda não disponível.");
    }
    void registrarAuditoria({ category: "integration", action: "integration.download_requested", outcome: "started", details: { asset: t } });
    window.location.href = data.signedUrl;
  }
  async function enviar(t: Tipo, f?: File) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(ARQ[t].accept)) return alert(`Envie um arquivo ${ARQ[t].accept}`);
    const { error } = await supabase.storage.from("downloads").upload(ARQ[t].path, f, { upsert: true });
    if (error) return alert("Falha ao enviar o arquivo.");
    void registrarAuditoria({ category: "integration", action: "integration.file_published", outcome: "success", details: { asset: t } });
    alert("Arquivo publicado para os usuários.");
    loadArquivos();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integração Tradovate → MT5</h1>
        <Button asChild size="sm" variant="outline"><Link to="/plataforma">Voltar</Link></Button>
      </div>

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold">1. Sua chave</h2>
        <p className="text-sm text-muted-foreground">A chave liga a extensão e o robô do MT5 à sua conta. Ela aparece só uma vez; guarde num lugar seguro.</p>
        {chave && <code className="block break-all rounded bg-muted p-2 text-sm">{chave}</code>}
        <Button size="sm" onClick={novaChave}>{temChave ? "Gerar nova chave" : "Gerar chave"}</Button>
      </section>

      <section className="space-y-3 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">2. Downloads</h2>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ARQ) as Tipo[]).map((t) => (
            <Button key={t} size="sm" disabled={!disp[t]} onClick={() => baixar(t)}>
              Baixar {ARQ[t].label}{!disp[t] && " — em breve"}
            </Button>
          ))}
        </div>
        {isAdmin && (
          <div className="space-y-2 rounded border border-dashed p-3">
            <p className="font-semibold">Só para a conta master: publicar arquivos</p>
            {(Object.keys(ARQ) as Tipo[]).map((t) => (
              <label key={t} className="flex items-center gap-2">
                <span className="w-44">{ARQ[t].label}</span>
                <input type="file" accept={ARQ[t].accept} onChange={(e) => enviar(t, e.target.files?.[0])} />
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4 rounded-lg border p-4 text-sm">
        <h2 className="text-lg font-semibold">🚀 Guia de Instalação e Ativação — WinOrWin</h2>
        <blockquote className="border-l-4 pl-3 text-muted-foreground">
          <p><b>Aviso importante:</b> A extensão WinOrWin roda 100% nativa dentro do Google Chrome. Você NÃO precisa instalar Python, Node, abrir o prompt de comando (CMD) ou fazer configurações avançadas no seu computador. Todo o processo leva menos de 2 minutos.</p>
        </blockquote>

        <h3 className="font-semibold">📋 O que você precisa antes de começar:</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Ter uma conta aprovada na plataforma WinOrWin;</li>
          <li>Ter o navegador Google Chrome instalado;</li>
          <li>Baixar o arquivo da extensão (<code>WinOrWin_Extensao.zip</code>);</li>
          <li>Ter o MetaTrader 5 aberto no seu computador.</li>
        </ol>

        <h3 className="text-base font-semibold">📌 PARTE 1: Instalando a Extensão no Chrome</h3>
        <h4 className="font-semibold">Passo 1: Extrair os arquivos</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Localize o arquivo <code>WinOrWin_Extensao.zip</code> que você baixou.</li>
          <li>Clique com o botão direito nele e escolha Extrair Tudo... (ou use o WinRAR/7-Zip).</li>
          <li>Salve em um local definitivo do seu computador (ex: na pasta Documentos ou Área de Trabalho).</li>
        </ol>
        <blockquote className="border-l-4 pl-3 text-muted-foreground">⚠️ Atenção: Mantenha essa pasta no computador e não a apague após a instalação.</blockquote>

        <h4 className="font-semibold">Passo 2: Carregar no Google Chrome</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra o Google Chrome.</li>
          <li>Na barra de endereços, digite <code>chrome://extensions/</code> (e aperte Enter).</li>
          <li>No canto superior direito da tela, ative a chave: Modo do desenvolvedor.</li>
          <li>No canto superior esquerdo, clique no botão: Carregar sem compactação.</li>
          <li>Selecione a pasta descompactada da extensão (onde estão os arquivos <code>manifest.json</code>, <code>content.js</code>, etc.) e clique em Selecionar pasta.</li>
          <li>Pronto! A extensão WinOrWin Tradovate Bridge aparecerá na sua lista.</li>
        </ol>

        <h4 className="font-semibold">Passo 3: Fixar o ícone no navegador</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No canto superior direito do Chrome, clique no ícone de Quebra-cabeça (Extensões).</li>
          <li>Localize a WinOrWin Tradovate Bridge e clique no ícone de Alfinete (Fixar) para deixá-la sempre visível na barra do navegador.</li>
        </ol>

        <h4 className="font-semibold">Passo 4: Conectar sua Conta</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Acesse sua conta na plataforma WinOrWin e vá no menu Integração.</li>
          <li>Copie a sua Chave de Integração Pessoal (Token).</li>
          <li>Clique no ícone da extensão no topo do Chrome.</li>
          <li>Preencha os campos:
            <ul className="list-disc space-y-1 pl-5">
              <li>URL da Plataforma: <code>https://win-or-win.lovable.app</code></li>
              <li>Chave de Integração: Cole a sua chave copiada.</li>
            </ul>
          </li>
          <li>Clique em Salvar Configurações.</li>
          <li>Ao abrir a plataforma Tradovate no Chrome, você verá no topo direito da tela o selo verde:<br />🟢 WinOrWin: Conectado e Pronto.</li>
        </ol>

        <h3 className="text-base font-semibold">📌 PARTE 2: Configurando o Robô no MetaTrader 5</h3>
        <h4 className="font-semibold">Passo 1: Permitir a conexão no MT5 (Apenas uma vez)</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No MetaTrader 5, clique no menu superior em Ferramentas &gt; Opções (ou aperte <code>Ctrl + O</code>).</li>
          <li>Vá até a aba Expert Advisors.</li>
          <li>Marque a caixinha: Permitir WebRequest para as URLs listadas.</li>
          <li>Clique no botão de adicionar (+ ou duplo clique) e insira exatamente o endereço: <code>https://win-or-win.lovable.app</code></li>
          <li>Clique em OK.</li>
        </ol>

        <h4 className="font-semibold">Passo 2: Inserir o Robô no Gráfico</h4>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra o gráfico do ativo correspondente na sua corretora (ex: <code>GOLD</code> ou <code>US100Cash</code>).</li>
          <li>No menu do MT5, arraste o Expert Advisor WinOrWin_Hedge para dentro do gráfico.</li>
          <li>Na aba Comum:
            <ul className="list-disc space-y-1 pl-5"><li>Marque a caixinha: Permitir Algo Trading (Negociação Automatizada).</li></ul>
          </li>
          <li>Na aba Parâmetros de Entrada (Inputs):
            <ul className="list-disc space-y-1 pl-5">
              <li>URL do Site: <code>https://win-or-win.lovable.app</code></li>
              <li>Chave de Integração: Cole a mesma chave pessoal da plataforma.</li>
              <li>Mapa de Ativos: Verifique o nome exato dos ativos na sua corretora (ex: <code>MNQ=US100Cash;MGC=GOLD</code>).</li>
              <li>Magic Number: Deixe <code>0</code> (o robô gera um número exclusivo automático para a sua conta).</li>
            </ul>
          </li>
          <li>Clique em OK.</li>
          <li>No topo do MetaTrader 5, certifique-se de que o botão Algo Trading está verde (ativado).</li>
        </ol>

        <h3 className="text-base font-semibold">✅ Como Funciona no Dia a Dia</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Quando você der um clique de Compra na Tradovate, o robô entra Vendido no MT5.</li>
          <li>Quando você der um clique de Venda na Tradovate, o robô entra Comprado no MT5.</li>
          <li>Se você apertar o botão de Fechar/Zerar na Tradovate ou atingir alvo/stop, o robô encerra a ordem no MT5 na hora.</li>
          <li>A velocidade de comunicação é de milissegundos, com auditoria direta no seu painel.</li>
        </ul>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">4. Fila de ordens</h2>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ordem recebida ainda.</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground"><th>Hora</th><th>Ativo</th><th>Mesa</th><th>CFD</th><th>Qtd</th><th>Situação</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td>{new Date(r.created_at).toLocaleTimeString("pt-BR")}</td><td>{r.symbol}</td>
                <td>{r.side === "buy" ? "Compra" : "Venda"}</td><td>{r.mirror_side === "buy" ? "Compra" : "Venda"}</td>
                <td>{r.qty}</td><td title={r.error ?? ""}>{STATUS[r.status] ?? r.status}</td>
              </tr>))}</tbody>
          </table>
        )}
      </section>
    </div>
  );
}
