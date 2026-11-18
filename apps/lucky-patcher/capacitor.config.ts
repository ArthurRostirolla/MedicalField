import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.medicalfield.cliente',
  appName: 'MedicalField',
  webDir: 'dist-android',
  // http no esquema local evita bloqueio de conteudo misto quando o servidor de demonstracao nao tem TLS.
  server: { androidScheme: 'http', cleartext: true },
  plugins: {
    // Substitui o fetch do WebView por HTTP nativo: sem CORS entre o app e o servidor configurado.
    CapacitorHttp: { enabled: true },
    // Banco cifrado (SQLCipher); a senha fica no armazenamento seguro do Android.
    CapacitorSQLite: { androidIsEncryption: true },
  },
};

export default config;
