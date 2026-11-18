import { describe, expect, it } from 'vitest';
import {
  alteracoesQuerySchema,
  atendimentoEntradaSchema,
  CODIGOS_ERRO,
  ehFalhaTransitoria,
  envioEntradaSchema,
  eventoEntradaSchema,
  loginEntradaSchema,
  logsEntradaSchema,
  paginacaoQuerySchema,
  pessoaAlteracaoSchema,
  pessoaEntradaSchema,
  pessoasQuerySchema,
  STATUS_POR_CODIGO,
} from '../src/index.ts';

const id = 'aaaaaaaa-1111-4111-8111-111111111111';
const agora = '2026-11-17T21:00:00.000Z';
const evento = (tipo: string, dados: unknown, extra: object = {}) => ({
  id,
  atendimentoId: id,
  tipo,
  ocorridoEm: agora,
  dados,
  ...extra,
});
const aceita = (tipo: string, dados: unknown, extra?: object) =>
  eventoEntradaSchema.safeParse(evento(tipo, dados, extra)).success;

describe('convencoes', () => {
  it('exige UUID minusculo e data UTC com Z', () => {
    expect(pessoaEntradaSchema.safeParse({ id: id.toUpperCase(), nome: 'A', editadoEm: agora }).success).toBe(false);
    expect(pessoaEntradaSchema.safeParse({ id, nome: 'A', editadoEm: '2026-11-17T21:00:00-03:00' }).success).toBe(false);
    expect(pessoaEntradaSchema.safeParse({ id, nome: 'A', editadoEm: agora }).success).toBe(true);
  });

  it('paginacao: padrao 50, maximo 200', () => {
    expect(paginacaoQuerySchema.parse({}).limite).toBe(50);
    expect(paginacaoQuerySchema.parse({ limite: '200' }).limite).toBe(200);
    expect(paginacaoQuerySchema.safeParse({ limite: '201' }).success).toBe(false);
    expect(alteracoesQuerySchema.parse({})).toEqual({ desde: '0', limite: 500 });
    expect(alteracoesQuerySchema.safeParse({ desde: 'abc' }).success).toBe(false);
  });

  it('codigos de erro e regra do outbox', () => {
    expect(STATUS_POR_CODIGO[CODIGOS_ERRO.CHAVE_IDEMPOTENCIA_CONFLITANTE]).toBe(422);
    expect(ehFalhaTransitoria(null)).toBe(true);
    expect(ehFalhaTransitoria(503)).toBe(true);
    expect(ehFalhaTransitoria(422)).toBe(false);
  });
});

describe('pessoa', () => {
  it('rejeita campo desconhecido e CPF com pontuacao', () => {
    expect(pessoaEntradaSchema.safeParse({ id, nome: 'A', editadoEm: agora, apelido: 'x' }).success).toBe(false);
    expect(pessoaEntradaSchema.safeParse({ id, nome: 'A', editadoEm: agora, cpf: '123.456.789-00' }).success).toBe(false);
    expect(pessoaEntradaSchema.safeParse({ id, nome: 'A', editadoEm: agora, cpf: '12345678900' }).success).toBe(true);
  });

  it('alteracao exige ao menos um campo e aceita limpar com null', () => {
    expect(pessoaAlteracaoSchema.safeParse({ campos: {}, editadoEm: agora }).success).toBe(false);
    expect(pessoaAlteracaoSchema.safeParse({ campos: { telefone: null }, editadoEm: agora }).success).toBe(true);
    expect(pessoaAlteracaoSchema.safeParse({ campos: { nome: null }, editadoEm: agora }).success).toBe(false);
  });
});

describe('dados por tipo de evento', () => {
  it('SINAIS_VITAIS: ao menos um, dentro da faixa, sem campo desconhecido', () => {
    expect(aceita('SINAIS_VITAIS', { saturacao: 97, temperatura: 36.5 })).toBe(true);
    expect(aceita('SINAIS_VITAIS', {})).toBe(false);
    expect(aceita('SINAIS_VITAIS', { saturacao: 101 })).toBe(false);
    expect(aceita('SINAIS_VITAIS', { saturacao: 97.5 })).toBe(false);
    expect(aceita('SINAIS_VITAIS', { saturacao: 97, dor: 3 })).toBe(false);
  });

  it('GLASGOW: total conferido', () => {
    expect(aceita('GLASGOW', { ocular: 4, verbal: 5, motora: 6, total: 15 })).toBe(true);
    expect(aceita('GLASGOW', { ocular: 4, verbal: 5, motora: 6, total: 14 })).toBe(false);
    expect(aceita('GLASGOW', { ocular: 5, verbal: 5, motora: 6, total: 16 })).toBe(false);
  });

  it('TRIAGEM: classificacao compativel com o protocolo', () => {
    expect(aceita('TRIAGEM', { protocolo: 'MANCHESTER', classificacao: 'LARANJA' })).toBe(true);
    expect(aceita('TRIAGEM', { protocolo: 'START', classificacao: 'PRETO' })).toBe(true);
    expect(aceita('TRIAGEM', { protocolo: 'START', classificacao: 'LARANJA' })).toBe(false);
    expect(aceita('TRIAGEM', { protocolo: 'MANCHESTER', classificacao: 'PRETO' })).toBe(false);
    expect(aceita('TRIAGEM', { protocolo: 'OUTRO', classificacao: 'VERDE' })).toBe(false);
  });

  it('MEDICACAO: medicamentoId nulo = fora do catalogo, mas a chave e obrigatoria', () => {
    const dados = { medicamentoId: null, nome: 'Dipirona', dose: '1', unidade: 'g', via: 'EV' };
    expect(aceita('MEDICACAO', dados)).toBe(true);
    expect(aceita('MEDICACAO', { ...dados, medicamentoId: id })).toBe(true);
    expect(aceita('MEDICACAO', { ...dados, medicamentoId: undefined })).toBe(false);
    expect(aceita('MEDICACAO', { ...dados, via: ' ' })).toBe(false);
  });

  it('RETIFICACAO exige retificaEventoId e motivo; os demais tipos nao aceitam o campo', () => {
    expect(aceita('RETIFICACAO', { motivo: 'erro de digitação' })).toBe(false);
    expect(aceita('RETIFICACAO', { motivo: 'erro', dadosCorrigidos: { saturacao: 95 } }, { retificaEventoId: id })).toBe(true);
    expect(aceita('RETIFICACAO', {}, { retificaEventoId: id })).toBe(false);
    expect(aceita('OBSERVACAO', { texto: 'ok' }, { retificaEventoId: id })).toBe(false);
  });

  it('PROCEDIMENTO, OBSERVACAO, ENCERRAMENTO e tipo desconhecido', () => {
    expect(aceita('PROCEDIMENTO', { descricao: 'imobilização' })).toBe(true);
    expect(aceita('OBSERVACAO', { texto: '' })).toBe(false);
    expect(aceita('ENCERRAMENTO', { desfecho: 'removido' })).toBe(true);
    expect(aceita('ENCERRAMENTO', { destino: 'hospital' })).toBe(false);
    expect(aceita('CIRURGIA', {})).toBe(false);
  });

  it('atendimento aceita eventos iniciais sem atendimentoId', () => {
    const base = { id, pessoaId: id, iniciadoEm: agora };
    const inicial = { id, tipo: 'OBSERVACAO', ocorridoEm: agora, dados: { texto: 'consciente' } };
    expect(atendimentoEntradaSchema.safeParse({ ...base, eventos: [inicial] }).success).toBe(true);
    expect(atendimentoEntradaSchema.safeParse({ ...base, eventos: [{ ...inicial, atendimentoId: id }] }).success).toBe(false);
    expect(atendimentoEntradaSchema.safeParse({ ...base, latitude: 91 }).success).toBe(false);
  });
});

describe('Mike e Jaiminho', () => {
  it('login, lote de logs e envio de e-mail', () => {
    expect(loginEntradaSchema.safeParse({ tipoRegistro: 'CRM', registro: '100001', uf: 'RS', senha: 'x' }).success).toBe(true);
    expect(loginEntradaSchema.safeParse({ tipoRegistro: 'CRO', registro: '1', senha: 'x' }).success).toBe(false);
    const log = { id, ocorridoEm: agora, acao: 'LOGIN', resultado: 'SUCESSO', estavaOnline: false };
    expect(logsEntradaSchema.safeParse({ logs: [log] }).success).toBe(true);
    expect(logsEntradaSchema.safeParse({ logs: Array(501).fill(log) }).success).toBe(false);
    expect(envioEntradaSchema.safeParse({ destinatarioNome: 'A', destinatarioEmail: 'a@b.co', vinculo: 'FAMILIAR' }).success).toBe(true);
    expect(envioEntradaSchema.safeParse({ destinatarioNome: 'A', destinatarioEmail: 'sem-arroba', vinculo: 'FAMILIAR' }).success).toBe(false);
  });
});

describe('caracteres de controle (D-QA-07)', () => {
  const pessoa = (nome: string) => pessoaEntradaSchema.safeParse({ id, nome, editadoEm: agora }).success;

  it('NUL e demais caracteres de controle sao rejeitados em texto; \\n, \\r e \\t passam', () => {
    expect(pessoa('QA\u0000nul')).toBe(false);
    expect(pessoa('sino\u0007')).toBe(false);
    expect(pessoa('del\u007f')).toBe(false);
    expect(pessoa('Maria\tda Silva')).toBe(true);
    expect(aceita('OBSERVACAO', { texto: 'linha 1\r\nlinha 2' })).toBe(true);
    expect(aceita('OBSERVACAO', { texto: 'linha 1\u0000' })).toBe(false);
    expect(aceita('MEDICACAO', { medicamentoId: null, nome: 'A', dose: '1\u0001', unidade: 'g', via: 'EV' })).toBe(false);
  });

  it('vale tambem para busca, cursor, login e o detalhe livre do log', () => {
    expect(pessoasQuerySchema.safeParse({ busca: 'a\u0000' }).success).toBe(false);
    expect(paginacaoQuerySchema.safeParse({ cursor: 'a\u0000' }).success).toBe(false);
    expect(loginEntradaSchema.safeParse({ tipoRegistro: 'CRM', registro: '1\u0000', senha: 'x' }).success).toBe(false);
    const log = { id, ocorridoEm: agora, acao: 'LOGIN', resultado: 'SUCESSO', estavaOnline: false };
    expect(logsEntradaSchema.safeParse({ logs: [{ ...log, detalhe: { a: { b: 'x\u0000' } } }] }).success).toBe(false);
    expect(logsEntradaSchema.safeParse({ logs: [{ ...log, detalhe: { a: { b: 'x' } } }] }).success).toBe(true);
  });
});

describe('dadosCorrigidos da retificacao (D-QA-21)', () => {
  const retificacao = (dadosCorrigidos: unknown) =>
    aceita('RETIFICACAO', { motivo: 'erro', dadosCorrigidos }, { retificaEventoId: id });

  it('so valores simples, sem objeto aninhado, sem caractere de controle e com teto de campos', () => {
    expect(retificacao({ saturacao: 95, via: 'EV', conferido: true, destino: null })).toBe(true);
    expect(retificacao({ dados: { aninhado: 1 } })).toBe(false);
    expect(retificacao({ lista: [1, 2] })).toBe(false);
    expect(retificacao({ via: 'EV\u0000' })).toBe(false);
    expect(retificacao(Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`c${i}`, i])))).toBe(false);
  });
});
