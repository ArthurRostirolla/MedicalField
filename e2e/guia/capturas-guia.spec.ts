// Gera as capturas de tela usadas no guia visual (docs/apresentacao/guia-visual/telas).
// Uso: MF_SENHA_DEMO=... npx playwright test -c e2e/guia/playwright.config.ts
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import {
  entrar,
  novoPacienteComAtendimento,
  registrarGlasgow,
  registrarMedicacao,
  registrarObservacao,
  registrarSinais,
  registrarTriagem,
  senhaDemo,
  simularOffline,
} from '../../apps/lucky-patcher/e2e/apoio.ts';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TELAS = resolve(RAIZ, 'docs/apresentacao/guia-visual/telas');
const foto = (pagina: Page, nome: string) => pagina.screenshot({ path: resolve(TELAS, `${nome}.png`) });

function sql(consulta: string): string {
  return execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'medicalfield', '-At', '-c', consulta], {
    cwd: resolve(RAIZ, 'deploy'),
    encoding: 'utf8',
  }).trim();
}

const nome = `Ana Guia ${Date.now().toString(36).toUpperCase()}`;

test('capturas do guia visual', async ({ browser }) => {
  // ---------- App do profissional (390 px, como um celular) ----------
  const ctxApp = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const app = await ctxApp.newPage();
  await app.goto('/app/');
  await expect(app.getByRole('radio', { name: 'COREN' })).toBeVisible();
  await app.waitForTimeout(1200);
  await foto(app, 'app-entrar-1');
  await app.getByRole('radio', { name: 'COREN' }).click();
  await expect(app.getByRole('heading', { name: 'Entrar com COREN' })).toBeVisible();
  await app.getByLabel('Número do COREN').fill('200002');
  await app.waitForTimeout(600);
  await foto(app, 'app-entrar-2');
  await app.goto('/app/');
  await entrar(app);
  await foto(app, 'app-inicio');
  await app.getByRole('button', { name: 'Detalhes da conexão' }).first().click();
  await foto(app, 'app-conexao');
  await app.getByRole('button', { name: 'Detalhes da conexão' }).first().click();

  await app.goto('/app/pacientes');
  await expect(app.getByLabel('Buscar por nome ou CPF')).toBeVisible();
  await app.waitForTimeout(800);
  await foto(app, 'app-pacientes');

  await app.goto('/app/pacientes/novo');
  await app.getByLabel('Nome completo').fill(nome);
  await app.getByLabel('Alergias').fill('Dipirona (fictício)');
  await foto(app, 'app-novo-paciente');
  const { pessoaId, atendimentoId } = await novoPacienteComAtendimento(app, nome, 'Dipirona (fictício)');
  await foto(app, 'app-atendimento-vazio');

  await app.getByRole('radio', { name: 'Sinais' }).check({ force: true });
  await app.getByLabel('PA sistólica').fill('128');
  await app.getByLabel('PA diastólica').fill('84');
  await app.getByLabel('Freq. cardíaca').fill('92');
  await foto(app, 'app-painel-sinais');
  await registrarSinais(app);

  await app.getByRole('radio', { name: 'Glasgow' }).check({ force: true });
  await foto(app, 'app-painel-glasgow');
  await registrarGlasgow(app);

  await app.getByRole('radio', { name: 'Triagem' }).check({ force: true });
  await foto(app, 'app-painel-triagem');
  await registrarTriagem(app, 'AMARELO');

  await app.getByRole('radio', { name: 'Medicação' }).check({ force: true });
  await foto(app, 'app-painel-medicacao');
  await registrarMedicacao(app, 'Dipirona');
  await app.waitForTimeout(800);
  await foto(app, 'app-atendimento');

  await app.goto(`/app/atendimentos/${atendimentoId}/passagem`);
  await app.waitForTimeout(1200);
  await foto(app, 'app-passagem');

  await app.goto(`/app/pacientes/${pessoaId}`);
  await app.waitForTimeout(1200);
  await foto(app, 'app-prontuario');

  // Offline: o registro fica na fila e aparece em Pendencias.
  await app.goto(`/app/atendimentos/${atendimentoId}`);
  await simularOffline(app, true);
  await foto(app, 'app-offline');
  await registrarObservacao(app, 'Registro feito sem rede (guia).');
  await app.goto('/app/pendencias');
  await app.waitForTimeout(1200);
  await foto(app, 'app-pendencias');
  await simularOffline(app, false);
  await app.goto('/app/ajustes');
  await app.waitForTimeout(1200);
  await foto(app, 'app-ajustes');

  // ---------- Portal administrativo (1440 px) ----------
  const ctxPortal = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const portal = await ctxPortal.newPage();
  await portal.goto('/portal/');
  await expect(portal.getByRole('radio', { name: 'CRM', exact: true })).toBeVisible();
  await foto(portal, 'portal-login');
  await portal.getByRole('radio', { name: 'CRM', exact: true }).check();
  await portal.getByLabel(/Número do/).fill('100001');
  await portal.getByLabel('UF').selectOption('RS');
  await portal.getByLabel('Senha').fill(senhaDemo());
  await portal.getByRole('button', { name: 'Entrar' }).click();
  await expect(portal.getByRole('navigation', { name: 'Seções do portal' })).toBeVisible();

  const livro = portal.getByRole('table', { name: 'Livro de atendimentos' });
  await expect.poll(async () => livro.getByText(nome).count(), { timeout: 30_000, intervals: [1000] }).toBeGreaterThan(0);
  await foto(portal, 'portal-atendimentos');
  await livro.getByRole('row').filter({ hasText: nome }).first().click();
  await expect(portal.getByText('Passagem de caso')).toBeVisible();
  await portal.getByRole('button', { name: 'Gerar PDF' }).click();
  const ficha = portal.getByRole('region', { name: 'Ficha em PDF e envios' });
  await expect(ficha.getByText('Íntegra')).toBeVisible();
  await foto(portal, 'portal-atendimento');
  await portal.screenshot({ path: resolve(TELAS, 'portal-atendimento-inteiro.png'), fullPage: true });

  await ficha.getByRole('button', { name: 'Enviar por e-mail' }).click();
  const dialogo = portal.getByRole('dialog', { name: 'Enviar a ficha por e-mail' });
  await dialogo.getByLabel('Nome do destinatário').fill('Familiar da Ana');
  await dialogo.getByLabel('E-mail').fill('familiar@exemplo.test');
  await dialogo.getByRole('radio', { name: 'Familiar' }).check();
  await foto(portal, 'portal-email');
  await dialogo.getByRole('button', { name: 'Enviar ficha' }).click();
  await expect(ficha.getByRole('row').filter({ hasText: 'familiar@exemplo.test' }).getByText('Enviado').first()).toBeVisible({ timeout: 60_000 });
  await foto(portal, 'portal-enviado');

  const documentoId = sql(`SELECT id FROM documentos.documento ORDER BY gerado_em DESC LIMIT 1`);
  await portal.goto(`/portal/documentos/${documentoId}`);
  await portal.waitForTimeout(1500);
  await foto(portal, 'portal-verificacao');

  for (const [secao, arquivo] of [['Prontuários', 'portal-prontuarios'], ['Medicamentos', 'portal-medicamentos']] as const) {
    await portal.getByRole('link', { name: secao, exact: true }).click();
    await portal.waitForTimeout(1500);
    await foto(portal, arquivo);
  }
  await portal.goto(`/portal/prontuarios/${pessoaId}`);
  await portal.waitForTimeout(1500);
  await foto(portal, 'portal-pessoa');
  await portal.goto('/portal/auditoria/acessos');
  await portal.waitForTimeout(2000);
  await foto(portal, 'portal-logs');
  await portal.goto('/portal/auditoria/duplicatas');
  await portal.waitForTimeout(1500);
  await foto(portal, 'portal-duplicatas');

  // Mailpit: a mensagem com o PDF anexado.
  await portal.goto('http://127.0.0.1:18025/');
  await portal.waitForTimeout(1500);
  await portal.getByText('familiar@exemplo.test').first().click().catch(() => undefined);
  await portal.waitForTimeout(1500);
  await foto(portal, 'mailpit');
});
