import { loginEntradaSchema, type TipoRegistro } from '@medicalfield/contratos';
import { useRouter } from 'expo-router';
import { Ambulance, ArrowLeft, HeartPulse, LogIn, Stethoscope } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FalhaTransporte } from '../sync/http.ts';
import { ErroLogin } from '../sync/sessao.ts';
import { Abertura, Entra, medirDentro } from '../ui/Abertura.tsx';
import { Conectividade } from '../ui/Casca.tsx';
import { useApp, useConectividade, useContagens, useSessao } from '../ui/contexto.tsx';
import {
  Botao,
  CampoTexto,
  Icone,
  Marca,
  MEDIDA,
  Mensagens,
  SeletorCartoes,
  Texto,
  Titulo,
  useTema,
  type OpcaoCartao,
} from '../ui/ds/index.ts';

// O título do cartão é a sigla do registro: é o nome do rádio (testes e leitor de tela).
const PERFIS: ReadonlyArray<OpcaoCartao<TipoRegistro>> = [
  { valor: 'CRM', titulo: 'CRM', detalhe: 'Medicina', icone: Stethoscope },
  { valor: 'COREN', titulo: 'COREN', detalhe: 'Enfermagem', icone: HeartPulse },
  { valor: 'SOCORRISTA', titulo: 'Socorrista', detalhe: 'Identificação própria', icone: Ambulance },
];

const ROTULO_REGISTRO: Record<TipoRegistro, string> = { CRM: 'Número do CRM', COREN: 'Número do COREN', SOCORRISTA: 'Identificação' };

const TAMANHO_FRASE = 42;

/** A frase do portal, com "pré-hospitalar" no vermelho da marca. */
function Frase() {
  const { cores } = useTema();
  const estilo = { fontSize: TAMANHO_FRASE, fontWeight: '700' as const };
  return (
    <Texto role="heading" {...({ 'aria-level': 1 } as object)} style={[estilo, { lineHeight: TAMANHO_FRASE * 1.06, letterSpacing: -0.84, maxWidth: 380 }]}>
      A caixa-preta do atendimento <Texto style={[estilo, { color: cores.marca }]}>pré-hospitalar</Texto>.
    </Texto>
  );
}

/**
 * Duas telas: (1) a frase e "quem esta entrando", (2) a credencial do perfil escolhido.
 * No primeiro acesso, a abertura anima a marca antes da tela 1. Sessao expirada vai direto a tela 2.
 */
export function Entrar() {
  const app = useApp();
  const { cores } = useTema();
  const margens = useSafeAreaInsets();
  const roteador = useRouter();
  const sessao = useSessao();
  const conexao = useConectividade();
  const { pendentes } = useContagens();
  const anterior = sessao?.precisaLogin ? sessao.profissional : null;

  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>((anterior?.tipoRegistro as TipoRegistro) ?? 'COREN');
  const [registro, setRegistro] = useState(anterior?.registro ?? '');
  const [uf, setUf] = useState(anterior?.uf ?? 'RS');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [entrando, setEntrando] = useState(false);
  const [etapa, setEtapa] = useState<'perfil' | 'credencial'>(anterior ? 'credencial' : 'perfil');
  const [abrindo, setAbrindo] = useState(!anterior);
  const raiz = useRef<ComponentRef<typeof View>>(null);
  const alvoMarca = useRef<ComponentRef<typeof View>>(null);
  const perfil = PERFIS.find((opcao) => opcao.valor === tipoRegistro) ?? PERFIS[0]!;

  async function entrar() {
    setErro(null);
    const entrada = loginEntradaSchema.safeParse({
      tipoRegistro,
      registro,
      senha,
      ...(tipoRegistro !== 'SOCORRISTA' && uf.trim() ? { uf: uf.trim().toUpperCase() } : {}),
    });
    if (!entrada.success) {
      setCampos(Object.fromEntries(entrada.error.issues.map((problema) => [String(problema.path[0]), 'Preencha este campo.'])));
      return;
    }
    setCampos({});
    setEntrando(true);
    try {
      await app.sessao.entrar(entrada.data);
      await app.registrarLog('LOGIN');
      void app.motor.sincronizar('abertura');
      roteador.replace('/');
    } catch (falha) {
      if (falha instanceof ErroLogin) {
        setErro(falha.status === 429 ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' : 'Registro ou senha não conferem.');
      } else if (falha instanceof FalhaTransporte) {
        setErro(
          falha.motivo === 'OFFLINE_SIMULADO'
            ? '“Simular offline” está ligado (detalhe da linha de conexão, no alto). Desligue-o para entrar: o primeiro acesso precisa de conexão.'
            : falha.motivo === 'SEM_SERVIDOR'
              ? 'Este app está sem servidor configurado. Fale com a equipe de implantação.'
              : 'Sem conexão com o servidor. O primeiro acesso neste aparelho precisa de rede.',
        );
      } else {
        setErro(falha instanceof Error ? falha.message : 'Não foi possível entrar.');
      }
      void app.registrarLog('LOGIN', 'FALHA');
    } finally {
      setEntrando(false);
    }
  }

  const aoEnviar = () => void entrar();

  const conteudo = { width: '100%', maxWidth: 480, alignSelf: 'center' } as const;

  return (
    <View ref={raiz} style={{ flex: 1, backgroundColor: cores.papel, paddingTop: margens.top }}>
      {/* Invisivel durante a abertura, mas ocupando o lugar: a Marca nao pula quando ela aparece. */}
      <View style={{ opacity: abrindo ? 0 : 1 }}>
        <Conectividade />
      </View>

      {etapa === 'perfil' ? (
        <ScrollView contentContainerStyle={[conteudo, { flexGrow: 1, padding: MEDIDA.recuo * 1.25, paddingBottom: margens.bottom + 24, gap: 24 }]}>
          <View ref={alvoMarca} style={{ alignSelf: 'flex-start', opacity: abrindo ? 0 : 1 }}>
            <Marca />
          </View>
          {abrindo ? null : (
            <>
              {/* A frase ocupa o meio; a escolha fica embaixo, no alcance do polegar. */}
              <Entra style={{ flex: 1, justifyContent: 'center', minHeight: 160 }}>
                <Frase />
              </Entra>
              <Entra atraso={80}>
                <SeletorCartoes
                  empilhado
                  rotulo="Quem está entrando?"
                  valor={tipoRegistro}
                  opcoes={PERFIS}
                  aoMudar={(valor) => {
                    setTipoRegistro(valor);
                    setCampos({});
                    setErro(null);
                    setEtapa('credencial');
                  }}
                />
              </Entra>
            </>
          )}
        </ScrollView>
      ) : (
        <Entra key="credencial" style={{ flex: 1 }}>
          <View style={{ borderBottomWidth: 1, borderBottomColor: cores.fio, paddingHorizontal: 4 }}>
            <View style={[conteudo, { flexDirection: 'row' }]}>
              <Botao variante="fantasma" icone={ArrowLeft} onPress={() => setEtapa('perfil')}>
                Trocar perfil
              </Botao>
            </View>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[conteudo, { padding: MEDIDA.recuo * 1.25, paddingBottom: margens.bottom + 24 }]}>
            <View role="form" style={{ gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View
                  style={{
                    width: MEDIDA.alvo,
                    height: MEDIDA.alvo,
                    borderRadius: MEDIDA.raioSobreposicao,
                    backgroundColor: cores.marcaSuave,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icone icone={perfil.icone} cor={cores.marca} tamanho={28} />
                </View>
                <View style={{ flex: 1 }}>
                  <Texto tamanho="pequeno" tom="tinta2">
                    {perfil.detalhe}
                  </Texto>
                  <Titulo nivel={1}>{anterior ? `Entre de novo, ${anterior.nome}` : `Entrar com ${perfil.titulo}`}</Titulo>
                </View>
              </View>
              {anterior ? (
                <Texto tom="tinta2">
                  Sua sessão expirou.{' '}
                  {pendentes > 0
                    ? `${pendentes} ${pendentes === 1 ? 'registro guardado' : 'registros guardados'} neste aparelho ${pendentes === 1 ? 'sobe' : 'sobem'} assim que você entrar.`
                    : 'Nada foi perdido.'}
                </Texto>
              ) : (
                <Texto tom="tinta2">O primeiro acesso neste aparelho precisa de conexão. Depois, o app abre e registra sem rede.</Texto>
              )}
              <View style={{ flexDirection: 'row', gap: 16 }}>
                <CampoTexto
                  rotulo={ROTULO_REGISTRO[tipoRegistro]}
                  value={registro}
                  onChangeText={setRegistro}
                  inputMode="numeric"
                  autoComplete="username"
                  erro={campos.registro}
                  style={{ flex: 2 }}
                />
                {tipoRegistro !== 'SOCORRISTA' ? (
                  <CampoTexto rotulo="UF" value={uf} onChangeText={setUf} maxLength={2} autoCapitalize="characters" autoComplete="off" style={{ flex: 1 }} />
                ) : null}
              </View>
              <CampoTexto
                rotulo="Senha"
                secureTextEntry
                value={senha}
                onChangeText={setSenha}
                autoComplete="current-password"
                erro={campos.senha}
                onSubmitEditing={aoEnviar}
              />

              {erro ? <Mensagens erro={erro} /> : null}
              {!conexao.online && !erro ? (
                <Texto tom="tinta2" role={'status' as 'alert'}>
                  {conexao.simulandoOffline ? 'Modo offline simulado ligado: entrar exige desligá-lo.' : 'Procurando o servidor…'}
                </Texto>
              ) : null}

              <Botao variante="primario" largo carregando={entrando} icone={LogIn} onPress={aoEnviar}>
                Entrar
              </Botao>
              {anterior ? (
                <Botao variante="fantasma" role="link" onPress={() => roteador.replace('/')}>
                  Continuar registrando sem enviar
                </Botao>
              ) : null}
            </View>
          </ScrollView>
        </Entra>
      )}

      {abrindo ? <Abertura medirAlvo={() => medirDentro(raiz.current, alvoMarca.current)} aoTerminar={() => setAbrindo(false)} /> : null}
    </View>
  );
}
