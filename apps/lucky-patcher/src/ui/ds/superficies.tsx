// Superficies: marca, secao, dialogo, toasts, estados vazio/erro, esqueleto e faixa demonstrativa.
import { CircleAlert, CircleCheck, Inbox, Info, RotateCw, X } from 'lucide-react-native';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import { Botao, Icone, Rotulo, Texto, Titulo, type LucideIcon } from './base.tsx';
import { useEstilos, useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

/* ───────── Marca ───────── */

/** Cruz sobre o quadrado vermelho + nome. */
export function Marca() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <MarcaSimbolo />
      <MarcaNome />
    </View>
  );
}

/** So o quadrado com a cruz (a abertura anima as duas pecas da marca separadas). */
export function MarcaSimbolo() {
  const { cores } = useTema();
  return (
    <Svg viewBox="0 0 24 24" width={24} height={24} aria-hidden>
      <Rect x={1.5} y={1.5} width={21} height={21} rx={5} fill={cores.marca} />
      <Path d="M9.75 5.5h4.5v4.25h4.25v4.5h-4.25v4.25h-4.5v-4.25H5.5v-4.5h4.25z" fill={cores.sobreMarca} />
    </Svg>
  );
}

export function MarcaNome() {
  return (
    <Texto forte style={{ fontSize: 18, fontWeight: '800' }}>
      MedicalField
    </Texto>
  );
}

/* ───────── Secao (folha) ───────── */

export interface SecaoProps {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  /** Sem recuo interno: para lista que vai ate a borda. */
  rente?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/** Folha com cabecalho de fio grosso. Nao aninhe uma secao em outra. */
export function Secao({ titulo, descricao, acoes, rente, children, style }: SecaoProps) {
  const s = useEstilos((c) => ({
    secao: { backgroundColor: c.papel, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raio },
    topo: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: MEDIDA.recuo, borderBottomWidth: 2, borderBottomColor: c.tinta },
  }));
  return (
    <View role="region" aria-label={typeof titulo === 'string' ? titulo : undefined} style={[s.secao, style]}>
      <View style={s.topo}>
        <View style={{ flexShrink: 1 }}>
          {typeof titulo === 'string' ? <Titulo nivel={2}>{titulo}</Titulo> : titulo}
          {descricao ? (
            <Texto tamanho="pequeno" tom="tinta2">
              {descricao}
            </Texto>
          ) : null}
        </View>
        {acoes ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{acoes}</View> : null}
      </View>
      <View style={rente ? undefined : { padding: MEDIDA.recuo, gap: 12 }}>{children}</View>
    </View>
  );
}

/* ───────── Dialogo ───────── */

export interface DialogoProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  /** Botoes do rodape; a acao principal vem por ultimo. */
  acoes?: ReactNode;
}

/** Modal: so quando a tarefa pede interrupcao (confirmar algo irreversivel, falha de gravacao). */
export function Dialogo({ aberto, aoFechar, titulo, children, acoes }: DialogoProps) {
  const { cores } = useTema();
  return (
    <Modal visible={aberto} transparent animationType="fade" onRequestClose={aoFechar}>
      <View style={{ flex: 1, justifyContent: 'center', padding: MEDIDA.recuo, backgroundColor: cores.veu }}>
        <Pressable style={{ position: 'absolute', inset: 0 } as ViewStyle} onPress={aoFechar} aria-hidden />
        <View
          role="dialog"
          aria-modal
          aria-label={titulo}
          style={{ maxHeight: '90%', width: '100%', maxWidth: 560, alignSelf: 'center', backgroundColor: cores.papel, borderRadius: MEDIDA.raioSobreposicao, borderWidth: 1, borderColor: cores.fio }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: MEDIDA.recuo, paddingRight: 4, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: cores.fio }}>
            <Titulo nivel={2} style={{ flex: 1 }}>
              {titulo}
            </Titulo>
            <Botao variante="fantasma" somenteIcone aria-label="Fechar" icone={X} onPress={aoFechar} />
          </View>
          <ScrollView contentContainerStyle={{ padding: MEDIDA.recuo, gap: 12 }}>
            {typeof children === 'string' ? <Texto>{children}</Texto> : children}
          </ScrollView>
          {acoes ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, padding: MEDIDA.recuo, borderTopWidth: 1, borderTopColor: cores.fio }}>
              {acoes}
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

/* ───────── Toast ───────── */

export type TomToast = 'info' | 'sucesso' | 'erro';

const ICONE_TOAST: Record<TomToast, LucideIcon> = { info: Info, sucesso: CircleCheck, erro: CircleAlert };

export interface ToastProps {
  tom?: TomToast;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Acao curta (ex.: "Desfazer", "Tentar de novo"). */
  acao?: { rotulo: string; aoClicar: () => void };
  aoFechar?: () => void;
}

/** Aviso passageiro em bloco invertido. O tom vem do icone e do texto, nao so da cor. */
export function Toast({ tom = 'info', titulo, descricao, acao, aoFechar }: ToastProps) {
  const { cores } = useTema();
  return (
    <View
      role={tom === 'erro' ? 'alert' : ('status' as 'alert')}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: MEDIDA.recuo, paddingRight: 4, paddingVertical: 8, borderRadius: MEDIDA.raioSobreposicao, backgroundColor: cores.inverso }}
    >
      <Icone icone={ICONE_TOAST[tom]} cor={cores.sobreInverso} />
      <View style={{ flex: 1 }}>
        <Texto tom="sobreInverso" forte>
          {titulo}
        </Texto>
        {descricao ? (
          <Texto tom="sobreInverso" tamanho="pequeno">
            {descricao}
          </Texto>
        ) : null}
      </View>
      {acao ? <Botao onPress={acao.aoClicar}>{acao.rotulo}</Botao> : null}
      {aoFechar ? (
        <Pressable role="button" aria-label="Dispensar aviso" onPress={aoFechar} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icone icone={X} cor={cores.sobreInverso} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface ToastNaPilha extends ToastProps {
  id: string;
}

/** Pilha de toasts: `const { toasts, avisar, dispensar } = useToasts()` + `<PilhaToasts />`. */
export function useToasts(duracaoMs = 6000) {
  const [toasts, setToasts] = useState<ToastNaPilha[]>([]);
  const proximo = useRef(0);
  const dispensar = useCallback((id: string) => setToasts((lista) => lista.filter((toast) => toast.id !== id)), []);
  const avisar = useCallback(
    (toast: ToastProps) => {
      const id = String(++proximo.current);
      setToasts((lista) => [...lista, { ...toast, id }]);
      // Erro fica ate ser dispensado: o profissional precisa ver.
      if (toast.tom !== 'erro') setTimeout(() => dispensar(id), duracaoMs);
      return id;
    },
    [dispensar, duracaoMs],
  );
  return { toasts, avisar, dispensar };
}

export function PilhaToasts({ toasts, aoDispensar }: { toasts: ToastNaPilha[]; aoDispensar: (id: string) => void }) {
  const margens = useSafeAreaInsets();
  if (toasts.length === 0) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: margens.bottom + 88, paddingHorizontal: MEDIDA.recuo, gap: 8, alignItems: 'center' }}
    >
      {toasts.map(({ id, ...toast }) => (
        <View key={id} style={{ width: '100%', maxWidth: 560 }}>
          <Toast {...toast} aoFechar={() => aoDispensar(id)} />
        </View>
      ))}
    </View>
  );
}

/* ───────── Estado vazio e de erro ───────── */

export interface EstadoVazioProps {
  titulo: string;
  /** Diga o que aparece aqui e como fazer aparecer. */
  descricao?: ReactNode;
  icone?: LucideIcon;
  acao?: ReactNode;
}

export function EstadoVazio({ titulo, descricao, icone = Inbox, acao }: EstadoVazioProps) {
  const { cores } = useTema();
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: MEDIDA.recuo }}>
      <Icone icone={icone} cor={cores.tinta3} tamanho={32} />
      <Texto forte style={{ textAlign: 'center' }}>
        {titulo}
      </Texto>
      {descricao ? (
        <Texto tom="tinta2" tamanho="pequeno" style={{ textAlign: 'center' }}>
          {descricao}
        </Texto>
      ) : null}
      {acao ? <View style={{ marginTop: 8 }}>{acao}</View> : null}
    </View>
  );
}

export interface EstadoErroProps {
  /** O que falhou, em palavras do usuario. */
  titulo: string;
  /** O que fazer agora. */
  descricao?: ReactNode;
  aoTentarDeNovo?: () => void;
  /** `requestId` devolvido pela API, para o suporte localizar no log. */
  requestId?: string;
}

export function EstadoErro({ titulo, descricao, aoTentarDeNovo, requestId }: EstadoErroProps) {
  const { cores } = useTema();
  return (
    <View role="alert" style={{ alignItems: 'center', gap: 8, paddingVertical: 32, paddingHorizontal: MEDIDA.recuo }}>
      <Icone icone={CircleAlert} cor={cores.carmim} tamanho={32} />
      <Texto forte style={{ textAlign: 'center' }}>
        {titulo}
      </Texto>
      {descricao ? (
        <Texto tom="tinta2" tamanho="pequeno" style={{ textAlign: 'center' }}>
          {descricao}
        </Texto>
      ) : null}
      {aoTentarDeNovo ? (
        <Botao icone={RotateCw} onPress={aoTentarDeNovo}>
          Tentar de novo
        </Botao>
      ) : null}
      {requestId ? (
        <Texto tamanho="rotulo" tom="tinta3" dado>
          Protocolo {requestId}
        </Texto>
      ) : null}
    </View>
  );
}

/* ───────── Esqueleto ───────── */

export interface EsqueletoProps {
  /** Quantas linhas de texto simular. */
  linhas?: number;
  /** Largura da linha (a ultima sai mais curta quando ha varias). */
  largura?: DimensionValue;
  altura?: number;
}

/** Marca o lugar do conteudo enquanto carrega. */
export function Esqueleto({ linhas = 1, largura = '100%', altura = 16 }: EsqueletoProps) {
  const { cores } = useTema();
  return (
    <View style={{ gap: 8 }} aria-hidden>
      {Array.from({ length: linhas }, (_, indice) => (
        <View
          key={indice}
          style={{ width: linhas > 1 && indice === linhas - 1 ? '60%' : largura, height: altura, borderRadius: MEDIDA.raio, backgroundColor: cores.hachura }}
        />
      ))}
    </View>
  );
}

