import type { TipoRegistro } from '@medicalfield/contratos';
import { Botao, CampoTexto, FaixaDemonstrativa, Marca, Select, SeletorSegmentado } from '@medicalfield/ui';
import { CircleAlert, LogIn } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { entrar, ErroApi, restaurarSessao } from '../api/cliente';
import { useSessao, type EstadoRetorno } from './sessao';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

const ROTULO_REGISTRO: Record<TipoRegistro, string> = {
  CRM: 'Número do CRM',
  COREN: 'Número do COREN',
  SOCORRISTA: 'Identificação de socorrista',
};

function mensagemDeFalha(erro: unknown): string {
  if (!(erro instanceof ErroApi)) return 'Não foi possível entrar. Tente de novo.';
  if (erro.codigo === 'CREDENCIAIS_INVALIDAS') {
    return 'Registro ou senha não conferem. Confira também o tipo de registro e a UF.';
  }
  if (erro.codigo === 'MUITAS_TENTATIVAS') {
    return 'Muitas tentativas seguidas para este registro. Aguarde 15 minutos e tente de novo.';
  }
  if (erro.transitorio) return 'O serviço de identidade não respondeu. Tente de novo em instantes.';
  return erro.message;
}

export function TelaLogin() {
  const sessao = useSessao();
  const local = useLocation();
  const destino = (local.state as EstadoRetorno | null)?.de ?? '/atendimentos';

  const [tipoRegistro, setTipoRegistro] = useState<TipoRegistro>('CRM');
  const [registro, setRegistro] = useState('');
  const [uf, setUf] = useState('RS');
  const [senha, setSenha] = useState('');
  const [tentou, setTentou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  // Quem já tem sessão (cookie) e abre o login direto volta para dentro.
  useEffect(() => {
    void restaurarSessao();
  }, []);

  if (sessao.situacao === 'ativa') return <Navigate to={destino} replace />;

  const comUf = tipoRegistro !== 'SOCORRISTA';

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setTentou(true);
    setFalha(null);
    if (!registro.trim() || !senha) return;
    setEnviando(true);
    try {
      await entrar({ tipoRegistro, registro: registro.trim(), senha, ...(comUf && { uf }) });
    } catch (erro) {
      setFalha(mensagemDeFalha(erro));
      setEnviando(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-mesa" data-contexto="portal">
      <FaixaDemonstrativa />
      <main className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 content-center items-start gap-x-16 gap-y-8 px-4 py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div>
          <Marca />
          <h1 className="bp-titulo-pagina mt-6">Portal administrativo</h1>
          <ul className="bp-pauta mt-6">
            <li>Atendimentos com a linha do tempo completa e a passagem de caso</li>
            <li>Prontuários e cadastros de apoio, somente leitura</li>
            <li>Ficha em PDF verificável, com envio por e-mail</li>
          </ul>
        </div>

        <form className="mf-secao" onSubmit={aoEnviar} noValidate aria-labelledby="titulo-entrar">
          <header className="mf-secao__topo">
            <div>
              <h2 id="titulo-entrar" className="mf-secao__titulo">
                Identificação profissional
              </h2>
              <p className="mf-secao__descricao">Todo acesso fica registrado no log de auditoria.</p>
            </div>
          </header>
          <div className="mf-secao__corpo grid grid-cols-1 gap-4">
            <SeletorSegmentado
              rotulo="Tipo de registro"
              valor={tipoRegistro}
              aoMudar={setTipoRegistro}
              opcoes={[
                { valor: 'CRM', rotulo: 'CRM' },
                { valor: 'COREN', rotulo: 'COREN' },
                { valor: 'SOCORRISTA', rotulo: 'Socorrista' },
              ]}
            />
            <div className="mf-grade-campos" style={{ gridTemplateColumns: comUf ? 'minmax(0, 1fr) 6.5rem' : 'minmax(0, 1fr)' }}>
              <CampoTexto
                rotulo={ROTULO_REGISTRO[tipoRegistro]}
                name="registro"
                value={registro}
                onChange={(evento) => setRegistro(evento.target.value)}
                autoComplete="username"
                inputMode="numeric"
                autoFocus
                erro={tentou && !registro.trim() ? 'Informe o número do registro.' : undefined}
              />
              {comUf ? (
                <Select
                  rotulo="UF"
                  name="uf"
                  value={uf}
                  onChange={(evento) => setUf(evento.target.value)}
                  opcoes={UFS.map((sigla) => ({ valor: sigla, rotulo: sigla }))}
                />
              ) : null}
            </div>
            <CampoTexto
              rotulo="Senha"
              name="senha"
              type="password"
              value={senha}
              onChange={(evento) => setSenha(evento.target.value)}
              autoComplete="current-password"
              erro={tentou && !senha ? 'Informe a senha.' : undefined}
            />
            {falha ? (
              <p className="mf-campo__erro m-0" role="alert">
                <CircleAlert aria-hidden />
                <span>{falha}</span>
              </p>
            ) : null}
            <Botao type="submit" variante="primario" largo icone={<LogIn aria-hidden />} carregando={enviando}>
              Entrar
            </Botao>
          </div>
        </form>
      </main>
    </div>
  );
}
