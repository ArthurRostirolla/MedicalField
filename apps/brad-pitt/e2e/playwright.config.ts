import { defineConfig } from '@playwright/test';

// Testes de ponta a ponta contra o backend REAL (MikeBaguncinha, DonaCida, Jaiminho e Mailpit no ar:
// `bash scripts/dev-servicos.sh subir`). O Vite do portal sobe e desce junto com os testes.
export default defineConfig({
  testDir: '.',
  outputDir: './resultados',
  globalSetup: './preparar.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5181/portal/',
    // Usa o Chrome instalado; nada de baixar navegador. `CANAL=msedge` para o Edge.
    channel: process.env.CANAL ?? 'chrome',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    colorScheme: 'light',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev',
    cwd: '..',
    url: 'http://localhost:5181/portal/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
