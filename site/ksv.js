/* Keyboard Shortcut Viewer — shared data, render, interaction, export.
   Exposes window.KSV; app.js builds the page with it (KSV.buildKeyboard, KSV.exportImage…). */
(function () {
  /* ---- glyphs: SVG paths on a 24-unit box, so they look the same on every OS ----
     Unicode glyphs (⌘ ⌥ ⇧ ▲ …) render from whatever font the system falls back to,
     and some (▶ ◀) can even turn into emoji. These paths are the single source:
     the DOM inlines them as <svg> (icon), the canvas exporters replay them with
     Path2D (drawIcon), and the SVG export embeds them (svgIcon). `fill` glyphs are
     solid; the rest are round-capped strokes of ICON_STROKE units. */
  const ICON_STROKE = 1.75;
  const ICONS = {
    cmd:   { d: 'M9 9V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V9' },
    opt:   { d: 'M3 6h5l8 12h5M14 6h7' },
    ctrl:  { d: 'M6 14.5l6-6 6 6' },
    shift: { d: 'M12 3.5L3.5 12H8v8h8v-8h4.5z' },
    caps:  { d: 'M12 3.5L3.5 11.5H8V15h8v-3.5h4.5zM8 20h8' },
    tab:   { d: 'M3.5 12h14M12.5 7l5 5-5 5M20.5 6v12' },
    ret:   { d: 'M19.5 5v6a3 3 0 0 1-3 3H5M9 10l-4 4 4 4' },
    del:   { d: 'M8.5 5h12v14h-12L2.5 12zM11.5 9l6 6M17.5 9l-6 6' },
    globe: { d: 'M2.55 12a9.45 9.45 0 1 0 18.9 0a9.45 9.45 0 1 0-18.9 0M7.95 12a4.05 9.45 0 1 0 8.1 0a4.05 9.45 0 1 0-8.1 0M2.55 12h18.9' },
    hyper: { d: 'M12 2.5l4 4-4 4-4-4zM17.5 8l4 4-4 4-4-4zM12 13.5l4 4-4 4-4-4zM6.5 8l4 4-4 4-4-4z', fill: true },
    up:    { d: 'M12 5.5l7.5 12.5h-15z', fill: true },
    down:  { d: 'M12 18.5L19.5 6h-15z', fill: true },
    left:  { d: 'M5.5 12L18 4.5v15z', fill: true },
    right: { d: 'M18.5 12L6 4.5v15z', fill: true },
    // UI chrome (buttons / links), not keys
    reset:    { d: 'M4 12a8 8 0 1 0 2.34-5.66L4 8.5M4 4v4.5h4.5' },
    download: { d: 'M12 4v12M6.5 10.5L12 16l5.5-5.5M5 20h14' },
    external: { d: 'M7 17L17 7M9 7h8v8' },
    copy:     { d: 'M9 9h10.5v10.5H9zM15 9V4.5H4.5V15H9' },
    check:    { d: 'M5 12.5l4.5 4.5L19 7.5' },
    chevron:  { d: 'M7 14l5-5 5 5' },
    cross:    { d: 'M6.5 6.5l11 11M17.5 6.5l-11 11' }
  };
  const iconPaint = (I) => I.fill
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="' + ICON_STROKE + '" stroke-linecap="round" stroke-linejoin="round"';
  // inline <svg> for the DOM — 1em square, coloured by currentColor
  function icon(name) {
    const I = ICONS[name];
    return '<svg class="ic" viewBox="0 0 24 24" width="1em" height="1em" ' + iconPaint(I) + ' aria-hidden="true"><path d="' + I.d + '"/></svg>';
  }
  // canvas: draw an icon in the size\u00D7size box whose top-left is (x, y)
  const PATHS = {};
  function drawIcon(ctx, name, x, y, size, color) {
    const I = ICONS[name], p = PATHS[name] || (PATHS[name] = new Path2D(I.d));
    ctx.save(); ctx.translate(x, y); ctx.scale(size / 24, size / 24);
    if (I.fill) { ctx.fillStyle = color; ctx.fill(p); }
    else { ctx.strokeStyle = color; ctx.lineWidth = ICON_STROKE; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(p); }
    ctx.restore();
  }
  // SVG export: the same icon as a positioned <path>
  function svgIcon(name, x, y, size, color) {
    const I = ICONS[name];
    return '<path transform="translate(' + x + ' ' + y + ') scale(' + size / 24 + ')" d="' + I.d + '" ' +
      iconPaint(I).replace(/currentColor/g, color) + '/>';
  }
  // key-label font, shared by the DOM (--key) and every exporter: Inter, self-hosted as
  // "KSV Inter" (fonts/, built by tools/build-fonts.py) so a locally installed Inter of
  // another version can't stand in. The SVG export draws its outlines (glyphs.js).
  const UIFONT = "'KSV Inter', -apple-system, 'SF Pro Display', ui-sans-serif, system-ui, sans-serif";
  const FONT_WEIGHTS = [400, 500, 600, 700];
  // canvas only draws a webfont once it's loaded: exports wait for this
  const fontsReady = document.fonts
    ? Promise.all(FONT_WEIGHTS.map((w) => document.fonts.load(w + " 16px 'KSV Inter'"))).catch(() => {})
    : Promise.resolve();
  // glyph outlines are only needed for SVG: loaded on the first SVG export
  let glyphsReady;
  function loadGlyphs() {
    return glyphsReady || (glyphsReady = new Promise((res, rej) => {
      if (window.KSV_GLYPHS) return res();
      const sc = document.createElement('script');
      sc.src = 'glyphs.js'; sc.onload = res; sc.onerror = () => { glyphsReady = null; rej(new Error('glyphs.js failed to load')); };
      document.head.appendChild(sc);
    }));
  }
  const ready = (fmt) => Promise.all([fontsReady, fmt === 'svg' ? loadGlyphs() : null]);

  // flattened SVG text: the label as Inter outlines, laid out like canvas fillText with
  // textBaseline 'middle' (the baseline offset is measured on a canvas), so the vector
  // export matches the raster one and never depends on the viewer's fonts. No kerning:
  // the webfont subset has none either. `fill` is the attribute string to paint with.
  const BASELINE = {};
  function baselineShift(weight) { // middle line → alphabetic baseline, per px of font size
    if (!(weight in BASELINE)) {
      const c = document.createElement('canvas').getContext('2d');
      c.font = weight + ' 100px ' + UIFONT; c.textBaseline = 'middle';
      BASELINE[weight] = -c.measureText('H').alphabeticBaseline / 100;
    }
    return BASELINE[weight];
  }
  function svgText(str, x, y, t, fill) {
    const G = window.KSV_GLYPHS, weight = t.weight || 400, set = G.w[weight] || G.w[400], k = t.size / G.upm;
    let adv = 0;
    const glyphs = [];
    for (const ch of String(str)) {
      const g = set[ch] || set['?'];
      if (g[1]) glyphs.push('<path transform="translate(' + adv + ' 0)" d="' + g[1] + '"/>');
      adv += g[0];
    }
    const width = adv * k, align = t.align || 'center';
    const x0 = align === 'left' ? x : align === 'right' ? x - width : x - width / 2;
    return '<g transform="translate(' + x0 + ' ' + (y + baselineShift(weight) * t.size) + ') scale(' + k + ')"' + fill + '>' + glyphs.join('') + '</g>';
  }
  // keyboard grid width in columns — one source for the layout (applySpec sets --cols), the export, and app.js sizing
  const COLS = 58;
  // The hyperkey: Caps Lock remapped to Control+Option+Command. (mods, no shift)
  const HYPER = ['ctrl', 'opt', 'cmd'];
  // selection rules live in select.js (no DOM, tested under Node)
  const S = window.KSVSelect;
  const { DBLABLE, PAIR, DIR, canon, isOn, isDbl } = S;
  // a second click on the same modifier within this window makes it a double-tap
  const DOUBLE_MS = 220;
  // spoken names for keys whose face is a glyph or an abbreviation (letters read as is)
  const KEYNAME = {
    esc: 'escape', del: 'delete', caps: 'caps lock', ret: 'return', lshift: 'left shift', rshift: 'right shift',
    ctrl: 'control', opt: 'left option', cmd: 'left command', rcmd: 'right command', ropt: 'right option',
    space: 'space', up: 'up arrow', down: 'down arrow', left: 'left arrow', right: 'right arrow'
  };

  // main 58-col block. each key: code, label, sub(optional small line), span, cls.
  // keys with a sub-label (the .sm modifiers) take an ICONS name as their label.
  // letters/numbers span 4 (square); modifiers are trimmed so every row totals 58 cols
  const ROWS = [
    // number row
    [['`','`',null,4],['1','1',null,4],['2','2',null,4],['3','3',null,4],['4','4',null,4],
     ['5','5',null,4],['6','6',null,4],['7','7',null,4],['8','8',null,4],['9','9',null,4],
     ['0','0',null,4],['-','-',null,4],['=','=',null,4],['del','del','del',6,'mod sm ralign']],
    // qwerty
    [['tab','tab','tab',5,'mod sm'],['q','Q',null,4],['w','W',null,4],['e','E',null,4],['r','R',null,4],
     ['t','T',null,4],['y','Y',null,4],['u','U',null,4],['i','I',null,4],['o','O',null,4],
     ['p','P',null,4],['[','[',null,4],[']',']',null,4],['\\','\\',null,5]],
    // home — caps lock = hyperkey
    [['caps','caps','caps',6,'mod sm hyper'],['a','A',null,4],['s','S',null,4],['d','D',null,4],
     ['f','F',null,4],['g','G',null,4],['h','H',null,4],['j','J',null,4],['k','K',null,4],
     ['l','L',null,4],[';',';',null,4],["'","'",null,4],['ret','ret','return',8,'mod sm ralign']],
    // bottom
    [['lshift','shift','shift',8,'mod sm modkey'],['z','Z',null,4],['x','X',null,4],['c','C',null,4],
     ['v','V',null,4],['b','B',null,4],['n','N',null,4],['m','M',null,4],[',',',',null,4],
     ['.','.',null,4],['/','/',null,4],['rshift','shift','shift',10,'mod sm modkey ralign']],
    // modifiers + arrows
    [['fn','globe','fn',4,'mod sm modkey fnkey'],['ctrl','ctrl','ctrl',4,'mod sm modkey ralign'],
     ['opt','opt','opt',4,'mod sm modkey ralign'],['cmd','cmd','cmd',6,'mod sm modkey ralign'],
     ['space','',null,20,'mod'],['rcmd','cmd','cmd',6,'mod sm modkey'],
     ['ropt','opt','opt',4,'mod sm modkey'],['arrows','',null,10,'arrows']]
  ];
  const FN = ['esc','F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11','F12'];

  /* ---- key proportions: the single source of truth for how a key looks ----
     Every length is a ratio of keyH (one square key's height). All three render
     paths consume these: the selector and the export preview read them as CSS
     custom properties (applied in buildKeyboard); the canvas exporter reads them
     directly. Change a value here and selection → preview → export stay coherent.
     `floor` are px minimums the *interactive* selector clamps to so labels stay
     legible on smaller screens; the preview and export scale purely by ratio. */
  const KEYSPEC = {
    radius: 0.125,   // corner radius
    padX: 0.161,     // .sm key horizontal padding
    padY: 0.143,     // .sm key vertical padding
    letter: 0.340,   // letter / number / symbol key font
    fnKey: 0.232,    // F-row keys + .sm modifier base font
    glyph: 0.268,    // .sm modifier corner glyph (⌘ ⌥ ⇧ …, globe)
    sub: 0.196,      // .sm modifier sub-label, esc label, arrow glyph
    floor: { letter: 19, fnKey: 13, glyph: 15, sub: 11 }
  };

  /* ---- selected-key paint: the single source of truth for the .on look ----
     The live selector and preview consume these as CSS custom properties (set in
     applySpec); the canvas exporter reads the object directly. Because the export
     is a separate <canvas> reimplementation that can't read CSS, this object is the
     only thing tying the two together — edit it and the selector, the preview, and
     the export all move as one. Each value is an accent opacity (0–1), except
     `ringStop` (gradient position). The glow's *geometry* stays per-surface (the
     selector tracks the cursor, the preview/export are static) but its opacity is
     shared via `glow`. */
  // neon: a hot top-left corner falling off fast, a darker body so the edge pops, a
  // stronger outer glow and an inner glow along the edge. Glow sizes are fractions of keyH.
  const ONSTATE = {
    fill: 0.14,      // flat accent wash over the whole key
    ringFrom: 1.00,  // 135° ring/edge gradient — bright corner (top-left)
    ringTo: 0.10,    //                          — dim corner (bottom-right)
    ringStop: 0.50,  // position of the dim stop (shorter = sharper peak)
    glow: 0.55,      // outer glow accent opacity: a classic glow that just bites the neighbours
    glowSize: 0.10,  // outer glow blur
    inner: 0.55,     // inner glow accent opacity
    innerSize: 0.16  // inner glow blur
  };

  /* ---- themes: everything the canvas and the exports paint, per theme ----
     One table for the page (app.js turns it into CSS variables), the export preview and
     every exporter, so a dark or light keyboard looks the same on screen and in the file.
     - bg / check / checkBase: canvas fill, and the checkerboard shown for a transparent export
     - grid: the background grid's hairline
     - key / frame: surfaces, `solid` or `translucent` (the page's frosted levels: a
       transparent export lets the background through); frame.stroke is the case's hairline
     - keyBorder: a key's hairline in the export; keyLine: the same in the page (opaque)
     - keyFg: labels; plus / sub: keycap separators and sub-labels
     - ink: how far accent-coloured glyphs and text move toward black to stay legible
       (0 on dark; on light, a lime or cyan accent would vanish otherwise) — see ink() */
  const THEMES = {
    dark: {
      bg: '#0a0b0d', checkBase: '#0c0d10', check: 'rgba(255,255,255,.07)', grid: 'rgba(255,255,255,.02)',
      key: { solid: '#131519', translucent: 'rgba(19,21,25,0.6)' },
      frame: { solid: '#0b0d0f', translucent: 'rgba(13,15,18,0.4)', stroke: '#1d2026' },
      keyBorder: 'rgba(255,255,255,.08)', keyLine: '#23262d', keyFg: '#d7dbe0',
      plus: '#5a616b', sub: '#8b93a1', ink: 0
    },
    light: {
      bg: '#eef0f3', checkBase: '#f7f8fa', check: 'rgba(10,11,13,.05)', grid: 'rgba(10,11,13,.06)',
      key: { solid: '#ffffff', translucent: 'rgba(255,255,255,0.7)' },
      frame: { solid: '#dde0e6', translucent: 'rgba(205,210,218,0.45)', stroke: '#cfd3da' },
      keyBorder: 'rgba(10,11,13,.12)', keyLine: '#d3d7de', keyFg: '#1d2025',
      plus: '#9aa0aa', sub: '#6b7280', ink: 0.35
    }
  };
  const KEYBG = THEMES.dark.key.solid;
  // an accent colour as drawn on a theme: mixed toward near-black by theme.ink
  function ink(hex, theme) {
    const t = (THEMES[theme] || THEMES.dark).ink, m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!t || !m) return hex;
    const n = parseInt(m[1], 16), mix = (v, to) => Math.round(v + (to - v) * t);
    const c = [mix(n >> 16 & 255, 10), mix(n >> 8 & 255, 11), mix(n & 255, 13)];
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // push the shared specs onto an element as CSS custom properties the stylesheet reads
  function applySpec(elm, isStatic, keyBg) {
    elm.style.setProperty('--cols', COLS);
    const S = KEYSPEC, f = isStatic ? { letter: 0, fnKey: 0, glyph: 0, sub: 0 } : S.floor;
    elm.style.setProperty('--r-radius', S.radius);
    elm.style.setProperty('--r-letter', S.letter);
    elm.style.setProperty('--r-fn', S.fnKey);
    elm.style.setProperty('--r-glyph', S.glyph);
    elm.style.setProperty('--r-sub', S.sub);
    elm.style.setProperty('--r-padx', S.padX);
    elm.style.setProperty('--r-pady', S.padY);
    elm.style.setProperty('--fmin-letter', f.letter + 'px');
    elm.style.setProperty('--fmin-fn', f.fnKey + 'px');
    elm.style.setProperty('--fmin-glyph', f.glyph + 'px');
    elm.style.setProperty('--fmin-sub', f.sub + 'px');
    const O = ONSTATE;
    elm.style.setProperty('--on-fill', O.fill);
    elm.style.setProperty('--on-ring-from', O.ringFrom);
    elm.style.setProperty('--on-ring-to', O.ringTo);
    elm.style.setProperty('--on-ring-stop', (O.ringStop * 100) + '%');
    elm.style.setProperty('--on-glow', O.glow);
    elm.style.setProperty('--on-glow-size', O.glowSize);
    elm.style.setProperty('--on-inner', O.inner);
    elm.style.setProperty('--on-inner-size', O.innerSize);
    // initial key surface (the page restyles the selector per theme; the preview passes the export's)
    elm.style.setProperty('--keyBg', keyBg || (isStatic ? THEMES.dark.key.solid : THEMES.dark.key.translucent));
  }

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  function buildKeyboard(state, onChange, kopts) {
    kopts = kopts || {};
    const kb = el('div', 'ksv-kb' + (kopts.static ? ' ksv-static' : ''));
    applySpec(kb, !!kopts.static, kopts.keyBg);

    // function row — esc (wide) + F1..F12 (square, like the letter keys) on the COLS grid,
    // with a blank Touch ID cell at the far right
    const fnRow = el('div', 'ksv-fnrow');
    FN.forEach((c, i) => {
      const k = el('button', 'ksv-key ksv-fn' + (i === 0 ? ' esc' : ''), i === 0 ? '<span class="sub">esc</span>' : c);
      k.style.gridColumn = 'span ' + (c === 'esc' ? 6 : 4);
      k.dataset.code = c;
      if (KEYNAME[c]) k.setAttribute('aria-label', KEYNAME[c]);
      fnRow.appendChild(k);
    });
    const touchid = el('div', 'ksv-key ksv-fn ksv-touchid');
    touchid.style.gridColumn = 'span 4';
    fnRow.appendChild(touchid);
    kb.appendChild(fnRow);

    // main rows
    ROWS.forEach(row => {
      const r = el('div', 'ksv-row');
      row.forEach(([code, label, sub, span, cls]) => {
        if (code === 'arrows') {
          const wrap = el('div', 'ksv-arrows');
          wrap.style.gridColumn = 'span ' + span;
          [['up', 'up'], ['left', 'lf'], ['down', 'dn'], ['right', 'rt']].forEach(([c, pos]) => {
            const a = el('button', 'ksv-key ar ' + pos, icon(c));
            a.dataset.code = c; a.setAttribute('aria-label', KEYNAME[c]);
            wrap.appendChild(a);
          });
          r.appendChild(wrap);
          return;
        }
        const k = el('button', 'ksv-key ' + (cls || ''));
        k.style.gridColumn = 'span ' + span;
        k.dataset.code = code;
        if (sub) k.innerHTML = '<span class="cap">' + icon(label) + '</span><span class="sub">' + sub + '</span>';
        else k.textContent = label;
        if (KEYNAME[code]) k.setAttribute('aria-label', KEYNAME[code]);
        r.appendChild(k);
      });
      kb.appendChild(r);
    });

    if (kopts.static) {
      // display-only copy for the export preview: out of the tab order and the a11y tree
      kb.inert = true;
    } else {
      // A click applies at once. A second click on the same modifier within DOUBLE_MS
      // turns it into a double-tap, replayed from the state before the first click, as
      // long as nothing else changed the selection in between. Nothing is ever pending,
      // so reset, export and the L/R toggle always see what's on screen.
      const snap = () => ({ sel: new Set(state.sel), dbl: new Set(state.dbl || []) });
      const sig = () => [...state.sel].sort().join() + '|' + [...(state.dbl || [])].sort().join();
      let last = null; // { code, before, after, t } — the last modifier click
      kb.addEventListener('click', e => {
        const k = e.target.closest('.ksv-key');
        const code = k && k.dataset.code;
        if (!code || (state.locked && state.locked.has(code))) return;
        const now = performance.now();
        const upgrade = DBLABLE.has(code) && last && last.code === code && now - last.t < DOUBLE_MS && sig() === last.after;
        const before = upgrade ? last.before : snap();
        const next = S.select(Object.assign({}, state, before), code, { double: upgrade });
        state.sel = next.sel; state.dbl = next.dbl;
        onChange(); // the page repaints the keyboard in its refresh
        last = DBLABLE.has(code) && !upgrade ? { code, before, t: now, after: sig() } : null;
      });
    }

    paint(kb, state);
    return kb;
  }

  // non-interactive keyboard for export previews; opts.keyBg is the export's key surface
  function buildBoardPreview(state, opts) {
    opts = opts || {};
    return buildKeyboard(state, () => {}, { static: true, keyBg: opts.keyBg });
  }

  // keys that can't be added (locked by the hyperkey, or over the modifier limit) are
  // greyed out — in the selector, the preview and the export alike
  function paint(kb, state) {
    kb.querySelectorAll('.ksv-key').forEach(k => {
      const code = k.dataset.code;
      if (!code) return;
      const on = isOn(state, code);
      k.classList.toggle('on', on);
      k.setAttribute('aria-pressed', on);
      k.classList.toggle('dbl', on && isDbl(state, code));
      k.classList.toggle('locked', !!(state.locked && state.locked.has(code)));
      k.classList.toggle('maxed', S.maxed(state, code));
    });
  }

  // produce ordered list of {label, sub} keycaps for the current selection
  const ORDER = ['caps','fn','ctrl','opt','cmd','rcmd','ropt','lshift','rshift','tab','esc','del','ret'];
  // keys drawn as an ICONS glyph in the keycap list; everything else is a text label
  const CAPICON = {
    fn: 'globe', ctrl: 'ctrl', opt: 'opt', cmd: 'cmd', rcmd: 'cmd', ropt: 'opt', lshift: 'shift', rshift: 'shift',
    tab: 'tab', del: 'del', ret: 'ret', up: 'up', down: 'down', left: 'left', right: 'right'
  };
  function caps(state) {
    const lr = !!state.lr;
    let selArr = [...state.sel];
    if (!lr) {
      // collapse linked L/R pairs to one canonical chip
      const seen = new Set(), collapsed = [];
      selArr.forEach(c => {
        if (PAIR[c]) { const key = canon(c); if (seen.has(key)) return; seen.add(key); collapsed.push(key); }
        else collapsed.push(c);
      });
      selArr = collapsed;
    }
    const mods = selArr.filter(c => ORDER.includes(c)).sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
    const keys = selArr.filter(c => !ORDER.includes(c));
    const out = [];
    mods.forEach(c => {
      const isHyper = c === 'caps' && !!state.hyper;
      const ic = c === 'caps' ? (isHyper ? 'hyper' : 'caps') : CAPICON[c];
      let sub = c === 'caps' ? (isHyper ? 'hyper' : 'caps') : null;
      if (lr && DIR[c]) sub = DIR[c];
      out.push({ code: c, icon: ic || null, label: ic ? null : c, sub, mod: true, hyper: isHyper, dbl: isDbl(state, c) });
    });
    keys.forEach(c => {
      const ic = CAPICON[c] || null;
      out.push({ code: c, icon: ic, label: ic ? null : c.toUpperCase(), sub: null, mod: false });
    });
    return out;
  }

  // render keycap chips into a container
  function renderCaps(container, state, opts) {
    container.innerHTML = '';
    const list = caps(state);
    if (!list.length) {
      container.appendChild(el('div', 'ksv-empty', opts && opts.empty || 'Select keys to build a shortcut'));
      return;
    }
    const row = el('div', 'ksv-capsrow');
    list.forEach((c, i) => {
      if (i) row.appendChild(el('span', 'ksv-plus', '+'));
      const chip = el('span', 'ksv-chip' + (c.mod ? ' mod' : '') + (c.hyper ? ' hyper' : '') + (c.dbl ? ' dbl' : ''));
      const glyph = c.icon ? icon(c.icon) : c.label;
      if (!c.icon && c.label.length > 1) chip.classList.add('txt');
      if (!c.mod && c.code.length === 1 && !/[a-z0-9]/i.test(c.code)) chip.classList.add('sym');
      chip.innerHTML = '<span class="g">' + glyph + '</span>' + (c.sub ? '<span class="s">' + c.sub + '</span>' : '') + (c.dbl ? '<span class="dbbadge">2</span>' : '');
      row.appendChild(chip);
    });
    container.appendChild(row);
  }

  // TODO (post-MVP): the keycap-chip export below (geom + capsImage/capsSVG) is a
  // standalone hardcoded design — not yet wired to KEYSPEC/ONSTATE like the board path.
  // It matches the chip preview in *content* (both use caps()) but not via a shared
  // style source, so restyling the chips can drift from their export. Unify it the same
  // way the board renderer was unified.
  // icon box (px @1x) for a glyph keycap — its strokes span ~¾ of it, about a 44px font's cap height
  const ICON_CHIP = 40;
  // geometry for a given key list at a given pixel scale
  function geom(n, scale) {
    const pad = 28 * scale, gap = 14 * scale, plus = 22 * scale;
    const kw = 92 * scale, kh = 92 * scale, r = 16 * scale;
    const w = Math.round(pad * 2 + n * kw + (n - 1) * (gap * 2 + plus));
    const h = Math.round(pad * 2 + kh);
    return { pad, gap, plus, kw, kh, r, w, h };
  }

  // output pixel dimensions for the current selection at a scale (1 = base @1x)
  function exportSize(state, scale) {
    const n = caps(state).length;
    if (!n) return null;
    const g = geom(n, scale || 1);
    return { w: g.w, h: g.h, keys: n };
  }

  const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  // can this browser's canvas encode the format? (an unsupported type silently falls back to PNG)
  function canEncode(fmt) {
    if (fmt === 'svg' || fmt === 'png') return true;
    const c = document.createElement('canvas'); c.width = c.height = 1;
    return c.toDataURL(MIME[fmt]).indexOf('data:' + MIME[fmt]) === 0;
  }

  // keycap image — png / jpg / webp (canvas, at a pixel scale) or svg (vector)
  function capsImage(state, opts) {
    const list = caps(state);
    if (!list.length) return null;
    const fmt = opts.format || 'png';
    const name = exportName('keycaps', list, opts.bgName) + '.' + fmt;
    if (fmt === 'svg') return { name, svg: capsSVG(list, opts) };

    const scale = opts.scale || 2;
    const g = geom(list.length, scale);
    const cv = document.createElement('canvas'); cv.width = g.w; cv.height = g.h;
    const ctx = cv.getContext('2d');
    // jpg can't be transparent — fall back to the bg color (or dark)
    const bg = opts.bg === 'transparent'
      ? (fmt === 'jpg' ? (opts.jpgBg || '#0a0b0d') : null)
      : (opts.bg || '#0c0d10');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, g.w, g.h); }
    let x = g.pad;
    list.forEach((c, i) => {
      if (i) {
        ctx.fillStyle = opts.plus || '#5b6472';
        ctx.font = 600 + ' ' + (34 * scale) + 'px ' + UIFONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('+', x + g.gap + g.plus / 2, g.pad + g.kh / 2);
        x += g.gap * 2 + g.plus;
      }
      const accent = c.hyper ? (opts.hyper || '#5b8cff') : null;
      const fill = accent || opts.keyBg || '#1b1e24';
      roundRect(ctx, x, g.pad, g.kw, g.kh, g.r); ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = accent ? 'rgba(255,255,255,.25)' : (opts.keyBorder || 'rgba(255,255,255,.10)');
      ctx.lineWidth = 1.5 * scale; ctx.stroke();
      ctx.fillStyle = accent ? (opts.hyperFg || '#fff') : (opts.fg || '#e8eaed');
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const gy = g.pad + g.kh / 2 + (c.sub ? -8 * scale : 0);
      if (c.icon) {
        const is = ICON_CHIP * scale;
        drawIcon(ctx, c.icon, x + (g.kw - is) / 2, gy - is / 2, is, ctx.fillStyle);
      } else {
        ctx.font = 600 + ' ' + (c.label.length <= 2 ? 44 : 26) * scale + 'px ' + UIFONT;
        ctx.fillText(c.label, x + g.kw / 2, gy);
      }
      if (c.sub) {
        ctx.font = 500 + ' ' + 16 * scale + 'px ' + UIFONT;
        ctx.fillStyle = accent ? 'rgba(255,255,255,.8)' : (opts.sub || '#8b93a1');
        ctx.fillText(c.sub, x + g.kw / 2, g.pad + g.kh / 2 + 22 * scale);
      }
      if (c.dbl) {
        const br = 15 * scale, bx = x + g.kw - br * 0.55, by = g.pad + br * 0.55;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = opts.accent || opts.hyper || '#22d3ee'; ctx.fill();
        ctx.lineWidth = 2 * scale; ctx.strokeStyle = bg || opts.badgeRing || '#0a0b0d'; ctx.stroke();
        ctx.fillStyle = opts.hyperFg || '#0a0b0d';
        ctx.font = 700 + ' ' + 17 * scale + 'px ' + UIFONT;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('2', bx, by + scale);
      }
      x += g.kw;
    });
    return { name, canvas: cv, fmt };
  }

  // vector SVG markup — scale-independent
  function capsSVG(list, opts) {
    const s = 1, g = geom(list.length, s);
    const parts = [];
    const bg = opts.bg === 'transparent' ? null : (opts.bg || '#0c0d10');
    if (bg) parts.push('<rect width="' + g.w + '" height="' + g.h + '" fill="' + bg + '"/>');
    let x = g.pad;
    list.forEach((c, i) => {
      if (i) {
        parts.push(svgText('+', x + g.gap + g.plus / 2, g.pad + g.kh / 2, { size: 34, weight: 600 }, ' fill="' + (opts.plus || '#5b6472') + '"'));
        x += g.gap * 2 + g.plus;
      }
      const accent = c.hyper ? (opts.hyper || '#5b8cff') : null;
      const fill = accent || opts.keyBg || '#1b1e24';
      const stroke = accent ? 'rgba(255,255,255,.25)' : (opts.keyBorder || 'rgba(255,255,255,.10)');
      parts.push('<rect x="' + x + '" y="' + g.pad + '" width="' + g.kw + '" height="' + g.kh +
        '" rx="' + g.r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>');
      const ty = g.pad + g.kh / 2 + (c.sub ? -8 : 0);
      const fg = accent ? (opts.hyperFg || '#fff') : (opts.fg || '#e8eaed');
      if (c.icon) {
        parts.push(svgIcon(c.icon, x + (g.kw - ICON_CHIP) / 2, ty - ICON_CHIP / 2, ICON_CHIP, fg));
      } else {
        parts.push(svgText(c.label, x + g.kw / 2, ty, { size: c.label.length <= 2 ? 44 : 26, weight: 600 }, ' fill="' + fg + '"'));
      }
      if (c.sub) {
        parts.push(svgText(c.sub, x + g.kw / 2, g.pad + g.kh / 2 + 22, { size: 16, weight: 500 },
          accent ? ' fill="#ffffff" fill-opacity=".8"' : ' fill="' + (opts.sub || '#8b93a1') + '"'));
      }
      if (c.dbl) {
        const br = 15, bx = x + g.kw - br * 0.55, by = g.pad + br * 0.55;
        const badgeBg = opts.bg === 'transparent' ? (opts.badgeRing || '#0a0b0d') : (opts.bg || '#0c0d10');
        parts.push('<circle cx="' + bx + '" cy="' + by + '" r="' + br + '" fill="' + (opts.accent || opts.hyper || '#22d3ee') + '" stroke="' + badgeBg + '" stroke-width="2"/>');
        parts.push(svgText('2', bx, by, { size: 17, weight: 700 }, ' fill="' + (opts.hyperFg || '#0a0b0d') + '"'));
      }
      x += g.kw;
    });
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + g.w + '" height="' + g.h +
      '" viewBox="0 0 ' + g.w + ' ' + g.h + '">' + parts.join('') + '</svg>';
  }

  /* ---- output: one rendered image, downloaded or copied ----
     image() renders the current layout once — { name, svg } or { name, canvas, fmt } —
     so the download and the clipboard always carry the same picture. */
  function image(state, opts) {
    opts = opts || {};
    return opts.layout === 'board' ? boardImage(state, opts) : capsImage(state, opts);
  }
  // downloads go through a Blob and an object URL: no multi-MB base64 string at 4×
  function exportImage(state, opts) {
    return ready(opts.format).then(() => {
      const out = image(state, opts);
      if (!out) return;
      const blob = out.svg
        ? Promise.resolve(new Blob([out.svg], { type: 'image/svg+xml' }))
        : new Promise((res) => out.canvas.toBlob(res, MIME[out.fmt] || 'image/png', 0.95));
      return blob.then((b) => {
        const a = document.createElement('a'), url = URL.createObjectURL(b);
        a.download = out.name; a.href = url; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000); // once the download has surely started
      });
    });
  }
  // Browsers only put PNG and SVG images on the clipboard (the app offers copy for those
  // two only; a raster format would go as PNG). SVG also goes as text, which is what
  // design tools (Figma…) read when pasting. Must run inside the click:
  // the blobs are handed over as promises so Safari keeps the user gesture.
  function copyImage(state, opts) {
    const out = ready(opts.format).then(() => {
      const o = image(state, opts);
      if (!o) throw new Error('nothing to copy');
      return o;
    });
    const item = {};
    if (opts.format === 'svg') {
      const blob = (type) => out.then((o) => new Blob([o.svg], { type }));
      if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = blob('image/svg+xml');
      item['text/plain'] = blob('text/plain');
    } else {
      item['image/png'] = out.then((o) => new Promise((res) => o.canvas.toBlob(res, 'image/png')));
    }
    return navigator.clipboard.write([new ClipboardItem(item)]);
  }

  // symbol keys spelled out: their codes hold characters filesystems reject (/ \) or
  // that read badly in a name ("cmd--" for the minus key)
  const SLUG = {
    '`': 'backtick', '-': 'minus', '=': 'equal', '[': 'bracket-left', ']': 'bracket-right', '\\': 'backslash',
    ';': 'semicolon', "'": 'quote', ',': 'comma', '.': 'period', '/': 'slash'
  };
  // build a descriptive export filename (no extension):
  // KSV-<layout>-<background>_<shortcut>  e.g. "KSV-keycaps-dark_cmd-k"
  function exportName(layout, list, bgName) {
    const head = ['KSV', layout === 'board' ? 'keyboard' : 'keycaps'];
    if (bgName) head.push(bgName);
    const shortcut = (list && list.length) ? list.map(c => SLUG[c.code] || c.code).join('-') : '';
    return head.join('-') + (shortcut ? '_' + shortcut : '');
  }

  /* ---- full-keyboard export ("key press on the actual layout") ---- */
  const BOARD = { pad: 44, g: 8, rowGap: 8, cols: COLS, innerW: 1180 };
  // the page's look, optional in the keyboard export (and its preview), in export base units —
  // the keyboard is ~1180 px wide in the page too, so the page's px carry over as they are.
  // FRAME is the case around the keyboard (.panel in styles.css): 22 px padding, 12 px radius,
  // a hairline; its colours come from the theme (opts.frameFill / opts.frameStroke). With a translucent surface
  // (opts.frameBlur) the raster export also blurs what's behind it, like the page's
  // backdrop-filter: blur(3px) — the grid, the only thing there is to blur.
  // GRID is the page background (.frame-grid): a 30 px grid of hairlines.
  const FRAME = { pad: 22, radius: 12, line: 1, stroke: '#1d2026', blur: 3 };
  const GRID = { step: 30, line: 1 };
  // the case in the export: FRAME.pad around the keyboard, rounded to whole grid cells and
  // centred, so with the grid on its four edges sit on grid lines (as in the page). The grid
  // starts on its top-left corner: gridOrigin() gives the first line at or after 0.
  function frameRect(d) {
    const fit = (len) => Math.round((len + 2 * FRAME.pad) / GRID.step) * GRID.step;
    const w = fit(BOARD.innerW), h = fit(d.H - 2 * BOARD.pad);
    return { x: (d.W - w) / 2, y: (d.H - h) / 2, w, h };
  }
  function gridOrigin(d) {
    const f = frameRect(d), first = (v) => v - Math.floor(v / GRID.step) * GRID.step;
    return { x: first(f.x), y: first(f.y) };
  }
  function boardDims(scale) {
    const b = BOARD;
    const colW = (b.innerW - (b.cols - 1) * b.g) / b.cols;
    const keyH = 4 * colW + 3 * b.g;          // square letter keys, like the selector
    const r = keyH * KEYSPEC.radius;           // corner radius from the shared spec
    const W = b.innerW + b.pad * 2;
    const H = b.pad * 2 + 6 * keyH + 5 * b.rowGap; // fn row + 5 main rows, all the same height
    return { W, H, w: Math.round(W * scale), h: Math.round(H * scale), colW, keyH, r };
  }
  function boardSize(scale) { const d = boardDims(scale || 1); return { w: d.w, h: d.h, keys: 0 }; }

  // #rrggbb at a given alpha → rgba() string (mirrors CSS color-mix(accent X%, transparent))
  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim());
    if (!m) return hex;
    const n = parseInt(m[1], 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  /* ---- board painters: one drawing routine, two targets ----
     boardImage describes the keyboard once, through a painter, in base units (1×).
     canvasPainter draws those calls on a <canvas> at the export scale (PNG/JPG/WebP);
     svgPainter writes the same calls as SVG markup, so the vector export can't drift
     from the raster one. Paints are colour strings (#hex / rgba()) or a linear
     gradient { x1, y1, x2, y2, stops: [[offset, colour], …] }. */
  function canvasPainter(ctx, scale) {
    const paint = (p) => {
      if (typeof p === 'string') return p;
      const g = ctx.createLinearGradient(p.x1, p.y1, p.x2, p.y2);
      p.stops.forEach(([o, c]) => g.addColorStop(o, c));
      return g;
    };
    const font = (t) => (t.weight || 400) + ' ' + t.size + 'px ' + UIFONT;
    return {
      rect(x, y, w, h, fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); },
      // rounded rect: `fills` painted in order, then an optional stroke with an optional glow
      rrect(x, y, w, h, r, s) {
        if (s.glow) {
          // outer glow = the shape's own shadow, painted outside it only (like a CSS
          // box-shadow): the shape is drawn far off-canvas and only its shadow is offset back,
          // under an even-odd clip that excludes the shape. Shadows ignore the transform,
          // hence the scale.
          const off = 1e4, clip = new Path2D();
          clip.rect(-off, -off, 3 * off, 3 * off); rrPath(clip, x, y, w, h, r);
          ctx.save(); ctx.clip(clip, 'evenodd');
          ctx.shadowColor = s.glow.color; ctx.shadowBlur = s.glow.blur * scale; ctx.shadowOffsetX = off * scale;
          roundRect(ctx, x - off, y, w, h, r); ctx.fillStyle = '#000'; ctx.fill();
          ctx.restore();
        }
        (s.fills || []).forEach((f) => { roundRect(ctx, x, y, w, h, r); ctx.fillStyle = paint(f); ctx.fill(); });
        if (s.inner) {
          // inner glow: a stroke's shadow, clipped to the shape so only the inside shows
          ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
          ctx.shadowColor = s.inner.color; ctx.shadowBlur = s.inner.blur * scale;
          roundRect(ctx, x, y, w, h, r); ctx.lineWidth = 2; ctx.strokeStyle = s.inner.color; ctx.stroke();
          ctx.restore();
        }
        if (!s.stroke) return;
        roundRect(ctx, x, y, w, h, r); ctx.lineWidth = s.lw; ctx.strokeStyle = paint(s.stroke); ctx.stroke();
      },
      circle(cx, cy, r, s) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (s.fill) { ctx.fillStyle = s.fill; ctx.fill(); }
        if (s.stroke) { ctx.lineWidth = s.lw; ctx.strokeStyle = s.stroke; ctx.stroke(); }
      },
      // text vertically centred on y; align left / center / right
      text(str, x, y, t) {
        ctx.fillStyle = t.color; ctx.font = font(t); ctx.textBaseline = 'middle'; ctx.textAlign = t.align || 'center';
        ctx.fillText(str, x, y);
      },
      icon(name, x, y, size, color) { drawIcon(ctx, name, x, y, size, color); },
      group(alpha, fn) { ctx.save(); ctx.globalAlpha *= alpha; fn(); ctx.restore(); },
      // CSS backdrop-filter: blur what's already drawn inside the rounded rect. Like
      // shadowBlur, the filter radius ignores the transform, hence the scale.
      backdrop(x, y, w, h, r, blur) {
        if (!('filter' in ctx)) return; // no canvas filter support: no blur, same picture otherwise
        const under = document.createElement('canvas');
        under.width = ctx.canvas.width; under.height = ctx.canvas.height;
        under.getContext('2d').drawImage(ctx.canvas, 0, 0);
        ctx.save();
        roundRect(ctx, x, y, w, h, r); ctx.clip();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = 'blur(' + blur * scale + 'px)';
        ctx.drawImage(under, 0, 0);
        ctx.restore();
      }
    };
  }
  function svgPainter() {
    const out = [], defs = [], glows = {};
    let n = 0;
    // SVG 1.1 consumers (Illustrator, older tools) don't read rgba(): split it into colour + opacity
    const col = (c) => {
      const m = /^rgba\(([^)]+)\)$/.exec(c);
      if (!m) return { c, a: 1 };
      const v = m[1].split(',').map((s) => s.trim());
      return { c: 'rgb(' + v.slice(0, 3).join(',') + ')', a: +v[3] };
    };
    const attr = (k, p) => {
      if (typeof p !== 'string') {
        const id = 'g' + (n++);
        defs.push('<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + p.x1 + '" y1="' + p.y1 + '" x2="' + p.x2 + '" y2="' + p.y2 + '">' +
          p.stops.map(([o, c]) => { const s = col(c); return '<stop offset="' + o + '" stop-color="' + s.c + '"' + (s.a < 1 ? ' stop-opacity="' + s.a + '"' : '') + '/>'; }).join('') +
          '</linearGradient>');
        return ' ' + k + '="url(#' + id + ')"';
      }
      const s = col(p);
      return ' ' + k + '="' + s.c + '"' + (s.a < 1 ? ' ' + k + '-opacity="' + s.a + '"' : '');
    };
    // a glow (canvas shadow) in SVG 1.1 primitives — feDropShadow is SVG 2 only, which older
    // tools (Illustrator…) may drop: blur the shape's alpha, tint it, put the shape back on
    // top. canvas shadowBlur is twice the Gaussian standard deviation.
    const glow = (g) => {
      const key = g.color + '|' + g.blur;
      if (!glows[key]) {
        const id = 'f' + (n++), s = col(g.color);
        defs.push('<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' +
          '<feGaussianBlur in="SourceAlpha" stdDeviation="' + g.blur / 2 + '" result="blur"/>' +
          '<feFlood flood-color="' + s.c + '" flood-opacity="' + s.a + '" result="tint"/>' +
          '<feComposite in="tint" in2="blur" operator="in" result="shadow"/>' +
          '<feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>');
        glows[key] = id;
      }
      return ' filter="url(#' + glows[key] + ')"';
    };
    // the same blur, shadow only (the shape itself isn't drawn): an outer glow like box-shadow
    const shadowOnly = (g) => {
      const key = 'o|' + g.color + '|' + g.blur;
      if (!glows[key]) {
        const id = 'f' + (n++), s = col(g.color);
        defs.push('<filter id="' + id + '" x="-50%" y="-50%" width="200%" height="200%">' +
          '<feGaussianBlur in="SourceAlpha" stdDeviation="' + g.blur / 2 + '" result="blur"/>' +
          '<feFlood flood-color="' + s.c + '" flood-opacity="' + s.a + '" result="tint"/>' +
          '<feComposite in="tint" in2="blur" operator="in"/></filter>');
        glows[key] = id;
      }
      return ' filter="url(#' + glows[key] + ')"';
    };
    return {
      rect(x, y, w, h, fill) { out.push('<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + attr('fill', fill) + '/>'); },
      rrect(x, y, w, h, r, s) {
        const box = 'x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"';
        if (s.glow) {
          // outer glow: the shape's shadow, clipped to everything but the shape (even-odd)
          const id = 'c' + (n++), big = 1e5;
          defs.push('<clipPath id="' + id + '"><path clip-rule="evenodd" d="M' + -big + ' ' + -big + 'H' + big + 'V' + big + 'H' + -big + 'Z' + rrD(x, y, w, h, r) + '"/></clipPath>');
          out.push('<g clip-path="url(#' + id + ')"><rect ' + box + ' fill="#000"' + shadowOnly(s.glow) + '/></g>');
        }
        (s.fills || []).forEach((f) => out.push('<rect ' + box + attr('fill', f) + '/>'));
        if (s.inner) {
          // inner glow: a glowing stroke clipped to the shape (SVG 1.1 clipPath)
          const id = 'c' + (n++);
          defs.push('<clipPath id="' + id + '"><rect ' + box + '/></clipPath>');
          out.push('<rect ' + box + ' fill="none"' + attr('stroke', s.inner.color) + ' stroke-width="2" clip-path="url(#' + id + ')"' + glow(s.inner) + '/>');
        }
        if (s.stroke) out.push('<rect ' + box + ' fill="none"' + attr('stroke', s.stroke) + ' stroke-width="' + s.lw + '"/>');
      },
      circle(cx, cy, r, s) {
        out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"' + (s.fill ? attr('fill', s.fill) : ' fill="none"') +
          (s.stroke ? attr('stroke', s.stroke) + ' stroke-width="' + s.lw + '"' : '') + '/>');
      },
      text(str, x, y, t) { out.push(svgText(str, x, y, t, attr('fill', t.color))); },
      icon(name, x, y, size, color) { out.push(svgIcon(name, x, y, size, color)); },
      group(alpha, fn) { out.push('<g opacity="' + alpha + '">'); fn(); out.push('</g>'); },
      // SVG 1.1 has no backdrop filter (BackgroundImage is unsupported in practice): skipped
      backdrop() {},
      svg(W, H) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
          (defs.length ? '<defs>' + defs.join('') + '</defs>' : '') + out.join('') + '</svg>';
      }
    };
  }

  // a key surface. Idle: solid key base + hairline border. Selected: the shared
  // ONSTATE paint — the solid key base, an accent gradient (ringFrom→ringTo) and a
  // flat accent wash on top, plus a gradient ring and soft glow — matching the
  // selector / preview .on state.
  function boardSurface(p, x, y, w, h, r, on, opts, accent) {
    const base = opts.keyBg || '#131519';
    if (on) {
      const O = ONSTATE;
      // 135°-equivalent accent gradient; used for both the fill and the ring,
      // mirroring the DOM border-box layer
      const grad = { x1: x, y1: y, x2: x + w, y2: y + h, stops: [[0, hexA(accent, O.ringFrom)], [O.ringStop, hexA(accent, O.ringTo)]] };
      p.rrect(x, y, w, h, r, {
        fills: [base, grad, hexA(accent, O.fill)],
        stroke: grad, lw: 1.5, glow: { color: hexA(accent, O.glow), blur: h * O.glowSize },
        inner: { color: hexA(accent, O.inner), blur: h * O.innerSize }
      });
    } else {
      p.rrect(x, y, w, h, r, { fills: [base], stroke: opts.keyBorder || 'rgba(255,255,255,.08)', lw: 1 });
    }
  }
  // centered (or left-aligned) single-label key: letters, numbers, fn row.
  // weight 400 matches the selector's .ksv-key font.
  function bkey(p, x, y, w, h, r, on, opts, accent, label, fontSize, align) {
    boardSurface(p, x, y, w, h, r, on, opts, accent);
    if (!label) return;
    const t = { size: fontSize, weight: 400, color: opts.fg || '#d7dbe0' };
    if (align === 'left') p.text(label, x + h * KEYSPEC.padX, y + h / 2, Object.assign(t, { align: 'left' }));
    else p.text(label, x + w / 2, y + h / 2 + 1, t);
  }
  // a small bottom-anchored label (esc and similar) — left- or right-aligned, weight 500
  function blabel(p, x, y, w, h, opts, text, ralign) {
    const padX = h * KEYSPEC.padX, padY = h * KEYSPEC.padY, sSize = h * KEYSPEC.sub;
    p.text(text, ralign ? x + w - padX : x + padX, y + h - padY - sSize / 2,
      { size: sSize, weight: 500, color: opts.fg || '#d7dbe0', align: ralign ? 'right' : 'left' });
  }
  // modifier key: corner glyph (an ICONS name) + sub-label, accent glyph when idle — mirrors
  // the selector's .sm keys. sub weight 500 (.sm .sub); all sizes from KEYSPEC.
  function bmod(p, x, y, w, h, r, on, opts, accent, glyph, sub, ralign, accentGlyph) {
    boardSurface(p, x, y, w, h, r, on, opts, accent);
    const padX = h * KEYSPEC.padX, padY = h * KEYSPEC.padY, gSize = h * KEYSPEC.glyph, sSize = h * KEYSPEC.sub;
    const keyFg = opts.fg || '#d7dbe0';
    const gx = ralign ? x + w - padX : x + padX;
    p.icon(glyph, ralign ? gx - gSize : gx, y + padY, gSize, (!on && accentGlyph) ? (opts.accentInk || accent) : keyFg);
    p.text(sub, gx, y + h - padY - sSize / 2, { size: sSize, weight: 500, color: keyFg, align: ralign ? 'right' : 'left' });
  }
  // arrow key: surface + a centered ICONS glyph
  function barrow(p, x, y, w, h, r, on, opts, accent, name, size) {
    boardSurface(p, x, y, w, h, r, on, opts, accent);
    p.icon(name, x + (w - size) / 2, y + (h - size) / 2, size, opts.fg || '#d7dbe0');
  }

  // full keyboard as PNG / JPG / WebP (canvas, at opts.scale) or SVG (vector, always transparent)
  function boardImage(state, opts) {
    const fmt = opts.format || 'png';
    const vector = fmt === 'svg';
    const scale = vector ? 1 : (opts.scale || 2);
    const d = boardDims(scale);
    const name = exportName('board', caps(state), opts.bgName) + '.' + fmt;
    // jpg can't be transparent — fall back to the bg colour (or dark)
    const bg = (vector || opts.bg === 'transparent')
      ? (fmt === 'jpg' ? (opts.jpgBg || '#0a0b0d') : null)
      : (opts.bg || '#0a0b0d');
    if (vector) {
      const p = svgPainter();
      drawBoard(p, state, opts, d, bg);
      return { name, svg: p.svg(d.W, d.H) };
    }
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    drawBoard(canvasPainter(ctx, scale), state, opts, d, bg);
    return { name, canvas: cv, fmt };
  }

  // the keyboard itself, in base units, through a painter
  function drawBoard(p, state, opts, d, bg) {
    const b = BOARD;
    const sel = state.sel, on = (c) => isOn(state, c);
    const keyH = d.keyH, colW = d.colW, r = d.r;
    const accent = opts.accent || opts.hyper || '#22d3ee';
    const keyFg = opts.fg || '#d7dbe0';
    if (bg) p.rect(0, 0, d.W, d.H, bg);
    if (opts.grid) {
      const c = opts.gridColor || 'rgba(255,255,255,.02)';
      // lines centred on the frame's edges (a stroke straddles its path)
      const g0 = gridOrigin(d), half = GRID.line / 2;
      for (let x = g0.x; x < d.W; x += GRID.step) p.rect(x - half, 0, GRID.line, d.H, c);
      for (let y = g0.y; y < d.H; y += GRID.step) p.rect(0, y - half, d.W, GRID.line, c);
    }
    if (opts.frame) {
      const f = frameRect(d);
      if (opts.frameBlur) p.backdrop(f.x, f.y, f.w, f.h, FRAME.radius, opts.frameBlur);
      p.rrect(f.x, f.y, f.w, f.h, FRAME.radius, { fills: [opts.frameFill || THEMES.dark.frame.solid], stroke: opts.frameStroke || FRAME.stroke, lw: FRAME.line });
    }

    // function row — esc (wide) + F1..F12 (square) + a blank Touch ID square at the far right
    let y = b.pad;
    let fx = b.pad;
    const sqW = 4 * colW + 3 * b.g; // square key width = keyH (one letter unit)
    FN.forEach((c) => {
      const w = c === 'esc' ? 6 * colW + 5 * b.g : sqW;
      if (c === 'esc') {
        // esc reads like the other special keys: a small bottom-left label
        boardSurface(p, fx, y, w, keyH, r, sel.has('esc'), opts, accent);
        blabel(p, fx, y, w, keyH, opts, 'esc', false);
      } else {
        bkey(p, fx, y, w, keyH, r, sel.has(c), opts, accent, c, keyH * KEYSPEC.fnKey, 'center');
      }
      fx += w + b.g;
    });
    // Touch ID — blank, deactivated-looking key with a faint sensor ring
    p.group(0.4, () => {
      boardSurface(p, fx, y, sqW, keyH, r, false, opts, accent);
      p.circle(fx + sqW / 2, y + keyH / 2, keyH * 0.2, { stroke: opts.keyBorder || 'rgba(255,255,255,.18)', lw: Math.max(1, keyH * 0.022) });
    });
    y += keyH + b.rowGap;

    // main rows
    ROWS.forEach(row => {
      let x = b.pad;
      row.forEach(cell => {
        const [code, label, sub, span, cls] = cell;
        const w = span * colW + (span - 1) * b.g;
        if (code === 'arrows') {
          // the arrow cluster's gap is half the key gap (as in the page: .ksv-arrows)
          const ag = b.g / 2, colw = (w - 2 * ag) / 3, cellH = (keyH - ag) / 2;
          const ar = keyH * KEYSPEC.radius * 0.6, af = keyH * KEYSPEC.sub;
          barrow(p, x + colw + ag, y, colw, cellH, ar, on('up'), opts, accent, 'up', af);
          barrow(p, x, y + cellH + ag, colw, cellH, ar, on('left'), opts, accent, 'left', af);
          barrow(p, x + colw + ag, y + cellH + ag, colw, cellH, ar, on('down'), opts, accent, 'down', af);
          barrow(p, x + 2 * (colw + ag), y + cellH + ag, colw, cellH, ar, on('right'), opts, accent, 'right', af);
          x += w + b.g; return;
        }
        const isSel = on(code);
        // greyed out as on screen: locked by the hyperkey or over the modifier limit
        const grey = (state.locked && state.locked.has(code)) || S.maxed(state, code);
        p.group(grey ? 0.28 : 1, () => {
          if (code === 'space') {
            bkey(p, x, y, w, keyH, r, isSel, opts, accent, '', 20);
          } else if (code === 'fn') {
            // like a real Mac: globe icon bottom-left, "fn" text top-right
            boardSurface(p, x, y, w, keyH, r, isSel, opts, accent);
            const padX = keyH * KEYSPEC.padX, padY = keyH * KEYSPEC.padY;
            const gSize = keyH * KEYSPEC.glyph, sSize = keyH * KEYSPEC.sub;
            p.icon('globe', x + padX, y + keyH - padY - gSize, gSize, isSel ? keyFg : (opts.accentInk || accent));
            p.text('fn', x + w - padX, y + padY + sSize / 2, { size: sSize, weight: 500, color: keyFg, align: 'right' });
          } else if (cls && /\bsm\b/.test(cls)) {
            const ralign = /\bralign\b/.test(cls), accentGlyph = /\b(modkey|hyper)\b/.test(cls);
            let glyph = label, slabel = sub;
            if (code === 'caps' && state.hyper) { glyph = 'hyper'; slabel = 'hyper'; }
            bmod(p, x, y, w, keyH, r, isSel, opts, accent, glyph, slabel, ralign, accentGlyph);
          } else {
            bkey(p, x, y, w, keyH, r, isSel, opts, accent, label, keyH * KEYSPEC.letter);
          }
          if (isDbl(state, code)) {
            const br = keyH * 0.16, bx = x + w - br * 0.6, by = y + br * 0.6;
            p.circle(bx, by, br, { fill: accent, stroke: bg || opts.badgeRing || '#0a0b0d', lw: 1.5 });
            p.text('2', bx, by + 0.5, { size: br * 1.1, weight: 700, color: opts.hyperFg || '#0a0b0d' });
          }
        });
        x += w + b.g;
      });
      y += keyH + b.rowGap;
    });
  }

  window.KSV = { buildKeyboard, buildBoardPreview, renderCaps, caps, render: image, exportImage, copyImage, exportSize, boardSize, boardDims, frameRect, gridOrigin, BOARD, FRAME, GRID, THEMES, ink, canEncode, paint, icon, el, HYPER, KEYBG, COLS };
  // a rounded rect as a sub-path of a Path2D (for the even-odd glow clip)
  function rrPath(p, x, y, w, h, r) {
    p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath();
  }
  // the same as SVG path data
  function rrD(x, y, w, h, r) {
    return 'M' + (x + r) + ' ' + y + 'H' + (x + w - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) +
      'V' + (y + h - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + w - r) + ' ' + (y + h) +
      'H' + (x + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) +
      'V' + (y + r) + 'A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + 'Z';
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
})();
