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
          <h3 className="font-semibold">Preparar a extensão no computador (Windows)</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o pacote da extensão e extraia o arquivo .zip para uma pasta no computador. Nos arquivos de exemplo, a pasta extraída contém <code>extensao_tradovate</code> e o arquivo <code>gerar_extensao</code>.</li>
            <li>Instale o <b>Python 3</b> pelo site oficial <a className="underline" href="https://www.python.org/downloads/windows/" target="_blank" rel="noreferrer">python.org/downloads/windows</a>.</li>
            <li>Durante a instalação do Python, marque <b>Add Python to PATH</b> (Adicionar Python ao PATH), se essa opção aparecer, e conclua a instalação.</li>
            <li>Execute o arquivo <code>gerar_extensao</code> fornecido no pacote, se ele for o script de geração incluído. Aguarde terminar e confira a pasta <code>extensao_tradovate</code>. Ela deve conter o <code>manifest.json</code> e os arquivos da extensão, como <code>background</code>, <code>content</code> e <code>popup</code>. Se a pasta já vier pronta e não houver instrução para executar o script, não precisa gerá-la novamente.</li>
          </ol>
          <h3 className="mt-3 font-semibold">Carregar a extensão no Chrome</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>No Chrome, abra o menu de três pontos (⋮), no canto superior direito.</li>
            <li>Entre em <b>Extensões → Gerenciar extensões</b>. Você também pode clicar no ícone de quebra-cabeça ao lado da barra de endereços e escolher <b>Gerenciar extensões</b>. Se o quebra-cabeça não aparecer, use o menu de três pontos.</li>
            <li>Na página de extensões, ligue <b>Modo do desenvolvedor</b>, no canto superior direito.</li>
            <li>Clique em <b>Carregar sem compactação</b>. Antes, extraia o arquivo .zip baixado para uma pasta no computador. Na janela que abrir, selecione a <b>pasta extraída</b> da extensão — não selecione o arquivo .zip — e confirme.</li>
            <li>Depois que a extensão aparecer na lista, abra-a pelo ícone de quebra-cabeça. No campo <b>URL da Plataforma</b>, informe exatamente <code>https://win-win-start-kit.lovable.app</code>. No campo <b>Chave de Integração</b>, cole a chave gerada na seção “Sua chave” desta página e salve.</li>
            <li>Abra a Tradovate na mesma janela do Chrome e confirme que a extensão está ativa.</li>
            <li>Com o robô já configurado no MetaTrader 5 e a extensão salva com a mesma chave, clique no botão <b>Testar envio da ordem</b> da extensão. Verifique se o teste chega ao MetaTrader e se a comunicação está funcionando antes de operar em conta real. Se falhar, confira a chave, o endereço do servidor configurado e se o robô está aberto e conectado.</li>
          </ol>
        </div>
        <div>
          <h3 className="font-semibold">Robô MetaTrader 5</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o robô acima (arquivo .ex5).</li>
            <li>No MT5: <b>Arquivo → Abrir pasta de dados</b> → entre em <code>MQL5\Experts</code> e cole o arquivo.</li>
            <li>No MT5, clique com o botão direito em <b>Expert Advisors</b> no Navegador e escolha <b>Atualizar</b>.</li>
            <li>Abra <b>Ferramentas → Opções → Expert Advisors</b>, marque <b>Permitir WebRequest para os endereços listados abaixo</b> e adicione a URL completa da plataforma: <code>{base}</code>. Confirme/adote a alteração.</li>
            <li>Arraste o robô para o gráfico do ativo (ex.: US100Cash ou GOLD). Na janela de parâmetros do robô, preencha <b>Chave</b> com a mesma chave da extensão e preencha <b>SiteUrl</b> com <code>{base}</code>. Não deixe o SiteUrl vazio. Use a URL do site em que você realmente acessa a plataforma; se o domínio mudar, atualize os dois lugares.</li>
            <li>Ligue o botão <b>Algo Trading</b> no topo do MT5. Teste primeiro em conta demo.</li>
          </ol>
        </div>
        <div className="space-y-2 rounded-md bg-muted/50 p-3">
          <p className="font-semibold">Importante sobre o Python</p>
          <p>Para este pacote, instale o Python porque os arquivos fornecidos incluem o gerador <code>gerar_extensao</code>. O Python é usado para preparar a extensão; não precisa ficar aberto durante o uso normal dela no Chrome. Depois de preparada, carregue a pasta que contém o <code>manifest.json</code>. Se o gerador apresentar erro, anote ou tire uma captura da mensagem para identificar a correção necessária.</p>
        </div>
        <p className="text-muted-foreground">O robô sempre recebe a direção contrária à da mesa. Se você gerar uma chave nova, troque nos dois lugares. Teste primeiro em conta demo.</p>
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
