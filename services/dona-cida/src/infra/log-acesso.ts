import type { Banco } from './banco.ts';
import { SERVICO, type Log } from './log.ts';

export type LinhaAcesso = {
  dataHora: string;
  ipCliente: string;
  profissionalId: string | null;
  metodo: string;
  rota: string;
  statusCode: number;
  tempoMs: number;
  requestId: string;
};

const INTERVALO_MS = 1_000;
const TAMANHO_DO_LOTE = 100;
// ponytail: com o banco fora, guarda no maximo isto e descarta as mais antigas (o stdout continua completo).
const MAXIMO_PENDENTE = 10_000;

/**
 * Log de acesso: stdout na hora + INSERT assincrono em `auditoria.log_acesso`
 * (descarga a cada 1 s, a cada 100 linhas e no encerramento). Falha ao gravar nunca chega a requisicao.
 */
export class RegistroDeAcesso {
  private pendentes: LinhaAcesso[] = [];
  private descarga: Promise<void> = Promise.resolve();
  private readonly temporizador: NodeJS.Timeout;

  constructor(
    private readonly banco: Banco,
    private readonly log: Log,
  ) {
    this.temporizador = setInterval(() => void this.descarregar(), INTERVALO_MS);
    this.temporizador.unref();
  }

  registrar(linha: LinhaAcesso): void {
    this.log.escrever('info', {
      tipo: 'acesso',
      dataHora: linha.dataHora,
      servico: SERVICO,
      ipCliente: linha.ipCliente,
      profissionalId: linha.profissionalId,
      metodo: linha.metodo,
      rota: linha.rota,
      statusCode: linha.statusCode,
      tempoMs: linha.tempoMs,
      requestId: linha.requestId,
    });
    this.pendentes.push(linha);
    if (this.pendentes.length > MAXIMO_PENDENTE) this.pendentes.shift();
    if (this.pendentes.length >= TAMANHO_DO_LOTE) void this.descarregar();
  }

  /** Grava o que estiver pendente; as descargas sao encadeadas para nao disputar a ordem. */
  descarregar(): Promise<void> {
    this.descarga = this.descarga.then(async () => {
      while (this.pendentes.length > 0) {
        const lote = this.pendentes.splice(0, TAMANHO_DO_LOTE);
        try {
          await this.banco
            .insertInto('auditoria.log_acesso')
            .values(
              lote.map((linha) => ({
                data_hora: linha.dataHora,
                servico: SERVICO,
                ip_cliente: linha.ipCliente,
                profissional_id: linha.profissionalId,
                metodo: linha.metodo,
                rota: linha.rota,
                status_code: linha.statusCode,
                tempo_ms: linha.tempoMs,
                request_id: linha.requestId,
              })),
            )
            .execute();
        } catch (erro) {
          // Devolve o lote para a proxima tentativa e para: nao adianta insistir agora.
          this.pendentes.unshift(...lote);
          this.log.warn('falha ao gravar o log de acesso', { erro: erro instanceof Error ? erro.message : 'erro' });
          return;
        }
      }
    });
    return this.descarga;
  }

  async encerrar(): Promise<void> {
    clearInterval(this.temporizador);
    await this.descarregar();
  }
}
