#!/usr/bin/env bash
# QA seguranca 1: rotas sem token, tokens forjados, papel insuficiente, porta de gestao.
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
U=00000000-0000-4000-8000-000000000000
ROTAS=(
  "POST /api/v1/auth/refresh" "POST /api/v1/auth/logout" "GET /api/v1/auth/me" "POST /api/v1/log"
  "GET /api/v1/auditoria/acesso" "GET /api/v1/auditoria/cliente"
  "GET /api/v1/medicamento" "GET /api/v1/prontuario" "GET /api/v1/prontuario/$U" "POST /api/v1/prontuario"
  "POST /api/v1/prontuario-item" "POST /api/v1/prontuario-item/$U/inativacao" "POST /api/v1/pessoa"
  "GET /api/v1/pessoa" "GET /api/v1/pessoa/$U" "PATCH /api/v1/pessoa/$U" "GET /api/v1/atendimento/$U"
  "GET /api/v1/atendimento" "POST /api/v1/atendimento" "POST /api/v1/atendimento-evento" "GET /api/v1/ficha/$U"
  "GET /api/v1/sync/alteracoes?desde=0"
  "POST /api/v1/documento/ficha-atendimento" "GET /api/v1/documento?atendimentoId=$U" "GET /api/v1/documento/$U"
  "GET /api/v1/documento/$U/pdf" "POST /api/v1/documento/$U/email" "GET /api/v1/documento/$U/email"
  "POST /api/v1/documento/email/$U/reenvio"
)
status() { # status <metodo> <caminho> [token]
  local a=(-s -o /dev/null -w '%{http_code}' -X "$1" "$BASE$2")
  [ "$1" != GET ] && a+=(-H 'Content-Type: application/json' -d '{}')
  [ -n "${3:-}" ] && a+=(-H "Authorization: Bearer $3")
  curl "${a[@]}"
}

echo "== QA-01 toda rota do contrato sem token -> 401 (${#ROTAS[@]} rotas)"
for r in "${ROTAS[@]}"; do set -- $r; confere QA-01 "$1 $2 sem token" 401 "$(status "$1" "$2")"; done
echo "== QA-01b rotas com esquema de autorizacao errado / token vazio"
confere QA-01b "Authorization: Basic" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento" -H 'Authorization: Basic YWRtaW46YWRtaW4=')"
confere QA-01b "Authorization: Bearer (vazio)" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento" -H 'Authorization: Bearer ')"
confere QA-01b "token na query string e ignorado" 401 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento?access_token=x&token=x")"

TP=$(token_prof)
echo "== QA-02 tokens forjados nos tres servicos -> 401"
for v in assinatura payload outra-chave none expirado hs256; do
  F=$(node forjar-token.mjs "$v" "$TP")
  for alvo in "GET /api/v1/auth/me" "GET /api/v1/auditoria/acesso" "GET /api/v1/medicamento" "GET /api/v1/documento?atendimentoId=$U"; do
    set -- $alvo; confere QA-02 "token '$v' em $2" 401 "$(status "$1" "$2" "$F")"
  done
done
confere QA-02 "controle: token valido em /medicamento" 200 "$(status GET /api/v1/medicamento "$TP")"

echo "== T-04 PROFISSIONAL em /auditoria/* -> 403; ADMIN -> 200"
TA=$(token_admin)
confere T-04 "PROFISSIONAL /auditoria/acesso" 403 "$(status GET /api/v1/auditoria/acesso "$TP")"
confere T-04 "PROFISSIONAL /auditoria/cliente" 403 "$(status GET /api/v1/auditoria/cliente "$TP")"
confere T-04 "ADMIN /auditoria/acesso" 200 "$(status GET /api/v1/auditoria/acesso "$TA")"
confere T-04 "ADMIN /auditoria/cliente" 200 "$(status GET /api/v1/auditoria/cliente "$TA")"
echo "corpo do 403: $(curl -s "$BASE/api/v1/auditoria/acesso" -H "Authorization: Bearer $TP")"

echo "== QA-03 porta de gestao nao e alcancavel pelo gateway"
for c in /health/live /health/ready /jwks.json /api/v1/health/live /api/v1/auth/jwks.json /api/v1/auth/../../jwks.json /api/v1/auth/..%2f..%2fjwks.json /.well-known/jwks.json /metrics /api/v1/metrics /api/v1/medicamento/../../health/ready /docs /openapi.json /api/v1/documento/docs /api/v1/documento/openapi.json; do
  s=$(curl -s -o /dev/null -w '%{http_code}' --path-as-is "$BASE$c")
  case "$s" in 404|401|400) ok "QA-03 $c -> $s";; *) falhou "QA-03 $c -> $s (esperado 404/401/400)";; esac
done
resumo
