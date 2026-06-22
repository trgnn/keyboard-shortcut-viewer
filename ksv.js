/* Keyboard Shortcut Viewer — shared data, render, interaction, export.
   Exposes window.KSV. Each app instance calls KSV.mount(rootEl, opts). */
(function () {
  // glyphs
  const G = {
    cmd: '\u2318', opt: '\u2325', ctrl: '\u2303', shift: '\u21E7',
    caps: '\u21EA', tab: '\u21E5', ret: '\u23CE', del: '\u232B',
    globe: '<svg class="ic" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.25"><circle cx="8" cy="8" r="6.3"/><ellipse cx="8" cy="8" rx="2.7" ry="6.3"/><line x1="1.7" y1="8" x2="14.3" y2="8"/></svg>',
    up: '\u25B2', down: '\u25BC', left: '\u25C0', right: '\u25B6',
    esc: 'esc'
  };
  // The hyperkey: Caps Lock remapped to Control+Option+Command. (mods, no shift)
  const HYPER = ['ctrl', 'opt', 'cmd'];
  // true modifier keys — any number can be held; everything else is a single "activation" key
  const MODS = new Set(['caps', 'fn', 'ctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // modifiers eligible for a double-tap shortcut (caps lock / hyper excluded)
  const DBLABLE = new Set(['fn', 'ctrl', 'opt', 'cmd', 'rcmd', 'ropt', 'lshift', 'rshift']);
  // left/right modifier pairs (for "distinguish L/R")
  const PAIR = { cmd: 'rcmd', rcmd: 'cmd', opt: 'ropt', ropt: 'opt', lshift: 'rshift', rshift: 'lshift' };
  const CANON = { rcmd: 'cmd', ropt: 'opt', rshift: 'lshift' };
  const DIR = { cmd: 'left', rcmd: 'right', opt: 'left', ropt: 'right', lshift: 'left', rshift: 'right' };
  const canon = (c) => CANON[c] || c;
  // count distinct logical modifiers held (a linked L/R pair counts once when not distinguishing)
  function logicalModCount(state) {
    const lr = !!state.lr, seen = new Set();
    state.sel.forEach((c) => { if (MODS.has(c)) seen.add(lr ? c : canon(c)); });
    return seen.size;
  }
  // double-tap helpers
  function isDbl(state, code) {
    if (!state.dbl) return false;
    if (state.dbl.has(code)) return true;
    return !state.lr && PAIR[code] && state.dbl.has(PAIR[code]);
  }
  function clearDbl(state, code) {
    if (!state.dbl) return;
    state.dbl.delete(code);
    if (!state.lr && PAIR[code]) state.dbl.delete(PAIR[code]);
  }

  // main 58-col block. each key: code, label, sub(optional small line), span, cls.
  // letters/numbers span 4 (square); modifiers are trimmed so every row totals 58 cols
  const ROWS = [
    // number row
    [['`','`',null,4],['1','1',null,4],['2','2',null,4],['3','3',null,4],['4','4',null,4],
     ['5','5',null,4],['6','6',null,4],['7','7',null,4],['8','8',null,4],['9','9',null,4],
     ['0','0',null,4],['-','-',null,4],['=','=',null,4],['del',G.del,'del',6,'mod sm ralign']],
    // qwerty
    [['tab',G.tab,'tab',5,'mod sm'],['q','Q',null,4],['w','W',null,4],['e','E',null,4],['r','R',null,4],
     ['t','T',null,4],['y','Y',null,4],['u','U',null,4],['i','I',null,4],['o','O',null,4],
     ['p','P',null,4],['[','[',null,4],[']',']',null,4],['\\','\\',null,5]],
    // home — caps lock = hyperkey
    [['caps',G.caps,'caps',6,'mod sm hyper'],['a','A',null,4],['s','S',null,4],['d','D',null,4],
     ['f','F',null,4],['g','G',null,4],['h','H',null,4],['j','J',null,4],['k','K',null,4],
     ['l','L',null,4],[';',';',null,4],["'","'",null,4],['ret',G.ret,'return',8,'mod sm ralign']],
    // bottom
    [['lshift',G.shift,'shift',8,'mod sm modkey'],['z','Z',null,4],['x','X',null,4],['c','C',null,4],
     ['v','V',null,4],['b','B',null,4],['n','N',null,4],['m','M',null,4],[',',',',null,4],
     ['.','.',null,4],['/','/',null,4],['rshift',G.shift,'shift',10,'mod sm modkey ralign']],
    // modifiers + arrows
    [['fn',G.globe,'fn',4,'mod sm modkey fnkey'],['ctrl','\u2303','ctrl',4,'mod sm modkey ralign'],
     ['opt','\u2325','opt',4,'mod sm modkey ralign'],['cmd','\u2318','cmd',6,'mod sm modkey ralign'],
     ['space','',null,20,'mod'],['rcmd','\u2318','cmd',6,'mod sm modkey'],
     ['ropt','\u2325','opt',4,'mod sm modkey'],['arrows','',null,10,'arrows']]
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
  const ONSTATE = {
    fill: 0.26,      // flat accent wash over the whole key
    ringFrom: 0.72,  // 135° ring/edge gradient — bright corner (top-left)
    ringTo: 0.16,    //                          — dim corner (bottom-right)
    ringStop: 0.75,  // position of the dim stop
    glow: 0.50       // glow accent opacity
  };

  // solid key surface colour. The live selector uses a translucent --keyBg (frosted
  // over the panel), but the flat export and its preview both want this solid value —
  // shared here so the two can't drift (applySpec hands it to the preview; the export
  // pulls it into EXPORT_BG in app.js).
  const KEYBG = '#131519';

  // push the shared specs onto an element as CSS custom properties the stylesheet reads
  function applySpec(elm, isStatic) {
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
    // the preview is a proxy for the flat export, so it uses the solid key surface
    // (the interactive selector keeps the app's translucent --keyBg)
    if (isStatic) elm.style.setProperty('--keyBg', KEYBG);
  }

  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  function buildKeyboard(state, onChange, kopts) {
    kopts = kopts || {};
    const kb = el('div', 'ksv-kb' + (kopts.static ? ' ksv-static' : ''));
    applySpec(kb, !!kopts.static);

    // function row — esc (wide) + F1..F12 (square, like the letter keys) on the 60-col grid,
    // with a blank Touch ID cell at the far right
    const fnRow = el('div', 'ksv-fnrow');
    FN.forEach((c, i) => {
      const k = el('button', 'ksv-key ksv-fn' + (i === 0 ? ' esc' : ''), i === 0 ? '<span class="sub">esc</span>' : c);
      k.style.gridColumn = 'span ' + (c === 'esc' ? 6 : 4);
      k.dataset.code = c;
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
          const up = el('button', 'ksv-key ar up', G.up); up.dataset.code = 'up';
          const lf = el('button', 'ksv-key ar lf', G.left); lf.dataset.code = 'left';
          const dn = el('button', 'ksv-key ar dn', G.down); dn.dataset.code = 'down';
          const rt = el('button', 'ksv-key ar rt', G.right); rt.dataset.code = 'right';
          wrap.append(up, lf, dn, rt);
          r.appendChild(wrap);
          return;
        }
        const k = el('button', 'ksv-key ' + (cls || ''));
        k.style.gridColumn = 'span ' + span;
        k.dataset.code = code;
        if (sub) k.innerHTML = '<span class="cap">' + label + '</span><span class="sub">' + sub + '</span>';
        else k.textContent = label;
        r.appendChild(k);
      });
      kb.appendChild(r);
    });

    if (!kopts.static) {
      // single-click toggles a key; double-click on a modifier marks it "double-tap"
      const doSingle = (code) => {
        const lr = !!state.lr;
        // a standalone double-tap shortcut resets on any normal click
        if (state.dbl && state.dbl.size) {
          const hitDoubled = state.dbl.has(code) || (!lr && PAIR[code] && state.dbl.has(PAIR[code]));
          state.dbl = new Set();
          state.sel = new Set();
          if (hitDoubled) return;       // double-tapped key clicked again → cleared
          // otherwise start a fresh selection with the clicked key
        }
        if (!lr && PAIR[code]) {
          const partner = PAIR[code];
          const on = state.sel.has(code) || state.sel.has(partner);
          if (on) { state.sel.delete(code); state.sel.delete(partner); clearDbl(state, code); }
          else {
            if (logicalModCount(state) >= 4) return;
            state.sel.add(code);
          }
        } else if (state.sel.has(code)) {
          state.sel.delete(code); clearDbl(state, code);
        } else {
          if (MODS.has(code)) {
            // distinguish L/R: only one side of a pair at a time
            if (lr && PAIR[code] && state.sel.has(PAIR[code])) { state.sel.delete(PAIR[code]); clearDbl(state, PAIR[code]); }
            const capsHyper = code === 'caps' && state.hyper;
            if (!capsHyper && logicalModCount(state) >= 4) return;
          } else {
            [...state.sel].forEach(c => { if (!MODS.has(c)) state.sel.delete(c); });
          }
          state.sel.add(code);
        }
      };
      const doDouble = (code) => {
        // a double-tap is a standalone shortcut — it can't be combined with
        // another double-tap or any other key, so clear everything else
        const wasDoubled = state.dbl && (state.dbl.has(code) || (!state.lr && PAIR[code] && state.dbl.has(PAIR[code])));
        state.sel = new Set();
        state.dbl = new Set();
        if (!wasDoubled) { state.sel.add(code); state.dbl.add(code); } // else → back to neutral
      };
      let pending = null;
      kb.addEventListener('click', e => {
        const k = e.target.closest('.ksv-key');
        if (!k) return;
        const code = k.dataset.code;
        if (!code) return;
        if (state.locked && state.locked.has(code)) return;
        const commit = () => { paint(kb, state); onChange(); };
        // keys with no double-tap meaning act immediately (activation keys + caps/hyper)
        if (!DBLABLE.has(code)) { doSingle(code); commit(); return; }
        // modifier: defer briefly to detect a second click (double-tap)
        if (pending && pending.code === code) {
          clearTimeout(pending.timer); pending = null;
          doDouble(code); commit();
          return;
        }
        if (pending) { clearTimeout(pending.timer); doSingle(pending.code); pending = null; }
        pending = { code, timer: setTimeout(() => { pending = null; doSingle(code); commit(); }, 220) };
      });
    }

    paint(kb, state);
    return kb;
  }

  // non-interactive keyboard for export previews
  function buildBoardPreview(state) {
    return buildKeyboard(state, () => {}, { static: true });
  }

  function paint(kb, state) {
    const lr = !!state.lr;
    const atMax = logicalModCount(state) >= 4;
    const isOn = (code) => state.sel.has(code) || (!lr && PAIR[code] && state.sel.has(PAIR[code]));
    kb.querySelectorAll('.ksv-key').forEach(k => {
      const code = k.dataset.code;
      k.classList.toggle('on', !!isOn(code));
      k.classList.toggle('dbl', !!(isOn(code) && isDbl(state, code)));
      k.classList.toggle('locked', !!(state.locked && state.locked.has(code)));
      const unselMod = MODS.has(code) && !isOn(code);
      const capsEx = code === 'caps' && state.hyper;
      k.classList.toggle('maxed', atMax && unselMod && !capsEx);
    });
  }

  // produce ordered list of {label, sub} keycaps for the current selection
  const ORDER = ['caps','fn','ctrl','opt','cmd','rcmd','ropt','lshift','rshift','tab','esc','del','ret'];
  const LABELS = {
    caps: ['\u2756', 'hyper'], ctrl: ['\u2303', null], opt: ['\u2325', null], cmd: ['\u2318', null],
    rcmd: ['\u2318', null], ropt: ['\u2325', null], lshift: ['\u21E7', null], rshift: ['\u21E7', null],
    tab: ['\u21E5', null], esc: ['esc', null], del: ['\u232B', null], ret: ['\u23CE', null],
    up: ['\u25B2', null], down: ['\u25BC', null], left: ['\u25C0', null], right: ['\u25B6', null]
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
      let lab = LABELS[c] || [c];
      const isHyper = c === 'caps' && !!state.hyper;
      if (c === 'caps') lab = isHyper ? ['\u2756', 'hyper'] : ['\u21EA', 'caps'];
      let sub = lab[1] || null;
      if (lr && DIR[c]) sub = DIR[c];
      out.push({ code: c, label: lab[0], sub, mod: true, hyper: isHyper, dbl: isDbl(state, c) });
    });
    keys.forEach(c => out.push({ code: c, label: (LABELS[c]||[c.toUpperCase()])[0], sub: null, mod: false }));
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
      const glyph = c.code === 'fn' ? G.globe : c.label;
      const isText = typeof glyph === 'string' && glyph.length > 1 && glyph[0] !== '<';
      if (isText) chip.classList.add('txt');
      if (!c.mod && c.code.length === 1 && !/[a-z0-9]/i.test(c.code)) chip.classList.add('sym');
      chip.innerHTML = '<span class="g">' + glyph + '</span>' + (c.sub ? '<span class="s">' + c.sub + '</span>' : '') + (c.dbl ? '<span class="dbbadge">2</span>' : '');
      row.appendChild(chip);
    });
    container.appendChild(row);
  }

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

  // export — png / jpg / webp (raster) or svg (vector), at a pixel scale
  function exportPNG(state, opts) {
    opts = opts || {};
    const list = caps(state);
    if (!list.length) return;
    const fmt = opts.format || 'png';
    const fname = exportName('keycaps', list, opts.bgName);
    if (fmt === 'svg') { downloadSVG(list, opts, fname); return; }

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
        ctx.font = 600 + ' ' + (34 * scale) + 'px ui-sans-serif, system-ui, sans-serif';
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
      const single = c.label.length <= 2;
      ctx.font = 600 + ' ' + (single ? 44 : 26) * scale + 'px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(c.label, x + g.kw / 2, g.pad + g.kh / 2 + (c.sub ? -8 * scale : 0));
      if (c.sub) {
        ctx.font = 500 + ' ' + 16 * scale + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.fillStyle = accent ? 'rgba(255,255,255,.8)' : (opts.sub || '#8b93a1');
        ctx.fillText(c.sub, x + g.kw / 2, g.pad + g.kh / 2 + 22 * scale);
      }
      if (c.dbl) {
        const br = 15 * scale, bx = x + g.kw - br * 0.55, by = g.pad + br * 0.55;
        ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fillStyle = opts.accent || opts.hyper || '#b7ff4a'; ctx.fill();
        ctx.lineWidth = 2 * scale; ctx.strokeStyle = bg || '#0a0b0d'; ctx.stroke();
        ctx.fillStyle = opts.hyperFg || '#0a0b0d';
        ctx.font = 700 + ' ' + 17 * scale + 'px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('2', bx, by + scale);
      }
      x += g.kw;
    });
    download(fname + '.' + fmt, cv.toDataURL(MIME[fmt] || 'image/png', 0.95));
  }

  // vector SVG export — scale-independent
  function downloadSVG(list, opts, fname) {
    const s = 1, g = geom(list.length, s);
    const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const parts = [];
    const bg = opts.bg === 'transparent' ? null : (opts.bg || '#0c0d10');
    if (bg) parts.push('<rect width="' + g.w + '" height="' + g.h + '" fill="' + bg + '"/>');
    let x = g.pad;
    list.forEach((c, i) => {
      if (i) {
        parts.push('<text x="' + (x + g.gap + g.plus / 2) + '" y="' + (g.pad + g.kh / 2) +
          '" font-size="34" font-weight="600" fill="' + (opts.plus || '#5b6472') +
          '" text-anchor="middle" dominant-baseline="central" font-family="' + UIFONT + '">+</text>');
        x += g.gap * 2 + g.plus;
      }
      const accent = c.hyper ? (opts.hyper || '#5b8cff') : null;
      const fill = accent || opts.keyBg || '#1b1e24';
      const stroke = accent ? 'rgba(255,255,255,.25)' : (opts.keyBorder || 'rgba(255,255,255,.10)');
      parts.push('<rect x="' + x + '" y="' + g.pad + '" width="' + g.kw + '" height="' + g.kh +
        '" rx="' + g.r + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.5"/>');
      const single = c.label.length <= 2;
      const ty = g.pad + g.kh / 2 + (c.sub ? -8 : 0);
      parts.push('<text x="' + (x + g.kw / 2) + '" y="' + ty + '" font-size="' + (single ? 44 : 26) +
        '" font-weight="600" fill="' + (accent ? (opts.hyperFg || '#fff') : (opts.fg || '#e8eaed')) +
        '" text-anchor="middle" dominant-baseline="central" font-family="' + UIFONT + '">' + esc(c.label) + '</text>');
      if (c.sub) {
        parts.push('<text x="' + (x + g.kw / 2) + '" y="' + (g.pad + g.kh / 2 + 22) + '" font-size="16" font-weight="500" fill="' +
          (accent ? 'rgba(255,255,255,.8)' : (opts.sub || '#8b93a1')) +
          '" text-anchor="middle" dominant-baseline="central" font-family="' + UIFONT + '">' + esc(c.sub) + '</text>');
      }
      if (c.dbl) {
        const br = 15, bx = x + g.kw - br * 0.55, by = g.pad + br * 0.55;
        const badgeBg = opts.bg === 'transparent' ? '#0a0b0d' : (opts.bg || '#0c0d10');
        parts.push('<circle cx="' + bx + '" cy="' + by + '" r="' + br + '" fill="' + (opts.accent || opts.hyper || '#b7ff4a') + '" stroke="' + badgeBg + '" stroke-width="2"/>');
        parts.push('<text x="' + bx + '" y="' + by + '" font-size="17" font-weight="700" fill="' + (opts.hyperFg || '#0a0b0d') +
          '" text-anchor="middle" dominant-baseline="central" font-family="' + UIFONT + '">2</text>');
      }
      x += g.kw;
    });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + g.w + '" height="' + g.h +
      '" viewBox="0 0 ' + g.w + ' ' + g.h + '">' + parts.join('') + '</svg>';
    download(fname + '.svg', 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }
  const UIFONT = "-apple-system, 'SF Pro Display', ui-sans-serif, system-ui, sans-serif";

  function download(name, href) {
    const a = document.createElement('a');
    a.download = name; a.href = href; a.click();
  }

  // build a descriptive export filename (no extension):
  // KSV-<layout>-<background>_<shortcut>  e.g. "KSV-keycaps-dark_cmd-k"
  function exportName(layout, list, bgName) {
    const head = ['KSV', layout === 'board' ? 'keyboard' : 'keycaps'];
    if (bgName) head.push(bgName);
    const shortcut = (list && list.length) ? list.map(c => c.code).join('-') : '';
    return head.join('-') + (shortcut ? '_' + shortcut : '');
  }

  /* ---- full-keyboard export ("key press on the actual layout") ---- */
  const BOARD = { pad: 44, g: 8, rowGap: 8, cols: 58, innerW: 1180 };
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
  // a key surface. Idle: solid key base + hairline border. Selected: the shared
  // ONSTATE paint — an accent gradient (ringFrom→ringTo) with a flat accent wash on
  // top, plus a gradient ring and soft glow — matching the selector / preview .on state.
  function boardSurface(ctx, x, y, w, h, r, on, opts, accent) {
    if (on) {
      const O = ONSTATE;
      // 135°-equivalent accent gradient; used for both the fill base and the ring,
      // mirroring the DOM border-box layer
      const grad = ctx.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, hexA(accent, O.ringFrom)); grad.addColorStop(O.ringStop, hexA(accent, O.ringTo));
      ctx.save(); roundRect(ctx, x, y, w, h, r); ctx.clip();
      ctx.fillStyle = grad; ctx.fillRect(x, y, w, h);                       // gradient base
      ctx.globalAlpha = O.fill; ctx.fillStyle = accent; ctx.fillRect(x, y, w, h); // flat accent wash on top
      ctx.restore();
      ctx.save(); ctx.shadowColor = hexA(accent, O.glow); ctx.shadowBlur = h * 0.18;
      roundRect(ctx, x, y, w, h, r); ctx.lineWidth = 1.5; ctx.strokeStyle = grad; ctx.stroke(); ctx.restore();
    } else {
      roundRect(ctx, x, y, w, h, r);
      ctx.fillStyle = opts.keyBg || '#131519'; ctx.fill();
      roundRect(ctx, x, y, w, h, r);
      ctx.lineWidth = 1; ctx.strokeStyle = opts.keyBorder || 'rgba(255,255,255,.08)'; ctx.stroke();
    }
  }
  // centered (or left-aligned) single-label key: letters, numbers, fn row, arrows.
  // weight 400 matches the selector's .ksv-key font.
  function bkey(ctx, x, y, w, h, r, on, opts, accent, label, fontSize, align) {
    boardSurface(ctx, x, y, w, h, r, on, opts, accent);
    if (!label) return;
    ctx.fillStyle = opts.fg || '#d7dbe0'; ctx.textBaseline = 'middle';
    ctx.font = '400 ' + fontSize + 'px ' + UIFONT;
    if (align === 'left') { ctx.textAlign = 'left'; ctx.fillText(label, x + h * KEYSPEC.padX, y + h / 2); }
    else { ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 1); }
  }
  // a small bottom-anchored label (esc and similar) — left- or right-aligned, weight 500
  function blabel(ctx, x, y, w, h, opts, text, ralign) {
    const padX = h * KEYSPEC.padX, padY = h * KEYSPEC.padY, sSize = h * KEYSPEC.sub;
    ctx.fillStyle = opts.fg || '#d7dbe0'; ctx.textBaseline = 'middle';
    ctx.font = '500 ' + sSize + 'px ' + UIFONT;
    ctx.textAlign = ralign ? 'right' : 'left';
    ctx.fillText(text, ralign ? x + w - padX : x + padX, y + h - padY - sSize / 2);
  }
  // modifier key: corner glyph + sub-label, accent glyph when idle — mirrors the selector's .sm keys.
  // glyph weight 400 (inherits .ksv-key), sub weight 500 (.sm .sub); all sizes from KEYSPEC.
  function bmod(ctx, x, y, w, h, r, on, opts, accent, glyph, sub, ralign, accentGlyph, globe) {
    boardSurface(ctx, x, y, w, h, r, on, opts, accent);
    const padX = h * KEYSPEC.padX, padY = h * KEYSPEC.padY, gSize = h * KEYSPEC.glyph, sSize = h * KEYSPEC.sub;
    const keyFg = opts.fg || '#d7dbe0';
    const gColor = (!on && accentGlyph) ? accent : keyFg;
    const gx = ralign ? x + w - padX : x + padX;
    ctx.textBaseline = 'middle'; ctx.textAlign = ralign ? 'right' : 'left';
    if (globe) {
      drawGlobe(ctx, ralign ? x + w - padX - gSize / 2 : x + padX + gSize / 2, y + padY + gSize / 2, gSize / 2, gColor);
    } else {
      ctx.fillStyle = gColor; ctx.font = '400 ' + gSize + 'px ' + UIFONT;
      ctx.fillText(glyph, gx, y + padY + gSize / 2);
    }
    ctx.fillStyle = keyFg; ctx.textAlign = ralign ? 'right' : 'left';
    ctx.font = '500 ' + sSize + 'px ' + UIFONT;
    ctx.fillText(sub, gx, y + h - padY - sSize / 2);
  }
  function drawGlobe(ctx, cx, cy, r, color) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(0.7, r * 0.16);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy); ctx.stroke();
    ctx.restore();
  }

  function exportBoard(state, opts) {
    opts = opts || {};
    const b = BOARD;
    const fmt = opts.format === 'svg' ? 'png' : (opts.format || 'png');
    const scale = opts.scale || 2;
    const sel = state.sel, lr = !!state.lr;
    const isOn = (c) => sel.has(c) || (!lr && PAIR[c] && sel.has(PAIR[c]));
    const d = boardDims(scale);
    const keyH = d.keyH, colW = d.colW, r = d.r;
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    const bg = opts.bg === 'transparent'
      ? (fmt === 'jpg' ? (opts.jpgBg || '#0a0b0d') : null)
      : (opts.bg || '#0a0b0d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, d.W, d.H); }
    const accent = opts.accent || opts.hyper || '#b7ff4a';

    // function row — esc (wide) + F1..F12 (square) + a blank Touch ID square at the far right
    let y = b.pad;
    let fx = b.pad;
    const sqW = 4 * colW + 3 * b.g; // square key width = keyH (one letter unit)
    FN.forEach((c) => {
      const w = c === 'esc' ? 6 * colW + 5 * b.g : sqW;
      if (c === 'esc') {
        // esc reads like the other special keys: a small bottom-left label
        boardSurface(ctx, fx, y, w, keyH, r, sel.has('esc'), opts, accent);
        blabel(ctx, fx, y, w, keyH, opts, 'esc', false);
      } else {
        bkey(ctx, fx, y, w, keyH, r, sel.has(c), opts, accent, c, keyH * KEYSPEC.fnKey, 'center');
      }
      fx += w + b.g;
    });
    // Touch ID — blank, deactivated-looking key with a faint sensor ring
    ctx.save(); ctx.globalAlpha = 0.4;
    boardSurface(ctx, fx, y, sqW, keyH, r, false, opts, accent);
    ctx.lineWidth = Math.max(1, keyH * 0.022);
    ctx.strokeStyle = opts.keyBorder || 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(fx + sqW / 2, y + keyH / 2, keyH * 0.2, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    y += keyH + b.rowGap;

    // main rows
    ROWS.forEach(row => {
      let x = b.pad;
      row.forEach(cell => {
        const [code, label, sub, span, cls] = cell;
        const w = span * colW + (span - 1) * b.g;
        if (code === 'arrows') {
          const colw = (w - 2 * b.g) / 3, cellH = (keyH - b.g) / 2;
          const ar = keyH * KEYSPEC.radius * 0.6, af = keyH * KEYSPEC.sub;
          bkey(ctx, x + colw + b.g, y, colw, cellH, ar, isOn('up'), opts, accent, G.up, af);
          bkey(ctx, x, y + cellH + b.g, colw, cellH, ar, isOn('left'), opts, accent, G.left, af);
          bkey(ctx, x + colw + b.g, y + cellH + b.g, colw, cellH, ar, isOn('down'), opts, accent, G.down, af);
          bkey(ctx, x + 2 * (colw + b.g), y + cellH + b.g, colw, cellH, ar, isOn('right'), opts, accent, G.right, af);
          x += w + b.g; return;
        }
        const on = isOn(code);
        const locked = !!(state.locked && state.locked.has(code));
        if (locked) ctx.globalAlpha = 0.28;
        if (code === 'space') {
          bkey(ctx, x, y, w, keyH, r, on, opts, accent, '', 20);
        } else if (code === 'fn') {
          // like a real Mac: globe icon bottom-left, "fn" text top-right
          boardSurface(ctx, x, y, w, keyH, r, on, opts, accent);
          const padX = keyH * KEYSPEC.padX, padY = keyH * KEYSPEC.padY;
          const gSize = keyH * KEYSPEC.glyph, sSize = keyH * KEYSPEC.sub, keyFg = opts.fg || '#d7dbe0';
          drawGlobe(ctx, x + padX + gSize / 2, y + keyH - padY - gSize / 2, gSize / 2, on ? keyFg : accent);
          ctx.fillStyle = keyFg; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
          ctx.font = '500 ' + sSize + 'px ' + UIFONT;
          ctx.fillText('fn', x + w - padX, y + padY + sSize / 2);
        } else if (cls && /\bsm\b/.test(cls)) {
          const ralign = /\bralign\b/.test(cls), accentGlyph = /\b(modkey|hyper)\b/.test(cls);
          let glyph = label, slabel = sub;
          if (code === 'caps' && state.hyper) { glyph = '❖'; slabel = 'hyper'; }
          bmod(ctx, x, y, w, keyH, r, on, opts, accent, glyph, slabel, ralign, accentGlyph, code === 'fn');
        } else {
          bkey(ctx, x, y, w, keyH, r, on, opts, accent, label, keyH * KEYSPEC.letter);
        }
        if (isDbl(state, code)) {
          const br = keyH * 0.16, bx = x + w - br * 0.6, by = y + br * 0.6;
          ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2);
          ctx.fillStyle = accent; ctx.fill();
          ctx.lineWidth = 1.5; ctx.strokeStyle = bg || '#0a0b0d'; ctx.stroke();
          ctx.fillStyle = opts.hyperFg || '#0a0b0d'; ctx.font = '700 ' + (br * 1.1) + 'px ' + UIFONT;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('2', bx, by + 0.5);
        }
        if (locked) ctx.globalAlpha = 1;
        x += w + b.g;
      });
      y += keyH + b.rowGap;
    });
    download(exportName('board', caps(state), opts.bgName) + '.' + fmt, cv.toDataURL(MIME[fmt] || 'image/png', 0.95));
  }

  window.KSV = { buildKeyboard, buildBoardPreview, renderCaps, caps, exportPNG, exportBoard, exportSize, boardSize, paint, HYPER, G, KEYBG };
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
