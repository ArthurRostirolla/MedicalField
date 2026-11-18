#!/usr/bin/env bash
# Backup do banco central (pg_dump formato custom) em deploy/backups/, mantendo os 7 mais novos.
# Na VM, agendado no cron:  15 3 * * * /opt/medicalfield/deploy/scripts/backup.sh agora
#
#   deploy/scripts/backup.sh [agora]      novo backup em deploy/backups/
#   deploy/scripts/backup.sh listar
set -euo pipefail
export MSYS_NO_PATHCONV=1

DEPLOY="$(cd "$(dirname "$0")/.." && pwd)"
DESTINO="$DEPLOY/backups"
cd "$DEPLOY"

case "${1:-agora}" in
  agora)
    mkdir -p "$DESTINO"
    arquivo="$DESTINO/medicalfield-$(date -u +%Y%m%dT%H%M%SZ).dump"
    docker compose exec -T postgres pg_dump -U postgres --format=custom medicalfield > "$arquivo.parcial"
    [ -s "$arquivo.parcial" ] || { rm -f "$arquivo.parcial"; echo "Dump vazio." >&2; exit 1; }
    mv "$arquivo.parcial" "$arquivo"
    ls -1t "$DESTINO"/medicalfield-*.dump | tail -n +8 | xargs -r rm -f
    ls -lh "$DESTINO"
    ;;
  listar) ls -lh "$DESTINO" ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
