import type { TipoItem } from '@medicalfield/contratos';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ClipboardPlus, Plus } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ROTULO_ITEM, type ItemLocal } from '../dados/pessoas.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta, useGravar } from '../ui/contexto.tsx';
import { Botao, CampoTexto, Dialogo, EstadoErro, Esqueleto, Etiqueta, MEDIDA, Rotulo, SeloSync, Texto, Titulo, useEstilos } from '../ui/ds/index.ts';
import { formatarCpf, formatarData, formatarMomento, identificacaoCurta } from '../ui/formato.ts';
import { LinhaAtendimento } from './Inicio.tsx';

const GRUPOS: Array<{ tipo: TipoItem; titulo: string; rotuloCampo: string; vazio: string }> = [
  { tipo: 'ALERGIA', titulo: 'Alergias', rotuloCampo: 'Nova alergia', vazio: 'Nenhuma alergia registrada.' },
  { tipo: 'COMORBIDADE', titulo: 'Comorbidades', rotuloCampo: 'Nova comorbidade', vazio: 'Nenhuma comorbidade registrada.' },
  { tipo: 'MEDICACAO_CONTINUA', titulo: 'Medicações contínuas', rotuloCampo: 'Nova medicação', vazio: 'Nenhuma medicação contínua registrada.' },
];

function useEstilosTela() {
  return useEstilos((c) => ({
    cabecalho: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
    lista: { backgroundColor: c.papel, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raio },
    linha: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: MEDIDA.alvo, paddingVertical: 8, paddingHorizontal: MEDIDA.recuo, borderTopWidth: 1, borderTopColor: c.fio },
    primeira: { borderTopWidth: 0 },
    bloco: { gap: 12, padding: MEDIDA.recuo, backgroundColor: c.papel, borderWidth: 1, borderColor: c.fio, borderRadius: MEDIDA.raio },
  }));
}

/** Secao com titulo h2 e contagem opcional. */
function Grupo({ titulo, contagem, children }: { titulo: string; contagem?: number; children: ReactNode }) {
  const s = useEstilosTela();
  return (
    <View role="region" aria-label={titulo}>
      <View style={s.cabecalho}>
        <Titulo nivel={2}>{titulo}</Titulo>
        {contagem !== undefined ? <Rotulo>{contagem}</Rotulo> : null}
      </View>
      {children}
    </View>
  );
}

function GrupoItens({
  grupo,
  itens,
  pessoaId,
  aoPedirInativacao,
}: {
  grupo: (typeof GRUPOS)[number];
  itens: ItemLocal[];
  pessoaId: string;
  aoPedirInativacao: (item: ItemLocal) => void;
}) {
  const app = useApp();
  const s = useEstilosTela();
  const { gravar, gravando, campos } = useGravar();
  const [descricao, setDescricao] = useState('');

  async function adicionar() {
    if (await gravar(() => app.prontuarios.adicionarItem(pessoaId, grupo.tipo, descricao))) setDescricao('');
  }

  return (
    <Grupo titulo={grupo.titulo} contagem={itens.filter((item) => !item.inativadoEm).length}>
      <View role="list" style={s.lista}>
        {itens.length === 0 ? (
          <View role="listitem" style={[s.linha, s.primeira]}>
            <Texto tom="tinta3">{grupo.vazio}</Texto>
          </View>
        ) : null}
        {itens.map((item, indice) => (
          <View key={item.id} role="listitem" style={[s.linha, indice === 0 && s.primeira, item.inativadoEm ? { opacity: 0.6 } : null]}>
            <View style={{ flex: 1 }}>
              <Texto forte style={item.inativadoEm ? { textDecorationLine: 'line-through' } : undefined}>
                {item.descricao}
              </Texto>
              <Texto tamanho="pequeno" tom="tinta2">
                {item.inativadoEm ? `Inativado em ${formatarMomento(item.inativadoEm)}` : `Registrado em ${formatarMomento(item.registradoEm)}`}
              </Texto>
            </View>
            {item.envio !== 'confirmado' ? <SeloSync estado={item.envio} /> : null}
            {item.inativadoEm ? <Etiqueta>Inativo</Etiqueta> : <Botao onPress={() => aoPedirInativacao(item)}>Inativar</Botao>}
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8 }}>
        <CampoTexto
          rotulo={grupo.rotuloCampo}
          value={descricao}
          onChangeText={setDescricao}
          onSubmitEditing={() => void adicionar()}
          autoComplete="off"
          erro={campos.descricao ? 'Escreva o que registrar.' : undefined}
          style={{ flex: 1 }}
        />
        <Botao carregando={gravando} icone={Plus} onPress={() => void adicionar()} style={{ minHeight: 64 }}>
          Adicionar
        </Botao>
      </View>
    </Grupo>
  );
}

export function Prontuario() {
  const app = useApp();
  const roteador = useRouter();
  const s = useEstilosTela();
  const { pessoaId = '' } = useLocalSearchParams<{ pessoaId: string }>();
  const { gravar, gravando, campos } = useGravar();
  const [queixa, setQueixa] = useState('');
  const [local, setLocal] = useState('');
  const [inativar, setInativar] = useState<ItemLocal | null>(null);
  const inativacao = useGravar();

  const dados = useConsulta(
    async () => ({
      pessoa: await app.pessoas.obter(pessoaId),
      prontuario: await app.prontuarios.obter(pessoaId),
      atendimentos: await app.atendimentos.daPessoa(pessoaId),
    }),
    [pessoaId],
  );

  async function iniciar() {
    let atendimentoId = '';
    const ok = await gravar(async () => {
      atendimentoId = await app.atendimentos.iniciar({ pessoaId, queixaPrincipal: queixa, localDescricao: local });
    });
    if (ok) roteador.navigate(`/atendimentos/${atendimentoId}`);
  }

  const voltar = { para: '/pacientes' as const, rotulo: 'Pacientes' };
  if (dados.erro) {
    return (
      <Casca titulo="Prontuário" atual="pacientes" voltar={voltar}>
        <EstadoErro titulo="Não foi possível ler o banco local" descricao={dados.erro.message} aoTentarDeNovo={dados.recarregar} />
      </Casca>
    );
  }
  if (!dados.dados) {
    return (
      <Casca titulo="Prontuário" atual="pacientes" voltar={voltar}>
        <Esqueleto linhas={6} altura={40} />
      </Casca>
    );
  }
  const { pessoa, prontuario, atendimentos } = dados.dados;
  if (!pessoa) {
    return (
      <Casca titulo="Prontuário" atual="pacientes" voltar={voltar}>
        <EstadoErro titulo="Paciente não encontrado neste aparelho" descricao="O cadastro pode ter sido descartado. Volte e busque de novo." />
      </Casca>
    );
  }
  // So as linhas que tem dado: sete travessoes nao informam nada.
  const fatos = (
    [
      ['Como reconhecer', pessoa.naoIdentificada ? (pessoa.descricaoIdentificacao ?? 'Sem descrição') : null],
      ['Nascimento', pessoa.dataNascimento ? formatarData(pessoa.dataNascimento) : null],
      ['CPF', formatarCpf(pessoa.cpf)],
      ['Cartão SUS', pessoa.cns],
      ['Telefone', pessoa.telefone],
      [
        'Contato de emergência',
        pessoa.contatoEmergenciaNome ?? pessoa.contatoEmergenciaTelefone ?? pessoa.contatoEmergenciaEmail,
        pessoa.contatoEmergenciaNome ? [pessoa.contatoEmergenciaTelefone, pessoa.contatoEmergenciaEmail].filter(Boolean).join(' · ') : null,
      ],
      ['Tipo sanguíneo', prontuario.tipoSanguineo],
      ['Observações', prontuario.observacoes],
    ] as Array<[string, string | null, (string | null)?]>
  ).filter(([, valor]) => valor);
  const abertos = atendimentos.filter((atendimento) => atendimento.status === 'ABERTO');
  const anteriores = atendimentos.filter((atendimento) => atendimento.status === 'ENCERRADO');

  return (
    <Casca
      titulo={pessoa.nome}
      subtitulo={`Prontuário${identificacaoCurta(pessoa) ? ` · ${identificacaoCurta(pessoa)}` : ''}`}
      acaoTopo={pessoa.envio !== 'confirmado' ? <SeloSync estado={pessoa.envio} /> : undefined}
      atual="pacientes"
      voltar={voltar}
    >
      {abertos.length > 0 ? (
        <Grupo titulo="Atendimento em aberto">
          <View role="list" style={s.lista}>
            {abertos.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </View>
        </Grupo>
      ) : null}

      <View style={s.bloco}>
        <Titulo nivel={2}>Novo atendimento</Titulo>
        <CampoTexto rotulo="Queixa principal" value={queixa} onChangeText={setQueixa} autoComplete="off" erro={campos.queixaPrincipal} />
        <CampoTexto rotulo="Local da ocorrência" value={local} onChangeText={setLocal} autoComplete="off" erro={campos.localDescricao} />
        <Botao variante="primario" largo carregando={gravando} icone={ClipboardPlus} onPress={() => void iniciar()}>
          Iniciar atendimento
        </Botao>
      </View>

      {GRUPOS.map((grupo) => (
        <GrupoItens
          key={grupo.tipo}
          grupo={grupo}
          pessoaId={pessoaId}
          itens={prontuario.itens.filter((item) => item.tipo === grupo.tipo)}
          aoPedirInativacao={setInativar}
        />
      ))}

      <Grupo titulo="Cadastro">
        {fatos.length === 0 ? (
          <View style={[s.lista, s.linha, s.primeira]}>
            <Texto tom="tinta3">Só o nome foi informado neste cadastro.</Texto>
          </View>
        ) : (
          <View style={[s.lista, { padding: MEDIDA.recuo, gap: 12 }]}>
            {fatos.map(([rotulo, valor, apoio]) => (
              <View key={rotulo}>
                <Rotulo>{rotulo}</Rotulo>
                <Texto>{valor}</Texto>
                {apoio ? (
                  <Texto tamanho="pequeno" tom="tinta2">
                    {apoio}
                  </Texto>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </Grupo>

      {anteriores.length > 0 ? (
        <Grupo titulo="Encerrados neste aparelho">
          <View role="list" style={s.lista}>
            {anteriores.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </View>
        </Grupo>
      ) : null}

      <Dialogo
        aberto={inativar !== null}
        aoFechar={() => setInativar(null)}
        titulo={inativar ? `Inativar ${ROTULO_ITEM[inativar.tipo].toLowerCase()}?` : ''}
        acoes={
          <>
            <Botao onPress={() => setInativar(null)}>Manter ativo</Botao>
            <Botao
              variante="perigo"
              carregando={inativacao.gravando}
              onPress={async () => {
                if (inativar && (await inativacao.gravar(() => app.prontuarios.inativarItem(inativar)))) setInativar(null);
              }}
            >
              Inativar
            </Botao>
          </>
        }
      >
        <Texto>
          <Texto forte>{inativar?.descricao}</Texto> sai da passagem de caso e fica riscado no prontuário.
        </Texto>
      </Dialogo>
    </Casca>
  );
}
