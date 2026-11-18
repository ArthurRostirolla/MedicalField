import type { TipoItem } from '@medicalfield/contratos';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { FORMULARIO_PESSOA_VAZIO, type FormularioPessoa } from '../dados/pessoas.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConsulta, useGravar } from '../ui/contexto.tsx';
import { Botao, CampoArea, CampoTexto, EstadoErro, Esqueleto, Icone, MEDIDA, Mensagens, Rotulo, Select, SeletorSegmentado, Texto, useTema } from '../ui/ds/index.ts';
import { Cabecalho } from './Inicio.tsx';

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
  return (
    <View>
      <Pressable
        role="button"
        aria-expanded={visivel}
        onPress={() => setMostrar(!visivel)}
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: MEDIDA.alvo, borderBottomWidth: 1, borderBottomColor: cores.fio }}
      >
        <Texto forte>{titulo}</Texto>
        <Icone icone={visivel ? ChevronUp : ChevronDown} cor={cores.tinta2} />
      </Pressable>
      {visivel ? <View style={{ gap: 16, paddingTop: 12 }}>{children}</View> : null}
    </View>
  );
}

interface CamposProps {
  formulario: FormularioPessoa;
  mudar: (parte: Partial<FormularioPessoa>) => void;
  erros: Record<string, string>;
}

/** Os campos cadastrais (usados na criacao e na correcao de um cadastro rejeitado). */
function CamposCadastro({ formulario, mudar, erros }: CamposProps) {
  const texto = (campo: keyof FormularioPessoa) => ({
    value: formulario[campo] as string,
    onChangeText: (valor: string) => mudar({ [campo]: valor }),
    erro: erros[campo],
  });
  const metade = { flexGrow: 1, flexBasis: 160 };
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
        <CampoArea rotulo="Como reconhecer" ajuda="Sexo aparente, idade aparente, roupa, sinais particulares, onde foi encontrado." {...texto('descricaoIdentificacao')} />
      ) : null}
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
        <CampoTexto rotulo="CPF" inputMode="numeric" autoComplete="off" placeholder="11 dígitos" style={metade} {...texto('cpf')} />
        <CampoTexto rotulo="Cartão SUS (CNS)" inputMode="numeric" autoComplete="off" placeholder="15 dígitos" style={metade} {...texto('cns')} />
      </View>
      <CampoTexto rotulo="Telefone" inputMode="tel" autoComplete="off" {...texto('telefone')} />
      <Recolhivel titulo="Contato de emergência" aberto={Boolean(erros.contatoEmergenciaNome || erros.contatoEmergenciaTelefone || erros.contatoEmergenciaEmail)}>
        <CampoTexto rotulo="Nome do contato" autoComplete="off" {...texto('contatoEmergenciaNome')} />
        <CampoTexto rotulo="Telefone do contato" inputMode="tel" autoComplete="off" {...texto('contatoEmergenciaTelefone')} />
        <CampoTexto
          rotulo="E-mail do contato"
          inputMode="email"
          autoComplete="off"
          autoCapitalize="none"
          ajuda="Para onde a ficha em PDF pode ser enviada depois."
          {...texto('contatoEmergenciaEmail')}
        />
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
    <Casca titulo="Novo paciente" subtitulo="Grava neste aparelho; sobe quando houver rede" atual="pacientes" voltar={{ para: '/pacientes', rotulo: 'Pacientes' }}>
      <View role="form" style={{ gap: 16 }}>
        <CamposCadastro formulario={formulario} mudar={mudar} erros={campos} />

        <CampoArea rotulo="Alergias" ajuda="Separe por vírgula. Ex.: dipirona, látex." value={alergias} onChangeText={setAlergias} linhas={2} />
        <Recolhivel titulo="Mais do prontuário" aberto={!!campos.observacoes}>
          <CampoArea rotulo="Comorbidades" ajuda="Separe por vírgula." value={comorbidades} onChangeText={setComorbidades} linhas={2} />
          <CampoArea rotulo="Medicações contínuas" ajuda="Separe por vírgula." value={medicacoes} onChangeText={setMedicacoes} linhas={2} />
          <Select
            rotulo="Tipo sanguíneo"
            vazio="Não informado"
            opcoes={TIPOS_SANGUINEOS}
            valor={formulario.tipoSanguineo}
            aoMudar={(valor) => mudar({ tipoSanguineo: valor })}
          />
          <CampoArea rotulo="Observações do prontuário" value={formulario.observacoes} onChangeText={(valor) => mudar({ observacoes: valor })} erro={campos.observacoes} />
        </Recolhivel>

        <Cabecalho titulo="Atendimento" />
        <CampoTexto rotulo="Queixa principal" value={queixa} onChangeText={setQueixa} autoComplete="off" erro={campos.queixaPrincipal} />
        <CampoTexto rotulo="Local da ocorrência" value={local} onChangeText={setLocal} autoComplete="off" erro={campos.localDescricao} />

        {temErro ? <Mensagens erro="Nada foi gravado: confira os campos marcados." /> : null}
        <Botao variante="primario" largo carregando={gravando} onPress={() => void salvar(true)}>
          Salvar e iniciar atendimento
        </Botao>
        <Botao largo disabled={gravando} onPress={() => void salvar(false)}>
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
      avisar({ tom: 'sucesso', titulo: 'Correção gravada', descricao: 'O cadastro voltou para a fila de envio.' });
      roteador.replace('/pendencias');
    }
  }

  return (
    <Casca titulo="Corrigir cadastro" subtitulo="Rejeitado pelo servidor" atual="pendencias" voltar={{ para: '/pendencias', rotulo: 'Pendências' }}>
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
          <CamposCadastro formulario={formulario} mudar={(parte) => setFormulario((atual) => (atual ? { ...atual, ...parte } : atual))} erros={campos} />
          {Object.keys(campos).length > 0 ? <Mensagens erro="Nada foi gravado: confira os campos marcados." /> : null}
          <Botao variante="primario" largo carregando={gravando} onPress={() => void salvar()}>
            Salvar correção e reenviar
          </Botao>
        </View>
      )}
    </Casca>
  );
}
