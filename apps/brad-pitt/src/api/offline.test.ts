import { CABECALHOS, pessoaSchema } from '@medicalfield/contratos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erro, HELENA, json, simularApi } from '../teste/apoio';
import { ErroApi, reiniciarSessaoParaTeste } from './cliente';
import { definirSimulacao, escrever, iniciarOffline, lerOffline, reiniciarOfflineParaTeste, sincronizar } from './offline';

beforeEach(() => {
  localStorage.clear();
  reiniciarOfflineParaTeste();
  reiniciarSessaoParaTeste({ situacao: 'ativa', profissional: HELENA }, 'token-inicial');
});
afterEach(() => vi.unstubAllGlobals());

describe('modo offline do portal', () => {
  it('simulando, a escrita vai para a fila persistida e nenhuma requisição sai; ao voltar, sobe em ordem com o opId', async () => {
    const { chamadas } = simularApi((c) => json(c.corpo, 201));
    definirSimulacao(true);
    await escrever('/pessoa', pessoaSchema, { id: 'p1' }, 'Cadastro');
    await escrever('/atendimento', pessoaSchema, { id: 'a1' }, 'Atendimento');
    expect(chamadas).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('mf-portal-offline')!).fila).toHaveLength(2);

    definirSimulacao(false);
    await sincronizar();
    expect(chamadas.map((c) => c.caminho)).toEqual(['/pessoa', '/atendimento']);
    expect(chamadas[0]?.cabecalhos.get(CABECALHOS.chaveIdempotencia)).toMatch(/[0-9a-f-]{36}/);
    expect(lerOffline().fila).toHaveLength(0);
  });

  it('sem resposta para no comando (fica na fila); 4xx é rejeição definitiva e sai da fila', async () => {
    let fora = true;
    simularApi((c) => {
      if (fora) throw new TypeError('rede');
      return c.caminho === '/pessoa' ? erro(422, 'VALIDACAO', 'CPF inválido.') : json(c.corpo, 201);
    });
    await escrever('/pessoa', pessoaSchema, { id: 'p1' }, 'Cadastro'); // rede caiu de verdade: enfileirou
    await sincronizar();
    expect(lerOffline().fila).toHaveLength(1);

    fora = false;
    const avisar = vi.fn();
    const desligar = iniciarOffline(avisar);
    await sincronizar();
    desligar();
    expect(avisar.mock.calls.flat(2).map((r) => r.motivo)).toEqual(['CPF inválido.']);
    expect(lerOffline().fila).toHaveLength(0);
  });

  it('online e sem fila, erro de validação volta direto para a tela', async () => {
    simularApi(() => erro(422, 'VALIDACAO', 'CPF inválido.'));
    await expect(escrever('/pessoa', pessoaSchema, { id: 'p1' }, 'Cadastro')).rejects.toBeInstanceOf(ErroApi);
    expect(lerOffline().fila).toHaveLength(0);
  });
});
