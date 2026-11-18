# App instalado (Android e iOS, Expo)

O app instalado usa o mesmo código React Native do PWA, empacotado pelo Expo para **Android e iOS**. As pastas `android/` e `ios/` **não são versionadas**: `expo prebuild` as gera a partir de `app.config.ts` e de `plugins/seguranca.js` (Continuous Native Generation).

## Gerar e instalar

```bash
npm run android -w @medicalfield/lucky-patcher   # Android: emulador ou aparelho (JDK 17 + Android SDK)
npm run ios -w @medicalfield/lucky-patcher       # iOS: simulador ou aparelho (macOS + Xcode)
```

Sem Mac, o build iOS sai pelo EAS Build (`npx eas build -p ios`). O Expo Go não serve, porque o SQLCipher exige um *development build*.

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
