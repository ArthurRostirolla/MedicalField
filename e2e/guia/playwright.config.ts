import { defineConfig } from '@playwright/test';

// Capturas de tela do guia visual (docs/apresentacao/guia-visual), contra o docker compose local.
//   MF_BASE        endereco do gateway (padrao http://127.0.0.1:8088)
//   MF_SENHA_DEMO  senha de demonstracao (apps/mike-baguncinha/README.md)
export default defineConfig({
  testDir: '.',
  testMatch: 'capturas-guia.spec.ts',
  outputDir: './resultados',
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    channel: process.env.CANAL ?? 'chrome',
    baseURL: process.env.MF_BASE ?? 'http://127.0.0.1:8088',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'off',
  },
});
