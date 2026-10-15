// Terms the CASE, UCO and SOLVE-IT ontologies use but do not define themselves.
// Without these, a reader clicking `rdfs:comment` or `owl:Class` in an export gets
// nothing back, because those terms belong to the RDF stack rather than the domain.
// Definitions are paraphrased from the W3C RDF 1.1, RDF Schema 1.1 and OWL 2 specs.
export const RDF_BUILTINS = {
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#type':
    { k: 'property', l: 'type', d: 'States that a resource is an instance of a class.' },
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#Property':
    { k: 'class', l: 'Property', d: 'The class of RDF properties.' },
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#first':
    { k: 'property', l: 'first', d: 'The first item in an RDF collection. Parsers produce this when expanding ( ... ) list syntax.' },
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#rest':
    { k: 'property', l: 'rest', d: 'The remainder of an RDF collection after its first item.' },
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#nil':
    { k: 'class', l: 'nil', d: 'The empty RDF collection, which terminates a list.' },
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#List':
    { k: 'class', l: 'List', d: 'The class of RDF collections.' },
  'http://www.w3.org/2000/01/rdf-schema#label':
    { k: 'property', l: 'label', d: 'A human-readable name for the resource.' },
  'http://www.w3.org/2000/01/rdf-schema#comment':
    { k: 'property', l: 'comment', d: 'A human-readable description of the resource.' },
  'http://www.w3.org/2000/01/rdf-schema#subClassOf':
    { k: 'property', l: 'subClassOf', d: 'States that all instances of one class are instances of another.' },
  'http://www.w3.org/2000/01/rdf-schema#subPropertyOf':
    { k: 'property', l: 'subPropertyOf', d: 'States that all resources related by one property are also related by another.' },
  'http://www.w3.org/2000/01/rdf-schema#isDefinedBy':
    { k: 'property', l: 'isDefinedBy', d: 'Indicates the resource defining the subject resource.' },
  'http://www.w3.org/2000/01/rdf-schema#seeAlso':
    { k: 'property', l: 'seeAlso', d: 'Indicates a resource that may provide additional information about the subject.' },
  'http://www.w3.org/2000/01/rdf-schema#domain':
    { k: 'property', l: 'domain', d: 'States that any resource with this property is an instance of the named class.' },
  'http://www.w3.org/2000/01/rdf-schema#range':
    { k: 'property', l: 'range', d: 'States that the values of this property are instances of the named class.' },
  'http://www.w3.org/2000/01/rdf-schema#Class':
    { k: 'class', l: 'Class', d: 'The class of classes.' },
  'http://www.w3.org/2002/07/owl#Class':
    { k: 'class', l: 'Class', d: 'The class of OWL classes.' },
  'http://www.w3.org/2002/07/owl#ObjectProperty':
    { k: 'class', l: 'ObjectProperty', d: 'The class of properties whose values are individuals rather than literals.' },
  'http://www.w3.org/2002/07/owl#DatatypeProperty':
    { k: 'class', l: 'DatatypeProperty', d: 'The class of properties whose values are literals.' },
  'http://www.w3.org/2002/07/owl#AnnotationProperty':
    { k: 'class', l: 'AnnotationProperty', d: 'The class of properties carrying annotations, which have no logical meaning.' },
  'http://www.w3.org/2002/07/owl#Ontology':
    { k: 'class', l: 'Ontology', d: 'The class of ontology documents.' },
  'http://www.w3.org/2002/07/owl#imports':
    { k: 'property', l: 'imports', d: 'References another ontology whose axioms this one includes.' },
  'http://www.w3.org/2002/07/owl#versionIRI':
    { k: 'property', l: 'versionIRI', d: 'Identifies this particular version of an ontology.' },
  'http://www.w3.org/2002/07/owl#versionInfo':
    { k: 'property', l: 'versionInfo', d: 'A string describing this version of the ontology.' },
};

// XSD datatypes appear as object values on typed literals and on SHACL datatype
// constraints, so they are looked up the same way an ontology term is.
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const XSD_TYPES = {
  string: 'A character string.',
  boolean: 'True or false.',
  integer: 'A whole number of arbitrary size.',
  decimal: 'An exact decimal number.',
  double: 'A double-precision floating point number.',
  float: 'A single-precision floating point number.',
  dateTime: 'An instant with date, time and optional timezone.',
  date: 'A calendar date.',
  time: 'A time of day.',
  duration: 'A length of time.',
  hexBinary: 'Binary data encoded as hexadecimal.',
  base64Binary: 'Binary data encoded as base64.',
  anyURI: 'A Uniform Resource Identifier.',
  long: 'A 64-bit signed integer.',
  int: 'A 32-bit signed integer.',
  nonNegativeInteger: 'An integer of zero or greater.',
  positiveInteger: 'An integer greater than zero.',
};

export const BUILTINS = {
  ...RDF_BUILTINS,
  ...Object.fromEntries(
    Object.entries(XSD_TYPES).map(([name, d]) => [XSD + name, { k: 'class', l: name, d }])
  ),
};
