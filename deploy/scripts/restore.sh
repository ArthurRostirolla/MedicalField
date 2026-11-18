#!/usr/bin/env bash
# Restaura o banco central a partir de um dump do pg_dump (formato custom). SUBSTITUI o conteudo
# atual, em uma unica transacao: ou restaura tudo, ou nao muda nada. Os papeis mf_* precisam
# existir (o init do Postgres os cria).
#
#   deploy/scripts/restore.sh --sim                  o backup mais recente de deploy/backups/
#   deploy/scripts/restore.sh --sim ./copia.dump     um arquivo especifico
set -euo pipefail
export MSYS_NO_PATHCONV=1

DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"

if [ "${1:-}" != "--sim" ]; then sed -n '2,7p' "$0"; echo "Passe --sim para confirmar: a restauracao apaga os dados atuais." >&2; exit 1; fi
origem="${2:-$(ls -1t "$DEPLOY"/backups/medicalfield-*.dump 2>/dev/null | head -n 1)}"
[ -f "$origem" ] || { echo "Backup nao encontrado: ${origem:-deploy/backups/ vazio}" >&2; exit 1; }
origem="$(cd "$(dirname "$origem")" && pwd)/$(basename "$origem")"
cd "$DEPLOY"

no_banco() { docker compose exec -T postgres "$@"; }

echo "Restaurando de $origem"
no_banco pg_restore -U postgres -d medicalfield --clean --if-exists --single-transaction --exit-on-error < "$origem"

# O cursor de sincronizacao dos apps nao pode voltar: avanca a sequencia bem alem do restaurado.
no_banco psql -U postgres -d medicalfield -Atc \
  "SELECT 'cursor de sincronizacao avancado para: ' || setval('clinico.seq_alteracao', (SELECT last_value FROM clinico.seq_alteracao) + 1000000)"
no_banco psql -U postgres -d medicalfield -Atc \
  "SELECT 'tabelas restauradas: ' || count(*) FROM information_schema.tables WHERE table_schema IN ('identidade','auditoria','clinico','documentos')"
echo "Restauracao concluida. Os servicos reconectam sozinhos; nao e preciso reinicia-los."
