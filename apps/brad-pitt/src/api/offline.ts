// Modo offline do portal: a versão de navegador do que o app de campo (lucky-patcher) faz com SQLite.
//  - "Simular offline" ligado => o cliente HTTP recusa toda chamada ANTES do fetch (cliente.ts);
//  - escrita clínica sem servidor => vira um comando na fila (outbox) em localStorage,
//    com `opId` = Idempotency-Key (o mesmo contrato do app);
//  - ao voltar => a fila sobe em ordem, um comando por vez; o servidor deduplica pelo opId.
// ponytail: a fila guarda só escritas; leitura offline é o que o cache do React Query já tem.
import { CABECALHOS } from '@medicalfield/contratos';
import { z } from 'zod';
import { api, definirOfflineSimulado, ErroApi, lerSessao } from './cliente';

export interface Comando {
  opId: string;
  caminho: string;
  corpo: unknown;
  /** Texto curto para a barra/aviso. */
  descricao: string;
  /** Só quem gravou sobe o comando: a auditoria do servidor registra o autor pelo token. */
  profissionalId: string;
  criadoEm: string;
}

export interface Rejeicao {
  comando: Comando;
  motivo: string;
}

export interface EstadoOffline {
  simulando: boolean;
  /** `navigator.onLine`: a rede do computador. */
  redeDoComputador: boolean;
  fila: Comando[];
  sincronizando: boolean;
  ultimaSync: string | null;
}

const CHAVE = 'mf-portal-offline';

function carregar(): Pick<EstadoOffline, 'simulando' | 'fila'> {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Partial<EstadoOffline> | null;
    return { simulando: salvo?.simulando === true, fila: Array.isArray(salvo?.fila) ? salvo.fila : [] };
  } catch {
    return { simulando: false, fila: [] };
  }
}

let estado: EstadoOffline = {
  ...carregar(),
  redeDoComputador: typeof navigator === 'undefined' ? true : navigator.onLine,
  sincronizando: false,
  ultimaSync: null,
};
definirOfflineSimulado(estado.simulando);

const ouvintes = new Set<() => void>();

function publicar(mudanca: Partial<EstadoOffline>): void {
  estado = { ...estado, ...mudanca };
  if ('simulando' in mudanca || 'fila' in mudanca) {
    try {
      // A fila é gravada ANTES de a tela dizer "gravado": fechar a aba não perde nada.
      localStorage.setItem(CHAVE, JSON.stringify({ simulando: estado.simulando, fila: estado.fila }));
    } catch {
      // Armazenamento bloqueado: a fila vale até fechar a aba.
    }
  }
  ouvintes.forEach((ouvinte) => ouvinte());
}

export const lerOffline = (): EstadoOffline => estado;
export function assinarOffline(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

const quemEsta = (): string | null => {
  const sessao = lerSessao();
  return sessao.situacao === 'ativa' ? sessao.profissional.id : null;
};

/** O seletor "Simular offline". Persistido: recarregar a página continua offline. */
export function definirSimulacao(simulando: boolean): void {
  definirOfflineSimulado(simulando);
  publicar({ simulando });
}

/**
 * Escrita clínica. Online e sem fila: vai direto. Simulando, sem rede, ou com fila na frente:
 * entra na fila (a ordem é parte do contrato — um evento não pode chegar antes do atendimento).
 * Devolve a própria entrada quando enfileira: quem chama só usa o sucesso, não a resposta.
 */
export async function escrever<S extends z.ZodType>(caminho: string, esquema: S, corpo: unknown, descricao: string): Promise<z.infer<S>> {
  if (!estado.simulando && estado.fila.length === 0) {
    try {
      return await api(caminho, esquema, { metodo: 'POST', corpo });
    } catch (erro) {
      // Só "não houve resposta" vira fila. 4xx/5xx são respostas: quem chama mostra o erro.
      if (!(erro instanceof ErroApi && erro.status === null)) throw erro;
    }
  }
  const profissionalId = quemEsta();
  if (!profissionalId) throw new ErroApi(401, 'NAO_AUTENTICADO', 'Sua sessão terminou. Entre de novo.');
  const comando: Comando = { opId: crypto.randomUUID(), caminho, corpo, descricao, profissionalId, criadoEm: new Date().toISOString() };
  publicar({ fila: [...estado.fila, comando] });
  void sincronizar();
  return corpo as z.infer<S>;
}

let emCurso: Promise<void> | null = null;
let pedidoNoMeio = false;
let aoRejeitar: (rejeitadas: Rejeicao[]) => void = () => undefined;

/**
 * Esvazia a fila do profissional logado, em ordem. Nunca roda duas ao mesmo tempo: um pedido no
 * meio pede mais uma passada (pode ter entrado comando novo), e quem pediu espera por ela.
 *  - 2xx                  => confirmado, sai da fila;
 *  - sem resposta/5xx/401 => para; o comando fica para a próxima (o reenvio é seguro pelo opId);
 *  - 4xx                  => rejeição definitiva: sai da fila e vai para o aviso da tela.
 */
export function sincronizar(): Promise<void> {
  if (emCurso) {
    pedidoNoMeio = true;
    return emCurso;
  }
  emCurso = (async () => {
    do {
      pedidoNoMeio = false;
      const rejeitadas = await subir();
      if (rejeitadas.length) aoRejeitar(rejeitadas);
    } while (pedidoNoMeio);
  })().finally(() => {
    emCurso = null;
  });
  return emCurso;
}

async function subir(): Promise<Rejeicao[]> {
  const rejeitadas: Rejeicao[] = [];
  const quem = quemEsta();
  if (estado.simulando || !quem) return rejeitadas;
  publicar({ sincronizando: true });
  let completa = true;
  try {
    for (;;) {
      const comando = estado.fila.find((c) => c.profissionalId === quem);
      if (!comando) break;
      try {
        await api(comando.caminho, z.unknown(), {
          metodo: 'POST',
          corpo: comando.corpo,
          cabecalhos: { [CABECALHOS.chaveIdempotencia]: comando.opId },
        });
      } catch (erro) {
        if (!(erro instanceof ErroApi) || erro.transitorio || erro.codigo === 'NAO_AUTENTICADO') {
          completa = false;
          break;
        }
        rejeitadas.push({ comando, motivo: erro.message });
      }
      publicar({ fila: estado.fila.filter((c) => c.opId !== comando.opId) });
    }
  } finally {
    publicar({ sincronizando: false, ...(completa && { ultimaSync: new Date().toISOString() }) });
  }
  return rejeitadas;
}

/** Liga os gatilhos: rede do computador voltou/caiu e uma nova tentativa a cada 15 s com fila. */
export function iniciarOffline(avisar: (rejeitadas: Rejeicao[]) => void): () => void {
  aoRejeitar = avisar;
  const tentar = () => void sincronizar();
  const aoVoltar = () => {
    publicar({ redeDoComputador: true });
    tentar();
  };
  const aoCair = () => publicar({ redeDoComputador: false });
  window.addEventListener('online', aoVoltar);
  window.addEventListener('offline', aoCair);
  // ponytail: intervalo fixo de 15 s; backoff exponencial (como o motor do app) se a fila crescer.
  const relogio = setInterval(() => estado.fila.length > 0 && tentar(), 15_000);
  tentar(); // abertura: o que ficou da última vez sobe agora
  return () => {
    window.removeEventListener('online', aoVoltar);
    window.removeEventListener('offline', aoCair);
    clearInterval(relogio);
    aoRejeitar = () => undefined;
  };
}

/** Só para testes. */
export function reiniciarOfflineParaTeste(): void {
  definirOfflineSimulado(false);
  estado = { simulando: false, redeDoComputador: true, fila: [], sincronizando: false, ultimaSync: null };
}
