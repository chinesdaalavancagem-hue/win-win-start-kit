import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Download, Crown, Cloud, ChevronDown, UserRound, Pencil, Image as ImageIcon, LogOut, Palette, Check } from "lucide-react";
import { getMyAccess, signOut } from "@/lib/session";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { Bancas } from "@/components/platform/Bancas";
import { mensagemErroSalvamento } from "@/lib/platform/save-errors";
import { queueSaveUnlessConflicted, readVersionedAppData, recoverVersionConflict } from "@/lib/platform/versioned-save";

const STORED_GZIP_PREFIX = "WOWGZIP1:";
async function descompactarDocumento(data: string): Promise<string> {
  if (!data.startsWith(STORED_GZIP_PREFIX)) return data;
  if (typeof DecompressionStream === "undefined") throw new Error("decompression_unavailable");
  const binary = atob(data.slice(STORED_GZIP_PREFIX.length));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

async function compactarDocumento(data: string): Promise<{ data: string; encoding?: "gzip-base64" }> {
  // O histórico acumulado pode exceder o limite de 4,5 MB da Vercel.
  if (data.length < 1_000_000) return { data };
  if (typeof CompressionStream === "undefined") throw new Error("compression_unavailable");
  const bytes = new Uint8Array(await new Response(
    new Blob([data]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return { data: btoa(binary), encoding: "gzip-base64" };
}

export const Route = createFileRoute("/_authenticated/plataforma")({
  head: () => ({ meta: [{ title: "Plataforma — Win or Win" }, { name: "description", content: "Sua plataforma Win or Win." }, { property: "og:title", content: "Plataforma — Win or Win" }, { property: "og:description", content: "Planeje contratos, operações, bônus e saques na Win or Win." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Plataforma,
});

function Plataforma() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [state, setState] = useState<"loading" | "pending" | "rejected" | "ok">("loading");
  const [isAdmin, setIsAdmin] = useState(false);
  const [name, setName] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [tema, setTema] = useState<"escuro" | "azul" | "grafite" | "claro">("escuro");
  const [themeOpen, setThemeOpen] = useState(false);
  useEffect(() => {
    const salvo = window.localStorage.getItem(`wow-theme-${user.id}`);
    if (salvo === "escuro" || salvo === "azul" || salvo === "grafite" || salvo === "claro") setTema(salvo);
  }, [user.id]);
  const mudarTema = (novo: typeof tema) => {
    setTema(novo);
    try { window.localStorage.setItem(`wow-theme-${user.id}`, novo); } catch { /* continua nesta sessão */ }
    setThemeOpen(false);
  };
  const [editingNickname, setEditingNickname] = useState(false);
  const [nickname, setNickname] = useState(String(user.user_metadata?.wow_nickname ?? ""));
  const [nicknameDraft, setNicknameDraft] = useState(String(user.user_metadata?.wow_nickname ?? ""));
  const [avatar, setAvatar] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setAvatar(window.localStorage.getItem(`wow-avatar-${user.id}`) ?? ""); } catch { /* armazenamento indisponível */ }
  }, [user.id]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !profileRef.current?.contains(event.target)) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileOpen(false); };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", close); window.removeEventListener("keydown", escape); };
  }, [profileOpen]);

  const saveNickname = async () => {
    const next = nicknameDraft.trim();
    if (!next || next.length > 32) { setProfileMessage("Use um apelido de 1 a 32 caracteres."); return; }
    setProfileBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { wow_nickname: next } });
    if (error) setProfileMessage("Não foi possível salvar o apelido na conta.");
    else { setNickname(next); setProfileMessage("Apelido salvo na conta."); setEditingNickname(false); }
    setProfileBusy(false);
  };
  const chooseAvatar = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 400_000) { setProfileMessage("Escolha uma imagem de até 400 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) return;
      try { window.localStorage.setItem(`wow-avatar-${user.id}`, reader.result); setAvatar(reader.result); setProfileMessage("Foto salva neste navegador."); }
      catch { setProfileMessage("Não foi possível salvar a foto neste navegador."); }
    };
    reader.readAsDataURL(file);
  };
  const [publishBusy, setPublishBusy] = useState(false);
  const [publishMessage, setPublishMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);

  useEffect(() => {
    const standalone = () => window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const installedHere = () => window.localStorage.getItem("wow-pwa-installed") === "1";
    setShowInstall(!standalone() && !installedHere());
    const savedPrompt = (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt;
    if (savedPrompt) setInstallPrompt(savedPrompt);
    const onPrompt = (event: Event) => {
      event.preventDefault();
      (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt = event;
      setInstallPrompt(event);
      if (!standalone() && !installedHere()) setShowInstall(true);
    };
    const onSavedPrompt = () => {
      const saved = (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt;
      if (saved) setInstallPrompt(saved);
    };
    const onInstalled = () => {
      window.localStorage.setItem("wow-pwa-installed", "1");
      setShowInstall(false);
      setInstallHelp(false);
      setInstallPrompt(null);
      delete (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt;
    };
    const onModeChange = () => { if (standalone()) setShowInstall(false); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("wow-pwa-install-ready", onSavedPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const media = window.matchMedia("(display-mode: standalone)");
    media.addEventListener?.("change", onModeChange);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("wow-pwa-install-ready", onSavedPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      media.removeEventListener?.("change", onModeChange);
    };
  }, []);

  const installApp = async () => {
    const prompt = installPrompt as (Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: string }>;
    }) | null;
    if (!prompt?.prompt) { setInstallHelp(true); return; }
    setInstallPrompt(null);
    delete (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt;
    try {
      await prompt.prompt();
    } catch {
      setInstallHelp(true);
      return;
    }
    // Só ocultar após o evento appinstalled: o usuário pode cancelar.
    await prompt.userChoice?.catch(() => undefined);
  };

  const [saveError, setSaveError] = useState("");
  const versionRef = useRef<number | null>(null);
  const conflictRef = useRef(false);

  useEffect(() => {
    void registrarAuditoria({ category: "navigation", action: "navigation.opened", outcome: "success", details: { page: "platform" } });
    getMyAccess(user.id).then(({ profile, isAdmin }) => {
      setIsAdmin(isAdmin);
      setName(profile?.full_name ?? "");
      if (profile?.rejected) return setState("rejected");
      if (!profile?.approved) return setState("pending");
      setState("ok");
    });
  }, [user.id]);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("app_data").select("data,version").eq("user_id", user.id).maybeSingle();
    if (error) throw error;
    const snapshot = readVersionedAppData(data);
    versionRef.current = snapshot.version;
    return snapshot.data ? await descompactarDocumento(snapshot.data) : null;
  }, [user.id]);

  // Todas as gravações locais passam pela mesma fila para preservar a ordem em que foram solicitadas.
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const save = useCallback((v: string) => queueSaveUnlessConflicted(
    saveQueue,
    conflictRef,
    async () => {
      const aguardar = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) { setSaveError(mensagemErroSalvamento(401)); return false; }
        const payload = await compactarDocumento(v);
        // Uma falha transitória de rede/servidor não deve encerrar o autosave no primeiro erro.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          let response: Response;
          const controller = new AbortController();
          const requestTimeout = window.setTimeout(() => controller.abort(), 15_000);
          try {
            response = await fetch("/api/plataforma/dados", {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: "Bearer " + token,
              },
              body: JSON.stringify({ ...payload, expectedVersion: versionRef.current }),
              signal: controller.signal,
            });
          } catch {
            if (attempt === 0) { await aguardar(700); continue; }
            setSaveError(mensagemErroSalvamento(0));
            return false;
          } finally {
            window.clearTimeout(requestTimeout);
          }

          if (response.status === 409) {
            // Se o servidor gravou mas a resposta se perdeu, reconhece o snapshot idêntico
            // em vez de sinalizar erro ou recarregar desnecessariamente.
            const { data: saved, error: readError } = await supabase.from("app_data")
              .select("data,version").eq("user_id", user.id).maybeSingle();
            if (!readError && saved?.data && await descompactarDocumento(saved.data) === v && typeof saved.version === "number") {
              versionRef.current = saved.version;
              setSaveError("");
              return true;
            }
            conflictRef.current = true;
            await recoverVersionConflict(() => window.location.reload());
            return false;
          }

          const result = await response.json().catch(() => null) as { version?: unknown; error?: unknown } | null;
          if (!response.ok) {
            if (attempt === 0 && [429, 500, 502, 503, 504].includes(response.status)) {
              await aguardar(700);
              continue;
            }
            const codigo = typeof result?.error === "string" && /^[a-z_]{1,48}$/.test(result.error) ? result.error : "";
            setSaveError(mensagemErroSalvamento(response.status, codigo) + " (" + [response.status, codigo].filter(Boolean).join(" · ") + ")");
            return false;
          }
          if (typeof result?.version !== "number") {
            setSaveError("O servidor não confirmou a gravação. Tente salvar novamente.");
            return false;
          }
          versionRef.current = result.version;
          setSaveError("");
          return true;
        }
        setSaveError(mensagemErroSalvamento(503, "database_timeout"));
        return false;
      } catch {
        setSaveError(mensagemErroSalvamento(0));
        return false;
      }
    },
    false,
  ), [user.id]);

  const publishOfficial = async () => {
    if (publishBusy || !isAdmin) return;
    const current = (window as Window & { __wowOfficialParams?: () => Promise<boolean> }).__wowOfficialParams;
    if (!current) { setPublishMessage("Aguarde o carregamento da banca."); return; }
    setPublishBusy(true);
    try {
      const ok = await current();
      setPublishMessage(ok ? "Parâmetros enviados aos usuários." : "Publicação cancelada ou não concluída.");
    } catch { setPublishMessage("Falha ao publicar parâmetros."); }
    finally { setPublishBusy(false); }
  };

  return (
    <div className={`wow-theme wow-theme-${tema} flex min-h-screen flex-col bg-[#030914] text-slate-100`}>
      <header className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-b border-cyan-950/80 bg-[#050d1b]/95 px-3 py-3 text-sm shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-md sm:px-5">
        <span className="flex min-w-0 items-center gap-2 text-blue-100/75">
          <span className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/50 bg-emerald-950/20 px-2.5 py-1.5 text-emerald-300"><Cloud className="size-4 shrink-0" aria-hidden="true" /><span className="hidden sm:inline">Nuvem</span><span id="wow-header-sync" className="text-[11px] leading-none" /></span>
          {state === "ok" && showInstall && (
            <Button size="sm" type="button" onClick={() => void installApp()}
              className="h-7 shrink-0 gap-1 rounded-lg border border-amber-300/80 bg-amber-400 px-2 text-[10px] font-bold text-slate-950 hover:bg-amber-300 sm:text-xs">
              <Download className="size-3.5" aria-hidden="true" /><span>Baixar aplicativo</span>
            </Button>
          )}
        </span>
        <div className="relative ml-auto">
          <button type="button" aria-label="Trocar tema da plataforma" aria-expanded={themeOpen} aria-haspopup="true" onClick={() => { setThemeOpen(v => !v); setProfileOpen(false); }} className="flex items-center gap-2 rounded-xl border border-cyan-700/70 bg-[#091b2b] px-3 py-2 text-cyan-200 hover:border-cyan-400"><Palette className="size-4" /><span className="hidden text-xs font-semibold sm:inline">Tema</span><ChevronDown className="size-3" /></button>
          {themeOpen && <div role="group" aria-label="Escolha o tema visual" className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-cyan-700/60 bg-[#071728] p-2 shadow-2xl">
            {([ ["escuro", "Escuro original", "#071525"], ["azul", "Azul Dia", "#255578"], ["grafite", "Grafite", "#405263"], ["claro", "Claro", "#f3f8fd"] ] as const).map(([key, label, cor]) => <button key={key} type="button" aria-pressed={tema === key} onClick={() => mudarTema(key)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-100 hover:bg-cyan-900/30"><span className="size-5 rounded-full border border-slate-400/50" style={{ backgroundColor: cor }} /><span className="flex-1">{label}</span>{tema === key && <Check className="size-4 text-emerald-400" />}</button>)}
            <p className="px-2 py-1 text-[10px] text-slate-400">A preferência fica salva neste dispositivo.</p>
          </div>}
        </div>
        <div ref={profileRef} className="relative">
          <button type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => setProfileOpen(v => !v)} className="flex items-center gap-2 rounded-xl p-1 text-slate-100 transition-colors hover:bg-blue-950/50">
            {isAdmin && <Crown className="size-5 text-amber-400" aria-hidden="true" />}
            <span className="max-w-32 truncate font-semibold sm:max-w-48">Olá, {nickname || (isAdmin ? "Master" : (name.trim().split(" ")[0] || "usuário"))}</span>
            <span className="flex size-9 items-center justify-center overflow-hidden rounded-full border border-cyan-500 bg-[#0b2841] font-bold text-cyan-200 shadow-[0_0_12px_rgba(0,200,255,.25)]">{avatar ? <img src={avatar} alt="Foto do perfil" className="size-full object-cover" /> : (nickname || (isAdmin ? "Master" : name) || "U").charAt(0).toUpperCase()}</span>
            <ChevronDown className="size-4 text-cyan-300" aria-hidden="true" />
          </button>
          {profileOpen && <div role="menu" aria-label="Perfil da conta" className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-cyan-700/60 bg-[#071728] p-2 text-sm shadow-2xl">
            <div className="flex items-center gap-2 border-b border-cyan-950 px-2 py-2 text-cyan-100"><UserRound className="size-4" /><span className="font-semibold">Perfil {isAdmin ? "Master" : "da conta"}</span></div>
            {editingNickname ? <div className="space-y-2 p-2"><label className="block text-xs text-slate-300">Apelido<input autoFocus value={nicknameDraft} maxLength={32} onChange={e => setNicknameDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void saveNickname(); }} className="mt-1 w-full rounded-lg border border-cyan-800 bg-[#03101f] px-2 py-2 text-slate-100" /></label><div className="flex gap-2"><Button size="sm" disabled={profileBusy} onClick={() => void saveNickname()}>Salvar</Button><Button size="sm" variant="outline" onClick={() => setEditingNickname(false)}>Cancelar</Button></div></div> : <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-slate-200 hover:bg-blue-950" onClick={() => { setNicknameDraft(nickname || (isAdmin ? "Master" : name)); setEditingNickname(true); }}><Pencil className="size-4 text-violet-300" />Personalizar apelido</button>}
            <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-slate-200 hover:bg-blue-950" onClick={() => avatarInputRef.current?.click()}><ImageIcon className="size-4 text-cyan-300" />Escolher foto</button>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={e => { chooseAvatar(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            <p className="px-2 text-[10px] text-slate-500">Apelido salvo na conta; foto armazenada somente neste navegador.</p>
            {profileMessage && <p role="status" className="px-2 py-1 text-xs text-cyan-200">{profileMessage}</p>}
            <button type="button" role="menuitem" className="mt-2 flex w-full items-center gap-2 border-t border-cyan-950 px-2 py-2 text-left text-rose-300 hover:bg-rose-950/30" onClick={() => void signOut(navigate)}><LogOut className="size-4" />Sair da plataforma</button>
          </div>}
        </div>
        {saveError && <p role="alert" aria-live="assertive" className="absolute inset-x-3 top-full z-[100] mx-auto mt-2 max-w-3xl rounded-lg border border-rose-500/70 bg-[#4c101b] px-4 py-3 text-sm font-medium text-rose-50 shadow-2xl">{saveError}</p>}
      </header>
      {state === "ok" && installHelp && showInstall && (
        <div role="status" className="border-b border-amber-700/40 bg-[#142032] px-4 py-2 text-sm text-amber-100">
          { /iPad|iPhone|iPod/.test(navigator.userAgent)
            ? "No iPhone/iPad: abra no Safari, toque em Compartilhar e depois em Adicionar à Tela de Início."
            : "A instalação direta não está disponível neste navegador. No Chrome ou Edge, abra o menu do navegador e escolha Instalar aplicativo ou Adicionar à tela inicial."}
          <button type="button" onClick={() => setInstallHelp(false)} className="ml-3 underline">Fechar</button>
        </div>
      )}

      {publishMessage && <p role="status" className="px-4 py-2 text-xs text-cyan-200">{publishMessage}</p>}
      {state === "loading" && <p className="m-auto text-muted-foreground">Carregando...</p>}
      {state === "pending" && (
        <div className="m-auto max-w-sm px-6 text-center">
          <h1 className="text-2xl font-bold">Cadastro em análise</h1>
          <p className="mt-2 text-muted-foreground">Seu acesso será liberado assim que o administrador aprovar sua conta.</p>
        </div>
      )}
      {state === "rejected" && (
        <div className="m-auto max-w-sm px-6 text-center">
          <h1 className="text-2xl font-bold">Cadastro rejeitado</h1>
          <p className="mt-2 text-muted-foreground">Seu cadastro não foi aprovado. Se achar que houve um engano, fale com o administrador.</p>
        </div>
      )}
      {state === "ok" && <Bancas load={load} save={save} isAdmin={isAdmin} onPublishOfficial={() => { if (!publishBusy) void publishOfficial(); }} onSignOut={() => void signOut(navigate)} />}
      {state === "ok" && (
        <a
          href="https://t.me/yansignal"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar com o suporte pelo Telegram"
          title="Suporte pelo Telegram"
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full border border-sky-300/40 bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_28px_rgba(0,0,0,0.45)] transition hover:bg-[#168ac4] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 sm:bottom-6 sm:right-6"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-current">
            <path d="M21.5 3.5 2.8 10.7c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.6.1.9.8.9.5 0 .8-.2 1.1-.5l2.7-2.6 5.6 4.1c1 .5 1.7.2 2-1L24 4.8c.4-1.4-.5-2-2.5-1.3ZM8.1 13.3l10.8-6.8c.5-.3 1-.1.6.3-8.9 8-.3 3.1-2.2-4.6Z" />
          </svg>
          <span>Suporte</span>
        </a>
      )}
    </div>
  );
}
