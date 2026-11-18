# Roteiro de testes

**Entregável 3 do enunciado.** Os 17 passos do roteiro, na ordem original, escritos para serem executados **à mão** numa apresentação: onde clicar ou que comando rodar, o que deve acontecer e como comprovar.

A mesma sequência existe automatizada (`e2e/roteiro.spec.ts`), com o resultado em [`evidencias/roteiro/resultado.md`](evidencias/roteiro/resultado.md) — ver a [seção 5](#5-execução-automatizada).

Todos os dados são **fictícios e sem validade clínica**.

## 1. O que você vai usar

| Peça | Endereço | Quem entra |
| --- | --- | --- |
| **Portal** (BradPitt) | <http://localhost:8088/portal/> | Dra. Helena Prado — CRM `100001`, UF `RS` (ADMIN) |
| **Cliente** (LuckyPatcher) | <http://localhost:8088/app/> | Enf. Caio Brandão — COREN `200002`, UF `RS` |
| **Banco central** | `kubectl exec` no pod `postgres-0` | administrador `postgres` |
| **Caixa de e-mail** (Mailpit) | <http://localhost:18025> (depois do encaminhamento de porta) | — |

A **senha de demonstração** é a mesma para todos e está em [`apps/mike-baguncinha/README.md`](../../apps/mike-baguncinha/README.md). Ela não é repetida aqui.

Os endereços acima são os do **cluster local**. Na VM da Univates troque `http://localhost:8088` pelo endereço público — a implantação na VM **não foi executada** (ver [`../operacao/instalacao-vm.md`](../operacao/instalacao-vm.md)).

## 2. Preparar o ambiente

Tudo no **Git Bash**, a partir da raiz do repositório. Requer Docker em execução, `kubectl` e Google Chrome.

### 2.1 Subir o cluster

```bash
bash deploy/scripts/cluster-local.sh subir       # cria ou retoma o k3s local
bash deploy/scripts/cluster-local.sh status      # confere
```

Esperado no `status`: os seis pods em `1/1 Running` — `postgres-0`, `mike-baguncinha`, `dona-cida`, `jaiminho`, `web`, `mailpit`.

Só na **primeira vez** (ou depois de `derrubar`), antes do `status`:

```bash
bash deploy/scripts/cluster-local.sh construir-imagens    # as 5 imagens; alguns minutos
bash deploy/scripts/cluster-local.sh implantar            # importa, cria os Secrets e aplica os manifestos
```

### 2.2 Abrir a caixa de e-mail

O Mailpit não é exposto pelo gateway. Deixe este comando rodando num terminal à parte:

```bash
bash deploy/scripts/cluster-local.sh kubectl -n medicalfield port-forward svc/mailpit 18025:8025
```

Abra <http://localhost:18025>.

### 2.3 Deixar um atalho para o SQL

Os comandos de banco deste roteiro usam esta função (cole no terminal):

```bash
mfsql() { bash deploy/scripts/cluster-local.sh kubectl -n medicalfield exec postgres-0 -- psql -U postgres -d medicalfield -c "$1"; }
mfsql "SELECT count(*) FROM clinico.medicamento;"      # teste: deve responder um número
```

### 2.4 Arrumar as janelas

- **Janela A — Portal:** Chrome em <http://localhost:8088/portal/>.
- **Janela B — Cliente:** outra janela do Chrome em <http://localhost:8088/app/>, estreita (o app é desenhado para celular). Opcional: `F12` → ícone de dispositivo, para simular um telefone.
- Na janela B, deixe o DevTools aberto na aba **Network**, com o filtro `api` — é a prova do passo 12.
- Abra o cliente em **uma aba só**: o banco local aceita uma aba por vez.

### 2.5 Escolher os nomes desta rodada

Para reconhecer os registros na tela, combine quatro textos antes de começar. Sugestão (troque o sufixo a cada rodada):

| Uso | Texto |
| --- | --- |
| Queixa do atendimento online (passo 7) | `Roteiro online AULA1` |
| Medicamento inserido pelo banco (passo 9) | `Medicamento Roteiro AULA1` |
| Pessoa criada offline (passo 12) | `Pessoa Offline AULA1` |
| Alergia da pessoa offline (passo 12) | `Alergia Roteiro AULA1` |

## 3. Os 17 passos

### Passo 1 — Portal: Autenticar

1. Janela A: <http://localhost:8088/portal/>.
2. Em **Tipo de registro**, escolha **CRM**.
3. **Número do CRM:** `100001` · **UF:** `RS` · **Senha:** a de demonstração.
4. Clique em **Entrar**.

**Esperado:** o portal abre no livro de atendimentos, com o índice lateral (Atendimentos, Prontuários, Medicamentos e, por ser ADMIN, Logs de acesso e Possíveis duplicatas) e o nome "Dra. Helena Prado".

**Comprovar:** recarregue a página (`F5`) — a sessão continua. Opcional, no banco: `mfsql "SELECT data_hora, metodo, rota, status_code FROM auditoria.log_acesso WHERE rota = '/api/v1/auth/login' AND status_code = 200 ORDER BY data_hora DESC LIMIT 1;"` mostra o login que acabou de acontecer.

### Passo 2 — Portal: Listar cadastros

1. No índice lateral, clique em **Medicamentos**.
2. Clique em **Atualizar**.

**Esperado:** a tabela "Medicamentos" com o catálogo de apoio (a carga de demonstração traz 12, entre eles a Dipirona). O medicamento do passo 9 **ainda não** aparece.

**Comprovar:** `mfsql "SELECT count(*) FROM clinico.medicamento WHERE ativo;"` — o mesmo total da tela.

### Passo 3 — Portal: Listar prontuários

1. Índice lateral → **Prontuários** → **Atualizar**.

**Esperado:** a tabela "Prontuários", uma linha por pessoa (a carga de demonstração traz 3, entre elas "Clara Fictícia Souza"). Clicar numa linha abre os dados da pessoa, os itens do prontuário e os atendimentos dela.

**Comprovar:** `mfsql "SELECT count(*) FROM clinico.prontuario;"`.

### Passo 4 — Portal: Listar atendimentos

1. Índice lateral → **Atendimentos** → **Atualizar**.

**Esperado:** o "Livro de atendimentos", mais recentes primeiro (pode estar vazio num banco recém-criado). **Anote quantos há** — o passo 10 compara.

**Comprovar:** `mfsql "SELECT count(*) FROM clinico.atendimento;"`.

### Passo 5 — Cliente: Autenticar

1. Janela B: <http://localhost:8088/app/>.
2. Em **Registro profissional**, deixe **COREN**.
3. **Número do COREN:** `200002` · **UF:** `RS` · **Senha:** a de demonstração.
4. Clique em **Entrar**.

**Esperado:** a tela **Início**, com "Enf. Caio Brandão · COREN 200002" e, no alto, a tira permanente mostrando **Online**.

**Comprovar:** recarregue (`F5`) — o app abre direto no Início, sem pedir login: a sessão está no banco local. (O primeiro acesso num aparelho precisa de rede; depois, não.)

### Passo 6 — Cliente: Sincronizar dados a partir do Portal (receber dados)

O app já sincroniza sozinho ao entrar; este passo repete pelo botão, para ficar visível.

1. No Início, clique em **Sincronizar agora**.

**Esperado:** a mensagem "Sincronizado. 0 enviados, N recebidos." (N pode ser 0 se a sincronização de abertura já baixou tudo). Em **Situação → Neste aparelho**: a contagem de medicamentos e pacientes, e a tira mostra a hora da sincronização.

**Comprovar:**
- **Neste aparelho** deve mostrar o mesmo número de medicamentos do passo 2.
- Aba **Pacientes** (rodapé): aparecem as pessoas do portal, por exemplo "Clara Fictícia Souza".
- Na aba Network: uma chamada `GET /api/v1/sync/alteracoes?desde=...`.

### Passo 7 — Cliente: Online — Registrar um atendimento

1. Confira que a chave **Simular offline** (canto da tira) está **desligada** e a tira diz **Online**.
2. Aba **Pacientes** → em **Buscar por nome ou CPF**, digite `Clara Fictícia` → toque em **Clara Fictícia Souza**.
3. Em **Novo atendimento**, preencha **Queixa principal** com `Roteiro online AULA1` → **Iniciar atendimento**.
4. Na tela do atendimento, em **Registrar agora**:
   - **Sinais** → PA sistólica `128`, PA diastólica `84`, Freq. cardíaca `92` → **Registrar sinais vitais**.
   - **Glasgow** → marque ocular 4, verbal 5, motora 6 → **Registrar Glasgow 15** (o total é calculado).
   - **Triagem** → escolha a classificação (por exemplo, amarelo) → **Registrar triagem**. Nenhuma cor vem marcada: o profissional escolhe.

**Esperado:** cada registro aparece na hora na **Linha do tempo**, numerado. Em segundos a tira mostra **Tudo enviado**.

**Comprovar:**
- Aba Network: um `POST /api/v1/atendimento` e três `POST /api/v1/atendimento-evento`, todos **201**, cada um com o cabeçalho `Idempotency-Key`.
- `mfsql "SELECT id, queixa_principal, recebido_em FROM clinico.atendimento WHERE queixa_principal = 'Roteiro online AULA1';"` — **1 linha**.

### Passo 8 — Portal: Listar atendimentos — visualizar atendimento registrado

1. Janela A → **Atendimentos** → **Atualizar**.

**Esperado:** o atendimento "Roteiro online AULA1", de Clara Fictícia Souza, no topo do livro.

**Comprovar:** clique na linha — abre a **Passagem de caso** (últimos sinais vitais, Glasgow 15, triagem) e a linha do tempo com os três eventos, assinados por "Enf. Caio Brandão".

### Passo 9 — Portal: Inserir novos medicamentos via Banco de Dados

O catálogo não tem tela de cadastro: o enunciado pede a inserção pelo banco. O comando roda o `psql` dentro do pod do Postgres:

```bash
bash deploy/scripts/cluster-local.sh kubectl -n medicalfield exec postgres-0 -- psql -U postgres -d medicalfield -c \
  "INSERT INTO clinico.medicamento (nome, principio_ativo, apresentacao) VALUES ('Medicamento Roteiro AULA1', 'principio demonstrativo', 'ampola 1 mL') RETURNING id, nome, seq;"
```

Fora do script do cluster local (na VM, por exemplo), é o mesmo comando sem o prefixo: `kubectl -n medicalfield exec postgres-0 -- psql -U postgres -d medicalfield -c "..."`. Para uma sessão interativa, veja [`../operacao/banco-manual.md`](../operacao/banco-manual.md).

**Esperado:** a saída mostra a linha criada com `id` e **`seq` preenchidos pelo banco** — ninguém informou esses valores. Termina com `INSERT 0 1`.

**Comprovar:**
- Janela A → **Medicamentos** → **Atualizar**: "Medicamento Roteiro AULA1" aparece.
- O `seq` é o que fará o medicamento descer ao cliente no passo 11: um gatilho o atribui em todo `INSERT` e `UPDATE` ([`../dados/modelagem.md`](../dados/modelagem.md), seção 1.6).

### Passo 10 — Portal: Listar atendimentos

1. Janela A → **Atendimentos** → **Atualizar**.

**Esperado:** a lista **não mudou**: os atendimentos do passo 4 mais o do passo 7. Inserir um medicamento não cria nem altera atendimento.

**Comprovar:** `mfsql "SELECT count(*) FROM clinico.atendimento;"` — o número do passo 4 **mais um**.

### Passo 11 — Cliente: Sincronizar dados a partir do Portal (receber dados)

1. Janela B → aba **Início**. Antes de sincronizar, olhe a contagem em **Neste aparelho**.
2. Clique em **Sincronizar agora**.

**Esperado:** "Sincronizado. 0 enviados, 1 recebido." e a contagem de medicamentos sobe em um.

**Comprovar:** abra qualquer atendimento em aberto (por exemplo, o do passo 7, em **Atendimentos em aberto**) → **Registrar agora → Medicação** → a lista **Medicamento** já traz "Medicamento Roteiro AULA1". Não registre nada: é só para ver. (Se o app já tiver sincronizado sozinho entre os passos 9 e 11 — ao voltar a janela ao primeiro plano, por exemplo —, a mensagem dirá "0 recebidos"; a prova continua sendo o medicamento na lista.)

### Passo 12 — Cliente: Offline — Registrar ocorrência de socorro: criar pessoa, criar prontuário, registrar atendimento

1. Janela B: ligue a chave **Simular offline** (canto da tira). A tira vira um bloco **Offline · simulado**.
2. Na aba Network, limpe a lista (ícone 🚫) para começar do zero.
3. Aba **Pacientes** → **Novo paciente**.
4. **Nome completo:** `Pessoa Offline AULA1` · **Alergias:** `Alergia Roteiro AULA1`.
5. Clique em **Salvar e iniciar atendimento**. Isso cria, de uma vez, **a pessoa, o prontuário (com a alergia) e o atendimento**.
6. Na tela do atendimento, registre:
   - **Sinais** → PA sistólica `142`, PA diastólica `90`, Freq. cardíaca `92` → **Registrar sinais vitais**.
   - **Triagem** → laranja → **Registrar triagem**.
   - **Medicação** → em **Medicamento**, escolha **Medicamento Roteiro AULA1** (o do passo 9, que desceu no passo 11) → Dose `10`, Unidade `mg`, Via `EV` → **Registrar medicação**.
   - **Observação** → `Registro feito sem rede, durante o roteiro.` → **Registrar observação**.
7. **Recarregue a página (`F5`).**

**Esperado:**
- Tudo aparece na tela na hora, com o selo **Local** (guardado só no aparelho). A tira conta **7 pendentes**: pessoa, prontuário, atendimento e quatro eventos.
- Depois do `F5`, o app reabre no mesmo atendimento, com os mesmos registros e os mesmos 7 pendentes.

**Comprovar:**
- **Aba Network: nenhuma requisição para `/api`** — antes e depois do `F5`. O seletor impede a chamada antes de ela sair.
- Aba **Pendências** (rodapé): a **Fila de envio** lista as 7 operações, na ordem.
- Opcional, no Console do DevTools: `await __mf.consultar("SELECT ordem, metodo, rota, status FROM outbox WHERE status != 'CONFIRMADA'")` — as 7 linhas `PENDENTE` do banco local.

### Passo 13 — Portal: Listar prontuários e atendimentos: cadastro novo não deve ser exibido

1. Janela A → **Prontuários** → **Atualizar**.
2. Janela A → **Atendimentos** → **Atualizar**.

**Esperado:** "Pessoa Offline AULA1" **não aparece** em nenhuma das duas listas.

**Comprovar:**

```bash
mfsql "SELECT count(*) FROM clinico.pessoa WHERE nome = 'Pessoa Offline AULA1';"     # 0
```

O registro existe só no aparelho.

### Passo 14 — Cliente: Online — Sincronizar dados para o Portal

1. Janela B: **desligue** a chave **Simular offline**.

Não é preciso clicar em mais nada: o monitor de conectividade confirma o servidor e avisa o motor de sincronização (padrão *Observer*).

**Esperado:** a tira volta a **Online**, mostra "Enviando…" e, em segundos, **Tudo enviado**. A aba Pendências fica vazia.

**Comprovar:**
- Aba Network: os 7 `POST` em sequência (`/pessoa`, `/prontuario`, `/atendimento` e quatro `/atendimento-evento`), todos **201**, na ordem em que foram criados.
- **Idempotência:** vá ao **Início** e clique em **Sincronizar agora** duas vezes. Deve responder "0 enviados". Depois:

```bash
mfsql "SELECT (SELECT count(*) FROM clinico.pessoa p WHERE p.nome = 'Pessoa Offline AULA1') AS pessoas,
              (SELECT count(*) FROM clinico.prontuario r JOIN clinico.pessoa p ON p.id = r.pessoa_id WHERE p.nome = 'Pessoa Offline AULA1') AS prontuarios,
              (SELECT count(*) FROM clinico.prontuario_item i JOIN clinico.prontuario r ON r.id = i.prontuario_id JOIN clinico.pessoa p ON p.id = r.pessoa_id WHERE p.nome = 'Pessoa Offline AULA1') AS itens,
              (SELECT count(*) FROM clinico.atendimento a JOIN clinico.pessoa p ON p.id = a.pessoa_id WHERE p.nome = 'Pessoa Offline AULA1') AS atendimentos,
              (SELECT count(*) FROM clinico.atendimento_evento e JOIN clinico.atendimento a ON a.id = e.atendimento_id JOIN clinico.pessoa p ON p.id = a.pessoa_id WHERE p.nome = 'Pessoa Offline AULA1') AS eventos;"
```

  Resultado esperado: **1 pessoa, 1 prontuário, 1 item, 1 atendimento, 4 eventos** — sem duplicata.

### Passo 15 — Portal: Listar prontuários e atendimentos: cadastro novo deve ser exibido

1. Janela A → **Prontuários** → **Atualizar**.
2. Janela A → **Atendimentos** → **Atualizar**.

**Esperado:** "Pessoa Offline AULA1" aparece nas duas listas; o atendimento dela está no **topo** do livro (a ordem é pela hora em que chegou à central).

**Comprovar:** clique no atendimento — a passagem de caso mostra a alergia "Alergia Roteiro AULA1", a triagem, a medicação e a observação feitas offline, com o horário **do aparelho**.

### Passo 16 — Demonstrar geração da Ficha de atendimento

1. Janela A → **Atendimentos** → clique na linha de "Pessoa Offline AULA1".
2. Clique em **Gerar PDF**.
3. Na seção **Ficha em PDF e envios**, clique em **Baixar PDF**.

**Esperado:** a seção passa a mostrar o código de verificação (formato `MF-XXXX-XXXX`) e a etiqueta **Íntegra**. O navegador baixa `ficha-MF-XXXX-XXXX.pdf`.

**Comprovar:** abra o PDF — cabeçalho, dados da pessoa, **passagem de caso**, linha do tempo numerada, código de verificação e QR no rodapé, e a faixa "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA" em todas as páginas. O QR leva à tela de verificação do documento no portal.

### Passo 17 — Demonstrar e-mail enviado com Ficha de atendimento em anexo

1. Na mesma seção, clique em **Enviar por e-mail**.
2. No diálogo **Enviar a ficha por e-mail**: **Nome do destinatário** `Familiar do Roteiro` · **E-mail** `familiar.aula1@exemplo.test` · **Vínculo** **Familiar**.
3. Clique em **Enviar ficha**.

**Esperado:** o diálogo fecha e o envio aparece na tabela de envios como **Na fila** e, em poucos segundos, **Enviado**.

**Comprovar:** em <http://localhost:18025> (Mailpit) chegou a mensagem "MedicalField — Ficha de atendimento" para `familiar.aula1@exemplo.test`, com o **anexo `ficha-MF-XXXX-XXXX.pdf`** — o mesmo código do passo 16. Abra o anexo.

No banco: `mfsql "SELECT destinatario_email, vinculo, status, tentativas, enviado_em FROM documentos.envio_email ORDER BY criado_em DESC LIMIT 1;"` — `ENVIADO`, 1 tentativa.

> **Limite:** o e-mail é entregue ao Mailpit, um servidor SMTP real de captura dentro do cluster. O envio a uma caixa externa (Gmail, por exemplo) depende de credenciais SMTP no Secret e **não foi testado**.

## 4. Resumo para conferência

| # | Passo | Onde | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Portal: Autenticar | Portal, tela de entrada | Livro de atendimentos aberto, com o nome da administradora |
| 2 | Portal: Listar cadastros | Portal → Medicamentos | Catálogo listado |
| 3 | Portal: Listar prontuários | Portal → Prontuários | Prontuários listados |
| 4 | Portal: Listar atendimentos | Portal → Atendimentos | Livro listado (anotar o total) |
| 5 | Cliente: Autenticar | App, tela Entrar | Tela Início; tira Online |
| 6 | Cliente: Sincronizar (receber) | App → Início → Sincronizar agora | Medicamentos e pacientes no aparelho |
| 7 | Cliente: Online — registrar atendimento | App → Pacientes → paciente → Iniciar atendimento | "Tudo enviado"; 1 linha na central |
| 8 | Portal: ver o atendimento | Portal → Atendimentos → Atualizar | Atendimento do passo 7 no topo |
| 9 | Inserir medicamento pelo banco | `kubectl exec` + `psql` | Linha criada com `seq`; aparece no portal |
| 10 | Portal: Listar atendimentos | Portal → Atendimentos → Atualizar | Sem mudança |
| 11 | Cliente: Sincronizar (receber) | App → Início → Sincronizar agora | Medicamento do passo 9 no aparelho |
| 12 | Cliente: Offline — pessoa, prontuário, atendimento | App, chave Simular offline ligada | 7 pendentes; nenhuma requisição `/api`; sobrevive ao `F5` |
| 13 | Portal: cadastro novo **não** aparece | Portal → Prontuários e Atendimentos | Ausente; 0 linhas na central |
| 14 | Cliente: Online — sincronizar | App, chave desligada | Fila esvazia; repetir não duplica |
| 15 | Portal: cadastro novo aparece | Portal → Prontuários e Atendimentos | Presente |
| 16 | Gerar a ficha | Portal → atendimento → Gerar PDF → Baixar PDF | PDF baixado, íntegro |
| 17 | E-mail com a ficha | Portal → Enviar por e-mail | "Enviado"; mensagem com anexo no Mailpit |

## 5. Execução automatizada

`e2e/roteiro.spec.ts` executa os mesmos 17 passos com o Playwright, dirigindo o Chrome: o portal (1440 px) e o cliente (390 px) em dois contextos de navegador separados, como dois usuários. O passo 9 roda o `INSERT` por `kubectl exec`; o passo 12 confere que nenhuma requisição `/api` saiu; o passo 17 consulta a API do Mailpit.

```bash
# com o cluster local no ar (seção 2.1)
export MF_SENHA_DEMO='<senha de demonstração>'       # apps/mike-baguncinha/README.md
npm install                                          # uma vez
npm run roteiro -w @medicalfield/e2e
```

Requer Chrome instalado, `kubectl` no `PATH` e o arquivo `deploy/.local/kubeconfig` (criado pelo `cluster-local.sh subir`). O próprio teste abre e fecha o encaminhamento de porta do Mailpit.

Cada execução regrava, em [`evidencias/roteiro/`](evidencias/roteiro/):

| Arquivo | Conteúdo |
| --- | --- |
| [`resultado.md`](evidencias/roteiro/resultado.md) | O observado em cada passo, com data e alvo |
| `passo-01.png` … `passo-17.png` | Uma captura de tela por passo |
| `ficha-do-roteiro.pdf` | O PDF baixado no passo 16 |

Última execução registrada: **17 de 17 passos**, em 18/11/2026, contra o cluster k3s local (`http://localhost:8088`). Evidência E-007 em [`../VALIDATION_EVIDENCE.md`](../VALIDATION_EVIDENCE.md).

Cada execução usa um sufixo novo nos nomes (derivado do relógio), então pode ser repetida sobre o mesmo banco sem limpar nada.

## 6. Voltar ao estado inicial

**Na maioria das vezes não é preciso.** O roteiro pode ser repetido sobre os mesmos dados: basta trocar o sufixo dos nomes (`AULA2`, `AULA3`…). Ele só acrescenta registros.

Para tirar o medicamento de teste da lista sem apagar (apagar quebraria os eventos que apontam para ele):

```bash
mfsql "UPDATE clinico.medicamento SET ativo = false WHERE nome = 'Medicamento Roteiro AULA1';"
```

Para voltar a um sistema **zerado**, só com a carga de demonstração, são dois lados — e é preciso fazer os dois:

**1. O servidor** (apaga o cluster e todos os dados; as imagens já construídas são reaproveitadas):

```bash
bash deploy/scripts/cluster-local.sh derrubar
bash deploy/scripts/cluster-local.sh subir
bash deploy/scripts/cluster-local.sh implantar
```

**2. O aparelho** (o banco local do app): na janela B, `F12` → **Application** → **Storage** → **Clear site data**, e recarregue.

Não pule o segundo passo depois de recriar o servidor: o app guarda o cursor de sincronização e a fila do servidor antigo, e um banco central novo recomeça a numeração do cursor.

Só parar, mantendo os dados: `bash deploy/scripts/cluster-local.sh parar` (e `subir` retoma).

## 7. Se algo não sair como esperado

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Login responde "Muitas tentativas" | 5 senhas erradas em 15 min para o mesmo registro, ou mais de 10 logins por minuto | Esperar; ou entrar com outro profissional de demonstração |
| App mostra "já está aberto em outra aba" | Duas abas do cliente | Fechar a outra aba |
| Tira do app fica em Offline com a chave desligada | Servidor fora do ar | `cluster-local.sh status`; ver [`../operacao/troubleshooting.md`](../operacao/troubleshooting.md) |
| "Sincronizar agora" desabilitado | Chave Simular offline ligada | Desligar a chave |
| Passo 11 diz "0 recebidos" | O app já havia sincronizado sozinho | Conferir pela lista de medicamentos |
| Envio fica em "Na fila" | Mailpit ou SMTP fora | `cluster-local.sh status`; o envio é refeito sozinho (1, 5, 15 e 60 min) |
| `kubectl exec` reclama de TTY no Git Bash | Uso de `-it` | Os comandos deste roteiro não usam `-it`; para sessão interativa, prefixe com `winpty` |
| <http://localhost:18025> não abre | O encaminhamento de porta caiu | Rodar de novo o comando da seção 2.2 |
