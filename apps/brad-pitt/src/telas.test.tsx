// Telas com respostas simuladas no formato do contrato.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atendimento, CAIO, documento, envio, erro, ficha, HELENA, json, medicamento, montar, simularApi, uuid } from './teste/apoio';

beforeEach(() => localStorage.clear());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Medicamentos', () => {
  const lista = [
    medicamento(1, 'Adrenalina', { principioAtivo: 'Epinefrina' }),
    medicamento(2, 'Ácido acetilsalicílico'),
    medicamento(3, 'Dipirona'),
  ];

  it('lista o cadastro inteiro (todas as páginas) e busca localmente, sem acento', async () => {
    const { para } = simularApi((c) =>
      c.consulta.get('cursor') ? json({ itens: lista.slice(2), proximoCursor: null }) : json({ itens: lista.slice(0, 2), proximoCursor: 'pag2' }),
    );
    montar('/medicamentos', HELENA);
    expect(await screen.findByText('Dipirona')).toBeInTheDocument();
    expect(screen.getByText(/medicamentos ativos/)).toHaveTextContent('3 medicamentos ativos');

    const busca = screen.getByLabelText('Buscar no cadastro');
    await userEvent.type(busca, 'acido');
    expect(screen.getByText('Ácido acetilsalicílico')).toBeInTheDocument();
    expect(screen.queryByText('Dipirona')).not.toBeInTheDocument();
    await userEvent.clear(busca);
    await userEvent.type(busca, 'epinefrina');
    expect(screen.getByText('Adrenalina')).toBeInTheDocument();
    // Busca local: nenhuma chamada nova além das duas páginas.
    expect(para('/medicamento')).toHaveLength(2);

    await userEvent.clear(busca);
    await userEvent.type(busca, 'xyz');
    expect(screen.getByText('Nada no cadastro com “xyz”')).toBeInTheDocument();
  });

  it('"Incluir inativos" pede de novo com o parâmetro', async () => {
    const { para } = simularApi((c) =>
      json({ itens: c.consulta.get('incluirInativos') ? [...lista, medicamento(4, 'Antigo', { ativo: false })] : lista, proximoCursor: null }),
    );
    montar('/medicamentos', HELENA);
    await screen.findByText('Dipirona');
    expect(para('/medicamento')[0]?.consulta.get('incluirInativos')).toBeNull();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Incluir inativos' }));
    expect(await screen.findByText('Antigo')).toBeInTheDocument();
    expect(screen.getByText('Inativo')).toBeInTheDocument();
  });

  it('erro mostra o que houve e "Tentar de novo" recarrega', async () => {
    let fora = true;
    simularApi(() => (fora ? erro(503, 'SERVICO_INDISPONIVEL') : json({ itens: lista, proximoCursor: null })));
    montar('/medicamentos', HELENA);
    expect(await screen.findByText('Serviço fora do ar')).toBeInTheDocument();
    expect(screen.getByText('Protocolo req-123')).toBeInTheDocument();
    fora = false;
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Dipirona')).toBeInTheDocument();
  });
});

describe('Atendimentos', () => {
  it('pagina por cursor para a frente e para trás, e "Atualizar" busca de novo', async () => {
    const { para } = simularApi((c) => {
      if (c.caminho !== '/atendimento') return undefined;
      return c.consulta.get('cursor') === 'c2'
        ? json({ itens: [atendimento(2)], proximoCursor: null })
        : json({ itens: [atendimento(1)], proximoCursor: 'c2' });
    });
    montar('/atendimentos', HELENA);
    expect(await screen.findByText('Pessoa Fictícia 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    expect(await screen.findByText('Pessoa Fictícia 2')).toBeInTheDocument();
    expect(screen.getByText(/Página/)).toHaveTextContent('Página 2 · 1 atendimentos');
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Pessoa Fictícia 1')).toBeInTheDocument();

    const antes = para('/atendimento').length;
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(para('/atendimento').length).toBe(antes + 1));
  });

  it('lista vazia explica de onde vêm os atendimentos', async () => {
    simularApi(() => json({ itens: [], proximoCursor: null }));
    montar('/atendimentos', HELENA);
    expect(await screen.findByText('Nenhum atendimento na central')).toBeInTheDocument();
  });

  it('abre pelo teclado e mostra passagem de caso e linha do tempo com o retificado marcado', async () => {
    const f = ficha();
    simularApi((c) => {
      if (c.caminho === '/atendimento') return json({ itens: [atendimento(1)], proximoCursor: null });
      if (c.caminho === `/ficha/${f.atendimento.id}`) return json(f);
      if (c.caminho === '/documento') return json({ itens: [] });
      return undefined;
    });
    montar('/atendimentos', HELENA);
    const linha = (await screen.findByText('Pessoa Fictícia 1')).closest('tr') as HTMLElement;
    linha.focus();
    await userEvent.keyboard('{Enter}');

    // O livro sai de cena: o atendimento ocupa a página, com o caminho de volta.
    const passagem = await screen.findByRole('region', { name: 'Passagem de caso' });
    expect(within(passagem).getByText('Marlene Fictícia')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Livro de atendimentos' })).not.toBeInTheDocument();
    const caminho = screen.getByRole('navigation', { name: 'Caminho' });
    expect(within(caminho).getByRole('link', { name: 'Atendimentos' })).toHaveAttribute('href', '/atendimentos');
    expect(screen.getByText('Dipirona')).toBeInTheDocument();
    const linhaDoTempo = screen.getByRole('region', { name: 'Linha do tempo' });
    expect(within(linhaDoTempo).getByText(/2 entradas/)).toBeInTheDocument();
    expect(within(linhaDoTempo).getByText(/Retificado pela nº\s*2/i)).toBeInTheDocument();
    expect(within(linhaDoTempo).getByText(/Retifica nº\s*1/i)).toBeInTheDocument();
    expect(await screen.findByText('Ficha ainda não gerada')).toBeInTheDocument();
  });

  it('registra sinais vitais pelo portal: vazio avisa, preenchido vira POST /atendimento-evento', async () => {
    const f = ficha();
    const { chamadas } = simularApi((c) => {
      if (c.caminho === `/ficha/${f.atendimento.id}`) return json(f);
      if (c.caminho === '/documento') return json({ itens: [] });
      if (c.caminho === '/atendimento-evento' && c.metodo === 'POST')
        return json({ ...(c.corpo as object), profissionalId: HELENA.id, profissionalNome: HELENA.nome, dispositivoId: null, recebidoEm: f.atendimento.recebidoEm }, 201);
      return undefined;
    });
    montar(`/atendimentos/${f.atendimento.id}`, HELENA);
    const registro = await screen.findByRole('region', { name: 'Registrar no atendimento' });
    await userEvent.click(within(registro).getByRole('button', { name: 'Registrar sinais vitais' }));
    expect(within(registro).getByRole('alert')).toHaveTextContent('Informe ao menos um sinal vital.');

    await userEvent.type(within(registro).getByLabelText(/Saturação/), '94');
    await userEvent.click(within(registro).getByRole('button', { name: 'Registrar sinais vitais' }));
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/atendimento-evento')).toBe(true));
    expect(chamadas.find((c) => c.caminho === '/atendimento-evento')?.corpo).toMatchObject({
      atendimentoId: f.atendimento.id,
      tipo: 'SINAIS_VITAIS',
      dados: { saturacao: 94 },
    });
  });
});

describe('Ficha em PDF e envios', () => {
  const f = ficha();
  const doc = documento();
  const caminhoFicha = `/atendimentos/${f.atendimento.id}`;

  function api(extra: Parameters<typeof simularApi>[0], estado: { documentos: unknown[]; envios: unknown[] }) {
    return simularApi(async (c) => {
      const especifica = await extra(c);
      if (especifica) return especifica;
      if (c.caminho === '/atendimento') return json({ itens: [], proximoCursor: null });
      if (c.caminho === `/ficha/${f.atendimento.id}`) return json(f);
      if (c.caminho === '/documento') return json({ itens: estado.documentos });
      if (c.caminho === `/documento/${doc.id}`) return json({ ...doc, integro: true });
      if (c.caminho === `/documento/${doc.id}/email` && c.metodo === 'GET') return json({ itens: estado.envios, proximoCursor: null });
      return undefined;
    });
  }

  it('gera o PDF, já baixa e passa a mostrar código, integridade e as ações', async () => {
    const estado = { documentos: [] as unknown[], envios: [] };
    const criarUrl = vi.fn(() => 'blob:ficha');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: criarUrl, revokeObjectURL: vi.fn() }));
    const { para } = api((c) => {
      if (c.caminho === '/documento/ficha-atendimento') {
        estado.documentos = [doc];
        return json(doc, 201);
      }
      if (c.caminho === `/documento/${doc.id}/pdf`) return new Response('%PDF', { headers: { 'Content-Type': 'application/pdf' } });
      return undefined;
    }, estado);
    montar(caminhoFicha, HELENA);
    await screen.findByText('Ficha ainda não gerada');
    await userEvent.click(screen.getByRole('button', { name: 'Gerar PDF' }));

    const bloco = screen.getByRole('region', { name: 'Ficha em PDF e envios' });
    expect(await within(bloco).findByText('Íntegra')).toBeInTheDocument();
    expect(within(bloco).getByText('MF-TESTE-0001')).toBeInTheDocument();
    expect(within(bloco).getByText(/por Dra\. Helena Prado/)).toBeInTheDocument();
    expect(within(bloco).getByRole('button', { name: 'Baixar PDF' })).toBeInTheDocument();
    expect(within(bloco).getByText('Nenhum envio desta ficha')).toBeInTheDocument();
    expect(para('/documento/ficha-atendimento', 'POST')[0]?.corpo).toEqual({ atendimentoId: f.atendimento.id });
    expect(await screen.findByText('Ficha gerada')).toBeInTheDocument();
    await waitFor(() => expect(criarUrl).toHaveBeenCalledOnce());
  });

  it('PDF que não confere aparece como tal', async () => {
    api((c) => (c.caminho === `/documento/${doc.id}` ? json({ ...doc, integro: false }) : undefined), { documentos: [doc], envios: [] });
    montar(caminhoFicha, HELENA);
    expect(await screen.findByText('Não confere')).toBeInTheDocument();
  });

  it('diálogo de e-mail valida, envia com Idempotency-Key e a lista mostra o envio', async () => {
    const estado = { documentos: [doc], envios: [] as unknown[] };
    const { para } = api((c) => {
      if (c.caminho === `/documento/${doc.id}/email` && c.metodo === 'POST') {
        estado.envios = [envio(1, 'PENDENTE', { destinatarioNome: 'Paula Fictícia', tentativas: 0 })];
        return json(estado.envios[0], 202);
      }
      return undefined;
    }, estado);
    montar(caminhoFicha, HELENA);
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por e-mail' }));
    const dialogo = screen.getByRole('dialog', { name: 'Enviar a ficha por e-mail' });

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar ficha' }));
    expect(within(dialogo).getByText('Informe o nome de quem vai receber.')).toBeInTheDocument();
    expect(within(dialogo).getByText(/Digite um e-mail válido/)).toBeInTheDocument();
    expect(within(dialogo).getByText('Escolha o vínculo com o paciente.')).toBeInTheDocument();
    expect(para(`/documento/${doc.id}/email`, 'POST')).toHaveLength(0);

    await userEvent.type(within(dialogo).getByLabelText('Nome do destinatário'), 'Paula Fictícia');
    await userEvent.type(within(dialogo).getByLabelText('E-mail'), 'paula@exemplo.test');
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Familiar' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar ficha' }));

    expect(await screen.findByText('Envio na fila')).toBeInTheDocument();
    const [chamada] = para(`/documento/${doc.id}/email`, 'POST');
    expect(chamada?.corpo).toEqual({ destinatarioNome: 'Paula Fictícia', destinatarioEmail: 'paula@exemplo.test', vinculo: 'FAMILIAR' });
    expect(chamada?.cabecalhos.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(await screen.findByText('Na fila')).toBeInTheDocument();
    expect(screen.getByText(/Paula Fictícia · Familiar/)).toBeInTheDocument();
  });

  it('falha de rede no envio fica no diálogo e a nova tentativa usa a mesma chave', async () => {
    let fora = true;
    const estado = { documentos: [doc], envios: [] as unknown[] };
    const { para } = api((c) => {
      if (c.caminho === `/documento/${doc.id}/email` && c.metodo === 'POST') {
        return fora ? new Response('', { status: 502 }) : json(envio(1, 'PENDENTE'), 202);
      }
      return undefined;
    }, estado);
    montar(caminhoFicha, HELENA);
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar por e-mail' }));
    const dialogo = screen.getByRole('dialog');
    await userEvent.type(within(dialogo).getByLabelText('Nome do destinatário'), 'Paula');
    await userEvent.type(within(dialogo).getByLabelText('E-mail'), 'paula@exemplo.test');
    await userEvent.click(within(dialogo).getByRole('radio', { name: 'Paciente' }));
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar ficha' }));
    expect(await within(dialogo).findByText(/O envio não foi registrado/)).toBeInTheDocument();

    fora = false;
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Enviar ficha' }));
    await screen.findByText('Envio na fila');
    const chaves = para(`/documento/${doc.id}/email`, 'POST').map((c) => c.cabecalhos.get('Idempotency-Key'));
    expect(chaves).toHaveLength(2);
    expect(chaves[0]).toBe(chaves[1]);
  });

  it('com envio pendente, a situação se atualiza sozinha até "Enviado"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const estado = { documentos: [doc], envios: [envio(1, 'PENDENTE')] as unknown[] };
    const { para } = api(() => undefined, estado);
    montar(caminhoFicha, HELENA);
    expect(await screen.findByText('Na fila')).toBeInTheDocument();
    const antes = para(`/documento/${doc.id}/email`).length;

    estado.envios = [envio(1, 'ENVIADO')];
    await vi.advanceTimersByTimeAsync(3100);
    expect(await screen.findByText('Enviado')).toBeInTheDocument();
    expect(para(`/documento/${doc.id}/email`).length).toBeGreaterThan(antes);

    // Sem nada pendente, para de consultar.
    const depois = para(`/documento/${doc.id}/email`).length;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(para(`/documento/${doc.id}/email`).length).toBe(depois);
  });

  it('só a falha definitiva oferece "Reenviar"', async () => {
    const falho = envio(2, 'FALHA_DEFINITIVA');
    const estado = { documentos: [doc], envios: [envio(1, 'ENVIADO'), falho] as unknown[] };
    const { para } = api((c) => {
      if (c.caminho === `/documento/email/${falho.id}/reenvio`) {
        estado.envios = [envio(1, 'ENVIADO'), envio(2, 'PENDENTE')];
        return json(estado.envios[1], 202);
      }
      return undefined;
    }, estado);
    montar(caminhoFicha, HELENA);
    expect(await screen.findByText('Falha definitiva')).toBeInTheDocument();
    expect(screen.getByText(/5 tentativas · Caixa postal recusou a mensagem/)).toBeInTheDocument();
    const botoes = screen.getAllByRole('button', { name: /^Reenviar/ });
    expect(botoes).toHaveLength(1);

    await userEvent.click(botoes[0] as HTMLElement);
    expect(await screen.findByText('Envio de volta à fila')).toBeInTheDocument();
    expect(para(`/documento/email/${falho.id}/reenvio`, 'POST')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: /^Reenviar/ })).not.toBeInTheDocument());
  });
});

describe('Logs de acesso', () => {
  const log = (n: number, extra: object = {}) => ({
    id: String(n),
    dataHora: '2026-11-17T21:00:00.000Z',
    servico: 'dona-cida',
    ipCliente: '10.0.0.1',
    profissionalId: CAIO.id,
    metodo: 'GET',
    rota: '/api/v1/atendimento',
    statusCode: 200,
    tempoMs: 12.4,
    requestId: `aaaaaaaa-0000-4000-8000-00000000000${n}`,
    ...extra,
  });

  it('filtra por serviço e profissional (nome vindo dos atendimentos) e limpa os filtros', async () => {
    const { para } = simularApi((c) => {
      if (c.caminho === '/atendimento') return json({ itens: [atendimento(1)], proximoCursor: null });
      if (c.caminho === '/auditoria/acesso') {
        return json({ itens: [log(1), log(2, { profissionalId: null, statusCode: 401 })], proximoCursor: null });
      }
      return undefined;
    });
    montar('/auditoria/acessos', HELENA);
    expect(await screen.findByText('Sem autenticação')).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: CAIO.nome })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Serviço'), 'jaiminho');
    await userEvent.selectOptions(screen.getByLabelText('Profissional'), CAIO.nome);
    await waitFor(() => {
      const ultima = para('/auditoria/acesso').at(-1);
      expect(ultima?.consulta.get('servico')).toBe('jaiminho');
      expect(ultima?.consulta.get('profissionalId')).toBe(CAIO.id);
    });

    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => expect(para('/auditoria/acesso').at(-1)?.consulta.has('servico')).toBe(false));
  });

  it('403 do servidor vira mensagem de permissão', async () => {
    simularApi((c) => (c.caminho === '/auditoria/acesso' ? erro(403, 'SEM_PERMISSAO') : json({ itens: [], proximoCursor: null })));
    montar('/auditoria/acessos', HELENA);
    expect(await screen.findByText('Sem permissão')).toBeInTheDocument();
  });
});

describe('Verificação de documento', () => {
  it.each([
    [true, 'Documento íntegro'],
    [false, 'Documento não confere'],
  ])('integro=%s → "%s", com os metadados', async (integro, titulo) => {
    const doc = documento();
    simularApi((c) => (c.caminho === `/documento/${doc.id}` ? json({ ...doc, integro }) : undefined));
    montar(`/documentos/${doc.id}`, HELENA);
    expect(await screen.findByRole('heading', { name: titulo })).toBeInTheDocument();
    expect(screen.getByText('MF-TESTE-0001')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir o atendimento desta ficha' })).toHaveAttribute('href', `/atendimentos/${doc.atendimentoId}`);
  });

  it('documento inexistente explica o que conferir', async () => {
    simularApi(() => undefined);
    montar(`/documentos/${uuid(999)}`, HELENA);
    expect(await screen.findByText('Documento não encontrado')).toBeInTheDocument();
  });
});

describe('Prontuários', () => {
  it('lista e abre a pessoa com itens (inativado riscado) e os atendimentos dela', async () => {
    const f = ficha();
    const item = (n: number, descricao: string, inativadoEm: string | null) => ({
      id: uuid(800 + n),
      prontuarioId: f.prontuario.id,
      pessoaId: f.pessoa.id,
      tipo: 'ALERGIA',
      descricao,
      registradoPor: null,
      registradoEm: '2026-03-21T12:00:00.000Z',
      inativadoEm,
    });
    const prontuario = { ...f.prontuario, tipoSanguineo: 'O+', itens: [item(1, 'Látex', null), item(2, 'Iodo', '2026-05-01T12:00:00.000Z')] };
    const { para } = simularApi((c) => {
      if (c.caminho === '/prontuario') {
        return json({ itens: [{ ...prontuario, pessoa: { id: f.pessoa.id, nome: f.pessoa.nome, dataNascimento: f.pessoa.dataNascimento, cpf: f.pessoa.cpf, naoIdentificada: false } }], proximoCursor: null });
      }
      if (c.caminho === `/pessoa/${f.pessoa.id}`) return json(f.pessoa);
      if (c.caminho === `/prontuario/${f.pessoa.id}`) return json(prontuario);
      if (c.caminho === `/atendimento/${f.pessoa.id}`) return json({ itens: [atendimento(7)], proximoCursor: null });
      return undefined;
    });
    montar('/prontuarios', HELENA);
    await userEvent.click(await screen.findByText('Marlene Fictícia'));

    expect(await screen.findByRole('heading', { name: 'Marlene Fictícia' })).toBeInTheDocument();
    expect(screen.getByText('000.000.001-91')).toBeInTheDocument();
    expect(await screen.findByText('O+')).toBeInTheDocument();
    expect(screen.getByText('Látex').tagName).toBe('STRONG');
    expect(screen.getByText('Iodo').tagName).toBe('S');
    expect(await screen.findByText('Queixa 7')).toBeInTheDocument();
    expect(para(`/atendimento/${f.pessoa.id}`)).toHaveLength(1);
  });
});
