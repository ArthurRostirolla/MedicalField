import { describe, expect, it } from 'vitest';
import { ExecutorComandos, type ContextoComando } from '../src/aplicacao/comando.ts';
import { CampoMaisRecente } from '../src/dominio/conflito/campo-mais-recente.ts';
import { RegistroEstrategias } from '../src/dominio/conflito/registro.ts';
import { RevisaoManual } from '../src/dominio/conflito/revisao-manual.ts';
import { ServidorVence } from '../src/dominio/conflito/servidor-vence.ts';
import { UniaoImutavel } from '../src/dominio/conflito/uniao-imutavel.ts';
import { ErroAplicacao } from '../src/dominio/erros.ts';
import { hashDoCorpo, jsonCanonico } from '../src/dominio/hash.ts';
import { limitarAoServidor } from '../src/dominio/relogio.ts';
import type { OperacaoSync, RegistroAuditoria, RepositorioClinico, UnidadeDeTrabalho } from '../src/dominio/repositorios.ts';
import { traduzirErro } from '../src/http/filtro-erros.ts';
import { criarListaDeProxies, resolverIpCliente } from '../src/http/ip-cliente.ts';

describe('estrategias de conflito', () => {
  it('UniaoImutavel: so entra o que ainda nao existe, sem repetir dentro do lote', () => {
    const decisao = new UniaoImutavel().resolver([{ id: 'a' }], [{ id: 'a' }, { id: 'b' }, { id: 'b' }, { id: 'c' }]);
    expect(decisao.novos.map((r) => r.id)).toEqual(['b', 'c']);
    expect(decisao.repetidos.map((r) => r.id)).toEqual(['a', 'b']);
  });

  describe('CampoMaisRecente', () => {
    const atual = {
      valores: { nome: 'Ana', telefone: '111', cpf: null },
      carimbos: { telefone: '2026-11-17T12:00:00.000Z' },
    };
    const resolver = (campos: Record<string, unknown>, editadoEm: string) =>
      new CampoMaisRecente().resolver(atual, { campos, editadoEm });

    it('edicao mais antiga que o carimbo do campo e descartada; os outros campos entram', () => {
      const decisao = resolver({ telefone: '999', nome: 'Ana Maria' }, '2026-11-17T11:00:00.000Z');
      expect(decisao.descartados).toEqual(['telefone']);
      expect(decisao.aplicados).toEqual({ nome: 'Ana Maria' });
      expect(decisao.anteriores).toEqual({ nome: 'Ana' });
      expect(decisao.carimbos).toEqual({ telefone: '2026-11-17T12:00:00.000Z', nome: '2026-11-17T11:00:00.000Z' });
    });

    it('edicao mais nova vence e guarda o valor anterior', () => {
      const decisao = resolver({ telefone: '999' }, '2026-11-17T13:00:00.000Z');
      expect(decisao.aplicados).toEqual({ telefone: '999' });
      expect(decisao.anteriores).toEqual({ telefone: '111' });
      expect(decisao.carimbos.telefone).toBe('2026-11-17T13:00:00.000Z');
    });

    it('empate mantem o servidor; valor igual so atualiza o carimbo', () => {
      expect(resolver({ telefone: '999' }, '2026-11-17T12:00:00.000Z').descartados).toEqual(['telefone']);
      const igual = resolver({ nome: 'Ana' }, '2026-11-17T13:00:00.000Z');
      expect(igual.aplicados).toEqual({});
      expect(igual.carimbos.nome).toBe('2026-11-17T13:00:00.000Z');
    });
  });

  it('ServidorVence: devolve o que o servidor tem, ignorando o cliente', () => {
    const servidor = { id: 'm1', nome: 'Do catálogo' };
    expect(new ServidorVence().resolver(servidor, { id: 'm1', nome: 'Alterado no cliente' })).toBe(servidor);
    expect(new ServidorVence().resolver(null, { id: 'm2' })).toBeNull();
  });

  it('RevisaoManual: sempre aceita e aponta a pessoa mais antiga parecida', () => {
    const estrategia = new RevisaoManual();
    expect(estrategia.resolver([{ id: 'antiga' }, { id: 'nova' }], { id: 'x' })).toEqual({
      aceitar: true,
      possivelDuplicataDe: 'antiga',
    });
    expect(estrategia.resolver([], { id: 'x' })).toEqual({ aceitar: true, possivelDuplicataDe: null });
    expect(estrategia.resolver([{ id: 'x' }], { id: 'x' }).possivelDuplicataDe).toBeNull();
  });

  it('o registro escolhe a estrategia pelo tipo de dado', () => {
    const registro = new RegistroEstrategias();
    expect(registro.para('evento').nome).toBe('UniaoImutavel');
    expect(registro.para('prontuarioItem').nome).toBe('UniaoImutavel');
    expect(registro.para('pessoa').nome).toBe('CampoMaisRecente');
    expect(registro.para('medicamento').nome).toBe('ServidorVence');
    expect(registro.para('pessoaDuplicada').nome).toBe('RevisaoManual');
  });
});

describe('hash do corpo canonico', () => {
  it('nao depende da ordem das chaves, mas depende dos valores e da ordem das listas', () => {
    const a = { id: '1', dados: { x: 1, y: [1, 2] }, nome: 'Ana' };
    const b = { nome: 'Ana', dados: { y: [1, 2], x: 1 }, id: '1' };
    expect(jsonCanonico(a)).toBe('{"dados":{"x":1,"y":[1,2]},"id":"1","nome":"Ana"}');
    expect(hashDoCorpo(a)).toBe(hashDoCorpo(b));
    expect(hashDoCorpo(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoCorpo({ ...a, nome: 'ana' })).not.toBe(hashDoCorpo(a));
    expect(hashDoCorpo({ ...a, dados: { x: 1, y: [2, 1] } })).not.toBe(hashDoCorpo(a));
    expect(hashDoCorpo(undefined)).toBe(hashDoCorpo(null));
  });
});

describe('relogio adiantado', () => {
  const agora = new Date('2026-11-17T21:00:00.000Z');

  it('ate 5 min a frente (ou no passado) fica como veio', () => {
    expect(limitarAoServidor('ocorridoEm', '2026-11-17T21:05:00.000Z', agora)).toEqual({
      valor: '2026-11-17T21:05:00.000Z',
      observacao: null,
    });
    expect(limitarAoServidor('ocorridoEm', '2026-11-10T08:00:00.000Z', agora).valor).toBe('2026-11-10T08:00:00.000Z');
  });

  it('mais de 5 min a frente e limitado ao horario do servidor, com observacao', () => {
    const conferido = limitarAoServidor('ocorridoEm', '2026-11-17T21:05:00.001Z', agora);
    expect(conferido.valor).toBe('2026-11-17T21:00:00.000Z');
    expect(conferido.observacao).toContain('ocorridoEm adiantado (2026-11-17T21:05:00.001Z)');
  });
});

describe('idempotencia (ExecutorComandos)', () => {
  /** Unidade de trabalho em memoria: so o que o executor usa. */
  function montar() {
    const operacoes = new Map<string, OperacaoSync>();
    const auditorias: RegistroAuditoria[] = [];
    const repositorio = {
      travarChave: async () => {},
      buscarOperacao: async (opId: string) => operacoes.get(opId) ?? null,
      registrarOperacao: async (operacao: OperacaoSync) => void operacoes.set(operacao.opId, operacao),
      registrarAuditoria: async (registro: RegistroAuditoria) => void auditorias.push(registro),
    } as unknown as RepositorioClinico;
    const unidade: UnidadeDeTrabalho = { leitura: repositorio, transacao: (trabalho) => trabalho(repositorio) };
    return { executor: new ExecutorComandos(unidade), operacoes, auditorias };
  }
  const contexto = (corpo: unknown, chave: string | null = 'chave-1'): ContextoComando => ({
    autor: { profissionalId: 'p1', profissionalNome: 'Profissional', dispositivoId: null },
    chaveIdempotencia: chave,
    hashCorpo: hashDoCorpo(corpo),
    metodo: 'POST',
    rota: '/api/v1/pessoa',
    agora: new Date(),
  });

  it('primeira vez executa e registra; repeticao devolve a resposta original com 200 sem executar', async () => {
    const { executor, operacoes, auditorias } = montar();
    let execucoes = 0;
    const acao = async (_: RepositorioClinico, auditar: Parameters<Parameters<ExecutorComandos['executar']>[2]>[1]) => {
      execucoes += 1;
      await auditar({ entidade: 'pessoa', entidadeId: 'e1', acao: 'CRIACAO' });
      return { status: 201 as const, corpo: { id: 'e1', versao: execucoes } };
    };

    expect(await executor.executar(contexto({ a: 1, b: 2 }), 'e1', acao)).toEqual({ status: 201, corpo: { id: 'e1', versao: 1 } });
    expect(await executor.executar(contexto({ b: 2, a: 1 }), 'e1', acao)).toEqual({ status: 200, corpo: { id: 'e1', versao: 1 } });
    expect(execucoes).toBe(1);
    expect(operacoes.get('chave-1')).toMatchObject({ statusHttp: 201, entidadeId: 'e1', rota: '/api/v1/pessoa' });
    expect(auditorias).toEqual([expect.objectContaining({ opId: 'chave-1', autor: expect.objectContaining({ profissionalId: 'p1' }) })]);
  });

  it('mesma chave com corpo diferente -> CHAVE_IDEMPOTENCIA_CONFLITANTE', async () => {
    const { executor } = montar();
    const acao = async () => ({ status: 201 as const, corpo: {} });
    await executor.executar(contexto({ a: 1 }), 'e1', acao);
    await expect(executor.executar(contexto({ a: 2 }), 'e1', acao)).rejects.toMatchObject({
      codigo: 'CHAVE_IDEMPOTENCIA_CONFLITANTE',
      status: 422,
    });
  });

  it('sem chave nao registra operacao e sempre executa', async () => {
    const { executor, operacoes } = montar();
    let execucoes = 0;
    const acao = async () => ({ status: 200 as const, corpo: (execucoes += 1) });
    await executor.executar(contexto({}, null), 'e1', acao);
    await executor.executar(contexto({}, null), 'e1', acao);
    expect(execucoes).toBe(2);
    expect(operacoes.size).toBe(0);
  });
});

describe('IP do cliente', () => {
  const proxies = criarListaDeProxies(['127.0.0.1/32', '::1/128', '10.42.0.0/16']);

  it('par direto nao confiavel: ignora X-Forwarded-For (pode ser forjado)', () => {
    expect(resolverIpCliente('203.0.113.9', '1.2.3.4', proxies)).toBe('203.0.113.9');
  });

  it('par direto confiavel: IP mais a direita que nao seja proxy confiavel', () => {
    expect(resolverIpCliente('::ffff:127.0.0.1', '6.6.6.6, 198.51.100.7, 10.42.0.5', proxies)).toBe('198.51.100.7');
    expect(resolverIpCliente('10.42.1.1', '198.51.100.7', proxies)).toBe('198.51.100.7');
  });

  it('par direto confiavel sem cabecalho (ou so com proxies): vale o par direto', () => {
    expect(resolverIpCliente('127.0.0.1', undefined, proxies)).toBe('127.0.0.1');
    expect(resolverIpCliente('::1', '10.42.0.5, lixo', proxies)).toBe('::1');
  });

  it('CIDR invalido impede a partida', () => {
    expect(() => criarListaDeProxies(['nao-e-ip/8'])).toThrow(/PROXIES_CONFIAVEIS/);
  });
});

describe('traducao de erros', () => {
  it('erro desconhecido vira ERRO_INTERNO sem vazar a mensagem', () => {
    const traduzido = traduzirErro(new Error('senha do banco = 123'));
    expect(traduzido).toMatchObject({ codigo: 'ERRO_INTERNO', status: 500, message: 'Erro interno.' });
  });

  it('banco fora vira 503; corpo JSON quebrado vira 422', () => {
    expect(traduzirErro(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })).codigo).toBe('SERVICO_INDISPONIVEL');
    expect(traduzirErro(Object.assign(new Error('x'), { code: '57P01' })).status).toBe(503);
    expect(traduzirErro(Object.assign(new SyntaxError('Unexpected token'), { status: 400 })).codigo).toBe('VALIDACAO');
    expect(traduzirErro(new ErroAplicacao('NAO_ENCONTRADO', 'x')).status).toBe(404);
  });
});
