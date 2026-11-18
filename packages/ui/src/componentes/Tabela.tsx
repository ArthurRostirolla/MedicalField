import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cx } from '../util';
import { Botao } from './Botao';
import { Esqueleto } from './superficies';

export interface Coluna<T> {
  id: string;
  titulo: string;
  celula: (linha: T) => ReactNode;
  /** `fim` para números e horários. */
  alinhar?: 'inicio' | 'fim';
  /** Permite quebra de linha (texto longo). */
  quebra?: boolean;
  largura?: string;
}

export interface TabelaProps<T> {
  /** Descrição da tabela para leitor de tela. */
  legenda: string;
  colunas: ReadonlyArray<Coluna<T>>;
  linhas: ReadonlyArray<T>;
  chave: (linha: T) => string;
  /** Chave da linha aberta no detalhe. */
  selecionada?: string | null;
  aoSelecionar?: (linha: T) => void;
  carregando?: boolean;
  /** Conteúdo quando não há linhas (use `EstadoVazio`). */
  vazio?: ReactNode;
  className?: string;
}

/** Tabela densa de leitura. Linha clicável responde a Enter e Espaço. */
export function Tabela<T>({
  legenda,
  colunas,
  linhas,
  chave,
  selecionada,
  aoSelecionar,
  carregando,
  vazio,
  className,
}: TabelaProps<T>) {
  return (
    <div
      className={cx('mf-tabela-rolagem', className)}
      aria-busy={carregando || undefined}
      // Regiao rolavel precisa ser alcancavel por teclado (WCAG 2.1.1).
      role="region"
      aria-label={legenda}
      tabIndex={0}
    >
      <table className="mf-tabela">
        <caption className="mf-so-leitor">{legenda}</caption>
        <thead>
          <tr>
            {colunas.map((coluna) => (
              <th key={coluna.id} scope="col" data-alinhar={coluna.alinhar} style={{ width: coluna.largura }}>
                {coluna.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {carregando
            ? Array.from({ length: 6 }, (_, indice) => (
                <tr key={indice}>
                  {colunas.map((coluna, posicao) => (
                    <td key={coluna.id}>
                      <Esqueleto largura={`${55 + ((indice * 17 + posicao * 29) % 40)}%`} />
                    </td>
                  ))}
                </tr>
              ))
            : linhas.map((linha) => {
                const id = chave(linha);
                const atual = id === selecionada;
                return (
                  <tr
                    key={id}
                    className={atual ? 'mf-invertido' : undefined}
                    data-clicavel={aoSelecionar ? true : undefined}
                    aria-selected={aoSelecionar ? atual : undefined}
                    tabIndex={aoSelecionar ? 0 : undefined}
                    onClick={aoSelecionar ? () => aoSelecionar(linha) : undefined}
                    onKeyDown={
                      aoSelecionar
                        ? (evento) => {
                            if (evento.key === 'Enter' || evento.key === ' ') {
                              evento.preventDefault();
                              aoSelecionar(linha);
                            }
                          }
                        : undefined
                    }
                  >
                    {colunas.map((coluna) => (
                      <td key={coluna.id} data-alinhar={coluna.alinhar} data-quebra={coluna.quebra || undefined}>
                        {coluna.celula(linha)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!carregando && linhas.length === 0 ? vazio : null}
    </div>
  );
}

export interface PaginacaoProps {
  /** Resumo do que está na tela (ex.: "50 atendimentos nesta página"). */
  resumo: ReactNode;
  /** A API pagina por cursor: só existe "anterior" e "próxima". */
  aoAnterior?: () => void;
  aoProxima?: () => void;
  carregando?: boolean;
}

export function Paginacao({ resumo, aoAnterior, aoProxima, carregando }: PaginacaoProps) {
  return (
    <nav className="mf-paginacao" aria-label="Paginação">
      <span>{resumo}</span>
      <span className="mf-paginacao__acoes">
        <Botao icone={<ChevronLeft aria-hidden />} disabled={!aoAnterior || carregando} onClick={aoAnterior}>
          Anterior
        </Botao>
        <Botao disabled={!aoProxima} carregando={carregando} onClick={aoProxima}>
          Próxima
          {carregando ? null : <ChevronRight aria-hidden />}
        </Botao>
      </span>
    </nav>
  );
}
