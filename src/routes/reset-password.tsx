import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nova senha — Win or Win Platform" },
      { name: "description", content: "Defina uma nova senha para sua conta Win or Win." },
      { property: "og:title", content: "Nova senha — Win or Win Platform" },
      { property: "og:description", content: "Defina uma nova senha para sua conta Win or Win." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => s.session && setReady(true));
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const p = String(f.get("password") ?? "");
    const c = String(f.get("confirm") ?? "");
    if (p.length < 8) return setError("A senha precisa ter ao menos 8 caracteres");
    if (p !== c) return setError("As senhas não coincidem");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: p });
    setLoading(false);
    if (error) return setError("Não foi possível alterar a senha. Solicite um novo link.");
    setDone(true);
    setTimeout(() => navigate({ to: "/plataforma" }), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-8">
        <h1 className="text-center text-2xl font-bold">Definir nova senha</h1>
        {done ? (
          <p className="mt-6 text-center text-sm text-primary">Senha alterada! Redirecionando...</p>
        ) : !ready ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Abra esta página pelo link enviado ao seu e-mail.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">Nova senha</Label>
              <Input id="password" name="password" type="password" autoComplete="new-password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirmar senha</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Aguarde..." : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
