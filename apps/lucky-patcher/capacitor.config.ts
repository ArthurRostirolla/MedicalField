import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.medicalfield.cliente',
  appName: 'MedicalField',
  webDir: 'dist-android',
  // Origem interna do WebView em http://localhost: assim o servidor de demonstracao (sem TLS) nao vira
  // conteudo misto. Quem libera ou proibe trafego em claro NAO e esta configuracao: e o
  // network_security_config do Android (liberado so no build de depuracao; ver docs/android.md).
  server: { androidScheme: 'http' },
  plugins: {
    // Substitui o fetch do WebView por HTTP nativo: sem CORS entre o app e o servidor configurado.
    CapacitorHttp: { enabled: true },
    // Banco cifrado (SQLCipher); a senha fica no armazenamento seguro do Android.
    CapacitorSQLite: { androidIsEncryption: true },
  },
};

export default config;
