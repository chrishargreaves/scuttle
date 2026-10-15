# SCUTTLE

SOLVE-IT CASE/UCO TTL Examiner. A single HTML file that renders a CASE/UCO Turtle export
and lets you inspect and traverse the graph without losing your place in the source text.

## What it does

A CASE/UCO export is readable as text but not navigable as a graph. Object identifiers are
opaque, so following an edge means copying an identifier such as
`kb:bookmark-finding-a6114c5f-7ba3-5238-9315-794ff5a2a5a2` and searching the file for it,
and the target is rarely nearby because these files are grouped by kind rather than by
derivation. Facets add a second level of indirection: an object's properties do not live on
the object. Reading the SHA-256 of a source image means traversing a `File`, its
`uco-core:hasFacet` edge, a `ContentDataFacet`, its `uco-observable:hash` edge, and finally
a `Hash` node, across four separate blocks of the file.

SCUTTLE addresses both. Selecting an identifier opens a resolved view of that object with
the properties of every facet it owns folded in and marked, together with the places the
object is referenced from. Following an edge from inside that view replaces its contents
and leaves the source pane where it is, so an arbitrarily long chain costs no position. The
source pane moves only when you press the jump control.

The source text itself is never rewritten. Identifiers appear exactly as written and facets
stay where the file puts them, because the primary use is checking that a generator
produced correct CASE, and a pane that silently improved what it showed could not serve
that use.

Class and property definitions come from an index bundled into the page, covering CASE
1.5.0, UCO 1.5.0 and the [SOLVE-IT ontology](https://github.com/SOLVE-IT-DF/solve-it-ontology).
Those hosts send no `Access-Control-Allow-Origin` header, so a page cannot fetch them at
runtime. SOLVE-IT technique records are fetched live from
[data.solveit-df.org](https://data.solveit-df.org/) instead, because that host does permit
it and its knowledge base is regenerated daily.

## Using it

The latest build is hosted at <https://chrishargreaves.github.io/scuttle/>. Your file is
read in the browser and is not uploaded anywhere. To run it offline, download
`scuttle.html` from that page, or build it yourself as below.

## Building and opening it

```bash
npm run build:index   # regenerate the bundled definitions (needs network; cached afterwards)
npm run build         # produce dist/scuttle.html
npm test              # run the test suite
```

`dist/scuttle.html` is self-contained. Open it directly from the filesystem, with no server:

```bash
open dist/scuttle.html
```

Choose a file with the picker, or drag one onto the page. The document is read through a
`File` object and never travels over the network, which is what allows the page to work
over `file://`.

## The load report

The report opens with the file and lists what could not be resolved or verified. It is
dismissible, and the control in the header reopens it and carries the count.

It reports identifiers that are referenced but never declared, classes and properties
absent from the bundled index, techniques the SOLVE-IT knowledge base did not account for,
and actions whose result disagrees with the classes their technique declares it produces.
That last check is worth explaining: these exports type an action with a SOLVE-IT technique
and state in a comment that the output is among the classes the technique produces. SCUTTLE
compares the two rather than taking the comment's word for it.

The report also states which CASE/UCO version the bundled index was built from, and that
the file is assumed to target the same version. That assumption is necessary because these
exports carry their version only in a comment banner: there is no `owl:Ontology` node and
no `owl:versionIRI` anywhere in the graph. A reported disagreement can therefore mean
version skew inside the viewer rather than a defect in the export, and the report says so
where it matters.

## Known limits

- **Blank nodes are not independently selectable.** They are reached through the object
  that owns them. A facet written as a blank-node property list has its properties folded
  into its owner as normal, but you cannot click the blank node itself.
- **Technique details need network access.** Without it the technique stub is shown as the
  file declares it, with a link to SOLVE-IT, and the report records that the check was
  unavailable. Class and property definitions are unaffected because they are bundled.
- **The bundled index is regenerated manually.** Nothing detects that a newer CASE or UCO
  release exists, so `npm run build:index` has to be re-run deliberately.
- **The assumed version is not read from the data.** See the load report section above.

## Development

Application modules under `src/` are authored as ES modules so they can be imported by the
test suite, and `tools/bundle.mjs` concatenates them into one classic script at build time.
Two constraints follow from that transform and are enforced by tests in
`test/bundle.test.mjs` and `test/smoke.test.mjs`: no two modules may declare the same
top-level name, and imports may not be aliased.

The Turtle parser is [N3.js](https://github.com/rdfjs/N3.js), vendored as its UMD build in
`vendor/` and loaded by a classic script, so the page carries no module semantics. Source
positions come from the N3 lexer, which reports line and column, rather than from its
parser, which does not put positions on quads. The two passes are joined by IRI string.

## Licence

MIT. See [LICENSE](LICENSE). N3.js is also MIT-licensed; its licence is in
`vendor/n3-LICENSE.md`.
