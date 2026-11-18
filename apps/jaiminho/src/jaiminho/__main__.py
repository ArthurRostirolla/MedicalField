"""Ponto de entrada: `python -m jaiminho`. Sobe a API e a porta de gestão no mesmo processo."""

import asyncio
import contextlib
import logging
import os
import signal
import sys
from collections.abc import Iterator

import uvicorn

from jaiminho.infra.config import ConfiguracaoInvalida, carregar
from jaiminho.infra.log import configurar_log
from jaiminho.montagem import montar

log = logging.getLogger("jaiminho")


class _Servidor(uvicorn.Server):
    """Dois servidores no mesmo processo: os sinais são tratados uma vez só, em `executar`."""

    @contextlib.contextmanager
    def capture_signals(self) -> Iterator[None]:
        yield


async def executar() -> None:
    config = carregar(os.environ)
    configurar_log(config.nivel_log)
    servico = montar(config)

    def servidor(app: object, porta: int) -> _Servidor:
        return _Servidor(
            uvicorn.Config(
                app,  # type: ignore[arg-type]
                host="0.0.0.0",  # noqa: S104 - contêiner: quem limita o acesso é a rede do cluster
                port=porta,
                log_config=None,
                access_log=False,
                # O par direto é o que vale; o X-Forwarded-For é tratado pela regra do contrato.
                proxy_headers=False,
                server_header=False,
                timeout_graceful_shutdown=20,
            )
        )

    api = servidor(servico.api, config.porta)
    gestao = servidor(servico.gestao, config.porta_gestao)

    def encerrar() -> None:
        log.info("sinal de encerramento recebido")
        api.should_exit = True

    laco = asyncio.get_running_loop()
    for sinal in (signal.SIGTERM, signal.SIGINT):
        laco.add_signal_handler(sinal, encerrar)

    tarefa_gestao = asyncio.create_task(gestao.serve())
    try:
        # A API para de aceitar, termina o que está em andamento e roda o encerramento (worker, buffer, pool).
        await api.serve()
    finally:
        # A gestão fica por último: /health/live responde durante todo o desligamento.
        gestao.should_exit = True
        await tarefa_gestao


def main() -> None:
    try:
        asyncio.run(executar())
    except ConfiguracaoInvalida as erro:
        print(f"configuração inválida: {erro}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
