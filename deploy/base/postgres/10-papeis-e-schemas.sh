# Roda UMA vez, na primeira partida (diretorio de dados vazio), pelo entrypoint da imagem
# oficial. Cria os papeis restritos com as senhas do Secret "postgres-credenciais" e aplica
# deploy/db/schemas.sql. As tabelas vem depois, pelas migracoes (initContainer de cada servico).
: "${MF_MIKE_SENHA:?}" "${MF_CIDA_SENHA:?}" "${MF_JAIMINHO_SENHA:?}"

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -v senha_mike="$MF_MIKE_SENHA" -v senha_cida="$MF_CIDA_SENHA" -v senha_jaiminho="$MF_JAIMINHO_SENHA" <<'SQL'
CREATE ROLE mf_mike     LOGIN PASSWORD :'senha_mike';
CREATE ROLE mf_cida     LOGIN PASSWORD :'senha_cida';
CREATE ROLE mf_jaiminho LOGIN PASSWORD :'senha_jaiminho';
SQL

psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /mf-init/schemas.sql

# Dados de demonstracao (profissionais ficticios com senha publicada, pessoas e medicamentos)
# so entram quando DADOS_DEMO=on: as migracoes de carga leem este parametro do banco.
# NUNCA ligue num ambiente com dados reais.
if [ "${DADOS_DEMO:-off}" = "on" ]; then
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -c "ALTER DATABASE \"$POSTGRES_DB\" SET medicalfield.dados_demo = 'on'"
fi
