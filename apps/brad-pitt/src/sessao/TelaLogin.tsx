import type { TipoRegistro } from '@medicalfield/contratos';
import { Botao, CampoTexto, Marca, Select, SeletorCartoes, type OpcaoCartao } from '@medicalfield/ui';
import { Ambulance, CircleAlert, HeartPulse, LogIn, Stethoscope } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { entrar, ErroApi, restaurarSessao } from '../api/cliente';
import { useSessao, type EstadoRetorno } from './sessao';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// O título do cartão é a sigla do registro: é o nome do rádio (testes e leitor de tela).
const PERFIS: ReadonlyArray<OpcaoCartao<TipoRegistro>> = [
  { valor: 'CRM', titulo: 'CRM', detalhe: 'Medicina', icone: <Stethoscope /> },
  { valor: 'COREN', titulo: 'COREN', detalhe: 'Enfermagem', icone: <HeartPulse /> },
  { valor: 'SOCORRISTA', titulo: 'Socorrista', detalhe: 'Identificação própria', icone: <Ambulance /> },
];

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
    <div className="bp-login" data-contexto="portal">
      <main className="bp-login__grade">
        <section className="bp-login__editorial">
          <div className="bp-login__bloco">
            <Marca />
            <p className="bp-login__frase">
              A caixa-preta do atendimento <em>pré-hospitalar</em>.
            </p>
          </div>
        </section>

        <section className="bp-login__lado">
          <form className="bp-login__form" onSubmit={aoEnviar} noValidate aria-labelledby="titulo-entrar">
            <h1 id="titulo-entrar" className="bp-login__titulo">
              Identificação profissional
            </h1>
            <SeletorCartoes rotulo="Quem está entrando?" valor={tipoRegistro} aoMudar={setTipoRegistro} opcoes={PERFIS} />
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
          </form>
        </section>
      </main>
    </div>
  );
}
