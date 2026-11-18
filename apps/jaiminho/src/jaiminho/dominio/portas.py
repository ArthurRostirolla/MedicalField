"""Interfaces que a infra implementa (Repository e Adapter)."""

from datetime import datetime
from typing import Any, Protocol
from uuid import UUID

from jaiminho.dominio.modelos import ArquivoPdf, Documento, Envio, MensagemEmail, NovoDocumento, NovoEnvio


class DocumentoRepository(Protocol):
    async def buscar_por_conteudo(self, atendimento_id: UUID, hash_conteudo: str) -> Documento | None: ...

    async def inserir(self, novo: NovoDocumento) -> Documento | None:
        """Devolve None se já existia documento com o mesmo (atendimento, conteúdo)."""
        ...

    async def listar_por_atendimento(self, atendimento_id: UUID) -> list[Documento]: ...

    async def buscar(self, documento_id: UUID) -> Documento | None:
        """Com `integro` preenchido."""
        ...

    async def buscar_pdf(self, documento_id: UUID) -> ArquivoPdf | None: ...


class EnvioRepository(Protocol):
    async def inserir(self, novo: NovoEnvio) -> Envio | None:
        """Devolve None se a chave de idempotência já foi usada."""
        ...

    async def buscar_por_chave(self, chave: UUID) -> Envio | None: ...

    async def listar_por_documento(self, documento_id: UUID) -> list[Envio]: ...

    async def buscar(self, envio_id: UUID) -> Envio | None: ...

    async def recolocar_na_fila(self, envio_id: UUID) -> Envio | None:
        """Só a partir de FALHA_DEFINITIVA; devolve None se não estava nessa situação."""
        ...

    async def liberar_abandonados(self, segundos: float) -> int:
        """ENVIANDO há mais de `segundos` volta a PENDENTE."""
        ...

    async def reservar_proximo(self) -> Envio | None:
        """Pega um PENDENTE vencido (FOR UPDATE SKIP LOCKED) e marca ENVIANDO."""
        ...

    async def marcar_enviado(self, envio_id: UUID) -> None: ...

    async def marcar_falha(self, envio_id: UUID, status: str, proxima_tentativa_em: datetime, erro: str) -> None: ...


class ClienteClinico(Protocol):
    async def buscar_ficha(self, atendimento_id: UUID, autorizacao: str, request_id: str) -> dict[str, Any]:
        """Ficha da DonaCida. Levanta NaoEncontrado, NaoAutenticado ou ServicoIndisponivel."""
        ...


class RenderizadorFicha(Protocol):
    def renderizar(
        self, ficha: dict[str, Any], documento_id: UUID, codigo_verificacao: str, gerado_em: datetime
    ) -> bytes: ...


class EnviadorEmail(Protocol):
    """Adapter: a fila não sabe se por trás há SMTP ou um falso de teste."""

    async def enviar(self, mensagem: MensagemEmail) -> None: ...
