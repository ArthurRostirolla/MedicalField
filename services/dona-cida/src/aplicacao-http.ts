import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { CABECALHOS, type ErroResposta } from '@medicalfield/contratos';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppModule } from './app.module.ts';
import type { Config } from './infra/config.ts';
import { Log } from './infra/log.ts';

/** Monta a aplicacao (sem ouvir em porta nenhuma); `main.ts` e os testes de integracao partem daqui. */
export async function criarAplicacao(config: Config): Promise<NestExpressApplication> {
  z.config(z.locales.pt()); // mensagens de validacao em portugues
  const log = new Log(config.nivelLog);

  const app = await NestFactory.create<NestExpressApplication>(AppModule.com(config, log), {
    logger: log,
    bodyParser: false, // o corpo e lido dentro da cadeia, depois do request-id e do log de acesso
  });
  app.setGlobalPrefix('api/v1');
  app.disable('x-powered-by');
  app.enableShutdownHooks(); // SIGTERM: termina as requisicoes em curso, descarrega o log, fecha o banco

  // O Nest so trata 404 dentro do prefixo; isto cobre o resto, para TODO erro sair no corpo padrao.
  // Registrado depois do init, fica atras de todas as rotas.
  await app.init();
  app.use((_requisicao: Request, resposta: Response) => {
    const requestId = randomUUID();
    const corpo: ErroResposta = { codigo: 'NAO_ENCONTRADO', mensagem: 'Rota não encontrada.', requestId };
    resposta.status(404).setHeader(CABECALHOS.requestId, requestId).json(corpo);
  });
  return app;
}
