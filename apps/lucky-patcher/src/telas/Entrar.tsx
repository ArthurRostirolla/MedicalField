import { loginEntradaSchema, type TipoRegistro } from '@medicalfield/contratos';
import { Botao, CampoTexto, SeletorSegmentado } from '@medicalfield/ui';
import { ChevronDown, LogIn } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { FalhaTransporte } from '../sync/http.ts';
import { ErroLogin } from '../sync/sessao.ts';
import { CascaSimples, Conectividade } from '../ui/Casca.tsx';
import { useApp, useConectividade, useContagens, useSessao } from '../ui/contexto.tsx';

const ROTULO_REGISTRO: Record<TipoRegistro, string> = { CRM: 'Número do CRM', COREN: 'Número do COREN', SOCORRISTA: 'Identificação' };

export function Entrar() {
  const app = useApp();
  const navegar = useNavigate();
  const sessao = useSessao();
  const conexao = useConectividade();
  const { pendentes } = useContagens();
  const anterior = sessao?.precisaLogin ? sessao.profissional : null;

  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>((anterior?.tipoRegistro as TipoRegistro) ?? 'COREN');
  const [registro, setRegistro] = useState(anterior?.registro ?? '');
  const [uf, setUf] = useState(anterior?.uf ?? 'RS');
  const [senha, setSenha] = useState('');
  const [servidor, setServidor] = useState(app.enderecoServidor() ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [entrando, setEntrando] = useState(false);

  async function entrar(evento: FormEvent) {
    evento.preventDefault();
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
      navegar('/', { replace: true });
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

  return (
    <CascaSimples conectividade={<Conectividade />}>
      <form className="lp-bloco" onSubmit={entrar} noValidate>
        <h1 className="mf-app__titulo" style={{ whiteSpace: 'normal' }}>
          {anterior ? `Entre de novo, ${anterior.nome}` : 'Entrar'}
        </h1>
        {anterior ? (
          <p className="lp-nota">
            Sua sessão expirou. {pendentes > 0 ? `${pendentes} ${pendentes === 1 ? 'registro guardado' : 'registros guardados'} neste aparelho ${pendentes === 1 ? 'sobe' : 'sobem'} assim que você entrar.` : 'Nada foi perdido.'}
          </p>
        ) : (
          <p className="lp-nota">O primeiro acesso neste aparelho precisa de conexão. Depois, o app abre e registra sem rede.</p>
        )}

        <SeletorSegmentado
          rotulo="Registro profissional"
          valor={tipoRegistro}
          aoMudar={setTipoRegistro}
          opcoes={[
            { valor: 'CRM', rotulo: 'CRM' },
            { valor: 'COREN', rotulo: 'COREN' },
            { valor: 'SOCORRISTA', rotulo: 'Socorrista' },
          ]}
        />
        <div className="mf-grade-campos" style={{ ['--mf-colunas' as string]: tipoRegistro === 'SOCORRISTA' ? 1 : 3 }}>
          <CampoTexto
            rotulo={ROTULO_REGISTRO[tipoRegistro]}
            value={registro}
            onChange={(e) => setRegistro(e.target.value)}
            inputMode="numeric"
            autoComplete="username"
            erro={campos.registro}
            className={tipoRegistro === 'SOCORRISTA' ? undefined : 'lp-span-2'}
          />
          {tipoRegistro !== 'SOCORRISTA' ? (
            <CampoTexto rotulo="UF" value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} autoCapitalize="characters" autoComplete="off" />
          ) : null}
        </div>
        <CampoTexto
          rotulo="Senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          erro={campos.senha}
        />

        {app.exigeEnderecoServidor ? (
          <CampoTexto
            rotulo="Endereço do servidor"
            value={servidor}
            onChange={(e) => setServidor(e.target.value)}
            placeholder="https://medicalfield.exemplo.org"
            inputMode="url"
            autoCapitalize="none"
            autoComplete="url"
            ajuda="O endereço que a equipe de implantação informou."
          />
        ) : (
          <details className="lp-mais">
            <summary>
              Endereço do servidor
              <ChevronDown aria-hidden />
            </summary>
            <CampoTexto
              rotulo="Endereço do servidor"
              value={servidor}
              onChange={(e) => setServidor(e.target.value)}
              placeholder="O mesmo endereço deste app"
              inputMode="url"
              autoCapitalize="none"
              ajuda="Deixe em branco para usar o mesmo endereço de onde o app foi aberto."
            />
          </details>
        )}

        {erro ? (
          <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
            {erro}
          </p>
        ) : null}
        {!conexao.online && !erro ? (
          <p className="lp-nota" role="status">
            {conexao.simulandoOffline ? 'Modo offline simulado ligado: entrar exige desligá-lo.' : 'Procurando o servidor…'}
          </p>
        ) : null}

        <Botao type="submit" variante="primario" largo carregando={entrando} icone={<LogIn aria-hidden />}>
          Entrar
        </Botao>
        {anterior ? (
          <Link className="mf-botao mf-botao--fantasma" to="/">
            Continuar registrando sem enviar
          </Link>
        ) : null}
      </form>
    </CascaSimples>
  );
}
