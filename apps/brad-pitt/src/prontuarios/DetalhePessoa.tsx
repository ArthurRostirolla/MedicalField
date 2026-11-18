import type { ProntuarioItem } from '@medicalfield/contratos';
import { Botao, Esqueleto, EstadoErro, EstadoVazio, Etiqueta, Secao, Tabela, type Coluna } from '@medicalfield/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ArrowLeft, ClipboardList, ClipboardPlus } from 'lucide-react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { ErroApi } from '../api/cliente';
import { listarAtendimentosDaPessoa, obterPessoa, obterProntuario } from '../api/recursos';
import { COLUNAS_ATENDIMENTO } from '../atendimentos/TelaAtendimentos';
import { CampoLeitura, CamposLeitura } from '../comum/CamposLeitura';
import { BotaoAtualizar, FolhaLista } from '../comum/FolhaLista';
import { descreverErro, formatarCpf, formatarData, formatarDataHora, formatarDataHoraLonga, idadeEm } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';
import { RegiaoRolavel } from '../comum/RegiaoRolavel';
import { ConfirmarInativacao, NovoItem, TIPO_ITEM } from './ItensProntuario';

const COLUNAS_ITEM: Coluna<ProntuarioItem>[] = [
  { id: 'tipo', titulo: 'Tipo', celula: (item) => <span className="mf-rotulo">{TIPO_ITEM[item.tipo]}</span> },
  {
    id: 'descricao',
    titulo: 'Descrição',
    quebra: true,
    // Item inativado continua na folha, riscado: nada se apaga.
    celula: (item) => (item.inativadoEm ? <s>{item.descricao}</s> : <strong className="font-[650]">{item.descricao}</strong>),
  },
  {
    id: 'registrado',
    titulo: 'Registrado em',
    celula: (item) => (
      <time className="mf-dado" dateTime={item.registradoEm}>
        {formatarDataHora(item.registradoEm)}
      </time>
    ),
  },
  {
    id: 'situacao',
    titulo: 'Situação',
    celula: (item) =>
      item.inativadoEm ? <Etiqueta>Inativado em {formatarDataHora(item.inativadoEm)}</Etiqueta> : <Etiqueta tom="cheia">Ativo</Etiqueta>,
  },
];

export function DetalhePessoa() {
  const { pessoaId = '' } = useParams();
  const navegar = useNavigate();
  // A mesma página serve às duas seções; o voltar respeita por onde se chegou.
  const secao = useLocation().pathname.startsWith('/pacientes') ? { para: '/pacientes', rotulo: 'Pacientes' } : { para: '/prontuarios', rotulo: 'Prontuários' };
  const pessoa = useQuery({ queryKey: ['pessoa', pessoaId], queryFn: () => obterPessoa(pessoaId) });
  const prontuario = useQuery({
    queryKey: ['prontuario', pessoaId],
    queryFn: () => obterProntuario(pessoaId),
    retry: false,
  });
  const [inativar, setInativar] = useState<ProntuarioItem | null>(null);
  const atendimentos = useListaPorCursor(['atendimentos-da-pessoa', pessoaId], (cursor) =>
    listarAtendimentosDaPessoa(pessoaId, { limite: 20, cursor }),
  );

  const voltar = (
    <Link to={secao.para} className="mf-botao mf-botao--fantasma justify-self-start">
      <ArrowLeft aria-hidden />
      {secao.rotulo}
    </Link>
  );

  if (pessoa.isPending) {
    return (
      <div className="grid grid-cols-1 gap-6" aria-busy="true">
        {voltar}
        <p className="mf-so-leitor" role="status">
          Carregando o prontuário…
        </p>
        <Secao titulo="Pessoa">
          <Esqueleto linhas={6} />
        </Secao>
      </div>
    );
  }
  if (pessoa.isError) {
    return (
      <div className="grid grid-cols-1 gap-6">
        {voltar}
        <EstadoErro {...descreverErro(pessoa.error, 'a pessoa')} aoTentarDeNovo={() => void pessoa.refetch()} />
      </div>
    );
  }

  const p = pessoa.data;
  const idade = idadeEm(p.dataNascimento);
  const semProntuario = prontuario.error instanceof ErroApi && prontuario.error.codigo === 'NAO_ENCONTRADO';
  const itens = [...(prontuario.data?.itens ?? [])].sort(
    (a, b) => a.tipo.localeCompare(b.tipo) || Date.parse(a.registradoEm) - Date.parse(b.registradoEm),
  );

  return (
    <div className="grid grid-cols-1 gap-6">
      {voltar}
      <Secao
        titulo={p.nome}
        descricao={p.naoIdentificada ? 'Pessoa não identificada na cena' : undefined}
        acoes={
          <BotaoAtualizar
            atualizando={pessoa.isFetching || prontuario.isFetching}
            aoAtualizar={() => {
              void pessoa.refetch();
              void prontuario.refetch();
            }}
          />
        }
        rente
      >
        <CamposLeitura>
          <CampoLeitura rotulo="Nascimento">
            {p.dataNascimento ? (
              <>
                <span className="mf-dado">{formatarData(p.dataNascimento)}</span>
                {idade !== null ? ` · ${idade} anos` : ''}
              </>
            ) : null}
          </CampoLeitura>
          <CampoLeitura rotulo="Sexo">{p.sexo}</CampoLeitura>
          <CampoLeitura rotulo="CPF">{p.cpf ? <span className="mf-dado">{formatarCpf(p.cpf)}</span> : null}</CampoLeitura>
          <CampoLeitura rotulo="CNS">{p.cns ? <span className="mf-dado">{p.cns}</span> : null}</CampoLeitura>
          <CampoLeitura rotulo="Telefone">{p.telefone}</CampoLeitura>
          <CampoLeitura rotulo="E-mail">{p.email}</CampoLeitura>
          <CampoLeitura rotulo="Contato de emergência">{p.contatoEmergenciaNome}</CampoLeitura>
          <CampoLeitura rotulo="Telefone do contato">{p.contatoEmergenciaTelefone}</CampoLeitura>
          <CampoLeitura rotulo="E-mail do contato">{p.contatoEmergenciaEmail}</CampoLeitura>
          {p.descricaoIdentificacao ? (
            <CampoLeitura rotulo="Descrição para identificação" largo>
              {p.descricaoIdentificacao}
            </CampoLeitura>
          ) : null}
          {p.possivelDuplicataDe ? (
            <CampoLeitura rotulo="Possível duplicata" largo>
              <Link to={`/prontuarios/${p.possivelDuplicataDe}`}>Abrir o cadastro parecido</Link>
            </CampoLeitura>
          ) : null}
          <CampoLeitura rotulo="Cadastrado em">
            <span className="mf-dado">{formatarDataHoraLonga(p.criadoEm)}</span>
          </CampoLeitura>
          <CampoLeitura rotulo="Atualizado em">
            <span className="mf-dado">{formatarDataHoraLonga(p.atualizadoEm)}</span>
          </CampoLeitura>
        </CamposLeitura>
      </Secao>

      <Secao titulo="Prontuário" rente>
        {prontuario.isPending ? (
          <div className="p-3" aria-busy="true">
            <Esqueleto linhas={4} />
          </div>
        ) : semProntuario ? (
          <>
            <EstadoVazio className="m-3" titulo="Pessoa sem prontuário" />
            <NovoItem pessoaId={pessoaId} semProntuario />
          </>
        ) : prontuario.isError ? (
          <EstadoErro
            {...descreverErro(prontuario.error, 'o prontuário')}
            aoTentarDeNovo={() => void prontuario.refetch()}
            className="m-3"
          />
        ) : (
          <>
            <CamposLeitura>
              <CampoLeitura rotulo="Tipo sanguíneo">{prontuario.data.tipoSanguineo}</CampoLeitura>
              <CampoLeitura rotulo="Observações">{prontuario.data.observacoes}</CampoLeitura>
            </CamposLeitura>
            <RegiaoRolavel rotulo="Itens do prontuário">
              <Tabela
                legenda="Itens do prontuário"
                colunas={[
                  ...COLUNAS_ITEM,
                  {
                    id: 'acao',
                    titulo: 'Ação',
                    alinhar: 'fim',
                    celula: (item) =>
                      item.inativadoEm ? null : (
                        <Botao variante="fantasma" onClick={() => setInativar(item)}>
                          Inativar
                        </Botao>
                      ),
                  },
                ]}
                linhas={itens}
                chave={(item) => item.id}
                vazio={<EstadoVazio className="m-3" titulo="Nenhum item registrado" />}
              />
            </RegiaoRolavel>
            <NovoItem pessoaId={pessoaId} />
            <ConfirmarInativacao pessoaId={pessoaId} item={inativar} aoFechar={() => setInativar(null)} />
          </>
        )}
      </Secao>

      <FolhaLista
        titulo="Atendimentos desta pessoa"
        plural="atendimentos"
        acoes={
          <Link to={`/atendimentos/novo?pessoa=${pessoaId}`} className="mf-botao mf-botao--primario">
            <ClipboardPlus aria-hidden />
            Novo atendimento
          </Link>
        }
        lista={atendimentos}
        colunas={COLUNAS_ATENDIMENTO}
        chave={(a) => a.id}
        aoSelecionar={(a) => void navegar(`/atendimentos/${a.id}`)}
        vazio={
          <EstadoVazio className="m-3" icone={<ClipboardList aria-hidden />} titulo="Nenhum atendimento desta pessoa" />
        }
      />
    </div>
  );
}
