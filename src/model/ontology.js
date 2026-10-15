// Class and property lookup against the index bundled into the page, plus derivation of
// the published documentation URL for a term.
//
// The UCO and CASE documentation URL is derivable from the term IRI, so no lookup table
// is needed: a class becomes documentation/class-<namespace><localname>.html and a
// property documentation/prop-<namespace><localname>.html, both lowercased. SOLVE-IT
// serves its terms at their own IRIs, so those link to themselves.

import { localName } from './resolve.js';

const HOSTS = [
  { prefix: 'https://ontology.unifiedcyberontology.org/uco/', host: 'https://ontology.unifiedcyberontology.org' },
  { prefix: 'https://ontology.caseontology.org/case/', host: 'https://ontology.caseontology.org' },
];
const SELF_RESOLVING = ['https://ontology.solveit-df.org/'];

export function documentationUrl(iri, kind) {
  if (typeof iri !== 'string' || !iri.startsWith('http')) return null;
  if (SELF_RESOLVING.some(p => iri.startsWith(p))) return iri;

  const match = HOSTS.find(h => iri.startsWith(h.prefix));
  if (!match) return null;

  const rest = iri.slice(match.prefix.length);
  const parts = rest.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [namespace, name] = parts;
  const kindSegment = kind === 'property' ? 'prop' : 'class';
  return `${match.host}/documentation/${kindSegment}-${(namespace + name).toLowerCase()}.html`;
}

// Capitalisation is the convention across CASE, UCO and SOLVE-IT: classes are
// upper camel case, properties lower camel case. Used only when the index has no entry,
// so that an unresolved term still offers a link the reader can follow.
export function guessKind(iri) {
  return /^[A-Z]/.test(localName(iri)) ? 'class' : 'property';
}

export function lookupTerm(index, iri) {
  const terms = index?.terms ?? {};
  const entry = Object.prototype.hasOwnProperty.call(terms, iri) ? terms[iri] : undefined;
  const kind = entry?.k ?? guessKind(iri);
  return {
    iri,
    kind,
    resolved: Boolean(entry),
    label: entry?.l ?? localName(iri),
    definition: entry?.d ?? null,
    docUrl: documentationUrl(iri, kind),
  };
}

// Wraps the index so the report can learn which terms the page failed to resolve
// without every caller having to remember to record them.
export function makeTermLookup(index) {
  const missing = new Set();
  return {
    get(iri) {
      const term = lookupTerm(index, iri);
      if (!term.resolved) missing.add(iri);
      return term;
    },
    isKnown: iri => Object.prototype.hasOwnProperty.call(index?.terms ?? {}, iri),
    unresolved: () => [...missing].sort(),
    meta: index?.meta ?? null,
  };
}
