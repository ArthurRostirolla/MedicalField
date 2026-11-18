import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reiniciarSessaoParaTeste } from '../api/cliente';
import { CAIO, documento, erro, HELENA, json, montar, sessaoDe, simularApi } from '../teste/apoio';

beforeEach(() => {
  localStorage.clear();
  reiniciarSessaoParaTeste({ situacao: 'anonima' });
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

async function preencherLogin(registro = '100001', senha = 'segredo') {
  const usuario = userEvent.setup();
  await usuario.type(screen.getByLabelText('Número do CRM'), registro);
  await usuario.type(screen.getByLabelText('Senha'), senha);
  await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
  return usuario;
}

describe('guarda de rota', () => {
  it('sem sessão, manda para o login e depois volta para a mesma URL (destino do QR)', async () => {
    const doc = documento();
    const { para } = simularApi((c) => {
      if (c.caminho === '/auth/login') return json(sessaoDe(HELENA));
      if (c.caminho === `/documento/${doc.id}`) return json({ ...doc, integro: true });
      return undefined;
    });
    montar(`/documentos/${doc.id}`);
    expect(await screen.findByRole('heading', { name: 'Identificação profissional' })).toBeInTheDocument();

    await preencherLogin();
    expect(await screen.findByRole('heading', { name: 'Documento íntegro' })).toBeInTheDocument();
    expect(para('/auth/login', 'POST')[0]?.corpo).toEqual({ tipoRegistro: 'CRM', registro: '100001', uf: 'RS', senha: 'segredo' });
  });

  it('ao recarregar com sessão anterior, restaura pelo refresh sem passar pelo login', async () => {
    reiniciarSessaoParaTeste({ situacao: 'ativa', profissional: HELENA }, 'x');
    reiniciarSessaoParaTeste(); // recarregou: o token em memória se foi, o cookie não
    simularApi((c) => {
      if (c.caminho === '/auth/refresh') return json(sessaoDe(HELENA));
      if (c.caminho === '/medicamento') return json({ itens: [], proximoCursor: null });
      return undefined;
    });
    montar('/medicamentos');
    expect(await screen.findByText('Cadastro de medicamentos vazio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar' })).not.toBeInTheDocument();
  });

  it('PROFISSIONAL não vê os itens de auditoria nem abre a tela pelo endereço', async () => {
    const { chamadas } = simularApi(() => undefined);
    montar('/auditoria/acessos', CAIO);
    expect(await screen.findByText('Área restrita à administração')).toBeInTheDocument();
    const indice = screen.getByRole('navigation', { name: 'Seções do portal' });
    expect(within(indice).getByRole('link', { name: 'Atendimentos' })).toBeInTheDocument();
    expect(within(indice).queryByRole('link', { name: 'Logs de acesso' })).not.toBeInTheDocument();
    expect(within(indice).queryByRole('link', { name: 'Possíveis duplicatas' })).not.toBeInTheDocument();
    expect(chamadas.filter((c) => c.caminho.startsWith('/auditoria'))).toHaveLength(0);
  });

  it('ADMIN vê a auditoria; sair volta ao login', async () => {
    simularApi((c) => (c.caminho === '/auth/logout' ? new Response(null, { status: 204 }) : json({ itens: [], proximoCursor: null })));
    montar('/auditoria/duplicatas', HELENA);
    expect(await screen.findByText('Nenhum cadastro sinalizado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Logs de acesso' })).toBeInTheDocument();
    expect(screen.getByText('Dados demonstrativos — sem validade clínica')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Identificação profissional' })).toBeInTheDocument();
  });
});

describe('tela de login', () => {
  it('não envia com campos vazios e diz o que falta', async () => {
    const { chamadas } = simularApi(() => undefined);
    montar('/entrar');
    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(screen.getByText('Informe o número do registro.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(chamadas).toHaveLength(0);
  });

  it('socorrista entra sem UF', async () => {
    const { para } = simularApi(() => json(sessaoDe(CAIO)));
    montar('/entrar');
    const usuario = userEvent.setup();
    await usuario.click(await screen.findByRole('radio', { name: 'Socorrista' }));
    expect(screen.queryByLabelText('UF')).not.toBeInTheDocument();
    await usuario.type(screen.getByLabelText('Identificação de socorrista'), '300003');
    await usuario.type(screen.getByLabelText('Senha'), 'segredo');
    await usuario.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(para('/auth/login', 'POST')).toHaveLength(1));
    expect(para('/auth/login', 'POST')[0]?.corpo).toEqual({ tipoRegistro: 'SOCORRISTA', registro: '300003', senha: 'segredo' });
  });

  it.each([
    [() => erro(401, 'CREDENCIAIS_INVALIDAS', 'Registro ou senha inválidos.'), /Registro ou senha não conferem/],
    [() => erro(429, 'MUITAS_TENTATIVAS'), /Muitas tentativas seguidas.*Aguarde 15 minutos/],
    [() => erro(503, 'SERVICO_INDISPONIVEL'), /serviço de identidade não respondeu/],
    [() => new Response('', { status: 502 }), /serviço de identidade não respondeu/],
  ])('mostra a falha de login (%#) e deixa tentar de novo', async (resposta, mensagem) => {
    simularApi(resposta);
    montar('/entrar');
    await screen.findByRole('button', { name: 'Entrar' });
    await preencherLogin();
    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem);
    expect(screen.getByRole('button', { name: 'Entrar' })).not.toHaveAttribute('aria-busy');
  });
});
