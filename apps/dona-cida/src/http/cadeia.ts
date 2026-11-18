// Cadeia de responsabilidade do contrato (secao 4): request-id -> log de acesso -> autenticacao -> handler.
// Os dois primeiros elos sao middlewares; a autenticacao e um guard, que o Nest executa depois dos
// middlewares e antes do handler - por isso um 401 tambem sai no log de acesso, com a rota ja conhecida.
import { randomUUID } from 'node:crypto';
import type { BlockList } from 'node:net';
import { CABECALHOS } from '@medicalfield/contratos';
import { Inject, Injectable, type CanActivate, type ExecutionContext, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { ErroAplicacao } from '../dominio/erros.ts';
import { RegistroDeAcesso } from '../infra/log-acesso.ts';
import { VerificadorToken } from '../infra/verificador-token.ts';
import { resolverIpCliente } from './ip-cliente.ts';
import { padraoDaRota, type Requisicao } from './requisicao.ts';

export const PROXIES_CONFIAVEIS = Symbol('ProxiesConfiaveis');

/** Elo 1: usa o `X-Request-Id` recebido (se for razoavel) ou gera um, e o devolve na resposta. */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(requisicao: Requisicao, resposta: Response, proximo: NextFunction): void {
    const recebido = requisicao.get(CABECALHOS.requestId);
    requisicao.requestId = recebido && /^[\w.:-]{1,100}$/.test(recebido) ? recebido : randomUUID();
    resposta.setHeader(CABECALHOS.requestId, requisicao.requestId);
    proximo();
  }
}

/** Elo 2: uma linha por requisicao, escrita quando a resposta termina (qualquer que seja o status). */
@Injectable()
export class LogAcessoMiddleware implements NestMiddleware {
  constructor(
    @Inject(RegistroDeAcesso) private readonly registro: RegistroDeAcesso,
    @Inject(PROXIES_CONFIAVEIS) private readonly proxies: BlockList,
  ) {}

  use(requisicao: Requisicao, resposta: Response, proximo: NextFunction): void {
    const inicio = performance.now();
    const dataHora = new Date().toISOString();
    resposta.on('finish', () => {
      this.registro.registrar({
        dataHora,
        ipCliente: resolverIpCliente(
          requisicao.socket.remoteAddress,
          requisicao.get('x-forwarded-for'),
          this.proxies,
        ),
        profissionalId: requisicao.profissional?.sub ?? null,
        metodo: requisicao.method,
        rota: padraoDaRota(requisicao),
        statusCode: resposta.statusCode,
        tempoMs: Math.round(performance.now() - inicio),
        requestId: requisicao.requestId ?? '',
      });
    });
    proximo();
  }
}

/** Elo 3: toda rota de `/api/v1` exige `Authorization: Bearer <jwt>` valido. Os dois papeis sao aceitos. */
@Injectable()
export class AutenticacaoGuard implements CanActivate {
  constructor(@Inject(VerificadorToken) private readonly verificador: VerificadorToken) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const requisicao = contexto.switchToHttp().getRequest<Requisicao>();
    const [esquema, token] = (requisicao.get('authorization') ?? '').split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      throw new ErroAplicacao('NAO_AUTENTICADO', 'Token ausente, inválido ou expirado.');
    }
    requisicao.profissional = await this.verificador.verificar(token);
    return true;
  }
}
