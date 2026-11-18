// QA — resiliência no Kubernetes com o app aberto num navegador e operações pendentes.
// T-20 (pod da DonaCida morto no meio da sincronização), T-14 (Postgres em 0 réplicas),
// T-23/T-18 (Jaiminho e DonaCida fora). Reinicia PODS; não apaga dados. Sempre devolve as réplicas.
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  entrar,
  esperarTudoEnviado,
  local,
  novoPacienteComAtendimento,
  pendentesLocais,
  registrarObservacao,
  registrarSinais,
  simularOffline,
  sincronizar,
} from '../../apps/lucky-patcher/e2e/apoio.ts';
import { anotar, api, BASE, contar, EVIDENCIAS, kubectl, sql, tokenDe } from './apoio-qa.ts';

const marca = Date.now().toString(36).toUpperCase();
const EV = 'resiliencia.txt';
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

const prontos = () => kubectl('get', 'pods', '--no-headers').split('\n').map((l) => l.trim().split(/\s+/).slice(0, 4).join(' ')).join(' ; ');
const reinicios = (app: string) => kubectl('get', 'pods', '-l', `app.kubernetes.io/name=${app}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].restartCount}');
const pronto = (app: string) => kubectl('get', 'pods', '-l', `app.kubernetes.io/name=${app}`, '-o', 'jsonpath={.items[*].status.containerStatuses[0].ready}');
function esperarTodosProntos(): void {
  for (const alvo of ['statefulset/postgres', 'deploy/mike-baguncinha', 'deploy/dona-cida', 'deploy/jaiminho', 'deploy/web', 'deploy/mailpit']) {
    kubectl('rollout', 'status', alvo, '--timeout=240s');
  }
}
const statusDe = async (caminho: string, token?: string) => {
  const r = await fetch(`${BASE}${caminho}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => null);
  return r ? `${r.status} ${(await r.text()).slice(0, 120).replace(/\s+/g, ' ')}` : 'sem resposta';
};

test.beforeAll(() => anotar(EV, `\n=== execução ${new Date().toISOString()} (marca ${marca}) ===`));
test.afterAll(() => {
  // rede de segurança: nada fica com zero réplicas
  kubectl('scale', 'statefulset/postgres', '--replicas=1');
  for (const d of ['dona-cida', 'jaiminho', 'mike-baguncinha']) kubectl('scale', `deploy/${d}`, '--replicas=1');
  esperarTodosProntos();
  anotar(EV, `fim: ${prontos()}`);
});

async function registrarOffline(page: Page, nome: string, observacoes: number): Promise<{ pessoaId: string; atendimentoId: string }> {
  await simularOffline(page, true);
  const ids = await novoPacienteComAtendimento(page, nome, `Alergia ${marca}`);
  await registrarSinais(page);
  for (let i = 1; i <= observacoes; i++) {
    await registrarObservacao(page, `Observação ${i} de ${observacoes} (${marca})`);
    // o aviso da anterior continua na tela: espera a gravação local desta antes de digitar a próxima
    await expect.poll(async () => (await local<{ n: number }>(page, "SELECT count(*) AS n FROM atendimento_evento WHERE atendimento_id = ? AND tipo = 'OBSERVACAO'", [ids.atendimentoId]))[0]!.n).toBe(i);
  }
  return ids;
}
const naCentral = (ids: { pessoaId: string; atendimentoId: string }) =>
  sql(
    `SELECT (SELECT count(*) FROM clinico.pessoa WHERE id='${ids.pessoaId}') || ' pessoa, ' || (SELECT count(*) FROM clinico.prontuario WHERE pessoa_id='${ids.pessoaId}') || ' prontuario, ' || (SELECT count(*) FROM clinico.atendimento WHERE id='${ids.atendimentoId}') || ' atendimento, ' || (SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id='${ids.atendimentoId}') || ' eventos'`,
  );

test('T-20 — pod da DonaCida morre no MEIO da sincronização', async ({ page }) => {
  await entrar(page);
  const OBS = 12;
  const ids = await registrarOffline(page, `QA Resiliencia Cida ${marca}`, OBS);
  const total = await pendentesLocais(page);
  anotar(EV, `T-20 offline: ${total} operações pendentes no aparelho; central: ${naCentral(ids)}`);
  expect(total).toBeGreaterThanOrEqual(OBS + 3);

  // rede lenta nos eventos, para a queda cair no meio da subida
  await page.route('**/api/v1/atendimento-evento', async (rota) => {
    await dormir(600);
    await rota.continue().catch(() => undefined);
  });
  let eventosConfirmados = 0;
  page.on('response', (r) => {
    if (r.url().includes('/api/v1/atendimento-evento') && r.status() < 300) eventosConfirmados++;
  });

  const reiniciosAntes = reinicios('dona-cida');
  await simularOffline(page, false);
  await expect.poll(() => eventosConfirmados, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  kubectl('delete', 'pod', '-l', 'app.kubernetes.io/name=dona-cida', '--grace-period=0', '--force', '--wait=false');
  const noCorte = eventosConfirmados;
  await dormir(4000);
  const pendentesNoMeio = await pendentesLocais(page);
  const centralNoMeio = naCentral(ids);
  anotar(EV, `T-20 pod apagado após ${noCorte} eventos confirmados; 4 s depois: ${pendentesNoMeio} pendentes no aparelho; central: ${centralNoMeio}; gateway: ${await statusDe('/api/v1/medicamento')}`);
  expect(pendentesNoMeio).toBeGreaterThan(0);
  expect(pendentesNoMeio).toBeLessThan(total);
  await page.screenshot({ path: resolve(EVIDENCIAS, 'resiliencia-t20-no-meio.png'), fullPage: true });
  expect((await local<{ n: number }>(page, "SELECT count(*) AS n FROM outbox WHERE status = 'REJEITADA'"))[0]!.n).toBe(0);

  kubectl('rollout', 'status', 'deploy/dona-cida', '--timeout=240s');
  anotar(EV, `T-20 pod novo pronto: ${prontos()} (reinícios do contêiner antes: ${reiniciosAntes})`);
  await page.unroute('**/api/v1/atendimento-evento');
  // o app conclui sozinho (temporizador/backoff); o botão só encurta a espera do teste
  await sincronizar(page);
  await esperarTudoEnviado(page);
  const final = naCentral(ids);
  anotar(EV, `T-20 depois da volta: ${await pendentesLocais(page)} pendentes; central: ${final}`);
  expect(final).toBe(`1 pessoa, 1 prontuario, 1 atendimento, ${OBS + 1} eventos`);
  await sincronizar(page);
  expect(naCentral(ids)).toBe(final);
  expect(contar(`SELECT count(*) FROM (SELECT op_id FROM clinico.operacao_sync GROUP BY op_id HAVING count(*) > 1) d`)).toBe(0);
  anotar(EV, 'T-20 sincronizar de novo não duplicou; nenhuma op_id repetida em operacao_sync');
});

test('T-14 — Postgres em 0 réplicas: readiness cai, sem laço de reinício, o app acumula e sincroniza na volta', async ({ page }) => {
  test.setTimeout(15 * 60_000);
  await entrar(page);
  const servicos = ['mike-baguncinha', 'dona-cida', 'jaiminho'];
  const reiniciosAntes = servicos.map(reinicios).join('/');
  const contagensAntes = sql(`SELECT (SELECT count(*) FROM clinico.pessoa)||'/'||(SELECT count(*) FROM clinico.atendimento)||'/'||(SELECT count(*) FROM clinico.atendimento_evento)||'/'||(SELECT count(*) FROM documentos.documento)`);
  const token = await tokenDe('COREN', '200002', 'RS');

  kubectl('scale', 'statefulset/postgres', '--replicas=0');
  try {
    await expect.poll(() => servicos.map(pronto).join('/'), { timeout: 120_000, intervals: [3000] }).toBe('false/false/false');
    anotar(EV, `T-14 Postgres em 0: ${prontos()}`);
    anotar(EV, `T-14 gateway com o banco fora: /medicamento -> ${await statusDe('/api/v1/medicamento', token)} | /auth/me -> ${await statusDe('/api/v1/auth/me', token)} | /portal/ -> ${(await fetch(`${BASE}/portal/`)).status}`);

    // o app continua registrando, no modo ONLINE (sem o seletor): a fila acumula
    await simularOffline(page, false);
    const ids = await novoPacienteComAtendimento(page, `QA Resiliencia Banco ${marca}`, `Alergia banco ${marca}`);
    await registrarSinais(page);
    await registrarObservacao(page, `Registrado com o banco central fora (${marca})`);
    await dormir(5000);
    const pendentes = await pendentesLocais(page);
    anotar(EV, `T-14 app com o banco fora: ${pendentes} operações pendentes, ${(await local<{ n: number }>(page, "SELECT count(*) AS n FROM outbox WHERE status = 'REJEITADA'"))[0]!.n} rejeitadas`);
    expect(pendentes).toBeGreaterThanOrEqual(5);
    expect((await local<{ n: number }>(page, "SELECT count(*) AS n FROM outbox WHERE status = 'REJEITADA'"))[0]!.n).toBe(0);
    await page.screenshot({ path: resolve(EVIDENCIAS, 'resiliencia-t14-banco-fora.png'), fullPage: true });

    // 75 s com o banco fora: liveness não pode reiniciar os serviços em laço
    await dormir(75_000);
    const reiniciosDurante = servicos.map(reinicios).join('/');
    anotar(EV, `T-14 após 75 s sem banco: reinícios mike/cida/jaiminho = ${reiniciosDurante} (antes: ${reiniciosAntes}); ${prontos()}`);
    expect(reiniciosDurante).toBe(reiniciosAntes);

    kubectl('scale', 'statefulset/postgres', '--replicas=1');
    esperarTodosProntos();
    anotar(EV, `T-14 Postgres de volta: ${prontos()}`);
    await sincronizar(page);
    await esperarTudoEnviado(page);
    const final = naCentral(ids);
    anotar(EV, `T-14 depois da volta: central: ${final}; contagens antes ${contagensAntes} -> depois ${sql(`SELECT (SELECT count(*) FROM clinico.pessoa)||'/'||(SELECT count(*) FROM clinico.atendimento)||'/'||(SELECT count(*) FROM clinico.atendimento_evento)||'/'||(SELECT count(*) FROM documentos.documento)`)}`);
    expect(final).toBe('1 pessoa, 1 prontuario, 1 atendimento, 2 eventos');
    const [p, a, e, d] = contagensAntes.split('/').map(Number);
    expect(sql(`SELECT (SELECT count(*) FROM clinico.pessoa)||'/'||(SELECT count(*) FROM clinico.atendimento)||'/'||(SELECT count(*) FROM clinico.atendimento_evento)||'/'||(SELECT count(*) FROM documentos.documento)`)).toBe(`${p! + 1}/${a! + 1}/${e! + 2}/${d}`);
  } finally {
    kubectl('scale', 'statefulset/postgres', '--replicas=1');
  }
});

test('T-23 / T-18 — Jaiminho fora: registrar e sincronizar seguem; PDF falha com erro claro. DonaCida fora: ficha → 503 sem documento órfão', async ({ page, browser }) => {
  await entrar(page);
  const token = await tokenDe('COREN', '200002', 'RS');
  const documentosAntes = contar('SELECT count(*) FROM documentos.documento');

  kubectl('scale', 'deploy/jaiminho', '--replicas=0');
  let ids = { pessoaId: '', atendimentoId: '' };
  try {
    await expect.poll(() => kubectl('get', 'pods', '-l', 'app.kubernetes.io/name=jaiminho', '-o', 'name'), { timeout: 60_000 }).toBe('');
    anotar(EV, `T-23 Jaiminho em 0: ${prontos()}`);
    await simularOffline(page, false);
    ids = await novoPacienteComAtendimento(page, `QA Resiliencia Jaiminho ${marca}`);
    await registrarSinais(page);
    await esperarTudoEnviado(page);
    anotar(EV, `T-23 app com o Jaiminho fora: tudo enviado; central: ${naCentral(ids)}`);
    expect(naCentral(ids)).toBe('1 pessoa, 1 prontuario, 1 atendimento, 1 eventos');

    const r = await api(token, 'POST', '/api/v1/documento/ficha-atendimento', { atendimentoId: ids.atendimentoId });
    anotar(EV, `T-23 POST /documento/ficha-atendimento com o Jaiminho fora -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 160)}`);
    expect(r.status).toBe(503);

    // no portal: erro claro para o usuário
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const portal = await ctx.newPage();
    await portal.goto('/portal/');
    await portal.getByRole('radio', { name: 'CRM', exact: true }).check();
    await portal.getByLabel(/Número do/).fill('100001');
    await portal.getByLabel('UF').selectOption('RS');
    await portal.getByLabel('Senha').fill(process.env.MF_SENHA_DEMO!);
    await portal.getByRole('button', { name: 'Entrar' }).click();
    await expect(portal.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();
    await portal.goto(`/portal/atendimentos/${ids.atendimentoId}`);
    await expect(portal.getByText('Passagem de caso')).toBeVisible();
    const ficha = portal.getByRole('region', { name: 'Ficha em PDF e envios' });
    // o bloco consulta o Jaiminho ao abrir: tem de sair do esqueleto para um erro legível
    await expect.poll(async () => (await ficha.innerText()).replace(/\s+/g, ' '), { timeout: 45_000 }).toMatch(/indispon|não foi possível|tente|erro|falh/i).catch(() => undefined);
    const blocoAoAbrir = (await ficha.innerText()).replace(/\s+/g, ' ').slice(0, 300);
    anotar(EV, `T-23 portal, bloco "Ficha em PDF e envios" com o Jaiminho fora: "${blocoAoAbrir}"`);
    await portal.getByRole('button', { name: 'Gerar PDF' }).click();
    const aviso = portal.getByRole('alert').or(portal.getByText(/indispon|não foi possível gerar|tente (de novo|novamente)/i)).first();
    await aviso.waitFor({ timeout: 30_000 }).catch(() => undefined);
    const mensagem = (await aviso.innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    await portal.screenshot({ path: resolve(EVIDENCIAS, 'resiliencia-t23-portal-pdf-falhou.png'), fullPage: true });
    anotar(EV, `T-23 portal, mensagem depois de clicar em "Gerar PDF": "${mensagem}" (captura resiliencia-t23-portal-pdf-falhou.png)`);
    expect(mensagem + blocoAoAbrir).toMatch(/indispon|não foi possível|tente|erro|falh/i);
    await ctx.close();
  } finally {
    kubectl('scale', 'deploy/jaiminho', '--replicas=1');
    kubectl('rollout', 'status', 'deploy/jaiminho', '--timeout=240s');
  }

  // T-18: DonaCida fora, Jaiminho no ar
  kubectl('scale', 'deploy/dona-cida', '--replicas=0');
  try {
    await expect.poll(() => kubectl('get', 'pods', '-l', 'app.kubernetes.io/name=dona-cida', '-o', 'name'), { timeout: 60_000 }).toBe('');
    const r = await api(token, 'POST', '/api/v1/documento/ficha-atendimento', { atendimentoId: ids.atendimentoId });
    anotar(EV, `T-18 POST /documento/ficha-atendimento com a DonaCida fora -> ${r.status} ${JSON.stringify(r.corpo).slice(0, 200)}`);
    expect(r.status).toBe(503);
    expect(r.corpo.codigo).toBe('SERVICO_INDISPONIVEL');
    expect(contar('SELECT count(*) FROM documentos.documento')).toBe(documentosAntes);
    anotar(EV, `T-18 documentos na central: ${documentosAntes} antes, ${contar('SELECT count(*) FROM documentos.documento')} depois (nenhum órfão)`);
  } finally {
    kubectl('scale', 'deploy/dona-cida', '--replicas=1');
    kubectl('rollout', 'status', 'deploy/dona-cida', '--timeout=240s');
  }
  // com tudo de volta a ficha é gerada
  await expect.poll(async () => (await api(token, 'POST', '/api/v1/documento/ficha-atendimento', { atendimentoId: ids.atendimentoId })).status, { timeout: 90_000, intervals: [8000] }).toBe(201);
  anotar(EV, 'T-23/T-18 com os serviços de volta: ficha gerada (201)');
});
