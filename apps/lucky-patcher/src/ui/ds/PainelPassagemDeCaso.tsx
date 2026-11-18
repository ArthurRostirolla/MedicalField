// A "via rosa": resumo factual para a entrega no hospital, derivado da linha do tempo.
// So exibe o que foi registrado e quando; nenhuma interpretacao clinica.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { formatarHora } from '../formato.ts';
import { Rotulo, Texto, Titulo, estiloNumeral } from './base.tsx';
import { descricaoTriagem, EtiquetaTriagem, type CorTriagem, type ProtocoloTriagem } from './etiquetas.tsx';
import { Leituras, leiturasSinaisVitais } from './LinhaDoTempo.tsx';
import { useTema } from './tema.tsx';
import { MEDIDA } from './tokens.ts';

/** Compativel estruturalmente com `Resumo` de `docs/contratos.md` §6. */
export interface ResumoPassagem {
  ultimosSinaisVitais: { ocorridoEm: string; dados: object } | null;
  glasgowMaisRecente: { ocorridoEm: string; dados: object } | null;
  triagem: { ocorridoEm: string; dados: object } | null;
  medicacoes: ReadonlyArray<{ ocorridoEm: string; nome: string; dose: string; unidade: string; via: string }>;
  procedimentos: ReadonlyArray<{ ocorridoEm: string; descricao: string }>;
  alergias: ReadonlyArray<string>;
  comorbidades: ReadonlyArray<string>;
  medicacoesContinuas: ReadonlyArray<string>;
  encerramento: { ocorridoEm: string; desfecho: string; destino: string | null } | null;
}

export interface PainelPassagemDeCasoProps {
  resumo: ResumoPassagem;
  /** Nome e identificacao curta do paciente (ex.: "58 anos · M"). */
  paciente?: { nome: string; identificacao?: string };
  queixaPrincipal?: string | null;
  acoes?: ReactNode;
  fusoHorario?: string;
}

function Hora({ iso, fuso }: { iso: string; fuso?: string }) {
  return (
    <Texto dado tamanho="rotulo" tom="tinta2">
      {formatarHora(iso, fuso)}
    </Texto>
  );
}

function Celula({ rotulo, hora, children }: { rotulo: string; hora?: ReactNode; children: ReactNode }) {
  const { cores } = useTema();
  return (
    <View style={{ padding: 12, gap: 4, borderTopWidth: 1, borderTopColor: cores.rosaFio }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
        <Rotulo style={{ color: cores.rosaTinta }}>{rotulo}</Rotulo>
        {hora}
      </View>
      {children}
    </View>
  );
}

function Ausente({ children }: { children: string }) {
  return (
    <Texto tom="tinta3" style={{ fontStyle: 'italic' }}>
      {children}
    </Texto>
  );
}

function Lista({ itens, vazio }: { itens: ReadonlyArray<ReactNode>; vazio: string }) {
  if (itens.length === 0) return <Ausente>{vazio}</Ausente>;
  return (
    <View role="list" style={{ gap: 4 }}>
      {itens.map((item, indice) => (
        <View key={indice} role="listitem" style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
          {typeof item === 'string' ? <Texto>{item}</Texto> : item}
        </View>
      ))}
    </View>
  );
}

export function PainelPassagemDeCaso({ resumo, paciente, queixaPrincipal, acoes, fusoHorario }: PainelPassagemDeCasoProps) {
  const { cores } = useTema();
  const triagem = resumo.triagem?.dados as { protocolo?: ProtocoloTriagem; classificacao?: CorTriagem } | undefined;
  const glasgow = resumo.glasgowMaisRecente?.dados as Record<string, unknown> | undefined;
  const naoRegistrado = <Ausente>Não registrado</Ausente>;

  return (
    <View
      role="region"
      aria-label="Passagem de caso"
      style={{ backgroundColor: cores.rosa, borderWidth: 1, borderColor: cores.rosaFio, borderLeftWidth: 4, borderLeftColor: cores.marca, borderRadius: MEDIDA.raio }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 12 }}>
        <Titulo nivel={2} style={{ color: cores.rosaTinta }}>
          Passagem de caso
        </Titulo>
        {acoes}
      </View>

      {paciente || queixaPrincipal ? (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 2 }}>
          {paciente ? (
            <Texto forte style={{ fontSize: 20 }}>
              {paciente.nome}
              {paciente.identificacao ? <Texto style={{ fontWeight: '500' }}> · {paciente.identificacao}</Texto> : null}
            </Texto>
          ) : null}
          {queixaPrincipal ? (
            <Texto>
              <Rotulo>Queixa principal </Rotulo>
              {queixaPrincipal}
            </Texto>
          ) : null}
        </View>
      ) : null}

      <Celula rotulo="Triagem" hora={resumo.triagem ? <Hora iso={resumo.triagem.ocorridoEm} fuso={fusoHorario} /> : null}>
        {triagem?.protocolo && triagem.classificacao ? (
          <View style={{ gap: 4 }}>
            <EtiquetaTriagem protocolo={triagem.protocolo} classificacao={triagem.classificacao} tamanho="g" />
            <Texto>
              {[triagem.protocolo === 'START' ? 'START' : 'Manchester', descricaoTriagem(triagem.protocolo, triagem.classificacao)].filter(Boolean).join(' · ')}
            </Texto>
          </View>
        ) : (
          naoRegistrado
        )}
      </Celula>

      <Celula rotulo="Glasgow" hora={resumo.glasgowMaisRecente ? <Hora iso={resumo.glasgowMaisRecente.ocorridoEm} fuso={fusoHorario} /> : null}>
        {glasgow ? (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
            <Texto style={estiloNumeral}>{String(glasgow.total ?? '—')}</Texto>
            <Texto dado>
              O{String(glasgow.ocular ?? '—')} V{String(glasgow.verbal ?? '—')} M{String(glasgow.motora ?? '—')}
            </Texto>
          </View>
        ) : (
          naoRegistrado
        )}
      </Celula>

      <Celula rotulo="Alergias registradas">
        <Lista
          vazio="Nenhuma registrada"
          itens={resumo.alergias.map((alergia) => (
            <Texto forte tom="carmim">
              {alergia}
            </Texto>
          ))}
        />
      </Celula>

      <Celula rotulo="Últimos sinais vitais" hora={resumo.ultimosSinaisVitais ? <Hora iso={resumo.ultimosSinaisVitais.ocorridoEm} fuso={fusoHorario} /> : null}>
        {resumo.ultimosSinaisVitais ? <Leituras leituras={leiturasSinaisVitais(resumo.ultimosSinaisVitais.dados)} /> : naoRegistrado}
      </Celula>

      <Celula rotulo="Medicações administradas">
        <Lista
          vazio="Nenhuma registrada"
          itens={resumo.medicacoes.map((medicacao) => (
            <>
              <Hora iso={medicacao.ocorridoEm} fuso={fusoHorario} />
              <Texto style={{ flex: 1 }}>
                <Texto forte>{medicacao.nome}</Texto> · <Texto dado>{medicacao.dose}</Texto> {medicacao.unidade} · {medicacao.via}
              </Texto>
            </>
          ))}
        />
      </Celula>

      <Celula rotulo="Procedimentos">
        <Lista
          vazio="Nenhum registrado"
          itens={resumo.procedimentos.map((procedimento) => (
            <>
              <Hora iso={procedimento.ocorridoEm} fuso={fusoHorario} />
              <Texto style={{ flex: 1 }}>{procedimento.descricao}</Texto>
            </>
          ))}
        />
      </Celula>

      <Celula rotulo="Comorbidades">
        <Lista itens={resumo.comorbidades} vazio="Nenhuma registrada" />
      </Celula>

      <Celula rotulo="Medicações contínuas">
        <Lista itens={resumo.medicacoesContinuas} vazio="Nenhuma registrada" />
      </Celula>

      {resumo.encerramento ? (
        <Celula rotulo="Encerramento" hora={<Hora iso={resumo.encerramento.ocorridoEm} fuso={fusoHorario} />}>
          <Texto>
            <Texto forte>{resumo.encerramento.desfecho}</Texto>
            {resumo.encerramento.destino ? ` · Destino: ${resumo.encerramento.destino}` : null}
          </Texto>
        </Celula>
      ) : null}
    </View>
  );
}
