import type {
  Alteracoes,
  Atendimento,
  AtendimentoListado,
  CampoEditavelPessoa,
  Evento,
  Medicamento,
  Pagina,
  Pessoa,
  Prontuario,
  ProntuarioComPessoa,
  ProntuarioItem,
} from '@medicalfield/contratos';
import { sql, type RawBuilder, type Selectable, type SelectQueryBuilder } from 'kysely';
import { validacao } from '../dominio/erros.ts';
import type {
  EventoNovo,
  OperacaoGuardada,
  OperacaoSync,
  Paginacao,
  PessoaGuardada,
  RegistroAuditoria,
  RepositorioClinico,
  UnidadeDeTrabalho,
} from '../dominio/repositorios.ts';
import type {
  AtendimentoLinha,
  Banco,
  EventoLinha,
  MedicamentoLinha,
  PessoaLinha,
  ProntuarioItemLinha,
  ProntuarioLinha,
} from './banco.ts';

// ---------- linha do banco -> tipo do contrato ----------
// As mesmas funcoes servem para linha vinda do driver (Date) e de `to_jsonb` (texto), usado na descida.

type Lida<T> = { [K in keyof Selectable<T>]: Selectable<T>[K] extends Date | null ? Selectable<T>[K] | string : Selectable<T>[K] };

const iso = (instante: Date | string): string => new Date(instante).toISOString();
const isoOuNulo = (instante: Date | string | null): string | null => (instante === null ? null : iso(instante));

const paraMedicamento = (l: Omit<Lida<MedicamentoLinha>, 'seq'>): Medicamento => ({
  id: l.id,
  nome: l.nome,
  principioAtivo: l.principio_ativo,
  apresentacao: l.apresentacao,
  observacao: l.observacao,
  ativo: l.ativo,
});

const paraPessoa = (l: Omit<Lida<PessoaLinha>, 'seq' | 'carimbos_campos' | 'criado_por'>): Pessoa => ({
  id: l.id,
  nome: l.nome,
  dataNascimento: l.data_nascimento,
  sexo: l.sexo,
  cpf: l.cpf,
  cns: l.cns,
  telefone: l.telefone,
  contatoEmergenciaNome: l.contato_emergencia_nome,
  contatoEmergenciaTelefone: l.contato_emergencia_telefone,
  contatoEmergenciaEmail: l.contato_emergencia_email,
  naoIdentificada: l.nao_identificada,
  descricaoIdentificacao: l.descricao_identificacao,
  possivelDuplicataDe: l.possivel_duplicata_de,
  criadoEm: iso(l.criado_em),
  atualizadoEm: iso(l.atualizado_em),
});

const paraProntuario = (l: Omit<Lida<ProntuarioLinha>, 'seq' | 'criado_por'>): Omit<Prontuario, 'itens'> => ({
  id: l.id,
  pessoaId: l.pessoa_id,
  tipoSanguineo: l.tipo_sanguineo,
  observacoes: l.observacoes,
  criadoEm: iso(l.criado_em),
  atualizadoEm: iso(l.atualizado_em),
});

type ItemLido = Omit<Lida<ProntuarioItemLinha>, 'seq' | 'atualizado_em' | 'inativado_por'> & { pessoa_id: string };
const paraItem = (l: ItemLido): ProntuarioItem => ({
  id: l.id,
  prontuarioId: l.prontuario_id,
  pessoaId: l.pessoa_id,
  tipo: l.tipo,
  descricao: l.descricao,
  registradoPor: l.registrado_por,
  registradoEm: iso(l.registrado_em),
  inativadoEm: isoOuNulo(l.inativado_em),
});

const paraAtendimento = (l: Lida<AtendimentoLinha>): Atendimento => ({
  id: l.id,
  pessoaId: l.pessoa_id,
  prontuarioId: l.prontuario_id,
  profissionalId: l.profissional_id,
  profissionalNome: l.profissional_nome,
  dispositivoId: l.dispositivo_id,
  iniciadoEm: iso(l.iniciado_em),
  recebidoEm: iso(l.recebido_em),
  localDescricao: l.local_descricao,
  latitude: l.latitude,
  longitude: l.longitude,
  queixaPrincipal: l.queixa_principal,
  status: l.status,
  encerradoEm: isoOuNulo(l.encerrado_em),
});

// O que esta gravado ja passou pela validacao estrita na entrada; aqui so muda o formato.
const paraEvento = (l: Lida<EventoLinha>): Evento =>
  ({
    id: l.id,
    atendimentoId: l.atendimento_id,
    tipo: l.tipo,
    ocorridoEm: iso(l.ocorrido_em),
    dados: l.dados,
    ...(l.retifica_evento_id ? { retificaEventoId: l.retifica_evento_id } : {}),
    profissionalId: l.profissional_id,
    profissionalNome: l.profissional_nome,
    dispositivoId: l.dispositivo_id,
    recebidoEm: iso(l.recebido_em),
  }) as Evento;

const COLUNA_DA_PESSOA: Record<CampoEditavelPessoa, keyof PessoaLinha> = {
  nome: 'nome',
  dataNascimento: 'data_nascimento',
  sexo: 'sexo',
  cpf: 'cpf',
  cns: 'cns',
  telefone: 'telefone',
  contatoEmergenciaNome: 'contato_emergencia_nome',
  contatoEmergenciaTelefone: 'contato_emergencia_telefone',
  contatoEmergenciaEmail: 'contato_emergencia_email',
  naoIdentificada: 'nao_identificada',
  descricaoIdentificacao: 'descricao_identificacao',
};

// ---------- paginacao por chave (keyset) ----------

const codificarCursor = (chave: string, id: string): string =>
  Buffer.from(JSON.stringify([chave, id])).toString('base64url');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** O que cada tipo de chave pode conter - exatamente o formato que `codificarCursor` recebe do banco. */
const CHAVE_VALIDA: Record<Ordenacao['tipo'], RegExp> = {
  // timestamptz::text, ex.: 2026-11-18 00:49:52.285123+00
  timestamptz: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]) ([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,6})?[+-]\d{2}(:\d{2})?$/,
  // texto qualquer, menos caracteres de controle (o NUL nem e aceito pelo Postgres)
  text: /^[^\u0000-\u001F\u007F]{0,1000}$/,
};

/**
 * O cursor e opaco para o cliente, mas vem dele: tudo e conferido ANTES de chegar ao SQL.
 * A mensagem de erro nunca repete o valor recebido.
 */
function decodificarCursor(cursor: string, tipo: Ordenacao['tipo']): [string, string] {
  try {
    const lido: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(lido) && lido.length === 2) {
      const [chave, id]: unknown[] = lido;
      if (typeof chave === 'string' && typeof id === 'string' && UUID.test(id) && CHAVE_VALIDA[tipo].test(chave)) {
        return [chave, id];
      }
    }
  } catch {
    // cai no erro abaixo
  }
  throw validacao('cursor', 'cursor inválido');
}

type Ordenacao = {
  /** Expressao de ordenacao; a consulta deve seleciona-la como texto na coluna `_chave`. */
  chave: RawBuilder<unknown>;
  tipo: 'text' | 'timestamptz';
  /** Coluna de desempate (uuid); a consulta deve traze-la como `id`. */
  id: RawBuilder<unknown>;
  decrescente?: boolean;
};

async function paginar<L extends { _chave: string; id: string }>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- helper generico sobre qualquer consulta
  consulta: SelectQueryBuilder<any, any, L>,
  ordem: Ordenacao,
  { limite, cursor }: Paginacao,
): Promise<{ linhas: L[]; proximoCursor: string | null }> {
  const sentido = ordem.decrescente ? 'desc' : 'asc';
  if (cursor) {
    const [chave, id] = decodificarCursor(cursor, ordem.tipo);
    const comparador = sql.raw(ordem.decrescente ? '<' : '>');
    consulta = consulta.where(
      sql<boolean>`(${ordem.chave}, ${ordem.id}) ${comparador} (${chave}::${sql.raw(ordem.tipo)}, ${id}::uuid)`,
    );
  }
  const lidas = await consulta
    .orderBy(ordem.chave, sentido)
    .orderBy(ordem.id, sentido)
    .limit(limite + 1)
    .execute();
  const linhas = lidas.slice(0, limite);
  const ultima = linhas.at(-1);
  return {
    linhas,
    proximoCursor: lidas.length > limite && ultima ? codificarCursor(ultima._chave, ultima.id) : null,
  };
}

const chaveTexto = (expressao: RawBuilder<unknown>) => sql<string>`(${expressao})::text`.as('_chave');

// ---------- repositorio ----------

export class RepositorioClinicoSql implements RepositorioClinico {
  /** `banco` pode ser a conexao comum ou uma transacao aberta (ambas sao `Kysely`). */
  constructor(private readonly banco: Banco) {}

  async travarChave(opId: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${opId}, 0))`.execute(this.banco);
  }

  async buscarOperacao(opId: string): Promise<OperacaoGuardada | null> {
    const linha = await this.banco
      .selectFrom('clinico.operacao_sync')
      .select(['hash_corpo', 'resposta', 'profissional_id', 'metodo', 'rota'])
      .where('op_id', '=', opId)
      .executeTakeFirst();
    return linha
      ? {
          hashCorpo: linha.hash_corpo,
          resposta: linha.resposta,
          profissionalId: linha.profissional_id,
          metodo: linha.metodo,
          rota: linha.rota,
        }
      : null;
  }

  async registrarOperacao(operacao: OperacaoSync): Promise<void> {
    await this.banco
      .insertInto('clinico.operacao_sync')
      .values({
        op_id: operacao.opId,
        profissional_id: operacao.autor.profissionalId,
        dispositivo_id: operacao.autor.dispositivoId,
        metodo: operacao.metodo,
        rota: operacao.rota,
        entidade_id: operacao.entidadeId,
        hash_corpo: operacao.hashCorpo,
        status_http: operacao.statusHttp,
        resposta: JSON.stringify(operacao.resposta),
      })
      .execute();
  }

  async registrarAuditoria(registro: RegistroAuditoria): Promise<void> {
    await this.banco
      .insertInto('clinico.auditoria_clinica')
      .values({
        entidade: registro.entidade,
        entidade_id: registro.entidadeId,
        acao: registro.acao,
        profissional_id: registro.autor.profissionalId,
        dispositivo_id: registro.autor.dispositivoId,
        op_id: registro.opId,
        antes: registro.antes === undefined ? null : JSON.stringify(registro.antes),
        depois: registro.depois === undefined ? null : JSON.stringify(registro.depois),
        observacao: registro.observacao ?? null,
      })
      .execute();
  }

  // --- medicamento ---

  async listarMedicamentos(filtro: { incluirInativos: boolean }, paginacao: Paginacao): Promise<Pagina<Medicamento>> {
    const nome = sql`nome`;
    let consulta = this.banco.selectFrom('clinico.medicamento').selectAll().select(chaveTexto(nome));
    if (!filtro.incluirInativos) consulta = consulta.where('ativo', '=', true);
    const { linhas, proximoCursor } = await paginar(consulta, { chave: nome, tipo: 'text', id: sql`id` }, paginacao);
    return { itens: linhas.map(paraMedicamento), proximoCursor };
  }

  async buscarMedicamento(id: string): Promise<Medicamento | null> {
    const linha = await this.banco
      .selectFrom('clinico.medicamento')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return linha ? paraMedicamento(linha) : null;
  }

  // --- pessoa ---

  async buscarPessoa(id: string, opcoes?: { travar?: boolean }): Promise<PessoaGuardada | null> {
    let consulta = this.banco.selectFrom('clinico.pessoa').selectAll().where('id', '=', id);
    if (opcoes?.travar) consulta = consulta.forUpdate();
    const linha = await consulta.executeTakeFirst();
    return linha ? { pessoa: paraPessoa(linha), carimbos: linha.carimbos_campos } : null;
  }

  async listarPessoas(
    filtro: { busca?: string; somenteDuplicatas: boolean },
    paginacao: Paginacao,
  ): Promise<Pagina<Pessoa>> {
    const nome = sql`nome`;
    let consulta = this.banco.selectFrom('clinico.pessoa').selectAll().select(chaveTexto(nome));
    if (filtro.somenteDuplicatas) consulta = consulta.where('possivel_duplicata_de', 'is not', null);
    if (filtro.busca) {
      // Os curingas do LIKE digitados pelo usuario valem como texto comum.
      const trecho = `%${filtro.busca.replace(/[\\%_]/g, '\\$&')}%`;
      const digitos = filtro.busca.replace(/\D/g, '');
      consulta = consulta.where((eb) =>
        eb.or([eb('nome', 'ilike', trecho), ...(digitos ? [eb('cpf', 'like', `${digitos}%`)] : [])]),
      );
    }
    const { linhas, proximoCursor } = await paginar(consulta, { chave: nome, tipo: 'text', id: sql`id` }, paginacao);
    return { itens: linhas.map(paraPessoa), proximoCursor };
  }

  async buscarPossiveisDuplicatas(pessoa: {
    id: string;
    cpf: string | null;
    nome: string;
    dataNascimento: string | null;
  }): Promise<{ id: string }[]> {
    if (!pessoa.cpf && !pessoa.dataNascimento) return [];
    return this.banco
      .selectFrom('clinico.pessoa')
      .select('id')
      .where('id', '<>', pessoa.id)
      .where((eb) =>
        eb.or([
          ...(pessoa.cpf ? [eb('cpf', '=', pessoa.cpf)] : []),
          ...(pessoa.dataNascimento
            ? [sql<boolean>`(lower(nome) = lower(${pessoa.nome}) and data_nascimento = ${pessoa.dataNascimento}::date)`]
            : []),
        ]),
      )
      .orderBy('criado_em')
      .orderBy('id')
      .execute();
  }

  async inserirPessoa(
    pessoa: Omit<Pessoa, 'criadoEm' | 'atualizadoEm'>,
    carimbos: Record<string, string>,
    criadoPor: string,
  ): Promise<boolean> {
    const resultado = await this.banco
      .insertInto('clinico.pessoa')
      .values({
        id: pessoa.id,
        nome: pessoa.nome,
        data_nascimento: pessoa.dataNascimento,
        sexo: pessoa.sexo,
        cpf: pessoa.cpf,
        cns: pessoa.cns,
        telefone: pessoa.telefone,
        contato_emergencia_nome: pessoa.contatoEmergenciaNome,
        contato_emergencia_telefone: pessoa.contatoEmergenciaTelefone,
        contato_emergencia_email: pessoa.contatoEmergenciaEmail,
        nao_identificada: pessoa.naoIdentificada,
        descricao_identificacao: pessoa.descricaoIdentificacao,
        possivel_duplicata_de: pessoa.possivelDuplicataDe,
        carimbos_campos: JSON.stringify(carimbos),
        criado_por: criadoPor,
      })
      .onConflict((conflito) => conflito.column('id').doNothing())
      .executeTakeFirst();
    return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async atualizarPessoa(
    id: string,
    alteracao: {
      campos: Partial<Record<CampoEditavelPessoa, unknown>>;
      carimbos: Record<string, string>;
      possivelDuplicataDe?: string;
    },
  ): Promise<void> {
    const colunas = Object.fromEntries(
      Object.entries(alteracao.campos).map(([campo, valor]) => [COLUNA_DA_PESSOA[campo as CampoEditavelPessoa], valor]),
    );
    await this.banco
      .updateTable('clinico.pessoa')
      .set({
        ...colunas,
        carimbos_campos: JSON.stringify(alteracao.carimbos),
        ...(alteracao.possivelDuplicataDe ? { possivel_duplicata_de: alteracao.possivelDuplicataDe } : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  // --- prontuario ---

  private consultaItens() {
    return this.banco
      .selectFrom('clinico.prontuario_item as i')
      .innerJoin('clinico.prontuario as r', 'r.id', 'i.prontuario_id')
      .selectAll('i')
      .select('r.pessoa_id');
  }

  async buscarProntuarioDaPessoa(pessoaId: string): Promise<Prontuario | null> {
    const linha = await this.banco
      .selectFrom('clinico.prontuario')
      .selectAll()
      .where('pessoa_id', '=', pessoaId)
      .executeTakeFirst();
    if (!linha) return null;
    const itens = await this.consultaItens()
      .where('i.prontuario_id', '=', linha.id)
      .orderBy('i.registrado_em')
      .orderBy('i.id')
      .execute();
    return { ...paraProntuario(linha), itens: itens.map(paraItem) };
  }

  async listarProntuarios(paginacao: Paginacao): Promise<Pagina<ProntuarioComPessoa>> {
    const nome = sql`p.nome`;
    const consulta = this.banco
      .selectFrom('clinico.prontuario as r')
      .innerJoin('clinico.pessoa as p', 'p.id', 'r.pessoa_id')
      .selectAll('r')
      .select([
        'p.nome as pessoa_nome',
        'p.data_nascimento as pessoa_data_nascimento',
        'p.cpf as pessoa_cpf',
        'p.nao_identificada as pessoa_nao_identificada',
        chaveTexto(nome),
      ]);
    const { linhas, proximoCursor } = await paginar(consulta, { chave: nome, tipo: 'text', id: sql`r.id` }, paginacao);

    const itens = linhas.length
      ? await this.consultaItens()
          .where('i.prontuario_id', 'in', linhas.map((linha) => linha.id))
          .orderBy('i.registrado_em')
          .orderBy('i.id')
          .execute()
      : [];
    return {
      itens: linhas.map((linha) => ({
        ...paraProntuario(linha),
        itens: itens.filter((item) => item.prontuario_id === linha.id).map(paraItem),
        pessoa: {
          id: linha.pessoa_id,
          nome: linha.pessoa_nome,
          dataNascimento: linha.pessoa_data_nascimento,
          cpf: linha.pessoa_cpf,
          naoIdentificada: linha.pessoa_nao_identificada,
        },
      })),
      proximoCursor,
    };
  }

  async inserirProntuario(prontuario: {
    id: string;
    pessoaId: string;
    tipoSanguineo: string | null;
    observacoes: string | null;
    criadoPor: string;
  }): Promise<boolean> {
    const resultado = await this.banco
      .insertInto('clinico.prontuario')
      .values({
        id: prontuario.id,
        pessoa_id: prontuario.pessoaId,
        tipo_sanguineo: prontuario.tipoSanguineo,
        observacoes: prontuario.observacoes,
        criado_por: prontuario.criadoPor,
      })
      .onConflict((conflito) => conflito.doNothing())
      .executeTakeFirst();
    return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async preencherProntuario(id: string, campos: { tipoSanguineo?: string; observacoes?: string }): Promise<void> {
    await this.banco
      .updateTable('clinico.prontuario')
      .set({
        ...(campos.tipoSanguineo ? { tipo_sanguineo: campos.tipoSanguineo } : {}),
        ...(campos.observacoes ? { observacoes: campos.observacoes } : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  async buscarItem(id: string): Promise<ProntuarioItem | null> {
    const linha = await this.consultaItens().where('i.id', '=', id).executeTakeFirst();
    return linha ? paraItem(linha) : null;
  }

  async inserirItem(item: {
    id: string;
    prontuarioId: string;
    tipo: ProntuarioItem['tipo'];
    descricao: string;
    registradoEm: string;
    registradoPor: string;
  }): Promise<boolean> {
    const resultado = await this.banco
      .insertInto('clinico.prontuario_item')
      .values({
        id: item.id,
        prontuario_id: item.prontuarioId,
        tipo: item.tipo,
        descricao: item.descricao,
        registrado_em: item.registradoEm,
        registrado_por: item.registradoPor,
        inativado_por: null,
      })
      .onConflict((conflito) => conflito.column('id').doNothing())
      .executeTakeFirst();
    return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async inativarItem(id: string, inativadoEm: string, inativadoPor: string): Promise<void> {
    await this.banco
      .updateTable('clinico.prontuario_item')
      .set({ inativado_em: inativadoEm, inativado_por: inativadoPor })
      .where('id', '=', id)
      .where('inativado_em', 'is', null)
      .execute();
  }

  // --- atendimento ---

  async buscarAtendimento(id: string): Promise<Atendimento | null> {
    const linha = await this.banco
      .selectFrom('clinico.atendimento')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return linha ? paraAtendimento(linha) : null;
  }

  async listarAtendimentos(filtro: { pessoaId?: string }, paginacao: Paginacao): Promise<Pagina<AtendimentoListado>> {
    const recebidoEm = sql`a.recebido_em`;
    let consulta = this.banco
      .selectFrom('clinico.atendimento as a')
      .innerJoin('clinico.pessoa as p', 'p.id', 'a.pessoa_id')
      .selectAll('a')
      .select(['p.nome as pessoa_nome', chaveTexto(recebidoEm)]);
    if (filtro.pessoaId) consulta = consulta.where('a.pessoa_id', '=', filtro.pessoaId);
    // Mais recentes primeiro.
    const { linhas, proximoCursor } = await paginar(
      consulta,
      { chave: recebidoEm, tipo: 'timestamptz', id: sql`a.id`, decrescente: true },
      paginacao,
    );
    return {
      itens: linhas.map((linha) => ({ ...paraAtendimento(linha), pessoaNome: linha.pessoa_nome })),
      proximoCursor,
    };
  }

  async inserirAtendimento(atendimento: Omit<Atendimento, 'recebidoEm' | 'status' | 'encerradoEm'>): Promise<boolean> {
    const resultado = await this.banco
      .insertInto('clinico.atendimento')
      .values({
        id: atendimento.id,
        prontuario_id: atendimento.prontuarioId,
        pessoa_id: atendimento.pessoaId,
        profissional_id: atendimento.profissionalId,
        profissional_nome: atendimento.profissionalNome,
        dispositivo_id: atendimento.dispositivoId,
        iniciado_em: atendimento.iniciadoEm,
        local_descricao: atendimento.localDescricao,
        latitude: atendimento.latitude,
        longitude: atendimento.longitude,
        queixa_principal: atendimento.queixaPrincipal,
      })
      .onConflict((conflito) => conflito.column('id').doNothing())
      .executeTakeFirst();
    return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async encerrarAtendimento(id: string, encerradoEm: string): Promise<void> {
    await this.banco
      .updateTable('clinico.atendimento')
      .set({ status: 'ENCERRADO', encerrado_em: encerradoEm })
      .where('id', '=', id)
      .where('status', '=', 'ABERTO')
      .execute();
  }

  async listarEventos(atendimentoId: string): Promise<Evento[]> {
    const linhas = await this.banco
      .selectFrom('clinico.atendimento_evento')
      .selectAll()
      .where('atendimento_id', '=', atendimentoId)
      .orderBy('ocorrido_em')
      .orderBy('id')
      .execute();
    return linhas.map(paraEvento);
  }

  async buscarEvento(id: string): Promise<Evento | null> {
    const linha = await this.banco
      .selectFrom('clinico.atendimento_evento')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return linha ? paraEvento(linha) : null;
  }

  async inserirEvento(evento: EventoNovo, medicamentoId: string | null): Promise<boolean> {
    const resultado = await this.banco
      .insertInto('clinico.atendimento_evento')
      .values({
        id: evento.id,
        atendimento_id: evento.atendimentoId,
        tipo: evento.tipo,
        ocorrido_em: evento.ocorridoEm,
        profissional_id: evento.profissionalId,
        profissional_nome: evento.profissionalNome,
        dispositivo_id: evento.dispositivoId,
        medicamento_id: medicamentoId,
        retifica_evento_id: evento.tipo === 'RETIFICACAO' ? evento.retificaEventoId : null,
        dados: JSON.stringify(evento.dados),
      })
      .onConflict((conflito) => conflito.column('id').doNothing())
      .executeTakeFirst();
    return (resultado.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  // --- descida ---

  async alteracoesDesde(cursor: string, limite: number): Promise<Alteracoes> {
    // UMA consulta = UM snapshot: as quatro tabelas sao lidas no mesmo instante, entao nenhum seq
    // menor que o cursor devolvido pode aparecer depois (o trigger garante seq em ordem de commit).
    const { rows } = await sql<{ tabela: string; seq: string; linha: never }>`
      select tabela, seq::text as seq, linha from (
        select 'medicamento' as tabela, m.seq, to_jsonb(m) as linha
          from clinico.medicamento m where m.seq > ${cursor}::bigint
        union all
        select 'pessoa', p.seq, to_jsonb(p) from clinico.pessoa p where p.seq > ${cursor}::bigint
        union all
        select 'prontuario', r.seq, to_jsonb(r) from clinico.prontuario r where r.seq > ${cursor}::bigint
        union all
        select 'prontuario_item', i.seq, to_jsonb(i) || jsonb_build_object('pessoa_id', r.pessoa_id)
          from clinico.prontuario_item i join clinico.prontuario r on r.id = i.prontuario_id
          where i.seq > ${cursor}::bigint
      ) alteracoes
      order by alteracoes.seq
      limit ${limite + 1}
    `.execute(this.banco);

    const pagina = rows.slice(0, limite);
    const daTabela = (tabela: string) => pagina.filter((linha) => linha.tabela === tabela).map((linha) => linha.linha);
    return {
      medicamentos: daTabela('medicamento').map(paraMedicamento),
      pessoas: daTabela('pessoa').map(paraPessoa),
      prontuarios: daTabela('prontuario').map(paraProntuario),
      prontuarioItens: daTabela('prontuario_item').map(paraItem),
      proximoCursor: pagina.at(-1)?.seq ?? cursor,
      temMais: rows.length > limite,
    };
  }
}

export class UnidadeDeTrabalhoSql implements UnidadeDeTrabalho {
  readonly leitura: RepositorioClinico;

  constructor(private readonly banco: Banco) {
    this.leitura = new RepositorioClinicoSql(banco);
  }

  transacao<T>(trabalho: (repositorio: RepositorioClinico) => Promise<T>): Promise<T> {
    return this.banco.transaction().execute((transacao) => trabalho(new RepositorioClinicoSql(transacao)));
  }
}
