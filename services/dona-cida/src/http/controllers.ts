// Controllers finos: validam com os esquemas do contrato, delegam ao caso de uso e devolvem o resultado.
import {
  alteracoesQuerySchema,
  atendimentoEntradaSchema,
  eventoEntradaSchema,
  inativacaoEntradaSchema,
  medicamentosQuerySchema,
  paginacaoQuerySchema,
  pessoaAlteracaoSchema,
  pessoaEntradaSchema,
  pessoasQuerySchema,
  prontuarioEntradaSchema,
  prontuarioItemEntradaSchema,
  type Alteracoes,
  type AtendimentoListado,
  type Ficha,
  type Medicamento,
  type Pagina,
  type Pessoa,
  type Prontuario,
  type ProntuarioComPessoa,
} from '@medicalfield/contratos';
import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RegistrarAtendimentoUseCase, RegistrarEventoUseCase } from '../aplicacao/atendimento.ts';
import type { ResultadoComando } from '../aplicacao/comando.ts';
import { ConsultasClinicas, MontarFichaUseCase } from '../aplicacao/consultas.ts';
import { AlterarPessoaUseCase, CadastrarPessoaUseCase } from '../aplicacao/pessoa.ts';
import {
  AcrescentarItemProntuarioUseCase,
  CadastrarProntuarioUseCase,
  InativarItemProntuarioUseCase,
} from '../aplicacao/prontuario.ts';
import { contextoDoComando, idDaRota, validar, type Requisicao } from './requisicao.ts';

/** 201 na criacao, 200 na repeticao: o status vem do caso de uso, nao do verbo HTTP. */
const responder = (resposta: Response, resultado: ResultadoComando<unknown>): void => {
  resposta.status(resultado.status).json(resultado.corpo);
};

@Controller('medicamento')
export class MedicamentoController {
  constructor(@Inject(ConsultasClinicas) private readonly consultas: ConsultasClinicas) {}

  @Get()
  listar(@Query() query: unknown): Promise<Pagina<Medicamento>> {
    return this.consultas.medicamentos(validar(medicamentosQuerySchema, query));
  }
}

@Controller('pessoa')
export class PessoaController {
  constructor(
    @Inject(ConsultasClinicas) private readonly consultas: ConsultasClinicas,
    @Inject(CadastrarPessoaUseCase) private readonly cadastrar: CadastrarPessoaUseCase,
    @Inject(AlterarPessoaUseCase) private readonly alterar: AlterarPessoaUseCase,
  ) {}

  @Get()
  listar(@Query() query: unknown): Promise<Pagina<Pessoa>> {
    return this.consultas.pessoas(validar(pessoasQuerySchema, query));
  }

  @Get(':id')
  buscar(@Param('id') id: string): Promise<Pessoa> {
    return this.consultas.pessoa(idDaRota(id, 'id'));
  }

  @Post()
  async criar(@Body() corpo: unknown, @Req() requisicao: Requisicao, @Res() resposta: Response): Promise<void> {
    const entrada = validar(pessoaEntradaSchema, corpo);
    responder(resposta, await this.cadastrar.executar(entrada, contextoDoComando(requisicao)));
  }

  @Patch(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() corpo: unknown,
    @Req() requisicao: Requisicao,
    @Res() resposta: Response,
  ): Promise<void> {
    const entrada = validar(pessoaAlteracaoSchema, corpo);
    responder(resposta, await this.alterar.executar(idDaRota(id, 'id'), entrada, contextoDoComando(requisicao)));
  }
}

@Controller('prontuario')
export class ProntuarioController {
  constructor(
    @Inject(ConsultasClinicas) private readonly consultas: ConsultasClinicas,
    @Inject(CadastrarProntuarioUseCase) private readonly cadastrar: CadastrarProntuarioUseCase,
  ) {}

  @Get()
  listar(@Query() query: unknown): Promise<Pagina<ProntuarioComPessoa>> {
    return this.consultas.prontuarios(validar(paginacaoQuerySchema, query));
  }

  @Get(':pessoaId')
  daPessoa(@Param('pessoaId') pessoaId: string): Promise<Prontuario> {
    return this.consultas.prontuarioDaPessoa(idDaRota(pessoaId, 'pessoaId'));
  }

  @Post()
  async criar(@Body() corpo: unknown, @Req() requisicao: Requisicao, @Res() resposta: Response): Promise<void> {
    const entrada = validar(prontuarioEntradaSchema, corpo);
    responder(resposta, await this.cadastrar.executar(entrada, contextoDoComando(requisicao)));
  }
}

@Controller('prontuario-item')
export class ProntuarioItemController {
  constructor(
    @Inject(AcrescentarItemProntuarioUseCase) private readonly acrescentar: AcrescentarItemProntuarioUseCase,
    @Inject(InativarItemProntuarioUseCase) private readonly inativar: InativarItemProntuarioUseCase,
  ) {}

  @Post()
  async criar(@Body() corpo: unknown, @Req() requisicao: Requisicao, @Res() resposta: Response): Promise<void> {
    const entrada = validar(prontuarioItemEntradaSchema, corpo);
    responder(resposta, await this.acrescentar.executar(entrada, contextoDoComando(requisicao)));
  }

  @Post(':id/inativacao')
  async inativacao(
    @Param('id') id: string,
    @Body() corpo: unknown,
    @Req() requisicao: Requisicao,
    @Res() resposta: Response,
  ): Promise<void> {
    const entrada = validar(inativacaoEntradaSchema, corpo);
    responder(resposta, await this.inativar.executar(idDaRota(id, 'id'), entrada, contextoDoComando(requisicao)));
  }
}

@Controller('atendimento')
export class AtendimentoController {
  constructor(
    @Inject(ConsultasClinicas) private readonly consultas: ConsultasClinicas,
    @Inject(RegistrarAtendimentoUseCase) private readonly registrar: RegistrarAtendimentoUseCase,
  ) {}

  @Get()
  listar(@Query() query: unknown): Promise<Pagina<AtendimentoListado>> {
    return this.consultas.atendimentos(validar(paginacaoQuerySchema, query));
  }

  @Get(':pessoaId')
  daPessoa(@Param('pessoaId') pessoaId: string, @Query() query: unknown): Promise<Pagina<AtendimentoListado>> {
    return this.consultas.atendimentos(validar(paginacaoQuerySchema, query), idDaRota(pessoaId, 'pessoaId'));
  }

  @Post()
  async criar(@Body() corpo: unknown, @Req() requisicao: Requisicao, @Res() resposta: Response): Promise<void> {
    const entrada = validar(atendimentoEntradaSchema, corpo);
    responder(resposta, await this.registrar.executar(entrada, contextoDoComando(requisicao)));
  }
}

@Controller('atendimento-evento')
export class AtendimentoEventoController {
  constructor(@Inject(RegistrarEventoUseCase) private readonly registrar: RegistrarEventoUseCase) {}

  @Post()
  async criar(@Body() corpo: unknown, @Req() requisicao: Requisicao, @Res() resposta: Response): Promise<void> {
    const entrada = validar(eventoEntradaSchema, corpo);
    responder(resposta, await this.registrar.executar(entrada, contextoDoComando(requisicao)));
  }
}

@Controller('ficha')
export class FichaController {
  constructor(@Inject(MontarFichaUseCase) private readonly montarFicha: MontarFichaUseCase) {}

  @Get(':atendimentoId')
  buscar(@Param('atendimentoId') atendimentoId: string): Promise<Ficha> {
    return this.montarFicha.executar(idDaRota(atendimentoId, 'atendimentoId'));
  }
}

@Controller('sync')
export class SyncController {
  constructor(@Inject(ConsultasClinicas) private readonly consultas: ConsultasClinicas) {}

  @Get('alteracoes')
  alteracoes(@Query() query: unknown): Promise<Alteracoes> {
    return this.consultas.alteracoes(validar(alteracoesQuerySchema, query));
  }
}

export const CONTROLLERS = [
  MedicamentoController,
  PessoaController,
  ProntuarioController,
  ProntuarioItemController,
  AtendimentoController,
  AtendimentoEventoController,
  FichaController,
  SyncController,
];
