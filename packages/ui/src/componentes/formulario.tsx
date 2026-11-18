// Um componente por tipo de campo de formulário. Todos usam a mesma caixa (`mf-campo`) de `campos.tsx`.
import { Eye, EyeOff, Plus, X } from 'lucide-react';
import { useId, useState, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cx } from '../util';
import { CampoTexto, Mensagens, type CampoBase, type CampoTextoProps } from './campos';

/* ───────── Área de texto ───────── */

export interface CampoAreaProps extends CampoBase, TextareaHTMLAttributes<HTMLTextAreaElement> {
  linhas?: number;
}

/** Texto livre de várias linhas (observação, procedimento, desfecho). */
export function CampoArea({ rotulo, ajuda, erro, linhas = 3, className, id, disabled, ...resto }: CampoAreaProps) {
  const gerado = useId();
  const idCampo = id ?? gerado;
  const idMensagem = `${idCampo}-msg`;
  return (
    <div className={cx('mf-campo mf-campo--area', className)} data-invalido={!!erro} data-desabilitado={!!disabled}>
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
        </label>
        <textarea
          {...resto}
          id={idCampo}
          rows={linhas}
          disabled={disabled}
          className="mf-campo__entrada"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro || ajuda ? idMensagem : undefined}
        />
      </div>
      <Mensagens id={idMensagem} ajuda={ajuda} erro={erro} />
    </div>
  );
}

/* ───────── Campos de tipo fixo ───────── */

type CampoFixo = Omit<CampoTextoProps, 'type'>;

/** AAAA-MM-DD no fuso local. */
const hoje = () => new Date().toLocaleDateString('sv-SE');

/** Data com o calendário do navegador. Por padrão não aceita data futura. */
export function CampoData({ max, permitirFuturo, ...resto }: CampoFixo & { permitirFuturo?: boolean }) {
  return <CampoTexto {...resto} type="date" max={max ?? (permitirFuturo ? undefined : hoje())} />;
}

export function CampoEmail(props: CampoFixo) {
  return <CampoTexto inputMode="email" autoComplete="off" spellCheck={false} {...props} type="email" />;
}

/** Senha com mostrar/ocultar; o estado está no nome do botão, não só no ícone. */
export function CampoSenha(props: CampoFixo) {
  const [visivel, setVisivel] = useState(false);
  return (
    <CampoTexto
      {...props}
      type={visivel ? 'text' : 'password'}
      sufixo={
        <button
          type="button"
          className="mf-campo__acao"
          aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
          aria-pressed={visivel}
          onClick={() => setVisivel(!visivel)}
        >
          {visivel ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </button>
      }
    />
  );
}

/* ───────── Campos com máscara ───────── */

/** Encaixa os dígitos de `texto` no padrão (`0` = dígito) e para no primeiro dígito que faltar. */
export function mascarar(texto: string, padrao: string): string {
  const digitos = texto.replace(/\D/g, '');
  let saida = '';
  let i = 0;
  for (const simbolo of padrao) {
    if (i >= digitos.length) break;
    saida += simbolo === '0' ? digitos[i++] : simbolo;
  }
  return saida;
}

export interface CampoMascaraProps extends Omit<CampoTextoProps, 'type' | 'onChange' | 'value'> {
  value: string;
  /** Recebe o texto formatado; para gravar, guarde só os dígitos. */
  aoMudar: (formatado: string) => void;
}

function campoMascarado(padrao: (digitos: string) => string, extras: Partial<CampoTextoProps>) {
  return function CampoMascarado({ value, aoMudar, ...resto }: CampoMascaraProps) {
    const formatar = (texto: string) => mascarar(texto, padrao(texto.replace(/\D/g, '')));
    return (
      <CampoTexto
        inputMode="numeric"
        autoComplete="off"
        {...extras}
        {...resto}
        maxLength={padrao('0'.repeat(20)).length}
        value={formatar(value)}
        onChange={(e) => aoMudar(formatar(e.target.value))}
      />
    );
  };
}

export const CampoCpf = campoMascarado(() => '000.000.000-00', { placeholder: '000.000.000-00' });
export const CampoCns = campoMascarado(() => '000 0000 0000 0000', { placeholder: '000 0000 0000 0000' });
/** Fixo (10 dígitos) ou celular (11), com DDD. */
export const CampoTelefone = campoMascarado((d) => (d.length > 10 ? '(00) 00000-0000' : '(00) 0000-00000'), {
  type: 'tel',
  placeholder: '(00) 00000-0000',
});

/* ───────── Escolha rápida (fichas + "Outra") ───────── */

export interface SeletorRapidoProps {
  rotulo: string;
  opcoes: readonly string[];
  /** '' = nada escolhido. Valor fora de `opcoes` abre o campo "Outra". */
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: ReactNode;
  className?: string;
}

/** Um clique em vez de digitar: opções comuns como fichas; "Outra" abre texto livre. Clicar de novo desmarca. */
export function SeletorRapido({ rotulo, opcoes, valor, aoMudar, erro, className }: SeletorRapidoProps) {
  const nome = useId();
  // Para limpar de fora (inclusive o "Outra" aberto), remonte o formulário com uma `key` nova.
  const [outra, setOutra] = useState(valor !== '' && !opcoes.includes(valor));
  const ficha = (chave: string, texto: string, marcada: boolean, aoClicar: () => void) => (
    <label key={chave} className="mf-ficha">
      <input type="radio" name={nome} checked={marcada} onChange={() => undefined} onClick={aoClicar} />
      <span>{texto}</span>
    </label>
  );
  return (
    <div className={cx('mf-campo', className)} data-invalido={!!erro}>
      <fieldset className="mf-fichas">
        <legend className="mf-rotulo">{rotulo}</legend>
        <div className="mf-fichas__opcoes">
          {opcoes.map((opcao) =>
            ficha(opcao, opcao, !outra && valor === opcao, () => {
              setOutra(false);
              aoMudar(valor === opcao ? '' : opcao);
            }),
          )}
          {ficha('__outra', 'Outra', outra, () => {
            setOutra(!outra);
            aoMudar('');
          })}
        </div>
      </fieldset>
      {outra ? (
        <CampoTexto className="mt-2" rotulo={`${rotulo} (outra)`} value={valor} onChange={(e) => aoMudar(e.target.value)} autoComplete="off" autoFocus />
      ) : null}
      <Mensagens id={`${nome}-msg`} erro={erro} />
    </div>
  );
}

/* ───────── Lista de itens (fichas digitadas) ───────── */

export interface CampoItensProps extends CampoBase {
  valor: readonly string[];
  aoMudar: (itens: string[]) => void;
  /** Atalhos de um clique; somem quando já estão na lista. */
  sugestoes?: readonly string[];
  placeholder?: string;
  className?: string;
}

const separarItens = (texto: string) =>
  texto
    .split(/[,;\n]/)
    .map((parte) => parte.trim())
    .filter(Boolean);

/**
 * Vários itens curtos (alergias, comorbidades): Enter, vírgula ou ponto e vírgula fecha o item.
 * Cada item vira uma ficha removível; Backspace no campo vazio tira o último.
 */
export function CampoItens({ rotulo, ajuda, erro, valor, aoMudar, sugestoes = [], placeholder, className }: CampoItensProps) {
  const idCampo = useId();
  const idMensagem = `${idCampo}-msg`;
  const [texto, setTexto] = useState('');
  const tem = (item: string) => valor.some((v) => v.toLowerCase() === item.toLowerCase());

  function acrescentar(bruto: string) {
    const novos = [...new Set(separarItens(bruto))].filter((item) => !tem(item));
    if (novos.length) aoMudar([...valor, ...novos]);
    setTexto('');
  }

  function aoTeclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Enter' && texto.trim()) {
      evento.preventDefault();
      acrescentar(texto);
    } else if (evento.key === 'Backspace' && !texto && valor.length) {
      aoMudar(valor.slice(0, -1));
    }
  }

  const livres = sugestoes.filter((s) => !tem(s));
  return (
    <div className={cx('mf-campo mf-campo--itens', className)} data-invalido={!!erro}>
      <div className="mf-campo__caixa">
        <label className="mf-rotulo" htmlFor={idCampo}>
          {rotulo}
        </label>
        <div className="mf-itens">
          {valor.map((item) => (
            <span key={item} className="mf-item">
              {item}
              <button type="button" aria-label={`Remover ${item}`} onClick={() => aoMudar(valor.filter((v) => v !== item))}>
                <X aria-hidden />
              </button>
            </span>
          ))}
          <input
            id={idCampo}
            className="mf-campo__entrada"
            value={texto}
            placeholder={valor.length ? 'Mais um…' : placeholder}
            autoComplete="off"
            onChange={(e) => (/[,;]/.test(e.target.value) ? acrescentar(e.target.value) : setTexto(e.target.value))}
            onKeyDown={aoTeclar}
            onBlur={() => texto.trim() && acrescentar(texto)}
            aria-invalid={erro ? true : undefined}
            aria-describedby={idMensagem}
          />
        </div>
      </div>
      {livres.length ? (
        <div className="mf-sugestoes" role="group" aria-label={`Atalhos de ${rotulo.toLowerCase()}`}>
          {livres.map((s) => (
            <button key={s} type="button" className="mf-sugestao" onClick={() => aoMudar([...valor, s])}>
              <Plus aria-hidden />
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <Mensagens id={idMensagem} ajuda={ajuda ?? 'Enter ou vírgula separa os itens.'} erro={erro} />
    </div>
  );
}

/* ───────── Lista de escolha (linhas de rádio) ───────── */

export interface OpcaoLista {
  valor: string;
  titulo: ReactNode;
  detalhe?: ReactNode;
}

export interface SeletorListaProps {
  rotulo: string;
  opcoes: readonly OpcaoLista[];
  valor: string;
  aoMudar: (valor: string) => void;
  vazio?: ReactNode;
  erro?: ReactNode;
  className?: string;
}

/** Escolha única entre itens de duas linhas (ex.: o registro a retificar). Rola depois de ~6 itens. */
export function SeletorLista({ rotulo, opcoes, valor, aoMudar, vazio, erro, className }: SeletorListaProps) {
  const nome = useId();
  return (
    <div className={cx('mf-campo', className)} data-invalido={!!erro}>
      <fieldset className="mf-lista-escolha">
        <legend className="mf-rotulo">{rotulo}</legend>
        {opcoes.length ? (
          <div className="mf-lista-escolha__itens">
            {opcoes.map((opcao) => (
              <label key={opcao.valor} className="mf-lista-escolha__item">
                <input type="radio" name={nome} value={opcao.valor} checked={valor === opcao.valor} onChange={() => aoMudar(opcao.valor)} />
                <span className="mf-lista-escolha__marca" aria-hidden />
                <span className="mf-lista-escolha__texto">
                  <span className="mf-lista-escolha__titulo">{opcao.titulo}</span>
                  {opcao.detalhe ? <span className="mf-lista-escolha__detalhe">{opcao.detalhe}</span> : null}
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="mf-lista-escolha__vazio">{vazio ?? 'Nada para escolher.'}</p>
        )}
      </fieldset>
      <Mensagens id={`${nome}-msg`} erro={erro} />
    </div>
  );
}
