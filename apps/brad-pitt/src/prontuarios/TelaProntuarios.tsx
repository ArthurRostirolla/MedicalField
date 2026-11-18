import type { ProntuarioComPessoa } from '@medicalfield/contratos';
import { EstadoVazio, Etiqueta, type Coluna } from '@medicalfield/ui';
import { FileText } from 'lucide-react';
import { useNavigate } from 'react-router';
import { listarProntuarios } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarCpf, formatarData, formatarDataHora } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';

const COLUNAS: Coluna<ProntuarioComPessoa>[] = [
  {
    id: 'pessoa',
    titulo: 'Pessoa',
    quebra: true,
    celula: (p) => (
      <span className="flex flex-wrap items-center gap-2">
        <strong className="font-[650]">{p.pessoa.nome}</strong>
        {p.pessoa.naoIdentificada ? <Etiqueta>Não identificada</Etiqueta> : null}
      </span>
    ),
  },
  { id: 'nascimento', titulo: 'Nascimento', celula: (p) => <span className="mf-dado">{formatarData(p.pessoa.dataNascimento)}</span> },
  { id: 'cpf', titulo: 'CPF', celula: (p) => <span className="mf-dado">{formatarCpf(p.pessoa.cpf)}</span> },
  { id: 'sangue', titulo: 'Tipo sanguíneo', celula: (p) => p.tipoSanguineo ?? '—' },
  {
    id: 'itens',
    titulo: 'Itens ativos',
    alinhar: 'fim',
    celula: (p) => <span className="mf-num">{p.itens.filter((item) => item.inativadoEm === null).length}</span>,
  },
  {
    id: 'atualizado',
    titulo: 'Atualizado',
    alinhar: 'fim',
    celula: (p) => (
      <time className="mf-dado" dateTime={p.atualizadoEm}>
        {formatarDataHora(p.atualizadoEm)}
      </time>
    ),
  },
];

export function TelaProntuarios() {
  const navegar = useNavigate();
  const lista = useListaPorCursor(['prontuarios'], (cursor) => listarProntuarios({ limite: 50, cursor }));
  return (
    <FolhaLista
      titulo="Prontuários"
      plural="prontuários"
      lista={lista}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoSelecionar={(p) => void navegar(`/prontuarios/${p.pessoaId}`)}
      vazio={
        <EstadoVazio className="m-3" icone={<FileText aria-hidden />} titulo="Nenhum prontuário na central" />
      }
    />
  );
}
