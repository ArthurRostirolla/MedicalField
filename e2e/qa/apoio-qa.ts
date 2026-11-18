// Apoio das specs de QA: SQL e docker compose no sistema local (deploy/compose.yaml), API pelo gateway, evidencias.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EVIDENCIAS = resolve(RAIZ, 'docs/testes/evidencias/qa');
export const BASE = process.env.MF_BASE ?? 'http://localhost:8088';
mkdirSync(EVIDENCIAS, { recursive: true });

/** `docker compose` do sistema local, rodado em deploy/ (le deploy/.env). */
export function compose(...args: string[]): string {
  return execFileSync('docker', ['compose', ...args], { cwd: resolve(RAIZ, 'deploy'), encoding: 'utf8' }).trim();
}
export const sql = (consulta: string): string => compose('exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', 'medicalfield', '-At', '-c', consulta);
export const contar = (consulta: string): number => Number(sql(consulta));

/** Acrescenta uma linha ao arquivo de evidencia da spec (e ao console). */
export function anotar(arquivo: string, linha: string): void {
  console.log(linha);
  appendFileSync(resolve(EVIDENCIAS, arquivo), `${linha}\n`);
}

export async function tokenDe(tipoRegistro: string, registro: string, uf?: string): Promise<string> {
  const resposta = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipoRegistro, registro, uf, senha: process.env.MF_SENHA_DEMO }),
  });
  if (!resposta.ok) throw new Error(`login ${resposta.status}`);
  return ((await resposta.json()) as { accessToken: string }).accessToken;
}

export async function api(token: string, metodo: string, caminho: string, corpo?: unknown, cabecalhos: Record<string, string> = {}): Promise<{ status: number; corpo: any }> {
  const resposta = await fetch(`${BASE}${caminho}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...cabecalhos },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await resposta.text();
  let json: unknown = texto;
  try { json = JSON.parse(texto); } catch { /* corpo nao e JSON */ }
  return { status: resposta.status, corpo: json };
}

/** CPF ficticio com digitos verificadores validos. */
export function cpfValido(): string {
  const n = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const dv = (base: number[]) => {
    const soma = base.reduce((s, d, i) => s + d * (base.length + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(n);
  const d2 = dv([...n, d1]);
  return [...n, d1, d2].join('');
}
