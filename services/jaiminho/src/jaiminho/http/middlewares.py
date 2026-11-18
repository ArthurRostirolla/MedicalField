"""Cadeia de responsabilidade: request-id -> log de acesso -> autenticação -> handler.

Middlewares ASGI puros, montados nessa ordem em `http/app.py`.
"""

import ipaddress
import logging
import re
import time
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Protocol
from uuid import uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.routing import BaseRoute, Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from jaiminho.dominio.modelos import ErroDominio, Profissional
from jaiminho.http.erros import resposta_de_dominio, resposta_erro
from jaiminho.infra.config import RedeIp
from jaiminho.infra.log import LinhaAcesso, request_id_atual

log = logging.getLogger(__name__)

PREFIXO_API = "/api/v1"
_REQUEST_ID_ACEITO = re.compile(r"^[A-Za-z0-9._:-]{1,100}$")


class Validador(Protocol):
    async def validar(self, token: str) -> Profissional: ...


class RegistroAcesso(Protocol):
    def registrar(self, linha: LinhaAcesso) -> None: ...


def ip_do_cliente(par_direto: str, x_forwarded_for: str | None, proxies: Sequence[RedeIp]) -> str:
    """Regra do contrato (§4): o cabeçalho só vale se quem conectou é um proxy confiável."""

    def confiavel(texto: str) -> bool:
        try:
            ip = ipaddress.ip_address(texto)
        except ValueError:
            return False
        return any(ip in rede for rede in proxies)

    if not x_forwarded_for or not confiavel(par_direto):
        return par_direto
    for candidato in reversed([parte.strip() for parte in x_forwarded_for.split(",")]):
        try:
            ipaddress.ip_address(candidato)
        except ValueError:
            # Lixo no cabeçalho: dali para a esquerda nada é confiável.
            break
        if not confiavel(candidato):
            return candidato
    return par_direto


class RequestIdMiddleware:
    """Gera (ou aceita) o X-Request-Id, devolve na resposta e garante o corpo padrão em erro não previsto."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        recebido = Headers(scope=scope).get("x-request-id", "")
        request_id = recebido if _REQUEST_ID_ACEITO.match(recebido) else str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        marcador = request_id_atual.set(request_id)
        iniciada = False

        async def enviar(mensagem: Message) -> None:
            nonlocal iniciada
            if mensagem["type"] == "http.response.start":
                iniciada = True
                MutableHeaders(scope=mensagem)["X-Request-Id"] = request_id
            await send(mensagem)

        try:
            await self.app(scope, receive, enviar)
        except Exception:
            # Sem dado da requisição no log: só o traceback.
            log.exception("erro não tratado")
            if not iniciada:
                await resposta_erro(500, "ERRO_INTERNO", "Erro interno")(scope, receive, enviar)
        finally:
            request_id_atual.reset(marcador)


class LogAcessoMiddleware:
    """Uma linha por requisição em /api/v1/*. Envolve a autenticação: 401 também é registrado."""

    def __init__(
        self, app: ASGIApp, registro: RegistroAcesso, proxies: Sequence[RedeIp], rotas: Sequence[BaseRoute]
    ) -> None:
        self.app = app
        self._registro = registro
        self._proxies = proxies
        self._rotas = rotas

    def _padrao_da_rota(self, scope: Scope) -> str:
        """Padrão da rota (`/api/v1/documento/{id}`), nunca o caminho com ids."""
        rota = scope.get("route")
        if rota is None:
            # A requisição parou antes do roteador (401): resolve aqui só para o log.
            rota = next((r for r in self._rotas if r.matches(scope)[0] == Match.FULL), None)
        return getattr(rota, "path", None) or "(rota desconhecida)"

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(PREFIXO_API):
            await self.app(scope, receive, send)
            return
        inicio = time.perf_counter()
        data_hora = datetime.now(UTC)
        status = 500

        async def enviar(mensagem: Message) -> None:
            nonlocal status
            if mensagem["type"] == "http.response.start":
                status = mensagem["status"]
            await send(mensagem)

        try:
            await self.app(scope, receive, enviar)
        finally:
            try:
                estado = scope.get("state", {})
                profissional: Profissional | None = estado.get("profissional")
                cliente = scope.get("client")
                self._registro.registrar(
                    LinhaAcesso(
                        data_hora=data_hora,
                        ip_cliente=ip_do_cliente(
                            cliente[0] if cliente else "desconhecido",
                            Headers(scope=scope).get("x-forwarded-for"),
                            self._proxies,
                        ),
                        profissional_id=profissional.id if profissional else None,
                        metodo=scope["method"],
                        rota=self._padrao_da_rota(scope),
                        status_code=status,
                        tempo_ms=round((time.perf_counter() - inicio) * 1000),
                        request_id=estado.get("request_id", ""),
                    )
                )
            except Exception:
                # Falha no log nunca derruba a requisição.
                log.exception("falha ao registrar o log de acesso")


class AutenticacaoMiddleware:
    """Toda rota sob /api/v1 exige um JWT válido; o profissional fica em scope['state']."""

    def __init__(self, app: ASGIApp, validador: Validador) -> None:
        self.app = app
        self._validador = validador

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith(PREFIXO_API):
            await self.app(scope, receive, send)
            return
        esquema, _, token = Headers(scope=scope).get("authorization", "").partition(" ")
        if esquema.lower() != "bearer" or not token.strip():
            resposta = resposta_erro(401, "NAO_AUTENTICADO", "Token ausente, inválido ou expirado")
            await resposta(scope, receive, send)
            return
        try:
            scope.setdefault("state", {})["profissional"] = await self._validador.validar(token.strip())
        except ErroDominio as erro:
            await resposta_de_dominio(erro)(scope, receive, send)
            return
        await self.app(scope, receive, send)
