import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { gerarChave } from "@/lib/integracao.functions";
import { salvarChatId } from "@/lib/telegram.functions";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { VAPID_PUBLIC_KEY } from "@/lib/push-public-key";
import { enviarPushTeste, salvarInscricaoPush } from "@/lib/push.functions";

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
  parametros: { path: "parametros/WinOrWin_Parametros.json", nome: "WinOrWin_Parametros.json", accept: ".json", label: "Parâmetros oficiais (.json)" },
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
  const salvarChat = useServerFn(salvarChatId);
  const salvarPush = useServerFn(salvarInscricaoPush);
  const testarPush = useServerFn(enviarPushTeste);
  const [temChave, setTemChave] = useState<boolean | null>(null);
  const [chave, setChave] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [disp, setDisp] = useState<Record<Tipo, boolean>>({ robo: false, ext: false, parametros: false });
  const [base, setBase] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const telegramChatIdAlterado = useRef(false);
  const [telegramTestando, setTelegramTestando] = useState(false);
  const [telegramSalvando, setTelegramSalvando] = useState(false);
  const [pushAtivando, setPushAtivando] = useState(false);
  const [pushTestando, setPushTestando] = useState(false);

  async function load() {
    const [{ data: t }, { data: o }, { data: p }] = await Promise.all([
      supabase.from("integration_tokens").select("created_at").maybeSingle(),
      supabase.from("order_queue").select("id,symbol,side,mirror_side,qty,status,error,created_at").order("created_at", { ascending: false }).limit(50),
      supabase.from("profiles").select("telegram_chat_id").eq("id", user.id).maybeSingle(),
    ]);
    setTemChave(!!t);
    setRows((o as Row[]) ?? []);
    if (!telegramChatIdAlterado.current) setTelegramChatId(p?.telegram_chat_id ?? "");
  }
  async function loadArquivos() {
    const [r, e, p] = await Promise.all([supabase.storage.from("downloads").list("robo"), supabase.storage.from("downloads").list("extensao"), supabase.storage.from("downloads").list("parametros")]);
    setDisp({
      robo: !!r.data?.some((f) => f.name === ARQ.robo.nome),
      ext: !!e.data?.some((f) => f.name === ARQ.ext.nome),
      parametros: !!p.data?.some((f) => f.name === ARQ.parametros.nome),
    });
  }
  useEffect(() => {
    void registrarAuditoria({ category: "navigation", action: "navigation.opened", outcome: "success", details: { page: "integration" } });
    setBase(window.location.origin);
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => setIsAdmin(!!data?.some((r) => r.role === "admin")));
    load(); loadArquivos();
    const i = setInterval(load, 10000); return () => clearInterval(i);
  }, [user.id]);

  async function testarTelegram() {
    setTelegramTestando(true);
    try {
      const response = await fetch("/api/telegram-teste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: telegramChatId.trim() || undefined,
        }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error || "Falha ao enviar o teste.");
      alert("Solicitação de teste enviada. Confira o Telegram.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível testar o Telegram.");
    } finally {
      setTelegramTestando(false);
    }
  }

  async function salvarChatTelegram() {
    const chatId = telegramChatId.trim();
    if (!/^-?\d{3,20}$/.test(chatId)) return alert("Informe um Chat ID numérico válido (ex.: 123456789).");
    setTelegramSalvando(true);
    try {
      await salvarChat({ data: { chatId } });
      telegramChatIdAlterado.current = false;
      alert("Chat ID salvo! A partir de agora suas notificações chegam no seu Telegram.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível salvar o Chat ID.");
    } finally {
      setTelegramSalvando(false);
    }
  }

  async function ativarPush() {
    setPushAtivando(true);
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        throw new Error("Este navegador não oferece suporte a notificações push.");
      }
      if (!VAPID_PUBLIC_KEY) {
        throw new Error("As notificações ainda não foram configuradas no servidor.");
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        throw new Error("Permissão de notificações não concedida. Verifique as configurações do navegador.");
      }
      const registration = await navigator.serviceWorker.ready;
      const applicationServerKey = Uint8Array.from(
        atob(VAPID_PUBLIC_KEY.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)),
        (character) => character.charCodeAt(0),
      );
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      });
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
        throw new Error("O navegador não forneceu uma inscrição push válida.");
      }
      await salvarPush({
        data: {
          endpoint: serialized.endpoint,
          keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
        },
      });
      alert("Notificações ativadas neste aparelho!");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível ativar as notificações.");
    } finally {
      setPushAtivando(false);
    }
  }

  async function testarNotificacaoPush() {
    setPushTestando(true);
    try {
      await testarPush();
      alert("Teste solicitado. Se este aparelho estiver inscrito e as chaves VAPID estiverem configuradas, a notificação chegará em instantes.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível solicitar a notificação de teste.");
    } finally {
      setPushTestando(false);
    }
  }

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
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div className="relative overflow-hidden rounded-2xl border border-cyan-900/70 bg-gradient-to-br from-[#071a2d] via-[#0b1224] to-[#111827] p-5 shadow-lg shadow-cyan-950/20 md:p-7">
        <div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Central de conexões</p><h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Integração Tradovate <span className="text-cyan-300">→</span> MT5</h1><p className="mt-2 max-w-2xl text-sm text-slate-300">Gerencie sua chave, downloads, alertas e acompanhe as ordens enviadas ao robô.</p></div>
          <Button asChild size="sm" variant="outline" className="border-slate-600 bg-white/5 text-white hover:bg-white/10"><Link to="/plataforma">← Voltar à plataforma</Link></Button>
        </div>
      </div>

      <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition-colors hover:border-cyan-900/50 md:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-lg font-bold text-cyan-300">01</span><div><h2 className="font-semibold text-base">Sua chave de integração</h2><p className="mt-1 text-xs text-muted-foreground">Acesso seguro entre sua conta, a extensão e o robô.</p></div></div>
        <p className="text-sm text-muted-foreground">A chave liga a extensão e o robô do MT5 à sua conta. Ela aparece só uma vez; guarde num lugar seguro.</p>
        {chave && <code className="block break-all rounded bg-muted p-2 text-sm">{chave}</code>}
        <Button size="sm" onClick={novaChave}>{temChave ? "Gerar nova chave" : "Gerar chave"}</Button>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 text-sm shadow-sm transition-colors hover:border-cyan-900/50 md:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-lg font-bold text-cyan-300">02</span><div><h2 className="font-semibold text-base">Arquivos e downloads</h2><p className="mt-1 text-xs text-muted-foreground">Baixe os componentes necessários para configurar a integração.</p></div></div>
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
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-lg font-bold text-sky-300">03</span><div><h2 className="font-semibold text-base">Notificações no Telegram</h2><p className="mt-1 text-xs text-muted-foreground">Alertas de ordens enviados diretamente ao seu chat.</p></div></div>
        <p className="text-muted-foreground">Receba alertas quando uma ordem chegar da Tradovate e quando o MT5 confirmar a execução. O bot já está configurado na plataforma; você só precisa do seu Chat ID. Para descobri-lo, converse com <a className="underline" href="https://t.me/userinfobot" target="_blank" rel="noreferrer">@userinfobot</a>. Importante: abra uma conversa com o bot <a className="underline" href="https://t.me/Win_or_Win_bot" target="_blank" rel="noreferrer">@Win_or_Win_bot</a> e envie <code>/start</code> — o Telegram só entrega mensagens a quem já iniciou a conversa.</p>
        <label className="block space-y-1">
          <span>Seu Chat ID do Telegram</span>
          <input className="w-full rounded-md border bg-background px-3 py-2" value={telegramChatId} onChange={(e) => { telegramChatIdAlterado.current = true; setTelegramChatId(e.target.value); }} placeholder="Ex.: 123456789" />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={salvarChatTelegram} disabled={telegramSalvando}>{telegramSalvando ? "Salvando..." : "Salvar Chat ID"}</Button>
          <Button size="sm" variant="outline" onClick={testarTelegram} disabled={telegramTestando}>{telegramTestando ? "Testando..." : "Testar Notificação"}</Button>
        </div>
        <p className="text-xs text-muted-foreground">O Chat ID salvo fica ligado à sua conta: as notificações das suas ordens chegam no seu Telegram. Se deixar em branco, os alertas seguem para o Chat ID monitorado pela master.</p>
      </section>

      <section className="space-y-3 rounded-lg border p-4 text-sm">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-lg font-bold text-violet-300">04</span><div><h2 className="font-semibold text-base">Notificações neste dispositivo</h2><p className="mt-1 text-xs text-muted-foreground">Ative o PWA Push para receber alertas mesmo fora da plataforma.</p></div></div>
        <p className="text-muted-foreground">Receba alertas neste aparelho quando uma ordem for recebida e quando o MetaTrader 5 confirmar a execução ou informar uma falha. Os alertas do Telegram continuam funcionando em paralelo.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={ativarPush} disabled={pushAtivando}>
            {pushAtivando ? "Ativando..." : "Ativar Notificações no Aparelho"}
          </Button>
          <Button size="sm" variant="outline" onClick={testarNotificacaoPush} disabled={pushTestando}>
            {pushTestando ? "Enviando..." : "Enviar Notificação de Teste"}
          </Button>
        </div>
        <div className="rounded-md border border-dashed p-3 text-muted-foreground">
          <p className="font-medium text-foreground">iPhone / iPad</p>
          <p>No iOS 16.4 ou superior, abra esta plataforma no Safari, use Compartilhar → Adicionar à Tela de Início e abra pelo ícone instalado. Depois, toque em ativar notificações e aceite a permissão. No Android, use um navegador compatível e permita as notificações.</p>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 text-sm shadow-sm transition-colors hover:border-cyan-900/50 md:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-lg font-bold text-emerald-300">05</span><div><h2 className="text-lg font-semibold">Guia de instalação e ativação</h2><p className="mt-1 text-xs text-muted-foreground">Siga as etapas para conectar a extensão do Chrome ao MetaTrader 5.</p></div></div>
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

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-lg font-bold text-amber-300">06</span><div><h2 className="text-base font-semibold">Fila de ordens</h2><p className="mt-1 text-xs text-muted-foreground">Acompanhe o estado mais recente das ordens recebidas.</p></div></div><span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">Atualização automática · 10 s</span></div>
        {rows.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma ordem recebida ainda.</p> : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/50"><tr className="text-left text-muted-foreground"><th className="px-3 py-3">Hora</th><th className="px-3 py-3">Ativo</th><th className="px-3 py-3">Mesa</th><th className="px-3 py-3">CFD</th><th className="px-3 py-3">Qtd</th><th className="px-3 py-3">Situação</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-t transition-colors hover:bg-muted/30">
                  <td className="whitespace-nowrap px-3 py-3">{new Date(r.created_at).toLocaleTimeString("pt-BR")}</td><td className="px-3 py-3 font-medium">{r.symbol}</td>
                  <td className="px-3 py-3">{r.side === "buy" ? "Compra" : "Venda"}</td><td className="px-3 py-3">{r.mirror_side === "buy" ? "Compra" : "Venda"}</td>
                  <td className="px-3 py-3">{r.qty}</td><td className="px-3 py-3" title={r.error ?? ""}><span className="inline-flex rounded-full border px-2 py-1 text-xs">{STATUS[r.status] ?? r.status}</span></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
