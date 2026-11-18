import type { AtendimentoListado } from '@medicalfield/contratos';
import { cx, EstadoVazio, Etiqueta, type Coluna } from '@medicalfield/ui';
import { ClipboardList, MousePointerClick } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { listarAtendimentos } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarDataHora } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';
import { DetalheAtendimento } from './DetalheAtendimento';

export const COLUNAS_ATENDIMENTO: Coluna<AtendimentoListado>[] = [
  {
    id: 'inicio',
    titulo: 'Início',
    celula: (a) => (
      <time className="mf-dado" dateTime={a.iniciadoEm}>
        {formatarDataHora(a.iniciadoEm)}
      </time>
    ),
  },
  {
    id: 'paciente',
    titulo: 'Paciente',
    quebra: true,
    celula: (a) => (
      <>
        <strong className="font-[650]">{a.pessoaNome}</strong>
        <div className="text-tinta-2">{a.queixaPrincipal ?? 'Queixa não registrada'}</div>
      </>
    ),
  },
  {
    id: 'situacao',
    titulo: 'Situação',
    celula: (a) => (a.status === 'ABERTO' ? <Etiqueta tom="cheia">Aberto</Etiqueta> : <Etiqueta>Encerrado</Etiqueta>),
  },
];

/** Livro de atendimentos (mais recentes primeiro) ao lado da ficha do atendimento escolhido. */
export function TelaAtendimentos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const lista = useListaPorCursor(['atendimentos'], (cursor) => listarAtendimentos({ limite: 20, cursor }));

  return (
    <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <FolhaLista
        // Em tela estreita, a ficha aberta ocupa o lugar da lista.
        className={cx('xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto', id && 'max-xl:hidden')}
        titulo="Livro de atendimentos"
        plural="atendimentos"
        lista={lista}
        colunas={COLUNAS_ATENDIMENTO}
        chave={(a) => a.id}
        selecionada={id}
        aoSelecionar={(a) => void navegar(`/atendimentos/${a.id}`)}
        vazio={
          <EstadoVazio className="m-3" icone={<ClipboardList aria-hidden />} titulo="Nenhum atendimento na central" />
        }
      />
      {id ? (
        <DetalheAtendimento key={id} id={id} />
      ) : (
        <EstadoVazio className="max-xl:hidden" icone={<MousePointerClick aria-hidden />} titulo="Escolha um atendimento" />
      )}
    </div>
  );
}
