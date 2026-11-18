// Registro pelo portal: os mesmos eventos do app, gravados direto na central (o portal e sempre online).
// Nada se edita: corrigir e acrescentar uma RETIFICACAO apontando o registro errado.
import { CLASSIFICACOES_TRIAGEM, eventoEntradaSchema, type Evento, type TipoEvento } from '@medicalfield/contratos';
import { calcularTotalGlasgow } from '@medicalfield/dominio';
import { Botao, CampoNumerico, CampoTexto, Secao, Select, rotuloEvento } from '@medicalfield/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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

const GLASGOW = [
  { campo: 'ocular', rotulo: 'Abertura ocular', max: 4 },
  { campo: 'verbal', rotulo: 'Resposta verbal', max: 5 },
  { campo: 'motora', rotulo: 'Resposta motora', max: 6 },
] as const;

const OUTRO = '__outro';

/** O que falta, por tipo, quando o contrato recusa o formulario. */
const FALTOU: Record<TipoEvento, string> = {
  SINAIS_VITAIS: 'Informe ao menos um sinal vital.',
  GLASGOW: 'Escolha as três respostas.',
  TRIAGEM: 'Escolha o protocolo e a classificação.',
  MEDICACAO: 'Informe medicamento, dose, unidade e via.',
  PROCEDIMENTO: 'Descreva o procedimento.',
  OBSERVACAO: 'Escreva a observação.',
  RETIFICACAO: 'Escolha o registro errado e diga o motivo.',
  ENCERRAMENTO: 'Escreva o desfecho.',
};

function GradeVitais({ valores, mudar }: { valores: Vitais; mudar: (v: Vitais) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

const texto = (rotulo: string, valor: string, mudar: (v: string) => void) => (
  <CampoTexto rotulo={rotulo} value={valor} onChange={(e) => mudar(e.target.value)} autoComplete="off" />
);

export function RegistroPortal({ atendimentoId, encerrado, eventos }: { atendimentoId: string; encerrado: boolean; eventos: Evento[] }) {
  const avisar = useAvisar();
  const consultas = useQueryClient();
  const [tipo, setTipo] = useState<TipoEvento>('SINAIS_VITAIS');
  const [vitais, setVitais] = useState<Vitais>({});
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [falha, setFalha] = useState<string | null>(null);
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

  const gravacao = useMutation({
    mutationFn: async (lote: unknown[]) => {
      for (const entrada of lote) await registrarEvento(eventoEntradaSchema.parse(entrada));
    },
    onSuccess: () => {
      void consultas.invalidateQueries({ queryKey: ['ficha', atendimentoId] });
      void consultas.invalidateQueries({ queryKey: ['atendimentos'] });
      avisar({ tom: 'sucesso', titulo: 'Registro gravado', descricao: rotuloEvento(tipo) });
      setVitais({});
      setCampos({});
    },
    onError: (erro) => setFalha(descreverErro(erro, 'o registro').descricao),
  });

  function dados(): Record<string, unknown> {
    const c = (nome: string) => campo(nome).trim();
    switch (tipo) {
      case 'SINAIS_VITAIS':
        return preenchidos(vitais);
      case 'GLASGOW': {
        const partes = { ocular: Number(c('ocular')), verbal: Number(c('verbal')), motora: Number(c('motora')) };
        return { ...partes, total: calcularTotalGlasgow(partes) };
      }
      case 'TRIAGEM':
        return { protocolo: c('protocolo'), classificacao: c('classificacao') };
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

  const tipos = (['SINAIS_VITAIS', 'GLASGOW', 'TRIAGEM', 'MEDICACAO', 'PROCEDIMENTO', 'OBSERVACAO', 'RETIFICACAO', 'ENCERRAMENTO'] as const).filter(
    (t) => !(encerrado && t === 'ENCERRAMENTO'),
  );
  const protocolo = campo('protocolo') as keyof typeof CLASSIFICACOES_TRIAGEM | '';

  return (
    <Secao titulo="Registrar no atendimento" descricao="Entra na linha do tempo com a hora de agora e o seu nome. Para corrigir, use Retificação.">
      <form className="grid grid-cols-1 gap-3" onSubmit={aoEnviar} noValidate>
        <Select
          rotulo="Tipo de registro"
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoEvento);
            setVitais({});
            setCampos({});
            setFalha(null);
          }}
          opcoes={tipos.map((t) => ({ valor: t, rotulo: rotuloEvento(t) }))}
        />

        {tipo === 'SINAIS_VITAIS' ? <GradeVitais valores={vitais} mudar={setVitais} /> : null}

        {tipo === 'GLASGOW' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {GLASGOW.map((g) => (
              <Select
                key={g.campo}
                rotulo={g.rotulo}
                vazio="Escolha"
                value={campo(g.campo)}
                onChange={(e) => mudar(g.campo)(e.target.value)}
                opcoes={Array.from({ length: g.max }, (_, i) => String(g.max - i)).map((n) => ({ valor: n, rotulo: n }))}
              />
            ))}
          </div>
        ) : null}

        {tipo === 'TRIAGEM' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              rotulo="Protocolo"
              vazio="Escolha"
              value={protocolo}
              onChange={(e) => setCampos({ protocolo: e.target.value })}
              opcoes={[
                { valor: 'MANCHESTER', rotulo: 'Manchester' },
                { valor: 'START', rotulo: 'START' },
              ]}
            />
            <Select
              rotulo="Classificação"
              vazio="Escolha"
              disabled={!protocolo}
              value={campo('classificacao')}
              onChange={(e) => mudar('classificacao')(e.target.value)}
              opcoes={(protocolo ? CLASSIFICACOES_TRIAGEM[protocolo] : []).map((cor) => ({ valor: cor, rotulo: cor[0] + cor.slice(1).toLowerCase() }))}
            />
          </div>
        ) : null}

        {tipo === 'MEDICACAO' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              rotulo="Medicamento"
              vazio={medicamentos.isPending ? 'Carregando…' : 'Escolha'}
              value={campo('medicamento')}
              onChange={(e) => mudar('medicamento')(e.target.value)}
              opcoes={[
                ...(medicamentos.data ?? []).map((m) => ({ valor: m.id, rotulo: m.apresentacao ? `${m.nome} · ${m.apresentacao}` : m.nome })),
                { valor: OUTRO, rotulo: 'Outro (fora do catálogo)' },
              ]}
            />
            {campo('medicamento') === OUTRO ? texto('Nome do medicamento', campo('nomeLivre'), mudar('nomeLivre')) : <span className="hidden sm:block" />}
            {texto('Dose', campo('dose'), mudar('dose'))}
            {texto('Unidade (mg, mL, UI…)', campo('unidade'), mudar('unidade'))}
            {texto('Via (EV, IM, VO…)', campo('via'), mudar('via'))}
          </div>
        ) : null}

        {tipo === 'PROCEDIMENTO' ? texto('Procedimento realizado', campo('texto'), mudar('texto')) : null}
        {tipo === 'OBSERVACAO' ? texto('Observação', campo('texto'), mudar('texto')) : null}

        {tipo === 'RETIFICACAO' ? (
          <>
            <Select
              rotulo="Registro a retificar"
              vazio={candidatos.length ? 'Escolha o registro' : 'Nenhum registro para retificar'}
              value={campo('alvo')}
              onChange={(e) => {
                const escolhido = eventos.find((ev) => ev.id === e.target.value);
                mudar('alvo')(e.target.value);
                setVitais(escolhido?.tipo === 'SINAIS_VITAIS' ? (escolhido.dados as Vitais) : {});
              }}
              opcoes={candidatos.map((e) => ({ valor: e.id, rotulo: `${formatarDataHora(e.ocorridoEm)} · ${rotuloEvento(e.tipo)} · ${e.profissionalNome}` }))}
            />
            {texto('Motivo da retificação', campo('motivo'), mudar('motivo'))}
            {alvo?.tipo === 'SINAIS_VITAIS' ? <GradeVitais valores={vitais} mudar={setVitais} /> : null}
            {alvo && alvo.tipo !== 'SINAIS_VITAIS' ? (
              <p className="m-0 text-pequeno text-tinta-2">O registro fica marcado como retificado. Se houver valor certo, registre-o em seguida como um novo {rotuloEvento(alvo.tipo).toLowerCase()}.</p>
            ) : null}
          </>
        ) : null}

        {tipo === 'ENCERRAMENTO' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {texto('Desfecho', campo('desfecho'), mudar('desfecho'))}
            {texto('Destino (hospital, unidade)', campo('destino'), mudar('destino'))}
          </div>
        ) : null}

        {falha ? (
          <p className="mf-campo__erro m-0" role="alert">
            <CircleAlert aria-hidden />
            <span>{falha}</span>
          </p>
        ) : null}
        <div>
          <Botao type="submit" variante="primario" carregando={gravacao.isPending}>
            Registrar {rotuloEvento(tipo).toLowerCase()}
          </Botao>
        </div>
      </form>
    </Secao>
  );
}
