// Cenario 5: offline REAL (sem usar o seletor), sobre o build de producao servido por `vite preview`.
// O service worker entrega a casca do app; o banco local (OPFS) entrega os dados.
import { expect, test } from '@playwright/test';
import { contar, entrar, esperarTudoEnviado, novoPacienteComAtendimento, pendentesLocais, registrarSinais, registrarTriagem, unico, vigiarConsole } from './apoio.ts';

test('5. offline real: o app abre pela casca do PWA, registra e sincroniza ao voltar', async ({ page, context }) => {
  // Sem rede de verdade o navegador registra as proprias falhas de conexao; fora isso, nenhum erro.
  const erros = vigiarConsole(page, [/ERR_INTERNET_DISCONNECTED/, /Failed to fetch/]);
  await entrar(page);
  await esperarTudoEnviado(page);
  // Espera o service worker assumir a pagina e terminar de guardar a casca.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);

  await context.setOffline(true);
  await page.reload(); // sem rede: so abre se a casca vier do service worker
  await expect(page.getByRole('heading', { name: 'Início', level: 1 })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' }).filter({ visible: true }).first()).toContainText(/sem rede/i);
  await expect(page.getByRole('switch', { name: /Simular conectividade/ })).toHaveAttribute('aria-checked', 'false');

  const nome = unico('Paciente Sem Rede');
  const { pessoaId, atendimentoId } = await novoPacienteComAtendimento(page, nome, 'Látex');
  await registrarSinais(page);
  await registrarTriagem(page, 'VERDE');
  expect(await pendentesLocais(page)).toBe(5);
  await page.reload(); // de novo sem rede, agora com pendencias
  await expect(page.getByRole('heading', { name: nome, level: 1 })).toBeVisible();
  expect(await pendentesLocais(page)).toBe(5);
  expect(contar(`SELECT count(*) FROM clinico.pessoa WHERE nome = '${nome}'`)).toBe(0);

  await context.setOffline(false); // a rede volta: o monitor percebe e o motor sincroniza sozinho
  await esperarTudoEnviado(page);
  expect(contar(`SELECT count(*) FROM clinico.pessoa WHERE id = '${pessoaId}'`)).toBe(1);
  expect(contar(`SELECT count(*) FROM clinico.atendimento WHERE id = '${atendimentoId}'`)).toBe(1);
  expect(contar(`SELECT count(*) FROM clinico.atendimento_evento WHERE atendimento_id = '${atendimentoId}'`)).toBe(2);
  expect(erros).toEqual([]);
});
