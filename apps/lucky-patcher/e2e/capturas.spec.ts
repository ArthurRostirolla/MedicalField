// Capturas das telas REAIS do app (base da revisao visual): 390x844 e 1280, claro e escuro.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  entrar,
  esperarTudoEnviado,
  novoPacienteComAtendimento,
  registrarGlasgow,
  registrarMedicacao,
  registrarObservacao,
  registrarSinais,
  registrarTriagem,
  simularOffline,
  vigiarConsole,
} from './apoio.ts';

const DESTINO = join(import.meta.dirname, '..', 'capturas');
mkdirSync(DESTINO, { recursive: true });

async function fotografar(page: Page, nome: string, largura: number) {
  for (const tema of ['claro', 'escuro'] as const) {
    await page.evaluate((t) => (document.documentElement.dataset.tema = t), tema);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    // Janela na altura do conteudo: as barras fixas ficam no lugar certo na imagem.
    const janela = page.viewportSize()!;
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: largura, height: Math.max(janela.height, altura) });
    await page.waitForTimeout(150);
    await page.screenshot({ path: join(DESTINO, `${nome}-${largura}-${tema}.png`) });
    await page.setViewportSize(janela);
  }
  const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(sobra, `${nome} em ${largura}px tem rolagem horizontal`).toBeLessThanOrEqual(0);
}

for (const largura of [390, 1280]) {
  test(`capturas em ${largura}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: largura, height: largura === 390 ? 844 : 800 });
    const erros = vigiarConsole(page);

    await page.goto('/app/');
    await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
    await fotografar(page, 'entrar', largura);

    await entrar(page);
    await esperarTudoEnviado(page);
    await expect(page.getByTestId('contagem-local')).not.toContainText('0 medicamentos');
    await fotografar(page, 'inicio-vazio', largura);

    const nome = 'Marlene Antunes Figueiró'; // nome limpo para a captura; o id e que e unico
    await page.goto('/app/#/pacientes/novo');
    await expect(page.getByLabel('Nome completo')).toBeVisible();
    await fotografar(page, 'novo-paciente', largura);

    await novoPacienteComAtendimento(page, nome, 'Dipirona, látex');
    await fotografar(page, 'atendimento-vazio', largura);
    await registrarTriagem(page, 'LARANJA');
    await registrarSinais(page);
    await registrarGlasgow(page);
    await esperarTudoEnviado(page);

    // Offline: o que entra agora fica com selo "local" e a tira vira bloco invertido.
    await simularOffline(page, true);
    await registrarMedicacao(page, { foraDoCatalogo: 'Dinitrato de isossorbida' });
    await registrarObservacao(page, 'Paciente consciente e orientada, refere melhora da dor.');
    await page.getByRole('button', { name: 'Retificar' }).click();
    const opcaoSinais = await page.getByLabel('Registro a retificar').locator('option', { hasText: 'Sinais vitais' }).first().getAttribute('value');
    await page.getByLabel('Registro a retificar').selectOption(opcaoSinais!);
    await page.getByLabel('Freq. cardíaca').fill('112');
    await page.getByLabel('Motivo da retificação').fill('Frequência cardíaca digitada errada.');
    await page.getByRole('button', { name: 'Registrar retificação' }).click();
    await expect(page.getByText('Sinais vitais gravados')).toBeVisible(); // a retificacao e a medida corrigida
    await page.getByRole('radio', { name: 'Sinais' }).check({ force: true });
    await fotografar(page, 'atendimento-offline', largura);

    await page.getByRole('radio', { name: 'Medicação' }).check({ force: true });
    await fotografar(page, 'atendimento-medicacao', largura);
    await page.getByRole('radio', { name: 'Triagem' }).check({ force: true });
    await fotografar(page, 'atendimento-triagem', largura);
    await page.getByRole('radio', { name: 'Glasgow' }).check({ force: true });
    await fotografar(page, 'atendimento-glasgow', largura);

    await page.getByRole('link', { name: 'Passagem de caso' }).click();
    await expect(page.getByRole('heading', { name: 'Passagem de caso', level: 2 })).toBeVisible();
    await fotografar(page, 'passagem', largura);

    await page.goto('/app/#/pendencias');
    await expect(page.getByTestId('pendencia-fila').first()).toBeVisible();
    await fotografar(page, 'pendencias', largura);

    await page.goto('/app/#/pacientes');
    await page.getByLabel('Buscar por nome ou CPF').fill('Marlene');
    await expect(page.getByRole('link', { name: new RegExp(nome) }).first()).toBeVisible();
    await fotografar(page, 'pacientes', largura);
    await page.getByRole('link', { name: new RegExp(nome) }).first().click();
    await expect(page.getByRole('heading', { name: 'Alergias' })).toBeVisible();
    await fotografar(page, 'prontuario', largura);

    await page.goto('/app/#/');
    await expect(page.getByRole('link', { name: new RegExp(nome) }).first()).toBeVisible();
    await fotografar(page, 'inicio-offline', largura);
    await page.goto('/app/#/ajustes');
    await expect(page.getByRole('button', { name: 'Sair' })).toBeVisible();
    await fotografar(page, 'ajustes', largura);

    await simularOffline(page, false);
    await esperarTudoEnviado(page);
    expect(erros, 'erros no console').toEqual([]);
  });
}
