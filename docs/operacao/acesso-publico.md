# Acesso público

O sistema roda sempre na VM; aqui se decide só a **porta de entrada**. Nenhuma das opções abaixo foi executada na VM nesta fase — são os passos a seguir conforme o que a verificação da VM ([instalacao-vm.md](instalacao-vm.md), passo 0) encontrar.

**Antes de abrir:** confirmar com o professor/TI se túnel de saída é permitido; só dados fictícios; nada além de 443 para fora.

## Árvore de decisão

```
A VM tem IP público e aceita entrada em 80/443?
├─ sim ─────────────────────────────► A. Ingress direto + Let's Encrypt
└─ não: a VM consegue SAIR para a internet e a TI permite túnel?
        ├─ sim ─────────────────────► B. Tailscale Funnel   (URL estável)
        │                              C. Cloudflare Quick Tunnel (reserva para o dia)
        └─ não ─────────────────────► D. Só rede interna / VPN — acesso público NÃO é entregue
```

Em todas, o nome escolhido entra em `deploy/overlays/univates/kustomization.yaml` no lugar de `host-publico.exemplo.invalid` (host dos dois Ingress e `URL_PUBLICA_PORTAL`, que vira o QR do PDF). Commit e push; o Argo CD aplica.

## A. Ingress direto + Let's Encrypt

Precisa de um nome DNS apontando para o IP da VM (o da Univates, ou um subdomínio gratuito tipo DuckDNS) e das portas 80/443 abertas.

1. Em `deploy/argocd/traefik-helmchartconfig.yaml`, acrescente ao `valuesContent` e reaplique o arquivo:

   ```yaml
       persistence:
         enabled: true            # guarda o acme.json
       additionalArguments:        # junto dos que já existem
         - "--certificatesresolvers.le.acme.email=SEU_EMAIL"
         - "--certificatesresolvers.le.acme.storage=/data/acme.json"
         - "--certificatesresolvers.le.acme.httpchallenge.entrypoint=web"
         - "--entryPoints.web.http.redirections.entryPoint.to=websecure"
         - "--entryPoints.web.http.redirections.entryPoint.scheme=https"
   ```

2. No overlay `univates`, acrescente aos dois Ingress (`freeway` e `freeway-login`) as anotações:

   ```yaml
   patches:
     - target: { kind: Ingress, name: "freeway.*" }
       patch: |-
         - op: add
           path: /metadata/annotations/traefik.ingress.kubernetes.io~1router.entrypoints
           value: websecure
         - op: add
           path: /metadata/annotations/traefik.ingress.kubernetes.io~1router.tls.certresolver
           value: le
   ```

3. `curl -I https://SEU_HOST/portal/` → 200 com certificado válido.

Aqui o Traefik é a borda: mantenha `trustedIPs=127.0.0.1/32` (não confia em `X-Forwarded-For` de ninguém; grava o IP real da conexão). **Não validado nesta sessão** — o cluster local não tem nome público para o desafio ACME.

## B. Tailscale Funnel (sem IP público)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up                      # autentica a VM na sua conta
sudo tailscale funnel --bg 80          # publica https://<maquina>.<tailnet>.ts.net -> Traefik :80
tailscale funnel status
```

- Host no overlay: `<maquina>.<tailnet>.ts.net`. TLS é do Tailscale; o Traefik continua em HTTP.
- IP do cliente: o Funnel chega ao Traefik a partir do próprio nó e manda o IP real em `X-Forwarded-For`. Veja com que origem ele aparece (`kubectl -n kube-system logs deploy/traefik`, ou a coluna `ipCliente` do log de acesso) e acrescente **só esse endereço** ao `trustedIPs` de `traefik-helmchartconfig.yaml`. Sem isso, a auditoria registra o IP do nó em vez do IP do usuário — funciona, mas perde informação.
- Limites: plano pessoal, uso não comercial, banda limitada, portas 443/8443/10000.

## C. Cloudflare Quick Tunnel (reserva para o dia)

```bash
cloudflared tunnel --url http://localhost:80 --http-host-header SEU_HOST_DO_OVERLAY
```

Devolve uma URL `https://<aleatorio>.trycloudflare.com` que **muda a cada reinício**. O `--http-host-header` faz o pedido casar com o host do Ingress sem mexer no Git. O QR do PDF continua apontando para `URL_PUBLICA_PORTAL` (o host do overlay), não para a URL do túnel. Sem garantia de disponibilidade; só para demonstração.

## D. Só rede interna / VPN

Acesso público **não é entregue** — diga isso na apresentação e na documentação.

- Use no overlay o nome interno da VM; se só houver IP, remova os dois `patches` de host do overlay (o Ingress passa a responder em qualquer nome/IP) e ponha `URL_PUBLICA_PORTAL=http://<ip>/portal`.
- O navegador funciona em `http://<vm>/portal/`. O *service worker* da PWA e o app Android exigem HTTPS: sem TLS, o app offline só roda em `localhost` ou com exceção explícita de tráfego em claro no build Android.

## Depois de abrir

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://SEU_HOST/portal/                 # 200
curl -s -o /dev/null -w '%{http_code}\n' https://SEU_HOST/api/v1/medicamento      # 401 (sem token)
for i in $(seq 15); do curl -s -o /dev/null -w '%{http_code} ' -X POST https://SEU_HOST/api/v1/auth/login; done   # termina em 429
```

No app Android, o "endereço do servidor" é configurável: trocar de opção não exige novo APK.
