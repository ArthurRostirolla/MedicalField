// Configuracao do Expo: um codigo para Android, iOS e web. As pastas android/ e ios/ sao geradas por
// `expo prebuild` (nao versionadas).
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'MedicalField',
  slug: 'medicalfield-lucky-patcher',
  scheme: 'medicalfield',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './public/icone.png',
  ios: {
    bundleIdentifier: 'br.medicalfield.cliente',
    supportsTablet: true,
  },
  android: {
    package: 'br.medicalfield.cliente',
    versionCode: 1,
    allowBackup: false,
    permissions: ['INTERNET'],
    // O Expo adiciona estas por padrao; o app so precisa de rede.
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.VIBRATE',
    ],
  },
  web: {
    output: 'single',
    bundler: 'metro',
    favicon: './public/icone.png',
  },
  experiments: { baseUrl: '/app' },
  plugins: [
    'expo-router',
    // As regras de backup sao nossas (plugins/seguranca.js): nada do app vai para backup.
    ['expo-secure-store', { configureAndroidBackup: false }],
    ['expo-sqlite', { useSQLCipher: true }],
    ['expo-build-properties', { android: { minSdkVersion: 24 } }],
    './plugins/seguranca.js',
  ],
};

export default config;
