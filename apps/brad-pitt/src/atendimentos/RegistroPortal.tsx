// Registro pelo portal: os mesmos eventos do app, gravados direto na central (o portal e sempre online).
// Nada se edita: corrigir e acrescentar uma RETIFICACAO apontando o registro errado.
import { eventoEntradaSchema, type Evento, type TipoEvento } from '@medicalfield/contratos';
import {
  Botao,
  CampoArea,
  CampoNumerico,
  CampoTexto,
  GLASGOW_VAZIO,
  Secao,
  Select,
  SeletorGlasgow,
  SeletorLista,
  SeletorRapido,
  SeletorSegmentado,
  SeletorTriagem,
  rotuloEvento,
  type CorTriagem,
  type RespostasGlasgow,
} from '@medicalfield/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Brain, CircleAlert, Flag, MessageSquareText, Pill, Siren, Stethoscope, Undo2 } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { listarTodosMedicamentos, registrarEvento } from '../api/recursos';
import { useAvisar } from '../comum/avisos';
import { descreverErro, formatarDataHora } from '../comum/formato';

const VITAIS = [
  { campo: 'pressaoSistolica', rotulo: 'PA sistólica', unidade: 'mmHg', min: 0, max: 300 },
  { campo: 'pressaoDiastolica', rotulo: 'PA diastólica', unidade: 'mmHg', min: 0, max: 200 },
  { campo: 'frequenciaCardiaca', rotulo: 'Freq. cardíaca', unidade: 'bpm', min: 0, max: 300 },
  { campo: 'frequenciaRespiratoria', rotulo: 'Freq. respiratória', unidade: 'irpm', min: 0, max: 100 },
  { campo: 'saturacao', rotulo: 'Saturação', unidade: '%', min: 0, max: 100 },
  { campo: 'temperatura', rotulo: 'Temperatura', unidade: '°C', min: 20, max: 45, casas: 1 },
  { campo: 'glicemia', rotulo: 'Glicemia', unidade: 'mg/dL', min: 0, max: 1000 },
] as const;
type Vitais = Record<string, number | null>;
const preenchidos = (v: Vitais) => Object.fromEntries(Object.entries(v).filter(([, n]) => n !== null && n !== undefined)) as Record<string, number>;

const UNIDADES = ['mg', 'mL', 'mcg', 'g', 'UI'] as const;
const VIAS = ['EV', 'IM', 'VO', 'SC', 'SL', 'IO', 'Inalatória'] as const;

/** Ícone de cada tipo: o mesmo conjunto (lucide) do resto do portal. */
const ICONE: Record<TipoEvento, ReactNode> = {
  SINAIS_VITAIS: <Activity aria-hidden />,
  GLASGOW: <Brain aria-hidden />,
  TRIAGEM: <Siren aria-hidden />,
  MEDICACAO: <Pill aria-hidden />,
  PROCEDIMENTO: <Stethoscope aria-hidden />,
  OBSERVACAO: <MessageSquareText aria-hidden />,
  RETIFICACAO: <Undo2 aria-hidden />,
  ENCERRAMENTO: <Flag aria-hidden />,
};

const TODOS: readonly TipoEvento[] = ['SINAIS_VITAIS', 'GLASGOW', 'TRIAGEM', 'MEDICACAO', 'PROCEDIMENTO', 'OBSERVACAO', 'RETIFICACAO', 'ENCERRAMENTO'];

const OUTRO = '__outro';

/** O que falta, por tipo, quando o contrato recusa o formulario. */
const FALTOU: Record<TipoEvento, string> = {
  SINAIS_VITAIS: 'Informe ao menos um sinal vital.',
  GLASGOW: 'Escolha as três respostas.',
  TRIAGEM: 'Escolha a classificação.',
  MEDICACAO: 'Informe medicamento, dose, unidade e via.',
  PROCEDIMENTO: 'Descreva o procedimento.',
  OBSERVACAO: 'Escreva a observação.',
  RETIFICACAO: 'Escolha o registro errado e diga o motivo.',
  ENCERRAMENTO: 'Escreva o desfecho.',
};

function GradeVitais({ valores, mudar }: { valores: Vitais; mudar: (v: Vitais) => void }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(11rem, 100%), 1fr))' }}>
      {VITAIS.map((vital) => (
        <CampoNumerico
          key={vital.campo}
          rotulo={vital.rotulo}
          unidade={vital.unidade}
          min={vital.min}
          max={vital.max}
          casas={'casas' in vital ? vital.casas : undefined}
          valor={valores[vital.campo] ?? null}
          aoMudar={(valor) => mudar({ ...valores, [vital.campo]: valor })}
        />
      ))}
    </div>
  );
}

export function RegistroPortal({ atendimentoId, encerrado, eventos }: { atendimentoId: string; encerrado: boolean; eventos: Evento[] }) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const [tipo, setTipo] = useState<TipoEvento>('SINAIS_VITAIS');
  const [vitais, setVitais] = useState<Vitais>({});
  const [glasgow, setGlasgow] = useState<RespostasGlasgow>(GLASGOW_VAZIO);
  const [protocolo, setProtocolo] = useState<'MANCHESTER' | 'START'>('MANCHESTER');
  const [cor, setCor] = useState<CorTriagem | null>(null); // o profissional escolhe; nada vem marcado
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
  // Muda a cada limpeza: remonta os campos (fecha o "Outra" das fichas).
  const [geracao, setGeracao] = useState(0);
  const campo = (nome: string) => campos[nome] ?? '';
  const mudar = (nome: string) => (valor: string) => setCampos((atuais) => ({ ...atuais, [nome]: valor }));

  const medicamentos = useQuery({
    queryKey: ['medicamentos', false],
    queryFn: () => listarTodosMedicamentos(false),
    enabled: tipo === 'MEDICACAO',
  });

  const retificados = new Set(eventos.map((e) => (e.tipo === 'RETIFICACAO' ? e.retificaEventoId : null)).filter(Boolean));
  const candidatos = eventos.filter((e) => e.tipo !== 'RETIFICACAO' && !retificados.has(e.id)).reverse();
  const alvo = eventos.find((e) => e.id === campo('alvo'));

  function limpar() {
    setVitais({});
    setGlasgow(GLASGOW_VAZIO);
    setCor(null);
    setCampos({});
    setFalha(null);
    setGeracao((g) => g + 1);
  }

  const gravacao = useMutation({
    mutationFn: async (lote: unknown[]) => {
      for (const entrada of lote) await registrarEvento(eventoEntradaSchema.parse(entrada));
    },
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['ficha', atendimentoId] });
      void consultas.invalidateQueries({ queryKey: ['atendimentos'] });
      avisar({ tom: 'sucesso', titulo: 'Registro gravado', descricao: rotuloEvento(tipo) });
      limpar();
    },
    onError: (erro) => setFalha(descreverErro(erro, 'o registro').descricao),
  });

  const { ocular, verbal, motora } = glasgow;
  const totalGlasgow = ocular && verbal && motora ? ocular + verbal + motora : null;

  function dados(): Record<string, unknown> {
    const c = (nome: string) => campo(nome).trim();
    switch (tipo) {
      case 'SINAIS_VITAIS':
        return preenchidos(vitais);
      case 'GLASGOW':
        return totalGlasgow === null ? {} : { ocular, verbal, motora, total: totalGlasgow };
      case 'TRIAGEM':
        return { protocolo, classificacao: cor };
      case 'MEDICACAO': {
        const escolhido = medicamentos.data?.find((m) => m.id === c('medicamento'));
        return { medicamentoId: escolhido?.id ?? null, nome: escolhido?.nome ?? c('nomeLivre'), dose: c('dose'), unidade: c('unidade'), via: c('via') };
      }
      case 'PROCEDIMENTO':
        return { descricao: c('texto') };
      case 'OBSERVACAO':
        return { texto: c('texto') };
      case 'RETIFICACAO': {
        const corrigidos = alvo?.tipo === 'SINAIS_VITAIS' ? preenchidos(vitais) : {};
        return { motivo: c('motivo'), ...(Object.keys(corrigidos).length ? { dadosCorrigidos: corrigidos } : {}) };
      }
      case 'ENCERRAMENTO':
        return { desfecho: c('desfecho'), ...(c('destino') ? { destino: c('destino') } : {}) };
    }
  }

  function aoEnviar(evento: FormEvent) {
    evento.preventDefault();
    setFalha(null);
    const base = { atendimentoId, ocorridoEm: new Date().toISOString() };
    const principal = {
      ...base,
      id: crypto.randomUUID(),
      tipo,
      dados: dados(),
      ...(tipo === 'RETIFICACAO' ? { retificaEventoId: campo('alvo') } : {}),
    };
    if (!eventoEntradaSchema.safeParse(principal).success) {
      setFalha(FALTOU[tipo]);
      return;
    }
    const lote: unknown[] = [principal];
    // Como no app: a medida corrigida entra tambem como registro novo, para a passagem de caso usa-la
    // (o resumo descarta o evento retificado e nao le `dadosCorrigidos`).
    const corrigidos = (principal.dados as { dadosCorrigidos?: object }).dadosCorrigidos;
    if (tipo === 'RETIFICACAO' && corrigidos) lote.push({ ...base, id: crypto.randomUUID(), tipo: 'SINAIS_VITAIS', dados: corrigidos });
    gravacao.mutate(lote);
  }

  const tipos = TODOS.filter((t) => !(encerrado && t === 'ENCERRAMENTO'));
  const textoBotao = tipo === 'GLASGOW' ? `Registrar Glasgow${totalGlasgow === null ? '' : ` ${totalGlasgow}`}` : `Registrar ${rotuloEvento(tipo).toLowerCase()}`;

  return (
    <Secao titulo="Registrar no atendimento" descricao="Entra na linha do tempo com a hora de agora e o seu nome. Para corrigir, use Retificação.">
      <form className="grid grid-cols-1 gap-4" onSubmit={aoEnviar} noValidate aria-label="Registrar no atendimento">
        <SeletorSegmentado
          grade
          rotulo="O que registrar"
          valor={tipo}
          aoMudar={(novo) => {
            setTipo(novo);
            limpar();
          }}
          opcoes={tipos.map((t) => ({
            valor: t,
            rotulo: (
              <>
                {ICONE[t]}
                {rotuloEvento(t)}
              </>
            ),
          }))}
        />

        <div key={`${tipo}-${geracao}`} className="grid grid-cols-1 gap-4 border-t border-fio pt-4">
          {tipo === 'SINAIS_VITAIS' ? <GradeVitais valores={vitais} mudar={setVitais} /> : null}

          {tipo === 'GLASGOW' ? <SeletorGlasgow valor={glasgow} aoMudar={setGlasgow} /> : null}

          {tipo === 'TRIAGEM' ? (
            <>
              <SeletorSegmentado
                className="max-w-xs"
                rotulo="Protocolo"
                valor={protocolo}
                aoMudar={(novo) => {
                  setProtocolo(novo);
                  setCor(null); // as cores do START não são as do Manchester
                }}
                opcoes={[
                  { valor: 'MANCHESTER', rotulo: 'Manchester' },
                  { valor: 'START', rotulo: 'START' },
                ]}
              />
              <SeletorTriagem protocolo={protocolo} valor={cor} aoMudar={setCor} rotulo={`Classificação ${protocolo === 'START' ? 'START' : 'Manchester'}`} />
            </>
          ) : null}

          {tipo === 'MEDICACAO' ? (
            <>
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(14rem, 100%), 1fr))' }}>
                <Select
                  rotulo="Medicamento"
                  vazio={medicamentos.isPending ? 'Carregando o catálogo…' : 'Escolha no catálogo'}
                  value={campo('medicamento')}
                  onChange={(e) => mudar('medicamento')(e.target.value)}
                  opcoes={[
                    ...(medicamentos.data ?? []).map((m) => ({ valor: m.id, rotulo: m.apresentacao ? `${m.nome} · ${m.apresentacao}` : m.nome })),
                    { valor: OUTRO, rotulo: 'Fora do catálogo (texto livre)' },
                  ]}
                />
                <CampoTexto rotulo="Dose" inputMode="decimal" value={campo('dose')} onChange={(e) => mudar('dose')(e.target.value)} autoComplete="off" />
              </div>
              {campo('medicamento') === OUTRO ? (
                <CampoTexto rotulo="Nome do medicamento" value={campo('nomeLivre')} onChange={(e) => mudar('nomeLivre')(e.target.value)} autoComplete="off" autoFocus />
              ) : null}
              <SeletorRapido rotulo="Unidade" opcoes={UNIDADES} valor={campo('unidade')} aoMudar={mudar('unidade')} />
              <SeletorRapido rotulo="Via" opcoes={VIAS} valor={campo('via')} aoMudar={mudar('via')} />
            </>
          ) : null}

          {tipo === 'PROCEDIMENTO' || tipo === 'OBSERVACAO' ? (
            <CampoArea
              rotulo={tipo === 'PROCEDIMENTO' ? 'Procedimento realizado' : 'Observação'}
              value={campo('texto')}
              onChange={(e) => mudar('texto')(e.target.value)}
            />
          ) : null}

          {tipo === 'RETIFICACAO' ? (
            <>
              <SeletorLista
                rotulo="Registro a retificar"
                vazio="Nenhum registro para retificar."
                valor={campo('alvo')}
                aoMudar={(id) => {
                  const escolhido = eventos.find((ev) => ev.id === id);
                  mudar('alvo')(id);
                  setVitais(escolhido?.tipo === 'SINAIS_VITAIS' ? (escolhido.dados as Vitais) : {});
                }}
                opcoes={candidatos.map((e) => ({
                  valor: e.id,
                  titulo: rotuloEvento(e.tipo),
                  detalhe: (
                    <>
                      <span className="mf-dado">{formatarDataHora(e.ocorridoEm)}</span> · {e.profissionalNome}
                    </>
                  ),
                }))}
              />
              <CampoArea rotulo="Motivo da retificação" linhas={2} value={campo('motivo')} onChange={(e) => mudar('motivo')(e.target.value)} />
              {alvo?.tipo === 'SINAIS_VITAIS' ? <GradeVitais valores={vitais} mudar={setVitais} /> : null}
              {alvo && alvo.tipo !== 'SINAIS_VITAIS' ? (
                <p className="m-0 text-pequeno text-tinta-2">
                  O registro fica marcado como retificado. Se houver valor certo, registre-o em seguida como um novo {rotuloEvento(alvo.tipo).toLowerCase()}.
                </p>
              ) : null}
            </>
          ) : null}

          {tipo === 'ENCERRAMENTO' ? (
            <>
              <CampoArea rotulo="Desfecho" linhas={2} value={campo('desfecho')} onChange={(e) => mudar('desfecho')(e.target.value)} />
              <CampoTexto rotulo="Destino (hospital, unidade)" value={campo('destino')} onChange={(e) => mudar('destino')(e.target.value)} autoComplete="off" />
            </>
          ) : null}
        </div>

        {falha ? (
          <p className="mf-campo__erro m-0" role="alert">
            <CircleAlert aria-hidden />
            <span>{falha}</span>
          </p>
        ) : null}
        <div>
          <Botao type="submit" variante="primario" icone={ICONE[tipo]} carregando={gravacao.isPending}>
            {textoBotao}
          </Botao>
        </div>
      </form>
    </Secao>
  );
}
