// @vitest-environment jsdom
// D-QA-16: o que o profissional digita enquanto o registro anterior ainda grava nao pode ser apagado.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProvedorTema } from '../ui/ds/index.ts';
import { PainelSinais, PainelTexto, type Registrar } from './PaineisRegistro.tsx';

const montar = (ui: Parameters<typeof render>[0]) => render(ui, { wrapper: ProvedorTema });

afterEach(cleanup);

/** `registrar` falso: cada chamada fica pendente ate o teste resolver, como uma gravacao lenta. */
function gravacaoLenta() {
  const chamadas: Array<{ tipo: string; dados: Record<string, unknown>; concluir: (ok: boolean) => void }> = [];
  const registrar: Registrar = (tipo, dados) => new Promise<boolean>((concluir) => chamadas.push({ tipo, dados, concluir }));
  return { chamadas, registrar };
}

const campo = () => screen.getByRole('textbox', { name: 'Observação' }) as HTMLTextAreaElement;
const botao = () => screen.getByRole('button', { name: 'Registrar observação' });
const digitar = (texto: string) => fireEvent.change(campo(), { target: { value: texto } });

describe('PainelTexto (observacao e procedimento)', () => {
  it('esvazia o campo na hora do envio e nao mexe no que foi digitado depois', async () => {
    const { chamadas, registrar } = gravacaoLenta();
    montar(<PainelTexto registrar={registrar} gravando={false} erros={{}} tipo="OBSERVACAO" />);

    digitar('primeira');
    fireEvent.click(botao());
    expect(campo().value).toBe(''); // sem esperar a gravacao
    digitar('segunda, digitada enquanto a primeira grava');
    chamadas[0]!.concluir(true);
    await waitFor(() => expect(chamadas[0]).toBeDefined());
    await Promise.resolve();
    expect(campo().value).toBe('segunda, digitada enquanto a primeira grava'); // antes do conserto: ''
  });

  it('12 observacoes em sequencia rapida, com a gravacao sempre atrasada: as 12 sao enviadas, em ordem', async () => {
    const { chamadas, registrar } = gravacaoLenta();
    montar(<PainelTexto registrar={registrar} gravando={true} erros={{}} tipo="OBSERVACAO" />); // "gravando" o tempo todo

    for (let n = 1; n <= 12; n++) {
      digitar(`observação ${n}`);
      fireEvent.click(botao()); // o botao nao trava durante a gravacao
      if (n % 3 === 0) chamadas[n - 3]!.concluir(true); // respostas chegam atrasadas, no meio da digitacao
    }
    for (const chamada of chamadas) chamada.concluir(true);
    await Promise.resolve();

    expect(chamadas.map((c) => c.dados.texto)).toEqual(Array.from({ length: 12 }, (_, i) => `observação ${i + 1}`));
    expect(campo().value).toBe('');
  });

  it('se a gravacao falha, o texto volta ao campo, na frente do que foi digitado depois', async () => {
    const { chamadas, registrar } = gravacaoLenta();
    montar(<PainelTexto registrar={registrar} gravando={false} erros={{}} tipo="PROCEDIMENTO" />);
    const procedimento = () => screen.getByRole('textbox', { name: 'Procedimento realizado' }) as HTMLTextAreaElement;

    fireEvent.change(procedimento(), { target: { value: 'acesso venoso' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar procedimento' }));
    fireEvent.change(procedimento(), { target: { value: 'imobilização' } });
    chamadas[0]!.concluir(false);
    await waitFor(() => expect(procedimento().value).toBe('acesso venoso\nimobilização'));

    // Sem nada digitado depois, volta so o que falhou.
    fireEvent.change(procedimento(), { target: { value: 'curativo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar procedimento' }));
    chamadas[1]!.concluir(false);
    await waitFor(() => expect(procedimento().value).toBe('curativo'));
  });
});

describe('PainelSinais', () => {
  it('so limpa a grade se ela ainda for a que foi enviada', async () => {
    const { chamadas, registrar } = gravacaoLenta();
    montar(<PainelSinais registrar={registrar} gravando={false} erros={{}} />);
    const sistolica = () => screen.getByLabelText(/PA sistólica/) as HTMLInputElement;

    fireEvent.change(sistolica(), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar sinais vitais' }));
    await waitFor(() => expect(chamadas).toHaveLength(1));
    fireEvent.change(sistolica(), { target: { value: '135' } }); // nova medida, antes de a anterior terminar
    chamadas[0]!.concluir(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(sistolica().value).toBe('135');
    expect(chamadas[0]!.dados).toEqual({ pressaoSistolica: 120 });

    // Sem mexer, a grade limpa ao gravar.
    fireEvent.click(screen.getByRole('button', { name: 'Registrar sinais vitais' }));
    await waitFor(() => expect(chamadas).toHaveLength(2));
    chamadas[1]!.concluir(true);
    await waitFor(() => expect(sistolica().value).toBe(''));
  });
});
