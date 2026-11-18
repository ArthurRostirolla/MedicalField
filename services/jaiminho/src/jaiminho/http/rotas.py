"""Rotas da seção 7 do contrato. Só convertem e delegam aos casos de uso."""

import re
from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Query, Request, Response
from fastapi.security import HTTPBearer
from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator
from pydantic.alias_generators import to_camel

from jaiminho.aplicacao.documentos import DocumentosUseCases
from jaiminho.aplicacao.envios import EnviosUseCases
from jaiminho.dominio.modelos import Documento, Envio, NovoEnvio, Profissional
from jaiminho.infra.log import iso_utc

DataHora = Annotated[datetime, PlainSerializer(iso_utc, return_type=str)]
_EMAIL = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")


class _Dto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class GerarFichaEntrada(_Dto):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
    atendimento_id: UUID


class DocumentoSaida(_Dto):
    id: UUID
    atendimento_id: UUID
    codigo_verificacao: str
    hash_conteudo: str
    gerado_por: UUID
    gerado_em: DataHora
    tamanho_bytes: int


class DocumentoComIntegridade(DocumentoSaida):
    integro: bool


class ListaDocumentos(_Dto):
    itens: list[DocumentoSaida]
    proximo_cursor: None = None


class EnvioEntrada(_Dto):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")
    destinatario_nome: str = Field(min_length=1, max_length=200)
    destinatario_email: str = Field(min_length=3, max_length=254)
    vinculo: Literal["PACIENTE", "FAMILIAR"]

    @field_validator("destinatario_nome")
    @classmethod
    def _nome(cls, valor: str) -> str:
        valor = valor.strip()
        # Quebra de linha em nome vira injeção de cabeçalho no e-mail.
        if not valor or any(ord(letra) < 32 for letra in valor):
            raise ValueError("nome inválido")
        return valor

    @field_validator("destinatario_email")
    @classmethod
    def _email(cls, valor: str) -> str:
        valor = valor.strip()
        if not _EMAIL.match(valor) or not valor.isascii():
            raise ValueError("e-mail inválido")
        return valor


class EnvioSaida(_Dto):
    id: UUID
    documento_id: UUID
    destinatario_nome: str
    destinatario_email: str
    vinculo: str
    status: Literal["PENDENTE", "ENVIANDO", "ENVIADO", "FALHA_DEFINITIVA"]
    tentativas: int
    proxima_tentativa_em: DataHora | None
    ultimo_erro: str | None
    solicitado_por: UUID
    criado_em: DataHora
    enviado_em: DataHora | None

    @classmethod
    def de(cls, envio: Envio) -> "EnvioSaida":
        saida = cls.model_validate(envio)
        if envio.status in ("ENVIADO", "FALHA_DEFINITIVA"):
            # Não há próxima tentativa agendada.
            saida.proxima_tentativa_em = None
        return saida


class ListaEnvios(_Dto):
    itens: list[EnvioSaida]
    proximo_cursor: None = None


class Erro(BaseModel):
    codigo: str
    mensagem: str
    detalhes: list[dict[str, str]]
    requestId: str


_ERROS: dict[int | str, dict[str, Any]] = {
    401: {"model": Erro, "description": "NAO_AUTENTICADO"},
    404: {"model": Erro, "description": "NAO_ENCONTRADO"},
    422: {"model": Erro, "description": "VALIDACAO ou CHAVE_IDEMPOTENCIA_CONFLITANTE"},
    500: {"model": Erro, "description": "ERRO_INTERNO"},
    503: {"model": Erro, "description": "SERVICO_INDISPONIVEL"},
}


def _profissional(request: Request) -> Profissional:
    return request.state.profissional


Autenticado = Annotated[Profissional, Depends(_profissional)]


def criar_rotas(documentos: DocumentosUseCases, envios: EnviosUseCases) -> APIRouter:
    # HTTPBearer aqui só documenta o esquema no OpenAPI; quem valida é o AutenticacaoMiddleware.
    rotas = APIRouter(
        prefix="/api/v1/documento",
        tags=["documento"],
        responses=_ERROS,
        dependencies=[Depends(HTTPBearer(auto_error=False))],
    )

    @rotas.post(
        "/ficha-atendimento",
        status_code=201,
        response_model=DocumentoSaida,
        summary="Gera a ficha de atendimento em PDF",
        responses={200: {"model": DocumentoSaida, "description": "Já existia documento com o mesmo conteúdo"}},
    )
    async def gerar_ficha(
        entrada: GerarFichaEntrada, request: Request, resposta: Response, profissional: Autenticado
    ) -> Documento:
        documento, criado = await documentos.gerar_ficha(
            entrada.atendimento_id,
            profissional,
            request.headers["authorization"],
            request.state.request_id,
        )
        resposta.status_code = 201 if criado else 200
        return documento

    @rotas.get("", response_model=ListaDocumentos, summary="Documentos de um atendimento")
    async def listar(atendimento_id: Annotated[UUID, Query(alias="atendimentoId")]) -> dict[str, Any]:
        return {"itens": await documentos.listar(atendimento_id)}

    @rotas.get("/{id}", response_model=DocumentoComIntegridade, summary="Metadados e integridade")
    async def obter(id: UUID) -> Documento:
        return await documentos.obter(id)

    @rotas.get(
        "/{id}/pdf",
        summary="Download do PDF",
        response_class=Response,
        responses={200: {"content": {"application/pdf": {}}, "description": "O PDF guardado"}},
    )
    async def baixar(id: UUID) -> Response:
        arquivo = await documentos.baixar_pdf(id)
        return Response(
            arquivo.conteudo,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="ficha-{arquivo.codigo_verificacao}.pdf"',
                "Cache-Control": "no-store",
            },
        )

    @rotas.post(
        "/{id}/email",
        status_code=202,
        response_model=EnvioSaida,
        summary="Enfileira o envio da ficha por e-mail",
    )
    async def solicitar_envio(
        id: UUID,
        entrada: EnvioEntrada,
        profissional: Autenticado,
        chave: Annotated[UUID | None, Header(alias="Idempotency-Key")] = None,
    ) -> EnvioSaida:
        envio = await envios.solicitar(
            NovoEnvio(
                documento_id=id,
                destinatario_nome=entrada.destinatario_nome,
                destinatario_email=entrada.destinatario_email,
                vinculo=entrada.vinculo,
                solicitado_por=profissional.id,
                chave_idempotencia=chave,
            )
        )
        return EnvioSaida.de(envio)

    @rotas.get("/{id}/email", response_model=ListaEnvios, summary="Situação dos envios")
    async def listar_envios(id: UUID) -> ListaEnvios:
        return ListaEnvios(itens=[EnvioSaida.de(envio) for envio in await envios.listar(id)])

    @rotas.post(
        "/email/{envioId}/reenvio",
        status_code=202,
        response_model=EnvioSaida,
        summary="Recoloca na fila um envio em FALHA_DEFINITIVA",
    )
    async def reenviar(envio_id: Annotated[UUID, Path(alias="envioId")]) -> EnvioSaida:
        return EnvioSaida.de(await envios.reenviar(envio_id))

    return rotas
