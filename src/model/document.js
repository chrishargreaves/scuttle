// The document model: one Turtle file becomes highlight spans, an occurrence index,
// statement blocks, the graph, facet ownership, a referenced-by index, and a list of
// identifiers that are referenced but never declared.
//
// Two passes over the same text (KTD1, KTD2). The lexer pass carries line and column
// spans that the parser does not put on quads; the parser pass carries the authoritative
// graph including blank nodes and collections. They are joined by IRI string, which is
// exact for the named terms a reader can actually click.

import { RDF_TYPE, HAS_FACET } from './iris.js';

// Objects of these predicates point at documents or ontology terms elsewhere, so they are
// never expected to be declared in the file being read.
const EXTERNAL_REFERENCE_PREDICATES = new Set([
  'http://www.w3.org/2000/01/rdf-schema#isDefinedBy',
  'http://www.w3.org/2000/01/rdf-schema#seeAlso',
  'http://www.w3.org/2000/01/rdf-schema#subClassOf',
  'http://www.w3.org/2000/01/rdf-schema#subPropertyOf',
  'http://www.w3.org/2000/01/rdf-schema#domain',
  'http://www.w3.org/2000/01/rdf-schema#range',
  'http://www.w3.org/2002/07/owl#imports',
]);

const PREFIX_DIRECTIVES = new Set(['@prefix', 'PREFIX']);
const BASE_DIRECTIVES = new Set(['@base', 'BASE']);
const OPENERS = new Set(['[', '(']);
const CLOSERS = new Set([']', ')']);
const TERM_TOKENS = new Set(['prefixed', 'IRI']);

function n3() {
  const lib = globalThis.N3;
  if (!lib?.Lexer || !lib?.Parser) throw new Error('the N3 parser is not loaded');
  return lib;
}

// A blank node has no IRI, so it is keyed by its parser-assigned label. Facets are
// routinely written as blank-node property lists, and their contents have to reach the
// object that owns them.
export function nodeKey(term) {
  return term.termType === 'BlankNode' ? `_:${term.value}` : term.value;
}

export function isBlankKey(key) {
  return typeof key === 'string' && key.startsWith('_:');
}

function resolveAgainstBase(value, base) {
  if (!base) return value;
  try {
    return new URL(value, base).href;
  } catch {
    return value;
  }
}

// One pass that resolves what each term token denotes at its own position in the file.
//
// Prefix bindings and `@base` are positional: a document may rebind either part-way
// through, and a relative IRI means nothing without the base in scope above it. A single
// flat map built up front would resolve early tokens with late bindings, which is how the
// lexer pass and the parser pass drift apart. Directive tokens and their payloads are
// marked here so the statement walkers can skip them wholesale -- that is also what stops
// a dot-less SPARQL `PREFIX` from swallowing the statement after it.
function annotateTokens(tokens) {
  const finalPrefixes = Object.create(null);
  const inScope = Object.create(null);
  let base = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (PREFIX_DIRECTIVES.has(token.type)) {
      const label = tokens[i + 1];
      const iri = tokens[i + 2];
      token.directive = true;
      if (label?.type === 'prefix' && iri?.type === 'IRI') {
        const resolved = resolveAgainstBase(iri.value, base);
        inScope[label.value] = resolved;
        finalPrefixes[label.value] = resolved;
        label.directive = true;
        iri.directive = true;
        i += 2;
      }
      continue;
    }

    if (BASE_DIRECTIVES.has(token.type)) {
      const iri = tokens[i + 1];
      token.directive = true;
      if (iri?.type === 'IRI') {
        base = resolveAgainstBase(iri.value, base);
        iri.directive = true;
        i += 1;
      }
      continue;
    }

    if (token.type === 'IRI') {
      token.iri = resolveAgainstBase(token.value, base);
    } else if (token.type === 'prefixed') {
      // Own-property check: a prefix label such as `constructor` would otherwise read a
      // function off Object.prototype and concatenate it into a fabricated identifier.
      const bound = Object.prototype.hasOwnProperty.call(inScope, token.prefix)
        ? inScope[token.prefix]
        : undefined;
      token.iri = bound === undefined ? null : bound + token.value;
    }
  }

  return finalPrefixes;
}

// Walks the token stream to find where each statement starts and ends. Depth tracking
// keeps blank-node property lists and collections from ending a statement early.
function collectBlocks(tokens) {
  const blocks = [];
  let depth = 0;
  let expectSubject = true;
  let current = null;

  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.directive) continue;

    if (OPENERS.has(token.type)) { depth++; continue; }
    if (CLOSERS.has(token.type)) { depth = Math.max(0, depth - 1); continue; }

    if (token.type === '.' && depth === 0) {
      if (current) { current.endLine = token.line; blocks.push(current); current = null; }
      expectSubject = true;
      continue;
    }

    if (expectSubject && depth === 0) {
      expectSubject = false;
      current = {
        subject: TERM_TOKENS.has(token.type) ? (token.iri ?? null) : null,
        startLine: token.line,
        endLine: token.line,
      };
      continue;
    }

    if (current && token.line > current.endLine) current.endLine = token.line;
  }
  if (current) blocks.push(current);
  return blocks;
}

// Records where every named term appears, tagged with the syntactic role it appeared in.
// Roles let the report tell an undeclared instance apart from a class or a predicate.
function collectOccurrences(tokens) {
  const occurrences = new Map();
  const predicates = new Set();
  const typeObjects = new Set();

  let depth = 0;
  let position = 'subject';
  let afterTypeKeyword = false;

  const push = (iri, token, role) => {
    if (!iri) return;
    if (!occurrences.has(iri)) occurrences.set(iri, []);
    occurrences.get(iri).push({ line: token.line, start: token.start, end: token.end, role });
  };

  for (const token of tokens) {
    if (token.type === 'eof') break;
    if (token.directive) continue;

    // A blank-node property list opens with a predicate; a collection opens with values.
    if (token.type === '[') { depth++; position = 'predicate'; continue; }
    if (token.type === '(') { depth++; position = 'object'; continue; }
    if (CLOSERS.has(token.type)) { depth = Math.max(0, depth - 1); position = 'object'; continue; }
    if (token.type === '.') { if (depth === 0) position = 'subject'; afterTypeKeyword = false; continue; }
    if (token.type === ';') { position = 'predicate'; afterTypeKeyword = false; continue; }
    if (token.type === ',') { position = 'object'; continue; }
    if (token.type === 'abbreviation') { position = 'object'; afterTypeKeyword = true; continue; }

    if (!TERM_TOKENS.has(token.type)) {
      if (token.type === 'literal') position = 'object';
      continue;
    }

    const iri = token.iri ?? null;

    if (position === 'subject') {
      push(iri, token, 'subject');
      position = 'predicate';
    } else if (position === 'predicate') {
      push(iri, token, 'predicate');
      if (iri) predicates.add(iri);
      position = 'object';
      afterTypeKeyword = false;
    } else {
      push(iri, token, afterTypeKeyword ? 'type' : 'object');
      if (iri && afterTypeKeyword) typeObjects.add(iri);
    }
  }
  return { occurrences, predicates, typeObjects };
}

// `isKnownTerm` decides whether an IRI is an ontology term rather than an instance the
// file should have declared. Ontology terms appear in object position all the time
// (`rdfs:subClassOf`, `sh:datatype`, `sh:targetClass`) and must not be reported as
// undeclared identifiers. The caller injects it so this layer stays free of index access.
export function loadDocument(text, { isKnownTerm = () => false } = {}) {
  const { Lexer, Parser } = n3();
  const lines = text.split('\n');

  let tokens = [];
  let lexError = null;
  try {
    tokens = new Lexer().tokenize(text);
  } catch (error) {
    lexError = { message: error.message, line: error.line ?? null };
  }

  const prefixes = annotateTokens(tokens);
  const blocks = collectBlocks(tokens);
  const { occurrences, predicates, typeObjects } = collectOccurrences(tokens);

  let quads = [];
  let parseError = lexError;
  try {
    quads = new Parser().parse(text);
  } catch (error) {
    parseError = parseError ?? { message: error.message, line: error.line ?? null };
  }

  const nodes = new Map();
  const ensure = key => {
    if (!nodes.has(key)) {
      nodes.set(key, { iri: key, types: [], quads: [], blocks: [], startLine: null, endLine: null });
    }
    return nodes.get(key);
  };

  for (const block of blocks) {
    if (!block.subject) continue;
    const node = ensure(block.subject);
    node.blocks.push(block);
    if (node.startLine === null) { node.startLine = block.startLine; node.endLine = block.endLine; }
  }

  const facetsOf = new Map();
  const referencedBy = new Map();
  const externalReferences = new Set();

  for (const quad of quads) {
    if (quad.subject.termType !== 'NamedNode' && quad.subject.termType !== 'BlankNode') continue;
    const node = ensure(nodeKey(quad.subject));
    node.quads.push(quad);
    if (quad.predicate.value === RDF_TYPE && quad.object.termType === 'NamedNode') {
      node.types.push(quad.object.value);
    }
    if (quad.object.termType !== 'NamedNode' && quad.object.termType !== 'BlankNode') continue;

    const objectKey = nodeKey(quad.object);
    if (EXTERNAL_REFERENCE_PREDICATES.has(quad.predicate.value)) externalReferences.add(objectKey);

    if (quad.predicate.value === HAS_FACET) {
      if (!facetsOf.has(node.iri)) facetsOf.set(node.iri, []);
      const owned = facetsOf.get(node.iri);
      if (!owned.includes(objectKey)) owned.push(objectKey);
    }
    if (quad.predicate.value !== RDF_TYPE) {
      if (!referencedBy.has(objectKey)) referencedBy.set(objectKey, []);
      referencedBy.get(objectKey).push({ from: node.iri, predicate: quad.predicate.value });
    }
  }

  // An identifier is undeclared when it is used as a plain object but is never a subject,
  // never a predicate, and never named as a class. Predicates and classes are ontology
  // terms, looked up in the bundled index rather than expected in the file.
  const undeclared = [];
  for (const [iri, where] of occurrences) {
    if (nodes.has(iri) && nodes.get(iri).startLine !== null) continue;
    if (predicates.has(iri) || typeObjects.has(iri)) continue;
    if (externalReferences.has(iri)) continue;
    if (!where.some(w => w.role === 'object')) continue;
    if (isKnownTerm(iri)) continue;
    undeclared.push(iri);
  }
  undeclared.sort();

  return {
    text, lines, tokens, prefixes, quads,
    nodes, occurrences, blocks, facetsOf, referencedBy,
    predicates, typeObjects, externalReferences,
    undeclared,
    undeclaredSet: new Set(undeclared),
    parseError,
  };
}

// Lines to mark when a node is selected: its declaration plus every other occurrence.
export function occurrenceLines(doc, iri) {
  const lines = new Set();
  for (const occurrence of doc.occurrences.get(iri) ?? []) lines.add(occurrence.line);
  const node = doc.nodes.get(iri);
  if (node?.startLine) lines.add(node.startLine);
  return [...lines].sort((a, b) => a - b);
}
