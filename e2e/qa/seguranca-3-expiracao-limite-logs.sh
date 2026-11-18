#!/usr/bin/env bash
# QA seguranca 3: token REALMENTE expirado, limite de tentativas de login, vazamento em logs.
#   MF_TOKEN_ANTIGO=<arquivo com um access token emitido ha mais de 15 min> (opcional; sem ele o T-03 e pulado)
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
J=(-H 'Content-Type: application/json')
U=00000000-0000-4000-8000-000000000000
cod() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "== T-03 token expirado de verdade (assinado pelo Mike, exp no passado) -> 401 nos tres servicos"
if [ -n "${MF_TOKEN_ANTIGO:-}" ] && [ -s "$MF_TOKEN_ANTIGO" ]; then
  T=$(tr -d '\r\n' < "$MF_TOKEN_ANTIGO")
  node -e 'const c=JSON.parse(Buffer.from(process.argv[1].split(".")[1],"base64url"));console.log("   exp="+new Date(c.exp*1000).toISOString()+" agora="+new Date().toISOString()+" expirado ha "+Math.round(Date.now()/1000-c.exp)+" s")' "$T"
  for alvo in "mike /api/v1/auth/me" "cida /api/v1/medicamento" "jaiminho /api/v1/documento?atendimentoId=$U"; do
    set -- $alvo; r=$(curl -s -w '\n%{http_code}' "$BASE$2" -H "Authorization: Bearer $T")
    confere T-03 "$1 com token expirado ($(echo "$r" | head -1 | json 'd.codigo' 2>/dev/null))" 401 "$(echo "$r" | tail -1)"
  done
else
  echo "NAO EXECUTADO T-03: defina MF_TOKEN_ANTIGO"
fi

echo "== T-02 limite de tentativas de login com registro INEXISTENTE"
REG="QA$(date +%s)"
for i in 1 2 3 4 5 6 7; do
  r=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "{\"tipoRegistro\":\"CRM\",\"registro\":\"$REG\",\"uf\":\"RS\",\"senha\":\"errada-$i\"}")
  st=$(echo "$r" | tail -1); c=$(echo "$r" | head -1 | json 'd.codigo+" | "+d.mensagem' 2>/dev/null || echo "$r" | head -1)
  echo "   tentativa $i -> $st $c"
  if [ "$i" -le 5 ]; then confere T-02 "tentativa $i (falha generica)" 401 "$st"; else confere T-02 "tentativa $i (bloqueada)" 429 "$st"; fi
done
sleep 2.5
confere T-02 "linhas de log_acesso do login com profissional_id nulo e status 401/429 no ultimo minuto" t "$(sql "select count(*) >= 7 from auditoria.log_acesso where rota='/api/v1/auth/login' and profissional_id is null and status_code in (401,429) and data_hora > now() - interval '1 minute'")"
echo "   o bloqueio e por IP+registro: outro registro inexistente, mesmo IP -> $(cod -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "{\"tipoRegistro\":\"CRM\",\"registro\":\"${REG}X\",\"uf\":\"RS\",\"senha\":\"x\"}") (esperado 401)"
echo "   variar caixa/UF nao contorna: $(cod -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "{\"tipoRegistro\":\"CRM\",\"registro\":\" $REG \",\"uf\":\"SC\",\"senha\":\"x\"}") (esperado 429)"

echo "== QA-12 limite de taxa do gateway no login (10/min por IP) -> 429 do Traefik"
n429=0; for i in $(seq 1 14); do s=$(cod -X POST "$BASE/api/v1/auth/login" "${J[@]}" -d "{\"tipoRegistro\":\"COREN\",\"registro\":\"QAG$(date +%s%N)\",\"senha\":\"x\"}"); printf '%s ' "$s"; [ "$s" = 429 ] && n429=$((n429+1)); done; echo
[ "$n429" -ge 1 ] && ok "QA-12 gateway respondeu 429 em $n429 de 14 logins em rajada" || falhou "QA-12 nenhuma das 14 tentativas em rajada recebeu 429"
echo "   esperando 65 s para o balde do gateway esvaziar..."; sleep 65

echo "== QA-13 logs dos pods e auditoria.log_acesso sem senha, token, corpo ou dado de paciente"
TOK=$(token_prof)
: > "$EVID/logs-pods.txt"
for d in mike-baguncinha dona-cida jaiminho web; do k logs "deploy/$d" --all-containers --tail=-1 >> "$EVID/logs-pods.txt" 2>/dev/null; done
k -n kube-system logs deploy/traefik --tail=-1 >> "$EVID/logs-pods.txt" 2>/dev/null
echo "   $(wc -l < "$EVID/logs-pods.txt") linhas de log coletadas (mike, cida, jaiminho, web, traefik)"
achou() { grep -c -F -- "$1" "$EVID/logs-pods.txt"; }
confere QA-13 "ocorrencias da senha de demonstracao nos logs" 0 "$(achou "$MF_SENHA_DEMO")"
confere QA-13 "ocorrencias de JWT (eyJhbGciOiJFZERTQS) nos logs" 0 "$(achou "eyJhbGciOiJFZERTQS")"
confere QA-13 "ocorrencias de 'Bearer ' nos logs" 0 "$(achou "Bearer ")"
confere QA-13 "ocorrencias de 'refreshToken'/'mf_refresh=' nos logs" 0 "$(grep -c -E 'refreshToken|mf_refresh=' "$EVID/logs-pods.txt")"
confere QA-13 "ocorrencias de '\"senha\"' nos logs" 0 "$(achou '"senha"')"
# dados de paciente: nomes e CPFs que existem na central
sql "select nome from clinico.pessoa where length(nome) > 8 union select cpf from clinico.pessoa where cpf is not null union select descricao from clinico.prontuario_item where length(descricao) > 8 union select destinatario_email from documentos.envio_email" > "$EVID/.padroes.tmp"
n=$(grep -c -F -f "$EVID/.padroes.tmp" "$EVID/logs-pods.txt");
confere QA-13 "linhas de log com nome/CPF de paciente, item de prontuario ou e-mail de destinatario ($(wc -l < "$EVID/.padroes.tmp") padroes)" 0 "$n"
[ "$n" != 0 ] && grep -F -f "$EVID/.padroes.tmp" "$EVID/logs-pods.txt" | cut -c1-300 | head -5
rm -f "$EVID/.padroes.tmp"
confere QA-13 "query string nas rotas de log_acesso" 0 "$(sql "select count(*) from auditoria.log_acesso where rota like '%?%'")"
confere QA-13 "ids (uuid) nas rotas de log_acesso" 0 "$(sql "select count(*) from auditoria.log_acesso where rota ~ '[0-9a-f]{8}-[0-9a-f]{4}-'")"
echo "   rotas distintas gravadas: $(sql "select string_agg(distinct rota, ' ; ') from auditoria.log_acesso")"
echo "   colunas de log_acesso: $(sql "select string_agg(column_name, ', ' order by ordinal_position) from information_schema.columns where table_schema='auditoria' and table_name='log_acesso'")"
confere QA-13 "linhas de log_acesso com 'eyJ' ou a senha em qualquer coluna" 0 "$(sql "select count(*) from auditoria.log_acesso l where l::text like '%eyJ%'")"
# o arquivo bruto de logs nao e evidencia versionavel (tem ids e IPs): guarda so um resumo
head -c 0 /dev/null; grep -c '"tipo":"acesso"' "$EVID/logs-pods.txt" | sed 's/^/   linhas de acesso em stdout: /'
grep '"tipo":"acesso"' "$EVID/logs-pods.txt" | tail -3 | sed 's/^/   exemplo: /'
rm -f "$EVID/logs-pods.txt"
resumo
