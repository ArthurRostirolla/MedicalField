# Jaiminho

Serviço de documentos do MedicalField: gera a **ficha de atendimento em PDF** a partir do dado consolidado pela
DonaCida, guarda o PDF com código de verificação e hash de integridade, e **envia por e-mail** com retentativa.
Python 3.13 · FastAPI · psycopg 3 · WeasyPrint + Jinja2 · segno · aiosmtplib · PyJWT.

Contrato: [`docs/contratos.md`](../../docs/contratos.md) (seções 2, 3, 4 e 7). OpenAPI: [`openapi.yaml`](openapi.yaml).
Exemplo de ficha (dados fictícios): [`exemplos/ficha-exemplo.pdf`](exemplos/ficha-exemplo.pdf).

## Estrutura

```
src/jaiminho/
  http/        rotas, DTOs, middlewares (request-id → log de acesso → autenticação → handler), erros
  aplicacao/   casos de uso (gerar ficha, solicitar/reenviar envio) e o worker da fila
  dominio/     entidades, regras puras (hash canônico, código, backoff), interfaces (Repository, EnviadorEmail)
  infra/       SQL (psycopg), cliente da DonaCida, JWKS, SMTP, PDF (template em infra/pdf/), config, log
  montagem.py  injeção manual de dependências      __main__.py  API + porta de gestão no mesmo processo
```

A fila de e-mail é a tabela `documentos.envio_email` (`FOR UPDATE SKIP LOCKED`), consumida por um *worker*
assíncrono no próprio processo — sem broker. `EnviadorEmail` é um **Adapter**: `EnviadorEmailSmtp` em produção,
`EnviadorEmailFalso` nos testes.

## Rodar em desenvolvimento

O WeasyPrint precisa do Pango, que não roda nativamente no Windows: tudo roda em contêiner. No Git Bash, a partir
de `services/jaiminho` (com `scripts/dev-db.sh subir && scripts/dev-db.sh migrar` já feitos na raiz):

```bash
docker run -d --name medicalfield-dev-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit   # uma vez
docker build -t medicalfield/jaiminho .
docker run --rm --name medicalfield-dev-jaiminho -p 8083:8083 -p 9093:9093 \
  --read-only --tmpfs /tmp --cap-drop ALL \
  -e PORTA=8083 -e PORTA_GESTAO=9093 \
  -e DATABASE_URL=postgres://mf_jaiminho:dev_jaiminho@host.docker.internal:5544/medicalfield \
  -e JWKS_URL=http://host.docker.internal:9091/jwks.json \
  -e CLINICO_URL=http://host.docker.internal:8082 \
  -e URL_PUBLICA_PORTAL=http://localhost:5181/portal \
  -e SMTP_HOST=host.docker.internal -e SMTP_PORTA=1025 -e SMTP_SEGURANCA=nenhuma \
  -e "EMAIL_REMETENTE=MedicalField <nao-responda@medicalfield.local>" \
  -e PROXIES_CONFIAVEIS=127.0.0.1/32,::1/128,10.42.0.0/16,172.16.0.0/12 \
  medicalfield/jaiminho
curl http://localhost:9093/health/ready
```

`PROXIES_CONFIAVEIS` ganha `172.16.0.0/12` só em dev, porque o proxy do Vite chega pela rede do Docker.
E-mails enviados aparecem em <http://localhost:8025>.

Sem o MikeBaguncinha e a DonaCida no ar, `python -m tests.falsos 9999` (na imagem dev) sobe os dois falsos,
serve a ficha de exemplo para qualquer id e imprime um token válido por 1 h.

## Variáveis de ambiente

Comuns (contrato §4): `PORTA` (8080), `PORTA_GESTAO` (9090), `DATABASE_URL`\*, `JWKS_URL`\*, `PROXIES_CONFIAVEIS`,
`AMBIENTE`, `NIVEL_LOG`. Próprias (§7): `CLINICO_URL`\*, `URL_PUBLICA_PORTAL`\*, `SMTP_HOST`\*, `SMTP_PORTA`\*,
`SMTP_USUARIO`, `SMTP_SENHA`, `SMTP_SEGURANCA` (`nenhuma` | `starttls` | `tls`; padrão `nenhuma`),
`EMAIL_REMETENTE`\*, `EMAIL_BACKOFF_SEGUNDOS` (`60,300,900,3600`). \* obrigatória: sem ela o processo não sobe.

## Testes e lint

```bash
docker build --target dev -t medicalfield/jaiminho-dev .
bash ../../scripts/dev-db.sh criar-banco mf_teste_jaiminho && bash ../../scripts/dev-db.sh migrar mf_teste_jaiminho
MSYS_NO_PATHCONV=1 docker run --rm -v "$(cygpath -w "$PWD"):/app" -w /app \
  --network container:medicalfield-dev-pg medicalfield/jaiminho-dev sh -c "ruff check . && ruff format --check . && pytest"
```

Os testes de integração usam Postgres real (`TESTE_DATABASE_URL`, `TESTE_DATABASE_URL_ADMIN`), uma DonaCida e um
JWKS falsos servidos por HTTP de verdade e o SMTP falso. Outros comandos, na imagem dev com `PYTHONPATH=src`:
`python scripts/exportar_openapi.py` (regrava `openapi.yaml`) e `python exemplos/gerar_exemplo.py
[--enviar host:porta]` (regrava o PDF de exemplo e, opcionalmente, envia por SMTP).

## A ficha em PDF

Template em `src/jaiminho/infra/pdf/` (`ficha.html` + `ficha.css`), A4, com faixa "DADOS DEMONSTRATIVOS — SEM
VALIDADE CLÍNICA" e rodapé (código, QR, data de geração, paginação) em todas as páginas. Horários em
America/Sao_Paulo. O serviço **só exibe** o que foi registrado: nenhuma interpretação clínica.
Segue o design system do projeto (`DESIGN.md`, tema claro): tinta sobre papel branco, a passagem de caso na
"via rosa", violeta de marca só no nome, triagem como bloco chapado com forma + palavra, entradas da linha do tempo
numeradas (a retificação cita o nº que corrige). Tipografia: **Archivo** (texto) e **Martian Mono** (hora, nº da
entrada, código de verificação), SIL OFL 1.1, fontes variáveis embutidas na imagem no build (commit e sha256 fixos
no `Dockerfile`); nada é baixado em tempo de execução. No WeasyPrint os eixos `wght`/`wdth` são escolhidos com
`font-variation-settings` (ver o cabeçalho de `ficha.css`).

## Decisões e limites

- `ultimo_erro` guarda só a classe do erro (e o código SMTP): a mensagem do servidor pode citar o destinatário.
- `tentativas` conta todas as tentativas, inclusive a que deu certo; o reenvio manual zera o contador.
- O log de acesso pode perder até ~1 s de linhas se o processo morrer sem `SIGTERM` (aceito no plano, seção G).
- Entrega **ao menos uma vez**: se o processo morrer entre o SMTP aceitar e o `UPDATE`, o e-mail sai de novo
  (com o mesmo `Message-ID`).
