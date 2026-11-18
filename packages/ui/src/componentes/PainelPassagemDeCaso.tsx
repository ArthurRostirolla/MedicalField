import type { ReactNode } from 'react';
import { cx, formatarHora } from '../util';
import { descricaoTriagem, EtiquetaTriagem, type CorTriagem, type ProtocoloTriagem } from './etiquetas';
import { Leituras, leiturasSinaisVitais } from './LinhaDoTempo';

/** Compatível estruturalmente com `Resumo` de `docs/contratos.md` §6. */
export interface ResumoPassagem {
  ultimosSinaisVitais: { ocorridoEm: string; dados: object } | null;
  glasgowMaisRecente: { ocorridoEm: string; dados: object } | null;
  triagem: { ocorridoEm: string; dados: object } | null;
  medicacoes: ReadonlyArray<{ ocorridoEm: string; nome: string; dose: string; unidade: string; via: string }>;
  procedimentos: ReadonlyArray<{ ocorridoEm: string; descricao: string }>;
  alergias: ReadonlyArray<string>;
  comorbidades: ReadonlyArray<string>;
  medicacoesContinuas: ReadonlyArray<string>;
  encerramento: { ocorridoEm: string; desfecho: string; destino: string | null } | null;
}

export interface PainelPassagemDeCasoProps {
  resumo: ResumoPassagem;
  /** Nome e identificação curta do paciente (ex.: "58 anos · M"). */
  paciente?: { nome: string; identificacao?: string };
  queixaPrincipal?: string | null;
  /** Ações do cabeçalho (ex.: gerar PDF). */
  acoes?: ReactNode;
  fusoHorario?: string;
  className?: string;
}

function Hora({ iso, fuso }: { iso: string; fuso?: string }) {
  return (
    <time className="mf-dado" dateTime={iso} style={{ fontSize: 'var(--text-rotulo)' }}>
      {formatarHora(iso, fuso)}
    </time>
  );
}

function Celula({
  rotulo,
  hora,
  larga,
  fecha,
  children,
}: {
  rotulo: string;
  hora?: ReactNode;
  larga?: boolean;
  /** Última célula de uma trinca: ocupa a linha inteira quando a grade cai para duas colunas. */
  fecha?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        'mf-passagem__celula',
        larga && 'mf-passagem__celula--larga',
        fecha && 'mf-passagem__celula--fecha',
      )}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span className="mf-rotulo">{rotulo}</span>
        {hora}
      </div>
      {children}
    </div>
  );
}

function Lista({ itens, vazio, classe }: { itens: ReadonlyArray<ReactNode>; vazio: string; classe?: string }) {
  if (itens.length === 0) return <div className="mf-passagem__ausente">{vazio}</div>;
  return (
    <ul className="mf-passagem__lista">
      {itens.map((item, indice) => (
        <li key={indice} className={classe}>
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * A "via rosa": resumo factual para a entrega no hospital, derivado da linha do tempo.
 * Só exibe o que foi registrado e quando — nenhuma interpretação clínica.
 */
export function PainelPassagemDeCaso({
  resumo,
  paciente,
  queixaPrincipal,
  acoes,
  fusoHorario,
  className,
}: PainelPassagemDeCasoProps) {
  const triagem = resumo.triagem?.dados as { protocolo?: ProtocoloTriagem; classificacao?: CorTriagem } | undefined;
  const glasgow = resumo.glasgowMaisRecente?.dados as Record<string, unknown> | undefined;
  const naoRegistrado = <div className="mf-passagem__ausente">Não registrado</div>;

  return (
    <section className={cx('mf-passagem', className)} aria-label="Passagem de caso">
      <header className="mf-passagem__topo">
        <h2 className="mf-passagem__titulo">Passagem de caso</h2>
        {acoes}
      </header>

      {paciente || queixaPrincipal ? (
        <div className="mf-passagem__paciente">
          {paciente ? (
            <p className="mf-passagem__nome">
              {paciente.nome}
              {paciente.identificacao ? (
                <span style={{ fontWeight: 500, fontSize: 'var(--mf-corpo)' }}> · {paciente.identificacao}</span>
              ) : null}
            </p>
          ) : null}
          {queixaPrincipal ? (
            <p style={{ margin: '0.125rem 0 0' }}>
              <span className="mf-rotulo">Queixa principal </span>
              {queixaPrincipal}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mf-passagem__grade">
        <Celula
          rotulo="Triagem"
          hora={resumo.triagem ? <Hora iso={resumo.triagem.ocorridoEm} fuso={fusoHorario} /> : null}
        >
          {triagem?.protocolo && triagem.classificacao ? (
            <div style={{ marginTop: '0.25rem' }}>
              <EtiquetaTriagem protocolo={triagem.protocolo} classificacao={triagem.classificacao} tamanho="g" />
              <div style={{ marginTop: '0.25rem' }}>
                {[triagem.protocolo === 'START' ? 'START' : 'Manchester', descricaoTriagem(triagem.protocolo, triagem.classificacao)]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ) : (
            naoRegistrado
          )}
        </Celula>

        <Celula
          rotulo="Glasgow"
          hora={
            resumo.glasgowMaisRecente ? <Hora iso={resumo.glasgowMaisRecente.ocorridoEm} fuso={fusoHorario} /> : null
          }
        >
          {glasgow ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span className="mf-numeral" style={{ fontSize: 'var(--text-numeral)' }}>
                {String(glasgow.total ?? '—')}
              </span>
              <span className="mf-num">
                O{String(glasgow.ocular ?? '—')} V{String(glasgow.verbal ?? '—')} M{String(glasgow.motora ?? '—')}
              </span>
            </div>
          ) : (
            naoRegistrado
          )}
        </Celula>

        <Celula rotulo="Alergias registradas" fecha>
          <Lista itens={resumo.alergias} vazio="Nenhuma registrada" classe="mf-passagem__alergia" />
        </Celula>

        <Celula
          rotulo="Últimos sinais vitais"
          larga
          hora={
            resumo.ultimosSinaisVitais ? <Hora iso={resumo.ultimosSinaisVitais.ocorridoEm} fuso={fusoHorario} /> : null
          }
        >
          {resumo.ultimosSinaisVitais ? (
            <Leituras leituras={leiturasSinaisVitais(resumo.ultimosSinaisVitais.dados)} />
          ) : (
            naoRegistrado
          )}
        </Celula>

        <Celula rotulo="Medicações administradas" larga>
          <Lista
            vazio="Nenhuma registrada"
            itens={resumo.medicacoes.map((medicacao) => (
              <>
                <Hora iso={medicacao.ocorridoEm} fuso={fusoHorario} />
                <span>
                  <strong>{medicacao.nome}</strong> · <span className="mf-num">{medicacao.dose}</span>{' '}
                  {medicacao.unidade} · {medicacao.via}
                </span>
              </>
            ))}
          />
        </Celula>

        <Celula rotulo="Procedimentos">
          <Lista
            vazio="Nenhum registrado"
            itens={resumo.procedimentos.map((procedimento) => (
              <>
                <Hora iso={procedimento.ocorridoEm} fuso={fusoHorario} />
                <span>{procedimento.descricao}</span>
              </>
            ))}
          />
        </Celula>

        <Celula rotulo="Comorbidades">
          <Lista itens={resumo.comorbidades} vazio="Nenhuma registrada" />
        </Celula>

        <Celula rotulo="Medicações contínuas" fecha>
          <Lista itens={resumo.medicacoesContinuas} vazio="Nenhuma registrada" />
        </Celula>

        {resumo.encerramento ? (
          <Celula rotulo="Encerramento" larga hora={<Hora iso={resumo.encerramento.ocorridoEm} fuso={fusoHorario} />}>
            <strong>{resumo.encerramento.desfecho}</strong>
            {resumo.encerramento.destino ? <> · Destino: {resumo.encerramento.destino}</> : null}
          </Celula>
        ) : null}
      </div>
    </section>
  );
}
