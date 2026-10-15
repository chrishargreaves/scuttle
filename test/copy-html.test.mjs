import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inlineHighlightStyles, clipboardHtml } from '../src/ui/copy-html.js';

test('a highlight class becomes its inline colour', () => {
  const out = inlineHighlightStyles('<span class="t-literal">"x"</span>');
  assert.equal(out, '<span style="color:#0b7a3b">"x"</span>');
});

test('a combined ref term takes the term colour once', () => {
  const out = inlineHighlightStyles('<span class="ref term" data-iri="http://x">kb:a</span>');
  assert.ok(out.includes('color:#8c2f6d'), out);
  assert.ok(!out.includes('color:#1a5fb4'), 'the base ref colour must not also apply');
  assert.ok(!out.includes('data-iri'), 'reference metadata is stripped');
});

test('line numbers are removed, ids stripped, text kept', () => {
  const out = inlineHighlightStyles(
    '<div class="ln" id="L7" data-line="7"><span class="no">7</span>' +
    '<span class="tx"><span class="t-directive">@prefix</span> x</span></div>');
  assert.ok(!out.includes('>7<'), 'the line number is gone');
  assert.ok(!out.includes('id='), out);
  assert.ok(out.includes('@prefix'));
  assert.ok(out.includes('color:#7a5cb8'));
});

test('an unknown class drops its attribute but never its text', () => {
  assert.equal(inlineHighlightStyles('<span class="mystery">kept</span>'),
               '<span>kept</span>');
});

test('the wrapper pins font, foreground and background', () => {
  const out = clipboardHtml('x');
  for (const piece of ['font-family:', 'color:#1d1d1b', 'background:#ffffff']) {
    assert.ok(out.includes(piece), piece);
  }
});

test('newlines between line divs do not double the line breaks', () => {
  // The pane's DOM carries a literal newline between the block-level line
  // divs (the renderer joins lines with one); with the wrapper's pre-wrap
  // both the div break and the character rendered, so a paste gained a
  // blank line per line. The character between tags is removed; text
  // content inside a line is untouched.
  const out = inlineHighlightStyles(
    '<div class="ln"><span class="tx">a</span></div>\n' +
    '<div class="ln"><span class="tx">b</span></div>');
  assert.ok(!/>\s*\n\s*</.test(out), out);
  assert.ok(out.includes('>a<') && out.includes('>b<'));
});
