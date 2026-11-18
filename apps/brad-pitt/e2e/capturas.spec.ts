// Capturas das telas reais (backend real) em 1440 px e 390 px, tema claro e escuro, em ../capturas/.
// Servem à revisão visual (apps/brad-pitt/IMPECCABLE.md) e falham se houver erro no console
// ou rolagem horizontal na página.
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { join } from 'node:path';
import { ATENDIMENTO_COMPLETO, entrar, vigiarConsole } from './apoio';

const DESTINO = join(import.meta.dirname, '..', 'capturas');

async function capturar(pagina: Page, nome: string, inteira = true): Promise<void> {
  await pagina.evaluate(() => document.fonts.ready);
  await pagina.waitForLoadState('networkidle');
  await expect(pagina.locator('.mf-esqueleto')).toHaveCount(0);
  const sobra = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, `${nome}: rolagem horizontal da página`).toBeLessThanOrEqual(0);
  // Auditoria automática de acessibilidade (WCAG 2.2 A/AA) na tela renderizada.
  const axe = await new AxeBuilder({ page: pagina }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(
    axe.violations.map((v) => v.id + ': ' + v.nodes.map((n) => n.target.join(' ')).join(' | ')),
    nome + ': violações de acessibilidade (axe)',
  ).toEqual([]);
  // Página inteira com a janela na altura do conteúdo: o índice fixo sai do tamanho real.
  const janela = pagina.viewportSize();
  if (inteira && janela) {
    const altura = await pagina.evaluate(() => document.documentElement.scrollHeight);
    await pagina.setViewportSize({ width: janela.width, height: Math.max(janela.height, altura) });
  }
  await pagina.screenshot({ path: join(DESTINO, `${nome}.png`) });
  if (janela) await pagina.setViewportSize(janela);
}

for (const largura of [1440, 390] as const) {
  for (const tema of ['claro', 'escuro'] as const) {
    test.describe(`${largura} px, tema ${tema}`, () => {
      test.use({
        viewport: { width: largura, height: largura === 1440 ? 900 : 844 },
        colorScheme: tema === 'escuro' ? 'dark' : 'light',
      });
      const sufixo = `${largura}-${tema}`;

      test('telas do portal', async ({ page }) => {
        const erros = vigiarConsole(page);
        await page.goto('./');
        await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
        await capturar(page, `login-${sufixo}`);

        await entrar(page);
        await expect(page.getByRole('table', { name: 'Livro de atendimentos' }).locator('tr[data-clicavel]').first()).toBeVisible();
        await capturar(page, `atendimentos-${sufixo}`);

        await page.goto(`./atendimentos/${ATENDIMENTO_COMPLETO}`);
        await expect(page.getByRole('region', { name: 'Linha do tempo' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Ficha em PDF e envios' })).toBeVisible();
        await capturar(page, `atendimento-${sufixo}`);

        const enviar = page.getByRole('button', { name: 'Enviar por e-mail' });
        if (await enviar.isVisible()) {
          await enviar.click();
          await expect(page.getByRole('dialog')).toBeVisible();
          await capturar(page, `atendimento-dialogo-${sufixo}`, false);
          await page.keyboard.press('Escape');
        }

        await page.getByRole('link', { name: 'Prontuários' }).click();
        await page.getByRole('table', { name: 'Prontuários' }).locator('tr[data-clicavel]').first().waitFor();
        await capturar(page, `prontuarios-${sufixo}`);
        await page.getByRole('table', { name: 'Prontuários' }).locator('tr[data-clicavel]').first().click();
        await expect(page.getByRole('heading', { name: 'Atendimentos desta pessoa' })).toBeVisible();
        await capturar(page, `pessoa-${sufixo}`);

        await page.getByRole('link', { name: 'Medicamentos' }).click();
        await expect(page.getByText('Adrenalina', { exact: true })).toBeVisible();
        await capturar(page, `medicamentos-${sufixo}`);

        await page.getByRole('link', { name: 'Logs de acesso' }).click();
        await page.getByRole('table', { name: 'Logs de acesso' }).locator('tbody tr').first().waitFor();
        await capturar(page, `logs-${sufixo}`, false);

        await page.getByRole('link', { name: 'Possíveis duplicatas' }).click();
        await expect(page.getByRole('heading', { name: 'Possíveis duplicatas', level: 2 })).toBeVisible();
        await capturar(page, `duplicatas-${sufixo}`);

        // Verificação: chega-se pelo QR; aqui, pelo id do documento mais recente do atendimento.
        await page.goto(`./atendimentos/${ATENDIMENTO_COMPLETO}`);
        const resposta = page.waitForResponse((r) => r.url().includes('/documento/ficha-atendimento'));
        await page.getByRole('button', { name: 'Gerar PDF' }).click();
        const documento = (await (await resposta).json()) as { id: string };
        await page.goto(`./documentos/${documento.id}`);
        await expect(page.getByRole('heading', { name: /Documento/ })).toBeVisible();
        await capturar(page, `verificacao-${sufixo}`);
        expect(erros).toEqual([]);
      });
    });
  }
}

test('estados de erro (serviço fora) têm "tentar de novo"', async ({ page }) => {
  await entrar(page);
  // Simula a DonaCida fora do ar só para esta captura; o resto dos testes usa o backend real.
  await page.route('**/api/v1/medicamento**', (rota) => rota.abort());
  await page.getByRole('link', { name: 'Medicamentos' }).click();
  await expect(page.getByRole('button', { name: 'Tentar de novo' })).toBeVisible();
  await capturar(page, 'erro-1440-claro');
  await page.unroute('**/api/v1/medicamento**');
  await page.getByRole('button', { name: 'Tentar de novo' }).click();
  await expect(page.getByText('Adrenalina', { exact: true })).toBeVisible();
});
