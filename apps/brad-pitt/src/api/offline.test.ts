import { CABECALHOS, pessoaSchema } from '@medicalfield/contratos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erro, ficha, HELENA, json, simularApi, uuid } from '../teste/apoio';
import { cadastrarPessoa, cadastrarProntuario, listarAtendimentos, obterFicha, registrarAtendimento, registrarEvento } from './recursos';
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

  it('atendimento inteiro offline: paciente novo, abertura, registros e encerramento aparecem na ficha sem nenhuma requisição', async () => {
    const { chamadas } = simularApi(() => undefined);
    definirSimulacao(true);
    const [pessoaId, prontuarioId, atendimentoId] = [uuid(10), uuid(11), uuid(12)];
    const agora = '2026-11-18T10:00:00.000Z';
    await cadastrarPessoa({ id: pessoaId, nome: 'Maria Souza', editadoEm: agora });
    await cadastrarProntuario({ id: prontuarioId, pessoaId, itens: [{ id: uuid(13), tipo: 'ALERGIA', descricao: 'Dipirona', registradoEm: agora }] });
    await registrarAtendimento({ id: atendimentoId, pessoaId, iniciadoEm: agora, queixaPrincipal: 'Queda' });
    await registrarEvento({ id: uuid(14), atendimentoId, ocorridoEm: '2026-11-18T10:05:00.000Z', tipo: 'SINAIS_VITAIS', dados: { frequenciaCardiaca: 98 } });
    await registrarEvento({ id: uuid(15), atendimentoId, ocorridoEm: '2026-11-18T10:30:00.000Z', tipo: 'ENCERRAMENTO', dados: { desfecho: 'Removida ao HPS' } });

    const ficha = await obterFicha(atendimentoId);
    expect(ficha.pessoa.nome).toBe('Maria Souza');
    expect(ficha.atendimento).toMatchObject({ queixaPrincipal: 'Queda', status: 'ENCERRADO', profissionalNome: HELENA.nome, prontuarioId });
    expect(ficha.eventos.map((e) => e.tipo)).toEqual(['SINAIS_VITAIS', 'ENCERRAMENTO']);
    expect(ficha.resumo).toMatchObject({ alergias: ['Dipirona'], ultimosSinaisVitais: { dados: { frequenciaCardiaca: 98 } } });
    expect((await listarAtendimentos({})).itens.map((a) => [a.id, a.pessoaNome])).toEqual([[atendimentoId, 'Maria Souza']]);
    expect(chamadas).toHaveLength(0);
  });

  it('atendimento já lido do servidor: offline, a última leitura volta com os registros da fila por cima', async () => {
    const doServidor = ficha();
    const id = doServidor.atendimento.id;
    simularApi((c) => (c.caminho === `/ficha/${id}` ? json(doServidor) : undefined));
    await obterFicha(id); // online: guarda a leitura
    definirSimulacao(true);
    await registrarEvento({ id: uuid(99), atendimentoId: id, ocorridoEm: new Date().toISOString(), tipo: 'OBSERVACAO', dados: { texto: 'Consciente' } });
    const offline = await obterFicha(id);
    expect(offline.eventos).toHaveLength(doServidor.eventos.length + 1);
    expect(offline.eventos.at(-1)).toMatchObject({ id: uuid(99), profissionalNome: HELENA.nome });
  });
});
