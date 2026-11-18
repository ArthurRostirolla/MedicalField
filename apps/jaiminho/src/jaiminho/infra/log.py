"""Log em JSON no stdout e o buffer assíncrono do log de acesso (auditoria.log_acesso)."""

import asyncio
import contextlib
import json
import logging
import sys
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from psycopg_pool import AsyncConnectionPool

from jaiminho import SERVICO

request_id_atual: ContextVar[str | None] = ContextVar("request_id_atual", default=None)

log = logging.getLogger(__name__)

_NIVEIS = {"DEBUG": "debug", "INFO": "info", "WARNING": "warn", "ERROR": "error", "CRITICAL": "error"}
# Atributos que todo LogRecord tem; o resto veio por `extra=` e entra na linha.
_PADRAO = set(logging.makeLogRecord({}).__dict__) | {"message", "asctime", "taskName", "color_message"}


def iso_utc(momento: datetime) -> str:
    """ISO-8601 UTC com milissegundos e Z, como o contrato pede."""
    return momento.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


class _FormatadorJson(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        linha = {
            "nivel": _NIVEIS.get(record.levelname, "info"),
            "tipo": "aplicacao",
            "dataHora": iso_utc(datetime.fromtimestamp(record.created, UTC)),
            "servico": SERVICO,
            "origem": record.name,
            "mensagem": record.getMessage(),
        }
        if request_id := request_id_atual.get():
            linha["requestId"] = request_id
        linha.update({chave: valor for chave, valor in record.__dict__.items() if chave not in _PADRAO})
        if record.exc_info:
            linha["excecao"] = self.formatException(record.exc_info)
        return json.dumps(linha, ensure_ascii=False, default=str)


def configurar_log(nivel: str) -> None:
    saida = logging.StreamHandler(sys.stdout)
    saida.setFormatter(_FormatadorJson())
    raiz = logging.getLogger()
    raiz.handlers[:] = [saida]
    raiz.setLevel(nivel.upper())
    # httpx registra a URL de cada chamada em INFO; fontTools detalha cada fonte embutida.
    for barulhento in ("httpx", "httpcore", "fontTools", "weasyprint"):
        logging.getLogger(barulhento).setLevel(logging.WARNING)


@dataclass(frozen=True, slots=True)
class LinhaAcesso:
    data_hora: datetime
    ip_cliente: str
    profissional_id: UUID | None
    metodo: str
    rota: str
    status_code: int
    tempo_ms: int
    request_id: str


class BufferLogAcesso:
    """Guarda as linhas em memória e grava em lote: a cada 1 s, a cada 100 linhas e no encerramento.

    Falha ao gravar nunca chega à requisição; a linha já saiu no stdout.
    """

    LOTE = 100
    # ponytail: teto fixo; com o banco fora por muito tempo as linhas mais antigas são descartadas.
    TETO = 10_000

    def __init__(self, pool: AsyncConnectionPool, intervalo_segundos: float = 1.0) -> None:
        self._pool = pool
        self._intervalo = intervalo_segundos
        self._linhas: list[LinhaAcesso] = []
        self._cheio = asyncio.Event()
        self._parar = False
        self._tarefa: asyncio.Task[None] | None = None

    def iniciar(self) -> None:
        self._tarefa = asyncio.create_task(self._laco(), name="log-acesso")

    def registrar(self, linha: LinhaAcesso) -> None:
        sys.stdout.write(
            json.dumps(
                {
                    "nivel": "info",
                    "tipo": "acesso",
                    "dataHora": iso_utc(linha.data_hora),
                    "servico": SERVICO,
                    "ipCliente": linha.ip_cliente,
                    "profissionalId": str(linha.profissional_id) if linha.profissional_id else None,
                    "metodo": linha.metodo,
                    "rota": linha.rota,
                    "statusCode": linha.status_code,
                    "tempoMs": linha.tempo_ms,
                    "requestId": linha.request_id,
                },
                ensure_ascii=False,
            )
            + "\n"
        )
        self._linhas.append(linha)
        if len(self._linhas) > self.TETO:
            del self._linhas[: -self.TETO]
        if len(self._linhas) >= self.LOTE:
            self._cheio.set()

    async def _laco(self) -> None:
        while not self._parar:
            with contextlib.suppress(TimeoutError):
                await asyncio.wait_for(self._cheio.wait(), self._intervalo)
            self._cheio.clear()
            await self.descarregar()

    async def descarregar(self) -> None:
        if not self._linhas:
            return
        linhas, self._linhas = self._linhas, []
        try:
            async with self._pool.connection() as conexao, conexao.cursor() as cursor:
                await cursor.executemany(
                    """
                    INSERT INTO auditoria.log_acesso
                      (data_hora, servico, ip_cliente, profissional_id, metodo, rota, status_code, tempo_ms,
                       request_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    [
                        (
                            linha.data_hora,
                            SERVICO,
                            linha.ip_cliente,
                            linha.profissional_id,
                            linha.metodo,
                            linha.rota,
                            linha.status_code,
                            linha.tempo_ms,
                            linha.request_id,
                        )
                        for linha in linhas
                    ],
                )
        except Exception as erro:
            # Devolve ao buffer para a próxima descarga (até o teto).
            self._linhas = (linhas + self._linhas)[-self.TETO :]
            log.error("falha ao gravar o log de acesso", extra={"erro": type(erro).__name__})

    async def encerrar(self) -> None:
        # Sem cancelar: uma descarga em andamento termina antes da última.
        self._parar = True
        self._cheio.set()
        if self._tarefa:
            await self._tarefa
        await self.descarregar()
