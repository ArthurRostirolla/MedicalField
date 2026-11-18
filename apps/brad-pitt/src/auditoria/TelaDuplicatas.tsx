import type { Pessoa } from '@medicalfield/contratos';
import { EstadoVazio, type Coluna } from '@medicalfield/ui';
import { Users } from 'lucide-react';
import { Link } from 'react-router';
import { listarDuplicatas } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarCpf, formatarData, formatarDataHora } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';

const COLUNAS: Coluna<Pessoa>[] = [
  {
    id: 'pessoa',
    titulo: 'Cadastro sinalizado',
    quebra: true,
    celula: (p) => (
      <Link to={`/prontuarios/${p.id}`} className="font-[650]">
        {p.nome}
      </Link>
    ),
  },
  { id: 'nascimento', titulo: 'Nascimento', celula: (p) => <span className="mf-dado">{formatarData(p.dataNascimento)}</span> },
  { id: 'cpf', titulo: 'CPF', celula: (p) => <span className="mf-dado">{formatarCpf(p.cpf)}</span> },
  {
    id: 'parecido',
    titulo: 'Parecido com',
    celula: (p) => (p.possivelDuplicataDe ? <Link to={`/prontuarios/${p.possivelDuplicataDe}`}>Abrir o cadastro anterior</Link> : '—'),
  },
  {
    id: 'criado',
    titulo: 'Cadastrado em',
    alinhar: 'fim',
    celula: (p) => (
      <time className="mf-dado" dateTime={p.criadoEm}>
        {formatarDataHora(p.criadoEm)}
      </time>
    ),
  },
];

/** Cadastros que a central aceitou e sinalizou para revisão (mesmo CPF, ou mesmo nome e nascimento). */
export function TelaDuplicatas() {
  const lista = useListaPorCursor(['duplicatas'], (cursor) => listarDuplicatas({ limite: 50, cursor }));
  return (
    <FolhaLista
      titulo="Possíveis duplicatas"
      plural="cadastros sinalizados"
      lista={lista}
      colunas={COLUNAS}
      chave={(p) => p.id}
      vazio={
        <EstadoVazio className="m-3" icone={<Users aria-hidden />} titulo="Nenhum cadastro sinalizado" />
      }
    />
  );
}
