// Renders the file verbatim, with line numbers that match the file and highlighting
// driven entirely by lexer token spans.
//
// The pane never rewrites what it shows (KTD3): identifiers appear exactly as written and
// facets stay where the file puts them. `stripMarkup` exists so that fidelity is a tested
// property rather than an intention -- removing the markup must return the original bytes.
// Fidelity alone is not enough, though: a dropped span leaves every character in place, so
// the suite also asserts that every resolvable token produced an element.

import { escapeHtml } from './html.js';

const TOKEN_CLASS = {
  literal: 't-literal',
  IRI: 't-iri',
  abbreviation: 't-keyword',
  '@prefix': 't-directive',
  '@base': 't-directive',
  PREFIX: 't-directive',
  BASE: 't-directive',
  prefix: 't-directive',
  type: 't-literal',
  langcode: 't-literal',
};

export function stripMarkup(html) {
  return html
    .replace(/<span class="no">[^<]*<\/span>/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tokensByLine(doc) {
  const byLine = new Map();
  for (const token of doc.tokens) {
    if (token.type === 'eof' || !token.line) continue;
    if (token.end <= token.start) continue;
    if (!byLine.has(token.line)) byLine.set(token.line, []);
    byLine.get(token.line).push(token);
  }
  for (const list of byLine.values()) list.sort((a, b) => a.start - b.start);
  return byLine;
}

// The lexer measures a token's `end` past the token, into whatever delimiter followed, so
// the extent is measured from the source characters instead of trusted from the token.
const EXTENT = {
  IRI: /^<[^>]*>/,
  literal: /^(?:"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/,
  abbreviation: /^a/,
  '@prefix': /^@\w+/,
  '@base': /^@\w+/,
  PREFIX: /^PREFIX/,
  BASE: /^BASE/,
  prefix: /^[^\s<]*:/,
};
const DEFAULT_EXTENT = /^[^\s,;()[\]]+/;

function extentAt(line, column, token) {
  if (column < 0 || column >= line.length) return null;
  const match = (EXTENT[token.type] ?? DEFAULT_EXTENT).exec(line.slice(column));
  if (!match || !match[0]) return null;
  // A prefixed local name cannot end in a dot, so a trailing one is the statement
  // terminator rather than part of the name.
  return token.type === 'prefixed' || token.type === 'type'
    ? match[0].replace(/\.+$/, '')
    : match[0];
}

// The lexer reports `start` relative to the trimmed line on every line except the first,
// where it is already absolute. Rather than encode that quirk as a rule, try the
// compensated column and fall back to the raw one, taking whichever actually matches --
// a token silently dropped here is invisible to the fidelity test.
function locate(line, token, cursor) {
  const indent = line.length - line.trimStart().length;
  for (const column of [token.start + indent, token.start]) {
    if (column < cursor) continue;
    const text = extentAt(line, column, token);
    if (text !== null) return { column, text };
  }
  return null;
}

function renderToken(token, doc, raw) {
  const text = escapeHtml(raw);
  const iri = token.directive ? null : token.iri;

  if (iri) {
    const declared = doc.nodes.has(iri) && doc.nodes.get(iri).startLine !== null;
    const isTerm = doc.predicates.has(iri) || doc.typeObjects.has(iri);
    const classes = ['ref'];
    if (isTerm && !declared) classes.push('term');
    else if (!declared && doc.undeclaredSet.has(iri)) classes.push('undeclared');
    return `<span class="${classes.join(' ')}" data-iri="${escapeHtml(iri)}">${text}</span>`;
  }

  const cls = TOKEN_CLASS[token.type];
  if (cls) return `<span class="${cls}">${text}</span>`;
  if (/^\d/.test(raw)) return `<span class="t-number">${text}</span>`;
  return text;
}

// The gaps between tokens are whitespace, possibly followed by a comment. Anything from a
// `#` to the end of the line is comment text, so it is styled without being rewritten.
function renderGap(text) {
  const hash = text.indexOf('#');
  if (hash === -1) return escapeHtml(text);
  return escapeHtml(text.slice(0, hash)) + `<span class="t-comment">${escapeHtml(text.slice(hash))}</span>`;
}

export function renderSourceHtml(doc) {
  const byLine = tokensByLine(doc);
  const out = [];

  doc.lines.forEach((line, index) => {
    const lineNumber = index + 1;
    let cursor = 0;
    let body = '';

    for (const token of byLine.get(lineNumber) ?? []) {
      const found = locate(line, token, cursor);
      if (!found) continue;
      body += renderGap(line.slice(cursor, found.column));
      body += renderToken(token, doc, found.text);
      cursor = found.column + found.text.length;
    }
    body += renderGap(line.slice(cursor));

    out.push(
      `<div class="ln" id="L${lineNumber}" data-line="${lineNumber}">` +
      `<span class="no">${lineNumber}</span><span class="tx">${body}</span></div>`
    );
  });

  return out.join('\n');
}
