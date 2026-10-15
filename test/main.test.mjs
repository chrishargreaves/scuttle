// Exercises src/main.js by running the concatenated bundle against a stub DOM that
// records its listeners, so handlers can actually be fired.
//
// smoke.test.mjs proves the bundle evaluates; this proves the wiring behaves. The two
// P0/P1 races found in review lived here and were invisible to every other test.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODULES, stripModuleSyntax } from '../tools/bundle.mjs';
import { loadN3, fixture } from './helpers/n3.mjs';

const ELEMENT_IDS = [
  'file', 'tabs', 'fname', 'src', 'srcwrap', 'mini', 'miniRows', 'vp', 'side', 'pop',
  'segMode', 'segFmt', 'reportBtn', 'reportPanel', 'drop',
];

function stubElement(id = '') {
  const listeners = new Map();
  return {
    id, style: {}, dataset: {}, hidden: true, textContent: '', innerHTML: '',
    scrollTop: 0, scrollHeight: 1000, clientHeight: 400, offsetTop: 500, offsetWidth: 620,
    classList: { add() {}, remove() {}, toggle() {} },
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    getBoundingClientRect: () => ({ left: 0, top: 0, bottom: 0, right: 0 }),
    closest: () => null,
    fire(type, event = {}) {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
  };
}

function makeHarness() {
  const byId = Object.fromEntries(ELEMENT_IDS.map(id => [id, stubElement(id)]));
  const docListeners = new Map();
  const document = {
    getElementById: id => byId[id] ?? stubElement(id),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, []);
      docListeners.get(type).push(fn);
    },
    fire(type, event = {}) { for (const fn of docListeners.get(type) ?? []) fn(event); },
  };
  const window = { addEventListener() {}, innerWidth: 1200, innerHeight: 800, __ONTOLOGY__: { meta: { assumedCaseUcoVersion: '1.5.0', generated: '2026-08-20', sources: [] }, terms: {} } };
  return { document, window, els: byId };
}

function runBundle(harness, fetchImpl) {
  const app = MODULES
    .map(m => stripModuleSyntax(readFileSync(new URL(`../${m}`, import.meta.url), 'utf8')))
    .join('\n');
  const previousFetch = globalThis.fetch;
  globalThis.fetch = fetchImpl;
  try {
    new Function('document', 'window', 'CSS', 'N3', `"use strict";\n${app}`)(
      harness.document, harness.window, { escape: s => s }, globalThis.N3
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
}

const tick = () => new Promise(r => setImmediate(r));
async function settle(times = 40) { for (let i = 0; i < times; i++) await tick(); }

function pickFile(harness, name, text) {
  harness.els.file.fire('change', { target: { files: [{ name, text: async () => text }] }});
}

const SMALL = '@prefix ex: <http://example.org/> .\nex:a ex:p ex:o .\n';

// Names a technique, so the load genuinely awaits the knowledge base rather than
// short-circuiting the way a technique-free document does.
const WITH_TECHNIQUE =
  '@prefix kb: <http://example.org/kb/> .\n' +
  '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
  '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
  '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
  'kb:act a solveit-data:techniqueDFT-1137 ;\n' +
  '    uco-action:result kb:out .\n' +
  'kb:out a uco-observable:URLHistory .\n';

before(() => loadN3());

test('picking a file renders it and produces a report', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  pickFile(h, 'small.ttl', SMALL);
  await settle();

  assert.equal(h.els.fname.textContent, 'small.ttl');
  assert.match(h.els.src.innerHTML, /class="ln"/);
  assert.equal(h.els.reportBtn.hidden, false, 'the report affordance must appear');
  assert.match(h.els.reportBtn.textContent, /Report/);
});

test('a slow first load cannot overwrite a newer document report', async () => {
  // The review's P0: state written after the await used to be read from mutable state,
  // so a stale continuation composed a report from one file's findings and another's graph.
  const h = makeHarness();
  let releaseFirst;
  let call = 0;
  runBundle(h, () => {
    call++;
    if (call === 1) return new Promise(resolve => { releaseFirst = () => resolve({ ok: true, status: 200, text: async () => '' }); });
    return Promise.resolve({ ok: true, status: 200, text: async () => '' });
  });

  pickFile(h, 'first.ttl', SMALL);
  await settle(5);
  pickFile(h, 'second.ttl', SMALL + 'ex:b ex:p ex:o2 .\n');
  await settle();

  const afterSecond = h.els.reportBtn.textContent;
  assert.equal(h.els.fname.textContent, 'second.ttl');

  if (releaseFirst) releaseFirst();
  await settle();

  assert.equal(h.els.fname.textContent, 'second.ttl', 'the newer document must stay on screen');
  assert.equal(h.els.reportBtn.textContent, afterSecond,
    'the stale load must not rewrite the newer report');
});

test('no report affordance is shown until a report actually exists', async () => {
  // The source renders immediately; the report waits on the knowledge base. Until it is
  // composed there must be nothing on screen that reads as a verdict -- least of all the
  // previous document's. (Once the knowledge base is cached the gap is sub-tick, so this
  // exercises the first load, where the wait is real.)
  const h = makeHarness();
  runBundle(h, () => new Promise(() => {}));   // never resolves

  pickFile(h, 'first.ttl', WITH_TECHNIQUE);
  await settle();

  assert.match(h.els.src.innerHTML, /class="ln"/, 'the source is rendered while the check is pending');
  assert.equal(h.els.fname.textContent, 'first.ttl');
  assert.equal(h.els.reportBtn.hidden, true, 'no report affordance before a report exists');
  assert.equal(h.els.reportPanel.hidden, true, 'and no report panel either');
});

test('the drag overlay survives crossing element boundaries', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  const noop = { preventDefault() {} };

  h.document.fire('dragenter', noop);
  assert.equal(h.els.drop.hidden, false, 'overlay shows on drag enter');
  h.document.fire('dragenter', noop);   // crossing into a child
  h.document.fire('dragleave', noop);   // leaving that child
  assert.equal(h.els.drop.hidden, false, 'crossing a child boundary must not hide it');
  h.document.fire('dragleave', noop);   // leaving the document
  assert.equal(h.els.drop.hidden, true, 'leaving for real hides it');
});

test('a drop that never emits dragleave still clears the overlay', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  h.document.fire('dragenter', { preventDefault() {} });
  h.document.fire('drop', { preventDefault() {}, dataTransfer: { files: [] } });
  assert.equal(h.els.drop.hidden, true);
});

function pickFiles(harness, files) {
  harness.els.file.fire('change', {
    target: { files: files.map(([name, text]) => ({ name, text: async () => text })) },
  });
}

// A click whose target sits inside the element carrying `attr`.
function clickOn(attr, value) {
  return { target: { closest: selector => (selector === `[${attr}]` ? { dataset: { [attr.replace('data-', '').replace(/-(.)/g, (_, c) => c.toUpperCase())]: String(value) } } : null) } };
}

test('choosing several files opens a tab for each and shows the last', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  pickFiles(h, [['one.ttl', SMALL], ['two.ttl', SMALL + 'ex:b ex:p ex:o2 .\n']]);
  await settle();

  assert.equal(h.els.tabs.hidden, false);
  assert.match(h.els.tabs.innerHTML, /one\.ttl[\s\S]*two\.ttl/, 'tabs keep the order chosen');
  assert.equal((h.els.tabs.innerHTML.match(/class="tab/g) ?? []).length, 2);
  assert.equal(h.els.fname.textContent, 'two.ttl');
  assert.match(h.els.src.innerHTML, /ex:b/);
});

test('switching tabs shows that file and its own report', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  pickFiles(h, [['one.ttl', SMALL], ['two.ttl', SMALL + 'ex:b ex:p ex:o2 .\n']]);
  await settle();

  h.els.tabs.fire('click', clickOn('data-tab', 1));
  assert.equal(h.els.fname.textContent, 'one.ttl');
  assert.doesNotMatch(h.els.src.innerHTML, /ex:b/);
  assert.equal(h.els.reportBtn.hidden, false, 'the first file keeps its report');
  assert.equal(h.els.reportPanel.hidden, true, 'no report left open from the other file');
});

test('opening the same file again reuses its tab', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  pickFiles(h, [['one.ttl', SMALL]]);
  await settle();
  pickFiles(h, [['one.ttl', SMALL]]);
  await settle();
  assert.equal((h.els.tabs.innerHTML.match(/class="tab/g) ?? []).length, 1);
});

test('closing tabs moves to a neighbour, then back to the empty page', async () => {
  const h = makeHarness();
  runBundle(h, async () => ({ ok: true, status: 200, text: async () => '' }));
  pickFiles(h, [['one.ttl', SMALL], ['two.ttl', SMALL + 'ex:b ex:p ex:o2 .\n']]);
  await settle();

  h.els.tabs.fire('click', clickOn('data-tabclose', 2));
  assert.equal(h.els.fname.textContent, 'one.ttl');
  h.els.tabs.fire('click', clickOn('data-tabclose', 1));
  assert.equal(h.els.tabs.hidden, true);
  assert.equal(h.els.fname.textContent, 'no file loaded');
  assert.equal(h.els.reportBtn.hidden, true);
  assert.match(h.els.src.innerHTML, /class="empty"/);
});

test('a report that arrives after its tab was closed is dropped', async () => {
  const h = makeHarness();
  let release;
  runBundle(h, () => new Promise(resolve => { release = () => resolve({ ok: true, status: 200, text: async () => '' }); }));
  pickFiles(h, [['first.ttl', WITH_TECHNIQUE]]);
  await settle(5);
  h.els.tabs.fire('click', clickOn('data-tabclose', 1));
  release?.();
  await settle();
  assert.equal(h.els.reportBtn.hidden, true);
  assert.equal(h.els.reportPanel.hidden, true);
});
