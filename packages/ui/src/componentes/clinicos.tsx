// Seletores de dado clínico. Registram a escolha do profissional; nenhum interpreta o valor.
import { useId, type ReactNode } from 'react';
import { cx } from '../util';
import { Mensagens, SeletorSegmentado } from './campos';

/* ───────── Escala de Glasgow ───────── */

export type EixoGlasgow = 'ocular' | 'verbal' | 'motora';
export type RespostasGlasgow = Record<EixoGlasgow, number | null>;

/** Mesmas palavras do app de campo, da pior (1) para a melhor resposta. */
export const ESCALA_GLASGOW: Record<EixoGlasgow, { rotulo: string; letra: string; respostas: readonly string[] }> = {
  ocular: { rotulo: 'Abertura ocular', letra: 'O', respostas: ['Nenhuma', 'À dor', 'À voz', 'Espontânea'] },
  verbal: { rotulo: 'Resposta verbal', letra: 'V', respostas: ['Nenhuma', 'Sons', 'Palavras', 'Confusa', 'Orientada'] },
  motora: { rotulo: 'Resposta motora', letra: 'M', respostas: ['Nenhuma', 'Extensão', 'Flexão', 'Retirada', 'Localiza', 'Obedece'] },
};
const EIXOS = Object.keys(ESCALA_GLASGOW) as EixoGlasgow[];

export const GLASGOW_VAZIO: RespostasGlasgow = { ocular: null, verbal: null, motora: null };

export interface SeletorGlasgowProps {
  valor: RespostasGlasgow;
  aoMudar: (valor: RespostasGlasgow) => void;
  erro?: ReactNode;
  className?: string;
}

/** Os três eixos lado a lado com a soma ao vivo. A soma é aritmética, sem faixa de gravidade. */
export function SeletorGlasgow({ valor, aoMudar, erro, className }: SeletorGlasgowProps) {
  const id = useId();
  const faltam = EIXOS.filter((eixo) => valor[eixo] === null);
  const total = faltam.length ? null : EIXOS.reduce((soma, eixo) => soma + (valor[eixo] ?? 0), 0);
  return (
    <div className={cx('mf-glasgow', className)} data-invalido={!!erro}>
      <div className="mf-glasgow__grade">
        <output className="mf-glasgow__total" aria-live="polite">
          <span className="mf-rotulo">Glasgow</span>
          <span className="mf-glasgow__numero">{total ?? '—'}</span>
          <span className="mf-glasgow__composicao">
            {EIXOS.map((eixo) => `${ESCALA_GLASGOW[eixo].letra}${valor[eixo] ?? '–'}`).join('  ')}
          </span>
          <span className="mf-glasgow__falta">
            {faltam.length ? `Falta: ${faltam.map((eixo) => ESCALA_GLASGOW[eixo].rotulo.split(' ')[1]).join(', ')}` : 'Soma de 3 a 15'}
          </span>
        </output>
        <div className="mf-glasgow__eixos">
          {EIXOS.map((eixo) => {
            const { rotulo, letra, respostas } = ESCALA_GLASGOW[eixo];
            return (
              <SeletorSegmentado
                key={eixo}
                className="mf-glasgow__eixo"
                rotulo={`${rotulo} (${letra})`}
                valor={valor[eixo] === null ? null : String(valor[eixo])}
                aoMudar={(nota) => aoMudar({ ...valor, [eixo]: Number(nota) })}
                opcoes={respostas.map((detalhe, i) => ({ valor: String(i + 1), rotulo: String(i + 1), detalhe }))}
              />
            );
          })}
        </div>
      </div>
      <Mensagens id={id} erro={erro} />
    </div>
  );
}

/* ───────── Tipo sanguíneo ───────── */

const GRUPOS = ['A', 'B', 'AB', 'O'] as const;
const FATORES = [
  { sinal: '+', nome: 'positivo' },
  { sinal: '-', nome: 'negativo' },
] as const;

export const TIPOS_SANGUINEOS = FATORES.flatMap((f) => GRUPOS.map((g) => `${g}${f.sinal}`));

export interface SeletorTipoSanguineoProps {
  /** '' = não informado. */
  valor: string;
  aoMudar: (valor: string) => void;
  rotulo?: string;
  erro?: ReactNode;
  className?: string;
}

/** Grade ABO × Rh: uma linha por fator, uma coluna por grupo. "Não informado" é uma escolha explícita. */
export function SeletorTipoSanguineo({ valor, aoMudar, rotulo = 'Tipo sanguíneo', erro, className }: SeletorTipoSanguineoProps) {
  const nome = useId();
  const opcao = (tipo: string, conteudo: ReactNode, extra?: string) => (
    <label key={tipo || 'nenhum'} className={cx('mf-sangue__opcao', extra)}>
      <input type="radio" name={nome} value={tipo} checked={valor === tipo} onChange={() => aoMudar(tipo)} />
      {conteudo}
    </label>
  );
  return (
    <div className={cx('mf-campo', className)} data-invalido={!!erro}>
      <fieldset className="mf-sangue">
        <legend className="mf-rotulo">{rotulo}</legend>
        <div className="mf-sangue__grade">
          {FATORES.flatMap((f) =>
            GRUPOS.map((g) =>
              opcao(
                `${g}${f.sinal}`,
                <>
                  <span className="mf-sangue__grupo">{g}</span>
                  <span className="mf-sangue__fator" aria-hidden>
                    {f.sinal === '+' ? '+' : '−'}
                  </span>
                  <span className="mf-so-leitor"> {f.nome}</span>
                </>,
              ),
            ),
          )}
          {opcao('', <span>Não informado</span>, 'mf-sangue__opcao--nenhum')}
        </div>
      </fieldset>
      <Mensagens id={`${nome}-msg`} erro={erro} />
    </div>
  );
}
