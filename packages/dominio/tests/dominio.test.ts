import { resumoSchema, type Evento } from '@medicalfield/contratos';
import { describe, expect, it } from 'vitest';
import { calcularResumo, calcularTotalGlasgow, ordenarLinhaDoTempo, type EventoDaLinhaDoTempo } from '../src/index.ts';

const ev = (id: string, tipo: EventoDaLinhaDoTempo['tipo'], minuto: number, dados: object, retificaEventoId?: string) => ({
  id,
  tipo,
  ocorridoEm: `2026-11-17T21:${String(minuto).padStart(2, '0')}:00.000Z`,
  dados,
  ...(retificaEventoId ? { retificaEventoId } : {}),
});

describe('calcularTotalGlasgow', () => {
  it('soma os tres componentes', () => {
    expect(calcularTotalGlasgow({ ocular: 4, verbal: 5, motora: 6 })).toBe(15);
    expect(calcularTotalGlasgow({ ocular: 1, verbal: 1, motora: 1 })).toBe(3);
  });
});

describe('ordenarLinhaDoTempo', () => {
  it('ordena por ocorridoEm, desempata pelo id e nao altera a entrada', () => {
    const entrada = [ev('c', 'OBSERVACAO', 5, {}), ev('b', 'OBSERVACAO', 1, {}), ev('a', 'OBSERVACAO', 5, {})];
    expect(ordenarLinhaDoTempo(entrada).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(entrada.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });
});

describe('calcularResumo', () => {
  const medicacao = (nome: string) => ({ medicamentoId: null, nome, dose: '1', unidade: 'amp', via: 'EV' });
  const eventos = [
    ev('sv2', 'SINAIS_VITAIS', 10, { saturacao: 80 }),
    ev('sv1', 'SINAIS_VITAIS', 2, { saturacao: 97 }),
    ev('g1', 'GLASGOW', 3, { ocular: 4, verbal: 5, motora: 6, total: 15 }),
    ev('t1', 'TRIAGEM', 4, { protocolo: 'START', classificacao: 'AMARELO' }),
    ev('m1', 'MEDICACAO', 5, medicacao('Medicamento A')),
    ev('m2', 'MEDICACAO', 6, medicacao('Medicamento B')),
    ev('p1', 'PROCEDIMENTO', 7, { descricao: 'imobilização' }),
    ev('o1', 'OBSERVACAO', 8, { texto: 'consciente' }),
    ev('r1', 'RETIFICACAO', 11, { motivo: 'valor digitado errado' }, 'sv2'),
    ev('r2', 'RETIFICACAO', 12, { motivo: 'medicação não aplicada' }, 'm2'),
    ev('e1', 'ENCERRAMENTO', 20, { desfecho: 'removido' }),
  ];
  const itens = [
    { tipo: 'ALERGIA' as const, descricao: 'B', registradoEm: '2026-01-02T00:00:00.000Z', inativadoEm: null },
    { tipo: 'ALERGIA' as const, descricao: 'A', registradoEm: '2026-01-01T00:00:00.000Z', inativadoEm: null },
    { tipo: 'ALERGIA' as const, descricao: 'inativa', inativadoEm: '2026-02-01T00:00:00.000Z' },
    { tipo: 'COMORBIDADE' as const, descricao: 'C1', inativadoEm: null },
    { tipo: 'MEDICACAO_CONTINUA' as const, descricao: 'MC1', inativadoEm: null },
  ];
  const resumo = calcularResumo(eventos, itens);

  it('devolve exatamente o tipo Resumo do contrato', () => {
    expect(Object.keys(resumo).sort()).toEqual(Object.keys(resumoSchema.shape).sort());
    expect(resumoSchema.safeParse(resumo).success).toBe(true);
  });

  it('evento retificado deixa de contar', () => {
    expect(resumo.ultimosSinaisVitais).toEqual({ ocorridoEm: '2026-11-17T21:02:00.000Z', dados: { saturacao: 97 } });
    expect(resumo.medicacoes).toEqual([
      { ocorridoEm: '2026-11-17T21:05:00.000Z', nome: 'Medicamento A', dose: '1', unidade: 'amp', via: 'EV' },
    ]);
  });

  it('traz o mais recente de cada tipo e as listas em ordem', () => {
    expect(resumo.glasgowMaisRecente?.dados).toMatchObject({ total: 15 });
    expect(resumo.triagem?.dados).toEqual({ protocolo: 'START', classificacao: 'AMARELO' });
    expect(resumo.procedimentos).toEqual([{ ocorridoEm: '2026-11-17T21:07:00.000Z', descricao: 'imobilização' }]);
    expect(resumo.encerramento).toEqual({ ocorridoEm: '2026-11-17T21:20:00.000Z', desfecho: 'removido', destino: null });
  });

  it('item inativado nao entra', () => {
    expect(resumo.alergias).toEqual(['A', 'B']);
    expect(resumo.comorbidades).toEqual(['C1']);
    expect(resumo.medicacoesContinuas).toEqual(['MC1']);
  });

  it('sem eventos nem itens: tudo vazio', () => {
    expect(calcularResumo([], [])).toEqual({
      ultimosSinaisVitais: null,
      glasgowMaisRecente: null,
      triagem: null,
      medicacoes: [],
      procedimentos: [],
      alergias: [],
      comorbidades: [],
      medicacoesContinuas: [],
      encerramento: null,
    });
  });

  it('aceita o tipo Evento do contrato (checagem de tipos)', () => {
    const doServidor: Evento[] = [];
    expect(calcularResumo(doServidor, []).medicacoes).toEqual([]);
  });
});
