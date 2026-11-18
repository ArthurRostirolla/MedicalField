---
titulo: Sincronização offline e online
sub: Como o app de campo e o portal gravam sem internet e sobem tudo depois, sem duplicar nada.
---

## A ideia em uma frase

**Toda escrita vira um comando com id próprio, guardado numa fila (outbox) antes de ir para a rede.** Quando a conexão existe, a fila sobe em ordem, um comando por vez; o servidor usa o id do comando (`Idempotency-Key`) para que reenviar nunca duplique. Ficar offline, então, é só "a fila ainda não andou".

{{svg sync-offline}}

## As três peças (e os padrões de projeto)

| Peça | Padrão | Arquivo | O que faz |
| --- | --- | --- | --- |
| **Monitor de conectividade** | Observer | `lucky-patcher/src/sync/conectividade.ts` | Publica um único estado: `online = não simulando E servidor alcançável`. |
| **Outbox** | Command | `lucky-patcher/src/dados/outbox.ts` | Cada escrita vira um comando serializável, gravado na **mesma transação** do dado. |
| **Motor de sincronização** | — | `lucky-patcher/src/sync/motor.ts` | Sobe a fila, envia os logs e baixa as alterações (delta por cursor). |
| **Receptor idempotente** | Command (servidor) | `dona-cida/src/aplicacao/comando.ts` | Confere a chave, executa e registra a operação numa só transação. |
| **Estratégias de conflito** | Strategy | `dona-cida/src/dominio/conflito/` | Uma regra por tipo de dado (união, campo mais recente, servidor vence). |

## Arquitetura de pastas

```
apps/
├─ lucky-patcher/                 app de campo (Expo: Android, iOS e PWA)
│  └─ src/
│     ├─ app.ts                   raiz de composição: liga banco, HTTP, monitor, motor
│     ├─ banco/                   SQLite local (expo-sqlite / sqlite-wasm no navegador)
│     │  └─ migracoes/001_inicial.ts   tabelas + outbox + log_local + sync_estado
│     ├─ dados/                   repositórios: gravam dado + comando juntos
│     │  ├─ outbox.ts             Comando, classificarFila (retidos/rejeitados)
│     │  ├─ pessoas.ts, atendimentos.ts
│     │  └─ pendencias.ts         tela de rejeitados: corrigir ou descartar
│     └─ sync/
│        ├─ conectividade.ts      MonitorConectividade (Observer)
│        ├─ http.ts               o ÚNICO fetch do app (recusa se simulando)
│        ├─ sessao.ts             token + renovação
│        └─ motor.ts              MotorSincronizacao (subida, logs, descida)
├─ brad-pitt/                     portal web (React)
│  └─ src/
│     ├─ api/cliente.ts           o ÚNICO fetch do portal (portão do offline simulado)
│     ├─ api/offline.ts           fila do portal (localStorage) + sincronizar()
│     ├─ api/recursos.ts          escritas clínicas passam por escrever()
│     └─ casca/Casca.tsx          BarraConectividade + chave "Simular offline"
└─ dona-cida/                     servidor clínico (NestJS)
   └─ src/
      ├─ aplicacao/comando.ts     ExecutorComandos: idempotência por Idempotency-Key
      ├─ aplicacao/consultas.ts   GET /sync/alteracoes?desde=cursor
      └─ dominio/conflito/        Strategy: uniao-imutavel, campo-mais-recente, servidor-vence
```

## 1. Gravar (sempre local primeiro)

No app, o repositório grava o dado **e** o comando na mesma transação SQLite. Ou entram os dois, ou nenhum: não existe dado sem comando nem comando sem dado.

```ts
// lucky-patcher/src/dados/atendimentos.ts
await ctx.banco.gravar([
  sqlInserir('atendimento', { id: corpo.id, ..., estadoSync: 'LOCAL' }),
  sqlNovoComando({
    opId: ctx.novoId(),                 // vira a Idempotency-Key
    metodo: 'POST', rota: '/api/v1/atendimento', corpo,
    entidade: 'atendimento', entidadeId: corpo.id,
    dependeDe: { entidade: 'pessoa', id: corpo.pessoaId },
  }),
  logAcao(ctx, 'ATENDIMENTO_INICIADO', 'atendimento', corpo.id),
]);
ctx.aposEscrita();                      // pede uma sincronização (se online)
```

Os **ids são gerados no cliente** (`crypto.randomUUID()`). É isso que permite criar paciente, prontuário e atendimento offline e ligar um ao outro antes de o servidor existir.

## 2. Saber se está online (Observer)

```ts
// lucky-patcher/src/sync/conectividade.ts
proximo.online = !proximo.simulandoOffline && proximo.servidorAlcancavel;
```

- O monitor faz *ping* em `GET /auth/me`: a cada 20 s online, a cada 5 s offline.
- O evento `offline` do navegador derruba o estado na hora.
- Ao **desligar** a simulação nada é presumido: só fica online depois de o ping responder.
- O motor **assina** o monitor: na transição offline → online ele zera o recuo e sincroniza.

## 3. Simular offline (o portão)

O cliente HTTP é o único lugar que chama `fetch`. Simulando, a chamada é recusada **antes de sair**: nenhuma requisição aparece na aba Rede.

```ts
// lucky-patcher/src/sync/http.ts
if (this.deps.simulandoOffline()) {
  throw new FalhaTransporte('OFFLINE_SIMULADO', 'Modo offline simulado: ...');
}
```

O seletor é persistido em `sync_estado.modo_simulado`: fechar e abrir o app continua offline.

## 4. Subir a fila (motor)

```ts
// lucky-patcher/src/sync/motor.ts — subir()
const fila = classificarFila(await listarNaoConfirmados(banco), profissionalId);
const proximo = fila.find((item) => item.situacao === 'ENVIAVEL')?.comando;
// status ENVIANDO -> requisitar com chaveIdempotencia: proximo.opId
```

| Resposta | O que o motor faz |
| --- | --- |
| **2xx** | `CONFIRMADA`; a linha local vira `estado_sync = CONFIRMADO` (e adota o que o servidor uniu). |
| **Sem resposta / 5xx / timeout** | Volta a `PENDENTE` com **backoff exponencial + jitter** (1 s, 2 s, 4 s… teto 5 min). A cabeça da fila não é ultrapassada. |
| **Offline simulado / sessão expirada** | Devolve à fila sem contar tentativa. |
| **4xx** | `REJEITADA` (vai para Pendências). Dependentes ficam **RETIDOS** atrás dela; os independentes continuam. |

Garantias extras: nunca roda duas sincronizações ao mesmo tempo (um pedido no meio agenda mais uma passada); ao abrir o app, o que ficou `ENVIANDO` volta a `PENDENTE` — reenviar é seguro.

## 5. Baixar alterações (descida por cursor)

```ts
GET /api/v1/sync/alteracoes?desde=<cursor>&limite=500
```

Cada página e o novo cursor entram **na mesma transação local**. Uma linha que ainda tem comando pendente **não é sobrescrita** (`NOT EXISTS (SELECT 1 FROM outbox ...)`): o que o profissional digitou offline não some.

## 6. No servidor: idempotência e conflitos

{{svg outbox}}

`ExecutorComandos` abre **uma** transação: trava a chave, procura a operação anterior, executa a ação (dado + auditoria) e grava `operacao_sync`. A mesma chave com o mesmo autor, rota e corpo devolve a resposta original (200); com outro autor, rota ou corpo, `422 CHAVE_IDEMPOTENCIA_CONFLITANTE` (a resposta guardada de outra pessoa nunca é devolvida).

| Dado | Estratégia | Regra |
| --- | --- | --- |
| Eventos do atendimento, itens do prontuário | **UniaoImutavel** | Nada se reescreve: corrigir é um evento `RETIFICACAO`. Tudo se soma. |
| Cadastro da pessoa | **CampoMaisRecente** | Por campo, vence a edição com `editadoEm` mais novo. Empate mantém o servidor. |
| Medicamentos | **ServidorVence** | Cadastro de apoio: o servidor é a fonte. |
| Pessoa duplicada | **RevisaoManual** | Marca possível duplicata para o ADMIN revisar. |

## 7. O portal (BradPitt) também simula offline

O portal não tem banco local: ele reaproveita o **mesmo contrato** com uma fila em `localStorage`.

```ts
// brad-pitt/src/api/cliente.ts — o portão
if (offlineSimulado && !caminho.startsWith('/auth/')) {
  throw new ErroApi(null, 'OFFLINE_SIMULADO', 'Modo offline simulado: ...');
}

// brad-pitt/src/api/offline.ts — toda escrita clínica
if (!estado.simulando && estado.fila.length === 0) {
  try { return await api(caminho, esquema, { metodo: 'POST', corpo }); }
  catch (erro) { if (!(erro instanceof ErroApi && erro.status === null)) throw erro; }
}
publicar({ fila: [...estado.fila, comando] });   // opId = Idempotency-Key
```

- **Simulando, sem rede, ou com fila na frente** → a escrita entra na fila (a ordem é parte do contrato: o evento nunca chega antes do atendimento).
- **Desligar a simulação**, o evento `online` do navegador ou um relógio de 15 s disparam `sincronizar()`: 2xx sai da fila, sem resposta para e espera, 4xx vira aviso "Recusado".
- Só o **profissional que gravou** sobe os próprios comandos (a auditoria do servidor registra o autor pelo token).
- `/auth/*` passa pelo portão: o portal não tem sessão offline, e recarregar a página precisa do refresh.
- Leitura offline é o que o cache do React Query já tem; telas novas mostram "Modo offline simulado".

## Limites conhecidos

- Portal: sem backoff exponencial (intervalo fixo de 15 s) e sem retenção de dependentes — se o cadastro for recusado, o atendimento dele também volta recusado.
- Portal: a fila fica em `localStorage` do navegador, como o SQLite do app fica no aparelho; quem tem o computador tem a fila.
- App: o cursor da descida cobre medicamentos, pessoas e prontuários; atendimentos de outros aparelhos são vistos pelo portal, não pelo app.
