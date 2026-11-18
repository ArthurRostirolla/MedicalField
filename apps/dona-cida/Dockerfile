# syntax=docker/dockerfile:1
# O contexto de build e a RAIZ do repositorio (o servico usa packages/contratos e packages/dominio):
#   docker build -f apps/dona-cida/Dockerfile -t medicalfield/dona-cida .

# ---- build: instala so o que este servico usa e empacota tudo em um arquivo ----
FROM node:24-alpine AS build
WORKDIR /repo

# Primeiro so os manifestos: a camada de dependencias so e refeita quando eles mudam.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/contratos/package.json packages/contratos/
COPY packages/dominio/package.json packages/dominio/
COPY apps/dona-cida/package.json apps/dona-cida/
RUN npm ci --workspace @medicalfield/dona-cida --include-workspace-root=false --no-audit --no-fund

COPY packages/contratos packages/contratos
COPY packages/dominio packages/dominio
COPY apps/dona-cida apps/dona-cida
RUN npm run build --workspace @medicalfield/dona-cida

# ---- final: Node + um arquivo. Sem node_modules, sem npm em uso, sem escrita em disco ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORTA=8080 \
    PORTA_GESTAO=9090
WORKDIR /app
COPY --from=build /repo/apps/dona-cida/dist/main.mjs ./main.mjs

# Usuario nao-root (uid 1000, ja existe na imagem). O processo nao escreve em disco:
# roda com sistema de arquivos somente leitura (readOnlyRootFilesystem: true).
USER node
EXPOSE 8080 9090
# Forma exec: o node e o PID 1 e recebe o SIGTERM do encerramento gracioso.
CMD ["node", "main.mjs"]
