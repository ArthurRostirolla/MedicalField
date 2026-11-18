// Cliente HTTP único do portal. Sempre caminhos relativos `/api/v1/...` (docs/contratos.md §8).
// - valida a resposta com o esquema zod do contrato, na borda;
// - converte o corpo de erro padrão (§2) em `ErroApi`;
// - em 401, renova o token UMA vez (cookie `mf_refresh`) e repete a chamada.
// O access token vive só nesta variável: recarregar a página apaga, e o refresh devolve.
import {
  erroSchema,
  sessaoSchema,
  type DetalheErro,
  type LoginEntrada,
  type Profissional,
} from '@medicalfield/contratos';
import type { z } from 'zod';

const BASE = '/api/v1';

/** Códigos do contrato + os que só existem do lado do navegador. */
export type CodigoErroApi = z.infer<typeof erroSchema>['codigo'] | 'SEM_CONEXAO' | 'RESPOSTA_INVALIDA';

export class ErroApi extends Error {
  constructor(
    /** `null` = não houve resposta (rede fora, serviço parado). */
    readonly status: number | null,
    readonly codigo: CodigoErroApi,
    mensagem: string,
    readonly detalhes: DetalheErro[] = [],
    readonly requestId?: string,
  ) {
    super(mensagem);
    this.name = 'ErroApi';
  }

  /** Rede, timeout ou 5xx: vale tentar de novo. 4xx é resposta definitiva. */
  get transitorio(): boolean {
    return this.status === null || this.status >= 500;
  }
}

/* ───────── Sessão (token em memória) ───────── */

export type EstadoSessao =
  | { situacao: 'restaurando' }
  | { situacao: 'anonima' }
  | { situacao: 'ativa'; profissional: Profissional };

let accessToken: string | null = null;
let sessao: EstadoSessao = { situacao: 'restaurando' };
const ouvintes = new Set<() => void>();

// Marca (sem segredo nenhum) de que este navegador já entrou: o cookie de refresh é HttpOnly e
// invisível daqui. Sem a marca, não vale gastar uma chamada que só devolveria 401.
const MARCA = 'mf-portal-sessao';
function marcar(ativa: boolean): void {
  try {
    if (ativa) localStorage.setItem(MARCA, '1');
    else localStorage.removeItem(MARCA);
  } catch {
    // Armazenamento bloqueado: a sessão vale até recarregar a página.
  }
}
function temMarca(): boolean {
  try {
    return localStorage.getItem(MARCA) === '1';
  } catch {
    return false;
  }
}

function definirSessao(nova: EstadoSessao, token: string | null): void {
  accessToken = token;
  sessao = nova;
  if (nova.situacao !== 'restaurando') marcar(nova.situacao === 'ativa');
  ouvintes.forEach((ouvinte) => ouvinte());
}

export const lerSessao = (): EstadoSessao => sessao;
export function assinarSessao(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

/* ───────── Requisição ───────── */

async function erroDaResposta(resposta: Response): Promise<ErroApi> {
  const corpo = erroSchema.safeParse(await resposta.json().catch(() => null));
  if (corpo.success) {
    const { codigo, mensagem, detalhes, requestId } = corpo.data;
    return new ErroApi(resposta.status, codigo, mensagem, detalhes, requestId);
  }
  // Sem o corpo padrão: quem respondeu foi o proxy/gateway (serviço parado) ou algo fora do contrato.
  return resposta.status >= 500
    ? new ErroApi(resposta.status, 'SERVICO_INDISPONIVEL', 'O serviço não respondeu.')
    : new ErroApi(resposta.status, 'ERRO_INTERNO', `Resposta inesperada do servidor (HTTP ${resposta.status}).`);
}

interface Opcoes {
  metodo?: 'GET' | 'POST';
  corpo?: unknown;
  /** Parâmetros de consulta; `undefined`, `''` e `false` ficam de fora. */
  consulta?: Record<string, string | number | boolean | undefined>;
  cabecalhos?: Record<string, string>;
}

async function buscar(caminho: string, { metodo = 'GET', corpo, consulta, cabecalhos }: Opcoes): Promise<Response> {
  const parametros = new URLSearchParams();
  for (const [nome, valor] of Object.entries(consulta ?? {})) {
    if (valor !== undefined && valor !== '' && valor !== false) parametros.set(nome, String(valor));
  }
  const url = `${BASE}${caminho}${parametros.size > 0 ? `?${parametros}` : ''}`;
  try {
    return await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...cabecalhos,
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi(null, 'SEM_CONEXAO', 'Não foi possível falar com o servidor.');
  }
}

/** Faz a chamada autenticada; em 401 renova a sessão uma vez e repete. */
async function responder(caminho: string, opcoes: Opcoes): Promise<Response> {
  let resposta = await buscar(caminho, opcoes);
  if (resposta.status === 401 && sessao.situacao === 'ativa') {
    if (await renovarSessao()) {
      resposta = await buscar(caminho, opcoes);
    } else {
      throw new ErroApi(401, 'NAO_AUTENTICADO', 'Sua sessão terminou. Entre de novo.');
    }
  }
  if (!resposta.ok) throw await erroDaResposta(resposta);
  return resposta;
}

function validar<S extends z.ZodType>(esquema: S, dado: unknown): z.infer<S> {
  const resultado = esquema.safeParse(dado);
  if (resultado.success) return resultado.data;
  const primeiro = resultado.error.issues[0];
  throw new ErroApi(
    null,
    'RESPOSTA_INVALIDA',
    `O servidor respondeu fora do contrato (${primeiro?.path.join('.') || 'corpo'}: ${primeiro?.message ?? 'inválido'}).`,
  );
}

/** Chamada JSON validada pelo esquema do contrato. */
export async function api<S extends z.ZodType>(caminho: string, esquema: S, opcoes: Opcoes = {}): Promise<z.infer<S>> {
  const resposta = await responder(caminho, opcoes);
  return validar(esquema, await resposta.json().catch(() => null));
}

/** Igual a `api`, devolvendo também o status (201 criado × 200 já existia). */
export async function apiComStatus<S extends z.ZodType>(
  caminho: string,
  esquema: S,
  opcoes: Opcoes = {},
): Promise<{ status: number; dado: z.infer<S> }> {
  const resposta = await responder(caminho, opcoes);
  return { status: resposta.status, dado: validar(esquema, await resposta.json().catch(() => null)) };
}

/** Download autenticado (o PDF exige `Authorization`, então não serve um link simples). */
export async function baixar(caminho: string): Promise<{ arquivo: Blob; nome: string | null }> {
  const resposta = await responder(caminho, { cabecalhos: { Accept: 'application/pdf' } });
  const nome = /filename="?([^";]+)"?/.exec(resposta.headers.get('Content-Disposition') ?? '')?.[1] ?? null;
  return { arquivo: await resposta.blob(), nome };
}

/* ───────── Autenticação ───────── */

async function abrirSessao(caminho: string, corpo: unknown): Promise<Profissional> {
  const resposta = await buscar(caminho, { metodo: 'POST', corpo });
  if (!resposta.ok) throw await erroDaResposta(resposta);
  const dados = validar(sessaoSchema, await resposta.json().catch(() => null));
  definirSessao({ situacao: 'ativa', profissional: dados.profissional }, dados.accessToken);
  return dados.profissional;
}

export function entrar(credenciais: LoginEntrada): Promise<Profissional> {
  return abrirSessao('/auth/login', credenciais);
}

let renovacao: Promise<boolean> | null = null;

/**
 * Troca o cookie `mf_refresh` por uma sessão nova. Chamadas simultâneas dividem a mesma
 * requisição: o refresh token é rotativo, e duas trocas em paralelo invalidariam uma à outra.
 *
 * @returns `false` quando não há sessão para renovar (a sessão passa a anônima)
 */
export function renovarSessao(): Promise<boolean> {
  renovacao ??= abrirSessao('/auth/refresh', {})
    .then(() => true)
    .catch((erro: unknown) => {
      // Serviço fora não é "sessão expirada": mantém quem já estava dentro.
      if (erro instanceof ErroApi && erro.transitorio && sessao.situacao === 'ativa') throw erro;
      definirSessao({ situacao: 'anonima' }, null);
      // Serviço fora não prova que o cookie venceu: a próxima abertura tenta de novo.
      if (erro instanceof ErroApi && erro.transitorio) marcar(true);
      return false;
    })
    .finally(() => {
      renovacao = null;
    });
  return renovacao;
}

/** Ao abrir ou recarregar a página: tenta o refresh antes de mandar para o login. */
export async function restaurarSessao(): Promise<void> {
  if (sessao.situacao !== 'restaurando') return;
  if (temMarca()) await renovarSessao();
  else definirSessao({ situacao: 'anonima' }, null);
}

export async function sair(): Promise<void> {
  // O servidor revoga o refresh token; se não responder, a sessão local acaba do mesmo jeito.
  await buscar('/auth/logout', { metodo: 'POST', corpo: {} }).catch(() => undefined);
  definirSessao({ situacao: 'anonima' }, null);
}

/** Só para testes: volta ao estado inicial do módulo. */
export function reiniciarSessaoParaTeste(estado: EstadoSessao = { situacao: 'restaurando' }, token: string | null = null): void {
  renovacao = null;
  definirSessao(estado, token);
}
