import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadN3, fixture } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';
import { createSolveItResolver } from '../src/model/solveit.js';

const DFT_1137 = 'https://ontology.solveit-df.org/solveit/data/techniqueDFT-1137';
const URL_HISTORY = 'https://ontology.unifiedcyberontology.org/uco/observable/URLHistory';

before(() => loadN3());

// Serves the offline knowledge-base extract and counts how often it is asked for it.
function stubFetch(body = fixture('solveit-kb-subset.ttl')) {
  const calls = { count: 0 };
  const fetchImpl = async () => {
    calls.count++;
    return { ok: true, status: 200, text: async () => body };
  };
  return { fetchImpl, calls };
}

test('a technique stub resolves to its record', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const technique = await resolver.resolveTechnique(DFT_1137);

  assert.equal(technique.resolved, true);
  assert.equal(technique.id, 'DFT-1137');
  assert.equal(technique.name, 'Extract browser history artifacts');
  assert.match(technique.description, /history component/i);
  assert.ok(technique.outputClasses.includes(URL_HISTORY),
    'DFT-1137 declares URLHistory among its outputs');
  assert.ok(technique.inputClasses.length > 0);
});

test('the knowledge base is fetched at most once across several resolutions', async () => {
  const { fetchImpl, calls } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  await resolver.resolveTechnique(DFT_1137);
  await resolver.resolveTechnique(DFT_1137);
  await resolver.resolveTechnique('https://ontology.solveit-df.org/solveit/data/techniqueDFT-1069');
  assert.equal(calls.count, 1);
});

test('an unreachable knowledge base yields the stub state and a report entry', async () => {
  const resolver = createSolveItResolver({ fetchImpl: async () => { throw new Error('offline'); } });
  const technique = await resolver.resolveTechnique(DFT_1137);

  assert.equal(technique.resolved, false);
  assert.equal(technique.id, 'DFT-1137', 'the id is still readable from the IRI');
  assert.ok(technique.link, 'a link to SOLVE-IT must still be offered');
  assert.ok(resolver.status().failure, 'the failure must be recorded for the report');
});

test('a non-ok response is a failure, not a silent empty result', async () => {
  const resolver = createSolveItResolver({
    fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }),
  });
  const technique = await resolver.resolveTechnique(DFT_1137);
  assert.equal(technique.resolved, false);
  assert.match(resolver.status().failure, /503/);
});

test('a technique the knowledge base does not contain is unresolved, not a crash', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const technique = await resolver.resolveTechnique(
    'https://ontology.solveit-df.org/solveit/data/techniqueDFT-9999'
  );
  assert.equal(technique.resolved, false);
  assert.equal(technique.id, 'DFT-9999');
  assert.equal(resolver.status().failure, null, 'a missing record is not a fetch failure');
});

test('an action whose result matches a declared output raises no disagreement', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
  const findings = await resolver.checkOutputClasses(doc);
  assert.deepEqual(findings, [], `unexpected disagreement: ${JSON.stringify(findings)}`);
});

test('an action whose result is not a declared output is reported with both classes', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-1137 ;\n' +
    '    uco-action:result kb:out .\n' +
    'kb:out a uco-observable:EmailMessage .\n'
  );
  const findings = await resolver.checkOutputClasses(doc);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].techniqueId, 'DFT-1137');
  assert.ok(findings[0].actualClass.endsWith('EmailMessage'));
  assert.ok(findings[0].declaredClasses.includes(URL_HISTORY));
});

test('no check is attempted when the document names no technique', async () => {
  const { fetchImpl, calls } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument('@prefix ex: <http://example.org/> .\nex:a ex:b ex:c .\n');
  assert.deepEqual(await resolver.checkOutputClasses(doc), []);
  assert.equal(calls.count, 0, 'the knowledge base should not be fetched with nothing to check');
});

test('a knowledge base that never responds is reported, not waited on forever', async () => {
  const resolver = createSolveItResolver({
    timeoutMs: 50,
    fetchImpl: (url, options) => new Promise((resolve, reject) => {
      options?.signal?.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    }),
  });
  const technique = await resolver.resolveTechnique(DFT_1137);
  assert.equal(technique.resolved, false);
  assert.match(resolver.status().failure, /did not respond within/);
});

test('a knowledge base with no technique records is a failure, not a clean result', async () => {
  // The tool exists to say what it could not verify. A 200 carrying nothing verifiable
  // must not read as "checked, all fine".
  const empty = '@prefix ex: <http://example.org/> .\nex:nothing ex:here ex:atall .\n';
  const resolver = createSolveItResolver({ fetchImpl: async () => ({ ok: true, status: 200, text: async () => empty }) });
  const doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
  const findings = await resolver.checkOutputClasses(doc);
  assert.deepEqual(findings, []);
  assert.ok(resolver.status().failure, 'an empty knowledge base must be recorded as a failure');
  assert.match(resolver.status().failure, /no SOLVE-IT technique records/);
});

test('techniques the knowledge base could not account for are reported', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-9999 ;\n' +
    '    uco-action:result kb:out .\n' +
    'kb:out a uco-observable:URLHistory .\n'
  );
  await resolver.checkOutputClasses(doc);
  assert.deepEqual(resolver.unresolvedTechniques(), ['DFT-9999'],
    'a technique the knowledge base does not carry must be surfaced, not silently skipped');
});

// SOLVE-IT 0.2.2 admits a PROPERTY in hasCASEOutputClass: the technique yields a value,
// and the file chooses the carrier object. DFT-1167 (keywordSearchTerm) is the shipped
// case; marple2 emits a URLHistory whose entry carries the term.
test('a declared property carried beneath the result raises no disagreement', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-core: <https://ontology.unifiedcyberontology.org/uco/core/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-1167 ;\n' +
    '    uco-action:result kb:out .\n' +
    'kb:out a uco-observable:URLHistory ;\n' +
    '    uco-core:hasFacet kb:facet .\n' +
    'kb:facet a uco-observable:URLHistoryFacet ;\n' +
    '    uco-observable:urlHistoryEntry kb:entry .\n' +
    'kb:entry a uco-observable:URLHistoryEntry ;\n' +
    '    uco-observable:keywordSearchTerm "example search terms" .\n'
  );
  const findings = await resolver.checkOutputClasses(doc);
  assert.deepEqual(findings, [], `the value case must not read as a disagreement: ${JSON.stringify(findings)}`);
});

test('a declared property nowhere beneath the result is one value-case finding', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-1167 ;\n' +
    '    uco-action:result kb:out .\n' +
    'kb:out a uco-observable:URLHistory .\n'
  );
  const findings = await resolver.checkOutputClasses(doc);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].valueCase, true);
  assert.ok(findings[0].declaredProperties.some(p => p.endsWith('keywordSearchTerm')));
});

test('one verdict per action and technique, satisfied by any result', async () => {
  // marple2 records a route step's own parsed output beside the finding it also
  // yielded; the finding carries the declared property, so the declaration holds and
  // nothing is reported -- not once per result arc.
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-core: <https://ontology.unifiedcyberontology.org/uco/core/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-1167 ;\n' +
    '    uco-action:result kb:parsed, kb:finding .\n' +
    'kb:parsed a uco-observable:URLHistory .\n' +
    'kb:finding a uco-observable:URLHistory ;\n' +
    '    uco-core:hasFacet kb:facet .\n' +
    'kb:facet a uco-observable:URLHistoryFacet ;\n' +
    '    uco-observable:urlHistoryEntry kb:entry .\n' +
    'kb:entry a uco-observable:URLHistoryEntry ;\n' +
    '    uco-observable:keywordSearchTerm "granite" .\n'
  );
  const findings = await resolver.checkOutputClasses(doc);
  assert.deepEqual(findings, [], `expected no findings, got ${JSON.stringify(findings)}`);
});

test('an unsatisfied technique is reported once, not once per result', async () => {
  const { fetchImpl } = stubFetch();
  const resolver = createSolveItResolver({ fetchImpl });
  const doc = loadDocument(
    '@prefix kb: <http://example.org/kb/> .\n' +
    '@prefix uco-action: <https://ontology.unifiedcyberontology.org/uco/action/> .\n' +
    '@prefix uco-observable: <https://ontology.unifiedcyberontology.org/uco/observable/> .\n' +
    '@prefix solveit-data: <https://ontology.solveit-df.org/solveit/data/> .\n' +
    'kb:act a solveit-data:techniqueDFT-1137 ;\n' +
    '    uco-action:result kb:one, kb:two .\n' +
    'kb:one a uco-observable:EmailMessage .\n' +
    'kb:two a uco-observable:EmailMessage .\n'
  );
  const findings = await resolver.checkOutputClasses(doc);
  assert.equal(findings.length, 1);
});
