import { describe, it, expect } from 'vitest';
import { mensagemErroSalvamento } from '@/lib/platform/save-errors';
describe('motivo de falha na gravação',()=>{
  it('distingue documento grande, sessão e conexão sem exibir erros internos',()=>{
    expect(mensagemErroSalvamento(413)).toContain('histórico ultrapassou');
    expect(mensagemErroSalvamento(401)).toContain('sessão expirou');
    expect(mensagemErroSalvamento(0)).toContain('conexão');
    expect(mensagemErroSalvamento(403,'terms_acceptance_required')).toContain('termos');
    expect(mensagemErroSalvamento(500,'detalhe interno sensível')).not.toContain('sensível');
  });
});
