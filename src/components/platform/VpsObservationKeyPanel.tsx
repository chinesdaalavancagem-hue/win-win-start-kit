import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { gerarChaveObservacaoVps, revogarChaveObservacaoVps } from "@/lib/vps-relay.functions";

export function VpsObservationKeyPanel() {
  const gerar = useServerFn(gerarChaveObservacaoVps);
  const revogar = useServerFn(revogarChaveObservacaoVps);
  const [chave,setChave] = useState("");
  const [estado,setEstado] = useState("");
  const [ocupado,setOcupado] = useState(false);

  async function nova() {
    if (!window.confirm("Gerar outra chave VPS invalida a anterior. Continuar?")) return;
    setOcupado(true);
    try {
      const result = await gerar();
      setChave(result.token);
      setEstado("Chave gerada. Copie agora: ela não será exibida novamente.");
    } catch {
      setEstado("Não foi possível gerar a chave VPS. Confira se a migração foi aplicada.");
    } finally { setOcupado(false); }
  }
  async function cancelar() {
    if (!window.confirm("Revogar a chave VPS? A extensão e a VPS deixarão de consultar o canal.")) return;
    setOcupado(true);
    try {
      await revogar();
      setChave("");
      setEstado("Chave de observação VPS revogada.");
    } catch { setEstado("Falha ao revogar chave VPS."); }
    finally { setOcupado(false); }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-border/80 bg-card p-5 shadow-sm md:p-6">
      <h2 className="text-base font-semibold">Conexão VPS — chave de observação</h2>
      <p className="text-sm text-muted-foreground">
        Primeira etapa: esta chave permite somente enviar e consultar leituras da
        TopstepX. Não autoriza ordens, não acessa outros dados pessoais e não altera
        a chave da Tradovate. Validade de 90 dias.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={ocupado} onClick={nova}>Gerar chave VPS</Button>
        <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={cancelar}>Revogar chave VPS</Button>
      </div>
      {chave && <div className="rounded-lg bg-muted p-3">
        <p className="mb-2 text-xs text-muted-foreground">A chave aparece uma única vez. Não compartilhe em conversas.</p>
        <code className="block select-all break-all text-sm">{chave}</code>
        <Button type="button" size="sm" variant="outline" className="mt-2"
          onClick={() => { void navigator.clipboard.writeText(chave); }}>Copiar chave</Button>
      </div>}
      {estado && <p className="text-sm" role="status">{estado}</p>}
    </section>
  );
}
