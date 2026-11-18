import { Check, ChevronDown, CircleAlert, Minus, Plus } from 'lucide-react';
import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { cx } from '../util';

interface CampoBase {
  rotulo: string;
  ajuda?: ReactNode;
  /** Mensagem de erro: diz o problema e como resolver. */
  erro?: ReactNode;
}

function Mensagens({ id, ajuda, erro }: { id: string; ajuda?: ReactNode; erro?: ReactNode }) {
  if (erro) {
    return (
      <p id={id} className="mf-campo__erro">
        <CircleAlert aria-hidden />
        <span>{erro}</span>
      </p>
    );
  }
  return ajuda ? (
    <p id={id} className="mf-campo__ajuda">
      {ajuda}
    </p>
  ) : null;
}

/* ───────── Campo de texto ───────── */

export interface CampoTextoProps extends CampoBase, InputHTMLAttributes<HTMLInputElement> {
  sufixo?: ReactNode;
}

export function CampoTexto({ rotulo, ajuda, erro, sufixo, className, id, disabled, ...resto }: CampoTextoProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idMensagem = `${idCampo}-msg`;
  return (
    <div className={cx('mf-campo', className)} data-invalido={!!erro} data-desabilitado={!!disabled}>
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
        </label>
        <input
          {...resto}
          id={idCampo}
          disabled={disabled}
          className="mf-campo__entrada"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || ajuda ? idMensagem : undefined}
        />
        {sufixo ? <span className="mf-campo__sufixo">{sufixo}</span> : null}
      </div>
      <Mensagens id={idMensagem} ajuda={ajuda} erro={erro} />
    </div>
  );
}

/* ───────── Campo numérico grande ───────── */

export interface CampoNumericoProps extends CampoBase {
  valor: number | null;
  /** Recebe `null` quando o campo está vazio ou fora da faixa. */
  aoMudar: (valor: number | null) => void;
  unidade?: string;
  min?: number;
  max?: number;
  passo?: number;
  /** Casas decimais aceitas (ex.: 1 para temperatura). */
  casas?: number;
  /** Mostra os botões − e + (alvos de 48 px ou mais). */
  comPassos?: boolean;
  desabilitado?: boolean;
  className?: string;
  placeholder?: string;
}

/** `null` = vazio; `NaN` = texto que não é número. */
function interpretar(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function formatar(valor: number | null, casas: number): string {
  return valor === null ? '' : valor.toFixed(casas).replace('.', ',');
}

/**
 * Entrada rápida de sinal vital. Aceita vírgula ou ponto, setas ↑/↓ e os botões de passo.
 * A faixa (`min`/`max`) é só limite de digitação plausível — não é interpretação clínica.
 */
export function CampoNumerico({
  rotulo,
  valor,
  aoMudar,
  unidade,
  min,
  max,
  passo = 1,
  casas = 0,
  comPassos,
  desabilitado,
  ajuda,
  erro,
  className,
  placeholder = '—',
}: CampoNumericoProps) {
  const idCampo = useId();
  const idMensagem = `${idCampo}-msg`;
  const [texto, setTexto] = useState(() => formatar(valor, casas));

  const foraDaFaixa = (numero: number | null): boolean => numero !== null && foraDosLimites(numero, min, max);

  // Mudança vinda de fora (ex.: limpar o formulário) reescreve o texto;
  // texto inválido em edição (valor externo `null`) fica para o usuário corrigir.
  useEffect(() => {
    setTexto((atual) => {
      const lido = interpretar(atual);
      if (lido === valor) return atual;
      if (valor === null && lido !== null && foraDosLimites(lido, min, max)) return atual;
      return formatar(valor, casas);
    });
  }, [valor, casas, min, max]);

  const lido = interpretar(texto);
  const invalido = foraDaFaixa(lido);
  const erroDeFaixa = invalido
    ? min !== undefined && max !== undefined
      ? `Digite um valor entre ${formatar(min, casas)} e ${formatar(max, casas)}.`
      : 'Digite um número válido.'
    : undefined;
  const mensagemErro = erro ?? erroDeFaixa;

  function escrever(novo: string) {
    setTexto(novo);
    const numero = interpretar(novo);
    aoMudar(foraDaFaixa(numero) ? null : numero);
  }

  function andar(direcao: 1 | -1) {
    const semValor = lido === null || Number.isNaN(lido);
    const base = semValor ? (direcao === 1 ? (min ?? 0) - passo : (max ?? 0) + passo) : lido;
    const proximo = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, base + direcao * passo));
    escrever(formatar(proximo, casas));
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowUp' || evento.key === 'ArrowDown') {
      evento.preventDefault();
      andar(evento.key === 'ArrowUp' ? 1 : -1);
    }
  }

  return (
    <div
      className={cx('mf-campo mf-campo--numerico', className)}
      data-invalido={!!mensagemErro}
      data-desabilitado={!!desabilitado}
    >
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
          {unidade ? <span className="mf-so-leitor"> ({unidade})</span> : null}
        </label>
        <input
          id={idCampo}
          className="mf-campo__entrada"
          type="text"
          inputMode={casas > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          enterKeyHint="next"
          placeholder={placeholder}
          value={texto}
          disabled={desabilitado}
          onChange={(evento) => escrever(evento.target.value.replace(/[^\d.,-]/g, ''))}
          onKeyDown={aoTeclar}
          aria-invalid={mensagemErro ? true : undefined}
          aria-describedby={mensagemErro || ajuda ? idMensagem : undefined}
        />
        {unidade || comPassos ? (
          <span className="mf-campo__sufixo">
            {unidade ? <span aria-hidden>{unidade}</span> : null}
            {comPassos ? (
              <span className="mf-passos">
                <button
                  type="button"
                  className="mf-passo"
                  aria-label={`Diminuir ${rotulo}`}
                  disabled={desabilitado}
                  onClick={() => andar(-1)}
                >
                  <Minus aria-hidden />
                </button>
                <button
                  type="button"
                  className="mf-passo"
                  aria-label={`Aumentar ${rotulo}`}
                  disabled={desabilitado}
                  onClick={() => andar(1)}
                >
                  <Plus aria-hidden />
                </button>
              </span>
            ) : null}
          </span>
        ) : null}
      </div>
      <Mensagens id={idMensagem} ajuda={ajuda} erro={mensagemErro} />
    </div>
  );
}

function foraDosLimites(numero: number, min?: number, max?: number): boolean {
  return Number.isNaN(numero) || (min !== undefined && numero < min) || (max !== undefined && numero > max);
}

/* ───────── Select (nativo) ───────── */

export interface SelectProps extends CampoBase, SelectHTMLAttributes<HTMLSelectElement> {
  opcoes?: Array<{ valor: string; rotulo: string }>;
  /** Texto da opção vazia inicial. */
  vazio?: string;
}

export function Select({ rotulo, ajuda, erro, opcoes, vazio, className, id, disabled, children, ...resto }: SelectProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idMensagem = `${idCampo}-msg`;
  return (
    <div className={cx('mf-campo', className)} data-invalido={!!erro} data-desabilitado={!!disabled}>
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
        </label>
        <select
          {...resto}
          id={idCampo}
          disabled={disabled}
          className="mf-campo__entrada"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || ajuda ? idMensagem : undefined}
        >
          {vazio !== undefined ? <option value="">{vazio}</option> : null}
          {opcoes?.map((opcao) => (
            <option key={opcao.valor} value={opcao.valor}>
              {opcao.rotulo}
            </option>
          ))}
          {children}
        </select>
        <ChevronDown className="mf-campo__seta" aria-hidden />
      </div>
      <Mensagens id={idMensagem} ajuda={ajuda} erro={erro} />
    </div>
  );
}

/* ───────── Seletor segmentado (grupo de rádio) ───────── */

export interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: ReactNode;
  /** Linha menor sob o rótulo (ex.: descrição da resposta do Glasgow). */
  detalhe?: ReactNode;
  desabilitado?: boolean;
}

export interface SeletorSegmentadoProps<T extends string> {
  rotulo: string;
  opcoes: ReadonlyArray<OpcaoSegmento<T>>;
  valor: T | null;
  aoMudar: (valor: T) => void;
  /** Esconde a legenda visualmente (continua lida por leitor de tela). */
  rotuloOculto?: boolean;
  className?: string;
}

export function SeletorSegmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  rotuloOculto,
  className,
}: SeletorSegmentadoProps<T>) {
  const nome = useId();
  return (
    <fieldset className={cx('mf-segmentado', className)}>
      <legend className={rotuloOculto ? 'mf-so-leitor' : 'mf-rotulo'}>{rotulo}</legend>
      <div className="mf-segmentado__opcoes">
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className="mf-segmentado__opcao">
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              disabled={opcao.desabilitado}
              onChange={() => aoMudar(opcao.valor)}
            />
            <span>{opcao.rotulo}</span>
            {opcao.detalhe ? <span className="mf-segmentado__detalhe">{opcao.detalhe}</span> : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────── Seletor em cartões (escolha única com ícone) ───────── */

export interface OpcaoCartao<T extends string> {
  valor: T;
  /** Nome do rádio: o que o leitor de tela anuncia. */
  titulo: string;
  detalhe?: string;
  icone: ReactNode;
}

export interface SeletorCartoesProps<T extends string> {
  rotulo: string;
  opcoes: ReadonlyArray<OpcaoCartao<T>>;
  valor: T;
  aoMudar: (valor: T) => void;
  className?: string;
}

/** Poucas opções grandes (até 3 por linha), cada uma com ícone, título e detalhe. */
export function SeletorCartoes<T extends string>({ rotulo, opcoes, valor, aoMudar, className }: SeletorCartoesProps<T>) {
  const nome = useId();
  return (
    <fieldset className={cx('mf-cartoes', className)}>
      <legend className="mf-cartoes__legenda">{rotulo}</legend>
      <div className="mf-cartoes__grade">
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className="mf-cartao">
            <input
              type="radio"
              name={nome}
              value={opcao.valor}
              checked={valor === opcao.valor}
              onChange={() => aoMudar(opcao.valor)}
              aria-labelledby={`${nome}-${opcao.valor}`}
              aria-describedby={opcao.detalhe ? `${nome}-${opcao.valor}-detalhe` : undefined}
            />
            <Check aria-hidden className="mf-cartao__marca" />
            <span className="mf-cartao__icone" aria-hidden>
              {opcao.icone}
            </span>
            <span id={`${nome}-${opcao.valor}`} className="mf-cartao__titulo">
              {opcao.titulo}
            </span>
            {opcao.detalhe ? (
              <span id={`${nome}-${opcao.valor}-detalhe`} className="mf-cartao__detalhe">
                {opcao.detalhe}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/* ───────── Checkbox e chave ───────── */

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  children: ReactNode;
}

export function Checkbox({ children, className, ...resto }: CheckboxProps) {
  return (
    <label className={cx('mf-check', className)}>
      <input {...resto} type="checkbox" />
      <span className="mf-check__caixa" aria-hidden>
        <Check />
      </span>
      <span>{children}</span>
    </label>
  );
}

export interface ChaveProps {
  marcado: boolean;
  aoMudar: (marcado: boolean) => void;
  children: ReactNode;
  desabilitado?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Chave liga/desliga (`role="switch"`). O estado aparece pela posição do cursor, não só pela cor. */
export function Chave({ marcado, aoMudar, children, desabilitado, className, ...resto }: ChaveProps) {
  return (
    <button
      {...resto}
      type="button"
      role="switch"
      aria-checked={marcado}
      disabled={desabilitado}
      className={cx('mf-chave', className)}
      onClick={() => aoMudar(!marcado)}
    >
      <span className="mf-chave__trilho" aria-hidden />
      <span>{children}</span>
    </button>
  );
}
