# Android (Capacitor)

O app Android é o mesmo código web dentro de um WebView, com banco SQLite nativo cifrado.

## Estado em 17/11/2026

| Item | Situação |
| --- | --- |
| `capacitor.config.ts` (`appId` `br.medicalfield.cliente`, nome "MedicalField") | Feito |
| Build web para Android (`vite build --mode android` → `dist-android/`, base relativa, sem service worker) | Executado, sem erro |
| `npx cap add android` e `npx cap sync` | Executados: projeto em `android/`, plugins `@capacitor-community/sqlite` e `@capacitor/app` reconhecidos |
| `android:usesCleartextTraffic="true"` no manifesto (servidor de demonstração sem TLS) | Feito |
| **APK de depuração** | **NÃO gerado** (ver abaixo) |
| App rodando em aparelho ou emulador | **Não testado** |

### Por que o APK não foi gerado

A máquina tem o necessário (JDK 21 do Android Studio em `C:\Program Files\Android\Android Studio\jbr`; SDK em `%LOCALAPPDATA%\Android\Sdk` com `build-tools` 34/36/36.1 e plataformas `android-35` e `android-36.1`). O Gradle 8.14.3 foi baixado pelo *wrapper*, mas o *daemon* não sobe **dentro do ambiente isolado em que o agente executa comandos**:

```
java.io.IOException: Unable to establish loopback connection
Caused by: java.net.SocketException: Invalid argument: connect
```

É o Java sem conseguir abrir o soquete local que o Gradle usa para falar com o próprio *daemon* — uma restrição do ambiente de execução do agente, não do projeto. Foram três tentativas (pasta temporária padrão, pasta temporária curta, `jdk.net.unixdomain.tmpdir` explícito). Num terminal comum do Windows o passo deve funcionar; **isso não foi verificado**.

Possível segundo obstáculo, também não verificado: o projeto gerado pelo Capacitor 8 pede `compileSdkVersion = 36` e a máquina tem `android-35` e `android-36.1`. Se o Gradle reclamar da plataforma, instale "Android SDK Platform 36" pelo SDK Manager do Android Studio (o SDK não foi alterado por este trabalho).

## Gerar o APK de depuração

Num terminal PowerShell comum, na raiz do repositório:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"

npm install -w @medicalfield/lucky-patcher
npm run build:android -w @medicalfield/lucky-patcher      # vite build --mode android + cap sync android

cd apps\lucky-patcher\android
.\gradlew.bat assembleDebug
# APK: apps\lucky-patcher\android\app\build\outputs\apk\debug\app-debug.apk
```

Instalar num aparelho com depuração USB (ou emulador): `adb install -r app\build\outputs\apk\debug\app-debug.apk`.

`android/local.properties` (caminho do SDK) é local e fica fora do Git; se faltar, o Android Studio o recria, ou defina `ANDROID_HOME`.

## Usar

1. Abra o app. A tela de entrada pede o **endereço do servidor** (obrigatório no Android), por exemplo `http://192.168.0.10` — o endereço do gateway, sem `/api`. Ele pode ser trocado depois em Ajustes.
2. Entre com um profissional de demonstração. O primeiro acesso precisa de rede; depois o app abre e registra sem rede.

## O que é diferente do navegador

| | Navegador | Android |
| --- | --- | --- |
| Banco local | SQLite WASM + OPFS (`executorWeb.ts`) | `@capacitor-community/sqlite`, SQLCipher (`executorCapacitor.ts`) |
| Senha do banco | — | Gerada no primeiro uso e guardada pelo plugin no armazenamento seguro do sistema (`setEncryptionSecret`) |
| Sessão (refresh token) | No banco local (OPFS da origem) | No banco cifrado acima |
| HTTP | `fetch` do navegador, caminhos relativos | `CapacitorHttp` (substitui o `fetch` por HTTP nativo: sem CORS), endereço configurado |
| Casca offline | Service worker | Arquivos dentro do APK |
| Uma aba por vez | Web Lock | Não se aplica |

## Riscos em aberto (nada disto rodou num aparelho)

- **O adaptador nativo nunca foi executado.** `executorCapacitor.ts` foi escrito contra a API documentada do plugin (`createConnection`, `query`, `executeSet(..., true)`). Pontos a conferir no primeiro teste: `PRAGMA user_version = N` dentro de `executeSet` (usado pelas migrações) e o comportamento de *rollback* quando um comando do lote falha.
- `androidIsEncryption: true` exige que o plugin consiga criar o segredo; em aparelhos sem bloqueio de tela o armazenamento seguro pode se comportar de outro modo.
- O retorno ao primeiro plano usa `visibilitychange` do WebView; `@capacitor/app` está instalado mas não é usado (se o evento do WebView não disparar em algum aparelho, troque por `App.addListener('resume', …)`).
- Ícone e tela de abertura são os padrões do Capacitor.
- iOS não é entregue (o build exige macOS).
