import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['reflect-metadata'], // os decorators do Nest precisam dele carregado antes
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
