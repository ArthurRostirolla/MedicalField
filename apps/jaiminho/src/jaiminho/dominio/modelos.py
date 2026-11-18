"""Entidades e erros do domínio de documentos. Sem framework, sem SQL, sem HTTP."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID


@dataclass(frozen=True, slots=True)
class Profissional:
    """Quem está autenticado (claims do JWT emitido pelo MikeBaguncinha)."""

    id: UUID
    nome: str
    papel: str


@dataclass(frozen=True, slots=True)
class Documento:
    id: UUID
    atendimento_id: UUID
    codigo_verificacao: str
    hash_conteudo: str
    gerado_por: UUID
    gerado_em: datetime
    tamanho_bytes: int
    # Só preenchido na consulta de um documento: sha256 do PDF guardado confere com hash_pdf.
    integro: bool | None = None


@dataclass(frozen=True, slots=True)
class NovoDocumento:
    id: UUID
    atendimento_id: UUID
    hash_conteudo: str
    hash_pdf: str
    codigo_verificacao: str
    pdf: bytes
    gerado_por: UUID


@dataclass(frozen=True, slots=True)
class ArquivoPdf:
    codigo_verificacao: str
    conteudo: bytes


@dataclass(frozen=True, slots=True)
class Envio:
    id: UUID
    documento_id: UUID
    destinatario_nome: str
    destinatario_email: str
    vinculo: str
    status: str
    tentativas: int
    proxima_tentativa_em: datetime
    ultimo_erro: str | None
    solicitado_por: UUID
    criado_em: datetime
    enviado_em: datetime | None


@dataclass(frozen=True, slots=True)
class NovoEnvio:
    documento_id: UUID
    destinatario_nome: str
    destinatario_email: str
    vinculo: str
    solicitado_por: UUID
    chave_idempotencia: UUID | None


@dataclass(frozen=True, slots=True)
class MensagemEmail:
    id_mensagem: str
    destinatario_nome: str
    destinatario_email: str
    assunto: str
    corpo: str
    anexo_nome: str
    anexo: bytes


class ErroDominio(Exception):
    """Erro previsto; a camada http traduz para o corpo padrão do contrato."""

    def __init__(self, mensagem: str) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem


class NaoAutenticado(ErroDominio):
    pass


class NaoEncontrado(ErroDominio):
    pass


class RegraViolada(ErroDominio):
    """Pedido bem formado, mas não permitido no estado atual (422 VALIDACAO)."""


class ChaveIdempotenciaConflitante(ErroDominio):
    pass


class ServicoIndisponivel(ErroDominio):
    """Dependência fora: banco, DonaCida ou JWKS."""
