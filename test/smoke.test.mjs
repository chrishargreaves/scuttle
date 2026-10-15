// Executes the concatenated bundle against a stub DOM.
//
// The unit tests import modules separately, so they never see the concatenated scope.
// Compiling it catches duplicate declarations; only running it catches a name that does
// not exist at all -- an aliased import, for instance, which the bundler's narrow
// import-stripping transform cannot honour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULES, stripModuleSyntax } from '../tools/bundle.mjs';
import { loadN3 } from './helpers/n3.mjs';

const ELEMENT_IDS = [
  'file', 'fname', 'src', 'srcwrap', 'mini', 'miniRows', 'vp', 'side', 'pop',
  'segMode', 'segFmt', 'reportBtn', 'reportPanel', 'drop',
];

function stubElement() {
  const element = {
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    dataset: {}, hidden: true, textContent: '', innerHTML: '',
    scrollTop: 0, scrollHeight: 100, clientHeight: 50, offsetTop: 0, offsetWidth: 620,
    addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, right: 0 }),
    closest: () => null, appendChild() {}, files: [],
  };
  return element;
}

function stubDocument() {
  const byId = Object.fromEntries(ELEMENT_IDS.map(id => [id, stubElement()]));
  return {
    getElementById: id => byId[id] ?? null,
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {},
    body: stubElement(),
  };
}

test('the bundled app runs against a stub DOM without a reference error', () => {
  loadN3();
  const app = MODULES
    .map(m => stripModuleSyntax(readFileSync(new URL(`../${m}`, import.meta.url), 'utf8')))
    .join('\n');

  const run = new Function(
    'document', 'window', 'CSS', 'N3',
    `"use strict";\n${app}`
  );

  assert.doesNotThrow(() => run(
    stubDocument(),
    { addEventListener() {}, innerWidth: 1200, innerHeight: 800, __ONTOLOGY__: { meta: {}, terms: {} } },
    { escape: s => s },
    globalThis.N3
  ), 'the concatenated bundle must execute; a ReferenceError here means a name is missing');
});

test('no module uses an aliased import', () => {
  // The bundler strips import statements wholesale, so `X as Y` leaves Y undefined at
  // runtime. A per-line check missed a wrapped import, so match the whole statement.
  for (const m of MODULES) {
    const source = readFileSync(new URL(`../${m}`, import.meta.url), 'utf8');
    for (const statement of source.match(/^import\b[\s\S]*?from\s*['"][^'"]+['"];/gm) ?? []) {
      assert.ok(!/\bas\b/.test(statement),
        `${m} uses an aliased import, which the bundler cannot honour:\n${statement}`);
    }
  }
});

test('the alias ban sees a wrapped import statement', () => {
  // Guards the guard: this is the exact shape that slipped through the per-line check.
  const wrapped = "import {\n  alpha as beta,\n} from './x.js';";
  const statements = wrapped.match(/^import\b[\s\S]*?from\s*['"][^'"]+['"];/gm) ?? [];
  assert.equal(statements.length, 1, 'a multi-line import must be matched as one statement');
  assert.ok(/\bas\b/.test(statements[0]), 'and its alias must be visible to the ban');
});
