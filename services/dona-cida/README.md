# DonaCida — núcleo clínico e sincronização

Backend Core do MedicalField: NestJS + Kysely/`pg` + `jose`. Contrato: [`docs/contratos.md`](../../docs/contratos.md) (seções 2, 3, 4 e 6). API gerada em [`openapi.yaml`](openapi.yaml).

**DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA.** O serviço não interpreta valor clínico nenhum.

## Rodar em desenvolvimento

```bash
# na raiz do repositório
bash scripts/dev-db.sh subir && bash scripts/dev-db.sh migrar      # Postgres em localhost:5544
npm install
cp services/dona-cida/.env.example services/dona-cida/.env        # portas 8082 / 9092
npm run dev -w @medicalfield/dona-cida
curl http://localhost:9092/health/ready
```

`JWKS_URL` aponta para a porta de gestão do MikeBaguncinha. O serviço sobe sem ele; enquanto estiver fora, as rotas respondem 503.

| Comando (`-w @medicalfield/dona-cida`) | O que faz |
| --- | --- |
| `npm run dev` | empacota e sobe com as variáveis de `.env` |
| `npm run build` | `dist/main.mjs` (um arquivo, com os pacotes `@medicalfield/*` e as dependências) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | unitários + integração |
| `npm run openapi` | regenera `openapi.yaml` a partir de `@medicalfield/contratos` |

## Testes

A integração usa Postgres real, num banco isolado, e sobe a aplicação inteira; o emissor do token é um par Ed25519 gerado na hora, servido por um JWKS local (não depende do MikeBaguncinha).

```bash
bash scripts/dev-db.sh criar-banco mf_teste_cida && bash scripts/dev-db.sh migrar mf_teste_cida
npm test -w @medicalfield/dona-cida
```

Outro banco: `TESTE_DATABASE_URL` (papel `mf_cida`) e `TESTE_DATABASE_URL_ADMIN`.

## Imagem

O contexto de build é a **raiz** do repositório:

```bash
docker build -f services/dona-cida/Dockerfile -t medicalfield/dona-cida .
```

A imagem final tem o Node e um arquivo; roda como `node` (uid 1000), não escreve em disco (`--read-only`) e encerra em `SIGTERM` terminando as requisições, descarregando o log de acesso e fechando o banco.

## Estrutura

```
src/
  http/        controllers finos, cadeia (request-id → log de acesso → autenticação), filtro de erros, porta de gestão
  aplicacao/   casos de uso; `comando.ts` é o receptor idempotente (dado + operacao_sync + auditoria_clinica numa transação)
  dominio/     estratégias de conflito (Strategy), relógio, hash canônico, erros, interfaces dos repositórios
  infra/       SQL (Kysely), JWKS, configuração, log
migrations/    dbmate; 000250 é a carga de demonstração
```

| Dado | Estratégia (`dominio/conflito`) |
| --- | --- |
| eventos, itens de prontuário | `UniaoImutavel` |
| pessoa | `CampoMaisRecente` (por campo, contra `carimbos_campos`) |
| medicamento | `ServidorVence` |
| pessoa provavelmente duplicada | `RevisaoManual` (aceita e preenche `possivelDuplicataDe`) |

## Decisões onde o contrato não é explícito

- `PATCH /pessoa/{id}` e `POST /prontuario-item/{id}/inativacao` respondem **200** (alteram, não criam), inclusive na primeira vez com `Idempotency-Key`.
- Id do próprio caminho inexistente (`PATCH /pessoa/{id}`, inativação, GETs) → **404**; referência no corpo inexistente (`pessoaId`, `atendimentoId`, `retificaEventoId`) → **422**.
- `POST /prontuario` para quem já tem prontuário une os itens e só **preenche** `tipoSanguineo`/`observacoes` que estiverem vazios — nunca sobrescreve.
- `medicamentoId` que o catálogo não conhece não rejeita o evento: ele é gravado como "fora do catálogo".
- `X-Dispositivo-Id` malformado é ignorado (vira nulo); `Idempotency-Key` malformada → 422.
- CPF: 11 dígitos sem pontuação, sem conferir dígito verificador. CNS: 15 dígitos.
- `GET /atendimento/{pessoaId}` também é paginado e traz `pessoaNome`.
- Empate de `editadoEm` com o carimbo do campo mantém o valor do servidor.
