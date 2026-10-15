// Wiring. Everything that decides anything lives in the model and render modules; this
// file connects them to the page and owns the one control that is allowed to move the
// source pane.

const els = {
  file: document.getElementById('file'),
  fname: document.getElementById('fname'),
  src: document.getElementById('src'),
  srcwrap: document.getElementById('srcwrap'),
  mini: document.getElementById('mini'),
  miniRows: document.getElementById('miniRows'),
  vp: document.getElementById('vp'),
  side: document.getElementById('side'),
  pop: document.getElementById('pop'),
  segMode: document.getElementById('segMode'),
  segFmt: document.getElementById('segFmt'),
  reportBtn: document.getElementById('reportBtn'),
  reportPanel: document.getElementById('reportPanel'),
  drop: document.getElementById('drop'),
};

const state = {
  doc: null,
  lookup: null,
  report: null,
  mode: 'pop',
  format: 'fmt',
  history: createHistory(),
  term: null,
  anchor: null,
  techniqueFor: {},
  // Incremented per load. A load that awaits the network can be overtaken by a newer
  // one; the stale continuation compares this before writing anything.
  generation: 0,
  // iri -> [element] and line -> element, built once per document so selection does not
  // re-scan the whole pane on every click.
  refsByIri: new Map(),
  rowsByLine: new Map(),
  highlighted: [],
};

// One resolver for the session, so the knowledge base is fetched once rather than once
// per file opened.
const resolver = createSolveItResolver({});

function setEmpty(message) {
  els.src.innerHTML = `<div class="empty">${message}</div>`;
}

// The only function permitted to scroll the source pane. Everything else leaves the
// reader exactly where they were.
function jumpToLine(line) {
  const target = document.getElementById(`L${line}`);
  if (!target) return;
  els.srcwrap.scrollTop = target.offsetTop - els.srcwrap.clientHeight / 3;
  for (const marked of els.src.querySelectorAll('.ln.hit')) marked.classList.remove('hit');
  const block = state.doc.blocks.find(b => b.startLine <= line && line <= b.endLine)
    ?? { startLine: line, endLine: line };
  for (let n = block.startLine; n <= block.endLine; n++) {
    document.getElementById(`L${n}`)?.classList.add('hit');
  }
}

function syncViewport() {
  const total = els.miniRows.scrollHeight || 1;
  const height = Math.max(14, total * (els.srcwrap.clientHeight / (els.srcwrap.scrollHeight || 1)));
  els.vp.style.height = `${height}px`;
  els.vp.style.top = `${els.miniRows.offsetTop + total * (els.srcwrap.scrollTop / (els.srcwrap.scrollHeight || 1))}px`;
}

function markOverview(iri) {
  for (const row of els.miniRows.querySelectorAll('.row.hit')) row.classList.remove('hit');
  for (const line of occurrenceLines(state.doc, iri)) {
    state.rowsByLine.get(line)?.classList.add('hit');
  }
}

// Indexes the freshly rendered DOM once. Without this, every selection ran an attribute
// selector across the whole source pane.
function indexRenderedDom() {
  state.refsByIri = new Map();
  state.rowsByLine = new Map();
  state.highlighted = [];
  for (const ref of els.src.querySelectorAll('.ref[data-iri]')) {
    const iri = ref.dataset.iri;
    if (!state.refsByIri.has(iri)) state.refsByIri.set(iri, []);
    state.refsByIri.get(iri).push(ref);
  }
  for (const row of els.miniRows.querySelectorAll('.row[data-line]')) {
    state.rowsByLine.set(Number(row.dataset.line), row);
  }
}

function positionPopover() {
  if (state.mode !== 'pop' || !state.anchor) return;
  const rect = state.anchor.getBoundingClientRect();
  const width = els.pop.offsetWidth || 620;
  els.pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`;
  els.pop.style.top = `${Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 120))}px`;
}

function closeResolved() {
  state.history.reset();
  state.term = null;
  els.pop.hidden = true;
  els.side.hidden = true;
  for (const marked of state.highlighted) marked.classList.remove('cur');
  state.highlighted = [];
}

function paint() {
  const host = state.mode === 'side' ? els.side : els.pop;
  const other = state.mode === 'side' ? els.pop : els.side;
  other.hidden = true;

  if (state.term) {
    host.innerHTML = renderTermHtml(state.term);
  } else {
    const iri = state.history.current();
    if (!iri) { host.hidden = true; return; }
    host.innerHTML = renderResolvedHtml({
      resolved: resolveNode(state.doc, iri),
      doc: state.doc,
      format: state.format,
      trail: state.history.trail(),
      canGoBack: state.history.canGoBack(),
      technique: state.techniqueFor[iri] ?? null,
    });
    markOverview(iri);
    for (const marked of state.highlighted) marked.classList.remove('cur');
    state.highlighted = state.refsByIri.get(iri) ?? [];
    for (const ref of state.highlighted) ref.classList.add('cur');
  }
  host.hidden = false;
  positionPopover();
}

// A technique stub resolves over the network, so it arrives after the first paint.
async function attachTechnique(iri) {
  if (!isTechniqueIri(iri)) return;
  const doc = state.doc;
  const technique = await resolver.resolveTechnique(iri);
  // A resolution started for one document must not write into another's state, and must
  // not repaint a view the reader has already moved on from.
  if (state.doc !== doc) return;
  state.techniqueFor = { ...state.techniqueFor, [iri]: technique };
  if (state.history.current() === iri) paint();
}

function openNode(iri, anchor) {
  state.term = null;
  state.anchor = anchor ?? state.anchor;
  state.history.reset(iri);
  paint();
  attachTechnique(iri);
}

function openTerm(iri, anchor) {
  state.anchor = anchor ?? state.anchor;
  state.history.reset();
  state.term = state.lookup.get(iri);
  paint();
}

function showReport() {
  els.reportPanel.innerHTML = renderReportHtml(state.report);
  els.reportPanel.hidden = false;
}

async function load(text, name) {
  // A load that awaits the network can be overtaken by a newer one. Everything written
  // after the await is checked against this token first, so a stale continuation cannot
  // compose a report out of one document's findings and another's graph.
  const generation = ++state.generation;

  const lookup = makeTermLookup(window.__ONTOLOGY__);
  const doc = loadDocument(text, { isKnownTerm: lookup.isKnown });
  state.lookup = lookup;
  state.doc = doc;
  state.techniqueFor = {};
  closeResolved();

  // The outgoing document's report must not stay on screen next to the incoming
  // document's source.
  els.reportPanel.hidden = true;
  els.reportBtn.hidden = true;
  state.report = null;

  els.fname.textContent = name;
  els.src.innerHTML = renderSourceHtml(doc);
  els.miniRows.innerHTML = renderOverviewHtml(doc);
  indexRenderedDom();
  els.mini.hidden = false;
  els.segMode.hidden = false;
  els.segFmt.hidden = false;
  els.srcwrap.scrollTop = 0;
  syncViewport();

  // Look every rendered term up so the report knows what the page could not resolve.
  for (const iri of [...doc.predicates, ...doc.typeObjects]) lookup.get(iri);

  const solveitFindings = await resolver.checkOutputClasses(doc);
  if (generation !== state.generation) return;

  state.report = composeReport({
    doc,
    indexMeta: lookup.meta,
    unresolvedTerms: lookup.unresolved(),
    solveitFindings,
    solveitStatus: resolver.status(),
    unresolvedTechniques: resolver.unresolvedTechniques(),
  });

  els.reportBtn.hidden = false;
  els.reportBtn.textContent = reportButtonLabel(state.report);
  els.reportBtn.classList.toggle('bad', !state.report.clean);
  showReport();
}

function readFile(file) {
  if (!file) return;
  // A File is read directly. The document never travels over the network, which is what
  // lets this page work when opened from the filesystem.
  file.text().then(text => load(text, file.name)).catch(error => {
    setEmpty(`Could not read that file: ${error.message}`);
  });
}

els.file.addEventListener('change', event => readFile(event.target.files[0]));

let dragDepth = 0;

// dragleave fires for every element boundary the pointer crosses, so toggling the overlay
// per event makes it flicker across a real drag. Depth counting tracks the document as a
// whole; dragend and Escape cover a drag that ends without a leave.
function setDragging(active) {
  dragDepth = active ? dragDepth : 0;
  els.drop.hidden = !active;
}

document.addEventListener('dragenter', event => {
  event.preventDefault();
  dragDepth++;
  els.drop.hidden = false;
});
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('dragleave', event => {
  event.preventDefault();
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) els.drop.hidden = true;
});
document.addEventListener('dragend', () => setDragging(false));
document.addEventListener('drop', event => {
  event.preventDefault();
  setDragging(false);
  readFile(event.dataTransfer?.files?.[0]);
});

// A copy from the pane carries the highlighting inline, so a paste into a
// rich editor keeps the colours (plain-text pastes stay plain Turtle).
els.src.addEventListener('copy', handleCopy);

els.src.addEventListener('click', event => {
  const ref = event.target.closest('.ref[data-iri]');
  if (!ref || !state.doc) return;
  const iri = ref.dataset.iri;
  if (state.doc.nodes.has(iri) || state.doc.undeclaredSet.has(iri)) openNode(iri, ref);
  else openTerm(iri, ref);
});

// One delegated handler serves both presentations, so popover and sidebar cannot drift.
document.addEventListener('click', event => {
  const go = event.target.closest('[data-go]');
  if (go) { state.term = null; state.history.push(go.dataset.go); paint(); attachTechnique(go.dataset.go); return; }
  if (event.target.closest('[data-back]')) { state.history.back(); paint(); return; }
  if (event.target.closest('[data-close]')) { closeResolved(); return; }
  const jump = event.target.closest('[data-jump]');
  if (jump) {
    jumpToLine(Number(jump.dataset.jump));
    if (state.mode === 'pop') els.pop.hidden = true;
    return;
  }
  if (event.target.closest('[data-dismiss]')) { els.reportPanel.hidden = true; return; }
  if (event.target === els.reportPanel) { els.reportPanel.hidden = true; return; }
  if (state.mode === 'pop' && !els.pop.hidden
    && !event.target.closest('#pop') && !event.target.closest('.ref')) {
    els.pop.hidden = true;
  }
});

els.mini.addEventListener('click', event => {
  const row = event.target.closest('.row');
  if (row) jumpToLine(Number(row.dataset.line));
});

for (const [group, key, apply] of [
  [els.segMode, 'm', value => { state.mode = value; }],
  [els.segFmt, 'f', value => { state.format = value; }],
]) {
  group.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    for (const sibling of group.querySelectorAll('button')) sibling.classList.remove('on');
    button.classList.add('on');
    apply(button.dataset[key]);
    // Presentation and content mode are page-wide and never disturb the stack.
    if (!state.history.isEmpty() || state.term) paint(); else { els.pop.hidden = true; els.side.hidden = true; }
  });
}

els.srcwrap.addEventListener('scroll', syncViewport);
window.addEventListener('resize', () => { syncViewport(); positionPopover(); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (!els.reportPanel.hidden) els.reportPanel.hidden = true;
  else closeResolved();
});

els.reportBtn.addEventListener('click', showReport);
setEmpty('Choose a Turtle file, or drop one onto the page.');
