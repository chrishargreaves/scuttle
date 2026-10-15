// Wiring. Everything that decides anything lives in the model and render modules; this
// file connects them to the page and owns the one control that is allowed to move the
// source pane.

const els = {
  file: document.getElementById('file'),
  tabs: document.getElementById('tabs'),
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
  // One tab per open file. Each holds its parsed document, term lookup, report,
  // resolved techniques, rendered markup and scroll position, so switching back to a
  // file restores it without parsing or checking it again.
  tabs: [],
  activeId: null,
  nextTabId: 1,
  // The active tab's document and lookup, for the handlers that read them.
  doc: null,
  lookup: null,
  mode: 'pop',
  format: 'fmt',
  history: createHistory(),
  term: null,
  anchor: null,
  // iri -> [element] and line -> element, built once per document so selection does not
  // re-scan the whole pane on every click.
  refsByIri: new Map(),
  rowsByLine: new Map(),
  highlighted: [],
};

// One resolver for the session, so the knowledge base is fetched once rather than once
// per file opened.
const resolver = createSolveItResolver({});

const EMPTY_MESSAGE = 'Choose one or more Turtle files, or drop them onto the page.';

function activeTab() {
  return state.tabs.find(tab => tab.id === state.activeId) ?? null;
}

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
      technique: activeTab()?.techniqueFor[iri] ?? null,
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
  const tab = activeTab();
  if (!tab) return;
  const technique = await resolver.resolveTechnique(iri);
  // The resolution belongs to the tab it started in, and must not repaint a view the
  // reader has already moved on from.
  tab.techniqueFor[iri] = technique;
  if (tab.id === state.activeId && state.history.current() === iri) paint();
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
  const tab = activeTab();
  if (!tab?.report) return;
  els.reportPanel.innerHTML = renderReportHtml(tab.report);
  els.reportPanel.hidden = false;
}

function showReportButton(tab) {
  els.reportBtn.hidden = !tab.report;
  if (!tab.report) return;
  els.reportBtn.textContent = reportButtonLabel(tab.report);
  els.reportBtn.classList.toggle('bad', !tab.report.clean);
}

function renderTabs() {
  els.tabs.innerHTML = renderTabsHtml(state.tabs, state.activeId);
  els.tabs.hidden = state.tabs.length === 0;
}

function activate(id) {
  const tab = state.tabs.find(candidate => candidate.id === id);
  if (!tab || tab.id === state.activeId) return;
  const previous = activeTab();
  if (previous) previous.scrollTop = els.srcwrap.scrollTop;

  state.activeId = tab.id;
  state.doc = tab.doc;
  state.lookup = tab.lookup;
  closeResolved();
  // The outgoing document's report must not stay on screen next to the incoming
  // document's source.
  els.reportPanel.hidden = true;

  els.fname.textContent = tab.name;
  els.src.innerHTML = tab.sourceHtml;
  els.miniRows.innerHTML = tab.overviewHtml;
  indexRenderedDom();
  els.mini.hidden = false;
  els.segMode.hidden = false;
  els.segFmt.hidden = false;
  renderTabs();
  els.srcwrap.scrollTop = tab.scrollTop;
  syncViewport();
  showReportButton(tab);
}

function closeTab(id) {
  const index = state.tabs.findIndex(tab => tab.id === id);
  if (index < 0) return;
  state.tabs.splice(index, 1);
  if (id !== state.activeId) { renderTabs(); return; }

  state.activeId = null;
  const next = state.tabs[index] ?? state.tabs[index - 1];
  if (next) { activate(next.id); return; }

  state.doc = null;
  state.lookup = null;
  closeResolved();
  els.reportPanel.hidden = true;
  els.reportBtn.hidden = true;
  els.mini.hidden = true;
  els.segMode.hidden = true;
  els.segFmt.hidden = true;
  els.fname.textContent = 'no file loaded';
  renderTabs();
  setEmpty(EMPTY_MESSAGE);
}

// Parses a file into a new tab, or returns the tab already holding the same file.
function openFile(text, name) {
  const existing = state.tabs.find(tab => tab.name === name && tab.text === text);
  if (existing) return existing;

  const lookup = makeTermLookup(window.__ONTOLOGY__);
  const doc = loadDocument(text, { isKnownTerm: lookup.isKnown });
  const tab = {
    id: state.nextTabId++,
    name,
    text,
    doc,
    lookup,
    report: null,
    techniqueFor: {},
    sourceHtml: renderSourceHtml(doc),
    overviewHtml: renderOverviewHtml(doc),
    scrollTop: 0,
  };
  state.tabs.push(tab);

  // Look every rendered term up so the report knows what the page could not resolve.
  for (const iri of [...doc.predicates, ...doc.typeObjects]) lookup.get(iri);
  checkTab(tab);
  return tab;
}

async function checkTab(tab) {
  // The check awaits the network, so the reader may have switched or closed tabs by the
  // time it returns. The report is written to the tab it belongs to, and only shown if
  // that tab is still the one on screen.
  const solveitFindings = await resolver.checkOutputClasses(tab.doc);
  if (!state.tabs.includes(tab)) return;

  tab.report = composeReport({
    doc: tab.doc,
    indexMeta: tab.lookup.meta,
    unresolvedTerms: tab.lookup.unresolved(),
    solveitFindings,
    solveitStatus: resolver.status(),
    unresolvedTechniques: resolver.unresolvedTechniques(),
  });

  if (tab.id !== state.activeId) return;
  showReportButton(tab);
  showReport();
}

async function readFiles(fileList) {
  const files = [...(fileList ?? [])];
  if (files.length === 0) return;
  // A File is read directly. The document never travels over the network, which is what
  // lets this page work when opened from the filesystem. Files open in the order they
  // were chosen, and the last one is shown.
  const texts = await Promise.allSettled(files.map(file => file.text()));
  const failures = [];
  let last = null;
  texts.forEach((result, i) => {
    try {
      if (result.status === 'rejected') throw result.reason;
      last = openFile(result.value, files[i].name);
    } catch (error) {
      failures.push(`${files[i].name}: ${error.message}`);
    }
  });
  if (last) activate(last.id);
  if (failures.length === 0) return;
  const message = `Could not read ${failures.join('; ')}`;
  if (state.tabs.length === 0) setEmpty(message);
  else window.alert?.(message);
}

els.file.addEventListener('change', event => {
  readFiles(event.target.files);
  // Clear the input so choosing the same file again still fires a change.
  event.target.value = '';
});

els.tabs.addEventListener('click', event => {
  const close = event.target.closest('[data-tabclose]');
  if (close) { closeTab(Number(close.dataset.tabclose)); return; }
  const tab = event.target.closest('[data-tab]');
  if (tab) activate(Number(tab.dataset.tab));
});

// A middle click closes a tab, as in a browser.
els.tabs.addEventListener('auxclick', event => {
  if (event.button !== 1) return;
  const tab = event.target.closest('[data-tab]');
  if (tab) closeTab(Number(tab.dataset.tab));
});

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
  readFiles(event.dataTransfer?.files);
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
setEmpty(EMPTY_MESSAGE);
