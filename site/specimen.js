/* Keycaps playground (dev only, see specimen.html). The panel's controls feed the export
   engine's keycap options (plusMode, capsGlow, capsSpec, theme colours…) and every change redraws the
   shortcut and every key through KSV.render. The spec readout lists what differs from the
   engine's CAPS defaults: values to carry into ksv.js once they look right. */
(function () {
  const D = KSV.CAPS;
  // the playground's state: canvas settings, shortcut, the keycaps' "+" and glow, and the spec overrides
  const pg = {
    theme: 'dark', bg: 'fill', surface: 'solid', frame: false, grid: false, plus: 'key', glow: 'mods',
    accent: '#22d3ee', keys: 'cmd k', lr: false, hyper: false, dbl: false, every: true,
    spec: {}
  };
  const PRESETS = [['cmd k', '⌘K'], ['fn ctrl opt lshift cmd k', 'fn ⌃⌥⇧⌘ K'], ['lshift', '⇧ (try double-tap)'],
    ['caps F12', 'caps F12 (try hyper)'], ['rcmd opt space', 'right ⌘ + left ⌥ + space (try L/R)'], ['esc', 'esc'], ['ctrl tab', '⌃⇥'], ['cmd lshift 4', '⌘⇧4']];
  // [key, label, min, max, step]
  const ROW = [['keyH', 'key height', 56, 140, 1], ['gap', 'gap', 0, 40, 1], ['plus', '+ box', 0, 50, 1], ['plusSize', '+ size', 12, 60, 1], ['pad', 'margin', 12, 90, 1]];
  const ALL = ['esc', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    '`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'del', 'tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\',
    'caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'ret', 'lshift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'rshift',
    'fn', 'ctrl', 'opt', 'cmd', 'space', 'rcmd', 'ropt', 'up', 'left', 'down', 'right'];

  const $ = (id) => document.getElementById(id);
  const h = (tag, attrs, kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n[k] = v; else n.setAttribute(k, v); });
    (kids || []).forEach((k) => k && n.appendChild(k));
    return n;
  };

  /* ---- render ---- */
  const opts = () => {
    const T = KSV.THEMES[pg.theme], glass = pg.surface === 'translucent';
    return {
      layout: 'keycaps', format: 'png', scale: 2, capsSpec: pg.spec,
      frame: pg.frame, grid: pg.grid, plusMode: pg.plus, capsGlow: pg.glow,
      accent: pg.accent, hyper: pg.accent, hyperFg: '#0a0b0d', accentInk: KSV.ink(pg.accent, pg.theme),
      bg: pg.bg === 'trans' ? 'transparent' : T.bg, jpgBg: T.bg, badgeRing: T.bg, gridColor: T.grid,
      fg: T.keyFg, keyBorder: T.keyBorder, plus: T.plus, sub: T.sub,
      keyBg: T.key[pg.surface], frameFill: T.frame[pg.surface], frameStroke: T.frame.stroke, frameBlur: glass ? KSV.FRAME.blur : 0
    };
  };
  const shortcut = () => {
    const sel = pg.keys.trim().split(/\s+/).filter(Boolean);
    const firstMod = sel.find((c) => KSVSelect.MODS.has(c) && c !== 'caps');
    return { sel: new Set(sel), dbl: new Set(pg.dbl && firstMod ? [firstMod] : []), lr: pg.lr, hyper: pg.hyper, locked: new Set() };
  };
  const figure = (caption, st, o) => {
    const out = KSV.render(st, o);
    if (!out) return h('figure', {}, [h('figcaption', { text: caption + ' — nothing to draw' })]);
    out.canvas.style.width = out.canvas.width / o.scale + 'px';
    return h('figure', {}, [out.canvas, h('figcaption', { text: caption })]);
  };
  let queued = false;
  function draw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      const o = opts(), sc = $('shortcut'), ks = $('keys');
      sc.innerHTML = '';
      sc.appendChild(figure(pg.keys, shortcut(), o));
      ks.innerHTML = '';
      ks.parentNode.hidden = !pg.every;
      // every key follows the L/R box: off, the modifiers are the linked ones (no left / right),
      // and the right-hand copies (rcmd, ropt, rshift) would only repeat the left ones
      const RIGHT = { rcmd: 1, ropt: 1, rshift: 1 };
      if (pg.every) ALL.filter((k) => pg.lr || !RIGHT[k]).forEach((k) =>
        ks.appendChild(figure(k, { sel: new Set([k]), dbl: new Set(), lr: pg.lr, hyper: pg.hyper, locked: new Set() }, o)));
      renderSpec();
    });
  }

  /* ---- panel ---- */
  const seg = (items, get, set) => {
    const wrap = h('div', { class: 'pg-seg' });
    const paint = () => wrap.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === get()));
    items.forEach(([v, label]) => wrap.appendChild(h('button', { 'data-v': v, text: label, onclick: () => { set(v); paint(); update(); } })));
    paint();
    return wrap;
  };
  const check = (label, key) => h('label', {}, [h('input', { type: 'checkbox', ...(pg[key] ? { checked: '' } : {}), onchange: (e) => { pg[key] = e.target.checked; draw(); } }), document.createTextNode(label)]);
  // a slider bound to a spec value
  const slider = ([key, label, min, max, step], scope, defaults) => {
    const out = h('output', { text: String(defaults[key]) });
    const field = h('div', { class: 'pg-field' });
    const input = h('input', { type: 'range', min, max, step, value: scope[key] ?? defaults[key], oninput: (e) => {
      const v = +e.target.value;
      if (v === defaults[key]) delete scope[key]; else scope[key] = v;
      out.textContent = v; field.classList.toggle('changed', v !== defaults[key]); draw();
    } });
    out.textContent = input.value;
    field.append(h('label', { text: label }), input, out);
    field.dataset.key = key;
    return field;
  };
  const group = (title, kids, id) => h('div', { class: 'pg-group', ...(id ? { id } : {}) }, [h('h3', { text: title }), ...kids]);

  const update = draw;
  // what differs from the engine's defaults, as a CAPS patch
  function renderSpec() {
    const patch = pg.spec;
    $('spec').textContent = Object.keys(patch).length
      ? '// capsSpec (changes from CAPS)\n' + JSON.stringify(patch, null, 2)
      : '// no changes: the engine defaults (CAPS)';
  }
  function resetSpec() {
    pg.spec = {};
    build();
  }

  function build() {
    const panel = $('panel');
    panel.innerHTML = '';
    panel.appendChild(group('Keycaps', [
      h('p', { text: 'Each key as in the keyboard. "+": between all keys, before the trigger key only, none' }),
      seg([['all', 'all'], ['key', 'key'], ['none', 'none']], () => pg.plus, (v) => { pg.plus = v; }),
      h('p', { text: 'Glow (selected look): all keys, the modifiers, the trigger key, none' }),
      seg([['all', 'all'], ['mods', 'mods'], ['key', 'key'], ['none', 'none']], () => pg.glow, (v) => { pg.glow = v; })
    ]));
    panel.appendChild(group('Row', ROW.map((s) => slider(s, pg.spec, D))));

    const preset = h('select', { onchange: (e) => { pg.keys = e.target.value; $('keysInput').value = pg.keys; draw(); } },
      PRESETS.map(([v, l]) => h('option', { value: v, ...(pg.keys === v ? { selected: '' } : {}), text: l })));
    panel.appendChild(group('Shortcut', [
      h('div', { class: 'pg-field' }, [h('label', { text: 'preset' }), preset]),
      h('div', { class: 'pg-field' }, [h('label', { text: 'key codes' }), h('input', { type: 'text', id: 'keysInput', value: pg.keys, oninput: (e) => { pg.keys = e.target.value; draw(); } })]),
      h('div', { class: 'pg-checks' }, [check('L/R', 'lr'), check('hyper', 'hyper'), check('double-tap', 'dbl'), check('every key', 'every')])
    ]));
    panel.appendChild(group('Canvas', [
      seg([['dark', 'dark'], ['light', 'light']], () => pg.theme, (v) => { pg.theme = v; }),
      seg([['fill', 'filled'], ['trans', 'transparent']], () => pg.bg, (v) => { pg.bg = v; }),
      seg([['solid', 'solid'], ['translucent', 'translucent']], () => pg.surface, (v) => { pg.surface = v; }),
      h('div', { class: 'pg-checks' }, [check('frame', 'frame'), check('grid', 'grid')]),
      h('div', { class: 'pg-field' }, [h('label', { text: 'accent' }), h('input', { type: 'color', value: pg.accent, oninput: (e) => { pg.accent = e.target.value; draw(); } })])
    ]));
    panel.appendChild(group('Spec', [
      h('pre', { class: 'pg-spec', id: 'spec' }),
      h('div', { class: 'pg-actions' }, [
        h('button', { text: 'copy spec', onclick: () => navigator.clipboard && navigator.clipboard.writeText($('spec').textContent) }),
        h('button', { text: 'reset', onclick: resetSpec })
      ])
    ]));
    // sliders already off their default (after a rebuild) show as changed
    panel.querySelectorAll('.pg-field').forEach((f) => {
      if (f.dataset.key && f.dataset.key in pg.spec) f.classList.add('changed');
    });
    update();
  }

  // draw once the key font is in (the engine's exports wait for it the same way)
  (document.fonts ? Promise.all([400, 500, 600, 700].map((w) => document.fonts.load(w + " 16px 'KSV Inter'"))) : Promise.resolve()).then(build);
})();
