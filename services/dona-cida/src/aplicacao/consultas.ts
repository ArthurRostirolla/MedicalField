import type {
  Alteracoes,
  AlteracoesQuery,
  AtendimentoListado,
  Ficha,
  Medicamento,
  MedicamentosQuery,
  Pagina,
  PaginacaoQuery,
  Pessoa,
  PessoasQuery,
  Prontuario,
  ProntuarioComPessoa,
} from '@medicalfield/contratos';
import { calcularResumo, ordenarLinhaDoTempo } from '@medicalfield/dominio';
import { Inject, Injectable } from '@nestjs/common';
import { naoEncontrado } from '../dominio/erros.ts';
import { UNIDADE_DE_TRABALHO, type RepositorioClinico, type UnidadeDeTrabalho } from '../dominio/repositorios.ts';

/** Leituras: sem regra alem de "404 quando nao existe". */
@Injectable()
export class ConsultasClinicas {
  private readonly repositorio: RepositorioClinico;

  constructor(@Inject(UNIDADE_DE_TRABALHO) unidade: UnidadeDeTrabalho) {
    this.repositorio = unidade.leitura;
  }

  medicamentos({ incluirInativos, ...paginacao }: MedicamentosQuery): Promise<Pagina<Medicamento>> {
    return this.repositorio.listarMedicamentos({ incluirInativos }, paginacao);
  }

  pessoas({ busca, somenteDuplicatas, ...paginacao }: PessoasQuery): Promise<Pagina<Pessoa>> {
    return this.repositorio.listarPessoas({ busca, somenteDuplicatas }, paginacao);
  }

  async pessoa(id: string): Promise<Pessoa> {
    const guardada = await this.repositorio.buscarPessoa(id);
    if (!guardada) throw naoEncontrado('Pessoa');
    return guardada.pessoa;
  }

  prontuarios(paginacao: PaginacaoQuery): Promise<Pagina<ProntuarioComPessoa>> {
    return this.repositorio.listarProntuarios(paginacao);
  }

  async prontuarioDaPessoa(pessoaId: string): Promise<Prontuario> {
    const prontuario = await this.repositorio.buscarProntuarioDaPessoa(pessoaId);
    if (!prontuario) throw naoEncontrado('Prontuário');
    return prontuario;
  }

  atendimentos(paginacao: PaginacaoQuery, pessoaId?: string): Promise<Pagina<AtendimentoListado>> {
    return this.repositorio.listarAtendimentos({ pessoaId }, paginacao);
  }

  /** Descida por cursor: so o que mudou desde `desde`, em ordem de `seq`. */
  alteracoes({ desde, limite }: AlteracoesQuery): Promise<Alteracoes> {
    return this.repositorio.alteracoesDesde(desde, limite);
  }
}

/** `GET /ficha/{atendimentoId}`: atendimento completo + passagem de caso. */
@Injectable()
export class MontarFichaUseCase {
  constructor(@Inject(UNIDADE_DE_TRABALHO) private readonly unidade: UnidadeDeTrabalho) {}

  async executar(atendimentoId: string): Promise<Ficha> {
    const repositorio = this.unidade.leitura;
    const atendimento = await repositorio.buscarAtendimento(atendimentoId);
    if (!atendimento) throw naoEncontrado('Atendimento');

    const [guardada, prontuario, eventosGravados] = await Promise.all([
      repositorio.buscarPessoa(atendimento.pessoaId),
      repositorio.buscarProntuarioDaPessoa(atendimento.pessoaId),
      repositorio.listarEventos(atendimentoId),
    ]);
    // Garantidos pelas chaves estrangeiras do atendimento.
    if (!guardada || !prontuario) throw naoEncontrado('Atendimento');

    const eventos = ordenarLinhaDoTempo(eventosGravados);
    return {
      atendimento,
      pessoa: guardada.pessoa,
      prontuario,
      eventos,
      resumo: calcularResumo(eventos, prontuario.itens),
    };
  }
}
