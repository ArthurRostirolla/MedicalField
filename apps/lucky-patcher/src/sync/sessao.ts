// Sessao do profissional, persistida no banco local (o app precisa abrir sem rede).
// O primeiro login exige rede; depois, a sessao local basta. 401 => renova o token e repete;
// se a renovacao for recusada, a sessao fica "precisa de login" e o outbox continua intacto.
import { sessaoSchema, type LoginEntrada, type Profissional } from '@medicalfield/contratos';
import type { Banco } from '../banco/banco.ts';
import { FalhaTransporte, type ClienteHttp, type Requisicao, type Resposta } from './http.ts';

export interface SessaoLocal {
  profissional: Profissional;
  accessToken: string;
  /** Epoch em ms em que o access token vence. */
  expiraEmMs: number;
  refreshToken: string;
  /** O refresh foi recusado: o app continua abrindo e gravando, mas sincronizar exige novo login. */
  precisaLogin: boolean;
}

/** O servidor recusou a renovacao da sessao: e preciso entrar de novo (nada local se perde). */
export class SessaoExpirada extends Error {
  constructor() {
    super('Sessão expirada. Entre de novo para sincronizar; nada do que está no aparelho foi perdido.');
    this.name = 'SessaoExpirada';
  }
}

/** Erro de negocio devolvido pelo servidor no login (credencial errada, muitas tentativas...). */
export class ErroLogin extends Error {
  constructor(
    mensagem: string,
    readonly status: number,
  ) {
    super(mensagem);
    this.name = 'ErroLogin';
  }
}

const CHAVE = 'sessao';
const mensagemDoCorpo = (corpo: unknown, padrao: string) =>
  corpo && typeof corpo === 'object' && typeof (corpo as { mensagem?: unknown }).mensagem === 'string'
    ? (corpo as { mensagem: string }).mensagem
    : padrao;

export class GerenciadorSessao {
  atual: SessaoLocal | null = null;
  private ouvintes = new Set<() => void>();
  private renovando: Promise<void> | null = null;

  constructor(
    private readonly banco: Banco,
    private readonly http: ClienteHttp,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async carregar(): Promise<void> {
    const guardada = await this.banco.lerEstado(CHAVE);
    this.atual = guardada ? (JSON.parse(guardada) as SessaoLocal) : null;
  }

  assinar(ouvinte: () => void): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  private async definir(sessao: SessaoLocal | null): Promise<void> {
    await this.banco.gravarEstado(CHAVE, sessao ? JSON.stringify(sessao) : null);
    this.atual = sessao;
    for (const ouvinte of this.ouvintes) ouvinte();
  }

  private async aceitar(corpo: unknown): Promise<void> {
    const sessao = sessaoSchema.parse(corpo);
    await this.definir({
      profissional: sessao.profissional,
      accessToken: sessao.accessToken,
      expiraEmMs: this.agora().getTime() + sessao.expiraEm * 1000,
      refreshToken: sessao.refreshToken,
      precisaLogin: false,
    });
  }

  /** Exige rede. Lanca `ErroLogin` (recusa do servidor) ou `FalhaTransporte` (sem rede). */
  async entrar(entrada: LoginEntrada): Promise<void> {
    const resposta = await this.http.enviar({ metodo: 'POST', rota: '/api/v1/auth/login', corpo: entrada });
    if (resposta.status !== 200) {
      throw new ErroLogin(mensagemDoCorpo(resposta.corpo, 'Não foi possível entrar.'), resposta.status);
    }
    await this.aceitar(resposta.corpo);
  }

  /** Encerra a sessao local. O outbox e os dados ficam no aparelho. */
  async sair(): Promise<void> {
    const sessao = this.atual;
    if (!sessao) return;
    // Melhor esforco: sem rede, o refresh token so deixa de valer quando expirar no servidor.
    await this.http
      .enviar({ metodo: 'POST', rota: '/api/v1/auth/logout', corpo: { refreshToken: sessao.refreshToken }, token: sessao.accessToken })
      .catch(() => undefined);
    await this.definir(null);
  }

  private renovar(): Promise<void> {
    // Uma renovacao por vez: o refresh token e rotativo, duas chamadas invalidariam uma a outra.
    this.renovando ??= (async () => {
      const sessao = this.atual;
      if (!sessao || sessao.precisaLogin) throw new SessaoExpirada();
      const resposta = await this.http.enviar({
        metodo: 'POST',
        rota: '/api/v1/auth/refresh',
        corpo: { refreshToken: sessao.refreshToken },
      });
      if (resposta.status === 200) return await this.aceitar(resposta.corpo);
      if (resposta.status >= 500) throw new FalhaTransporte('REDE', 'Servidor indisponível ao renovar a sessão.');
      await this.definir({ ...sessao, precisaLogin: true });
      throw new SessaoExpirada();
    })().finally(() => {
      this.renovando = null;
    });
    return this.renovando;
  }

  /**
   * Requisicao autenticada. Renova o token antes (se ja venceu) ou depois de um 401, e repete uma vez.
   * Lanca `SessaoExpirada` quando a renovacao e recusada e `FalhaTransporte` quando nao ha resposta.
   */
  async requisitar(requisicao: Omit<Requisicao, 'token'>): Promise<Resposta> {
    if (!this.atual || this.atual.precisaLogin) throw new SessaoExpirada();
    if (this.atual.expiraEmMs - 10_000 < this.agora().getTime()) await this.renovar();
    let resposta = await this.http.enviar({ ...requisicao, token: this.atual.accessToken });
    if (resposta.status === 401) {
      await this.renovar();
      resposta = await this.http.enviar({ ...requisicao, token: this.atual.accessToken });
      if (resposta.status === 401) {
        await this.definir({ ...this.atual, precisaLogin: true });
        throw new SessaoExpirada();
      }
    }
    return resposta;
  }
}
