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
import { useSyncExternalStore } from 'react';
import { Link } from 'react-router';
import { assinarOffline, lerOffline } from '../api/offline';
import { baixarPdf, gerarFicha, obterFicha } from '../api/recursos';
import { salvarArquivo, useAvisar } from '../comum/avisos';
import { CampoLeitura, CamposLeitura } from '../comum/CamposLeitura';
import { BotaoAtualizar } from '../comum/FolhaLista';
import { descreverErro, formatarDataHoraLonga, idadeEm } from '../comum/formato';
import { useProfissional } from '../sessao/sessao';
import { FichaPdfEnvios } from './FichaPdfEnvios';
import { RegistroPortal } from './RegistroPortal';

/** "58 anos · F", na data do atendimento. Sem data de nascimento, só o que houver. */
function identificacao(pessoa: Pessoa, iniciadoEm: string): string | undefined {
  const idade = idadeEm(pessoa.dataNascimento, new Date(iniciadoEm));
  const partes = [idade !== null ? `${idade} anos` : null, pessoa.sexo, pessoa.naoIdentificada ? 'não identificada' : null];
  return partes.filter(Boolean).join(' · ') || undefined;
}

/** Caminho de volta ao livro, com o nome do paciente quando já carregou. */
function Voltar({ nome }: { nome?: string }) {
  return (
    <nav aria-label="Caminho" className="flex items-center gap-2 text-pequeno text-tinta-2">
      <Link to="/atendimentos" className="mf-botao mf-botao--fantasma">
        <ArrowLeft aria-hidden />
        Atendimentos
      </Link>
      {nome ? (
        <>
          <span aria-hidden>/</span>
          <span className="text-tinta">{nome}</span>
        </>
      ) : null}
    </nav>
  );
}

/** Passagem, linha do tempo + novo registro (lado a lado quando cabe), ficha e dados do atendimento. */
const COLUNA = 'mx-auto grid w-full max-w-[60rem] grid-cols-1 gap-6 xl:max-w-[96rem]';

export function DetalheAtendimento({ id }: { id: string }) {
  const eu = useProfissional();
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const ficha = useQuery({ queryKey: ['ficha', id], queryFn: () => obterFicha(id) });
  const offline = useSyncExternalStore(assinarOffline, lerOffline);
  // O PDF é gerado no servidor, com o que ele tem: sem servidor ou com fila, sairia sem o que falta subir.
  const pdfEspera = offline.simulando || !offline.redeDoComputador || offline.fila.length > 0;

  const geracao = useMutation({
    mutationFn: () => gerarFicha(id),
    // Gerar já baixa: o botão fica carregando até o arquivo chegar (onSuccess é aguardado).
    onSuccess: async ({ status, dado }) => {
      void consultas.invalidateQueries({ queryKey: ['documentos', id] });
      avisar(
        status === 201
          ? { tom: 'sucesso', titulo: 'Ficha gerada', descricao: `Código ${dado.codigoVerificacao}` }
          : { titulo: 'A ficha já estava em dia', descricao: `Nada mudou no atendimento desde a ficha ${dado.codigoVerificacao}.` },
      );
      try {
        const { arquivo, nome } = await baixarPdf(dado.id);
        salvarArquivo(arquivo, nome ?? `ficha-${dado.codigoVerificacao}.pdf`);
      } catch (erro) {
        avisar({ tom: 'erro', ...descreverErro(erro, 'o PDF'), titulo: 'O PDF não foi baixado' });
      }
    },
    onError: (erro) => avisar({ tom: 'erro', ...descreverErro(erro, 'a ficha'), titulo: 'A ficha não foi gerada' }),
  });

  if (ficha.isPending) {
    return (
      <div className={COLUNA} aria-busy="true">
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
      <div className={COLUNA}>
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
    <div className={COLUNA}>
      <Voltar nome={pessoa.nome} />
      <PainelPassagemDeCaso
        resumo={resumo}
        paciente={{ nome: pessoa.nome, identificacao: identificacao(pessoa, atendimento.iniciadoEm) }}
        queixaPrincipal={atendimento.queixaPrincipal}
        acoes={
          <>
            {pdfEspera ? <span className="self-center text-pequeno text-tinta-2">O PDF sai depois de sincronizar.</span> : null}
            <Botao
              variante="primario"
              icone={<FileDown aria-hidden />}
              carregando={geracao.isPending}
              disabled={pdfEspera}
              onClick={() => geracao.mutate()}
            >
              Gerar PDF
            </Botao>
          </>
        }
      />

      {/* Em tela larga: o que já aconteceu à esquerda, o próximo registro sempre à mão à direita. */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Secao
          titulo="Linha do tempo"
          descricao={`${eventos.length} ${eventos.length === 1 ? 'entrada' : 'entradas'} · mais antiga primeiro`}
          acoes={<BotaoAtualizar atualizando={ficha.isFetching} aoAtualizar={() => void ficha.refetch()} />}
          rente
        >
          {eventos.length > 0 ? (
            <LinhaDoTempo eventos={eventos} />
          ) : (
            <EstadoVazio className="m-3" titulo="Nenhum evento registrado" descricao="O primeiro registro feito ao lado aparece aqui." />
          )}
        </Secao>

        <div className="xl:sticky xl:top-4">
          <RegistroPortal atendimentoId={id} encerrado={atendimento.status === 'ENCERRADO'} eventos={eventos} />
        </div>
      </div>

      <FichaPdfEnvios atendimentoId={id} nomeDe={(profissionalId) => nomes.get(profissionalId)} />

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
