"""Casos de uso de envio por e-mail e o worker da fila (fila em tabela, sem broker)."""

import asyncio
import contextlib
import logging
from datetime import UTC, datetime
from uuid import UUID

from jaiminho.dominio.modelos import (
    ChaveIdempotenciaConflitante,
    Envio,
    NaoEncontrado,
    NovoEnvio,
    RegraViolada,
)
from jaiminho.dominio.portas import DocumentoRepository, EnviadorEmail, EnvioRepository
from jaiminho.dominio.regras import LIMITE_ENVIANDO, montar_mensagem, proxima_situacao

log = logging.getLogger(__name__)


class WorkerEnvios:
    """Consome a fila no mesmo processo. Entrega ao menos uma vez."""

    def __init__(
        self,
        envios: EnvioRepository,
        documentos: DocumentoRepository,
        enviador: EnviadorEmail,
        backoff_segundos: tuple[int, ...],
        intervalo_segundos: float = 5.0,
    ) -> None:
        self._envios = envios
        self._documentos = documentos
        self._enviador = enviador
        self._backoff = backoff_segundos
        self._intervalo = intervalo_segundos
        self._acordar = asyncio.Event()
        self._parar = asyncio.Event()
        self._tarefa: asyncio.Task[None] | None = None

    def iniciar(self) -> None:
        self._tarefa = asyncio.create_task(self._laco(), name="worker-envios")

    def acordar(self) -> None:
        """Há envio novo: não espera o próximo ciclo de 5 s."""
        self._acordar.set()

    async def encerrar(self, espera_segundos: float = 15.0) -> None:
        """Deixa o envio em andamento terminar; o que sobrar em ENVIANDO volta sozinho em 5 min."""
        self._parar.set()
        self._acordar.set()
        if self._tarefa:
            try:
                await asyncio.wait_for(self._tarefa, espera_segundos)
            except TimeoutError:
                log.warning("worker de envios não terminou a tempo; cancelado")
            except Exception:
                log.exception("worker de envios terminou com erro")

    async def _laco(self) -> None:
        while not self._parar.is_set():
            self._acordar.clear()
            try:
                await self.processar_pendentes()
            except Exception as erro:
                # Banco fora, por exemplo: tenta de novo no próximo ciclo.
                log.error("falha no ciclo da fila de e-mail", extra={"erro": type(erro).__name__})
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._acordar.wait(), self._intervalo)

    async def processar_pendentes(self) -> int:
        """Um ciclo: libera os abandonados e envia tudo o que está vencido."""
        await self._envios.liberar_abandonados(LIMITE_ENVIANDO.total_seconds())
        processados = 0
        while not self._parar.is_set():
            envio = await self._envios.reservar_proximo()
            if not envio:
                break
            await self._processar(envio)
            processados += 1
        return processados

    async def _processar(self, envio: Envio) -> None:
        tentativa = envio.tentativas + 1
        campos = {"envioId": str(envio.id), "tentativa": tentativa}
        try:
            arquivo = await self._documentos.buscar_pdf(envio.documento_id)
            if not arquivo:
                raise LookupError("documento do envio não existe")
            await self._enviador.enviar(montar_mensagem(envio, arquivo.codigo_verificacao, arquivo.conteudo))
        except Exception as erro:
            status, proxima = proxima_situacao(tentativa, self._backoff, datetime.now(UTC))
            # Só a classe do erro (e o código SMTP, se houver): a mensagem do servidor pode trazer
            # o endereço do destinatário.
            descricao = type(erro).__name__
            codigo = getattr(erro, "code", None)
            if isinstance(codigo, int):
                descricao += f" {codigo}"
            await self._envios.marcar_falha(envio.id, status, proxima, descricao)
            log.warning("falha ao enviar e-mail", extra={**campos, "erro": descricao, "status": status})
            return
        await self._envios.marcar_enviado(envio.id)
        log.info("e-mail enviado", extra=campos)


class EnviosUseCases:
    def __init__(self, envios: EnvioRepository, documentos: DocumentoRepository, worker: WorkerEnvios) -> None:
        self._envios = envios
        self._documentos = documentos
        self._worker = worker

    async def solicitar(self, novo: NovoEnvio) -> Envio:
        """Só grava PENDENTE: falha de SMTP nunca falha a requisição."""
        if not await self._documentos.buscar(novo.documento_id):
            raise NaoEncontrado("Documento não encontrado")
        envio = await self._envios.inserir(novo)
        if envio:
            self._worker.acordar()
            return envio

        # Chave já usada: mesma solicitação => mesmo envio; solicitação diferente => conflito.
        existente = await self._envios.buscar_por_chave(novo.chave_idempotencia) if novo.chave_idempotencia else None
        if not existente:
            raise RuntimeError("envio não inserido e chave de idempotência não encontrada")
        mesmo_pedido = (
            existente.documento_id == novo.documento_id
            and existente.destinatario_nome == novo.destinatario_nome
            and existente.destinatario_email == novo.destinatario_email
            and existente.vinculo == novo.vinculo
        )
        if not mesmo_pedido:
            raise ChaveIdempotenciaConflitante("A mesma Idempotency-Key já foi usada com outro conteúdo")
        return existente

    async def listar(self, documento_id: UUID) -> list[Envio]:
        if not await self._documentos.buscar(documento_id):
            raise NaoEncontrado("Documento não encontrado")
        return await self._envios.listar_por_documento(documento_id)

    async def reenviar(self, envio_id: UUID) -> Envio:
        envio = await self._envios.recolocar_na_fila(envio_id)
        if envio:
            self._worker.acordar()
            return envio
        if not await self._envios.buscar(envio_id):
            raise NaoEncontrado("Envio não encontrado")
        raise RegraViolada("Só é possível reenviar um envio em FALHA_DEFINITIVA")
