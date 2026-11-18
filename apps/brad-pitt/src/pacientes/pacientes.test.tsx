// Telas de criação pelo portal (como no app): novo atendimento → novo paciente → atendimento aberto.
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAIO, ficha, json, montar, simularApi } from '../teste/apoio';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Novo atendimento e novo paciente', () => {
  it('sem achar o paciente, cadastra e já abre o atendimento (pessoa → prontuário com itens → atendimento)', async () => {
    const f = ficha();
    const { para } = simularApi((c) => {
      if (c.caminho === '/pessoa' && c.metodo === 'GET') return json({ itens: [], proximoCursor: null });
      if (c.caminho === '/pessoa' && c.metodo === 'POST') return json({ ...f.pessoa, ...(c.corpo as object) }, 201);
      if (c.caminho === '/prontuario' && c.metodo === 'POST') return json({ ...f.prontuario, itens: [] }, 201);
      if (c.caminho === '/atendimento' && c.metodo === 'POST') return json({ ...f.atendimento, ...(c.corpo as object) }, 201);
      return undefined;
    });
    montar('/atendimentos/novo', CAIO);
    await userEvent.type(await screen.findByLabelText('Buscar por nome ou CPF'), 'Paciente Novo');
    await userEvent.click(await screen.findByRole('link', { name: 'Cadastrar “Paciente Novo”' }));

    // O nome digitado na busca chega preenchido.
    expect(await screen.findByLabelText('Nome')).toHaveValue('Paciente Novo');
    await userEvent.type(screen.getByLabelText('CPF'), '123.456.789-01');
    await userEvent.type(screen.getByLabelText('Alergias'), 'Dipirona, látex');
    await userEvent.type(screen.getByLabelText('Queixa principal'), 'Dor torácica');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar e abrir atendimento' }));

    expect(await screen.findByText('Paciente cadastrado e atendimento aberto')).toBeInTheDocument();
    const pessoa = para('/pessoa', 'POST')[0]?.corpo as { id: string };
    expect(pessoa).toMatchObject({ nome: 'Paciente Novo', cpf: '12345678901' });
    const prontuario = para('/prontuario', 'POST')[0]?.corpo as { itens: { descricao: string }[] };
    expect(prontuario).toMatchObject({ pessoaId: pessoa.id });
    expect(prontuario.itens.map((i) => i.descricao)).toEqual(['Dipirona', 'látex']);
    expect(para('/atendimento', 'POST')[0]?.corpo).toMatchObject({ pessoaId: pessoa.id, queixaPrincipal: 'Dor torácica' });
  });

  it('"Só salvar o cadastro" não abre atendimento; CPF inválido fica no campo e nada é enviado', async () => {
    const f = ficha();
    const { para } = simularApi((c) => {
      if (c.caminho === '/pessoa' && c.metodo === 'POST') return json({ ...f.pessoa, ...(c.corpo as object) }, 201);
      if (c.caminho === '/prontuario' && c.metodo === 'POST') return json({ ...f.prontuario, itens: [] }, 201);
      return undefined;
    });
    montar('/pacientes/novo', CAIO);
    await userEvent.click(await screen.findByRole('button', { name: 'Só salvar o cadastro' }));
    expect(await screen.findByText(/informe o nome/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Nome'), 'Só Cadastro');
    await userEvent.type(screen.getByLabelText('CPF'), '123');
    await userEvent.click(screen.getByRole('button', { name: 'Só salvar o cadastro' }));
    expect(await screen.findByText(/11 dígitos/)).toBeInTheDocument();
    expect(para('/pessoa', 'POST')).toHaveLength(0);

    await userEvent.clear(screen.getByLabelText('CPF'));
    await userEvent.click(screen.getByRole('button', { name: 'Só salvar o cadastro' }));
    expect(await screen.findByText('Paciente cadastrado')).toBeInTheDocument();
    expect(para('/prontuario', 'POST')).toHaveLength(1);
    expect(para('/atendimento', 'POST')).toHaveLength(0);
  });

  it('paciente escolhido mostra o que o prontuário registra e abre o atendimento dele', async () => {
    const f = ficha();
    const alergia = { id: f.prontuario.id.replace(/.$/, '9'), prontuarioId: f.prontuario.id, pessoaId: f.pessoa.id, tipo: 'ALERGIA', descricao: 'Látex', registradoPor: null, registradoEm: '2026-03-21T12:00:00.000Z', inativadoEm: null };
    const { para } = simularApi((c) => {
      if (c.caminho === `/pessoa/${f.pessoa.id}`) return json(f.pessoa);
      if (c.caminho === `/prontuario/${f.pessoa.id}`) return json({ ...f.prontuario, itens: [alergia] });
      if (c.caminho === '/atendimento' && c.metodo === 'POST') return json({ ...f.atendimento, ...(c.corpo as object) }, 201);
      return undefined;
    });
    montar(`/atendimentos/novo?pessoa=${f.pessoa.id}`, CAIO);
    expect(await screen.findByRole('heading', { name: f.pessoa.nome })).toBeInTheDocument();
    expect(await screen.findByText('Látex')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Local da ocorrência'), 'Rua A, 10');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir atendimento' }));
    expect(await screen.findByText('Atendimento aberto')).toBeInTheDocument();
    expect(para('/atendimento', 'POST')[0]?.corpo).toMatchObject({ pessoaId: f.pessoa.id, localDescricao: 'Rua A, 10' });
  });

  it('Pacientes lista todo cadastro, busca por nome e oferece cadastrar o que não achou', async () => {
    const f = ficha();
    const { para } = simularApi((c) => {
      if (c.caminho !== '/pessoa' || c.metodo !== 'GET') return undefined;
      return json({ itens: c.consulta.get('busca') ? [] : [f.pessoa], proximoCursor: null });
    });
    montar('/pacientes', CAIO);
    expect(await screen.findByText(f.pessoa.nome)).toBeInTheDocument();
    expect(para('/pessoa')[0]?.consulta.has('busca')).toBe(false);

    await userEvent.type(screen.getByLabelText('Buscar por nome ou CPF'), 'Zé');
    expect(await screen.findByRole('link', { name: 'Cadastrar “Zé”' })).toHaveAttribute('href', `/pacientes/novo?nome=${encodeURIComponent('Zé')}`);
    expect(para('/pessoa').at(-1)?.consulta.get('busca')).toBe('Zé');
  });

  it('no prontuário: item acrescentado e inativado viram POSTs', async () => {
    const f = ficha();
    const item = { id: f.prontuario.id.replace(/.$/, '9'), prontuarioId: f.prontuario.id, pessoaId: f.pessoa.id, tipo: 'ALERGIA', descricao: 'Látex', registradoPor: null, registradoEm: '2026-03-21T12:00:00.000Z', inativadoEm: null };
    const { para } = simularApi((c) => {
      if (c.caminho === `/pessoa/${f.pessoa.id}`) return json(f.pessoa);
      if (c.caminho === `/prontuario/${f.pessoa.id}`) return json({ ...f.prontuario, itens: [item] });
      if (c.caminho === `/atendimento/${f.pessoa.id}`) return json({ itens: [], proximoCursor: null });
      if (c.caminho === '/prontuario-item') return json({ ...item, ...(c.corpo as object) }, 201);
      if (c.caminho === `/prontuario-item/${item.id}/inativacao`) return json({ ...item, inativadoEm: '2026-11-18T12:00:00.000Z' });
      return undefined;
    });
    montar(`/pacientes/${f.pessoa.id}`, CAIO);
    expect(await screen.findByRole('link', { name: 'Novo atendimento' })).toHaveAttribute('href', `/atendimentos/novo?pessoa=${f.pessoa.id}`);

    await userEvent.type(await screen.findByLabelText('Descrição da alergia'), 'Dipirona');
    await userEvent.click(screen.getByRole('button', { name: 'Acrescentar' }));
    expect(await screen.findByText('Alergia registrada')).toBeInTheDocument();
    expect(para('/prontuario-item', 'POST')[0]?.corpo).toMatchObject({ pessoaId: f.pessoa.id, tipo: 'ALERGIA', descricao: 'Dipirona' });

    await userEvent.click(screen.getByRole('button', { name: 'Inativar' }));
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Inativar' }));
    expect(await screen.findByText('Item inativado')).toBeInTheDocument();
    expect(para(`/prontuario-item/${item.id}/inativacao`, 'POST')).toHaveLength(1);
  });
});
