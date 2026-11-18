// Moldura de toda tela: faixa demonstrativa, cabecalho, tira de conectividade SEMPRE visivel e abas.
import { useRouter, type Href } from 'expo-router';
import { ArrowLeft, CircleAlert, CloudUpload, House, Settings, Users } from 'lucide-react-native';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp, useAvisar, useConectividade, useContagens, useMotor, useSessao } from './contexto.tsx';
import { BarraConectividade, Botao, Icone, Marca, MEDIDA, Texto, Titulo, useTema, type LucideIcon } from './ds/index.ts';
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

const ABAS: ReadonlyArray<{ id: Aba; rotulo: string; icone: LucideIcon; href: Href }> = [
  { id: 'inicio', rotulo: 'Início', icone: House, href: '/' },
  { id: 'pacientes', rotulo: 'Pacientes', icone: Users, href: '/pacientes' },
  { id: 'pendencias', rotulo: 'Pendências', icone: CloudUpload, href: '/pendencias' },
  { id: 'ajustes', rotulo: 'Ajustes', icone: Settings, href: '/ajustes' },
];

/** Na web o titulo da aba do navegador acompanha a tela. */
function useTituloDaPagina(nome: string | null) {
  useEffect(() => {
    if (Platform.OS === 'web') document.title = nome ? `${nome} · MedicalField` : 'MedicalField';
  }, [nome]);
}

export interface CascaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acaoTopo?: ReactNode;
  atual: Aba;
  /** Volta um nivel (telas de detalhe). */
  voltar?: { para: Href; rotulo: string };
  /** Acao da tela, na mesma linha do "voltar" (o cabecalho fica livre para o nome inteiro do paciente). */
  acaoVoltar?: ReactNode;
  children: ReactNode;
}

export function Casca({ titulo, subtitulo, acaoTopo, atual, voltar, acaoVoltar, children }: CascaProps) {
  const roteador = useRouter();
  const sessao = useSessao();
  const { pendentes } = useContagens();
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
        contentContainerStyle={{ padding: MEDIDA.recuo, gap: 16, width: '100%', maxWidth: 960, alignSelf: 'center' }}
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
        {children}
      </ScrollView>

      <View
        role="navigation"
        aria-label="Seções do app"
        style={{ flexDirection: 'row', paddingBottom: margens.bottom, borderTopWidth: 1, borderTopColor: cores.fio, backgroundColor: cores.papel }}
      >
        {ABAS.map((aba) => {
          const ativa = aba.id === atual;
          const cor = ativa ? cores.sobreInverso : cores.tinta2;
          const contagem = aba.id === 'pendencias' ? pendentes : 0;
          return (
            <Pressable
              key={aba.id}
              role="link"
              aria-current={ativa ? 'page' : undefined}
              aria-label={contagem ? `${aba.rotulo}, ${contagem} pendentes` : aba.rotulo}
              onPress={() => roteador.navigate(aba.href)}
              style={{ flex: 1, minHeight: MEDIDA.alvo + 8, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: ativa ? cores.inverso : 'transparent' }}
            >
              <View>
                <Icone icone={aba.icone} cor={cor} />
                {contagem ? (
                  <View style={{ position: 'absolute', top: -6, right: -14, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: cores.marca, alignItems: 'center', justifyContent: 'center' }}>
                    <Texto tamanho="rotulo" forte style={{ color: cores.sobreMarca, lineHeight: 18 }}>
                      {contagem}
                    </Texto>
                  </View>
                ) : null}
              </View>
              <Texto tamanho="rotulo" forte style={{ color: cor }}>
                {aba.rotulo}
              </Texto>
            </Pressable>
          );
        })}
      </View>
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
