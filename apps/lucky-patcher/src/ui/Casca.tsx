// Moldura de toda tela: faixa demonstrativa, cabecalho, tira de conectividade SEMPRE visivel e abas.
import { BarraConectividade, Botao, FaixaDemonstrativa, LayoutApp, Marca } from '@medicalfield/ui';
import { ArrowLeft, CircleAlert, CloudUpload, House, Settings, Users } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApp, useAvisar, useConectividade, useContagens, useMotor, useSessao } from './contexto.tsx';
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

export interface CascaProps {
  titulo: ReactNode;
  subtitulo?: ReactNode;
  acaoTopo?: ReactNode;
  atual: Aba;
  /** Volta um nivel (telas de detalhe). */
  voltar?: { para: string; rotulo: string };
  /** Acao da tela, na mesma linha do "voltar" (o cabecalho fica livre para o nome inteiro do paciente). */
  acaoVoltar?: ReactNode;
  /** `dupla` = duas colunas no desktop (atendimento). */
  dupla?: boolean;
  children: ReactNode;
}

export function Casca({ titulo, subtitulo, acaoTopo, atual, voltar, acaoVoltar, dupla, children }: CascaProps) {
  const navegar = useNavigate();
  const sessao = useSessao();
  const { pendentes } = useContagens();
  const nomeDaTela = typeof titulo === 'string' ? titulo : null;
  useEffect(() => {
    document.title = nomeDaTela ? `${nomeDaTela} · MedicalField` : 'MedicalField';
  }, [nomeDaTela]);
  return (
    <>
      <button type="button" className="mf-botao lp-pular" onClick={() => document.getElementById('conteudo')?.focus()}>
        Pular para o conteúdo
      </button>
      <LayoutApp
      titulo={titulo}
      subtitulo={subtitulo}
      acaoTopo={acaoTopo}
      atual={atual}
      itens={[
        { id: 'inicio', rotulo: 'Início', icone: <House aria-hidden />, href: '#/' },
        { id: 'pacientes', rotulo: 'Pacientes', icone: <Users aria-hidden />, href: '#/pacientes' },
        { id: 'pendencias', rotulo: 'Pendências', icone: <CloudUpload aria-hidden />, href: '#/pendencias', contagem: pendentes },
        { id: 'ajustes', rotulo: 'Ajustes', icone: <Settings aria-hidden />, href: '#/ajustes' },
      ]}
      conectividade={<Conectividade aoAbrirPendencias={() => navegar('/pendencias')} />}
    >
      <div id="conteudo" tabIndex={-1} className={dupla ? 'lp-pagina lp-pagina--dupla' : 'lp-pagina'}>
        {sessao?.precisaLogin ? (
          <div className="lp-aviso lp-toda" role="alert">
            <CircleAlert aria-hidden />
            <p>
              <strong>Sessão expirada.</strong> Você continua registrando normalmente; para enviar, entre de novo. Nada do
              que está no aparelho foi perdido.
            </p>
            <Botao onClick={() => navegar('/entrar')}>Entrar de novo</Botao>
          </div>
        ) : null}
        {voltar ? (
          <div className="lp-toda lp-trilha">
            <Link className="mf-botao mf-botao--fantasma" to={voltar.para}>
              <ArrowLeft aria-hidden />
              <span>{voltar.rotulo}</span>
            </Link>
            {acaoVoltar}
          </div>
        ) : null}
        {children}
      </div>
      </LayoutApp>
    </>
  );
}

/** Moldura das telas sem abas (entrada, bloqueios): mesma faixa, mesma tira de conectividade. */
export function CascaSimples({ conectividade, children }: { conectividade?: ReactNode; children: ReactNode }) {
  return (
    <div className="mf-app" data-contexto="campo">
      <div className="mf-app__topo">
        <FaixaDemonstrativa />
        <header className="mf-app__cabecalho">
          <Marca />
        </header>
        {conectividade}
      </div>
      <main className="mf-app__principal">
        <div className="lp-pagina lp-estreita">{children}</div>
      </main>
    </div>
  );
}
