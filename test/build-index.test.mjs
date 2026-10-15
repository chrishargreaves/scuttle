import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadN3, fixture } from './helpers/n3.mjs';
import { BUILTINS } from '../tools/rdf-builtins.js';

const index = JSON.parse(
  readFileSync(new URL('../src/generated/ontology-index.json', import.meta.url), 'utf8')
);

const UCO_OBS = 'https://ontology.unifiedcyberontology.org/uco/observable/';
const UCO_CORE = 'https://ontology.unifiedcyberontology.org/uco/core/';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

// The three marple2 exports are the primary target; the SHACL example file is
// deliberately excluded here and covered by its own test below.
const MARPLE_FIXTURES = [
  'marple2_goal_bookmark_provenance.ttl',
  'marple2_goal_whole_case.ttl',
  'marple2_goal_derivation_chain.ttl',
];

before(() => loadN3());

test('the index records its sources, versions and generation date', () => {
  assert.match(index.meta.generated, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(index.meta.assumedCaseUcoVersion, '1.5.0');
  const names = index.meta.sources.map(s => s.name);
  assert.ok(names.includes('UCO') && names.includes('CASE') && names.includes('solve-it-ontology'));
  assert.ok(index.meta.termCount > 1000, `only ${index.meta.termCount} terms`);
});

test('a known class resolves to its definition', () => {
  const entry = index.terms[UCO_OBS + 'File'];
  assert.equal(entry.k, 'class');
  assert.match(entry.d, /file/i);
});

test('a known property resolves to its definition', () => {
  const entry = index.terms[UCO_CORE + 'hasFacet'];
  assert.equal(entry.k, 'property');
  assert.ok(entry.d.length > 20, 'expected real definition text');
});

test('every RDF stack builtin is present', () => {
  for (const iri of Object.keys(BUILTINS)) {
    assert.ok(index.terms[iri], `builtin missing from the index: ${iri}`);
    assert.ok(index.terms[iri].k, `builtin has no kind: ${iri}`);
  }
});

test('every predicate and type in the marple2 exports resolves', () => {
  const { Parser } = globalThis.N3;
  for (const name of MARPLE_FIXTURES) {
    const used = new Set();
    for (const quad of new Parser().parse(fixture(name))) {
      if (quad.predicate.value.startsWith('http')) used.add(quad.predicate.value);
      if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
        used.add(quad.object.value);
      }
    }
    const missing = [...used].filter(iri => !index.terms[iri]);
    assert.deepEqual(missing, [], `${name} has unresolved terms: ${missing.join(', ')}`);
  }
});

test('terms from outside the bundled ontologies are absent rather than invented', () => {
  // This file uses a superseded SOLVE-IT namespace and SHACL, neither of which the
  // bundled index covers. The viewer must report them, not silently resolve them.
  assert.equal(index.terms['https://solve-it.df/ontology/PerformedTechnique'], undefined);
  assert.equal(index.terms['http://www.w3.org/ns/shacl#NodeShape'], undefined);
});
