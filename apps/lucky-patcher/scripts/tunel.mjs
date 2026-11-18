// Sobe o Metro com tunel (ngrok do Expo) para abrir o app no Expo Go de qualquer rede, e ja deixa o
// servidor embutido (o login nao pergunta).
//   npm run tunel -w @medicalfield/lucky-patcher                 servidor = VM da Univates
//   MF_SERVIDOR=https://outro.exemplo npm run tunel -w ...       outro servidor (precisa ser alcancavel pelo celular)
// Porta 8090: a 8081 padrao do Metro e a do MikeBaguncinha no modo desenvolvimento.
import { spawn } from 'node:child_process';

const servidor = process.env.MF_SERVIDOR ?? 'https://177-44-248-60.sslip.io';
const filho = spawn('npx', ['expo', 'start', '--go', '--tunnel', '--port', '8090', '--clear'], {
  cwd: new URL('..', import.meta.url),
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXPO_PUBLIC_SERVIDOR: servidor },
});
filho.on('exit', (codigo) => process.exit(codigo ?? 0));
