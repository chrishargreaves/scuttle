import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { loadN3, fixture } from './helpers/n3.mjs';
import { loadDocument } from '../src/model/document.js';
import { resolveNode } from '../src/model/resolve.js';
import { renderResolvedHtml, renderTermHtml } from '../src/ui/resolved-view.js';
import { renderReportHtml, reportButtonLabel } from '../src/ui/report-panel.js';
import { composeReport } from '../src/model/report.js';

const KB = 'http://example.org/kb/';
const FILE_IRI = KB + 'file-sample_disk-e01-1129c48b-af8b-591d-8e31-ddcf943fe6b3';

let doc;
before(() => {
  loadN3();
  doc = loadDocument(fixture('marple2_goal_bookmark_provenance.ttl'));
});

test('edges drill in place and only the footer moves the source pane', () => {
  const html = renderResolvedHtml({ resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI] });
  assert.ok(html.includes('data-go='), 'edges should be present');
  const jumps = html.match(/data-jump=/g) ?? [];
  assert.equal(jumps.length, 1, 'exactly one control may move the source pane');
  const footer = html.slice(html.indexOf('<div class="ft">'));
  assert.ok(footer.includes('data-jump='), 'that control must live in the footer');
});

test('facet-derived rows are badged', () => {
  const html = renderResolvedHtml({ resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI] });
  assert.ok(html.includes('<span class="badge">facet</span>'));
  assert.ok(html.includes('fileName'), 'the ingested facet property should be shown');
});

test('the raw mode shows the declaration and each facet verbatim', () => {
  const html = renderResolvedHtml({ resolved: resolveNode(doc, FILE_IRI), doc, format: 'raw', trail: [FILE_IRI] });
  assert.ok(html.includes('a uco-observable:File'));
  assert.ok(html.includes('Facet —'), 'facet slices should be labelled');
  assert.ok(!html.includes('<span class="badge">facet</span>'), 'raw mode shows source, not field rows');
});

test('the back control appears only when there is somewhere to go back to', () => {
  const one = renderResolvedHtml({ resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI], canGoBack: false });
  assert.ok(!one.includes('data-back='));
  const two = renderResolvedHtml({ resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI, FILE_IRI], canGoBack: true });
  assert.ok(two.includes('data-back='));
});

test('an undeclared node renders its state rather than an empty shell', () => {
  const html = renderResolvedHtml({ resolved: resolveNode(doc, KB + 'nope'), doc, trail: [KB + 'nope'] });
  assert.match(html, /never declared here/);
});

test('a term popover offers its definition and an external link', () => {
  const html = renderTermHtml({
    iri: 'https://ontology.unifiedcyberontology.org/uco/observable/File',
    kind: 'class', label: 'File', definition: 'A file is a computer resource.',
    docUrl: 'https://ontology.unifiedcyberontology.org/documentation/class-observablefile.html',
    resolved: true,
  });
  assert.match(html, /A file is a computer resource\./);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
});

test('an unresolved term says so instead of showing an empty definition', () => {
  const html = renderTermHtml({ iri: 'http://www.w3.org/ns/shacl#Info', kind: 'class', label: 'Info', definition: null, docUrl: null, resolved: false });
  assert.match(html, /No definition in the bundled index/);
});

test('the report panel states the assumption and the count agrees with it', () => {
  const report = composeReport({
    doc,
    indexMeta: { assumedCaseUcoVersion: '1.5.0', generated: '2026-08-20', sources: [{ name: 'UCO', version: '1.5.0' }] },
    unresolvedTerms: ['http://example.org/x'],
  });
  const html = renderReportHtml(report);
  assert.match(html, /does not declare a version/);
  assert.match(html, /CASE\/UCO 1\.5\.0/);
  assert.equal(reportButtonLabel(report), 'Report — 1 unresolved');
});

test('a clean report says so', () => {
  const report = composeReport({ doc, indexMeta: { assumedCaseUcoVersion: '1.5.0', generated: '2026-08-20', sources: [] } });
  assert.match(renderReportHtml(report), /Nothing to report/);
  assert.equal(reportButtonLabel(report), 'Report — clean');
});

test('report text is escaped, so a hostile identifier cannot inject markup', () => {
  const report = composeReport({
    doc, indexMeta: { assumedCaseUcoVersion: '1.5.0', generated: '2026-08-20', sources: [] },
    unresolvedTerms: ['<img src=x onerror=alert(1)>'],
  });
  const html = renderReportHtml(report);
  assert.ok(!html.includes('<img'), 'markup in an identifier must not reach the page');
  assert.ok(html.includes('&lt;img'));
});

const OBS = 'https://ontology.unifiedcyberontology.org/uco/observable/';

function techniqueFixture(overrides = {}) {
  return {
    iri: 'https://ontology.solveit-df.org/solveit/data/techniqueDFT-1137',
    resolved: true,
    id: 'DFT-1137',
    name: 'Extract browser history artifacts',
    description: 'The examination of the history component of a web browser.',
    details: 'Typically SQLite tables.',
    synonyms: [], examples: [],
    inputClasses: [OBS + 'BrowserAppFiles'],
    outputClasses: [OBS + 'URLHistory'],
    weaknesses: ['https://ontology.solveit-df.org/solveit/data/weaknessDFW-1108'],
    link: 'https://ontology.solveit-df.org/solveit/data/techniqueDFT-1137',
    ...overrides,
  };
}

test('a resolved technique renders its record with inputs and outputs not swapped', () => {
  const html = renderResolvedHtml({
    resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI], technique: techniqueFixture(),
  });
  assert.match(html, /DFT-1137/);
  assert.match(html, /Extract browser history artifacts/);
  assert.match(html, /history component of a web browser/);

  const inputs = html.indexOf('declared inputs');
  const outputs = html.indexOf('declared outputs');
  assert.ok(inputs > -1 && outputs > -1, 'both class lists must be labelled');
  assert.ok(inputs < outputs, 'inputs are listed before outputs');
  assert.ok(
    html.slice(inputs, outputs).includes('BrowserAppFiles'),
    'the input class must appear under inputs, not outputs'
  );
  assert.ok(html.slice(outputs).includes('URLHistory'), 'the output class must appear under outputs');
  assert.match(html, /potential weaknesses/);
});

test('an unresolved technique says so rather than rendering an empty panel', () => {
  const html = renderResolvedHtml({
    resolved: resolveNode(doc, FILE_IRI), doc, trail: [FILE_IRI],
    technique: techniqueFixture({ resolved: false, name: null, description: null, outputClasses: [], inputClasses: [] }),
  });
  assert.match(html, /Not resolved from the SOLVE-IT knowledge base/);
  assert.match(html, /DFT-1137/, 'the catalogue id is still readable from the IRI');
});
