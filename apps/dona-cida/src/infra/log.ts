import type { LoggerService } from '@nestjs/common';

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Nivel = keyof typeof NIVEIS;

export const SERVICO = 'dona-cida';
export const LOG = Symbol('Log');

/**
 * Log de aplicacao: uma linha JSON por evento em stdout.
 * Nunca recebe corpo de requisicao, token nem dado de paciente - so mensagens tecnicas.
 */
export class Log implements LoggerService {
  private readonly minimo: number;

  constructor(nivelMinimo: Nivel) {
    this.minimo = NIVEIS[nivelMinimo];
  }

  /** Escreve um objeto ja montado (usado pelo log de acesso, que tem campos proprios). */
  escrever(nivel: Nivel, linha: Record<string, unknown>): void {
    if (NIVEIS[nivel] >= this.minimo) process.stdout.write(`${JSON.stringify({ nivel, ...linha })}\n`);
  }

  private aplicacao(nivel: Nivel, mensagem: unknown, extra?: Record<string, unknown>): void {
    this.escrever(nivel, {
      tipo: 'aplicacao',
      dataHora: new Date().toISOString(),
      servico: SERVICO,
      mensagem: String(mensagem),
      ...extra,
    });
  }

  debug(mensagem: unknown): void {
    this.aplicacao('debug', mensagem);
  }
  info(mensagem: unknown, extra?: Record<string, unknown>): void {
    this.aplicacao('info', mensagem, extra);
  }
  // `log` e `verbose` sao a interface do Nest; as mensagens dele (rotas mapeadas etc.) sao de depuracao.
  log(mensagem: unknown): void {
    this.aplicacao('debug', mensagem);
  }
  verbose(mensagem: unknown): void {
    this.aplicacao('debug', mensagem);
  }
  warn(mensagem: unknown, extra?: Record<string, unknown>): void {
    this.aplicacao('warn', mensagem, typeof extra === 'object' ? extra : undefined);
  }
  error(mensagem: unknown, extra?: Record<string, unknown> | string): void {
    this.aplicacao('error', mensagem, typeof extra === 'object' ? extra : extra ? { pilha: extra } : undefined);
  }
}
