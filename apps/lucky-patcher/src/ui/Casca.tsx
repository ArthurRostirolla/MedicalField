// Moldura de toda tela: cabecalho e tira de conectividade SEMPRE visivel. As abas ficam fora (BarraAbas), fixas.
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { ArrowLeft, CircleAlert, CloudUpload, House, Settings, Users } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useAvisar, useConectividade, useContagens, useMotor, useSessao } from './contexto.tsx';
import { BarraConectividade, Botao, Entra, Icone, Marca, MEDIDA, MOVIMENTO, movimentoReduzido, NATIVO, Texto, Titulo, Toque, useTema, type LucideIcon } from './ds/index.ts';
import { formatarMomento } from './formato.ts';

/** A tira de conectividade ligada ao Observer e ao seletor "Simular conectividade". */
export function Conectividade({ aoAbrirPendencias }: { aoAbrirPendencias?: () => void }) {
  const app = useApp();
  const avisar = useAvisar();
  const conexao = useConectividade();
  const motor = useMotor();
  const { pendentes, rejeitadas } = useContagens();
  return (
    <BarraConectividade
      online={conexao.online}
      simulandoOffline={conexao.simulandoOffline}
      aoMudarSimulacao={(simular) =>
        void app.simularOffline(simular).catch((erro: unknown) =>
          avisar({ tom: 'erro', titulo: 'Não foi possível trocar o modo', descricao: erro instanceof Error ? erro.message : String(erro) }),
        )
      }
      pendencias={pendentes}
      rejeitadas={rejeitadas}
      sincronizando={motor.sincronizando && pendentes > 0}
      ultimaSync={motor.ultimaSync ? formatarMomento(motor.ultimaSync) : undefined}
      aoAbrirPendencias={aoAbrirPendencias}
    />
  );
}

export type Aba = 'inicio' | 'pacientes' | 'pendencias' | 'ajustes';

/** `rota`: o nome da aba no navegador (app/(raiz)/(app)/_layout.tsx). */
const ABAS: ReadonlyArray<{ id: Aba; rota: string; rotulo: string; icone: LucideIcon }> = [
  { id: 'inicio', rota: 'index', rotulo: 'Início', icone: House },
  { id: 'pacientes', rota: 'pacientes', rotulo: 'Pacientes', icone: Users },
  { id: 'pendencias', rota: 'pendencias', rotulo: 'Pendências', icone: CloudUpload },
  { id: 'ajustes', rota: 'ajustes', rotulo: 'Ajustes', icone: Settings },
];

/** Pilha dentro de uma aba: o detalhe entra por cima com a animacao nativa da plataforma. */
export function PilhaDaAba() {
  const { cores } = useTema();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: cores.mesa } }} />;
}

type Caixa = { pos: number; tamanho: number };

/**
 * Barra de abas fixa (fora das telas: nao pisca ao trocar). Embaixo no celular, trilho lateral em tela larga.
 * A aba ativa segue o web: fio da marca (em cima / a esquerda) que desliza ate a aba nova, texto na cor da marca.
 */
export function BarraAbas({ state, emitter, navigateToTab, lateral }: BottomTabBarProps & { lateral: boolean }) {
  const { cores } = useTema();
  const margens = useSafeAreaInsets();
  const { pendentes } = useContagens();
  const rotaAtual = state.routes[state.index]?.name;
  const indiceAtivo = Math.max(0, ABAS.findIndex((aba) => aba.rota === rotaAtual)); // atendimentos marca Inicio
  const [caixas, setCaixas] = useState<Record<number, Caixa>>({});
  const [posicao] = useState(() => new Animated.Value(0));
  const posicionado = useRef(false);
  const reduzido = useRef(false);

  useEffect(() => {
    void movimentoReduzido().then((r) => (reduzido.current = r));
  }, []);

  const ativa = caixas[indiceAtivo];
  useEffect(() => {
    if (!ativa) return;
    if (!posicionado.current || reduzido.current) {
      posicionado.current = true;
      posicao.setValue(ativa.pos);
      return;
    }
    Animated.timing(posicao, { toValue: ativa.pos, duration: 220, easing: MOVIMENTO, useNativeDriver: NATIVO }).start();
  }, [ativa, posicao]);

  function abrir(rota: string, focada: boolean) {
    const alvo = state.routes.find((r) => r.name === rota);
    if (!alvo) return;
    const evento = emitter.emit({ type: 'tabPress', target: alvo.key, canPreventDefault: true });
    // Tocar na aba ja aberta volta a pilha dela para o topo (tratado pela pilha via tabPress).
    if (!focada && !evento.defaultPrevented) navigateToTab(alvo.key);
  }

  return (
    <View
      role="navigation"
      aria-label="Seções do app"
      style={
        lateral
          ? { width: 232, paddingTop: margens.top, paddingLeft: margens.left, borderRightWidth: 1, borderRightColor: cores.fio, backgroundColor: cores.papel }
          : { flexDirection: 'row', paddingBottom: margens.bottom, borderTopWidth: 1, borderTopColor: cores.fio, backgroundColor: cores.papel }
      }
    >
      {lateral ? (
        <View style={{ paddingHorizontal: MEDIDA.recuo, paddingVertical: 14, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: cores.fio }}>
          <Marca />
        </View>
      ) : null}
      {ABAS.map((aba, indice) => {
        const marcada = indice === indiceAtivo;
        const cor = marcada ? cores.marcaForte : cores.tinta2;
        const contagem = aba.id === 'pendencias' ? pendentes : 0;
        return (
          <Toque
            key={aba.id}
            role="link"
            aria-current={marcada ? 'page' : undefined}
            aria-label={contagem ? `${aba.rotulo}, ${contagem} pendentes` : aba.rotulo}
            onPress={() => abrir(aba.rota, aba.rota === rotaAtual)}
            onLayout={(e) => {
              const { x, y, width, height } = e.nativeEvent.layout;
              const caixa = lateral ? { pos: y, tamanho: height } : { pos: x, tamanho: width };
              setCaixas((atuais) => (atuais[indice]?.pos === caixa.pos && atuais[indice]?.tamanho === caixa.tamanho ? atuais : { ...atuais, [indice]: caixa }));
            }}
            escala={lateral ? 0.98 : 0.94}
            style={({ pressed }) =>
              lateral
                ? { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: MEDIDA.recuo, backgroundColor: pressed ? cores.papel2 : 'transparent' }
                : { flex: 1, minHeight: MEDIDA.alvo + 8, alignItems: 'center', justifyContent: 'center', gap: 4 }
            }
          >
            <View>
              <Icone icone={aba.icone} cor={marcada ? cores.marca : cores.tinta2} tamanho={lateral ? 18 : 22} />
              {contagem && !lateral ? (
                <View style={{ position: 'absolute', top: -6, right: -14, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4, borderWidth: 2, borderColor: cores.papel, backgroundColor: cores.marca, alignItems: 'center', justifyContent: 'center' }}>
                  <Texto tamanho="rotulo" forte style={{ color: cores.sobreMarca, lineHeight: 14, fontSize: 11 }}>
                    {contagem}
                  </Texto>
                </View>
              ) : null}
            </View>
            <Texto tamanho={lateral ? 'corpo' : 'rotulo'} style={{ color: lateral && !marcada ? cores.tinta : cor, fontWeight: marcada ? '700' : '600', flex: lateral ? 1 : undefined }}>
              {aba.rotulo}
            </Texto>
            {contagem && lateral ? (
              <Texto tamanho="rotulo" dado tom="tinta2">
                {contagem}
              </Texto>
            ) : null}
          </Toque>
        );
      })}
      {ativa ? (
        <Animated.View
          aria-hidden
          pointerEvents="none"
          style={
            lateral
              ? { position: 'absolute', left: margens.left, top: 0, width: 2, height: ativa.tamanho, backgroundColor: cores.marca, transform: [{ translateY: posicao }] }
              : { position: 'absolute', top: -1, left: 0, height: 2, width: ativa.tamanho, backgroundColor: cores.marca, transform: [{ translateX: posicao }] }
          }
        />
      ) : null}
    </View>
  );
}

/** Na web o titulo da aba do navegador acompanha a tela. */
// As abas ficam montadas: o titulo troca quando a tela ganha foco, nao so ao montar.
function useTituloDaPagina(nome: string | null) {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') document.title = nome ? `${nome} · MedicalField` : 'MedicalField';
    }, [nome]),
  );
}

export interface CascaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acaoTopo?: ReactNode;
  /** Volta um nivel (telas de detalhe). */
  voltar?: { para: Href; rotulo: string };
  /** Acao da tela, na mesma linha do "voltar" (o cabecalho fica livre para o nome inteiro do paciente). */
  acaoVoltar?: ReactNode;
  children: ReactNode;
}

export function Casca({ titulo, subtitulo, acaoTopo, voltar, acaoVoltar, children }: CascaProps) {
  const roteador = useRouter();
  const sessao = useSessao();
  const { cores } = useTema();
  const margens = useSafeAreaInsets();
  useTituloDaPagina(typeof titulo === 'string' ? titulo : null);

  return (
    <View style={{ flex: 1, backgroundColor: cores.mesa }}>
      <View style={{ paddingTop: margens.top, backgroundColor: cores.papel }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: MEDIDA.recuo, paddingVertical: 10 }}>
          <View style={{ flex: 1 }}>
            {typeof titulo === 'string' ? <Titulo nivel={1}>{titulo}</Titulo> : titulo}
            {subtitulo ? (
              typeof subtitulo === 'string' ? (
                <Texto tamanho="pequeno" tom="tinta2">
                  {subtitulo}
                </Texto>
              ) : (
                subtitulo
              )
            ) : null}
          </View>
          {acaoTopo}
        </View>
        <Conectividade aoAbrirPendencias={() => roteador.navigate('/pendencias')} />
      </View>

      <ScrollView
        role="main"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: MEDIDA.recuo, paddingBottom: MEDIDA.recuo * 2, gap: 16, width: '100%', maxWidth: 960, alignSelf: 'center' }}
      >
        {sessao?.precisaLogin ? (
          <View role="alert" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: cores.carmim, backgroundColor: cores.carmimSuave, borderRadius: MEDIDA.raio }}>
            <Icone icone={CircleAlert} cor={cores.carmim} />
            <Texto style={{ flex: 1, minWidth: 200 }}>
              <Texto forte>Sessão expirada.</Texto> Você continua registrando normalmente; para enviar, entre de novo. Nada do que está no
              aparelho foi perdido.
            </Texto>
            <Botao onPress={() => roteador.navigate('/entrar')}>Entrar de novo</Botao>
          </View>
        ) : null}
        {voltar ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Botao variante="fantasma" icone={ArrowLeft} onPress={() => (roteador.canGoBack() ? roteador.back() : roteador.replace(voltar.para))} role="link">
              {voltar.rotulo}
            </Botao>
            {acaoVoltar}
          </View>
        ) : null}
        {voltar && Platform.OS === 'web' ? <Entra style={{ gap: 16 }}>{children}</Entra> : children}
      </ScrollView>
    </View>
  );
}

/** Moldura das telas sem abas (entrada, bloqueios): mesma faixa, mesma tira de conectividade. */
export function CascaSimples({ conectividade, children }: { conectividade?: ReactNode; children: ReactNode }) {
  const { cores } = useTema();
  const margens = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: cores.mesa }}>
      <View style={{ paddingTop: margens.top, backgroundColor: cores.papel }}>
        <View style={{ paddingHorizontal: MEDIDA.recuo, paddingVertical: 12 }}>
          <Marca />
        </View>
        {conectividade}
      </View>
      <ScrollView
        role="main"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: MEDIDA.recuo, paddingBottom: margens.bottom + MEDIDA.recuo, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' }}
      >
        {children}
      </ScrollView>
    </View>
  );
}
