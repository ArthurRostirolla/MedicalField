#!/usr/bin/env bash
# Banco de desenvolvimento do MedicalField (Postgres em contêiner, porta 5544).
# NAO e o mecanismo de implantacao (isso e Kubernetes, em deploy/): serve so para rodar e testar local.
#
#   scripts/dev-db.sh subir                 sobe o Postgres e prepara o banco "medicalfield"
#   scripts/dev-db.sh criar-banco <nome>    cria um banco extra (ex.: testes de um servico) ja com schemas
#   scripts/dev-db.sh migrar [banco]        aplica as migracoes dos 3 servicos (padrao: medicalfield)
#   scripts/dev-db.sh psql [banco]          abre o psql como administrador
#   scripts/dev-db.sh derrubar              remove o contêiner E os dados
set -euo pipefail
export MSYS_NO_PATHCONV=1

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
CONTAINER=medicalfield-dev-pg
PORTA=5544
SENHA_ADMIN=dev_admin
BANCO_PADRAO=medicalfield

caminho_docker() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else echo "$1"; fi; }

sql() { docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d "$1"; }

criar_papeis() {
  sql postgres <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mf_mike') THEN CREATE ROLE mf_mike LOGIN PASSWORD 'dev_mike'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mf_cida') THEN CREATE ROLE mf_cida LOGIN PASSWORD 'dev_cida'; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'mf_jaiminho') THEN CREATE ROLE mf_jaiminho LOGIN PASSWORD 'dev_jaiminho'; END IF;
END $$;
SQL
}

criar_banco() {
  local banco="$1"
  if ! docker exec "$CONTAINER" psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$banco'" | grep -q 1; then
    docker exec "$CONTAINER" createdb -U postgres "$banco"
  fi
  sql "$banco" < "$RAIZ/deploy/db/schemas.sql"
  # Desenvolvimento sempre usa os dados ficticios de demonstracao (ver migracoes *_demo.sql).
  docker exec "$CONTAINER" psql -q -U postgres -d postgres -c "ALTER DATABASE \"$banco\" SET medicalfield.dados_demo = 'on'"
}

migrar_servico() {
  local servico="$1" schema="$2" banco="$3"
  docker run --rm --network "container:$CONTAINER" \
    -v "$(caminho_docker "$RAIZ/apps/$servico/migrations"):/db/migrations" \
    -e DATABASE_URL="postgres://postgres:$SENHA_ADMIN@localhost:5432/$banco?sslmode=disable" \
    ghcr.io/amacneil/dbmate:2 --migrations-table "$schema.schema_migrations" --no-dump-schema up
}

case "${1:-}" in
  subir)
    if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
      docker run -d --name "$CONTAINER" -p "$PORTA:5432" -e POSTGRES_PASSWORD="$SENHA_ADMIN" postgres:17-alpine >/dev/null
    else
      docker start "$CONTAINER" >/dev/null
    fi
    until docker exec "$CONTAINER" pg_isready -U postgres -q; do sleep 1; done
    criar_papeis
    criar_banco "$BANCO_PADRAO"
    echo "Postgres de desenvolvimento em localhost:$PORTA (banco $BANCO_PADRAO)"
    ;;
  criar-banco) criar_banco "${2:?informe o nome do banco}" ;;
  migrar)
    banco="${2:-$BANCO_PADRAO}"
    migrar_servico mike-baguncinha identidade "$banco"
    migrar_servico dona-cida clinico "$banco"
    migrar_servico jaiminho documentos "$banco"
    ;;
  psql) docker exec -it "$CONTAINER" psql -U postgres -d "${2:-$BANCO_PADRAO}" ;;
  derrubar) docker rm -f "$CONTAINER" ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
