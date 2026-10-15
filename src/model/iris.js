// IRIs used by more than one module.
//
// These live in one place because the bundler concatenates every module into a single
// scope, where a duplicated `const` is a hard redeclaration error that stops the whole
// page loading. test/bundle.test.mjs compiles the concatenated source to keep that from
// happening again.
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const UCO_CORE = 'https://ontology.unifiedcyberontology.org/uco/core/';
export const UCO_OBSERVABLE = 'https://ontology.unifiedcyberontology.org/uco/observable/';
export const UCO_TYPES = 'https://ontology.unifiedcyberontology.org/uco/types/';
export const UCO_ACTION = 'https://ontology.unifiedcyberontology.org/uco/action/';
export const HAS_FACET = UCO_CORE + 'hasFacet';
