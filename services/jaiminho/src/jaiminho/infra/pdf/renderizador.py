"""Ficha de atendimento em PDF: Jinja2 (HTML/CSS) -> WeasyPrint. Sem navegador.

Só exibe o que foi registrado. Nenhum valor é interpretado, classificado ou comparado.
"""

import json
import re
from datetime import date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import segno
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML
from weasyprint.urls import URLFetcher

from jaiminho.dominio.regras import FAIXA_DEMONSTRATIVA

FUSO = ZoneInfo("America/Sao_Paulo")
VAZIO = "—"

_TIPOS = {
    "SINAIS_VITAIS": "Sinais vitais",
    "GLASGOW": "Glasgow",
    "TRIAGEM": "Triagem",
    "MEDICACAO": "Medicação",
    "PROCEDIMENTO": "Procedimento",
    "OBSERVACAO": "Observação",
    "RETIFICACAO": "Retificação",
    "ENCERRAMENTO": "Encerramento",
}
_SEXOS = {"M": "Masculino", "F": "Feminino", "I": "Indeterminado"}
_PROTOCOLOS = {"MANCHESTER": "Manchester", "START": "START"}
# (campo, rótulo, unidade) — unidades de exibição do que foi digitado.
_VITAIS = (
    ("frequenciaCardiaca", "FC", "bpm"),
    ("frequenciaRespiratoria", "FR", "irpm"),
    ("saturacao", "SpO₂", "%"),
    ("temperatura", "Temp.", "°C"),
    ("glicemia", "Glicemia", "mg/dL"),
)
_ROTULOS = {
    "ocular": "Ocular",
    "verbal": "Verbal",
    "motora": "Motora",
    "total": "Total",
    "protocolo": "Protocolo",
    "classificacao": "Classificação",
    "descricao": "Descrição",
    "texto": "Texto",
    "desfecho": "Desfecho",
    "destino": "Destino",
    "motivo": "Motivo",
}

Par = tuple[str | None, str]


def _momento(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(iso).astimezone(FUSO)
    except ValueError:
        return None


def _data_hora(iso: str | None) -> str:
    momento = _momento(iso)
    return momento.strftime("%d/%m/%Y %H:%M") if momento else VAZIO


def _hora(iso: str | None) -> str:
    momento = _momento(iso)
    return momento.strftime("%H:%M") if momento else VAZIO


def _dia(iso: str | None) -> str:
    momento = _momento(iso)
    return momento.strftime("%d/%m/%Y") if momento else VAZIO


def _valor(valor: Any) -> str:
    if valor is None or valor == "":
        return VAZIO
    if isinstance(valor, bool):
        return "Sim" if valor else "Não"
    if isinstance(valor, float):
        return f"{valor:g}".replace(".", ",")
    if isinstance(valor, dict | list):
        return json.dumps(valor, ensure_ascii=False)
    return str(valor)


def _rotulo(chave: str) -> str:
    if chave in _ROTULOS:
        return _ROTULOS[chave]
    return re.sub(r"(?<=[a-z])(?=[A-Z])", " ", chave).capitalize()


def _maiuscula_inicial(texto: Any) -> str:
    texto = _valor(texto)
    return texto.capitalize() if texto.isupper() else texto


def pares_do_evento(tipo: str, dados: Any) -> list[Par]:
    """Conteúdo de um evento como pares (rótulo, valor). Campo desconhecido não some: sai com o próprio nome."""
    resto = dict(dados) if isinstance(dados, dict) else {}
    pares: list[Par] = []

    if tipo == "SINAIS_VITAIS":
        sistolica, diastolica = resto.pop("pressaoSistolica", None), resto.pop("pressaoDiastolica", None)
        if sistolica is not None or diastolica is not None:
            pares.append(("PA", f"{_valor(sistolica)}×{_valor(diastolica)} mmHg"))
        for campo, rotulo, unidade in _VITAIS:
            if campo in resto:
                pares.append((rotulo, f"{_valor(resto.pop(campo))} {unidade}"))
    elif tipo == "GLASGOW":
        for campo in ("total", "ocular", "verbal", "motora"):
            if campo in resto:
                pares.append((_rotulo(campo), _valor(resto.pop(campo))))
    elif tipo == "TRIAGEM":
        if "protocolo" in resto:
            protocolo = resto.pop("protocolo")
            pares.append(("Protocolo", _PROTOCOLOS.get(protocolo, _valor(protocolo))))
        if "classificacao" in resto:
            pares.append(("Classificação", _maiuscula_inicial(resto.pop("classificacao"))))
    elif tipo == "MEDICACAO":
        resto.pop("medicamentoId", None)
        if "nome" in resto:
            pares.append((None, _valor(resto.pop("nome"))))
        if "dose" in resto or "unidade" in resto:
            pares.append(("Dose", f"{_valor(resto.pop('dose', None))} {resto.pop('unidade', '') or ''}".strip()))
        if "via" in resto:
            pares.append(("Via", _valor(resto.pop("via"))))
    elif tipo in ("PROCEDIMENTO", "OBSERVACAO"):
        campo = "descricao" if tipo == "PROCEDIMENTO" else "texto"
        if campo in resto:
            pares.append((None, _valor(resto.pop(campo))))
    elif tipo == "ENCERRAMENTO":
        for campo in ("desfecho", "destino"):
            if (valor := resto.pop(campo, None)) is not None:
                pares.append((_rotulo(campo), _valor(valor)))

    pares.extend((_rotulo(chave), _valor(valor)) for chave, valor in resto.items())
    return pares


def _idade(nascimento: str | None, referencia: datetime | None) -> str | None:
    if not nascimento or not referencia:
        return None
    try:
        nascido = date.fromisoformat(nascimento)
    except ValueError:
        return None
    hoje = referencia.date()
    anos = hoje.year - nascido.year - ((hoje.month, hoje.day) < (nascido.month, nascido.day))
    return f"{anos} anos" if anos != 1 else "1 ano"


def _cpf(cpf: str | None) -> str:
    digitos = re.sub(r"\D", "", cpf or "")
    if len(digitos) != 11:
        return _valor(cpf)
    return f"{digitos[:3]}.{digitos[3:6]}.{digitos[6:9]}-{digitos[9:]}"


def _linha_do_tempo(eventos: list[dict[str, Any]]) -> list[dict[str, Any]]:
    ordenados = sorted(eventos, key=lambda evento: str(evento.get("ocorridoEm", "")))
    por_id = {evento.get("id"): evento for evento in ordenados}
    retificacoes: dict[Any, list[dict[str, Any]]] = {}
    for evento in ordenados:
        if evento.get("tipo") == "RETIFICACAO" and evento.get("retificaEventoId"):
            retificacoes.setdefault(evento["retificaEventoId"], []).append(evento)

    def corrigidos(retificacao: dict[str, Any]) -> list[Par]:
        dados = retificacao.get("dados") or {}
        original = por_id.get(retificacao.get("retificaEventoId")) or {}
        if not isinstance(dados.get("dadosCorrigidos"), dict):
            return []
        return pares_do_evento(str(original.get("tipo", "")), dados["dadosCorrigidos"])

    linhas = []
    dia_anterior = None
    for evento in ordenados:
        tipo = str(evento.get("tipo", ""))
        dados = evento.get("dados") or {}
        linha: dict[str, Any] = {
            "hora": _hora(evento.get("ocorridoEm")),
            "dia": _dia(evento.get("ocorridoEm")),
            "tipo": _TIPOS.get(tipo, tipo),
            "profissional": _valor(evento.get("profissionalNome")),
            "retificado_por": [
                {
                    "quando": _data_hora(retificacao.get("ocorridoEm")),
                    "profissional": _valor(retificacao.get("profissionalNome")),
                    "motivo": _valor((retificacao.get("dados") or {}).get("motivo")),
                    "pares": corrigidos(retificacao),
                }
                for retificacao in retificacoes.get(evento.get("id"), [])
            ],
            "retifica": None,
        }
        linha["novo_dia"] = linha["dia"] != dia_anterior
        dia_anterior = linha["dia"]

        if tipo == "RETIFICACAO":
            original = por_id.get(evento.get("retificaEventoId")) or {}
            linha["retifica"] = {
                "tipo": _TIPOS.get(str(original.get("tipo", "")), "evento"),
                "quando": _data_hora(original.get("ocorridoEm")) if original else VAZIO,
            }
            linha["pares"] = [("Motivo", _valor(dados.get("motivo")))]
            linha["pares_corrigidos"] = corrigidos(evento)
        else:
            linha["pares"] = pares_do_evento(tipo, dados)
        linhas.append(linha)
    return linhas


def montar_contexto(
    ficha: dict[str, Any],
    documento_id: UUID,
    codigo_verificacao: str,
    gerado_em: datetime,
    url_publica_portal: str,
) -> dict[str, Any]:
    """Traduz a ficha da DonaCida para o que o template mostra (textos prontos, horários de Brasília)."""
    atendimento = ficha.get("atendimento") or {}
    pessoa = ficha.get("pessoa") or {}
    prontuario = ficha.get("prontuario") or {}
    resumo = ficha.get("resumo") or {}
    inicio = _momento(atendimento.get("iniciadoEm"))

    nascimento = VAZIO
    if pessoa.get("dataNascimento"):
        try:
            nascimento = date.fromisoformat(pessoa["dataNascimento"]).strftime("%d/%m/%Y")
        except ValueError:
            nascimento = str(pessoa["dataNascimento"])
        if idade := _idade(pessoa.get("dataNascimento"), inicio):
            nascimento += f" ({idade})"

    local = _valor(atendimento.get("localDescricao"))
    if atendimento.get("latitude") is not None and atendimento.get("longitude") is not None:
        coordenadas = f"{atendimento['latitude']:.5f}, {atendimento['longitude']:.5f}"
        local = coordenadas if local == VAZIO else f"{local} ({coordenadas})"

    def bloco(item: dict[str, Any] | None, tipo: str) -> dict[str, Any] | None:
        if not item:
            return None
        return {
            "quando": _data_hora(item.get("ocorridoEm")),
            "pares": pares_do_evento(tipo, item.get("dados")),
        }

    glasgow = bloco(resumo.get("glasgowMaisRecente"), "GLASGOW")
    if glasgow:
        dados = (resumo["glasgowMaisRecente"].get("dados") or {}) if resumo.get("glasgowMaisRecente") else {}
        glasgow["total"] = _valor(dados.get("total"))
        glasgow["pares"] = [par for par in glasgow["pares"] if par[0] != "Total"]

    triagem = None
    if resumo.get("triagem"):
        dados = resumo["triagem"].get("dados") or {}
        triagem = {
            "quando": _data_hora(resumo["triagem"].get("ocorridoEm")),
            "protocolo": _PROTOCOLOS.get(dados.get("protocolo"), _valor(dados.get("protocolo"))),
            "classificacao": _valor(dados.get("classificacao")),
            # Só para a cor do marcador; valor fora da lista conhecida fica sem cor.
            "classe": str(dados.get("classificacao", "")).lower()
            if dados.get("classificacao") in ("VERMELHO", "LARANJA", "AMARELO", "VERDE", "AZUL", "PRETO")
            else "",
        }

    encerramento = None
    if resumo.get("encerramento"):
        encerramento = {
            "quando": _data_hora(resumo["encerramento"].get("ocorridoEm")),
            "desfecho": _valor(resumo["encerramento"].get("desfecho")),
            "destino": _valor(resumo["encerramento"].get("destino")),
        }

    url_verificacao = f"{url_publica_portal}/documentos/{documento_id}"
    return {
        "faixa": FAIXA_DEMONSTRATIVA,
        "codigo": codigo_verificacao,
        "url_verificacao": url_verificacao,
        "qr": segno.make(url_verificacao, error="m").svg_data_uri(border=0, dark="#000000"),
        "gerado_em": gerado_em.astimezone(FUSO).strftime("%d/%m/%Y %H:%M"),
        "pessoa": {
            "nome": _valor(pessoa.get("nome")),
            "nao_identificada": bool(pessoa.get("naoIdentificada")),
            "descricao_identificacao": pessoa.get("descricaoIdentificacao"),
            "nascimento": nascimento,
            "sexo": _SEXOS.get(pessoa.get("sexo"), VAZIO),
            "cpf": _cpf(pessoa.get("cpf")),
            "cns": _valor(pessoa.get("cns")),
            "telefone": _valor(pessoa.get("telefone")),
            "contato_nome": _valor(pessoa.get("contatoEmergenciaNome")),
            "contato_telefone": _valor(pessoa.get("contatoEmergenciaTelefone")),
            "tipo_sanguineo": _valor(prontuario.get("tipoSanguineo")),
            "observacoes": prontuario.get("observacoes"),
        },
        "atendimento": {
            "id": str(atendimento.get("id", "")),
            "inicio": _data_hora(atendimento.get("iniciadoEm")),
            "encerrado_em": _data_hora(atendimento.get("encerradoEm")),
            "situacao": {"ABERTO": "Em aberto", "ENCERRADO": "Encerrado"}.get(
                atendimento.get("status"), _valor(atendimento.get("status"))
            ),
            "local": local,
            "queixa": _valor(atendimento.get("queixaPrincipal")),
            "profissional": _valor(atendimento.get("profissionalNome")),
        },
        "resumo": {
            "sinais_vitais": bloco(resumo.get("ultimosSinaisVitais"), "SINAIS_VITAIS"),
            "glasgow": glasgow,
            "triagem": triagem,
            "medicacoes": [
                {
                    "hora": _hora(medicacao.get("ocorridoEm")),
                    "nome": _valor(medicacao.get("nome")),
                    "dose": f"{_valor(medicacao.get('dose'))} {medicacao.get('unidade') or ''}".strip(),
                    "via": _valor(medicacao.get("via")),
                }
                for medicacao in resumo.get("medicacoes") or []
            ],
            "procedimentos": [
                {"hora": _hora(item.get("ocorridoEm")), "descricao": _valor(item.get("descricao"))}
                for item in resumo.get("procedimentos") or []
            ],
            "alergias": resumo.get("alergias") or [],
            "comorbidades": resumo.get("comorbidades") or [],
            "medicacoes_continuas": resumo.get("medicacoesContinuas") or [],
            "encerramento": encerramento,
        },
        "linha_do_tempo": _linha_do_tempo(ficha.get("eventos") or []),
    }


class RenderizadorFichaWeasyPrint:
    def __init__(self, url_publica_portal: str) -> None:
        self._url_publica_portal = url_publica_portal
        ambiente = Environment(
            loader=FileSystemLoader(Path(__file__).parent),
            autoescape=select_autoescape(["html"]),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self._template = ambiente.get_template("ficha.html")

    def renderizar(
        self, ficha: dict[str, Any], documento_id: UUID, codigo_verificacao: str, gerado_em: datetime
    ) -> bytes:
        contexto = montar_contexto(ficha, documento_id, codigo_verificacao, gerado_em, self._url_publica_portal)
        html = self._template.render(**contexto)
        # O template só usa `data:` (o QR); nada é buscado fora em tempo de execução.
        return HTML(string=html, url_fetcher=URLFetcher(allowed_protocols=("data",))).write_pdf()
