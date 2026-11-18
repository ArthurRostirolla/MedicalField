import { defineConfig } from '@playwright/test';

// Specs de QA contra o sistema IMPLANTADO localmente com docker compose (gateway em :8088).
//   cd e2e && MF_SENHA_DEMO=... npx playwright test -c qa/playwright.config.ts [arquivo]
export default defineConfig({
  testDir: '.',
  // sufixo .qa.ts de proposito: o roteiro (e2e/playwright.config.ts, testDir '.') nao pode apanhar estas specs
  testMatch: /.*.qa.ts$/,
  outputDir: './resultados',
  workers: 1,
  timeout: 12 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    channel: process.env.CANAL ?? 'chrome',
    baseURL: process.env.MF_BASE ?? 'http://localhost:8088',
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'off',
    serviceWorkers: 'allow',
  },
});
