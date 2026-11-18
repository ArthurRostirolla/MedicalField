// Campos de formulario: rotulo dentro da caixa, ajuda ou erro embaixo (mesmo desenho do design system web).
import { Check, Minus, Plus } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { Botao, Icone, Rotulo, Texto, estiloNumeral, type LucideIcon } from './base.tsx';
import { Mensagens } from './mensagens.tsx';
import { useEstilos, useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

interface CampoBase {
  rotulo: string;
  ajuda?: ReactNode;
  /** Mensagem de erro: diz o problema e como resolver. */
  erro?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

function useCaixa(invalido: boolean, desabilitado: boolean, focado: boolean) {
  const { cores } = useTema();
  return {
    borderWidth: focado ? 2 : 1,
    borderColor: invalido ? cores.carmim : focado ? cores.foco : cores.fioForte,
    borderRadius: MEDIDA.raio,
    backgroundColor: desabilitado ? cores.papel2 : cores.papel,
    paddingHorizontal: MEDIDA.recuo - (focado ? 1 : 0),
    paddingTop: 6,
    paddingBottom: 7,
  } satisfies ViewStyle;
}

/* ───────── Campo de texto ───────── */

export interface CampoTextoProps extends CampoBase, Omit<TextInputProps, 'style'> {
  sufixo?: ReactNode;
  disabled?: boolean;
  /** Varias linhas (o antigo CampoArea). */
  linhas?: number;
}

export function CampoTexto({ rotulo, ajuda, erro, sufixo, disabled, linhas, style, ...resto }: CampoTextoProps) {
  const { cores } = useTema();
  const [focado, setFocado] = useState(false);
  const caixa = useCaixa(!!erro, !!disabled, focado);
  return (
    <View style={style}>
      <View style={caixa}>
        <Rotulo style={disabled ? { color: cores.tinta3 } : undefined}>{rotulo}</Rotulo>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            {...resto}
            aria-label={rotulo}
            aria-invalid={erro ? true : undefined}
            editable={!disabled}
            multiline={!!linhas}
            numberOfLines={linhas}
            placeholderTextColor={cores.tinta3}
            onFocus={(evento) => {
              setFocado(true);
              resto.onFocus?.(evento);
            }}
            onBlur={(evento) => {
              setFocado(false);
              resto.onBlur?.(evento);
            }}
            style={{
              flex: 1,
              color: disabled ? cores.tinta3 : cores.tinta,
              fontSize: MEDIDA.corpo,
              fontWeight: '500',
              minHeight: linhas ? MEDIDA.corpoAltura * linhas : MEDIDA.alvo - 24,
              paddingVertical: 0,
              textAlignVertical: linhas ? 'top' : 'center',
              outlineStyle: 'none',
            } as object}
          />
          {sufixo}
        </View>
      </View>
      <Mensagens ajuda={ajuda} erro={erro} />
    </View>
  );
}

/** Texto de varias linhas. */
export function CampoArea({ linhas = 3, ...resto }: CampoTextoProps) {
  return <CampoTexto {...resto} linhas={linhas} />;
}

/* ───────── Campo numerico grande ───────── */

export interface CampoNumericoProps extends CampoBase {
  valor: number | null;
  /** Recebe `null` quando o campo esta vazio ou fora da faixa. */
  aoMudar: (valor: number | null) => void;
  unidade?: string;
  min?: number;
  max?: number;
  passo?: number;
  /** Casas decimais aceitas (ex.: 1 para temperatura). */
  casas?: number;
  /** Mostra os botoes - e + (alvos de 48 px ou mais). */
  comPassos?: boolean;
  desabilitado?: boolean;
  placeholder?: string;
}

/** `null` = vazio; `NaN` = texto que nao e numero. */
function interpretar(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

function formatar(valor: number | null, casas: number): string {
  return valor === null ? '' : valor.toFixed(casas).replace('.', ',');
}

function foraDosLimites(numero: number, min?: number, max?: number): boolean {
  return Number.isNaN(numero) || (min !== undefined && numero < min) || (max !== undefined && numero > max);
}

/**
 * Entrada rapida de sinal vital. Aceita virgula ou ponto e os botoes de passo.
 * A faixa (`min`/`max`) e so limite de digitacao plausivel, nao interpretacao clinica.
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
  style,
  placeholder = '—',
}: CampoNumericoProps) {
  const { cores } = useTema();
  const [texto, setTexto] = useState(() => formatar(valor, casas));
  const [focado, setFocado] = useState(false);
  const foraDaFaixa = (numero: number | null): boolean => numero !== null && foraDosLimites(numero, min, max);

  // Mudanca vinda de fora (ex.: limpar o formulario) reescreve o texto;
  // texto invalido em edicao (valor externo `null`) fica para o usuario corrigir.
  useEffect(() => {
    setTexto((atual) => {
      const lido = interpretar(atual);
      if (lido === valor) return atual;
      if (valor === null && lido !== null && foraDosLimites(lido, min, max)) return atual;
      return formatar(valor, casas);
    });
  }, [valor, casas, min, max]);

  const lido = interpretar(texto);
  const erroDeFaixa = foraDaFaixa(lido)
    ? min !== undefined && max !== undefined
      ? `Digite um valor entre ${formatar(min, casas)} e ${formatar(max, casas)}.`
      : 'Digite um número válido.'
    : undefined;
  const mensagemErro = erro ?? erroDeFaixa;
  const caixa = useCaixa(!!mensagemErro, !!desabilitado, focado);

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

  return (
    <View style={style}>
      <View style={caixa}>
        <Rotulo>{rotulo}</Rotulo>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            aria-label={unidade ? `${rotulo} (${unidade})` : rotulo}
            aria-invalid={mensagemErro ? true : undefined}
            inputMode={casas > 0 ? 'decimal' : 'numeric'}
            autoComplete="off"
            enterKeyHint="next"
            placeholder={placeholder}
            placeholderTextColor={cores.tinta3}
            value={texto}
            editable={!desabilitado}
            onChangeText={(novo) => escrever(novo.replace(/[^\d.,-]/g, ''))}
            onFocus={() => setFocado(true)}
            onBlur={() => setFocado(false)}
            style={{ flex: 1, minWidth: 0, color: cores.tinta, paddingVertical: 0, ...estiloNumeral, outlineStyle: 'none' } as object}
          />
          {unidade ? (
            <Texto tom="tinta2" aria-hidden style={{ paddingBottom: 6 }}>
              {unidade}
            </Texto>
          ) : null}
          {comPassos ? (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <Botao somenteIcone icone={Minus} aria-label={`Diminuir ${rotulo}`} disabled={desabilitado} onPress={() => andar(-1)} />
              <Botao somenteIcone icone={Plus} aria-label={`Aumentar ${rotulo}`} disabled={desabilitado} onPress={() => andar(1)} />
            </View>
          ) : null}
        </View>
      </View>
      <Mensagens ajuda={ajuda} erro={mensagemErro} />
    </View>
  );
}

/* ───────── Seletor segmentado (grupo de radio) ───────── */

export interface OpcaoSegmento<T extends string> {
  valor: T;
  rotulo: ReactNode;
  /** Linha menor sob o rotulo (ex.: descricao da resposta do Glasgow). */
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
  /** Opcoes em coluna (muitas opcoes com detalhe). */
  vertical?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SeletorSegmentado<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoMudar,
  rotuloOculto,
  vertical,
  style,
}: SeletorSegmentadoProps<T>) {
  const { cores } = useTema();
  return (
    <View role="group" aria-label={rotulo} style={style}>
      {rotuloOculto ? null : <Rotulo style={{ marginBottom: 4 }}>{rotulo}</Rotulo>}
      <View role="radiogroup" style={{ flexDirection: vertical ? 'column' : 'row' }}>
        {opcoes.map((opcao, indice) => {
          const marcado = valor === opcao.valor;
          const primeiro = indice === 0;
          const ultimo = indice === opcoes.length - 1;
          return (
            <Pressable
              key={opcao.valor}
              role="radio"
              aria-checked={marcado}
              aria-disabled={opcao.desabilitado || undefined}
              disabled={opcao.desabilitado}
              onPress={() => aoMudar(opcao.valor)}
              style={{
                flex: vertical ? undefined : 1,
                minHeight: MEDIDA.alvo,
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                padding: 4,
                marginRight: vertical ? 0 : -1,
                marginBottom: vertical ? -1 : 0,
                borderWidth: 1,
                borderColor: marcado ? cores.marca : cores.fioForte,
                backgroundColor: marcado ? cores.marcaSuave : cores.papel,
                borderBottomWidth: marcado ? 3 : 1,
                zIndex: marcado ? 1 : 0,
                opacity: opcao.desabilitado ? 0.45 : 1,
                borderTopLeftRadius: primeiro ? MEDIDA.raio : 0,
                borderBottomLeftRadius: (vertical ? ultimo : primeiro) ? MEDIDA.raio : 0,
                borderTopRightRadius: (vertical ? primeiro : ultimo) ? MEDIDA.raio : 0,
                borderBottomRightRadius: ultimo ? MEDIDA.raio : 0,
              }}
            >
              {typeof opcao.rotulo === 'string' ? (
                <Texto forte={marcado} style={{ fontWeight: marcado ? '700' : '600', textAlign: 'center' }}>
                  {opcao.rotulo}
                </Texto>
              ) : (
                opcao.rotulo
              )}
              {opcao.detalhe ? (
                <Texto tamanho="rotulo" tom="tinta2" style={{ textAlign: 'center' }}>
                  {opcao.detalhe}
                </Texto>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ───────── Seletor em cartoes (escolha unica com icone) ───────── */

export interface OpcaoCartao<T extends string> {
  valor: T;
  /** Nome do radio: o que o leitor de tela anuncia. */
  titulo: string;
  detalhe?: string;
  icone: LucideIcon;
}

export interface SeletorCartoesProps<T extends string> {
  rotulo: string;
  opcoes: ReadonlyArray<OpcaoCartao<T>>;
  valor: T;
  aoMudar: (valor: T) => void;
  /** Um cartao por linha (icone, texto, selo): para escolha que leva a outra tela. */
  empilhado?: boolean;
}

/** Poucas opcoes grandes, cada uma com icone, titulo e detalhe (`.mf-cartao` do web). */
export function SeletorCartoes<T extends string>({ rotulo, opcoes, valor, aoMudar, empilhado }: SeletorCartoesProps<T>) {
  const s = useEstilos((c) => ({
    cartao: { minHeight: MEDIDA.alvo, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raioSobreposicao, backgroundColor: c.papel },
    grade: { flex: 1, padding: 10, gap: 4 },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    marcado: { borderColor: c.marca, backgroundColor: c.marcaSuave },
    selo: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.marca, alignItems: 'center', justifyContent: 'center' },
  }));
  const { cores } = useTema();
  return (
    <View role="radiogroup" aria-label={rotulo} style={{ gap: 8 }}>
      <Texto tamanho="pequeno" forte tom="tinta2">
        {rotulo}
      </Texto>
      <View style={{ flexDirection: empilhado ? 'column' : 'row', gap: 8 }}>
        {opcoes.map((opcao) => {
          const marcado = valor === opcao.valor;
          const icone = <Icone icone={opcao.icone} cor={marcado ? cores.marca : cores.tinta2} tamanho={empilhado ? 24 : 22} />;
          const selo = marcado ? (
            <View style={s.selo}>
              <Icone icone={Check} cor={cores.sobreMarca} tamanho={13} />
            </View>
          ) : null;
          const detalhe = opcao.detalhe ? (
            <Texto tom="tinta2" style={{ fontSize: 13, lineHeight: 17 }}>
              {opcao.detalhe}
            </Texto>
          ) : null;
          return (
            <Pressable
              key={opcao.valor}
              role="radio"
              aria-checked={marcado}
              aria-label={opcao.titulo}
              onPress={() => aoMudar(opcao.valor)}
              style={({ pressed }) => [s.cartao, empilhado ? s.linha : s.grade, marcado && s.marcado, pressed && { transform: [{ scale: 0.98 }] }]}
            >
              {empilhado ? (
                <>
                  {icone}
                  <View style={{ flex: 1 }}>
                    <Texto forte>{opcao.titulo}</Texto>
                    {detalhe}
                  </View>
                  {selo}
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', minHeight: 22 }}>
                    {icone}
                    {selo}
                  </View>
                  <Texto forte>{opcao.titulo}</Texto>
                  {detalhe}
                </>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export { Select } from './Select'; // Select.web.tsx na web (select nativo do navegador)
export { Mensagens, type SelectProps } from './mensagens.tsx';
