#!/usr/bin/env bash
# Apoio dos scripts de QA: endereco do gateway, kubectl do cluster local, login e SQL.
# Uso: source e2e/qa/lib.sh   (exige MF_SENHA_DEMO no ambiente; nunca gravada em arquivo)
export MSYS_NO_PATHCONV=1
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export KUBECONFIG="$(cygpath -m "$RAIZ/deploy/.local/kubeconfig" 2>/dev/null || echo "$RAIZ/deploy/.local/kubeconfig")"
BASE="${MF_BASE:-http://localhost:8088}"
EVID="$RAIZ/docs/testes/evidencias/qa"
: "${MF_SENHA_DEMO:?defina MF_SENHA_DEMO (apps/mike-baguncinha/README.md)}"

k() { kubectl -n medicalfield "$@"; }
sql() { k exec postgres-0 -c postgres -- psql -U postgres -d medicalfield -At -c "$1"; }
# json <expressao js sobre d>  — le JSON do stdin (nao ha jq na maquina)
json() { node -e 'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>{const d=JSON.parse(s);const r=eval(process.argv[1]);console.log(typeof r==="string"?r:JSON.stringify(r))})' "$1"; }
uuid() { node -e 'console.log(crypto.randomUUID())'; }
agora() { node -e 'console.log(new Date(Date.now()+(+process.argv[1]||0)*1000).toISOString())' "${1:-0}"; }

# login <tipoRegistro> <registro> [uf]  -> imprime o access token
login() {
  local corpo; corpo=$(node -e 'console.log(JSON.stringify({tipoRegistro:process.argv[1],registro:process.argv[2],uf:process.argv[3]||undefined,senha:process.env.MF_SENHA_DEMO}))' "$1" "$2" "${3:-}")
  curl -s -X POST "$BASE/api/v1/auth/login" -H 'Content-Type: application/json' -d "$corpo" | json 'd.accessToken'
}
token_admin() { login CRM 100001 RS; }
token_prof() { login COREN 200002 RS; }

# Contador simples de resultado: ok/falhou <id> <descricao>
PASSOU=0; FALHOU=0
ok() { PASSOU=$((PASSOU+1)); echo "PASSOU  $*"; }
falhou() { FALHOU=$((FALHOU+1)); echo "FALHOU  $*"; }
confere() { # confere <id> <descricao> <esperado> <observado>
  if [ "$3" = "$4" ]; then ok "$1 $2 (observado: $4)"; else falhou "$1 $2 (esperado: $3; observado: $4)"; fi
}
resumo() { echo "--- $PASSOU passaram, $FALHOU falharam"; }
