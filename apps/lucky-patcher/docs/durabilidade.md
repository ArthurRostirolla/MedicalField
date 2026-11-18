# Durabilidade do banco local no navegador

Primeira tarefa da implementação do app (risco assumido no plano arquitetural, seção I): provar que um dado gravado numa transação sobrevive ao fechamento imediato da aba, antes de escrever qualquer tela.

## Decisão

| Plataforma | Adaptador do `ExecutorSql` | Onde fica o banco |
| --- | --- | --- |
| Navegador (PWA) | `src/banco/executorWeb.ts` + `sqlite.worker.ts`: **SQLite WASM oficial** (`@sqlite.org/sqlite-wasm`) com a VFS **`opfs-sahpool`**, dentro de um Worker | OPFS (sistema de arquivos privado da origem) |
| Android | `src/banco/executorCapacitor.ts`: `@capacitor-community/sqlite` (SQLCipher) | Armazenamento do aplicativo, cifrado |
| Testes (vitest) | `src/banco/executorOo1.ts` sobre o mesmo SQLite WASM, em memória | — |

O caminho web do plugin (`jeep-sqlite`) **foi descartado**. Só o adaptador web mudou; repositórios, outbox e motor de sincronização são os mesmos nas três linhas.

## O teste

`e2e/durabilidade/durabilidade.mjs`, com duas páginas mínimas (`sqlite-wasm.html` e `jeep.html`) servidas pelo Vite de desenvolvimento. Em cada rodada:

1. abre o Chrome com um perfil persistente em pasta temporária;
2. grava 200 linhas numa transação e espera só a promessa da transação resolver;
3. **mata o processo do navegador** (`Stop-Process -Force` em todo `chrome.exe` do perfil — sem `unload`, sem fechamento gracioso);
4. reabre o mesmo perfil e conta as linhas.

Cinco rodadas por variante. Reproduzir (com `npm run dev` no ar):

```bash
node e2e/durabilidade/durabilidade.mjs sqlite-wasm
node e2e/durabilidade/durabilidade.mjs jeep
node e2e/durabilidade/durabilidade.mjs jeep-salvando
```

## Resultado (Chrome estável, Windows 11, 17/11/2026)

```
sqlite-wasm + OPFS (opfs-sahpool) rodada 1..5: gravadas 200, encontradas após reabrir 200 OK
sqlite-wasm + OPFS (opfs-sahpool): 5/5 rodadas duráveis

jeep-sqlite, só a transação rodada 1..5: gravadas 200, encontradas após reabrir 0 PERDEU
jeep-sqlite, só a transação: 0/5 rodadas duráveis

jeep-sqlite, transação + saveToStore aguardado rodada 1..5: gravadas 200, encontradas após reabrir 200 OK
jeep-sqlite, transação + saveToStore aguardado: 5/5 rodadas duráveis
```

## Por que o `jeep-sqlite` não serve aqui

- **A transação não é durável por si.** O banco vive em memória (sql.js); o `COMMIT` só muda a memória. O dado só chega ao disco quando o banco **inteiro** é serializado e gravado no IndexedDB (`saveToStore`). Fechar a aba entre o commit e o fim desse despejo perde a transação — exatamente o caso "fechar o app um milissegundo depois" que a seção H.1 do plano promete cobrir. Aguardar o `saveToStore` em toda escrita funciona, mas o custo cresce com o tamanho do banco (cada registro regrava o arquivo todo) e a garantia passa a depender de nunca esquecer a chamada.
- **É frágil de montar.** O componente embute uma versão do sql.js e exige que o `sql-wasm.wasm` copiado à mão seja da mesma versão. Com o `sql.js` atual (1.16.0, e também 1.13.0) a página nem inicia: `LinkError: WebAssembly.instantiate(): Import #34 "a" "I": function import requires a callable`. Só funcionou com o `.wasm` da 1.12.0/1.11.0 (o arquivo em `e2e/durabilidade/sql-wasm.wasm` é o da 1.12.0, mantido só para reproduzir o experimento).

## Por que o SQLite WASM com `opfs-sahpool` serve

- É o SQLite de verdade gravando em arquivo: com `PRAGMA synchronous=FULL` o `COMMIT` só retorna depois do `flush()` dos *sync access handles* do OPFS. O teste confirma: 5/5 com o processo morto logo após a transação.
- `opfs-sahpool` não precisa dos cabeçalhos COOP/COEP (não usa `SharedArrayBuffer`), então funciona atrás do gateway e do `vite preview` sem configuração extra. Confirmado na prática: o cenário 5 do Playwright roda sobre o build de produção.
- O arquivo `.wasm` (879 kB, 412 kB com gzip) entra no *precache* do service worker: o app abre e grava sem rede.

## Limites conhecidos

- **Uma aba por vez.** A VFS abre os arquivos em modo exclusivo. O app pega um Web Lock (`medicalfield-banco-local`) na abertura; a segunda aba mostra "O app já está aberto em outra aba" em vez de abrir o banco (`src/plataforma.ts`).
- **Sem OPFS, não abre.** Navegador sem OPFS/sync access handle (ou com armazenamento bloqueado) recebe a tela "Não foi possível abrir o banco local". Não existe recuo para banco em memória: seria um "salvo" falso.
- **Janela anônima** tem OPFS, mas o navegador apaga tudo ao fechar a janela. É o comportamento do navegador, não do app.
- **O navegador pode despejar o armazenamento** de uma origem sob pressão de disco. O app chama `navigator.storage.persist()` na abertura, mas o navegador pode recusar (o Chrome costuma conceder a apps instalados).
- Medido só no Chrome para desktop. Edge usa o mesmo motor; Firefox e Safari não foram testados.
