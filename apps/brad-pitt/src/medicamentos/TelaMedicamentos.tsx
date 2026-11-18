import type { Medicamento } from '@medicalfield/contratos';
import { CampoTexto, Checkbox, EstadoErro, EstadoVazio, Etiqueta, Secao, Tabela, type Coluna } from '@medicalfield/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Pill, Search, SearchX } from 'lucide-react';
import { useState } from 'react';
import { listarTodosMedicamentos } from '../api/recursos';
import { BotaoAtualizar } from '../comum/FolhaLista';
import { descreverErro } from '../comum/formato';
import { RegiaoRolavel } from '../comum/RegiaoRolavel';

const COLUNAS: Coluna<Medicamento>[] = [
  {
    id: 'nome',
    titulo: 'Medicamento e princípio ativo',
    quebra: true,
    celula: (m) => (
      <>
        <strong className="font-[650]">{m.nome}</strong>
        <div className="text-tinta-2">{m.principioAtivo ?? 'Princípio ativo não informado'}</div>
      </>
    ),
  },
  {
    id: 'apresentacao',
    titulo: 'Apresentação e observação',
    quebra: true,
    celula: (m) => (
      <>
        {m.apresentacao ?? '—'}
        {m.observacao ? <div className="text-pequeno text-tinta-2">{m.observacao}</div> : null}
      </>
    ),
  },
  {
    id: 'situacao',
    titulo: 'Situação',
    celula: (m) => (m.ativo ? <Etiqueta tom="cheia">Ativo</Etiqueta> : <Etiqueta>Inativo</Etiqueta>),
  },
];

/** Minúsculas e sem acento, para "glicose" achar "Glicose" e "acido" achar "Ácido". */
const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Cadastro de apoio: a lista inteira, com busca local. */
export function TelaMedicamentos() {
  const [busca, setBusca] = useState('');
  const [incluirInativos, setIncluirInativos] = useState(false);
  const consulta = useQuery({
    queryKey: ['medicamentos', incluirInativos],
    queryFn: () => listarTodosMedicamentos(incluirInativos),
    placeholderData: keepPreviousData,
  });

  const termo = normalizar(busca.trim());
  const todos = consulta.data ?? [];
  const achados = termo
    ? todos.filter((m) => normalizar(`${m.nome} ${m.principioAtivo ?? ''} ${m.apresentacao ?? ''}`).includes(termo))
    : todos;

  return (
    <Secao
      titulo="Medicamentos"
      descricao="Cadastro de apoio usado pelo app ao registrar medicação · somente leitura"
      acoes={<BotaoAtualizar atualizando={consulta.isFetching && !consulta.isPending} aoAtualizar={() => void consulta.refetch()} />}
      rente
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-fio p-3">
        <CampoTexto
          className="min-w-0 flex-1 basis-64"
          rotulo="Buscar no cadastro"
          placeholder="Nome, princípio ativo ou apresentação"
          type="search"
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          sufixo={<Search aria-hidden className="size-4" />}
        />
        <Checkbox checked={incluirInativos} onChange={(evento) => setIncluirInativos(evento.target.checked)}>
          Incluir inativos
        </Checkbox>
      </div>
      {consulta.isError && !consulta.data ? (
        <EstadoErro {...descreverErro(consulta.error, 'os medicamentos')} aoTentarDeNovo={() => void consulta.refetch()} className="m-3" />
      ) : (
        <>
          <RegiaoRolavel rotulo="Medicamentos do cadastro de apoio">
            <Tabela
              legenda="Medicamentos do cadastro de apoio"
              colunas={COLUNAS}
              linhas={achados}
              chave={(m) => m.id}
              carregando={consulta.isPending}
              vazio={
                termo ? (
                  <EstadoVazio
                    className="m-3"
                    icone={<SearchX aria-hidden />}
                    titulo={`Nada no cadastro com “${busca.trim()}”`}
                    descricao={
                      incluirInativos
                        ? 'Confira a grafia ou busque pelo princípio ativo.'
                        : 'Confira a grafia, busque pelo princípio ativo ou marque “Incluir inativos”.'
                    }
                  />
                ) : (
                  <EstadoVazio
                    className="m-3"
                    icone={<Pill aria-hidden />}
                    titulo="Cadastro de medicamentos vazio"
                    descricao="Os medicamentos são incluídos direto no banco central. Use “Atualizar” depois da inclusão."
                  />
                )
              }
            />
          </RegiaoRolavel>
          <p className="mf-paginacao" role="status">
            {consulta.isPending ? (
              'Carregando…'
            ) : (
              <span>
                <span className="mf-num">{achados.length}</span>
                {termo ? (
                  <>
                    {' '}
                    de <span className="mf-num">{todos.length}</span>
                  </>
                ) : null}{' '}
                {todos.length === 1 ? 'medicamento' : 'medicamentos'}
                {incluirInativos ? ', com os inativos' : ' ativos'}
              </span>
            )}
          </p>
        </>
      )}
    </Secao>
  );
}
