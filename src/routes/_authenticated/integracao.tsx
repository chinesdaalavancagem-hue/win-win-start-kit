import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { VpsObservationKeyPanel } from "@/components/platform/VpsObservationKeyPanel";
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
  ext: { path: "extensao/WinOrWin_Extensao.zip", nome: "WinOrWin_Extensao.zip", accept: ".zip", label: "Robô de Python (.zip)" },
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
  const [disp, setDisp] = useState<Record<Tipo, boolean>>({ ext: false, parametros: false });
  const [base, setBase] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const telegramChatIdAlterado = useRef(false);
  const [telegramTestando, setTelegramTestando] = useState(false);
  const [backupTelegramTestando, setBackupTelegramTestando] = useState(false);
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
    const [e, p] = await Promise.all([supabase.storage.from("downloads").list("extensao"), supabase.storage.from("downloads").list("parametros")]);
    setDisp({
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

  async function testarCanalBackup() {
    setBackupTelegramTestando(true);
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data.session?.access_token) throw new Error("Faça login novamente.");
      const response = await fetch("/api/backup-telegram-teste", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.error === "backup_telegram_not_configured"
          ? "Confira os dois Secrets BACKUP_TELEGRAM no Lovable Cloud."
          : response.status === 429
            ? "Aguarde 10 minutos para testar novamente."
            : "O Telegram não confirmou o envio ao canal privado.");
      }
      alert("Teste enviado! Confira a mensagem no canal privado de backup.");
    } catch (error) {
      alert(error instanceof Error ? error.message : "Não foi possível testar o canal.");
    } finally {
      setBackupTelegramTestando(false);
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

      <VpsObservationKeyPanel />

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 text-sm shadow-sm transition-colors hover:border-cyan-900/50 md:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-lg font-bold text-cyan-300">02</span><div><h2 className="font-semibold text-base">Arquivos e downloads</h2><p className="mt-1 text-xs text-muted-foreground">Baixe os componentes necessários para configurar a integração.</p></div></div>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(ARQ) as Tipo[]).map((t) => (
            <Button key={t} size="sm" disabled={!disp[t]} onClick={() => baixar(t)}>
              {t === "ext" ? "Baixar Robô de Python" : `Baixar ${ARQ[t].label}`}{!disp[t] && " — em breve"}
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
        {isAdmin && (
          <div className="mt-4 space-y-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
            <p className="font-semibold">Canal privado de backup (Master)</p>
            <p className="text-xs text-muted-foreground">Teste apenas a conexão do bot com o canal privado. Não envia bancas, histórico, usuários nem arquivos.</p>
            <Button size="sm" variant="outline" onClick={testarCanalBackup} disabled={backupTelegramTestando}>
              {backupTelegramTestando ? "Enviando teste..." : "Testar canal de backup"}
            </Button>
          </div>
        )}
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

      <section className="space-y-4 rounded-2xl border border-border/80 bg-card p-5 text-sm shadow-sm transition-colors hover:border-emerald-900/50 md:p-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-lg font-bold text-emerald-300">05</span><div><h2 className="text-lg font-semibold">Guia de instalação e ativação</h2><p className="mt-1 text-xs text-muted-foreground">Configure o robô Win or Win com Python, a extensão do Chrome e o MetaTrader 5.</p></div></div>

        <p>🚀 Este guia ensina a configurar a automação do Win or Win no seu computador. O sistema conecta a sua plataforma de operações (Tradovate / TopstepX) diretamente ao seu MetaTrader 5, abrindo automaticamente a ponta contrária (hedge) com o lote exato calculado para o dia na plataforma.</p>

        <h3 className="text-base font-semibold">📋 Pré-requisitos</h3>
        <p>Antes de começar, certifique-se de ter instalado no seu computador:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Google Chrome (onde você acessa a plataforma e opera a mesa).</li>
          <li>MetaTrader 5 da sua corretora CFD/Forex (ex.: FortMarkets).</li>
          <li>Python 3.10 ou superior. Baixe no site oficial: <a className="underline" href="https://www.python.org/downloads/" target="_blank" rel="noreferrer">python.org/downloads</a>.</li>
        </ol>
        <blockquote className="border-l-4 pl-3 text-muted-foreground">⚠️ Muito importante na instalação do Python: logo na primeira tela do instalador, marque a caixinha <code>Add python.exe to PATH</code> antes de clicar em Install Now.</blockquote>

        <h3 className="text-base font-semibold">Passo 1: Instalar as bibliotecas necessárias</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>No teclado, pressione <code>Windows + R</code>.</li>
          <li>Digite <code>cmd</code> e aperte Enter para abrir o Prompt de Comando.</li>
          <li>Copie o comando abaixo, cole na janela preta e aperte Enter:</li>
        </ol>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>pip install MetaTrader5 flask flask-cors requests</code></pre>
        <p>Aguarde até aparecer a mensagem de conclusão com sucesso. Pode fechar essa janela.</p>

        <h3 className="text-base font-semibold">Passo 2: Configurar o seu MetaTrader 5</h3>
        <p>Para que o robô tenha permissão de enviar ordens:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra o MetaTrader 5 e conecte-se à sua conta (demo ou real).</li>
          <li>No menu superior, clique em Ferramentas → Opções (ou aperte <code>Ctrl + O</code>).</li>
          <li>Clique na aba Expert Advisors e marque: <strong>Permitir algotrading</strong> e <strong>Permitir importação de DLL</strong>.</li>
          <li>Clique em OK.</li>
          <li>No topo do MetaTrader, certifique-se de que o botão Algo Trading esteja verde (ativado).</li>
        </ol>

        <h3 className="text-base font-semibold">Passo 3: Colocar a sua conta no Robô</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Extraia os arquivos do robô fornecidos pela plataforma para uma pasta do computador (recomendado: Documentos).</li>
          <li>Abra o arquivo <code>executor_mt5.py</code> com o Bloco de Notas (clique com o botão direito → Abrir com → Bloco de Notas).</li>
          <li>Localize as primeiras linhas com a lista de contas:</li>
        </ol>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{'CONTAS_PERMITIDAS = [\n    SEU_NUMERO_DE_CONTA,  # Substitua pelo número do seu login no MT5\n]'}</code></pre>
        <p>Troque <code>SEU_NUMERO_DE_CONTA</code> pelo número do seu login no MetaTrader 5 (o número que aparece no topo da barra de título do MT5) e salve o arquivo com <code>Ctrl + S</code>.</p>
        <blockquote className="border-l-4 pl-3 text-muted-foreground">🔒 Essa trava garante que o robô só opere na sua conta autorizada, impedindo operações em contas erradas.</blockquote>

        <h3 className="text-base font-semibold">Passo 4: Instalar a Extensão no Google Chrome</h3>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Descompacte a pasta da Extensão Win or Win em um local seguro do computador.</li>
          <li>Abra o Google Chrome e digite na barra de endereços <code>chrome://extensions</code>.</li>
          <li>No canto superior direito, ative a chave Modo do desenvolvedor.</li>
          <li>No canto superior esquerdo, clique em Carregar sem compactação.</li>
          <li>Selecione a pasta descompactada da extensão.</li>
          <li>Clique no ícone de quebra-cabeça (extensões) no topo do Chrome e fixe o ícone do Win or Win na barra de ferramentas.</li>
        </ol>

        <h3 className="text-base font-semibold">🎯 Rotina Operacional do Dia a Dia (4 passos simples)</h3>
        <p>Toda vez que for operar, siga esta sequência:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra o MetaTrader 5 na sua conta e verifique se o botão Algo Trading está verde.</li>
          <li>Abra a Plataforma Win or Win no Chrome e clique na aba do ativo que vai operar (Gold ou Nasdaq), deixando o card do dia visível.</li>
          <li>Dê dois cliques no arquivo <code>LIGAR_ROBO.bat</code>. Uma tela preta se abrirá confirmando a conexão com a conta do MT5 e exibindo a mensagem abaixo. Deixe essa janela minimizada enquanto opera:</li>
        </ol>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>* Running on http://127.0.0.1:5000</code></pre>
        <ol start={4} className="list-decimal space-y-1 pl-5">
          <li>Opere normalmente na Tradovate / TopstepX. Ao abrir ou zerar uma posição na mesa proprietária, o robô executará o hedge inverso no MetaTrader 5 com o lote exato do dia indicado na plataforma.</li>
        </ol>

        <h3 className="text-base font-semibold">🔍 Como Fazer um Teste Rápido</h3>
        <p>Antes de enviar ordens reais, faça um teste no navegador:</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Abra a extensão no Chrome clicando no ícone do Win or Win.</li>
          <li>Verifique se o lote do dia está verde: <strong>🟢 Gold (GOLD): Dia X · 0.XX lotes</strong>.</li>
          <li>Clique em <strong>Teste Gold (MGC)</strong> ou <strong>Teste Nasdaq (MNQ)</strong>.</li>
          <li>Confira na tela preta do robô a confirmação do recebimento do pacote com o lote do card e o envio da ordem de teste ao MetaTrader.</li>
        </ol>

        <h3 className="text-base font-semibold">⚠️ Dúvidas Frequentes &amp; Resolução de Problemas</h3>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>A extensão mostra “Card ainda não lido”:</strong> dê F5 na aba da plataforma Win or Win com a aba do ativo (Gold ou Nasdaq) aberta e reabra o ícone da extensão.</li>
          <li><strong>O robô avisa “Mercado Fechado” (código 10018):</strong> o mercado de Forex/CFDs fecha nas sextas-feiras à tarde e reabre no domingo à noite. Durante o fim de semana, o robô valida a comunicação, mas o terminal só aceita ordens com o pregão aberto.</li>
          <li><strong>Erro de conexão ao clicar no .bat:</strong> verifique se o Python foi instalado com a opção <code>Add python.exe to PATH</code> marcada e se o MetaTrader 5 está aberto.</li>
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
