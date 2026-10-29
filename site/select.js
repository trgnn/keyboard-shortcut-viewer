/* Keyboard Shortcut Viewer — selection rules, with no DOM.
   A click on a key goes through select(); everything that greys keys out asks maxed()
   and the locked set. Loaded by the page before ksv.js (window.KSVSelect) and by the
   Node tests (module.exports), so the rules are tested where they run. */
(function (root) {
  'use strict';

  // true modifier keys — they stack; everything else is a single "activation" key, or as
  // many as you like in combo mode (state.combo), kept in click order
  // (rctrl: the Windows layouts' right ctrl; a MacBook has none)
  const MODS = new Set(['caps', 'fn', 'ctrl', 'rctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // modifiers eligible for a double-tap shortcut (caps lock / hyper excluded)
  const DBLABLE = new Set(['fn', 'ctrl', 'rctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // keys a double-click turns into a double-tap: those modifiers, and every trigger key
  const canDouble = (code) => DBLABLE.has(code) || !MODS.has(code);
  // a double-tapped modifier is a shortcut on its own (a double-tapped trigger key is not)
  const modDbl = (s) => [...s.dbl].some((c) => MODS.has(c));
  // left/right modifier pairs (for "distinguish L/R")
  const PAIR = { cmd: 'rcmd', rcmd: 'cmd', opt: 'ropt', ropt: 'opt', lshift: 'rshift', rshift: 'lshift', ctrl: 'rctrl', rctrl: 'ctrl' };
  const CANON = { rcmd: 'cmd', ropt: 'opt', rshift: 'lshift', rctrl: 'ctrl' };
  const DIR = { cmd: 'left', rcmd: 'right', opt: 'left', ropt: 'right', lshift: 'left', rshift: 'right', ctrl: 'left', rctrl: 'right' };
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
    // a standalone (modifier) double-tap shortcut resets on any normal click
    if (modDbl(s)) {
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
      if (!s.combo) [...s.sel].forEach((c) => { if (!MODS.has(c)) { s.sel.delete(c); s.dbl.delete(c); } });
      s.sel.add(code);
    }
    return s;
  }
  // double-tap on a trigger key: pressed twice, under the modifiers held. Like a single click
  // otherwise (it replaces the trigger key, or adds one in combo mode); again → a single press
  function doubleKey(s, code) {
    if (s.dbl.has(code)) { s.dbl.delete(code); s.sel.add(code); return s; }
    if (modDbl(s)) { s.sel = new Set(); s.dbl = new Set(); }
    if (!s.combo) [...s.sel].forEach((c) => { if (!MODS.has(c)) { s.sel.delete(c); s.dbl.delete(c); } });
    s.sel.add(code); s.dbl.add(code);
    return s;
  }
  // double-tap on a modifier: a standalone shortcut — it can't be combined with another
  // double-tap or any other key, so everything else is cleared. Double-tapping it again → neutral.
  function doubleTap(s, code) {
    const was = s.dbl.has(code) || (!s.lr && PAIR[code] && s.dbl.has(PAIR[code]));
    s.sel = new Set(); s.dbl = new Set();
    if (!was) { s.sel.add(code); s.dbl.add(code); }
    return s;
  }

  // one click on a key → the next { sel, dbl }; the given state is left untouched.
  // { double: true } applies a double-tap (modifiers in DBLABLE, and trigger keys).
  function select(state, code, opts) {
    const s = { sel: new Set(state.sel), dbl: new Set(state.dbl || []), lr: !!state.lr, hyper: !!state.hyper, combo: !!state.combo };
    if (!(state.locked && state.locked.has(code))) {
      if (opts && opts.double && DBLABLE.has(code)) doubleTap(s, code);
      else if (opts && opts.double && !MODS.has(code)) doubleKey(s, code);
      else single(s, code);
    }
    return { sel: s.sel, dbl: s.dbl };
  }

  const api = { MODS, DBLABLE, canDouble, PAIR, DIR, MAX_MODS, canon, logicalModCount, isOn, isDbl, maxed, select };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KSVSelect = api;
})(typeof window !== 'undefined' ? window : globalThis);
