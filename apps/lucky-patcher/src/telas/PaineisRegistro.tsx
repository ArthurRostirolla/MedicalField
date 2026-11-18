// Os formularios de registro rapido do atendimento. Cada um entrega `dados` no formato do contrato;
// quem grava e o repositorio (validacao + transacao local). Nenhum painel avalia valor clinico.
import { CLASSIFICACOES_TRIAGEM, type Medicamento, type TipoEvento } from '@medicalfield/contratos';
import { calcularTotalGlasgow } from '@medicalfield/dominio';
import { useState } from 'react';
import { View } from 'react-native';
import type { EventoLocal } from '../dados/atendimentos.ts';
import { Botao, CampoArea, CampoNumerico, CampoTexto, Mensagens, Rotulo, Select, SeletorRapido, SeletorSegmentado, SeletorTriagem, Texto, type CorTriagem } from '../ui/ds/index.ts';
import { formatarHora } from '../ui/formato.ts';

export type Registrar = (tipo: TipoEvento, dados: Record<string, unknown>, retificaEventoId?: string) => Promise<boolean>;

/*
 * Regra dos paineis (D-QA-16): a gravacao e assincrona, e o profissional pode ja estar digitando o
 * proximo registro quando ela termina. Por isso nenhum painel faz "gravou => limpa o campo" as cegas:
 * - texto livre (observacao, procedimento): o campo e esvaziado NA HORA do envio e o botao nunca
 *   trava; os envios entram em fila (Atendimento.tsx). Se a gravacao falhar, o texto volta ao campo,
 *   na frente do que tiver sido digitado depois;
 * - os demais: so limpam se o formulario ainda for exatamente o que foi enviado.
 */
interface PainelProps {
  registrar: Registrar;
  gravando: boolean;
  erros: Record<string, string>;
}

const BLOCO = { gap: 12 } as const;

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
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {VITAIS.map((vital) => (
        <CampoNumerico
          key={vital.campo}
          rotulo={vital.rotulo}
          unidade={vital.unidade}
          min={vital.min}
          max={vital.max}
          casas={'casas' in vital ? vital.casas : undefined}
          passo={'passo' in vital ? vital.passo : undefined}
          style={vital.campo === 'glicemia' ? { width: '100%' } : { flexGrow: 1, flexBasis: '45%' }}
          valor={valores[vital.campo] ?? null}
          aoMudar={(valor) => mudar({ ...valores, [vital.campo]: valor })}
        />
      ))}
    </View>
  );
}

const vitaisPreenchidos = (valores: Vitais) =>
  Object.fromEntries(Object.entries(valores).filter(([, valor]) => valor !== null && valor !== undefined)) as Record<string, number>;

export function PainelSinais({ registrar, gravando }: PainelProps) {
  const [valores, setValores] = useState<Vitais>({});
  const [faltou, setFaltou] = useState(false);

  async function enviar() {
    const dados = vitaisPreenchidos(valores);
    setFaltou(Object.keys(dados).length === 0);
    if (Object.keys(dados).length === 0) return;
    const enviados = valores;
    if (await registrar('SINAIS_VITAIS', dados)) setValores((atuais) => (atuais === enviados ? {} : atuais));
  }

  return (
    <View style={BLOCO}>
      <GradeVitais valores={valores} mudar={setValores} />
      {faltou && Object.keys(vitaisPreenchidos(valores)).length === 0 ? <Mensagens erro="Preencha ao menos um sinal vital para registrar." /> : null}
      <Botao variante="primario" largo carregando={gravando} onPress={() => void enviar()}>
        Registrar sinais vitais
      </Botao>
    </View>
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
    <View style={BLOCO}>
      {(Object.keys(GLASGOW) as Eixo[]).map((eixo) => (
        <SeletorSegmentado
          key={eixo}
          rotulo={`Resposta ${eixo}`}
          valor={respostas[eixo]}
          aoMudar={(valor) => setRespostas((atual) => ({ ...atual, [eixo]: valor }))}
          opcoes={GLASGOW[eixo].map((detalhe, indice) => ({ valor: String(indice + 1), rotulo: String(indice + 1), detalhe }))}
        />
      ))}
      {faltou && total === null ? <Mensagens erro="Escolha as três respostas para registrar." /> : null}
      <Botao
        variante="primario"
        largo
        carregando={gravando}
        onPress={async () => {
          setFaltou(total === null);
          const enviadas = respostas;
          if (total !== null && (await registrar('GLASGOW', { ...componentes, total }))) {
            setRespostas((atuais) => (atuais === enviadas ? { ocular: null, verbal: null, motora: null } : atuais));
          }
        }}
      >
        {total === null ? 'Registrar Glasgow' : `Registrar Glasgow ${total}`}
      </Botao>
    </View>
  );
}

/* ───────── Triagem ───────── */

export function PainelTriagem({ registrar, gravando }: PainelProps) {
  const [protocolo, setProtocolo] = useState<'MANCHESTER' | 'START'>('MANCHESTER');
  const [cor, setCor] = useState<CorTriagem | null>(null); // o profissional escolhe; nada vem marcado
  const valida = cor !== null && (CLASSIFICACOES_TRIAGEM[protocolo] as readonly string[]).includes(cor);
  const [faltou, setFaltou] = useState(false);

  return (
    <View style={BLOCO}>
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
      {faltou && !valida ? <Mensagens erro="Escolha a classificação para registrar." /> : null}
      <Botao
        variante="primario"
        largo
        carregando={gravando}
        onPress={async () => {
          setFaltou(!valida);
          const enviada = cor;
          if (valida && (await registrar('TRIAGEM', { protocolo, classificacao: cor }))) setCor((atual) => (atual === enviada ? null : atual));
        }}
      >
        Registrar triagem
      </Botao>
    </View>
  );
}

/* ───────── Medicacao ───────── */

const FORA = '__fora__';
// As unidades e vias mais usadas no pre-hospitalar: um toque. "Outra" abre o texto livre.
const UNIDADES = ['mg', 'mL', 'mcg', 'g', 'UI'] as const;
const VIAS = ['EV', 'IM', 'VO', 'SC', 'SL', 'IO', 'Inalatória'] as const;

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

  async function enviar() {
    setFaltou(!nome);
    if (!nome) return;
    const ok = await registrar('MEDICACAO', { medicamentoId: livre ? null : escolha, nome, dose: dose.trim(), unidade: unidade.trim(), via: via.trim() });
    if (ok) {
      // Cada campo so e limpo se ainda tiver o valor que foi enviado.
      const limpar = (enviado: string) => (atual: string) => (atual === enviado ? '' : atual);
      setEscolha(limpar(escolha));
      setNomeLivre(limpar(nomeLivre));
      setDose(limpar(dose));
      setUnidade(limpar(unidade));
      setVia(limpar(via));
    }
  }

  return (
    <View style={BLOCO}>
      {/* Fatos, sem alerta nem interpretacao; so aparecem quando existem. */}
      {alergias.length > 0 ? (
        <View>
          <Rotulo>Alergias</Rotulo>
          <Texto forte style={{ textTransform: 'uppercase' }}>
            {alergias.join(' · ')}
          </Texto>
        </View>
      ) : null}
      {administradas.length > 0 ? (
        <View>
          <Rotulo>Já administrado</Rotulo>
          <View role="list">
            {administradas.map((evento) => {
              const d = evento.dados as Record<string, string>;
              return (
                <Texto key={evento.id} role="listitem" tamanho="pequeno">
                  <Texto dado tamanho="pequeno">
                    {formatarHora(evento.ocorridoEm)}
                  </Texto>{' '}
                  {d.nome} · {d.dose} {d.unidade} · {d.via}
                </Texto>
              );
            })}
          </View>
        </View>
      ) : null}

      {semCatalogo ? null : (
        <Select
          rotulo="Medicamento"
          vazio="Escolha no catálogo"
          valor={escolha}
          aoMudar={setEscolha}
          erro={faltou && !nome && !livre ? 'Escolha o medicamento ou “Fora do catálogo”.' : undefined}
          opcoes={[
            ...catalogo.map((medicamento) => ({
              valor: medicamento.id,
              rotulo: [medicamento.nome, medicamento.apresentacao].filter(Boolean).join(' — '),
            })),
            { valor: FORA, rotulo: 'Fora do catálogo (texto livre)' },
          ]}
        />
      )}
      {livre ? (
        <CampoTexto
          rotulo={semCatalogo ? 'Medicamento' : 'Nome do medicamento (fora do catálogo)'}
          value={nomeLivre}
          onChangeText={setNomeLivre}
          autoComplete="off"
          erro={faltou && !nome ? 'Escreva o nome do medicamento.' : erros['dados.nome']}
        />
      ) : null}
      <CampoTexto
        rotulo="Dose"
        inputMode="decimal"
        value={dose}
        onChangeText={setDose}
        autoComplete="off"
        erro={erros['dados.dose'] ? 'Obrigatória' : undefined}
      />
      <SeletorRapido rotulo="Unidade" opcoes={UNIDADES} valor={unidade} aoMudar={setUnidade} erro={erros['dados.unidade'] ? 'Obrigatória' : undefined} />
      <SeletorRapido rotulo="Via" opcoes={VIAS} valor={via} aoMudar={setVia} erro={erros['dados.via'] ? 'Obrigatória' : undefined} />
      <Botao variante="primario" largo carregando={gravando} onPress={() => void enviar()}>
        Registrar medicação
      </Botao>
    </View>
  );
}

/* ───────── Procedimento e observacao ───────── */

export function PainelTexto({ registrar, gravando, erros, tipo }: PainelProps & { tipo: 'PROCEDIMENTO' | 'OBSERVACAO' }) {
  const [texto, setTexto] = useState('');
  const campo = tipo === 'PROCEDIMENTO' ? 'descricao' : 'texto';
  async function enviar() {
    const enviado = texto;
    setTexto(''); // na hora: o proximo registro ja pode ser digitado
    const gravou = await registrar(tipo, { [campo]: enviado });
    // Falhou: o texto volta, sem apagar o que foi digitado enquanto isso.
    if (!gravou) setTexto((atual) => (atual.trim() ? `${enviado}\n${atual}` : enviado));
  }
  return (
    <View style={BLOCO}>
      <CampoArea
        rotulo={tipo === 'PROCEDIMENTO' ? 'Procedimento realizado' : 'Observação'}
        value={texto}
        onChangeText={setTexto}
        erro={erros[`dados.${campo}`] ? 'Escreva o que registrar.' : undefined}
      />
      {/* Sem `carregando`: travar o botao durante a gravacao descartava o envio seguinte. */}
      <Botao variante="primario" largo aria-busy={gravando || undefined} onPress={() => void enviar()}>
        {tipo === 'PROCEDIMENTO' ? 'Registrar procedimento' : 'Registrar observação'}
      </Botao>
    </View>
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

  async function enviar() {
    setFaltouAlvo(!alvo);
    if (!alvo) return;
    const valores = alvo.tipo === 'SINAIS_VITAIS' ? vitaisPreenchidos(corrigidos) : {};
    const temValores = Object.keys(valores).length > 0;
    let ok = await registrar('RETIFICACAO', { motivo, ...(temValores ? { dadosCorrigidos: valores } : {}) }, alvo.id);
    // A medida corrigida entra como registro novo, para a passagem de caso continuar com sinais vitais
    // (o resumo de @medicalfield/dominio descarta o evento retificado e nao le `dadosCorrigidos`).
    if (ok && temValores) ok = await registrar('SINAIS_VITAIS', valores);
    if (ok) {
      const alvoEnviado = alvoId;
      const motivoEnviado = motivo;
      const corrigidosEnviados = corrigidos;
      setAlvoId((atual) => (atual === alvoEnviado ? '' : atual));
      setMotivo((atual) => (atual === motivoEnviado ? '' : atual));
      setCorrigidos((atuais) => (atuais === corrigidosEnviados ? {} : atuais));
    }
  }

  return (
    <View style={BLOCO}>
      <Select
        rotulo="Registro a retificar"
        vazio={candidatos.length ? 'Escolha o registro' : 'Nenhum registro para retificar'}
        valor={alvoId}
        aoMudar={(id) => {
          setAlvoId(id);
          const escolhido = eventos.find((evento) => evento.id === id);
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
        onChangeText={setMotivo}
        linhas={2}
        erro={erros['dados.motivo'] ? 'Diga por que o registro está errado.' : undefined}
      />
      {alvo?.tipo === 'SINAIS_VITAIS' ? (
        <>
          <Rotulo>Valores corretos</Rotulo>
          <GradeVitais valores={corrigidos} mudar={setCorrigidos} />
        </>
      ) : null}
      <Botao variante="primario" largo carregando={gravando} onPress={() => void enviar()}>
        Registrar retificação
      </Botao>
    </View>
  );
}

/* ───────── Encerramento ───────── */

export function PainelEncerramento({ registrar, gravando, erros }: PainelProps) {
  const [desfecho, setDesfecho] = useState('');
  const [destino, setDestino] = useState('');
  return (
    <View style={BLOCO}>
      <CampoArea
        rotulo="Desfecho"
        value={desfecho}
        onChangeText={setDesfecho}
        linhas={2}
        erro={erros['dados.desfecho'] ? 'Escreva o desfecho para encerrar.' : undefined}
      />
      <CampoTexto rotulo="Destino (hospital, unidade)" value={destino} onChangeText={setDestino} autoComplete="off" />
      <Botao
        variante="primario"
        largo
        carregando={gravando}
        onPress={() => void registrar('ENCERRAMENTO', { desfecho, ...(destino.trim() ? { destino: destino.trim() } : {}) })}
      >
        Encerrar atendimento
      </Botao>
    </View>
  );
}
