// Tira permanente do app de campo: estado da conexao, pendencias e o seletor "Simular conectividade".
import { CircleAlert, Wifi, WifiOff } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Chave, Icone, Texto } from './base.tsx';
import { MarcaSync } from './etiquetas.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

export interface BarraConectividadeProps {
  /** Estado efetivo: `online` = nao simulado offline E servidor alcancavel. */
  online: boolean;
  /** O seletor "Simular conectividade" esta em offline. */
  simulandoOffline: boolean;
  aoMudarSimulacao: (simularOffline: boolean) => void;
  /** Operacoes no outbox ainda nao confirmadas. */
  pendencias: number;
  /** Operacoes recusadas pelo servidor, aguardando correcao. */
  rejeitadas?: number;
  sincronizando?: boolean;
  /** Hora da ultima sincronizacao, ja formatada (ex.: "21:04"). */
  ultimaSync?: string;
  /** Torna a contagem um botao que abre a tela de pendencias. */
  aoAbrirPendencias?: () => void;
}

/** Offline vira bloco invertido (icone + palavra), entao o estado nao depende de cor. */
export function BarraConectividade({
  online,
  simulandoOffline,
  aoMudarSimulacao,
  pendencias,
  rejeitadas = 0,
  sincronizando,
  ultimaSync,
  aoAbrirPendencias,
}: BarraConectividadeProps) {
  const { cores } = useTema();
  const detalhe = online ? (ultimaSync ? `sync ${ultimaSync}` : 'conectado') : simulandoOffline ? 'simulado' : 'sem rede';
  const textoPendencias = sincronizando
    ? `Enviando ${pendencias}…`
    : pendencias === 0
      ? 'Tudo enviado'
      : `${pendencias} ${pendencias === 1 ? 'pendente' : 'pendentes'}`;
  const corEstado = online ? cores.tinta : cores.sobreInverso;

  const conteudoPendencias = (
    <>
      {sincronizando ? <ActivityIndicator size="small" color={cores.tinta} /> : <MarcaSync estado={pendencias === 0 ? 'confirmado' : 'local'} cor={cores.tinta2} />}
      <View>
        <Texto tamanho="pequeno" forte>
          {textoPendencias}
        </Texto>
        {rejeitadas > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icone icone={CircleAlert} cor={cores.carmim} tamanho={12} />
            <Texto tamanho="rotulo" tom="carmim" forte>
              {rejeitadas} {rejeitadas === 1 ? 'rejeitada' : 'rejeitadas'}
            </Texto>
          </View>
        ) : null}
      </View>
    </>
  );
  const estiloPendencias = { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12 } as const;

  return (
    <View
      role="region"
      aria-label="Conectividade e sincronização"
      style={{ flexDirection: 'row', alignItems: 'stretch', borderTopWidth: 1, borderBottomWidth: 1, borderColor: cores.fio, backgroundColor: cores.papel }}
    >
      <View
        role={'status' as 'alert'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: MEDIDA.recuo, minWidth: 116, backgroundColor: online ? 'transparent' : cores.inverso }}
      >
        <Icone icone={online ? Wifi : WifiOff} cor={corEstado} />
        <View>
          <Texto forte style={{ color: corEstado }}>
            {online ? 'Online' : 'Offline'}
          </Texto>
          <Texto tamanho="rotulo" style={{ color: online ? cores.tinta3 : cores.sobreInverso }}>
            {detalhe}
          </Texto>
        </View>
      </View>

      {aoAbrirPendencias ? (
        <Pressable role="button" aria-label={`${textoPendencias}. Abrir pendências`} onPress={aoAbrirPendencias} style={estiloPendencias}>
          {conteudoPendencias}
        </Pressable>
      ) : (
        <View role={'status' as 'alert'} style={estiloPendencias}>
          {conteudoPendencias}
        </View>
      )}

      <View style={{ justifyContent: 'center', paddingRight: 12 }}>
        <Chave marcado={simulandoOffline} aoMudar={aoMudarSimulacao} aria-label="Simular conectividade: ficar offline">
          {'Simular\noffline'}
        </Chave>
      </View>
    </View>
  );
}
