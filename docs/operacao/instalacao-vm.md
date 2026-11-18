# Instalação na VM da Univates

> **Situação:** este roteiro **ainda não foi executado na VM** — não houve acesso a ela. Os mesmos manifestos, scripts e a instalação do Argo CD foram validados em um k3s local de nó único (`deploy/scripts/cluster-local.sh`). Marque cada passo ao executá-lo de verdade.

Tudo roda como um usuário com `sudo` na VM. Onde aparecer **TROCAR**, há um valor que só você conhece.

## 0. Verificar a VM (antes de instalar qualquer coisa)

| O que | Comando | Preciso de |
| --- | --- | --- |
| SO e kernel | `cat /etc/os-release; uname -r` | Linux 64 bits recente |
| vCPU / RAM / disco | `nproc; free -h; df -h /` | ≥ 2 vCPU; RAM conforme a tabela abaixo; ≥ 15 GB livres |
| root | `sudo -v` | sudo funcionando |
| VM ou contêiner | `systemd-detect-virt` | `kvm`, `vmware`, `microsoft`… — `lxc`/`openvz` = problema (ver contingências) |
| cgroups v2 | `stat -fc %T /sys/fs/cgroup` | `cgroup2fs` |
| Saída para GitHub / GHCR | `curl -sI https://github.com \| head -1; curl -sI https://ghcr.io/v2/ \| head -1` | resposta HTTP (200/401) |
| Saída SMTP | `nc -zv smtp.gmail.com 587` | só se for usar SMTP externo |
| IP público / entrada 80 e 443 | `ip -4 addr`; de fora: `curl -I http://<ip>` | define o acesso público ([acesso-publico.md](acesso-publico.md)) |
| Firewall | `sudo ufw status` ou `sudo firewall-cmd --list-all` | 80/443 liberadas se for Ingress direto |
| Nome DNS, política de túneis, prazo da VM, snapshot | perguntar à TI / professor | — |

| RAM da VM | Decisão |
| --- | --- |
| ≥ 8 GB | Plano completo. |
| 4–6 GB | Plano completo (Argo CD enxuto, como está em `deploy/argocd`). |
| 2–4 GB | k3s com `--disable metrics-server` e **sem Argo CD**: `kubectl apply -k deploy/overlays/univates`. |
| < 2 GB | Abaixo do mínimo do k3s: pedir mais recurso. |

## 1. k3s (nó único)

```bash
curl -sfL https://get.k3s.io | INSTALL_K3S_CHANNEL=stable sh -s - --write-kubeconfig-mode 644
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml      # ponha no ~/.bashrc
kubectl get nodes                                # STATUS Ready
```

Traefik, `local-path` e o controlador de NetworkPolicy já vêm no k3s — não desative nenhum deles.

## 2. Repositório e ajustes do Traefik

```bash
git clone https://github.com/DONO-DO-REPOSITORIO/medicalfield.git && cd medicalfield   # TROCAR
kubectl apply -f deploy/argocd/traefik-helmchartconfig.yaml
kubectl -n kube-system rollout status deploy/traefik
```

## 3. Marcadores a trocar (uma vez, no Git)

| Arquivo | Marcador | Valor |
| --- | --- | --- |
| `deploy/overlays/univates/kustomization.yaml` | `host-publico.exemplo.invalid` (3 lugares) | nome público do sistema ([acesso-publico.md](acesso-publico.md)) |
| `deploy/overlays/univates/kustomization.yaml` | `dono-do-registro` | nada a fazer: o CI grava o dono e a tag no primeiro push em `main` |
| `deploy/argocd/application.yaml` | `DONO-DO-REPOSITORIO` | dono do repositório no GitHub |

Faça commit e push. Espere o CI terminar: ele publica as 5 imagens no GHCR e grava a tag no overlay.

**Imagens do GHCR:** deixe os 5 pacotes `medicalfield-*` públicos (GitHub → Packages → Package settings → Change visibility), ou autentique o k3s criando `/etc/rancher/k3s/registries.yaml`:

```yaml
configs:
  ghcr.io:
    auth: { username: SEU_USUARIO, password: TOKEN_COM_read:packages }
```

e `sudo systemctl restart k3s`.

## 4. Secrets (fora do Git)

```bash
cp deploy/secrets.env.example deploy/secrets.env     # preencha SMTP_* se for usar SMTP externo
deploy/scripts/criar-secrets.sh deploy/secrets.env   # gera senhas e a chave Ed25519 do JWT que faltarem
kubectl -n medicalfield get secrets
```

O script grava o que gerou de volta em `deploy/secrets.env`. **Guarde uma cópia desse arquivo fora da VM**: as senhas do banco só são aplicadas na primeira partida do Postgres.

## 5. Argo CD e primeira sincronização

```bash
kubectl apply --server-side -k deploy/argocd
kubectl -n argocd rollout status statefulset/argocd-application-controller
kubectl -n argocd rollout status deploy/argocd-repo-server deploy/argocd-server
kubectl apply -f deploy/argocd/application.yaml
kubectl -n argocd get application medicalfield -w     # até Synced / Healthy
```

- Repositório **privado**: antes do `application.yaml`, cadastre a credencial —
  `kubectl -n argocd create secret generic repo-medicalfield --from-literal=type=git --from-literal=url=https://github.com/DONO/medicalfield.git --from-literal=username=USUARIO --from-literal=password=TOKEN && kubectl -n argocd label secret repo-medicalfield argocd.argoproj.io/secret-type=repository`
- UI (nunca exposta publicamente): `kubectl -n argocd port-forward svc/argocd-server 8443:443` → `https://localhost:8443`, usuário `admin`, senha em `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d`.

## 6. Conferir

```bash
kubectl -n medicalfield get pods,pvc,ingress,cronjob
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: host-publico.exemplo.invalid' http://localhost/portal/   # TROCAR -> 200
kubectl top pods -A          # medir o orçamento de memória real
deploy/scripts/backup.sh     # primeiro backup, e prova de que o CronJob funciona
```

Depois: [acesso-publico.md](acesso-publico.md) para abrir o sistema para fora, e [banco-manual.md](banco-manual.md) para o passo 9 do roteiro.

## Contingências

| Achado | Resposta |
| --- | --- |
| Sem saída para o GitHub (Argo CD inviável) | Pule o passo 5. `kubectl apply -k deploy/overlays/univates` a cada versão; mesmos manifestos. |
| Sem saída para o GHCR | Na sua máquina: `docker save ghcr.io/…/medicalfield-web:<tag> … -o imagens.tar`; copie para a VM; `sudo k3s ctr images import imagens.tar`. |
| Pouca RAM | `--disable metrics-server` na instalação do k3s; sem Argo CD. |
| Sem root, ou contêiner LXC sem suporte a k3s | Pedir à TI/professor. Não há como cumprir "Kubernetes na VM" sem isso; a decisão de alternativa é do autor do trabalho. |

## Dados de demonstração (`DADOS_DEMO`)

Os profissionais, pessoas e medicamentos fictícios só são criados quando o ConfigMap `postgres-configuracao` tem `DADOS_DEMO=on` **na primeira partida do banco** (o script de inicialização grava `medicalfield.dados_demo = 'on'` no banco e as migrações de carga leem esse parâmetro). Os overlays `local` e `univates` vêm com `on`, porque são ambientes de demonstração. **Num ambiente com dados reais, troque para `off` antes da primeira implantação**: `on` cria a conta ADMIN de demonstração, cuja senha é pública.

A imagem `web` de produção não expõe a consulta de diagnóstico do app (`window.__mf`); o cluster local a constrói com `--build-arg VITE_DIAGNOSTICO=1`, que os testes automatizados usam. O roteiro automatizado (`e2e/roteiro.spec.ts`) e o teste Android dependem desse modo.
