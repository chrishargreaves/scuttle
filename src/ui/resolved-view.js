// Renders the resolved view: one component with two presentations (large popover by
// default, sidebar as the alternate) and one page-wide content mode (formatted fields or
// raw Turtle) -- KTD8.
//
// Edges are rendered as data-go, which drills in place. The only control that moves the
// source pane is the data-jump button in the footer (KTD9). That split is structural, so
// it can be checked without a browser.

import { escapeHtml } from './html.js';
import { localName, labelFor } from '../model/resolve.js';

function propertyValueHtml(property, doc) {
  if (property.kind === 'node') {
    const known = doc.nodes.has(property.value) && doc.nodes.get(property.value).startLine !== null;
    const label = known ? labelFor(doc, property.value) : localName(property.value);
    return `<button class="edge" data-go="${escapeHtml(property.value)}">` +
      `${escapeHtml(label)}${known ? ' →' : ' (not declared here)'}</button>`;
  }
  if (property.kind === 'blank') {
    return `<span class="dim">a blank node, shown in the raw view</span>`;
  }
  const suffix = property.datatype && !property.datatype.endsWith('#string')
    ? ` <span class="dim">^^${escapeHtml(localName(property.datatype))}</span>`
    : '';
  const value = property.value.length > 220 ? `${property.value.slice(0, 220)}…` : property.value;
  return escapeHtml(value) + suffix;
}

function crumbHtml(doc, trail, canGoBack) {
  const path = trail
    .map(iri => escapeHtml(doc.nodes.has(iri) ? labelFor(doc, iri) : localName(iri)))
    .join(' › ');
  return `<div class="crumb">${canGoBack ? '<button data-back="1">← Back</button>' : ''}` +
    `<span class="path">${path}</span></div>`;
}

function techniqueHtml(technique) {
  if (!technique) return '';
  if (!technique.resolved) {
    return `<h3>SOLVE-IT technique ${escapeHtml(technique.id ?? '')}</h3>` +
      `<p class="miss">Not resolved from the SOLVE-IT knowledge base. This file declares only the catalogue id.</p>`;
  }
  const list = (title, values) => values.length
    ? `<div class="kv"><span class="k">${title}</span><span class="v">${values.map(v => escapeHtml(localName(v))).join(', ')}</span></div>`
    : '';
  return `<h3>SOLVE-IT technique ${escapeHtml(technique.id)}</h3>` +
    `<div class="kv"><span class="k">name</span><span class="v">${escapeHtml(technique.name ?? '')}</span></div>` +
    `<div class="kv"><span class="k">description</span><span class="v">${escapeHtml(technique.description ?? '')}</span></div>` +
    (technique.details ? `<div class="kv"><span class="k">details</span><span class="v">${escapeHtml(technique.details)}</span></div>` : '') +
    list('declared inputs', technique.inputClasses) +
    list('declared outputs', technique.outputClasses) +
    list('potential weaknesses', technique.weaknesses);
}

export function renderResolvedHtml({ resolved, doc, format = 'fmt', trail = [], canGoBack = false, technique = null }) {
  const head = `<h2>${escapeHtml(resolved.label)}</h2>` +
    `<div class="ty">${escapeHtml(resolved.types.map(localName).join(', ') || '—')}</div>` +
    `<div class="iri">${escapeHtml(resolved.iri)}` +
    (resolved.startLine ? ` · declared line ${resolved.startLine}` : '') + `</div>`;

  if (!resolved.declared) {
    return `<div class="rv">${crumbHtml(doc, trail, canGoBack)}<div class="body">${head}` +
      `<p class="miss">Referenced in this file but never declared here.</p>` +
      `</div></div>`;
  }

  let body = head;

  if (format === 'raw') {
    for (const slice of resolved.raw) {
      body += `<h3>${slice.facet ? 'Facet — ' : ''}${escapeHtml(slice.title)}</h3>` +
        `<pre class="raw">${escapeHtml(slice.text)}</pre>`;
    }
  } else {
    body += '<h3>Properties</h3>';
    for (const property of resolved.properties) {
      body += `<div class="kv${property.facet ? ' fac' : ''}">` +
        `<span class="k">${escapeHtml(localName(property.predicate))}` +
        `${property.facet ? '<span class="badge">facet</span>' : ''}</span>` +
        `<span class="v">${propertyValueHtml(property, doc)}</span></div>`;
    }
    body += techniqueHtml(technique);
    if (resolved.referencedBy.length) {
      body += '<h3>Referenced by</h3>';
      for (const reference of resolved.referencedBy.slice(0, 40)) {
        body += `<button class="edge" data-go="${escapeHtml(reference.from)}">` +
          `<span class="pr">${escapeHtml(localName(reference.predicate))}</span>` +
          `${escapeHtml(labelFor(doc, reference.from))}</button>`;
      }
    }
  }

  const footer = `<div class="ft">` +
    (resolved.startLine ? `<button data-jump="${resolved.startLine}">Jump to line ${resolved.startLine} in source →</button>` : '') +
    `<button data-close="1">Close</button></div>`;

  return `<div class="rv">${crumbHtml(doc, trail, canGoBack)}<div class="body">${body}</div>${footer}</div>`;
}

export function renderTermHtml(term) {
  const kind = term.kind === 'property' ? 'Property' : 'Class';
  const definition = term.definition
    ? `<p>${escapeHtml(term.definition)}</p>`
    : `<p class="miss">No definition in the bundled index. This term is outside CASE, UCO and the SOLVE-IT ontology.</p>`;
  const link = term.docUrl
    ? `<a href="${escapeHtml(term.docUrl)}" target="_blank" rel="noopener">Open ontology page ↗</a>`
    : `<span class="dim">No documentation page is known for this namespace.</span>`;
  return `<div class="rv"><div class="crumb"><span class="path">${kind}</span></div>` +
    `<div class="body"><h2>${escapeHtml(term.label)}</h2>` +
    `<div class="iri">${escapeHtml(term.iri)}</div>${definition}</div>` +
    `<div class="ft">${link}<button data-close="1">Close</button></div></div>`;
}
