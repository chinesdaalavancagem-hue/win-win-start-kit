import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CURRENT_TERMS_VERSION, TERMS_SECTIONS } from "@/lib/terms";

type TermsStatus = {
  version: string;
  isAdmin: boolean;
  accepted: boolean;
};

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso — Win or Win Platform" },
      { name: "description", content: "Leia e aceite a versão vigente dos termos de uso." },
    ],
  }),
  component: TermsPage,
});

async function hashDevice(): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Este navegador não permite gerar o hash de segurança. Atualize o navegador e tente novamente.");
  }

  const storageKey = "wow_terms_device_seed_v1";
  let seed = "";
  try {
    seed = window.localStorage.getItem(storageKey) ?? "";
    if (!seed) {
      seed = typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
      window.localStorage.setItem(storageKey, seed);
    }
  } catch {
    seed = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  // Apenas o digest é enviado ao servidor; nenhum IP é coletado por este recurso.
  const fingerprint = [
    seed,
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join("|");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function TermsPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<TermsStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        await navigate({ to: "/auth", replace: true });
        return;
      }

      const response = await fetch("/api/termos/status", {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json() as TermsStatus & { error?: string };
      if (response.status === 401) {
        await navigate({ to: "/auth", replace: true });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Não foi possível verificar os termos.");
      setStatus(payload);
      if (payload.accepted) await navigate({ to: "/plataforma", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível verificar os termos.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function acceptTerms() {
    setAccepting(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        await navigate({ to: "/auth", replace: true });
        return;
      }

      const deviceHash = await hashDevice();
      const response = await fetch("/api/termos/aceite", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ deviceHash }),
      });
      const payload = await response.json() as { error?: string };
      if (response.status === 401) {
        await navigate({ to: "/auth", replace: true });
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar seu aceite.");
      await navigate({ to: "/plataforma", replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar seu aceite.");
    } finally {
      setAccepting(false);
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center gap-3">
          <div className="rounded-xl border bg-card p-3"><FileText className="h-6 w-6" aria-hidden="true" /></div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Win or Win Platform</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Termos de uso</h1>
          </div>
        </header>

        <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-8">
          <div className="mb-6 flex items-start gap-3 rounded-lg bg-muted/50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <p className="font-semibold">É necessário aceitar para continuar</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Leia os termos abaixo. O aceite é registrado com a versão, a data e hora do servidor e um hash do aparelho/navegador, sem armazenar o IP bruto.
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Versão vigente: {CURRENT_TERMS_VERSION}</p>
            </div>
          </div>

          <div className="space-y-6">
            {TERMS_SECTIONS.map((section) => (
              <section key={section.title} className="space-y-2">
                <h2 className="text-base font-semibold">{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="text-sm leading-6 text-muted-foreground">{paragraph}</p>
                ))}
              </section>
            ))}
          </div>

          {error && (
            <div role="alert" className="mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
              {error.includes("migração") && (
                <p className="mt-1">O aceite ficará disponível quando a tabela de termos for criada no banco de dados.</p>
              )}
            </div>
          )}

          <div className="mt-8 border-t pt-5">
            <Button onClick={() => void acceptTerms()} disabled={loading || accepting || !status || status.accepted} className="w-full sm:w-auto">
              <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />
              {accepting ? "Registrando aceite..." : "Aceito os termos"}
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              O acesso às áreas protegidas só será liberado após a confirmação do aceite da versão vigente.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
