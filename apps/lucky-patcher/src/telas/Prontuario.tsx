import type { TipoItem } from '@medicalfield/contratos';
import { Botao, CampoTexto, Dialogo, EstadoErro, Esqueleto, Etiqueta, SeloSync } from '@medicalfield/ui';
import { ClipboardPlus, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ROTULO_ITEM, type ItemLocal } from '../dados/pessoas.ts';
import { Casca } from '../ui/Casca.tsx';
import { useApp, useConsulta, useGravar } from '../ui/contexto.tsx';
import { formatarCpf, formatarData, formatarMomento, identificacaoCurta } from '../ui/formato.ts';
import { LinhaAtendimento } from './Inicio.tsx';

const GRUPOS: Array<{ tipo: TipoItem; titulo: string; rotuloCampo: string; vazio: string }> = [
  { tipo: 'ALERGIA', titulo: 'Alergias', rotuloCampo: 'Nova alergia', vazio: 'Nenhuma alergia registrada.' },
  { tipo: 'COMORBIDADE', titulo: 'Comorbidades', rotuloCampo: 'Nova comorbidade', vazio: 'Nenhuma comorbidade registrada.' },
  { tipo: 'MEDICACAO_CONTINUA', titulo: 'Medicações contínuas', rotuloCampo: 'Nova medicação', vazio: 'Nenhuma medicação contínua registrada.' },
];

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
  const { gravar, gravando, campos } = useGravar();
  const [descricao, setDescricao] = useState('');

  async function adicionar(evento: FormEvent) {
    evento.preventDefault();
    if (await gravar(() => app.prontuarios.adicionarItem(pessoaId, grupo.tipo, descricao))) setDescricao('');
  }

  return (
    <section aria-label={grupo.titulo}>
      <div className="lp-cabecalho">
        <h2 className="mf-secao__titulo">{grupo.titulo}</h2>
        <span className="mf-rotulo">{itens.filter((item) => !item.inativadoEm).length}</span>
      </div>
      <ul className="lp-lista">
        {itens.length === 0 ? (
          <li>
            <span className="lp-linha lp-linha--vazia">{grupo.vazio}</span>
          </li>
        ) : null}
        {itens.map((item) => (
          <li key={item.id} className={item.inativadoEm ? 'lp-inativo' : undefined}>
            <div className="lp-linha">
              <span className="lp-linha__texto">
                <span className="lp-linha__titulo">{item.descricao}</span>
                <span className="lp-linha__apoio">
                  {item.inativadoEm ? `Inativado em ${formatarMomento(item.inativadoEm)}` : `Registrado em ${formatarMomento(item.registradoEm)}`}
                </span>
              </span>
              {item.envio !== 'confirmado' ? <SeloSync estado={item.envio} /> : null}
              {item.inativadoEm ? <Etiqueta>Inativo</Etiqueta> : <Botao onClick={() => aoPedirInativacao(item)}>Inativar</Botao>}
            </div>
          </li>
        ))}
      </ul>
      <form className="lp-acoes lp-acoes--campo" noValidate onSubmit={(e) => void adicionar(e)}>
        <CampoTexto
          rotulo={grupo.rotuloCampo}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          autoComplete="off"
          erro={campos.descricao ? 'Escreva o que registrar.' : undefined}
          className="lp-cresce"
        />
        <Botao type="submit" carregando={gravando} icone={<Plus aria-hidden />}>
          Adicionar
        </Botao>
      </form>
    </section>
  );
}

export function Prontuario() {
  const app = useApp();
  const navegar = useNavigate();
  const { pessoaId = '' } = useParams();
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

  async function iniciar(evento: FormEvent) {
    evento.preventDefault();
    let atendimentoId = '';
    const ok = await gravar(async () => {
      atendimentoId = await app.atendimentos.iniciar({ pessoaId, queixaPrincipal: queixa, localDescricao: local });
    });
    if (ok) navegar(`/atendimentos/${atendimentoId}`);
  }

  const voltar = { para: '/pacientes', rotulo: 'Pacientes' };
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
        <Esqueleto linhas={6} altura="2.5rem" />
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
  // Só as linhas que têm dado: sete travessões não informam nada.
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
      subtitulo={
        <>
          Prontuário{identificacaoCurta(pessoa) ? ` · ${identificacaoCurta(pessoa)}` : ''}
        </>
      }
      acaoTopo={pessoa.envio !== 'confirmado' ? <SeloSync estado={pessoa.envio} /> : undefined}
      atual="pacientes"
      voltar={voltar}
    >
      {abertos.length > 0 ? (
        <section aria-label="Atendimento em aberto">
          <div className="lp-cabecalho">
            <h2 className="mf-secao__titulo">Atendimento em aberto</h2>
          </div>
          <ul className="lp-lista">
            {abertos.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </ul>
        </section>
      ) : null}

      <form className="lp-bloco" noValidate onSubmit={(e) => void iniciar(e)}>
        <div className="lp-cabecalho" style={{ marginBottom: 0 }}>
          <h2 className="mf-secao__titulo">Novo atendimento</h2>
        </div>
        <CampoTexto rotulo="Queixa principal" value={queixa} onChange={(e) => setQueixa(e.target.value)} autoComplete="off" erro={campos.queixaPrincipal} />
        <CampoTexto rotulo="Local da ocorrência" value={local} onChange={(e) => setLocal(e.target.value)} autoComplete="off" erro={campos.localDescricao} />
        <Botao type="submit" variante="primario" largo carregando={gravando} icone={<ClipboardPlus aria-hidden />}>
          Iniciar atendimento
        </Botao>
      </form>

      {GRUPOS.map((grupo) => (
        <GrupoItens
          key={grupo.tipo}
          grupo={grupo}
          pessoaId={pessoaId}
          itens={prontuario.itens.filter((item) => item.tipo === grupo.tipo)}
          aoPedirInativacao={setInativar}
        />
      ))}

      <section aria-label="Cadastro">
        <div className="lp-cabecalho">
          <h2 className="mf-secao__titulo">Cadastro</h2>
        </div>
        {fatos.length === 0 ? (
          <ul className="lp-lista">
            <li>
              <span className="lp-linha lp-linha--vazia">Só o nome foi informado neste cadastro.</span>
            </li>
          </ul>
        ) : (
          <dl className="lp-fatos">
            {fatos.map(([rotulo, valor, apoio]) => (
              <div key={rotulo}>
                <dt className="mf-rotulo">{rotulo}</dt>
                <dd>
                  {valor}
                  {apoio ? <small>{apoio}</small> : null}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {anteriores.length > 0 ? (
        <section aria-label="Atendimentos encerrados neste aparelho">
          <div className="lp-cabecalho">
            <h2 className="mf-secao__titulo">Encerrados neste aparelho</h2>
          </div>
          <ul className="lp-lista">
            {anteriores.map((atendimento) => (
              <LinhaAtendimento key={atendimento.id} atendimento={atendimento} />
            ))}
          </ul>
        </section>
      ) : null}

      <Dialogo
        aberto={inativar !== null}
        aoFechar={() => setInativar(null)}
        titulo={inativar ? `Inativar ${ROTULO_ITEM[inativar.tipo].toLowerCase()}?` : ''}
        acoes={
          <>
            <Botao onClick={() => setInativar(null)}>Manter ativo</Botao>
            <Botao
              variante="perigo"
              carregando={inativacao.gravando}
              onClick={async () => {
                if (inativar && (await inativacao.gravar(() => app.prontuarios.inativarItem(inativar)))) setInativar(null);
              }}
            >
              Inativar
            </Botao>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          <strong>{inativar?.descricao}</strong> deixa de aparecer na passagem de caso. O item continua no prontuário, marcado
          como inativo, com a hora e o seu nome.
        </p>
      </Dialogo>
    </Casca>
  );
}
