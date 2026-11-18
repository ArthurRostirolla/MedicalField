import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConectividade, useConsulta, useSessao } from '../ui/contexto.tsx';
import { Botao, CampoTexto, Dialogo, Rotulo, SeletorSegmentado, Texto, Titulo, useTema } from '../ui/ds/index.ts';

function Fato({ rotulo, children, apoio }: { rotulo: string; children: ReactNode; apoio?: ReactNode }) {
  const { cores } = useTema();
  return (
    <View style={{ gap: 2, paddingVertical: 10, borderTopWidth: 1, borderTopColor: cores.fio }}>
      <Rotulo>{rotulo}</Rotulo>
      <Texto>{children}</Texto>
      {apoio ? (
        <Texto tamanho="pequeno" tom="tinta3">
          {apoio}
        </Texto>
      ) : null}
    </View>
  );
}

export function Ajustes() {
  const app = useApp();
  const avisar = useAvisar();
  const roteador = useRouter();
  const sessao = useSessao();
  const conexao = useConectividade();
  const { preferencia, definirPreferencia } = useTema();
  const [servidor, setServidor] = useState(app.enderecoServidor() ?? '');
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState<number | null>(null);
  const [saindo, setSaindo] = useState(false);
  const banco = useConsulta(async () => (await app.banco.consultar<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0, []);

  async function salvarServidor() {
    try {
      await app.definirEnderecoServidor(servidor);
      setErroServidor(null);
      avisar({ tom: 'sucesso', titulo: 'Endereço do servidor gravado' });
    } catch (erro) {
      setErroServidor(erro instanceof TypeError ? 'Endereço inválido. Use o formato https://servidor.exemplo.org' : erro instanceof Error ? erro.message : String(erro));
    }
  }

  async function pedirSaida() {
    if (!sessao) return;
    const pendentes = await app.pendencias.contarDoProfissional(sessao.profissional.id);
    if (pendentes > 0) setConfirmarSaida(pendentes);
    else await sair();
  }

  async function sair() {
    setSaindo(true);
    try {
      await app.registrarLog('LOGOUT');
      await app.sessao.sair();
      roteador.replace('/entrar');
    } catch (erro) {
      avisar({ tom: 'erro', titulo: 'Não foi possível sair', descricao: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setSaindo(false);
      setConfirmarSaida(null);
    }
  }

  const servidorMudou = servidor.trim() !== (app.enderecoServidor() ?? '');
  const profissional = sessao?.profissional;

  return (
    <Casca titulo="Ajustes">
      <SeletorSegmentado
        rotulo="Tema"
        valor={preferencia}
        aoMudar={definirPreferencia}
        opcoes={[
          { valor: 'claro', rotulo: 'Claro', detalhe: 'sol' },
          { valor: 'escuro', rotulo: 'Escuro', detalhe: 'noite' },
          { valor: 'sistema', rotulo: 'Do aparelho', detalhe: 'automático' },
        ]}
      />

      <View style={{ gap: 8 }}>
        <SeletorSegmentado
          rotulo="Simular conectividade"
          valor={conexao.simulandoOffline ? 'offline' : 'online'}
          aoMudar={(modo) => void app.simularOffline(modo === 'offline')}
          opcoes={[
            { valor: 'online', rotulo: 'Online' },
            { valor: 'offline', rotulo: 'Offline' },
          ]}
        />
      </View>

      <View style={{ gap: 8 }}>
        <CampoTexto
          rotulo="Endereço do servidor"
          value={servidor}
          onChangeText={setServidor}
          onSubmitEditing={() => {
            if (servidorMudou) void salvarServidor();
          }}
          placeholder={app.exigeEnderecoServidor ? 'https://medicalfield.exemplo.org' : 'O mesmo endereço deste app'}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="off"
          erro={erroServidor ?? undefined}
        />
        <Botao disabled={!servidorMudou} onPress={() => void salvarServidor()}>
          Gravar endereço
        </Botao>
      </View>

      <View role="region" aria-label="Este aparelho">
        <Titulo nivel={2} style={{ marginBottom: 4 }}>
          Este aparelho
        </Titulo>
        <Fato rotulo="Dispositivo">
          <Texto dado>{app.dispositivoId.slice(0, 8)}</Texto>
        </Fato>
        <Fato rotulo="Banco local">
          SQLite, versão <Texto dado>{String(banco.dados ?? '…')}</Texto>
        </Fato>
        <Fato
          rotulo="Profissional"
          apoio={profissional ? `${profissional.tipoRegistro} ${profissional.registro}${profissional.uf ? `/${profissional.uf}` : ''}` : undefined}
        >
          {profissional?.nome}
        </Fato>
      </View>

      <Botao variante="perigo" largo carregando={saindo} icone={LogOut} onPress={() => void pedirSaida()}>
        Sair
      </Botao>

      <Dialogo
        aberto={confirmarSaida !== null}
        aoFechar={() => setConfirmarSaida(null)}
        titulo="Sair com registros não enviados?"
        acoes={
          <>
            <Botao onPress={() => setConfirmarSaida(null)}>Continuar logado</Botao>
            <Botao variante="perigo" carregando={saindo} onPress={() => void sair()}>
              Sair mesmo assim
            </Botao>
          </>
        }
      >
        <Texto>
          {confirmarSaida === 1 ? 'Há 1 registro seu que ainda não foi' : `Há ${confirmarSaida} registros seus que ainda não foram`} para a
          central. Eles ficam guardados neste aparelho e só sobem quando você entrar de novo aqui.
        </Texto>
      </Dialogo>
    </Casca>
  );
}
