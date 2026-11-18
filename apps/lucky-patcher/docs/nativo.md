# App instalado (Android e iOS, Expo)

O app instalado usa o mesmo código React Native do PWA, empacotado pelo Expo para **Android e iOS**. As pastas `android/` e `ios/` **não são versionadas**: `expo prebuild` as gera a partir de `app.config.ts` e de `plugins/seguranca.js` (Continuous Native Generation).

## Gerar e instalar

```bash
npm run android -w @medicalfield/lucky-patcher   # Android: emulador ou aparelho (JDK 17 + Android SDK)
npm run ios -w @medicalfield/lucky-patcher       # iOS: simulador ou aparelho (macOS + Xcode)
```

Sem Mac, o build iOS sai pelo EAS Build (`npx eas build -p ios`).

## Expo Go com túnel (demonstração, sem build)

```bash
npm run tunel -w @medicalfield/lucky-patcher     # Metro na porta 8090 + túnel do Expo
```

Escaneie o QR (ou digite a URL `exp://…` que aparece em "Waiting on https://…") no Expo Go do iPhone ou Android, em qualquer rede. O app já vem apontado para a VM, `https://177-44-248-60.sslip.io` (troque com `MF_SERVIDOR=https://…`, ou depois em Ajustes); o login não pergunta o servidor.

- **No Expo Go o banco local fica SEM cifra**: o Expo Go traz o SQLite comum, sem SQLCipher. O app detecta isso (`noExpoGo` em `src/banco/executorExpo.ts`), abre o banco sem `PRAGMA key` e avisa no log. Use só com dados fictícios; o development build e o release continuam cifrados.
- O Expo Go da loja só roda a versão atual do SDK (58). O React está fixado em `19.3.0` em todo o monorepo (`overrides` no `package.json` da raiz), a versão que o React Native do Expo Go espera; duas cópias do React quebrariam o app.
- O servidor precisa ser alcançável pelo celular e em HTTPS: a VM serve. O backend local (`localhost:8088`) não é visto pelo celular.

No primeiro acesso o app pede o **endereço do servidor**:

| Onde | Endereço do gateway local | Observação |
| --- | --- | --- |
| Emulador Android | `http://10.0.2.2:8088` | Só na variante debug; o release exige HTTPS |
| Simulador iOS | `http://localhost:8088` | O ATS só libera HTTP para `localhost` |
| Aparelho físico | `https://…` | Os dois sistemas exigem HTTPS fora do localhost |

## Banco local (igual nos dois)

- `expo-sqlite` com **SQLCipher**, ligado pelo plugin `['expo-sqlite', { useSQLCipher: true }]`.
- A chave é aleatória, gerada no primeiro uso e guardada pelo `expo-secure-store` (Android Keystore / iOS Keychain) com `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Ela nunca sai do aparelho.
- A chave é aplicada com `PRAGMA key` ao abrir (`src/banco/executorExpo.ts`).
- A sessão (access e refresh token) fica dentro desse banco cifrado.
- Uma segunda conexão, com `PRAGMA query_only`, atende as leituras somente leitura.
- As transações passam por uma fila: uma por vez.

## Endurecimento por plataforma

| O quê | Android | iOS |
| --- | --- | --- |
| Backup / troca de aparelho | `allowBackup="false"`, `fullBackupContent="false"`, `data_extraction_rules.xml` | O backup do iCloud leva o arquivo do banco, **cifrado e sem a chave** (Keychain só deste aparelho) |
| Tráfego em claro | Release: `network_security_config` sem HTTP. Debug: HTTP liberado (`src/debug/`) | ATS explícito: `NSAllowsArbitraryLoads=false`; exceção só para rede local (`NSAllowsLocalNetworking`) |
| Permissões | Só `INTERNET` (`blockedPermissions` remove as padrão do Expo) | Nenhuma pedida |

## Limites conhecidos

- **Assinatura:** nenhum build está assinado. Configure EAS (ou keystore/certificados) antes de distribuir.
- **Conformidade de exportação:** o SQLCipher usa criptografia. Antes de publicar na App Store, responda a pergunta de *export compliance* (`ios.config.usesNonExemptEncryption` no `app.config.ts`).
- **iOS não validado:** o app ainda não foi exercitado em simulador ou aparelho iOS.
- **Roteiro manual:** a porta de diagnóstico (`window.__mf`) só existe na web, então o roteiro no aparelho é manual.
- **Sem migração de dados:** os dados do APK antigo (Capacitor) não são migrados; ele só tinha sido usado em emulador.
