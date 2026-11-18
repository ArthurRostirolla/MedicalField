# Imagem de migracoes: o dbmate + as migracoes dos tres servicos, em /migracoes/<servico>.
# Contexto de build = raiz do repositorio. Usada pelo initContainer de cada servico, com a
# MESMA tag da imagem do servico: a migracao chega junto com a versao que precisa dela.
#   docker build -t medicalfield-migracoes:dev -f deploy/migracoes/Dockerfile .
FROM ghcr.io/amacneil/dbmate:2
COPY services/mike-baguncinha/migrations /migracoes/mike-baguncinha
COPY services/dona-cida/migrations       /migracoes/dona-cida
COPY services/jaiminho/migrations        /migracoes/jaiminho
USER 10001:10001
