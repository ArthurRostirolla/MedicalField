"""Regras puras e renderização do template (sem banco, sem rede)."""

import io
import ipaddress
import re
from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from pypdf import PdfReader

from jaiminho.dominio.modelos import Envio
from jaiminho.dominio.regras import (
    gerar_codigo_verificacao,
    hash_canonico,
    json_canonico,
    montar_mensagem,
    proxima_situacao,
)
from jaiminho.http.middlewares import ip_do_cliente
from jaiminho.infra.config import ConfiguracaoInvalida, carregar
from jaiminho.infra.pdf.renderizador import RenderizadorFichaWeasyPrint, pares_do_evento
from tests.falsos import ficha_exemplo

AGORA = datetime(2026, 11, 17, 21, 0, tzinfo=UTC)
PADRAO = (60, 300, 900, 3600)


# ---------- backoff ----------


@pytest.mark.parametrize(("tentativas", "espera"), [(1, 60), (2, 300), (3, 900), (4, 3600)])
def test_backoff_agenda_conforme_a_lista(tentativas: int, espera: int) -> None:
    status, proxima = proxima_situacao(tentativas, PADRAO, AGORA)
    assert status == "PENDENTE"
    assert (proxima - AGORA).total_seconds() == espera


def test_backoff_desiste_na_quinta_falha() -> None:
    assert proxima_situacao(5, PADRAO, AGORA) == ("FALHA_DEFINITIVA", AGORA)


def test_backoff_com_lista_curta_repete_o_ultimo_intervalo() -> None:
    assert (proxima_situacao(4, (10, 20), AGORA)[1] - AGORA).total_seconds() == 20


# ---------- hash canônico ----------


def test_hash_canonico_ignora_ordem_das_chaves_e_espacos() -> None:
    a = {"pessoa": {"nome": "José", "cpf": None}, "eventos": [1, 2]}
    b = {"eventos": [1, 2], "pessoa": {"cpf": None, "nome": "José"}}
    assert hash_canonico(a) == hash_canonico(b)
    assert json_canonico(a) == '{"eventos":[1,2],"pessoa":{"cpf":null,"nome":"José"}}'.encode()
    assert re.fullmatch(r"[0-9a-f]{64}", hash_canonico(a))


def test_hash_canonico_muda_com_o_conteudo_e_com_a_ordem_da_lista() -> None:
    base = hash_canonico({"eventos": [1, 2]})
    assert hash_canonico({"eventos": [2, 1]}) != base
    assert hash_canonico({"eventos": [1, 2], "x": 0}) != base


# ---------- código de verificação ----------


def test_codigo_de_verificacao_e_curto_legivel_e_nao_se_repete() -> None:
    codigos = {gerar_codigo_verificacao() for _ in range(2000)}
    assert len(codigos) == 2000
    # Sem 0/O e 1/I/L, que se confundem no papel.
    assert all(re.fullmatch(r"MF-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}", codigo) for codigo in codigos)


# ---------- IP do cliente ----------

PROXIES = (ipaddress.ip_network("10.42.0.0/16"), ipaddress.ip_network("127.0.0.1/32"))


@pytest.mark.parametrize(
    ("par", "xff", "esperado"),
    [
        ("203.0.113.9", "1.2.3.4", "203.0.113.9"),  # par não confiável: cabeçalho ignorado
        ("10.42.0.7", "198.51.100.20", "198.51.100.20"),
        ("10.42.0.7", "6.6.6.6, 198.51.100.20, 10.42.1.1", "198.51.100.20"),  # o mais à direita não confiável
        ("10.42.0.7", None, "10.42.0.7"),
        ("10.42.0.7", "10.42.0.8, 127.0.0.1", "10.42.0.7"),  # só proxies no caminho
        ("10.42.0.7", "198.51.100.20, lixo", "10.42.0.7"),
    ],
)
def test_ip_do_cliente(par: str, xff: str | None, esperado: str) -> None:
    assert ip_do_cliente(par, xff, PROXIES) == esperado


# ---------- configuração ----------

ENV = {
    "DATABASE_URL": "postgres://u:s@h/b",
    "JWKS_URL": "http://mike:9090/jwks.json",
    "CLINICO_URL": "http://dona-cida:8080/",
    "URL_PUBLICA_PORTAL": "https://exemplo/portal/",
    "SMTP_HOST": "mailpit",
    "SMTP_PORTA": "1025",
    "EMAIL_REMETENTE": "a@b.c",
}


def test_config_padroes_do_contrato() -> None:
    config = carregar(ENV)
    assert (config.porta, config.porta_gestao) == (8080, 9090)
    assert config.email_backoff_segundos == PADRAO
    assert config.clinico_url == "http://dona-cida:8080"
    assert [str(rede) for rede in config.proxies_confiaveis] == ["127.0.0.1/32", "::1/128", "10.42.0.0/16"]
    assert config.smtp_seguranca == "nenhuma"


def test_config_sem_obrigatoria_nao_sobe() -> None:
    with pytest.raises(ConfiguracaoInvalida, match="JWKS_URL"):
        carregar({**ENV, "JWKS_URL": ""})
    with pytest.raises(ConfiguracaoInvalida, match="SMTP_SEGURANCA"):
        carregar({**ENV, "SMTP_SEGURANCA": "ssl"})


# ---------- e-mail ----------


def test_mensagem_de_email_nao_tem_dado_clinico() -> None:
    envio = Envio(
        id=uuid4(),
        documento_id=uuid4(),
        destinatario_nome="Marina Antunes",
        destinatario_email="marina@exemplo.com",
        vinculo="FAMILIAR",
        status="ENVIANDO",
        tentativas=0,
        proxima_tentativa_em=AGORA,
        ultimo_erro=None,
        solicitado_por=uuid4(),
        criado_em=AGORA,
        enviado_em=None,
    )
    mensagem = montar_mensagem(envio, "MF-7KQ4-X9TB", b"%PDF-1.7")
    assert mensagem.anexo_nome == "ficha-MF-7KQ4-X9TB.pdf"
    assert mensagem.anexo == b"%PDF-1.7"
    assert "MF-7KQ4-X9TB" in mensagem.corpo
    assert len(mensagem.corpo) < 600
    texto = (mensagem.assunto + mensagem.corpo).lower()
    for proibido in ("otávio", "dor", "morfina", "glasgow", "laranja"):
        assert proibido not in texto


# ---------- template ----------


def _texto(pdf: bytes) -> tuple[int, str]:
    leitor = PdfReader(io.BytesIO(pdf))
    return len(leitor.pages), "\n".join(pagina.extract_text() for pagina in leitor.pages)


@pytest.fixture(scope="module")
def renderizador() -> RenderizadorFichaWeasyPrint:
    return RenderizadorFichaWeasyPrint("https://medicalfield.teste/portal")


def test_template_renderiza_a_ficha(renderizador: RenderizadorFichaWeasyPrint) -> None:
    documento_id = UUID("5d7c1e2a-93b4-4f60-a8d1-0c2e4b6a8f13")
    pdf = renderizador.renderizar(ficha_exemplo(), documento_id, "MF-7KQ4-X9TB", AGORA)
    assert pdf.startswith(b"%PDF")
    paginas, texto = _texto(pdf)
    assert paginas > 1  # a linha do tempo do exemplo tem 20 eventos
    assert "MF-7KQ4-X9TB" in texto
    assert "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA" in texto
    assert "Ficha de Atendimento Pré-Hospitalar" in texto
    assert "Otávio Luís Ferraz Antunes" in texto
    assert f"https://medicalfield.teste/portal/documentos/{documento_id}" in texto.replace("\n", "")
    assert f"Página 1 de {paginas}" in texto
    # 21:00Z = 18:00 em Brasília; o primeiro evento (17:44Z) aparece como 14:44.
    assert "17/11/2026 18:00" in texto
    assert "14:44" in texto and "17:44" not in texto
    # Evento retificado aparece marcado, com a retificação.
    assert "RETIFICADO" in texto.upper()
    assert "Dose digitada incorretamente" in texto


def test_template_com_ficha_quase_vazia(renderizador: RenderizadorFichaWeasyPrint) -> None:
    ficha = {
        "atendimento": {"id": str(uuid4()), "iniciadoEm": "2026-11-17T02:10:00.000Z", "status": "ABERTO"},
        "pessoa": {"nome": "Não identificada", "naoIdentificada": True},
        "prontuario": {},
        "eventos": [],
        "resumo": {},
    }
    paginas, texto = _texto(renderizador.renderizar(ficha, uuid4(), "MF-AAAA-BBBB", AGORA))
    assert paginas == 1
    assert "Sem registro" in texto


def test_template_escapa_html_vindo_dos_dados(renderizador: RenderizadorFichaWeasyPrint) -> None:
    ficha = ficha_exemplo()
    ficha["pessoa"]["nome"] = "<b>Fulano</b>"
    _, texto = _texto(renderizador.renderizar(ficha, uuid4(), "MF-AAAA-BBBB", AGORA))
    assert "<b>Fulano</b>" in texto  # saiu como texto, não como marcação


def test_pares_do_evento_so_exibem_o_que_foi_registrado() -> None:
    assert pares_do_evento(
        "SINAIS_VITAIS", {"pressaoSistolica": 120, "pressaoDiastolica": 80, "temperatura": 36.5}
    ) == [
        ("PA", "120×80 mmHg"),
        ("Temp.", "36,5 °C"),
    ]
    assert pares_do_evento(
        "MEDICACAO", {"medicamentoId": None, "nome": "X", "dose": "2", "unidade": "mg", "via": "EV"}
    ) == [
        (None, "X"),
        ("Dose", "2 mg"),
        ("Via", "EV"),
    ]
    # Campo que o serviço não conhece não é descartado.
    assert pares_do_evento("GLASGOW", {"total": 15, "campoNovo": "abc"}) == [
        ("Total", "15"),
        ("Campo novo", "abc"),
    ]
