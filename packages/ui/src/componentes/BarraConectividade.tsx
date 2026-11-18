import { CircleAlert, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { cx } from '../util';
import { Chave } from './campos';
import { MarcaSync } from './etiquetas';

export interface BarraConectividadeProps {
  /** Estado efetivo: `online` = não simulado offline E servidor alcançável. */
  online: boolean;
  /** O seletor "Simular conectividade" está em offline. */
  simulandoOffline: boolean;
  aoMudarSimulacao: (simularOffline: boolean) => void;
  /** Operações no outbox ainda não confirmadas. */
  pendencias: number;
  /** Operações recusadas pelo servidor, aguardando correção. */
  rejeitadas?: number;
  sincronizando?: boolean;
  /** Hora da última sincronização, já formatada (ex.: "21:04"). */
  ultimaSync?: string;
  /** Torna a contagem um botão que abre a tela de pendências. */
  aoAbrirPendencias?: () => void;
  className?: string;
}

/**
 * Tira permanente do app de campo. Offline vira bloco invertido (forma + palavra + ícone),
 * então o estado não depende de cor.
 */
export function BarraConectividade({
  online,
  simulandoOffline,
  aoMudarSimulacao,
  pendencias,
  rejeitadas = 0,
  sincronizando,
  ultimaSync,
  aoAbrirPendencias,
  className,
}: BarraConectividadeProps) {
  const detalhe = online
    ? ultimaSync
      ? `sync ${ultimaSync}`
      : 'conectado'
    : simulandoOffline
      ? 'simulado'
      : 'sem rede';

  const textoPendencias = sincronizando
    ? `Enviando ${pendencias}…`
    : pendencias === 0
      ? 'Tudo enviado'
      : `${pendencias} ${pendencias === 1 ? 'pendente' : 'pendentes'}`;

  const conteudoPendencias = (
    <>
      {sincronizando ? (
        <RefreshCw className="mf-gira" aria-hidden />
      ) : (
        <MarcaSync estado={pendencias === 0 ? 'confirmado' : 'local'} />
      )}
      <span>
        {textoPendencias}
        {rejeitadas > 0 ? (
          <span className="mf-conexao__detalhe mf-conexao__rejeitadas">
            <CircleAlert aria-hidden style={{ display: 'inline', width: '0.75rem', height: '0.75rem' }} /> {rejeitadas}{' '}
            {rejeitadas === 1 ? 'rejeitada' : 'rejeitadas'}
          </span>
        ) : null}
      </span>
    </>
  );

  return (
    <section className={cx('mf-conexao', className)} aria-label="Conectividade e sincronização">
      <div className={cx('mf-conexao__estado', !online && 'mf-invertido')} role="status">
        {online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
        <span>
          {online ? 'Online' : 'Offline'}
          <span className="mf-conexao__detalhe">{detalhe}</span>
        </span>
      </div>

      {aoAbrirPendencias ? (
        <button
          type="button"
          className="mf-conexao__pendencias"
          data-tem={pendencias > 0}
          onClick={aoAbrirPendencias}
          aria-label={`${textoPendencias}. Abrir pendências`}
        >
          {conteudoPendencias}
        </button>
      ) : (
        <div className="mf-conexao__pendencias" data-tem={pendencias > 0} role="status">
          {conteudoPendencias}
        </div>
      )}

      <div className="mf-conexao__simulacao">
        <Chave
          marcado={simulandoOffline}
          aoMudar={aoMudarSimulacao}
          aria-label="Simular conectividade: ficar offline"
        >
          Simular
          <br />
          offline
        </Chave>
      </div>
    </section>
  );
}
