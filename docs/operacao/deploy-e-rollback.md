# Deploy e rollback

> **Situação:** o fluxo na VM está a validar — ainda não executado lá.

## Como uma versão chega à VM

1. *Push* em `main` → GitHub Actions (`.github/workflows/ci.yml`) roda os testes dos três serviços, dos pacotes npm e valida os dois modos do Compose (`docker compose config`).
2. Passou → BuildKit constrói 5 imagens e publica no GHCR com as tags `<sha do commit>` e `latest`: `medicalfield-mike-baguncinha`, `-dona-cida`, `-jaiminho`, `-web` e `-migracoes`.
3. Na VM, alguém puxa a versão (abaixo). Não há implantação automática: o CI nunca recebe credencial da VM.
4. Os serviços `migra-*` rodam `dbmate up` como administrador do banco; cada serviço só sobe depois que a sua migração termina com sucesso (`service_completed_successfully`). Há uma breve indisponibilidade enquanto o contêiner é recriado — uma réplica por serviço.

### Migrações: por que uma imagem `migracoes`

`deploy/migracoes/Dockerfile` empacota o `dbmate` com `apps/*/migrations` em `/migracoes/<servico>`. Ela leva **a mesma tag** das imagens dos serviços, então a migração chega junto com a versão que precisa dela, sem montar o repositório no contêiner. Cada serviço usa a sua tabela de controle (`identidade.`, `clinico.`, `documentos.schema_migrations`), igual ao `scripts/dev-db.sh`. O serviço em si conecta com o papel restrito (`mf_mike`, `mf_cida`, `mf_jaiminho`).

## Atualizar

```bash
cd /opt/medicalfield/deploy
git pull && docker compose pull && docker compose up -d
```

O `git pull` traz mudanças no `compose.yaml`, nas rotas do gateway e nos scripts; as imagens vêm do `pull`.

## Acompanhar

```bash
docker compose ps -a
docker compose logs migra-cida             # o que a migração fez
docker compose logs -f dona-cida
```

## Rollback

Em `deploy/.env`, troque `MF_TAG=latest` pelo SHA (completo) de um commit anterior de `main` e:

```bash
docker compose pull && docker compose up -d
```

Para voltar a acompanhar `main`, devolva `MF_TAG=latest`.

As migrações são só aditivas (nunca `dbmate down` em produção): a versão anterior continua funcionando com o schema novo. Se uma migração quebrou dado, o caminho é [restaurar o backup](backup-e-recuperacao.md).

## Mudar configuração

- Edite `deploy/.env` (URL pública, SMTP, segredos) e rode `docker compose up -d`: o Compose recria só os contêineres afetados.
- Senha de banco é caso à parte: [troubleshooting.md](troubleshooting.md#trocar-a-senha-de-um-papel-do-banco).

## Local (testar antes de mandar para `main`)

```bash
deploy/scripts/segredos.sh
cd deploy && docker compose up -d --build    # http://localhost:8088/portal/
docker compose down                          # mantém os dados; "down -v" apaga tudo
```

O modo local constrói as imagens com a tag `:dev`, entrega o e-mail no Mailpit e atende só em HTTP.
