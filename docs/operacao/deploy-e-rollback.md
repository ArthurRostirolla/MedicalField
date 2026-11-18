# Deploy e rollback

## Como uma versão chega ao cluster

1. *Push* em `main` → GitHub Actions (`.github/workflows/ci.yml`) roda os testes dos três serviços, dos pacotes npm e renderiza os overlays.
2. Passou → BuildKit constrói 5 imagens e publica no GHCR com a tag `<sha do commit>`: `medicalfield-mike-baguncinha`, `-dona-cida`, `-jaiminho`, `-web` e `-migracoes`.
3. O job `atualizar-overlay` grava essa tag em `deploy/overlays/univates/kustomization.yaml` (`kustomize edit set image`) e faz commit `[skip ci]`.
4. O Argo CD consulta o Git (~3 min; ou **Refresh** na UI / `kubectl -n argocd annotate application medicalfield argocd.argoproj.io/refresh=normal --overwrite`) e aplica.
5. Em cada serviço, o `initContainer` **migracoes** roda `dbmate up` como administrador do banco; só então o contêiner novo sobe. `maxUnavailable: 0`: o pod antigo só sai quando o novo passa na *readiness*.

O CI nunca recebe credencial do cluster — o cluster é que busca.

### Migrações: por que uma imagem `migracoes`

`deploy/migracoes/Dockerfile` empacota o `dbmate` com `apps/*/migrations` em `/migracoes/<servico>`. Ela leva **a mesma tag** das imagens dos serviços, então a migração chega junto com a versão que precisa dela, sem *hooks* do Argo CD e sem montar o repositório no cluster. Cada serviço usa a sua tabela de controle (`identidade.`, `clinico.`, `documentos.schema_migrations`), igual ao `scripts/dev-db.sh`. O serviço em si conecta com o papel restrito (`mf_mike`, `mf_cida`, `mf_jaiminho`).

## Acompanhar

```bash
kubectl -n argocd get application medicalfield
kubectl -n medicalfield get pods -w
kubectl -n medicalfield logs deploy/dona-cida -c migracoes     # o que a migração fez
kubectl -n medicalfield rollout status deploy/dona-cida
```

## Rollback

```bash
git revert <commit "deploy(univates): imagens ...">   # o commit da tag, feito pelo CI
git push
```

O Argo CD volta todas as imagens para a tag anterior. **Não** use `kubectl rollout undo` nem `kubectl set image`: o `selfHeal` desfaz em seguida, porque o Git é a verdade.

As migrações são só aditivas (nunca `dbmate down` em produção): a versão anterior continua funcionando com o schema novo. Se uma migração quebrou dado, o caminho é [restaurar o backup](backup-e-recuperacao.md).

## Mudar configuração

- Não sensível (URL pública, SMTP, nível de log): edite o overlay, commit, push. O nome do ConfigMap tem *hash*; os pods reiniciam sozinhos.
- Segredo: edite `deploy/secrets.env`, rode `deploy/scripts/criar-secrets.sh` e reinicie quem usa: `kubectl -n medicalfield rollout restart deploy/<servico>`. Senha de banco é caso à parte: [troubleshooting.md](troubleshooting.md#trocar-a-senha-de-um-papel-do-banco).

## Sem Argo CD (contingência)

```bash
git pull && kubectl apply -k deploy/overlays/univates
```

## Cluster local (validar antes de mandar para a VM)

```bash
deploy/scripts/cluster-local.sh subir
deploy/scripts/cluster-local.sh construir-imagens
deploy/scripts/cluster-local.sh implantar          # http://localhost:8088/portal/
deploy/scripts/cluster-local.sh parar              # ou "derrubar" para apagar tudo
```

É um k3s de nó único rodando a imagem `rancher/k3s` no Docker, com o overlay `local` (imagens `:dev`, e-mail no Mailpit), sem Argo CD. Kubeconfig em `deploy/.local/kubeconfig` (ignorado pelo Git); `cluster-local.sh kubectl …` já aponta para ele.
