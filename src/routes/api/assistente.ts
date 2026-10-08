import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, type UIMessage } from "ai";
import { createResponsesCall } from "@/lib/ai/responses.server";

const SITE_INFO = `
Você é o assistente da Win or Win Platform. Responda sempre em português do Brasil, de forma clara, curta e em passos quando ajudar.
Responda APENAS com base nas informações abaixo, que são as publicadas no site. Se a resposta não estiver aqui, diga que não tem essa informação e sugira falar com a equipe Win or Win. Nunca invente regras, prazos, valores ou promessas de lucro. Não dê recomendação financeira individual.

INFORMAÇÕES DO SITE:
- A Win or Win é uma plataforma para quem opera em mesas proprietárias (prop firm). Ajuda a entrar na operação sabendo os números: risco definido, retorno calculado, direção neutralizada e saque projetado.
- Como funciona: 1) Prepare (organize contas e dados), 2) Calcule (a plataforma mostra risco e retorno antes da entrada), 3) Opere com decisão tomada antes da entrada.
- Aviso: operar no mercado envolve risco; não há garantia de lucro.
- Cadastro ("Criar conta"): pede nome completo, telefone/WhatsApp (com DDD, 10 a 13 dígitos), CPF válido, data de nascimento (somente maiores de 18 anos), e-mail e senha com no mínimo 8 caracteres.
- Depois do cadastro, a pessoa recebe um e-mail e precisa clicar no link de confirmação.
- Depois de confirmar, o cadastro fica "em análise": um administrador da Win or Win precisa aprovar antes de liberar o acesso à plataforma. Não há prazo publicado para a aprovação.
- Entrar: com e-mail e senha na tela "Entrar".
- Esqueceu a senha: na tela Entrar, digite o e-mail e clique em "Esqueci minha senha". Chega um link por e-mail para criar uma nova senha (mínimo 8 caracteres).
- Os dados da plataforma ficam salvos na conta, e podem ser acessados em qualquer aparelho após entrar.
- Não recebeu o e-mail: verifique a caixa de spam/lixo eletrônico e se o e-mail foi digitado corretamente.
`;

export const Route = createFileRoute("/api/assistente")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env['LOVABLE_API_KEY'];
        if (!apiKey) return new Response("Assistente não configurado.", { status: 500 });
        let messages: UIMessage[];
        try {
          const body = (await request.json()) as { messages?: UIMessage[] };
          if (!Array.isArray(body.messages)) throw new Error();
          messages = body.messages.slice(-20);
        } catch {
          return new Response("Pedido inválido.", { status: 400 });
        }
        const model = await convertToModelMessages(messages);
        const call = createResponsesCall(
          request,
          { baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, model: "openai/gpt-6-astra" },
          [{ role: "system", content: SITE_INFO }, ...model],
        );
        return call.response();
      },
    },
  },
});
