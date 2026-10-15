// Exposes the vendored parser the same way the built page does: as a global named N3.
// The vendored file is a UMD bundle, so Node reaches it through its CommonJS branch
// while the browser reaches it through its window branch. Both load the same artefact,
// which is the point -- tests never run against a separately installed copy.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let loaded = false;

export function loadN3() {
  if (!loaded) {
    globalThis.N3 = require('../../vendor/n3.min.cjs');
    loaded = true;
  }
  if (!globalThis.N3?.Parser) throw new Error('vendored N3 bundle did not expose a Parser');
  return globalThis.N3;
}

export function fixture(name) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}

export const FIXTURES = [
  'marple2_goal_bookmark_provenance.ttl',
  'marple2_goal_whole_case.ttl',
  'marple2_goal_derivation_chain.ttl',
  'solveit-aware-tool-examples.ttl',
];
