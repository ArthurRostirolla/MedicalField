"""Exporta o OpenAPI gerado pelo FastAPI para openapi.yaml (rodar na imagem dev).

python scripts/exportar_openapi.py
"""

from pathlib import Path

import yaml

from jaiminho.infra.config import Config
from jaiminho.montagem import montar

config = Config(
    database_url="postgresql://exportacao@localhost/nada",
    jwks_url="http://localhost/jwks.json",
    clinico_url="http://localhost",
    url_publica_portal="http://localhost/portal",
    smtp_host="localhost",
    smtp_porta=25,
    email_remetente="exportacao@localhost",
)
esquema = montar(config).api.openapi()
destino = Path(__file__).parent.parent / "openapi.yaml"
destino.write_text(yaml.safe_dump(esquema, allow_unicode=True, sort_keys=False), encoding="utf-8", newline="\n")
print(f"{destino}: {len(esquema['paths'])} caminhos")
