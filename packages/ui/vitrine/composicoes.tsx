import {
  ArrowRightLeft,
  ClipboardList,
  CloudUpload,
  FileDown,
  FileText,
  Mail,
  Pill,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  BarraConectividade,
  Botao,
  CampoNumerico,
  CampoTexto,
  Dialogo,
  Etiqueta,
  EtiquetaTriagem,
  LayoutApp,
  LayoutPortal,
  LinhaDoTempo,
  Paginacao,
  PainelPassagemDeCaso,
  PilhaToasts,
  Secao,
  Select,
  SeletorSegmentado,
  SeletorTriagem,
  SeloSync,
  Tabela,
  formatarHora,
  useToasts,
  type Coluna,
  type CorTriagem,
  type EstadoSync,
  type EventoLinha,
} from '../src';
import {
  ATENDIMENTOS,
  ENVIOS,
  EVENTOS,
  FUSO,
  ID_ATENDIMENTO,
  MEDICAMENTOS,
  PACIENTE,
  QUEIXA,
  RESUMO,
  type AtendimentoLista,
} from './dados';

/* ───────────────────────── Portal: lista + detalhe ───────────────────────── */

const COLUNAS: Coluna<AtendimentoLista>[] = [
  {
    id: 'inicio',
    titulo: 'Início',
    celula: (a) => <time className="mf-dado">{formatarHora(a.iniciadoEm, FUSO)}</time>,
  },
  {
    id: 'paciente',
    titulo: 'Paciente',
    quebra: true,
    celula: (a) => (
      <>
        <strong style={{ fontWeight: 650 }}>{a.pessoaNome}</strong>
        <div style={{ color: 'var(--mf-tinta-2)' }}>{a.queixa}</div>
      </>
    ),
  },
  {
    id: 'triagem',
    titulo: 'Triagem',
    celula: (a) =>
      a.triagem ? (
        <EtiquetaTriagem {...a.triagem} />
      ) : (
        <span style={{ color: 'var(--mf-tinta-2)' }}>Não registrada</span>
      ),
  },
  {
    id: 'situacao',
    titulo: 'Situação',
    celula: (a) => (a.status === 'ABERTO' ? <Etiqueta tom="cheia">Aberto</Etiqueta> : <Etiqueta>Encerrado</Etiqueta>),
  },
];

export function ComposicaoPortal() {
  const [selecionado, setSelecionado] = useState<string>(ID_ATENDIMENTO);
  const [dialogoEmail, setDialogoEmail] = useState(false);
  const [vinculo, setVinculo] = useState<'PACIENTE' | 'FAMILIAR'>('FAMILIAR');
  const [gerando, setGerando] = useState(false);
  const { toasts, avisar, dispensar } = useToasts();

  function gerarPdf() {
    setGerando(true);
    setTimeout(() => {
      setGerando(false);
      avisar({ tom: 'sucesso', titulo: 'Ficha gerada', descricao: 'ficha-MF-4K7Q-92XD.pdf · 184 kB' });
    }, 900);
  }

  return (
    <LayoutPortal
      titulo="Atendimentos"
      atual="atendimentos"
      itens={[
        { id: 'atendimentos', rotulo: 'Atendimentos', icone: <ClipboardList aria-hidden />, contagem: 128, grupo: 'Clínico' },
        { id: 'prontuarios', rotulo: 'Prontuários', icone: <FileText aria-hidden />, contagem: 96 },
        { id: 'medicamentos', rotulo: 'Medicamentos', icone: <Pill aria-hidden />, contagem: 42 },
        { id: 'acesso', rotulo: 'Logs de acesso', icone: <ScrollText aria-hidden />, grupo: 'Auditoria' },
        { id: 'duplicatas', rotulo: 'Possíveis duplicatas', icone: <Users aria-hidden />, contagem: 3 },
      ]}
      usuario={
        <>
          <strong>Dra. Helena Prado</strong>
          <div style={{ color: 'var(--mf-tinta-2)' }}>CRM 100001/RS · Administração</div>
        </>
      }
      acoes={
        <CampoTexto
          rotulo="Buscar paciente"
          placeholder="Nome ou CPF"
          type="search"
          sufixo={<Search aria-hidden style={{ width: '1rem', height: '1rem' }} />}
          style={{ width: '16rem' }}
        />
      }
    >
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,6fr)_minmax(0,7fr)]">
        <Secao className="xl:sticky xl:top-4" titulo="Livro de atendimentos" descricao="Mais recentes primeiro · somente leitura" rente>
          <Tabela
            legenda="Atendimentos, mais recentes primeiro"
            colunas={COLUNAS}
            linhas={ATENDIMENTOS}
            chave={(a) => a.id}
            selecionada={selecionado}
            aoSelecionar={(a) => setSelecionado(a.id)}
          />
          <Paginacao resumo="10 de 128 atendimentos" aoProxima={() => undefined} />
        </Secao>

        <div className="grid grid-cols-1 gap-6">
          <PainelPassagemDeCaso
            resumo={RESUMO}
            paciente={PACIENTE}
            queixaPrincipal={QUEIXA}
            fusoHorario={FUSO}
            acoes={
              <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <Botao icone={<Mail aria-hidden />} onClick={() => setDialogoEmail(true)}>
                  Enviar por e-mail
                </Botao>
                <Botao variante="primario" icone={<FileDown aria-hidden />} carregando={gerando} onClick={gerarPdf}>
                  Gerar PDF
                </Botao>
              </span>
            }
          />

          <Secao
            titulo="Ficha em PDF e envios"
            descricao={
              <>
                Código <span className="mf-dado">MF-4K7Q-92XD</span> · gerada às 22:02 por Dra. Helena Prado
              </>
            }
            acoes={<Etiqueta icone={<ShieldCheck aria-hidden />}>Íntegra</Etiqueta>}
            rente
          >
            <Tabela
              legenda="Envios da ficha por e-mail"
              colunas={[
                {
                  id: 'dest',
                  titulo: 'Destinatário',
                  celula: (e) => (
                    <>
                      {e.destinatario} · {e.vinculo}
                      <div className="mf-dado" style={{ color: 'var(--mf-tinta-2)', fontSize: 'var(--text-rotulo)' }}>
                        {e.email}
                      </div>
                    </>
                  ),
                },
                { id: 'sit', titulo: 'Situação', celula: (e) => <SeloSync estado={e.estado} rotulo={e.rotulo} /> },
                { id: 'tent', titulo: 'Tentativas', alinhar: 'fim', celula: (e) => e.tentativas },
                {
                  id: 'acao',
                  titulo: '',
                  alinhar: 'fim',
                  celula: (e) => (e.estado === 'rejeitado' ? <Botao>Reenviar</Botao> : null),
                },
              ]}
              linhas={ENVIOS}
              chave={(e) => e.id}
            />
          </Secao>

          <Secao titulo="Linha do tempo" descricao="10 entradas · nada é apagado, só retificado" rente>
            <LinhaDoTempo eventos={EVENTOS} fusoHorario={FUSO} />
          </Secao>
        </div>
      </div>

      <Dialogo
        aberto={dialogoEmail}
        aoFechar={() => setDialogoEmail(false)}
        titulo="Enviar a ficha por e-mail"
        acoes={
          <>
            <Botao onClick={() => setDialogoEmail(false)}>Cancelar</Botao>
            <Botao
              variante="primario"
              icone={<Mail aria-hidden />}
              onClick={() => {
                setDialogoEmail(false);
                avisar({ titulo: 'Envio na fila', descricao: 'A situação aparece em “Ficha em PDF e envios”.' });
              }}
            >
              Enviar ficha
            </Botao>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3">
          <p style={{ margin: 0, color: 'var(--mf-tinta-2)' }}>
            O PDF segue anexado. Confira o endereço: a ficha contém dados de saúde.
          </p>
          <CampoTexto rotulo="Nome do destinatário" defaultValue="Paula Figueiró" autoComplete="off" />
          <CampoTexto rotulo="E-mail" type="email" defaultValue="paula.f@exemplo.test" autoComplete="off" />
          <SeletorSegmentado
            rotulo="Vínculo"
            valor={vinculo}
            aoMudar={setVinculo}
            opcoes={[
              { valor: 'PACIENTE', rotulo: 'Paciente' },
              { valor: 'FAMILIAR', rotulo: 'Familiar' },
            ]}
          />
        </div>
      </Dialogo>
      <PilhaToasts toasts={toasts} aoDispensar={dispensar} />
    </LayoutPortal>
  );
}

/* ───────────────────────── App de campo: atendimento em curso ───────────────────────── */

type Registro = 'sinais' | 'glasgow' | 'triagem' | 'medicacao';

const VAZIO = { pas: null, pad: null, fc: null, fr: null, spo2: null, temp: null } as Record<string, number | null>;

const GLASGOW = {
  ocular: ['Nenhuma', 'À dor', 'À voz', 'Espontânea'],
  verbal: ['Nenhuma', 'Sons', 'Palavras', 'Confusa', 'Orientada'],
  motora: ['Nenhuma', 'Extensão', 'Flexão', 'Retirada', 'Localiza', 'Obedece'],
} as const;

export function ComposicaoApp({ offlineInicial = false }: { offlineInicial?: boolean }) {
  const [simulandoOffline, setSimulandoOffline] = useState(offlineInicial);
  const [registro, setRegistro] = useState<Registro>('sinais');
  const [vitais, setVitais] = useState(VAZIO);
  const [glasgow, setGlasgow] = useState<{ ocular: string | null; verbal: string | null; motora: string | null }>({
    ocular: '4',
    verbal: null,
    motora: null,
  });
  const [cor, setCor] = useState<CorTriagem | null>('LARANJA');
  const [eventos, setEventos] = useState<EventoLinha[]>(() => EVENTOS.slice(0, 8));
  const [estados, setEstados] = useState<Record<string, EstadoSync>>(() =>
    Object.fromEntries(
      EVENTOS.slice(0, 8).map((e, i) => [e.id, offlineInicial && i >= 5 ? 'local' : 'confirmado'] as const),
    ),
  );
  const [recente, setRecente] = useState<string>();
  const [semVital, setSemVital] = useState(false);
  const relogio = useRef(22);

  const pendentes = Object.values(estados).filter((e) => e !== 'confirmado').length;
  const online = !simulandoOffline;

  // Online: o outbox esvazia sozinho, uma operação por vez (local → enviando → confirmado).
  useEffect(() => {
    if (!online) return;
    const proximo = Object.entries(estados).find(([, estado]) => estado !== 'confirmado');
    if (!proximo) return;
    const [id, estado] = proximo;
    const espera = setTimeout(
      () => setEstados((atual) => ({ ...atual, [id]: estado === 'local' ? 'enviando' : 'confirmado' })),
      estado === 'local' ? 300 : 900,
    );
    return () => clearTimeout(espera);
  }, [online, estados]);

  function registrar(tipo: EventoLinha['tipo'], dados: object) {
    const id = crypto.randomUUID();
    relogio.current += 1;
    const ocorridoEm = `2026-11-18T00:${String(relogio.current).padStart(2, '0')}:00.000Z`;
    setEventos((lista) => [...lista, { id, tipo, ocorridoEm, dados, profissionalNome: 'Enf. Caio Brandão' }]);
    setEstados((atual) => ({ ...atual, [id]: 'local' }));
    setRecente(id);
  }

  const algumVital = Object.values(vitais).some((v) => v !== null);
  const totalGlasgow =
    glasgow.ocular && glasgow.verbal && glasgow.motora
      ? Number(glasgow.ocular) + Number(glasgow.verbal) + Number(glasgow.motora)
      : null;
  const medicacoesFeitas = eventos.filter((e) => e.tipo === 'MEDICACAO');
  const definir = (chave: string) => (valor: number | null) => setVitais((atual) => ({ ...atual, [chave]: valor }));

  return (
    <LayoutApp
      titulo={PACIENTE.nome}
      subtitulo={
        <>
          Ficha <span className="mf-dado">{ID_ATENDIMENTO.slice(0, 8)}</span> · {PACIENTE.identificacao} · início 21:02
        </>
      }
      atual="atendimento"
      itens={[
        { id: 'atendimento', rotulo: 'Atendimento', icone: <ClipboardList aria-hidden /> },
        { id: 'passagem', rotulo: 'Passagem', icone: <ArrowRightLeft aria-hidden /> },
        { id: 'pacientes', rotulo: 'Pacientes', icone: <Users aria-hidden /> },
        { id: 'pendencias', rotulo: 'Pendências', icone: <CloudUpload aria-hidden />, contagem: pendentes },
      ]}
      conectividade={
        <BarraConectividade
          online={online}
          simulandoOffline={simulandoOffline}
          aoMudarSimulacao={setSimulandoOffline}
          pendencias={pendentes}
          sincronizando={online && pendentes > 0}
          ultimaSync="21:19"
          aoAbrirPendencias={() => undefined}
        />
      }
    >
      <div className="grid grid-cols-1 gap-4 p-4">
        <SeletorSegmentado
          rotulo="Registrar agora"
          valor={registro}
          aoMudar={setRegistro}
          opcoes={[
            { valor: 'sinais', rotulo: 'Sinais' },
            { valor: 'glasgow', rotulo: 'Glasgow' },
            { valor: 'triagem', rotulo: 'Triagem' },
            { valor: 'medicacao', rotulo: 'Medicação' },
          ]}
        />

        {registro === 'sinais' ? (
          <form
            className="grid grid-cols-1 gap-3"
            noValidate
            onSubmit={(evento) => {
              evento.preventDefault();
              setSemVital(!algumVital);
              if (!algumVital) return;
              registrar('SINAIS_VITAIS', {
                ...(vitais.pas !== null && { pressaoSistolica: vitais.pas }),
                ...(vitais.pad !== null && { pressaoDiastolica: vitais.pad }),
                ...(vitais.fc !== null && { frequenciaCardiaca: vitais.fc }),
                ...(vitais.fr !== null && { frequenciaRespiratoria: vitais.fr }),
                ...(vitais.spo2 !== null && { saturacao: vitais.spo2 }),
                ...(vitais.temp !== null && { temperatura: vitais.temp }),
              });
              setVitais(VAZIO);
            }}
          >
            <div className="mf-grade-campos">
              <CampoNumerico rotulo="PA sistólica" unidade="mmHg" min={0} max={300} valor={vitais.pas ?? null} aoMudar={definir('pas')} />
              <CampoNumerico rotulo="PA diastólica" unidade="mmHg" min={0} max={200} valor={vitais.pad ?? null} aoMudar={definir('pad')} />
              <CampoNumerico rotulo="Freq. cardíaca" unidade="bpm" min={0} max={300} valor={vitais.fc ?? null} aoMudar={definir('fc')} />
              <CampoNumerico rotulo="Freq. respiratória" unidade="irpm" min={0} max={100} valor={vitais.fr ?? null} aoMudar={definir('fr')} />
              <CampoNumerico rotulo="Saturação" unidade="%" min={0} max={100} valor={vitais.spo2 ?? null} aoMudar={definir('spo2')} />
              <CampoNumerico rotulo="Temperatura" unidade="°C" min={20} max={45} casas={1} passo={0.1} valor={vitais.temp ?? null} aoMudar={definir('temp')} />
            </div>
            {semVital && !algumVital ? (
              <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
                Preencha ao menos um sinal vital para registrar.
              </p>
            ) : null}
            <Botao type="submit" variante="primario" largo>
              Registrar sinais vitais
            </Botao>
          </form>
        ) : null}

        {registro === 'glasgow' ? (
          <div className="grid grid-cols-1 gap-3">
            {(['ocular', 'verbal', 'motora'] as const).map((eixo) => (
              <SeletorSegmentado
                key={eixo}
                rotulo={`Resposta ${eixo}`}
                valor={glasgow[eixo]}
                aoMudar={(valor) => setGlasgow((atual) => ({ ...atual, [eixo]: valor }))}
                opcoes={GLASGOW[eixo].map((detalhe, indice) => ({ valor: String(indice + 1), rotulo: indice + 1, detalhe }))}
              />
            ))}
            <Botao
              variante="primario"
              largo
              disabled={totalGlasgow === null}
              onClick={() =>
                registrar('GLASGOW', {
                  ocular: Number(glasgow.ocular),
                  verbal: Number(glasgow.verbal),
                  motora: Number(glasgow.motora),
                  total: totalGlasgow,
                })
              }
            >
              {totalGlasgow === null ? 'Escolha as três respostas' : `Registrar Glasgow ${totalGlasgow}`}
            </Botao>
          </div>
        ) : null}

        {registro === 'triagem' ? (
          <div className="grid grid-cols-1 gap-3">
            <SeletorTriagem protocolo="MANCHESTER" valor={cor} aoMudar={setCor} rotulo="Classificação Manchester" />
            <Botao
              variante="primario"
              largo
              disabled={!cor}
              onClick={() => registrar('TRIAGEM', { protocolo: 'MANCHESTER', classificacao: cor })}
            >
              Registrar triagem
            </Botao>
          </div>
        ) : null}

        {registro === 'medicacao' ? (
          <div className="grid grid-cols-1 gap-3">
            <div className="mf-grade-campos" style={{ ['--mf-colunas' as string]: 1 }}>
              <div className="mf-campo">
                <div className="mf-campo__caixa">
                  <span className="mf-rotulo">Já administrado neste atendimento</span>
                  <ul style={{ gridColumn: '1 / -1', margin: 0, padding: 0, listStyle: 'none' }}>
                    {medicacoesFeitas.map((e) => {
                      const d = e.dados as Record<string, string>;
                      return (
                        <li key={e.id}>
                          <time className="mf-dado">{formatarHora(e.ocorridoEm, FUSO)}</time> <strong>{d.nome}</strong> ·{' '}
                          {d.dose} {d.unidade} · {d.via}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <div className="mf-campo">
                <div className="mf-campo__caixa">
                  <span className="mf-rotulo">Alergias registradas</span>
                  <strong style={{ gridColumn: '1 / -1', textTransform: 'uppercase' }}>{RESUMO.alergias.join(' · ')}</strong>
                </div>
              </div>
            </div>
            <Select rotulo="Medicamento" opcoes={MEDICAMENTOS} vazio="Escolha no catálogo" defaultValue="m-gli" />
            <div className="mf-grade-campos" style={{ ['--mf-colunas' as string]: 3 }}>
              <CampoTexto rotulo="Dose" inputMode="decimal" defaultValue="10" />
              <CampoTexto rotulo="Unidade" defaultValue="mL" />
              <CampoTexto rotulo="Via" defaultValue="EV" />
            </div>
            <Botao
              variante="primario"
              largo
              onClick={() =>
                registrar('MEDICACAO', { medicamentoId: 'm-gli', nome: 'Glicose 50%', dose: '10', unidade: 'mL', via: 'EV' })
              }
            >
              Registrar medicação
            </Botao>
          </div>
        ) : null}

        <section aria-label="Linha do tempo">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.375rem' }}>
            <h2 className="mf-secao__titulo">Linha do tempo</h2>
            <span className="mf-rotulo">{eventos.length} entradas</span>
          </div>
          <LinhaDoTempo eventos={eventos} estados={estados} recenteId={recente} fusoHorario={FUSO} invertida />
        </section>
      </div>
    </LayoutApp>
  );
}
