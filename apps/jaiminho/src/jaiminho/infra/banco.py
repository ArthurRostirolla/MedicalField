"""Repositórios em SQL explícito (psycopg 3, pool assíncrono)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any
from uuid import UUID

import psycopg
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool, PoolTimeout

from jaiminho.dominio.modelos import (
    ArquivoPdf,
    Documento,
    Envio,
    NovoDocumento,
    NovoEnvio,
    ServicoIndisponivel,
)


def criar_pool(database_url: str) -> AsyncConnectionPool:
    """Pool fechado; quem monta o serviço abre (sem esperar o banco) e fecha."""
    return AsyncConnectionPool(
        database_url,
        min_size=1,
        max_size=5,
        timeout=5,
        open=False,
        # autocommit: cada operação é um único comando; nenhuma transação fica aberta por engano.
        kwargs={"autocommit": True, "row_factory": dict_row},
    )


async def banco_responde(pool: AsyncConnectionPool) -> bool:
    try:
        async with pool.connection(timeout=2) as conexao:
            await conexao.execute("SELECT 1")
        return True
    except Exception:
        return False


class _Repositorio:
    def __init__(self, pool: AsyncConnectionPool) -> None:
        self._pool = pool

    @asynccontextmanager
    async def _conexao(self) -> AsyncIterator[psycopg.AsyncConnection[dict[str, Any]]]:
        try:
            async with self._pool.connection() as conexao:
                yield conexao
        except (PoolTimeout, psycopg.OperationalError) as erro:
            raise ServicoIndisponivel("Banco de dados indisponível") from erro

    async def _um(self, sql: str, parametros: tuple[Any, ...]) -> dict[str, Any] | None:
        async with self._conexao() as conexao:
            cursor = await conexao.execute(sql, parametros)
            return await cursor.fetchone()

    async def _todos(self, sql: str, parametros: tuple[Any, ...]) -> list[dict[str, Any]]:
        async with self._conexao() as conexao:
            cursor = await conexao.execute(sql, parametros)
            return await cursor.fetchall()


_COLUNAS_DOCUMENTO = """
  id, atendimento_id, codigo_verificacao, hash_conteudo, gerado_por, gerado_em,
  octet_length(pdf) AS tamanho_bytes
"""


class DocumentoRepositorySql(_Repositorio):
    async def buscar_por_conteudo(self, atendimento_id: UUID, hash_conteudo: str) -> Documento | None:
        linha = await self._um(
            f"SELECT {_COLUNAS_DOCUMENTO} FROM documentos.documento"  # noqa: S608 - só constantes
            " WHERE atendimento_id = %s AND hash_conteudo = %s",
            (atendimento_id, hash_conteudo),
        )
        return Documento(**linha) if linha else None

    async def inserir(self, novo: NovoDocumento) -> Documento | None:
        # ponytail: ON CONFLICT sem alvo também engole colisão de codigo_verificacao (~1 em 10^12);
        # nesse caso o caso de uso falha com 500 e o usuário repete.
        linha = await self._um(
            f"""
            INSERT INTO documentos.documento
              (id, atendimento_id, hash_conteudo, hash_pdf, codigo_verificacao, pdf, gerado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT DO NOTHING
            RETURNING {_COLUNAS_DOCUMENTO}
            """,  # noqa: S608
            (
                novo.id,
                novo.atendimento_id,
                novo.hash_conteudo,
                novo.hash_pdf,
                novo.codigo_verificacao,
                novo.pdf,
                novo.gerado_por,
            ),
        )
        return Documento(**linha) if linha else None

    async def listar_por_atendimento(self, atendimento_id: UUID) -> list[Documento]:
        linhas = await self._todos(
            f"SELECT {_COLUNAS_DOCUMENTO} FROM documentos.documento"  # noqa: S608
            " WHERE atendimento_id = %s ORDER BY gerado_em DESC",
            (atendimento_id,),
        )
        return [Documento(**linha) for linha in linhas]

    async def buscar(self, documento_id: UUID) -> Documento | None:
        linha = await self._um(
            f"SELECT {_COLUNAS_DOCUMENTO}, encode(sha256(pdf), 'hex') = hash_pdf AS integro"  # noqa: S608
            " FROM documentos.documento WHERE id = %s",
            (documento_id,),
        )
        return Documento(**linha) if linha else None

    async def buscar_pdf(self, documento_id: UUID) -> ArquivoPdf | None:
        linha = await self._um(
            "SELECT codigo_verificacao, pdf FROM documentos.documento WHERE id = %s", (documento_id,)
        )
        return ArquivoPdf(linha["codigo_verificacao"], bytes(linha["pdf"])) if linha else None


_COLUNAS_ENVIO = """
  id, documento_id, destinatario_nome, destinatario_email, vinculo, status, tentativas,
  proxima_tentativa_em, ultimo_erro, solicitado_por, criado_em, enviado_em
"""


class EnvioRepositorySql(_Repositorio):
    async def inserir(self, novo: NovoEnvio) -> Envio | None:
        linha = await self._um(
            f"""
            INSERT INTO documentos.envio_email
              (documento_id, chave_idempotencia, destinatario_nome, destinatario_email, vinculo, solicitado_por)
            VALUES (%s, %s, %s, %s, %s, %s)
            ON CONFLICT (chave_idempotencia) DO NOTHING
            RETURNING {_COLUNAS_ENVIO}
            """,  # noqa: S608
            (
                novo.documento_id,
                novo.chave_idempotencia,
                novo.destinatario_nome,
                novo.destinatario_email,
                novo.vinculo,
                novo.solicitado_por,
            ),
        )
        return Envio(**linha) if linha else None

    async def buscar_por_chave(self, chave: UUID) -> Envio | None:
        linha = await self._um(
            f"SELECT {_COLUNAS_ENVIO} FROM documentos.envio_email WHERE chave_idempotencia = %s",  # noqa: S608
            (chave,),
        )
        return Envio(**linha) if linha else None

    async def listar_por_documento(self, documento_id: UUID) -> list[Envio]:
        linhas = await self._todos(
            f"SELECT {_COLUNAS_ENVIO} FROM documentos.envio_email"  # noqa: S608
            " WHERE documento_id = %s ORDER BY criado_em, id",
            (documento_id,),
        )
        return [Envio(**linha) for linha in linhas]

    async def buscar(self, envio_id: UUID) -> Envio | None:
        linha = await self._um(
            f"SELECT {_COLUNAS_ENVIO} FROM documentos.envio_email WHERE id = %s",  # noqa: S608
            (envio_id,),
        )
        return Envio(**linha) if linha else None

    async def recolocar_na_fila(self, envio_id: UUID) -> Envio | None:
        # Novo ciclo de tentativas; ultimo_erro fica como histórico até o próximo resultado.
        linha = await self._um(
            f"""
            UPDATE documentos.envio_email
               SET status = 'PENDENTE', tentativas = 0, proxima_tentativa_em = now(), atualizado_em = now()
             WHERE id = %s AND status = 'FALHA_DEFINITIVA'
            RETURNING {_COLUNAS_ENVIO}
            """,  # noqa: S608
            (envio_id,),
        )
        return Envio(**linha) if linha else None

    async def liberar_abandonados(self, segundos: float) -> int:
        async with self._conexao() as conexao:
            cursor = await conexao.execute(
                """
                UPDATE documentos.envio_email
                   SET status = 'PENDENTE', atualizado_em = now()
                 WHERE status = 'ENVIANDO' AND atualizado_em < now() - make_interval(secs => %s)
                """,
                (segundos,),
            )
            return cursor.rowcount

    async def reservar_proximo(self) -> Envio | None:
        # Um comando só: escolhe e marca. SKIP LOCKED deixa duas réplicas consumirem sem se bloquear.
        linha = await self._um(
            f"""
            UPDATE documentos.envio_email
               SET status = 'ENVIANDO', atualizado_em = now()
             WHERE id = (
                     SELECT id FROM documentos.envio_email
                      WHERE status = 'PENDENTE' AND proxima_tentativa_em <= now()
                      ORDER BY proxima_tentativa_em
                      LIMIT 1
                        FOR UPDATE SKIP LOCKED)
            RETURNING {_COLUNAS_ENVIO}
            """,  # noqa: S608
            (),
        )
        return Envio(**linha) if linha else None

    async def marcar_enviado(self, envio_id: UUID) -> None:
        await self._um(
            """
            UPDATE documentos.envio_email
               SET status = 'ENVIADO', tentativas = tentativas + 1, enviado_em = now(), ultimo_erro = NULL,
                   atualizado_em = now()
             WHERE id = %s
            RETURNING id
            """,
            (envio_id,),
        )

    async def marcar_falha(self, envio_id: UUID, status: str, proxima_tentativa_em: datetime, erro: str) -> None:
        await self._um(
            """
            UPDATE documentos.envio_email
               SET status = %s, tentativas = tentativas + 1, proxima_tentativa_em = %s, ultimo_erro = %s,
                   atualizado_em = now()
             WHERE id = %s
            RETURNING id
            """,
            (status, proxima_tentativa_em, erro[:200], envio_id),
        )
