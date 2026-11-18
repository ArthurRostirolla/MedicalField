import { defineConfig } from '@playwright/test';

// Roteiro academico contra o sistema IMPLANTADO (padrao: gateway do docker compose local em :8088).
//   MF_BASE        endereco do gateway           (padrao http://localhost:8088)
//   MF_ALVO        "compose" (docker compose exec, padrao) ou "dev" (scripts/dev-*.sh) para o SQL e o Mailpit
//   MF_SENHA_DEMO  senha de demonstracao (apps/mike-baguncinha/README.md)
export default defineConfig({
  testDir: '.',
  // So o roteiro: outras specs (e2e/qa) tem configuracao propria e derrubam pods.
  testMatch: 'roteiro.spec.ts',
  outputDir: './resultados',
  workers: 1,
  timeout: 10 * 60_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    channel: process.env.CANAL ?? 'chrome',
    baseURL: process.env.MF_BASE ?? 'http://localhost:8088',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Sem rastro: o trace.zip guardaria a senha digitada e os tokens dentro do repositorio.
    trace: 'off',
    serviceWorkers: 'allow',
  },
});
