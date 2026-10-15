import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadN3, fixture } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';
import { resolveNode, labelFor } from '../src/model/resolve.js';

const KB = 'http://example.org/kb/';
const OBS = 'https://ontology.unifiedcyberontology.org/uco/observable/';
const CORE = 'https://ontology.unifiedcyberontology.org/uco/core/';
const FILE_IRI = KB + 'file-sample_disk-e01-1129c48b-af8b-591d-8e31-ddcf943fe6b3';
const FILE_FACET = KB + 'file-facet-11a71b5f-89fa-5e3e-b4f0-1f5ba4dbacb8';

let doc;
before(() => {
  loadN3();
  doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
});

test('a File carries its facet properties, marked as facet-derived', () => {
  const node = resolveNode(doc, FILE_IRI);
  const byPredicate = Object.fromEntries(node.properties.map(p => [p.predicate, p]));

  for (const name of ['fileName', 'filePath', 'sizeInBytes']) {
    const prop = byPredicate[OBS + name];
    assert.ok(prop, `${name} missing from the resolved File`);
    assert.equal(prop.facet, true, `${name} should be marked facet-derived`);
    assert.ok(prop.facetIri, `${name} should name the facet it came from`);
  }
  const description = byPredicate[CORE + 'description'];
  assert.ok(description, 'the File own property is missing');
  assert.equal(description.facet, false, 'an own property must not be marked facet-derived');
});

test('hasFacet itself is not presented as a property', () => {
  const node = resolveNode(doc, FILE_IRI);
  assert.ok(!node.properties.some(p => p.predicate === CORE + 'hasFacet'),
    'the indirection the resolved view removes must not reappear as a row');
});

test('a facet lists the object that owns it under referenced-by', () => {
  const node = resolveNode(doc, FILE_FACET);
  assert.ok(node.referencedBy.some(r => r.from === FILE_IRI && r.predicate === CORE + 'hasFacet'));
});

test('node values are distinguishable from literal values', () => {
  const action = [...doc.nodes.keys()].find(k => k.includes('bookmark-action'));
  const node = resolveNode(doc, action);
  const result = node.properties.find(p => p.predicate.endsWith('/result'));
  assert.equal(result.kind, 'node', 'an edge to another object must be a node value');
  assert.ok(doc.nodes.has(result.value), 'the edge target should be a declared node');

  const name = node.properties.find(p => p.predicate === CORE + 'name');
  assert.equal(name.kind, 'literal');
});

test('an undeclared identifier resolves to an explicit undeclared state', () => {
  const node = resolveNode(doc, KB + 'does-not-exist');
  assert.equal(node.declared, false);
  assert.deepEqual(node.properties, []);
  assert.equal(node.iri, KB + 'does-not-exist');
});

test('the raw projection returns the declaration and every owned facet', () => {
  const node = resolveNode(doc, FILE_IRI);
  assert.ok(node.raw.length >= 3, `expected declaration plus two facets, got ${node.raw.length}`);
  assert.match(node.raw[0].text, /a uco-observable:File/);
  assert.ok(node.raw.slice(1).some(r => /uco-observable:fileName/.test(r.text)),
    'a facet slice should carry the facet body verbatim');
  assert.ok(node.raw.slice(1).every(r => r.facet), 'facet slices should be marked as such');
});

test('the raw projection is the exact source text, not a re-serialisation', () => {
  const node = resolveNode(doc, FILE_IRI);
  assert.ok(doc.text.includes(node.raw[0].text), 'declaration slice must appear verbatim in the file');
});

test('labels prefer a name over a bare type', () => {
  const finding = KB + 'bookmark-finding-a6114c5f-7ba3-5238-9315-794ff5a2a5a2';
  assert.match(labelFor(doc, finding), /Web search: example search terms/);
  assert.match(labelFor(doc, FILE_FACET), /FileFacet/);
});
