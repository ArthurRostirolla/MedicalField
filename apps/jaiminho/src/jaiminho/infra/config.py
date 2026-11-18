"""Configuração só por variável de ambiente, validada na partida (docs/contratos.md §4 e §7)."""

import ipaddress
from collections.abc import Mapping
from dataclasses import dataclass

RedeIp = ipaddress.IPv4Network | ipaddress.IPv6Network


class ConfiguracaoInvalida(Exception):
    pass


@dataclass(frozen=True, slots=True)
class Config:
    database_url: str
    jwks_url: str
    clinico_url: str
    url_publica_portal: str
    smtp_host: str
    smtp_porta: int
    email_remetente: str
    smtp_usuario: str | None = None
    smtp_senha: str | None = None
    smtp_seguranca: str = "nenhuma"
    email_backoff_segundos: tuple[int, ...] = (60, 300, 900, 3600)
    porta: int = 8080
    porta_gestao: int = 9090
    proxies_confiaveis: tuple[RedeIp, ...] = ()
    ambiente: str = "desenvolvimento"
    nivel_log: str = "info"
    # Fixos pelo contrato; ficam aqui só para os testes poderem encurtar.
    intervalo_fila_segundos: float = 5.0
    intervalo_log_acesso_segundos: float = 1.0


_PROXIES_PADRAO = "127.0.0.1/32,::1/128,10.42.0.0/16"


def carregar(env: Mapping[str, str]) -> Config:
    erros: list[str] = []

    def obrigatoria(nome: str) -> str:
        valor = env.get(nome, "").strip()
        if not valor:
            erros.append(f"{nome} é obrigatória")
        return valor

    def inteiro(nome: str, padrao: int | None = None) -> int:
        bruto = env.get(nome, "").strip()
        if not bruto:
            if padrao is None:
                erros.append(f"{nome} é obrigatória")
                return 0
            return padrao
        try:
            return int(bruto)
        except ValueError:
            erros.append(f"{nome} deve ser um número inteiro")
            return 0

    def escolha(nome: str, opcoes: tuple[str, ...], padrao: str) -> str:
        valor = env.get(nome, "").strip() or padrao
        if valor not in opcoes:
            erros.append(f"{nome} deve ser um de: {', '.join(opcoes)}")
        return valor

    redes: list[RedeIp] = []
    for cidr in (env.get("PROXIES_CONFIAVEIS", "").strip() or _PROXIES_PADRAO).split(","):
        try:
            redes.append(ipaddress.ip_network(cidr.strip(), strict=False))
        except ValueError:
            erros.append(f"PROXIES_CONFIAVEIS tem CIDR inválido: {cidr.strip()!r}")

    backoff: tuple[int, ...] = ()
    try:
        backoff = tuple(
            int(parte) for parte in (env.get("EMAIL_BACKOFF_SEGUNDOS", "").strip() or "60,300,900,3600").split(",")
        )
        if not backoff or min(backoff) < 0:
            raise ValueError
    except ValueError:
        erros.append("EMAIL_BACKOFF_SEGUNDOS deve ser uma lista de inteiros não negativos separados por vírgula")

    # Usuário e senha nunca trafegam em claro: com credencial, o padrão é STARTTLS e "nenhuma" é recusada.
    com_credencial = bool(env.get("SMTP_USUARIO") or env.get("SMTP_SENHA"))
    seguranca = escolha("SMTP_SEGURANCA", ("nenhuma", "starttls", "tls"), "starttls" if com_credencial else "nenhuma")
    if com_credencial and seguranca == "nenhuma":
        erros.append("SMTP_SEGURANCA=nenhuma não é aceita com SMTP_USUARIO/SMTP_SENHA; use starttls ou tls")

    config = Config(
        database_url=obrigatoria("DATABASE_URL"),
        jwks_url=obrigatoria("JWKS_URL"),
        clinico_url=obrigatoria("CLINICO_URL").rstrip("/"),
        url_publica_portal=obrigatoria("URL_PUBLICA_PORTAL").rstrip("/"),
        smtp_host=obrigatoria("SMTP_HOST"),
        smtp_porta=inteiro("SMTP_PORTA"),
        email_remetente=obrigatoria("EMAIL_REMETENTE"),
        smtp_usuario=env.get("SMTP_USUARIO") or None,
        smtp_senha=env.get("SMTP_SENHA") or None,
        smtp_seguranca=seguranca,
        email_backoff_segundos=backoff,
        porta=inteiro("PORTA", 8080),
        porta_gestao=inteiro("PORTA_GESTAO", 9090),
        proxies_confiaveis=tuple(redes),
        ambiente=escolha("AMBIENTE", ("desenvolvimento", "producao"), "desenvolvimento"),
        nivel_log=escolha("NIVEL_LOG", ("debug", "info", "warning", "error"), "info"),
    )
    if erros:
        raise ConfiguracaoInvalida("; ".join(erros))
    return config
