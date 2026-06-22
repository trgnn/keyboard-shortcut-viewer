/* Keyboard Shortcut Viewer — vanilla UI shell.
   The keyboard engine lives in ksv.js (window.KSV); this file wires the page:
   selection state, the segmented controls, accent, the export preview, and download. */
(function () {
  'use strict';

  /* ---- config ---- */
  const ACCENTS = ['#22d3ee', '#ff7a1a', '#9d4bff', '#ff3d8b', '#b7ff4a'];
  const HYPER_OPTS = [['off', 'off'], ['caom', '⌃⌥⌘'], ['scaom', '⇧⌃⌥⌘']];
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
  const downloadBtn = $('downloadBtn');

  /* ---- state ---- */
  // engine state (shared with KSV)
  const state = { sel: new Set(['cmd', 'k']), dbl: new Set(), lr: false, hyper: false, locked: new Set() };
  // UI state
  const ui = { layout: 'keycaps', bg: 'dark', ext: 'png', scale: 2, accent: ACCENTS[0], hyper: 'off', lr: false };

  /* ---- small helpers ---- */
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const kbEl = () => kbMount.querySelector('.ksv-kb');

  // (re)build a segmented control. options: [value, label, optDisabled?][]
  function renderSeg(container, options, value, disabled, onChange) {
    container.classList.toggle('disabled', !!disabled);
    container.innerHTML = '';
    options.forEach(([v, l, optDisabled]) => {
      const off = disabled || optDisabled;
      const b = el('button', (value === v ? 'on' : '') + (off ? ' is-off' : ''), l);
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
    if (cap) cap.textContent = active ? '❖' : '⇪';
    if (sub) sub.textContent = active ? 'hyper' : 'caps';
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
      const board = KSV.buildBoardPreview(state);
      preview.appendChild(board);
      const aw = Math.max(120, preview.clientWidth - 28);
      const g = Math.max(2, aw / 1100 * 7);
      const colW = (aw - 57 * g) / 58;
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
    sizeCap.textContent = (svg && !boardLike) ? 'vector' : (out ? out.w + ' × ' + out.h + ' px' : '—');
    downloadBtn.textContent = '↓ download ' + ui.ext;
  }

  // full refresh after any state change (no keyboard rebuild)
  function refresh() {
    applyHyper();
    const kb = kbEl();
    if (kb) KSV.paint(kb, state);
    updateCapsKey();
    updatePreview();
    updateMeta();
  }

  /* ---- segmented controls ---- */
  function renderHyper() {
    renderSeg($('hyperSeg'), HYPER_OPTS, ui.hyper, false, (v) => { ui.hyper = v; renderHyper(); refresh(); });
  }
  function renderLr() {
    renderSeg($('lrSeg'), [['off', 'off'], ['on', 'on']], ui.lr ? 'on' : 'off', false, (v) => setLr(v === 'on'));
  }
  function renderLayout() {
    renderSeg($('layoutSeg'), [['keycaps', 'keycaps'], ['board', 'keyboard']], ui.layout, false, changeLayout);
  }
  function renderExt() {
    const list = (ui.layout === 'board' ? ['png', 'jpg', 'webp'] : ['png', 'jpg', 'webp', 'svg']).map((f) => [f, f]);
    renderSeg($('extSeg'), list, ui.ext, false, changeExt);
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
      b.onclick = () => setAccent(hex);
      c.appendChild(b);
    });
  }

  /* ---- handlers ---- */
  const LAYOUTS = ['keycaps', 'board'];
  function changeLayout(v) {
    ui.layout = v;
    if (v === 'board' && ui.ext === 'svg') ui.ext = 'png';
    renderLayout(); renderExt(); renderBgSeg(); refresh();
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
  function setAccent(hex) {
    ui.accent = hex;
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--onFg', fgFor(hex));
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
  function exportNow() {
    applyHyper();
    const onFg = fgFor(ui.accent);
    const bgKey = effBg();
    const o = Object.assign({}, EXPORT_BG[bgKey], {
      hyper: ui.accent, hyperFg: onFg, accent: ui.accent, format: ui.ext, scale: ui.scale,
      // filename hints: which view and which background the user picked (alpha = transparent)
      bgName: bgKey === 'trans' ? 'alpha' : bgKey
    });
    if (ui.layout === 'board') KSV.exportBoard(state, o); else KSV.exportPNG(state, o);
  }

  /* ---- key sizing: make letter/number keys (span 4) render as true squares ---- */
  function fitKeys() {
    const kb = kbEl();
    if (!kb) return;
    const W = kb.clientWidth;
    if (!W) return;
    const g = parseFloat(getComputedStyle(kb).getPropertyValue('--g')) || 6;
    const colW = (W - 57 * g) / 58;
    const unit = 4 * colW + 3 * g;
    kb.style.setProperty('--keyH', unit + 'px'); // fn keys share this height (square, like the letters)
  }

  /* ---- cursor glow on the grid background behind the keyboard ---- */
  function startGlow() {
    let tx = 50, ty = 50, cx = 50, cy = 50, sz = 90, vx = 0, vy = 0, ltx = 50, lty = 50, raf;
    const onMove = (e) => {
      const r = root.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width * 100;
      ty = (e.clientY - r.top) / r.height * 100;
    };
    const onLeave = () => { tx = 50; ty = 50; };
    const tick = () => {
      const dvx = tx - ltx, dvy = ty - lty; ltx = tx; lty = ty;
      vx += (dvx - vx) * 0.18; vy += (dvy - vy) * 0.18;
      cx += (tx - cx) * 0.1; cy += (ty - cy) * 0.1;
      const gap = Math.hypot(tx - cx, ty - cy);
      sz += (80 + Math.min(gap * 11, 170) - sz) * 0.08;
      root.style.setProperty('--gx', cx + '%');
      root.style.setProperty('--gy', cy + '%');
      root.style.setProperty('--glow-r', sz + 'px');
      root.style.setProperty('--vx', Math.max(-7, Math.min(7, vx * 0.7)) + 'px');
      root.style.setProperty('--vy', Math.max(-7, Math.min(7, vy * 0.7)) + 'px');
      root.style.setProperty('--glow-x', Math.max(-7, Math.min(7, (cx - 50) / 50 * 7)).toFixed(2) + 'px');
      root.style.setProperty('--glow-y', Math.max(-7, Math.min(7, (cy - 50) / 50 * 7)).toFixed(2) + 'px');
      raf = requestAnimationFrame(tick);
    };
    tick();
    root.addEventListener('mousemove', onMove);
    root.addEventListener('mouseleave', onLeave);
  }

  /* ---- app hotkeys: ⇧R reset, ⇧L change layout, ⇧D download (physical keys never activate keys) ---- */
  function bindHotkeys() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t && t.matches && t.matches('input, textarea, [contenteditable]')) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === 'KeyD') { e.preventDefault(); exportNow(); }
      else if (e.code === 'KeyR') { e.preventDefault(); reset(); }
      else if (e.code === 'KeyL') { e.preventDefault(); cycleLayout(); }
    });
  }

  /* ---- init ---- */
  function init() {
    state.lr = ui.lr;
    setAccent(ui.accent); // sets root --accent/--onFg

    // mount the interactive keyboard; onChange fires on every click
    kbMount.appendChild(KSV.buildKeyboard(state, refresh));

    renderHyper(); renderLr(); renderLayout(); renderExt(); renderBgSeg(); renderSwatches();
    $('resetBtn').onclick = reset;
    downloadBtn.onclick = exportNow;

    fitKeys();
    new ResizeObserver(fitKeys).observe(kbMount);

    startGlow();
    bindHotkeys();
    refresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
