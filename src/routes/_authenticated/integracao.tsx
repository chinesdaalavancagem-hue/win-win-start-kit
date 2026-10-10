import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { gerarChave } from "@/lib/integracao.functions";

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
    setBase(window.location.origin);
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => setIsAdmin(!!data?.some((r) => r.role === "admin")));
    load(); loadArquivos();
    const i = setInterval(load, 10000); return () => clearInterval(i);
  }, [user.id]);

  async function novaChave() {
    if (temChave && !confirm("A chave atual vai parar de funcionar. Continuar?")) return;
    const r = await gerar();
    setChave(r.token);
    setTemChave(true);
  }
  async function baixar(t: Tipo) {
    const { data, error } = await supabase.storage.from("downloads").createSignedUrl(ARQ[t].path, 60, { download: ARQ[t].nome });
    if (error || !data) return alert("Arquivo ainda não disponível.");
    window.location.href = data.signedUrl;
  }
  async function enviar(t: Tipo, f?: File) {
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(ARQ[t].accept)) return alert(`Envie um arquivo ${ARQ[t].accept}`);
    const { error } = await supabase.storage.from("downloads").upload(ARQ[t].path, f, { upsert: true });
    if (error) return alert("Falha ao enviar o arquivo.");
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

      <section className="space-y-3 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">3. Guia de instalação</h2>
        <div>
          <h3 className="font-semibold">Passo 1 — Instalar o Python no Windows</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Acesse <a className="underline" href="https://www.python.org/downloads/windows/" target="_blank" rel="noreferrer">python.org/downloads/windows</a> e baixe uma versão atual do Python 3.</li>
            <li>Abra o instalador. Na primeira tela, marque <b>Add python.exe to PATH</b> (ou <b>Add Python to PATH</b>) e clique em <b>Install Now</b>. Aguarde terminar e clique em <b>Close</b>.</li>
          </ol>
          <h3 className="mt-3 font-semibold">Passo 2 — Conferir o Python pelo CMD</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Pressione <b>Windows + R</b>, digite <code>cmd</code> e aperte Enter.</li>
            <li>Digite <code>python --version</code> e aperte Enter. Deve aparecer a versão instalada do Python.</li>
            <li>Digite <code>pip --version</code> e aperte Enter para conferir o gerenciador de pacotes. Se o comando <code>python</code> não for reconhecido, feche e reabra o CMD; se continuar, corrija a instalação e a opção PATH.</li>
          </ol>
          <h3 className="mt-3 font-semibold">Passo 3 — Preparar os arquivos da extensão</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o arquivo ZIP da extensão e clique em <b>Extrair tudo</b>. Guarde a pasta extraída em um local permanente do computador.</li>
            <li>Se o pacote incluir o arquivo <code>gerar_extensao.py</code>, abra o CMD e entre na pasta onde esse arquivo está. Digite <code>cd </code> seguido do caminho da pasta entre aspas, por exemplo <code>cd "C:\Integracao"</code>, e aperte Enter.</li>
            <li>Execute <code>python gerar_extensao.py</code> e aguarde terminar. Se o arquivo gerador tiver outro nome, use o nome exato que veio no pacote. Não execute este comando se o pacote já trouxer a pasta da extensão pronta e não incluir um gerador.</li>
            <li>Localize a pasta gerada que contém o arquivo <code>manifest.json</code>. Não é necessário instalar bibliotecas extras nem manter o CMD aberto durante o uso normal da extensão, a menos que o pacote forneça instruções específicas diferentes.</li>
          </ol>
          <h3 className="mt-3 font-semibold">Passo 4 — Instalar a extensão no Google Chrome</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Abra o Chrome e digite <code>chrome://extensions/</code> na barra de endereços.</li>
            <li>Ative o <b>Modo do desenvolvedor</b>, no canto superior direito.</li>
            <li>Clique em <b>Carregar sem compactação</b> e selecione a pasta extraída ou gerada que contém o <code>manifest.json</code>. Selecione a pasta, não o arquivo ZIP.</li>
            <li>Para facilitar o acesso, clique no ícone de quebra-cabeça do Chrome e, se desejar, fixe a extensão na barra.</li>
          </ol>
          <h3 className="mt-3 font-semibold">Passo 5 — Conectar a extensão à plataforma</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Nesta página, na seção <b>Sua chave</b>, gere uma chave de integração e guarde-a com segurança.</li>
            <li>Abra a extensão no Chrome. Em <b>URL da Plataforma</b>, informe <code>{base}</code>. Em <b>Chave de Integração</b>, cole a chave gerada nesta página e salve.</li>
            <li>Abra a Tradovate na mesma janela do Chrome e confirme que a extensão está ativa.</li>
          </ol>
        </div>
        <div>
          <h3 className="font-semibold">Passo 6 — Instalar e configurar o robô no MetaTrader 5</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o robô acima (arquivo <code>.ex5</code>).</li>
            <li>No MT5, acesse <b>Arquivo → Abrir pasta de dados</b>, entre em <code>MQL5\Experts</code> e copie o arquivo do robô para essa pasta.</li>
            <li>Volte ao MT5. No painel Navegador, clique com o botão direito em <b>Expert Advisors</b> e escolha <b>Atualizar</b>.</li>
            <li>Abra <b>Ferramentas → Opções → Expert Advisors</b>. Marque <b>Permitir WebRequest para os endereços listados abaixo</b> e adicione a URL da plataforma: <code>{base}</code>. Confirme a alteração.</li>
            <li>Arraste o robô para o gráfico do ativo. Nos parâmetros, informe a mesma chave usada na extensão e preencha <b>SiteUrl</b> com <code>{base}</code>. A URL precisa corresponder ao site em que você acessa a plataforma.</li>
            <li>Ative <b>Algo Trading</b> no MT5. Faça o primeiro teste em uma conta demo.</li>
          </ol>
        </div>
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <p className="font-semibold">Passo 7 — Testar a comunicação</p>
          <p>Com a extensão configurada e o robô ativo no MT5, clique em <b>Testar envio da ordem</b> na extensão. Depois, confira diretamente no MetaTrader 5 se a ordem de teste foi recebida e executada. O clique no botão, sozinho, não confirma a execução. A tabela desta página também pode ajudar a acompanhar a chegada da ordem à plataforma.</p>
          <p>Se o teste falhar, confira se a chave é a mesma nos dois lugares, se a URL está correta na extensão, em <b>WebRequest</b> e no parâmetro <b>SiteUrl</b>, e se o robô está ativo e conectado. Não opere em conta real antes de validar o funcionamento em demo.</p>
        </div>
        <p className="text-muted-foreground">O robô espelha a direção contrária à da mesa. Se gerar uma nova chave, atualize-a tanto na extensão quanto nos parâmetros do robô.</p>
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
