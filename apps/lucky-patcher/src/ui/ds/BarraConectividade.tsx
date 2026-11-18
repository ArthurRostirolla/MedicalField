// Linha discreta do app de campo: estado da conexao e pendencias numa linha so; um toque abre o detalhe
// (ver pendencias e o seletor "Simular conectividade").
import { ChevronDown, ChevronUp, CircleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Botao, Chave, Icone, Texto } from './base.tsx';
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
  /** Mostra, no detalhe, o botao que abre a tela de pendencias. */
  aoAbrirPendencias?: () => void;
}

/** Online fica quase invisivel; offline ganha a palavra em tinta forte (o estado nao depende so da cor do ponto). */
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
  const [aberta, setAberta] = useState(false);
  const detalhe = online ? (ultimaSync ? `sync ${ultimaSync}` : 'conectado') : simulandoOffline ? 'simulado' : 'sem rede';
  const textoPendencias = sincronizando
    ? `Enviando ${pendencias}…`
    : pendencias === 0
      ? 'Tudo enviado'
      : `${pendencias} ${pendencias === 1 ? 'pendente' : 'pendentes'}`;
  const tom = online ? cores.tinta3 : cores.tinta;

  return (
    <View role="region" aria-label="Conectividade e sincronização" style={{ borderBottomWidth: 1, borderColor: cores.fio, backgroundColor: cores.papel }}>
      {/* A linha toda abre o detalhe (atalho para o dedo); o botao acessivel e o chevron no fim. */}
      <Pressable
        accessible={false}
        onPress={() => setAberta(!aberta)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          minHeight: 32,
          paddingHorizontal: MEDIDA.recuo,
          backgroundColor: pressed ? cores.papel2 : 'transparent',
        })}
      >
        <View aria-hidden style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: online ? cores.fioForte : cores.marca }} />
        <View role={'status' as 'alert'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
          <Texto tamanho="rotulo" forte={!online} style={{ color: tom }}>
            {online ? 'Online' : 'Offline'}
          </Texto>
          <Texto tamanho="rotulo" style={{ color: cores.tinta3 }}>
            · {detalhe}
          </Texto>
        </View>
        <View style={{ flex: 1 }} />
        <View role={'status' as 'alert'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {sincronizando ? <ActivityIndicator size="small" color={cores.tinta3} /> : null}
          {rejeitadas > 0 ? <Icone icone={CircleAlert} cor={cores.carmim} tamanho={12} /> : null}
          <Texto tamanho="rotulo" style={{ color: rejeitadas > 0 ? cores.carmim : pendencias > 0 ? cores.tinta : cores.tinta3 }}>
            {rejeitadas > 0 ? `${rejeitadas} ${rejeitadas === 1 ? 'rejeitada' : 'rejeitadas'} · ` : ''}
            {textoPendencias}
          </Texto>
        </View>
        <Pressable
          role="button"
          aria-label="Detalhes da conexão"
          aria-expanded={aberta}
          onPress={() => setAberta(!aberta)}
          hitSlop={8}
          style={{ marginRight: -6, padding: 6 }}
        >
          <Icone icone={aberta ? ChevronUp : ChevronDown} cor={cores.tinta3} tamanho={14} />
        </Pressable>
      </Pressable>

      {aberta ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: MEDIDA.recuo, paddingBottom: 4 }}>
          {aoAbrirPendencias ? (
            <Botao variante="fantasma" onPress={aoAbrirPendencias} aria-label={`${textoPendencias}. Abrir pendências`} style={{ paddingHorizontal: 0 }}>
              <Texto tamanho="pequeno" forte>
                Ver pendências
              </Texto>
            </Botao>
          ) : (
            <View />
          )}
          <Chave marcado={simulandoOffline} aoMudar={aoMudarSimulacao} aria-label="Simular conectividade: ficar offline">
            <Texto tamanho="pequeno" tom="tinta2">
              Simular offline
            </Texto>
          </Chave>
        </View>
      ) : null}
    </View>
  );
}
