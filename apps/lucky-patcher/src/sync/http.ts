// O UNICO cliente HTTP do app. Nenhum outro modulo chama `fetch`.
// Com o seletor "Simular conectividade" em Offline a chamada e recusada ANTES de sair:
// nenhuma requisicao aparece na aba de rede.
import { CABECALHOS } from '@medicalfield/contratos';

export type MotivoFalha = 'OFFLINE_SIMULADO' | 'SEM_SERVIDOR' | 'REDE' | 'TIMEOUT';

/** Nao houve resposta do servidor (falha transitoria: o outbox reenvia). */
export class FalhaTransporte extends Error {
  constructor(
    readonly motivo: MotivoFalha,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = 'FalhaTransporte';
  }
}

export interface Requisicao {
  metodo: 'GET' | 'POST' | 'PATCH';
  /** Caminho a partir da raiz, ex.: `/api/v1/pessoa`. */
  rota: string;
  corpo?: unknown;
  token?: string;
  /** `op_id` do comando do outbox. */
  chaveIdempotencia?: string;
}

export interface Resposta {
  status: number;
  /** JSON da resposta, ou `null` quando nao ha corpo JSON. */
  corpo: unknown;
}

export interface DependenciasHttp {
  fetch: typeof fetch;
  /** `''` = mesmo host (navegador); `null` = nao configurado (aparelho antes do ajuste). */
  enderecoServidor(): string | null;
  simulandoOffline(): boolean;
  dispositivoId(): string;
  /** Nao houve resposta (rede/timeout): o monitor de conectividade confere o servidor na hora. */
  aoFalharTransporte?(): void;
  timeoutMs?: number;
}

/** No ping, resposta 5xx (gateway/proxy sem servico atras) conta como servidor fora do ar. */
export const servidorRespondeu = (status: number) => status < 500;

export class ClienteHttp {
  constructor(private readonly deps: DependenciasHttp) {}

  async enviar(requisicao: Requisicao): Promise<Resposta> {
    if (this.deps.simulandoOffline()) {
      throw new FalhaTransporte('OFFLINE_SIMULADO', 'Modo offline simulado: nenhuma requisição é enviada.');
    }
    const base = this.deps.enderecoServidor();
    if (base === null) throw new FalhaTransporte('SEM_SERVIDOR', 'Endereço do servidor não configurado.');

    const cabecalhos: Record<string, string> = { Accept: 'application/json', [CABECALHOS.dispositivoId]: this.deps.dispositivoId() };
    if (requisicao.corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';
    if (requisicao.token) cabecalhos.Authorization = `Bearer ${requisicao.token}`;
    if (requisicao.chaveIdempotencia) cabecalhos[CABECALHOS.chaveIdempotencia] = requisicao.chaveIdempotencia;

    const controle = new AbortController();
    const prazo = setTimeout(() => controle.abort(), this.deps.timeoutMs ?? 15_000);
    try {
      const resposta = await this.deps.fetch(base + requisicao.rota, {
        method: requisicao.metodo,
        headers: cabecalhos,
        body: requisicao.corpo === undefined ? undefined : JSON.stringify(requisicao.corpo),
        signal: controle.signal,
        credentials: 'omit', // a sessao do app vive no banco local, nao em cookie
      });
      const texto = await resposta.text();
      let corpo: unknown = null;
      try {
        corpo = texto ? JSON.parse(texto) : null;
      } catch {
        corpo = null; // pagina de erro de proxy, por exemplo
      }
      return { status: resposta.status, corpo };
    } catch (erro) {
      this.deps.aoFalharTransporte?.();
      if (controle.signal.aborted) throw new FalhaTransporte('TIMEOUT', 'O servidor não respondeu a tempo.');
      throw new FalhaTransporte('REDE', `Sem conexão com o servidor (${erro instanceof Error ? erro.message : 'falha de rede'}).`);
    } finally {
      clearTimeout(prazo);
    }
  }
}
