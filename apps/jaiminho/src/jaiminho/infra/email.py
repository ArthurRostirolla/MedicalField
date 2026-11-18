"""Implementações de EnviadorEmail (Adapter): SMTP de verdade e um falso para testes."""

from email.message import EmailMessage
from email.utils import formataddr, formatdate

import aiosmtplib

from jaiminho.dominio.modelos import MensagemEmail


def _montar_mime(mensagem: MensagemEmail, remetente: str) -> EmailMessage:
    mime = EmailMessage()
    mime["From"] = remetente
    mime["To"] = formataddr((mensagem.destinatario_nome, mensagem.destinatario_email))
    mime["Subject"] = mensagem.assunto
    mime["Date"] = formatdate(localtime=False)
    mime["Message-ID"] = mensagem.id_mensagem
    mime.set_content(mensagem.corpo)
    mime.add_attachment(mensagem.anexo, maintype="application", subtype="pdf", filename=mensagem.anexo_nome)
    return mime


class EnviadorEmailSmtp:
    def __init__(
        self,
        host: str,
        porta: int,
        remetente: str,
        seguranca: str = "nenhuma",
        usuario: str | None = None,
        senha: str | None = None,
    ) -> None:
        self._remetente = remetente
        self._opcoes = {
            "hostname": host,
            "port": porta,
            "username": usuario,
            "password": senha,
            "use_tls": seguranca == "tls",
            # False (e não None): com "nenhuma" não negocia STARTTLS nem se o servidor oferecer.
            "start_tls": seguranca == "starttls",
            "timeout": 20,
        }

    async def enviar(self, mensagem: MensagemEmail) -> None:
        await aiosmtplib.send(_montar_mime(mensagem, self._remetente), **self._opcoes)


class EnviadorEmailFalso:
    """Guarda o que seria enviado e pode falhar as N primeiras vezes (ou sempre)."""

    def __init__(self, falhas: int = 0, sempre_falha: bool = False) -> None:
        self.falhas_restantes = falhas
        self.sempre_falha = sempre_falha
        self.tentativas = 0
        self.enviadas: list[MensagemEmail] = []

    async def enviar(self, mensagem: MensagemEmail) -> None:
        self.tentativas += 1
        if self.sempre_falha or self.falhas_restantes > 0:
            self.falhas_restantes -= 1
            raise ConnectionError("SMTP falso: falha simulada")
        self.enviadas.append(mensagem)
