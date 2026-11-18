import { criarAplicacao } from './aplicacao-http.ts';
import { carregarConfig, type Config } from './infra/config.ts';

let config: Config;
try {
  config = carregarConfig(process.env);
} catch (erro) {
  // Faltou variavel obrigatoria: o processo nao sobe.
  process.stderr.write(`${JSON.stringify({ nivel: 'error', tipo: 'aplicacao', servico: 'dona-cida', mensagem: (erro as Error).message })}\n`);
  process.exit(1);
}

const app = await criarAplicacao(config);
await app.listen(config.porta);
process.stdout.write(`${JSON.stringify({ nivel: 'info', tipo: 'aplicacao', dataHora: new Date().toISOString(), servico: 'dona-cida', mensagem: 'API no ar', porta: config.porta })}\n`);
