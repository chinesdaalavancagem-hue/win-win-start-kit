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
          <h3 className="font-semibold">Extensão do Chrome</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe a extensão acima e descompacte o arquivo .zip numa pasta.</li>
            <li>No Chrome, abra <code>chrome://extensions</code>.</li>
            <li>Ligue o <b>Modo do desenvolvedor</b> (canto superior direito).</li>
            <li>Clique em <b>Carregar sem compactação</b> e escolha a pasta descompactada.</li>
            <li>Abra a extensão, cole a sua chave e salve.</li>
            <li>Abra a Tradovate na mesma janela do Chrome.</li>
          </ol>
        </div>
        <div>
          <h3 className="font-semibold">Robô MetaTrader 5</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Baixe o robô acima (arquivo .ex5).</li>
            <li>No MT5: <b>Arquivo → Abrir pasta de dados</b> → entre em <code>MQL5\Experts</code> e cole o arquivo.</li>
            <li>No MT5, clique com o botão direito em <b>Expert Advisors</b> no Navegador e escolha <b>Atualizar</b>.</li>
            <li><b>Ferramentas → Opções → Expert Advisors</b>: marque <b>Permitir WebRequest</b> e adicione <code>{base}</code>.</li>
            <li>Arraste o robô para o gráfico do ativo (ex.: US100Cash ou GOLD), cole a sua chave no campo <b>Chave</b> e confira o <b>SiteUrl</b> = <code>{base}</code>.</li>
            <li>Ligue o botão <b>Algo Trading</b> no topo do MT5. Teste primeiro em conta demo.</li>
          </ol>
        </div>
        <p className="text-muted-foreground">O robô sempre recebe a direção contrária à da mesa. Se você gerar uma chave nova, troque nos dois lugares.</p>
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
