import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { buildHtml, stripModuleSyntax, MODULES } from '../tools/bundle.mjs';

test('stripModuleSyntax removes import lines and export keywords', () => {
  const out = stripModuleSyntax(
    "import { a } from './a.js';\nexport function f() { return 1; }\nexport const x = 2;\n"
  );
  assert.ok(!/^import/m.test(out), 'import line survived');
  assert.ok(!/^export/m.test(out), 'export keyword survived');
  assert.match(out, /function f\(\)/);
  assert.match(out, /const x = 2/);
});

test('stripModuleSyntax leaves the word export inside strings alone', () => {
  const out = stripModuleSyntax('const s = "export const not code";\n');
  assert.match(out, /"export const not code"/);
});

test('every declared module exists and is topologically listed', () => {
  for (const m of MODULES) assert.ok(existsSync(new URL(`../${m}`, import.meta.url)), `missing ${m}`);
});

test('built page has no external subresource', () => {
  const html = buildHtml();
  // Any src=/href= that points at a URL or path outside the document itself.
  const external = [...html.matchAll(/<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)]
    .map(m => m[1]);
  assert.deepEqual(external, [], `external subresources: ${external.join(', ')}`);
  assert.ok(!/@font-face/i.test(html), 'stylesheet declares a font face');
});

test('built page inlines the parser and the ontology index', () => {
  const html = buildHtml();
  assert.ok(html.includes('window.__ONTOLOGY__='), 'ontology index not inlined');
  assert.match(html, /N3|n3/, 'parser not inlined');
  // The UMD bundle must be reachable without a module loader.
  assert.ok(!/<script[^>]*type=["']module["']/i.test(html), 'page uses a module script');
});

test('the document is never loaded over the network', () => {
  const app = MODULES.filter(m => !m.includes('solveit'))
    .map(m => readFileSync(new URL(`../${m}`, import.meta.url), 'utf8')).join('\n');
  assert.ok(!/\bfetch\s*\(/.test(app), 'a non-solveit module calls fetch');
});

test('building twice with unchanged inputs is byte-identical', () => {
  assert.equal(buildHtml(), buildHtml());
});

// The bundler concatenates every module into one scope, so a `const` or `class` declared
// in two modules is a redeclaration error that stops the entire page loading. Unit tests
// import modules separately and never see it; compiling the concatenation does.
test('the concatenated app source compiles as a single script', () => {
  const app = MODULES
    .map(m => stripModuleSyntax(readFileSync(new URL(`../${m}`, import.meta.url), 'utf8')))
    .join('\n');
  assert.doesNotThrow(() => new Function(`"use strict";\n${app}`),
    'the concatenated modules must compile -- check for a name declared in two modules');
});

test('the compile check detects a name declared in two modules', () => {
  // Guards the guard: if this stops throwing, the check above has stopped checking.
  assert.throws(() => new Function('"use strict";\nconst DUP = 1;\nconst DUP = 2;'),
    /already been declared/);
});

test('the compile check alone does not cover var or async function', () => {
  // Both are legal to redeclare, so compiling the bundle cannot catch them. This is why
  // the name scan below exists and why it must recognise those two shapes.
  assert.doesNotThrow(() => new Function('"use strict";\nvar DUP = 1;\nvar DUP = 2;'));
  assert.doesNotThrow(() => new Function('"use strict";\nasync function DUP(){}\nasync function DUP(){}'));
});

test('no two modules declare the same top-level name', () => {
  const declarations = new Map();
  for (const m of MODULES) {
    const source = stripModuleSyntax(readFileSync(new URL(`../${m}`, import.meta.url), 'utf8'));
    const declaration = /^(?:var|const|let|class|(?:async\s+)?function\s*\*?)\s+([A-Za-z_$][\w$]*)/gm;
    for (const match of source.matchAll(declaration)) {
      const name = match[1];
      if (declarations.has(name)) {
        assert.fail(`${name} is declared in both ${declarations.get(name)} and ${m}`);
      }
      declarations.set(name, m);
    }
  }
});

test('the drop overlay starts hidden', () => {
  // It covers the whole viewport, so shipping it visible hides the document behind it.
  const html = buildHtml();
  assert.match(html, /<div id="drop" hidden>/,
    'the drag-and-drop overlay must not be visible before a drag starts');
});

test('the hidden attribute is not overridden by id selectors', () => {
  // Several panels set display on an id selector, which outranks the UA rule for
  // [hidden] and leaves dismissed panels on screen.
  const html = buildHtml();
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none\s*!important/,
    'the stylesheet must force [hidden] to win over id-level display rules');
});

test('the reading area is ordered overview, source, sidebar', () => {
  const html = buildHtml();
  const mini = html.indexOf('id="mini"');
  const source = html.indexOf('id="srcwrap"');
  const side = html.indexOf('id="side"');
  assert.ok(mini > -1 && source > -1 && side > -1, 'all three regions must be present');
  assert.ok(mini < source, 'the positional overview sits left of the source');
  assert.ok(source < side, 'the resolved-view sidebar sits right of the source');
});
