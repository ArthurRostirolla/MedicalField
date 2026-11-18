// Testes de unidade: nucleo em node (SQLite WASM em memoria); telas em jsdom pelo react-native-web.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Os pacotes RN apontam `main` para CommonJS, que o Node carregaria sem o alias: forca a versao ESM.
    alias: [
      { find: /^react-native$/, replacement: 'react-native-web' },
      { find: /^react-native-svg$/, replacement: 'react-native-svg/lib/module/index.js' },
      { find: /^react-native-safe-area-context$/, replacement: 'react-native-safe-area-context/lib/module/index.js' },
      { find: /^@react-native\/assets-registry\/registry$/, replacement: new URL('src/teste/registro-de-assets.ts', import.meta.url).pathname },
    ],
    // Arquivos .web.* primeiro, como o Metro faz no build web (react-native-svg, Select, plataforma).
    extensions: ['.web.tsx', '.web.ts', '.web.js', '.tsx', '.ts', '.mjs', '.js', '.json'],
  },
  define: { __DEV__: 'true', 'process.env.EXPO_BASE_URL': '""' },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Tudo passa pelo Vite: so assim o alias react-native -> react-native-web vale dentro das dependencias.
    server: { deps: { inline: true } },
  },
});
