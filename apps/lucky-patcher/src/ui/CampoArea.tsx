// Texto de varias linhas com a mesma caixa de campo do design system (que so traz <input>).
import { CircleAlert } from 'lucide-react';
import { useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

export interface CampoAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string;
  ajuda?: ReactNode;
  erro?: ReactNode;
  linhas?: number;
}

export function CampoArea({ rotulo, ajuda, erro, linhas = 3, id, ...resto }: CampoAreaProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idMensagem = `${idCampo}-msg`;
  return (
    <div className="mf-campo" data-invalido={!!erro}>
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
        </label>
        <textarea
          {...resto}
          id={idCampo}
          rows={linhas}
          className="mf-campo__entrada"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || ajuda ? idMensagem : undefined}
        />
      </div>
      {erro ? (
        <p id={idMensagem} className="mf-campo__erro">
          <CircleAlert aria-hidden />
          <span>{erro}</span>
        </p>
      ) : ajuda ? (
        <p id={idMensagem} className="mf-campo__ajuda">
          {ajuda}
        </p>
      ) : null}
    </div>
  );
}
