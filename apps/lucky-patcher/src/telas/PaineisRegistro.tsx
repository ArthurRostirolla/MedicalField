// Os formularios de registro rapido do atendimento. Cada um entrega `dados` no formato do contrato;
// quem grava e o repositorio (validacao + transacao local). Nenhum painel avalia valor clinico.
import { CLASSIFICACOES_TRIAGEM, type Medicamento, type TipoEvento } from '@medicalfield/contratos';
import { calcularTotalGlasgow } from '@medicalfield/dominio';
import { Botao, CampoNumerico, CampoTexto, Select, SeletorSegmentado, SeletorTriagem, type CorTriagem } from '@medicalfield/ui';
import { useState, type FormEvent } from 'react';
import type { EventoLocal } from '../dados/atendimentos.ts';
import { CampoArea } from '../ui/CampoArea.tsx';
import { formatarHora } from '../ui/formato.ts';

export type Registrar = (tipo: TipoEvento, dados: Record<string, unknown>, retificaEventoId?: string) => Promise<boolean>;

interface PainelProps {
  registrar: Registrar;
  gravando: boolean;
  erros: Record<string, string>;
}

/* ───────── Sinais vitais ───────── */

const VITAIS = [
  { campo: 'pressaoSistolica', rotulo: 'PA sistólica', unidade: 'mmHg', min: 0, max: 300 },
  { campo: 'pressaoDiastolica', rotulo: 'PA diastólica', unidade: 'mmHg', min: 0, max: 200 },
  { campo: 'frequenciaCardiaca', rotulo: 'Freq. cardíaca', unidade: 'bpm', min: 0, max: 300 },
  { campo: 'frequenciaRespiratoria', rotulo: 'Freq. respiratória', unidade: 'irpm', min: 0, max: 100 },
  { campo: 'saturacao', rotulo: 'Saturação', unidade: '%', min: 0, max: 100 },
  { campo: 'temperatura', rotulo: 'Temperatura', unidade: '°C', min: 20, max: 45, casas: 1, passo: 0.1 },
  { campo: 'glicemia', rotulo: 'Glicemia', unidade: 'mg/dL', min: 0, max: 1000 },
] as const;

type Vitais = Partial<Record<(typeof VITAIS)[number]['campo'], number | null>>;

function GradeVitais({ valores, mudar }: { valores: Vitais; mudar: (valores: Vitais) => void }) {
  return (
    <div className="mf-grade-campos">
      {VITAIS.map((vital) => (
        <CampoNumerico
          key={vital.campo}
          rotulo={vital.rotulo}
          unidade={vital.unidade}
          min={vital.min}
          max={vital.max}
          casas={'casas' in vital ? vital.casas : undefined}
          passo={'passo' in vital ? vital.passo : undefined}
          className={vital.campo === 'glicemia' ? 'lp-span-2' : undefined}
          valor={valores[vital.campo] ?? null}
          aoMudar={(valor) => mudar({ ...valores, [vital.campo]: valor })}
        />
      ))}
    </div>
  );
}

const vitaisPreenchidos = (valores: Vitais) =>
  Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor !== null && valor !== undefined)) as Record<string, number>;

export function PainelSinais({ registrar, gravando }: PainelProps) {
  const [valores, setValores] = useState<Vitais>({});
  const [faltou, setFaltou] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    const dados = vitaisPreenchidos(valores);
    setFaltou(Object.keys(dados).length === 0);
    if (Object.keys(dados).length === 0) return;
    if (await registrar('SINAIS_VITAIS', dados)) setValores({});
  }

  return (
    <form className="lp-bloco" noValidate onSubmit={(e) => void enviar(e)}>
      <GradeVitais valores={valores} mudar={setValores} />
      {faltou && Object.keys(vitaisPreenchidos(valores)).length === 0 ? (
        <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
          Preencha ao menos um sinal vital para registrar.
        </p>
      ) : null}
      <Botao type="submit" variante="primario" largo carregando={gravando}>
        Registrar sinais vitais
      </Botao>
    </form>
  );
}

/* ───────── Glasgow ───────── */

const GLASGOW = {
  ocular: ['Nenhuma', 'À dor', 'À voz', 'Espontânea'],
  verbal: ['Nenhuma', 'Sons', 'Palavras', 'Confusa', 'Orientada'],
  motora: ['Nenhuma', 'Extensão', 'Flexão', 'Retirada', 'Localiza', 'Obedece'],
} as const;
type Eixo = keyof typeof GLASGOW;

export function PainelGlasgow({ registrar, gravando }: PainelProps) {
  const [respostas, setRespostas] = useState<Record<Eixo, string | null>>({ ocular: null, verbal: null, motora: null });
  const completo = respostas.ocular && respostas.verbal && respostas.motora;
  const componentes = { ocular: Number(respostas.ocular), verbal: Number(respostas.verbal), motora: Number(respostas.motora) };
  const total = completo ? calcularTotalGlasgow(componentes) : null;
  const [faltou, setFaltou] = useState(false);

  return (
    <div className="lp-bloco">
      {(Object.keys(GLASGOW) as Eixo[]).map((eixo) => (
        <SeletorSegmentado
          key={eixo}
          className={eixo === 'motora' ? 'lp-tipos' : undefined}
          rotulo={`Resposta ${eixo}`}
          valor={respostas[eixo]}
          aoMudar={(valor) => setRespostas((atual) => ({ ...atual, [eixo]: valor }))}
          opcoes={GLASGOW[eixo].map((detalhe, indice) => ({ valor: String(indice + 1), rotulo: indice + 1, detalhe }))}
        />
      ))}
      {faltou && total === null ? (
        <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
          Escolha as três respostas para registrar.
        </p>
      ) : null}
      <Botao
        variante="primario"
        largo
        carregando={gravando}
        onClick={async () => {
          setFaltou(total === null);
          if (total !== null && (await registrar('GLASGOW', { ...componentes, total }))) setRespostas({ ocular: null, verbal: null, motora: null });
        }}
      >
        {total === null ? 'Registrar Glasgow' : `Registrar Glasgow ${total}`}
      </Botao>
    </div>
  );
}

/* ───────── Triagem ───────── */

export function PainelTriagem({ registrar, gravando }: PainelProps) {
  const [protocolo, setProtocolo] = useState<'MANCHESTER' | 'START'>('MANCHESTER');
  const [cor, setCor] = useState<CorTriagem | null>(null); // o profissional escolhe; nada vem marcado
  const valida = cor !== null && (CLASSIFICACOES_TRIAGEM[protocolo] as readonly string[]).includes(cor);
  const [faltou, setFaltou] = useState(false);

  return (
    <div className="lp-bloco">
      <SeletorSegmentado
        rotulo="Protocolo"
        valor={protocolo}
        aoMudar={(novo) => {
          setProtocolo(novo);
          setCor(null);
        }}
        opcoes={[
          { valor: 'MANCHESTER', rotulo: 'Manchester' },
          { valor: 'START', rotulo: 'START' },
        ]}
      />
      <SeletorTriagem protocolo={protocolo} valor={cor} aoMudar={setCor} rotulo={`Classificação ${protocolo === 'START' ? 'START' : 'Manchester'}`} />
      {faltou && !valida ? (
        <p className="mf-campo__erro" role="alert" style={{ margin: 0 }}>
          Escolha a classificação para registrar.
        </p>
      ) : null}
      <Botao
        variante="primario"
        largo
        carregando={gravando}
        onClick={async () => {
          setFaltou(!valida);
          if (valida && (await registrar('TRIAGEM', { protocolo, classificacao: cor }))) setCor(null);
        }}
      >
        Registrar triagem
      </Botao>
    </div>
  );
}

/* ───────── Medicacao ───────── */

const FORA = '__fora__';

export function PainelMedicacao({
  registrar,
  gravando,
  erros,
  catalogo,
  administradas,
  alergias,
}: PainelProps & { catalogo: Medicamento[]; administradas: EventoLocal[]; alergias: string[] }) {
  const semCatalogo = catalogo.length === 0;
  const [escolha, setEscolha] = useState('');
  const [nomeLivre, setNomeLivre] = useState('');
  const [dose, setDose] = useState('');
  const [unidade, setUnidade] = useState('');
  const [via, setVia] = useState('');
  const [faltou, setFaltou] = useState(false);
  const livre = semCatalogo || escolha === FORA;
  const doCatalogo = catalogo.find((medicamento) => medicamento.id === escolha);
  const nome = livre ? nomeLivre.trim() : (doCatalogo?.nome ?? '');

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setFaltou(!nome);
    if (!nome) return;
    const ok = await registrar('MEDICACAO', { medicamentoId: livre ? null : escolha, nome, dose: dose.trim(), unidade: unidade.trim(), via: via.trim() });
    if (ok) {
      setEscolha('');
      setNomeLivre('');
      setDose('');
      setUnidade('');
      setVia('');
    }
  }

  return (
    <form className="lp-bloco" noValidate onSubmit={(e) => void enviar(e)}>
      {/* Fatos, sem alerta nem interpretacao: o que ja foi dado e o que esta registrado como alergia. */}
      <dl className="lp-fatos">
        <div>
          <dt className="mf-rotulo">Já administrado neste atendimento</dt>
          <dd>
            {administradas.length === 0 ? (
              <small>Nenhuma medicação registrada.</small>
            ) : (
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {administradas.map((evento) => {
                  const d = evento.dados as Record<string, string>;
                  return (
                    <li key={evento.id}>
                      <time className="mf-dado" dateTime={evento.ocorridoEm}>
                        {formatarHora(evento.ocorridoEm)}
                      </time>{' '}
                      {d.nome}{' '}
                      <span className="lp-junto">
                        · {d.dose} {d.unidade} · {d.via}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </dd>
        </div>
        <div>
          <dt className="mf-rotulo">Alergias registradas</dt>
          <dd>{alergias.length === 0 ? <small>Nenhuma alergia no prontuário.</small> : <span style={{ textTransform: 'uppercase' }}>{alergias.join(' · ')}</span>}</dd>
        </div>
      </dl>

      {semCatalogo ? (
        <p className="lp-nota">O catálogo de medicamentos ainda não foi baixado neste aparelho: registre pelo nome, como texto livre.</p>
      ) : (
        <Select
          rotulo="Medicamento"
          vazio="Escolha no catálogo"
          value={escolha}
          onChange={(e) => setEscolha(e.target.value)}
          erro={faltou && !nome && !livre ? 'Escolha o medicamento ou “Fora do catálogo”.' : undefined}
        >
          {catalogo.map((medicamento) => (
            <option key={medicamento.id} value={medicamento.id}>
              {[medicamento.nome, medicamento.apresentacao].filter(Boolean).join(' — ')}
            </option>
          ))}
          <option value={FORA}>Fora do catálogo (texto livre)</option>
        </Select>
      )}
      {livre ? (
        <CampoTexto
          rotulo="Nome do medicamento (fora do catálogo)"
          value={nomeLivre}
          onChange={(e) => setNomeLivre(e.target.value)}
          autoComplete="off"
          erro={faltou && !nome ? 'Escreva o nome do medicamento.' : erros['dados.nome']}
        />
      ) : null}
      <div className="mf-grade-campos" style={{ ['--mf-colunas' as string]: 3 }}>
        <CampoTexto rotulo="Dose" inputMode="decimal" value={dose} onChange={(e) => setDose(e.target.value)} autoComplete="off" erro={erros['dados.dose'] ? 'Obrigatória' : undefined} />
        <CampoTexto rotulo="Unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} list="lp-unidades" autoComplete="off" autoCapitalize="none" erro={erros['dados.unidade'] ? 'Obrigatória' : undefined} />
        <CampoTexto rotulo="Via" value={via} onChange={(e) => setVia(e.target.value)} list="lp-vias" autoComplete="off" autoCapitalize="characters" erro={erros['dados.via'] ? 'Obrigatória' : undefined} />
      </div>
      <datalist id="lp-unidades">
        {['mg', 'mL', 'g', 'mcg', 'UI', 'gotas', 'comprimido'].map((opcao) => (
          <option key={opcao} value={opcao} />
        ))}
      </datalist>
      <datalist id="lp-vias">
        {['EV', 'IM', 'VO', 'SC', 'SL', 'IN', 'IO', 'Inalatória'].map((opcao) => (
          <option key={opcao} value={opcao} />
        ))}
      </datalist>
      <Botao type="submit" variante="primario" largo carregando={gravando}>
        Registrar medicação
      </Botao>
    </form>
  );
}

/* ───────── Procedimento e observacao ───────── */

export function PainelTexto({
  registrar,
  gravando,
  erros,
  tipo,
}: PainelProps & { tipo: 'PROCEDIMENTO' | 'OBSERVACAO' }) {
  const [texto, setTexto] = useState('');
  const campo = tipo === 'PROCEDIMENTO' ? 'descricao' : 'texto';
  return (
    <form
      className="lp-bloco"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (await registrar(tipo, { [campo]: texto })) setTexto('');
      }}
    >
      <CampoArea
        rotulo={tipo === 'PROCEDIMENTO' ? 'Procedimento realizado' : 'Observação'}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        erro={erros[`dados.${campo}`] ? 'Escreva o que registrar.' : undefined}
      />
      <Botao type="submit" variante="primario" largo carregando={gravando}>
        {tipo === 'PROCEDIMENTO' ? 'Registrar procedimento' : 'Registrar observação'}
      </Botao>
    </form>
  );
}

/* ───────── Retificacao ───────── */

const ROTULO_TIPO: Record<TipoEvento, string> = {
  SINAIS_VITAIS: 'Sinais vitais',
  GLASGOW: 'Glasgow',
  TRIAGEM: 'Triagem',
  MEDICACAO: 'Medicação',
  PROCEDIMENTO: 'Procedimento',
  OBSERVACAO: 'Observação',
  RETIFICACAO: 'Retificação',
  ENCERRAMENTO: 'Encerramento',
};

export function PainelRetificacao({ registrar, gravando, erros, eventos }: PainelProps & { eventos: EventoLocal[] }) {
  const [alvoId, setAlvoId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [corrigidos, setCorrigidos] = useState<Vitais>({});
  const jaRetificados = new Set(eventos.map((evento) => evento.retificaEventoId).filter(Boolean));
  const candidatos = eventos
    .map((evento, indice) => ({ evento, numero: indice + 1 }))
    .filter(({ evento }) => evento.tipo !== 'RETIFICACAO' && !jaRetificados.has(evento.id));
  const alvo = eventos.find((evento) => evento.id === alvoId);
  const [faltouAlvo, setFaltouAlvo] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setFaltouAlvo(!alvo);
    if (!alvo) return;
    const valores = alvo.tipo === 'SINAIS_VITAIS' ? vitaisPreenchidos(corrigidos) : {};
    const temValores = Object.keys(valores).length > 0;
    let ok = await registrar('RETIFICACAO', { motivo, ...(temValores ? { dadosCorrigidos: valores } : {}) }, alvo.id);
    // A medida corrigida entra como registro novo, para a passagem de caso continuar com sinais vitais
    // (o resumo de @medicalfield/dominio descarta o evento retificado e nao le `dadosCorrigidos`).
    if (ok && temValores) ok = await registrar('SINAIS_VITAIS', valores);
    if (ok) {
      setAlvoId('');
      setMotivo('');
      setCorrigidos({});
    }
  }

  return (
    <form className="lp-bloco" noValidate onSubmit={(e) => void enviar(e)}>
      <p className="lp-nota">Nada é apagado: o registro original continua na linha do tempo, riscado, e esta retificação cita o número dele.</p>
      <Select
        rotulo="Registro a retificar"
        vazio={candidatos.length ? 'Escolha o registro' : 'Nenhum registro para retificar'}
        value={alvoId}
        onChange={(e) => {
          setAlvoId(e.target.value);
          const escolhido = eventos.find((evento) => evento.id === e.target.value);
          setCorrigidos(escolhido?.tipo === 'SINAIS_VITAIS' ? (escolhido.dados as Vitais) : {});
        }}
        erro={faltouAlvo && !alvo ? 'Escolha qual registro está errado.' : undefined}
        opcoes={candidatos
          .slice()
          .reverse()
          .map(({ evento, numero }) => ({
            valor: evento.id,
            rotulo: `nº ${String(numero).padStart(2, '0')} · ${formatarHora(evento.ocorridoEm)} · ${ROTULO_TIPO[evento.tipo]}`,
          }))}
      />
      <CampoArea
        rotulo="Motivo da retificação"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        linhas={2}
        erro={erros['dados.motivo'] ? 'Diga por que o registro está errado.' : undefined}
      />
      {alvo?.tipo === 'SINAIS_VITAIS' ? (
        <>
          <p className="mf-rotulo" style={{ margin: 0 }}>
            Valores corretos (confira todos)
          </p>
          <GradeVitais valores={corrigidos} mudar={setCorrigidos} />
          <p className="lp-nota">Entram dois registros: a retificação e os sinais vitais corrigidos, com a hora de agora.</p>
        </>
      ) : alvo ? (
        <p className="lp-nota">Se o dado correto for outro, registre-o de novo no tipo certo depois de retificar.</p>
      ) : null}
      <Botao type="submit" variante="primario" largo carregando={gravando}>
        Registrar retificação
      </Botao>
    </form>
  );
}

/* ───────── Encerramento ───────── */

export function PainelEncerramento({ registrar, gravando, erros }: PainelProps) {
  const [desfecho, setDesfecho] = useState('');
  const [destino, setDestino] = useState('');
  return (
    <form
      className="lp-bloco"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        await registrar('ENCERRAMENTO', { desfecho, ...(destino.trim() ? { destino: destino.trim() } : {}) });
      }}
    >
      <p className="lp-nota">Depois de encerrado, o atendimento só aceita retificação.</p>
      <CampoArea
        rotulo="Desfecho"
        value={desfecho}
        onChange={(e) => setDesfecho(e.target.value)}
        linhas={2}
        erro={erros['dados.desfecho'] ? 'Escreva o desfecho para encerrar.' : undefined}
      />
      <CampoTexto rotulo="Destino (hospital, unidade)" value={destino} onChange={(e) => setDestino(e.target.value)} autoComplete="off" />
      <Botao type="submit" variante="primario" largo carregando={gravando}>
        Encerrar atendimento
      </Botao>
    </form>
  );
}
