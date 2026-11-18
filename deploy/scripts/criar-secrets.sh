#!/usr/bin/env bash
# Cria (ou atualiza) os Secrets do namespace medicalfield a partir de um arquivo .env NAO
# versionado. O que estiver vazio e gerado e gravado de volta no arquivo. Idempotente.
# Usa o contexto atual do kubectl (KUBECONFIG).
#
#   deploy/scripts/criar-secrets.sh [arquivo]        (padrao: deploy/secrets.env)
#
# Secrets criados:
#   postgres-credenciais      POSTGRES_PASSWORD, MF_*_SENHA, ADMIN_DATABASE_URL (migracoes e backup)
#   mike-baguncinha-segredos  DATABASE_URL (mf_mike), JWT_CHAVE_PRIVADA_PEM
#   dona-cida-segredos        DATABASE_URL (mf_cida)
#   jaiminho-segredos         DATABASE_URL (mf_jaiminho), SMTP_USUARIO/SMTP_SENHA se informados
set -euo pipefail
export MSYS_NO_PATHCONV=1

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ARQUIVO="${1:-$RAIZ/deploy/secrets.env}"
NAMESPACE=medicalfield
BANCO=medicalfield
HOST_BANCO=postgres:5432

[ -f "$ARQUIVO" ] || cp "$RAIZ/deploy/secrets.env.example" "$ARQUIVO"
chmod 600 "$ARQUIVO" 2>/dev/null || true

ler() { sed -n "s/^$1=//p" "$ARQUIVO" | tail -n 1 | tr -d '\r'; }
gravar() { # gravar CHAVE valor
  if grep -q "^$1=" "$ARQUIVO"; then sed -i "s|^$1=.*|$1=$2|" "$ARQUIVO"; else printf '%s=%s\n' "$1" "$2" >> "$ARQUIVO"; fi
}
senha() { # senha CHAVE -> valor existente, ou gera, grava e devolve
  local valor; valor="$(ler "$1")"
  if [ -z "$valor" ]; then valor="$(openssl rand -hex 24)"; gravar "$1" "$valor"; echo "gerado: $1" >&2; fi
  if ! [[ "$valor" =~ ^[A-Za-z0-9_-]+$ ]]; then echo "$1: use apenas letras, numeros, _ e -" >&2; exit 1; fi
  printf '%s' "$valor"
}

ADMIN="$(senha SENHA_POSTGRES_ADMIN)"
MIKE="$(senha SENHA_MF_MIKE)"
CIDA="$(senha SENHA_MF_CIDA)"
JAIMINHO="$(senha SENHA_MF_JAIMINHO)"

JWT_B64="$(ler JWT_CHAVE_PRIVADA_PEM_B64)"
if [ -z "$JWT_B64" ]; then
  # Ed25519 em PEM PKCS#8 ("BEGIN PRIVATE KEY"), como o MikeBaguncinha espera
  JWT_B64="$(openssl genpkey -algorithm ed25519 | base64 | tr -d '\r\n')"
  gravar JWT_CHAVE_PRIVADA_PEM_B64 "$JWT_B64"
  echo "gerado: JWT_CHAVE_PRIVADA_PEM_B64" >&2
fi
JWT_PEM="$(printf '%s' "$JWT_B64" | base64 -d)"
case "$JWT_PEM" in *"BEGIN PRIVATE KEY"*) ;; *) echo "JWT_CHAVE_PRIVADA_PEM_B64 nao e um PEM PKCS#8" >&2; exit 1 ;; esac

url() { printf 'postgres://%s:%s@%s/%s?sslmode=disable' "$1" "$2" "$HOST_BANCO" "$BANCO"; }

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

aplicar() { # aplicar <nome> <--from-literal=...>...
  local nome="$1"; shift
  kubectl -n "$NAMESPACE" create secret generic "$nome" "$@" --dry-run=client -o yaml | kubectl apply -f -
}

aplicar postgres-credenciais \
  --from-literal=POSTGRES_PASSWORD="$ADMIN" \
  --from-literal=MF_MIKE_SENHA="$MIKE" \
  --from-literal=MF_CIDA_SENHA="$CIDA" \
  --from-literal=MF_JAIMINHO_SENHA="$JAIMINHO" \
  --from-literal=ADMIN_DATABASE_URL="$(url postgres "$ADMIN")"

aplicar mike-baguncinha-segredos \
  --from-literal=DATABASE_URL="$(url mf_mike "$MIKE")" \
  --from-literal=JWT_CHAVE_PRIVADA_PEM="$JWT_PEM"

aplicar dona-cida-segredos --from-literal=DATABASE_URL="$(url mf_cida "$CIDA")"

extras=()
SMTP_USUARIO="$(ler SMTP_USUARIO)"; SMTP_SENHA="$(ler SMTP_SENHA)"
[ -n "$SMTP_USUARIO" ] && extras+=(--from-literal=SMTP_USUARIO="$SMTP_USUARIO")
[ -n "$SMTP_SENHA" ] && extras+=(--from-literal=SMTP_SENHA="$SMTP_SENHA")
aplicar jaiminho-segredos --from-literal=DATABASE_URL="$(url mf_jaiminho "$JAIMINHO")" "${extras[@]}"

echo "Secrets aplicados em $NAMESPACE a partir de $ARQUIVO (guarde este arquivo fora do Git)."
