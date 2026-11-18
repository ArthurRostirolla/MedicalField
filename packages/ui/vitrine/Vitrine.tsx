import { FileDown, Moon, Plus, Search, Sun, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  BarraConectividade,
  Botao,
  CampoNumerico,
  CampoTexto,
  Chave,
  Checkbox,
  CLASSIFICACOES_TRIAGEM,
  Dialogo,
  Esqueleto,
  EstadoErro,
  EstadoVazio,
  Etiqueta,
  EtiquetaTriagem,
  LinhaDoTempo,
  Marca,
  Paginacao,
  PainelPassagemDeCaso,
  Secao,
  Select,
  SeletorSegmentado,
  SeletorTriagem,
  SeloSync,
  Tabela,
  Toast,
  type CorTriagem,
  type Tema,
} from '../src';
import { razaoContraste } from '../src/contraste';
import { ComposicaoApp, ComposicaoPortal } from './composicoes';
import { ATENDIMENTOS, EVENTOS, FUSO, MEDICAMENTOS, PACIENTE, QUEIXA, RESUMO } from './dados';

/* ───────── Peças da própria vitrine ───────── */

function Capitulo({ id, titulo, resumo, children }: { id: string; titulo: string; resumo?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-16 border-t-2 border-tinta pt-4 pb-14">
      <div className="mb-6 grid gap-x-10 gap-y-2 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <h2 className="text-titulo-2 font-[780] [font-stretch:80%]">{titulo}</h2>
        {resumo ? <p className="max-w-[68ch] text-campo text-tinta-2">{resumo}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Peca({ nome, nota, children, larga }: { nome: string; nota?: ReactNode; children: ReactNode; larga?: boolean }) {
  return (
    <div className={`grid gap-x-10 gap-y-3 border-t border-fio py-5 lg:grid-cols-[14rem_minmax(0,1fr)] ${larga ? 'lg:grid-cols-1' : ''}`}>
      <div>
        <h3 className="text-corpo font-bold">{nome}</h3>
        {nota ? <p className="mt-1 max-w-[40ch] text-pequeno text-tinta-2">{nota}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const Fila = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-3">{children}</div>;

/* ───────── Cor: amostras com contraste medido no tema ativo ───────── */

const PARES: Array<[rotulo: string, texto: string, fundo: string, uso: string, minimo: number]> = [
  ['tinta / papel', '--mf-tinta', '--mf-papel', 'Texto principal', 7],
  ['tinta-2 / papel', '--mf-tinta-2', '--mf-papel', 'Texto de apoio, rótulos', 7],
  ['tinta-3 / papel', '--mf-tinta-3', '--mf-papel', 'Placeholder, nº da entrada', 4.5],
  ['tinta / mesa', '--mf-tinta', '--mf-mesa', 'Texto sobre o fundo', 7],
  ['sobre-marca / marca', '--mf-sobre-marca', '--mf-marca', 'Ação primária', 4.5],
  ['marca / papel', '--mf-marca', '--mf-papel', 'Link, selo local', 4.5],
  ['sobre-inverso / inverso', '--mf-sobre-inverso', '--mf-inverso', 'Seleção, offline', 7],
  ['tinta / rosa', '--mf-tinta', '--mf-rosa', 'Passagem de caso', 7],
  ['rosa-tinta / rosa', '--mf-rosa-tinta', '--mf-rosa', 'Rótulos da via rosa', 4.5],
  ['carmim / papel', '--mf-carmim', '--mf-papel', 'Erro, rejeição', 4.5],
  ['carmim / carmim-suave', '--mf-carmim', '--mf-carmim-suave', 'Botão de perigo em hover', 4.5],
  ['fio-forte / papel', '--mf-fio-forte', '--mf-papel', 'Contorno de controle', 3],
];

function hex(cor: string): string {
  const partes = cor.match(/\d+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
  return cor.startsWith('#') ? cor : `#${partes.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}

function TabelaDeCor({ tema }: { tema: Tema }) {
  const ref = useRef<HTMLDivElement>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!ref.current) return;
    const estilo = getComputedStyle(ref.current);
    const nomes = new Set(PARES.flatMap(([, texto, fundo]) => [texto, fundo]));
    setValores(Object.fromEntries([...nomes].map((nome) => [nome, hex(estilo.getPropertyValue(nome).trim())])));
  }, [tema]);

  return (
    <div ref={ref} data-tema={tema} className="border border-fio bg-mesa p-3">
      <p className="mf-rotulo mb-2">{tema === 'claro' ? 'Tema claro · a 1ª via' : 'Tema escuro · o carbono'}</p>
      <ul className="grid gap-px">
        {PARES.map(([rotulo, texto, fundo, uso, minimo]) => {
          const razao = valores[texto] && valores[fundo] ? razaoContraste(valores[texto], valores[fundo]) : 0;
          return (
            <li
              key={rotulo}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
              style={{ backgroundColor: `var(${fundo})`, color: `var(${texto})`, outline: '1px solid var(--mf-fio)' }}
            >
              <span className="min-w-0">
                <span className="block font-semibold">{uso}</span>
                <span className="mf-dado block text-rotulo">
                  {rotulo} · {valores[texto]} / {valores[fundo]}
                </span>
              </span>
              <span className="mf-dado text-pequeno font-semibold">
                {razao.toFixed(1)}:1 {razao >= minimo ? (minimo === 7 ? 'AAA' : minimo === 3 ? 'UI' : 'AA') : 'FALHA'}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ───────── Demonstrações com estado ───────── */

function DemoCampos() {
  const [fc, setFc] = useState<number | null>(88);
  const [temp, setTemp] = useState<number | null>(36.8);
  const [via, setVia] = useState<'VO' | 'EV' | 'IM' | 'SL'>('EV');
  const [cor, setCor] = useState<CorTriagem | null>('AMARELO');
  const [aceite, setAceite] = useState(true);
  const [chave, setChave] = useState(false);
  return (
    <>
      <Peca nome="Campo de texto" nota="Caixa com fio de 1 px e rótulo no canto, como campo de ficha. Estados: padrão, com ajuda, erro, desabilitado.">
        <div className="grid gap-3 md:grid-cols-2">
          <CampoTexto rotulo="Nome do paciente" placeholder="Como consta no documento" />
          <CampoTexto rotulo="Local da ocorrência" defaultValue="Rua das Tipuanas, 1840" ajuda="Rua, número e referência." />
          <CampoTexto rotulo="CPF" defaultValue="123.456.789-00" erro="CPF com dígito verificador inválido. Confira ou deixe em branco." />
          <CampoTexto rotulo="Registro profissional" defaultValue="COREN 200002/RS" disabled />
        </div>
      </Peca>
      <Peca nome="Campo numérico grande" nota="Entrada rápida de sinal vital. Aceita vírgula, setas ↑/↓ e passos de 48 px. A faixa é limite de digitação, não avaliação clínica.">
        <div data-contexto="campo" className="grid max-w-[40rem] grid-cols-1 gap-3">
          <div className="mf-grade-campos">
            <CampoNumerico rotulo="Freq. cardíaca" unidade="bpm" min={0} max={300} valor={fc} aoMudar={setFc} />
            <CampoNumerico rotulo="Saturação" unidade="%" min={0} max={100} valor={null} aoMudar={() => undefined} />
          </div>
          <CampoNumerico rotulo="Temperatura" unidade="°C" min={20} max={45} casas={1} passo={0.1} comPassos valor={temp} aoMudar={setTemp} />
          <CampoNumerico rotulo="Glicemia" unidade="mg/dL" min={0} max={1000} valor={null} aoMudar={() => undefined} desabilitado />
        </div>
      </Peca>
      <Peca nome="Select" nota="Controle nativo: no celular abre o seletor do sistema, que funciona de luva.">
        <div className="grid gap-3 md:grid-cols-2">
          <Select rotulo="Medicamento" opcoes={MEDICAMENTOS} vazio="Escolha no catálogo" />
          <Select rotulo="Protocolo de triagem" opcoes={[{ valor: 'M', rotulo: 'Manchester' }, { valor: 'S', rotulo: 'START' }]} erro="Escolha o protocolo antes da classificação." />
        </div>
      </Peca>
      <Peca nome="Seletor segmentado" nota="Grupo de rádio. Selecionado = bloco invertido. Setas ←/→ trocam a opção.">
        <div className="grid max-w-[32rem] grid-cols-1 gap-4">
          <SeletorSegmentado
            rotulo="Via de administração"
            valor={via}
            aoMudar={setVia}
            opcoes={[
              { valor: 'VO', rotulo: 'VO', detalhe: 'oral' },
              { valor: 'EV', rotulo: 'EV', detalhe: 'venosa' },
              { valor: 'IM', rotulo: 'IM', detalhe: 'muscular' },
              { valor: 'SL', rotulo: 'SL', detalhe: 'sublingual', desabilitado: true },
            ]}
          />
        </div>
      </Peca>
      <Peca nome="Seletor de triagem" nota="Cada opção é o próprio bloco do protocolo. O profissional escolhe; o sistema não sugere.">
        <div data-contexto="campo" className="grid grid-cols-1 gap-4">
          <SeletorTriagem protocolo="MANCHESTER" valor={cor} aoMudar={setCor} rotulo="Manchester" />
          <SeletorTriagem protocolo="START" valor={null} aoMudar={() => undefined} rotulo="START" />
        </div>
      </Peca>
      <Peca nome="Checkbox e chave">
        <Fila>
          <Checkbox checked={aceite} onChange={(e) => setAceite(e.target.checked)}>Paciente não identificado</Checkbox>
          <Checkbox disabled>Desabilitado</Checkbox>
          <Checkbox disabled checked readOnly>Marcado e travado</Checkbox>
          <Chave marcado={chave} aoMudar={setChave}>Mostrar inativos</Chave>
          <Chave marcado aoMudar={() => undefined} desabilitado>Travada</Chave>
        </Fila>
      </Peca>
    </>
  );
}

function DemoDialogo() {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Botao onClick={() => setAberto(true)}>Abrir diálogo</Botao>
      <Dialogo
        aberto={aberto}
        aoFechar={() => setAberto(false)}
        titulo="Sair com 3 registros pendentes?"
        acoes={
          <>
            <Botao onClick={() => setAberto(false)}>Continuar no app</Botao>
            <Botao variante="perigo" onClick={() => setAberto(false)}>Sair mesmo assim</Botao>
          </>
        }
      >
        Os 3 registros ficam guardados neste aparelho e só sobem quando você entrar de novo com a mesma credencial.
      </Dialogo>
    </>
  );
}

const SECOES = [
  ['principios', 'Princípios'],
  ['cor', 'Cor'],
  ['tipografia', 'Tipografia'],
  ['forma', 'Forma'],
  ['componentes', 'Componentes'],
  ['composicoes', 'Composições'],
] as const;

/* ───────── Página ───────── */

export function Vitrine({ tema, aoMudarTema }: { tema: Tema; aoMudarTema: (tema: Tema) => void }) {
  return (
    <div className="min-h-dvh bg-mesa">
      <header className="sticky top-0 z-20 border-b-2 border-tinta bg-papel">
        <div className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 lg:px-8">
          <Marca />
          <nav aria-label="Seções da vitrine" className="flex flex-1 flex-wrap gap-x-4">
            {SECOES.map(([id, rotulo]) => (
              <a key={id} href={`#${id}`} className="py-1 font-semibold text-tinta no-underline hover:underline">
                {rotulo}
              </a>
            ))}
          </nav>
          <Botao
            icone={tema === 'claro' ? <Moon aria-hidden /> : <Sun aria-hidden />}
            onClick={() => aoMudarTema(tema === 'claro' ? 'escuro' : 'claro')}
          >
            {tema === 'claro' ? 'Tema escuro' : 'Tema claro'}
          </Botao>
        </div>
      </header>

      <main className="mx-auto max-w-[90rem] px-4 lg:px-8">
        <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:py-16">
          <div>
            <h1 className="text-titulo-1 font-[820] [font-stretch:72%] uppercase leading-none tracking-[0.01em] lg:text-numeral-g">
              A ficha em vias carbonadas
            </h1>
            <p className="mt-5 max-w-[60ch] text-campo text-tinta-2">
              O MedicalField é a caixa-preta do atendimento pré-hospitalar. O design system trata cada atendimento como
              uma ficha preenchida a tinta: nada se apaga, o erro é riscado, e todo registro diz em quantas vias já
              existe — só neste aparelho, a caminho, ou confirmado na central.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-fio pt-3">
              <SeloSync estado="local" rotulo="Só no aparelho" />
              <SeloSync estado="enviando" rotulo="A caminho" />
              <SeloSync estado="confirmado" rotulo="Confirmado na central" />
              <SeloSync estado="rejeitado" rotulo="Recusado: corrigir" />
            </div>
          </div>
          <div className="self-end">
            <LinhaDoTempo
              eventos={EVENTOS.filter((evento) => ['e2', 'e4', 'e5', 'e6'].includes(evento.id))}
              fusoHorario={FUSO}
              estados={{ e2: 'confirmado', e4: 'confirmado', e5: 'enviando', e6: 'local' }}
              aria-label="Exemplo de linha do tempo"
            />
          </div>
        </div>

        <Capitulo id="principios" titulo="Princípios" resumo="Seis regras que decidem os casos que este documento não previu.">
          <ol className="grid gap-x-10 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
            {[
              ['Tinta e papel', 'Todo o cromo usa dois valores. Cor fica reservada ao código clínico e aos estados que pedem ação.'],
              ['Bloco chapado é triagem', 'Só a triagem usa bloco de cor saturada, sempre com forma e palavra. Nada mais no sistema se parece com ela.'],
              ['Estado é marca em célula fixa', 'Vazada, meia, cheia, riscada. A marca de sincronização fica sempre no mesmo lugar e não depende de cor.'],
              ['Nada se apaga', 'O evento retificado continua na pauta, riscado com um traço, e a retificação cita o número que corrige.'],
              ['Invertido é “agora”', 'Bloco de tinta com texto de papel marca o item atual, a opção escolhida e a condição offline.'],
              ['Fato, não conselho', 'A interface mostra o que foi registrado e quando. Não há alerta, sugestão de dose nem cor de “valor alterado”.'],
            ].map(([titulo, texto]) => (
              <li key={titulo} className="border-t border-fio pt-3">
                <h3 className="text-campo font-bold">{titulo}</h3>
                <p className="mt-1 max-w-[46ch] text-tinta-2">{texto}</p>
              </li>
            ))}
          </ol>
        </Capitulo>

        <Capitulo
          id="cor"
          titulo="Cor"
          resumo="Papel frio e tinta berinjela-preta; violeta de tinta copiativa para a ação; a via rosa para a passagem de caso; carmim para erro e rejeição. Nenhuma dessas cores ocupa um matiz do protocolo de triagem. As razões abaixo são medidas no navegador."
        >
          <div className="grid gap-4 xl:grid-cols-2">
            <TabelaDeCor tema="claro" />
            <TabelaDeCor tema="escuro" />
          </div>
          <Peca nome="Triagem" nota="Código clínico convencional, igual nos dois temas. Cor + forma + palavra; a descrição do nível é opcional.">
            <div className="grid grid-cols-1 gap-4">
              {(['MANCHESTER', 'START'] as const).map((protocolo) => (
                <div key={protocolo}>
                  <p className="mf-rotulo mb-2">{protocolo === 'START' ? 'START' : 'Manchester'}</p>
                  <Fila>
                    {CLASSIFICACOES_TRIAGEM[protocolo].map((cor) => (
                      <EtiquetaTriagem key={cor} protocolo={protocolo} classificacao={cor} tamanho="g" comDescricao />
                    ))}
                  </Fila>
                </div>
              ))}
              <Fila>
                {CLASSIFICACOES_TRIAGEM.MANCHESTER.map((cor) => (
                  <EtiquetaTriagem key={cor} protocolo="MANCHESTER" classificacao={cor} />
                ))}
                <EtiquetaTriagem protocolo="START" classificacao="PRETO" />
              </Fila>
            </div>
          </Peca>
          <Peca nome="Sincronização" nota="Quatro estados, quatro marcas. O confirmado é o mais quieto: é o estado normal.">
            <Fila>
              <SeloSync estado="local" />
              <SeloSync estado="enviando" />
              <SeloSync estado="confirmado" />
              <SeloSync estado="rejeitado" />
            </Fila>
            <p className="mf-rotulo mt-4 mb-2">As mesmas marcas com outro rótulo: envio de e-mail</p>
            <Fila>
              <SeloSync estado="local" rotulo="Na fila" />
              <SeloSync estado="enviando" rotulo="Enviando" />
              <SeloSync estado="confirmado" rotulo="Enviado" />
              <SeloSync estado="rejeitado" rotulo="Falha definitiva" />
            </Fila>
          </Peca>
        </Capitulo>

        <Capitulo
          id="tipografia"
          titulo="Tipografia"
          resumo="Archivo Variable faz todo o texto: o eixo de largura dá os rótulos condensados de formulário e os numerais estreitos de leitura à distância. Martian Mono, condensada, fica só em horário, número de entrada e código. As duas vêm embutidas no pacote (SIL OFL) — o app funciona sem rede."
        >
          <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="mf-rotulo">Numeral · 56 px · peso 720 · largura 76%</p>
                <p className="mf-numeral text-numeral-g">168/102 <span className="text-titulo-3 font-medium text-tinta-2">mmHg</span></p>
              </div>
              <div>
                <p className="mf-rotulo">Título 1 · 32 px</p>
                <p className="text-titulo-1 font-[780] [font-stretch:86%]">Passagem de caso</p>
              </div>
              <div>
                <p className="mf-rotulo">Título 3 · 20 px</p>
                <p className="text-titulo-3 font-bold">Marlene Antunes Figueiró</p>
              </div>
              <div>
                <p className="mf-rotulo">Rótulo · 11 px (12 no campo) · caixa-alta · largura 78%</p>
                <p className="mf-rotulo">Freq. respiratória · Local da ocorrência · Via de administração</p>
              </div>
            </div>
            <div className="grid grid-cols-1 content-start gap-4">
              <div>
                <p className="mf-rotulo">Corpo do app · 17/24</p>
                <p className="max-w-[60ch] text-campo">Paciente refere melhora parcial da dor. Filha acompanha na viatura e informa uso contínuo de losartana.</p>
              </div>
              <div>
                <p className="mf-rotulo">Corpo do portal · 14/20</p>
                <p className="max-w-[68ch] text-corpo">A ficha contém dados de saúde. Confira o endereço antes de enviar; o envio fica registrado com o seu nome.</p>
              </div>
              <div>
                <p className="mf-rotulo">Dado · Martian Mono · tabular</p>
                <p className="mf-dado text-corpo">21:04 · nº 02 · MF-4K7Q-92XD · 7f3c9a12 · 200.19.4.71</p>
                <p className="mf-dado text-corpo">21:11 · nº 05 · MF-0011-11AB · 00000000 · 111.11.1.11</p>
              </div>
            </div>
          </div>
        </Capitulo>

        <Capitulo
          id="forma"
          titulo="Forma"
          resumo="Fio de 1 px, canto de 2 px, nenhuma sombra fora de sobreposições. Espaço em múltiplos de 4 px. Movimento seco de 120 ms; a entrada nova “bate” na linha e a marca “enviando” alterna em dois passos."
        >
          <div className="grid gap-x-10 gap-y-6 md:grid-cols-3">
            <div>
              <p className="mf-rotulo mb-2">Espaço</p>
              <div className="flex items-end gap-2">
                {[4, 8, 12, 16, 24, 32, 48].map((px) => (
                  <div key={px} className="text-center">
                    <div className="bg-inverso" style={{ width: px, height: px }} />
                    <span className="mf-dado text-rotulo">{px}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mf-rotulo mb-2">Fio e canto</p>
              <div className="flex flex-wrap gap-3">
                <div className="border border-fio bg-papel px-3 py-2">pauta 1 px</div>
                <div className="rounded-1 border border-fio-forte bg-papel px-3 py-2">controle · 2 px</div>
                <div className="border-t-2 border-tinta bg-papel px-3 py-2">cabeçalho 2 px</div>
              </div>
            </div>
            <div>
              <p className="mf-rotulo mb-2">Alvo de toque</p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="grid h-9 place-items-center border border-fio-forte bg-papel px-3">portal 36</div>
                <div className="grid h-14 place-items-center border border-fio-forte bg-papel px-3">campo 56</div>
              </div>
            </div>
          </div>
        </Capitulo>

        <Capitulo id="componentes" titulo="Componentes" resumo="Todos funcionam por teclado, têm foco visível e respondem a prefers-reduced-motion. Alterne o tema no topo para ver o carbono.">
          <Peca nome="Botão" nota="Uma ação primária por tela. Estados: padrão, hover, foco, ativo, desabilitado, carregando.">
            <div className="grid grid-cols-1 gap-3">
              <Fila>
                <Botao variante="primario" icone={<Plus aria-hidden />}>Registrar</Botao>
                <Botao icone={<FileDown aria-hidden />}>Baixar PDF</Botao>
                <Botao variante="fantasma">Cancelar</Botao>
                <Botao variante="perigo" icone={<Trash2 aria-hidden />}>Inativar item</Botao>
                <Botao somenteIcone aria-label="Buscar" icone={<Search aria-hidden />} />
              </Fila>
              <Fila>
                <Botao variante="primario" disabled>Registrar</Botao>
                <Botao disabled>Baixar PDF</Botao>
                <Botao variante="primario" carregando>Gerando ficha</Botao>
                <Botao carregando>Sincronizando</Botao>
              </Fila>
              <div data-contexto="campo" className="max-w-[24rem]">
                <Botao variante="primario" largo>Registrar sinais vitais</Botao>
              </div>
            </div>
          </Peca>

          <DemoCampos />

          <Peca nome="Etiqueta" nota="Contorno e caixa-alta. Nunca bloco em matiz de triagem.">
            <Fila>
              <Etiqueta>Encerrado</Etiqueta>
              <Etiqueta tom="cheia">Aberto</Etiqueta>
              <Etiqueta tom="marca">Pendente</Etiqueta>
              <Etiqueta>Possível duplicata</Etiqueta>
              <Etiqueta tom="carmim">Rejeitado</Etiqueta>
              <Etiqueta>Fora do catálogo</Etiqueta>
            </Fila>
          </Peca>

          <Peca nome="Tira de conectividade" nota="Permanente no app. Offline é bloco invertido com ícone e palavra; a chave simula a queda da rede." larga>
            <div data-contexto="campo" className="grid max-w-[390px] grid-cols-1 gap-3">
              <BarraConectividade online simulandoOffline={false} aoMudarSimulacao={() => undefined} pendencias={0} ultimaSync="21:19" />
              <BarraConectividade online simulandoOffline={false} aoMudarSimulacao={() => undefined} pendencias={3} sincronizando />
              <BarraConectividade online={false} simulandoOffline aoMudarSimulacao={() => undefined} pendencias={4} rejeitadas={1} />
            </div>
          </Peca>

          <Peca nome="Linha do tempo e evento" nota="Pauta numerada, um layout por tipo de evento. A entrada nº 02 foi retificada pela nº 06: segue visível, riscada." larga>
            <div className="grid gap-6 xl:grid-cols-2">
              <Secao titulo="No portal" rente>
                <LinhaDoTempo eventos={EVENTOS} fusoHorario={FUSO} />
              </Secao>
              <div data-contexto="campo" className="border border-fio bg-papel px-3 pt-3">
                <p className="mf-rotulo mb-2">No app · mais recente primeiro · com marca de via</p>
                <LinhaDoTempo
                  eventos={EVENTOS.slice(0, 8)}
                  fusoHorario={FUSO}
                  invertida
                  estados={{ e1: 'confirmado', e2: 'confirmado', e3: 'confirmado', e4: 'confirmado', e5: 'confirmado', e6: 'rejeitado', e7: 'enviando', e8: 'local' }}
                />
              </div>
            </div>
          </Peca>

          <Peca nome="Passagem de caso" nota="A via rosa: resumo factual derivado da linha do tempo. É a única superfície rosa do sistema." larga>
            <div className="grid gap-6 xl:grid-cols-2">
              <PainelPassagemDeCaso resumo={RESUMO} paciente={PACIENTE} queixaPrincipal={QUEIXA} fusoHorario={FUSO} />
              <PainelPassagemDeCaso
                resumo={{ ...RESUMO, triagem: null, glasgowMaisRecente: null, ultimosSinaisVitais: null, medicacoes: [], procedimentos: [], alergias: [], comorbidades: [], medicacoesContinuas: [], encerramento: null }}
                paciente={{ nome: 'Não identificado', identificacao: 'masc., cerca de 30 anos' }}
              />
            </div>
          </Peca>

          <Peca nome="Seção" nota="Folha com cabeçalho de fio grosso. Não se aninha.">
            <Secao titulo="Medicamentos" descricao="Cadastro de apoio · 42 itens" acoes={<Botao>Exportar</Botao>}>
              Conteúdo da seção.
            </Secao>
          </Peca>

          <Peca nome="Tabela e paginação" nota="Densa, cabeçalho fixo, linha selecionada invertida. A API pagina por cursor: só anterior e próxima." larga>
            <div className="grid gap-6 xl:grid-cols-2">
              <Secao titulo="Carregando" rente>
                <Tabela
                  legenda="Exemplo carregando"
                  carregando
                  colunas={[{ id: 'a', titulo: 'Início', celula: () => null }, { id: 'b', titulo: 'Paciente', celula: () => null }, { id: 'c', titulo: 'Situação', celula: () => null }]}
                  linhas={[]}
                  chave={() => ''}
                />
                <Paginacao resumo="Carregando…" carregando aoProxima={() => undefined} />
              </Secao>
              <Secao titulo="Sem resultado" rente>
                <Tabela
                  legenda="Exemplo vazio"
                  colunas={[{ id: 'a', titulo: 'Início', celula: () => null }, { id: 'b', titulo: 'Paciente', celula: () => null }, { id: 'c', titulo: 'Situação', celula: () => null }]}
                  linhas={[] as typeof ATENDIMENTOS}
                  chave={(a) => a.id}
                  vazio={<EstadoVazio className="border-0" titulo="Nenhum atendimento para “Zuleica”" descricao="A busca olha nome e CPF. Tente só o primeiro nome ou limpe a busca para ver todos." acao={<Botao>Limpar busca</Botao>} />}
                />
                <Paginacao resumo="0 atendimentos" />
              </Secao>
            </div>
          </Peca>

          <Peca nome="Diálogo" nota="Nativo: foco preso, Esc fecha. Só para o que pede interrupção.">
            <DemoDialogo />
          </Peca>

          <Peca nome="Toast" nota="Bloco invertido. O tom vem do ícone e do texto. Erro não some sozinho.">
            <div className="grid grid-cols-1 gap-2">
              <Toast titulo="3 registros enviados" descricao="Tudo confirmado na central às 21:19." aoFechar={() => undefined} />
              <Toast tom="sucesso" titulo="Ficha gerada" descricao="ficha-MF-4K7Q-92XD.pdf · 184 kB" aoFechar={() => undefined} />
              <Toast tom="erro" titulo="Não foi possível gravar neste aparelho" descricao="Armazenamento cheio. Libere espaço e registre de novo — nada foi salvo." acao={{ rotulo: 'Tentar de novo', aoClicar: () => undefined }} aoFechar={() => undefined} />
            </div>
          </Peca>

          <Peca nome="Estado vazio e estado de erro" nota="O vazio ensina o que aparece ali. O erro diz o que falhou, o que fazer e o protocolo para o suporte.">
            <div className="grid gap-3 md:grid-cols-2">
              <EstadoVazio titulo="Nenhuma pendência" descricao="Tudo o que você registrou já foi confirmado pela central. Registros feitos sem rede aparecem aqui até subirem." />
              <EstadoErro titulo="Não foi possível carregar os atendimentos" descricao="O serviço clínico não respondeu. Seus dados não foram afetados." aoTentarDeNovo={() => undefined} requestId="9b2f61c0-77aa-4e1d" />
            </div>
          </Peca>

          <Peca nome="Esqueleto" nota="Marca o lugar do conteúdo. Pisca em dois passos, sem brilho deslizante.">
            <div className="grid max-w-[28rem] grid-cols-1 gap-3">
              <Esqueleto largura="40%" altura="1.25rem" />
              <Esqueleto linhas={3} />
            </div>
          </Peca>
        </Capitulo>

        <Capitulo
          id="composicoes"
          titulo="Composições"
          resumo="Duas telas montadas só com o que está acima, com dados fictícios. Ambas funcionam: selecione linhas, abra o diálogo de e-mail, registre sinais vitais e derrube a rede com a chave."
        >
          <h3 className="mb-3 text-campo font-bold">Portal — livro de atendimentos e ficha aberta</h3>
          <div className="border border-fio-forte [&_.mf-portal]:min-h-0 [&_.mf-portal__indice]:static [&_.mf-portal__indice]:h-auto">
            <ComposicaoPortal />
          </div>

          <h3 className="mt-12 mb-3 text-campo font-bold">App de campo — atendimento em curso, de dia e à noite</h3>
          <div className="flex flex-wrap items-start gap-8">
            <div data-tema="claro" className="w-full max-w-[390px] border border-fio-forte [&_.mf-app]:min-h-0">
              <ComposicaoApp />
            </div>
            <div data-tema="escuro" className="w-full max-w-[390px] border border-fio-forte [&_.mf-app]:min-h-0">
              <ComposicaoApp offlineInicial />
            </div>
          </div>
        </Capitulo>
      </main>
    </div>
  );
}
