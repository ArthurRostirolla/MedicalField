import { medicamentoSchema, paginaSchema } from '@medicalfield/contratos';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { erro, HELENA, json, medicamento, sessaoDe, simularApi } from '../teste/apoio';
import { api, entrar, ErroApi, lerSessao, reiniciarSessaoParaTeste, restaurarSessao, sair } from './cliente';

const pagina = paginaSchema(medicamentoSchema);
const lista = { itens: [medicamento(1, 'Adrenalina')], proximoCursor: null };

beforeEach(() => {
  localStorage.clear();
  reiniciarSessaoParaTeste({ situacao: 'ativa', profissional: HELENA }, 'token-inicial');
});
afterEach(() => vi.unstubAllGlobals());

describe('cliente HTTP', () => {
  it('chama o caminho relativo com o token e valida a resposta pelo contrato', async () => {
    const { chamadas } = simularApi(() => json(lista));
    await expect(api('/medicamento', pagina, { consulta: { limite: 50, cursor: undefined, incluirInativos: false } })).resolves.toEqual(lista);
    expect(chamadas[0]?.caminho).toBe('/medicamento');
    expect(chamadas[0]?.consulta.toString()).toBe('limite=50');
    expect(chamadas[0]?.cabecalhos.get('Authorization')).toBe('Bearer token-inicial');
  });

  it('converte o corpo de erro padrão em ErroApi, com detalhes e requestId', async () => {
    simularApi(() => erro(422, 'VALIDACAO', 'Corpo inválido.', [{ campo: 'destinatarioEmail', mensagem: 'e-mail inválido' }]));
    const falha = await api('/medicamento', pagina).catch((e: unknown) => e);
    expect(falha).toBeInstanceOf(ErroApi);
    expect(falha).toMatchObject({
      status: 422,
      codigo: 'VALIDACAO',
      message: 'Corpo inválido.',
      requestId: 'req-123',
      detalhes: [{ campo: 'destinatarioEmail', mensagem: 'e-mail inválido' }],
      transitorio: false,
    });
  });

  it('trata 5xx sem o corpo do contrato (serviço parado atrás do proxy) como serviço indisponível', async () => {
    simularApi(() => new Response('Bad Gateway', { status: 502 }));
    await expect(api('/medicamento', pagina)).rejects.toMatchObject({ codigo: 'SERVICO_INDISPONIVEL', transitorio: true });
  });

  it('trata falha de rede como SEM_CONEXAO', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/medicamento', pagina)).rejects.toMatchObject({ status: null, codigo: 'SEM_CONEXAO', transitorio: true });
  });

  it('recusa resposta fora do contrato', async () => {
    simularApi(() => json({ itens: [{ id: 'não-é-uuid' }], proximoCursor: null }));
    await expect(api('/medicamento', pagina)).rejects.toMatchObject({ codigo: 'RESPOSTA_INVALIDA' });
  });
});

describe('renovação do token em 401', () => {
  it('renova uma vez pelo cookie e repete a chamada com o token novo', async () => {
    const { chamadas, para } = simularApi((c) => {
      if (c.caminho === '/auth/refresh') return json(sessaoDe(HELENA, 'token-renovado'));
      return c.cabecalhos.get('Authorization') === 'Bearer token-renovado' ? json(lista) : erro(401, 'NAO_AUTENTICADO');
    });
    await expect(api('/medicamento', pagina)).resolves.toEqual(lista);
    expect(chamadas.map((c) => c.caminho)).toEqual(['/medicamento', '/auth/refresh', '/medicamento']);
    // O refresh vai pelo cookie HttpOnly: o corpo não leva token nenhum.
    expect(para('/auth/refresh', 'POST')[0]?.corpo).toEqual({});
  });

  it('chamadas simultâneas dividem a mesma renovação (o refresh token é rotativo)', async () => {
    const { para } = simularApi((c) => {
      if (c.caminho === '/auth/refresh') return json(sessaoDe(HELENA, 'token-renovado'));
      return c.cabecalhos.get('Authorization') === 'Bearer token-renovado' ? json(lista) : erro(401, 'NAO_AUTENTICADO');
    });
    await Promise.all([api('/medicamento', pagina), api('/medicamento', pagina), api('/medicamento', pagina)]);
    expect(para('/auth/refresh', 'POST')).toHaveLength(1);
  });

  it('não insiste: se o 401 volta depois de renovar, o erro sobe', async () => {
    const { para } = simularApi((c) => (c.caminho === '/auth/refresh' ? json(sessaoDe(HELENA)) : erro(401, 'NAO_AUTENTICADO')));
    await expect(api('/medicamento', pagina)).rejects.toMatchObject({ status: 401 });
    expect(para('/medicamento')).toHaveLength(2);
    expect(para('/auth/refresh', 'POST')).toHaveLength(1);
  });

  it('refresh recusado encerra a sessão local', async () => {
    simularApi(() => erro(401, 'NAO_AUTENTICADO'));
    await expect(api('/medicamento', pagina)).rejects.toMatchObject({ codigo: 'NAO_AUTENTICADO' });
    expect(lerSessao()).toEqual({ situacao: 'anonima' });
  });
});

describe('sessão', () => {
  it('login guarda o profissional; logout avisa o servidor e limpa', async () => {
    reiniciarSessaoParaTeste({ situacao: 'anonima' });
    const { para } = simularApi((c) => (c.caminho === '/auth/login' ? json(sessaoDe(HELENA)) : new Response(null, { status: 204 })));
    await entrar({ tipoRegistro: 'CRM', registro: '100001', uf: 'RS', senha: 'qualquer' });
    expect(lerSessao()).toEqual({ situacao: 'ativa', profissional: HELENA });
    await sair();
    expect(para('/auth/logout', 'POST')[0]?.cabecalhos.get('Authorization')).toBe('Bearer token-novo');
    expect(lerSessao()).toEqual({ situacao: 'anonima' });
  });

  it('ao recarregar a página, tenta o refresh antes de mandar para o login', async () => {
    reiniciarSessaoParaTeste({ situacao: 'ativa', profissional: HELENA }, 'x'); // deixa a marca de "já entrou"
    reiniciarSessaoParaTeste(); // página recarregada: sem token em memória
    const { para } = simularApi(() => json(sessaoDe(HELENA)));
    await restaurarSessao();
    expect(para('/auth/refresh', 'POST')).toHaveLength(1);
    expect(lerSessao()).toMatchObject({ situacao: 'ativa' });
  });

  it('quem nunca entrou neste navegador vai direto ao login, sem chamada', async () => {
    reiniciarSessaoParaTeste();
    localStorage.clear();
    const { chamadas } = simularApi(() => erro(401, 'NAO_AUTENTICADO'));
    await restaurarSessao();
    expect(chamadas).toHaveLength(0);
    expect(lerSessao()).toEqual({ situacao: 'anonima' });
  });
});
