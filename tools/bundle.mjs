// Builds dist/scuttle.html: one self-contained file with no external subresources.
//
// App modules are authored as ESM so `node --test` can import them, but they are
// concatenated into a single classic script here. That keeps the built page free of
// module semantics entirely (KTD12), which matters because the page is opened over
// file://. The transform below is deliberately narrow, so modules must keep their
// import/export statements on their own lines at the start of a line.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

// Dependency order. Concatenation replaces module resolution, so this list is the
// dependency graph and must stay topologically sorted.
export const MODULES = [
  'src/model/iris.js',
  'src/model/document.js',
  'src/model/resolve.js',
  'src/model/ontology.js',
  'src/model/solveit.js',
  'src/model/report.js',
  'src/state/history.js',
  'src/ui/html.js',
  'src/ui/copy-html.js',
  'src/ui/source-pane.js',
  'src/ui/overview.js',
  'src/ui/resolved-view.js',
  'src/ui/report-panel.js',
  'src/ui/tabs.js',
  'src/main.js',
];

export function stripModuleSyntax(source) {
  return source
    .replace(/^import[^;]*?;[ \t]*$/gm, '')
    .replace(/^import\s+[^\n]*\n(?:[^\n]*\n)*?[^\n]*from\s+['"][^'"]+['"];[ \t]*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?function|const|let|class)/gm, '');
}

export function buildHtml({ modules = MODULES, indexJson } = {}) {
  const app = modules
    .map(m => `// ---- ${m} ----\n${stripModuleSyntax(read(m))}`)
    .join('\n');
  const index = indexJson ?? (existsSync(join(root, 'src/generated/ontology-index.json'))
    ? read('src/generated/ontology-index.json')
    : '{"meta":{"generated":null,"sources":[]},"terms":{}}');

  // Split any literal closing script tag that could appear inside embedded JSON,
  // otherwise the browser ends the script element early.
  const safe = s => s.replace(/<\/script/gi, '<\\/script');

  return read('src/index.html')
    .replace('/*__APP_CSS__*/', () => read('src/app.css'))
    .replace('/*__N3__*/', () => safe(read('vendor/n3.min.cjs')))
    .replace('/*__ONTOLOGY_INDEX__*/', () => `window.__ONTOLOGY__=${safe(index)};`)
    .replace('/*__APP_JS__*/', () => `(function(){"use strict";\n${safe(app)}\n})();`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = buildHtml();
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/scuttle.html'), html);
  console.log(`dist/scuttle.html  ${(html.length / 1024).toFixed(0)} KB`);
}
