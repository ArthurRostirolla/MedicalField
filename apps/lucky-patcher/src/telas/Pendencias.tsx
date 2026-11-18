import { useRouter } from 'expo-router';
import { CircleCheck, RefreshCw } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { Comando, SituacaoFila } from '../dados/outbox.ts';
import type { Pendencia } from '../dados/pendencias.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConectividade, useConsulta, useGravar, useMotor, useSessao } from '../ui/contexto.tsx';
import { Botao, Dialogo, EstadoErro, EstadoVazio, Esqueleto, MEDIDA, Rotulo, SeloSync, Texto, Titulo, useTema, type EstadoSync } from '../ui/ds/index.ts';
import { formatarMomento } from '../ui/formato.ts';

const SELO: Record<SituacaoFila, { estado: EstadoSync; rotulo?: string }> = {
  ENVIAVEL: { estado: 'local', rotulo: 'Na fila' },
  ENVIANDO: { estado: 'enviando' },
  REJEITADA: { estado: 'rejeitado', rotulo: 'Rejeitada' },
  RETIDA: { estado: 'local', rotulo: 'Retida' },
  DE_OUTRO_PROFISSIONAL: { estado: 'local', rotulo: 'De outro login' },
};

function apoio({ comando, situacao }: Pendencia): string {
  const criado = `Registrado ${formatarMomento(comando.criadoEm)}`;
  if (situacao === 'RETIDA') return `${criado} · aguarda uma operação anterior ser aceita`;
  if (situacao === 'DE_OUTRO_PROFISSIONAL') return `${criado} · sobe quando quem registrou entrar de novo`;
  if (situacao === 'REJEITADA') return criado;
  const partes = [criado];
  if (comando.tentativas > 0) partes.push(`${comando.tentativas} ${comando.tentativas === 1 ? 'tentativa' : 'tentativas'}`);
  if (comando.proximaTentativaEm) partes.push(`próxima às ${formatarMomento(comando.proximaTentativaEm)}`);
  return partes.join(' · ');
}

/** Lista com titulo e contagem (antes: section + h2 + ul/ol). */
function Bloco({ titulo, quantidade, children }: { titulo: string; quantidade: number; children: ReactNode }) {
  return (
    <View role="region" aria-label={titulo} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Titulo nivel={2}>{titulo}</Titulo>
        <Rotulo>{quantidade}</Rotulo>
      </View>
      <View role="list">{children}</View>
    </View>
  );
}

function Linha({ comando, situacao, testID, children }: Pendencia & { testID: string; children?: ReactNode }) {
  const { cores } = useTema();
  return (
    <View role="listitem" testID={testID} style={{ gap: 8, padding: 12, borderTopWidth: 1, borderTopColor: cores.fio, backgroundColor: cores.papel }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Texto forte>{comando.descricao}</Texto>
          <Texto tamanho="pequeno" tom="tinta2">
            {apoio({ comando, situacao })}
          </Texto>
          {situacao === 'REJEITADA' ? (
            <Texto tamanho="pequeno" tom="carmim">
              Motivo: {comando.ultimoErro ?? 'não informado'}
            </Texto>
          ) : comando.ultimoErro && situacao === 'ENVIAVEL' ? (
            <Texto tamanho="pequeno" tom="tinta2">
              Última falha: {comando.ultimoErro}
            </Texto>
          ) : null}
        </View>
        <SeloSync {...SELO[situacao]} />
      </View>
      {children}
    </View>
  );
}

export function Pendencias() {
  const app = useApp();
  const avisar = useAvisar();
  const roteador = useRouter();
  const sessao = useSessao();
  const conexao = useConectividade();
  const motor = useMotor();
  const { gravar, gravando } = useGravar();
  const [descarte, setDescarte] = useState<{ comando: Comando; cadeia: Comando[] } | null>(null);
  const fila = useConsulta(() => app.pendencias.listar(sessao?.profissional.id ?? null), [sessao?.profissional.id]);

  const rejeitadas = fila.dados?.filter((item) => item.situacao === 'REJEITADA') ?? [];
  const demais = fila.dados?.filter((item) => item.situacao !== 'REJEITADA') ?? [];

  // Pedido manual nunca e ignorado: se a sincronizacao automatica ja corre, o motor devolve a mesma.
  const [pedindo, setPedindo] = useState(false);
  async function sincronizar() {
    setPedindo(true);
    await app.monitor.verificar();
    const r = await app.motor.sincronizar('manual').finally(() => setPedindo(false));
    if (r.erro) avisar({ titulo: 'Não sincronizou', descricao: `${r.erro} Os registros continuam guardados.` });
  }

  return (
    <Casca titulo="Pendências">
      <View style={{ gap: 8 }}>
        <Botao
          variante="primario"
          largo
          disabled={conexao.simulandoOffline}
          carregando={pedindo}
          icone={RefreshCw}
          onPress={() => void sincronizar()}
        >
          Sincronizar agora
        </Botao>
        {motor.ultimoErro && conexao.online ? (
          <Texto tamanho="pequeno" tom="tinta2" role={'status' as 'alert'}>
            Última tentativa: {motor.ultimoErro}
          </Texto>
        ) : null}
      </View>

      {fila.erro ? (
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={fila.erro.message} aoTentarDeNovo={fila.recarregar} />
      ) : !fila.dados ? (
        <Esqueleto linhas={4} altura={40} />
      ) : fila.dados.length === 0 ? (
        <EstadoVazio icone={CircleCheck} titulo="Tudo enviado" />
      ) : null}

      {rejeitadas.length > 0 ? (
        <Bloco titulo="Rejeitadas pelo servidor" quantidade={rejeitadas.length}>
          {rejeitadas.map(({ comando, situacao }) => (
            <Linha key={comando.opId} comando={comando} situacao={situacao} testID="pendencia-rejeitada">
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {comando.entidade === 'pessoa' ? (
                  <Botao variante="primario" role="link" onPress={() => roteador.navigate(`/pendencias/${comando.opId}/corrigir`)}>
                    Corrigir
                  </Botao>
                ) : null}
                <Botao disabled={gravando} onPress={() => void gravar(() => app.pendencias.tentarDeNovo(comando.opId))}>
                  Tentar de novo
                </Botao>
                <Botao
                  variante="perigo"
                  disabled={gravando}
                  onPress={async () => setDescarte({ comando, cadeia: await app.pendencias.cadeiaDe(comando.opId) })}
                >
                  Descartar
                </Botao>
              </View>
            </Linha>
          ))}
        </Bloco>
      ) : null}

      {demais.length > 0 ? (
        <Bloco titulo="Fila de envio" quantidade={demais.length}>
          {demais.map((item) => (
            <Linha key={item.comando.opId} {...item} testID="pendencia-fila" />
          ))}
        </Bloco>
      ) : null}

      <Dialogo
        aberto={descarte !== null}
        aoFechar={() => setDescarte(null)}
        titulo="Descartar este registro?"
        acoes={
          <>
            <Botao onPress={() => setDescarte(null)}>Manter</Botao>
            <Botao
              variante="perigo"
              carregando={gravando}
              onPress={async () => {
                if (!descarte) return;
                if (await gravar(() => app.pendencias.descartar(descarte.comando.opId))) setDescarte(null);
              }}
            >
              {descarte && descarte.cadeia.length > 1 ? `Descartar ${descarte.cadeia.length} operações` : 'Descartar'}
            </Botao>
          </>
        }
      >
        <Texto>
          <Texto forte>{descarte?.comando.descricao}</Texto> sai da fila e é apagado deste aparelho. Ele nunca chegou à central, então não
          há como recuperar.
        </Texto>
        {descarte && descarte.cadeia.length > 1 ? (
          <View style={{ gap: 4 }}>
            <Texto>Dependem dele e são descartados junto:</Texto>
            <View role="list" style={{ paddingLeft: MEDIDA.recuo }}>
              {descarte.cadeia.slice(1).map((comando) => (
                <Texto key={comando.opId} role="listitem">
                  • {comando.descricao}
                </Texto>
              ))}
            </View>
          </View>
        ) : null}
      </Dialogo>
    </Casca>
  );
}
