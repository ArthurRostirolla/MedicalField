// Integracao contra Postgres real (banco isolado mf_teste_cida) com a aplicacao inteira no ar.
// Preparo: bash scripts/dev-db.sh criar-banco mf_teste_cida && bash scripts/dev-db.sh migrar mf_teste_cida
// O emissor do token (MikeBaguncinha) e substituido por um par Ed25519 e um JWKS local.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fichaSchema, type Alteracoes } from '@medicalfield/contratos';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarAplicacao } from '../src/aplicacao-http.ts';
import { ServidorDeGestao } from '../src/http/gestao.ts';

const URL_SERVICO = process.env.TESTE_DATABASE_URL ?? 'postgres://mf_cida:dev_cida@localhost:5544/mf_teste_cida';
const URL_ADMIN = process.env.TESTE_DATABASE_URL_ADMIN ?? 'postgres://postgres:dev_admin@localhost:5544/mf_teste_cida';

const PROFISSIONAL_ID = randomUUID();
const DISPOSITIVO_ID = randomUUID();

let app: NestExpressApplication;
let jwks: Server;
let admin: pg.Client;
let base: string;
let baseGestao: string;
let assinar: (expiraEm?: string | number, emissor?: string, profissionalId?: string) => Promise<string>;
let token: string;

type Resposta = { status: number; corpo: any; requestId: string | null };
type Opcoes = { corpo?: unknown; chave?: string; token?: string | null; cabecalhos?: Record<string, string> };

async function api(metodo: string, caminho: string, opcoes: Opcoes = {}): Promise<Resposta> {
  const autorizacao = opcoes.token === null ? undefined : (opcoes.token ?? token);
  const resposta = await fetch(`${base}/api/v1${caminho}`, {
    method: metodo,
    headers: {
      ...(autorizacao ? { authorization: `Bearer ${autorizacao}` } : {}),
      ...(opcoes.corpo !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opcoes.chave ? { 'idempotency-key': opcoes.chave } : {}),
      'x-dispositivo-id': DISPOSITIVO_ID,
      ...opcoes.cabecalhos,
    },
    body: opcoes.corpo === undefined ? undefined : typeof opcoes.corpo === 'string' ? opcoes.corpo : JSON.stringify(opcoes.corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null, requestId: resposta.headers.get('x-request-id') };
}

const sql = async (texto: string, valores: unknown[] = []): Promise<any[]> => (await admin.query(texto, valores)).rows;

const agora = (deslocamentoMs = 0): string => new Date(Date.now() + deslocamentoMs).toISOString();

/** Cria uma pessoa e devolve o id. */
async function novaPessoa(campos: Record<string, unknown> = {}): Promise<string> {
  const id = randomUUID();
  const resposta = await api('POST', '/pessoa', { corpo: { id, nome: `Pessoa Teste ${id.slice(0, 8)}`, editadoEm: agora(), ...campos } });
  expect(resposta.status).toBe(201);
  return id;
}

/** Percorre a descida ate o fim e devolve o cursor atual. */
async function cursorAtual(): Promise<string> {
  let cursor = '0';
  for (;;) {
    const { corpo } = await api('GET', `/sync/alteracoes?desde=${cursor}&limite=1000`);
    cursor = corpo.proximoCursor;
    if (!corpo.temMais) return cursor;
  }
}

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
  const chavePublica = { ...(await exportJWK(publicKey)), kid: 'teste-1', use: 'sig', alg: 'EdDSA' };
  jwks = createServer((_, resposta) => {
    resposta.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [chavePublica] }));
  });
  await new Promise<void>((resolver) => jwks.listen(0, '127.0.0.1', resolver));

  assinar = (expiraEm = '15m', emissor = 'medicalfield', profissionalId = PROFISSIONAL_ID) =>
    new SignJWT({ nome: 'Enf. Teste Integração', tipoRegistro: 'COREN', registro: '200002', uf: 'RS', papel: 'PROFISSIONAL' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'teste-1' })
      .setIssuer(emissor)
      .setSubject(profissionalId)
      .setIssuedAt()
      .setExpirationTime(expiraEm)
      .setJti(randomUUID())
      .sign(privateKey);
  token = await assinar();

  admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();

  app = await criarAplicacao({
    porta: 0,
    portaGestao: 0,
    databaseUrl: URL_SERVICO,
    jaiminhoUrl: null,
    jwksUrl: `http://127.0.0.1:${(jwks.address() as AddressInfo).port}/jwks.json`,
    proxiesConfiaveis: ['127.0.0.1/32', '::1/128'],
    ambiente: 'desenvolvimento',
    nivelLog: 'error',
  });
  await app.listen(0, '127.0.0.1');
  base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  baseGestao = `http://127.0.0.1:${app.get(ServidorDeGestao).porta}`;
});

afterAll(async () => {
  await app?.close();
  await admin?.end();
  jwks?.close();
});

describe('autenticacao e cadeia de middlewares', () => {
  it('rota sem token -> 401 no corpo padrao, com X-Request-Id', async () => {
    const resposta = await api('GET', '/medicamento', { token: null });
    expect(resposta.status).toBe(401);
    expect(resposta.corpo).toEqual({ codigo: 'NAO_AUTENTICADO', mensagem: expect.any(String), requestId: resposta.requestId });
    expect(resposta.requestId).toBeTruthy();
  });

  it('token expirado, de outro emissor ou adulterado -> 401', async () => {
    const umaHoraAtras = Math.floor(Date.now() / 1000) - 3600;
    expect((await api('GET', '/medicamento', { token: await assinar(umaHoraAtras) })).status).toBe(401);
    expect((await api('GET', '/medicamento', { token: await assinar('15m', 'outro-emissor') })).status).toBe(401);
    expect((await api('GET', '/medicamento', { token: `${token.slice(0, -4)}AAAA` })).status).toBe(401);
    expect((await api('POST', '/pessoa', { token: null, corpo: { qualquer: 'coisa' } })).status).toBe(401);
  });

  it('requisicao gera linha em auditoria.log_acesso (inclusive o 401), com o padrao da rota e o IP atras do proxy', async () => {
    const pessoaId = await novaPessoa();
    const ok = randomUUID();
    const negado = randomUUID();
    await api('GET', `/pessoa/${pessoaId}`, { cabecalhos: { 'x-request-id': ok, 'x-forwarded-for': '6.6.6.6, 198.51.100.7' } });
    await api('GET', `/pessoa/${pessoaId}`, { token: null, cabecalhos: { 'x-request-id': negado } });

    await expect
      .poll(async () => (await sql('select 1 from auditoria.log_acesso where request_id = any($1)', [[ok, negado]])).length, { timeout: 5000 })
      .toBe(2);
    const [linhaOk] = await sql('select * from auditoria.log_acesso where request_id = $1', [ok]);
    expect(linhaOk).toMatchObject({
      servico: 'dona-cida',
      metodo: 'GET',
      rota: '/api/v1/pessoa/{id}',
      status_code: 200,
      profissional_id: PROFISSIONAL_ID,
      ip_cliente: '198.51.100.7',
    });
    const [linhaNegada] = await sql('select * from auditoria.log_acesso where request_id = $1', [negado]);
    expect(linhaNegada).toMatchObject({ rota: '/api/v1/pessoa/{id}', status_code: 401, profissional_id: null });
  });

  it('porta de gestao: live e ready, sem token', async () => {
    const live = await fetch(`${baseGestao}/health/live`);
    expect([live.status, await live.json()]).toEqual([200, { status: 'ok' }]);
    expect((await fetch(`${baseGestao}/health/ready`)).status).toBe(200);
    // e a API nao serve health
    expect((await api('GET', '/health/live')).status).toBe(404);
  });

  it('todo erro sai no corpo padrao: 404, JSON quebrado, validacao por campo', async () => {
    const inexistente = await api('GET', `/pessoa/${randomUUID()}`);
    expect(inexistente).toMatchObject({ status: 404, corpo: { codigo: 'NAO_ENCONTRADO', requestId: inexistente.requestId } });
    expect((await api('GET', '/rota-que-nao-existe')).corpo.codigo).toBe('NAO_ENCONTRADO');
    const foraDoPrefixo = await fetch(`${base}/fora-do-prefixo`);
    expect([foraDoPrefixo.status, ((await foraDoPrefixo.json()) as { codigo: string }).codigo]).toEqual([404, 'NAO_ENCONTRADO']);
    expect((await api('POST', '/pessoa', { corpo: '{ quebrado' })).corpo.codigo).toBe('VALIDACAO');

    const invalida = await api('POST', '/pessoa', { corpo: { id: 'x', editadoEm: agora(), apelido: 'Zé' } });
    expect(invalida.status).toBe(422);
    expect(invalida.corpo.codigo).toBe('VALIDACAO');
    expect(invalida.corpo.detalhes.map((d: { campo: string }) => d.campo).sort()).toEqual(['apelido', 'id', 'nome']);
    expect((await api('GET', '/medicamento?limite=201')).status).toBe(422);
    expect((await api('GET', '/pessoa/nao-e-uuid')).status).toBe(422);
  });
});

describe('idempotencia (regra 1)', () => {
  it('mesmo POST com a mesma chave 2x -> 201 depois 200, mesma resposta e UMA linha', async () => {
    const id = randomUUID();
    const chave = randomUUID();
    const corpo = { id, nome: 'Pessoa Idempotente', editadoEm: agora(), telefone: '51 90000-0000' };

    const primeira = await api('POST', '/pessoa', { corpo, chave });
    const segunda = await api('POST', '/pessoa', { corpo: { telefone: corpo.telefone, editadoEm: corpo.editadoEm, nome: corpo.nome, id }, chave });
    expect(primeira.status).toBe(201);
    expect(segunda.status).toBe(200);
    expect(segunda.corpo).toEqual(primeira.corpo);

    expect(await sql('select count(*)::int as n from clinico.pessoa where id = $1', [id])).toEqual([{ n: 1 }]);
    const [operacao] = await sql('select * from clinico.operacao_sync where op_id = $1', [chave]);
    expect(operacao).toMatchObject({
      entidade_id: id,
      status_http: 201,
      metodo: 'POST',
      rota: '/api/v1/pessoa',
      profissional_id: PROFISSIONAL_ID,
      dispositivo_id: DISPOSITIVO_ID,
      resposta: primeira.corpo,
    });
    // dado, operacao_sync e auditoria_clinica na mesma transacao: exatamente uma auditoria, ligada a operacao
    expect(await sql('select acao, op_id from clinico.auditoria_clinica where entidade_id = $1', [id])).toEqual([
      { acao: 'CRIACAO', op_id: chave },
    ]);
  });

  it('mesma chave com corpo diferente -> 422 CHAVE_IDEMPOTENCIA_CONFLITANTE e nada e gravado', async () => {
    const chave = randomUUID();
    const id = randomUUID();
    const outroId = randomUUID();
    expect((await api('POST', '/pessoa', { corpo: { id, nome: 'Original', editadoEm: agora() }, chave })).status).toBe(201);

    const conflito = await api('POST', '/pessoa', { corpo: { id: outroId, nome: 'Outra', editadoEm: agora() }, chave });
    expect(conflito.status).toBe(422);
    expect(conflito.corpo.codigo).toBe('CHAVE_IDEMPOTENCIA_CONFLITANTE');
    expect(await sql('select 1 from clinico.pessoa where id = $1', [outroId])).toEqual([]);
  });

  it('sem chave: id que ja existe -> 200 com o registro existente', async () => {
    const id = randomUUID();
    const corpo = { id, nome: 'Sem Chave', editadoEm: agora() };
    expect((await api('POST', '/pessoa', { corpo })).status).toBe(201);
    const repetida = await api('POST', '/pessoa', { corpo: { ...corpo, nome: 'Outro nome' } });
    expect(repetida.status).toBe(200);
    expect(repetida.corpo.nome).toBe('Sem Chave');
  });

  it('erro no meio desfaz tudo: evento invalido nao deixa atendimento nem operacao_sync', async () => {
    const pessoaId = await novaPessoa();
    const id = randomUUID();
    const chave = randomUUID();
    const corpo = {
      id,
      pessoaId,
      iniciadoEm: agora(),
      eventos: [
        { id: randomUUID(), tipo: 'OBSERVACAO', ocorridoEm: agora(), dados: { texto: 'ok' } },
        { id: randomUUID(), tipo: 'RETIFICACAO', ocorridoEm: agora(), dados: { motivo: 'x' }, retificaEventoId: randomUUID() },
      ],
    };
    const resposta = await api('POST', '/atendimento', { corpo, chave });
    expect(resposta.status).toBe(422);
    expect(resposta.corpo.detalhes).toEqual([{ campo: 'retificaEventoId', mensagem: expect.any(String) }]);
    expect(await sql('select 1 from clinico.atendimento where id = $1', [id])).toEqual([]);
    expect(await sql('select 1 from clinico.operacao_sync where op_id = $1', [chave])).toEqual([]);
    expect(await sql('select 1 from clinico.prontuario where pessoa_id = $1', [pessoaId])).toEqual([]);
  });
});

describe('prontuario por pessoa (regra 2)', () => {
  it('POST /prontuario para pessoa que ja tem -> 200 com o existente e os itens unidos', async () => {
    const pessoaId = await novaPessoa();
    const item = (descricao: string) => ({ id: randomUUID(), tipo: 'ALERGIA', descricao, registradoEm: agora() });
    const itemA = item('Alergia A');
    const itemB = item('Alergia B');
    const itemC = item('Alergia C');

    const primeiro = await api('POST', '/prontuario', {
      corpo: { id: randomUUID(), pessoaId, tipoSanguineo: 'O+', itens: [itemA] },
      chave: randomUUID(),
    });
    expect(primeiro.status).toBe(201);

    // outro dispositivo, sem saber do primeiro, manda um prontuario com outro id
    const segundo = await api('POST', '/prontuario', {
      corpo: { id: randomUUID(), pessoaId, tipoSanguineo: 'AB-', observacoes: 'vinda do segundo', itens: [itemA, itemB, itemC] },
      chave: randomUUID(),
    });
    expect(segundo.status).toBe(200);
    expect(segundo.corpo.id).toBe(primeiro.corpo.id);
    expect(segundo.corpo.tipoSanguineo).toBe('O+'); // nao sobrescreve
    expect(segundo.corpo.observacoes).toBe('vinda do segundo'); // so preenche o que faltava
    expect(segundo.corpo.itens.map((i: { descricao: string }) => i.descricao).sort()).toEqual(['Alergia A', 'Alergia B', 'Alergia C']);
    expect(await sql('select count(*)::int as n from clinico.prontuario where pessoa_id = $1', [pessoaId])).toEqual([{ n: 1 }]);

    const lido = await api('GET', `/prontuario/${pessoaId}`);
    expect(lido.corpo).toEqual(segundo.corpo);
  });

  it('item: acrescenta (criando o prontuario se preciso), repete sem duplicar e inativa com autor', async () => {
    const pessoaId = await novaPessoa();
    const corpo = { id: randomUUID(), pessoaId, tipo: 'COMORBIDADE', descricao: 'Comorbidade de teste', registradoEm: agora() };

    const criado = await api('POST', '/prontuario-item', { corpo });
    expect(criado.status).toBe(201);
    expect(criado.corpo).toMatchObject({ pessoaId, registradoPor: PROFISSIONAL_ID, inativadoEm: null });
    expect((await api('POST', '/prontuario-item', { corpo })).status).toBe(200);

    const inativado = await api('POST', `/prontuario-item/${corpo.id}/inativacao`, { corpo: { inativadoEm: agora() } });
    expect(inativado.status).toBe(200);
    expect(inativado.corpo.inativadoEm).not.toBeNull();
    expect(await sql('select inativado_por from clinico.prontuario_item where id = $1', [corpo.id])).toEqual([
      { inativado_por: PROFISSIONAL_ID },
    ]);
    expect((await api('POST', `/prontuario-item/${randomUUID()}/inativacao`, { corpo: { inativadoEm: agora() } })).status).toBe(404);
  });

  it('pessoaId desconhecido -> 422 VALIDACAO (nao 404), para o outbox reter os dependentes', async () => {
    const resposta = await api('POST', '/prontuario', { corpo: { id: randomUUID(), pessoaId: randomUUID() } });
    expect(resposta.status).toBe(422);
    expect(resposta.corpo).toMatchObject({ codigo: 'VALIDACAO', detalhes: [{ campo: 'pessoaId' }] });
    const atendimento = await api('POST', '/atendimento', { corpo: { id: randomUUID(), pessoaId: randomUUID(), iniciadoEm: agora() } });
    expect(atendimento.status).toBe(422);
    const evento = await api('POST', '/atendimento-evento', {
      corpo: { id: randomUUID(), atendimentoId: randomUUID(), tipo: 'OBSERVACAO', ocorridoEm: agora(), dados: { texto: 'x' } },
    });
    expect(evento).toMatchObject({ status: 422, corpo: { detalhes: [{ campo: 'atendimentoId' }] } });
  });
});

describe('estrategias de conflito (regra 3) e relogio (regra 4)', () => {
  it('PATCH com editadoEm mais antigo nao sobrescreve campo mais novo; o valor anterior vai para auditoria_clinica', async () => {
    const id = await novaPessoa({ telefone: '1111', editadoEm: agora(-60 * 60_000) });

    const recente = await api('PATCH', `/pessoa/${id}`, { corpo: { campos: { telefone: '2222' }, editadoEm: agora(-10 * 60_000) } });
    expect(recente.status).toBe(200);
    expect(recente.corpo.telefone).toBe('2222');

    // dispositivo que ficou offline sobe uma edicao de 30 min atras: telefone perde, cns (nunca editado) entra
    const antiga = await api('PATCH', `/pessoa/${id}`, {
      corpo: { campos: { telefone: '3333', cns: '123456789012345' }, editadoEm: agora(-30 * 60_000) },
    });
    expect(antiga.status).toBe(200);
    expect(antiga.corpo).toMatchObject({ telefone: '2222', cns: '123456789012345' });

    const auditorias = await sql(
      "select antes, depois, observacao from clinico.auditoria_clinica where entidade_id = $1 and acao = 'ALTERACAO' order by id",
      [id],
    );
    expect(auditorias).toHaveLength(2);
    expect(auditorias[0]).toMatchObject({ antes: { telefone: '1111' }, depois: { telefone: '2222' } });
    expect(auditorias[1]).toMatchObject({ antes: { cns: null }, depois: { cns: '123456789012345' } });
    expect(auditorias[1].observacao).toContain('telefone');

    expect((await api('PATCH', `/pessoa/${randomUUID()}`, { corpo: { campos: { telefone: '1' }, editadoEm: agora() } })).status).toBe(404);
  });

  it('pessoa com CPF repetido e aceita e sinalizada (RevisaoManual); nome + nascimento tambem', async () => {
    const cpf = String(Date.now()).slice(-11).padStart(11, '7');
    const original = await novaPessoa({ cpf });
    const duplicata = randomUUID();
    const resposta = await api('POST', '/pessoa', { corpo: { id: duplicata, nome: 'Outro Nome', cpf, editadoEm: agora() } });
    expect(resposta.status).toBe(201);
    expect(resposta.corpo.possivelDuplicataDe).toBe(original);

    const nome = `Maria Homônima ${randomUUID().slice(0, 8)}`;
    const primeira = await novaPessoa({ nome, dataNascimento: '1990-05-20' });
    const segunda = await api('POST', '/pessoa', {
      corpo: { id: randomUUID(), nome: nome.toUpperCase(), dataNascimento: '1990-05-20', editadoEm: agora() },
    });
    expect(segunda.corpo.possivelDuplicataDe).toBe(primeira);
    expect(segunda.corpo.dataNascimento).toBe('1990-05-20');

    const sinalizadas = await api('GET', `/pessoa?somenteDuplicatas=true&busca=${cpf}`);
    expect(sinalizadas.corpo.itens.map((p: { id: string }) => p.id)).toEqual([duplicata]);
  });

  it('relogio mais de 5 min adiantado e limitado ao horario do servidor e anotado na auditoria', async () => {
    const pessoaId = await novaPessoa();
    const id = randomUUID();
    const antes = Date.now();
    const resposta = await api('POST', '/atendimento', { corpo: { id, pessoaId, iniciadoEm: agora(3 * 60 * 60_000) } });
    expect(resposta.status).toBe(201);
    const gravado = Date.parse(resposta.corpo.iniciadoEm);
    expect(gravado).toBeGreaterThanOrEqual(antes - 1000);
    expect(gravado).toBeLessThanOrEqual(Date.now() + 1000);
    const [auditoria] = await sql("select observacao from clinico.auditoria_clinica where entidade = 'atendimento' and entidade_id = $1", [id]);
    expect(auditoria.observacao).toContain('iniciadoEm adiantado');
  });
});

describe('atendimento, linha do tempo e ficha', () => {
  it('atendimento com evento ENCERRAMENTO fica ENCERRADO; a ficha traz o resumo de @medicalfield/dominio', async () => {
    const pessoaId = await novaPessoa();
    await api('POST', '/prontuario-item', {
      corpo: { id: randomUUID(), pessoaId, tipo: 'ALERGIA', descricao: 'Alergia de teste', registradoEm: agora() },
    });
    const id = randomUUID();
    const sinais = randomUUID();
    const minuto = (n: number) => agora(-(60 - n) * 60_000);
    const [medicamento] = await sql('select id, nome from clinico.medicamento where ativo order by nome limit 1');

    const criado = await api('POST', '/atendimento', {
      chave: randomUUID(),
      corpo: {
        id,
        pessoaId,
        iniciadoEm: minuto(0),
        queixaPrincipal: 'queixa de teste',
        latitude: -29.44,
        longitude: -51.96,
        eventos: [
          { id: sinais, tipo: 'SINAIS_VITAIS', ocorridoEm: minuto(2), dados: { saturacao: 91, frequenciaCardiaca: 110 } },
          { id: randomUUID(), tipo: 'SINAIS_VITAIS', ocorridoEm: minuto(1), dados: { saturacao: 97 } },
          { id: randomUUID(), tipo: 'GLASGOW', ocorridoEm: minuto(3), dados: { ocular: 4, verbal: 5, motora: 6, total: 15 } },
          { id: randomUUID(), tipo: 'TRIAGEM', ocorridoEm: minuto(4), dados: { protocolo: 'START', classificacao: 'AMARELO' } },
          { id: randomUUID(), tipo: 'MEDICACAO', ocorridoEm: minuto(5), dados: { medicamentoId: medicamento.id, nome: medicamento.nome, dose: '1', unidade: 'un', via: 'EV' } },
          { id: randomUUID(), tipo: 'MEDICACAO', ocorridoEm: minuto(6), dados: { medicamentoId: randomUUID(), nome: 'Fora do catálogo', dose: '1', unidade: 'un', via: 'VO' } },
          { id: randomUUID(), tipo: 'RETIFICACAO', ocorridoEm: minuto(7), dados: { motivo: 'saturação digitada errada' }, retificaEventoId: sinais },
        ],
      },
    });
    expect(criado.status).toBe(201);
    expect(criado.corpo).toMatchObject({ status: 'ABERTO', encerradoEm: null, profissionalId: PROFISSIONAL_ID, dispositivoId: DISPOSITIVO_ID });

    const encerramento = { id: randomUUID(), atendimentoId: id, tipo: 'ENCERRAMENTO', ocorridoEm: minuto(30), dados: { desfecho: 'Removido', destino: 'Hospital de teste' } };
    const chave = randomUUID();
    expect((await api('POST', '/atendimento-evento', { corpo: encerramento, chave })).status).toBe(201);
    expect((await api('POST', '/atendimento-evento', { corpo: encerramento, chave })).status).toBe(200);
    expect((await api('POST', '/atendimento-evento', { corpo: encerramento })).status).toBe(200);

    const ficha = await api('GET', `/ficha/${id}`);
    expect(ficha.status).toBe(200);
    expect(fichaSchema.safeParse(ficha.corpo).error?.issues).toBeUndefined();
    expect(ficha.corpo.atendimento).toMatchObject({ status: 'ENCERRADO', encerradoEm: encerramento.ocorridoEm });
    expect(ficha.corpo.eventos).toHaveLength(8);
    expect(ficha.corpo.eventos.map((e: { ocorridoEm: string }) => e.ocorridoEm)).toEqual(
      ficha.corpo.eventos.map((e: { ocorridoEm: string }) => e.ocorridoEm).sort(),
    );
    expect(ficha.corpo.resumo).toMatchObject({
      ultimosSinaisVitais: { dados: { saturacao: 97 } }, // o de 91 foi retificado
      glasgowMaisRecente: { dados: { total: 15 } },
      triagem: { dados: { protocolo: 'START', classificacao: 'AMARELO' } },
      medicacoes: [{ nome: medicamento.nome }, { nome: 'Fora do catálogo' }],
      alergias: ['Alergia de teste'],
      encerramento: { desfecho: 'Removido', destino: 'Hospital de teste' },
    });

    // medicamento do catalogo fica ligado; id desconhecido vira "fora do catalogo" sem rejeitar o evento
    expect(await sql("select medicamento_id from clinico.atendimento_evento where atendimento_id = $1 and tipo = 'MEDICACAO' order by ocorrido_em", [id])).toEqual([
      { medicamento_id: medicamento.id },
      { medicamento_id: null },
    ]);

    const daPessoa = await api('GET', `/atendimento/${pessoaId}`);
    expect(daPessoa.corpo.itens).toEqual([expect.objectContaining({ id, status: 'ENCERRADO', pessoaNome: ficha.corpo.pessoa.nome })]);
    expect((await api('GET', `/ficha/${randomUUID()}`)).status).toBe(404);
  });

  it('dados do evento sao validados pelo tipo (Glasgow com total errado -> 422 apontando o campo)', async () => {
    const pessoaId = await novaPessoa();
    const atendimentoId = randomUUID();
    await api('POST', '/atendimento', { corpo: { id: atendimentoId, pessoaId, iniciadoEm: agora() } });
    const resposta = await api('POST', '/atendimento-evento', {
      corpo: { id: randomUUID(), atendimentoId, tipo: 'GLASGOW', ocorridoEm: agora(), dados: { ocular: 4, verbal: 5, motora: 6, total: 13 } },
    });
    expect(resposta.status).toBe(422);
    expect(resposta.corpo.detalhes).toEqual([{ campo: 'dados.total', mensagem: expect.any(String) }]);
  });

  it('a linha do tempo e imutavel: o papel do servico nao consegue alterar nem apagar evento', async () => {
    const servico = new pg.Client({ connectionString: URL_SERVICO });
    await servico.connect();
    try {
      await expect(servico.query("update clinico.atendimento_evento set dados = '{}'")).rejects.toMatchObject({ code: '42501' });
      await expect(servico.query('delete from clinico.auditoria_clinica')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await servico.end();
    }
  });
});

describe('listas paginadas', () => {
  it('GET /atendimento: mais recentes primeiro, cursor opaco sem repetir nem pular', async () => {
    const pessoaId = await novaPessoa();
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      ids.unshift(randomUUID());
      await api('POST', '/atendimento', { corpo: { id: ids[0], pessoaId, iniciadoEm: agora() } });
    }
    const pagina1 = await api('GET', `/atendimento/${pessoaId}?limite=2`);
    expect(pagina1.corpo.itens.map((a: { id: string }) => a.id)).toEqual(ids.slice(0, 2));
    expect(pagina1.corpo.proximoCursor).toEqual(expect.any(String));
    const pagina2 = await api('GET', `/atendimento/${pessoaId}?limite=2&cursor=${pagina1.corpo.proximoCursor}`);
    expect(pagina2.corpo).toEqual({ itens: [expect.objectContaining({ id: ids[2] })], proximoCursor: null });

    const geral = await api('GET', '/atendimento?limite=1');
    expect(geral.corpo.itens[0]).toMatchObject({ id: ids[0], pessoaNome: expect.any(String) });
    expect((await api('GET', '/atendimento?cursor=lixo')).status).toBe(422);
  });

  it('GET /medicamento (catalogo demo), GET /prontuario com pessoa resumida, GET /pessoa?busca=', async () => {
    const medicamentos = await api('GET', '/medicamento?limite=200');
    expect(medicamentos.corpo.itens.length).toBeGreaterThanOrEqual(12);
    expect(medicamentos.corpo.itens[0]).toEqual({
      id: expect.any(String),
      nome: expect.any(String),
      principioAtivo: expect.any(String),
      apresentacao: expect.any(String),
      observacao: 'DADO DEMONSTRATIVO — sem validade clínica',
      ativo: true,
    });

    const prontuarios = await api('GET', '/prontuario?limite=200');
    const demo = prontuarios.corpo.itens.find((p: { id: string }) => p.id === '0c000000-0000-4000-8000-000000000001');
    expect(demo.pessoa).toEqual({
      id: '0b000000-0000-4000-8000-000000000001',
      nome: 'Marina Exemplo da Silva',
      dataNascimento: '1984-03-12',
      cpf: '00000000101',
      naoIdentificada: false,
    });
    expect(demo.itens).toHaveLength(2);

    const busca = await api('GET', `/pessoa?busca=${encodeURIComponent('marina exemplo')}`);
    expect(busca.corpo.itens.map((p: { id: string }) => p.id)).toContain('0b000000-0000-4000-8000-000000000001');
  });
});

describe('descida por cursor (GET /sync/alteracoes)', () => {
  it('medicamento inserido direto por SQL aparece a partir do cursor anterior; inativado nao some, desce como inativo', async () => {
    const cursor = await cursorAtual();
    const vazio = await api('GET', `/sync/alteracoes?desde=${cursor}`);
    expect(vazio.corpo).toEqual({ medicamentos: [], pessoas: [], prontuarios: [], prontuarioItens: [], proximoCursor: cursor, temMais: false });

    const nome = `Medicamento SQL ${randomUUID().slice(0, 8)}`;
    const [{ id }] = await sql('insert into clinico.medicamento (nome, apresentacao) values ($1, $2) returning id', [nome, 'Comprimido']);

    const depois: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${cursor}`)).corpo;
    expect(depois.medicamentos).toEqual([{ id, nome, principioAtivo: null, apresentacao: 'Comprimido', observacao: null, ativo: true }]);
    expect(BigInt(depois.proximoCursor)).toBeGreaterThan(BigInt(cursor));
    expect(depois.temMais).toBe(false);

    await sql('update clinico.medicamento set ativo = false where id = $1', [id]);
    const inativado: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${depois.proximoCursor}`)).corpo;
    expect(inativado.medicamentos).toEqual([expect.objectContaining({ id, ativo: false })]);
    const ativos = await api('GET', '/medicamento?limite=200');
    expect(ativos.corpo.itens.map((m: { id: string }) => m.id)).not.toContain(id);
  });

  it('cobre pessoas, prontuarios e itens, em ordem de seq, com limite e temMais', async () => {
    const cursor = await cursorAtual();
    const pessoaId = await novaPessoa({ dataNascimento: '1970-01-31' });
    const itemId = randomUUID();
    await api('POST', '/prontuario-item', { corpo: { id: itemId, pessoaId, tipo: 'ALERGIA', descricao: 'Item da descida', registradoEm: agora() } });

    const tudo: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${cursor}`)).corpo;
    expect(tudo.pessoas).toEqual([expect.objectContaining({ id: pessoaId, dataNascimento: '1970-01-31' })]);
    expect(tudo.prontuarios).toEqual([expect.objectContaining({ pessoaId })]);
    expect(tudo.prontuarios[0]).not.toHaveProperty('itens');
    expect(tudo.prontuarioItens).toEqual([expect.objectContaining({ id: itemId, pessoaId, prontuarioId: tudo.prontuarios[0]?.id })]);
    expect(tudo.temMais).toBe(false);

    // pagina de 1: pessoa, depois prontuario, depois item
    const p1: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${cursor}&limite=1`)).corpo;
    expect([p1.pessoas.length, p1.prontuarios.length, p1.prontuarioItens.length, p1.temMais]).toEqual([1, 0, 0, true]);
    const p2: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${p1.proximoCursor}&limite=1`)).corpo;
    expect([p2.pessoas.length, p2.prontuarios.length, p2.temMais]).toEqual([0, 1, true]);
    const p3: Alteracoes = (await api('GET', `/sync/alteracoes?desde=${p2.proximoCursor}&limite=1`)).corpo;
    expect([p3.prontuarioItens.length, p3.temMais, p3.proximoCursor]).toEqual([1, false, tudo.proximoCursor]);

    expect((await api('GET', '/sync/alteracoes?desde=abc')).status).toBe(422);
  });
});

describe('correcoes do QA', () => {
  const cursor = (chave: string, id: string): string => Buffer.from(JSON.stringify([chave, id])).toString('base64url');
  const ROTAS_PAGINADAS = ['/pessoa', '/atendimento', '/prontuario', '/medicamento'];

  it('D-QA-06: cursor forjado ou malformado -> 422 VALIDACAO com campo "cursor" nas 4 rotas (nunca 500)', async () => {
    const forjados = [
      'WyJ4IiwieSJd', // ["x","y"], o caso do relatorio
      cursor('x', randomUUID().toUpperCase()),
      cursor('2026-11-18 00:00:00+00', 'nao-e-uuid'),
      cursor('a\u0000b', randomUUID()),
      Buffer.from('{"a":1}').toString('base64url'),
      Buffer.from('[1,2]').toString('base64url'),
    ];
    for (const rota of ROTAS_PAGINADAS) {
      for (const forjado of forjados) {
        const resposta = await api('GET', `${rota}?cursor=${forjado}`);
        expect([rota, resposta.status, resposta.corpo.codigo]).toEqual([rota, 422, 'VALIDACAO']);
        expect(resposta.corpo.detalhes).toEqual([{ campo: 'cursor', mensagem: 'cursor inválido' }]);
      }
    }
    // /atendimento ordena por instante: texto que nao e instante, e data impossivel, tambem sao 422
    for (const chave of ['x', '2026-13-45 99:00:00+00', '2026-02-31 00:00:00+00']) {
      expect((await api('GET', `/atendimento?cursor=${cursor(chave, randomUUID())}`)).status).toBe(422);
    }
    // e um cursor bem formado, mesmo inventado, continua funcionando
    expect((await api('GET', `/atendimento?cursor=${cursor('2026-01-01 00:00:00+00', randomUUID())}`)).status).toBe(200);
    expect((await api('GET', `/pessoa?cursor=${cursor('M', randomUUID())}`)).status).toBe(200);
  });

  it('D-QA-07: caractere nulo em texto -> 422 VALIDACAO apontando o campo (nunca 500), e nada e gravado', async () => {
    const id = randomUUID();
    const pessoa = await api('POST', '/pessoa', { corpo: { id, nome: 'QA\u0000nul', editadoEm: agora() } });
    expect([pessoa.status, pessoa.corpo.codigo, pessoa.corpo.detalhes[0].campo]).toEqual([422, 'VALIDACAO', 'nome']);
    expect(await sql('select 1 from clinico.pessoa where id = $1', [id])).toEqual([]);

    const pessoaId = await novaPessoa();
    const atendimentoId = randomUUID();
    await api('POST', '/atendimento', { corpo: { id: atendimentoId, pessoaId, iniciadoEm: agora() } });
    const evento = (tipo: string, dados: unknown, extra: object = {}) =>
      api('POST', '/atendimento-evento', { corpo: { id: randomUUID(), atendimentoId, tipo, ocorridoEm: agora(), dados, ...extra } });
    expect((await evento('OBSERVACAO', { texto: 'a\u0000b' })).status).toBe(422);
    const original = randomUUID();
    await api('POST', '/atendimento-evento', { corpo: { id: original, atendimentoId, tipo: 'OBSERVACAO', ocorridoEm: agora(), dados: { texto: 'ok' } } });
    expect((await evento('RETIFICACAO', { motivo: 'm', dadosCorrigidos: { texto: 'x\u0000' } }, { retificaEventoId: original })).status).toBe(422);
    expect((await evento('RETIFICACAO', { motivo: 'm', dadosCorrigidos: { a: { b: 1 } } }, { retificaEventoId: original })).status).toBe(422);
    expect((await evento('RETIFICACAO', { motivo: 'm', dadosCorrigidos: { texto: 'corrigido' } }, { retificaEventoId: original })).status).toBe(201);

    expect((await api('PATCH', `/pessoa/${pessoaId}`, { corpo: { campos: { telefone: '51\u0000' }, editadoEm: agora() } })).status).toBe(422);
    expect((await api('GET', '/pessoa?busca=a%00b')).status).toBe(422);
  });

  it('D-QA-17: a mesma Idempotency-Key enviada por OUTRO profissional -> 422, sem a resposta do primeiro', async () => {
    const chave = randomUUID();
    const id = randomUUID();
    const corpo = { id, nome: 'Pessoa Do Primeiro Profissional', editadoEm: agora(), telefone: '51 91111-2222' };
    expect((await api('POST', '/pessoa', { corpo, chave })).status).toBe(201);

    const outroProfissional = randomUUID();
    const deOutro = await api('POST', '/pessoa', { corpo, chave, token: await assinar('15m', 'medicalfield', outroProfissional) });
    expect(deOutro.status).toBe(422);
    expect(deOutro.corpo).toEqual({ codigo: 'CHAVE_IDEMPOTENCIA_CONFLITANTE', mensagem: expect.any(String), requestId: deOutro.requestId });
    expect(JSON.stringify(deOutro.corpo)).not.toContain('91111');

    // para o dono da chave nada mudou: repeticao continua 200 com a resposta original
    expect((await api('POST', '/pessoa', { corpo, chave })).status).toBe(200);
    expect(await sql('select profissional_id from clinico.auditoria_clinica where entidade_id = $1', [id])).toEqual([
      { profissional_id: PROFISSIONAL_ID },
    ]);
    // a mesma chave em outra rota tambem e conflito
    expect((await api('POST', '/prontuario', { corpo: { id: randomUUID(), pessoaId: id }, chave })).corpo.codigo).toBe('CHAVE_IDEMPOTENCIA_CONFLITANTE');
  });
});
