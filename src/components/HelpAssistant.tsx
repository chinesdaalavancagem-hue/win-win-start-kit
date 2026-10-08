import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/win-or-win-logo.png.asset.json";

const SUGGESTIONS = ["Quais dados preciso para me cadastrar?", "Quanto tempo leva a aprovação?", "Esqueci minha senha, e agora?"];

export function HelpAssistant() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { messages, sendMessage, status, stop, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/assistente" }),
    onError: (e) => {
      const m = e.message || "";
      setError(m.includes("429") ? "Muitas perguntas agora. Tente em instantes." : m.includes("402") ? "Assistente indisponível no momento." : "Não foi possível responder. Tente novamente.");
    },
  });
  const busy = status === "submitted" || status === "streaming";
  const ask = (text: string) => {
    if (!text.trim() || busy) return;
    setError(null);
    sendMessage({ text });
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="fixed bottom-5 right-5 z-50 h-12 gap-2 rounded-full px-5 shadow-lg">
        <MessageCircleQuestion className="size-5" /> Dúvidas?
      </Button>
    );
  }

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex h-[70vh] max-h-[600px] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:inset-x-auto sm:right-5 sm:w-[400px]">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <img src={logoAsset.url} alt="" className="size-8 rounded-md" />
        <div className="flex-1">
          <p className="text-sm font-semibold">Assistente Win or Win</p>
          <p className="text-xs text-muted-foreground">Cadastro, acesso e regras</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Nova conversa" onClick={() => { stop(); setMessages([]); setError(null); }}>
          <RotateCcw className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Fechar" onClick={() => setOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <Conversation className="flex-1">
        <ConversationContent>
          {messages.length === 0 ? (
            <ConversationEmptyState title="Como posso ajudar?" description="Pergunte sobre cadastro, aprovação ou acesso.">
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">Pergunte sobre cadastro, aprovação ou acesso.</p>
                {SUGGESTIONS.map((s) => (
                  <Button key={s} variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => ask(s)}>{s}</Button>
                ))}
              </div>
            </ConversationEmptyState>
          ) : (
            messages.map((m) => (
              <Message key={m.id} from={m.role}>
                <MessageContent>
                  {m.parts.map((p, i) =>
                    p.type === "text" ? (m.role === "assistant" ? <MessageResponse key={i}>{p.text}</MessageResponse> : <span key={i}>{p.text}</span>) : null,
                  )}
                </MessageContent>
              </Message>
            ))
          )}
          {status === "submitted" && <p className="text-sm text-muted-foreground animate-pulse">Pensando…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t border-border p-3">
        <PromptInput onSubmit={(msg) => ask(msg.text ?? "")}>
          <PromptInputTextarea autoFocus placeholder="Digite sua dúvida…" />
          <PromptInputFooter className="justify-end">
            <PromptInputSubmit status={status} onStop={stop} />
          </PromptInputFooter>
        </PromptInput>
      </div>
      <p className="px-4 pb-2 text-[11px] text-muted-foreground">Respostas automáticas com base nas informações do site.</p>
    </div>
  );
}
