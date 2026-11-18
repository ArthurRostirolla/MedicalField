import { garantirAtendimentos } from './apoio';

/** Antes de tudo: garante atendimentos fictícios na DonaCida (idempotente). */
export default async function preparar(): Promise<void> {
  await garantirAtendimentos();
}
