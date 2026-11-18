# Imagem "web": portal BradPitt (/portal/) e app LuckyPatcher (/app/) servidos por nginx.
# Contexto de build = raiz do repositorio (monorepo npm workspaces). Exige BuildKit.
#   docker build -t medicalfield-web:dev -f deploy/web/Dockerfile .
FROM node:22-alpine AS build
WORKDIR /repo
# services/dona-cida e e2e sao workspaces da raiz: so o package.json deles entra (se existir),
# para o npm ci bater com o package-lock.json. Copia por bind mount porque COPY falha em
# caminho ausente.
RUN --mount=type=bind,target=/src cd /src \
 && for f in package.json package-lock.json tsconfig.base.json services/dona-cida/package.json e2e/package.json; do \
      if [ -f "$f" ]; then mkdir -p "/repo/$(dirname "$f")" && cp "$f" "/repo/$f"; fi; \
    done \
 && cp -r packages apps /repo/
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
# VITE_DIAGNOSTICO=1 expoe no app a consulta SOMENTE LEITURA ao banco local usada pelos testes
# automatizados. Padrao: desligado (imagem de producao). O cluster local de demonstracao liga.
ARG VITE_DIAGNOSTICO=
ENV VITE_DIAGNOSTICO=${VITE_DIAGNOSTICO}
RUN npm run build --if-present --workspace=packages/contratos --workspace=packages/dominio --workspace=packages/ui \
 && npm run build --workspace=apps/brad-pitt --workspace=apps/lucky-patcher

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY deploy/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/brad-pitt/dist /usr/share/nginx/html/portal
COPY --from=build /repo/apps/lucky-patcher/dist /usr/share/nginx/html/app
USER 101
EXPOSE 8080 9090
