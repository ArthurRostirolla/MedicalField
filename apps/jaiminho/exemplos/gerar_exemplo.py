"""Gera exemplos/ficha-exemplo.pdf a partir de exemplos/ficha-exemplo.json (dados fictícios).

python exemplos/gerar_exemplo.py                         só gera o PDF
python exemplos/gerar_exemplo.py --enviar host:porta     também envia por SMTP (ex.: Mailpit)
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

from jaiminho.dominio.modelos import Envio
from jaiminho.dominio.regras import montar_mensagem
from jaiminho.infra.email import EnviadorEmailSmtp
from jaiminho.infra.pdf.renderizador import RenderizadorFichaWeasyPrint

PASTA = Path(__file__).parent
DOCUMENTO_ID = UUID("5d7c1e2a-93b4-4f60-a8d1-0c2e4b6a8f13")
CODIGO = "MF-7KQ4-X9TB"


def main() -> None:
    ficha = json.loads((PASTA / "ficha-exemplo.json").read_text(encoding="utf-8"))
    renderizador = RenderizadorFichaWeasyPrint("https://medicalfield.exemplo.br/portal")
    pdf = renderizador.renderizar(ficha, DOCUMENTO_ID, CODIGO, datetime(2026, 11, 17, 18, 41, tzinfo=UTC))
    destino = PASTA / "ficha-exemplo.pdf"
    destino.write_bytes(pdf)
    print(f"{destino} ({len(pdf)} bytes)")

    if "--enviar" in sys.argv:
        host, porta = sys.argv[sys.argv.index("--enviar") + 1].split(":")
        agora = datetime.now(UTC)
        envio = Envio(
            id=UUID("9e1f3a5c-7b2d-4e6f-8a0b-1c3d5e7f9a2b"),
            documento_id=DOCUMENTO_ID,
            destinatario_nome="Marina Antunes",
            destinatario_email="marina.antunes@exemplo.com",
            vinculo="FAMILIAR",
            status="ENVIANDO",
            tentativas=0,
            proxima_tentativa_em=agora,
            ultimo_erro=None,
            solicitado_por=UUID("a1b2c3d4-0001-4000-8000-000000000001"),
            criado_em=agora,
            enviado_em=None,
        )
        enviador = EnviadorEmailSmtp(host, int(porta), "MedicalField <nao-responda@medicalfield.exemplo.br>")
        asyncio.run(enviador.enviar(montar_mensagem(envio, CODIGO, pdf)))
        print(f"enviado para {host}:{porta}")


if __name__ == "__main__":
    main()
