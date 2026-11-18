"""Regressões dos defeitos do QA independente (docs/testes/defeitos-qa.md)."""

import time
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import httpx
import pytest

from jaiminho.dominio.modelos import ServicoIndisponivel
from jaiminho.http.middlewares import LIMITE_CORPO_BYTES
from jaiminho.infra.config import ConfiguracaoInvalida, carregar
from jaiminho.infra.jwks import ValidadorToken
from tests.conftest import Ambiente
from tests.falsos import Chave
from tests.test_integracao import DESTINATARIO, _erro, _linhas_de_log
from tests.test_unitarios import ENV

FICHA = "/api/v1/documento/ficha-atendimento"

# ---------- D-QA-08: teto de corpo ----------


async def test_corpo_acima_do_teto_e_recusado_pelo_content_length(ambiente: Ambiente) -> None:
    grande = b'{"atendimentoId":"' + b"x" * LIMITE_CORPO_BYTES + b'"}'
    cabecalhos = {"Content-Type": "application/json"}

    resposta = await ambiente.cliente.post(FICHA, content=grande, headers={**ambiente.autorizacao(), **cabecalhos})
    corpo = _erro(resposta, 413, "VALIDACAO")
    assert str(LIMITE_CORPO_BYTES) in corpo["mensagem"]
    assert resposta.headers["connection"] == "close"

    # Sem token também: o teto vem antes da autenticação, ninguém despeja megabytes para ganhar um 401.
    _erro(await ambiente.cliente.post(FICHA, content=grande, headers=cabecalhos), 413, "VALIDACAO")


async def test_corpo_sem_content_length_e_cortado_sem_ler_tudo(ambiente: Ambiente) -> None:
    pedaco = b"x" * 16 * 1024
    total = 1280  # 20 MB, como no defeito
    lidos = 0

    async def fluxo() -> AsyncIterator[bytes]:
        nonlocal lidos
        for _ in range(total):
            lidos += 1
            yield pedaco

    resposta = await ambiente.cliente.post(
        FICHA, content=fluxo(), headers={**ambiente.autorizacao(), "Content-Type": "application/json"}
    )
    assert "content-length" not in resposta.request.headers
    _erro(resposta, 413, "VALIDACAO")
    # Parou logo depois de passar do teto (64 KiB = 4 pedaços), não nos 20 MB.
    assert lidos <= 6

    # A recusa entra no log de acesso com o padrão da rota.
    request_id = resposta.headers["x-request-id"]
    (linha,) = await _linhas_de_log(ambiente, request_id)
    assert (linha["status_code"], linha["rota"]) == (413, FICHA)


async def test_corpo_no_limite_passa(ambiente: Ambiente) -> None:
    # Um JSON válido com exatamente o teto de bytes chega ao handler (e é recusado por ele, com 422).
    recheio = LIMITE_CORPO_BYTES - len('{"atendimentoId":""}')
    resposta = await ambiente.cliente.post(
        FICHA,
        content=('{"atendimentoId":"' + "x" * recheio + '"}').encode(),
        headers={**ambiente.autorizacao(), "Content-Type": "application/json"},
    )
    assert len(resposta.request.content) == LIMITE_CORPO_BYTES
    _erro(resposta, 422, "VALIDACAO")


# ---------- D-QA-18 / D-04: nome da rota no log de acesso ----------


@pytest.mark.parametrize(
    ("metodo", "caminho", "com_token", "status", "rota"),
    [
        # Rota que existe, sem token: 401 com o padrão da rota (contrato §4).
        ("GET", "/api/v1/documento/{id}/pdf", False, 401, "/api/v1/documento/{id}/pdf"),
        ("GET", "/api/v1/documento/{id}/email", False, 401, "/api/v1/documento/{id}/email"),
        ("POST", "/api/v1/documento/email/{id}/reenvio", False, 401, "/api/v1/documento/email/{envioId}/reenvio"),
        ("GET", "/api/v1/documento?atendimentoId={id}", False, 401, "/api/v1/documento"),
        # Caminho que existe com outro método.
        ("DELETE", "/api/v1/documento/{id}", True, 405, "/api/v1/documento/{id}"),
        # Caminho que ninguém conhece: sempre o mesmo nome, com ou sem token.
        ("GET", "/api/v1/nao-existe/{id}", False, 401, "(rota desconhecida)"),
        ("GET", "/api/v1/nao-existe/{id}", True, 404, "(rota desconhecida)"),
        ("GET", "/api/v1/", True, 404, "(rota desconhecida)"),
        ("POST", "/api/v1/documento/{id}/pdf/extra", True, 404, "(rota desconhecida)"),
    ],
)
async def test_rota_no_log_de_acesso(
    ambiente: Ambiente, metodo: str, caminho: str, com_token: bool, status: int, rota: str
) -> None:
    request_id = f"req-{uuid4()}"
    cabecalhos = {"X-Request-Id": request_id, **(ambiente.autorizacao() if com_token else {})}
    resposta = await ambiente.cliente.request(metodo, caminho.replace("{id}", str(uuid4())), headers=cabecalhos)
    assert resposta.status_code == status
    (linha,) = await _linhas_de_log(ambiente, request_id)
    assert (linha["status_code"], linha["rota"]) == (status, rota)


# ---------- lista de documentos: proximoCursor explícito ----------


async def test_lista_de_documentos_traz_proximo_cursor_explicito(ambiente: Ambiente) -> None:
    vazia = await ambiente.cliente.get(
        "/api/v1/documento", params={"atendimentoId": str(uuid4())}, headers=ambiente.autorizacao()
    )
    assert vazia.status_code == 200
    assert vazia.json() == {"itens": [], "proximoCursor": None}

    documento = await ambiente.gerar()
    cheia = await ambiente.cliente.get(
        "/api/v1/documento", params={"atendimentoId": documento["atendimentoId"]}, headers=ambiente.autorizacao()
    )
    assert cheia.json() == {"itens": [documento], "proximoCursor": None}


# ---------- D-QA-21: itens menores ----------


async def test_email_com_caractere_de_controle_e_recusado(ambiente: Ambiente) -> None:
    documento = await ambiente.gerar()
    for email in ("mari\x00na@exemplo.com", "marina@exem\x1bplo.com", "marina\x7f@exemplo.com"):
        resposta = await ambiente.cliente.post(
            f"/api/v1/documento/{documento['id']}/email",
            json={**DESTINATARIO, "destinatarioEmail": email},
            headers=ambiente.autorizacao(),
        )
        erro = _erro(resposta, 422, "VALIDACAO")
        assert [detalhe["campo"] for detalhe in erro["detalhes"]] == ["destinatarioEmail"]


async def test_varios_cabecalhos_x_forwarded_for_valem_como_um(ambiente: Ambiente) -> None:
    request_id = f"req-{uuid4()}"
    await ambiente.cliente.get(
        f"/api/v1/documento/{uuid4()}",
        headers=[
            ("X-Request-Id", request_id),
            ("X-Forwarded-For", "6.6.6.6"),
            ("X-Forwarded-For", "198.51.100.20"),  # o mais à direita: quem o proxy confiável viu
        ],
    )
    (linha,) = await _linhas_de_log(ambiente, request_id)
    assert linha["ip_cliente"] == "198.51.100.20"


async def test_jwks_fora_e_sem_cache_nao_busca_a_cada_requisicao() -> None:
    buscas = 0

    def fora(_: httpx.Request) -> httpx.Response:
        nonlocal buscas
        buscas += 1
        raise httpx.ConnectError("fora")

    async with httpx.AsyncClient(transport=httpx.MockTransport(fora)) as cliente:
        validador = ValidadorToken(cliente, "http://mike/jwks.json")
        token = Chave("k").token()
        inicio = time.monotonic()
        for _ in range(20):
            with pytest.raises(ServicoIndisponivel):
                await validador.validar(token)
    assert time.monotonic() - inicio < 5
    assert buscas == 1


def test_smtp_com_credencial_nao_aceita_seguranca_nenhuma() -> None:
    credencial: dict[str, Any] = {**ENV, "SMTP_USUARIO": "usuario", "SMTP_SENHA": "segredo"}
    assert carregar(credencial).smtp_seguranca == "starttls"  # padrão muda com credencial
    assert carregar({**credencial, "SMTP_SEGURANCA": "tls"}).smtp_seguranca == "tls"
    with pytest.raises(ConfiguracaoInvalida, match="SMTP_SEGURANCA=nenhuma"):
        carregar({**credencial, "SMTP_SEGURANCA": "nenhuma"})
    assert carregar(ENV).smtp_seguranca == "nenhuma"  # sem credencial (Mailpit), como antes
