// Gera os PDFs curtos da documentacao: docs/pdf/fontes/*.md -> docs/pdf/MedicalField-*.pdf
//   node scripts/gerar-pdfs-docs.mjs [trecho-do-nome]   (ex.: 06 gera so o 06-*.md)
// Identidade visual do guia (docs/apresentacao/guia-visual). {{svg nome}} no markdown vira o diagrama
// docs/pdf/fontes/diagramas/nome.svg (extraidos do guia). Markdown via marked (CDN, precisa de rede), PDF via Playwright.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright';

const RAIZ = resolve(fileURLToPath(import.meta.url), '../..');
const FONTES = join(RAIZ, 'docs/pdf/fontes');
const url = (p) => pathToFileURL(join(RAIZ, p)).href;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const css = readFileSync(join(RAIZ, 'docs/apresentacao/guia-visual/guia.html'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
const cssExtra = `
@page :first{margin:14mm 15mm 16mm}
.topo{background:var(--marca);color:#fff;border-radius:8px;padding:9mm 10mm;display:flex;gap:8mm;align-items:center;margin-bottom:6mm}
.topo .cruzg{width:16mm;height:16mm;background:#fff;border-radius:4mm;position:relative;flex:none}
.topo .cruzg:before,.topo .cruzg:after{content:"";position:absolute;background:var(--marca);left:50%;top:50%;transform:translate(-50%,-50%)}
.topo .cruzg:before{width:10mm;height:3mm}.topo .cruzg:after{width:3mm;height:10mm}
.topo h1{font-size:25pt;font-stretch:78%;line-height:1}
.topo .sub{font-size:10.5pt;margin-top:2mm;opacity:.95}
.topo .rotulo{color:#fff;opacity:.85;margin-bottom:1.5mm}
.conteudo h3{break-after:avoid}
pre{font-family:'Cascadia Mono',Consolas,monospace}
pre code{font:inherit;background:none;border:0;padding:0;color:inherit}
.diagrama{text-align:center;padding:4mm}
.diagrama svg{max-width:100%;max-height:135mm;margin:0 auto}
`;

function montarHtml(md) {
  const [, meta, corpo] = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const m = Object.fromEntries(meta.split('\n').map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]));
  return { titulo: m.titulo, html: `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>MedicalField — ${esc(m.titulo)}</title>
<link rel="stylesheet" href="${url('node_modules/@fontsource-variable/archivo/wdth.css')}">
<link rel="stylesheet" href="${url('node_modules/@fontsource-variable/martian-mono/index.css')}">
<style>${css}${cssExtra}</style>
<script src="https://cdn.jsdelivr.net/npm/marked@15.0.6/marked.min.js"></script>
</head><body>
<header class="topo"><div class="cruzg"></div><div><div class="rotulo">MedicalField · Arquiteturas de Software · Univates 2026/B</div>
<h1>${esc(m.titulo)}</h1><div class="sub">${esc(m.sub)}</div></div></header>
<main class="conteudo" id="conteudo"></main>
<script type="text/markdown" id="md">${corpo.replace(/\{\{svg ([\w-]+)\}\}/g, (_, n) => `<div class="diagrama">${readFileSync(join(FONTES, 'diagramas', n + '.svg'), 'utf8').replace(/\s*\n\s*/g, ' ')}</div>`)}</script>
<script>
(async () => {
  const r = new marked.Renderer();
  r.heading = function ({ tokens, depth }) { const t = this.parser.parseInline(tokens); return depth <= 2 ? '<h3>' + t + '</h3>' : '<h4>' + t + '</h4>'; };
  document.getElementById('conteudo').innerHTML = marked.parse(document.getElementById('md').textContent, { renderer: r, gfm: true });
  await document.fonts.ready;
  window.pronto = true;
})().catch((e) => { window.erro = String(e); window.pronto = true; });
</script></body></html>` };
}

const browser = await chromium.launch({ channel: 'chrome' });
for (const arq of readdirSync(FONTES).filter((f) => f.endsWith('.md') && f.includes(process.argv[2] ?? '')).sort()) {
  // {{md caminho}} inclui outro markdown do repositorio (sem o titulo `# `): o PDF nao vira uma segunda copia.
  const fonte = readFileSync(join(FONTES, arq), 'utf8').replace(/\r\n/g, '\n').replace(/\{\{md ([^}]+)\}\}/g, (_, c) =>
    readFileSync(join(RAIZ, c.trim()), 'utf8').replace(/\r\n/g, '\n').replace(/^# .*\n/, ''));
  const { titulo, html } = montarHtml(fonte);
  const tmp = join(tmpdir(), arq.replace('.md', '.html'));
  writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmp).href);
  await page.waitForFunction(() => window.pronto, null, { timeout: 120000 });
  const erro = await page.evaluate(() => window.erro);
  if (erro) console.warn(`! ${arq}: ${erro}`);
  const saida = join(RAIZ, 'docs/pdf', `MedicalField-${arq.replace('.md', '.pdf')}`);
  await page.pdf({
    path: saida, format: 'A4', printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:7px 'Segoe UI',sans-serif;color:#5e6775;padding:0 15mm;display:flex;justify-content:space-between"><span>MedicalField · ${esc(titulo)}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  });
  await page.close();
  console.log('ok', saida);
}
await browser.close();
