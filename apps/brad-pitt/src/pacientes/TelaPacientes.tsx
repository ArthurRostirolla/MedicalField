// Pacientes, como no app: todo cadastro da central (com ou sem prontuário), busca por nome ou CPF
// e as duas entradas de cadastro. Prontuários continua sendo o registro clínico.
import type { Pessoa } from '@medicalfield/contratos';
import { CampoTexto, EstadoVazio, Etiqueta, type Coluna } from '@medicalfield/ui';
import { UserPlus, UserRoundX, Users } from 'lucide-react';
import { useDeferredValue, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { buscarPessoas } from '../api/recursos';
import { FolhaLista } from '../comum/FolhaLista';
import { formatarCpf, formatarData, formatarDataHora, idadeEm } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';

export const COLUNAS_PACIENTE: Coluna<Pessoa>[] = [
  {
    id: 'pessoa',
    titulo: 'Paciente',
    quebra: true,
    celula: (p) => (
      <>
        <span className="flex flex-wrap items-center gap-2">
          <strong className="font-[650]">{p.nome}</strong>
          {p.naoIdentificada ? <Etiqueta>Não identificada</Etiqueta> : null}
          {p.possivelDuplicataDe ? <Etiqueta tom="marca">Possível duplicata</Etiqueta> : null}
        </span>
        {p.naoIdentificada && p.descricaoIdentificacao ? <div className="text-tinta-2">{p.descricaoIdentificacao}</div> : null}
      </>
    ),
  },
  {
    id: 'nascimento',
    titulo: 'Nascimento',
    celula: (p) => {
      const idade = idadeEm(p.dataNascimento);
      return p.dataNascimento ? (
        <span className="mf-dado">
          {formatarData(p.dataNascimento)}
          {idade !== null ? ` · ${idade} anos` : ''}
        </span>
      ) : (
        '—'
      );
    },
  },
  { id: 'cpf', titulo: 'CPF', celula: (p) => <span className="mf-dado">{formatarCpf(p.cpf)}</span> },
  { id: 'telefone', titulo: 'Telefone', celula: (p) => p.telefone ?? '—' },
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

export function TelaPacientes() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const busca = useDeferredValue(texto.trim());
  const lista = useListaPorCursor(['pessoas', busca], (cursor) => buscarPessoas(busca, { limite: 50, cursor }));
  const novo = busca ? `/pacientes/novo?nome=${encodeURIComponent(busca)}` : '/pacientes/novo';

  return (
    <FolhaLista
      titulo="Pacientes"
      descricao="Todo cadastro da central, em ordem alfabética · clique para abrir"
      plural="pacientes"
      acoes={
        <>
          <Link to="/pacientes/novo?naoIdentificado=1" className="mf-botao">
            <UserRoundX aria-hidden />
            Não identificado
          </Link>
          <Link to={novo} className="mf-botao mf-botao--primario">
            <UserPlus aria-hidden />
            Novo paciente
          </Link>
        </>
      }
      filtros={
        <form className="border-b border-fio p-3" role="search" aria-label="Buscar paciente" onSubmit={(e) => e.preventDefault()}>
          <CampoTexto rotulo="Buscar por nome ou CPF" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" />
        </form>
      }
      lista={lista}
      colunas={COLUNAS_PACIENTE}
      chave={(p) => p.id}
      aoSelecionar={(p) => void navegar(`/pacientes/${p.id}`)}
      vazio={
        <EstadoVazio
          className="m-3"
          icone={<Users aria-hidden />}
          titulo={busca ? `Ninguém com “${busca}” na central` : 'Nenhum paciente na central'}
          acao={
            <Link to={novo} className="mf-botao mf-botao--primario">
              <UserPlus aria-hidden />
              {busca ? `Cadastrar “${busca}”` : 'Novo paciente'}
            </Link>
          }
        />
      }
    />
  );
}
