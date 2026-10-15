import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTabsHtml } from '../src/ui/tabs.js';

test('marks the active tab and gives each a close button', () => {
  const html = renderTabsHtml([{ id: 1, name: 'a.ttl' }, { id: 2, name: 'b.ttl' }], 2);
  assert.match(html, /class="tab" data-tab="1"/);
  assert.match(html, /class="tab on" data-tab="2"/);
  assert.match(html, /data-tabclose="1"/);
  assert.match(html, /data-tabclose="2"/);
});

test('escapes file names', () => {
  const html = renderTabsHtml([{ id: 1, name: '<img src=x onerror=alert(1)>".ttl' }], 1);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot;\.ttl/);
});
