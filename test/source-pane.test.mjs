import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadN3, fixture, FIXTURES } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';
import { renderSourceHtml, stripMarkup } from '../src/ui/source-pane.js';
import { renderOverviewHtml } from '../src/ui/overview.js';

before(() => loadN3());

test('stripping the markup returns the file byte for byte', () => {
  for (const name of FIXTURES) {
    const text = fixture(name);
    const doc = loadDocument(text);
    assert.equal(stripMarkup(renderSourceHtml(doc)), text, `${name} did not round trip`);
  }
});

test('the rendered line count matches the file', () => {
  const text = fixture('marple2_goal_bookmark_provenance.ttl');
  const doc = loadDocument(text);
  const html = renderSourceHtml(doc);
  assert.equal((html.match(/class="ln"/g) ?? []).length, doc.lines.length);
});

test('markup-significant characters survive intact', () => {
  const text =
    '@prefix ex: <http://example.org/> .\n' +
    'ex:a ex:note "angle < bracket & ampersand > close" .\n' +
    'ex:a ex:esc "a \\"quoted\\" word" .\n';
  const doc = loadDocument(text);
  const html = renderSourceHtml(doc);
  assert.ok(!/<script/i.test(html));
  assert.equal(stripMarkup(html), text);
});

test('identifiers are never rewritten', () => {
  const text = fixture('marple2_goal_bookmark_provenance.ttl');
  const doc = loadDocument(text);
  const html = renderSourceHtml(doc);
  assert.ok(html.includes('kb:file-sample_disk-e01-1129c48b-af8b-591d-8e31-ddcf943fe6b3'),
    'the opaque identifier must appear exactly as written');
  assert.ok(!/URLHistory\s+“/.test(stripMarkup(html)), 'no derived label may leak into the source pane');
});

test('clickable terms carry the resolved IRI, not the prefixed form', () => {
  const doc = loadDocument('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n');
  const html = renderSourceHtml(doc);
  assert.ok(html.includes('data-iri="http://example.org/a"'));
});

test('comments are styled without altering their text', () => {
  const text = '# a banner comment\n@prefix ex: <http://example.org/> .\nex:a ex:b ex:c . # trailing\n';
  const doc = loadDocument(text);
  const html = renderSourceHtml(doc);
  assert.ok(/t-comment/.test(html), 'comments should be styled');
  assert.equal(stripMarkup(html), text);
});

test('the overview draws one row per line', () => {
  const doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
  const html = renderOverviewHtml(doc);
  assert.equal((html.match(/class="row/g) ?? []).length, doc.lines.length);
});

test('every highlighted term span carries exactly the term text', () => {
  // The lexer reports start relative to the trimmed line and an end that overshoots,
  // so a naive span silently truncates indented identifiers.
  for (const name of FIXTURES) {
    const doc = loadDocument(fixture(name));
    const html = renderSourceHtml(doc);
    const spans = [...html.matchAll(/<span class="ref[^"]*" data-iri="([^"]*)">([^<]*)<\/span>/g)];
    assert.ok(spans.length > 50, `${name}: expected many highlighted terms, got ${spans.length}`);

    for (const [, iri, text] of spans) {
      const decoded = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
      if (decoded.startsWith('<')) {
        assert.equal(decoded, `<${iri}>`, `${name}: full IRI span mismatch`);
        continue;
      }
      const [prefix, ...rest] = decoded.split(':');
      const local = rest.join(':');
      assert.ok(local.length > 0, `${name}: span "${decoded}" has no local name`);
      assert.ok(
        iri.endsWith(local),
        `${name}: span "${decoded}" is truncated -- the IRI ${iri} does not end with "${local}"`
      );
      assert.equal(doc.prefixes[prefix] + local, iri, `${name}: span "${decoded}" does not resolve to ${iri}`);
    }
  }
});

// --- Findings from code review ---

test('every resolvable term token becomes a clickable span', () => {
  // Round-trip fidelity cannot see a dropped span: the characters are still present,
  // just outside any element. This asserts coverage instead of presence.
  for (const name of FIXTURES) {
    const doc = loadDocument(fixture(name));
    const resolvable = doc.tokens.filter(t => t.iri && !t.directive && t.line);
    const rendered = (renderSourceHtml(doc).match(/class="ref[^"]*" data-iri=/g) ?? []).length;
    assert.equal(rendered, resolvable.length, `${name}: ${resolvable.length - rendered} token(s) dropped`);
  }
});

test('an indented first line does not drop its tokens', () => {
  // The lexer reports column differently on line 1 than on every later line.
  const doc = loadDocument('    @prefix ex: <http://example.org/> .\n    ex:a ex:p ex:o .\n');
  const resolvable = doc.tokens.filter(t => t.iri && !t.directive && t.line);
  const html = renderSourceHtml(doc);
  const rendered = (html.match(/class="ref[^"]*" data-iri=/g) ?? []).length;
  assert.equal(rendered, resolvable.length, 'a token on the indented first line was dropped');
  assert.equal(stripMarkup(html), '    @prefix ex: <http://example.org/> .\n    ex:a ex:p ex:o .\n');
});

test('gutter line numbers are the exact sequence, not merely the right count', () => {
  const doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
  const html = renderSourceHtml(doc);
  const ids = [...html.matchAll(/id="L(\d+)" data-line="(\d+)"/g)];
  assert.equal(ids.length, doc.lines.length);
  ids.forEach(([, id, dataLine], index) => {
    assert.equal(Number(id), index + 1, `id out of sequence at position ${index}`);
    assert.equal(Number(dataLine), index + 1, `data-line out of sequence at position ${index}`);
  });
  const gutters = [...html.matchAll(/<span class="no">(\d+)<\/span>/g)].map(m => Number(m[1]));
  assert.deepEqual(gutters, ids.map((_, i) => i + 1), 'the displayed number must match the true line');
});

test('overview rows carry the exact line sequence', () => {
  const doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
  const rows = [...renderOverviewHtml(doc).matchAll(/data-line="(\d+)"/g)].map(m => Number(m[1]));
  assert.deepEqual(rows, doc.lines.map((_, i) => i + 1));
});
