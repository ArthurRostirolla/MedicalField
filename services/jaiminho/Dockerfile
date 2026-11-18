# syntax=docker/dockerfile:1
# Contexto de build: services/jaiminho
#   docker build -t medicalfield/jaiminho .                    imagem final
#   docker build --target dev -t medicalfield/jaiminho-dev .   imagem com pytest e ruff
FROM python:3.13-slim AS base

# WeasyPrint precisa do Pango/HarfBuzz. DejaVu é só a fonte de reserva.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libharfbuzz-subset0 \
      fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && fc-cache -f

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    XDG_CACHE_HOME=/tmp/.cache

WORKDIR /app

# Dependências em camada própria: só reinstala quando o pyproject muda.
COPY pyproject.toml ./
RUN mkdir -p src/jaiminho && touch src/jaiminho/__init__.py \
 && pip install --no-cache-dir . \
 && pip uninstall -y jaiminho

# IBM Plex Sans + Mono (SIL OFL 1.1) embutidas na imagem: nada é baixado em tempo de execução.
# Os pacotes oficiais só trazem WOFF; o fontTools (já instalado com o WeasyPrint) regrava como TTF
# para o fontconfig. Versão e sha256 fixos.
ADD --checksum=sha256:c3818979c2a2c82927ea3e7c485e389a18de0b7462887dd4f7acc9a525568962     https://registry.npmjs.org/@ibm/plex-sans/-/plex-sans-1.1.0.tgz /tmp/plex/
ADD --checksum=sha256:744157918f504d2ec10ef2a26b7ec080e362743dda99618c8ff547e946e40d45     https://registry.npmjs.org/@ibm/plex-mono/-/plex-mono-1.1.0.tgz /tmp/plex/
COPY scripts/instalar_fontes.py /tmp/plex/
RUN python /tmp/plex/instalar_fontes.py /tmp/plex /usr/share/fonts/truetype/ibm-plex  && rm -rf /tmp/plex && fc-cache -f && fc-list | grep -q "IBM Plex Mono"

FROM base AS dev
RUN pip install --no-cache-dir ".[dev]" && pip uninstall -y jaiminho
CMD ["pytest"]

FROM base AS final
COPY src ./src
RUN pip install --no-cache-dir --no-deps . && rm -rf src pyproject.toml
USER 10001:10001
EXPOSE 8080 9090
CMD ["python", "-m", "jaiminho"]
