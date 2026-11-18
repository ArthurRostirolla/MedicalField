// Liga a interface ao nucleo: as telas so enxergam repositorios locais e estados publicados.
import { Botao, Dialogo, PilhaToasts, useToasts, type ToastProps } from '@medicalfield/ui';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { App } from '../app.ts';
import { ErroValidacao } from '../dados/contexto.ts';
import type { Contagens } from '../dados/pendencias.ts';

interface ContextoInterface {
  app: App;
  avisar: (toast: ToastProps) => void;
  /** Erro de gravacao local: dialogo bloqueante, nunca um "salvo" falso. */
  mostrarFalhaDeGravacao: (erro: unknown) => void;
}

const Contexto = createContext<ContextoInterface | null>(null);

function usar(): ContextoInterface {
  const contexto = useContext(Contexto);
  if (!contexto) throw new Error('Fora do ProvedorApp');
  return contexto;
}

export const useApp = (): App => usar().app;
export const useAvisar = () => usar().avisar;

export function ProvedorApp({ app, children }: { app: App; children: ReactNode }) {
  const { toasts, avisar, dispensar } = useToasts();
  const [falha, setFalha] = useState<string | null>(null);
  const mostrarFalhaDeGravacao = useCallback(
    (erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      setFalha(mensagem);
      void app.registrarLog('ERRO_GRAVACAO_LOCAL', 'FALHA', { mensagem });
    },
    [app],
  );
  const valor = useMemo(() => ({ app, avisar, mostrarFalhaDeGravacao }), [app, avisar, mostrarFalhaDeGravacao]);
  return (
    <Contexto.Provider value={valor}>
      {children}
      <Dialogo
        aberto={falha !== null}
        aoFechar={() => setFalha(null)}
        titulo="O registro NÃO foi gravado"
        acoes={
          <Botao variante="primario" onClick={() => setFalha(null)}>
            Entendi
          </Botao>
        }
      >
        <p style={{ margin: 0 }}>
          O aparelho não conseguiu gravar no banco local e nada foi salvo. Anote o dado em papel, confira o espaço livre do
          aparelho e tente de novo.
        </p>
        <p className="mf-dado" style={{ margin: '0.75rem 0 0', overflowWrap: 'anywhere' }}>
          {falha}
        </p>
      </Dialogo>
      <PilhaToasts toasts={toasts} aoDispensar={dispensar} />
    </Contexto.Provider>
  );
}

/** Estado de conectividade publicado pelo MonitorConectividade (Observer). */
export function useConectividade() {
  const { monitor } = useApp();
  return useSyncExternalStore(
    useCallback((avisar: () => void) => monitor.assinar(avisar), [monitor]),
    () => monitor.estado,
  );
}

export function useMotor() {
  const { motor } = useApp();
  return useSyncExternalStore(
    useCallback((avisar: () => void) => motor.assinar(avisar), [motor]),
    () => motor.estado,
  );
}

export function useSessao() {
  const { sessao } = useApp();
  return useSyncExternalStore(
    useCallback((avisar: () => void) => sessao.assinar(avisar), [sessao]),
    () => sessao.atual,
  );
}

export interface Consulta<T> {
  dados: T | undefined;
  erro: Error | null;
  carregando: boolean;
  recarregar: () => void;
}

/** Le do banco local e rele sozinho a cada escrita (do profissional ou da sincronizacao). */
export function useConsulta<T>(consultar: () => Promise<T>, dependencias: readonly unknown[]): Consulta<T> {
  const { banco } = useApp();
  const versao = useSyncExternalStore(
    useCallback((avisar: () => void) => banco.assinar(avisar), [banco]),
    () => banco.versao,
  );
  const [estado, setEstado] = useState<{ dados: T | undefined; erro: Error | null; carregando: boolean }>({
    dados: undefined,
    erro: null,
    carregando: true,
  });
  const [tentativa, setTentativa] = useState(0);
  const funcao = useRef(consultar);
  funcao.current = consultar;

  useEffect(() => {
    let vivo = true;
    funcao.current().then(
      (dados) => vivo && setEstado({ dados, erro: null, carregando: false }),
      (erro: unknown) =>
        vivo && setEstado((atual) => ({ ...atual, erro: erro instanceof Error ? erro : new Error(String(erro)), carregando: false })),
    );
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versao, tentativa, ...dependencias]);

  return { ...estado, recarregar: () => setTentativa((n) => n + 1) };
}

const SEM_PENDENCIAS: Contagens = { pendentes: 0, rejeitadas: 0 };

export function useContagens(): Contagens {
  const app = useApp();
  return useConsulta(() => app.pendencias.contar(), []).dados ?? SEM_PENDENCIAS;
}

/**
 * Executa uma gravacao local. Erro de validacao volta campo a campo para o formulario;
 * qualquer outra falha abre o dialogo bloqueante. Devolve `true` so se gravou de fato.
 */
export function useGravar() {
  const { mostrarFalhaDeGravacao } = usar();
  const [gravando, setGravando] = useState(false);
  const [campos, setCampos] = useState<Record<string, string>>({});
  const gravar = useCallback(
    async (operacao: () => Promise<unknown>): Promise<boolean> => {
      setGravando(true);
      setCampos({});
      try {
        await operacao();
        return true;
      } catch (erro) {
        if (erro instanceof ErroValidacao) setCampos(erro.campos);
        else mostrarFalhaDeGravacao(erro);
        return false;
      } finally {
        setGravando(false);
      }
    },
    [mostrarFalhaDeGravacao],
  );
  return { gravar, gravando, campos, limparCampos: useCallback(() => setCampos({}), []) };
}
