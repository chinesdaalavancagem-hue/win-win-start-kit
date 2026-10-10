import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { gerarChave } from "@/lib/integracao.functions";

export const Route = createFileRoute("/_authenticated/integracao")({
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", context.user.id);
    if (!data?.some((r) => r.role === "admin")) throw redirect({ to: "/plataforma" });
  },
  head: () => ({ meta: [{ title: "Integração — Win or Win" }, { name: "description", content: "Conecte a mesa Tradovate ao MetaTrader 5." }, { property: "og:title", content: "Integração — Win or Win" }, { property: "og:description", content: "Receba as ordens da mesa e espelhe no CFD." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: Integracao,
});

type Row = { id: string; symbol: string; side: string; mirror_side: string; qty: number; status: string; error: string | null; created_at: string };
const STATUS: Record<string, string> = { pending: "Na fila", sent: "Enviada ao MT5", done: "Executada no CFD", error: "Falhou" };

function Integracao() {
  const gerar = useServerFn(gerarChave);
  const [temChave, setTemChave] = useState<boolean | null>(null);
  const [chave, setChave] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const base = typeof window !== "undefined" ? window.location.origin : "";

  async function load() {
    const [{ data: t }, { data: o }] = await Promise.all([
      supabase.from("integration_tokens").select("created_at").maybeSingle(),
      supabase.from("order_queue").select("id,symbol,side,mirror_side,qty,status,error,created_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setTemChave(!!t);
    setRows((o as Row[]) ?? []);
  }
  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, []);

  async function novaChave() {
    if (temChave && !confirm("A chave atual vai parar de funcionar. Continuar?")) return;
    const r = await gerar();
    setChave(r.token);
    setTemChave(true);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Integração Tradovate → MT5</h1>
        <Button asChild size="sm" variant="outline"><Link to="/plataforma">Voltar</Link></Button>
      </div>

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-semibold">1. Sua chave</h2>
        <p className="text-sm text-muted-foreground">A chave liga a mesa e o robô do MT5 à sua conta. Ela aparece só uma vez; guarde num lugar seguro.</p>
        {chave && <code className="block break-all rounded bg-muted p-2 text-sm">{chave}</code>}
        <Button size="sm" onClick={novaChave}>{temChave ? "Gerar nova chave" : "Gerar chave"}</Button>
      </section>

      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">2. Endereços</h2>
        <p>Receber ordem da mesa: <code>POST {base}/api/public/ordens</code></p>
        <p>Robô MT5 busca ordens: <code>GET {base}/api/public/ordens/pendentes</code></p>
        <p>Robô MT5 confirma: <code>POST {base}/api/public/ordens/confirmar</code></p>
        <p className="text-muted-foreground">Todos usam o cabeçalho <code>Authorization: Bearer SUA_CHAVE</code>. O robô recebe sempre a direção contrária à da mesa.</p>
      </section>

      <section className="rounded-lg border p-4">
        <h2 className="mb-2 font-semibold">3. Fila de ordens</h2>
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
