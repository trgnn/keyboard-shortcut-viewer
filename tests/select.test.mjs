// Selection rules (site/select.js): node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const S = createRequire(import.meta.url)('../site/select.js');
const state = (sel = [], { dbl = [], ...extra } = {}) => ({ sel: new Set(sel), dbl: new Set(dbl), lr: false, hyper: false, locked: new Set(), ...extra });
const click = (st, ...codes) => codes.reduce((s, c) => ({ ...s, ...S.select(s, c) }), st);
const sorted = (set) => [...set].sort();

test('modifiers stack; one activation key at a time', () => {
  const s = click(state(), 'cmd', 'k', 'j');
  assert.deepEqual(sorted(s.sel), ['cmd', 'j']);
});

test('⌃⌥⇧⌘ + fn can all be held; nothing past five', () => {
  const s = click(state(), 'fn', 'ctrl', 'opt', 'lshift', 'cmd');
  assert.deepEqual(sorted(s.sel), ['cmd', 'ctrl', 'fn', 'lshift', 'opt']);
  assert.equal(S.logicalModCount(s), S.MAX_MODS);
  assert.deepEqual(sorted(click(s, 'caps').sel), sorted(s.sel), 'caps is over the limit');
  assert.equal(S.maxed(s, 'caps'), true);
  assert.equal(S.maxed(s, 'cmd'), false, 'a selected modifier is never maxed');
  assert.equal(S.maxed({ ...s, hyper: true }, 'caps'), false, 'the hyperkey is exempt');
});

test('linked L/R: either side toggles the pair', () => {
  const s = click(state(), 'cmd');
  assert.equal(S.isOn(s, 'rcmd'), true);
  assert.deepEqual(sorted(click(s, 'rcmd').sel), []);
});

test('distinguished L/R: one side at a time', () => {
  const s = click(state([], { lr: true }), 'cmd', 'rcmd');
  assert.deepEqual(sorted(s.sel), ['rcmd']);
  assert.equal(S.isOn(s, 'cmd'), false);
});

test('a double-tap stands alone and toggles back to neutral', () => {
  const s = { ...state(['cmd', 'k']), ...S.select(state(['cmd', 'k']), 'lshift', { double: true }) };
  assert.deepEqual(sorted(s.sel), ['lshift']);
  assert.deepEqual(sorted(s.dbl), ['lshift']);
  assert.equal(S.isDbl(s, 'rshift'), true, 'linked pair reads as double-tapped');
  const back = S.select(s, 'lshift', { double: true });
  assert.deepEqual([sorted(back.sel), sorted(back.dbl)], [[], []]);
});

test('a single click after a double-tap starts over', () => {
  const s = state(['lshift'], { dbl: ['lshift'] });
  assert.deepEqual(sorted(click(s, 'k').sel), ['k']);
  assert.deepEqual(sorted(click(s, 'lshift').sel), [], 'clicking the double-tapped key clears it');
});

test('double-tap only applies to modifiers', () => {
  assert.deepEqual(sorted(S.select(state(), 'k', { double: true }).sel), ['k']);
  assert.deepEqual(sorted(S.select(state(), 'caps', { double: true }).dbl), []);
});

test('locked keys ignore clicks', () => {
  const s = state(['caps'], { hyper: true, locked: new Set(['cmd']) });
  assert.deepEqual(sorted(click(s, 'cmd').sel), ['caps']);
});

test('the input state is left untouched', () => {
  const s = state(['cmd']);
  S.select(s, 'k');
  assert.deepEqual(sorted(s.sel), ['cmd']);
});
