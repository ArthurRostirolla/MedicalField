# MedicalField

Prontuário de emergência **Offline-First**: o profissional registra o atendimento no celular, com ou sem rede, e tudo sincroniza com o servidor quando a conexão volta. Trabalho final de Arquiteturas de Software (Univates, 2026/B). Todos os dados são fictícios.

## Acesso

- **Portal administrativo:** <https://177-44-248-60.sslip.io/portal/>
- **App do profissional** (navegador do computador ou do celular): <https://177-44-248-60.sslip.io/app/>
- **API:** `https://177-44-248-60.sslip.io/api/v1`

**Senha dos três usuários: `Demo#MedicalField26`**

| Usuário | Tipo de registro | Registro | UF |
| --- | --- | --- | --- |
| Dra. Helena Prado (**ADMIN**, vê tudo) | CRM | `100001` | RS |
| Enf. Caio Brandão | COREN | `200002` | RS |
| Soc. Lia Moura | SOCORRISTA | `300003` | — |

**Teste rápido:** no app, cadastre um paciente, ligue *Ajustes → Simular conectividade → Offline*, registre sinais vitais, volte para *Online* e veja o atendimento no portal, em *Atendimentos* e em *Auditoria → Logs dos aparelhos*.

## Documentos

**PDFs** (em [`docs/pdf/`](docs/pdf)):

- [01 · Arquitetura](docs/pdf/MedicalField-01-arquitetura.pdf): peças, rede e comunicação.
- [02 · APIs](docs/pdf/MedicalField-02-apis.pdf): resumo das rotas e da autenticação.
- [03 · Banco de dados](docs/pdf/MedicalField-03-banco.pdf): modelagem do banco central e do local.
- [04 · Roteiro de testes](docs/pdf/MedicalField-04-roteiro.pdf): os 17 passos do enunciado.
- [05 · Sincronização](docs/pdf/MedicalField-05-sincronizacao.pdf): offline, fila de envio e conflitos.
- [06 · Padrões de projeto](docs/pdf/MedicalField-06-patterns.pdf): os padrões e onde estão no código.
- [Guia completo da apresentação](docs/apresentacao/MedicalField-guia-completo.pdf): o sistema tela a tela.
- [Exemplo de ficha gerada](docs/testes/evidencias/roteiro/ficha-do-roteiro.pdf): PDF real emitido pelo sistema.
- [Enunciado](docs/enunciado-final_project_as_2026b.pdf).

**Referência** (Markdown):

- [API completa](docs/api/README.md): todas as 31 rotas com corpos de requisição e resposta, mais [OpenAPI](docs/api/openapi) e [coleção Postman](docs/api/medicalfield.postman_collection.json).
- [Arquitetura](docs/arquitetura/arquitetura.md), [sincronização](docs/arquitetura/sincronizacao.md), [segurança](docs/arquitetura/seguranca.md) e [padrões](docs/arquitetura/patterns.md).
- [Modelagem dos bancos](docs/dados/modelagem.md) e [roteiro de testes](docs/testes/roteiro-de-testes.md).
- [Operação da VM](docs/operacao) (instalação, deploy, backup, banco) e [problemas conhecidos](docs/KNOWN_ISSUES.md).

Os PDFs são gerados de [`docs/pdf/fontes/`](docs/pdf/fontes) com `node scripts/gerar-pdfs-docs.mjs`.

## Peças

| Peça | Função | Tecnologia |
| --- | --- | --- |
| [MikeBaguncinha](apps/mike-baguncinha) | Login, tokens e logs de auditoria | Go |
| [DonaCida](apps/dona-cida) | Pessoas, prontuários, atendimentos e sincronização | TypeScript (NestJS) |
| [Jaiminho](apps/jaiminho) | Ficha em PDF e envio por e-mail | Python (FastAPI) |
| [BradPitt](apps/brad-pitt) | Portal administrativo | React |
| [LuckyPatcher](apps/lucky-patcher) | App do profissional, com banco local | Expo / React Native |
| [deploy](deploy) | Gateway Traefik, PostgreSQL e Docker Compose | Docker |

## Rodar localmente

Com Docker e Git Bash, na raiz do repositório:

```bash
bash deploy/scripts/segredos.sh && cd deploy && docker compose up -d --build
```

Portal em <http://127.0.0.1:8088/portal/>, app em <http://127.0.0.1:8088/app/>. No celular via Expo Go: `npm install && npm run tunel -w @medicalfield/lucky-patcher` ([detalhes](apps/lucky-patcher/docs/nativo.md)).

## Testes

```bash
export MF_SENHA_DEMO='Demo#MedicalField26'
npm run roteiro -w @medicalfield/e2e                                                         # os 17 passos do enunciado
npx newman run docs/api/medicalfield.postman_collection.json --env-var senha=$MF_SENHA_DEMO  # as rotas da API
```

Os testes de cada peça estão no README dela.

## Banco de dados

O PostgreSQL da VM não fica exposto. Acesso por SSH: `cd /opt/medicalfield/deploy && sudo docker compose exec postgres psql -U postgres -d medicalfield`. As tabelas ficam nos schemas `auditoria`, `clinico`, `documentos` e `identidade`, não no `public`.
