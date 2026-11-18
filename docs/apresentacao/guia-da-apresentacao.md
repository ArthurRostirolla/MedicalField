# Guia da apresentação

Roteiro de fala para cerca de **15 minutos**, com o que mostrar, o que dizer sobre cada requisito do enunciado, o plano B e as perguntas prováveis.

Regra de ouro: **só afirmar o que foi feito.** O sistema está validado num cluster Kubernetes local e o app Android, num **emulador**. A VM da Univates, o e-mail em caixa externa e um aparelho Android físico **não** foram executados — diga isso antes que perguntem (seção 5).

Passo a passo detalhado de cada clique: [`../testes/roteiro-de-testes.md`](../testes/roteiro-de-testes.md).

## 1. Antes de entrar na sala

Faça com 30 minutos de antecedência. Os comandos estão no roteiro de testes, seção 2.

- [ ] Docker em execução; `bash deploy/scripts/cluster-local.sh subir` e `status` — seis pods em `1/1 Running`.
- [ ] Encaminhamento do Mailpit rodando num terminal; <http://localhost:18025> aberto.
- [ ] Função `mfsql` colada num terminal, com o comando do passo 9 já digitado (sem dar Enter).
- [ ] **Janela A:** portal em <http://localhost:8088/portal/>, na tela de entrada.
- [ ] **Janela B:** app em <http://localhost:8088/app/>, estreita, com o DevTools na aba **Network** (filtro `api`).
- [ ] Senha de demonstração à mão (`services/mike-baguncinha/README.md`) — **não** a projete.
- [ ] Escolha o sufixo da rodada (`AULA1`) e, se já apresentou antes nesta máquina, use outro.
- [ ] Abas prontas no editor ou navegador: `docs/arquitetura/arquitetura.md` (diagramas), `docs/dados/modelagem.md`, `docs/api/README.md`.
- [ ] **Rode o roteiro automatizado uma vez** (`npm run roteiro -w @medicalfield/e2e`) para ter certeza de que está tudo no ar — e para ter evidência fresca caso a demonstração ao vivo falhe.
- [ ] **Android (opcional):** emulador Pixel 6 aberto, APK instalado (`apps/lucky-patcher/docs/android.md`) e `adb devices` mostrando o emulador. Rode `node e2e/android/android.mjs` uma vez antes, para ter as capturas frescas.
- [ ] Zoom do navegador e do terminal legíveis no projetor.

## 2. Roteiro de fala (15 minutos)

| Tempo | Bloco | O que mostrar |
| --- | --- | --- |
| 0:00 – 1:30 | Problema e proposta | Slide ou README |
| 1:30 – 4:00 | Arquitetura | Diagrama geral e de implantação |
| 4:00 – 11:30 | Demonstração: os 17 passos | Portal, app, terminal |
| 11:30 – 13:30 | Requisitos que não aparecem na tela | Log de acesso, banco, Postman, app Android no emulador |
| 13:30 – 15:00 | Limites e encerramento | Tabela "estado atual" |

### Bloco 1 — Problema e proposta (1:30)

> "Uma equipe de resgate atende onde não há sinal. Se o sistema depende da nuvem, o socorrista fica sem registrar. O MedicalField é Offline-First: o app grava num banco local, sempre, e sincroniza quando a rede volta — sem duplicar, com trilha de auditoria e com regra para conflito."

- Três serviços em três linguagens, um portal administrativo e um app com simulador de rede.
- Diga já: "todos os dados são fictícios e o sistema não interpreta nada clínico — ele registra".

### Bloco 2 — Arquitetura (2:30)

Abra o **diagrama geral** de [`../arquitetura/arquitetura.md`](../arquitetura/arquitetura.md).

> "São três serviços, cada um dono de um pedaço do banco. O **MikeBaguncinha**, em Go, cuida de identidade e auditoria. A **DonaCida**, em NestJS, é o núcleo clínico e a sincronização. O **Jaiminho**, em Python, gera o PDF e envia o e-mail. Na frente, um gateway Traefik que só roteia: quem valida o token é cada serviço."

Pontos para tocar, um por frase:

- **Banco central:** um PostgreSQL, quatro schemas, um papel de banco por serviço. A linha do tempo clínica e as auditorias são somente-inserção **no banco**, não só no código.
- **Banco local:** SQLite de verdade dentro do navegador (WebAssembly, gravando em arquivo).
- **Comunicação:** HTTP síncrono; o único fluxo assíncrono, o e-mail, usa uma fila em tabela.
- **Implantação:** Kubernetes (k3s), mostrado no segundo diagrama.

Não se alongue nos padrões aqui — eles aparecem na demonstração.

### Bloco 3 — Demonstração: os 17 passos (7:30)

Agrupe os passos em cinco cenas. Diga o número do passo em voz alta para o professor acompanhar no enunciado.

**Cena 1 — O portal (passos 1 a 4) · 1 min**

- Entre como a Dra. Helena (CRM). "Login por registro profissional — CRM, COREN ou ID de socorrista."
- Medicamentos → Prontuários → Atendimentos, clicando em **Atualizar**.
- "O portal é somente leitura para dado clínico. Cadastro de apoio entra pelo banco, como o enunciado permite."

**Cena 2 — O app online (passos 5 a 8) · 2 min**

- Entre como o Enf. Caio (COREN). Aponte a tira no alto: **Online**.
- **Sincronizar agora**: "os cadastros do portal desceram para o banco local".
- Pacientes → Clara → queixa → **Iniciar atendimento** → sinais, Glasgow, triagem.
- Aponte a aba Network: "cada registro é um `POST` com uma `Idempotency-Key`".
- Volte ao portal → Atendimentos → **Atualizar**: o atendimento está lá.

> "Repare que, mesmo online, o app gravou primeiro no banco local e depois enviou. É o mesmo caminho com ou sem rede."

**Cena 3 — Inserção pelo banco (passos 9 a 11) · 1:30**

- Terminal: dê Enter no `INSERT`. Mostre o `seq` na resposta.

> "Eu não informei esse `seq`. Um gatilho numera toda inserção e alteração. O app guarda o último número que viu e pede só o que veio depois — é o cursor de sincronização."

- Portal → Medicamentos → **Atualizar**: apareceu. Atendimentos: nada mudou (passo 10).
- App → **Sincronizar agora**: "1 recebido".

**Cena 4 — Offline (passos 12 a 15) · 2:30 — o centro da apresentação**

- Ligue a chave **Simular offline**. A tira vira **Offline**. Limpe a aba Network.
- Pacientes → **Novo paciente** → nome e alergia → **Salvar e iniciar atendimento** → sinais, triagem, a medicação **que acabou de descer**, observação.
- Aponte: tira com **7 pendentes**; aba Network **vazia**.
- **`F5`.** "Fechei e abri o app. Está tudo aqui, e a fila também."
- Portal → Prontuários e Atendimentos → **Atualizar**: **não aparece** (passo 13).
- Desligue a chave. **Não clique em mais nada.** A tira volta a Online e a fila esvazia sozinha.

> "Ninguém mandou sincronizar. O monitor de conectividade avisou o motor de sincronização — é o padrão Observer que o enunciado pede."

- Portal → **Atualizar**: apareceu (passo 15).
- Se houver tempo: **Sincronizar agora** de novo → "0 enviados". "Reenviar não duplica: o servidor reconhece a chave e devolve a mesma resposta."

**Cena 5 — Ficha e e-mail (passos 16 e 17) · 30 s**

- Clique no atendimento offline → **Gerar PDF** → **Baixar PDF** → abra: passagem de caso, linha do tempo, QR.
- **Enviar por e-mail** → preencha → **Enviar ficha** → "Na fila" vira "Enviado".
- Mailpit: a mensagem com o PDF anexado.

### Bloco 4 — O que não aparece na tela (2:00)

Escolha dois ou três, conforme o tempo.

**Log de acesso** (requisito do enunciado):

```bash
mfsql "SELECT data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms FROM auditoria.log_acesso ORDER BY data_hora DESC LIMIT 8;"
```

> "Os sete campos pedidos — data e hora, IP, profissional, método, rota, status e tempo — de cada requisição, dos três serviços, numa tabela só. Também saem no log de cada contêiner."

Ou, no portal: **Logs de acesso**.

**Padrões de projeto** — abra a tabela da seção 7 de `arquitetura.md` e aponte o arquivo de cada um:

- *Repository:* as telas só falam com repositórios; nenhuma chama a API.
- *Strategy:* quatro estratégias de conflito na DonaCida.
- *Observer:* o monitor de conectividade.
- *Command*, *Adapter*, *Chain of Responsibility:* o outbox, o banco local trocável, a cadeia de middleware.

**Validação por Postman** — mostre a coleção ou rode:

```bash
npx newman run docs/api/medicalfield.postman_collection.json --env-var senha=$MF_SENHA_DEMO
```

"31 requisições, 57 verificações, cobrindo as 30 rotas."

**Modelagem** — o diagrama ER de `docs/dados/modelagem.md` e a tabela de privilégios.

**App Android** — se o emulador estiver aberto (cerca de 1 minuto; senão, mostre as capturas de `docs/testes/evidencias/android/`):

```bash
node e2e/android/android.mjs
```

> "É o mesmo código do navegador dentro de um APK, com o banco SQLite nativo e cifrado. O teste entra informando o endereço do servidor, registra offline, **mata o processo do app**, reabre — a fila continua lá — e sincroniza sem duplicar."

O script dirige o WebView por depuração remota e confere o banco central. No emulador, o app alcança o gateway em `http://10.0.2.2:8088`. Para mostrar à mão: abra o app no emulador, informe esse endereço na tela de entrada e repita a cena 4.

### Bloco 5 — Limites e encerramento (1:30)

Diga, sem rodeio:

> "Três coisas que **não** fiz. Primeiro, isto está rodando num Kubernetes local, não na VM da Univates: não tive acesso à VM; o procedimento e os manifestos estão prontos, mas não foram executados lá. Segundo, o e-mail vai para um servidor SMTP de captura; não testei numa caixa externa. Terceiro, o app Android: o APK foi construído e validado num emulador — login, registro offline, processo morto e reaberto, sincronização sem duplicar, banco cifrado —, mas não num aparelho físico, e é um APK de depuração, não assinado."

Feche com o que **está** provado: 17 passos automatizados, offline com queda e reabertura no navegador e no emulador Android, idempotência conferida no banco.

## 3. O que dizer sobre cada requisito do enunciado

| Requisito | Onde mostrar | Frase |
| --- | --- | --- |
| Três serviços em linguagens diferentes | Diagrama geral | "Go, TypeScript e Python — três processos, três imagens, três schemas." |
| Persistência dual | `modelagem.md` | "PostgreSQL na central; SQLite embarcado no app." |
| Aplicação cliente com interface gráfica | App no navegador e no emulador Android | "O mesmo código: PWA no navegador e APK no Android, validado em emulador." |
| Execução na VM da Univates | Bloco 5 | "**Não executado na VM.** Validado em k3s local; o caminho para a VM está documentado." |
| Todas as rotas autenticadas, menos o login | Postman, requisição "Sem token: 401" | "Cada serviço valida o JWT sozinho, com a chave pública do serviço de identidade." |
| Credenciais do profissional | Telas de login | "CRM, COREN ou ID de socorrista, mais a UF." |
| Middleware de log de acesso com os 7 campos | `mfsql` no log de acesso | "Mesma cadeia nos três: request-id, log de acesso, autenticação, handler." |
| Simulador de conectividade | Chave "Simular offline" | "Com a chave ligada, nenhuma requisição sai — veja a aba de rede." |
| Interface administrativa | Portal | "Autentica, lista atendimentos, prontuários e cadastros de apoio." |
| Inserção manual pelo banco | Passo 9 | "`INSERT` pelo `psql`; o gatilho faz o dado descer ao app." |
| Repository, Strategy, Observer + 3 | Tabela de padrões | Bloco 4 |
| Os 9 endpoints sugeridos | `docs/api/README.md` | "Os nove existem, com o prefixo `/api/v1`, mais as rotas de PDF e e-mail." |
| PDF e e-mail | Passos 16 e 17 | "O PDF fica guardado com *hash*; o e-mail sai por uma fila com retentativa." |
| Idempotência | Passo 14, sincronizar de novo | "A chave de idempotência é gravada na mesma transação do dado." |
| Rastreabilidade auditável | `auditoria_clinica`, `operacao_sync` | "Quem, de qual aparelho, quando, e o que havia antes." |
| Tratamento de conflitos | Seção 8 de `sincronizacao.md` | "Quatro estratégias, uma por tipo de dado." |
| Validar as rotas por Postman | Coleção + Newman | "Coleção versionada no repositório, rodada com Newman." |

## 4. Plano B

| Se… | Faça |
| --- | --- |
| **O cluster não sobe** ou um pod não fica pronto | `bash deploy/scripts/cluster-local.sh status`. Se não resolver em um minuto, passe ao **modo desenvolvimento**: `bash scripts/dev-db.sh subir && bash scripts/dev-db.sh migrar`, `bash scripts/dev-servicos.sh subir`, e os dois `npm run dev` — portal em `localhost:5181/portal/`, app em `localhost:5182/app/`, Mailpit em `localhost:8025`. Nesse modo o SQL do passo 9 é `docker exec medicalfield-dev-pg psql -U postgres -d medicalfield -c "..."`. Diga que mudou para o modo de desenvolvimento. |
| **A demonstração ao vivo trava no meio** | Abra [`../testes/evidencias/roteiro/resultado.md`](../testes/evidencias/roteiro/resultado.md) e as capturas `passo-NN.png`: a execução automatizada dos mesmos 17 passos, com data. Continue a partir da captura do passo em que parou. |
| **O e-mail não chega** | Mostre a linha na tabela de envios do portal ("Na fila") e explique a retentativa: 1, 5, 15 e 60 minutos, depois falha definitiva com botão de reenvio. Confira o encaminhamento de porta do Mailpit (seção 2.2 do roteiro). Mostre `ficha-do-roteiro.pdf` e `passo-17.png` nas evidências. |
| **O Mailpit não abre** (`localhost:18025`) | O envio pode ter saído mesmo assim: confira pelo status "Enviado" no portal e por `mfsql "SELECT status, tentativas, enviado_em FROM documentos.envio_email ORDER BY criado_em DESC LIMIT 1;"`. Rode de novo o `port-forward`. |
| **Login bloqueado** ("Muitas tentativas") | Entre com outro profissional de demonstração: a Soc. Lia Moura (Socorrista `300003`) no app. O bloqueio é por registro e por IP, e some em 15 minutos. |
| **O app diz "já está aberto em outra aba"** | Feche a aba duplicada e recarregue. |
| **O app não abre o banco local** | Use o Chrome (não uma janela anônima antiga nem outro navegador). Em último caso: DevTools → Application → Clear site data, e entre de novo — o que já subiu não se perde. |
| **Sem projetor para o terminal** | O passo 9 pode ser mostrado pela consequência: Medicamentos → Atualizar no portal. |
| **Perguntam pela VM** | Abra [`../operacao/instalacao-vm.md`](../operacao/instalacao-vm.md) e `deploy/overlays/univates/kustomization.yaml`. É o mesmo conjunto de manifestos do cluster local, com imagens do registro e o nome público. Não foi executado. |
| **Perguntam pelo Android**, ou o emulador não sobe | Mostre as capturas em [`../testes/evidencias/android/`](../testes/evidencias/android/resultado.md) (início sincronizado, atendimento offline, reaberto com pendências, sincronizado) e o `resultado.md`. Detalhes: [`../../apps/lucky-patcher/docs/android.md`](../../apps/lucky-patcher/docs/android.md) e a evidência E-008. Diga o limite: emulador, APK de depuração, sem TLS. |

## 5. Perguntas prováveis e respostas curtas

**Por que não está na VM da Univates?**
Não tive acesso à VM durante o desenvolvimento. Validei num k3s de nó único em Docker, com os mesmos manifestos. O overlay da VM e o passo a passo estão escritos, mas eu não os executei, então não afirmo que funcionam lá.

**O enunciado diz que não precisa de contêiner. Por que Kubernetes?**
Foi uma escolha, não uma exigência. Três linguagens significam três ambientes de execução; o contêiner dá a mesma forma de empacotar, subir e reiniciar para os três. Usei k3s, que é um binário só e cabe numa VM pequena — cerca de 263 MB de aplicação medidos.

**Por que não RabbitMQ ou Kafka?**
Só existe um fluxo assíncrono, o e-mail, com um produtor e um consumidor no mesmo serviço. Uma tabela com `FOR UPDATE SKIP LOCKED` já é durável, transacional com o pedido e visível por SQL. Um broker seria mais um componente para operar sem entregar nada a mais. Eu reconsideraria se um mesmo evento precisasse de vários consumidores.

**Como garante que não duplica ao sincronizar?**
Cada operação tem um UUID gerado no aparelho, enviado como `Idempotency-Key`. O servidor grava essa chave na mesma transação do dado. Se a mesma chave chega de novo, ele devolve a resposta original sem gravar. Além disso, o id de cada entidade também vem do cliente. No passo 14 eu sincronizo de novo e confiro a contagem no banco.

**E se a rede cair no meio do envio?**
O que já foi confirmado fica confirmado. O comando que estava em trânsito volta para a fila; se o servidor chegou a gravá-lo, o reenvio recebe a resposta original. Isso está testado: resposta perdida e subida interrompida.

**Como resolve conflito se dois profissionais editam o mesmo paciente offline?**
Depende do dado. Eventos clínicos e alergias nunca conflitam: cada um tem id próprio e o resultado é a união. Dados cadastrais: vence, campo a campo, a edição mais recente, e o valor anterior vai para a auditoria. Medicamento: o servidor vence. Pessoa provavelmente duplicada: é aceita e sinalizada para revisão humana. Honestamente: isso está coberto por testes de integração do servidor, não por dois aparelhos reais ao mesmo tempo.

**Por que "campo mais recente" não se aplica aos dados clínicos?**
Porque seria perigoso. Se uma cópia antiga pudesse sobrescrever, uma alergia poderia sumir. Dado clínico só se acrescenta; corrigir é criar um evento de retificação que aponta para o original. Se a retificação traz os dados corrigidos, a passagem de caso mostra o valor corrigido; sem eles, o evento sai do resumo. O original continua na linha do tempo.

**E se o relógio do aparelho estiver errado?**
Horário mais de cinco minutos à frente do servidor é limitado ao horário do servidor, e isso fica anotado na auditoria. Horário no passado é mantido — um atendimento offline pode subir horas depois. É um limite conhecido de qualquer estratégia baseada em relógio do cliente.

**Onde está o Strategy? E o Observer?**
Strategy: `services/dona-cida/src/dominio/conflito/` — uma interface, quatro classes e um registro que escolhe pelo tipo de dado. Observer: `apps/lucky-patcher/src/sync/conectividade.ts` — o monitor publica o estado, e o motor de sincronização e a tela assinam.

**O banco local é mesmo um banco, ou é `localStorage`?**
É SQLite, compilado para WebAssembly, gravando em arquivo no OPFS do navegador. O plano original usava outra biblioteca; num teste em que eu gravava e matava o processo do navegador, ela perdeu os dados em cinco de cinco vezes. Troquei pelo SQLite oficial, que manteve em cinco de cinco. Só o adaptador mudou — é o padrão Adapter. No Android o adaptador é outro, nativo e cifrado, e passou pelo mesmo ciclo num emulador.

**O app Android funciona?**
O APK de depuração foi construído e validado num emulador Pixel 6 com Android 17: login, registro offline, processo morto e reaberto com a fila intacta, sincronização sem duplicar, banco cifrado. Não testei em aparelho físico, o APK não é assinado para publicação e o tráfego até o servidor local é HTTP.

**O simulador desliga a rede de verdade?**
Não: ele faz o cliente HTTP do app recusar a chamada antes de ela sair, e o estado é persistido. Há também um teste com a rede realmente cortada no navegador, que passa. Na apresentação uso a chave porque é o que o enunciado pede.

**Como os serviços se autenticam entre si?**
Não há credencial de serviço. A única chamada entre serviços — o Jaiminho buscando a ficha na DonaCida — repassa o token do próprio usuário. Assim o log de acesso mostra o profissional real.

**Por que JWT com EdDSA e não um segredo compartilhado?**
Com segredo compartilhado, qualquer serviço que valida também conseguiria emitir token. Com par de chaves, só o serviço de identidade emite; os outros validam com a chave pública.

**O log de acesso pode ser apagado?**
Não pelos serviços. Os papéis de banco têm só `INSERT` (e `SELECT`, no serviço de auditoria) nessas tabelas, e as migrações rodam com outro papel. Um administrador do banco conseguiria — proteger contra ele exigiria um armazenamento externo, que não implementei.

**O que foi feito para a LGPD?**
Autenticação em tudo, log de quem acessou o quê, trilha do que foi alterado, logs sem dado de paciente, um papel de banco por serviço, e o app não baixa atendimentos de outros aparelhos. Limites: o banco local no navegador não é cifrado, todas as pessoas descem para o aparelho e não há exclusão de titular. A base legal não é decisão do software.

**Isso serve para uso clínico real?**
Não. Os dados são fictícios e o sistema não interpreta nada: não alerta alergia, não confere dose. As faixas de sinais vitais são limites de digitação, não de normalidade. Qualquer regra clínica exigiria validação por profissionais de saúde.

**Qual o papel do gateway, se ele não autentica?**
Entrada única, roteamento por prefixo, limite de taxa no login, cabeçalhos de segurança e preservação do IP de origem. A autenticação fica em cada serviço de propósito: é defesa em profundidade e é o que o enunciado pede — "todos os serviços".

**Por que um banco só, e não um por serviço?**
Uma instância, mas um schema e um papel por serviço: um serviço não consegue ler o schema do outro. Tem o isolamento de dados sem triplicar memória, backup e operação numa VM pequena.

**Quanto disso foi testado?**
Testes automatizados nos três serviços e nos pacotes, testes de ponta a ponta do portal e do app contra o backend real, e o roteiro de 17 passos contra o cluster. A matriz em `docs/VALIDATION_MATRIX.md` diz, item por item, o que foi validado no sistema rodando e o que só tem teste de módulo.
