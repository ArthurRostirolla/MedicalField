#!/usr/bin/env bash
# Cria (ou completa) deploy/.env a partir de deploy/.env.example: gera as senhas do banco e a chave
# Ed25519 do JWT que estiverem vazias. Idempotente: o que ja tem valor nao muda.
#
#   deploy/scripts/segredos.sh [arquivo]        (padrao: deploy/.env)
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
ARQUIVO="${1:-$RAIZ/deploy/.env}"

[ -f "$ARQUIVO" ] || cp "$RAIZ/deploy/.env.example" "$ARQUIVO"
chmod 600 "$ARQUIVO" 2>/dev/null || true

ler() { sed -n "s/^$1=//p" "$ARQUIVO" | tail -n 1 | tr -d '\r'; }
gravar() { # gravar CHAVE valor  (tira a linha vazia da chave e acrescenta no fim, sem sed: o PEM tem \n)
  local resto; resto="$(grep -v "^$1=" "$ARQUIVO" || true)"
  printf '%s\n%s=%s\n' "$resto" "$1" "$2" > "$ARQUIVO"
  echo "gerado: $1" >&2
}

for chave in SENHA_POSTGRES_ADMIN SENHA_MF_MIKE SENHA_MF_CIDA SENHA_MF_JAIMINHO; do
  valor="$(ler "$chave")"
  if [ -z "$valor" ]; then gravar "$chave" "$(openssl rand -hex 24)"
  elif ! [[ "$valor" =~ ^[A-Za-z0-9_-]+$ ]]; then echo "$chave: use apenas letras, numeros, _ e -" >&2; exit 1
  fi
done

if [ -z "$(ler JWT_CHAVE_PRIVADA_PEM)" ]; then
  # PEM PKCS#8 ("BEGIN PRIVATE KEY") numa linha com \n literais; o MikeBaguncinha os converte.
  pem="$(openssl genpkey -algorithm ed25519 | tr -d '\r' | awk '{printf "%s\\n", $0}')"
  gravar JWT_CHAVE_PRIVADA_PEM "'$pem'"
fi

echo "Pronto: $ARQUIVO (guarde uma copia fora desta maquina)."
