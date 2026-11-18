---
titulo: Padrões de projeto
sub: Os 9 padrões do MedicalField (6 de projeto + 3 arquiteturais), o que resolvem e onde estão no código.
---

Cada padrão segue o mesmo roteiro: **o problema** que existe no MedicalField, **como o padrão resolve**, **o código** (simplificado a partir do real) e **onde está**.

## Padrões de projeto

### 1. Repository (enunciado)

**O problema.** O app precisa funcionar sem internet. Se cada tela fizesse `fetch` direto na API, ela travaria offline. Se cada tela escrevesse SQL, o banco ficaria espalhado por todo o código.

**Como resolve.** O repositório é uma classe com métodos como `buscar`, `obter` e `criar`. **A tela só chama esses métodos.** Quem escreve o SQL e decide onde gravar é o repositório.

**A tela pede assim:**

```tsx
// telas/Pacientes.tsx
const pessoas = useConsulta(() => app.pessoas.buscar(busca), [busca]);
```

**O repositório resolve:**

```ts
// dados/pessoas.ts
class RepositorioPessoas {
  async buscar(texto: string): Promise<PessoaLocal[]> {
    const linhas = await this.ctx.banco.consultar(
      `SELECT ... FROM pessoa p WHERE p.nome LIKE ? ...`, [`%${texto}%`]);
    return linhas.map(paraPessoa);   // converte a linha do SQLite em objeto
  }
}
```

**A resposta chega** como uma lista de objetos prontos (`PessoaLocal[]`), por exemplo `{ id, nome, cpf, estadoSync: 'LOCAL' }`. A tela não vê SQL nem HTTP; ela só desenha essa lista. Para gravar, a tela chama `app.pessoas.criar(formulario)`, e o repositório grava no SQLite local e coloca um pedido de envio na fila (veja *Transactional Outbox*). Só o `ClienteHttp` faz `fetch`, e só o motor de sincronização usa o `ClienteHttp`.

```
Tela → app.pessoas.criar()  → SQLite local + fila (outbox)   ← funciona offline
                                         ↓ (quando a rede voltar)
                               motor de sync → ClienteHttp → API
```

**Por que usar.** A tela funciona igual com ou sem internet. Se o banco mudar, só o repositório muda. Os três serviços usam a mesma ideia: uma interface no `dominio` e o SQL no `infra`.

**Onde está.**
- App: `apps/lucky-patcher/src/dados/pessoas.ts:132`, `dados/atendimentos.ts:51`; remoto em `sync/http.ts:49` (`ClienteHttp`)
- DonaCida: interface `apps/dona-cida/src/dominio/repositorios.ts:58` → SQL `infra/repositorio-clinico.ts:213`
- Mike (Go): `apps/mike-baguncinha/internal/dominio/identidade.go:83` → `internal/infra/postgres.go`
- Jaiminho (Python): `apps/jaiminho/src/jaiminho/dominio/portas.py:10` → `infra/banco.py:74`

### 2. Strategy (enunciado)

**O problema.** Dois profissionais podem mexer no **mesmo dado** sem internet e sincronizar depois. O servidor (DonaCida) precisa decidir **qual versão fica**, e cada tipo de dado pede uma regra diferente.

**Como resolve.** Cada regra é uma classe (uma *estratégia*), e uma tabela escolhe a estratégia pelo tipo de dado:

| Dado | Estratégia | Regra |
|---|---|---|
| Eventos do atendimento, itens do prontuário | `UniaoImutavel` | Nunca há conflito: junta tudo. O que já existe não muda, e o que é novo entra. |
| Pessoa (nome, telefone…) | `CampoMaisRecente` | Vence a edição mais recente, **campo a campo**. |
| Medicamento | `ServidorVence` | O app só lê esse cadastro, então vale sempre o que está no servidor. |
| Pessoa possivelmente duplicada | `RevisaoManual` | Aceita e marca como "possível duplicata" para alguém revisar no portal. |

Exemplo do `CampoMaisRecente`: o profissional A muda o **telefone** às 10h, e o B muda o **endereço** às 11h. Os dois ficam valendo, porque cada campo guarda o horário da própria última edição.

```ts
// estrategia.ts — o formato comum a todas
interface EstrategiaConflito<Atual, Recebido, Decisao> {
  resolver(atual: Atual, recebido: Recebido): Decisao;  // o que o servidor tem + o que chegou
}

// registro.ts — a tabela que escolhe
const ESTRATEGIAS = {
  evento: uniao, prontuarioItem: uniao,
  pessoa: new CampoMaisRecente(),
  medicamento: new ServidorVence(),
  pessoaDuplicada: new RevisaoManual(),
};

// atendimento.ts — quem usa não sabe qual regra está por trás
const { novos } = estrategias.para('evento').resolver(existentes, recebidos);
```

**Por que usar.** Para mudar a regra de um tipo de dado, basta trocar uma linha na tabela, sem `if`s espalhados pelo código.

**Onde está.** `apps/dona-cida/src/dominio/conflito/`: interface em `estrategia.ts:6`, tabela em `registro.ts:20`, regras em `uniao-imutavel.ts`, `campo-mais-recente.ts`, `servidor-vence.ts` e `revisao-manual.ts`.

### 3. Observer (enunciado)

**O problema.** Quando a internet volta, o app deve sincronizar sozinho, e a barra "Online/Offline" da tela deve mudar na hora. Sem um aviso, cada parte teria que ficar perguntando "já voltou?" o tempo todo.

**Como resolve.** O `MonitorConectividade` é o **sujeito**: só ele verifica a rede. Quem se interessa **assina** e passa uma função. Quando o estado muda, o monitor **publica** e chama todas as funções assinadas.

```ts
// conectividade.ts — o sujeito guarda quem quer ser avisado
assinar(ouvinte) {
  this.ouvintes.add(ouvinte);
  return () => this.ouvintes.delete(ouvinte);    // função para cancelar a assinatura
}
publicar(mudanca) {
  this.estado = { ...this.estado, ...mudanca };
  for (const ouvinte of this.ouvintes) ouvinte(this.estado, anterior);
}

// motor.ts — assinante 1: sincroniza quando a rede volta
monitor.assinar((estado, anterior) => {
  if (estado.online && !anterior.online) this.sincronizar('conexao');
});

// ui/contexto.tsx — assinante 2: a tela redesenha a barra de conectividade
useConectividade();  // por dentro: monitor.assinar(avisar)
```

**Por que usar.** O monitor não conhece quem o escuta. Para algo novo reagir à rede, basta mais um `assinar`, sem mexer no monitor.

**Onde está.** Sujeito em `apps/lucky-patcher/src/sync/conectividade.ts:30`; assinantes em `sync/motor.ts:113` e `ui/contexto.tsx:65`.

### 4. Command

**O problema.** Offline, o app não pode chamar a API na hora. Ele precisa **guardar a ação** ("criar o paciente Fulano") para executá-la depois, talvez muitas vezes, se a rede cair no meio do envio.

**Como resolve.** Cada ação vira um **objeto com tudo o que é preciso para executá-la depois**: método, rota, corpo e um id único (`opId`). Esse objeto é gravado como uma linha na tabela `outbox`. Quem cria o comando não envia nada; quem envia (o motor) não sabe o que o comando significa, só o executa.

```ts
// dados/pessoas.ts — a ação vira dados
sqlNovoComando({
  opId: ctx.novoId(),                          // id único do comando
  metodo: 'POST', rota: '/api/v1/pessoa', corpo: pessoa,
  descricao: `Novo paciente: ${pessoa.nome}`,  // aparece na tela de Pendências
});

// sync/motor.ts — mais tarde, executa a linha como está
sessao.requisitar({ metodo: cmd.metodo, rota: cmd.rota,
                    corpo: JSON.parse(cmd.corpo), chaveIdempotencia: cmd.opId });
```

No servidor, o `ExecutorComandos` é o **receptor**: recebe o comando e o executa uma única vez (veja *Idempotent Receiver*).

**Por que usar.** A ação sobrevive a fechar o app, a reiniciar o aparelho e a ficar dias sem rede. A tela "Pendências" consegue listar, mostrar e corrigir comandos rejeitados, porque eles são dados.

**Onde está.** App: `apps/lucky-patcher/src/dados/outbox.ts:9` (`Comando`, `sqlNovoComando`). Receptor: `apps/dona-cida/src/aplicacao/comando.ts:35`.

### 5. Adapter

**O problema.** O mesmo app roda em três lugares, e cada um tem um banco diferente: navegador (SQLite WASM), Android/iOS (SQLCipher) e testes (SQLite em memória). O Jaiminho também precisa enviar e-mail de verdade em produção, e de mentira nos testes.

**Como resolve.** Define-se **uma porta** (interface) com o que o resto do código precisa. Cada mecanismo ganha um **adaptador** que cumpre essa interface, traduzindo para a API real dele. O código de cima só conhece a porta.

```ts
// banco/executor.ts — a porta: repositórios e motor só conhecem isto
interface ExecutorSql {
  consultar(sql, params): Promise<Linha[]>;
  transacao(comandos): Promise<void>;   // ou entra tudo, ou nada
}

// cada plataforma entrega o seu adaptador
// plataforma.web.ts → abrirExecutorWeb()     SQLite WASM + OPFS (navegador)
// plataforma.ts     → abrirExecutorNativo()  expo-sqlite / SQLCipher (celular)
// testes            → criarExecutorOo1()     SQLite em memória
```

```python
# jaiminho/dominio/portas.py — mesma ideia no e-mail
class EnviadorEmail(Protocol):
    async def enviar(self, mensagem: MensagemEmail) -> None: ...
# produção: EnviadorEmailSmtp   testes: EnviadorEmailFalso
```

**Por que usar.** Quando o `jeep-sqlite` perdeu dados no teste de queda, só o adaptador web foi trocado. Repositórios, outbox e motor não mudaram uma linha.

**Onde está.** Porta em `apps/lucky-patcher/src/banco/executor.ts:10`; adaptadores em `executorWeb.ts:5`, `executorExpo.ts:38` e `executorOo1.ts:10`. E-mail: `apps/jaiminho/src/jaiminho/dominio/portas.py:66` → `infra/email.py:23` (SMTP) e `:49` (falso).

### 6. Chain of Responsibility (middleware)

**O problema.** Toda requisição precisa de um id para rastreio, de uma linha no log de acesso e da conferência do token. Repetir isso dentro de cada rota seria fácil de esquecer em uma delas.

**Como resolve.** Monta-se uma **corrente de elos**. Cada elo faz **uma** coisa e passa a requisição ao próximo, ou a barra (a autenticação devolve 401 e não chama o handler). A ordem é a mesma nos três serviços: `request-id → log de acesso → autenticação → handler`.

```go
// servidor.go (Mike) — a corrente é montada embrulhando um elo no outro
return a.requestID(a.logAcesso(mux))   // mux → a.autenticar(...) → handler

func (a *API) requestID(proximo http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    w.Header().Set("X-Request-Id", id)   // faz a sua parte...
    proximo.ServeHTTP(w, r)              // ...e chama o próximo elo
  })
}
```

O log de acesso fica **por fora** da autenticação de propósito: assim, até um 401 é registrado.

**Por que usar.** O handler (`login`, `criar pessoa`…) só cuida da regra de negócio. Uma preocupação nova (por exemplo, um limite de tamanho do corpo) vira mais um elo, sem mexer em nenhuma rota.

**Onde está.** Go: `apps/mike-baguncinha/internal/http/servidor.go:44`. Nest: `apps/dona-cida/src/http/cadeia.ts:19` + `app.module.ts:62`. FastAPI: `apps/jaiminho/src/jaiminho/http/middlewares.py:64` + `http/app.py:43`.

## Padrões arquiteturais

### 7. Transactional Outbox

**O problema.** Gravar o dado e avisar o servidor são duas coisas. Se o app gravasse o paciente e caísse antes de registrar o envio, o servidor nunca saberia dele. Se registrasse o envio sem o dado, mandaria algo que não existe.

**Como resolve.** O dado e o comando de envio são gravados na **mesma transação** do banco local: ou entram os dois, ou nenhum. A rede fica para depois: o motor de sincronização lê a fila e envia em ordem, com espera crescente entre tentativas (backoff) quando falha.

```ts
// dados/pessoas.ts — uma transação só
await banco.transacao([
  sqlInserir('pessoa', ...),                   // o dado
  sqlInserir('prontuario', ...),
  sqlNovoComando({ rota: '/api/v1/pessoa' }),  // o pedido de envio
]);
// motor.ts: quando houver conexão, PENDENTE → ENVIANDO → CONFIRMADA
```

No **Jaiminho** é igual com e-mail: pedir o envio só grava uma linha na tabela de envios. Um worker no mesmo processo lê a tabela, tenta o SMTP e, se falhar, reagenda (60 s, 5 min, 15 min, 1 h).

**Por que usar.** Nenhum registro clínico se perde, mesmo com a bateria acabando no meio da gravação. A tela mostra "salvo" na hora, porque a gravação local já é a definitiva.

**Onde está.** App: `apps/lucky-patcher/src/dados/pessoas.ts:161` e `sync/motor.ts`. Jaiminho: `apps/jaiminho/src/jaiminho/aplicacao/envios.py:22` (`WorkerEnvios`), backoff em `dominio/regras.py:41`.

### 8. Idempotent Receiver

**O problema.** O app envia o comando, o servidor grava, mas a resposta se perde (a rede caiu). O app não sabe se deu certo e **reenvia**. Sem cuidado, o paciente seria criado duas vezes.

**Como resolve.** Cada comando leva seu `opId` no cabeçalho `Idempotency-Key`. Antes de executar, o servidor procura esse id. Se já processou, **devolve a resposta guardada** sem gravar nada. Se não, executa e guarda o id e a resposta **na mesma transação** do dado.

```ts
// dona-cida/aplicacao/comando.ts
const anterior = await repositorio.buscarOperacao(opId);
if (anterior) return { status: 200, corpo: anterior.resposta }; // repetição: mesma resposta
const resultado = await acao(repositorio);                       // primeira vez: executa
await repositorio.registrarOperacao({ opId, resposta: resultado.corpo });
```

Se a mesma chave chegar com outro corpo, de outro profissional ou para outra rota, o servidor responde 422, em vez de devolver a resposta de outra pessoa.

**Por que usar.** O app pode reenviar à vontade, e é isso que torna o outbox seguro. Repetir o comando dez vezes dá o mesmo resultado que enviar uma vez.

**Onde está.** `apps/dona-cida/src/aplicacao/comando.ts:30` (`ExecutorComandos`).

### 9. API Gateway ("freeway")

**O problema.** São três serviços (Mike, DonaCida e Jaiminho) mais o site, cada um numa porta. O app e o portal não deveriam conhecer esses endereços, e regras comuns (limite de tentativas de login, CORS, cabeçalhos de segurança) não deveriam se repetir em cada serviço.

**Como resolve.** Um único ponto de entrada (Traefik) recebe tudo e **encaminha pelo começo da URL**. As regras comuns são aplicadas ali, uma vez.

```yaml
# deploy/gateway/rotas.yml
mike:     { rule: PathPrefix(`/api/v1/auth`),        service: mike }
jaiminho: { rule: PathPrefix(`/api/v1/documento`),   service: jaiminho }
cida:     { rule: PathPrefix(`/api/v1/pessoa`) || ..., service: cida }
web:      { rule: PathPrefix(`/portal`) || PathPrefix(`/app`), service: web }
limite-login: { rateLimit: { average: 10, period: 1m } }   # regra comum, na entrada
```

Para o app, existe um único endereço (`/api/v1/...`). Só o gateway pode mandar o cabeçalho `X-Forwarded-For` aos serviços, então ninguém de fora consegue falsificar o próprio IP no log.

**Por que usar.** Um serviço pode mudar de lugar ou ser dividido sem mudar o app nem o portal, e a segurança de borda fica num lugar só.

**Onde está.** `deploy/gateway/rotas.yml`; serviço em `deploy/compose.yaml:164`.
