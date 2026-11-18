import { CircleAlert, CircleCheck, Info, Inbox, RotateCw, X, type LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from '../util';
import { Botao } from './Botao';

/* ───────── Marca ───────── */

/** Duas vias sobrepostas: a folha e sua cópia rosa. */
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cx('mf-marca-nome', className)}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="var(--mf-marca)" />
        <path d="M9.75 5.5h4.5v4.25h4.25v4.5h-4.25v4.25h-4.5v-4.25H5.5v-4.5h4.25z" fill="var(--mf-sobre-marca)" />
      </svg>
      MedicalField
    </span>
  );
}

/* ───────── Seção (folha) ───────── */

export interface SecaoProps {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  /** Sem recuo interno: para tabela ou linha do tempo que vai até a borda. */
  rente?: boolean;
  children: ReactNode;
  className?: string;
}

/** Folha com cabeçalho de fio grosso. Não aninhe uma seção em outra. */
export function Secao({ titulo, descricao, acoes, rente, children, className }: SecaoProps) {
  const id = useId();
  return (
    <section className={cx('mf-secao', className)} aria-labelledby={id}>
      <header className="mf-secao__topo">
        <div>
          <h2 id={id} className="mf-secao__titulo">
            {titulo}
          </h2>
          {descricao ? <p className="mf-secao__descricao">{descricao}</p> : null}
        </div>
        {acoes ? <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>{acoes}</div> : null}
      </header>
      <div className={cx('mf-secao__corpo', rente && 'mf-secao__corpo--rente')}>{children}</div>
    </section>
  );
}

/* ───────── Diálogo ───────── */

export interface DialogoProps {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  children: ReactNode;
  /** Botões do rodapé; a ação principal vem por último. */
  acoes?: ReactNode;
}

/**
 * `<dialog>` nativo: foco preso, Esc fecha, fundo inerte.
 * Use só quando a tarefa pede interrupção (confirmar algo irreversível, enviar e-mail).
 */
export function Dialogo({ aberto, aoFechar, titulo, children, acoes }: DialogoProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const idTitulo = useId();

  useEffect(() => {
    const dialogo = ref.current;
    if (!dialogo) return;
    if (aberto && !dialogo.open) dialogo.showModal();
    if (!aberto && dialogo.open) dialogo.close();
  }, [aberto]);

  return (
    <dialog
      ref={ref}
      className="mf-dialogo"
      aria-labelledby={idTitulo}
      onClose={aoFechar}
      onClick={(evento) => {
        // Clique no véu (o próprio <dialog>) fecha.
        if (evento.target === ref.current) aoFechar();
      }}
    >
      <header className="mf-dialogo__topo">
        <h2 id={idTitulo} className="mf-dialogo__titulo">
          {titulo}
        </h2>
        <Botao variante="fantasma" somenteIcone aria-label="Fechar" icone={<X aria-hidden />} onClick={aoFechar} />
      </header>
      <div className="mf-dialogo__corpo">{children}</div>
      {acoes ? <footer className="mf-dialogo__acoes">{acoes}</footer> : null}
    </dialog>
  );
}

/* ───────── Toast ───────── */

export type TomToast = 'info' | 'sucesso' | 'erro';

const ICONE_TOAST: Record<TomToast, LucideIcon> = { info: Info, sucesso: CircleCheck, erro: CircleAlert };
const PREFIXO_TOAST: Record<TomToast, string> = { info: '', sucesso: 'Concluído: ', erro: 'Erro: ' };

export interface ToastProps {
  tom?: TomToast;
  titulo: ReactNode;
  descricao?: ReactNode;
  /** Ação curta (ex.: "Desfazer", "Tentar de novo"). */
  acao?: { rotulo: string; aoClicar: () => void };
  aoFechar?: () => void;
}

/** Aviso passageiro em bloco invertido. O tom vem do ícone e do texto, não só da cor. */
export function Toast({ tom = 'info', titulo, descricao, acao, aoFechar }: ToastProps) {
  const Icone = ICONE_TOAST[tom];
  return (
    <div className="mf-toast mf-invertido" data-tom={tom} role={tom === 'erro' ? 'alert' : 'status'}>
      <Icone aria-hidden />
      <div className="mf-toast__texto">
        <div className="mf-toast__titulo">
          <span className="mf-so-leitor">{PREFIXO_TOAST[tom]}</span>
          {titulo}
        </div>
        {descricao ? <div className="mf-toast__descricao">{descricao}</div> : null}
      </div>
      {acao ? <Botao onClick={acao.aoClicar}>{acao.rotulo}</Botao> : null}
      {aoFechar ? (
        <Botao variante="fantasma" somenteIcone aria-label="Dispensar aviso" icone={<X aria-hidden />} onClick={aoFechar} />
      ) : null}
    </div>
  );
}

export interface ToastNaPilha extends ToastProps {
  id: string;
}

/** Pilha de toasts: `const { toasts, avisar, dispensar } = useToasts()` + `<PilhaToasts />`. */
export function useToasts(duracaoMs = 6000) {
  const [toasts, setToasts] = useState<ToastNaPilha[]>([]);
  const dispensar = useCallback((id: string) => setToasts((lista) => lista.filter((toast) => toast.id !== id)), []);
  const avisar = useCallback(
    (toast: ToastProps) => {
      const id = crypto.randomUUID();
      setToasts((lista) => [...lista, { ...toast, id }]);
      // Erro fica até ser dispensado: o profissional precisa ver.
      if (toast.tom !== 'erro') setTimeout(() => dispensar(id), duracaoMs);
      return id;
    },
    [dispensar, duracaoMs],
  );
  return { toasts, avisar, dispensar };
}

export function PilhaToasts({ toasts, aoDispensar }: { toasts: ToastNaPilha[]; aoDispensar: (id: string) => void }) {
  return (
    <div className="mf-toasts">
      {toasts.map(({ id, ...toast }) => (
        <Toast key={id} {...toast} aoFechar={() => aoDispensar(id)} />
      ))}
    </div>
  );
}

/* ───────── Estado vazio e de erro ───────── */

export interface EstadoVazioProps {
  titulo: string;
  /** Diga o que aparece aqui e como fazer aparecer. */
  descricao?: ReactNode;
  icone?: ReactNode;
  acao?: ReactNode;
  className?: string;
}

export function EstadoVazio({ titulo, descricao, icone, acao, className }: EstadoVazioProps) {
  return (
    <div className={cx('mf-vazio', className)}>
      {icone ?? <Inbox aria-hidden />}
      <p className="mf-vazio__titulo">{titulo}</p>
      {descricao ? <p className="mf-vazio__descricao">{descricao}</p> : null}
      {acao ? <div className="mf-vazio__acao">{acao}</div> : null}
    </div>
  );
}

export interface EstadoErroProps {
  /** O que falhou, em palavras do usuário. */
  titulo: string;
  /** O que fazer agora. */
  descricao?: ReactNode;
  aoTentarDeNovo?: () => void;
  /** `requestId` devolvido pela API, para o suporte localizar no log. */
  requestId?: string;
  className?: string;
}

export function EstadoErro({ titulo, descricao, aoTentarDeNovo, requestId, className }: EstadoErroProps) {
  return (
    <div className={cx('mf-vazio mf-vazio--erro', className)} role="alert">
      <CircleAlert aria-hidden />
      <p className="mf-vazio__titulo">{titulo}</p>
      {descricao ? <p className="mf-vazio__descricao">{descricao}</p> : null}
      {aoTentarDeNovo ? (
        <div className="mf-vazio__acao">
          <Botao icone={<RotateCw aria-hidden />} onClick={aoTentarDeNovo}>
            Tentar de novo
          </Botao>
        </div>
      ) : null}
      {requestId ? <p className="mf-vazio__codigo">Protocolo {requestId}</p> : null}
    </div>
  );
}

/* ───────── Esqueleto ───────── */

export interface EsqueletoProps {
  /** Quantas linhas de texto simular. */
  linhas?: number;
  /** Largura CSS da linha (a última sai mais curta quando há várias). */
  largura?: string;
  altura?: string;
  className?: string;
}

/** Marca o lugar do conteúdo enquanto carrega. Envolva a região em `aria-busy="true"`. */
export function Esqueleto({ linhas = 1, largura = '100%', altura, className }: EsqueletoProps) {
  return (
    <span className={className} style={{ display: 'grid', gap: '0.5rem' }} aria-hidden>
      {Array.from({ length: linhas }, (_, indice) => (
        <span
          key={indice}
          className="mf-esqueleto"
          style={{ width: linhas > 1 && indice === linhas - 1 ? '60%' : largura, height: altura }}
        />
      ))}
    </span>
  );
}

