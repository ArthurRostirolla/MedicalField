import { loginEntradaSchema, type TipoRegistro } from '@medicalfield/contratos';
import { useRouter } from 'expo-router';
import { Ambulance, HeartPulse, LogIn, Stethoscope } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import { FalhaTransporte } from '../sync/http.ts';
import { ErroLogin } from '../sync/sessao.ts';
import { CascaSimples, Conectividade } from '../ui/Casca.tsx';
import { useApp, useConectividade, useContagens, useSessao } from '../ui/contexto.tsx';
import { Botao, CampoTexto, Mensagens, SeletorCartoes, Texto, Titulo, type OpcaoCartao } from '../ui/ds/index.ts';
import { Recolhivel } from './NovoPaciente.tsx';

// O título do cartão é a sigla do registro: é o nome do rádio (testes e leitor de tela).
const PERFIS: ReadonlyArray<OpcaoCartao<TipoRegistro>> = [
  { valor: 'CRM', titulo: 'CRM', detalhe: 'Medicina', icone: Stethoscope },
  { valor: 'COREN', titulo: 'COREN', detalhe: 'Enfermagem', icone: HeartPulse },
  { valor: 'SOCORRISTA', titulo: 'Socorrista', detalhe: 'Identificação própria', icone: Ambulance },
];

const ROTULO_REGISTRO: Record<TipoRegistro, string> = { CRM: 'Número do CRM', COREN: 'Número do COREN', SOCORRISTA: 'Identificação' };

export function Entrar() {
  const app = useApp();
  const roteador = useRouter();
  const sessao = useSessao();
  const conexao = useConectividade();
  const { pendentes } = useContagens();
  const anterior = sessao?.precisaLogin ? sessao.profissional : null;

  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>((anterior?.tipoRegistro as TipoRegistro) ?? 'COREN');
  const [registro, setRegistro] = useState(anterior?.registro ?? '');
  const [uf, setUf] = useState(anterior?.uf ?? 'RS');
  const [senha, setSenha] = useState('');
  // EXPO_PUBLIC_SERVIDOR (scripts/tunel.mjs) ja deixa o endereco preenchido no primeiro acesso.
  const [servidor, setServidor] = useState(app.enderecoServidor() ?? process.env.EXPO_PUBLIC_SERVIDOR ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [entrando, setEntrando] = useState(false);

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
      if (app.exigeEnderecoServidor || servidor !== (app.enderecoServidor() ?? '')) await app.definirEnderecoServidor(servidor);
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
            ? 'O seletor está em “Simular offline”. Desligue-o para entrar: o primeiro acesso precisa de conexão.'
            : falha.motivo === 'SEM_SERVIDOR'
              ? 'Informe o endereço do servidor.'
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

  return (
    <CascaSimples conectividade={<Conectividade />}>
      <View role="form" style={{ gap: 16 }}>
        {anterior ? null : (
          <Texto tamanho="pequeno" tom="tinta2">
            A caixa-preta do atendimento <Texto tamanho="pequeno" tom="tinta2" style={{ fontStyle: 'italic' }}>pré-hospitalar</Texto>.
          </Texto>
        )}
        <Titulo nivel={1}>{anterior ? `Entre de novo, ${anterior.nome}` : 'Entrar'}</Titulo>
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

        <SeletorCartoes rotulo="Quem está entrando?" valor={tipoRegistro} aoMudar={setTipoRegistro} opcoes={PERFIS} />
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

        {app.exigeEnderecoServidor ? (
          <CampoTexto
            rotulo="Endereço do servidor"
            value={servidor}
            onChangeText={setServidor}
            placeholder="https://medicalfield.exemplo.org"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="url"
            ajuda="O endereço que a equipe de implantação informou."
          />
        ) : (
          <Recolhivel titulo="Endereço do servidor">
            <CampoTexto
              rotulo="Endereço do servidor"
              value={servidor}
              onChangeText={setServidor}
              placeholder="O mesmo endereço deste app"
              inputMode="url"
              autoCapitalize="none"
              ajuda="Deixe em branco para usar o mesmo endereço de onde o app foi aberto."
            />
          </Recolhivel>
        )}

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
    </CascaSimples>
  );
}
