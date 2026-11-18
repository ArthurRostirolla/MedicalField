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

# Archivo + Martian Mono (SIL OFL 1.1), as famílias do design system (DESIGN.md), embutidas na imagem:
# nada é baixado em tempo de execução. Fontes variáveis (eixos wght e wdth) do repositório google/fonts,
# em commit e sha256 fixos.
ARG FONTES=https://raw.githubusercontent.com/google/fonts/7af0d90b4d532ffa4b041937b560c6df4e7b1e95/ofl
ADD --chmod=644 --checksum=sha256:0e094a7d3c7c4c25cf1310c4b30014f1dae9332220b1c2c88f4fa996f0b05053     ${FONTES}/archivo/Archivo%5Bwdth%2Cwght%5D.ttf /usr/share/fonts/truetype/medicalfield/Archivo.ttf
ADD --chmod=644 --checksum=sha256:108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b     ${FONTES}/archivo/OFL.txt /usr/share/fonts/truetype/medicalfield/OFL-Archivo.txt
ADD --chmod=644 --checksum=sha256:c3467843ec1c2574b05fbcfd7147c7bfbcf63ddca8fc2bcb9d117f1bfb1b22e7     ${FONTES}/martianmono/MartianMono%5Bwdth%2Cwght%5D.ttf /usr/share/fonts/truetype/medicalfield/MartianMono.ttf
ADD --chmod=644 --checksum=sha256:ddafd2c3f37ef1d83ef284ca63e159befd3820850c5e9eded14ca52eee92c256     ${FONTES}/martianmono/OFL.txt /usr/share/fonts/truetype/medicalfield/OFL-MartianMono.txt
# O ADD --chmod também vale para a pasta criada: sem o 755 o usuário não-root não enxerga as fontes.
RUN chmod 755 /usr/share/fonts/truetype/medicalfield && fc-cache -f
# Confere como o usuário de execução, não como root.
RUN su -s /bin/sh nobody -c "fc-list" | grep -q "Archivo" && su -s /bin/sh nobody -c "fc-list" | grep -q "Martian Mono"

FROM base AS dev
RUN pip install --no-cache-dir ".[dev]" && pip uninstall -y jaiminho
CMD ["pytest"]

FROM base AS final
COPY src ./src
RUN pip install --no-cache-dir --no-deps . && rm -rf src pyproject.toml
USER 10001:10001
EXPOSE 8080 9090
CMD ["python", "-m", "jaiminho"]
