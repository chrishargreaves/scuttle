// Generates src/generated/ontology-index.json -- the definitions the page bundles.
//
// CASE and UCO cannot be fetched at runtime (their hosts send no Access-Control-Allow-Origin
// header and serve HTML even under Turtle content negotiation), so the definitions must be
// baked in. Sources are pinned so the index is reproducible; the download is cached under
// .ontology-sources/ and reused.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILTINS } from './rdf-builtins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = join(root, '.ontology-sources');
const N3 = createRequire(import.meta.url)('../vendor/n3.min.cjs');

export const SOURCES = [
  { name: 'UCO', version: '1.5.0', dir: 'UCO-1.5.0/ontology',
    url: 'https://github.com/ucoProject/UCO/archive/refs/tags/1.5.0.tar.gz' },
  { name: 'CASE', version: '1.5.0', dir: 'CASE-1.5.0/ontology',
    url: 'https://github.com/casework/CASE/archive/refs/tags/1.5.0.tar.gz' },
  { name: 'solve-it-ontology', version: 'e5f8149', dir: 'solve-it-ontology-e5f81498a0f67dbae1b883e3fa2de4288b3baaa6',
    url: 'https://github.com/SOLVE-IT-DF/solve-it-ontology/archive/e5f81498a0f67dbae1b883e3fa2de4288b3baaa6.tar.gz' },
];

const RDFS = 'http://www.w3.org/2000/01/rdf-schema#';
const OWL = 'http://www.w3.org/2002/07/owl#';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const SKOS_DEF = 'http://www.w3.org/2004/02/skos/core#definition';

const CLASS_TYPES = new Set([OWL + 'Class', RDFS + 'Class']);
const PROPERTY_TYPES = new Set([
  OWL + 'ObjectProperty', OWL + 'DatatypeProperty', OWL + 'AnnotationProperty',
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property',
]);

function ensureSources() {
  mkdirSync(cache, { recursive: true });
  for (const source of SOURCES) {
    if (existsSync(join(cache, source.dir))) continue;
    const archive = join(cache, `${source.name}.tar.gz`);
    console.log(`fetching ${source.name} ${source.version}`);
    // -f so a non-2xx response fails here with a clear error, rather than writing an
    // error page that only fails later, opaquely, inside tar.
    execFileSync('curl', ['-fsSL', '--max-time', '120', '-o', archive, source.url]);
    execFileSync('tar', ['xzf', archive, '-C', cache]);
  }
}

// Shape files describe validation constraints, not term meanings, so they are skipped.
function turtleFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return turtleFiles(full);
    return entry.name.endsWith('.ttl') && !entry.name.includes('shapes') ? [full] : [];
  });
}

export function buildIndex({ sourceRoot = cache } = {}) {
  const terms = {};
  const parsed = [];
  const failed = [];

  const ensure = iri => (terms[iri] ??= {});

  for (const source of SOURCES) {
    for (const file of turtleFiles(join(sourceRoot, source.dir))) {
      let quads;
      try {
        quads = new N3.Parser().parse(readFileSync(file, 'utf8'));
      } catch (error) {
        failed.push({ file, message: error.message });
        continue;
      }
      parsed.push(file);
      for (const quad of quads) {
        const subject = quad.subject.value;
        if (quad.subject.termType !== 'NamedNode' || !subject.startsWith('http')) continue;
        const predicate = quad.predicate.value;

        if (predicate === RDF_TYPE) {
          if (CLASS_TYPES.has(quad.object.value)) ensure(subject).k ??= 'class';
          else if (PROPERTY_TYPES.has(quad.object.value)) ensure(subject).k ??= 'property';
        } else if (predicate === RDFS + 'label' && quad.object.termType === 'Literal') {
          ensure(subject).l ??= quad.object.value;
        } else if ((predicate === RDFS + 'comment' || predicate === SKOS_DEF)
          && quad.object.termType === 'Literal') {
          ensure(subject).d ??= quad.object.value;
        }
      }
    }
  }

  // Only terms with a known kind are kept: without one the page cannot tell whether to
  // build a class or a property documentation link, and a definition alone is not enough.
  const kept = Object.fromEntries(Object.entries(terms).filter(([, v]) => v.k));
  for (const [iri, entry] of Object.entries(BUILTINS)) kept[iri] ??= entry;

  return {
    meta: {
      generated: new Date().toISOString().slice(0, 10),
      sources: SOURCES.map(s => ({ name: s.name, version: s.version })),
      assumedCaseUcoVersion: '1.5.0',
      termCount: Object.keys(kept).length,
    },
    terms: kept,
    stats: { parsed: parsed.length, failed },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureSources();
  const index = buildIndex();
  if (index.stats.failed.length) {
    for (const f of index.stats.failed) console.warn(`  failed: ${f.file} -- ${f.message}`);
  }
  const out = { meta: index.meta, terms: index.terms };
  mkdirSync(join(root, 'src/generated'), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(join(root, 'src/generated/ontology-index.json'), json);
  const defined = Object.values(out.terms).filter(t => t.d).length;
  console.log(`ontology-index.json  ${index.stats.parsed} files  ${index.meta.termCount} terms  ${defined} with definitions  ${(json.length / 1024).toFixed(0)} KB`);
}
