"""Ambiente dos testes de integração: Postgres real, DonaCida/JWKS falsos (HTTP de verdade) e SMTP falso."""

import asyncio
import ipaddress
import os
import socket
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from dataclasses import dataclass, replace
from typing import Any
from uuid import uuid4

import httpx
import psycopg
import pytest
from psycopg.rows import dict_row

from jaiminho.infra.config import Config
from jaiminho.infra.email import EnviadorEmailFalso
from jaiminho.montagem import Servico, montar
from tests.falsos import ServidorFalso, ficha_exemplo

URL_BANCO = os.environ.get(
    "TESTE_DATABASE_URL", "postgresql://mf_jaiminho:dev_jaiminho@localhost:5432/mf_teste_jaiminho"
)
# O papel do serviço não lê auditoria.log_acesso nem apaga linhas: as conferências usam o administrador.
URL_BANCO_ADMIN = os.environ.get(
    "TESTE_DATABASE_URL_ADMIN", "postgresql://postgres:dev_admin@localhost:5432/mf_teste_jaiminho"
)


@pytest.fixture(scope="session")
def admin() -> Iterator[psycopg.Connection[dict[str, Any]]]:
    with psycopg.connect(URL_BANCO_ADMIN, autocommit=True, row_factory=dict_row) as conexao:
        # Sobras de uma execução anterior seriam consumidas pelo worker deste teste.
        conexao.execute("TRUNCATE documentos.envio_email, documentos.documento")
        yield conexao


@pytest.fixture
def falso() -> Iterator[ServidorFalso]:
    servidor = ServidorFalso().iniciar()
    yield servidor
    servidor.parar()


def porta_fechada() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@dataclass
class Ambiente:
    cliente: httpx.AsyncClient
    gestao: httpx.AsyncClient
    servico: Servico
    falso: ServidorFalso
    enviador: EnviadorEmailFalso
    admin: psycopg.Connection[dict[str, Any]]
    ciclo: Any
    encerrado: bool = False

    async def encerrar(self) -> None:
        """Encerramento gracioso do serviço (o mesmo caminho do SIGTERM)."""
        if not self.encerrado:
            self.encerrado = True
            await self.ciclo.__aexit__(None, None, None)

    def autorizacao(self, **claims: Any) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.falso.token(**claims)}"}

    def novo_atendimento(self) -> str:
        atendimento_id = str(uuid4())
        self.falso.fichas[atendimento_id] = ficha_exemplo(atendimento_id)
        return atendimento_id

    async def gerar(self, atendimento_id: str | None = None) -> dict[str, Any]:
        resposta = await self.cliente.post(
            "/api/v1/documento/ficha-atendimento",
            json={"atendimentoId": atendimento_id or self.novo_atendimento()},
            headers=self.autorizacao(),
        )
        assert resposta.status_code == 201, resposta.text
        return resposta.json()

    async def envio(self, envio_id: str) -> dict[str, Any]:
        linha = self.admin.execute("SELECT * FROM documentos.envio_email WHERE id = %s", (envio_id,)).fetchone()
        assert linha is not None
        return linha

    async def aguardar(self, condicao: Callable[[], Awaitable[bool]], segundos: float = 15) -> None:
        fim = asyncio.get_running_loop().time() + segundos
        while not await condicao():
            assert asyncio.get_running_loop().time() < fim, "condição não atingida a tempo"
            await asyncio.sleep(0.05)

    async def aguardar_status(self, envio_id: str, status: str) -> dict[str, Any]:
        async def chegou() -> bool:
            return (await self.envio(envio_id))["status"] == status

        await self.aguardar(chegou)
        return await self.envio(envio_id)


FabricaAmbiente = Callable[..., Awaitable[Ambiente]]


@pytest.fixture
async def criar_ambiente(
    falso: ServidorFalso, admin: psycopg.Connection[dict[str, Any]]
) -> AsyncIterator[FabricaAmbiente]:
    """Sobe o serviço inteiro (ciclo de vida, worker, buffer de log) dentro do teste."""
    pilha: list[Ambiente] = []

    async def criar(enviador: EnviadorEmailFalso | None = None, **ajustes: Any) -> Ambiente:
        config = replace(
            Config(
                database_url=URL_BANCO,
                jwks_url=f"{falso.url}/jwks.json",
                clinico_url=falso.url,
                url_publica_portal="https://medicalfield.teste/portal",
                smtp_host="localhost",
                smtp_porta=1,
                email_remetente="MedicalField <nao-responda@medicalfield.teste>",
                email_backoff_segundos=(0, 0, 0, 0),
                proxies_confiaveis=(ipaddress.ip_network("127.0.0.1/32"),),
                intervalo_fila_segundos=0.05,
                intervalo_log_acesso_segundos=0.05,
            ),
            **ajustes,
        )
        enviador = enviador or EnviadorEmailFalso()
        servico = montar(config, enviador=enviador)
        ciclo = servico.api.router.lifespan_context(servico.api)
        await ciclo.__aenter__()
        cliente = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=servico.api, client=("127.0.0.1", 40000)),
            base_url="http://jaiminho",
        )
        gestao = httpx.AsyncClient(transport=httpx.ASGITransport(app=servico.gestao), base_url="http://gestao")
        ambiente = Ambiente(cliente, gestao, servico, falso, enviador, admin, ciclo)
        pilha.append(ambiente)
        return ambiente

    yield criar
    for ambiente in reversed(pilha):
        await ambiente.cliente.aclose()
        await ambiente.gestao.aclose()
        await ambiente.encerrar()


@pytest.fixture
async def ambiente(criar_ambiente: FabricaAmbiente) -> Ambiente:
    return await criar_ambiente()
