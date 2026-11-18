import type { TipoItem } from '@medicalfield/contratos';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { FORMULARIO_PESSOA_VAZIO, type FormularioPessoa } from '../dados/pessoas.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConsulta, useGravar } from '../ui/contexto.tsx';
import { Botao, CampoArea, CampoTexto, EstadoErro, Esqueleto, Icone, MEDIDA, Mensagens, Rotulo, Select, SeletorSegmentado, Entra, MOVIMENTO, NATIVO, Texto, useTema } from '../ui/ds/index.ts';

const TIPOS_SANGUINEOS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((tipo) => ({ valor: tipo, rotulo: tipo }));

/** "Dipirona, látex; iodo" => itens do prontuario. */
const separar = (texto: string, tipo: TipoItem) =>
  texto
    .split(/[,;\n]/)
    .map((descricao) => descricao.trim())
    .filter(Boolean)
    .map((descricao) => ({ tipo, descricao }));

/** Secao recolhivel (o antigo <details>). `aberto` forca abrir (ex.: erro dentro dela). */
export function Recolhivel({ titulo, aberto, children }: { titulo: string; aberto?: boolean; children: ReactNode }) {
  const { cores } = useTema();
  const [mostrar, setMostrar] = useState(false);
  const visivel = mostrar || !!aberto;
  const [giro] = useState(() => new Animated.Value(visivel ? 1 : 0));
  useEffect(() => {
    Animated.timing(giro, { toValue: visivel ? 1 : 0, duration: 200, easing: MOVIMENTO, useNativeDriver: NATIVO }).start();
  }, [visivel, giro]);
  const rotate = giro.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  return (
    <View>
      <Pressable
        role="button"
        aria-expanded={visivel}
        onPress={() => setMostrar(!visivel)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MEDIDA.alvo, borderBottomWidth: 1, borderBottomColor: cores.fio }}
      >
        <Texto forte>{titulo}</Texto>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icone icone={ChevronDown} cor={cores.tinta2} />
        </Animated.View>
      </Pressable>
      {visivel ? <Entra style={{ gap: 16, paddingTop: 12 }}>{children}</Entra> : null}
    </View>
  );
}

interface CamposProps {
  formulario: FormularioPessoa;
  mudar: (parte: Partial<FormularioPessoa>) => void;
  erros: Record<string, string>;
  /** Entra logo depois do nome, antes dos dados recolhidos (ex.: queixa e local do atendimento). */
  depoisDoNome?: ReactNode;
  /** Mostra os dados complementares abertos (correcao de cadastro rejeitado). */
  detalhesAbertos?: boolean;
}

const DETALHES: ReadonlyArray<keyof FormularioPessoa> = [
  'dataNascimento',
  'sexo',
  'cpf',
  'cns',
  'telefone',
  'contatoEmergenciaNome',
  'contatoEmergenciaTelefone',
  'contatoEmergenciaEmail',
];

/** Os campos cadastrais: so identificacao e nome a vista; documentos e contatos ficam recolhidos. */
function CamposCadastro({ formulario, mudar, erros, depoisDoNome, detalhesAbertos }: CamposProps) {
  const texto = (campo: keyof FormularioPessoa) => ({
    value: formulario[campo] as string,
    onChangeText: (valor: string) => mudar({ [campo]: valor }),
    erro: erros[campo],
  });
  const metade = { flexGrow: 1, flexBasis: 140 };
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
      <CampoTexto rotulo={formulario.naoIdentificada ? 'Nome (se souber)' : 'Nome completo'} autoComplete="off" autoCapitalize="words" {...texto('nome')} />
      {formulario.naoIdentificada ? <CampoArea rotulo="Como reconhecer" linhas={2} {...texto('descricaoIdentificacao')} /> : null}
      {depoisDoNome}
      <Recolhivel titulo="Mais dados do paciente" aberto={detalhesAbertos || DETALHES.some((campo) => erros[campo])}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          {/* ponytail: sem seletor de data nativo; digita AAAA-MM-DD (o formato que o cadastro grava). */}
          <CampoTexto rotulo="Nascimento" placeholder="AAAA-MM-DD" inputMode="numeric" maxLength={10} style={metade} {...texto('dataNascimento')} />
          <Select
            rotulo="Sexo"
            vazio="Não informado"
            opcoes={[
              { valor: 'F', rotulo: 'Feminino' },
              { valor: 'M', rotulo: 'Masculino' },
              { valor: 'I', rotulo: 'Indeterminado' },
            ]}
            valor={formulario.sexo}
            aoMudar={(valor) => mudar({ sexo: valor as FormularioPessoa['sexo'] })}
            erro={erros.sexo}
            style={metade}
          />
          <CampoTexto rotulo="CPF" inputMode="numeric" autoComplete="off" style={metade} {...texto('cpf')} />
          <CampoTexto rotulo="Cartão SUS (CNS)" inputMode="numeric" autoComplete="off" style={metade} {...texto('cns')} />
        </View>
        <CampoTexto rotulo="Telefone" inputMode="tel" autoComplete="off" {...texto('telefone')} />
        <CampoTexto rotulo="Contato de emergência" autoComplete="off" {...texto('contatoEmergenciaNome')} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <CampoTexto rotulo="Telefone do contato" inputMode="tel" autoComplete="off" style={metade} {...texto('contatoEmergenciaTelefone')} />
          <CampoTexto rotulo="E-mail do contato" inputMode="email" autoComplete="off" autoCapitalize="none" style={metade} {...texto('contatoEmergenciaEmail')} />
        </View>
      </Recolhivel>
    </>
  );
}

export function NovoPaciente() {
  const app = useApp();
  const roteador = useRouter();
  const parametros = useLocalSearchParams<{ nome?: string; naoIdentificado?: string }>();
  const { gravar, gravando, campos } = useGravar();
  const [formulario, setFormulario] = useState<FormularioPessoa>({
    ...FORMULARIO_PESSOA_VAZIO,
    nome: parametros.nome ?? '',
    naoIdentificada: parametros.naoIdentificado !== undefined,
  });
  const [alergias, setAlergias] = useState('');
  const [comorbidades, setComorbidades] = useState('');
  const [medicacoes, setMedicacoes] = useState('');
  const [queixa, setQueixa] = useState('');
  const [local, setLocal] = useState('');
  const mudar = (parte: Partial<FormularioPessoa>) => setFormulario((atual) => ({ ...atual, ...parte }));

  async function salvar(iniciarAtendimento: boolean) {
    let pessoaId = '';
    let atendimentoId = '';
    const ok = await gravar(async () => {
      pessoaId = await app.pessoas.criar({
        ...formulario,
        itens: [...separar(alergias, 'ALERGIA'), ...separar(comorbidades, 'COMORBIDADE'), ...separar(medicacoes, 'MEDICACAO_CONTINUA')],
      });
      if (iniciarAtendimento) atendimentoId = await app.atendimentos.iniciar({ pessoaId, queixaPrincipal: queixa, localDescricao: local });
    });
    if (ok) roteador.replace(atendimentoId ? `/atendimentos/${atendimentoId}` : `/pacientes/${pessoaId}`);
  }

  const temErro = Object.keys(campos).length > 0;
  return (
    <Casca titulo="Novo paciente" voltar={{ para: '/pacientes', rotulo: 'Pacientes' }}>
      <View role="form" style={{ gap: 16 }}>
        <CamposCadastro
          formulario={formulario}
          mudar={mudar}
          erros={campos}
          depoisDoNome={
            <>
              <CampoTexto rotulo="Queixa principal" value={queixa} onChangeText={setQueixa} autoComplete="off" erro={campos.queixaPrincipal} />
              <CampoTexto rotulo="Local da ocorrência" value={local} onChangeText={setLocal} autoComplete="off" erro={campos.localDescricao} />
              <CampoTexto rotulo="Alergias" value={alergias} onChangeText={setAlergias} autoComplete="off" />
            </>
          }
        />
        <Recolhivel titulo="Mais do prontuário" aberto={!!campos.observacoes}>
          <CampoArea rotulo="Comorbidades" value={comorbidades} onChangeText={setComorbidades} linhas={2} />
          <CampoArea rotulo="Medicações contínuas" value={medicacoes} onChangeText={setMedicacoes} linhas={2} />
          <Select
            rotulo="Tipo sanguíneo"
            vazio="Não informado"
            opcoes={TIPOS_SANGUINEOS}
            valor={formulario.tipoSanguineo}
            aoMudar={(valor) => mudar({ tipoSanguineo: valor })}
          />
          <CampoArea rotulo="Observações do prontuário" value={formulario.observacoes} onChangeText={(valor) => mudar({ observacoes: valor })} erro={campos.observacoes} />
        </Recolhivel>

        {temErro ? <Mensagens erro="Nada foi gravado: confira os campos marcados." /> : null}
        <Botao variante="primario" largo carregando={gravando} onPress={() => void salvar(true)}>
          Salvar e iniciar atendimento
        </Botao>
        <Botao variante="fantasma" largo disabled={gravando} onPress={() => void salvar(false)}>
          Só salvar o cadastro
        </Botao>
      </View>
    </Casca>
  );
}

/** Corrige um cadastro que o servidor rejeitou e devolve a operacao para a fila. */
export function CorrigirPaciente() {
  const app = useApp();
  const roteador = useRouter();
  const avisar = useAvisar();
  const { cores } = useTema();
  const { opId = '' } = useLocalSearchParams<{ opId: string }>();
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

  async function salvar() {
    if (!formulario) return;
    if (await gravar(() => app.pessoas.corrigirRejeitada(opId, formulario))) {
      avisar({ tom: 'sucesso', titulo: 'Correção gravada' });
      roteador.replace('/pendencias');
    }
  }

  return (
    <Casca titulo="Corrigir cadastro" subtitulo="Rejeitado pelo servidor" voltar={{ para: '/pendencias', rotulo: 'Pendências' }}>
      {pendencia.erro ? (
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={pendencia.erro.message} aoTentarDeNovo={pendencia.recarregar} />
      ) : pendencia.dados === undefined ? (
        <Esqueleto linhas={5} altura={40} />
      ) : pendencia.dados === null || !formulario ? (
        <EstadoErro titulo="Esta pendência não está mais rejeitada" descricao="Ela pode ter sido enviada, corrigida ou descartada. Volte para a lista de pendências." />
      ) : (
        <View role="form" style={{ gap: 16 }}>
          <View style={{ padding: 12, gap: 4, borderWidth: 1, borderColor: cores.carmim, backgroundColor: cores.carmimSuave, borderRadius: MEDIDA.raio }}>
            <Rotulo>Motivo informado pelo servidor</Rotulo>
            <Texto>{pendencia.dados.comando.ultimoErro}</Texto>
          </View>
          <CamposCadastro
            formulario={formulario}
            mudar={(parte) => setFormulario((atual) => (atual ? { ...atual, ...parte } : atual))}
            erros={campos}
            detalhesAbertos
          />
          {Object.keys(campos).length > 0 ? <Mensagens erro="Nada foi gravado: confira os campos marcados." /> : null}
          <Botao variante="primario" largo carregando={gravando} onPress={() => void salvar()}>
            Salvar correção e reenviar
          </Botao>
        </View>
      )}
    </Casca>
  );
}
