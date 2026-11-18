import type { Pessoa } from '@medicalfield/contratos';
import { ordenarLinhaDoTempo } from '@medicalfield/dominio';
import {
  Botao,
  Esqueleto,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  LinhaDoTempo,
  PainelPassagemDeCaso,
  Secao,
} from '@medicalfield/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileDown } from 'lucide-react';
import { Link } from 'react-router';
import { gerarFicha, obterFicha } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { CampoLeitura, CamposLeitura } from '../comum/CamposLeitura';
import { BotaoAtualizar } from '../comum/FolhaLista';
import { descreverErro, formatarDataHoraLonga, idadeEm } from '../comum/formato';
import { useProfissional } from '../sessao/sessao';
import { FichaPdfEnvios } from './FichaPdfEnvios';

/** "58 anos · F", na data do atendimento. Sem data de nascimento, só o que houver. */
function identificacao(pessoa: Pessoa, iniciadoEm: string): string | undefined {
  const idade = idadeEm(pessoa.dataNascimento, new Date(iniciadoEm));
  const partes = [idade !== null ? `${idade} anos` : null, pessoa.sexo, pessoa.naoIdentificada ? 'não identificada' : null];
  return partes.filter(Boolean).join(' · ') || undefined;
}

function Voltar() {
  return (
    <Link to="/atendimentos" className="mf-botao mf-botao--fantasma justify-self-start xl:hidden">
      <ArrowLeft aria-hidden />
      Lista de atendimentos
    </Link>
  );
}

export function DetalheAtendimento({ id }: { id: string }) {
  const eu = useProfissional();
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const ficha = useQuery({ queryKey: ['ficha', id], queryFn: () => obterFicha(id) });

  const geracao = useMutation({
    mutationFn: () => gerarFicha(id),
    onSuccess: ({ status, dado }) => {
      void consultas.invalidateQueries({ queryKey: ['documentos', id] });
      avisar(
        status === 201
          ? { tom: 'sucesso', titulo: 'Ficha gerada', descricao: `Código ${dado.codigoVerificacao}` }
          : { titulo: 'A ficha já estava em dia', descricao: `Nada mudou no atendimento desde a ficha ${dado.codigoVerificacao}.` },
      );
    },
    onError: (erro) => avisar({ tom: 'erro', ...descreverErro(erro, 'a ficha'), titulo: 'A ficha não foi gerada' }),
  });

  if (ficha.isPending) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        <Voltar />
        <p className="mf-so-leitor" role="status">
          Carregando o atendimento…
        </p>
        <Secao titulo="Passagem de caso">
          <Esqueleto linhas={5} />
        </Secao>
        <Secao titulo="Linha do tempo">
          <Esqueleto linhas={8} />
        </Secao>
      </div>
    );
  }
  if (ficha.isError) {
    return (
      <div className="grid grid-cols-1 gap-6">
        <Voltar />
        <EstadoErro {...descreverErro(ficha.error, 'o atendimento')} aoTentarDeNovo={() => void ficha.refetch()} />
      </div>
    );
  }

  const { atendimento, pessoa, resumo } = ficha.data;
  const eventos = ordenarLinhaDoTempo(ficha.data.eventos);
  const nomes = new Map<string, string>([
    [eu.id, eu.nome],
    [atendimento.profissionalId, atendimento.profissionalNome],
    ...eventos.map((evento) => [evento.profissionalId, evento.profissionalNome] as [string, string]),
  ]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <Voltar />
      <PainelPassagemDeCaso
        resumo={resumo}
        paciente={{ nome: pessoa.nome, identificacao: identificacao(pessoa, atendimento.iniciadoEm) }}
        queixaPrincipal={atendimento.queixaPrincipal}
        acoes={
          <Botao variante="primario" icone={<FileDown aria-hidden />} carregando={geracao.isPending} onClick={() => geracao.mutate()}>
            Gerar PDF
          </Botao>
        }
      />

      <FichaPdfEnvios atendimentoId={id} nomeDe={(profissionalId) => nomes.get(profissionalId)} />

      <Secao
        titulo="Linha do tempo"
        descricao={`${eventos.length} ${eventos.length === 1 ? 'entrada' : 'entradas'}`}
        acoes={<BotaoAtualizar atualizando={ficha.isFetching} aoAtualizar={() => void ficha.refetch()} />}
        rente
      >
        {eventos.length > 0 ? (
          <LinhaDoTempo eventos={eventos} />
        ) : (
          <EstadoVazio className="m-3" titulo="Nenhum evento registrado" />
        )}
      </Secao>

      <Secao titulo="Registro do atendimento" rente>
        <CamposLeitura>
          <CampoLeitura rotulo="Situação">
            {atendimento.status === 'ABERTO' ? <Etiqueta tom="cheia">Aberto</Etiqueta> : <Etiqueta>Encerrado</Etiqueta>}
          </CampoLeitura>
          <CampoLeitura rotulo="Aberto por">{atendimento.profissionalNome}</CampoLeitura>
          <CampoLeitura rotulo="Início (hora do aparelho)">
            <time className="mf-dado" dateTime={atendimento.iniciadoEm}>
              {formatarDataHoraLonga(atendimento.iniciadoEm)}
            </time>
          </CampoLeitura>
          <CampoLeitura rotulo="Recebido na central">
            <time className="mf-dado" dateTime={atendimento.recebidoEm}>
              {formatarDataHoraLonga(atendimento.recebidoEm)}
            </time>
          </CampoLeitura>
          <CampoLeitura rotulo="Encerrado em">
            {atendimento.encerradoEm ? (
              <time className="mf-dado" dateTime={atendimento.encerradoEm}>
                {formatarDataHoraLonga(atendimento.encerradoEm)}
              </time>
            ) : null}
          </CampoLeitura>
          <CampoLeitura rotulo="Local">{atendimento.localDescricao}</CampoLeitura>
          <CampoLeitura rotulo="Prontuário" largo>
            <Link to={`/prontuarios/${pessoa.id}`}>Abrir o prontuário de {pessoa.nome}</Link>
          </CampoLeitura>
          <CampoLeitura rotulo="Identificador do atendimento" largo>
            <span className="mf-dado">{atendimento.id}</span>
          </CampoLeitura>
        </CamposLeitura>
      </Secao>
    </div>
  );
}
