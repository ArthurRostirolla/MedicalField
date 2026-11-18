#!/usr/bin/env bash
# Backup do banco do cluster (contexto atual do kubectl).
#
#   deploy/scripts/backup.sh                    dispara o CronJob agora e lista o volume de backups
#   deploy/scripts/backup.sh listar             lista os backups guardados no volume
#   deploy/scripts/backup.sh exportar <arquivo> pg_dump direto para um arquivo FORA do cluster
set -euo pipefail
export MSYS_NO_PATHCONV=1
NAMESPACE=medicalfield

listar() { kubectl -n "$NAMESPACE" exec postgres-0 -c postgres -- ls -lh /backups; }

case "${1:-agora}" in
  agora)
    job="backup-manual-$(date -u +%Y%m%d%H%M%S)"
    kubectl -n "$NAMESPACE" create job "$job" --from=cronjob/backup
    if ! kubectl -n "$NAMESPACE" wait --for=condition=complete "job/$job" --timeout=300s; then
      kubectl -n "$NAMESPACE" logs "job/$job" --tail=50 || true
      echo "Backup falhou (job $job)." >&2; exit 1
    fi
    listar
    ;;
  listar) listar ;;
  exportar)
    destino="${2:?informe o arquivo de destino}"
    kubectl -n "$NAMESPACE" exec postgres-0 -c postgres -- pg_dump -U postgres --format=custom medicalfield > "$destino"
    [ -s "$destino" ] || { echo "Dump vazio." >&2; exit 1; }
    ls -lh "$destino"
    ;;
  *) sed -n '2,6p' "$0"; exit 1 ;;
esac
