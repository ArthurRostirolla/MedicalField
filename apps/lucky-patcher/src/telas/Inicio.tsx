import { Botao, EstadoErro, EstadoVazio, Esqueleto, SeloSync } from '@medicalfield/ui';
import { ChevronRight, ClipboardPlus, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { AtendimentoLocal } from '../dados/atendimentos.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConectividade, useConsulta, useContagens, useMotor, useSessao } from '../ui/contexto.tsx';
import { formatarMomento } from '../ui/formato.ts';

export function LinhaAtendimento({ atendimento }: { atendimento: AtendimentoLocal }) {
  return (
    <li>
      <Link className="lp-linha" to={`/atendimentos/${atendimento.id}`}>
        <span className="lp-linha__texto">
          <span className="lp-linha__titulo">{atendimento.pessoaNome}</span>
          <span className="lp-linha__apoio">
            <time className="mf-dado" dateTime={atendimento.iniciadoEm}>
              {formatarMomento(atendimento.iniciadoEm)}
            </time>
            {atendimento.queixaPrincipal ? ` · ${atendimento.queixaPrincipal}` : ''}
            {atendimento.status === 'ENCERRADO' ? ' · encerrado' : ''}
          </span>
        </span>
        {atendimento.envio !== 'confirmado' ? <SeloSync estado={atendimento.envio} /> : null}
        <ChevronRight aria-hidden />
      </Link>
    </li>
  );
}

export function Inicio() {
  const app = useApp();
  const navegar = useNavigate();
  const sessao = useSessao();
  const conexao = useConectividade();
  const motor = useMotor();
  const { pendentes, rejeitadas } = useContagens();
  const [resultado, setResultado] = useState<string | null>(null);

  const dados = useConsulta(
    async () => ({
      abertos: await app.atendimentos.abertos(),
      encerrados: await app.atendimentos.encerradosRecentes(5),
      medicamentos: await app.medicamentos.contar(),
      pessoas: await app.pessoas.contar(),
    }),
    [],
  );

  async function sincronizar() {
    setResultado(null);
    await app.monitor.verificar();
    const r = await app.motor.sincronizar('manual');
    setResultado(
      r.erro
        ? `Não sincronizou: ${r.erro} Os registros continuam guardados neste aparelho.`
        : `Sincronizado. ${r.confirmadas} ${r.confirmadas === 1 ? 'enviado' : 'enviados'}, ${r.recebidas} ${r.recebidas === 1 ? 'recebido' : 'recebidos'}${r.rejeitadas ? `, ${r.rejeitadas} ${r.rejeitadas === 1 ? 'rejeitado' : 'rejeitados'}` : ''}.`,
    );
  }

  return (
    <Casca titulo="Início" subtitulo={sessao ? `${sessao.profissional.nome} · ${sessao.profissional.tipoRegistro} ${sessao.profissional.registro}` : undefined} atual="inicio">
      <Botao variante="primario" largo icone={<ClipboardPlus aria-hidden />} onClick={() => navegar('/pacientes')}>
        Novo atendimento
      </Botao>

      <section aria-labelledby="titulo-abertos">
        <div className="lp-cabecalho">
          <h2 id="titulo-abertos" className="mf-secao__titulo">
            Atendimentos em aberto
          </h2>
          {dados.dados?.abertos.length ? <span className="mf-rotulo">{dados.dados.abertos.length}</span> : null}
        </div>
        {dados.erro ? (
          <EstadoErro titulo="Não foi possível ler o banco local" descricao={dados.erro.message} aoTentarDeNovo={dados.recarregar} />
        ) : !dados.dados ? (
          <Esqueleto linhas={3} altura="2.5rem" />
        ) : dados.dados.abertos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum atendimento em aberto"
            descricao="Os atendimentos que você iniciar neste aparelho ficam aqui até serem encerrados."
          />
        ) : (
          <ul className="lp-lista">
            {dados.dados.abertos.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="titulo-situacao">
        <div className="lp-cabecalho">
          <h2 id="titulo-situacao" className="mf-secao__titulo">
            Situação
          </h2>
        </div>
        <dl className="lp-fatos">
          <div>
            <dt className="mf-rotulo">Rede</dt>
            <dd>
              {conexao.online ? 'Online' : 'Offline'}
              <small>
                {conexao.online
                  ? 'O que você registra sobe em seguida.'
                  : conexao.simulandoOffline
                    ? 'Simulação ligada: nada sai do aparelho.'
                    : 'Sem contato com o servidor. Tudo fica guardado e sobe quando a rede voltar.'}
              </small>
            </dd>
          </div>
          <div>
            <dt className="mf-rotulo">Pendências</dt>
            <dd>
              {pendentes === 0 ? 'Nenhuma' : <Link to="/pendencias">{pendentes === 1 ? '1 registro a enviar' : `${pendentes} registros a enviar`}</Link>}
              {rejeitadas > 0 ? <small>{rejeitadas === 1 ? '1 rejeitado pelo servidor: precisa de correção.' : `${rejeitadas} rejeitados pelo servidor: precisam de correção.`}</small> : null}
            </dd>
          </div>
          <div>
            <dt className="mf-rotulo">Última sincronização</dt>
            <dd>
              {motor.ultimaSync ? (
                <time className="mf-dado" dateTime={motor.ultimaSync}>
                  {formatarMomento(motor.ultimaSync)}
                </time>
              ) : (
                'Ainda não sincronizou'
              )}
            </dd>
          </div>
          <div>
            <dt className="mf-rotulo">Neste aparelho</dt>
            <dd aria-busy={dados.carregando}>
              {dados.dados ? (
                <span data-testid="contagem-local">
                  <span className="mf-num">{dados.dados.medicamentos}</span> medicamentos · <span className="mf-num">{dados.dados.pessoas}</span> pacientes
                </span>
              ) : (
                <Esqueleto largura="12rem" />
              )}
            </dd>
          </div>
        </dl>
      </section>

      <div className="lp-bloco">
        <Botao largo disabled={conexao.simulandoOffline} carregando={motor.sincronizando} icone={<RefreshCw aria-hidden />} onClick={() => void sincronizar()}>
          Sincronizar agora
        </Botao>
        {conexao.simulandoOffline ? (
          <p className="lp-nota">Simulação de offline ligada: desligue a chave “Simular offline”, no alto, para enviar.</p>
        ) : null}
        {resultado ? (
          <p className="lp-nota" role="status">
            {resultado}
          </p>
        ) : null}
      </div>

      {dados.dados?.encerrados.length ? (
        <section aria-labelledby="titulo-encerrados">
          <div className="lp-cabecalho">
            <h2 id="titulo-encerrados" className="mf-secao__titulo">
              Encerrados recentes
            </h2>
          </div>
          <ul className="lp-lista">
            {dados.dados.encerrados.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </ul>
        </section>
      ) : null}
    </Casca>
  );
}
