// Tela de novo paciente, como no app: cadastro, prontuário e (opcional) o atendimento que já abre ao salvar.
// Comandos em ordem (pessoa → prontuário → atendimento); o que já foi aceito não é reenviado na nova tentativa.
import { atendimentoEntradaSchema, pessoaEntradaSchema, prontuarioEntradaSchema, type TipoItem } from '@medicalfield/contratos';
import {
  Botao,
  CampoArea,
  CampoCns,
  CampoCpf,
  CampoData,
  CampoEmail,
  CampoItens,
  CampoTelefone,
  CampoTexto,
  Checkbox,
  Secao,
  SeletorSegmentado,
  SeletorTipoSanguineo,
} from '@medicalfield/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CircleAlert, ClipboardPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ErroApi } from '../api/cliente';
import { cadastrarPessoa, cadastrarProntuario, registrarAtendimento } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { descreverErro } from '../comum/formato';

const SEXOS = [
  { valor: 'F', rotulo: 'Feminino' },
  { valor: 'M', rotulo: 'Masculino' },
  { valor: 'I', rotulo: 'Indeterminado' },
  { valor: '', rotulo: 'Não informado' },
];

/** Atalhos de um clique para as entradas mais comuns; nenhum vem marcado. */
const LISTAS = {
  alergias: { rotulo: 'Alergias', tipo: 'ALERGIA', sugestoes: ['Dipirona', 'Penicilina', 'AAS', 'Látex', 'Iodo', 'Frutos do mar'] },
  comorbidades: { rotulo: 'Comorbidades', tipo: 'COMORBIDADE', sugestoes: ['Hipertensão', 'Diabetes', 'Asma', 'DPOC', 'Cardiopatia', 'Epilepsia'] },
  medicacoes: { rotulo: 'Medicações contínuas', tipo: 'MEDICACAO_CONTINUA', sugestoes: ['Losartana', 'Metformina', 'Insulina', 'AAS', 'Varfarina'] },
} as const satisfies Record<string, { rotulo: string; tipo: TipoItem; sugestoes: readonly string[] }>;
type Lista = keyof typeof LISTAS;

const CAMPOS = [
  'nome',
  'descricaoIdentificacao',
  'dataNascimento',
  'sexo',
  'cpf',
  'cns',
  'telefone',
  'email',
  'contatoEmergenciaNome',
  'contatoEmergenciaTelefone',
  'contatoEmergenciaEmail',
  'tipoSanguineo',
  'observacoes',
  'queixaPrincipal',
  'localDescricao',
] as const;
type Campo = (typeof CAMPOS)[number];
type Erros = Partial<Record<Campo | Lista | 'itens', string>>;

const digitos = (texto: string) => texto.replace(/\D/g, '');

const primeiroErro = (issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>): Erros =>
  Object.fromEntries(issues.map((i) => [String(i.path[0]), i.message]).reverse());

/** Duas colunas quando cabem; uma no celular (mesmo padrão dos filtros dos logs). */
const GRADE = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(16rem, 100%), 1fr))' };
/** Três documentos curtos numa linha só (nascimento, CPF, CNS). */
const GRADE_3 = { gridTemplateColumns: 'repeat(auto-fit, minmax(min(13rem, 100%), 1fr))' };

export function TelaNovoPaciente() {
  const navegar = useNavigate();
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const [parametros] = useSearchParams();
  // Ids fixos enquanto a tela estiver aberta: nova tentativa devolve o mesmo cadastro (200), não cria outro.
  const [ids] = useState(() => ({ pessoa: crypto.randomUUID(), prontuario: crypto.randomUUID(), atendimento: crypto.randomUUID() }));
  const aceitos = useRef(new Set<'pessoa' | 'prontuario' | 'atendimento'>());
  const [valores, setValores] = useState<Record<Campo, string>>(
    () => ({ ...Object.fromEntries(CAMPOS.map((c) => [c, ''])), nome: parametros.get('nome') ?? '' }) as Record<Campo, string>,
  );
  const [listas, setListas] = useState<Record<Lista, string[]>>({ alergias: [], comorbidades: [], medicacoes: [] });
  const [naoIdentificada, setNaoIdentificada] = useState(parametros.get('naoIdentificado') === '1');
  const [erros, setErros] = useState<Erros>({});
  const [falha, setFalha] = useState<string | null>(null);

  const v = (campo: Campo) => valores[campo].trim();
  const definir = (campo: Campo) => (valor: string) => setValores((atual) => ({ ...atual, [campo]: valor }));
  const ligar = (campo: Campo) => ({ value: valores[campo], erro: erros[campo], onChange: (e: { target: { value: string } }) => definir(campo)(e.target.value) });
  const mascarado = (campo: Campo) => ({ value: valores[campo], erro: erros[campo], aoMudar: definir(campo) });
  const opcional = (campo: Campo, valor = v(campo)) => (valor ? { [campo]: valor } : {});

  const gravacao = useMutation({
    mutationFn: async (comAtendimento: boolean) => {
      const agora = new Date().toISOString();
      const nome = v('nome') || `Não identificado — ${new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`;
      const pessoa = pessoaEntradaSchema.safeParse({
        id: ids.pessoa,
        nome,
        editadoEm: agora,
        naoIdentificada,
        ...(naoIdentificada ? opcional('descricaoIdentificacao') : {}),
        ...opcional('dataNascimento'),
        ...opcional('sexo'),
        ...opcional('cpf', digitos(v('cpf'))),
        ...opcional('cns', digitos(v('cns'))),
        ...opcional('telefone'),
        ...opcional('email'),
        ...opcional('contatoEmergenciaNome'),
        ...opcional('contatoEmergenciaTelefone'),
        ...opcional('contatoEmergenciaEmail'),
      });
      const itens = (Object.keys(LISTAS) as Lista[]).flatMap((lista) =>
        listas[lista].map((descricao) => ({ id: crypto.randomUUID(), tipo: LISTAS[lista].tipo, descricao, registradoEm: agora })),
      );
      const prontuario = prontuarioEntradaSchema.safeParse({
        id: ids.prontuario,
        pessoaId: ids.pessoa,
        ...opcional('tipoSanguineo'),
        ...opcional('observacoes'),
        ...(itens.length ? { itens } : {}),
      });
      const atendimento = atendimentoEntradaSchema.safeParse({
        id: ids.atendimento,
        pessoaId: ids.pessoa,
        iniciadoEm: agora,
        ...opcional('queixaPrincipal'),
        ...opcional('localDescricao'),
      });
      const recusados = {
        ...(pessoa.success ? {} : primeiroErro(pessoa.error.issues)),
        ...(prontuario.success ? {} : primeiroErro(prontuario.error.issues)),
        ...(comAtendimento && !atendimento.success ? primeiroErro(atendimento.error.issues) : {}),
      };
      if (!pessoa.success || !prontuario.success || (comAtendimento && !atendimento.success)) throw new CamposRecusados(recusados);

      if (!aceitos.current.has('pessoa')) await cadastrarPessoa(pessoa.data);
      aceitos.current.add('pessoa');
      if (!aceitos.current.has('prontuario')) await cadastrarProntuario(prontuario.data);
      aceitos.current.add('prontuario');
      if (comAtendimento && atendimento.success) {
        await registrarAtendimento(atendimento.data);
        aceitos.current.add('atendimento');
      }
      return { nome: pessoa.data.nome, comAtendimento };
    },
    onSuccess: ({ nome, comAtendimento }) => {
      for (const chave of ['prontuarios', 'pessoas', 'atendimentos']) void consultas.invalidateQueries({ queryKey: [chave] });
      avisar({ tom: 'sucesso', titulo: comAtendimento ? 'Paciente cadastrado e atendimento aberto' : 'Paciente cadastrado', descricao: nome });
      void navegar(comAtendimento ? `/atendimentos/${ids.atendimento}` : `/pacientes/${ids.pessoa}`, { replace: true });
    },
    onError: (erro) => {
      if (erro instanceof CamposRecusados) return setErros(erro.campos);
      if (erro instanceof ErroApi && erro.codigo === 'VALIDACAO' && erro.detalhes.length) {
        return setErros(Object.fromEntries(erro.detalhes.map((d) => [d.campo, d.mensagem])));
      }
      // Cadastro já aceito e atendimento recusado: o paciente existe; só falta abrir o atendimento.
      const parcial = aceitos.current.has('prontuario') ? ' O cadastro já está gravado; tente abrir o atendimento de novo.' : '';
      setFalha(descreverErro(erro, 'o cadastro').descricao + parcial);
    },
  });

  function salvar(comAtendimento: boolean) {
    setErros({});
    setFalha(null);
    if (!v('nome') && !naoIdentificada) return setErros({ nome: 'informe o nome ou marque "Pessoa não identificada"' });
    gravacao.mutate(comAtendimento);
  }

  const voltar = parametros.get('de') === 'atendimento' ? { para: '/atendimentos/novo', rotulo: 'Novo atendimento' } : { para: '/pacientes', rotulo: 'Pacientes' };
  const temErro = Object.keys(erros).length > 0;

  return (
    <form
      className="grid max-w-3xl grid-cols-1 gap-6"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        salvar(true);
      }}
      noValidate
      aria-label="Novo paciente"
    >
      <Link to={voltar.para} className="mf-botao mf-botao--fantasma justify-self-start">
        <ArrowLeft aria-hidden />
        {voltar.rotulo}
      </Link>

      <Secao titulo="Identificação" descricao="Só o nome é obrigatório. Quem não for identificado na cena entra com uma descrição e é completado depois.">
        <div className="grid grid-cols-1 gap-4">
          <CampoTexto rotulo="Nome" autoComplete="off" autoFocus {...ligar('nome')} />
          <Checkbox checked={naoIdentificada} onChange={(e) => setNaoIdentificada(e.target.checked)}>
            Pessoa não identificada
          </Checkbox>
          {naoIdentificada ? (
            <CampoArea
              rotulo="Descrição para identificação"
              linhas={2}
              placeholder="Roupas, tatuagens, idade aparente, onde foi encontrada…"
              {...ligar('descricaoIdentificacao')}
            />
          ) : null}
          <div className="mf-grade-campos" style={GRADE_3}>
            <CampoData rotulo="Nascimento" {...ligar('dataNascimento')} />
            <CampoCpf rotulo="CPF" {...mascarado('cpf')} />
            <CampoCns rotulo="CNS (cartão SUS)" {...mascarado('cns')} />
          </div>
          <SeletorSegmentado rotulo="Sexo" valor={valores.sexo} aoMudar={definir('sexo')} opcoes={SEXOS} />
        </div>
      </Secao>

      <Secao titulo="Contato" descricao="O e-mail do paciente recebe a ficha em PDF quando o atendimento é encerrado.">
        <div className="grid grid-cols-1 gap-4">
          <div className="mf-grade-campos" style={GRADE}>
            <CampoTelefone rotulo="Telefone" {...mascarado('telefone')} />
            <CampoEmail rotulo="E-mail" {...ligar('email')} />
          </div>
          <div className="mf-grade-campos" style={GRADE_3}>
            <CampoTexto rotulo="Contato de emergência (nome)" autoComplete="off" {...ligar('contatoEmergenciaNome')} />
            <CampoTelefone rotulo="Telefone do contato" {...mascarado('contatoEmergenciaTelefone')} />
            <CampoEmail rotulo="E-mail do contato" {...ligar('contatoEmergenciaEmail')} />
          </div>
        </div>
      </Secao>

      <Secao titulo="Prontuário" descricao="Tudo o que entra aqui pode ser inativado depois, nunca apagado.">
        <div className="grid grid-cols-1 gap-5">
          {(Object.keys(LISTAS) as Lista[]).map((lista) => (
            <CampoItens
              key={lista}
              rotulo={LISTAS[lista].rotulo}
              valor={listas[lista]}
              aoMudar={(itens) => setListas((atual) => ({ ...atual, [lista]: itens }))}
              sugestoes={LISTAS[lista].sugestoes}
              placeholder="Digite e tecle Enter"
              erro={erros[lista] ?? (lista === 'alergias' ? erros.itens : undefined)}
            />
          ))}
          <SeletorTipoSanguineo valor={valores.tipoSanguineo} aoMudar={definir('tipoSanguineo')} erro={erros.tipoSanguineo} />
          <CampoArea rotulo="Observações" linhas={2} {...ligar('observacoes')} />
        </div>
      </Secao>

      <Secao titulo="Atendimento" descricao="Usado em “Salvar e abrir atendimento”. A linha do tempo começa com a hora de agora e o seu nome.">
        <div className="mf-grade-campos" style={GRADE}>
          <CampoTexto rotulo="Queixa principal" autoComplete="off" {...ligar('queixaPrincipal')} />
          <CampoTexto rotulo="Local da ocorrência" autoComplete="off" {...ligar('localDescricao')} />
        </div>
      </Secao>

      <div className="grid gap-3">
        {temErro || falha ? (
          <p className="mf-campo__erro m-0" role="alert">
            <CircleAlert aria-hidden />
            <span>{falha ?? 'Nada foi gravado: confira os campos marcados.'}</span>
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Botao disabled={gravacao.isPending} onClick={() => salvar(false)}>
            Só salvar o cadastro
          </Botao>
          <Botao type="submit" variante="primario" icone={<ClipboardPlus aria-hidden />} carregando={gravacao.isPending}>
            Salvar e abrir atendimento
          </Botao>
        </div>
      </div>
    </form>
  );
}

class CamposRecusados extends Error {
  constructor(readonly campos: Erros) {
    super('Campos recusados pelo contrato');
  }
}
