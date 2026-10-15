import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadN3, fixture } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';
import { makeTermLookup } from '../src/model/ontology.js';
import { composeReport } from '../src/model/report.js';

const index = JSON.parse(
  readFileSync(new URL('../src/generated/ontology-index.json', import.meta.url), 'utf8')
);
const UCO_OBS = 'https://ontology.unifiedcyberontology.org/uco/observable/';

before(() => loadN3());

function reportFor(text, extra = {}) {
  const lookup = makeTermLookup(index);
  const doc = loadDocument(text, { isKnownTerm: lookup.isKnown });
  // The page looks a term up for every predicate and type it renders; do the same here.
  for (const iri of [...doc.predicates, ...doc.typeObjects]) lookup.get(iri);
  return composeReport({
    doc,
    indexMeta: index.meta,
    unresolvedTerms: lookup.unresolved(),
    solveitFindings: [],
    solveitStatus: { failure: null },
    ...extra,
  });
}

test('a clean export reports the assumed version and nothing else', () => {
  const report = reportFor(fixture('marple2_goal_bookmark_provenance.ttl'));
  assert.equal(report.assumedVersion, '1.5.0');
  assert.ok(report.indexGenerated, 'the report should state when the index was built');
  assert.equal(report.count, 0, `unexpected findings: ${JSON.stringify(report.groups)}`);
  assert.equal(report.clean, true);
});

test('an undeclared identifier becomes a finding', () => {
  const report = reportFor(
    '@prefix ex: <http://example.org/> .\nex:a ex:points ex:ghost .\n'
  );
  const group = report.groups.find(g => g.key === 'undeclared');
  assert.ok(group, 'expected an undeclared group');
  assert.ok(group.items.some(i => i.includes('ghost')));
  assert.equal(report.clean, false);
});

test('a term missing from the bundled index becomes a finding', () => {
  const report = reportFor(
    '@prefix sh: <http://www.w3.org/ns/shacl#> .\n' +
    '@prefix ex: <http://example.org/> .\n' +
    'ex:a sh:severity sh:Info .\n'
  );
  const group = report.groups.find(g => g.key === 'unresolved-terms');
  assert.ok(group, 'expected an unresolved-terms group');
  assert.ok(group.items.some(i => i.includes('shacl#severity')));
});

test('an unreachable knowledge base becomes a finding', () => {
  const report = reportFor('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n', {
    solveitStatus: { failure: 'https://data.solveit-df.org/solve-it.ttl could not be reached: offline' },
  });
  const group = report.groups.find(g => g.key === 'solveit');
  assert.ok(group);
  assert.ok(group.items.some(i => /offline/.test(i)));
});

test('an output-class disagreement names both classes', () => {
  const report = reportFor('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n', {
    solveitFindings: [{
      action: 'http://example.org/kb/act',
      techniqueId: 'DFT-1137',
      result: 'http://example.org/kb/out',
      actualClass: UCO_OBS + 'EmailMessage',
      declaredClasses: [UCO_OBS + 'URLHistory'],
    }],
  });
  const group = report.groups.find(g => g.key === 'technique-outputs');
  assert.ok(group);
  const item = group.items.join(' ');
  assert.match(item, /DFT-1137/);
  assert.match(item, /EmailMessage/);
  assert.match(item, /URLHistory/);
});

test('a parse error becomes a finding rather than an empty report', () => {
  const report = reportFor('@prefix ex: <http://example.org/> .\nex:a ex:b ;;; .\n');
  const group = report.groups.find(g => g.key === 'parse');
  assert.ok(group, 'a file that does not parse must say so');
  assert.equal(report.clean, false);
});

test('the report is plain data and its count matches its items', () => {
  const report = reportFor(
    '@prefix ex: <http://example.org/> .\nex:a ex:points ex:ghost .\nex:a ex:also ex:phantom .\n'
  );
  assert.equal(JSON.parse(JSON.stringify(report)).count, report.count,
    'the report must survive a round trip through JSON, so it is data not DOM');
  const total = report.groups.reduce((n, g) => n + g.items.length, 0);
  assert.equal(report.count, total);
});

test('every marple2 export is clean', () => {
  for (const name of ['marple2_goal_whole_case.ttl', 'marple2_goal_derivation_chain.ttl']) {
    const report = reportFor(fixture(name));
    assert.equal(report.count, 0, `${name}: ${JSON.stringify(report.groups)}`);
  }
});

test('techniques the knowledge base could not account for reach the report', () => {
  const report = reportFor('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n', {
    unresolvedTechniques: ['DFT-9999'],
  });
  const group = report.groups.find(g => g.key === 'unresolved-techniques');
  assert.ok(group, 'an unaccounted-for technique must be reported');
  assert.ok(group.items.includes('DFT-9999'));
  assert.equal(report.clean, false);
});

test('a value-case finding names the property and says nothing carries it', () => {
  const report = reportFor('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n', {
    solveitFindings: [{
      action: 'http://example.org/kb/act',
      techniqueId: 'DFT-1167',
      result: 'http://example.org/kb/out',
      actualClass: UCO_OBS + 'URLHistory',
      declaredClasses: [UCO_OBS + 'keywordSearchTerm'],
      declaredProperties: [UCO_OBS + 'keywordSearchTerm'],
      valueCase: true,
    }],
  });
  const group = report.groups.find(g => g.key === 'technique-outputs');
  assert.ok(group);
  const item = group.items.join(' ');
  assert.match(item, /DFT-1167/);
  assert.match(item, /the property keywordSearchTerm/);
  assert.match(item, /value case/);
  assert.match(item, /nothing reachable from the result carries it/);
});
