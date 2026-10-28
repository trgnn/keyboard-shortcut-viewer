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
  // per-background paint options handed to the exporters.
  // keyBg comes from the shared solid key colour (KSV.KEYBG) so it can't drift from the preview.
  const KEYBG = KSV.KEYBG;
  const EXPORT_BG = {
    dark: { bg: '#0a0b0d', keyBg: KEYBG, keyBorder: 'rgba(255,255,255,.08)', plus: '#5a616b' },
    light: { bg: '#f3f0f8', keyBg: KEYBG, keyBorder: 'rgba(255,255,255,.08)', plus: '#9aa094' },
    trans: { bg: 'transparent', keyBg: KEYBG, keyBorder: 'rgba(255,255,255,.12)', plus: '#5a616b' }
  };

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
  const preview = $('preview');
  const sizeCap = $('sizeCap');
  const scaleRange = $('scaleRange');
  const scaleVal = $('scaleVal');
  const exportBtn = $('exportBtn');
  const previewLbl = $('previewLbl');
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
  // dim: grey out the keys that can't be added, in the keyboard export and its preview
  const ui = { layout: 'board', bg: 'dark', ext: 'png', scale: 2, dim: true, accent: ACCENTS[0], hyper: 'off', lr: false };

  /* ---- persistence: remember UI options across reloads (NOT the key selection) ---- */
  const STORE = 'ksv-ui-v1';
  function persist() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        layout: ui.layout, bg: ui.bg, ext: ui.ext, scale: ui.scale, dim: ui.dim, accent: ui.accent, hyper: ui.hyper, lr: ui.lr
      }));
    } catch (e) { /* storage unavailable (private mode, etc.) — just don't persist */ }
  }
  function restore() {
    let s;
    try { s = JSON.parse(localStorage.getItem(STORE) || '{}'); } catch (e) { return; }
    if (!s || typeof s !== 'object') return;
    if (LAYOUTS.includes(s.layout)) ui.layout = s.layout;
    if (['dark', 'light', 'trans'].includes(s.bg)) ui.bg = s.bg;
    if (FORMATS.includes(s.ext)) ui.ext = s.ext;
    if (typeof s.scale === 'number' && s.scale >= SCALE.min && s.scale <= SCALE.max) ui.scale = s.scale;
    if (ACCENTS.includes(s.accent)) ui.accent = s.accent;
    if (['off', 'caom', 'scaom'].includes(s.hyper)) ui.hyper = s.hyper;
    if (typeof s.lr === 'boolean') ui.lr = s.lr;
    if (typeof s.dim === 'boolean') ui.dim = s.dim;
    // re-apply the guards the change handlers enforce, in case of an invalid saved combo
    if (ui.ext === 'jpg' && ui.bg === 'trans') ui.bg = 'dark';
  }

  /* ---- small helpers ---- */
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
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
  function updatePreview() {
    applyHyper();
    preview.className = 'prev-card bg-' + effBg();
    preview.style.setProperty('--accent', ui.accent);
    preview.style.setProperty('--onFg', fgFor(ui.accent));
    preview.innerHTML = '';
    if (ui.layout === 'board') {
      preview.classList.add('is-board');
      const board = KSV.buildBoardPreview(state, { dim: ui.dim });
      preview.appendChild(board);
      const aw = Math.max(120, preview.clientWidth - 28);
      const g = Math.max(2, aw / 1100 * 7);
      const colW = (aw - (COLS - 1) * g) / COLS;
      const kh = Math.max(12, 4 * colW + 3 * g); // square letter keys, matching the export
      board.style.setProperty('--keyH', kh + 'px');
      board.style.setProperty('--g', g + 'px');
      // labels size from --keyH via the shared KEYSPEC ratios (no per-view font tuning)
      updateCapsKey(board); // reflect the hyperkey glyph in the preview too
    } else {
      preview.classList.remove('is-board');
      KSV.renderCaps(preview, state);
      const row = preview.querySelector('.ksv-capsrow');
      if (row) {
        row.style.transform = '';
        const avail = preview.clientWidth - 28, w = row.scrollWidth;
        if (w > avail && avail > 0) row.style.transform = 'scale(' + avail / w + ')';
      }
    }
  }

  function updateMeta() {
    const svg = ui.ext === 'svg', boardLike = ui.layout === 'board';
    const out = boardLike ? KSV.boardSize(svg ? 1 : ui.scale) : KSV.exportSize(state, svg ? 1 : ui.scale);
    sizeCap.textContent = svg ? 'vector' : (out ? out.w + ' × ' + out.h + ' px' : '—');
    // the scale only applies to raster output
    scaleRange.disabled = svg;
    scaleRange.closest('.scale-row').classList.toggle('disabled', svg);
    scaleRange.value = ui.scale;
    scaleRange.style.setProperty('--fill', (ui.scale - SCALE.min) / (SCALE.max - SCALE.min) * 100 + '%');
    scaleVal.textContent = ui.scale + '×';
    // the format is already chosen in the output group: the preview label names it, the button doesn't
    previewLbl.textContent = '// preview ' + ui.ext;
    exportBtn.innerHTML = KSV.icon('download') + 'export';
    // browsers only put PNG and SVG on the clipboard: copy is off for jpg / webp
    copyBtn.innerHTML = KSV.icon('copy') + 'copy';
    copyBtn.disabled = !COPYABLE.has(ui.ext);
    copyBtn.title = ui.ext === 'svg' ? 'Copy the SVG (image and code)'
      : ui.ext === 'png' ? 'Copy the PNG' : 'Browsers can’t put a ' + ui.ext.toUpperCase() + ' on the clipboard: export it, or pick PNG';
  }

  // full refresh after any state change (no keyboard rebuild)
  function refresh() {
    applyHyper();
    const kb = kbEl();
    if (kb) KSV.paint(kb, state);
    updateCapsKey();
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
  function renderLayout() {
    renderSeg($('layoutSeg'), [['board', 'keyboard'], ['keycaps', 'keycaps<span class="seg-beta">beta</span>']], ui.layout, false, changeLayout);
  }
  function renderExt() {
    renderSeg($('extSeg'), FORMATS.map((f) => [f, f, !encodable.has(f)]), ui.ext, false, changeExt);
  }
  // greyed-out keys only exist on the full keyboard
  function renderDim() {
    renderSeg($('dimSeg'), [['on', 'dimmed', false, 'unavailable keys dimmed'], ['off', 'normal', false, 'unavailable keys drawn normally']],
      ui.dim ? 'on' : 'off', ui.layout !== 'board', (v) => { ui.dim = v === 'on'; renderDim(); refresh(); });
  }
  function renderBgSeg() {
    const locked = ui.ext === 'svg';
    renderSeg($('bgSeg'), [['dark', 'dark'], ['light', 'light'], ['trans', 'alpha', ui.ext === 'jpg']], effBg(), locked, setBg);
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
    renderLayout(); renderDim(); refresh();
  }
  function cycleLayout() {
    changeLayout(LAYOUTS[(LAYOUTS.indexOf(ui.layout) + 1) % LAYOUTS.length]);
  }
  function changeExt(v) {
    ui.ext = v;
    if (v === 'jpg' && ui.bg === 'trans') ui.bg = 'dark';
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
  function reset() {
    state.sel = new Set(); state.dbl = new Set();
    refresh();
  }
  // everything the engine needs to render the output configured in the rail
  function exportOpts() {
    applyHyper();
    const bgKey = effBg();
    return Object.assign({}, EXPORT_BG[bgKey], {
      layout: ui.layout, hyper: ui.accent, hyperFg: fgFor(ui.accent), accent: ui.accent, format: ui.ext, scale: ui.scale, dim: ui.dim,
      // filename hints: which view and which background the user picked (alpha = transparent)
      bgName: bgKey === 'trans' ? 'alpha' : bgKey
    });
  }
  function exportNow() { KSV.exportImage(state, exportOpts()); }
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

  /* ---- cursor glow on the grid background behind the keyboard ----
     Eases toward the cursor and stops once settled: the loop only runs while something
     moves, and restarts on the next mouse move. The variables go on the two elements
     that read them (.grid-lit for the glow, .stage for the selected keys' shadow), not
     on the app root, so a frame doesn't restyle the whole page. Off with reduced motion. */
  function startGlow() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lit = root.querySelector('.grid-lit'), stage = root.querySelector('.stage');
    let tx = 50, ty = 50, cx = 50, cy = 50, sz = 90, vx = 0, vy = 0, ltx = 50, lty = 50, raf = 0;
    const clamp = (v) => Math.max(-7, Math.min(7, v));
    const tick = () => {
      const dvx = tx - ltx, dvy = ty - lty; ltx = tx; lty = ty;
      vx += (dvx - vx) * 0.18; vy += (dvy - vy) * 0.18;
      cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
      const gap = Math.hypot(tx - cx, ty - cy), target = 80 + Math.min(gap * 11, 170);
      sz += (target - sz) * 0.08;
      lit.style.setProperty('--gx', cx + '%');
      lit.style.setProperty('--gy', cy + '%');
      lit.style.setProperty('--glow-r', sz + 'px');
      lit.style.setProperty('--vx', clamp(vx * 0.7) + 'px');
      lit.style.setProperty('--vy', clamp(vy * 0.7) + 'px');
      stage.style.setProperty('--glow-x', clamp((cx - 50) / 50 * 7).toFixed(2) + 'px');
      stage.style.setProperty('--glow-y', clamp((cy - 50) / 50 * 7).toFixed(2) + 'px');
      const settled = gap < 0.05 && Math.abs(vx) < 0.01 && Math.abs(vy) < 0.01 && Math.abs(target - sz) < 0.5;
      raf = settled ? 0 : requestAnimationFrame(tick);
    };
    const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
    root.addEventListener('mousemove', (e) => {
      const r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width * 100;
      ty = (e.clientY - r.top) / r.height * 100;
      wake();
    });
    root.addEventListener('mouseleave', () => { tx = 50; ty = 50; wake(); });
    wake();
  }

  /* ---- app hotkeys: ⇧R reset, ⇧L change layout, ⇧D download, ⇧C copy (physical keys never activate keys) ---- */
  function bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t && t.matches && t.matches('input, textarea, [contenteditable]')) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyD') { e.preventDefault(); exportNow(); }
      else if (e.code === 'KeyC') { e.preventDefault(); copyNow(); }
      else if (e.code === 'KeyR') { e.preventDefault(); reset(); }
      else if (e.code === 'KeyL') { e.preventDefault(); cycleLayout(); }
    });
  }

  /* Footer milestone version, from config.js (KSV_VERSION). Guarded so the
     footer still renders its static fallback if config.js is ever absent. */
  function renderVersion() {
    if (typeof KSV_VERSION === 'undefined') return;
    const el = document.querySelector('.cf-ver');
    if (el) el.textContent = KSV_VERSION;
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
    state.lr = ui.lr;
    setAccent(ui.accent); // sets root --accent/--onFg

    // mount the interactive keyboard; onChange fires on every click
    kbMount.appendChild(KSV.buildKeyboard(state, refresh));

    renderHyper(); renderLr(); renderLayout(); renderExt(); renderBgSeg(); renderDim(); renderSwatches();
    renderVersion();
    renderIcons();
    $('resetBtn').onclick = reset;
    exportBtn.onclick = exportNow;
    copyBtn.onclick = copyNow;
    Object.assign(scaleRange, { min: SCALE.min, max: SCALE.max, step: SCALE.step });
    scaleRange.oninput = () => setScale(+scaleRange.value);

    fitKeys();
    new ResizeObserver(fitKeys).observe(kbMount);

    startGlow();
    bindHotkeys();
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
