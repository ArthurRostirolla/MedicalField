"""Validação do JWT (EdDSA) com a chave pública do MikeBaguncinha, obtida por JWKS."""

import asyncio
import json
import logging
import time
from typing import Any
from uuid import UUID

import httpx
import jwt
from jwt.algorithms import OKPAlgorithm

from jaiminho.dominio.modelos import NaoAutenticado, Profissional, ServicoIndisponivel

log = logging.getLogger(__name__)

EMISSOR = "medicalfield"
VALIDADE_CACHE_SEGUNDOS = 300
# `kid` desconhecido força nova busca, mas não mais que uma a cada 5 s (token forjado não vira ataque ao Mike).
INTERVALO_MINIMO_SEGUNDOS = 5


class ValidadorToken:
    def __init__(self, cliente: httpx.AsyncClient, jwks_url: str) -> None:
        self._cliente = cliente
        self._url = jwks_url
        self._chaves: dict[str, Any] = {}
        self._valido_ate = float("-inf")
        self._tentado_em = float("-inf")
        self._trava = asyncio.Lock()

    async def validar(self, token: str) -> Profissional:
        invalido = NaoAutenticado("Token ausente, inválido ou expirado")
        try:
            cabecalho = jwt.get_unverified_header(token)
        except jwt.InvalidTokenError as erro:
            raise invalido from erro
        kid = cabecalho.get("kid")
        if cabecalho.get("alg") != "EdDSA" or not isinstance(kid, str):
            raise invalido

        chave = await self._chave(kid)
        if chave is None:
            raise invalido
        try:
            claims = jwt.decode(
                token,
                chave,
                algorithms=["EdDSA"],
                issuer=EMISSOR,
                options={"require": ["exp", "iss", "sub"]},
            )
            return Profissional(
                id=UUID(claims["sub"]), nome=str(claims.get("nome", "")), papel=str(claims.get("papel", ""))
            )
        except (jwt.InvalidTokenError, ValueError) as erro:
            raise invalido from erro

    async def _chave(self, kid: str) -> Any | None:
        if self._precisa_buscar(kid):
            async with self._trava:
                # Outra requisição pode ter atualizado enquanto esta esperava a trava.
                if self._precisa_buscar(kid):
                    await self._buscar()
        return self._chaves.get(kid)

    def _precisa_buscar(self, kid: str) -> bool:
        agora = time.monotonic()
        desconhecido = kid not in self._chaves and agora - self._tentado_em > INTERVALO_MINIMO_SEGUNDOS
        return agora > self._valido_ate or desconhecido

    async def _buscar(self) -> None:
        # Sem cache e com o Mike fora: uma busca a cada INTERVALO_MINIMO, não uma por requisição.
        if not self._chaves and time.monotonic() - self._tentado_em <= INTERVALO_MINIMO_SEGUNDOS:
            raise ServicoIndisponivel("Serviço de identidade indisponível")
        self._tentado_em = time.monotonic()
        try:
            resposta = await self._cliente.get(self._url)
            resposta.raise_for_status()
            chaves = {
                jwk["kid"]: OKPAlgorithm.from_jwk(json.dumps(jwk))
                for jwk in resposta.json()["keys"]
                if jwk.get("kty") == "OKP" and jwk.get("crv") == "Ed25519" and "kid" in jwk
            }
        except (httpx.HTTPError, ValueError, KeyError, TypeError, jwt.InvalidKeyError) as erro:
            log.warning("falha ao buscar o JWKS", extra={"erro": type(erro).__name__})
            if self._chaves:
                # Mike fora por um instante: segue com as chaves que já tinha e tenta de novo em breve.
                self._valido_ate = self._tentado_em + INTERVALO_MINIMO_SEGUNDOS
                return
            raise ServicoIndisponivel("Serviço de identidade indisponível") from erro
        self._chaves = chaves
        self._valido_ate = self._tentado_em + VALIDADE_CACHE_SEGUNDOS
