---
titulo: Modelagem dos bancos de dados
sub: Banco central no servidor e banco local no app (persistência dual).
---

## Diagrama principal: banco central (as 14 tabelas, por schema)

{{svg banco-central}}

Uma **pessoa** tem um **prontuário** (com seus itens) e pode receber vários **atendimentos**. Cada atendimento é uma **linha do tempo de eventos**: sinais vitais, Glasgow, triagem, medicação, procedimento e observação. Eventos **nunca são apagados nem alterados**; uma correção é um novo evento. Do atendimento sai a **ficha em PDF**, que pode ser enviada por e-mail.

## Banco central — PostgreSQL

Um único banco, dividido em **quatro schemas**. Cada serviço tem um usuário de banco próprio e só enxerga o que é dele.

| Schema | Dono | Tabelas |
| --- | --- | --- |
| `identidade` | MikeBaguncinha | `profissional` (login e senha com hash), `sessao` |
| `auditoria` | MikeBaguncinha | `log_acesso` (cada requisição de todos os serviços), `log_cliente` (logs vindos do app) |
| `clinico` | DonaCida | `medicamento`, `pessoa`, `prontuario`, `prontuario_item`, `atendimento`, `atendimento_evento`, `operacao_sync`, `auditoria_clinica` |
| `documentos` | Jaiminho | `documento` (PDF e código de verificação), `envio_email` (fila de envio) |

- **Sem chave estrangeira entre schemas:** um serviço guarda só o id do dado do outro. Assim cada serviço fica independente.
- **`operacao_sync`** guarda o id de cada comando recebido do app. É o que impede duplicar um registro reenviado.
- **Logs e eventos são somente inserção:** o usuário do serviço não tem permissão de `UPDATE` nem `DELETE` neles.
- **Inserção manual:** medicamentos são cadastrados direto no banco por SQL (passo 9 do roteiro).

## Banco local — SQLite no app

O app guarda uma **cópia dos dados** para funcionar offline: no navegador, SQLite gravando em arquivo (OPFS); no Android/iOS, SQLite **cifrado** (SQLCipher).

| Tabela | Para quê |
| --- | --- |
| `medicamento`, `pessoa`, `prontuario`, `prontuario_item` | Cópia do servidor, para consultar sem rede |
| `atendimento`, `atendimento_evento` | Registros feitos no aparelho |
| `outbox` | **Fila de envio:** cada alteração vira um comando à espera de rede |
| `log_local` | Logs gerados offline, enviados depois por `POST /log` |
| `sync_estado` | Até onde o app já recebeu do servidor (cursor) |

{{svg outbox}}

Cada registro local tem um `estado_sync`: **LOCAL** (ainda não confirmado pelo servidor) ou **CONFIRMADO**. Na `outbox`, cada comando vai de **PENDENTE** a **ENVIANDO** e termina **CONFIRMADA** (2xx). Se o servidor recusar (4xx), fica **REJEITADA** e aparece na tela de Pendências para corrigir ou descartar.
