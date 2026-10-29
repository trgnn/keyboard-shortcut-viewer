/* Keyboard Shortcut Viewer — vanilla UI shell.
   The keyboard engine lives in ksv.js (window.KSV); this file wires the page:
   selection state, the segmented controls, accent, the export preview, and download. */
(function () {
  'use strict';

  /* ---- config ---- */
  const COLS = KSV.COLS; // keyboard grid width (shared with the engine/export)
  const ACCENTS = ['#22d3ee', '#ff7a1a', '#9d4bff', '#ff3d8b', '#b7ff4a'];
  const icons = (names) => '<span class="ic-row">' + names.map(KSV.icon).join('') + '</span>';
  // [value, label, disabled, spoken label] — the icon-only options need the last one
  const HYPER_OPTS = [['off', 'off'],
    ['caom', icons(['ctrl', 'opt', 'cmd']), false, 'control option command'],
    ['scaom', icons(['shift', 'ctrl', 'opt', 'cmd']), false, 'shift control option command']];
  // export formats; one the browser's canvas can't encode is shown disabled (see init)
  const FORMATS = ['png', 'jpg', 'webp', 'svg'];
  // formats the clipboard takes (checked in Chrome 152: JPEG and WebP are refused)
  const COPYABLE = new Set(['png', 'svg']);
  // raster export scale: 1× is the export's base size, the slider multiplies it
  const SCALE = { min: 1, max: 4, step: 0.5 };
  const HYPER_LOCK = {
    caom: ['ctrl', 'opt', 'cmd', 'rcmd', 'ropt'],
    scaom: ['ctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']
  };
  // canvas and export colours come from the engine's theme table (KSV.THEMES): dark / light
  const THEMES = KSV.THEMES;

  /* pick legible on-accent text by real (WCAG) contrast ratio */
  function fgFor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return '#0a0b0d';
    const n = parseInt(m[1], 16);
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255);
    const cDark = (L + 0.05) / 0.05;   // contrast vs near-black text
    const cLight = 1.05 / (L + 0.05);  // contrast vs white text
    return cDark >= cLight ? '#0a0b0d' : '#ffffff';
  }

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
  const state = { sel: new Set(['cmd', 'k']), dbl: new Set(), lr: false, hyper: false, locked: new Set() };
  // UI state
  // PNG by default: crisp key edges and labels, and the only raster format the clipboard takes.
  // frame / grid: the page's keyboard case and background grid, drawn in the keyboard export
  // surface: solid keys and case, or the page's translucent ones
  // theme: dark / light, for the keyboard, the frame and the whole page; bg: filled or transparent
  // defaults = the page's own look, so the canvas and the export start out identical
  // keycaps only: plus, where the "+" goes (between all keys, before the trigger key, none);
  // glow, which keys get the selected look (all, the modifiers, the trigger key, none)
  const ui = { layout: 'board', theme: 'dark', bg: 'fill', ext: 'png', scale: 2, frame: true, grid: true, surface: 'translucent',
    plus: 'key', glow: 'mods', accent: ACCENTS[0], hyper: 'off', lr: false, combo: false };

  /* ---- persistence: remember UI options across reloads (NOT the key selection) ---- */
  const STORE = 'ksv-ui-v1';
  let saved = '';
  function persist() {
    const json = JSON.stringify({
      layout: ui.layout, theme: ui.theme, bg: ui.bg, ext: ui.ext, scale: ui.scale, frame: ui.frame, grid: ui.grid,
      surface: ui.surface, plus: ui.plus, glow: ui.glow, accent: ui.accent, hyper: ui.hyper, lr: ui.lr, combo: ui.combo
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
    if (ACCENTS.includes(s.accent)) ui.accent = s.accent;
    if (['off', 'caom', 'scaom'].includes(s.hyper)) ui.hyper = s.hyper;
    if (typeof s.lr === 'boolean') ui.lr = s.lr;
    if (typeof s.combo === 'boolean') ui.combo = s.combo;
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
    if (sub) sub.textContent = active ? 'hyper' : 'caps';
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
    exportBtn.innerHTML = KSV.icon('download') + 'export';
    // keycaps with nothing selected: there's no image to make, so no export or copy
    const empty = ui.layout !== 'board' && !out;
    exportBtn.disabled = empty;
    exportBtn.title = empty ? 'Select keys to export' : '';
    // browsers only put PNG and SVG on the clipboard: copy is off for jpg / webp
    copyBtn.innerHTML = KSV.icon('copy') + 'copy';
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
      '--accent-ink': KSV.ink(ui.accent, ui.theme)
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
    syncSpotLayer();
    updatePreview();
    updateMeta();
    persist();
  }

  /* ---- segmented controls ---- */
  function renderHyper() {
    renderSeg($('hyperSeg'), HYPER_OPTS, ui.hyper, false, (v) => { ui.hyper = v; renderHyper(); refresh(); });
  }
  function renderLr() {
    renderSeg($('lrSeg'), [['off', 'off'], ['on', 'on']], ui.lr ? 'on' : 'off', false, (v) => setLr(v === 'on'));
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
  function renderSwatches() {
    const c = $('accentSwatches');
    c.innerHTML = '';
    ACCENTS.forEach((hex) => {
      const b = el('button', 'sw-chip' + (ui.accent === hex ? ' on' : ''));
      b.style.background = hex;
      b.setAttribute('aria-label', 'accent ' + hex);
      b.setAttribute('aria-pressed', ui.accent === hex);
      b.onclick = () => setAccent(hex);
      c.appendChild(b);
    });
  }

  /* ---- handlers ---- */
  const LAYOUTS = ['board', 'keycaps'];
  function changeLayout(v) {
    ui.layout = v;
    renderLayout(); renderShow(); renderSurface(); renderCapsOpts(); refresh();
  }
  function cycleLayout() {
    changeLayout(LAYOUTS[(LAYOUTS.indexOf(ui.layout) + 1) % LAYOUTS.length]);
  }
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
  function setAccent(hex) {
    ui.accent = hex;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--onFg', fgFor(hex));
    setFavicon(hex);
    renderSwatches(); refresh();
  }
  function setLr(on) {
    ui.lr = on; state.lr = on;
    if (!on) {
      [['rcmd', 'cmd'], ['ropt', 'opt'], ['rshift', 'lshift']].forEach(([r, l]) => {
        if (state.sel.has(r) && state.sel.has(l)) state.sel.delete(r);
      });
    }
    renderLr(); refresh();
  }
  // combo mode: trigger keys stack. Off again, only the last one clicked stays
  function setCombo(on) {
    ui.combo = on; state.combo = on;
    if (!on) {
      const keys = [...state.sel].filter((c) => !KSVSelect.MODS.has(c));
      keys.slice(0, -1).forEach((c) => state.sel.delete(c));
    }
    renderCombo(); refresh();
  }
  function reset() {
    state.sel = new Set(); state.dbl = new Set();
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
  function exportNow() { if (!exportBtn.disabled) KSV.exportImage(state, exportOpts()); }
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
    try { KSV.copyImage(state, exportOpts()).then(() => done(true), () => done(false)); }
    catch (e) { done(false); }
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
  function syncSpotLayer() {
    if (!spot) return;
    const real = kbEl(), copy = spot.querySelector('.ksv-kb');
    copy.style.cssText = real.style.cssText;
    const r = real.getBoundingClientRect(), o = spot.getBoundingClientRect(); // sub-pixel exact
    Object.assign(copy.style, { left: r.left - o.left + 'px', top: r.top - o.top + 'px', width: r.width + 'px' });
    const keys = real.querySelectorAll('.ksv-key'), ghosts = copy.querySelectorAll('.ksv-key');
    keys.forEach((k, i) => { if (ghosts[i]) ghosts[i].className = k.className; });
  }

  /* ---- the background grid lines up with the keyboard case ----
     The case is sized to whole grid cells (+1 px so its right and bottom borders land on a
     line too): the content column snaps its width down, the case pads its height up, split
     top and bottom. Then the grid's origin moves onto the case's top-left corner. */
  function alignToGrid() {
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
      // the same light on the case's and keys' hairlines, in viewport px (see styles.css)
      const a = root.getBoundingClientRect();
      panel.style.setProperty('--spot-x', a.left + cx / 100 * a.width + 'px');
      panel.style.setProperty('--spot-y', a.top + cy / 100 * a.height + 'px');
      panel.style.setProperty('--spot-r', sz * 1.2 + 'px');
      const settled = gap < 0.05 && Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01 && Math.abs(target - sz) < 0.5;
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
    wake();
  }

  /* ---- app hotkeys: ⇧R reset, ⇧L change layout, ⇧D download, ⇧C copy (physical keys never activate keys) ---- */
  function bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t && t.matches && t.matches('input, textarea, [contenteditable]')) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      // the key's label, not its position, so ⇧D is D on QWERTY, AZERTY, Dvorak or Colemak alike
      const key = (e.key || '').toLowerCase();
      if (key === 'd') { e.preventDefault(); exportNow(); }
      else if (key === 'c') { e.preventDefault(); copyNow(); }
      else if (key === 'r') { e.preventDefault(); reset(); }
      else if (key === 'l') { e.preventDefault(); cycleLayout(); }
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
    state.lr = ui.lr; state.combo = ui.combo;
    setAccent(ui.accent); // sets root --accent/--onFg

    // mount the interactive keyboard; onChange fires on every click
    kbMount.appendChild(KSV.buildKeyboard(state, refresh));
    buildSpotLayer();

    renderHyper(); renderLr(); renderCombo(); renderLayout(); renderExt(); renderTheme(); renderBgSeg(); renderShow(); renderSurface(); renderCapsOpts(); renderSwatches();
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
