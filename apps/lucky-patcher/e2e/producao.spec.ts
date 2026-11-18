// D-QA-02: no build de producao NORMAL (`npm run build`, sem VITE_DIAGNOSTICO) a porta de diagnostico
// nao existe. Roda sobre `vite preview` na porta 5184 (projeto "producao").
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { senhaDemo } from './apoio.ts';

test('build de producao: window.__mf e undefined, antes e depois do login', async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  expect(await page.evaluate(() => typeof (window as unknown as { __mf?: unknown }).__mf)).toBe('undefined');

  await page.getByLabel('Número do COREN').fill('200002');
  await page.getByLabel('Senha').fill(senhaDemo());
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /sync \d\d:\d\d/ })).toBeVisible({ timeout: 30_000 });
  expect(await page.evaluate(() => typeof (window as unknown as { __mf?: unknown }).__mf)).toBe('undefined');
});

test('build de producao: o codigo da porta de diagnostico nem vai no pacote', () => {
  const pasta = join(import.meta.dirname, '..', 'dist', 'assets');
  const pacotes = readdirSync(pasta).filter((arquivo) => arquivo.endsWith('.js'));
  expect(pacotes.length).toBeGreaterThan(0);
  for (const arquivo of pacotes) {
    const codigo = readFileSync(join(pasta, arquivo), 'utf8');
    expect(codigo.includes('__mf'), `${arquivo} menciona __mf`).toBe(false);
    expect(codigo.includes('Diagnóstico somente leitura'), `${arquivo} traz a porta de diagnostico`).toBe(false);
  }
});
