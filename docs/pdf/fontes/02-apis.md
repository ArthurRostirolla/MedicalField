---
titulo: Documentação das APIs
sub: Como autenticar e chamar as rotas dos três serviços.
---

## Diagrama principal: login e chamada autenticada

{{svg login}}

## Como usar

- **Endereço base:** `https://177-44-248-60.sslip.io/api/v1` (na máquina local, `http://localhost:8088/api/v1`).
- **Autenticação:** só o **login é público**. Todas as outras rotas pedem o cabeçalho `Authorization: Bearer <accessToken>`. Sem token, a resposta é `401`.
- **Formato:** JSON na entrada e na saída. Todo erro tem o mesmo corpo: `{ codigo, mensagem, detalhes, requestId }`.
- **Sem duplicação:** as rotas de cadastro aceitam o cabeçalho `Idempotency-Key`. Repetir o mesmo pedido devolve o registro já criado.
- **Testar:** a coleção Postman está em `docs/api/medicalfield.postman_collection.json` (também abre no Insomnia).

## Principais endpoints

| Método | Rota | Serviço | O que faz |
| --- | --- | --- | --- |
| POST | `/auth/login` | Mike | Autentica e devolve o token. **Única rota pública.** |
| POST | `/log` | Mike | Recebe os logs que o app gerou enquanto estava offline. |
| GET | `/auditoria/acesso` | Mike | Log de acesso de todos os serviços (só ADMIN). |
| GET | `/medicamento` | Cida | Lista os medicamentos. |
| POST | `/pessoa` | Cida | Cadastra uma pessoa. |
| GET | `/prontuario` | Cida | Prontuários de todas as pessoas. |
| GET | `/prontuario/{pessoaId}` | Cida | Prontuário de uma pessoa. |
| POST | `/prontuario` | Cida | Cadastra um prontuário. |
| GET | `/atendimento/{pessoaId}` | Cida | Atendimentos de uma pessoa. |
| POST | `/atendimento` | Cida | Cadastra um atendimento. |
| POST | `/atendimento-evento` | Cida | Registra sinais vitais, Glasgow, triagem, medicação etc. |
| GET | `/sync/alteracoes` | Cida | Envia ao app o que mudou desde a última sincronização. |
| POST | `/documento/ficha-atendimento` | Jaiminho | Gera a ficha de atendimento em PDF. |
| GET | `/documento/{id}/pdf` | Jaiminho | Baixa o PDF. |
| POST | `/documento/{id}/email` | Jaiminho | Envia o PDF por e-mail (fila; responde `202`). |

São **30 rotas** no total. A lista completa, com todos os campos, está nos contratos OpenAPI em `docs/api/openapi/`.

## Códigos de resposta

| Código | Quando |
| --- | --- |
| `200` / `201` | Sucesso (`200` também quando um cadastro repetido devolve o registro existente) |
| `202` | Pedido aceito para processamento depois (envio de e-mail) |
| `401` | Sem token, token inválido ou expirado |
| `403` | Sem permissão (rota só para ADMIN) |
| `404` | Registro não encontrado |
| `422` | Dados inválidos |
| `429` | Muitas tentativas de login (limite de 10 por minuto por IP) |
