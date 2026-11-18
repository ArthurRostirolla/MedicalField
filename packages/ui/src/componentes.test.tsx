import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  BarraConectividade,
  Botao,
  CampoNumerico,
  CampoTexto,
  Chave,
  Dialogo,
  EtiquetaTriagem,
  LinhaDoTempo,
  PainelPassagemDeCaso,
  SeletorSegmentado,
  SeletorTriagem,
  SeloSync,
  Tabela,
  type EventoLinha,
} from './index';

describe('BarraConectividade', () => {
  function Bancada({ aoMudar }: { aoMudar: (v: boolean) => void }) {
    const [offline, setOffline] = useState(false);
    return (
      <BarraConectividade
        online={!offline}
        simulandoOffline={offline}
        aoMudarSimulacao={(valor) => {
          setOffline(valor);
          aoMudar(valor);
        }}
        pendencias={offline ? 2 : 0}
      />
    );
  }

  it('alterna a simulação e descreve o estado em palavras', async () => {
    const aoMudar = vi.fn();
    render(<Bancada aoMudar={aoMudar} />);
    const chave = screen.getByRole('switch', { name: /simular conectividade/i });
    expect(chave).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Online')).toBeInTheDocument();
    expect(screen.getByText('Tudo enviado')).toBeInTheDocument();

    await userEvent.click(chave);
    expect(aoMudar).toHaveBeenCalledWith(true);
    expect(chave).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Offline')).toBeInTheDocument();
    expect(screen.getByText(/simulado/)).toBeInTheDocument();
    expect(screen.getByText('2 pendentes')).toBeInTheDocument();
  });

  it('alterna pelo teclado', async () => {
    const aoMudar = vi.fn();
    render(<Bancada aoMudar={aoMudar} />);
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(aoMudar).toHaveBeenCalledWith(true);
  });

  it('mostra rejeitadas e vira botão quando há destino', async () => {
    const abrir = vi.fn();
    render(
      <BarraConectividade
        online={false}
        simulandoOffline={false}
        aoMudarSimulacao={() => undefined}
        pendencias={1}
        rejeitadas={1}
        aoAbrirPendencias={abrir}
      />,
    );
    expect(screen.getByText(/sem rede/)).toBeInTheDocument();
    expect(screen.getByText(/1 rejeitada/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /1 pendente\. abrir pendências/i }));
    expect(abrir).toHaveBeenCalledOnce();
  });
});

describe('CampoNumerico', () => {
  function Bancada(props: { aoMudar: (v: number | null) => void; casas?: number; comPassos?: boolean }) {
    const [valor, setValor] = useState<number | null>(null);
    return (
      <CampoNumerico
        rotulo="Temperatura"
        unidade="°C"
        min={20}
        max={45}
        passo={props.casas ? 0.1 : 1}
        casas={props.casas}
        comPassos={props.comPassos}
        valor={valor}
        aoMudar={(novo) => {
          setValor(novo);
          props.aoMudar(novo);
        }}
      />
    );
  }

  it('aceita vírgula decimal e devolve número', async () => {
    const aoMudar = vi.fn();
    render(<Bancada aoMudar={aoMudar} casas={1} />);
    await userEvent.type(screen.getByRole('textbox', { name: /temperatura/i }), '36,8');
    expect(aoMudar).toHaveBeenLastCalledWith(36.8);
    expect(screen.getByRole('textbox', { name: /temperatura/i })).toHaveValue('36,8');
  });

  it('fora da faixa: devolve null, marca inválido e explica a faixa', async () => {
    const aoMudar = vi.fn();
    render(<Bancada aoMudar={aoMudar} />);
    const campo = screen.getByRole('textbox', { name: /temperatura/i });
    await userEvent.type(campo, '99');
    expect(aoMudar).toHaveBeenLastCalledWith(null);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveValue('99');
    expect(campo).toHaveAccessibleDescription('Digite um valor entre 20 e 45.');
  });

  it('ignora letras', async () => {
    render(<Bancada aoMudar={() => undefined} />);
    const campo = screen.getByRole('textbox', { name: /temperatura/i });
    await userEvent.type(campo, '3a7');
    expect(campo).toHaveValue('37');
  });

  it('setas e botões de passo andam dentro da faixa', async () => {
    const aoMudar = vi.fn();
    render(<Bancada aoMudar={aoMudar} comPassos />);
    const campo = screen.getByRole('textbox', { name: /temperatura/i });
    await userEvent.type(campo, '44');
    await userEvent.keyboard('{ArrowUp}');
    expect(aoMudar).toHaveBeenLastCalledWith(45);
    await userEvent.keyboard('{ArrowUp}');
    expect(campo).toHaveValue('45');
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir Temperatura' }));
    expect(aoMudar).toHaveBeenLastCalledWith(44);
  });

  it('limpar por fora esvazia o campo', async () => {
    function Limpavel() {
      const [valor, setValor] = useState<number | null>(120);
      return (
        <>
          <CampoNumerico rotulo="PA sistólica" valor={valor} aoMudar={setValor} min={0} max={300} />
          <button onClick={() => setValor(null)}>limpar</button>
        </>
      );
    }
    render(<Limpavel />);
    expect(screen.getByLabelText(/pa sistólica/i)).toHaveValue('120');
    await userEvent.click(screen.getByText('limpar'));
    expect(screen.getByLabelText(/pa sistólica/i)).toHaveValue('');
  });
});

describe('Dialogo', () => {
  function Bancada() {
    const [aberto, setAberto] = useState(false);
    return (
      <>
        <Botao onClick={() => setAberto(true)}>Abrir</Botao>
        <Dialogo aberto={aberto} aoFechar={() => setAberto(false)} titulo="Enviar a ficha">
          Corpo do diálogo
        </Dialogo>
      </>
    );
  }

  it('abre com nome acessível e fecha pelo botão', async () => {
    render(<Bancada />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    const dialogo = screen.getByRole('dialog', { name: 'Enviar a ficha' });
    expect(dialogo).toHaveAttribute('open');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('o evento close nativo (Esc) avisa o dono', async () => {
    render(<Bancada />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir' }));
    screen.getByRole('dialog').dispatchEvent(new Event('close'));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('seletores', () => {
  it('SeletorSegmentado é um grupo de rádio navegável', async () => {
    const aoMudar = vi.fn();
    render(
      <SeletorSegmentado
        rotulo="Via"
        valor="VO"
        aoMudar={aoMudar}
        opcoes={[
          { valor: 'VO', rotulo: 'VO' },
          { valor: 'EV', rotulo: 'EV' },
          { valor: 'SL', rotulo: 'SL', desabilitado: true },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Via' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'VO' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'EV' }));
    expect(aoMudar).toHaveBeenCalledWith('EV');
    expect(screen.getByRole('radio', { name: 'SL' })).toBeDisabled();
  });

  it('SeletorTriagem só oferece as classificações do protocolo', async () => {
    const aoMudar = vi.fn();
    render(<SeletorTriagem protocolo="START" valor={null} aoMudar={aoMudar} />);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.queryByRole('radio', { name: /laranja/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /preto/i }));
    expect(aoMudar).toHaveBeenCalledWith('PRETO');
  });

  it('Chave expõe role=switch', async () => {
    const aoMudar = vi.fn();
    render(
      <Chave marcado={false} aoMudar={aoMudar}>
        Mostrar inativos
      </Chave>,
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar inativos' }));
    expect(aoMudar).toHaveBeenCalledWith(true);
  });
});

describe('significado sem cor', () => {
  it('EtiquetaTriagem traz palavra, protocolo e forma', () => {
    const { container } = render(<EtiquetaTriagem protocolo="MANCHESTER" classificacao="LARANJA" comDescricao />);
    expect(container.textContent).toBe('Triagem Manchester: LaranjaMuito urgente');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('SeloSync mantém o rótulo para leitor de tela quando mostra só a marca', () => {
    render(<SeloSync estado="rejeitado" somenteMarca />);
    expect(screen.getByText('Rejeitado')).toBeInTheDocument();
    expect(screen.getByTitle('Rejeitado')).toHaveAttribute('data-estado', 'rejeitado');
  });

  it('CampoTexto liga erro ao campo', () => {
    render(<CampoTexto rotulo="CPF" erro="CPF inválido." defaultValue="1" />);
    const campo = screen.getByLabelText('CPF');
    expect(campo).toBeInvalid();
    expect(campo).toHaveAccessibleDescription('CPF inválido.');
  });

  it('Botao carregando não dispara clique', async () => {
    const aoClicar = vi.fn();
    render(
      <Botao carregando onClick={aoClicar}>
        Gerar PDF
      </Botao>,
    );
    const botao = screen.getByRole('button', { name: 'Gerar PDF' });
    expect(botao).toHaveAttribute('aria-busy', 'true');
    botao.click();
    expect(aoClicar).not.toHaveBeenCalled();
  });
});

describe('LinhaDoTempo', () => {
  const eventos: EventoLinha[] = [
    { id: 'a', tipo: 'SINAIS_VITAIS', ocorridoEm: '2026-11-18T00:04:00.000Z', dados: { frequenciaCardiaca: 121, temperatura: 36.4 } },
    { id: 'b', tipo: 'MEDICACAO', ocorridoEm: '2026-11-18T00:08:00.000Z', dados: { medicamentoId: null, nome: 'AAS', dose: '200', unidade: 'mg', via: 'VO' } },
    { id: 'c', tipo: 'RETIFICACAO', ocorridoEm: '2026-11-18T00:13:00.000Z', retificaEventoId: 'a', dados: { motivo: 'FC errada', dadosCorrigidos: { frequenciaCardiaca: 112 } } },
  ];

  it('numera as entradas e liga a retificação ao evento retificado, que continua visível', () => {
    render(<LinhaDoTempo eventos={eventos} fusoHorario="America/Sao_Paulo" estados={{ b: 'local' }} />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(3);

    const [original, medicacao, retificacao] = itens as [HTMLElement, HTMLElement, HTMLElement];
    expect(original).toHaveAttribute('data-retificado', 'true');
    expect(within(original).getByText('Retificado pela nº 3')).toBeInTheDocument();
    expect(within(original).getByText('121')).toBeInTheDocument();
    expect(within(original).getByText('36,4')).toBeInTheDocument();
    expect(within(original).getByText('21:04')).toBeInTheDocument();

    expect(within(medicacao).getByText('Fora do catálogo')).toBeInTheDocument();
    expect(within(medicacao).getByText('Local')).toBeInTheDocument();

    expect(within(retificacao).getByText('Retifica nº 1')).toBeInTheDocument();
    expect(within(retificacao).getByText('112')).toBeInTheDocument();
  });

  it('invertida mostra a mais recente primeiro sem renumerar', () => {
    render(<LinhaDoTempo eventos={eventos} invertida />);
    const primeiro = screen.getAllByRole('listitem')[0] as HTMLElement;
    expect(primeiro).toHaveAttribute('data-tipo', 'RETIFICACAO');
    expect(primeiro.textContent).toContain('nº 03');
  });
});

describe('PainelPassagemDeCaso', () => {
  it('diz "não registrado" em vez de inventar, e nunca afirma ausência de alergia', () => {
    render(
      <PainelPassagemDeCaso
        resumo={{
          ultimosSinaisVitais: null,
          glasgowMaisRecente: null,
          triagem: null,
          medicacoes: [],
          procedimentos: [],
          alergias: [],
          comorbidades: [],
          medicacoesContinuas: [],
          encerramento: null,
        }}
      />,
    );
    const painel = screen.getByRole('region', { name: 'Passagem de caso' });
    expect(within(painel).getAllByText('Não registrado')).toHaveLength(3);
    expect(within(painel).queryByText(/sem alergias/i)).not.toBeInTheDocument();
  });
});

describe('Tabela', () => {
  const linhas = [
    { id: '1', nome: 'Marlene' },
    { id: '2', nome: 'Otávio' },
  ];
  const colunas = [{ id: 'nome', titulo: 'Paciente', celula: (l: (typeof linhas)[number]) => l.nome }];

  it('seleciona linha por clique e por Enter', async () => {
    const aoSelecionar = vi.fn();
    render(
      <Tabela legenda="Pacientes" colunas={colunas} linhas={linhas} chave={(l) => l.id} selecionada="1" aoSelecionar={aoSelecionar} />,
    );
    expect(screen.getByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
    const [, primeira, segunda] = screen.getAllByRole('row') as [HTMLElement, HTMLElement, HTMLElement];
    expect(primeira).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(segunda);
    expect(aoSelecionar).toHaveBeenLastCalledWith(linhas[1]);
    primeira.focus();
    await userEvent.keyboard('{Enter}');
    expect(aoSelecionar).toHaveBeenLastCalledWith(linhas[0]);
  });

  it('carregando marca aria-busy e não mostra o vazio', () => {
    const { container } = render(
      <Tabela legenda="Pacientes" colunas={colunas} linhas={[]} chave={(l) => l.id} carregando vazio={<p>Nada aqui</p>} />,
    );
    expect(container.firstChild).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Nada aqui')).not.toBeInTheDocument();
  });
});
