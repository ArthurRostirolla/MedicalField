// QA — conflitos com DOIS clientes reais (dois contextos de navegador = dois dispositivos),
// contra o sistema implantado. Cobre T-11 (API), T-12, T-13 e os casos 1a–1d do plano de QA.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { entrar, esperarTudoEnviado, local, registrarSinais, simularOffline, sincronizar } from '../../apps/lucky-patcher/e2e/apoio.ts';
import { anotar, api, contar, cpfValido, EVIDENCIAS, sql, tokenDe } from './apoio-qa.ts';

const marca = Date.now().toString(36).toUpperCase();
const EV = 'conflitos.txt';
const agora = (deslocamentoSeg = 0) => new Date(Date.now() + deslocamentoSeg * 1000).toISOString();

let ctxA: BrowserContext;
let ctxB: BrowserContext;
let a: Page;
let b: Page;
let token: string;

const comProntuario = { id: randomUUID(), nome: `QA Conflito ComProntuario ${marca}` };
const semProntuario = { id: randomUUID(), nome: `QA Conflito SemProntuario ${marca}` };

test.beforeAll(async ({ browser }) => {
  anotar(EV, `\n=== execução ${new Date().toISOString()} (marca ${marca}) ===`);
  token = await tokenDe('COREN', '200002', 'RS');
  // Pessoas que os dois dispositivos vão conhecer antes de ficar offline.
  expect((await api(token, 'POST', '/api/v1/pessoa', { ...comProntuario, editadoEm: agora() })).status).toBe(201);
  expect((await api(token, 'POST', '/api/v1/pessoa', { ...semProntuario, editadoEm: agora() })).status).toBe(201);
  expect(
    (await api(token, 'POST', '/api/v1/prontuario', {
      id: randomUUID(),
      pessoaId: comProntuario.id,
      itens: [{ id: randomUUID(), tipo: 'ALERGIA', descricao: `Alergia base ${marca}`, registradoEm: agora() }],
    })).status,
  ).toBe(201);
  ctxA = await browser.newContext();
  ctxB = await browser.newContext();
  a = await ctxA.newPage();
  b = await ctxB.newPage();
});

test.afterAll(async () => {
  await ctxA?.close();
  await ctxB?.close();
});

async function adicionarAlergia(page: Page, pessoaId: string, descricao: string): Promise<void> {
  await page.goto(`/app/#/pacientes/${pessoaId}`);
  const secao = page.getByRole('region', { name: 'Alergias' });
  await secao.getByLabel('Nova alergia').fill(descricao);
  await secao.getByRole('button', { name: 'Adicionar' }).click();
  await expect(secao.getByText(descricao)).toBeVisible();
}

async function iniciarAtendimento(page: Page, pessoaId: string, queixa: string): Promise<string> {
  await page.goto(`/app/#/pacientes/${pessoaId}`);
  await page.getByLabel('Queixa principal').fill(queixa);
  await page.getByRole('button', { name: 'Iniciar atendimento' }).click();
  await page.waitForURL(/#\/atendimentos\//);
  const id = /atendimentos\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  await registrarSinais(page);
  return id;
}

async function novaPessoaComCpf(page: Page, nome: string, cpf: string): Promise<string> {
  await page.goto('/app/#/pacientes/novo');
  await page.getByLabel('Nome completo').fill(nome);
  await page.getByLabel('CPF').fill(cpf);
  await page.getByRole('button', { name: 'Salvar e iniciar atendimento' }).click();
  await page.waitForURL(/#\/atendimentos\//);
  const atendimentoId = /atendimentos\/([0-9a-f-]{36})/.exec(page.url())![1]!;
  const [linha] = await local<{ pessoa_id: string }>(page, 'SELECT pessoa_id FROM atendimento WHERE id = ?', [atendimentoId]);
  return linha!.pessoa_id;
}

const rejeitadas = async (page: Page) => (await local<{ n: number }>(page, "SELECT count(*) AS n FROM outbox WHERE status = 'REJEITADA'"))[0]!.n;

test('dois dispositivos offline: união de alergias, um prontuário, CPF duplicado sinalizado', async ({ browser }) => {
  const cpf = cpfValido();
  const nomeA = `QA Duplicata A ${marca}`;
  const nomeB = `QA Duplicata B ${marca}`;

  await test.step('os dois sincronizam e ficam offline', async () => {
    await entrar(a);
    await entrar(b);
    for (const page of [a, b]) {
      expect(await local(page, 'SELECT id FROM pessoa WHERE id IN (?, ?)', [comProntuario.id, semProntuario.id])).toHaveLength(2);
      await simularOffline(page, true);
    }
    const [da] = await local<{ valor: string }>(a, "SELECT valor FROM sync_estado WHERE chave = 'dispositivoId'").catch(() => [{ valor: '?' }]);
    const [db] = await local<{ valor: string }>(b, "SELECT valor FROM sync_estado WHERE chave = 'dispositivoId'").catch(() => [{ valor: '?' }]);
    anotar(EV, `dispositivo A=${da?.valor ?? '?'} B=${db?.valor ?? '?'}`);
  });

  let atA1 = '', atB1 = '', atA2 = '', atB2 = '', pessoaDupA = '', pessoaDupB = '';
  await test.step('offline: A e B escrevem sobre as MESMAS pessoas', async () => {
    // 1a — alergias diferentes na pessoa que já tem prontuário
    await adicionarAlergia(a, comProntuario.id, `Alergia A ${marca}`);
    await adicionarAlergia(b, comProntuario.id, `Alergia B ${marca}`);
    // 1b — pessoa SEM prontuário: cada dispositivo cria o seu prontuário local + item + atendimento
    await adicionarAlergia(a, semProntuario.id, `Alergia A2 ${marca}`);
    await adicionarAlergia(b, semProntuario.id, `Alergia B2 ${marca}`);
    atA1 = await iniciarAtendimento(a, comProntuario.id, `QA atendimento A ${marca}`);
    atB1 = await iniciarAtendimento(b, comProntuario.id, `QA atendimento B ${marca}`);
    atA2 = await iniciarAtendimento(a, semProntuario.id, `QA atendimento A2 ${marca}`);
    atB2 = await iniciarAtendimento(b, semProntuario.id, `QA atendimento B2 ${marca}`);
    // 1c — pessoa nova com o MESMO CPF nos dois
    pessoaDupA = await novaPessoaComCpf(a, nomeA, cpf);
    pessoaDupB = await novaPessoaComCpf(b, nomeB, cpf);
    const prontuariosLocais = [
      (await local<{ id: string }>(a, 'SELECT id FROM prontuario WHERE pessoa_id = ?', [semProntuario.id]))[0]!.id,
      (await local<{ id: string }>(b, 'SELECT id FROM prontuario WHERE pessoa_id = ?', [semProntuario.id]))[0]!.id,
    ];
    expect(prontuariosLocais[0]).not.toBe(prontuariosLocais[1]);
    anotar(EV, `offline: prontuário local de A=${prontuariosLocais[0]} e de B=${prontuariosLocais[1]} para a mesma pessoa (ids diferentes)`);
    // nada chegou à central
    expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE id IN ('${atA1}','${atB1}','${atA2}','${atB2}')`)).toBe(0);
    expect(contar(`SELECT count(*) FROM clinico.pessoa WHERE cpf = '${cpf}'`)).toBe(0);
    anotar(EV, 'offline: 0 atendimentos e 0 pessoas com o CPF na central antes da volta');
  });

  await test.step('A volta; depois B volta', async () => {
    await simularOffline(a, false);
    await esperarTudoEnviado(a);
    await simularOffline(b, false);
    await esperarTudoEnviado(b);
    expect(await rejeitadas(a)).toBe(0);
    expect(await rejeitadas(b)).toBe(0);
    anotar(EV, 'os dois esvaziaram a fila; 0 operações REJEITADA em A e em B');
  });

  await test.step('1a/T-12 — a central tem as DUAS alergias novas + a base (união)', async () => {
    const itens = sql(`SELECT descricao FROM clinico.prontuario_item WHERE prontuario_id IN (SELECT id FROM clinico.prontuario WHERE pessoa_id = '${comProntuario.id}') AND inativado_em IS NULL ORDER BY descricao`);
    anotar(EV, `1a itens ativos da pessoa com prontuário: ${itens.replace(/\n/g, ' | ')}`);
    expect(itens.split('\n').sort()).toEqual([`Alergia A ${marca}`, `Alergia B ${marca}`, `Alergia base ${marca}`].sort());
  });

  await test.step('1b — um só prontuário por pessoa; nenhum atendimento rejeitado', async () => {
    for (const pessoa of [comProntuario, semProntuario]) {
      expect(contar(`SELECT count(*) FROM clinico.prontuario WHERE pessoa_id = '${pessoa.id}'`)).toBe(1);
    }
    const itens2 = sql(`SELECT descricao FROM clinico.prontuario_item WHERE prontuario_id IN (SELECT id FROM clinico.prontuario WHERE pessoa_id = '${semProntuario.id}') ORDER BY descricao`);
    anotar(EV, `1b itens da pessoa sem prontuário prévio: ${itens2.replace(/\n/g, ' | ')}`);
    expect(itens2.split('\n')).toHaveLength(2);
    const atendimentos = sql(
      `SELECT a.id || ' prontuario=' || a.prontuario_id || ' eventos=' || (SELECT count(*) FROM clinico.atendimento_evento e WHERE e.atendimento_id = a.id) FROM clinico.atendimento a WHERE a.id IN ('${atA1}','${atB1}','${atA2}','${atB2}') ORDER BY a.pessoa_id`,
    );
    anotar(EV, `1b atendimentos na central:\n${atendimentos}`);
    expect(atendimentos.split('\n')).toHaveLength(4);
    expect(atendimentos).not.toContain('eventos=0');
    // os dois atendimentos de cada pessoa apontam para o MESMO prontuário
    expect(contar(`SELECT count(DISTINCT prontuario_id) FROM clinico.atendimento WHERE id IN ('${atA2}','${atB2}')`)).toBe(1);
    expect(contar(`SELECT count(DISTINCT prontuario_id) FROM clinico.prontuario_item WHERE prontuario_id IN (SELECT id FROM clinico.prontuario WHERE pessoa_id = '${semProntuario.id}')`)).toBe(1);
    anotar(EV, '1b: 1 prontuário por pessoa; 4 atendimentos aceitos, todos com evento, mesmo prontuário');
  });

  await test.step('1c/T-13 — mesmo CPF: ambas aceitas, a segunda sinalizada', async () => {
    const linhas = sql(`SELECT id || ' | ' || nome || ' | duplicataDe=' || coalesce(possivel_duplicata_de::text, 'null') FROM clinico.pessoa WHERE cpf = '${cpf}' ORDER BY criado_em`);
    anotar(EV, `1c pessoas com o CPF:\n${linhas}`);
    expect(linhas.split('\n')).toHaveLength(2);
    expect(sql(`SELECT possivel_duplicata_de FROM clinico.pessoa WHERE id = '${pessoaDupB}'`)).toBe(pessoaDupA);
    expect(sql(`SELECT coalesce(possivel_duplicata_de::text,'null') FROM clinico.pessoa WHERE id = '${pessoaDupA}'`)).toBe('null');
    expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE pessoa_id IN ('${pessoaDupA}','${pessoaDupB}')`)).toBe(2);
  });

  await test.step('ressincronizar não duplica e cada dispositivo passa a ver a alergia do outro', async () => {
    const antes = sql(`SELECT (SELECT count(*) FROM clinico.prontuario_item), (SELECT count(*) FROM clinico.atendimento), (SELECT count(*) FROM clinico.atendimento_evento), (SELECT count(*) FROM clinico.pessoa)`);
    await sincronizar(a);
    await sincronizar(b);
    await sincronizar(a);
    expect(sql(`SELECT (SELECT count(*) FROM clinico.prontuario_item), (SELECT count(*) FROM clinico.atendimento), (SELECT count(*) FROM clinico.atendimento_evento), (SELECT count(*) FROM clinico.pessoa)`)).toBe(antes);
    for (const [nome, page] of [['A', a], ['B', b]] as const) {
      const locais = await local<{ descricao: string }>(page, 'SELECT descricao FROM prontuario_item WHERE pessoa_id = ? ORDER BY descricao', [comProntuario.id]);
      anotar(EV, `dispositivo ${nome}, itens locais após ressincronizar: ${locais.map((l) => l.descricao).join(' | ')}`);
      expect(locais.map((l) => l.descricao)).toEqual(expect.arrayContaining([`Alergia A ${marca}`, `Alergia B ${marca}`, `Alergia base ${marca}`]));
      // o prontuário local da pessoa sem prontuário prévio convergiu para o id da central
      const central = sql(`SELECT id FROM clinico.prontuario WHERE pessoa_id = '${semProntuario.id}'`);
      const locaisPront = await local<{ id: string }>(page, 'SELECT id FROM prontuario WHERE pessoa_id = ?', [semProntuario.id]);
      anotar(EV, `dispositivo ${nome}: prontuário local ${locaisPront.map((l) => l.id).join(',')} × central ${central}`);
      expect(locaisPront.map((l) => l.id)).toEqual([central]);
      const itens2 = await local<{ descricao: string; prontuario_id: string }>(page, 'SELECT descricao, prontuario_id FROM prontuario_item WHERE pessoa_id = ?', [semProntuario.id]);
      expect(itens2.map((i) => i.descricao).sort()).toEqual([`Alergia A2 ${marca}`, `Alergia B2 ${marca}`]);
      expect(new Set(itens2.map((i) => i.prontuario_id))).toEqual(new Set([central]));
    }
  });

  await test.step('1c — a duplicata aparece no portal em "Possíveis duplicatas"', async () => {
    const ctxPortal = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const portal = await ctxPortal.newPage();
    await portal.goto('/portal/');
    await portal.getByRole('radio', { name: 'CRM', exact: true }).check();
    await portal.getByLabel(/Número do/).fill('100001');
    await portal.getByLabel('UF').selectOption('RS');
    await portal.getByLabel('Senha').fill(process.env.MF_SENHA_DEMO!);
    await portal.getByRole('button', { name: 'Entrar' }).click();
    await expect(portal.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();
    await portal.getByRole('link', { name: /duplicatas/i }).click();
    await expect(portal.getByRole('heading', { name: 'Possíveis duplicatas', level: 1 })).toBeVisible();
    await expect(portal.getByText(nomeB).first()).toBeVisible();
    await portal.screenshot({ path: resolve(EVIDENCIAS, 'conflitos-portal-duplicatas.png'), fullPage: true });
    anotar(EV, `1c portal: "${nomeB}" visível em Possíveis duplicatas (captura conflitos-portal-duplicatas.png)`);
    // conteúdo malicioso gravado nos testes de injeção é exibido como texto, sem executar
    await ctxPortal.close();
  });
});

test('1d/T-11 — conflito cadastral por campo (PATCH /pessoa pela API)', async () => {
  const id = randomUUID();
  const t0 = agora(-3600);
  expect((await api(token, 'POST', '/api/v1/pessoa', { id, nome: `QA LWW ${marca}`, telefone: '5100000000', editadoEm: t0 })).status).toBe(201);
  const auditoria = () =>
    sql(`SELECT acao || ' antes=' || coalesce(antes::text,'-') || ' depois=' || coalesce(depois::text,'-') || ' obs=' || coalesce(observacao,'-') FROM clinico.auditoria_clinica WHERE entidade_id = '${id}' ORDER BY id`);

  // Dispositivo B edita o telefone "há 10 min"; dispositivo A edita o MESMO campo "há 20 min" mas sincroniza depois.
  const rB = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { telefone: '5122222222' }, editadoEm: agora(-600) }, { 'X-Dispositivo-Id': randomUUID() });
  expect(rB.status).toBeLessThan(300);
  const rA = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { telefone: '5111111111', contatoEmergenciaNome: 'Contato de A' }, editadoEm: agora(-1200) }, { 'X-Dispositivo-Id': randomUUID() });
  expect(rA.status).toBeLessThan(300);
  const depois = sql(`SELECT telefone || ' | ' || contato_emergencia_nome FROM clinico.pessoa WHERE id = '${id}'`);
  anotar(EV, `1d após B(-10min) e A(-20min, chegou depois): ${depois}  (HTTP ${rB.status}/${rA.status})`);
  // por campo: telefone fica o de B (mais recente); o contato, que só A mexeu, entra
  expect(depois).toBe('5122222222 | Contato de A');

  // edição mais antiga que a criação não sobrescreve o nome
  const rVelho = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { nome: 'NOME ANTIGO NAO PODE VENCER' }, editadoEm: agora(-7200) });
  expect(rVelho.status).toBeLessThan(300);
  expect(sql(`SELECT nome FROM clinico.pessoa WHERE id = '${id}'`)).toBe(`QA LWW ${marca}`);
  anotar(EV, `1d editadoEm mais antigo (HTTP ${rVelho.status}) não sobrescreveu o nome`);

  // mais recente vence e o valor anterior fica na auditoria
  const rNovo = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { telefone: '5133333333' }, editadoEm: agora(-60) });
  expect(rNovo.status).toBeLessThan(300);
  expect(sql(`SELECT telefone FROM clinico.pessoa WHERE id = '${id}'`)).toBe('5133333333');
  const trilha = auditoria();
  anotar(EV, `1d auditoria_clinica da pessoa:\n${trilha}`);
  expect(trilha).toContain('5122222222'); // valor anterior preservado
  expect(trilha).toContain('5100000000');

  // relógio adiantado (1 dia à frente): limitado ao horário do servidor e registrado
  const rFuturo = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { telefone: '5199999999' }, editadoEm: agora(86400) });
  expect(rFuturo.status).toBeLessThan(300);
  const carimbo = sql(`SELECT (carimbos_campos->>'telefone')::timestamptz <= now() + interval '1 minute' FROM clinico.pessoa WHERE id = '${id}'`);
  const obs = sql(`SELECT coalesce(observacao,'-') FROM clinico.auditoria_clinica WHERE entidade_id = '${id}' ORDER BY id DESC LIMIT 1`);
  anotar(EV, `1d relógio adiantado: HTTP ${rFuturo.status}; carimbo do campo <= agora do servidor? ${carimbo}; observação: ${obs}; carimbos=${sql(`SELECT carimbos_campos::text FROM clinico.pessoa WHERE id = '${id}'`)}`);
  expect(carimbo).toBe('t');
  expect(obs).not.toBe('-');
  // e uma edição legítima feita "agora" ainda consegue vencer a do relógio adiantado
  await new Promise((r) => setTimeout(r, 1500));
  const rLegitimo = await api(token, 'PATCH', `/api/v1/pessoa/${id}`, { campos: { telefone: '5144444444' }, editadoEm: agora() });
  expect(rLegitimo.status).toBeLessThan(300);
  const final = sql(`SELECT telefone FROM clinico.pessoa WHERE id = '${id}'`);
  anotar(EV, `1d edição legítima posterior ao relógio adiantado: telefone=${final}`);
  expect(final).toBe('5144444444');
});
