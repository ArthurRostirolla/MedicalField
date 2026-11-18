---
titulo: Roteiro de testes
sub: Os 17 passos do enunciado, do login ao e-mail com a ficha em anexo.
---

## Diagrama principal: offline e sincronização (passos 12–15)

{{svg sync-offline}}

## Antes de começar

| O quê | Endereço | Usuário |
| --- | --- | --- |
| Portal | `https://177-44-248-60.sslip.io/portal/` | Dra. Helena Prado — CRM `100001`/RS (ADMIN) |
| App | `https://177-44-248-60.sslip.io/app/` | Enf. Caio Brandão — COREN `200002`/RS |
| Caixa de e-mail (Mailpit) | túnel SSH para `127.0.0.1:18025` | — |

Na máquina local, troque o endereço por `http://localhost:8088` e use o Mailpit em `http://localhost:18025`. A senha de demonstração está em `apps/mike-baguncinha/README.md`.

## Os 17 passos

| # | Passo | Onde | Resultado esperado |
| --- | --- | --- | --- |
| 1 | Portal: autenticar | Portal, tela de entrada | Abre o livro de atendimentos com o nome da administradora |
| 2 | Portal: listar cadastros | Portal → Medicamentos | Catálogo listado |
| 3 | Portal: listar prontuários | Portal → Prontuários | Prontuários listados |
| 4 | Portal: listar atendimentos | Portal → Atendimentos | Lista exibida (anote o total) |
| 5 | App: autenticar | App, tela Entrar | Tela Início, indicador **Online** |
| 6 | App: receber dados | Início → Sincronizar agora | Medicamentos e pacientes no aparelho |
| 7 | App online: registrar atendimento | Pacientes → paciente → Iniciar atendimento | "Tudo enviado" |
| 8 | Portal: ver o atendimento | Atendimentos → Atualizar | Atendimento do passo 7 no topo |
| 9 | Inserir medicamento pelo banco | `psql` no servidor (comando abaixo) | `INSERT 0 1`; aparece no portal |
| 10 | Portal: listar atendimentos | Atendimentos → Atualizar | Sem mudança |
| 11 | App: receber dados | Início → Sincronizar agora | Medicamento do passo 9 no aparelho |
| 12 | App **offline**: pessoa, prontuário e atendimento | Ligar a chave **Simular offline** | Itens ficam pendentes; nada vai ao servidor |
| 13 | Portal: cadastro novo **não** aparece | Prontuários e Atendimentos | Ausente |
| 14 | App online: sincronizar | Desligar a chave | A fila esvazia; repetir não duplica |
| 15 | Portal: cadastro novo aparece | Prontuários e Atendimentos | Presente |
| 16 | Gerar a ficha | Atendimento → Gerar PDF | PDF baixado |
| 17 | E-mail com a ficha | Atendimento → Enviar por e-mail | "Enviado"; mensagem com o PDF em anexo no Mailpit |

**Passo 9**, no servidor (pasta `deploy`; na VM, prefixe com `sudo`):

```bash
docker compose exec -T postgres psql -U postgres -d medicalfield -c \
  "INSERT INTO clinico.medicamento (nome, principio_ativo, apresentacao)
   VALUES ('Medicamento Roteiro AULA1', 'principio demonstrativo', 'ampola 1 mL')
   RETURNING id, nome, seq;"
```

## O que cada fase prova

- **Passos 5–8:** o app e o portal conversam com o mesmo servidor.
- **Passos 9–11:** um dado inserido direto no banco chega ao app na próxima sincronização.
- **Passos 12–15:** **Offline-First**. O app funciona sem rede, guarda tudo numa fila e envia quando a conexão volta, sem duplicar.
- **Passos 16–17:** a ficha em PDF e o envio por e-mail funcionam.

O roteiro também roda automatizado (`e2e/roteiro.spec.ts`) e passou **17 de 17** na VM em 18/11/2026.
