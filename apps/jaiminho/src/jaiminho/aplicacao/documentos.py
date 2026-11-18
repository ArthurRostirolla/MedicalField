"""Casos de uso de documento: gerar a ficha, consultar e baixar."""

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID, uuid4

from jaiminho.dominio.modelos import ArquivoPdf, Documento, NaoEncontrado, NovoDocumento, Profissional
from jaiminho.dominio.portas import ClienteClinico, DocumentoRepository, RenderizadorFicha
from jaiminho.dominio.regras import gerar_codigo_verificacao, hash_bytes, hash_canonico

log = logging.getLogger(__name__)


class DocumentosUseCases:
    def __init__(
        self, documentos: DocumentoRepository, clinico: ClienteClinico, renderizador: RenderizadorFicha
    ) -> None:
        self._documentos = documentos
        self._clinico = clinico
        self._renderizador = renderizador

    async def gerar_ficha(
        self, atendimento_id: UUID, profissional: Profissional, autorizacao: str, request_id: str
    ) -> tuple[Documento, bool]:
        """Devolve (documento, criado). Mesmo conteúdo => mesmo documento, sem gerar outro PDF."""
        # Nada é gravado antes da ficha chegar: DonaCida fora não deixa linha órfã.
        ficha = await self._clinico.buscar_ficha(atendimento_id, autorizacao, request_id)
        hash_conteudo = hash_canonico(ficha)

        existente = await self._documentos.buscar_por_conteudo(atendimento_id, hash_conteudo)
        if existente:
            return existente, False

        documento_id = uuid4()
        codigo = gerar_codigo_verificacao()
        # WeasyPrint é síncrono e pesado (~1 s): fora do laço de eventos.
        pdf = await asyncio.to_thread(self._renderizador.renderizar, ficha, documento_id, codigo, datetime.now(UTC))
        criado = await self._documentos.inserir(
            NovoDocumento(
                id=documento_id,
                atendimento_id=atendimento_id,
                hash_conteudo=hash_conteudo,
                hash_pdf=hash_bytes(pdf),
                codigo_verificacao=codigo,
                pdf=pdf,
                gerado_por=profissional.id,
            )
        )
        if criado:
            log.info("ficha gerada", extra={"documentoId": str(criado.id), "tamanhoBytes": len(pdf)})
            return criado, True

        # Duas requisições iguais ao mesmo tempo: a outra gravou primeiro; fica a dela.
        existente = await self._documentos.buscar_por_conteudo(atendimento_id, hash_conteudo)
        if not existente:
            raise RuntimeError("documento concorrente não encontrado após conflito")
        return existente, False

    async def listar(self, atendimento_id: UUID) -> list[Documento]:
        return await self._documentos.listar_por_atendimento(atendimento_id)

    async def obter(self, documento_id: UUID) -> Documento:
        documento = await self._documentos.buscar(documento_id)
        if not documento:
            raise NaoEncontrado("Documento não encontrado")
        return documento

    async def baixar_pdf(self, documento_id: UUID) -> ArquivoPdf:
        arquivo = await self._documentos.buscar_pdf(documento_id)
        if not arquivo:
            raise NaoEncontrado("Documento não encontrado")
        return arquivo
