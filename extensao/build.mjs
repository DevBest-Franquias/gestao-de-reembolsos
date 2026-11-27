// Monta a extensão em dist/ e gera o .zip publicado pelo site (web/public)
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const API_URL = process.env.API_URL || 'https://reembolsos-api.bestfranquias.workers.dev';
const WEB_URL = process.env.WEB_URL || 'https://reembolsos-best-franquias.vercel.app';
const ZIP = process.env.SEM_ZIP ? null : '../web/public/extensao-reembolsos-bitrix.zip';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist/icones', { recursive: true });

await build({
  entryPoints: { popup: 'src/popup.ts', fundo: 'src/fundo.ts', ponte: 'src/ponte.ts' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'chrome110',
  minify: true,
  define: {
    API_URL: JSON.stringify(API_URL),
    WEB_URL: JSON.stringify(WEB_URL),
    'import.meta.env': '{}',
  },
  logLevel: 'warning',
});

const versao = JSON.parse(readFileSync('package.json', 'utf8')).version || '1.0.0';
const manifest = {
  manifest_version: 3,
  name: 'Reembolsos Best → Bitrix',
  description: 'Preenche o formulário de solicitação de pagamento do Bitrix com os dados do sistema de reembolsos.',
  version: versao,
  icons: { 16: 'icones/icone-16.png', 32: 'icones/icone-32.png', 48: 'icones/icone-48.png', 128: 'icones/icone-128.png' },
  action: { default_popup: 'popup.html', default_title: 'Preencher o Bitrix com um reembolso' },
  background: { service_worker: 'fundo.js' },
  permissions: ['storage', 'scripting', 'tabs'],
  host_permissions: ['https://hubsmart.bitrix24.site/*', `${new URL(API_URL).origin}/*`, `${new URL(WEB_URL).origin}/*`],
  content_scripts: [{ matches: ['https://hubsmart.bitrix24.site/*'], js: ['ponte.js'], run_at: 'document_start' }],
};
writeFileSync('dist/manifest.json', JSON.stringify(manifest, null, 2));
cpSync('src/popup.html', 'dist/popup.html');
cpSync('src/popup.css', 'dist/popup.css');
cpSync('icones', 'dist/icones', { recursive: true });

if (ZIP) {
  // O site publica a versão mais nova; a extensão compara com a dela e avisa quando houver atualização
  writeFileSync('../web/public/extensao-versao.json', JSON.stringify({ versao }) + '\n');
  rmSync(ZIP, { force: true });
  execSync(`cd dist && zip -qr ../${ZIP} .`);
  console.log('Pacote gerado em', ZIP.replace('../', ''));
}
console.log('Extensão pronta em extensao/dist (API:', API_URL + ')');
