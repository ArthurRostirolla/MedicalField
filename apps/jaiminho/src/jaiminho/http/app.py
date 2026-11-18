"""Aplicações ASGI: a API (porta pública) e a de gestão (health, porta separada)."""

from collections.abc import AsyncIterator, Awaitable, Callable, Sequence
from contextlib import AbstractAsyncContextManager

from fastapi import APIRouter, FastAPI
from fastapi.responses import JSONResponse

from jaiminho.http.erros import registrar_tratadores
from jaiminho.http.middlewares import (
    AutenticacaoMiddleware,
    LimiteCorpoMiddleware,
    LogAcessoMiddleware,
    RegistroAcesso,
    RequestIdMiddleware,
    Validador,
)
from jaiminho.infra.config import RedeIp

CicloDeVida = Callable[[FastAPI], AbstractAsyncContextManager[None] | AsyncIterator[None]]


def criar_app(
    rotas: APIRouter,
    validador: Validador,
    registro_acesso: RegistroAcesso,
    proxies_confiaveis: Sequence[RedeIp],
    ciclo_de_vida: CicloDeVida | None = None,
) -> FastAPI:
    app = FastAPI(
        title="Jaiminho — MedicalField",
        summary="Ficha de atendimento em PDF e envio por e-mail",
        version="0.1.0",
        lifespan=ciclo_de_vida,  # type: ignore[arg-type]
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    registrar_tratadores(app)
    app.include_router(rotas)
    # add_middleware empilha: o último adicionado é o mais externo.
    # Ordem de execução: request-id -> log de acesso -> autenticação -> handler.
    app.add_middleware(AutenticacaoMiddleware, validador=validador)
    # O teto de corpo fica dentro do log (a recusa é registrada) e antes da autenticação.
    app.add_middleware(LimiteCorpoMiddleware)
    app.add_middleware(LogAcessoMiddleware, registro=registro_acesso, proxies=proxies_confiaveis, rotas=rotas.routes)
    app.add_middleware(RequestIdMiddleware)
    return app


def criar_app_gestao(banco_responde: Callable[[], Awaitable[bool]]) -> FastAPI:
    """Sem autenticação e nunca roteada pelo gateway."""
    app = FastAPI(title="Jaiminho — gestão", docs_url=None, redoc_url=None, openapi_url=None)

    @app.get("/health/live")
    async def live() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready")
    async def ready() -> JSONResponse:
        if await banco_responde():
            return JSONResponse({"status": "ok"})
        return JSONResponse({"status": "indisponivel"}, status_code=503)

    return app
