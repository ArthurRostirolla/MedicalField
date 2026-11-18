#!/usr/bin/env bash
# QA seguranca 2: IP forjado, cabecalhos, cookie, refresh reutilizado, injecao, corpos invalidos,
# corpo gigante, Idempotency-Key malformada, CORS.
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
TMP=$(cygpath -m "$(mktemp -d)"); trap 'rm -rf "$TMP"' EXIT
TP=$(token_prof); A=(-H "Authorization: Bearer $TP")
TA=$(token_admin)
J=(-H 'Content-Type: application/json')
U=00000000-0000-4000-8000-000000000000
cod() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
P() { cod -X POST "$BASE$1" "${A[@]}" "${J[@]}" "${@:2}"; }
# esp <id> <descricao> <padrao de status aceitos> <observado>
esp() { if [[ "|$3|" == *"|$4|"* ]]; then ok "$1 $2 -> $4"; else falhou "$1 $2 -> $4 (esperado $3)"; fi; }
novo() { node -e 'console.log(JSON.stringify({id:crypto.randomUUID(),nome:process.argv[1],editadoEm:new Date().toISOString()}))' "$1"; }

echo "== QA-04 X-Forwarded-For forjado nao altera ip_cliente (tres servicos)"
for alvo in "mike /api/v1/auth/me" "cida /api/v1/medicamento?limite=1" "jaiminho /api/v1/documento?atendimentoId=$U"; do
  set -- $alvo; rid="qa-xff-$1-$(date +%s%N)"
  curl -s -o /dev/null "$BASE$2" "${A[@]}" -H 'X-Forwarded-For: 6.6.6.6' -H 'X-Real-Ip: 6.6.6.6' -H 'Forwarded: for=6.6.6.6' -H "X-Request-Id: $rid"
  sleep 2.5
  ip=$(sql "select ip_cliente from auditoria.log_acesso where request_id='$rid'")
  if [ -n "$ip" ] && [ "$ip" != "6.6.6.6" ]; then ok "QA-04 $1 ignorou o XFF forjado (ip_cliente=$ip)"; else falhou "QA-04 $1 gravou ip_cliente='$ip'"; fi
done
confere QA-04 "linhas com 6.6.6.6 em log_acesso" 0 "$(sql "select count(*) from auditoria.log_acesso where ip_cliente like '%6.6.6.6%'")"

echo "== QA-05 cabecalhos de seguranca"
hp=$(curl -s -D - -o /dev/null "$BASE/portal/"); ha=$(curl -s -D - -o /dev/null "$BASE/app/"); hapi=$(curl -s -D - -o /dev/null "$BASE/api/v1/auth/me")
for h in "Content-Security-Policy: default-src 'self'" "X-Content-Type-Options: nosniff" "X-Frame-Options: DENY" "Referrer-Policy: no-referrer" "Permissions-Policy:" "Cross-Origin-Opener-Policy: same-origin" "frame-ancestors 'none'" "object-src 'none'"; do
  echo "$hp" | grep -qi -- "$h" && ok "QA-05 /portal/ tem [$h]" || falhou "QA-05 /portal/ sem [$h]"
  echo "$ha" | grep -qi -- "$h" && ok "QA-05 /app/ tem [$h]" || falhou "QA-05 /app/ sem [$h]"
done
for h in "X-Content-Type-Options: nosniff" "X-Frame-Options: DENY" "Cache-Control: no-store"; do
  echo "$hapi" | grep -qi -- "$h" && ok "QA-05 API tem [$h]" || falhou "QA-05 API sem [$h]"
done
if echo "$hp$ha$hapi" | grep -i -E '^(server|x-powered-by):'; then falhou "QA-05 vaza Server/X-Powered-By"; else ok "QA-05 sem Server/X-Powered-By"; fi
echo "$hp" | grep -qi 'strict-transport-security' && ok "QA-05 HSTS presente" || echo "NOTA    QA-05 HSTS ausente em HTTP (o Traefik so o envia em HTTPS; o cluster local nao tem TLS)"
echo "   CSP: $(echo "$hp" | grep -i '^content-security-policy' | tr -d '\r')"

echo "== QA-06 cookie de refresh"
corpo=$(node -e 'console.log(JSON.stringify({tipoRegistro:"SOCORRISTA",registro:"300003",senha:process.env.MF_SENHA_DEMO}))')
ck=$(curl -s -D - -o "$TMP/login.json" -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "$corpo" | grep -i '^set-cookie' | tr -d '\r')
echo "   $(echo "$ck" | sed -E 's/mf_refresh=[^;]+/mf_refresh=<oculto>/')"
for f in HttpOnly "SameSite=Strict" "Path=/api/v1/auth"; do echo "$ck" | grep -qi "$f" && ok "QA-06 cookie com $f" || falhou "QA-06 cookie sem $f"; done
amb=$(dc config | grep -m1 "AMBIENTE:" | tr -d " ")
echo "$ck" | grep -qi '; *Secure' && ok "QA-06 cookie com Secure" || falhou "QA-06 cookie SEM Secure ($amb)"

echo "== QA-07 refresh token reutilizado apos rotacao -> 401"
R1=$(json 'd.refreshToken' < "$TMP/login.json")
r2=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d "{\"refreshToken\":\"$R1\"}")
confere QA-07 "1o uso do refresh" 200 "$(echo "$r2" | tail -1)"
R2=$(echo "$r2" | head -1 | json 'd.refreshToken')
[ "$R1" != "$R2" ] && ok "QA-07 refresh foi rotacionado" || falhou "QA-07 refresh nao mudou"
confere QA-07 "reuso do refresh antigo" 401 "$(cod -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d "{\"refreshToken\":\"$R1\"}")"
s=$(cod -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d "{\"refreshToken\":\"$R2\"}")
echo "NOTA    QA-07 apos o reuso do antigo, o refresh NOVO respondeu $s (200 = sem deteccao de reuso; 401 = familia revogada)"
confere QA-07 "refresh lixo" 401 "$(cod -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d '{"refreshToken":"abc"}')"
confere QA-07 "refresh sem corpo nem cookie" 401 "$(cod -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d '{}')"
L=$(curl -s -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "$corpo"); LT=$(echo "$L" | json d.accessToken); LR=$(echo "$L" | json d.refreshToken)
confere QA-07 "logout" 204 "$(cod -X POST "$BASE/api/v1/auth/logout" -H "Authorization: Bearer $LT" "${J[@]}" -d "{\"refreshToken\":\"$LR\"}")"
confere QA-07 "refresh apos logout" 401 "$(cod -X POST "$BASE/api/v1/auth/refresh" "${J[@]}" -d "{\"refreshToken\":\"$LR\"}")"
echo "NOTA    QA-07 access token apos logout em /auth/me: $(cod "$BASE/api/v1/auth/me" -H "Authorization: Bearer $LT") (JWT sem revogacao; vale ate expirar)"

echo "== QA-08 injecao de SQL na busca e em campos de texto"
antes=$(sql "select count(*) from clinico.pessoa")
while IFS= read -r p; do
  r=$(curl -s -w '\n%{http_code} %{time_total}' -G "$BASE/api/v1/pessoa" --data-urlencode "busca=$p" "${A[@]}")
  st=$(echo "$r" | tail -1); n=$(echo "$r" | head -1 | json 'd.itens?d.itens.length:d.codigo' 2>/dev/null)
  case "$st" in 200*) [ "$n" = "0" ] && ok "QA-08 busca [$p] tratada como literal: HTTP/tempo $st, 0 itens" || falhou "QA-08 busca [$p] devolveu $n itens";; *) falhou "QA-08 busca [$p] -> $st";; esac
done <<'PAYLOADS'
' OR '1'='1
'; DROP TABLE clinico.pessoa; --
%%
___________
' UNION SELECT null,version()--
x' AND (SELECT pg_sleep(5)) IS NULL--
PAYLOADS
confere QA-08 "tabela clinico.pessoa intacta" "$antes" "$(sql "select count(*) from clinico.pessoa")"
PID=$(uuid); NOME="QA Robert'); DROP TABLE clinico.pessoa;-- <script>alert(1)</script>"
corpoP=$(node -e 'console.log(JSON.stringify({id:process.argv[1],nome:process.argv[2],editadoEm:new Date().toISOString()}))' "$PID" "$NOME")
esp QA-08 "POST /pessoa com nome malicioso" 201 "$(P /api/v1/pessoa -H "Idempotency-Key: $(uuid)" -d "$corpoP")"
confere QA-08 "nome gravado literalmente" "$NOME" "$(sql "select nome from clinico.pessoa where id='$PID'")"
CUR=$(printf '["x","y"]' | base64); CUR2=$(printf '["2026-01-01T00:00:00Z","nao-uuid"]' | base64)
for c in "limite=abc" "limite=-1" "limite=0" "limite=100000" "cursor=abc" "cursor=$CUR" "cursor=$CUR2" "somenteDuplicatas=talvez"; do
  esp QA-08 "GET /pessoa?$c" "422" "$(cod "$BASE/api/v1/pessoa?$c" "${A[@]}")"
done
for c in "/api/v1/pessoa/nao-e-uuid" "/api/v1/ficha/1%20OR%201=1" "/api/v1/documento/nao-e-uuid" "/api/v1/documento/..%2f..%2fetc%2fpasswd/pdf" "/api/v1/sync/alteracoes?desde=-1" "/api/v1/sync/alteracoes?desde=1;select" "/api/v1/auditoria/acesso?cursor=zzz" "/api/v1/auditoria/acesso?limite=abc" "/api/v1/auditoria/acesso?de=ontem" "/api/v1/atendimento?cursor=$CUR" "/api/v1/prontuario?cursor=$CUR2" "/api/v1/medicamento?cursor=$CUR"; do
  esp QA-08 "GET $c" "422|404|400" "$(cod --path-as-is "$BASE$c" -H "Authorization: Bearer $TA")"
done

echo "== QA-09 corpos invalidos: JSON quebrado, tipo errado, campo desconhecido, NUL, gigante"
esp QA-09 "JSON quebrado em /pessoa" "422|400" "$(P /api/v1/pessoa -d '{"id":')"
esp QA-09 "JSON quebrado em /log" "422|400" "$(P /api/v1/log -d '{"logs":')"
esp QA-09 "JSON quebrado em /documento/ficha-atendimento" "422|400" "$(P /api/v1/documento/ficha-atendimento -d '{"a":')"
esp QA-09 "JSON quebrado em /auth/login" "422|400" "$(cod -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d '{"a":')"
esp QA-09 "array no lugar de objeto em /atendimento" "422|400" "$(P /api/v1/atendimento -d '[]')"
esp QA-09 "campo desconhecido (papel) em /pessoa" "422" "$(P /api/v1/pessoa -d "{\"id\":\"$(uuid)\",\"nome\":\"QA\",\"editadoEm\":\"$(agora)\",\"papel\":\"ADMIN\"}")"
esp QA-09 "text/plain em /pessoa" "422|415|400" "$(cod -X POST "$BASE/api/v1/pessoa" "${A[@]}" -H 'Content-Type: text/plain' -d 'oi')"
esp QA-09 "nome com NUL (u0000) em /pessoa" "422|400" "$(P /api/v1/pessoa -d "{\"id\":\"$(uuid)\",\"nome\":\"QA\\u0000nul\",\"editadoEm\":\"$(agora)\"}")"
esp QA-09 "acao com NUL (u0000) em /log" "422|400" "$(P /api/v1/log -d "{\"logs\":[{\"id\":\"$(uuid)\",\"ocorridoEm\":\"$(agora)\",\"acao\":\"qa\\u0000\",\"resultado\":\"SUCESSO\",\"estavaOnline\":true}]}")"
node -e 'process.stdout.write(JSON.stringify({id:crypto.randomUUID(),nome:"A".repeat(100000),editadoEm:new Date().toISOString()}))' > "$TMP/longo.json"
esp QA-09 "nome de 100 mil caracteres em /pessoa" "422|413" "$(P /api/v1/pessoa --data-binary "@$TMP/longo.json")"
esp QA-09 "evento com campo desconhecido em dados" "422" "$(P /api/v1/atendimento-evento -d "{\"id\":\"$(uuid)\",\"atendimentoId\":\"$U\",\"tipo\":\"OBSERVACAO\",\"ocorridoEm\":\"$(agora)\",\"dados\":{\"texto\":\"x\",\"extra\":1}}")"
esp QA-09 "atendimento com pessoaId inexistente (422, nao 404)" "422" "$(P /api/v1/atendimento -d "{\"id\":\"$(uuid)\",\"pessoaId\":\"$U\",\"iniciadoEm\":\"$(agora)\"}")"
esp QA-09 "e-mail: CRLF no nome (injecao de cabecalho)" "422" "$(P /api/v1/documento/$U/email -d '{"destinatarioNome":"A\r\nBcc: x@y.z","destinatarioEmail":"a@b.test","vinculo":"FAMILIAR"}')"
esp QA-09 "e-mail: LF no endereco" "422" "$(P /api/v1/documento/$U/email -d '{"destinatarioNome":"A","destinatarioEmail":"a@b.test\nBcc:x@y.z","vinculo":"FAMILIAR"}')"
esp QA-09 "e-mail: vinculo invalido" "422" "$(P /api/v1/documento/$U/email -d '{"destinatarioNome":"A","destinatarioEmail":"a@b.test","vinculo":"VIZINHO"}')"
node -e 'process.stdout.write(JSON.stringify({id:crypto.randomUUID(),nome:"A",editadoEm:new Date().toISOString(),lixo:"B".repeat(20*1024*1024)}))' > "$TMP/gigante.json"
reinicios() { docker inspect -f "{{.Name}}={{.RestartCount}}" $(dc ps -q) | tr '\n' ' '; }
r0=$(reinicios)
for alvo in /api/v1/pessoa /api/v1/log /api/v1/documento/ficha-atendimento /api/v1/auth/login; do
  esp QA-09 "corpo de 20 MB (com token) em $alvo" "413|422|400" "$(cod --max-time 90 -X POST "$BASE$alvo" "${A[@]}" "${J[@]}" --data-binary "@$TMP/gigante.json")"
done
echo "NOTA    QA-09 corpo de 20 MB SEM token: /pessoa -> $(cod --max-time 90 -X POST "$BASE/api/v1/pessoa" "${J[@]}" --data-binary "@$TMP/gigante.json"); /documento/ficha-atendimento -> $(cod --max-time 90 -X POST "$BASE/api/v1/documento/ficha-atendimento" "${J[@]}" --data-binary "@$TMP/gigante.json"); /log -> $(cod --max-time 90 -X POST "$BASE/api/v1/log" "${J[@]}" --data-binary "@$TMP/gigante.json")"
sleep 3; confere QA-09 "reinicios dos conteineres apos os corpos gigantes" "$r0" "$(reinicios)"

echo "== QA-10 Idempotency-Key malformada / conflitante (T-05, T-06)"
esp QA-10 "chave 'abc'" "422" "$(P /api/v1/pessoa -H 'Idempotency-Key: abc' -d "$(novo 'QA idem 1')")"
esp QA-10 "chave com SQL" "422" "$(P /api/v1/pessoa -H "Idempotency-Key: ' OR 1=1--" -d "$(novo 'QA idem 2')")"
esp QA-10 "chave de 10 mil caracteres" "422|431|400" "$(P /api/v1/pessoa -H "Idempotency-Key: $(head -c 10000 /dev/zero | tr '\0' a)" -d "$(novo 'QA idem 3')")"
confere QA-10 "pessoas gravadas com chave invalida" 0 "$(sql "select count(*) from clinico.pessoa where nome in ('QA idem 1','QA idem 2','QA idem 3')")"
K=$(uuid); C=$(novo 'QA idem ok')
esp T-05 "1a vez" "201" "$(P /api/v1/pessoa -H "Idempotency-Key: $K" -d "$C")"
esp T-05 "repeticao, mesmo corpo" "200" "$(P /api/v1/pessoa -H "Idempotency-Key: $K" -d "$C")"
esp T-06 "mesma chave, corpo diferente" "422" "$(P /api/v1/pessoa -H "Idempotency-Key: $K" -d "$(novo 'QA idem outro')")"
echo "   codigo: $(curl -s -X POST "$BASE/api/v1/pessoa" "${A[@]}" "${J[@]}" -H "Idempotency-Key: $K" -d "$(novo 'QA idem outro')" | json 'd.codigo')"
confere T-05 "linhas da pessoa 'QA idem ok' criadas nesta execucao" 1 "$(sql "select count(*) from clinico.operacao_sync where op_id='$K'")"
echo "NOTA    QA-10 mesma chave+corpo enviada por OUTRO profissional -> $(cod -X POST "$BASE/api/v1/pessoa" -H "Authorization: Bearer $TA" "${J[@]}" -H "Idempotency-Key: $K" -d "$C")"
esp QA-10 "Jaiminho: Idempotency-Key 'abc' no envio de e-mail" "422" "$(P /api/v1/documento/$U/email -H 'Idempotency-Key: abc' -d '{"destinatarioNome":"A","destinatarioEmail":"a@b.test","vinculo":"FAMILIAR"}')"

echo "== QA-11 CORS e metodos"
c=$(curl -s -D - -o /dev/null "$BASE/api/v1/auth/me" -H 'Origin: https://evil.example' | grep -i '^access-control-allow-origin' | tr -d '\r')
[ -z "$c" ] && ok "QA-11 origem estranha nao recebe Access-Control-Allow-Origin" || falhou "QA-11 origem estranha recebeu: $c"
c=$(curl -s -D - -o /dev/null -X OPTIONS "$BASE/api/v1/auth/login" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST' | grep -i '^access-control-allow' | tr -d '\r' | tr '\n' ' ')
echo "$c" | grep -qi 'allow-origin' && falhou "QA-11 preflight liberou origem estranha: $c" || ok "QA-11 preflight de origem estranha sem Allow-Origin"
c=$(curl -s -D - -o /dev/null "$BASE/api/v1/auth/me" -H 'Origin: https://localhost' | grep -i '^access-control-allow-' | tr -d '\r' | tr '\n' ' ')
echo "   origem do app Android: [$c]"
echo "$c" | grep -qi credentials && falhou "QA-11 CORS com credenciais" || ok "QA-11 CORS do app sem Allow-Credentials"
for m in TRACE DELETE PUT; do esp QA-11 "$m /medicamento" "404|405" "$(cod -X $m "$BASE/api/v1/medicamento" "${A[@]}")"; done
resumo
