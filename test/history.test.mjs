import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../src/state/history.js';

test('following edges then going back returns to the earlier node', () => {
  const history = createHistory();
  history.reset('a');
  history.push('b');
  history.push('c');
  history.push('d');
  assert.equal(history.current(), 'd');
  assert.equal(history.back(), 'c');
  assert.equal(history.back(), 'b');
  assert.equal(history.current(), 'b');
});

test('the trail lists the visited nodes in order', () => {
  const history = createHistory();
  history.reset('a');
  history.push('b');
  history.push('c');
  assert.deepEqual(history.trail(), ['a', 'b', 'c']);
});

test('back at the root leaves the stack intact', () => {
  const history = createHistory();
  history.reset('a');
  assert.equal(history.canGoBack(), false);
  assert.equal(history.back(), 'a');
  assert.equal(history.depth(), 1);
  assert.equal(history.current(), 'a', 'the root must survive a back at the root');
});

test('reset replaces the stack rather than extending it', () => {
  const history = createHistory();
  history.reset('a');
  history.push('b');
  history.reset('z');
  assert.deepEqual(history.trail(), ['z']);
});

test('an empty history reports itself empty', () => {
  const history = createHistory();
  assert.equal(history.isEmpty(), true);
  assert.equal(history.current(), undefined);
});
