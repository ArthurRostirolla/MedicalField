import type { AtendimentoListado } from '@medicalfield/contratos';
import { EstadoVazio, Etiqueta, type Coluna } from '@medicalfield/ui';
import { ClipboardList } from 'lucide-react';
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
  { id: 'profissional', titulo: 'Aberto por', quebra: true, celula: (a) => a.profissionalNome },
  {
    id: 'situacao',
    titulo: 'Situação',
    celula: (a) => (a.status === 'ABERTO' ? <Etiqueta tom="cheia">Aberto</Etiqueta> : <Etiqueta>Encerrado</Etiqueta>),
  },
];

/** Livro de atendimentos (mais recentes primeiro). O atendimento escolhido abre na própria página. */
export function TelaAtendimentos() {
  const { id } = useParams();
  const navegar = useNavigate();
  const lista = useListaPorCursor(['atendimentos'], (cursor) => listarAtendimentos({ limite: 20, cursor }));

  if (id) return <DetalheAtendimento key={id} id={id} />;
  return (
    <FolhaLista
      titulo="Livro de atendimentos"
      descricao="Mais recentes primeiro · clique para abrir"
      plural="atendimentos"
      lista={lista}
      colunas={COLUNAS_ATENDIMENTO}
      chave={(a) => a.id}
      aoSelecionar={(a) => void navegar(`/atendimentos/${a.id}`)}
      vazio={
        <EstadoVazio className="m-3" icone={<ClipboardList aria-hidden />} titulo="Nenhum atendimento na central" />
      }
    />
  );
}
