---
titulo: Padrões de projeto
sub: Os 9 padrões do MedicalField — o que cada um resolve, como funciona e onde está no código.
---

## Mapa rápido

| # | Padrão | Em uma frase | Onde vive |
|---|---|---|---|
| 1 | **Repository** | A tela pede dados a um objeto; só ele sabe se vêm do SQLite, da API ou do Postgres. | App e os 3 serviços |
| 2 | **Strategy** | Cada tipo de dado tem a sua regra de conflito, escolhida numa tabela. | DonaCida |
| 3 | **Observer** | O monitor de rede avisa quem assinou quando fica online/offline. | App e Portal |
| 4 | **Command** | Cada escrita vira uma linha guardada (método + rota + corpo + `opId`). | App → DonaCida |
| 5 | **Adapter** | Uma interface, várias implementações (banco web/celular/teste, SMTP real/falso). | App e Jaiminho |
| 6 | **Chain of Responsibility** | Toda requisição passa por request-id → log → autenticação → handler. | Os 3 serviços |
| 7 | **Transactional Outbox** | Dado e comando gravados na mesma transação; a rede fica para depois. | App e Jaiminho |
| 8 | **Idempotent Receiver** | Repetir o mesmo comando devolve a mesma resposta, sem duplicar. | DonaCida |
| 9 | **API Gateway** | Uma única porta de entrada que roteia para cada serviço. | Traefik |

1 a 6 são padrões **de projeto** (GoF, dentro do código). 7 a 9 são padrões **arquiteturais** (entre partes do sistema).

## Como eles se encaixam

Um caso só — **cadastrar um paciente sem internet** — passa por quase todos:

```
1. Tela chama app.pessoas.criar()                       → Repository
2. Repositório grava pessoa + comando numa transação    → Transactional Outbox + Command
3. O SQLite usado depende da plataforma                 → Adapter
4. A rede volta; o monitor avisa o motor de sync        → Observer
5. O motor envia o comando com Idempotency-Key = opId
6. Traefik recebe e manda /api/v1/pessoa à DonaCida     → API Gateway
7. request-id → log → autenticação → handler            → Chain of Responsibility
8. DonaCida confere o opId antes de gravar              → Idempotent Receiver
9. Se outro profissional mexeu no mesmo dado            → Strategy (regra de conflito)
```

## 1. Repository

**Problema.** Se cada tela fizesse `fetch` ou SQL direto, o app travaria offline e o acesso a dados ficaria espalhado.

**Solução.** Um objeto com métodos `buscar`, `obter`, `criar`. A tela só chama esses métodos; o repositório escreve o SQL e decide onde gravar.

```ts
// tela
const pessoas = useConsulta(() => app.pessoas.buscar(busca), [busca]);

// dados/pessoas.ts
class RepositorioPessoas {
  async buscar(texto: string) {
    const linhas = await this.ctx.banco.consultar('SELECT ... WHERE nome LIKE ?', [`%${texto}%`]);
    return linhas.map(paraPessoa);
  }
}
```

**Ganho.** A tela funciona igual com ou sem internet. Trocar o banco mexe só no repositório.

**Onde (11 repositórios).**

| App | Repositório | Contrato | Implementação |
|---|---|---|---|
| App | `RepositorioPessoas` | — | `dados/pessoas.ts:132` |
| App | `RepositorioProntuarios` | — | `dados/pessoas.ts:275` |
| App | `RepositorioMedicamentos` | — | `dados/pessoas.ts:390` |
| App | `RepositorioAtendimentos` | — | `dados/atendimentos.ts:51` |
| App | `RepositorioPendencias` | — | `dados/pendencias.ts:25` |
| DonaCida | `RepositorioClinico` | `dominio/repositorios.ts:58` | `infra/repositorio-clinico.ts:213` |
| Mike | `ProfissionalRepository` | `dominio/identidade.go:83` | `infra/postgres.go` |
| Mike | `SessaoRepository` | `dominio/identidade.go:92` | `infra/postgres.go` |
| Mike | `AuditoriaRepository` | `dominio/auditoria.go:60` | `infra/postgres.go` |
| Jaiminho | `DocumentoRepository` | `dominio/portas.py:10` | `infra/banco.py:74` |
| Jaiminho | `EnvioRepository` | `dominio/portas.py:26` | `infra/banco.py:135` |

## 2. Strategy

**Problema.** Dois profissionais editam o mesmo dado offline. Ao sincronizar, o servidor precisa decidir o que fica — e cada tipo de dado pede uma regra diferente.

**Solução.** Cada regra é uma classe com o mesmo método `resolver(atual, recebido)`. Uma tabela escolhe a classe pelo tipo de dado.

| Dado | Estratégia | Regra |
|---|---|---|
| Eventos, itens de prontuário | `UniaoImutavel` | Junta tudo; nada existente muda. |
| Pessoa | `CampoMaisRecente` | Vence a edição mais nova, **campo a campo**. |
| Medicamento | `ServidorVence` | O app só lê; vale o servidor. |
| Possível duplicata | `RevisaoManual` | Aceita e marca para revisão no portal. |

```ts
const { novos } = estrategias.para('evento').resolver(existentes, recebidos);
```

**Ganho.** Mudar a regra de um tipo é trocar uma linha da tabela, sem `if` espalhado.

**Onde.** `dona-cida/src/dominio/conflito/` — `estrategia.ts:6` (interface), `registro.ts:20` (tabela).

## 3. Observer

**Problema.** Quando a rede volta, o app deve sincronizar sozinho e a barra Online/Offline deve mudar. Sem aviso, todos ficariam perguntando "já voltou?".

**Solução.** O `MonitorConectividade` (sujeito) é o único que olha a rede. Interessados chamam `assinar(funcao)`; a cada mudança o monitor chama todas.

```ts
monitor.assinar((estado, anterior) => {
  if (estado.online && !anterior.online) motor.sincronizar('conexao');
});
```

**Ganho.** O monitor não conhece quem escuta. Algo novo reagir à rede = mais um `assinar`.

**Onde.** Sujeito `lucky-patcher/src/sync/conectividade.ts:30` · assinantes `sync/motor.ts:113`, `ui/contexto.tsx:65`.

**No Portal.** Mesmo formato, sem classe: o módulo `api/offline.ts` guarda o estado (simulando, rede, fila, sincronizando) e `publicar()` grava a fila no `localStorage` antes de avisar quem chamou `assinarOffline`. As telas assinam com `useSyncExternalStore(assinarOffline, lerOffline)`. Diferença: ninguém assina para sincronizar — quem chama `sincronizar()` são os eventos `online`/`offline` do navegador e um intervalo de 15 s; o Observer só mantém a UI em dia.

**Onde (Portal).** Sujeito `brad-pitt/src/api/offline.ts:55` · assinantes `casca/Casca.tsx:36`, `atendimentos/DetalheAtendimento.tsx:60`, `atendimentos/FichaPdfEnvios.tsx:60`.

## 4. Command

**Problema.** Offline, o app não pode chamar a API agora. Precisa **guardar a ação** para executá-la depois — talvez várias vezes.

**Solução.** A ação vira um objeto com tudo para executá-la: `metodo`, `rota`, `corpo`, `opId` (id único) e `dependeDe` (o que precisa ir antes). Ele é uma linha da tabela `outbox`. Quem cria não envia; quem envia (o motor) não interpreta, só executa.

**Os 6 comandos do sistema:**

| Ação no app | Rota (POST) | Espera antes |
|---|---|---|
| Cadastrar paciente | `/api/v1/pessoa` | — |
| Abrir prontuário | `/api/v1/prontuario` | a pessoa |
| Adicionar item ao prontuário | `/api/v1/prontuario-item` | a pessoa |
| Inativar item | `/api/v1/prontuario-item/{id}/inativacao` | a pessoa |
| Iniciar atendimento | `/api/v1/atendimento` | a pessoa |
| Registrar evento do atendimento | `/api/v1/atendimento-evento` | o atendimento |

Tipos de evento: sinais vitais, Glasgow, triagem, medicação, procedimento, observação, retificação, encerramento.

**Ciclo de vida de um comando:**

| Resposta do servidor | O comando vira | O que acontece |
|---|---|---|
| (antes de enviar) | `PENDENTE` → `ENVIANDO` | O motor pega o primeiro da fila. |
| 2xx | `CONFIRMADA` | O dado local passa a "sincronizado". |
| Sem rede, timeout, 5xx | `PENDENTE` | Espera cada vez mais (recuo) e tenta de novo. |
| 4xx | `REJEITADA` | Vai para a tela "Pendências" para correção. |

- A fila sai **na ordem de criação**; um comando em espera segura os de trás.
- Se um comando é rejeitado, os que dependem dele ficam **retidos** (ex.: evento de um atendimento rejeitado).

```ts
sqlNovoComando({
  opId: ctx.novoId(), metodo: 'POST', rota: '/api/v1/pessoa', corpo: pessoa,
  entidade: 'pessoa', entidadeId: pessoa.id, descricao: `Novo paciente: ${pessoa.nome}`,
});
```

**Ganho.** A ação sobrevive a fechar o app e a dias sem rede. Como é dado, a tela de Pendências lista e corrige.

**Onde.** `lucky-patcher/src/dados/outbox.ts:9` · envio `sync/motor.ts:234` · receptor `dona-cida/src/aplicacao/comando.ts:35`.

## 5. Adapter

**Problema.** O app roda no navegador (SQLite WASM), no celular (SQLCipher) e nos testes (SQLite em memória). O Jaiminho manda e-mail real em produção e falso nos testes.

**Solução.** Uma interface (porta) com o que o código precisa; cada mecanismo ganha um adaptador que a cumpre.

```ts
interface ExecutorSql {
  consultar(sql, params): Promise<Linha[]>;
  transacao(comandos): Promise<void>;
}
// web → executorWeb · celular → executorExpo · testes → executorOo1
```

**Ganho.** Quando o `jeep-sqlite` perdeu dados, só o adaptador web mudou.

**Onde.** `lucky-patcher/src/banco/executor.ts:10` · e-mail `jaiminho/dominio/portas.py:66` → `infra/email.py`.

## 6. Chain of Responsibility

**Problema.** Toda requisição precisa de id de rastreio, log e conferência de token. Repetir isso em cada rota é fácil de esquecer.

**Solução.** Uma corrente de elos; cada um faz uma coisa e chama o próximo, ou para (autenticação devolve 401).

```
request-id → log de acesso → autenticação → handler
```

O log fica **antes** da autenticação para registrar até os 401.

**Ganho.** O handler só cuida da regra de negócio. Preocupação nova = mais um elo.

**Onde.** Mike `internal/http/servidor.go:44` · DonaCida `http/cadeia.ts:19` · Jaiminho `http/middlewares.py:64`.

## 7. Transactional Outbox

**Problema.** Gravar o dado e registrar o envio são duas escritas. Se o app cai entre elas, o servidor nunca recebe o dado — ou recebe algo que não existe.

**Solução.** Dado + comando na **mesma transação** local: entram os dois ou nenhum. O motor envia depois.

```ts
await banco.transacao([
  sqlInserir('pessoa', ...),
  sqlNovoComando({ rota: '/api/v1/pessoa', ... }),
]);
```

No Jaiminho, pedir um e-mail só grava uma linha; um worker tenta o SMTP e reagenda em 60 s, 5 min, 15 min, 1 h.

**Ganho.** Nenhum registro clínico se perde, mesmo com a bateria acabando no meio.

**Onde.** `lucky-patcher/src/dados/pessoas.ts:161` · `sync/motor.ts` · Jaiminho `aplicacao/envios.py:22`.

## 8. Idempotent Receiver

**Problema.** O servidor grava, mas a resposta se perde. O app reenvia. Sem cuidado, o paciente seria criado duas vezes.

**Solução.** O comando leva o `opId` no cabeçalho `Idempotency-Key`. O servidor procura esse id: se já processou, devolve a resposta guardada; se não, executa e guarda id + resposta **na mesma transação** do dado.

```ts
const anterior = await repositorio.buscarOperacao(opId);
if (anterior) return { status: 200, corpo: anterior.resposta };
const resultado = await acao(repositorio);
await repositorio.registrarOperacao({ opId, resposta: resultado.corpo });
```

Mesma chave com outro corpo, rota ou profissional → **422**.

**Ganho.** Enviar 10 vezes = enviar 1 vez. É o que torna o Outbox seguro.

**Onde.** `dona-cida/src/aplicacao/comando.ts:30`.

## 9. API Gateway

**Problema.** Três serviços + site, cada um numa porta. O app não deveria conhecer esses endereços, nem cada serviço repetir CORS e limite de login.

**Solução.** O Traefik recebe tudo e encaminha pelo começo da URL; regras comuns ficam ali.

| Prefixo | Vai para |
|---|---|
| `/api/v1/auth`, `/log`, `/auditoria` | Mike (login com limite de 10/min) |
| `/api/v1/documento` | Jaiminho |
| `/api/v1/pessoa`, `/prontuario`, `/atendimento`, `/medicamento`, `/ficha`, `/sync` | DonaCida |
| `/portal`, `/app`, `/` | Web |

Só o gateway pode mandar `X-Forwarded-For`, então ninguém falsifica o IP no log.

**Ganho.** Serviço muda de lugar sem mudar o app; segurança de borda num lugar só.

**Onde.** `deploy/gateway/rotas.yml` · `deploy/compose.yaml:164`.
