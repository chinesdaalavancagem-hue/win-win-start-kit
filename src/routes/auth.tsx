import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { registrarAuditoria } from "@/lib/auditoria-registro";
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setLoading(true);
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: f["email"] ?? "", password: f["password"] ?? "" });
        if (error) throw new Error("E-mail ou senha incorretos, ou e-mail ainda não confirmado.");
        const { data: prof } = await supabase.from("profiles").select("rejected").eq("id", data.user.id).maybeSingle();
        if (prof?.rejected) {
          await supabase.auth.signOut();
          throw new Error("Seu acesso foi bloqueado. Entre em contato com o administrador da conta master.");
        }
        void registrarAuditoria({ category: "auth", action: "login.success", outcome: "success" });
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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        <img src="/logo.png" width="240" height="240" className="mx-auto block object-contain" />
        <h1 className="text-center text-2xl font-bold">{mode === "login" ? "Entrar" : "Criar conta"}</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Win or Win Platform</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "signup" && (
            <>
              <Field name="full_name" label="Nome completo" autoComplete="name" />
              <Field name="phone" label="Telefone / WhatsApp" type="tel" placeholder="(11) 99999-9999" autoComplete="tel" />
              <Field name="birth_date" label="Data de nascimento" type="date" />
            </>
          )}
          <Field name="email" label="E-mail" type="email" autoComplete="email" />
          <Field name="password" label="Senha" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {info && <p className="text-sm text-primary">{info}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Aguarde..." : mode === "login" ? "Entrar" : "Cadastrar"}
          </Button>
        </form>
        {mode === "login" && (
          <button
            type="button"
            onClick={async (e) => {
              setError(null);
              setInfo(null);
              const form = e.currentTarget.form;
              const raw = form ? String(new FormData(form).get("email") ?? "") : "";
              const email = raw.trim();
              if (!z.string().email().safeParse(email).success) {
                setError("Digite seu e-mail acima para recuperar a senha.");
                return;
              }
              setLoading(true);
              const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + "/reset-password",
              });
              setLoading(false);
              if (error) setError("Não foi possível enviar o e-mail. Tente novamente em instantes.");
              else setInfo("Enviamos um link para redefinir sua senha. Verifique seu e-mail.");
            }}
            className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
          >
            Esqueci minha senha
          </button>
        )}
        <button
          type="button"
          onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); setInfo(null); }}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login" ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar"}
        </button>
      </div>
    </main>
  );
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required {...rest} />
    </div>
  );
}
