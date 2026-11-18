import type { Pessoa, ProntuarioComPessoa } from '@medicalfield/contratos';
import { CampoTexto, EstadoVazio, Etiqueta, type Coluna } from '@medicalfield/ui';
import { FileText, UserPlus } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { buscarPessoas, listarProntuarios } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarCpf, formatarData, formatarDataHora } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';

const nomePessoa = (p: Pick<Pessoa, 'nome' | 'naoIdentificada'>) => (
  <span className="flex flex-wrap items-center gap-2">
    <strong className="font-[650]">{p.nome}</strong>
    {p.naoIdentificada ? <Etiqueta>Não identificada</Etiqueta> : null}
  </span>
);

const COLUNAS: Coluna<ProntuarioComPessoa>[] = [
  { id: 'pessoa', titulo: 'Pessoa', quebra: true, celula: (p) => nomePessoa(p.pessoa) },
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

const COLUNAS_BUSCA: Coluna<Pessoa>[] = [
  { id: 'pessoa', titulo: 'Pessoa', quebra: true, celula: nomePessoa },
  { id: 'nascimento', titulo: 'Nascimento', celula: (p) => <span className="mf-dado">{formatarData(p.dataNascimento)}</span> },
  { id: 'cpf', titulo: 'CPF', celula: (p) => <span className="mf-dado">{formatarCpf(p.cpf)}</span> },
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
  const [texto, setTexto] = useState('');
  const busca = useDeferredValue(texto.trim());
  const lista = useListaPorCursor(['prontuarios'], (cursor) => listarProntuarios({ limite: 50, cursor }));
  // A lista de prontuários não filtra; com texto, a busca vai para as pessoas (nome ou CPF).
  const achados = useListaPorCursor(['pessoas', busca], (cursor) =>
    busca ? buscarPessoas(busca, { limite: 50, cursor }) : Promise.resolve({ itens: [], proximoCursor: null }),
  );

  const filtros = (
    <form className="border-b border-fio p-3" role="search" aria-label="Buscar paciente" onSubmit={(e) => e.preventDefault()}>
      <CampoTexto rotulo="Buscar por nome ou CPF" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
    </form>
  );
  const novo = (
    <Link to={busca ? `/prontuarios/novo?nome=${encodeURIComponent(busca)}` : '/prontuarios/novo'} className="mf-botao mf-botao--primario">
      <UserPlus aria-hidden />
      Novo paciente
    </Link>
  );
  const abrir = (pessoaId: string) => void navegar(`/prontuarios/${pessoaId}`);

  return busca ? (
    <FolhaLista
      titulo="Prontuários"
      plural="pacientes"
      acoes={novo}
      filtros={filtros}
      lista={achados}
      colunas={COLUNAS_BUSCA}
      chave={(p) => p.id}
      aoSelecionar={(p) => abrir(p.id)}
      vazio={<EstadoVazio className="m-3" icone={<FileText aria-hidden />} titulo="Nenhum paciente encontrado" />}
    />
  ) : (
    <FolhaLista
      titulo="Prontuários"
      plural="prontuários"
      acoes={novo}
      filtros={filtros}
      lista={lista}
      colunas={COLUNAS}
      chave={(p) => p.id}
      aoSelecionar={(p) => abrir(p.pessoaId)}
      vazio={<EstadoVazio className="m-3" icone={<FileText aria-hidden />} titulo="Nenhum prontuário na central" />}
    />
  );
}
