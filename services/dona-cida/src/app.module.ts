import { Module, type DynamicModule, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { json } from 'express';
import { RegistrarAtendimentoUseCase, RegistrarEventoUseCase } from './aplicacao/atendimento.ts';
import { ExecutorComandos } from './aplicacao/comando.ts';
import { ConsultasClinicas, MontarFichaUseCase } from './aplicacao/consultas.ts';
import { AlterarPessoaUseCase, CadastrarPessoaUseCase } from './aplicacao/pessoa.ts';
import {
  AcrescentarItemProntuarioUseCase,
  CadastrarProntuarioUseCase,
  InativarItemProntuarioUseCase,
} from './aplicacao/prontuario.ts';
import { RegistroEstrategias } from './dominio/conflito/registro.ts';
import { UNIDADE_DE_TRABALHO } from './dominio/repositorios.ts';
import { AutenticacaoGuard, LogAcessoMiddleware, PROXIES_CONFIAVEIS, RequestIdMiddleware } from './http/cadeia.ts';
import { CONTROLLERS } from './http/controllers.ts';
import { FiltroDeErros } from './http/filtro-erros.ts';
import { ServidorDeGestao } from './http/gestao.ts';
import { criarListaDeProxies } from './http/ip-cliente.ts';
import { BANCO, criarBanco, type Banco } from './infra/banco.ts';
import { CONFIG, type Config } from './infra/config.ts';
import { RegistroDeAcesso } from './infra/log-acesso.ts';
import { LOG, type Log } from './infra/log.ts';
import { UnidadeDeTrabalhoSql } from './infra/repositorio-clinico.ts';
import { VerificadorToken } from './infra/verificador-token.ts';

@Module({})
export class AppModule implements NestModule {
  /** Unico ponto de montagem: liga as interfaces do dominio as implementacoes de infra. */
  static com(config: Config, log: Log): DynamicModule {
    return {
      module: AppModule,
      controllers: CONTROLLERS,
      providers: [
        { provide: CONFIG, useValue: config },
        { provide: LOG, useValue: log },
        { provide: PROXIES_CONFIAVEIS, useValue: criarListaDeProxies(config.proxiesConfiaveis) },
        { provide: BANCO, useFactory: () => criarBanco(config.databaseUrl, log) },
        { provide: UNIDADE_DE_TRABALHO, useFactory: (banco: Banco) => new UnidadeDeTrabalhoSql(banco), inject: [BANCO] },
        { provide: RegistroDeAcesso, useFactory: (banco: Banco) => new RegistroDeAcesso(banco, log), inject: [BANCO] },
        { provide: VerificadorToken, useFactory: () => new VerificadorToken(config.jwksUrl) },
        { provide: RegistroEstrategias, useValue: new RegistroEstrategias() },
        ExecutorComandos,
        ConsultasClinicas,
        MontarFichaUseCase,
        CadastrarPessoaUseCase,
        AlterarPessoaUseCase,
        CadastrarProntuarioUseCase,
        AcrescentarItemProntuarioUseCase,
        InativarItemProntuarioUseCase,
        RegistrarAtendimentoUseCase,
        RegistrarEventoUseCase,
        ServidorDeGestao,
        { provide: APP_GUARD, useClass: AutenticacaoGuard },
        { provide: APP_FILTER, useClass: FiltroDeErros },
      ],
    };
  }

  configure(consumidor: MiddlewareConsumer): void {
    // A ordem e o contrato: request-id -> log de acesso -> (leitura do corpo) -> autenticacao (guard) -> handler.
    consumidor.apply(RequestIdMiddleware, LogAcessoMiddleware, json({ limit: '1mb' })).forRoutes('{*caminho}');
  }
}
