// Metro: configuracao padrao do Expo (ja entende o monorepo) + o proxy de /api do servidor de
// desenvolvimento web, como o Vite fazia. Em producao o gateway (Traefik) faz esse roteamento.
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// O prefixo nao e removido: cada servico atende em /api/v1/... (docs/contratos.md, secao 1).
const DESTINOS = [
  [/^\/api\/v1\/(auth|log|auditoria)(\/|$|\?)/, 8081], // Mike
  [/^\/api\/v1\/documento(\/|$|\?)/, 8083], // Jaiminho
  [/^\/api\/v1(\/|$|\?)/, 8082], // Dona Cida
];

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (pedido, resposta, proximo) => {
    // Em desenvolvimento o Metro serve public/ na raiz, mas o app pede os arquivos sob /app/ (baseUrl).
    if (/^\/app\/(sqlite\.worker\.js|sqlite3\.wasm)(\?|$)/.test(pedido.url ?? '')) pedido.url = pedido.url.slice('/app'.length);
    const destino = DESTINOS.find(([padrao]) => padrao.test(pedido.url ?? ''));
    if (!destino) return middleware(pedido, resposta, proximo);
    const saida = http.request(
      { host: 'localhost', port: destino[1], path: pedido.url, method: pedido.method, headers: pedido.headers },
      (volta) => {
        resposta.writeHead(volta.statusCode ?? 502, volta.headers);
        volta.pipe(resposta);
      },
    );
    saida.on('error', () => {
      resposta.writeHead(502, { 'Content-Type': 'application/json' });
      resposta.end('{"codigo":"SERVICO_INDISPONIVEL","mensagem":"Servico local fora do ar (proxy do Metro)."}');
    });
    pedido.pipe(saida);
  },
};

module.exports = config;
