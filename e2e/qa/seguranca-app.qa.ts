// QA — o que o app publicado (build de producao servido pelo cluster) expoe no navegador.
import { expect, test } from '@playwright/test';
import { entrar } from '../../apps/lucky-patcher/e2e/apoio.ts';
import { anotar } from './apoio-qa.ts';

const EV = 'seguranca-app.txt';

test('QA-16 — window.__mf no build de produção e onde ficam os tokens', async ({ page }) => {
  anotar(EV, `\n=== execução ${new Date().toISOString()} ===`);
  await entrar(page);
  const exposto = await page.evaluate(() => {
    const mf = (window as unknown as { __mf?: Record<string, unknown> }).__mf;
    return { tipo: typeof mf, chaves: mf ? Object.keys(mf) : [] };
  });
  anotar(EV, `window.__mf em ${page.url()}: tipo=${exposto.tipo} chaves=${exposto.chaves.join(',')}`);

  const consultar = (sql: string) =>
    page.evaluate(async (s) => {
      try {
        return { ok: true, linhas: await (window as unknown as { __mf: { consultar: (s: string, p: unknown[]) => Promise<unknown[]> } }).__mf.consultar(s, []) };
      } catch (e) {
        return { ok: false, erro: String(e) };
      }
    }, sql);

  // leitura da sessao: ha access/refresh token no banco local?
  const sessao = await consultar("SELECT valor FROM sync_estado WHERE chave = 'sessao'");
  const valor = sessao.ok ? String((sessao.linhas as { valor: string }[])[0]?.valor ?? '') : '';
  const campos = valor ? Object.keys(JSON.parse(valor)) : [];
  const temAccess = /eyJ[A-Za-z0-9_-]+\.eyJ/.test(valor);
  anotar(EV, `__mf.consultar leu sync_estado.sessao: campos=[${campos.join(',')}] contém JWT=${temAccess} contém refreshToken=${/refresh/i.test(valor)} (valores não gravados na evidência)`);

  // escrita pelo mesmo caminho ("somente leitura"?)
  const escrita = await consultar("CREATE TABLE IF NOT EXISTS qa_prova_escrita (x INTEGER); INSERT INTO qa_prova_escrita VALUES (42)");
  const leitura = await consultar('SELECT x FROM qa_prova_escrita');
  anotar(EV, `__mf.consultar com CREATE TABLE + INSERT: ${JSON.stringify(escrita).slice(0, 160)}; SELECT depois: ${JSON.stringify(leitura).slice(0, 120)}`);
  await consultar('DROP TABLE IF EXISTS qa_prova_escrita');

  const armazenamento = await page.evaluate(() => ({
    localStorage: Object.keys(localStorage),
    sessionStorage: Object.keys(sessionStorage),
    cookiesVisiveisAoJs: document.cookie.length,
  }));
  anotar(EV, `app: localStorage=[${armazenamento.localStorage.join(',')}] sessionStorage=[${armazenamento.sessionStorage.join(',')}] document.cookie=${armazenamento.cookiesVisiveisAoJs} caracteres`);

  // Estes dois expects DOCUMENTAM o defeito: falham enquanto ele existir.
  expect.soft(exposto.tipo, 'window.__mf não deveria existir no build de produção').toBe('undefined');
  expect.soft(escrita.ok && leitura.ok && (leitura.linhas as unknown[]).length > 0, '__mf.consultar não deveria conseguir escrever').toBe(false);
});

test('QA-17 — portal: token só em memória; nome malicioso é exibido como texto', async ({ page }) => {
  let dialogo = false;
  page.on('dialog', (d) => { dialogo = true; void d.dismiss(); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/portal/');
  await page.getByRole('radio', { name: 'CRM', exact: true }).check();
  await page.getByLabel(/Número do/).fill('100001');
  await page.getByLabel('UF').selectOption('RS');
  await page.getByLabel('Senha').fill(process.env.MF_SENHA_DEMO!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();
  const guardado = await page.evaluate(() => ({
    local: Object.fromEntries(Object.entries(localStorage)),
    sessao: Object.keys(sessionStorage),
    cookie: document.cookie,
  }));
  const tudo = JSON.stringify(guardado);
  anotar(EV, `portal: localStorage=${JSON.stringify(guardado.local)} sessionStorage=[${guardado.sessao.join(',')}] document.cookie="${guardado.cookie}"`);
  expect(tudo).not.toMatch(/eyJ[A-Za-z0-9_-]+\.eyJ/);
  expect(guardado.cookie).not.toContain('mf_refresh');
  const cookies = await page.context().cookies();
  const refresh = cookies.find((c) => c.name === 'mf_refresh');
  anotar(EV, `portal: cookie mf_refresh httpOnly=${refresh?.httpOnly} secure=${refresh?.secure} sameSite=${refresh?.sameSite} path=${refresh?.path}`);
  expect(refresh?.httpOnly).toBe(true);
  expect(refresh?.sameSite).toBe('Strict');

  // pessoa gravada pelos testes de injecao: <script>alert(1)</script> no nome
  await page.getByRole('link', { name: 'Prontuários', exact: true }).click();
  await page.waitForLoadState('networkidle');
  const busca = page.getByRole('searchbox').or(page.getByLabel(/Buscar/)).first();
  if (await busca.isVisible().catch(() => false)) {
    await busca.fill('QA Robert');
    await page.waitForLoadState('networkidle');
  }
  const visivel = await page.getByText('<script>alert(1)</script>', { exact: false }).first().isVisible().catch(() => false);
  anotar(EV, `portal: nome com <script> aparece como texto literal=${visivel}; algum alert() disparou=${dialogo}`);
  expect(dialogo).toBe(false);
});
