// Resolves SOLVE-IT technique stubs against the live knowledge base, and checks that an
// action's result is a class its technique declares it produces.
//
// This is the one place that reaches the network. CASE and UCO definitions are bundled
// because their hosts send no CORS header; data.solveit-df.org sends
// Access-Control-Allow-Origin: * (which also permits a page opened over file://) and its
// knowledge base regenerates daily, so a bundled snapshot would be stale on arrival (KTD4).

const KB_URL = 'https://data.solveit-df.org/solve-it.ttl';
const SOLVEIT_CORE = 'https://ontology.solveit-df.org/solveit/core/';
const TECHNIQUE_PREFIX = 'https://ontology.solveit-df.org/solveit/data/technique';
import { UCO_ACTION } from './iris.js';
import { guessKind } from './ontology.js';

const ACTION_RESULT = UCO_ACTION + 'result';

const FIELDS = {
  id: SOLVEIT_CORE + 'techniqueID',
  name: SOLVEIT_CORE + 'techniqueName',
  description: SOLVEIT_CORE + 'techniqueDescription',
  details: SOLVEIT_CORE + 'techniqueDetails',
};
const LISTS = {
  synonyms: SOLVEIT_CORE + 'hasSynonym',
  examples: SOLVEIT_CORE + 'hasExample',
  inputClasses: SOLVEIT_CORE + 'hasCASEInputClass',
  outputClasses: SOLVEIT_CORE + 'hasCASEOutputClass',
  weaknesses: SOLVEIT_CORE + 'hasPotentialWeakness',
};

export function isTechniqueIri(iri) {
  return typeof iri === 'string' && iri.startsWith(TECHNIQUE_PREFIX);
}

// Readable even when the knowledge base is unreachable, because the catalogue id is
// carried in the IRI itself.
export function techniqueIdFromIri(iri) {
  return isTechniqueIri(iri) ? iri.slice(TECHNIQUE_PREFIX.length) : null;
}

function unresolvedTechnique(iri) {
  return {
    iri, resolved: false,
    id: techniqueIdFromIri(iri),
    name: null, description: null, details: null,
    synonyms: [], examples: [], inputClasses: [], outputClasses: [], weaknesses: [],
    link: iri,
  };
}

export function createSolveItResolver({ fetchImpl, url = KB_URL, timeoutMs = 15000 } = {}) {
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  let loading = null;
  let records = null;
  let failure = null;
  const unresolved = new Set();

  // One request per session, shared by every caller, whether it succeeded or not.
  function load() {
    if (loading) return loading;
    loading = (async () => {
      if (!doFetch) { failure = 'no fetch implementation is available'; return null; }
      let text;
      // The opening report waits on this. Without a deadline a hung connection means the
      // reader never learns what could not be verified, which is worse than saying it
      // was unreachable.
      const timer = typeof AbortController === 'function' ? new AbortController() : null;
      const deadline = timer ? setTimeout(() => timer.abort(), timeoutMs) : null;
      try {
        const response = await doFetch(url, timer ? { signal: timer.signal } : undefined);
        if (!response.ok) { failure = `${url} returned ${response.status}`; return null; }
        text = await response.text();
      } catch (error) {
        failure = error.name === 'AbortError'
          ? `${url} did not respond within ${timeoutMs / 1000} seconds`
          : `${url} could not be reached: ${error.message}`;
        return null;
      } finally {
        if (deadline !== null) clearTimeout(deadline);
      }
      try {
        const quads = new globalThis.N3.Parser().parse(text);
        const byIri = new Map();
        for (const quad of quads) {
          if (!isTechniqueIri(quad.subject.value)) continue;
          const record = byIri.get(quad.subject.value)
            ?? { iri: quad.subject.value, synonyms: [], examples: [], inputClasses: [], outputClasses: [], weaknesses: [] };
          for (const [field, predicate] of Object.entries(FIELDS)) {
            if (quad.predicate.value === predicate) record[field] = quad.object.value;
          }
          for (const [field, predicate] of Object.entries(LISTS)) {
            if (quad.predicate.value === predicate) record[field].push(quad.object.value);
          }
          byIri.set(quad.subject.value, record);
        }
        if (byIri.size === 0) {
          // A 200 carrying no technique records verifies nothing. Reporting that as
          // success would let the page tell the reader a file is clean when it was never
          // actually checked -- the failure this whole design exists to prevent.
          failure = `${url} returned no SOLVE-IT technique records`;
          return null;
        }
        records = byIri;
        return records;
      } catch (error) {
        failure = `the knowledge base could not be parsed: ${error.message}`;
        return null;
      }
    })();
    return loading;
  }

  async function resolveTechnique(iri) {
    if (!isTechniqueIri(iri)) return unresolvedTechnique(iri);
    const loaded = await load();
    const record = loaded?.get(iri);
    if (!record) {
      unresolved.add(techniqueIdFromIri(iri));
      return unresolvedTechnique(iri);
    }
    return {
      ...unresolvedTechnique(iri),
      ...record,
      resolved: true,
      id: record.id ?? techniqueIdFromIri(iri),
      link: iri,
    };
  }

  // Whether any node reachable from `start` (following named-node edges, a few hops
  // deep) carries one of `properties`. SOLVE-IT 0.2.2 admits a PROPERTY in
  // hasCASEOutputClass -- a technique that yields a value declares the property that
  // carries it, and the file chooses the carrier object -- so the value usually sits a
  // facet or an entry below the action's result, not on it.
  function carriesAny(doc, start, properties, maxDepth = 3) {
    const wanted = new Set(properties);
    const visited = new Set();
    let frontier = [start];
    for (let depth = 0; depth <= maxDepth && frontier.length; depth++) {
      const next = [];
      for (const iri of frontier) {
        if (visited.has(iri)) continue;
        visited.add(iri);
        const node = doc.nodes.get(iri);
        if (!node) continue;
        for (const quad of node.quads) {
          if (wanted.has(quad.predicate.value)) return true;
          if (quad.object.termType === 'NamedNode') next.push(quad.object.value);
        }
      }
      frontier = next;
    }
    return false;
  }

  // Compares what an action actually produced against what its technique says it produces.
  // The file asserts this agreement in prose; this turns the assertion into a check.
  // One verdict per action-and-technique: the declaration holds when ANY of the action's
  // results is a declared class, or carries a declared property (the value case above) --
  // an action may legitimately produce several things, and marple2 records a route step's
  // own output beside the finding it also yielded.
  async function checkOutputClasses(doc) {
    const actions = [];
    for (const [iri, node] of doc.nodes) {
      const techniques = node.types.filter(isTechniqueIri);
      if (!techniques.length) continue;
      const results = node.quads
        .filter(q => q.predicate.value === ACTION_RESULT && q.object.termType === 'NamedNode')
        .map(q => q.object.value);
      if (results.length) actions.push({ iri, techniques, results });
    }
    if (!actions.length) return [];

    await load();
    const findings = [];
    for (const action of actions) {
      for (const techniqueIri of action.techniques) {
        const technique = await resolveTechnique(techniqueIri);
        if (!technique.resolved || !technique.outputClasses.length) continue;
        const declaredClasses = technique.outputClasses.filter(o => guessKind(o) === 'class');
        const declaredProperties = technique.outputClasses.filter(o => guessKind(o) === 'property');
        let satisfied = false;
        let firstTyped = null;
        for (const resultIri of action.results) {
          const resultTypes = doc.nodes.get(resultIri)?.types ?? [];
          if (!resultTypes.length) continue;
          firstTyped = firstTyped ?? { iri: resultIri, types: resultTypes };
          if (resultTypes.some(t => declaredClasses.includes(t))
              || (declaredProperties.length && carriesAny(doc, resultIri, declaredProperties))) {
            satisfied = true;
            break;
          }
        }
        if (satisfied || !firstTyped) continue;
        findings.push({
          action: action.iri,
          techniqueIri,
          techniqueId: technique.id,
          result: firstTyped.iri,
          actualClass: firstTyped.types[0],
          declaredClasses: technique.outputClasses,
          declaredProperties,
          valueCase: declaredClasses.length === 0 && declaredProperties.length > 0,
        });
      }
    }
    return findings;
  }

  return {
    resolveTechnique,
    checkOutputClasses,
    // Techniques the file names but the knowledge base could not account for. A file
    // whose every technique is missing would otherwise produce the same empty finding
    // list as a file that genuinely agrees with the catalogue.
    unresolvedTechniques: () => [...unresolved].filter(Boolean).sort(),
    status: () => ({ failure, loaded: records !== null, url }),
  };
}
