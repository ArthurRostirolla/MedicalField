import { defineConfig } from '@playwright/test';

// Ponta a ponta contra o backend REAL (Mike 8081, Cida 8082, Jaiminho 8083, Postgres 5544).
// Usa o Chrome instalado (CANAL=msedge para o Edge): nada e baixado.
// A senha de demonstracao vem de MF_SENHA_DEMO (ver services/mike-baguncinha/README.md).
export default defineConfig({
  testDir: '.',
  outputDir: './resultados',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    channel: process.env.CANAL ?? 'chrome',
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    trace: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    // Servidor de desenvolvimento do Vite: todos os cenarios menos o do PWA.
    { name: 'dev', testIgnore: /(pwa|producao)\.spec\.ts/, use: { baseURL: 'http://localhost:5182' } },
    // Build de producao servido por `vite preview`: a casca abre sem rede (service worker).
    { name: 'pwa', testMatch: /pwa\.spec\.ts/, use: { baseURL: 'http://localhost:5183' } },
    // Build de producao NORMAL (sem VITE_DIAGNOSTICO): a porta de diagnostico nao pode existir.
    { name: 'producao', testMatch: /producao\.spec\.ts/, use: { baseURL: 'http://localhost:5184' } },
  ],
  webServer: [
    { command: 'npm run dev', cwd: '..', url: 'http://localhost:5182/app/', reuseExistingServer: true, timeout: 60_000 },
    { command: 'npm run build:diagnostico && npm run preview:diagnostico', cwd: '..', url: 'http://localhost:5183/app/', reuseExistingServer: true, timeout: 180_000 },
    { command: 'npm run build && npm run preview:producao', cwd: '..', url: 'http://localhost:5184/app/', reuseExistingServer: true, timeout: 180_000 },
  ],
});
