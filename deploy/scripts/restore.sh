#!/usr/bin/env bash
# Restaura o banco do cluster (contexto atual do kubectl) a partir de um dump do pg_dump
# (formato custom). SUBSTITUI o conteudo atual, em uma unica transacao: ou restaura tudo,
# ou nao muda nada. Os papeis mf_* precisam existir (o init do Postgres os cria).
#
#   deploy/scripts/restore.sh --sim                        o backup mais recente do volume
#   deploy/scripts/restore.sh --sim medicalfield-X.dump    um backup do volume, pelo nome
#   deploy/scripts/restore.sh --sim ./copia.dump           um arquivo local (de "backup.sh exportar")
set -euo pipefail
export MSYS_NO_PATHCONV=1
NAMESPACE=medicalfield

if [ "${1:-}" != "--sim" ]; then sed -n '2,8p' "$0"; echo "Passe --sim para confirmar: a restauracao apaga os dados atuais." >&2; exit 1; fi
origem="${2:-}"

no_pod() { kubectl -n "$NAMESPACE" exec -i postgres-0 -c postgres -- "$@"; }
RESTAURAR=(pg_restore -U postgres -d medicalfield --clean --if-exists --single-transaction --exit-on-error)

if [ -n "$origem" ] && [ -f "$origem" ]; then
  echo "Restaurando do arquivo local $origem"
  no_pod "${RESTAURAR[@]}" < "$origem"
else
  if [ -z "$origem" ]; then
    origem="$(no_pod sh -c 'ls -1t /backups/medicalfield-*.dump 2>/dev/null | head -n 1')"
    [ -n "$origem" ] || { echo "Nenhum backup no volume." >&2; exit 1; }
  else
    origem="/backups/$(basename "$origem")"
  fi
  echo "Restaurando do volume: $origem"
  no_pod "${RESTAURAR[@]}" "$origem"
fi

no_pod psql -U postgres -d medicalfield -Atc \
  "SELECT 'tabelas restauradas: ' || count(*) FROM information_schema.tables WHERE table_schema IN ('identidade','auditoria','clinico','documentos')"
echo "Restauracao concluida. Os servicos reconectam sozinhos; nao e preciso reinicia-los."
