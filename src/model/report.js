// Composes the opening report: everything the viewer could not resolve or verify.
//
// Composed as plain data before anything is rendered, so it can be tested without a DOM
// and so the same structure drives both the panel and the unresolved count in the bar.
// A verification tool that quietly shows less than it should is worse than one that says
// what it could not do (KTD10).

import { localName } from './resolve.js';

function group(key, title, note, items) {
  return items.length ? [{ key, title, note, items }] : [];
}

export function composeReport({
  doc,
  indexMeta = null,
  unresolvedTerms = [],
  solveitFindings = [],
  solveitStatus = { failure: null },
  unresolvedTechniques = [],
} = {}) {
  const assumedVersion = indexMeta?.assumedCaseUcoVersion ?? null;

  const groups = [
    ...group(
      'parse', 'The file did not parse cleanly',
      'Everything below was derived from the tokens the lexer produced, so it may be incomplete.',
      doc.parseError ? [
        doc.parseError.line
          ? `${doc.parseError.message} (line ${doc.parseError.line})`
          : doc.parseError.message,
      ] : []
    ),
    ...group(
      'undeclared', 'Identifiers referenced but never declared here',
      'These are used as values but nothing in this file says what they are.',
      doc.undeclared.map(iri => iri)
    ),
    ...group(
      'unresolved-terms', 'Classes and properties not in the bundled index',
      `The index was built from CASE and UCO ${assumedVersion ?? 'unknown'} and the SOLVE-IT ontology. A term outside those will have no definition.`,
      unresolvedTerms
    ),
    ...group(
      'technique-outputs', 'Actions whose result disagrees with their technique',
      `Compared against what the technique declares it produces. Assumes this file targets CASE/UCO ${assumedVersion ?? 'unknown'}; a disagreement can also mean the file targets a different version.`,
      solveitFindings.map(f =>
        f.valueCase
          ? `${f.techniqueId ?? 'technique'}: ${localName(f.action)} produced ${localName(f.actualClass)}, ` +
            `and the technique declares the property ${(f.declaredProperties ?? f.declaredClasses).map(localName).join(', ')} ` +
            `-- the value case -- but nothing reachable from the result carries it`
          : `${f.techniqueId ?? 'technique'}: ${localName(f.action)} produced ${localName(f.actualClass)}, ` +
            `but the technique declares ${f.declaredClasses.map(localName).join(', ')}`
      )
    ),
    ...group(
      'unresolved-techniques', 'Techniques the knowledge base did not account for',
      'These techniques are named in the file but absent from SOLVE-IT, so nothing could be checked against them.',
      unresolvedTechniques
    ),
    ...group(
      'solveit', 'SOLVE-IT technique details were unavailable',
      'Technique stubs show only what this file declares. Class and property definitions are unaffected, because they are bundled into this page.',
      solveitStatus?.failure ? [solveitStatus.failure] : []
    ),
  ];

  const count = groups.reduce((total, g) => total + g.items.length, 0);

  return {
    assumedVersion,
    indexGenerated: indexMeta?.generated ?? null,
    indexSources: indexMeta?.sources ?? [],
    groups,
    count,
    clean: count === 0,
  };
}
