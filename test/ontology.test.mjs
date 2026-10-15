import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { documentationUrl, lookupTerm, makeTermLookup } from '../src/model/ontology.js';

const index = JSON.parse(
  readFileSync(new URL('../src/generated/ontology-index.json', import.meta.url), 'utf8')
);
const UCO = 'https://ontology.unifiedcyberontology.org';
const CASE = 'https://ontology.caseontology.org';

test('a UCO class derives its class documentation page', () => {
  assert.equal(
    documentationUrl(`${UCO}/uco/observable/File`, 'class'),
    `${UCO}/documentation/class-observablefile.html`
  );
});

test('a UCO property derives its property documentation page', () => {
  assert.equal(
    documentationUrl(`${UCO}/uco/core/hasFacet`, 'property'),
    `${UCO}/documentation/prop-corehasfacet.html`
  );
  assert.equal(
    documentationUrl(`${UCO}/uco/action/instrument`, 'property'),
    `${UCO}/documentation/prop-actioninstrument.html`
  );
});

test('a CASE term derives against the CASE host', () => {
  assert.equal(
    documentationUrl(`${CASE}/case/investigation/InvestigativeAction`, 'class'),
    `${CASE}/documentation/class-investigationinvestigativeaction.html`
  );
});

test('a SOLVE-IT term links to its own resolvable IRI', () => {
  const iri = 'https://ontology.solveit-df.org/solveit/core/Technique';
  assert.equal(documentationUrl(iri, 'class'), iri);
});

test('an unknown namespace yields no link and does not throw', () => {
  assert.equal(documentationUrl('http://www.w3.org/ns/shacl#NodeShape', 'class'), null);
  assert.equal(documentationUrl('not-an-iri', 'class'), null);
});

test('a known term resolves with its definition and a link', () => {
  const term = lookupTerm(index, `${UCO}/uco/observable/File`);
  assert.equal(term.resolved, true);
  assert.equal(term.kind, 'class');
  assert.ok(term.definition.length > 10);
  assert.equal(term.docUrl, `${UCO}/documentation/class-observablefile.html`);
});

test('a term absent from the index is unresolved but still linkable', () => {
  const term = lookupTerm(index, `${UCO}/uco/observable/NotARealClass`);
  assert.equal(term.resolved, false);
  assert.equal(term.definition, null);
  assert.equal(term.kind, 'class', 'capitalisation should still classify it for the link');
  assert.equal(term.docUrl, `${UCO}/documentation/class-observablenotarealclass.html`);
});

test('a lowercase unknown term is treated as a property', () => {
  const term = lookupTerm(index, `${UCO}/uco/observable/notARealProperty`);
  assert.equal(term.kind, 'property');
  assert.equal(term.resolved, false);
});

test('the lookup helper reports which terms were unresolved', () => {
  const lookup = makeTermLookup(index);
  lookup.get(`${UCO}/uco/observable/File`);
  lookup.get(`${UCO}/uco/observable/NotARealClass`);
  lookup.get(`${UCO}/uco/observable/NotARealClass`);
  assert.deepEqual(lookup.unresolved(), [`${UCO}/uco/observable/NotARealClass`],
    'each unresolved term should be recorded once');
  assert.equal(lookup.isKnown(`${UCO}/uco/observable/File`), true);
  assert.equal(lookup.isKnown(`${UCO}/uco/observable/NotARealClass`), false);
});

test('an inherited Object.prototype key is not treated as a known term', () => {
  const lookup = makeTermLookup({ meta: {}, terms: {} });
  assert.equal(lookup.isKnown('constructor'), false);
  assert.equal(lookup.isKnown('toString'), false);
  assert.equal(lookupTerm({ meta: {}, terms: {} }, 'toString').resolved, false);
});
