/* Keyboard Shortcut Viewer — selection rules, with no DOM.
   A click on a key goes through select(); everything that greys keys out asks maxed()
   and the locked set. Loaded by the page before ksv.js (window.KSVSelect) and by the
   Node tests (module.exports), so the rules are tested where they run. */
(function (root) {
  'use strict';

  // true modifier keys — they stack; everything else is a single "activation" key
  const MODS = new Set(['caps', 'fn', 'ctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // modifiers eligible for a double-tap shortcut (caps lock / hyper excluded)
  const DBLABLE = new Set(['fn', 'ctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // left/right modifier pairs (for "distinguish L/R")
  const PAIR = { cmd: 'rcmd', rcmd: 'cmd', opt: 'ropt', ropt: 'opt', lshift: 'rshift', rshift: 'lshift' };
  const CANON = { rcmd: 'cmd', ropt: 'opt', rshift: 'lshift' };
  const DIR = { cmd: 'left', rcmd: 'right', opt: 'left', ropt: 'right', lshift: 'left', rshift: 'right' };
  const canon = (c) => CANON[c] || c;
  // logical modifiers held at once: ⌃⌥⇧⌘ + fn
  const MAX_MODS = 5;

  // distinct logical modifiers held (a linked L/R pair counts once when not distinguishing)
  function logicalModCount(state) {
    const lr = !!state.lr, seen = new Set();
    state.sel.forEach((c) => { if (MODS.has(c)) seen.add(lr ? c : canon(c)); });
    return seen.size;
  }
  // a key reads as selected (linked L/R pairs light up together when not distinguishing)
  function isOn(state, code) {
    return state.sel.has(code) || (!state.lr && !!PAIR[code] && state.sel.has(PAIR[code]));
  }
  function isDbl(state, code) {
    if (!state.dbl) return false;
    if (state.dbl.has(code)) return true;
    return !state.lr && !!PAIR[code] && state.dbl.has(PAIR[code]);
  }
  // an unselected modifier that can't be added: the limit is reached (a hyperkey caps is exempt)
  function maxed(state, code) {
    return MODS.has(code) && !isOn(state, code) && !(code === 'caps' && state.hyper) &&
      logicalModCount(state) >= MAX_MODS;
  }

  function clearDbl(s, code) {
    s.dbl.delete(code);
    if (!s.lr && PAIR[code]) s.dbl.delete(PAIR[code]);
  }
  // single click: toggle the key, under the stacking rules
  function single(s, code) {
    const lr = s.lr;
    // a standalone double-tap shortcut resets on any normal click
    if (s.dbl.size) {
      const hitDoubled = s.dbl.has(code) || (!lr && PAIR[code] && s.dbl.has(PAIR[code]));
      s.dbl = new Set();
      s.sel = new Set();
      if (hitDoubled) return s;       // double-tapped key clicked again → cleared
      // otherwise start a fresh selection with the clicked key
    }
    if (!lr && PAIR[code]) {
      const partner = PAIR[code];
      if (s.sel.has(code) || s.sel.has(partner)) { s.sel.delete(code); s.sel.delete(partner); clearDbl(s, code); }
      else if (logicalModCount(s) < MAX_MODS) s.sel.add(code);
    } else if (s.sel.has(code)) {
      s.sel.delete(code); clearDbl(s, code);
    } else if (MODS.has(code)) {
      // distinguish L/R: only one side of a pair at a time
      if (lr && PAIR[code] && s.sel.has(PAIR[code])) { s.sel.delete(PAIR[code]); clearDbl(s, PAIR[code]); }
      if ((code === 'caps' && s.hyper) || logicalModCount(s) < MAX_MODS) s.sel.add(code);
    } else {
      [...s.sel].forEach((c) => { if (!MODS.has(c)) s.sel.delete(c); });
      s.sel.add(code);
    }
    return s;
  }
  // double-tap: a standalone shortcut — it can't be combined with another double-tap or
  // any other key, so everything else is cleared. Double-tapping it again → neutral.
  function doubleTap(s, code) {
    const was = s.dbl.has(code) || (!s.lr && PAIR[code] && s.dbl.has(PAIR[code]));
    s.sel = new Set(); s.dbl = new Set();
    if (!was) { s.sel.add(code); s.dbl.add(code); }
    return s;
  }

  // one click on a key → the next { sel, dbl }; the given state is left untouched.
  // { double: true } applies a double-tap (modifiers in DBLABLE only).
  function select(state, code, opts) {
    const s = { sel: new Set(state.sel), dbl: new Set(state.dbl || []), lr: !!state.lr, hyper: !!state.hyper };
    if (!(state.locked && state.locked.has(code))) {
      if (opts && opts.double && DBLABLE.has(code)) doubleTap(s, code);
      else single(s, code);
    }
    return { sel: s.sel, dbl: s.dbl };
  }

  const api = { MODS, DBLABLE, PAIR, DIR, MAX_MODS, canon, logicalModCount, isOn, isDbl, maxed, select };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KSVSelect = api;
})(typeof window !== 'undefined' ? window : globalThis);
