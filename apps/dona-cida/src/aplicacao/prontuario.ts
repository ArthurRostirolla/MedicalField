import { randomUUID } from 'node:crypto';
import type {
  InativacaoEntrada,
  Prontuario,
  ProntuarioEntrada,
  ProntuarioItem,
  ProntuarioItemEntrada,
} from '@medicalfield/contratos';
import { Inject, Injectable } from '@nestjs/common';
import { RegistroEstrategias } from '../dominio/conflito/registro.ts';
import { ErroAplicacao, naoEncontrado, validacao } from '../dominio/erros.ts';
import { limitarAoServidor } from '../dominio/relogio.ts';
import type { RepositorioClinico } from '../dominio/repositorios.ts';
import { ExecutorComandos, type Auditar, type ContextoComando, type ResultadoComando } from './comando.ts';

/** Regra de escrita 5: referencia inexistente e 422 (nao 404), para o outbox reter os dependentes. */
export async function exigirPessoa(repositorio: RepositorioClinico, pessoaId: string): Promise<void> {
  // A trava na pessoa serializa quem for criar o prontuario dela.
  if (!(await repositorio.buscarPessoa(pessoaId, { travar: true }))) {
    throw validacao('pessoaId', 'pessoa desconhecida');
  }
}

async function prontuarioGravado(repositorio: RepositorioClinico, pessoaId: string): Promise<Prontuario> {
  const prontuario = await repositorio.buscarProntuarioDaPessoa(pessoaId);
  if (!prontuario) throw new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
  return prontuario;
}

/**
 * Regra de escrita 2: devolve o prontuario da pessoa, criando um vazio se nao existir.
 * A pessoa ja deve estar travada (`exigirPessoa`).
 */
export async function resolverProntuario(
  repositorio: RepositorioClinico,
  pessoaId: string,
  contexto: ContextoComando,
  auditar: Auditar,
): Promise<Prontuario> {
  const existente = await repositorio.buscarProntuarioDaPessoa(pessoaId);
  if (existente) return existente;

  const id = randomUUID();
  await repositorio.inserirProntuario({
    id,
    pessoaId,
    tipoSanguineo: null,
    observacoes: null,
    criadoPor: contexto.autor.profissionalId,
  });
  await auditar({
    entidade: 'prontuario',
    entidadeId: id,
    acao: 'CRIACAO',
    depois: { pessoaId },
    observacao: 'prontuário vazio criado pelo servidor',
  });
  return prontuarioGravado(repositorio, pessoaId);
}

type ItemNovo = { id: string; tipo: ProntuarioItem['tipo']; descricao: string; registradoEm: string };

async function gravarItem(
  repositorio: RepositorioClinico,
  prontuarioId: string,
  item: ItemNovo,
  contexto: ContextoComando,
  auditar: Auditar,
): Promise<boolean> {
  const relogio = limitarAoServidor('registradoEm', item.registradoEm, contexto.agora);
  const novo = { id: item.id, prontuarioId, tipo: item.tipo, descricao: item.descricao, registradoEm: relogio.valor };
  if (!(await repositorio.inserirItem({ ...novo, registradoPor: contexto.autor.profissionalId }))) return false;
  await auditar({
    entidade: 'prontuario_item',
    entidadeId: item.id,
    acao: 'CRIACAO',
    depois: novo,
    observacao: relogio.observacao,
  });
  return true;
}

/** `POST /prontuario`. Pessoa que ja tem prontuario: 200 com o existente, unindo os itens novos. */
@Injectable()
export class CadastrarProntuarioUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(entrada: ProntuarioEntrada, contexto: ContextoComando): Promise<ResultadoComando<Prontuario>> {
    return this.comandos.executar(contexto, entrada.id, async (repositorio, auditar) => {
      await exigirPessoa(repositorio, entrada.pessoaId);
      const existente = await repositorio.buscarProntuarioDaPessoa(entrada.pessoaId);

      if (!existente) {
        const novo = {
          id: entrada.id,
          pessoaId: entrada.pessoaId,
          tipoSanguineo: entrada.tipoSanguineo ?? null,
          observacoes: entrada.observacoes ?? null,
        };
        if (!(await repositorio.inserirProntuario({ ...novo, criadoPor: contexto.autor.profissionalId }))) {
          throw validacao('id', 'já usado por outro prontuário');
        }
        await auditar({ entidade: 'prontuario', entidadeId: novo.id, acao: 'CRIACAO', depois: novo });
      } else {
        // Nunca sobrescreve: so preenche o que o prontuario existente ainda nao tem.
        const preencher = {
          ...(existente.tipoSanguineo === null && entrada.tipoSanguineo ? { tipoSanguineo: entrada.tipoSanguineo } : {}),
          ...(existente.observacoes === null && entrada.observacoes ? { observacoes: entrada.observacoes } : {}),
        };
        if (Object.keys(preencher).length > 0) {
          await repositorio.preencherProntuario(existente.id, preencher);
          await auditar({ entidade: 'prontuario', entidadeId: existente.id, acao: 'ALTERACAO', depois: preencher });
        }
      }

      const prontuarioId = existente?.id ?? entrada.id;
      const { novos } = this.estrategias.para('prontuarioItem').resolver(existente?.itens ?? [], entrada.itens ?? []);
      for (const item of novos) await gravarItem(repositorio, prontuarioId, item, contexto, auditar);

      return { status: existente ? 200 : 201, corpo: await prontuarioGravado(repositorio, entrada.pessoaId) };
    });
  }
}

/** `POST /prontuario-item`. Adicao sempre vence (UniaoImutavel). */
@Injectable()
export class AcrescentarItemProntuarioUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(entrada: ProntuarioItemEntrada, contexto: ContextoComando): Promise<ResultadoComando<ProntuarioItem>> {
    return this.comandos.executar(contexto, entrada.id, async (repositorio, auditar) => {
      await exigirPessoa(repositorio, entrada.pessoaId);
      const existente = await repositorio.buscarItem(entrada.id);
      const { novos } = this.estrategias.para('prontuarioItem').resolver(existente ? [existente] : [], [entrada]);

      let criado = false;
      for (const item of novos) {
        const prontuario = await resolverProntuario(repositorio, entrada.pessoaId, contexto, auditar);
        criado = await gravarItem(repositorio, prontuario.id, item, contexto, auditar);
      }
      const gravado = await repositorio.buscarItem(entrada.id);
      if (!gravado) throw new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
      return { status: criado ? 201 : 200, corpo: gravado };
    });
  }
}

/** `POST /prontuario-item/{id}/inativacao`. Remover e um ato explicito, com autor. */
@Injectable()
export class InativarItemProntuarioUseCase {
  constructor(@Inject(ExecutorComandos) private readonly comandos: ExecutorComandos) {}

  executar(id: string, entrada: InativacaoEntrada, contexto: ContextoComando): Promise<ResultadoComando<ProntuarioItem>> {
    return this.comandos.executar(contexto, id, async (repositorio, auditar) => {
      const item = await repositorio.buscarItem(id);
      if (!item) throw naoEncontrado('Item de prontuário');
      if (item.inativadoEm) return { status: 200, corpo: item };

      const relogio = limitarAoServidor('inativadoEm', entrada.inativadoEm, contexto.agora);
      await repositorio.inativarItem(id, relogio.valor, contexto.autor.profissionalId);
      await auditar({
        entidade: 'prontuario_item',
        entidadeId: id,
        acao: 'INATIVACAO',
        antes: { inativadoEm: null },
        depois: { inativadoEm: relogio.valor },
        observacao: relogio.observacao,
      });
      return { status: 200, corpo: { ...item, inativadoEm: relogio.valor } };
    });
  }
}
