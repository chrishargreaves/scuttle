import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadN3, fixture, FIXTURES } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';

before(() => loadN3());

const BOOKMARK = 'marple2_goal_bookmark_provenance.ttl';
const KB = 'http://example.org/kb/';
const CORE = 'https://ontology.unifiedcyberontology.org/uco/core/';
const OBS = 'https://ontology.unifiedcyberontology.org/uco/observable/';
const FILE_IRI = KB + 'file-sample_disk-e01-1129c48b-af8b-591d-8e31-ddcf943fe6b3';
const FILE_FACET = KB + 'file-facet-11a71b5f-89fa-5e3e-b4f0-1f5ba4dbacb8';
const CONTENT_FACET = KB + 'content-data-facet-909474a8-5500-5a3e-9730-51f16b5e1b5a';

test('every fixture loads without a parse error', () => {
  for (const f of FIXTURES) {
    const doc = loadDocument(fixture(f));
    assert.equal(doc.parseError, null, `${f}: ${doc.parseError?.message}`);
    assert.ok(doc.quads.length > 0, `${f} produced no quads`);
  }
});

test('a file using blank nodes and collections still yields a graph', () => {
  const doc = loadDocument(fixture('solveit-aware-tool-examples.ttl'));
  assert.equal(doc.parseError, null);
  assert.ok(doc.quads.some(q => q.subject.termType === 'BlankNode'),
    'expected blank-node subjects in this fixture');
});

test('prefixes are collected from the directive tokens', () => {
  const doc = loadDocument(fixture(BOOKMARK));
  assert.equal(doc.prefixes.kb, KB);
  assert.equal(doc.prefixes['uco-core'], CORE);
});

test('a statement block spans its first and last source line', () => {
  const doc = loadDocument(fixture(BOOKMARK));
  const node = doc.nodes.get(FILE_IRI);
  assert.ok(node, 'File subject not indexed');
  assert.equal(node.startLine, 53);
  assert.equal(node.endLine, 56);
});

test('token spans reconstruct the exact source substring', () => {
  const text = fixture(BOOKMARK);
  const doc = loadDocument(text);
  let checked = 0;
  for (const t of doc.tokens) {
    if (t.type === 'eof' || t.line < 1) continue;
    const line = doc.lines[t.line - 1];
    const slice = line.slice(t.start, t.end);
    assert.equal(slice.length, t.end - t.start, `span off the end of line ${t.line}`);
    if (t.type === 'prefixed') assert.ok(slice.includes(':'), `bad prefixed slice: ${slice}`);
    checked++;
  }
  assert.ok(checked > 300, `expected to check many tokens, checked ${checked}`);
});

test('a prefixed name and the same IRI written in full are one node', () => {
  const doc = loadDocument(
    '@prefix ex: <http://example.org/> .\n' +
    'ex:a <http://example.org/p> <http://example.org/b> .\n' +
    '<http://example.org/b> <http://example.org/p> ex:a .\n'
  );
  assert.equal(doc.parseError, null);
  assert.ok(doc.nodes.has('http://example.org/a'));
  assert.ok(doc.nodes.has('http://example.org/b'));
  const occ = doc.occurrences.get('http://example.org/a');
  assert.equal(occ.length, 2, 'both the prefixed and full form should be occurrences of one node');
});

test('facet ownership links a File to every facet it declares', () => {
  const doc = loadDocument(fixture(BOOKMARK));
  const facets = doc.facetsOf.get(FILE_IRI) ?? [];
  assert.deepEqual([...facets].sort(), [CONTENT_FACET, FILE_FACET].sort());
});

test('the referenced-by index names the referring predicate', () => {
  const doc = loadDocument(fixture(BOOKMARK));
  const refs = doc.referencedBy.get(FILE_FACET) ?? [];
  assert.ok(
    refs.some(r => r.from === FILE_IRI && r.predicate === CORE + 'hasFacet'),
    'facet should be referenced by its owning File via hasFacet'
  );
});

test('an identifier referenced but never declared is listed as undeclared', () => {
  const doc = loadDocument(
    '@prefix ex: <http://example.org/> .\n' +
    'ex:a ex:points ex:ghost .\n'
  );
  assert.ok(doc.undeclared.includes('http://example.org/ghost'));
  assert.ok(!doc.undeclared.includes('http://example.org/a'), 'a declared subject is not undeclared');
  assert.ok(!doc.undeclared.includes('http://example.org/points'), 'a predicate is not an undeclared node');
});

test('a syntax error is reported rather than thrown', () => {
  const doc = loadDocument('@prefix ex: <http://example.org/> .\nex:a ex:b ;;; .\n');
  assert.ok(doc.parseError, 'expected a parse error to be captured');
  assert.equal(typeof doc.parseError.message, 'string');
});

test('every fixture indexes each declared subject exactly once', () => {
  for (const f of FIXTURES) {
    const doc = loadDocument(fixture(f));
    const subjects = new Set(doc.quads.filter(q => q.subject.termType === 'NamedNode').map(q => q.subject.value));
    for (const s of subjects) assert.ok(doc.nodes.has(s), `${f}: subject ${s} missing from the node index`);
  }
});

test('an ontology term used as an object value is not called undeclared', () => {
  // A neutral predicate, so this exercises term recognition rather than the
  // external-reference predicate list.
  const text =
    '@prefix ex: <http://example.org/> .\n' +
    'ex:a ex:constrainedBy ex:SomeClass .\n' +
    'ex:a ex:points ex:ghost .\n';
  const known = new Set(['http://example.org/SomeClass']);

  const naive = loadDocument(text);
  assert.ok(naive.undeclared.includes('http://example.org/SomeClass'),
    'without term knowledge the class looks undeclared');

  const informed = loadDocument(text, { isKnownTerm: iri => known.has(iri) });
  assert.ok(!informed.undeclared.includes('http://example.org/SomeClass'),
    'a recognised ontology term must not be reported as an undeclared identifier');
  assert.ok(informed.undeclared.includes('http://example.org/ghost'),
    'a genuinely undeclared instance must still be reported');
});

test('a document reference is not reported as an undeclared identifier', () => {
  const doc = loadDocument(
    '@prefix ex: <http://example.org/> .\n' +
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n' +
    'ex:a rdfs:isDefinedBy <https://example.org/catalogue.ttl> .\n' +
    'ex:a ex:points ex:ghost .\n'
  );
  assert.ok(!doc.undeclared.includes('https://example.org/catalogue.ttl'),
    'isDefinedBy points at a document, not at a node this file should declare');
  assert.ok(doc.undeclared.includes('http://example.org/ghost'));
});

// --- Findings from code review: valid Turtle the two-pass correlation mishandled ---

test('a relative IRI is resolved against the in-scope @base', () => {
  const doc = loadDocument('@base <http://example.org/> .\n<alice> <http://x/p> <bob> .\n');
  assert.equal(doc.parseError, null);
  const subject = doc.quads[0].subject.value;
  assert.equal(subject, 'http://example.org/alice');
  const node = doc.nodes.get(subject);
  assert.ok(node, 'the parser IRI must be the node-index key');
  assert.ok(node.startLine, 'the resolved node must carry a source position');
  assert.ok(!doc.nodes.has('alice'), 'the unresolved form must not appear as a second node');
});

test('SPARQL-style BASE is honoured too', () => {
  const doc = loadDocument('BASE <http://example.org/>\n<alice> <http://x/p> <bob> .\n');
  assert.equal(doc.parseError, null);
  assert.ok(doc.nodes.has('http://example.org/alice'));
});

test('a dot-less SPARQL PREFIX does not swallow the next statement', () => {
  const doc = loadDocument('PREFIX ex: <http://example.org/>\nex:a ex:p ex:o .\nex:b ex:p ex:o2 .\n');
  assert.equal(doc.parseError, null);
  assert.equal(doc.quads.length, 2);
  for (const quad of doc.quads) {
    const node = doc.nodes.get(quad.subject.value);
    assert.ok(node?.startLine, `${quad.subject.value} has no source position`);
  }
});

test('a prefix redefined mid-document resolves positionally', () => {
  const doc = loadDocument(
    '@prefix ex: <http://first.example/> .\n' +
    'ex:a ex:p ex:o .\n' +
    '@prefix ex: <http://second.example/> .\n' +
    'ex:a ex:p ex:o .\n'
  );
  assert.ok(doc.nodes.has('http://first.example/a'), 'the first binding must apply above the redefinition');
  assert.ok(doc.nodes.has('http://second.example/a'), 'the second binding must apply below it');
});

test('an undeclared prefix colliding with Object.prototype does not fabricate an IRI', () => {
  const doc = loadDocument('@prefix ex: <http://example.org/> .\nex:a ex:p constructor:boom .\n');
  for (const key of doc.occurrences.keys()) {
    assert.ok(!/function |\[native code\]/.test(key), `fabricated identifier in the index: ${key}`);
  }
  for (const key of doc.nodes.keys()) {
    assert.ok(!/function |\[native code\]/.test(key), `fabricated identifier as a node: ${key}`);
  }
});

test('a facet attached through a blank node is still owned by its object', () => {
  const doc = loadDocument(
    '@prefix uco-core: <https://ontology.unifiedcyberontology.org/uco/core/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix kb: <http://example.org/kb/> .\n' +
    'kb:f a uco-observable:File ;\n' +
    '    uco-core:hasFacet [ a uco-observable:FileFacet ; uco-observable:fileName "secret.txt" ] .\n'
  );
  assert.equal(doc.parseError, null);
  const facets = doc.facetsOf.get('http://example.org/kb/f') ?? [];
  assert.equal(facets.length, 1, 'the blank-node facet must be recorded as owned');
  const facetNode = doc.nodes.get(facets[0]);
  assert.ok(facetNode, 'the blank-node facet must have a node-index entry');
  assert.ok(
    facetNode.quads.some(q => q.predicate.value.endsWith('fileName')),
    'the facet node must carry its own quads'
  );
});

test('the real blank-node fixture records facet ownership', () => {
  const doc = loadDocument(fixture('solveit-aware-tool-examples.ttl'));
  assert.ok(doc.facetsOf.size > 0, 'this fixture writes facets as blank nodes; ownership must be recorded');
});

test('a collection member is not recorded as a predicate', () => {
  const doc = loadDocument('@prefix ex: <http://example.org/> .\nex:a ex:list ( ex:m1 ex:m2 ) .\n');
  const member = 'http://example.org/m1';
  assert.ok(!doc.predicates.has(member), 'a list member is a value, not a predicate');
  const roles = (doc.occurrences.get(member) ?? []).map(o => o.role);
  assert.ok(roles.includes('object'), `expected an object role, got ${JSON.stringify(roles)}`);
});
