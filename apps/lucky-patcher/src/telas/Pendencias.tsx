import { Botao, Dialogo, EstadoErro, EstadoVazio, Esqueleto, SeloSync, type EstadoSync } from '@medicalfield/ui';
import { CircleCheck, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Comando, SituacaoFila } from '../dados/outbox.ts';
import type { Pendencia } from '../dados/pendencias.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useAvisar, useConectividade, useConsulta, useGravar, useMotor, useSessao } from '../ui/contexto.tsx';
import { formatarMomento } from '../ui/formato.ts';

const SELO: Record<SituacaoFila, { estado: EstadoSync; rotulo?: string }> = {
  ENVIAVEL: { estado: 'local', rotulo: 'Na fila' },
  ENVIANDO: { estado: 'enviando' },
  REJEITADA: { estado: 'rejeitado', rotulo: 'Rejeitada' },
  RETIDA: { estado: 'local', rotulo: 'Retida' },
  DE_OUTRO_PROFISSIONAL: { estado: 'local', rotulo: 'De outro login' },
};

function apoio({ comando, situacao }: Pendencia): string {
  const criado = `Registrado ${formatarMomento(comando.criadoEm)}`;
  if (situacao === 'RETIDA') return `${criado} · aguarda uma operação anterior ser aceita`;
  if (situacao === 'DE_OUTRO_PROFISSIONAL') return `${criado} · sobe quando quem registrou entrar de novo`;
  if (situacao === 'REJEITADA') return criado;
  const partes = [criado];
  if (comando.tentativas > 0) partes.push(`${comando.tentativas} ${comando.tentativas === 1 ? 'tentativa' : 'tentativas'}`);
  if (comando.proximaTentativaEm) partes.push(`próxima às ${formatarMomento(comando.proximaTentativaEm)}`);
  return partes.join(' · ');
}

export function Pendencias() {
  const app = useApp();
  const avisar = useAvisar();
  const sessao = useSessao();
  const conexao = useConectividade();
  const motor = useMotor();
  const { gravar, gravando } = useGravar();
  const [descarte, setDescarte] = useState<{ comando: Comando; cadeia: Comando[] } | null>(null);
  const fila = useConsulta(() => app.pendencias.listar(sessao?.profissional.id ?? null), [sessao?.profissional.id]);

  const rejeitadas = fila.dados?.filter((item) => item.situacao === 'REJEITADA') ?? [];
  const demais = fila.dados?.filter((item) => item.situacao !== 'REJEITADA') ?? [];

  async function sincronizar() {
    await app.monitor.verificar();
    const r = await app.motor.sincronizar('manual');
    if (r.erro) avisar({ titulo: 'Não sincronizou', descricao: `${r.erro} Os registros continuam guardados.` });
  }

  return (
    <Casca titulo="Pendências" subtitulo="O que ainda não está confirmado na central" atual="pendencias">
      <div className="lp-bloco">
        <Botao
          variante="primario"
          largo
          disabled={conexao.simulandoOffline}
          carregando={motor.sincronizando}
          icone={<RefreshCw aria-hidden />}
          onClick={() => void sincronizar()}
        >
          Sincronizar agora
        </Botao>
        <p className="lp-nota" role="status">
          {conexao.online
            ? 'Online: a fila sobe sozinha, uma operação por vez, na ordem em que foi registrada.'
            : conexao.simulandoOffline
              ? 'Simulação de offline ligada: desligue a chave “Simular offline”, no alto, para enviar.'
              : 'Sem contato com o servidor: a fila sobe sozinha quando a rede voltar.'}
          {motor.ultimoErro && conexao.online ? ` Última tentativa: ${motor.ultimoErro}` : ''}
        </p>
      </div>

      {fila.erro ? (
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={fila.erro.message} aoTentarDeNovo={fila.recarregar} />
      ) : !fila.dados ? (
        <Esqueleto linhas={4} altura="2.5rem" />
      ) : fila.dados.length === 0 ? (
        <EstadoVazio
          icone={<CircleCheck aria-hidden />}
          titulo="Tudo enviado"
          descricao="Nenhuma operação aguardando neste aparelho. O que você registrar offline aparece aqui até a central confirmar."
        />
      ) : null}

      {rejeitadas.length > 0 ? (
        <section aria-label="Rejeitadas pelo servidor">
          <div className="lp-cabecalho">
            <h2 className="mf-secao__titulo">Rejeitadas pelo servidor</h2>
            <span className="mf-rotulo">{rejeitadas.length}</span>
          </div>
          <ul className="lp-lista">
            {rejeitadas.map(({ comando, situacao }) => (
              <li key={comando.opId} data-testid="pendencia-rejeitada">
                <div className="lp-linha">
                  <span className="lp-linha__texto">
                    <span className="lp-linha__titulo">{comando.descricao}</span>
                    <span className="lp-linha__apoio">{apoio({ comando, situacao })}</span>
                    <span className="lp-linha__apoio" style={{ color: 'var(--mf-carmim)' }}>
                      Motivo: {comando.ultimoErro ?? 'não informado'}
                    </span>
                  </span>
                  <SeloSync {...SELO[situacao]} />
                </div>
                <div className="lp-linha__acoes">
                  {comando.entidade === 'pessoa' ? (
                    <Link className="mf-botao mf-botao--primario" to={`/pendencias/${comando.opId}/corrigir`}>
                      Corrigir
                    </Link>
                  ) : null}
                  <Botao disabled={gravando} onClick={() => void gravar(() => app.pendencias.tentarDeNovo(comando.opId))}>
                    Tentar de novo
                  </Botao>
                  <Botao
                    variante="perigo"
                    disabled={gravando}
                    onClick={async () => setDescarte({ comando, cadeia: await app.pendencias.cadeiaDe(comando.opId) })}
                  >
                    Descartar
                  </Botao>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {demais.length > 0 ? (
        <section aria-label="Fila de envio">
          <div className="lp-cabecalho">
            <h2 className="mf-secao__titulo">Fila de envio</h2>
            <span className="mf-rotulo">{demais.length}</span>
          </div>
          <ol className="lp-lista">
            {demais.map((item) => (
              <li key={item.comando.opId} data-testid="pendencia-fila">
                <div className="lp-linha">
                  <span className="lp-linha__texto">
                    <span className="lp-linha__titulo">{item.comando.descricao}</span>
                    <span className="lp-linha__apoio">{apoio(item)}</span>
                    {item.comando.ultimoErro && item.situacao === 'ENVIAVEL' ? (
                      <span className="lp-linha__apoio">Última falha: {item.comando.ultimoErro}</span>
                    ) : null}
                  </span>
                  <SeloSync {...SELO[item.situacao]} />
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <Dialogo
        aberto={descarte !== null}
        aoFechar={() => setDescarte(null)}
        titulo="Descartar este registro?"
        acoes={
          <>
            <Botao onClick={() => setDescarte(null)}>Manter</Botao>
            <Botao
              variante="perigo"
              carregando={gravando}
              onClick={async () => {
                if (!descarte) return;
                if (await gravar(() => app.pendencias.descartar(descarte.comando.opId))) setDescarte(null);
              }}
            >
              Descartar {descarte && descarte.cadeia.length > 1 ? `${descarte.cadeia.length} operações` : ''}
            </Botao>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          <strong>{descarte?.comando.descricao}</strong> sai da fila e é apagado deste aparelho. Ele nunca chegou à central, então não
          há como recuperar.
        </p>
        {descarte && descarte.cadeia.length > 1 ? (
          <>
            <p style={{ margin: '0.75rem 0 0.25rem' }}>Dependem dele e são descartados junto:</p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {descarte.cadeia.slice(1).map((comando) => (
                <li key={comando.opId}>{comando.descricao}</li>
              ))}
            </ul>
          </>
        ) : null}
      </Dialogo>
    </Casca>
  );
}
