// Interfaces que a camada de aplicacao conhece; a implementacao (SQL) fica em infra/.
import type {
  Alteracoes,
  Atendimento,
  AtendimentoListado,
  CamposEditaveisPessoa,
  Evento,
  Medicamento,
  Pagina,
  Pessoa,
  Prontuario,
  ProntuarioComPessoa,
  ProntuarioItem,
  TipoItem,
} from '@medicalfield/contratos';

/** Quem esta fazendo a escrita (vem do token e de `X-Dispositivo-Id`). */
export type Autor = { profissionalId: string; profissionalNome: string; dispositivoId: string | null };

export type Paginacao = { limite: number; cursor?: string };

/** Evento ainda sem `recebidoEm` (quem carimba e o banco). O condicional preserva a uniao por `tipo`. */
export type EventoNovo = Evento extends infer E ? (E extends unknown ? Omit<E, 'recebidoEm'> : never) : never;

export type PessoaGuardada = { pessoa: Pessoa; carimbos: Record<string, string> };

export type OperacaoSync = {
  opId: string;
  autor: Autor;
  metodo: string;
  rota: string;
  entidadeId: string | null;
  hashCorpo: string;
  statusHttp: number;
  resposta: unknown;
};

export type RegistroAuditoria = {
  entidade: 'pessoa' | 'prontuario' | 'prontuario_item' | 'atendimento' | 'atendimento_evento';
  entidadeId: string;
  acao: 'CRIACAO' | 'ALTERACAO' | 'INATIVACAO';
  autor: Autor;
  opId: string | null;
  antes?: unknown;
  depois?: unknown;
  observacao?: string | null;
};

export interface RepositorioClinico {
  // --- idempotencia e auditoria (somente insercao) ---
  /** Serializa comandos concorrentes com a mesma chave ate o fim da transacao. */
  travarChave(opId: string): Promise<void>;
  buscarOperacao(opId: string): Promise<{ hashCorpo: string; resposta: unknown } | null>;
  registrarOperacao(operacao: OperacaoSync): Promise<void>;
  registrarAuditoria(registro: RegistroAuditoria): Promise<void>;

  // --- medicamento (somente leitura) ---
  listarMedicamentos(filtro: { incluirInativos: boolean }, paginacao: Paginacao): Promise<Pagina<Medicamento>>;
  buscarMedicamento(id: string): Promise<Medicamento | null>;

  // --- pessoa ---
  buscarPessoa(id: string, opcoes?: { travar?: boolean }): Promise<PessoaGuardada | null>;
  listarPessoas(filtro: { busca?: string; somenteDuplicatas: boolean }, paginacao: Paginacao): Promise<Pagina<Pessoa>>;
  /** Mesmo CPF, ou mesmo nome (sem diferenca de caixa) + mesma data de nascimento; da mais antiga para a mais nova. */
  buscarPossiveisDuplicatas(pessoa: {
    id: string;
    cpf: string | null;
    nome: string;
    dataNascimento: string | null;
  }): Promise<{ id: string }[]>;
  /** `false` se o id ja existia (nada e gravado). */
  inserirPessoa(
    pessoa: Omit<Pessoa, 'criadoEm' | 'atualizadoEm'>,
    carimbos: Record<string, string>,
    criadoPor: string,
  ): Promise<boolean>;
  atualizarPessoa(
    id: string,
    alteracao: {
      campos: Partial<CamposEditaveisPessoa>;
      carimbos: Record<string, string>;
      possivelDuplicataDe?: string;
    },
  ): Promise<void>;

  // --- prontuario ---
  buscarProntuarioDaPessoa(pessoaId: string): Promise<Prontuario | null>;
  listarProntuarios(paginacao: Paginacao): Promise<Pagina<ProntuarioComPessoa>>;
  /** `false` se o id ja existia. */
  inserirProntuario(prontuario: {
    id: string;
    pessoaId: string;
    tipoSanguineo: string | null;
    observacoes: string | null;
    criadoPor: string;
  }): Promise<boolean>;
  preencherProntuario(id: string, campos: { tipoSanguineo?: string; observacoes?: string }): Promise<void>;
  buscarItem(id: string): Promise<ProntuarioItem | null>;
  /** `false` se o id ja existia. */
  inserirItem(item: {
    id: string;
    prontuarioId: string;
    tipo: TipoItem;
    descricao: string;
    registradoEm: string;
    registradoPor: string;
  }): Promise<boolean>;
  inativarItem(id: string, inativadoEm: string, inativadoPor: string): Promise<void>;

  // --- atendimento e linha do tempo ---
  buscarAtendimento(id: string): Promise<Atendimento | null>;
  listarAtendimentos(filtro: { pessoaId?: string }, paginacao: Paginacao): Promise<Pagina<AtendimentoListado>>;
  /** `false` se o id ja existia. */
  inserirAtendimento(atendimento: Omit<Atendimento, 'recebidoEm' | 'status' | 'encerradoEm'>): Promise<boolean>;
  encerrarAtendimento(id: string, encerradoEm: string): Promise<void>;
  /** Eventos de um atendimento, por `ocorridoEm`. */
  listarEventos(atendimentoId: string): Promise<Evento[]>;
  buscarEvento(id: string): Promise<Evento | null>;
  /** `false` se o id ja existia. `medicamentoId` = linha do catalogo (ou `null`, fora do catalogo). */
  inserirEvento(evento: EventoNovo, medicamentoId: string | null): Promise<boolean>;

  // --- descida ---
  alteracoesDesde(cursor: string, limite: number): Promise<Alteracoes>;
}

/** Abre a transacao; quem a usa (o caso de uso) so enxerga a interface do repositorio. */
export interface UnidadeDeTrabalho {
  transacao<T>(trabalho: (repositorio: RepositorioClinico) => Promise<T>): Promise<T>;
  /** Repositorio fora de transacao, para consultas. */
  readonly leitura: RepositorioClinico;
}

export const UNIDADE_DE_TRABALHO = Symbol('UnidadeDeTrabalho');
