---
titulo: Arquitetura, rede e comunicação
sub: Como as peças do MedicalField se conectam e conversam entre si.
---

## Diagrama principal

{{svg arquitetura}}

## Como funciona

1. **O profissional registra no app**, com ou sem internet. Tudo é gravado primeiro no **banco local (SQLite)** e cada alteração entra numa **fila de envio (outbox)**.
2. **Quando a rede volta**, o app percebe sozinho e envia a fila para o servidor, um comando por vez. Cada comando tem um id único, então reenviar **nunca duplica** o registro.
3. **O app também recebe novidades** do servidor (medicamentos, pacientes), pedindo só o que mudou desde a última vez.
4. **O portal** consulta os dados, gera a **ficha em PDF** e **envia por e-mail**.

## Quem faz o quê

| Peça | Linguagem | Responsabilidade |
| --- | --- | --- |
| **Gateway** | Traefik | Única porta de entrada. Encaminha cada rota ao serviço certo pelo prefixo da URL. |
| **MikeBaguncinha** | Go | Login por CRM, COREN ou ID de socorrista; emite o token (JWT); guarda os logs de acesso. |
| **DonaCida** | TypeScript (NestJS) | Pessoas, prontuários, atendimentos e medicamentos; recebe a sincronização sem duplicar. |
| **Jaiminho** | Python (FastAPI) | Gera a ficha em PDF e envia por e-mail, com fila e novas tentativas. |
| **PostgreSQL** | — | Banco central. Cada serviço só acessa a própria parte (schema). |
| **LuckyPatcher** | React Native (Expo) | App de campo com banco local e chave **Simular offline**. |
| **BradPitt** | React | Portal administrativo: consulta, PDF e e-mail. |

## Rede e comunicação

{{svg rede-compose}}

- **Tudo passa pelo gateway.** App e portal só conhecem um endereço (`https://…/api/v1/...`); os serviços não ficam expostos.
- **Duas redes internas:** `app` (gateway e serviços) e `banco` (serviços e PostgreSQL, **sem acesso à internet**).
- **Cada serviço valida o token sozinho**, com a chave pública do MikeBaguncinha guardada em cache. Se o login cair, quem já entrou continua trabalhando.
- **O e-mail é assíncrono:** o pedido entra numa fila no banco e é enviado em segundo plano. Uma falha de SMTP não derruba a tela.
- **Todo serviço registra cada requisição** (data/hora, IP, profissional, método, rota, status e tempo em ms).
