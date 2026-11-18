#!/usr/bin/env bash
# QA e-mail (T-19 no docker compose): SMTP fora de verdade (Mailpit parado) -> tentativas crescentes
# com ultimo_erro sem dado de paciente -> Mailpit volta -> o envio chega a ENVIADO sozinho.
# Leva cerca de 7 min com o backoff padrao (60 s, 300 s).
set -uo pipefail
cd "$(dirname "$0")"; source ./lib.sh
trap "dc start mailpit >/dev/null 2>&1" EXIT
TP=$(token_prof); A=(-H "Authorization: Bearer $TP" -H 'Content-Type: application/json')
marca=$(date +%s)
echo "backoff configurado: $(dc config | grep -m1 EMAIL_BACKOFF || echo 'padrao do contrato (60,300,900,3600)')"

# massa: pessoa + atendimento + ficha
PID=$(uuid); AID=$(uuid); NOME="QA Email Paciente $marca"; DEST="qa.familiar.$marca@exemplo.test"
curl -s -o /dev/null -X POST "$BASE/api/v1/pessoa" "${A[@]}" -d "{\"id\":\"$PID\",\"nome\":\"$NOME\",\"editadoEm\":\"$(agora)\"}"
curl -s -o /dev/null -X POST "$BASE/api/v1/atendimento" "${A[@]}" -d "{\"id\":\"$AID\",\"pessoaId\":\"$PID\",\"iniciadoEm\":\"$(agora)\",\"queixaPrincipal\":\"QA e-mail $marca\",\"eventos\":[{\"id\":\"$(uuid)\",\"tipo\":\"OBSERVACAO\",\"ocorridoEm\":\"$(agora)\",\"dados\":{\"texto\":\"observacao sigilosa $marca\"}}]}"
DOC=$(curl -s -X POST "$BASE/api/v1/documento/ficha-atendimento" "${A[@]}" -d "{\"atendimentoId\":\"$AID\"}" | json d.id)
echo "documento $DOC"

echo "== Mailpit para 0 replicas (SMTP recusa conexao)"
dc stop mailpit >/dev/null 2>&1
until [ -z "$(dc ps -q mailpit)" ]; do sleep 2; done
r=$(curl -s -w '\n%{http_code}' -X POST "$BASE/api/v1/documento/$DOC/email" "${A[@]}" -H "Idempotency-Key: $(uuid)" -d "{\"destinatarioNome\":\"Familiar QA\",\"destinatarioEmail\":\"$DEST\",\"vinculo\":\"FAMILIAR\"}")
confere T-19 "pedido de envio aceito mesmo com o SMTP fora" 202 "$(echo "$r" | tail -1)"
ENVIO=$(echo "$r" | head -1 | json d.id)
estado() { curl -s "$BASE/api/v1/documento/$DOC/email" -H "Authorization: Bearer $TP" | json "(e=>e.status+'|'+e.tentativas+'|'+e.ultimoErro+'|'+e.proximaTentativaEm)(d.itens.find(i=>i.id==='$ENVIO'))"; }
renovar() { TP=$(token_prof); A=(-H "Authorization: Bearer $TP" -H 'Content-Type: application/json'); }

t0=$SECONDS
until [ "$(estado | cut -d'|' -f2)" -ge 1 ]; do sleep 2; [ $((SECONDS-t0)) -gt 60 ] && break; done
e1=$(estado); echo "   +$((SECONDS-t0)) s: $e1"
confere T-19 "apos a 1a falha: status" PENDENTE "$(echo "$e1" | cut -d'|' -f1)"
confere T-19 "apos a 1a falha: tentativas" 1 "$(echo "$e1" | cut -d'|' -f2)"
until [ "$(estado | cut -d'|' -f2)" -ge 2 ]; do sleep 5; [ $((SECONDS-t0)) -gt 150 ] && break; done
e2=$(estado); echo "   +$((SECONDS-t0)) s: $e2"
confere T-19 "apos a 2a falha (cerca de 60 s depois): tentativas" 2 "$(echo "$e2" | cut -d'|' -f2)"
confere T-19 "segue PENDENTE (nao desistiu)" PENDENTE "$(echo "$e2" | cut -d'|' -f1)"
erro=$(sql "select ultimo_erro from documentos.envio_email where id='$ENVIO'")
echo "   ultimo_erro no banco: [$erro]"
[ -n "$erro" ] && ok "T-19 ultimo_erro preenchido" || falhou "T-19 ultimo_erro vazio"
if echo "$erro" | grep -q -F -e "$NOME" -e "$DEST" -e "sigilosa" -e "Familiar QA"; then falhou "T-19 ultimo_erro contem dado de paciente/destinatario"; else ok "T-19 ultimo_erro sem nome do paciente, destinatario ou conteudo clinico"; fi
n=$(dc logs --no-color --since=5m jaiminho | grep -c -F -e "$NOME" -e "$DEST" -e "sigilosa")
confere T-19 "linhas do log do Jaiminho com paciente/destinatario durante a falha" 0 "$n"
echo "   log do Jaiminho sobre o envio: $(dc logs --no-color --since=5m jaiminho | grep -i -E 'envio|smtp|email' | grep -v '"tipo":"acesso"' | tail -2 | cut -c1-260)"

echo "== Mailpit de volta; ninguem pede reenvio"
dc start mailpit >/dev/null 2>&1; sleep 3
echo "   proxima tentativa agendada para $(echo "$e2" | cut -d'|' -f4); esperando o worker (ate 6 min)..."
t1=$SECONDS
until [ "$(sql "select status from documentos.envio_email where id='$ENVIO'")" = ENVIADO ]; do sleep 10; [ $((SECONDS-t1)) -gt 400 ] && break; done
renovar; e3=$(estado); echo "   +$((SECONDS-t0)) s: $e3"
confere T-19 "status final sem intervencao" ENVIADO "$(echo "$e3" | cut -d'|' -f1)"
confere T-19 "tentativas ao concluir" 3 "$(echo "$e3" | cut -d'|' -f2)"
# a mensagem chegou ao Mailpit com o PDF anexado
msg=$(curl -s "http://127.0.0.1:18025/api/v1/search?query=to:$DEST" | json 'd.messages.length+"|"+(d.messages[0]?d.messages[0].Attachments:"-")')
confere T-19 "mensagens no Mailpit para o destinatario | anexos" "1|1" "$msg"
resumo
