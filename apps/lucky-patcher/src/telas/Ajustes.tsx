import { Botao, CampoTexto, Dialogo, SeletorSegmentado } from '@medicalfield/ui';
import { LogOut } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConectividade, useConsulta, useSessao } from '../ui/contexto.tsx';
import { definirPreferenciaTema, lerPreferenciaTema, type PreferenciaTema } from '../ui/tema.ts';

export function Ajustes() {
  const app = useApp();
  const avisar = useAvisar();
  const navegar = useNavigate();
  const sessao = useSessao();
  const conexao = useConectividade();
  const [tema, setTema] = useState<PreferenciaTema>(lerPreferenciaTema);
  const [servidor, setServidor] = useState(app.enderecoServidor() ?? '');
  const [erroServidor, setErroServidor] = useState<string | null>(null);
  const [confirmarSaida, setConfirmarSaida] = useState<number | null>(null);
  const [saindo, setSaindo] = useState(false);
  const banco = useConsulta(async () => (await app.banco.consultar<{ user_version: number }>('PRAGMA user_version'))[0]?.user_version ?? 0, []);

  async function salvarServidor(evento: FormEvent) {
    evento.preventDefault();
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
      navegar('/entrar', { replace: true });
    } catch (erro) {
      avisar({ tom: 'erro', titulo: 'Não foi possível sair', descricao: erro instanceof Error ? erro.message : String(erro) });
    } finally {
      setSaindo(false);
      setConfirmarSaida(null);
    }
  }

  return (
    <Casca titulo="Ajustes" atual="ajustes">
      <SeletorSegmentado
        rotulo="Tema"
        valor={tema}
        aoMudar={(novo) => {
          setTema(novo);
          definirPreferenciaTema(novo);
        }}
        opcoes={[
          { valor: 'claro', rotulo: 'Claro', detalhe: 'sol' },
          { valor: 'escuro', rotulo: 'Escuro', detalhe: 'noite' },
          { valor: 'sistema', rotulo: 'Do aparelho', detalhe: 'automático' },
        ]}
      />

      <div className="lp-bloco">
        <SeletorSegmentado
          rotulo="Simular conectividade"
          valor={conexao.simulandoOffline ? 'offline' : 'online'}
          aoMudar={(modo) => void app.simularOffline(modo === 'offline')}
          opcoes={[
            { valor: 'online', rotulo: 'Online' },
            { valor: 'offline', rotulo: 'Offline' },
          ]}
        />
        <p className="lp-nota">
          Em Offline o app não emite nenhuma requisição: tudo fica no aparelho. A escolha é lembrada ao reabrir. É a mesma chave
          da tira no alto da tela.
        </p>
      </div>

      <form className="lp-bloco" noValidate onSubmit={(e) => void salvarServidor(e)}>
        <CampoTexto
          rotulo="Endereço do servidor"
          value={servidor}
          onChange={(e) => setServidor(e.target.value)}
          placeholder={app.exigeEnderecoServidor ? 'https://medicalfield.exemplo.org' : 'O mesmo endereço deste app'}
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          erro={erroServidor ?? undefined}
          ajuda={app.exigeEnderecoServidor ? 'Obrigatório no aplicativo Android.' : 'Em branco, usa o endereço de onde o app foi aberto.'}
        />
        <Botao type="submit" disabled={servidor.trim() === (app.enderecoServidor() ?? '')}>
          Gravar endereço
        </Botao>
      </form>

      <section aria-label="Este aparelho">
        <div className="lp-cabecalho">
          <h2 className="mf-secao__titulo">Este aparelho</h2>
        </div>
        <dl className="lp-fatos">
          <div>
            <dt className="mf-rotulo">Dispositivo</dt>
            <dd>
              <span className="mf-dado">{app.dispositivoId.slice(0, 8)}</span>
              <small className="mf-dado">{app.dispositivoId}</small>
            </dd>
          </div>
          <div>
            <dt className="mf-rotulo">Banco local</dt>
            <dd>
              SQLite, versão <span className="mf-num">{banco.dados ?? '…'}</span>
              <small>{app.exigeEnderecoServidor ? 'Cifrado (SQLCipher) no armazenamento do aplicativo.' : 'Guardado no armazenamento privado deste navegador (OPFS).'}</small>
            </dd>
          </div>
          <div>
            <dt className="mf-rotulo">Profissional</dt>
            <dd>
              {sessao?.profissional.nome}
              <small>
                {sessao?.profissional.tipoRegistro} {sessao?.profissional.registro}
                {sessao?.profissional.uf ? `/${sessao.profissional.uf}` : ''}
              </small>
            </dd>
          </div>
        </dl>
      </section>

      <Botao variante="perigo" largo carregando={saindo} icone={<LogOut aria-hidden />} onClick={() => void pedirSaida()}>
        Sair
      </Botao>

      <Dialogo
        aberto={confirmarSaida !== null}
        aoFechar={() => setConfirmarSaida(null)}
        titulo="Sair com registros não enviados?"
        acoes={
          <>
            <Botao onClick={() => setConfirmarSaida(null)}>Continuar logado</Botao>
            <Botao variante="perigo" carregando={saindo} onClick={() => void sair()}>
              Sair mesmo assim
            </Botao>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          {confirmarSaida === 1 ? 'Há 1 registro seu que ainda não foi' : `Há ${confirmarSaida} registros seus que ainda não foram`} para a
          central. Eles ficam guardados neste aparelho e só sobem quando você entrar de novo aqui.
        </p>
      </Dialogo>
    </Casca>
  );
}
