#!/usr/bin/env bash
# Sobe os tres servicos backend em conteineres para desenvolvimento local, contra o Postgres de dev.
# NAO e o mecanismo de implantacao (isso e o docker compose de deploy/).
#
#   scripts/dev-servicos.sh subir [--construir]   constroi (se pedido ou faltar imagem) e sobe os tres + Mailpit
#   scripts/dev-servicos.sh parar
#   scripts/dev-servicos.sh status
#
# Portas no host: Mike 8081/9091 · Cida 8082/9092 · Jaiminho 8083/9093 · Mailpit 1025/8025
set -euo pipefail
export MSYS_NO_PATHCONV=1
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"

# Em dev as requisicoes chegam pela rede do Docker (proxy do Vite), por isso 172.16.0.0/12.
PROXIES="127.0.0.1/32,::1/128,10.42.0.0/16,172.16.0.0/12"
BANCO="host.docker.internal:5544/medicalfield"
JWKS="http://host.docker.internal:9091/jwks.json"

construir() {
  docker build -q -t medicalfield/mike-baguncinha:dev apps/mike-baguncinha
  docker build -q -f apps/dona-cida/Dockerfile -t medicalfield/dona-cida:dev .
  docker build -q -t medicalfield/jaiminho:dev apps/jaiminho
}

tem_imagem() { docker image inspect "$1" >/dev/null 2>&1; }

esperar() { # nome porta_gestao
  for _ in $(seq 1 40); do
    if curl -fs "http://localhost:$2/health/ready" >/dev/null 2>&1; then echo "  $1 pronto"; return 0; fi
    sleep 1
  done
  echo "  $1 NAO ficou pronto"; docker logs --tail 20 "$1"; return 1
}

case "${1:-}" in
  subir)
    if [ "${2:-}" = "--construir" ] || ! tem_imagem medicalfield/mike-baguncinha:dev \
       || ! tem_imagem medicalfield/dona-cida:dev || ! tem_imagem medicalfield/jaiminho:dev; then
      construir
    fi
    docker rm -f mike-baguncinha dona-cida jaiminho >/dev/null 2>&1 || true
    if ! docker ps --format '{{.Names}}' | grep -qx medicalfield-dev-mailpit; then
      docker start medicalfield-dev-mailpit >/dev/null 2>&1 \
        || docker run -d --name medicalfield-dev-mailpit -p 1025:1025 -p 8025:8025 axllent/mailpit >/dev/null
    fi
    docker run -d --name mike-baguncinha --read-only -p 8081:8080 -p 9091:9090 \
      -e DATABASE_URL="postgres://mf_mike:dev_mike@$BANCO?sslmode=disable" \
      -e PROXIES_CONFIAVEIS="$PROXIES" medicalfield/mike-baguncinha:dev >/dev/null
    esperar mike-baguncinha 9091
    docker run -d --name dona-cida --read-only -p 8082:8080 -p 9092:9090 \
      -e DATABASE_URL="postgres://mf_cida:dev_cida@$BANCO" -e JWKS_URL="$JWKS" \
      -e JAIMINHO_URL="http://host.docker.internal:8083" \
      -e PROXIES_CONFIAVEIS="$PROXIES" medicalfield/dona-cida:dev >/dev/null
    esperar dona-cida 9092
    docker run -d --name jaiminho --read-only --tmpfs /tmp -p 8083:8080 -p 9093:9090 \
      -e DATABASE_URL="postgres://mf_jaiminho:dev_jaiminho@$BANCO" -e JWKS_URL="$JWKS" \
      -e CLINICO_URL="http://host.docker.internal:8082" \
      -e URL_PUBLICA_PORTAL="http://localhost:5181/portal" \
      -e SMTP_HOST=host.docker.internal -e SMTP_PORTA=1025 \
      -e EMAIL_REMETENTE="MedicalField <nao-responda@medicalfield.local>" \
      -e EMAIL_BACKOFF_SEGUNDOS="${EMAIL_BACKOFF_SEGUNDOS:-60,300,900,3600}" \
      -e PROXIES_CONFIAVEIS="$PROXIES" medicalfield/jaiminho:dev >/dev/null
    esperar jaiminho 9093
    ;;
  parar) docker rm -f mike-baguncinha dona-cida jaiminho >/dev/null 2>&1 || true ;;
  status) docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E 'mike-baguncinha|dona-cida|jaiminho|medicalfield-dev' ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
