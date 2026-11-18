import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  Inject,
  Injectable,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { BANCO, bancoResponde, type Banco } from '../infra/banco.ts';
import { CONFIG, type Config } from '../infra/config.ts';
import { RegistroDeAcesso } from '../infra/log-acesso.ts';
import { LOG, type Log } from '../infra/log.ts';

/**
 * Porta de gestao (separada, sem autenticacao, nunca roteada pelo gateway) e o ciclo de vida do processo:
 * sobe junto com a aplicacao e, no encerramento, descarrega o log de acesso antes de fechar o banco.
 */
@Injectable()
export class ServidorDeGestao implements OnApplicationBootstrap, BeforeApplicationShutdown, OnApplicationShutdown {
  private encerrando = false;
  private readonly servidor: Server;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Inject(BANCO) private readonly banco: Banco,
    @Inject(RegistroDeAcesso) private readonly registroDeAcesso: RegistroDeAcesso,
    @Inject(LOG) private readonly log: Log,
  ) {
    this.servidor = createServer((requisicao, resposta) => {
      const responder = (status: number, corpo: object): void => {
        resposta.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(corpo));
      };
      if (requisicao.method === 'GET' && requisicao.url === '/health/live') return responder(200, { status: 'ok' });
      if (requisicao.method === 'GET' && requisicao.url === '/health/ready') {
        return void this.pronto().then((ok) =>
          ok ? responder(200, { status: 'ok' }) : responder(503, { status: 'indisponivel' }),
        );
      }
      return responder(404, { status: 'nao-encontrado' });
    });
  }

  /** Porta em que a gestao esta ouvindo (util quando a configurada e 0). */
  get porta(): number {
    return (this.servidor.address() as AddressInfo).port;
  }

  private async pronto(): Promise<boolean> {
    return !this.encerrando && (await bancoResponde(this.banco));
  }

  onApplicationBootstrap(): Promise<void> {
    return new Promise((resolver, rejeitar) => {
      this.servidor.once('error', rejeitar);
      this.servidor.listen(this.config.portaGestao, () => {
        this.log.info('porta de gestão no ar', { porta: this.porta });
        resolver();
      });
    });
  }

  /** Antes de fechar as conexoes HTTP: deixa de se declarar pronto. */
  beforeApplicationShutdown(): void {
    this.encerrando = true;
  }

  /** Depois que as requisicoes em curso terminaram. */
  async onApplicationShutdown(): Promise<void> {
    await this.registroDeAcesso.encerrar();
    await new Promise((resolver) => this.servidor.close(resolver));
    await this.banco.destroy();
    this.log.info('encerrado');
  }
}
