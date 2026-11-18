// Tela de novo atendimento, como no app: primeiro o paciente (buscar ou cadastrar), depois queixa e local.
// O paciente escolhido fica na URL (?pessoa=), então voltar e recarregar não perdem o passo.
import { atendimentoEntradaSchema } from '@medicalfield/contratos';
import { Botao, CampoTexto, EstadoErro, EstadoVazio, Esqueleto, Secao } from '@medicalfield/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, ClipboardPlus, UserPlus, UserRoundX, Users } from 'lucide-react';
import { useDeferredValue, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { buscarPessoas, obterPessoa, obterProntuario, registrarAtendimento } from '../api/recursos';
import { CampoLeitura, CamposLeitura } from '../comum/CamposLeitura';
import { useAvisar } from '../comum/avisos';
import { FolhaLista } from '../comum/FolhaLista';
import { descreverErro, formatarCpf, formatarData, idadeEm } from '../comum/formato';
import { useListaPorCursor } from '../comum/paginacao';
import { COLUNAS_PACIENTE } from '../pacientes/TelaPacientes';


/** Duas colunas quando cabem; uma no celular (mesmo padrão dos filtros dos logs). */
const GRADE = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))' };

export function TelaNovoAtendimento() {
  const [parametros] = useSearchParams();
  const pessoaId = parametros.get('pessoa');
  return (
    <div className="grid max-w-5xl grid-cols-1 gap-6">
      <Link to="/atendimentos" className="mf-botao mf-botao--fantasma justify-self-start">
        <ArrowLeft aria-hidden />
        Atendimentos
      </Link>
      {pessoaId ? <DadosDoAtendimento key={pessoaId} pessoaId={pessoaId} /> : <EscolherPaciente />}
    </div>
  );
}

/** Passo 1: quem é o paciente. Quem não estiver na central entra por "Novo paciente" e o atendimento abre ao salvar. */
function EscolherPaciente() {
  const navegar = useNavigate();
  const [texto, setTexto] = useState('');
  const busca = useDeferredValue(texto.trim());
  const lista = useListaPorCursor(['pessoas', busca], (cursor) => buscarPessoas(busca, { limite: 20, cursor }));
  const novo = busca ? `/pacientes/novo?de=atendimento&nome=${encodeURIComponent(busca)}` : '/pacientes/novo?de=atendimento';

  return (
    <FolhaLista
      titulo="Novo atendimento"
      descricao="Escolha o paciente. Quem ainda não está cadastrado entra por Novo paciente, e o atendimento abre ao salvar."
      plural="pacientes"
      acoes={
        <>
          <Link to="/pacientes/novo?de=atendimento&naoIdentificado=1" className="mf-botao">
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
          <CampoTexto rotulo="Buscar por nome ou CPF" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoFocus />
        </form>
      }
      lista={lista}
      colunas={COLUNAS_PACIENTE}
      chave={(p) => p.id}
      aoSelecionar={(p) => void navegar(`/atendimentos/novo?pessoa=${p.id}`)}
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

/** Passo 2: o paciente escolhido (com o que o prontuário já registra) e os dados que abrem a linha do tempo. */
function DadosDoAtendimento({ pessoaId }: { pessoaId: string }) {
  const navegar = useNavigate();
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const pessoa = useQuery({ queryKey: ['pessoa', pessoaId], queryFn: () => obterPessoa(pessoaId) });
  const prontuario = useQuery({ queryKey: ['prontuario', pessoaId], queryFn: () => obterProntuario(pessoaId), retry: false });
  // Um id por paciente escolhido: repetir depois de falha de rede devolve o mesmo atendimento (200).
  const [id] = useState(() => crypto.randomUUID());
  const [queixa, setQueixa] = useState('');
  const [local, setLocal] = useState('');
  const [falha, setFalha] = useState<string | null>(null);

  const criacao = useMutation({
    mutationFn: registrarAtendimento,
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['atendimentos'] });
      void consultas.invalidateQueries({ queryKey: ['atendimentos-da-pessoa', pessoaId] });
      avisar({ tom: 'sucesso', titulo: 'Atendimento aberto', descricao: pessoa.data?.nome });
      void navegar(`/atendimentos/${id}`, { replace: true });
    },
    onError: (erro) => setFalha(descreverErro(erro, 'o atendimento').descricao),
  });

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const entrada = atendimentoEntradaSchema.safeParse({
      id,
      pessoaId,
      iniciadoEm: new Date().toISOString(),
      ...(queixa.trim() ? { queixaPrincipal: queixa.trim() } : {}),
      ...(local.trim() ? { localDescricao: local.trim() } : {}),
    });
    if (!entrada.success) return setFalha('Confira a queixa e o local.');
    criacao.mutate(entrada.data);
  }

  const trocar = (
    <Link to="/atendimentos/novo" className="mf-botao">
      <Users aria-hidden />
      Trocar paciente
    </Link>
  );

  if (pessoa.isPending) {
    return (
      <Secao titulo="Novo atendimento" acoes={trocar}>
        <Esqueleto linhas={4} />
      </Secao>
    );
  }
  if (pessoa.isError) {
    return <EstadoErro {...descreverErro(pessoa.error, 'o paciente')} aoTentarDeNovo={() => void pessoa.refetch()} />;
  }

  const p = pessoa.data;
  const idade = idadeEm(p.dataNascimento);
  const ativos = (prontuario.data?.itens ?? []).filter((item) => item.inativadoEm === null);
  const doTipo = (tipo: string) => ativos.filter((item) => item.tipo === tipo).map((item) => item.descricao).join(', ') || null;

  return (
    <>
      <Secao titulo={p.nome} descricao="Paciente deste atendimento" acoes={trocar} rente>
        <CamposLeitura>
          <CampoLeitura rotulo="Nascimento">
            {p.dataNascimento ? (
              <>
                <span className="mf-dado">{formatarData(p.dataNascimento)}</span>
                {idade !== null ? ` · ${idade} anos` : ''}
              </>
            ) : null}
          </CampoLeitura>
          <CampoLeitura rotulo="CPF">{p.cpf ? <span className="mf-dado">{formatarCpf(p.cpf)}</span> : null}</CampoLeitura>
          <CampoLeitura rotulo="Tipo sanguíneo">{prontuario.data?.tipoSanguineo}</CampoLeitura>
          <CampoLeitura rotulo="Alergias">{doTipo('ALERGIA')}</CampoLeitura>
          <CampoLeitura rotulo="Comorbidades">{doTipo('COMORBIDADE')}</CampoLeitura>
          <CampoLeitura rotulo="Medicações contínuas">{doTipo('MEDICACAO_CONTINUA')}</CampoLeitura>
          {p.descricaoIdentificacao ? (
            <CampoLeitura rotulo="Descrição para identificação" largo>
              {p.descricaoIdentificacao}
            </CampoLeitura>
          ) : null}
        </CamposLeitura>
      </Secao>

      <Secao titulo="Abertura" descricao="A linha do tempo começa com a hora de agora e o seu nome. Sinais vitais, triagem e o resto entram na tela do atendimento.">
        <form className="grid grid-cols-1 gap-3" onSubmit={aoEnviar} noValidate>
          <div className="mf-grade-campos" style={GRADE}>
            <CampoTexto rotulo="Queixa principal" value={queixa} onChange={(e) => setQueixa(e.target.value)} autoComplete="off" autoFocus />
            <CampoTexto rotulo="Local da ocorrência" value={local} onChange={(e) => setLocal(e.target.value)} autoComplete="off" />
          </div>
          {falha ? (
            <p className="mf-campo__erro m-0" role="alert">
              <CircleAlert aria-hidden />
              <span>{falha}</span>
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Link to={`/pacientes/${pessoaId}`} className="mf-botao">
              Ver paciente
            </Link>
            <Botao type="submit" variante="primario" icone={<ClipboardPlus aria-hidden />} carregando={criacao.isPending}>
              Abrir atendimento
            </Botao>
          </div>
        </form>
      </Secao>
    </>
  );
}
