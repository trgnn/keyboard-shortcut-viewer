/* Keyboard Shortcut Viewer — vanilla UI shell.
   The keyboard engine lives in ksv.js (window.KSV); this file wires the page:
   selection state, the segmented controls, accent, the export preview, and download. */
(function () {
  'use strict';

  /* ---- config ---- */
  const COLS = KSV.COLS; // keyboard grid width (shared with the engine/export)
  // the five colours as shipped; each can be changed (ui.colors) and set back to its own
  const ACCENTS = ['#22d3ee', '#ff7a1a', '#9d4bff', '#ff3d8b', '#b7ff4a'];
  const HEX = /^#[0-9a-f]{6}$/i;
  const icons = (names) => '<span class="ic-row">' + names.map(KSV.icon).join('') + '</span>';
  // [value, label, disabled, spoken label] — the icon-only options need the last one
  const HYPER_OPTS = [['off', 'off'],
    ['caom', icons(['ctrl', 'opt', 'cmd']), false, 'control option command'],
    ['scaom', icons(['shift', 'ctrl', 'opt', 'cmd']), false, 'shift control option command']];
  // the same on a PC, where ⌃⌥⌘ read ctrl, alt and the Windows key (super on Linux)
  const hyperOptsPC = (os) => {
    const k = os === 'linux' ? 'super' : 'win', spoken = os === 'linux' ? 'super' : 'windows';
    return [['off', 'off'], ['caom', 'ctrl alt ' + k, false, 'control alt ' + spoken],
      ['scaom', 'shift ctrl alt ' + k, false, 'shift control alt ' + spoken]];
  };
  // export formats; one the browser's canvas can't encode is shown disabled (see init)
  const FORMATS = ['png', 'jpg', 'webp', 'svg'];
  // formats the clipboard takes (checked in Chrome 152: JPEG and WebP are refused)
  const COPYABLE = new Set(['png', 'svg']);
  // raster export scale: 1× is the export's base size, the slider multiplies it
  const SCALE = { min: 1, max: 4, step: 0.5 };
  // the keyboard case leans toward the cursor, barely: the most it turns, in degrees, about
  // each axis, and the perspective it's seen through (px)
  const TILT = { x: 1.6, y: 1, perspective: 1600 };
  const HYPER_LOCK = {
    caom: ['ctrl', 'rctrl', 'opt', 'cmd', 'rcmd', 'ropt'],
    scaom: ['ctrl', 'rctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']
  };
  // canvas and export colours come from the engine's theme table (KSV.THEMES): dark / light
  const THEMES = KSV.THEMES;

  // legible text on an accent (WCAG contrast): the engine's, shared with the export's badges
  const fgFor = KSV.onColor;

  /* ---- DOM refs ---- */
  const $ = (id) => document.getElementById(id);
  const root = $('app');
  const kbMount = $('kbMount');
  const panel = kbMount.closest('.panel');
  const preview = $('preview');
  const scaleRange = $('scaleRange');
  const scaleVal = $('scaleVal');
  const exportBtn = $('exportBtn');
  const copyBtn = $('copyBtn');
  // every declared rel="icon" link (.ico + .svg). The static hrefs in the HTML
  // are what crawlers/link-previewers read; in a live tab setFavicon() swaps
  // them all to an accent-tinted data URI, whichever one the browser prefers.
  const favicons = document.querySelectorAll('link[rel="icon"]');

  /* ---- state ---- */
  const encodable = new Set(); // formats this browser can export (filled in init)
  // engine state (shared with KSV)
  // several shortcuts at once: one layer per accent colour (KSV layersOf), the active one being
  // edited through sel / dbl (setAccent swaps them); ⌘K in the first to start with
  const state = { kb: 'mac-us', look: 'printed', superKey: 'win-logo', sel: new Set(['cmd', 'k']), dbl: new Set(), lr: false, hyper: false, locked: new Set(),
    layers: ACCENTS.map((color) => ({ color, sel: new Set(), dbl: new Set() })), active: 0 };
  // (each layer's colour follows ui.colors: init, setColor)
  // every shortcut's selection, the active one's as state holds it: for changes that apply to all
  const everyLayer = (fn) => state.layers.forEach((l, i) => fn(i === state.active ? state : l));
  // UI state
  // PNG by default: crisp key edges and labels, and the only raster format the clipboard takes.
  // frame / grid: the page's keyboard case and background grid, drawn in the keyboard export
  // surface: solid keys and case, or the page's translucent ones
  // theme: dark / light, for the keyboard, the frame and the whole page; bg: filled or transparent
  // defaults = the page's own look, so the canvas and the export start out identical
  // keycaps only: plus, where the "+" goes (between all keys, before the trigger key, none);
  // glow, which keys get the selected look (all, the modifiers, the trigger key, none)
  const ui = { layout: 'board', theme: 'dark', bg: 'fill', ext: 'png', scale: 2, frame: true, grid: true, surface: 'translucent',
    plus: 'key', glow: 'mods', accent: ACCENTS[0], active: 0, colors: ACCENTS.slice(), hyper: 'off', lr: false, combo: false, doubleTap: true, multi: false, kb: 'mac-us', look: 'printed', pcKey: 'win-logo', rail: true };

  /* ---- persistence: remember UI options across reloads (NOT the key selection) ---- */
  const STORE = 'ksv-ui-v1';
  let saved = '';
  function persist() {
    const json = JSON.stringify({
      layout: ui.layout, theme: ui.theme, bg: ui.bg, ext: ui.ext, scale: ui.scale, frame: ui.frame, grid: ui.grid,
      surface: ui.surface, plus: ui.plus, glow: ui.glow, active: ui.active, colors: ui.colors, hyper: ui.hyper, lr: ui.lr, combo: ui.combo, doubleTap: ui.doubleTap, multi: ui.multi, kb: ui.kb, look: ui.look, pcKey: ui.pcKey, rail: ui.rail
    });
    if (json === saved) return; // a key click changes nothing here: no write
    try { localStorage.setItem(STORE, json); saved = json; }
    catch (e) { /* storage unavailable (private mode, etc.) — just don't persist */ }
  }
  function restore() {
    let s;
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return; }
    if (!s || typeof s !== 'object') return;
    if (LAYOUTS.includes(s.layout)) ui.layout = s.layout;
    if (s.theme in THEMES) ui.theme = s.theme;
    if (['fill', 'trans'].includes(s.bg)) ui.bg = s.bg;
    // v1.1 kept one setting, dark / light / trans: theme + background since
    else if (s.bg === 'light' || s.bg === 'dark') { ui.theme = s.bg; ui.bg = 'fill'; }
    else if (s.bg === 'trans') { ui.theme = 'dark'; ui.bg = 'trans'; }
    if (FORMATS.includes(s.ext)) ui.ext = s.ext;
    if (typeof s.scale === 'number' && s.scale >= SCALE.min && s.scale <= SCALE.max) ui.scale = s.scale;
    if (Array.isArray(s.colors) && s.colors.length === ACCENTS.length && s.colors.every((c) => HEX.test(c))) ui.colors = s.colors.slice();
    if (Number.isInteger(s.active) && s.active >= 0 && s.active < ACCENTS.length) ui.active = s.active;
    else if (ACCENTS.includes(s.accent)) ui.active = ACCENTS.indexOf(s.accent); // one accent, before custom colours
    ui.accent = ui.colors[ui.active];
    if (['off', 'caom', 'scaom'].includes(s.hyper)) ui.hyper = s.hyper;
    if (typeof s.lr === 'boolean') ui.lr = s.lr;
    if (typeof s.combo === 'boolean') ui.combo = s.combo;
    if (typeof s.multi === 'boolean') ui.multi = s.multi;
    if (typeof s.doubleTap === 'boolean') ui.doubleTap = s.doubleTap;
    if (KSV.KBS.includes(s.kb)) ui.kb = s.kb;
    // (the older 'default' and 'physical' fall back to the printed look, now the default)
    if (KSV.LOOKS.includes(s.look)) ui.look = s.look;
    if (KSV.SUPERS.includes(s.pcKey)) ui.pcKey = s.pcKey;
    else if (s.pcKey === 'linux') ui.pcKey = 'super'; // before the super key's icons
    if (typeof s.rail === 'boolean') ui.rail = s.rail;
    if (typeof s.frame === 'boolean') ui.frame = s.frame;
    if (typeof s.grid === 'boolean') ui.grid = s.grid;
    if (['solid', 'translucent'].includes(s.surface)) ui.surface = s.surface;
    if (['all', 'key', 'none'].includes(s.plus)) ui.plus = s.plus;
    else if (typeof s.plus === 'boolean') ui.plus = s.plus ? 'all' : 'none'; // a pill before v1.3
    if (['all', 'mods', 'key', 'none'].includes(s.glow)) ui.glow = s.glow;
    // re-apply the guards the change handlers enforce, in case of an invalid saved combo
    if (ui.ext === 'jpg' && ui.bg === 'trans') ui.bg = 'fill';
  }

  /* ---- small helpers ---- */
  const el = KSV.el;
  const kbEl = () => kbMount.querySelector('.ksv-kb');

  // (re)build a segmented control. options: [value, label, optDisabled?, ariaLabel?][]
  function renderSeg(container, options, value, disabled, onChange) {
    container.classList.toggle('disabled', !!disabled);
    container.innerHTML = '';
    options.forEach(([v, l, optDisabled, aria]) => {
      const off = disabled || optDisabled;
      const b = el('button', (value === v ? 'on' : '') + (off ? ' is-off' : ''), l);
      b.setAttribute('aria-pressed', value === v);
      if (aria) b.setAttribute('aria-label', aria);
      if (off) b.disabled = true; else b.onclick = () => onChange(v);
      container.appendChild(b);
    });
  }

  /* ---- hyperkey: Caps Lock becomes the hyperkey, locking out its component mods ---- */
  function applyHyper() {
    const active = ui.hyper !== 'off';
    state.hyper = active;
    const pressed = active && state.sel.has('caps');
    state.locked = new Set(pressed ? (HYPER_LOCK[ui.hyper] || []) : []);
    state.locked.forEach((c) => state.sel.delete(c));
  }
  function updateCapsKey(container) {
    const caps = (container || kbMount).querySelector('.ksv-key[data-code="caps"]');
    if (!caps) return;
    const active = ui.hyper !== 'off';
    caps.classList.toggle('is-hyper', active);
    const cap = caps.querySelector('.cap'), sub = caps.querySelector('.sub');
    if (cap) cap.innerHTML = KSV.icon(active ? 'hyper' : 'caps');
    if (sub) sub.textContent = active ? 'hyper' : caps.dataset.sub;
    caps.setAttribute('aria-label', active ? 'hyperkey' : 'caps lock');
  }

  /* ---- export preview (keeps preview and export visually identical) ---- */
  const effBg = () => ui.ext === 'svg' ? 'trans' : ui.bg; // SVG is always transparent
  const theme = () => THEMES[ui.theme];
  function updatePreview() {
    preview.className = 'prev-card' + (effBg() === 'trans' ? ' is-trans' : '');
    preview.style.setProperty('--accent', ui.accent);
    preview.style.setProperty('--onFg', fgFor(ui.accent));
    preview.innerHTML = '';
    if (ui.layout === 'board') {
      // the export itself, scaled to the card: same margin, key geometry, frame and grid,
      // all from the engine's BOARD / FRAME / GRID (labels size from --keyH via KEYSPEC)
      preview.classList.add('is-board');
      const d = KSV.boardDims(1), B = KSV.BOARD, F = KSV.FRAME, G = KSV.GRID;
      const k = Math.max(120, preview.clientWidth) / d.W, px = (v) => v * k + 'px';
      const art = el('div', 'prev-board');
      Object.assign(art.style, { width: px(d.W), height: px(d.H), padding: px(B.pad) });
      if (ui.grid) {
        art.classList.add('with-grid');
        art.style.setProperty('--grid-step', px(G.step));
        const line = Math.max(0.5, G.line * k), g0 = KSV.gridOrigin(d);
        art.style.setProperty('--grid-line', line + 'px');
        art.style.backgroundPosition = (g0.x * k - line / 2) + 'px ' + (g0.y * k - line / 2) + 'px';
        art.style.setProperty('--grid-color', theme().grid);
      }
      if (ui.frame) {
        const f = el('div', 'prev-frame');
        const r = KSV.frameRect(d);
        Object.assign(f.style, { left: px(r.x), top: px(r.y), width: px(r.w), height: px(r.h), borderRadius: px(F.radius), background: theme().frame[ui.surface], borderColor: theme().frame.stroke });
        if (ui.surface === 'translucent') f.style.backdropFilter = 'blur(' + px(F.blur) + ')';
        art.appendChild(f);
      }
      const board = KSV.buildBoardPreview(state, { keyBg: theme().key[ui.surface] });
      board.style.setProperty('--keyH', px(d.keyH));
      board.style.setProperty('--g', px(B.g));
      art.appendChild(board);
      preview.appendChild(art);
      updateCapsKey(board); // reflect the hyperkey glyph in the preview too
    } else {
      // keycaps: the preview is the export itself, drawn at the card's size (sharp on HiDPI)
      preview.classList.remove('is-board');
      const o = Object.assign(exportOpts(), { format: 'png', scale: 1 });
      const size = KSV.exportSize(state, 1, o);
      if (!size) { preview.appendChild(el('div', 'ksv-empty', 'Select keys to build a shortcut')); return; }
      const cssW = Math.min(preview.clientWidth, size.w), dpr = window.devicePixelRatio || 1;
      const img = KSV.render(state, Object.assign(o, { scale: cssW / size.w * dpr }));
      img.canvas.className = 'prev-caps';
      img.canvas.style.width = cssW + 'px';
      preview.appendChild(img.canvas);
    }
  }

  function updateMeta() {
    const svg = ui.ext === 'svg', boardLike = ui.layout === 'board';
    const out = boardLike ? KSV.boardSize(svg ? 1 : ui.scale) : KSV.exportSize(state, svg ? 1 : ui.scale, { plusMode: ui.plus });
    // the scale only applies to raster output; its readout is the output's resolution
    scaleRange.disabled = svg;
    scaleRange.closest('.scale-row').classList.toggle('disabled', svg);
    scaleRange.value = ui.scale;
    scaleRange.style.setProperty('--fill', (ui.scale - SCALE.min) / (SCALE.max - SCALE.min) * 100 + '%');
    scaleVal.textContent = svg ? 'vector' : (out ? out.w + ' × ' + out.h : '—');
    scaleRange.setAttribute('aria-valuetext', ui.scale + '×' + (out && !svg ? ', ' + out.w + ' by ' + out.h + ' pixels' : ''));
    exportBtn.innerHTML = KSV.icon('download') + 'export<kbd>' + KSV.icon('shift') + 'D</kbd>';
    // keycaps with nothing selected: there's no image to make, so no export or copy
    const empty = ui.layout !== 'board' && !out;
    exportBtn.disabled = empty;
    exportBtn.title = empty ? 'Select keys to export' : '';
    // browsers only put PNG and SVG on the clipboard: copy is off for jpg / webp
    copyBtn.innerHTML = KSV.icon('copy') + 'copy<kbd>' + KSV.icon('shift') + 'C</kbd>';
    copyBtn.disabled = empty || !COPYABLE.has(ui.ext);
    copyBtn.title = ui.ext === 'svg' ? 'Copy the SVG (image and code)'
      : ui.ext === 'png' ? 'Copy the PNG' : 'Browsers can’t put a ' + ui.ext.toUpperCase() + ' on the clipboard: export it, or pick PNG';
  }

  /* ---- the canvas shows the export settings: background, grid, frame, surface ----
     Keyboard layout only; with keycaps (where frame, grid and surface don't apply) the
     canvas keeps the page's default frame, grid and surface. Colours come from KSV.THEMES. */
  function applyCanvas() {
    const T = theme(), frame = ui.frame, grid = ui.grid, glass = ui.surface === 'translucent';
    // theme: the page's chrome switches with the class, the canvas and keys with these variables
    root.classList.toggle('theme-light', ui.theme === 'light');
    const vars = {
      '--canvas-bg': T.bg, '--check-base': T.checkBase, '--check': T.check, '--grid-color': T.grid,
      '--frame-stroke': T.frame.stroke, '--keyFg': T.keyFg, '--keyBorder': T.keyLine,
      '--muted': T.plus,
      '--accent-ink': KSV.ink(ui.accent, ui.theme),
      // the keyboard case's fill, for the chrome that sits on the canvas like it (.rail-btn)
      '--case-bg': T.frame[glass ? 'translucent' : 'solid']
    };
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    document.documentElement.style.background = T.bg;
    root.classList.toggle('cv-trans', effBg() === 'trans');
    root.classList.toggle('cv-no-grid', !grid);
    const kb = kbEl();
    if (kb) kb.style.setProperty('--keyBg', T.key[glass ? 'translucent' : 'solid']);
    const blur = frame && glass ? 'blur(' + KSV.FRAME.blur + 'px)' : 'none';
    Object.assign(panel.style, {
      background: frame ? T.frame[glass ? 'translucent' : 'solid'] : 'transparent',
      borderColor: frame ? T.frame.stroke : 'transparent',
      backdropFilter: blur, webkitBackdropFilter: blur
    });
  }

  // full refresh after any state change (no keyboard rebuild)
  function refresh() {
    applyHyper();
    applyCanvas();
    const kb = kbEl();
    if (kb) KSV.paint(kb, state);
    updateCapsKey();
    syncSwatches();
    syncSpotLayer();
    updatePreview();
    updateMeta();
    persist();
  }

  /* ---- segmented controls ---- */
  function renderHyper() {
    const os = ui.kb.split('-')[0];
    renderSeg($('hyperSeg'), os === 'mac' ? HYPER_OPTS : hyperOptsPC(os), ui.hyper, false, (v) => { ui.hyper = v; renderHyper(); refresh(); });
  }
  function renderLr() {
    renderSeg($('lrSeg'), [['off', 'off'], ['on', 'on']], ui.lr ? 'on' : 'off', false, (v) => setLr(v === 'on'));
  }
  /* ---- the keyboard's dropdowns: a button and a listbox in the page's style ----
     picker(root, aria label, [[value, label]…], value, onChange) renders one; arrows move
     through the options, Enter / Space picks, Escape or a click elsewhere closes. */
  // an option may show an icon before its label, and name both for screen readers
  // ([value, label, icon, spoken name]: the icon itself is aria-hidden)
  const optLabel = ([, l, ic]) => (ic ? KSV.icon(ic) : '') + '<span>' + l + '</span>';
  const optName = (opt) => opt[3] || opt[1];
  function picker(root, label, opts, value, onChange) {
    const cur = opts.find(([v]) => v === value) || opts[0];
    root.innerHTML = '';
    const btn = el('button', 'pick-btn', optLabel(cur) + KSV.icon('chevron'));
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', label + ': ' + optName(cur));
    const list = el('div', 'pick-list');
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label);
    list.hidden = true;
    opts.forEach((opt) => {
      const v = opt[0], o = el('button', 'pick-opt' + (v === cur[0] ? ' on' : ''), optLabel(opt));
      o.setAttribute('role', 'option');
      if (opt[3]) o.setAttribute('aria-label', opt[3]);
      o.setAttribute('aria-selected', v === cur[0]);
      o.tabIndex = -1;
      o.onclick = () => { open(false); btn.focus(); if (v !== cur[0]) onChange(v); };
      list.appendChild(o);
    });
    const items = () => [...list.children];
    const open = (on) => {
      list.hidden = !on; btn.setAttribute('aria-expanded', on);
      if (on) items().find((o) => o.classList.contains('on')).focus();
    };
    btn.onclick = () => open(list.hidden);
    btn.onkeydown = (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(true); } };
    list.onkeydown = (e) => {
      const all = items(), i = all.indexOf(document.activeElement);
      if (e.key === 'Escape' || e.key === 'Tab') { open(false); if (e.key === 'Escape') btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
      }
    };
    root.append(btn, list);
  }
  // an open list closes on a click elsewhere, or as soon as the keyboard takes the pointer or
  // the focus (it would otherwise wait, dimmed, behind it)
  function closePickers(keep) {
    document.querySelectorAll('.kb-pick').forEach((p) => {
      if (keep && p.contains(keep)) return;
      const list = p.querySelector('.pick-list');
      if (list && !list.hidden) { list.hidden = true; p.querySelector('.pick-btn').setAttribute('aria-expanded', 'false'); }
    });
  }
  document.addEventListener('click', (e) => closePickers(e.target));
  panel.addEventListener('mouseenter', () => closePickers());
  panel.addEventListener('focusin', () => closePickers());
  // keyboard, language, and the keys' look: a MacBook's modifiers (KSV's labels or the printed
  // ones), or a PC's super key (the Windows logo, or super as on Linux: the `linux-*` layouts,
  // with Tux, Framework's gear or no icon)
  const pcOf = (superKey) => (/^win/.test(superKey) ? 'win' : 'linux');
  function renderPickers() {
    const [os, lang] = ui.kb.split('-'), mac = os === 'mac';
    const kbOf = (o, l) => (o === 'mac' ? 'mac' : pcOf(ui.pcKey)) + '-' + l;
    picker($('osPick'), 'keyboard', [['mac', 'MacBook'], ['pc', 'Windows / Linux']], mac ? 'mac' : 'pc', (v) => setKb(kbOf(v, lang)));
    picker($('langPick'), 'keyboard language', [['us', 'QWERTY US'], ['fr', 'AZERTY FR']], lang, (v) => setKb(kbOf(mac ? 'mac' : 'pc', v)));
    if (mac) picker($('lookPick'), 'modifier keys', [['printed', 'Default modifiers'], ['custom', 'Custom modifiers']], ui.look, (v) => {
      ui.look = state.look = v; renderPickers(); mountKeyboard(); alignToGrid(); refresh();
    });
    else picker($('lookPick'), 'super key', [
      ['win', 'logo + win', 'win', 'Windows logo and win'], ['win-logo', 'logo', 'win', 'Windows logo'],
      ['tux', 'logo + super', 'tux', 'Linux logo and super'], ['tux-logo', 'logo', 'tux', 'Linux logo'],
      ['framework', 'logo + super', 'framework', 'Framework logo and super'], ['framework-logo', 'logo', 'framework', 'Framework logo'],
      ['super', 'super', null, 'super, no logo']], ui.pcKey, (v) => {
      ui.pcKey = state.superKey = v; setKb(pcOf(v) + '-' + lang);
    });
  }
  // multi shortcut: one shortcut per colour (on), or one shortcut whose colour the swatches
  // pick, as before them (off, the default: the other shortcuts are kept, hidden, for when
  // it's back on). The ⇧1–5 hint says which they pick
  function renderMulti() {
    $('digitHint').textContent = ui.multi ? 'shortcut' : 'color';
    renderSeg($('multiSeg'), [['off', 'off'], ['on', 'on']], ui.multi ? 'on' : 'off', false, (v) => {
      ui.multi = state.multi = v === 'on'; renderMulti(); refresh();
    });
  }
  // double-tap: a double-click presses a key twice (on, the default); off, double-taps go
  function renderDbl() {
    renderSeg($('dblSeg'), [['off', 'off'], ['on', 'on']], ui.doubleTap ? 'on' : 'off', false, (v) => {
      ui.doubleTap = state.doubleTap = v === 'on';
      if (!ui.doubleTap) everyLayer((l) => { l.dbl = new Set(); });
      renderDbl(); refresh();
    });
  }
  function renderCombo() {
    renderSeg($('comboSeg'), [['off', 'off'], ['on', 'on']], ui.combo ? 'on' : 'off', false, (v) => setCombo(v === 'on'));
  }
  function renderLayout() {
    renderSeg($('layoutSeg'), [['board', 'keyboard'], ['keycaps', 'keycaps']], ui.layout, false, changeLayout);
  }
  function renderExt() {
    renderSeg($('extSeg'), FORMATS.map((f) => [f, f, !encodable.has(f)]), ui.ext, false, changeExt);
  }
  // the page's case and grid, drawn in the export: independent toggle pills (not a segmented control, which reads as one choice among several)
  function renderShow() {
    const c = $('showSeg');
    c.innerHTML = '';
    [['frame', 'frame', 'frame'], ['grid', 'grid', 'background grid']].forEach(([key, label, aria]) => {
      const b = el('button', ui[key] ? 'on' : '', label);
      b.setAttribute('aria-pressed', ui[key]);
      b.setAttribute('aria-label', aria);
      b.onclick = () => { ui[key] = !ui[key]; renderShow(); refresh(); };
      c.appendChild(b);
    });
  }
  // keycaps only (their rows are hidden in the keyboard layout): where the "+" goes, which keys glow
  function renderCapsOpts() {
    const off = ui.layout === 'board';
    ['plusSeg', 'glowSeg'].forEach((id) => { $(id).closest('.opt-row').hidden = off; });
    renderSeg($('plusSeg'), [['all', 'all', false, 'plus between all keys'], ['key', 'key', false, 'plus before the trigger key only'], ['none', 'none', false, 'no plus']],
      ui.plus, false, (v) => { ui.plus = v; renderCapsOpts(); refresh(); });
    renderSeg($('glowSeg'), [['all', 'all', false, 'all keys glow'], ['mods', 'mods', false, 'modifiers glow'], ['key', 'key', false, 'trigger key glows'], ['none', 'none', false, 'no glow']],
      ui.glow, false, (v) => { ui.glow = v; renderCapsOpts(); refresh(); });
  }
  // solid or translucent keys and case
  function renderSurface() {
    renderSeg($('surfaceSeg'), [['solid', 'solid', false, 'solid keys and frame'], ['translucent', 'translucent', false, 'translucent keys and frame, like the page']],
      ui.surface, false, (v) => { ui.surface = v; renderSurface(); refresh(); });
  }
  function renderTheme() {
    renderSeg($('themeSeg'), [['dark', 'dark'], ['light', 'light']], ui.theme, false, (v) => { ui.theme = v; renderTheme(); refresh(); });
  }
  // SVG is always transparent; JPG can't be
  function renderBgSeg() {
    renderSeg($('bgSeg'), [['fill', 'filled', false, 'filled background'], ['trans', 'transparent', ui.ext === 'jpg', 'transparent background']], effBg(), ui.ext === 'svg', setBg);
  }
  // one swatch per shortcut: the one being edited is ringed, an empty one is only outlined
  const COLOR_NAMES = { '#22d3ee': 'cyan', '#ff7a1a': 'orange', '#9d4bff': 'purple', '#ff3d8b': 'pink', '#b7ff4a': 'lime' };
  const colorName = (hex) => COLOR_NAMES[hex.toLowerCase()] || hex;
  // above each swatch, on hover or focus: edit its colour (picker), and clear its shortcut
  // while it holds keys (multi shortcut)
  function renderSwatches() {
    const c = $('accentSwatches');
    c.innerHTML = '';
    ACCENTS.forEach((_, i) => {
      const w = el('span', 'sw'), tools = el('span', 'sw-tools');
      const b = el('button', 'sw-chip');
      b.onclick = () => setAccent(i);
      const e = el('button', 'sw-edit', KSV.icon('edit'));
      e.onclick = (ev) => { ev.stopPropagation(); openPicker(i); };
      const x = el('button', 'sw-clear', KSV.icon('reset'));
      x.onclick = () => clearShortcut(i);
      tools.append(e, x);
      w.append(tools, b);
      c.appendChild(w);
    });
    syncSwatches();
  }
  // (on every change: a shortcut gets or loses its keys, a colour changes)
  function syncSwatches() {
    [...$('accentSwatches').children].forEach((w, i) => {
      const hex = ui.colors[i], keys = (i === state.active ? state.sel : state.layers[i].sel).size, name = colorName(hex);
      const b = w.querySelector('.sw-chip'), x = w.querySelector('.sw-clear');
      b.style.setProperty('--sw', hex);
      b.classList.toggle('on', ui.active === i);
      b.classList.toggle('empty', ui.multi && !keys);
      b.setAttribute('aria-pressed', ui.active === i);
      b.setAttribute('aria-label', ui.multi ? 'shortcut ' + (i + 1) + ', ' + name + ', ' + (keys ? keys + (keys > 1 ? ' keys' : ' key') : 'empty') : 'accent ' + name);
      w.querySelector('.sw-edit').setAttribute('aria-label', 'edit color ' + (i + 1) + ', ' + name);
      x.hidden = !ui.multi || !keys;
      x.setAttribute('aria-label', 'clear shortcut ' + (i + 1) + ', ' + name);
    });
  }

  /* ---- the colour picker: a small panel above the swatches ----
     A saturation × brightness area for the hue, a hue slider, the hex, and a way back to the
     colour as shipped. Changes apply as you go; a click elsewhere or Escape closes it. */
  const hsvToHex = (h, s, v) => {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return '#' + [f(5), f(3), f(1)].map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
  };
  const hexToHsv = (hex) => {
    const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = !d ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
  };
  let colorPicker = null;
  function closePicker() {
    if (!colorPicker) return;
    colorPicker.el.remove(); document.removeEventListener('keydown', colorPicker.onKey, true);
    colorPicker = null;
  }
  function openPicker(i) {
    closePicker();
    const box = el('div', 'picker'), hsv = hexToHsv(ui.colors[i]);
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'color ' + (i + 1));
    const sv = el('div', 'pk-sv', '<span class="pk-dot"></span>');
    sv.tabIndex = 0;
    sv.setAttribute('role', 'slider');
    sv.setAttribute('aria-label', 'saturation and brightness');
    const hue = el('input', 'pk-hue');
    Object.assign(hue, { type: 'range', min: 0, max: 359, step: 1 });
    hue.setAttribute('aria-label', 'hue');
    const row = el('div', 'pk-row'), hex = el('input', 'pk-hex');
    Object.assign(hex, { type: 'text', spellcheck: false, maxLength: 7 });
    hex.setAttribute('aria-label', 'hex');
    const back = el('button', 'pk-reset', KSV.icon('reset') + '<span>default</span>');
    back.setAttribute('aria-label', 'back to ' + colorName(ACCENTS[i]));
    row.append(hex, back);
    box.append(sv, hue, row);
    // draw the picker from hsv, and (apply) the colour
    const show = (apply) => {
      box.style.setProperty('--h', hsv.h);
      box.style.setProperty('--s', hsv.s);
      box.style.setProperty('--v', hsv.v);
      hue.value = Math.round(hsv.h);
      const c = hsvToHex(hsv.h, hsv.s, hsv.v);
      if (document.activeElement !== hex) hex.value = c;
      sv.setAttribute('aria-valuetext', Math.round(hsv.s * 100) + '% saturation, ' + Math.round(hsv.v * 100) + '% brightness');
      if (apply) setColor(i, c);
      back.hidden = ui.colors[i].toLowerCase() === ACCENTS[i];
    };
    const fromPoint = (e) => {
      const r = sv.getBoundingClientRect();
      hsv.s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      hsv.v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      show(true);
    };
    sv.onpointerdown = (e) => { sv.setPointerCapture(e.pointerId); fromPoint(e); sv.onpointermove = fromPoint; };
    sv.onpointerup = sv.onpointercancel = () => { sv.onpointermove = null; };
    sv.onkeydown = (e) => {
      const step = e.shiftKey ? 0.1 : 0.02, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
      if (!d) return;
      e.preventDefault();
      hsv.s = Math.min(1, Math.max(0, hsv.s + d[0])); hsv.v = Math.min(1, Math.max(0, hsv.v + d[1]));
      show(true);
    };
    hue.oninput = () => { hsv.h = +hue.value; show(true); };
    hex.oninput = () => {
      const v = hex.value.trim().replace(/^#?/, '#');
      if (HEX.test(v)) { Object.assign(hsv, hexToHsv(v.toLowerCase())); show(true); }
    };
    hex.onblur = () => { hex.value = ui.colors[i]; };
    back.onclick = () => { Object.assign(hsv, hexToHsv(ACCENTS[i])); show(true); hex.value = ACCENTS[i]; };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePicker(); $('accentSwatches').children[i].querySelector('.sw-edit').focus(); } };
    document.addEventListener('keydown', onKey, true);
    box.onclick = (e) => e.stopPropagation(); // a click inside keeps it open
    // above its swatch, right-aligned with the swatches, never past the window's top; on the
    // app root, since the controls row is scaled while the keyboard is hovered
    root.appendChild(box);
    const chip = $('accentSwatches').children[i].getBoundingClientRect(), strip = $('accentSwatches').getBoundingClientRect();
    box.style.left = Math.max(8, strip.right - box.offsetWidth) + 'px';
    box.style.top = Math.max(8, chip.top - box.offsetHeight - 8) + 'px';
    colorPicker = { el: box, onKey, i };
    show(false);
    sv.focus();
  }
  document.addEventListener('click', (e) => { if (colorPicker && !e.target.closest('.sw-edit')) closePicker(); });
  window.addEventListener('resize', () => closePicker());
  window.addEventListener('scroll', () => closePicker(), true);
  // a colour changes: its shortcut, and the page's accent if it's the one being edited
  function setColor(i, hex) {
    ui.colors[i] = hex;
    state.layers[i].color = hex;
    if (i === ui.active) applyAccent();
    refresh();
  }
  function clearShortcut(i) {
    if (i === state.active) { state.sel = new Set(); state.dbl = new Set(); }
    else Object.assign(state.layers[i], { sel: new Set(), dbl: new Set() });
    refresh();
  }

  /* ---- handlers ---- */
  const LAYOUTS = ['board', 'keycaps'];
  function changeLayout(v) {
    ui.layout = v;
    renderLayout(); renderShow(); renderSurface(); renderCapsOpts(); refresh();
  }
  // the rail folds away, the keyboard takes its room (the stage's ResizeObserver refits it).
  // Narrower than the app (the page scrolls sideways, phones included) it stays open: no
  // toggle, no ⇧S, the saved choice kept for a wider window
  const NARROW = window.matchMedia ? matchMedia('(max-width: 1119px)') : { matches: false };
  const railOpen = () => ui.rail || NARROW.matches;
  // (at load, without the fold's animation)
  function renderRail(instant) {
    const b = $('railBtn'), open = railOpen();
    if (instant) root.style.transition = b.style.transition = 'none';
    root.classList.toggle('rail-off', !open);
    root.querySelector('.rail').inert = !open;
    b.setAttribute('aria-expanded', open);
    b.setAttribute('aria-label', open ? 'hide the sidebar' : 'show the sidebar');
    if (instant) { void root.offsetWidth; root.style.transition = b.style.transition = ''; }
  }
  function toggleRail() { if (NARROW.matches) return; ui.rail = !ui.rail; renderRail(); persist(); }
  if (NARROW.addEventListener) NARROW.addEventListener('change', () => renderRail(true));
  function changeExt(v) {
    ui.ext = v;
    if (v === 'jpg' && ui.bg === 'trans') ui.bg = 'fill';
    renderExt(); renderBgSeg(); refresh();
  }
  function setBg(v) { ui.bg = v; renderBgSeg(); refresh(); }
  function setScale(v) { ui.scale = v; refresh(); }
  // favicon follows the accent: a keycap outline drawn in the current accent colour
  function setFavicon(hex) {
    if (!favicons.length) return;
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
      + "<rect width='32' height='32' rx='7' fill='#0a0b0d'/>"
      + "<rect x='7' y='7' width='18' height='18' rx='4' fill='none' stroke='" + hex + "' stroke-width='2.2'/></svg>";
    const href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    favicons.forEach(link => { link.href = href; });
  }
  // a swatch picks the shortcut to edit (by index): its colour becomes the page's accent
  function setAccent(i) {
    if (i !== state.active) {
      const from = state.layers[state.active], to = state.layers[i];
      Object.assign(from, { sel: state.sel, dbl: state.dbl });
      // one shortcut (multi off): it takes the new colour, trading places with what was there
      if (!ui.multi) [from.sel, from.dbl, to.sel, to.dbl] = [to.sel, to.dbl, from.sel, from.dbl];
      state.active = i; state.sel = to.sel; state.dbl = to.dbl;
    }
    ui.active = i;
    applyAccent();
    refresh();
  }
  function applyAccent() {
    const hex = ui.accent = ui.colors[ui.active];
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--onFg', fgFor(hex));
    setFavicon(hex);
  }
  function setLr(on) {
    ui.lr = on; state.lr = on;
    if (!on) everyLayer((l) => {
      [['rcmd', 'cmd'], ['ropt', 'opt'], ['rshift', 'lshift']].forEach(([r, k]) => {
        if (l.sel.has(r) && l.sel.has(k)) l.sel.delete(r);
      });
    });
    renderLr(); refresh();
  }
  // combo mode: trigger keys stack. Off again, only the last one clicked stays
  function setCombo(on) {
    ui.combo = on; state.combo = on;
    if (!on) everyLayer((l) => {
      const keys = [...l.sel].filter((c) => !KSVSelect.MODS.has(c));
      keys.slice(0, -1).forEach((c) => l.sel.delete(c));
    });
    renderCombo(); refresh();
  }
  // keyboard layout: the keyboard is rebuilt; keys this layout lacks fold into their
  // left-hand twin (right ctrl / right cmd) or drop (the ISO key)
  function setKb(v) {
    if (!KSV.KBS.includes(v)) return;
    ui.kb = v; state.kb = v;
    const fold = (set) => new Set([...set].map((c) => KSV.hasKey(v, c) ? c : KSV.hasKey(v, KSVSelect.canon(c)) ? KSVSelect.canon(c) : null).filter(Boolean));
    everyLayer((l) => { l.sel = fold(l.sel); l.dbl = fold(l.dbl); });
    mountKeyboard();
    alignToGrid(); // the new keyboard has no key size yet
    renderHyper(); renderPickers();
    refresh();
  }
  function mountKeyboard() {
    kbMount.innerHTML = '';
    kbMount.appendChild(KSV.buildKeyboard(state, refresh));
    if (spot) spot.remove();
    buildSpotLayer();
  }
  // ⇧R: every shortcut (a swatch's clear button empties one)
  function reset() {
    everyLayer((l) => { l.sel = new Set(); l.dbl = new Set(); });
    refresh();
  }
  // everything the engine needs to render the output configured in the rail
  function exportOpts() {
    applyHyper();
    const T = theme(), trans = effBg() === 'trans';
    return {
      layout: ui.layout, format: ui.ext, scale: ui.scale, frame: ui.frame, grid: ui.grid,
      accent: ui.accent, hyper: ui.accent, hyperFg: fgFor(ui.accent), accentInk: KSV.ink(ui.accent, ui.theme),
      // theme colours (KSV.THEMES); JPG has no alpha, so a transparent JPG falls back to the theme's fill
      bg: trans ? 'transparent' : T.bg, jpgBg: T.bg, badgeRing: T.bg, gridColor: T.grid,
      fg: T.keyFg, keyBorder: T.keyBorder, plus: T.plus, sub: T.sub,
      // key surface (both layouts) and the keycaps' "+" and glow
      keyBg: T.key[ui.surface], plusMode: ui.plus, capsGlow: ui.glow,
      frameFill: T.frame[ui.surface], frameStroke: T.frame.stroke,
      frameBlur: ui.surface === 'translucent' ? KSV.FRAME.blur : 0,
      // filename hints: theme, and alpha when transparent
      bgName: ui.theme + (trans ? '-alpha' : '')
    };
  }
  function exportNow() { if (!exportBtn.disabled) KSV.exportImage(state, exportOpts()).then((r) => showShot(r, 'exported')); }
  // copy the same image to the clipboard; the button's icon confirms for a moment
  let copyTimer;
  function copyNow() {
    if (copyBtn.disabled) return; // ⇧C on a format the clipboard can't take
    // only the icon changes (check, or a cross on failure), so the button keeps its width
    const done = (ok) => {
      copyBtn.querySelector('svg').outerHTML = KSV.icon(ok ? 'check' : 'cross');
      copyBtn.classList.toggle('is-done', ok);
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copyBtn.classList.remove('is-done'); updateMeta(); }, 1400);
    };
    try { KSV.copyImage(state, exportOpts()).then((r) => { done(true); showShot(r, 'copied'); }, () => done(false)); }
    catch (e) { done(false); }
  }

  /* ---- what went out, when the rail (and its preview) is folded away ----
     A thumbnail of the exported or copied image, bottom right, gone after SHOT_MS (held while
     the pointer is on it). A click opens it large; a click or Escape closes that. */
  const SHOT_MS = 4000;
  let shot = null;
  function showShot(r, verb) {
    if (railOpen() || !r || !r.blob) return;
    dropShot(true);
    const url = URL.createObjectURL(r.blob), trans = effBg() === 'trans';
    const b = el('button', 'shot' + (trans ? ' is-trans' : ''));
    b.setAttribute('aria-label', verb + ' ' + r.name + ', open the preview');
    const img = el('img'); img.src = url; img.alt = '';
    b.append(img, el('span', 'shot-cap', verb));
    root.appendChild(b);
    let timer;
    const later = () => { clearTimeout(timer); timer = setTimeout(() => dropShot(), SHOT_MS); };
    shot = { b, url, name: r.name, trans, stop: () => clearTimeout(timer) };
    b.onmouseenter = shot.stop;
    b.onmouseleave = later;
    b.onclick = () => { shot.stop(); openShot(); };
    requestAnimationFrame(() => b.classList.add('in'));
    later();
  }
  // now: replaced by a newer one (no exit animation)
  function dropShot(now) {
    if (!shot) return;
    const s = shot;
    shot = null;
    s.stop();
    const gone = () => { s.b.remove(); URL.revokeObjectURL(s.url); };
    if (now) return gone();
    s.b.classList.remove('in');
    setTimeout(gone, 400);
  }
  function openShot() {
    const s = shot, back = document.activeElement;
    const v = el('div', 'shot-view');
    v.setAttribute('role', 'dialog');
    v.setAttribute('aria-modal', 'true');
    v.setAttribute('aria-label', s.name);
    v.tabIndex = -1;
    const fig = el('div', 'shot-fig' + (s.trans ? ' is-trans' : ''));
    const img = el('img'); img.src = s.url; img.alt = s.name;
    fig.appendChild(img);
    v.append(fig, el('div', 'shot-name', s.name));
    const close = () => {
      v.classList.remove('in');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { v.remove(); dropShot(); }, 200);
      if (back && back.focus) back.focus();
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    v.onclick = close;
    document.addEventListener('keydown', onKey, true);
    root.appendChild(v);
    requestAnimationFrame(() => v.classList.add('in'));
    v.focus();
  }

  /* ---- key sizing: make letter/number keys (span 4) render as true squares ---- */
  function fitKeys() {
    const kb = kbEl();
    if (!kb) return;
    const W = kb.clientWidth;
    if (!W) return;
    const g = parseFloat(getComputedStyle(kb).getPropertyValue('--g')) || 6;
    const colW = (W - (COLS - 1) * g) / COLS;
    const unit = 4 * colW + 3 * g;
    kb.style.setProperty('--keyH', unit + 'px'); // fn keys share this height (square, like the letters)
  }

  /* ---- the border light's layer: an empty copy of the keyboard over it (styles.css) ----
     Same keys, same geometry, no labels: only their border rings show, lit near the cursor.
     Rebuilt with the keyboard, its classes synced on every refresh (locked / maxed keys stay
     dark), and laid over the real keyboard after each layout pass. */
  let spot = null;
  function buildSpotLayer() {
    spot = el('div', 'spot-layer');
    spot.setAttribute('aria-hidden', 'true');
    spot.appendChild(el('div', 'spot-ring'));
    spot.appendChild(kbEl().cloneNode(true));
    spot.querySelector('.ksv-kb').inert = true;
    panel.appendChild(spot);
  }
  // the case leans toward the cursor (startGlow): measurements that must not see the lean
  // are taken with it off for the moment
  function untilted(fn) {
    const t = panel.style.transform;
    panel.style.transform = 'none';
    try { return fn(); } finally { panel.style.transform = t; }
  }
  // where the case sits in the app root, for the light's coordinates (startGlow)
  let panelAt = { x: 0, y: 0 };
  function syncSpotLayer() {
    if (!spot) return;
    const real = kbEl(), copy = spot.querySelector('.ksv-kb');
    copy.style.cssText = real.style.cssText;
    untilted(() => {
      const r = real.getBoundingClientRect(), o = spot.getBoundingClientRect(); // sub-pixel exact
      const p = panel.getBoundingClientRect(), a = root.getBoundingClientRect();
      panelAt = { x: p.left - a.left, y: p.top - a.top };
      Object.assign(copy.style, { left: r.left - o.left + 'px', top: r.top - o.top + 'px', width: r.width + 'px' });
      const keys = real.querySelectorAll('.ksv-key'), ghosts = copy.querySelectorAll('.ksv-key');
      keys.forEach((k, i) => {
        const g = ghosts[i];
        if (!g) return;
        g.className = k.className;
        // each ring's light is one gradient in the case's coordinates (styles.css .spot-layer)
        const kr = k.getBoundingClientRect();
        g.style.setProperty('--kx', kr.left - p.left + 'px');
        g.style.setProperty('--ky', kr.top - p.top + 'px');
      });
    });
  }

  /* ---- the background grid lines up with the keyboard case ----
     The case is sized to whole grid cells (+1 px so its right and bottom borders land on a
     line too): the content column snaps its width down, the case pads its height up, split
     top and bottom. Then the grid's origin moves onto the case's top-left corner. */
  function alignToGrid() { untilted(alignCase); }
  function alignCase() {
    const cell = KSV.GRID.step, stage = root.querySelector('.stage'), cs = getComputedStyle(stage);
    const avail = Math.min(1180, stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight));
    root.style.setProperty('--content-max', Math.floor((avail - 1) / cell) * cell + 1 + 'px');
    fitKeys();
    panel.style.paddingTop = panel.style.paddingBottom = '';
    const pad = parseFloat(getComputedStyle(panel).paddingTop), h = panel.getBoundingClientRect().height;
    const extra = Math.ceil((h - 1) / cell) * cell + 1 - h;
    panel.style.paddingTop = panel.style.paddingBottom = pad + extra / 2 + 'px';
    const a = root.getBoundingClientRect(), p = panel.getBoundingClientRect();
    // whole pixels, so the 1 px grid lines stay crisp
    const mod = (v) => ((Math.round(v) % cell) + cell) % cell;
    root.style.setProperty('--grid-x', mod(p.left - a.left) + 'px');
    root.style.setProperty('--grid-y', mod(p.top - a.top) + 'px');
    syncSpotLayer();
  }

  /* ---- cursor glow on the grid background behind the keyboard ----
     Eases toward the cursor and stops once settled: the loop only runs while something
     moves, and restarts on the next mouse move. The variables go on the two elements
     that read them (.grid-lit for the glow, .stage for the selected keys' shadow), not
     on the app root, so a frame doesn't restyle the whole page. With reduced motion the
     glow still follows the cursor, but directly: no easing, no grid drift, no size pulse. */
  function startGlow() {
    const calm = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const lit = root.querySelector('.grid-lit'), stage = root.querySelector('.stage');
    let tx = 50, ty = 50, cx = 50, cy = 50, sz = 90, vx = 0, vy = 0, ltx = 50, lty = 50, raf = 0;
    // the case's lean: toward the cursor, so the keys it nears come forward (degrees, eased)
    let rx = 0, ry = 0, trx = 0, try_ = 0;
    const clamp = (v) => Math.max(-7, Math.min(7, v));
    const tick = () => {
      if (calm) { cx = ltx = tx; cy = lty = ty; }
      const dvx = tx - ltx, dvy = ty - lty; ltx = tx; lty = ty;
      vx += (dvx - vx) * 0.18; vy += (dvy - vy) * 0.18;
      cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
      const gap = Math.hypot(tx - cx, ty - cy), target = calm ? 90 : 80 + Math.min(gap * 11, 170);
      if (calm) sz = target;
      sz += (target - sz) * 0.08;
      lit.style.setProperty('--gx', cx + '%');
      lit.style.setProperty('--gy', cy + '%');
      lit.style.setProperty('--glow-r', sz + 'px');
      lit.style.setProperty('--vx', clamp(vx * 0.7) + 'px');
      lit.style.setProperty('--vy', clamp(vy * 0.7) + 'px');
      // the same light on the case's and keys' hairlines, in the case's px (see styles.css)
      const a = root.getBoundingClientRect();
      panel.style.setProperty('--spot-x', cx / 100 * a.width - panelAt.x + 'px');
      panel.style.setProperty('--spot-y', cy / 100 * a.height - panelAt.y + 'px');
      panel.style.setProperty('--spot-r', sz * 1.2 + 'px');
      rx += (trx - rx) * 0.08; ry += (try_ - ry) * 0.08;
      const leaning = Math.abs(rx) > 0.002 || Math.abs(ry) > 0.002 || trx || try_;
      panel.style.transform = leaning ? 'perspective(' + TILT.perspective + 'px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg)' : '';
      const settled = !leaning && gap < 0.05 && Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01 && Math.abs(target - sz) < 0.5;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    root.addEventListener('mousemove', (e) => {
      const r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width * 100;
      ty = (e.clientY - r.top) / r.height * 100;
      panel.style.setProperty('--spot-o', 1);
      wake();
    });
    root.addEventListener('mouseleave', () => { tx = 50; ty = 50; panel.style.setProperty('--spot-o', 0); wake(); });
    // the lean stays with reduced motion too: a degree or so, eased (a deliberate choice)
    panel.addEventListener('mousemove', (e) => {
      const r = untilted(() => panel.getBoundingClientRect());
      const nx = (e.clientX - r.left) / r.width * 2 - 1, ny = (e.clientY - r.top) / r.height * 2 - 1;
      // rotateX > 0 brings the bottom edge forward, rotateY > 0 the left one
      trx = TILT.x * ny; try_ = -TILT.y * nx;
      wake();
    });
    panel.addEventListener('mouseleave', () => { trx = try_ = 0; wake(); });
    wake();
  }

  /* ---- app hotkeys: ⇧R reset, ⇧D download, ⇧C copy, ⇧S sidebar, ⇧1–5 shortcut (physical keys never activate keys) ---- */
  function resetSettings() {
    try { localStorage.removeItem(STORE); } catch (e) { /* nothing saved */ }
    location.reload();
  }
  function bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t && t.matches && t.matches('input, textarea, [contenteditable]')) return;
      // ⌘⇧R (ctrl ⇧R off a Mac): every setting back to its default, colours included; it takes
      // the browser's hard reload, which it ends with anyway
      if (e.shiftKey && (e.metaKey || e.ctrlKey) && !e.altKey && (e.key || '').toLowerCase() === 'r') {
        e.preventDefault(); resetSettings(); return;
      }
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // the key's label, not its position, so ⇧D is D on QWERTY, AZERTY, Dvorak or Colemak alike
      const key = (e.key || '').toLowerCase();
      if (key === 'd') { e.preventDefault(); exportNow(); }
      else if (key === 'c') { e.preventDefault(); copyNow(); }
      else if (key === 'r') { e.preventDefault(); reset(); }
      else if (key === 's') { e.preventDefault(); toggleRail(); }
      // ⇧1 to ⇧5: the shortcut to edit (or, multi shortcut off, the colour), by the digit key's
      // place, which AZERTY shifts too
      else if (/^Digit[1-5]$/.test(e.code)) { e.preventDefault(); setAccent(+e.code.slice(5) - 1); }
    });
  }

  /* Footer version tag, from config.js — the only source: the HTML is empty, so it never
     shows a stale version, and stays hidden if config.js is absent. With archived versions
     (KSV_ARCHIVE) the tag opens a menu, upward: the current version, then each archive,
     which opens in a new tab so the current one stays where it is. */
  function renderVersion() {
    if (typeof KSV_VERSION === 'undefined') return;
    const wrap = document.querySelector('.ver-menu'), btn = $('verBtn'), list = $('verList');
    const archive = typeof KSV_ARCHIVE !== 'undefined' ? KSV_ARCHIVE : [];
    wrap.hidden = false;
    btn.innerHTML = KSV_VERSION + (archive.length ? KSV.icon('chevron') : '');
    btn.setAttribute('aria-label', 'version ' + KSV_VERSION + (archive.length ? ', other versions' : ''));
    if (!archive.length) { btn.disabled = true; return; }
    list.innerHTML = '<span class="ver-item is-current" role="menuitem" aria-current="true" tabindex="-1">' + KSV_VERSION + '<em>current</em></span>' +
      archive.map((v) => '<a class="ver-item" role="menuitem" tabindex="-1" href="' + v.href + '" target="_blank" rel="noopener">' + v.version + '<em>' + v.label + KSV.icon('external') + '</em></a>').join('');
    const items = () => [...list.querySelectorAll('.ver-item')];
    const open = (on, focusFirst) => {
      list.hidden = !on; btn.setAttribute('aria-expanded', on);
      if (on && focusFirst) items()[0].focus();
    };
    btn.onclick = () => open(list.hidden, false);
    btn.onkeydown = (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); open(true, true); } };
    list.onkeydown = (e) => {
      const all = items(), i = all.indexOf(document.activeElement);
      if (e.key === 'Escape') { open(false); btn.focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        all[(i + (e.key === 'ArrowDown' ? 1 : all.length - 1)) % all.length].focus();
      }
    };
    document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) open(false); });
  }

  // static markup asks for glyphs with <i data-icon="name"></i>; fill them from the shared ICONS
  function renderIcons() {
    document.querySelectorAll('[data-icon]').forEach((n) => { n.outerHTML = KSV.icon(n.dataset.icon); });
  }

  /* ---- init ---- */
  function init() {
    FORMATS.forEach((f) => { if (KSV.canEncode(f)) encodable.add(f); });
    restore(); // load saved UI options; the key selection stays at its default
    if (!encodable.has(ui.ext)) ui.ext = 'png';
    state.lr = ui.lr; state.combo = ui.combo; state.doubleTap = ui.doubleTap; state.multi = ui.multi; state.kb = ui.kb; state.look = ui.look; state.superKey = ui.pcKey;
    state.layers.forEach((l, i) => { l.color = ui.colors[i]; });
    state.active = ui.active;
    state.layers[state.active].sel = state.sel; // ⌘K starts in the remembered colour's shortcut
    setAccent(ui.active); // sets root --accent/--onFg

    // mount the interactive keyboard; onChange fires on every click
    mountKeyboard();

    renderHyper(); renderLr(); renderCombo(); renderDbl(); renderMulti(); renderPickers(); renderRail(true);
    $('railBtn').onclick = toggleRail;
    renderLayout(); renderExt(); renderTheme(); renderBgSeg(); renderShow(); renderSurface(); renderCapsOpts(); renderSwatches();
    renderVersion();
    renderIcons();
    exportBtn.onclick = exportNow;
    $('smallScreenClose').onclick = () => $('smallScreenClose').parentNode.remove();
    copyBtn.onclick = copyNow;
    Object.assign(scaleRange, { min: SCALE.min, max: SCALE.max, step: SCALE.step });
    scaleRange.oninput = () => setScale(+scaleRange.value);

    alignToGrid();
    new ResizeObserver(alignToGrid).observe(root.querySelector('.stage'));
    // the title's font can move the case; the keycaps preview draws with the webfont
    document.fonts.ready.then(() => { alignToGrid(); refresh(); });

    startGlow();
    bindHotkeys();
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
