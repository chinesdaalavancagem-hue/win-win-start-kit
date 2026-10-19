import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { forwardRef, useEffect, useRef, useState } from "react";
import { greetings, getDayPeriod, getDailyVerse, type DayPeriod } from "@/lib/login-greeting-verses";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { registrarAuditoria } from "@/lib/auditoria-registro";
import { registrarAtividade, registrarLoginFalho } from "@/lib/activity-logs";
import { registrarDispositivoConfiavel } from "@/lib/trusted-devices.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signup" } => (s["mode"] === "signup" ? { mode: "signup" } : {}),
  head: () => ({
    meta: [
      { title: "Entrar — Win or Win Platform" },
      { name: "description", content: "Entre ou cadastre-se na Win or Win Platform." },
      { property: "og:title", content: "Entrar — Win or Win Platform" },
      { property: "og:description", content: "Entre ou cadastre-se na Win or Win Platform." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const onlyDigits = (v: string) => v.replace(/\D/g, "");
const FIRST_NAME_STORAGE_KEY = "win_or_win_first_name";

async function hashEmail(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !window.crypto?.subtle) return "";
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalizedEmail),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const signupSchema = z.object({
  full_name: z.string().trim().min(3, "Informe o nome completo").max(120),
  phone: z.string().refine((v) => onlyDigits(v).length >= 10 && onlyDigits(v).length <= 13, "Telefone inválido"),
  birth_date: z.string().refine((v) => {
    const d = new Date(v);
    if (isNaN(d.getTime())) return false;
    const age = (Date.now() - d.getTime()) / (365.25 * 864e5);
    return age >= 18 && age < 120;
  }, "É preciso ter 18 anos ou mais"),
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(8, "A senha precisa ter ao menos 8 caracteres").max(72),
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">(search.mode === "signup" ? "signup" : "login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [savedEmailHash, setSavedEmailHash] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const [emailMatchesSavedUser, setEmailMatchesSavedUser] = useState(false);
  const [dayPeriod, setDayPeriod] = useState<DayPeriod>("morning");

  const dailyVerse = getDailyVerse(dayPeriod);

  useEffect(() => {
    const refreshGreeting = () => {
      setDayPeriod(getDayPeriod());
      try {
        const saved = window.localStorage.getItem(FIRST_NAME_STORAGE_KEY);
        if (!saved) {
          setFirstName("");
          setSavedEmailHash("");
          return;
        }
        const parsed = JSON.parse(saved) as { firstName?: unknown; emailHash?: unknown };
        setFirstName(typeof parsed.firstName === "string" ? parsed.firstName.slice(0, 40) : "");
        setSavedEmailHash(typeof parsed.emailHash === "string" ? parsed.emailHash : "");
      } catch {
        setFirstName("");
        setSavedEmailHash("");
      }
    };

    refreshGreeting();
    const intervalId = window.setInterval(refreshGreeting, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const syncAutofill = () => {
      const el = document.getElementById("email") as HTMLInputElement | null;
      if (el?.value && el.value !== loginEmail) {
        setLoginEmail(el.value);
      }
    };
    syncAutofill();
    const t1 = window.setTimeout(syncAutofill, 200);
    const t2 = window.setTimeout(syncAutofill, 600);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.isComposing) return;
      if (loading) {
        event.preventDefault();
        return;
      }
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      // Não interfere se o usuário estiver em um botão ou link
      if (tag === "BUTTON" || tag === "A" || tag === "TEXTAREA") return;

      // Se estiver com o cursor no e-mail e a senha estiver vazia, vai para a senha
      if (target?.id === "email") {
        const pwdVal = passwordInputRef.current?.value || "";
        if (!pwdVal.trim()) {
          event.preventDefault();
          passwordInputRef.current?.focus();
          return;
        }
      }

      // Em qualquer outro lugar, submete o formulário
      const form = document.querySelector<HTMLFormElement>("form");
      if (form) {
        event.preventDefault();
        form.requestSubmit();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    if (!loginEmail.trim() || !savedEmailHash) {
      setEmailMatchesSavedUser(false);
      return;
    }

    void hashEmail(loginEmail)
      .then((hash) => {
        if (!cancelled) setEmailMatchesSavedUser(Boolean(hash && hash === savedEmailHash));
      })
      .catch(() => {
        if (!cancelled) setEmailMatchesSavedUser(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loginEmail, savedEmailHash]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setLoading(true);
    try {
      if (mode === "login") {
        const email = f["email"] ?? "";
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: f["password"] ?? "" });
        if (error) {
          registrarLoginFalho(email);
          throw new Error("E-mail ou senha incorretos, ou e-mail ainda não confirmado.");
        }
        const { data: prof } = await supabase.from("profiles").select("rejected").eq("id", data.user.id).maybeSingle();
        if (prof?.rejected) {
          await supabase.auth.signOut();
          throw new Error("Seu acesso foi bloqueado. Entre em contato com o administrador da conta master.");
        }
        registrarAtividade("login.success", { metodo: "senha" });
        void registrarAuditoria({ category: "auth", action: "login.success", outcome: "success" });
        // Salva a saudação localmente sem atrasar o login nem alterar os registros de atividade.
        void (async () => {
          try {
            const metadata = data.user.user_metadata ?? {};
            const fullName = [metadata.full_name, metadata.name, metadata.first_name]
              .find((value) => typeof value === "string" && value.trim());
            if (typeof fullName === "string") {
              const savedFirstName = fullName.trim().split(/\s+/)[0]?.slice(0, 40) ?? "";
              const emailHash = await hashEmail(data.user.email ?? f["email"] ?? "");
              if (savedFirstName && emailHash) {
                window.localStorage.setItem(
                  FIRST_NAME_STORAGE_KEY,
                  JSON.stringify({ firstName: savedFirstName, emailHash }),
                );
              }
            }
          } catch {
            // A saudação é opcional e nunca deve interferir no login nem no registro de atividade.
          }
        })();
        // Aguarda no máximo 3 segundos; falhas no registro nunca impedem o login.
        try {
          await Promise.race([
            registrarDispositivoConfiavel(),
            new Promise<void>((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch {
          // O registro do aparelho é opcional e não pode bloquear a navegação.
        }
        navigate({ to: "/plataforma" });
      } else {
        const parsed = signupSchema.safeParse(f);
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
        const { email, password, ...meta } = parsed.data;
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/plataforma",
            data: { ...meta, phone: onlyDigits(meta.phone) },
          },
        });
        if (error) throw new Error(error.message);
        void registrarAuditoria({ category: "auth", action: "signup.success", outcome: "success" });
        setInfo("Cadastro enviado! Confirme seu e-mail pelo link que enviamos. Depois, aguarde a aprovação do administrador.");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#070b14] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-28 h-80 w-80 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(148,163,184,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.35)_1px,transparent_1px)] [background-size:36px_36px]" />
      </div>

      <div className="grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/10 bg-[#0b1220]/90 shadow-2xl shadow-black/40 backdrop-blur-xl lg:min-h-[680px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/10 bg-gradient-to-br from-[#101e31] via-[#0b1423] to-[#071019] p-10 lg:flex xl:p-14">
          <div aria-hidden="true" className="absolute -right-24 top-24 h-72 w-72 rounded-full border border-cyan-300/10" />
          <div aria-hidden="true" className="absolute -right-12 top-36 h-48 w-48 rounded-full border border-cyan-300/10" />
          <div className="relative">
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 shadow-lg shadow-cyan-950/30">
                <img src="/logo.png" alt="Win or Win" width="72" height="72" className="h-[72px] w-[72px] object-contain [filter:hue-rotate(150deg)_saturate(1.25)]" />
              </div>
              <div>
                <p className="text-sm font-bold tracking-wide text-white">WIN OR WIN</p>
                <p className="text-xs tracking-[0.2em] text-cyan-200/70">TRADING PLATFORM</p>
              </div>
            </div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-1.5 text-xs font-medium text-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(110,231,183,0.9)]" />
              Seu foco. Sua estratégia. Sua evolução.
            </div>
            <h2 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
              Mais clareza para operar.
              <span className="mt-2 block bg-gradient-to-r from-cyan-300 via-sky-300 to-emerald-300 bg-clip-text text-transparent">
                Mais controle em cada ciclo.
              </span>
            </h2>
            <p className="mt-6 max-w-md text-base leading-7 text-slate-300/80">
              Acesse seu ambiente e acompanhe seus parâmetros, bancas e integrações em um só lugar.
            </p>
          </div>
          <div className="relative mt-12 space-y-3">
            {[
              ["01", "Gestão do seu ciclo", "Acompanhe seus números com mais organização."],
              ["02", "Integrações em um só lugar", "Consulte o estado das suas conexões de trading."],
              ["03", "Acesso protegido", "Entre na sua conta pessoal com segurança."],
            ].map(([number, title, description]) => (
              <div key={number} className="flex items-start gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.08] text-xs font-semibold text-cyan-200">{number}</span>
                <div>
                  <p className="text-sm font-semibold text-slate-100">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{description}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="relative mt-8 text-xs text-slate-500">WIN OR WIN PLATFORM <span className="px-2 text-slate-700">•</span> AMBIENTE DE ACESSO</p>
        </section>

        <section className="flex items-center justify-center p-5 sm:p-8 lg:p-10 xl:p-14">
          <div className="w-full max-w-md">
            <div className="mb-7 text-center lg:hidden">
              <img src="/logo.png" alt="Win or Win Platform" width="128" height="128" className="mx-auto mb-3 h-28 w-28 object-contain [filter:hue-rotate(150deg)_saturate(1.25)] drop-shadow-[0_0_22px_rgba(34,211,238,0.18)]" />
              <p className="text-xs font-semibold tracking-[0.24em] text-cyan-200">WIN OR WIN PLATFORM</p>
            </div>

            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300/80">{mode === "login" ? "Bem-vindo de volta" : "Comece sua jornada"}</p>
              <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{mode === "login" ? "Acesse sua conta" : "Criar sua conta"}</h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">{mode === "login" ? "Entre para continuar no seu ambiente de trading." : "Preencha seus dados para solicitar seu acesso à plataforma."}</p>
            </div>

            {mode === "login" && firstName && emailMatchesSavedUser && (
              <section className="mb-6 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4" aria-label="Saudação e versículo bíblico">
                <h2 className="text-base font-semibold text-white">{greetings[dayPeriod]}, {firstName}!</h2>
                <p className="mt-1 text-sm text-slate-300">{dayPeriod === "morning" ? "Que Deus abençoe seu dia." : dayPeriod === "afternoon" ? "Que Deus abençoe sua tarde." : "Que Deus abençoe sua noite."}</p>
                <blockquote className="mt-3 border-l-2 border-cyan-300/40 pl-3 text-sm leading-relaxed text-slate-200">
                  “{dailyVerse.text}”
                  <footer className="mt-1 text-xs text-slate-400">{dailyVerse.reference}</footer>
                </blockquote>
              </section>
            )}

            <form onSubmit={onSubmit} className="space-y-5">
              {mode === "signup" && (
                <>
                  <Field name="full_name" label="Nome completo" autoComplete="name" />
                  <Field name="phone" label="Telefone / WhatsApp" type="tel" placeholder="(11) 99999-9999" autoComplete="tel" />
                  <Field name="birth_date" label="Data de nascimento" type="date" />
                </>
              )}
              <Field
                name="email"
                label="E-mail"
                type="email"
                autoComplete="email"
                autoFocus
                defaultValue={loginEmail}
                onChange={(event) => setLoginEmail(event.currentTarget.value)}
              />
              <Field
                name="password"
                label="Senha"
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                ref={passwordInputRef}
              />
              {error && <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/[0.08] px-4 py-3 text-sm leading-5 text-rose-200">{error}</p>}
              {info && <p role="status" className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] px-4 py-3 text-sm leading-5 text-emerald-200">{info}</p>}
              <Button type="submit" className="h-12 w-full rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-500 to-sky-500 font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:brightness-110" disabled={loading}>
                {loading ? "Aguarde..." : mode === "login" ? "Entrar na plataforma" : "Solicitar cadastro"}
              </Button>
            </form>

            {mode === "login" && (
              <button
                type="button"
                onClick={async () => {
                  setError(null);
                  setInfo(null);
                  const emailEl = document.getElementById("email") as HTMLInputElement | null;
                  const email = (emailEl?.value || loginEmail).trim();
                  if (!z.string().email().safeParse(email).success) {
                    setError("Digite seu e-mail acima para recuperar a senha.");
                    return;
                  }

                  setLoading(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email, {
                      redirectTo: window.location.origin + "/reset-password",
                    });
                    if (error) {
                      setError("Não foi possível enviar o e-mail. Tente novamente em instantes.");
                    } else {
                      setInfo("Enviamos um link para redefinir sua senha. Verifique seu e-mail.");
                    }
                  } catch {
                    setError("Não foi possível enviar o e-mail. Tente novamente em instantes.");
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="mt-5 w-full text-center text-sm text-slate-400 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Esqueci minha senha
              </button>
            )}
            <div className="my-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-600">Acesso seguro</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }}
              className="w-full rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3 text-sm font-medium text-slate-300 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.05] hover:text-white"
            >
              {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
            </button>
            <p className="mt-6 text-center text-xs leading-5 text-slate-500">Ao continuar, você acessa sua área pessoal da Win or Win Platform.</p>
          </div>
        </section>
      </div>
    </main>
  );
}

const Field = forwardRef<
  HTMLInputElement,
  { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>
>(function Field({ name, label, ...rest }, ref) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input ref={ref} id={name} name={name} required {...rest} />
    </div>
  );
});
