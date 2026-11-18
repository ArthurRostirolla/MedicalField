// Repository de pessoas, prontuarios e catalogo: a interface so conhece isto, nunca a API.
// Toda escrita e UMA transacao local: dado + comando(s) no outbox + log.
import {
  pessoaEntradaSchema,
  prontuarioEntradaSchema,
  prontuarioItemEntradaSchema,
  inativacaoEntradaSchema,
  type Medicamento,
  type Pessoa,
  type PessoaEntrada,
  type TipoItem,
} from '@medicalfield/contratos';
import { linhaParaObjeto, sqlInserir } from '../banco/banco.ts';
import type { ComandoSql } from '../banco/executor.ts';
import { estadoEnvio, logAcao, sqlStatusEnvio, validar, type ContextoDados, type EstadoEnvio } from './contexto.ts';
import { sqlNovoComando } from './outbox.ts';

export type PessoaLocal = Pessoa & { envio: EstadoEnvio };

export interface ItemLocal {
  id: string;
  pessoaId: string;
  tipo: TipoItem;
  descricao: string;
  registradoEm: string;
  inativadoEm: string | null;
  envio: EstadoEnvio;
}

export interface ProntuarioLocal {
  /** `null` = a pessoa ainda nao tem prontuario neste aparelho. */
  tipoSanguineo: string | null;
  observacoes: string | null;
  existe: boolean;
  itens: ItemLocal[];
}

/** O que o formulario de paciente entrega; texto vazio = campo nao informado. */
export interface FormularioPessoa {
  nome: string;
  naoIdentificada: boolean;
  descricaoIdentificacao: string;
  dataNascimento: string;
  sexo: '' | 'M' | 'F' | 'I';
  cpf: string;
  cns: string;
  telefone: string;
  contatoEmergenciaNome: string;
  contatoEmergenciaTelefone: string;
  contatoEmergenciaEmail: string;
  tipoSanguineo: string;
  observacoes: string;
  itens: Array<{ tipo: TipoItem; descricao: string }>;
}

export const FORMULARIO_PESSOA_VAZIO: FormularioPessoa = {
  nome: '',
  naoIdentificada: false,
  descricaoIdentificacao: '',
  dataNascimento: '',
  sexo: '',
  cpf: '',
  cns: '',
  telefone: '',
  contatoEmergenciaNome: '',
  contatoEmergenciaTelefone: '',
  contatoEmergenciaEmail: '',
  tipoSanguineo: '',
  observacoes: '',
  itens: [],
};

const paraPessoa = (linha: Record<string, unknown>): PessoaLocal => {
  const { statusEnvio, estadoSync, ...pessoa } = linhaParaObjeto<Record<string, unknown>>(linha, {
    booleanos: ['naoIdentificada'],
  });
  return { ...(pessoa as unknown as Pessoa), envio: estadoEnvio(statusEnvio, estadoSync) };
};

const somenteDigitos = (texto: string) => texto.replace(/\D/g, '');
const opcional = (texto: string) => (texto.trim() === '' ? undefined : texto.trim());

/** Monta o corpo de `POST /pessoa` a partir do formulario (CPF e CNS so com digitos). */
function corpoPessoa(ctx: ContextoDados, id: string, formulario: FormularioPessoa): PessoaEntrada {
  const hora = ctx.agora().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const nome = formulario.nome.trim() || (formulario.naoIdentificada ? `Não identificado — ${hora}` : '');
  const corpo = {
    id,
    nome,
    editadoEm: ctx.agora().toISOString(),
    naoIdentificada: formulario.naoIdentificada,
    descricaoIdentificacao: opcional(formulario.descricaoIdentificacao),
    dataNascimento: opcional(formulario.dataNascimento),
    sexo: formulario.sexo || undefined,
    cpf: opcional(somenteDigitos(formulario.cpf)),
    cns: opcional(somenteDigitos(formulario.cns)),
    telefone: opcional(formulario.telefone),
    contatoEmergenciaNome: opcional(formulario.contatoEmergenciaNome),
    contatoEmergenciaTelefone: opcional(formulario.contatoEmergenciaTelefone),
    contatoEmergenciaEmail: opcional(formulario.contatoEmergenciaEmail),
  };
  // JSON.parse(JSON.stringify) tira os `undefined`: o esquema e estrito.
  return validar(pessoaEntradaSchema, JSON.parse(JSON.stringify(corpo)));
}

/** Linha local completa (nulos onde nao ha valor) a partir do corpo enviado. */
function linhaPessoa(corpo: PessoaEntrada, criadoEm: string) {
  return {
    id: corpo.id,
    nome: corpo.nome,
    dataNascimento: corpo.dataNascimento ?? null,
    sexo: corpo.sexo ?? null,
    cpf: corpo.cpf ?? null,
    cns: corpo.cns ?? null,
    telefone: corpo.telefone ?? null,
    contatoEmergenciaNome: corpo.contatoEmergenciaNome ?? null,
    contatoEmergenciaTelefone: corpo.contatoEmergenciaTelefone ?? null,
    contatoEmergenciaEmail: corpo.contatoEmergenciaEmail ?? null,
    naoIdentificada: corpo.naoIdentificada ?? false,
    descricaoIdentificacao: corpo.descricaoIdentificacao ?? null,
    possivelDuplicataDe: null,
    criadoEm,
    atualizadoEm: corpo.editadoEm,
    estadoSync: 'LOCAL',
  };
}

export class RepositorioPessoas {
  constructor(private readonly ctx: ContextoDados) {}

  /** Busca local por parte do nome ou do CPF; sem texto, as mais recentes. */
  async buscar(texto: string, limite = 50): Promise<PessoaLocal[]> {
    const termo = texto.trim();
    const digitos = somenteDigitos(termo);
    const linhas = await this.ctx.banco.consultar(
      `SELECT p.*, ${sqlStatusEnvio('pessoa', 'p.id')} FROM pessoa p
       WHERE ? = '' OR p.nome LIKE ? ESCAPE '\\' OR (? != '' AND p.cpf LIKE ?)
       ORDER BY (p.estado_sync = 'LOCAL') DESC, p.atualizado_em DESC, p.nome COLLATE NOCASE LIMIT ?`,
      [termo, `%${termo.replace(/[\\%_]/g, '\\$&')}%`, digitos, `${digitos}%`, limite],
    );
    return linhas.map(paraPessoa);
  }

  async obter(id: string): Promise<PessoaLocal | null> {
    const [linha] = await this.ctx.banco.consultar(
      `SELECT p.*, ${sqlStatusEnvio('pessoa', 'p.id')} FROM pessoa p WHERE p.id = ?`,
      [id],
    );
    return linha ? paraPessoa(linha) : null;
  }

  async contar(): Promise<number> {
    const [linha] = await this.ctx.banco.consultar<{ n: number }>('SELECT count(*) AS n FROM pessoa');
    return linha?.n ?? 0;
  }

  /** Cria pessoa + prontuario (com os itens informados) numa transacao. Devolve o id da pessoa. */
  async criar(formulario: FormularioPessoa): Promise<string> {
    const { ctx } = this;
    const profissional = ctx.profissional();
    const agora = ctx.agora().toISOString();
    const pessoaId = ctx.novoId();
    const pessoa = corpoPessoa(ctx, pessoaId, formulario);
    const itens = formulario.itens
      .filter((item) => item.descricao.trim() !== '')
      .map((item) => ({ id: ctx.novoId(), tipo: item.tipo, descricao: item.descricao.trim(), registradoEm: agora }));
    const prontuario = validar(
      prontuarioEntradaSchema,
      JSON.parse(
        JSON.stringify({
          id: ctx.novoId(),
          pessoaId,
          tipoSanguineo: opcional(formulario.tipoSanguineo),
          observacoes: opcional(formulario.observacoes),
          itens: itens.length ? itens : undefined,
        }),
      ),
    );

    const sql: ComandoSql[] = [
      sqlInserir('pessoa', linhaPessoa(pessoa, agora)),
      sqlInserir('prontuario', {
        pessoaId,
        id: prontuario.id,
        tipoSanguineo: prontuario.tipoSanguineo ?? null,
        observacoes: prontuario.observacoes ?? null,
        criadoEm: agora,
        atualizadoEm: agora,
        estadoSync: 'LOCAL',
      }),
      ...itens.map((item) =>
        sqlInserir('prontuario_item', { ...item, pessoaId, prontuarioId: prontuario.id, registradoPor: profissional.id, estadoSync: 'LOCAL' }),
      ),
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: '/api/v1/pessoa',
        corpo: pessoa,
        entidade: 'pessoa',
        entidadeId: pessoaId,
        descricao: `Novo paciente: ${pessoa.nome}`,
        profissionalId: profissional.id,
        criadoEm: agora,
      }),
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: '/api/v1/prontuario',
        corpo: prontuario,
        entidade: 'prontuario',
        entidadeId: pessoaId,
        dependeDe: { entidade: 'pessoa', id: pessoaId },
        descricao: `Prontuário de ${pessoa.nome}${itens.length ? ` (${itens.length} ${itens.length === 1 ? 'item' : 'itens'})` : ''}`,
        profissionalId: profissional.id,
        criadoEm: agora,
      }),
      logAcao(ctx, 'PESSOA_CRIADA', 'pessoa', pessoaId, { naoIdentificada: pessoa.naoIdentificada ?? false }),
      logAcao(ctx, 'PRONTUARIO_CRIADO', 'prontuario', prontuario.id, { itens: itens.length }),
    ];
    await ctx.banco.gravar(sql);
    ctx.aposEscrita();
    return pessoaId;
  }

  /**
   * Corrige um cadastro que o servidor rejeitou: regrava a linha local e o corpo do comando,
   * com nova chave de idempotencia (corpo diferente com a mesma chave seria recusado), e devolve a fila.
   */
  async corrigirRejeitada(opId: string, formulario: FormularioPessoa): Promise<void> {
    const { ctx } = this;
    const [comando] = await ctx.banco.consultar<{ entidade_id: string }>(
      "SELECT entidade_id FROM outbox WHERE op_id = ? AND entidade = 'pessoa' AND status = 'REJEITADA'",
      [opId],
    );
    if (!comando) throw new Error('Esta pendência não é um cadastro rejeitado.');
    const pessoa = corpoPessoa(ctx, comando.entidade_id, formulario);
    const { criadoEm: _criadoEm, ...linha } = linhaPessoa(pessoa, pessoa.editadoEm);
    await ctx.banco.gravar([
      sqlInserir('pessoa', { ...linha, criadoEm: pessoa.editadoEm }, { conflito: 'id' }),
      {
        sql: "UPDATE outbox SET op_id = ?, corpo = ?, descricao = ?, status = 'PENDENTE', recuo = 0, proxima_tentativa_em = NULL, ultimo_erro = NULL WHERE op_id = ?",
        params: [ctx.novoId(), JSON.stringify(pessoa), `Novo paciente: ${pessoa.nome}`, opId],
      },
      logAcao(ctx, 'PENDENCIA_CORRIGIDA', 'pessoa', comando.entidade_id),
    ]);
    ctx.aposEscrita();
  }

  /** Formulario preenchido com o cadastro local (para corrigir uma rejeicao). */
  async formularioDe(pessoaId: string): Promise<FormularioPessoa | null> {
    const pessoa = await this.obter(pessoaId);
    if (!pessoa) return null;
    return {
      ...FORMULARIO_PESSOA_VAZIO,
      nome: pessoa.nome,
      naoIdentificada: pessoa.naoIdentificada,
      descricaoIdentificacao: pessoa.descricaoIdentificacao ?? '',
      dataNascimento: pessoa.dataNascimento ?? '',
      sexo: pessoa.sexo ?? '',
      cpf: pessoa.cpf ?? '',
      cns: pessoa.cns ?? '',
      telefone: pessoa.telefone ?? '',
      contatoEmergenciaNome: pessoa.contatoEmergenciaNome ?? '',
      contatoEmergenciaTelefone: pessoa.contatoEmergenciaTelefone ?? '',
      contatoEmergenciaEmail: pessoa.contatoEmergenciaEmail ?? '',
    };
  }
}

export class RepositorioProntuarios {
  constructor(private readonly ctx: ContextoDados) {}

  async obter(pessoaId: string): Promise<ProntuarioLocal> {
    const [prontuario] = await this.ctx.banco.consultar<{ tipo_sanguineo: string | null; observacoes: string | null }>(
      'SELECT tipo_sanguineo, observacoes FROM prontuario WHERE pessoa_id = ?',
      [pessoaId],
    );
    const linhas = await this.ctx.banco.consultar(
      `SELECT i.id, i.pessoa_id, i.tipo, i.descricao, i.registrado_em, i.inativado_em, i.estado_sync,
              ${sqlStatusEnvio('prontuario_item', 'i.id')}
       FROM prontuario_item i WHERE i.pessoa_id = ? ORDER BY i.registrado_em, i.id`,
      [pessoaId],
    );
    return {
      existe: prontuario !== undefined,
      tipoSanguineo: prontuario?.tipo_sanguineo ?? null,
      observacoes: prontuario?.observacoes ?? null,
      itens: linhas.map((linha) => {
        const { statusEnvio, estadoSync, ...item } = linhaParaObjeto<Record<string, unknown>>(linha);
        return { ...(item as unknown as Omit<ItemLocal, 'envio'>), envio: estadoEnvio(statusEnvio, estadoSync) };
      }),
    };
  }

  /** Acrescenta alergia, comorbidade ou medicacao continua. Cria o prontuario local se faltar. */
  async adicionarItem(pessoaId: string, tipo: TipoItem, descricao: string): Promise<void> {
    const { ctx } = this;
    const profissional = ctx.profissional();
    const agora = ctx.agora().toISOString();
    const item = validar(prontuarioItemEntradaSchema, { id: ctx.novoId(), pessoaId, tipo, descricao, registradoEm: agora });
    const sql: ComandoSql[] = [];

    const [existente] = await ctx.banco.consultar<{ id: string }>('SELECT id FROM prontuario WHERE pessoa_id = ?', [pessoaId]);
    let prontuarioId = existente?.id;
    if (!prontuarioId) {
      // O servidor devolve o prontuario existente se a pessoa ja tiver um; o id local e trocado na confirmacao.
      prontuarioId = ctx.novoId();
      sql.push(
        sqlInserir('prontuario', { pessoaId, id: prontuarioId, criadoEm: agora, atualizadoEm: agora, estadoSync: 'LOCAL' }),
        sqlNovoComando({
          opId: ctx.novoId(),
          metodo: 'POST',
          rota: '/api/v1/prontuario',
          corpo: { id: prontuarioId, pessoaId },
          entidade: 'prontuario',
          entidadeId: pessoaId,
          dependeDe: { entidade: 'pessoa', id: pessoaId },
          descricao: 'Abertura de prontuário',
          profissionalId: profissional.id,
          criadoEm: agora,
        }),
      );
    }
    sql.push(
      sqlInserir('prontuario_item', {
        id: item.id,
        pessoaId,
        prontuarioId,
        tipo: item.tipo,
        descricao: item.descricao,
        registradoPor: profissional.id,
        registradoEm: agora,
        estadoSync: 'LOCAL',
      }),
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: '/api/v1/prontuario-item',
        corpo: item,
        entidade: 'prontuario_item',
        entidadeId: item.id,
        dependeDe: { entidade: 'pessoa', id: pessoaId },
        descricao: `${ROTULO_ITEM[tipo]}: ${item.descricao}`,
        profissionalId: profissional.id,
        criadoEm: agora,
      }),
      logAcao(ctx, 'PRONTUARIO_ITEM_ADICIONADO', 'prontuario_item', item.id, { tipo }),
    );
    await ctx.banco.gravar(sql);
    ctx.aposEscrita();
  }

  /** Inativar e um ato registrado (nunca apaga): o item continua na lista, marcado. */
  async inativarItem(item: Pick<ItemLocal, 'id' | 'pessoaId' | 'tipo' | 'descricao'>): Promise<void> {
    const { ctx } = this;
    const agora = ctx.agora().toISOString();
    const corpo = validar(inativacaoEntradaSchema, { inativadoEm: agora });
    await ctx.banco.gravar([
      { sql: "UPDATE prontuario_item SET inativado_em = ?, estado_sync = 'LOCAL' WHERE id = ?", params: [agora, item.id] },
      sqlNovoComando({
        opId: ctx.novoId(),
        metodo: 'POST',
        rota: `/api/v1/prontuario-item/${item.id}/inativacao`,
        corpo,
        entidade: 'prontuario_item',
        entidadeId: item.id,
        dependeDe: { entidade: 'pessoa', id: item.pessoaId },
        descricao: `Inativação — ${ROTULO_ITEM[item.tipo]}: ${item.descricao}`,
        profissionalId: ctx.profissional().id,
        criadoEm: agora,
      }),
      logAcao(ctx, 'PRONTUARIO_ITEM_INATIVADO', 'prontuario_item', item.id, { tipo: item.tipo }),
    ]);
    ctx.aposEscrita();
  }
}

export const ROTULO_ITEM: Record<TipoItem, string> = {
  ALERGIA: 'Alergia',
  COMORBIDADE: 'Comorbidade',
  MEDICACAO_CONTINUA: 'Medicação contínua',
};

/** Cadastro de apoio: somente leitura no app (ServidorVence). */
export class RepositorioMedicamentos {
  constructor(private readonly ctx: ContextoDados) {}

  async listarAtivos(): Promise<Medicamento[]> {
    const linhas = await this.ctx.banco.consultar('SELECT * FROM medicamento WHERE ativo = 1 ORDER BY nome COLLATE NOCASE');
    return linhas.map((linha) => linhaParaObjeto<Medicamento>(linha, { booleanos: ['ativo'] }));
  }

  async contar(): Promise<number> {
    const [linha] = await this.ctx.banco.consultar<{ n: number }>('SELECT count(*) AS n FROM medicamento WHERE ativo = 1');
    return linha?.n ?? 0;
  }
}
