import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
 
// Captura a oferta do Chrome antes do login; a tela autenticada pode montar depois do evento.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt = event;
    window.dispatchEvent(new Event("wow-pwa-install-ready"));
  });
  window.addEventListener("appinstalled", () => {
    delete (window as Window & { __wowPwaPrompt?: Event }).__wowPwaPrompt;
  });
}

import { reportLovableError } from "../lib/lovable-error-reporting";
import { registrarAuditoria } from "@/lib/auditoria-registro";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A página que você procura não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar para a página inicial
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  // Exibe uma pista técnica segura para falhas do navegador não capturadas nos logs da Vercel.
  const diagnostic = (() => {
    const raw = error instanceof Response
      ? `Resposta HTTP ${error.status}${error.url ? ` em ${new URL(error.url).pathname}` : ""}`
      : error instanceof Error
        ? `${error.name}: ${error.message}`
        : String(error);
    return raw
      .replace(/Bearer\\s+[^\\s]+/gi, "Bearer [oculto]")
      .replace(/([?&](?:token|key|secret|password)=)[^&\\s]+/gi, "$1[oculto]")
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[e-mail oculto]")
      .slice(0, 240);
  })();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : typeof error;
    const errorStack = error instanceof Error ? error.stack ?? "" : "";
    void registrarAuditoria({
      category: "system",
      action: "system.error",
      outcome: "failed",
      details: {
        boundary: "root_error_component",
        error_name: errorName.slice(0, 80),
        error_message: errorMessage.slice(0, 450),
        error_stack: errorStack.slice(0, 450),
        pathname: window.location.pathname.slice(0, 120),
      },
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado do nosso lado. Você pode tentar atualizar a página ou voltar para a página inicial.
        </p>
        <p className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-left text-xs text-muted-foreground break-words" role="status">
          Detalhe técnico: {diagnostic || "Não foi possível identificar a mensagem do erro."}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tente novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar para a página inicial          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Win or Win Platform" },
      { name: "description", content: "Controle de bancas para membros aprovados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "theme-color", content: "#09090b" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Win or Win" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Hind:wght@400;500;600&family=Space+Grotesk:wght@400;500;700&display=swap" },
      { rel: "icon", href: "/app-icon.svg?v=20261019", type: "image/svg+xml", sizes: "any" },
      { rel: "icon", href: "/favicon.png?v=20261019", type: "image/png", sizes: "48x48" },
      { rel: "manifest", href: "/manifest.json?v=20261019" },
      { rel: "apple-touch-icon", href: "/app-icon.svg?v=20261019" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // O registro do service worker não deve impedir a plataforma de abrir.
      });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
