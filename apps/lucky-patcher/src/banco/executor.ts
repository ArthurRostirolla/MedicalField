// Porta do banco local (padrao Adapter): a mesma logica roda sobre SQLite WASM/OPFS no navegador,
// sobre o plugin nativo (SQLCipher) no Android e sobre SQLite em memoria nos testes.

export type Parametro = string | number | null;
export interface ComandoSql {
  sql: string;
  params?: Parametro[];
}

export interface ExecutorSql {
  consultar<T = Record<string, unknown>>(sql: string, params?: Parametro[]): Promise<T[]>;
  /** Executa o lote em UMA transacao: ou tudo entra, ou nada. Rejeita se qualquer comando falhar. */
  transacao(comandos: ComandoSql[]): Promise<void>;
  fechar(): Promise<void>;
}

/** Erro de gravacao/leitura do banco local. A interface trata como bloqueante (nunca "salvo" falso). */
export class ErroBancoLocal extends Error {
  constructor(mensagem: string, opcoes?: ErrorOptions) {
    super(mensagem, opcoes);
    this.name = 'ErroBancoLocal';
  }
}
