"""Cliente HTTP da DonaCida: uma leitura, com o JWT do próprio usuário."""

import logging
from typing import Any
from uuid import UUID

import httpx

from jaiminho.dominio.modelos import NaoAutenticado, NaoEncontrado, ServicoIndisponivel

log = logging.getLogger(__name__)

_CAMPOS_FICHA = ("atendimento", "pessoa", "prontuario", "eventos", "resumo")


class ClienteClinicoHttp:
    def __init__(self, cliente: httpx.AsyncClient, clinico_url: str) -> None:
        self._cliente = cliente
        self._url = clinico_url

    async def buscar_ficha(self, atendimento_id: UUID, autorizacao: str, request_id: str) -> dict[str, Any]:
        indisponivel = ServicoIndisponivel("Serviço clínico indisponível; tente novamente")
        try:
            resposta = await self._cliente.get(
                f"{self._url}/api/v1/ficha/{atendimento_id}",
                headers={"Authorization": autorizacao, "X-Request-Id": request_id},
            )
        except httpx.HTTPError as erro:
            log.warning("DonaCida inacessível", extra={"erro": type(erro).__name__})
            raise indisponivel from erro

        if resposta.status_code == 404:
            raise NaoEncontrado("Atendimento não encontrado")
        if resposta.status_code == 401:
            raise NaoAutenticado("Token recusado pelo serviço clínico")
        if resposta.status_code != 200:
            log.warning("DonaCida respondeu com erro", extra={"statusCode": resposta.status_code})
            raise indisponivel
        try:
            ficha = resposta.json()
        except ValueError as erro:
            raise indisponivel from erro
        if not isinstance(ficha, dict) or any(campo not in ficha for campo in _CAMPOS_FICHA):
            log.warning("DonaCida devolveu uma ficha fora do contrato")
            raise indisponivel
        return ficha
