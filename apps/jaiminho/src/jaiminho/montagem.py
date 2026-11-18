"""Montagem manual das dependências, em um único lugar (não há contêiner de injeção)."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

import httpx
from fastapi import FastAPI

from jaiminho.aplicacao.documentos import DocumentosUseCases
from jaiminho.aplicacao.envios import EnviosUseCases, WorkerEnvios
from jaiminho.dominio.portas import EnviadorEmail
from jaiminho.http.app import criar_app, criar_app_gestao
from jaiminho.http.rotas import criar_rotas
from jaiminho.infra.banco import DocumentoRepositorySql, EnvioRepositorySql, banco_responde, criar_pool
from jaiminho.infra.clinico import ClienteClinicoHttp
from jaiminho.infra.config import Config
from jaiminho.infra.email import EnviadorEmailSmtp
from jaiminho.infra.jwks import ValidadorToken
from jaiminho.infra.log import BufferLogAcesso
from jaiminho.infra.pdf.renderizador import RenderizadorFichaWeasyPrint

log = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class Servico:
    api: FastAPI
    gestao: FastAPI
    worker: WorkerEnvios


def montar(config: Config, enviador: EnviadorEmail | None = None) -> Servico:
    """`enviador` só é passado pelos testes (Adapter falso); em produção é o SMTP da configuração."""
    pool = criar_pool(config.database_url)
    http = httpx.AsyncClient(timeout=httpx.Timeout(5.0, connect=2.0))

    documentos = DocumentoRepositorySql(pool)
    envios = EnvioRepositorySql(pool)
    registro_acesso = BufferLogAcesso(pool, config.intervalo_log_acesso_segundos)
    worker = WorkerEnvios(
        envios,
        documentos,
        enviador
        or EnviadorEmailSmtp(
            config.smtp_host,
            config.smtp_porta,
            config.email_remetente,
            config.smtp_seguranca,
            config.smtp_usuario,
            config.smtp_senha,
        ),
        config.email_backoff_segundos,
        config.intervalo_fila_segundos,
    )

    @asynccontextmanager
    async def ciclo_de_vida(_: FastAPI) -> AsyncIterator[None]:
        # Não espera o banco: sem ele o serviço sobe e /health/ready responde 503.
        await pool.open(wait=False)
        registro_acesso.iniciar()
        worker.iniciar()
        log.info("jaiminho no ar", extra={"ambiente": config.ambiente})
        try:
            yield
        finally:
            # Encerramento gracioso: termina o envio em andamento, descarrega o log de acesso, fecha conexões.
            await worker.encerrar()
            await registro_acesso.encerrar()
            await http.aclose()
            await pool.close()
            log.info("jaiminho encerrado")

    casos_envio = EnviosUseCases(envios, documentos, worker)
    rotas = criar_rotas(
        DocumentosUseCases(
            documentos,
            ClienteClinicoHttp(http, config.clinico_url),
            RenderizadorFichaWeasyPrint(config.url_publica_portal),
            casos_envio,
        ),
        casos_envio,
    )
    api = criar_app(
        rotas,
        ValidadorToken(http, config.jwks_url),
        registro_acesso,
        config.proxies_confiaveis,
        ciclo_de_vida,
    )
    return Servico(api=api, gestao=criar_app_gestao(lambda: banco_responde(pool)), worker=worker)
