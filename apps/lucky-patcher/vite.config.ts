import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// O prefixo nao e removido: cada servico atende em /api/v1/... (docs/contratos.md, secao 1).
const MIKE = 'http://localhost:8081';
const proxy = {
  '/api/v1/auth': MIKE,
  '/api/v1/log': MIKE,
  '/api/v1/auditoria': MIKE,
  '/api/v1/documento': 'http://localhost:8083',
  '/api/v1': 'http://localhost:8082',
};

export default defineConfig(({ mode }) => {
  // No Android (Capacitor) os arquivos sao servidos da raiz do WebView e nao ha service worker.
  const android = mode === 'android';
  return {
    base: android ? './' : '/app/',
    build: { outDir: android ? 'dist-android' : 'dist', target: 'es2022' },
    plugins: [
      react(),
      tailwindcss(),
      !android &&
        VitePWA({
          registerType: 'autoUpdate',
          includeAssets: ['icone.svg'],
          manifest: {
            name: 'MedicalField',
            short_name: 'MedicalField',
            description: 'Prontuário de emergência Offline-First — dados demonstrativos',
            lang: 'pt-BR',
            start_url: '/app/',
            scope: '/app/',
            display: 'standalone',
            background_color: '#fbfafc',
            theme_color: '#1a1320',
            icons: [{ src: 'icone.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
          },
          workbox: {
            // A casca inteira (inclusive o SQLite em WebAssembly e as fontes) abre sem rede.
            globPatterns: ['**/*.{js,css,html,wasm,woff2,svg}'],
            maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
            navigateFallback: '/app/index.html',
            navigateFallbackDenylist: [/^\/api\//],
          },
        }),
    ],
    resolve: android ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-vazio.ts', import.meta.url)) } } : {},
    worker: { format: 'es' as const },
    optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
    server: { port: 5182, strictPort: true, proxy },
    preview: { port: 5183, strictPort: true, proxy },
    test: { include: ['src/**/*.test.ts'], environment: 'node' },
  };
});
