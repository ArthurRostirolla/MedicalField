# @medicalfield/dominio

Funções puras (sem I/O), usadas igualmente pela DonaCida, pelo portal e pelo app. Nenhuma interpreta valor clínico: só organizam o que foi registrado.

| Função | O que faz |
| --- | --- |
| `calcularTotalGlasgow({ ocular, verbal, motora })` | Soma dos três componentes. |
| `ordenarLinhaDoTempo(eventos)` | Cópia ordenada por `ocorridoEm`; empate decide pelo `id`. |
| `calcularResumo(eventos, itensProntuario)` | A passagem de caso — exatamente o tipo `Resumo` do contrato. |

Regras de `calcularResumo`:

- evento retificado COM `dadosCorrigidos` aparece com os valores corrigidos sobre os originais; SEM `dadosCorrigidos`, deixa de contar em todas as seções (últimos sinais vitais, Glasgow, triagem, medicações, procedimentos, encerramento);
- item de prontuário inativado não entra;
- aceita tanto o `Evento` vindo do servidor quanto o evento local ainda não sincronizado (só usa `id`, `tipo`, `ocorridoEm`, `dados`, `retificaEventoId`).

Limite conhecido: retificação é de um nível — retificar uma `RETIFICACAO` não devolve o evento original ao resumo.

Consumo: igual ao de `@medicalfield/contratos` — `exports` aponta para o fonte TypeScript, **sem build** (ver o README de lá).

```bash
npm run typecheck -w @medicalfield/dominio
npm test -w @medicalfield/dominio
```
