#!/usr/bin/env bash
# QA auditoria: os 7 campos do log de acesso em cada servico (T-16) e tabelas somente-insercao
# para os papeis dos servicos (as senhas vem dos Secrets do cluster e nunca sao impressas).
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
U=00000000-0000-4000-8000-000000000000
TP=$(token_prof)
MEU_ID=$(curl -s "$BASE/api/v1/auth/me" -H "Authorization: Bearer $TP" | json d.id)

echo "== T-16 uma requisicao a cada servico gera linha com os 7 campos"
for alvo in "mike-baguncinha GET /api/v1/auth/me /api/v1/auth/me 200" "dona-cida GET /api/v1/prontuario/$U /api/v1/prontuario/{pessoaId} 404" "jaiminho GET /api/v1/documento/$U /api/v1/documento/{id} 404"; do
  set -- $alvo; rid="qa-t16-$1-$(date +%s%N)"
  st=$(curl -s -o /dev/null -w '%{http_code}' -X "$2" "$BASE$3" -H "Authorization: Bearer $TP" -H "X-Request-Id: $rid")
  sleep 2.5
  linha=$(sql "select data_hora, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms, servico from auditoria.log_acesso where request_id='$rid'")
  echo "   $1: HTTP $st -> log: $linha"
  IFS='|' read -r dh ip prof met rota sc ms serv <<< "$linha"
  [ -n "$dh" ] && [ $(( $(date +%s) - $(date -d "$dh" +%s) )) -lt 30 ] && ok "T-16 $1 data/hora ($dh)" || falhou "T-16 $1 data/hora '$dh'"
  [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] && ok "T-16 $1 IP do cliente ($ip)" || falhou "T-16 $1 IP '$ip'"
  confere T-16 "$1 id do profissional" "$MEU_ID" "$prof"
  confere T-16 "$1 metodo" "$2" "$met"
  confere T-16 "$1 rota em forma de padrao" "$4" "$rota"
  confere T-16 "$1 status" "$5" "$sc"
  [[ "$ms" =~ ^[0-9]+$ ]] && ok "T-16 $1 tempo em ms ($ms)" || falhou "T-16 $1 tempo '$ms'"
  confere T-16 "$1 servico" "$1" "$serv"
done
rid="qa-t16-anon-$(date +%s%N)"; curl -s -o /dev/null "$BASE/api/v1/medicamento" -H "X-Request-Id: $rid"; sleep 2.5
confere T-16 "401 sem token tambem e registrado, com profissional nulo" "401|" "$(sql "select status_code, profissional_id from auditoria.log_acesso where request_id='$rid'")"
echo "   ADMIN le pela API: $(curl -s "$BASE/api/v1/auditoria/acesso?limite=1" -H "Authorization: Bearer $(token_admin)" | json 'Object.keys(d.itens[0]).join(",")')"

echo "== QA-15 tabelas somente-insercao para os papeis dos servicos"
# como <papel> <sql>: roda dentro do conteiner do Postgres, autenticando com a senha do servico (deploy/.env)
como() {
  local var senha
  case "$1" in mf_mike) var=SENHA_MF_MIKE;; mf_cida) var=SENHA_MF_CIDA;; mf_jaiminho) var=SENHA_MF_JAIMINHO;; esac
  senha=$(sed -n "s/^$var=//p" "$RAIZ/deploy/.env" | tr -d "")
  [ -n "$senha" ] || { echo "SEM-SENHA"; return; }
  dc exec -T postgres psql "postgres://$1:$senha@127.0.0.1:5432/medicalfield" -At -v ON_ERROR_STOP=1 -c "$2" 2>&1 | tr '\n' ' '
}
nega() { # nega <papel> <descricao> <sql>
  local saida; saida=$(como "$1" "$3")
  if echo "$saida" | grep -qi -E "permission denied|must be owner|somente|append|nao permitid|não permitid|not allowed"; then ok "QA-15 $1: $2 NEGADO ($(echo "$saida" | cut -c1-110))"; else falhou "QA-15 $1: $2 NAO foi negado -> $(echo "$saida" | cut -c1-160)"; fi
}
echo "   conexao como cada papel: mike=$(como mf_mike 'select current_user') cida=$(como mf_cida 'select current_user') jaiminho=$(como mf_jaiminho 'select current_user')"
antes=$(sql "select (select count(*) from auditoria.log_acesso)||'/'||(select count(*) from clinico.atendimento_evento)||'/'||(select count(*) from clinico.operacao_sync)||'/'||(select count(*) from clinico.auditoria_clinica)||'/'||(select count(*) from auditoria.log_cliente)")
for papel in mf_mike mf_cida mf_jaiminho; do
  nega $papel "UPDATE auditoria.log_acesso" "update auditoria.log_acesso set status_code=200 where id=(select min(id) from auditoria.log_acesso)"
  nega $papel "DELETE auditoria.log_acesso" "delete from auditoria.log_acesso where id=(select min(id) from auditoria.log_acesso)"
  nega $papel "TRUNCATE auditoria.log_acesso" "truncate auditoria.log_acesso"
done
nega mf_mike "UPDATE auditoria.log_cliente" "update auditoria.log_cliente set acao='x'"
nega mf_mike "DELETE auditoria.log_cliente" "delete from auditoria.log_cliente"
for t in atendimento_evento operacao_sync auditoria_clinica; do
  case $t in atendimento_evento) c=tipo;; operacao_sync) c=rota;; *) c=acao;; esac; nega mf_cida "UPDATE clinico.$t" "update clinico.$t set $c=$c"
  nega mf_cida "DELETE clinico.$t" "delete from clinico.$t"
  nega mf_cida "TRUNCATE clinico.$t" "truncate clinico.$t"
  nega mf_mike "SELECT clinico.$t (outro schema)" "select count(*) from clinico.$t"
  nega mf_jaiminho "DELETE clinico.$t (outro schema)" "delete from clinico.$t"
done
nega mf_cida "DELETE clinico.atendimento" "delete from clinico.atendimento"
nega mf_cida "DELETE clinico.pessoa" "delete from clinico.pessoa"
nega mf_cida "DELETE clinico.prontuario_item" "delete from clinico.prontuario_item"
nega mf_cida "SELECT identidade.profissional (hash de senha)" "select senha_hash from identidade.profissional"
nega mf_jaiminho "SELECT identidade.sessao" "select * from identidade.sessao"
nega mf_cida "SELECT documentos.documento" "select count(*) from documentos.documento"
nega mf_jaiminho "DELETE documentos.documento" "delete from documentos.documento"
nega mf_cida "DROP TABLE clinico.atendimento_evento" "drop table clinico.atendimento_evento"
nega mf_cida "ALTER TABLE (desligar trigger)" "alter table clinico.atendimento_evento disable trigger all"
nega mf_cida "CREATE TABLE em clinico" "create table clinico.qa_x (a int)"
echo "   privilegios concedidos (information_schema): $(sql "select string_agg(grantee||':'||table_schema||'.'||table_name||'='||privs, ' ; ') from (select grantee, table_schema, table_name, string_agg(privilege_type, ',' order by privilege_type) privs from information_schema.role_table_grants where grantee like 'mf_%' and table_name in ('log_acesso','log_cliente','atendimento_evento','operacao_sync','auditoria_clinica') group by 1,2,3) x")"
confere QA-15 "contagens das tabelas de trilha inalteradas pelas tentativas (ignorando novas insercoes do log de acesso)" "${antes#*/}" "$(sql "select (select count(*) from clinico.atendimento_evento)||'/'||(select count(*) from clinico.operacao_sync)||'/'||(select count(*) from clinico.auditoria_clinica)||'/'||(select count(*) from auditoria.log_cliente)")"
resumo
