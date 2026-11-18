#!/usr/bin/env bash
# QA infraestrutura no k3s local: T-24 (NetworkPolicies), T-21 (reinicio de tudo sem perda),
# T-22 (backup + restauracao com conferencia). Uso: bash infra.sh [rede|reinicio|backup]...
# O ciclo de backup RESTAURA o banco para o estado do backup tirado no proprio teste.
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
FASES=("$@"); [ ${#FASES[@]} -eq 0 ] && FASES=(rede reinicio backup)
CONTAGENS="select string_agg(t||'='||n, ' ' order by t) from (
  select 'profissional' t, count(*) n from identidade.profissional union all
  select 'medicamento', count(*) from clinico.medicamento union all
  select 'pessoa', count(*) from clinico.pessoa union all
  select 'prontuario', count(*) from clinico.prontuario union all
  select 'prontuario_item', count(*) from clinico.prontuario_item union all
  select 'atendimento', count(*) from clinico.atendimento union all
  select 'atendimento_evento', count(*) from clinico.atendimento_evento union all
  select 'operacao_sync', count(*) from clinico.operacao_sync union all
  select 'auditoria_clinica', count(*) from clinico.auditoria_clinica union all
  select 'log_cliente', count(*) from auditoria.log_cliente union all
  select 'documento', count(*) from documentos.documento union all
  select 'envio_email', count(*) from documentos.envio_email) x"
SOMA="select md5(string_agg(id::text, ',' order by id)) from clinico.atendimento_evento"
todos_prontos() { local a; for a in statefulset/postgres deploy/mike-baguncinha deploy/dona-cida deploy/jaiminho deploy/web deploy/mailpit; do k rollout status "$a" --timeout=300s >/dev/null || return 1; done; }

rede() {
  echo "== T-24 isolamento de rede (NetworkPolicies)"
  # tenta <pod> <host> <porta>: abre TCP de dentro do pod; imprime ABERTO ou BLOQUEADO
  tenta() { k exec "$1" -- sh -c "nc -z -w 4 $2 $3 >/dev/null 2>&1 && echo ABERTO || echo BLOQUEADO" 2>/dev/null | tr -d '\r'; }
  WEB=$(k get pod -l app.kubernetes.io/name=web -o name | head -1)
  echo "   ferramenta no pod web: $(k exec "$WEB" -- sh -c 'command -v nc wget curl 2>/dev/null | tr "\n" " "' 2>&1 | cut -c1-120)"
  IPPG=$(k get pod postgres-0 -o jsonpath='{.status.podIP}'); IPCIDA=$(k get pod -l app.kubernetes.io/name=dona-cida -o jsonpath='{.items[0].status.podIP}')
  for alvo in "postgres 5432" "$IPPG 5432" "dona-cida 8080" "$IPCIDA 8080" "dona-cida 9090" "mike-baguncinha 8080" "mike-baguncinha 9090" "jaiminho 8080" "mailpit 1025" "mailpit 8025" "1.1.1.1 443"; do
    set -- $alvo; confere T-24 "do pod web -> $1:$2" BLOQUEADO "$(tenta "$WEB" "$1" "$2")"
  done
  # pod temporario SEM os rotulos dos servicos (imagem ja presente no no)
  k delete pod qa-rede qa-rede-backup --ignore-not-found --wait=true >/dev/null 2>&1
  k run qa-rede --image=postgres:17-alpine --restart=Never --labels=qa=rede --command -- sleep 600 >/dev/null
  k run qa-rede-backup --image=postgres:17-alpine --restart=Never --labels=app.kubernetes.io/name=backup --command -- sleep 600 >/dev/null
  k wait --for=condition=Ready pod/qa-rede pod/qa-rede-backup --timeout=120s >/dev/null
  for alvo in "postgres 5432" "$IPPG 5432" "dona-cida 8080" "mike-baguncinha 8080" "mike-baguncinha 9090" "jaiminho 8080" "mailpit 1025" "web 8080" "1.1.1.1 443"; do
    set -- $alvo; confere T-24 "de um pod sem rotulo -> $1:$2" BLOQUEADO "$(tenta pod/qa-rede "$1" "$2")"
  done
  echo "   DNS do pod sem rotulo (liberado por desenho): $(k exec pod/qa-rede -- sh -c 'nslookup postgres 2>&1 | grep -c Address' | tr -d '\r') enderecos"
  # controle positivo: a mesma ferramenta, com o rotulo permitido, alcanca o Postgres (a regra e por rotulo)
  confere T-24 "controle: pod com rotulo 'backup' -> postgres:5432" ABERTO "$(tenta pod/qa-rede-backup postgres 5432)"
  confere T-24 "pod com rotulo 'backup' -> dona-cida:8080" BLOQUEADO "$(tenta pod/qa-rede-backup dona-cida 8080)"
  confere T-24 "pod com rotulo 'backup' -> mike-baguncinha:9090" BLOQUEADO "$(tenta pod/qa-rede-backup mike-baguncinha 9090)"
  k delete pod qa-rede qa-rede-backup --wait=false >/dev/null
  # entre servicos: o que o desenho NAO preve tambem fica fechado
  JAI=$(k get pod -l app.kubernetes.io/name=jaiminho -o name | head -1)
  py() { k exec "$JAI" -- python -c "import socket,sys
s=socket.socket(); s.settimeout(4)
try:
    s.connect((sys.argv[1], int(sys.argv[2]))); print('ABERTO')
except Exception: print('BLOQUEADO')" "$1" "$2" 2>/dev/null | tr -d '\r'; }
  confere T-24 "controle: jaiminho -> postgres:5432 (previsto)" ABERTO "$(py postgres 5432)"
  confere T-24 "controle: jaiminho -> dona-cida:8080 (previsto)" ABERTO "$(py dona-cida 8080)"
  confere T-24 "controle: jaiminho -> mailpit:1025 (previsto)" ABERTO "$(py mailpit 1025)"
  confere T-24 "jaiminho -> mailpit:8025 (tela do Mailpit)" BLOQUEADO "$(py mailpit 8025)"
  confere T-24 "jaiminho -> mike-baguncinha:8080" BLOQUEADO "$(py mike-baguncinha 8080)"
  confere T-24 "jaiminho -> internet:443" BLOQUEADO "$(py 1.1.1.1 443)"
  echo "   jaiminho -> internet:587 (liberado para SMTP externo): $(py 1.1.1.1 587)"
}

reinicio() {
  echo "== T-21 rollout restart de todos os Deployments + delete pod postgres-0: nada se perde"
  a=$(sql "$CONTAGENS"); sa=$(sql "$SOMA"); echo "   antes:  $a"
  pvc=$(k get pvc -o jsonpath='{range .items[*]}{.metadata.name}={.spec.volumeName} {end}')
  k rollout restart deploy/mike-baguncinha deploy/dona-cida deploy/jaiminho deploy/web deploy/mailpit >/dev/null
  k delete pod postgres-0 --wait=true >/dev/null
  todos_prontos && ok "T-21 todos os workloads voltaram" || falhou "T-21 algum workload nao voltou"
  k get pods --no-headers | awk '{print "   " $1, $2, $3, "reinicios=" $4}'
  # o Postgres aceita conexao e os servicos reconectam
  until sql "select 1" >/dev/null 2>&1; do sleep 2; done
  d=$(sql "$CONTAGENS"); echo "   depois: $d"
  confere T-21 "contagens identicas" "$a" "$d"
  confere T-21 "md5 dos ids de atendimento_evento" "$sa" "$(sql "$SOMA")"
  confere T-21 "volumes (PVC -> PV) inalterados" "$pvc" "$(k get pvc -o jsonpath='{range .items[*]}{.metadata.name}={.spec.volumeName} {end}')"
  t0=$SECONDS; until [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento")" = 401 ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/me")" = 401 ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/documento")" = 401 ]; do sleep 2; [ $((SECONDS-t0)) -gt 90 ] && break; done
  T=$(token_prof)
  confere T-21 "token novo aceito pela DonaCida apos reiniciar tudo" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento" -H "Authorization: Bearer $T")"
  confere T-21 "token novo aceito pelo Jaiminho" 422 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/documento" -H "Authorization: Bearer $T")"
  if [ -n "${MF_TOKEN_PRE_REINICIO:-}" ]; then confere T-21 "token emitido ANTES do reinicio continua valido (chave do Secret, nao efemera)" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/auth/me" -H "Authorization: Bearer $MF_TOKEN_PRE_REINICIO")"; fi
}

backup() {
  echo "== T-22 backup e restauracao (ciclo completo)"
  a=$(sql "$CONTAGENS"); sa=$(sql "$SOMA"); echo "   no momento do backup: $a"
  bash "$RAIZ/deploy/scripts/backup.sh" 2>&1 | tail -4 | sed 's/^/   backup.sh: /'
  ARQ=$(k exec postgres-0 -c postgres -- sh -c 'ls -1t /backups/medicalfield-*.dump | head -n 1' | tr -d '\r'); echo "   backup mais recente: $ARQ"
  [ -n "$ARQ" ] && ok "T-22 backup.sh gerou arquivo no volume" || falhou "T-22 sem arquivo de backup"
  # estrago depois do backup: uma linha a mais e uma a menos (como administrador; os papeis dos servicos nao conseguem)
  sql "insert into clinico.medicamento (nome) values ('QA DEPOIS DO BACKUP — deve sumir na restauracao')" >/dev/null
  vitima=$(sql "select id from clinico.medicamento where nome not like 'QA DEPOIS%' order by nome limit 1")
  sql "update clinico.medicamento set nome = nome || ' (ADULTERADO)' where id='$vitima'" >/dev/null
  sql "delete from documentos.envio_email where id = (select id from documentos.envio_email order by criado_em limit 1)" >/dev/null
  echo "   apos o estrago:       $(sql "$CONTAGENS")"
  bash "$RAIZ/deploy/scripts/restore.sh" --sim 2>&1 | tail -3 | sed 's/^/   restore.sh: /'
  d=$(sql "$CONTAGENS"); echo "   apos restaurar:       $d"
  confere T-22 "contagens iguais as do momento do backup" "$a" "$d"
  confere T-22 "md5 dos ids de atendimento_evento" "$sa" "$(sql "$SOMA")"
  confere T-22 "linha criada depois do backup sumiu" 0 "$(sql "select count(*) from clinico.medicamento where nome like 'QA DEPOIS%'")"
  confere T-22 "linha adulterada voltou ao original" 0 "$(sql "select count(*) from clinico.medicamento where nome like '%(ADULTERADO)'")"
  confere T-22 "permissoes dos papeis preservadas (mf_cida: INSERT,SELECT em atendimento_evento)" "INSERT,SELECT" "$(sql "select string_agg(privilege_type, ',' order by privilege_type) from information_schema.role_table_grants where grantee='mf_cida' and table_name='atendimento_evento'")"
  confere T-22 "trigger do cursor de sincronizacao preservado" t "$(sql "select count(*) > 0 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='medicamento' and not t.tgisinternal")"
  # os servicos seguem funcionando sem reiniciar
  T=$(token_prof); A=(-H "Authorization: Bearer $T" -H 'Content-Type: application/json')
  confere T-22 "leitura pela API apos restaurar" 200 "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/v1/medicamento" "${A[@]}")"
  confere T-22 "escrita pela API apos restaurar (seq continua)" 201 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/v1/pessoa" "${A[@]}" -d "{\"id\":\"$(uuid)\",\"nome\":\"QA apos restauracao\",\"editadoEm\":\"$(agora)\"}")"
  confere T-22 "seq da pessoa nova e o maior do banco (cursor nao regrediu)" t "$(sql "select (select seq from clinico.pessoa where nome='QA apos restauracao' order by criado_em desc limit 1) = (select max(seq) from (select seq from clinico.pessoa union all select seq from clinico.medicamento union all select seq from clinico.prontuario union all select seq from clinico.prontuario_item) s)")"
  # exportar para fora do cluster e restaurar do arquivo local
  LOCAL="$(cygpath -m "$(mktemp -d)")/qa-export.dump"
  bash "$RAIZ/deploy/scripts/backup.sh" exportar "$LOCAL" 2>&1 | tail -1 | sed 's/^/   exportar: /'
  [ -s "$LOCAL" ] && ok "T-22 exportar gerou dump local ($(wc -c < "$LOCAL") bytes)" || falhou "T-22 exportar nao gerou arquivo"
  a2=$(sql "$CONTAGENS")
  sql "insert into clinico.medicamento (nome) values ('QA DEPOIS DO BACKUP 2')" >/dev/null
  bash "$RAIZ/deploy/scripts/restore.sh" --sim "$LOCAL" 2>&1 | tail -2 | sed 's/^/   restore.sh (arquivo local): /'
  confere T-22 "restauracao a partir do arquivo local: contagens" "$a2" "$(sql "$CONTAGENS")"
  rm -f "$LOCAL"
  echo "   backups no volume: $(k exec postgres-0 -c postgres -- sh -c 'ls /backups | wc -l' | tr -d '\r')"
}

for f in "${FASES[@]}"; do $f; done
resumo
