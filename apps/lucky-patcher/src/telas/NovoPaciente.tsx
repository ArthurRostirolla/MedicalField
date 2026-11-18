import type { TipoItem } from '@medicalfield/contratos';
import { Botao, CampoTexto, EstadoErro, Esqueleto, Select, SeletorSegmentado } from '@medicalfield/ui';
import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { FORMULARIO_PESSOA_VAZIO, type FormularioPessoa } from '../dados/pessoas.ts';
import { CampoArea } from '../ui/CampoArea.tsx';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConsulta, useGravar } from '../ui/contexto.tsx';

const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((tipo) => ({ valor: tipo, rotulo: tipo }));

/** "Dipirona, látex; iodo" => itens do prontuario. */
const separar = (texto: string, tipo: TipoItem) =>
  texto
    .split(/[,;\n]/)
    .map((descricao) => descricao.trim())
    .filter(Boolean)
    .map((descricao) => ({ tipo, descricao }));

interface CamposProps {
  formulario: FormularioPessoa;
  mudar: (parte: Partial<FormularioPessoa>) => void;
  erros: Record<string, string>;
}

/** Os campos cadastrais (usados na criacao e na correcao de um cadastro rejeitado). */
function CamposCadastro({ formulario, mudar, erros }: CamposProps) {
  const texto = (campo: keyof FormularioPessoa) => ({
    value: formulario[campo] as string,
    onChange: (e: { target: { value: string } }) => mudar({ [campo]: e.target.value }),
    erro: erros[campo],
  });
  return (
    <>
      <SeletorSegmentado
        rotulo="Identificação"
        valor={formulario.naoIdentificada ? 'nao' : 'sim'}
        aoMudar={(valor) => mudar({ naoIdentificada: valor === 'nao' })}
        opcoes={[
          { valor: 'sim', rotulo: 'Identificado' },
          { valor: 'nao', rotulo: 'Não identificado' },
        ]}
      />
      <CampoTexto
        rotulo={formulario.naoIdentificada ? 'Nome (se souber)' : 'Nome completo'}
        autoComplete="off"
        autoCapitalize="words"
        ajuda={formulario.naoIdentificada ? 'Em branco, o cadastro recebe “Não identificado” com a hora.' : undefined}
        {...texto('nome')}
      />
      {formulario.naoIdentificada ? (
        <CampoArea
          rotulo="Como reconhecer"
          ajuda="Sexo aparente, idade aparente, roupa, sinais particulares, onde foi encontrado."
          {...texto('descricaoIdentificacao')}
        />
      ) : null}
      <div className="mf-grade-campos">
        <CampoTexto rotulo="Nascimento" type="date" {...texto('dataNascimento')} />
        <Select
          rotulo="Sexo"
          vazio="Não informado"
          opcoes={[
            { valor: 'F', rotulo: 'Feminino' },
            { valor: 'M', rotulo: 'Masculino' },
            { valor: 'I', rotulo: 'Indeterminado' },
          ]}
          value={formulario.sexo}
          onChange={(e) => mudar({ sexo: e.target.value as FormularioPessoa['sexo'] })}
          erro={erros.sexo}
        />
        <CampoTexto rotulo="CPF" inputMode="numeric" autoComplete="off" placeholder="11 dígitos" {...texto('cpf')} />
        <CampoTexto rotulo="Cartão SUS (CNS)" inputMode="numeric" autoComplete="off" placeholder="15 dígitos" {...texto('cns')} />
      </div>
      <CampoTexto rotulo="Telefone" type="tel" inputMode="tel" autoComplete="off" {...texto('telefone')} />
      <details className="lp-mais" open={Boolean(erros.contatoEmergenciaNome || erros.contatoEmergenciaTelefone || erros.contatoEmergenciaEmail) || undefined}>
        <summary>
          Contato de emergência
          <ChevronDown aria-hidden />
        </summary>
        <div className="lp-bloco">
          <CampoTexto rotulo="Nome do contato" autoComplete="off" {...texto('contatoEmergenciaNome')} />
          <CampoTexto rotulo="Telefone do contato" type="tel" inputMode="tel" autoComplete="off" {...texto('contatoEmergenciaTelefone')} />
          <CampoTexto
            rotulo="E-mail do contato"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            ajuda="Para onde a ficha em PDF pode ser enviada depois."
            {...texto('contatoEmergenciaEmail')}
          />
        </div>
      </details>
    </>
  );
}

export function NovoPaciente() {
  const app = useApp();
  const navegar = useNavigate();
  const [parametros] = useSearchParams();
  const { gravar, gravando, campos } = useGravar();
  const [formulario, setFormulario] = useState<FormularioPessoa>({
    ...FORMULARIO_PESSOA_VAZIO,
    nome: parametros.get('nome') ?? '',
    naoIdentificada: parametros.has('naoIdentificado'),
  });
  const [alergias, setAlergias] = useState('');
  const [comorbidades, setComorbidades] = useState('');
  const [medicacoes, setMedicacoes] = useState('');
  const [queixa, setQueixa] = useState('');
  const [local, setLocal] = useState('');
  const mudar = (parte: Partial<FormularioPessoa>) => setFormulario((atual) => ({ ...atual, ...parte }));

  async function salvar(evento: FormEvent, iniciarAtendimento: boolean) {
    evento.preventDefault();
    let pessoaId = '';
    let atendimentoId = '';
    const ok = await gravar(async () => {
      pessoaId = await app.pessoas.criar({
        ...formulario,
        itens: [...separar(alergias, 'ALERGIA'), ...separar(comorbidades, 'COMORBIDADE'), ...separar(medicacoes, 'MEDICACAO_CONTINUA')],
      });
      if (iniciarAtendimento) atendimentoId = await app.atendimentos.iniciar({ pessoaId, queixaPrincipal: queixa, localDescricao: local });
    });
    if (ok) navegar(atendimentoId ? `/atendimentos/${atendimentoId}` : `/pacientes/${pessoaId}`, { replace: true });
  }

  const temErro = Object.keys(campos).length > 0;
  return (
    <Casca titulo="Novo paciente" subtitulo="Grava neste aparelho; sobe quando houver rede" atual="pacientes" voltar={{ para: '/pacientes', rotulo: 'Pacientes' }}>
      <form className="lp-bloco" noValidate onSubmit={(e) => void salvar(e, true)}>
        <CamposCadastro formulario={formulario} mudar={mudar} erros={campos} />

        <CampoArea rotulo="Alergias" ajuda="Separe por vírgula. Ex.: dipirona, látex." value={alergias} onChange={(e) => setAlergias(e.target.value)} linhas={2} />
        <details className="lp-mais" open={campos.observacoes ? true : undefined}>
          <summary>
            Mais do prontuário
            <ChevronDown aria-hidden />
          </summary>
          <div className="lp-bloco">
            <CampoArea rotulo="Comorbidades" ajuda="Separe por vírgula." value={comorbidades} onChange={(e) => setComorbidades(e.target.value)} linhas={2} />
            <CampoArea rotulo="Medicações contínuas" ajuda="Separe por vírgula." value={medicacoes} onChange={(e) => setMedicacoes(e.target.value)} linhas={2} />
            <Select
              rotulo="Tipo sanguíneo"
              vazio="Não informado"
              opcoes={TIPOS_SANGUINEOS}
              value={formulario.tipoSanguineo}
              onChange={(e) => mudar({ tipoSanguineo: e.target.value })}
            />
            <CampoArea rotulo="Observações do prontuário" value={formulario.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} erro={campos.observacoes} />
          </div>
        </details>

        <div className="lp-cabecalho">
          <h2 className="mf-secao__titulo">Atendimento</h2>
        </div>
        <CampoTexto rotulo="Queixa principal" value={queixa} onChange={(e) => setQueixa(e.target.value)} autoComplete="off" erro={campos.queixaPrincipal} />
        <CampoTexto rotulo="Local da ocorrência" value={local} onChange={(e) => setLocal(e.target.value)} autoComplete="off" erro={campos.localDescricao} />

        {temErro ? (
          <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
            Nada foi gravado: confira os campos marcados.
          </p>
        ) : null}
        <Botao type="submit" variante="primario" largo carregando={gravando}>
          Salvar e iniciar atendimento
        </Botao>
        <Botao largo disabled={gravando} onClick={(e) => void salvar(e, false)}>
          Só salvar o cadastro
        </Botao>
      </form>
    </Casca>
  );
}

/** Corrige um cadastro que o servidor rejeitou e devolve a operacao para a fila. */
export function CorrigirPaciente() {
  const app = useApp();
  const navegar = useNavigate();
  const avisar = useAvisar();
  const { opId = '' } = useParams();
  const { gravar, gravando, campos } = useGravar();
  const [formulario, setFormulario] = useState<FormularioPessoa | null>(null);

  const pendencia = useConsulta(async () => {
    const lista = await app.pendencias.listar(app.sessao.atual?.profissional.id ?? null);
    const achada = lista.find((item) => item.comando.opId === opId && item.comando.entidade === 'pessoa' && item.situacao === 'REJEITADA');
    return achada ? { comando: achada.comando, formulario: await app.pessoas.formularioDe(achada.comando.entidadeId) } : null;
  }, [opId]);
  const inicial = pendencia.dados?.formulario;
  useEffect(() => {
    if (inicial) setFormulario((atual) => atual ?? inicial);
  }, [inicial]);

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    if (!formulario) return;
    if (await gravar(() => app.pessoas.corrigirRejeitada(opId, formulario))) {
      avisar({ tom: 'sucesso', titulo: 'Correção gravada', descricao: 'O cadastro voltou para a fila de envio.' });
      navegar('/pendencias', { replace: true });
    }
  }

  return (
    <Casca titulo="Corrigir cadastro" subtitulo="Rejeitado pelo servidor" atual="pendencias" voltar={{ para: '/pendencias', rotulo: 'Pendências' }}>
      {pendencia.erro ? (
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={pendencia.erro.message} aoTentarDeNovo={pendencia.recarregar} />
      ) : pendencia.dados === undefined ? (
        <Esqueleto linhas={5} altura="2.5rem" />
      ) : pendencia.dados === null || !formulario ? (
        <EstadoErro titulo="Esta pendência não está mais rejeitada" descricao="Ela pode ter sido enviada, corrigida ou descartada. Volte para a lista de pendências." />
      ) : (
        <form className="lp-bloco" noValidate onSubmit={(e) => void salvar(e)}>
          <div className="lp-aviso">
            <p>
              <span className="mf-rotulo">Motivo informado pelo servidor</span>
              <br />
              {pendencia.dados.comando.ultimoErro}
            </p>
          </div>
          <CamposCadastro formulario={formulario} mudar={(parte) => setFormulario((atual) => (atual ? { ...atual, ...parte } : atual))} erros={campos} />
          {Object.keys(campos).length > 0 ? (
            <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
              Nada foi gravado: confira os campos marcados.
            </p>
          ) : null}
          <Botao type="submit" variante="primario" largo carregando={gravando}>
            Salvar correção e reenviar
          </Botao>
        </form>
      )}
    </Casca>
  );
}
