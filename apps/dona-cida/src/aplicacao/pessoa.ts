import type { CamposEditaveisPessoa, Pessoa, PessoaAlteracao, PessoaEntrada } from '@medicalfield/contratos';
import { Inject, Injectable } from '@nestjs/common';
import { RegistroEstrategias } from '../dominio/conflito/registro.ts';
import { ErroAplicacao, naoEncontrado } from '../dominio/erros.ts';
import { limitarAoServidor } from '../dominio/relogio.ts';
import type { RepositorioClinico } from '../dominio/repositorios.ts';
import { ExecutorComandos, juntarObservacoes, type ContextoComando, type ResultadoComando } from './comando.ts';

/** Campos que definem "duplicata provavel". */
const CAMPOS_DE_IDENTIDADE = ['cpf', 'nome', 'dataNascimento'];

/** Rele a pessoa recem-gravada, na mesma transacao. */
export async function pessoaGravada(repositorio: RepositorioClinico, id: string): Promise<Pessoa> {
  const guardada = await repositorio.buscarPessoa(id);
  if (!guardada) throw new ErroAplicacao('ERRO_INTERNO', 'Erro interno.');
  return guardada.pessoa;
}

/** `POST /pessoa`. Duplicata provavel e aceita e sinalizada (RevisaoManual), nunca rejeitada. */
@Injectable()
export class CadastrarPessoaUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(entrada: PessoaEntrada, contexto: ContextoComando): Promise<ResultadoComando<Pessoa>> {
    return this.comandos.executar(contexto, entrada.id, async (repositorio, auditar) => {
      const existente = await repositorio.buscarPessoa(entrada.id);
      if (existente) return { status: 200, corpo: existente.pessoa };

      const { id, editadoEm, ...campos } = entrada;
      const relogio = limitarAoServidor('editadoEm', editadoEm, contexto.agora);
      const identidade = { id, cpf: campos.cpf ?? null, nome: campos.nome, dataNascimento: campos.dataNascimento ?? null };
      const revisao = this.estrategias
        .para('pessoaDuplicada')
        .resolver(await repositorio.buscarPossiveisDuplicatas(identidade), identidade);

      const nova = {
        ...identidade,
        sexo: campos.sexo ?? null,
        cns: campos.cns ?? null,
        telefone: campos.telefone ?? null,
        email: campos.email ?? null,
        contatoEmergenciaNome: campos.contatoEmergenciaNome ?? null,
        contatoEmergenciaTelefone: campos.contatoEmergenciaTelefone ?? null,
        contatoEmergenciaEmail: campos.contatoEmergenciaEmail ?? null,
        naoIdentificada: campos.naoIdentificada ?? false,
        descricaoIdentificacao: campos.descricaoIdentificacao ?? null,
        possivelDuplicataDe: revisao.possivelDuplicataDe,
      };
      const carimbos = Object.fromEntries(Object.keys(campos).map((campo) => [campo, relogio.valor]));

      // Outro comando criou a mesma pessoa entre a consulta e a insercao: vale a que ja existe.
      if (!(await repositorio.inserirPessoa(nova, carimbos, contexto.autor.profissionalId))) {
        return { status: 200, corpo: await pessoaGravada(repositorio, id) };
      }
      await auditar({
        entidade: 'pessoa',
        entidadeId: id,
        acao: 'CRIACAO',
        depois: nova,
        observacao: juntarObservacoes(
          relogio.observacao,
          revisao.possivelDuplicataDe && `possível duplicata de ${revisao.possivelDuplicataDe} (revisão manual)`,
        ),
      });
      return { status: 201, corpo: await pessoaGravada(repositorio, id) };
    });
  }
}

/** `PATCH /pessoa/{id}`. Vence, por campo, a edicao mais recente (CampoMaisRecente). */
@Injectable()
export class AlterarPessoaUseCase {
  constructor(
    @Inject(ExecutorComandos) private readonly comandos: ExecutorComandos,
    @Inject(RegistroEstrategias) private readonly estrategias: RegistroEstrategias,
  ) {}

  executar(id: string, entrada: PessoaAlteracao, contexto: ContextoComando): Promise<ResultadoComando<Pessoa>> {
    return this.comandos.executar(contexto, id, async (repositorio, auditar) => {
      const guardada = await repositorio.buscarPessoa(id, { travar: true });
      if (!guardada) throw naoEncontrado('Pessoa');

      const relogio = limitarAoServidor('editadoEm', entrada.editadoEm, contexto.agora);
      const decisao = this.estrategias
        .para('pessoa')
        .resolver(
          { valores: guardada.pessoa, carimbos: guardada.carimbos },
          { campos: entrada.campos, editadoEm: relogio.valor },
        );
      const aplicados = decisao.aplicados as Partial<CamposEditaveisPessoa>;

      // Mudou CPF, nome ou nascimento e ainda nao esta sinalizada: confere duplicata de novo.
      let possivelDuplicataDe: string | undefined;
      if (!guardada.pessoa.possivelDuplicataDe && CAMPOS_DE_IDENTIDADE.some((campo) => campo in aplicados)) {
        const identidade = { ...guardada.pessoa, ...aplicados };
        const revisao = this.estrategias
          .para('pessoaDuplicada')
          .resolver(await repositorio.buscarPossiveisDuplicatas(identidade), identidade);
        possivelDuplicataDe = revisao.possivelDuplicataDe ?? undefined;
      }

      const houveMudanca = Object.keys(aplicados).length > 0;
      if (houveMudanca || JSON.stringify(decisao.carimbos) !== JSON.stringify(guardada.carimbos)) {
        await repositorio.atualizarPessoa(id, { campos: aplicados, carimbos: decisao.carimbos, possivelDuplicataDe });
      }
      if (houveMudanca || decisao.descartados.length > 0) {
        await auditar({
          entidade: 'pessoa',
          entidadeId: id,
          acao: 'ALTERACAO',
          antes: decisao.anteriores,
          depois: aplicados,
          observacao: juntarObservacoes(
            relogio.observacao,
            decisao.descartados.length > 0 &&
              `campos mantidos por terem edição mais recente: ${decisao.descartados.join(', ')}`,
            possivelDuplicataDe && `possível duplicata de ${possivelDuplicataDe} (revisão manual)`,
          ),
        });
      }
      return { status: 200, corpo: await pessoaGravada(repositorio, id) };
    });
  }
}
