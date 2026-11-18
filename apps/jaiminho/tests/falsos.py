"""MikeBaguncinha (JWKS) e DonaCida (ficha) falsos: um servidor HTTP de verdade, em thread.

Também roda sozinho, para exercitar o serviço à mão sem os outros dois:

    python -m tests.falsos 9999     # serve a ficha de exemplo para qualquer id e imprime um token
"""

import base64
import json
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from uuid import uuid4

import jwt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

FICHA_EXEMPLO = Path(__file__).parent.parent / "exemplos" / "ficha-exemplo.json"
PROFISSIONAL_ID = "a1b2c3d4-0001-4000-8000-000000000001"


def ficha_exemplo(atendimento_id: str | None = None) -> dict[str, Any]:
    ficha = json.loads(FICHA_EXEMPLO.read_text(encoding="utf-8"))
    if atendimento_id:
        ficha["atendimento"]["id"] = atendimento_id
        for evento in ficha["eventos"]:
            evento["atendimentoId"] = atendimento_id
    return ficha


class Chave:
    def __init__(self, kid: str) -> None:
        self.kid = kid
        self.privada = Ed25519PrivateKey.generate()

    def jwk(self) -> dict[str, str]:
        publica = self.privada.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
        return {
            "kty": "OKP",
            "crv": "Ed25519",
            "kid": self.kid,
            "x": base64.urlsafe_b64encode(publica).rstrip(b"=").decode(),
            "use": "sig",
            "alg": "EdDSA",
        }

    def token(self, validade_segundos: int = 900, **claims: Any) -> str:
        agora = int(time.time())
        corpo = {
            "iss": "medicalfield",
            "sub": PROFISSIONAL_ID,
            "nome": "Dra. Helena Prado",
            "tipoRegistro": "CRM",
            "registro": "100001",
            "uf": "RS",
            "papel": "ADMIN",
            "iat": agora,
            "exp": agora + validade_segundos,
            "jti": str(uuid4()),
            **claims,
        }
        return jwt.encode(corpo, self.privada, algorithm="EdDSA", headers={"kid": self.kid})


class ServidorFalso:
    """Responde /jwks.json e /api/v1/ficha/{id}; guarda os cabeçalhos que a DonaCida falsa recebeu."""

    def __init__(self, porta: int = 0, ficha_padrao: bool = False) -> None:
        self.chaves: list[Chave] = [Chave("teste-1")]
        self.fichas: dict[str, dict[str, Any]] = {}
        self.ficha_padrao = ficha_padrao
        self.status_ficha: int | None = None
        self.cabecalhos_recebidos: list[dict[str, str]] = []
        self.buscas_jwks = 0
        falso = self

        class Tratador(BaseHTTPRequestHandler):
            def log_message(self, *_: Any) -> None:
                pass

            def _json(self, status: int, corpo: Any) -> None:
                dados = json.dumps(corpo).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(dados)))
                self.end_headers()
                self.wfile.write(dados)

            def do_GET(self) -> None:
                if self.path == "/jwks.json":
                    falso.buscas_jwks += 1
                    self._json(200, {"keys": [chave.jwk() for chave in falso.chaves]})
                    return
                if self.path.startswith("/api/v1/ficha/"):
                    falso.cabecalhos_recebidos.append({k.lower(): v for k, v in self.headers.items()})
                    atendimento_id = self.path.rsplit("/", 1)[1]
                    if falso.status_ficha:
                        self._json(falso.status_ficha, {"codigo": "ERRO_INTERNO"})
                    elif atendimento_id in falso.fichas:
                        self._json(200, falso.fichas[atendimento_id])
                    elif falso.ficha_padrao:
                        self._json(200, ficha_exemplo(atendimento_id))
                    else:
                        self._json(404, {"codigo": "NAO_ENCONTRADO"})
                    return
                self._json(404, {})

        self._http = ThreadingHTTPServer(("127.0.0.1", porta), Tratador)
        self.url = f"http://127.0.0.1:{self._http.server_port}"
        self._thread = threading.Thread(target=self._http.serve_forever, daemon=True)

    def iniciar(self) -> "ServidorFalso":
        self._thread.start()
        return self

    def parar(self) -> None:
        self._http.shutdown()
        self._http.server_close()

    def token(self, **claims: Any) -> str:
        return self.chaves[-1].token(**claims)


if __name__ == "__main__":
    servidor = ServidorFalso(porta=int(sys.argv[1]) if len(sys.argv) > 1 else 9999, ficha_padrao=True)
    print(f"JWKS e DonaCida falsos em {servidor.url}")
    print(f"TOKEN={servidor.token(validade_segundos=3600)}", flush=True)
    servidor.iniciar()
    threading.Event().wait()
