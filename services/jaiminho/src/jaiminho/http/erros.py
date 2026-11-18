"""Corpo de erro único do contrato: { codigo, mensagem, detalhes, requestId }."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from jaiminho.dominio.modelos import (
    ChaveIdempotenciaConflitante,
    ErroDominio,
    NaoAutenticado,
    NaoEncontrado,
    RegraViolada,
    ServicoIndisponivel,
)
from jaiminho.infra.log import request_id_atual

log = logging.getLogger(__name__)

_POR_ERRO: dict[type[ErroDominio], tuple[int, str]] = {
    NaoAutenticado: (401, "NAO_AUTENTICADO"),
    NaoEncontrado: (404, "NAO_ENCONTRADO"),
    RegraViolada: (422, "VALIDACAO"),
    ChaveIdempotenciaConflitante: (422, "CHAVE_IDEMPOTENCIA_CONFLITANTE"),
    ServicoIndisponivel: (503, "SERVICO_INDISPONIVEL"),
}
_POR_STATUS = {
    401: ("NAO_AUTENTICADO", "Token ausente, inválido ou expirado"),
    403: ("SEM_PERMISSAO", "Sem permissão"),
    404: ("NAO_ENCONTRADO", "Recurso não encontrado"),
    405: ("VALIDACAO", "Método não permitido para esta rota"),
    413: ("VALIDACAO", "Corpo da requisição acima do limite"),
    422: ("VALIDACAO", "Requisição inválida"),
    503: ("SERVICO_INDISPONIVEL", "Serviço indisponível"),
}
_MENSAGENS_CAMPO = {
    "missing": "obrigatório",
    "uuid_parsing": "deve ser um UUID",
    "uuid_type": "deve ser um UUID",
    "json_invalid": "JSON inválido",
    "literal_error": "valor não permitido",
    "enum": "valor não permitido",
    "string_too_short": "obrigatório",
    "string_too_long": "muito longo",
    "extra_forbidden": "campo desconhecido",
}


def corpo_erro(codigo: str, mensagem: str, detalhes: list[dict[str, str]] | None = None) -> dict[str, Any]:
    return {
        "codigo": codigo,
        "mensagem": mensagem,
        "detalhes": detalhes or [],
        "requestId": request_id_atual.get() or "",
    }


def resposta_erro(
    status: int, codigo: str, mensagem: str, detalhes: list[dict[str, str]] | None = None
) -> JSONResponse:
    return JSONResponse(corpo_erro(codigo, mensagem, detalhes), status_code=status)


def resposta_de_dominio(erro: ErroDominio) -> JSONResponse:
    status, codigo = _POR_ERRO.get(type(erro), (500, "ERRO_INTERNO"))
    return resposta_erro(status, codigo, erro.mensagem)


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(ErroDominio)
    async def _dominio(_: Request, erro: ErroDominio) -> JSONResponse:
        return resposta_de_dominio(erro)

    @app.exception_handler(RequestValidationError)
    async def _validacao(_: Request, erro: RequestValidationError) -> JSONResponse:
        detalhes = []
        for item in erro.errors():
            # Só o nome do campo e uma mensagem fixa: o valor recebido nunca volta nem vai para log.
            local = [str(parte) for parte in item["loc"] if parte not in ("body", "query", "path", "header")]
            mensagem = _MENSAGENS_CAMPO.get(item["type"])
            if mensagem is None and item["type"] == "value_error":
                mensagem = str(item.get("ctx", {}).get("error", "")) or None
            detalhes.append({"campo": ".".join(local) or "corpo", "mensagem": mensagem or "valor inválido"})
        return resposta_erro(422, "VALIDACAO", "Requisição inválida", detalhes)

    @app.exception_handler(HTTPException)
    async def _http(_: Request, erro: HTTPException) -> JSONResponse:
        codigo, mensagem = _POR_STATUS.get(erro.status_code, ("ERRO_INTERNO", "Erro interno"))
        return resposta_erro(erro.status_code, codigo, mensagem)
