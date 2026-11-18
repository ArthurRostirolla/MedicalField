"""Regras puras: hash canônico, código de verificação, backoff da fila e texto do e-mail."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta
from typing import Any

from jaiminho.dominio.modelos import Envio, MensagemEmail

MAX_TENTATIVAS = 5
# Depois desse tempo em ENVIANDO o envio é considerado abandonado (processo morreu no meio).
LIMITE_ENVIANDO = timedelta(minutes=5)

FAIXA_DEMONSTRATIVA = "DADOS DEMONSTRATIVOS — SEM VALIDADE CLÍNICA"

# Sem 0/O, 1/I/L: o código é lido em voz alta e digitado a partir do papel.
_ALFABETO_CODIGO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"


def json_canonico(valor: Any) -> bytes:
    """Mesmo conteúdo => mesmos bytes: chaves ordenadas, sem espaços, UTF-8."""
    return json.dumps(valor, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def hash_canonico(valor: Any) -> str:
    return hashlib.sha256(json_canonico(valor)).hexdigest()


def hash_bytes(conteudo: bytes) -> str:
    return hashlib.sha256(conteudo).hexdigest()


def gerar_codigo_verificacao() -> str:
    """Código curto e legível, no formato MF-XXXX-XXXX (~40 bits aleatórios)."""
    letras = "".join(secrets.choice(_ALFABETO_CODIGO) for _ in range(8))
    return f"MF-{letras[:4]}-{letras[4:]}"


def proxima_situacao(
    tentativas_feitas: int, backoff_segundos: tuple[int, ...], agora: datetime
) -> tuple[str, datetime]:
    """Situação de um envio depois de uma falha.

    `tentativas_feitas` já inclui a que acabou de falhar. A 1ª falha espera `backoff[0]`,
    a 2ª `backoff[1]`...; faltando posição na lista, repete a última. Na 5ª, desiste.
    """
    if tentativas_feitas >= MAX_TENTATIVAS:
        return "FALHA_DEFINITIVA", agora
    espera = backoff_segundos[min(tentativas_feitas, len(backoff_segundos)) - 1]
    return "PENDENTE", agora + timedelta(seconds=espera)


def montar_mensagem(envio: Envio, codigo_verificacao: str, pdf: bytes) -> MensagemEmail:
    """E-mail curto e sem dado clínico: o conteúdo vai só no anexo."""
    corpo = (
        f"Olá, {envio.destinatario_nome}.\n\n"
        "Segue em anexo a ficha de atendimento pré-hospitalar "
        f"(código de verificação {codigo_verificacao}).\n\n"
        "Esta mensagem foi enviada a pedido da equipe que realizou o atendimento. "
        "Se você não esperava recebê-la, desconsidere e apague o anexo.\n\n"
        f"{FAIXA_DEMONSTRATIVA}\n"
        "MedicalField\n"
    )
    return MensagemEmail(
        # Fixo por envio: uma reentrega (ao menos uma vez) chega com o mesmo Message-ID.
        id_mensagem=f"<envio-{envio.id}@medicalfield>",
        destinatario_nome=envio.destinatario_nome,
        destinatario_email=envio.destinatario_email,
        assunto="MedicalField — Ficha de atendimento",
        corpo=corpo,
        anexo_nome=f"ficha-{codigo_verificacao}.pdf",
        anexo=pdf,
    )
