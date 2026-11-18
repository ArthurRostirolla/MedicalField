import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const MIKE = process.env.MF_MIKE_URL ?? 'http://localhost:8081';
const CIDA = process.env.MF_CIDA_URL ?? 'http://localhost:8082';
const JAIMINHO = process.env.MF_JAIMINHO_URL ?? 'http://localhost:8083';

// Mesmo roteamento do gateway (docs/contratos.md §1): o prefixo não é removido.
// A ordem importa: as regras específicas vêm antes do "resto de /api/v1".
const proxy = {
  '/api/v1/auth': MIKE,
  '/api/v1/log': MIKE,
  '/api/v1/auditoria': MIKE,
  '/api/v1/documento': JAIMINHO,
  '/api/v1': CIDA,
};

export default defineConfig({
  base: '/portal/',
  plugins: [react(), tailwindcss()],
  server: { port: 5181, strictPort: true, proxy },
  preview: { port: 5181, strictPort: true, proxy },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/teste.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
