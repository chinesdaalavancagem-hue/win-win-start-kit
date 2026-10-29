// O documento inclui todas as bancas, históricos e dados necessários para desfazer.
// Limite da aplicação solicitado pelo proprietário; infraestrutura e navegador têm limites próprios.
export const MAX_SAVED_DATA_LENGTH = 1_000_000_000;

export function mensagemErroSalvamento(status: number, code?: unknown): string {
  if (status === 413 || code === 'payload_too_large') return 'O histórico ultrapassou o limite de salvamento. Suas alterações ainda não foram salvas. Entre em contato com o suporte.';
  if (status === 401 || code === 'unauthorized') return 'Sua sessão expirou. As alterações ainda não foram salvas. Entre novamente na plataforma.';
  if (code === 'terms_acceptance_required') return 'É necessário aceitar os termos atualizados para salvar.';
  if (code === 'account_not_approved') return 'Sua conta não está liberada para salvar. Entre em contato com o suporte.';
  if (status === 400) return 'Uma informação enviada não pôde ser validada. As alterações ainda não foram salvas. Entre em contato com o suporte.';
  if (status === 0) return 'Não foi possível conectar à nuvem. Confira sua conexão; as alterações ainda não foram salvas.';
  return 'A nuvem não conseguiu concluir o salvamento. As alterações ainda não foram salvas. Tente novamente em instantes.';
}
