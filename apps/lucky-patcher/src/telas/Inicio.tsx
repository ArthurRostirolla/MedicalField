import { useRouter, type Href } from 'expo-router';
import { ChevronRight, ClipboardPlus, RefreshCw } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { AtendimentoLocal } from '../dados/atendimentos.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConectividade, useConsulta, useContagens, useMotor, useSessao } from '../ui/contexto.tsx';
import { Botao, EstadoErro, EstadoVazio, Esqueleto, Icone, MEDIDA, Rotulo, SeloSync, Texto, Titulo, Toque, useTema, type EstadoSync } from '../ui/ds/index.ts';
import { formatarMomento } from '../ui/formato.ts';

/** Cabecalho de bloco: titulo + contagem a direita. */
export function Cabecalho({ titulo, contagem }: { titulo: string; contagem?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
      <Titulo nivel={2}>{titulo}</Titulo>
      {contagem !== undefined && contagem !== null ? <Rotulo>{contagem}</Rotulo> : null}
    </View>
  );
}

/** Linha de lista que abre um detalhe: titulo, apoio, selo de envio e seta. */
export function LinhaLista({ para, titulo, apoio, envio }: { para: Href; titulo: string; apoio: string; envio: EstadoSync }) {
  const roteador = useRouter();
  const { cores } = useTema();
  return (
    <View role="listitem">
      <Toque
        role="link"
        escala={0.985}
        onPress={() => roteador.navigate(para)}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          minHeight: MEDIDA.alvo + 8,
          paddingVertical: 8,
          paddingHorizontal: MEDIDA.recuo,
          borderTopWidth: 1,
          borderTopColor: cores.fio,
          backgroundColor: pressed ? cores.papel2 : cores.papel,
        })}
      >
        <View style={{ flex: 1 }}>
          <Texto forte>{titulo}</Texto>
          {apoio ? (
            <Texto tamanho="pequeno" tom="tinta2">
              {apoio}
            </Texto>
          ) : null}
        </View>
        {envio !== 'confirmado' ? <SeloSync estado={envio} /> : null}
        <Icone icone={ChevronRight} cor={cores.tinta3} />
      </Toque>
    </View>
  );
}

/** Lista com borda de folha. */
export function Lista({ children }: { children: ReactNode }) {
  const { cores } = useTema();
  return (
    <View role="list" style={{ borderWidth: 1, borderTopWidth: 0, borderColor: cores.fio, borderRadius: MEDIDA.raio, overflow: 'hidden' }}>
      {children}
    </View>
  );
}

export function LinhaAtendimento({ atendimento }: { atendimento: AtendimentoLocal }) {
  return (
    <LinhaLista
      para={`/atendimentos/${atendimento.id}`}
      titulo={atendimento.pessoaNome}
      apoio={`${formatarMomento(atendimento.iniciadoEm)}${atendimento.queixaPrincipal ? ` · ${atendimento.queixaPrincipal}` : ''}${atendimento.status === 'ENCERRADO' ? ' · encerrado' : ''}`}
      envio={atendimento.envio}
    />
  );
}


export function Inicio() {
  const app = useApp();
  const roteador = useRouter();
  const sessao = useSessao();
  const conexao = useConectividade();
  const motor = useMotor();
  const { cores } = useTema();
  const { pendentes, rejeitadas } = useContagens();
  const [resultado, setResultado] = useState<string | null>(null);

  const dados = useConsulta(
    async () => ({
      abertos: await app.atendimentos.abertos(),
      encerrados: await app.atendimentos.encerradosRecentes(5),
      medicamentos: await app.medicamentos.contar(),
      pessoas: await app.pessoas.contar(),
    }),
    [],
  );

  // Pedido manual nunca e ignorado: se a sincronizacao automatica ja corre, o motor devolve a mesma.
  const [pedindo, setPedindo] = useState(false);
  async function sincronizar() {
    setResultado(null);
    setPedindo(true);
    await app.monitor.verificar();
    const r = await app.motor.sincronizar('manual').finally(() => setPedindo(false));
    setResultado(
      r.erro
        ? `Não sincronizou: ${r.erro}`
        : `Sincronizado. ${r.confirmadas} ${r.confirmadas === 1 ? 'enviado' : 'enviados'}, ${r.recebidas} ${r.recebidas === 1 ? 'recebido' : 'recebidos'}${r.rejeitadas ? `, ${r.rejeitadas} ${r.rejeitadas === 1 ? 'rejeitado' : 'rejeitados'}` : ''}.`,
    );
  }

  return (
    <Casca
      titulo="Início"
      subtitulo={sessao ? `${sessao.profissional.nome} · ${sessao.profissional.tipoRegistro} ${sessao.profissional.registro}` : undefined}
    >
      <Botao variante="primario" largo icone={ClipboardPlus} onPress={() => roteador.navigate('/pacientes')}>
        Novo atendimento
      </Botao>

      <View role="region" aria-label="Atendimentos em aberto">
        <Cabecalho titulo="Atendimentos em aberto" contagem={dados.dados?.abertos.length || undefined} />
        {dados.erro ? (
          <EstadoErro titulo="Não foi possível ler o banco local" descricao={dados.erro.message} aoTentarDeNovo={dados.recarregar} />
        ) : !dados.dados ? (
          <Esqueleto linhas={3} altura={40} />
        ) : dados.dados.abertos.length === 0 ? (
          <EstadoVazio titulo="Nenhum atendimento em aberto" />
        ) : (
          <Lista>
            {dados.dados.abertos.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </Lista>
        )}
      </View>

      {dados.dados?.encerrados.length ? (
        <View role="region" aria-label="Encerrados recentes">
          <Cabecalho titulo="Encerrados recentes" />
          <Lista>
            {dados.dados.encerrados.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </Lista>
        </View>
      ) : null}
      {/* Rodape discreto: sincronizar a mao e o que ha no aparelho (a sincronizacao ja e automatica). */}
      <View style={{ gap: 4, alignItems: 'flex-start' }}>
        <Botao variante="fantasma" disabled={conexao.simulandoOffline} carregando={pedindo} icone={RefreshCw} onPress={() => void sincronizar()} style={{ paddingHorizontal: 0 }}>
          Sincronizar agora
        </Botao>
        {resultado ? (
          <Texto tamanho="pequeno" tom="tinta2" role={'status' as 'alert'}>
            {resultado}
          </Texto>
        ) : null}
        {dados.dados ? (
          <Texto tamanho="pequeno" tom="tinta3" testID="contagem-local">
            <Texto dado tamanho="pequeno" tom="tinta3">
              {dados.dados.medicamentos}
            </Texto>{' '}
            medicamentos ·{' '}
            <Texto dado tamanho="pequeno" tom="tinta3">
              {dados.dados.pessoas}
            </Texto>{' '}
            pacientes neste aparelho
          </Texto>
        ) : null}
      </View>
    </Casca>
  );
}
