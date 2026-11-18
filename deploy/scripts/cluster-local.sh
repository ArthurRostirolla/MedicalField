#!/usr/bin/env bash
# Cluster k3s local de no unico, rodando a imagem rancher/k3s direto no Docker (sem k3d/kind).
# Serve para validar os manifestos de deploy/ com o overlay "local". Nao e a VM da Univates.
#
#   deploy/scripts/cluster-local.sh subir                      cria (ou retoma) o cluster e ajusta o Traefik
#   deploy/scripts/cluster-local.sh construir-imagens [peca..] constroi as imagens :dev (padrao: todas)
#   deploy/scripts/cluster-local.sh implantar                  importa as imagens, cria os Secrets e aplica o overlay local
#   deploy/scripts/cluster-local.sh status                     nos, pods, PVCs, Ingress
#   deploy/scripts/cluster-local.sh kubectl <args>             kubectl ja apontado para o cluster local
#   deploy/scripts/cluster-local.sh parar                      para o conteiner (dados preservados; "subir" retoma)
#   deploy/scripts/cluster-local.sh derrubar                   remove o cluster E os dados
#
# Pecas: mike-baguncinha dona-cida jaiminho web migracoes
# Variaveis: MF_CLUSTER (medicalfield-k3s), MF_K3S_IMAGEM, MF_PORTA_API (6550), MF_PORTA_GATEWAY (8088)
set -euo pipefail
export MSYS_NO_PATHCONV=1

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
CLUSTER="${MF_CLUSTER:-medicalfield-k3s}"
K3S_IMAGEM="${MF_K3S_IMAGEM:-rancher/k3s:v1.33.5-k3s1}"
PORTA_API="${MF_PORTA_API:-6550}"
PORTA_GATEWAY="${MF_PORTA_GATEWAY:-8088}"
NAMESPACE=medicalfield
PECAS=(mike-baguncinha dona-cida jaiminho web migracoes)
DIR_LOCAL="$RAIZ/deploy/.local"
ARQUIVO_SECRETS="$RAIZ/deploy/secrets.local.env"

# kubectl.exe precisa de caminho no formato do Windows
caminho_nativo() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else echo "$1"; fi; }
export KUBECONFIG="$(caminho_nativo "$DIR_LOCAL/kubeconfig")"

existe() { docker ps -a --format '{{.Names}}' | grep -qx "$CLUSTER"; }
rodando() { docker ps --format '{{.Names}}' | grep -qx "$CLUSTER"; }
exigir_rodando() { rodando || { echo "Cluster parado. Rode: $0 subir" >&2; exit 1; }; }

esperar() { # esperar <descricao> <segundos> <comando...>
  local descricao="$1" limite="$2"; shift 2
  local inicio=$SECONDS
  until "$@" >/dev/null 2>&1; do
    if (( SECONDS - inicio > limite )); then echo "Tempo esgotado esperando: $descricao" >&2; return 1; fi
    sleep 3
  done
}

no_pronto() { kubectl get nodes --no-headers 2>/dev/null | grep -qw Ready; }

subir() {
  mkdir -p "$DIR_LOCAL"
  if rodando; then
    echo "Cluster ja esta rodando."
  elif existe; then
    docker start "$CLUSTER" >/dev/null
  else
    # Rede propria com IP fixo: sem isso o Docker troca o IP ao reiniciar o conteiner e o k3s
    # nao sobe mais ("failed to find interface with specified node ip").
    docker network inspect "$CLUSTER" >/dev/null 2>&1       || docker network create --subnet 172.30.77.0/24 "$CLUSTER" >/dev/null
    docker run -d --name "$CLUSTER" --hostname "$CLUSTER" --privileged       --network "$CLUSTER" --ip 172.30.77.10 \
      --tmpfs /run --tmpfs /var/run \
      -p "127.0.0.1:$PORTA_API:6443" -p "$PORTA_GATEWAY:80" \
      -v "$CLUSTER-dados:/var/lib/rancher/k3s" \
      -e K3S_KUBECONFIG_MODE=644 \
      "$K3S_IMAGEM" server --tls-san 127.0.0.1 >/dev/null
  fi
  esperar "kubeconfig do k3s" 120 docker exec "$CLUSTER" test -s /etc/rancher/k3s/k3s.yaml
  docker exec "$CLUSTER" cat /etc/rancher/k3s/k3s.yaml \
    | sed "s#https://127.0.0.1:6443#https://127.0.0.1:$PORTA_API#" > "$DIR_LOCAL/kubeconfig"
  esperar "no Ready" 180 no_pronto
  # Mesmo ajuste do Traefik usado na VM
  kubectl apply -f "$(caminho_nativo "$RAIZ/deploy/argocd/traefik-helmchartconfig.yaml")"
  esperar "CRDs do Traefik" 300 kubectl get crd middlewares.traefik.io
  esperar "Traefik" 300 kubectl -n kube-system rollout status deploy/traefik --timeout=5s
  kubectl get nodes
  echo "Cluster local pronto. Gateway: http://localhost:$PORTA_GATEWAY  |  export KUBECONFIG=$KUBECONFIG"
}

construir_uma() {
  local peca="$1" tag="medicalfield-$1:dev"
  case "$peca" in
    mike-baguncinha|jaiminho) docker build -t "$tag" "$(caminho_nativo "$RAIZ/apps/$peca")" ;;
    dona-cida) docker build -t "$tag" -f "$(caminho_nativo "$RAIZ/apps/dona-cida/Dockerfile")" "$(caminho_nativo "$RAIZ")" ;;
    web) docker build -t "$tag" --build-arg VITE_DIAGNOSTICO=1 -f "$(caminho_nativo "$RAIZ/deploy/web/Dockerfile")" "$(caminho_nativo "$RAIZ")" ;;
    migracoes) docker build -t "$tag" -f "$(caminho_nativo "$RAIZ/deploy/$peca/Dockerfile")" "$(caminho_nativo "$RAIZ")" ;;
    *) echo "Peca desconhecida: $peca (use: ${PECAS[*]})" >&2; return 2 ;;
  esac
}

construir_imagens() {
  local alvos=("$@") falhas=()
  (( ${#alvos[@]} )) || alvos=("${PECAS[@]}")
  for peca in "${alvos[@]}"; do
    echo "== construindo medicalfield-$peca:dev"
    construir_uma "$peca" || falhas+=("$peca")
  done
  if (( ${#falhas[@]} )); then echo "NAO construiu: ${falhas[*]}" >&2; return 1; fi
  echo "Imagens construidas: ${alvos[*]}"
}

importar_imagens() {
  local presentes=() ausentes=()
  for peca in "${PECAS[@]}"; do
    if docker image inspect "medicalfield-$peca:dev" >/dev/null 2>&1; then presentes+=("medicalfield-$peca:dev"); else ausentes+=("$peca"); fi
  done
  if (( ${#presentes[@]} )); then
    echo "Importando no cluster: ${presentes[*]}"
    docker save "${presentes[@]}" | docker exec -i "$CLUSTER" ctr -n k8s.io images import - >/dev/null
  fi
  if (( ${#ausentes[@]} )); then echo "AVISO: imagens ausentes (pods ficarao sem imagem): ${ausentes[*]}" >&2; fi
}

implantar() {
  exigir_rodando
  importar_imagens
  "$RAIZ/deploy/scripts/criar-secrets.sh" "$ARQUIVO_SECRETS"
  kubectl apply -k "$(caminho_nativo "$RAIZ/deploy/overlays/local")"
  kubectl -n "$NAMESPACE" rollout status statefulset/postgres --timeout=240s
  # Imagem :dev reimportada tem a mesma tag: forca a troca dos pods
  kubectl -n "$NAMESPACE" rollout restart deployment >/dev/null
  # So espera o que tem imagem; o que falta fica em ImagePullBackOff e e relatado
  local falhou=0 alvo
  for alvo in mailpit mike-baguncinha dona-cida jaiminho web; do
    if [ "$alvo" != mailpit ] && ! docker image inspect "medicalfield-$alvo:dev" >/dev/null 2>&1; then
      echo "PULADO (sem imagem): $alvo" >&2; falhou=1; continue
    fi
    kubectl -n "$NAMESPACE" rollout status "deployment/$alvo" --timeout=240s || falhou=1
  done
  status
  return $falhou
}

status() {
  exigir_rodando
  kubectl get nodes
  kubectl -n "$NAMESPACE" get pods,pvc,ingress,cronjob -o wide 2>/dev/null || true
  echo "Gateway: http://localhost:$PORTA_GATEWAY/portal/"
}

case "${1:-}" in
  subir) subir ;;
  construir-imagens) shift; construir_imagens "$@" ;;
  implantar) implantar ;;
  status) status ;;
  kubectl) shift; kubectl "$@" ;;
  parar) docker stop "$CLUSTER" >/dev/null && echo "Cluster parado (dados preservados)." ;;
  derrubar)
    docker rm -f "$CLUSTER" >/dev/null 2>&1 || true
    docker volume rm "$CLUSTER-dados" >/dev/null 2>&1 || true
    docker network rm "$CLUSTER" >/dev/null 2>&1 || true
    rm -rf "$DIR_LOCAL"
    echo "Cluster removido."
    ;;
  *) sed -n '2,14p' "$0"; exit 1 ;;
esac
