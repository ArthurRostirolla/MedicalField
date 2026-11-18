"""Serviço inteiro contra Postgres real, DonaCida/JWKS falsos (HTTP) e SMTP falso."""

import hashlib
from typing import Any
from uuid import uuid4

from jaiminho.infra import jwks
from jaiminho.infra.email import EnviadorEmailFalso
from tests.conftest import Ambiente, FabricaAmbiente, porta_fechada
from tests.falsos import PROFISSIONAL_ID, Chave

DESTINATARIO = {
    "destinatarioNome": "Marina Antunes",
    "destinatarioEmail": "marina.antunes@exemplo.com",
    "vinculo": "FAMILIAR",
}


def _erro(resposta: Any, status: int, codigo: str) -> dict[str, Any]:
    assert resposta.status_code == status, resposta.text
    corpo = resposta.json()
    assert set(corpo) == {"codigo", "mensagem", "detalhes", "requestId"}
    assert corpo["codigo"] == codigo
    assert corpo["requestId"] == resposta.headers["x-request-id"]
    return corpo


# ---------- geração ----------


async def test_gerar_ficha_cria_e_depois_devolve_o_mesmo_documento(ambiente: Ambiente) -> None:
    atendimento_id = ambiente.novo_atendimento()
    cabecalhos = {**ambiente.autorizacao(), "X-Request-Id": "req-teste-123"}
    corpo = {"atendimentoId": atendimento_id}

    primeira = await ambiente.cliente.post("/api/v1/documento/ficha-atendimento", json=corpo, headers=cabecalhos)
    assert primeira.status_code == 201, primeira.text
    assert primeira.headers["x-request-id"] == "req-teste-123"
    documento = primeira.json()
    assert set(documento) == {
        "id", "atendimentoId", "codigoVerificacao", "hashConteudo", "geradoPor", "geradoEm", "tamanhoBytes",
    }  # fmt: skip
    assert documento["atendimentoId"] == atendimento_id
    assert documento["geradoPor"] == PROFISSIONAL_ID
    assert documento["codigoVerificacao"].startswith("MF-")
    assert documento["geradoEm"].endswith("Z") and len(documento["geradoEm"]) == 24

    # A DonaCida recebeu o token do próprio usuário e o mesmo request id.
    recebido = ambiente.falso.cabecalhos_recebidos[-1]
    assert recebido["authorization"] == cabecalhos["Authorization"]
    assert recebido["x-request-id"] == "req-teste-123"

    segunda = await ambiente.cliente.post("/api/v1/documento/ficha-atendimento", json=corpo, headers=cabecalhos)
    assert segunda.status_code == 200
    assert segunda.json() == documento
    total = ambiente.admin.execute(
        "SELECT count(*) AS n FROM documentos.documento WHERE atendimento_id = %s", (atendimento_id,)
    ).fetchone()
    assert total == {"n": 1}

    # Conteúdo diferente (novo evento na DonaCida) => documento novo.
    ambiente.falso.fichas[atendimento_id]["atendimento"]["queixaPrincipal"] = "Outra queixa"
    terceira = await ambiente.cliente.post("/api/v1/documento/ficha-atendimento", json=corpo, headers=cabecalhos)
    assert terceira.status_code == 201
    assert terceira.json()["id"] != documento["id"]

    lista = await ambiente.cliente.get(
        "/api/v1/documento", params={"atendimentoId": atendimento_id}, headers=cabecalhos
    )
    assert lista.status_code == 200
    assert {item["id"] for item in lista.json()["itens"]} == {documento["id"], terceira.json()["id"]}
    assert lista.json()["proximoCursor"] is None


async def test_ficha_de_atendimento_encerrado_vai_sozinha_ao_email_do_paciente(ambiente: Ambiente) -> None:
    atendimento_id = ambiente.novo_atendimento()
    ficha = ambiente.falso.fichas[atendimento_id]
    ficha["pessoa"]["email"] = "paciente@exemplo.com"
    corpo = {"atendimentoId": atendimento_id}

    documento = (
        await ambiente.cliente.post("/api/v1/documento/ficha-atendimento", json=corpo, headers=ambiente.autorizacao())
    ).json()
    # Repetir a geração (mesmo conteúdo) não enfileira outro e-mail.
    await ambiente.cliente.post("/api/v1/documento/ficha-atendimento", json=corpo, headers=ambiente.autorizacao())
    envios = ambiente.admin.execute(
        "SELECT destinatario_nome, destinatario_email, vinculo FROM documentos.envio_email WHERE documento_id = %s",
        (documento["id"],),
    ).fetchall()
    assert envios == [
        {
            "destinatario_nome": ficha["pessoa"]["nome"],
            "destinatario_email": "paciente@exemplo.com",
            "vinculo": "PACIENTE",
        }
    ]

    # Atendimento ainda aberto: nada sai sozinho.
    aberto = ambiente.novo_atendimento()
    ambiente.falso.fichas[aberto]["pessoa"]["email"] = "paciente@exemplo.com"
    ambiente.falso.fichas[aberto]["atendimento"]["status"] = "ABERTO"
    outro = (
        await ambiente.cliente.post(
            "/api/v1/documento/ficha-atendimento", json={"atendimentoId": aberto}, headers=ambiente.autorizacao()
        )
    ).json()
    total = ambiente.admin.execute(
        "SELECT count(*) AS n FROM documentos.envio_email WHERE documento_id = %s", (outro["id"],)
    ).fetchone()
    assert total == {"n": 0}


async def test_download_devolve_o_pdf_guardado_e_metadados_conferem(ambiente: Ambiente) -> None:
    documento = await ambiente.gerar()

    pdf = await ambiente.cliente.get(f"/api/v1/documento/{documento['id']}/pdf", headers=ambiente.autorizacao())
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.headers["content-disposition"] == f'attachment; filename="ficha-{documento["codigoVerificacao"]}.pdf"'
    assert pdf.content.startswith(b"%PDF")
    assert len(pdf.content) == documento["tamanhoBytes"]

    guardado = ambiente.admin.execute(
        "SELECT hash_pdf FROM documentos.documento WHERE id = %s", (documento["id"],)
    ).fetchone()
    assert guardado == {"hash_pdf": hashlib.sha256(pdf.content).hexdigest()}

    metadados = await ambiente.cliente.get(f"/api/v1/documento/{documento['id']}", headers=ambiente.autorizacao())
    assert metadados.status_code == 200
    assert metadados.json() == {**documento, "integro": True}


async def test_documento_inexistente_e_validacao(ambiente: Ambiente) -> None:
    autorizacao = ambiente.autorizacao()
    for caminho in (f"/api/v1/documento/{uuid4()}", f"/api/v1/documento/{uuid4()}/pdf"):
        _erro(await ambiente.cliente.get(caminho, headers=autorizacao), 404, "NAO_ENCONTRADO")
    _erro(
        await ambiente.cliente.get(f"/api/v1/documento/{uuid4()}/email", headers=autorizacao),
        404,
        "NAO_ENCONTRADO",
    )

    sem_parametro = _erro(await ambiente.cliente.get("/api/v1/documento", headers=autorizacao), 422, "VALIDACAO")
    assert sem_parametro["detalhes"] == [{"campo": "atendimentoId", "mensagem": "obrigatório"}]

    corpo_ruim = await ambiente.cliente.post(
        "/api/v1/documento/ficha-atendimento", json={"atendimentoId": "abc"}, headers=autorizacao
    )
    assert _erro(corpo_ruim, 422, "VALIDACAO")["detalhes"] == [
        {"campo": "atendimentoId", "mensagem": "deve ser um UUID"}
    ]
    _erro(await ambiente.cliente.get("/api/v1/nao-existe", headers=autorizacao), 404, "NAO_ENCONTRADO")


async def test_atendimento_inexistente_na_dona_cida_da_404(ambiente: Ambiente) -> None:
    resposta = await ambiente.cliente.post(
        "/api/v1/documento/ficha-atendimento",
        json={"atendimentoId": str(uuid4())},
        headers=ambiente.autorizacao(),
    )
    _erro(resposta, 404, "NAO_ENCONTRADO")


async def test_dona_cida_fora_da_503_e_nao_deixa_linha_orfa(criar_ambiente: FabricaAmbiente) -> None:
    ambiente = await criar_ambiente(clinico_url=f"http://127.0.0.1:{porta_fechada()}")
    atendimento_id = str(uuid4())
    corpo = {"atendimentoId": atendimento_id}

    resposta = await ambiente.cliente.post(
        "/api/v1/documento/ficha-atendimento", json=corpo, headers=ambiente.autorizacao()
    )
    _erro(resposta, 503, "SERVICO_INDISPONIVEL")

    orfas = ambiente.admin.execute(
        "SELECT count(*) AS n FROM documentos.documento WHERE atendimento_id = %s", (atendimento_id,)
    ).fetchone()
    assert orfas == {"n": 0}


async def test_dona_cida_com_erro_500_tambem_da_503(ambiente: Ambiente) -> None:
    ambiente.falso.status_ficha = 500
    resposta = await ambiente.cliente.post(
        "/api/v1/documento/ficha-atendimento",
        json={"atendimentoId": str(uuid4())},
        headers=ambiente.autorizacao(),
    )
    _erro(resposta, 503, "SERVICO_INDISPONIVEL")


# ---------- fila de e-mail ----------


async def test_email_que_falha_duas_vezes_termina_enviado_na_terceira(
    criar_ambiente: FabricaAmbiente,
) -> None:
    ambiente = await criar_ambiente(EnviadorEmailFalso(falhas=2))
    documento = await ambiente.gerar()

    resposta = await ambiente.cliente.post(
        f"/api/v1/documento/{documento['id']}/email", json=DESTINATARIO, headers=ambiente.autorizacao()
    )
    assert resposta.status_code == 202, resposta.text
    envio = resposta.json()
    assert envio["documentoId"] == documento["id"]
    assert envio["solicitadoPor"] == PROFISSIONAL_ID
    assert envio["status"] in ("PENDENTE", "ENVIANDO")

    linha = await ambiente.aguardar_status(envio["id"], "ENVIADO")
    assert linha["tentativas"] == 3
    assert linha["enviado_em"] is not None
    assert linha["ultimo_erro"] is None

    assert ambiente.enviador.tentativas == 3
    (mensagem,) = ambiente.enviador.enviadas
    assert mensagem.destinatario_email == DESTINATARIO["destinatarioEmail"]
    assert mensagem.anexo_nome == f"ficha-{documento['codigoVerificacao']}.pdf"
    assert mensagem.anexo.startswith(b"%PDF")
    assert (
        hashlib.sha256(mensagem.anexo).hexdigest()
        == ambiente.admin.execute(
            "SELECT hash_pdf FROM documentos.documento WHERE id = %s", (documento["id"],)
        ).fetchone()["hash_pdf"]
    )

    situacao = await ambiente.cliente.get(f"/api/v1/documento/{documento['id']}/email", headers=ambiente.autorizacao())
    assert situacao.status_code == 200
    (item,) = situacao.json()["itens"]
    assert (item["status"], item["tentativas"], item["proximaTentativaEm"]) == ("ENVIADO", 3, None)
    assert item["enviadoEm"].endswith("Z")
    assert situacao.json()["proximoCursor"] is None


async def test_email_que_sempre_falha_vira_falha_definitiva_e_aceita_reenvio(
    criar_ambiente: FabricaAmbiente,
) -> None:
    ambiente = await criar_ambiente(EnviadorEmailFalso(sempre_falha=True))
    documento = await ambiente.gerar()
    autorizacao = ambiente.autorizacao()

    envio = (
        await ambiente.cliente.post(
            f"/api/v1/documento/{documento['id']}/email", json=DESTINATARIO, headers=autorizacao
        )
    ).json()

    linha = await ambiente.aguardar_status(envio["id"], "FALHA_DEFINITIVA")
    assert linha["tentativas"] == 5
    assert ambiente.enviador.tentativas == 5
    # Só a classe do erro: nada do destinatário nem do conteúdo.
    assert linha["ultimo_erro"] == "ConnectionError"

    # O SMTP "volta" e o reenvio manual recoloca na fila.
    ambiente.enviador.sempre_falha = False
    reenvio = await ambiente.cliente.post(f"/api/v1/documento/email/{envio['id']}/reenvio", headers=autorizacao)
    assert reenvio.status_code == 202, reenvio.text
    assert reenvio.json()["id"] == envio["id"]
    assert reenvio.json()["status"] in ("PENDENTE", "ENVIANDO", "ENVIADO")

    linha = await ambiente.aguardar_status(envio["id"], "ENVIADO")
    assert linha["tentativas"] == 1
    assert len(ambiente.enviador.enviadas) == 1

    # Reenvio só a partir de FALHA_DEFINITIVA.
    de_novo = await ambiente.cliente.post(f"/api/v1/documento/email/{envio['id']}/reenvio", headers=autorizacao)
    _erro(de_novo, 422, "VALIDACAO")
    inexistente = await ambiente.cliente.post(f"/api/v1/documento/email/{uuid4()}/reenvio", headers=autorizacao)
    _erro(inexistente, 404, "NAO_ENCONTRADO")


async def test_envio_e_idempotente_pela_chave(ambiente: Ambiente) -> None:
    documento = await ambiente.gerar()
    cabecalhos = {**ambiente.autorizacao(), "Idempotency-Key": str(uuid4())}
    url = f"/api/v1/documento/{documento['id']}/email"

    primeiro = await ambiente.cliente.post(url, json=DESTINATARIO, headers=cabecalhos)
    repetido = await ambiente.cliente.post(url, json=DESTINATARIO, headers=cabecalhos)
    assert (primeiro.status_code, repetido.status_code) == (202, 202)
    assert repetido.json()["id"] == primeiro.json()["id"]

    outro_corpo = await ambiente.cliente.post(url, json={**DESTINATARIO, "vinculo": "PACIENTE"}, headers=cabecalhos)
    _erro(outro_corpo, 422, "CHAVE_IDEMPOTENCIA_CONFLITANTE")

    await ambiente.aguardar_status(primeiro.json()["id"], "ENVIADO")
    assert len(ambiente.enviador.enviadas) == 1

    chave_ruim = await ambiente.cliente.post(url, json=DESTINATARIO, headers={**cabecalhos, "Idempotency-Key": "x"})
    _erro(chave_ruim, 422, "VALIDACAO")


async def test_envio_valida_o_destinatario(ambiente: Ambiente) -> None:
    documento = await ambiente.gerar()
    url = f"/api/v1/documento/{documento['id']}/email"
    for corpo, campo in (
        ({**DESTINATARIO, "destinatarioEmail": "sem-arroba"}, "destinatarioEmail"),
        ({**DESTINATARIO, "destinatarioNome": "Fulano\r\nBcc: x@y.z"}, "destinatarioNome"),
        ({**DESTINATARIO, "vinculo": "VIZINHO"}, "vinculo"),
    ):
        erro = _erro(await ambiente.cliente.post(url, json=corpo, headers=ambiente.autorizacao()), 422, "VALIDACAO")
        assert [detalhe["campo"] for detalhe in erro["detalhes"]] == [campo]
    sem_fila = ambiente.admin.execute(
        "SELECT count(*) AS n FROM documentos.envio_email WHERE documento_id = %s", (documento["id"],)
    ).fetchone()
    assert sem_fila == {"n": 0}


async def test_envio_abandonado_em_enviando_volta_para_a_fila(ambiente: Ambiente) -> None:
    documento = await ambiente.gerar()
    # Um processo que morreu no meio do envio, há 6 minutos (e outro, há 1 minuto, que ainda não venceu).
    ids = []
    for minutos in (6, 1):
        linha = ambiente.admin.execute(
            """
            INSERT INTO documentos.envio_email
              (documento_id, destinatario_nome, destinatario_email, vinculo, solicitado_por, status, atualizado_em)
            VALUES (%s, 'Marina', 'marina@exemplo.com', 'FAMILIAR', %s, 'ENVIANDO', now() - make_interval(mins => %s))
            RETURNING id
            """,
            (documento["id"], PROFISSIONAL_ID, minutos),
        ).fetchone()
        ids.append(str(linha["id"]))

    await ambiente.aguardar_status(ids[0], "ENVIADO")
    assert (await ambiente.envio(ids[1]))["status"] == "ENVIANDO"
    ambiente.admin.execute("DELETE FROM documentos.envio_email WHERE id = %s", (ids[1],))


# ---------- autenticação ----------


async def test_sem_token_ou_com_token_invalido_da_401(ambiente: Ambiente) -> None:
    url = f"/api/v1/documento/{uuid4()}"
    _erro(await ambiente.cliente.get(url), 401, "NAO_AUTENTICADO")
    _erro(await ambiente.cliente.get("/api/v1/qualquer-coisa"), 401, "NAO_AUTENTICADO")

    for cabecalho in (
        "Bearer nao-e-um-jwt",
        "Basic dXN1YXJpbzpzZW5oYQ==",
        f"Bearer {ambiente.falso.token(validade_segundos=-60)}",  # expirado
        f"Bearer {ambiente.falso.token(iss='outro-emissor')}",
        f"Bearer {Chave('teste-1').token()}",  # mesmo kid, outra chave: assinatura não confere
        f"Bearer {Chave('desconhecido').token()}",
    ):
        _erro(await ambiente.cliente.get(url, headers={"Authorization": cabecalho}), 401, "NAO_AUTENTICADO")

    _erro(await ambiente.cliente.get(url, headers=ambiente.autorizacao()), 404, "NAO_ENCONTRADO")


async def test_kid_desconhecido_busca_o_jwks_de_novo(ambiente: Ambiente, monkeypatch: Any) -> None:
    monkeypatch.setattr(jwks, "INTERVALO_MINIMO_SEGUNDOS", 0)
    url = f"/api/v1/documento/{uuid4()}"
    _erro(await ambiente.cliente.get(url, headers=ambiente.autorizacao()), 404, "NAO_ENCONTRADO")
    _erro(await ambiente.cliente.get(url, headers=ambiente.autorizacao()), 404, "NAO_ENCONTRADO")
    assert ambiente.falso.buscas_jwks == 1  # a segunda usou o cache

    ambiente.falso.chaves.append(Chave("teste-2"))  # o Mike trocou a chave
    _erro(await ambiente.cliente.get(url, headers=ambiente.autorizacao()), 404, "NAO_ENCONTRADO")
    assert ambiente.falso.buscas_jwks == 2


async def test_jwks_fora_da_503(criar_ambiente: FabricaAmbiente) -> None:
    ambiente = await criar_ambiente(jwks_url=f"http://127.0.0.1:{porta_fechada()}/jwks.json")
    resposta = await ambiente.cliente.get(f"/api/v1/documento/{uuid4()}", headers=ambiente.autorizacao())
    _erro(resposta, 503, "SERVICO_INDISPONIVEL")


# ---------- log de acesso e gestão ----------


async def _linhas_de_log(ambiente: Ambiente, request_id: str) -> list[dict[str, Any]]:
    linhas: list[dict[str, Any]] = []

    async def gravou() -> bool:
        linhas[:] = ambiente.admin.execute(
            "SELECT * FROM auditoria.log_acesso WHERE request_id = %s", (request_id,)
        ).fetchall()
        return bool(linhas)

    await ambiente.aguardar(gravou)
    return linhas


async def test_requisicao_gera_linha_em_log_acesso(ambiente: Ambiente, capsys: Any) -> None:
    documento = await ambiente.gerar()
    request_id = f"req-{uuid4()}"
    resposta = await ambiente.cliente.get(
        f"/api/v1/documento/{documento['id']}?x=1",
        headers={
            **ambiente.autorizacao(),
            "X-Request-Id": request_id,
            # O par direto (127.0.0.1) é proxy confiável: vale o mais à direita que não é proxy.
            "X-Forwarded-For": "6.6.6.6, 198.51.100.20",
        },
    )
    assert resposta.status_code == 200

    (linha,) = await _linhas_de_log(ambiente, request_id)
    assert linha["servico"] == "jaiminho"
    assert linha["metodo"] == "GET"
    assert linha["rota"] == "/api/v1/documento/{id}"  # o padrão, sem o id e sem query string
    assert linha["status_code"] == 200
    assert str(linha["profissional_id"]) == PROFISSIONAL_ID
    assert linha["ip_cliente"] == "198.51.100.20"
    assert linha["tempo_ms"] >= 0

    saida = capsys.readouterr().out
    assert f'"requestId": "{request_id}"' in saida and '"tipo": "acesso"' in saida
    assert "Otávio" not in saida and "Bearer" not in saida


async def test_401_tambem_e_registrado_sem_profissional(ambiente: Ambiente) -> None:
    request_id = f"req-{uuid4()}"
    resposta = await ambiente.cliente.post(
        "/api/v1/documento/ficha-atendimento",
        json={"atendimentoId": str(uuid4())},
        headers={"X-Request-Id": request_id},
    )
    assert resposta.status_code == 401
    (linha,) = await _linhas_de_log(ambiente, request_id)
    assert linha["status_code"] == 401
    assert linha["profissional_id"] is None
    assert linha["ip_cliente"] == "127.0.0.1"
    assert linha["rota"] == "/api/v1/documento/ficha-atendimento"


async def test_encerramento_descarrega_o_buffer_de_log(criar_ambiente: FabricaAmbiente) -> None:
    # Intervalo de 1 h: a linha só chega ao banco se o encerramento descarregar o buffer.
    ambiente = await criar_ambiente(intervalo_log_acesso_segundos=3600)
    request_id = f"req-{uuid4()}"
    await ambiente.cliente.get(f"/api/v1/documento/{uuid4()}", headers={"X-Request-Id": request_id})
    consulta = "SELECT count(*) AS n FROM auditoria.log_acesso WHERE request_id = %s"
    assert ambiente.admin.execute(consulta, (request_id,)).fetchone() == {"n": 0}

    await ambiente.encerrar()
    assert ambiente.admin.execute(consulta, (request_id,)).fetchone() == {"n": 1}


async def test_porta_de_gestao(criar_ambiente: FabricaAmbiente) -> None:
    ambiente = await criar_ambiente()
    assert (await ambiente.gestao.get("/health/live")).json() == {"status": "ok"}
    pronto = await ambiente.gestao.get("/health/ready")
    assert (pronto.status_code, pronto.json()) == (200, {"status": "ok"})
    # A porta de gestão não expõe a API (e a API não expõe o health).
    assert (await ambiente.gestao.get("/api/v1/documento")).status_code == 404
    assert (await ambiente.cliente.get("/health/live")).status_code == 404

    sem_banco = await criar_ambiente(database_url="postgresql://mf_jaiminho:x@127.0.0.1:1/nada?connect_timeout=1")
    assert (await sem_banco.gestao.get("/health/live")).status_code == 200
    assert (await sem_banco.gestao.get("/health/ready")).status_code == 503
