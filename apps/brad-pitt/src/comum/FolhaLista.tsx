import { Botao, EstadoErro, Paginacao, Secao, Tabela, type Coluna } from '@medicalfield/ui';
import { RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { descreverErro } from './formato';
import { RegiaoRolavel } from './RegiaoRolavel';
import type { ListaPorCursor } from './paginacao';

/** "Atualizar" das listas: o roteiro pede conferir a lista várias vezes sem recarregar a página. */
export function BotaoAtualizar({ atualizando, aoAtualizar }: { atualizando: boolean; aoAtualizar: () => void }) {
  return (
    <Botao icone={<RefreshCw aria-hidden />} carregando={atualizando} onClick={aoAtualizar}>
      Atualizar
    </Botao>
  );
}

export interface FolhaListaProps<T> {
  titulo: string;
  descricao?: ReactNode;
  /** Nome do que a lista traz, para o resumo e para a mensagem de erro (ex.: "atendimentos"). */
  plural: string;
  lista: ListaPorCursor<T>;
  colunas: ReadonlyArray<Coluna<T>>;
  chave: (linha: T) => string;
  vazio: ReactNode;
  selecionada?: string | null;
  aoSelecionar?: (linha: T) => void;
  /** Ações extras do cabeçalho, antes de "Atualizar". */
  acoes?: ReactNode;
  /** Conteúdo entre o cabeçalho e a tabela (filtros). */
  filtros?: ReactNode;
  className?: string;
}

/** Folha de lista: cabeçalho com "Atualizar", tabela (esqueleto, vazio, erro) e paginação por cursor. */
export function FolhaLista<T>({
  titulo,
  descricao,
  plural,
  lista,
  colunas,
  chave,
  vazio,
  selecionada,
  aoSelecionar,
  acoes,
  filtros,
  className,
}: FolhaListaProps<T>) {
  const { consulta, pagina, aoAnterior, aoProxima } = lista;
  const itens = consulta.data?.itens ?? [];
  const erro = consulta.isError ? descreverErro(consulta.error, plural) : null;

  return (
    <Secao
      className={className}
      titulo={titulo}
      descricao={descricao}
      rente
      acoes={
        <>
          {acoes}
          <BotaoAtualizar
            atualizando={consulta.isFetching && !consulta.isPending}
            aoAtualizar={() => void consulta.refetch()}
          />
        </>
      }
    >
      {filtros}
      {erro && !consulta.data ? (
        <EstadoErro {...erro} aoTentarDeNovo={() => void consulta.refetch()} className="m-3" />
      ) : (
        <>
          {erro ? (
            <p className="mf-campo__erro m-3" role="alert">
              {erro.titulo}. A lista abaixo é a última que chegou.
            </p>
          ) : null}
          <RegiaoRolavel rotulo={titulo}>
            <Tabela
              legenda={titulo}
              colunas={colunas}
              linhas={itens}
              chave={chave}
              selecionada={selecionada}
              aoSelecionar={aoSelecionar}
              carregando={consulta.isPending}
              vazio={vazio}
            />
          </RegiaoRolavel>
          <Paginacao
            resumo={
              consulta.isPending ? (
                'Carregando…'
              ) : (
                <>
                  Página <span className="mf-num">{pagina}</span> · <span className="mf-num">{itens.length}</span>{' '}
                  {plural}
                </>
              )
            }
            aoAnterior={aoAnterior}
            aoProxima={aoProxima}
            carregando={consulta.isPlaceholderData}
          />
        </>
      )}
    </Secao>
  );
}
