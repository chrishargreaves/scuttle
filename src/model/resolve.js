// Turns an identifier into everything a reader needs about that object in one place:
// its own properties, the properties of every facet it owns, its edges, where it is
// referenced from, and the verbatim source slices behind all of it.
//
// Facets are ingested here and only here (KTD7). The source pane still shows them where
// the file writes them; this layer is what removes the second hop for the reader.

import { RDF_TYPE, HAS_FACET, UCO_CORE, UCO_OBSERVABLE, UCO_TYPES } from './iris.js';

// Tried in order when deriving a readable label for an opaque identifier.
const NAME_PREDICATES = [
  UCO_CORE + 'name',
  UCO_OBSERVABLE + 'fileName',
  UCO_OBSERVABLE + 'keywordSearchTerm',
  UCO_OBSERVABLE + 'pageTitle',
  UCO_OBSERVABLE + 'hostname',
  UCO_TYPES + 'hashValue',
  UCO_CORE + 'description',
];

export function localName(iri) {
  const cut = Math.max(iri.lastIndexOf('#'), iri.lastIndexOf('/'));
  return cut === -1 ? iri : iri.slice(cut + 1);
}

export function shortType(doc, iri) {
  const node = doc.nodes.get(iri);
  return node?.types.length ? localName(node.types[0]) : null;
}

export function labelFor(doc, iri) {
  const node = doc.nodes.get(iri);
  if (!node) return localName(iri);
  const type = shortType(doc, iri) ?? 'node';
  for (const predicate of NAME_PREDICATES) {
    const quad = node.quads.find(q => q.predicate.value === predicate && q.object.termType === 'Literal');
    if (!quad) continue;
    const value = quad.object.value.length > 60 ? `${quad.object.value.slice(0, 60)}…` : quad.object.value;
    return `${type} “${value}”`;
  }
  return type;
}

function describeObject(term) {
  if (term.termType === 'Literal') {
    return {
      kind: 'literal',
      value: term.value,
      datatype: term.datatype?.value ?? null,
      language: term.language || null,
    };
  }
  if (term.termType === 'BlankNode') return { kind: 'blank', value: term.value, datatype: null, language: null };
  return { kind: 'node', value: term.value, datatype: null, language: null };
}

function propertiesFrom(doc, iri, { facet = false, facetIri = null } = {}) {
  const node = doc.nodes.get(iri);
  if (!node) return [];
  return node.quads
    .filter(q => q.predicate.value !== HAS_FACET && q.predicate.value !== RDF_TYPE)
    .map(q => ({ predicate: q.predicate.value, facet, facetIri, ...describeObject(q.object) }));
}

function sourceSlice(doc, iri) {
  const node = doc.nodes.get(iri);
  if (!node || node.startLine === null) return null;
  return doc.lines.slice(node.startLine - 1, node.endLine).join('\n');
}

export function resolveNode(doc, iri) {
  const node = doc.nodes.get(iri);
  const declared = Boolean(node && node.startLine !== null);
  const facets = doc.facetsOf.get(iri) ?? [];

  if (!node) {
    return {
      iri, declared: false, types: [], label: localName(iri),
      startLine: null, endLine: null,
      properties: [], outgoing: [], referencedBy: doc.referencedBy.get(iri) ?? [],
      facets: [], raw: [],
    };
  }

  const properties = [
    ...propertiesFrom(doc, iri),
    ...facets.flatMap(f => propertiesFrom(doc, f, { facet: true, facetIri: f })),
  ];

  const raw = [];
  const own = sourceSlice(doc, iri);
  if (own !== null) raw.push({ title: localName(iri), text: own, facet: false, iri });
  for (const facetIri of facets) {
    const slice = sourceSlice(doc, facetIri);
    if (slice !== null) raw.push({ title: localName(facetIri), text: slice, facet: true, iri: facetIri });
  }

  return {
    iri,
    declared,
    types: node.types,
    label: labelFor(doc, iri),
    startLine: node.startLine,
    endLine: node.endLine,
    properties,
    outgoing: properties.filter(p => p.kind === 'node'),
    referencedBy: doc.referencedBy.get(iri) ?? [],
    facets,
    raw,
  };
}
