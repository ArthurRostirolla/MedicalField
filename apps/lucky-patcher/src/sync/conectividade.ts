// Padrao Observer: publica um estado unico de conectividade.
//   online = NAO simulando offline  E  servidor alcancavel
// MotorSincronizacao e a barra de status assinam; ninguem consulta a rede por conta propria.

export interface EstadoConectividade {
  simulandoOffline: boolean;
  /** Resultado do ultimo ping ao servidor. */
  servidorAlcancavel: boolean;
  online: boolean;
}

export interface DependenciasMonitor {
  /** Tenta falar com o servidor; `true` se houve resposta. Passa pelo cliente HTTP unico. */
  ping(): Promise<boolean>;
  simulacaoInicial: boolean;
  /** Persiste o seletor (sync_estado.modo_simulado). */
  persistirSimulacao(simulandoOffline: boolean): Promise<void>;
  agendar?(funcao: () => void, ms: number): () => void;
  intervaloOnlineMs?: number;
  intervaloForaMs?: number;
}

type Ouvinte = (estado: EstadoConectividade, anterior: EstadoConectividade) => void;

const agendarPadrao = (funcao: () => void, ms: number) => {
  const id = setTimeout(funcao, ms);
  return () => clearTimeout(id);
};

export class MonitorConectividade {
  private ouvintes = new Set<Ouvinte>();
  private cancelarProximo: (() => void) | null = null;
  private ativo = false;
  private pingEmCurso: Promise<void> | null = null;
  estado: EstadoConectividade;

  constructor(private readonly deps: DependenciasMonitor) {
    this.estado = { simulandoOffline: deps.simulacaoInicial, servidorAlcancavel: false, online: false };
  }

  assinar(ouvinte: Ouvinte): () => void {
    this.ouvintes.add(ouvinte);
    return () => this.ouvintes.delete(ouvinte);
  }

  /** Comeca a verificar o servidor periodicamente (e ja verifica uma vez). */
  iniciar(): Promise<void> {
    this.ativo = true;
    return this.verificar();
  }

  parar(): void {
    this.ativo = false;
    this.cancelarProximo?.();
    this.cancelarProximo = null;
  }

  /** O seletor "Simular conectividade". Persistido antes de valer. */
  async definirSimulacao(simulandoOffline: boolean): Promise<void> {
    await this.deps.persistirSimulacao(simulandoOffline);
    // Ao sair da simulacao nao se presume nada: so fica online depois de o ping confirmar.
    this.publicar(simulandoOffline ? { simulandoOffline } : { simulandoOffline, servidorAlcancavel: false });
    if (!simulandoOffline) await this.verificar();
  }

  /** A rede do aparelho caiu (evento `offline` do sistema): nao precisa esperar o proximo ping. */
  informarSemRede(): void {
    this.publicar({ servidorAlcancavel: false });
  }

  /** Verifica agora. Simulando offline, nao emite requisicao nenhuma. */
  verificar(): Promise<void> {
    if (this.pingEmCurso) return this.pingEmCurso;
    const tarefa = (async () => {
      if (this.estado.simulandoOffline) return;
      const alcancou = await this.deps.ping().catch(() => false);
      this.publicar({ servidorAlcancavel: alcancou });
    })().finally(() => {
      // `finally` sempre roda depois da atribuicao abaixo, mesmo quando nada foi aguardado.
      this.pingEmCurso = null;
      this.reagendar();
    });
    this.pingEmCurso = tarefa;
    return tarefa;
  }

  private reagendar(): void {
    this.cancelarProximo?.();
    this.cancelarProximo = null;
    if (!this.ativo) return;
    const ms = this.estado.online ? (this.deps.intervaloOnlineMs ?? 20_000) : (this.deps.intervaloForaMs ?? 5_000);
    this.cancelarProximo = (this.deps.agendar ?? agendarPadrao)(() => void this.verificar(), ms);
  }

  private publicar(mudanca: Partial<Omit<EstadoConectividade, 'online'>>): void {
    const anterior = this.estado;
    const proximo = { ...anterior, ...mudanca };
    proximo.online = !proximo.simulandoOffline && proximo.servidorAlcancavel;
    if (
      proximo.online === anterior.online &&
      proximo.simulandoOffline === anterior.simulandoOffline &&
      proximo.servidorAlcancavel === anterior.servidorAlcancavel
    ) {
      return;
    }
    this.estado = proximo;
    for (const ouvinte of this.ouvintes) ouvinte(proximo, anterior);
  }
}
