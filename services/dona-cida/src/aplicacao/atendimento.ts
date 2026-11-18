import type { Atendimento, AtendimentoEntrada, Evento, EventoEntrada, EventoInicial } from '@medicalfield/contratos';
import { Inject, Injectable } from '@nestjs/common';
import { RegistroEstrategias } from '../dominio/conflito/registro.ts';
import { ErroAplicacao, validacao } from '../dominio/erros.ts';
import { limitarAoServidor } from '../dominio/relogio.ts';
import type { RepositorioClinico } from '../dominio/repositorios.ts';
import { ExecutorComandos, type Auditar, type ContextoComando, type ResultadoComando } from './comando.ts';
import { exigirPessoa, resolverProntuario } from './prontuario.ts';

async function atendimentoGravado(repositorio: RepositorioClinico, id: string): Promise<Atendimento> {
  const atendimento = await repositorio.buscarAtendimento(id);
  if (!atendimento) throw new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
  return atendimento;
}

/**
 * Acrescenta eventos a linha do tempo (UniaoImutavel): o que ja existe fica como esta, o novo entra.
 * ENCERRAMENTO passa o atendimento a ENCERRADO. Evento em atendimento ja encerrado e aceito:
 * dado clinico nunca e rejeitado por estado cadastral.
 */
async function gravarEventos(
  repositorio: RepositorioClinico,
  estrategias: RegistroEstrategias,
  atendimentoId: string,
  recebidos: readonly EventoInicial[],
  contexto: ContextoComando,
  auditar: Auditar,
): Promise<void> {
  const existentes = await repositorio.listarEventos(atendimentoId);
  const { novos } = estrategias.para('evento').resolver(existentes, recebidos);
  const conhecidos = new Set(existentes.map((evento) => evento.id));

  for (const evento of novos) {
    if (evento.tipo === 'RETIFICACAO' && !conhecidos.has(evento.retificaEventoId)) {
      throw validacao('retificaEventoId', 'evento desconhecido neste atendimento');
    }
    const relogio = limitarAoServidor('ocorridoEm', evento.ocorridoEm, contexto.agora);

    // O catalogo e do servidor (ServidorVence): id que ele nao conhece vira "fora do catalogo".
    let medicamentoId: string | null = null;
    if (evento.tipo === 'MEDICACAO' && evento.dados.medicamentoId) {
      const doCatalogo = await repositorio.buscarMedicamento(evento.dados.medicamentoId);
      medicamentoId = estrategias.para('medicamento').resolver(doCatalogo, evento.dados)?.id ?? null;
    }

    const novo = {
      ...evento,
      atendimentoId,
      ocorridoEm: relogio.valor,
      profissionalId: contexto.autor.profissionalId,
      profissionalNome: contexto.autor.profissionalNome,
      dispositivoId: contexto.autor.dispositivoId,
    };
    if (!(await repositorio.inserirEvento(novo, medicamentoId))) continue;
    conhecidos.add(evento.id);

    await auditar({
      entidade: 'atendimento_evento',
      entidadeId: evento.id,
      acao: 'CRIACAO',
      depois: { atendimentoId, tipo: evento.tipo, ocorridoEm: relogio.valor, dados: evento.dados },
      observacao: relogio.observacao,
    });
    if (evento.tipo === 'ENCERRAMENTO') await repositorio.encerrarAtendimento(atendimentoId, relogio.valor);
  }
}

/** `POST /atendimento`. O servidor resolve (ou cria) o prontuario da pessoa; pode trazer eventos iniciais. */
@Injectable()
export class RegistrarAtendimentoUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(entrada: AtendimentoEntrada, contexto: ContextoComando): Promise<ResultadoComando<Atendimento>> {
    return this.comandos.executar(contexto, entrada.id, async (repositorio, auditar) => {
      await exigirPessoa(repositorio, entrada.pessoaId);
      const prontuario = await resolverProntuario(repositorio, entrada.pessoaId, contexto, auditar);
      const relogio = limitarAoServidor('iniciadoEm', entrada.iniciadoEm, contexto.agora);

      const novo = {
        id: entrada.id,
        pessoaId: entrada.pessoaId,
        prontuarioId: prontuario.id,
        ...contexto.autor,
        iniciadoEm: relogio.valor,
        localDescricao: entrada.localDescricao ?? null,
        latitude: entrada.latitude ?? null,
        longitude: entrada.longitude ?? null,
        queixaPrincipal: entrada.queixaPrincipal ?? null,
      };
      const criado = await repositorio.inserirAtendimento(novo);
      if (criado) {
        await auditar({
          entidade: 'atendimento',
          entidadeId: novo.id,
          acao: 'CRIACAO',
          depois: novo,
          observacao: relogio.observacao,
        });
      }
      // Mesmo quando o atendimento ja existia, os eventos que ainda nao chegaram sao unidos.
      await gravarEventos(repositorio, this.estrategias, entrada.id, entrada.eventos ?? [], contexto, auditar);

      return { status: criado ? 201 : 200, corpo: await atendimentoGravado(repositorio, entrada.id) };
    });
  }
}

/** `POST /atendimento-evento`. */
@Injectable()
export class RegistrarEventoUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(entrada: EventoEntrada, contexto: ContextoComando): Promise<ResultadoComando<Evento>> {
    return this.comandos.executar(contexto, entrada.id, async (repositorio, auditar) => {
      if (!(await repositorio.buscarAtendimento(entrada.atendimentoId))) {
        throw validacao('atendimentoId', 'atendimento desconhecido');
      }
      const existente = await repositorio.buscarEvento(entrada.id);
      if (existente) return { status: 200, corpo: existente };

      const { atendimentoId, ...evento } = entrada;
      await gravarEventos(repositorio, this.estrategias, atendimentoId, [evento], contexto, auditar);

      const gravado = await repositorio.buscarEvento(entrada.id);
      if (!gravado) throw new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
      return { status: 201, corpo: gravado };
    });
  }
}
