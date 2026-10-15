// Rich-text copy for the source pane.
//
// The pane's highlighting lives in CSS classes, which do not survive a paste
// into another application: the markup arrives, the stylesheet does not, and
// the colours vanish. This module rewrites a copied fragment with the same
// colours inlined, so what lands on the clipboard's text/html flavour renders
// as the pane does. The text/plain flavour is untouched -- a paste into a
// plain editor gets clean Turtle.
//
// The transform is a pure string function so its behaviour is testable
// without a DOM: composition happens per class list, unknown classes drop
// their attribute but never their text, and line numbers (unselectable in
// the pane) are removed defensively.

const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

//: class -> inline declaration, colours matching app.css's light palette.
const CLASS_STYLE = new Map([
  ['t-comment', 'color:#9aa08e;font-style:italic'],
  ['t-literal', 'color:#0b7a3b'],
  ['t-iri', 'color:#0b7a3b'],
  ['t-number', 'color:#a6521a'],
  ['t-keyword', 'color:#7a5cb8;font-weight:600'],
  ['t-directive', 'color:#7a5cb8;font-weight:600'],
  ['ref', 'color:#1a5fb4'],
  ['ln', 'display:block;margin:0'],
  ['tx', 'white-space:pre-wrap'],
]);
//: class combinations that override a base colour, checked first.
const COMBINED = [
  [['ref', 'term'], 'color:#8c2f6d'],
  [['ref', 'undeclared'], 'color:#a33'],
];

function styleFor(classList) {
  const classes = classList.split(/\s+/).filter(Boolean);
  const declarations = [];
  let colourDone = false;
  for (const [combo, style] of COMBINED) {
    if (combo.every((c) => classes.includes(c))) {
      declarations.push(style);
      colourDone = true;
      break;
    }
  }
  for (const cls of classes) {
    const style = CLASS_STYLE.get(cls);
    if (!style) continue;
    if (colourDone && style.startsWith('color:')) continue;
    declarations.push(style);
  }
  return declarations.join(';');
}

export function inlineHighlightStyles(html) {
  return html
    // Line numbers are unselectable in the pane; a fragment serialiser that
    // includes them anyway would paste them into the middle of the Turtle.
    .replace(/<span class="no">[^<]*<\/span>/g, '')
    // The renderer joins line divs with a newline; each div already breaks
    // the line, so the character would double every break under pre-wrap.
    .replace(/>\s*\n\s*</g, '><')
    .replace(/ (?:id|data-iri|data-line)="[^"]*"/g, '')
    .replace(/ class="([^"]*)"/g, (whole, classes) => {
      const style = styleFor(classes);
      return style ? ` style="${style}"` : '';
    });
}

export function clipboardHtml(fragmentHtml) {
  return (
    `<div style="font-family:${FONT};font-size:12.5px;` +
    `color:#1d1d1b;background:#ffffff;white-space:pre-wrap">` +
    inlineHighlightStyles(fragmentHtml) +
    `</div>`
  );
}

// Wired by main.js onto the source pane: rewrites the HTML flavour of a copy
// while leaving the plain-text flavour as the browser would have written it.
export function handleCopy(event) {
  const selection = (event.target.ownerDocument ?? document).defaultView.getSelection();
  if (!selection || selection.isCollapsed || !event.clipboardData) return;
  const holder = (event.target.ownerDocument ?? document).createElement('div');
  holder.appendChild(selection.getRangeAt(0).cloneContents());
  event.clipboardData.setData('text/html', clipboardHtml(holder.innerHTML));
  event.clipboardData.setData('text/plain', selection.toString());
  event.preventDefault();
}
