// HTML escaping, shared by every renderer.
//
// Lives on its own rather than in one of the panes because all three renderers need it
// and importing it from a sibling pane made the source pane look like a utility module.
//
// Quotes are escaped as well as the markup characters: renderer output is interpolated
// into quoted attributes (`data-iri`, `data-go`, `href`), and although the Turtle grammar
// happens to keep a raw quote out of an IRI today, nothing in this codebase enforces that
// invariant. Escaping here costs nothing and removes the dependency on it.
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
