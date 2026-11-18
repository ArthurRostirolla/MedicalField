# Troubleshooting

Primeiro olhar, sempre:

```bash
kubectl -n medicalfield get pods,pvc,ingress
kubectl -n medicalfield get events --sort-by=.lastTimestamp | tail -20
kubectl -n medicalfield describe pod <pod>
kubectl -n medicalfield logs <pod> [-c migracoes] [--previous]
```

| Sintoma | Causa provável | O que fazer |
| --- | --- | --- |
| Pod em `ImagePullBackOff` | Tag ainda não publicada; pacote do GHCR privado; no cluster local, imagem não importada | `describe pod` mostra a imagem. VM: conferir o CI e a visibilidade do pacote ([instalacao-vm.md](instalacao-vm.md), passo 3). Local: `cluster-local.sh construir-imagens && cluster-local.sh implantar`. |
| Pod em `CreateContainerConfigError` | Secret ausente ou sem a chave | `deploy/scripts/criar-secrets.sh deploy/secrets.env` |
| Pod em `Init:Error` / `Init:CrashLoopBackOff` | Migração falhou ou o banco não respondeu em 120 s | `kubectl -n medicalfield logs <pod> -c migracoes`. Corrija com uma migração **nova**; não edite uma já aplicada. |
| Serviço não fica `Ready` (readiness 503) | Não alcança o banco: senha do Secret diferente da que o Postgres tem | Ver "Trocar a senha de um papel do banco" abaixo. |
| Serviço reinicia com `OOMKilled` | Limite de memória baixo | `kubectl top pods -n medicalfield`; aumente `resources.limits.memory` do Deployment por *patch* no overlay. |
| `postgres-0` em `Pending` | PVC não ligou (sem `local-path`, disco cheio) | `kubectl get pvc,sc`; `df -h` na VM. |
| `postgres-0` reinicia logo na primeira partida | Script de init falhou (Secret sem `MF_*_SENHA`) e deixou o volume pela metade | **Só em instalação nova, sem dados:** `kubectl -n medicalfield delete statefulset postgres && kubectl -n medicalfield delete pvc dados-postgres-0`, corrija o Secret e reaplique. |
| Gateway responde 404 | Host da requisição não é o do Ingress | `kubectl -n medicalfield get ingress`; teste com `curl -H 'Host: <host>' http://localhost/portal/`. |
| Gateway responde 503 | Serviço de destino sem pod pronto | `kubectl -n medicalfield get pods` |
| Gateway responde 504 / conexão recusada entre pods | NetworkPolicy bloqueando um caminho novo | Caminhos liberados estão em `deploy/base/networkpolicies/networkpolicies.yaml`. Caminho novo = regra nova ali. |
| Login responde 429 | Limite de taxa (gateway: 10/min por IP; Mike: 5 falhas em 15 min por IP+registro) | Esperar. Se todos os usuários caem juntos, o gateway está vendo um IP só: rever `trustedIPs` ([acesso-publico.md](acesso-publico.md)). |
| DonaCida/Jaiminho respondem 401 para token válido | Não buscam o JWKS (`mike-baguncinha:9090`) ou a chave do JWT foi trocada | `kubectl -n medicalfield logs deploy/dona-cida`; após trocar a chave, reinicie os três serviços. |
| E-mail não chega | SMTP externo recusando, ou saída 587/465 bloqueada na VM | Situação em `GET /api/v1/documento/{id}/email` (`ultimoErro`). Contingência: voltar `SMTP_HOST=mailpit` no overlay. |
| Ver os e-mails capturados | — | `kubectl -n medicalfield port-forward svc/mailpit 8025` → `http://localhost:8025` |
| Argo CD `OutOfSync` que não resolve | Manifesto inválido no Git | `kubectl -n argocd get application medicalfield -o jsonpath='{.status.conditions}'`; localmente `kubectl kustomize deploy/overlays/univates`. |
| Argo CD `ComparisonError` / não lê o repositório | Repositório privado sem credencial; VM sem saída para o GitHub | [instalacao-vm.md](instalacao-vm.md), passo 5 e contingências. |
| Mudei algo com `kubectl edit` e voltou | `selfHeal` do Argo CD | Mude no Git. |
| Falta memória no nó | — | `kubectl top node; kubectl top pods -A`. Opções: remover o Argo CD (`kubectl delete -k deploy/argocd` e aplicar o overlay à mão), `--disable metrics-server`. |

## Trocar a senha de um papel do banco

As senhas dos papéis são definidas **só na primeira partida** do Postgres. Mudar o `secrets.env` depois não muda o banco. Para trocar (ex.: `mf_cida`):

```bash
# 1. novo valor em deploy/secrets.env (SENHA_MF_CIDA=...), depois:
deploy/scripts/criar-secrets.sh deploy/secrets.env
# 2. aplicar no banco (a senha é digitada no prompt do psql, não fica no histórico)
kubectl -n medicalfield exec -it postgres-0 -- psql -U postgres -d medicalfield -c '\password mf_cida'
# 3. reiniciar quem usa
kubectl -n medicalfield rollout restart deploy/dona-cida
```

Para a senha do administrador (`SENHA_POSTGRES_ADMIN`) é igual, com `\password postgres`; ela é usada pelas migrações e pelo backup.

## Cluster local

| Sintoma | O que fazer |
| --- | --- |
| `Cluster parado. Rode: … subir` | `deploy/scripts/cluster-local.sh subir` (retoma o contêiner `medicalfield-k3s`, dados preservados) |
| Porta 8088 ou 6550 ocupada | `MF_PORTA_GATEWAY=8090 MF_PORTA_API=6551 deploy/scripts/cluster-local.sh subir` (só vale ao **criar** o cluster) |
| Estado estranho depois de reiniciar o Docker | `cluster-local.sh derrubar && cluster-local.sh subir` — apaga os dados locais |
| `kubectl` do sistema não enxerga o cluster | `export KUBECONFIG=<repo>/deploy/.local/kubeconfig`, ou use `cluster-local.sh kubectl …` |
