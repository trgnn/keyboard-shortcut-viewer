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
    win:   { d: 'M3.5 3.5h7.75v7.75H3.5zM12.75 3.5h7.75v7.75h-7.75zM3.5 12.75h7.75v7.75H3.5zM12.75 12.75h7.75v7.75h-7.75z', fill: true },
    // a PC's super key, beside the Windows logo: Tux (Linux), Framework's gear. Both from
    // Simple Icons (simpleicons.org, CC0 13.21.0); the logos stay their owners' marks
    tux:   { d: 'M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z', fill: true },
    framework: { d: 'M23.186 9.07 21.41 8.019a2.78 2.78 0 0 1-1.344-2.391V3.523c0-.431-.19-.837-.516-1.108A11.965 11.965 0 0 0 16.317.493a1.356 1.356 0 0 0-1.193.091L13.347 1.64a2.622 2.622 0 0 1-2.688 0L8.882.584a1.348 1.348 0 0 0-1.194-.09 11.93 11.93 0 0 0-3.231 1.918 1.44 1.44 0 0 0-.516 1.108v2.104c0 .986-.51 1.897-1.344 2.392L.823 9.068c-.363.215-.61.588-.675 1.013A12.24 12.24 0 0 0 0 12.001c0 .651.048 1.292.145 1.916.065.425.312.801.675 1.016l1.774 1.052a2.78 2.78 0 0 1 1.344 2.392v2.104c0 .431.191.837.516 1.108.965.8 2.054 1.452 3.231 1.919.393.155.831.124 1.194-.091l1.777-1.055a2.622 2.622 0 0 1 2.688 0l1.777 1.055c.363.215.804.246 1.193.091a11.973 11.973 0 0 0 3.232-1.92 1.44 1.44 0 0 0 .516-1.107v-2.104a2.78 2.78 0 0 1 1.344-2.392l1.774-1.052c.363-.215.61-.588.675-1.016.094-.624.145-1.265.145-1.916 0-.652-.048-1.293-.145-1.917a1.41 1.41 0 0 0-.67-1.013zM12.003 19.41c-3.981 0-7.21-3.317-7.21-7.407s3.229-7.406 7.21-7.406c3.98 0 7.21 3.316 7.21 7.406s-3.23 7.407-7.21 7.407z', fill: true },
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
    sidebar:  { d: 'M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2zM14.5 4.5v15' },
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
    esc: 'escape', tab: 'tab', del: 'delete', caps: 'caps lock', ret: 'return', lshift: 'left shift', rshift: 'right shift',
    ctrl: 'control', opt: 'left option', cmd: 'left command', rcmd: 'right command', ropt: 'right option',
    space: 'space', up: 'up arrow', down: 'down arrow', left: 'left arrow', right: 'right arrow', iso: 'less than'
  };
  const KEYNAME_PC = { del: 'backspace', ret: 'enter', ctrl: 'left control', rctrl: 'right control', cmd: 'windows', opt: 'alt', ropt: 'right alt' };
  const KEYNAME_LINUX = { cmd: 'super' };

  /* ---- keyboard layouts: a MacBook or a PC laptop (Windows or Linux), QWERTY (US) or AZERTY (French) ----
     The same 64% block everywhere, on the same COLS grid. A key's code names its position,
     as on the US MacBook (the key at `q` reads A in AZERTY, `cmd` is the PC's Windows / super
     key), so a selection carries over from one layout to the next. French is ISO, like the
     real keyboards: an L-shaped return over two rows (`iso-ret`), a short left shift and an
     extra `iso` key next to it; the US `\` moves down beside the return. The PC is a plain
     laptop (a Framework's): a wider left ctrl, then fn, the Windows (super on Linux) key, alt.
     A layout id is `<os>-<lang>`, plus `:phys` for a MacBook's modifiers as printed (LOOKS). */
  const OSES = ['mac', 'win', 'linux'], LANGS = ['us', 'fr'];
  const KBS = OSES.flatMap((o) => LANGS.map((l) => o + '-' + l));
  const KB_DEFAULT = 'mac-us';
  // how a MacBook's modifiers read: as printed on the keys (`printed`, the default: full words,
  // each side's keys aligned to its edge, shift, tab, caps lock, return and delete a glyph
  // alone in the bottom corner), or KSV's own labels (`custom`)
  const LOOKS = ['printed', 'custom'];
  // a PC's super key: the Windows logo (the `win-*` layouts), or super (`linux-*`) with Tux,
  // Framework's gear or nothing; `-logo`: the logo alone, large, without its word
  const SUPERS = ['win', 'win-logo', 'tux', 'tux-logo', 'framework', 'framework-logo', 'super'];
  const superOs = (superKey) => (/^win/.test(superKey) ? 'win' : 'linux');
  const layoutId = (state) => {
    const kb = state.kb || KB_DEFAULT;
    if (kb.startsWith('mac')) return kb + (state.look === 'custom' ? '' : ':phys');
    return kb + (SUPERS.includes(state.superKey) && superOs(state.superKey) === kb.split('-')[0] ? ':' + state.superKey : '');
  };
  // legends by code: a character, or [top, bottom] for a key printed with two, as on the
  // real keyboards (the top one is shifted). Letters read as their code
  const US = {
    '`': ['~', '`'], 1: ['!', '1'], 2: ['@', '2'], 3: ['#', '3'], 4: ['$', '4'], 5: ['%', '5'], 6: ['^', '6'],
    7: ['&', '7'], 8: ['*', '8'], 9: ['(', '9'], 0: [')', '0'], '-': ['_', '-'], '=': ['+', '='],
    '[': ['{', '['], ']': ['}', ']'], '\\': ['|', '\\'], ';': [':', ';'], "'": ['"', "'"],
    ',': ['<', ','], '.': ['>', '.'], '/': ['?', '/']
  };
  const FR = {
    q: 'A', w: 'Z', a: 'Q', ';': 'M', z: 'W', 1: ['1', '&'], 2: ['2', 'é'], 3: ['3', '"'], 4: ['4', "'"],
    5: ['5', '('], 7: ['7', 'è'], 9: ['9', 'ç'], 0: ['0', 'à'], '-': ['°', ')'], '[': ['¨', '^'],
    "'": ['%', 'ù'], iso: ['>', '<'], m: ['?', ','], ',': ['.', ';'], '.': ['/', ':']
  };
  const LEGEND = {
    'mac-us': US, 'win-us': US,
    'mac-fr': Object.assign({}, FR, { '`': ['#', '@'], 6: ['6', '§'], 8: ['8', '!'], '=': ['_', '-'],
      ']': ['*', '$'], '\\': ['£', '`'], '/': ['+', '='] }),
    'win-fr': Object.assign({}, FR, { '`': '²', 6: ['6', '-'], 8: ['8', '_'], '=': ['+', '='],
      ']': ['£', '$'], '\\': ['µ', '*'], '/': ['§', '!'] })
  };
  // the one character that names a two-legend key (keycaps, filenames): its digit, or the
  // unshifted (bottom) one
  // a digit under its symbol, as on a US keyboard: the digit reads as large as a letter
  // Inter's | runs from descender to ascender, longer than printed legends: drawn smaller,
  // about its centre (the page: .dual .short)
  const SHORT = { '|': 0.85 };
  const isDigitKey = (lb) => Array.isArray(lb) && /^[0-9]$/.test(lb[1]);
  const baseLegend = (lb) => (Array.isArray(lb) ? lb.find((c) => /[0-9]/.test(c)) || lb[1] : lb);
  // main 58-col block. each key: code, label, sub(optional small line), span, cls.
  // keys with a sub-label (the .sm modifiers) take an ICONS name (or null) as their label.
  // letters/numbers span 4 (square); modifiers are trimmed so every row totals 58 cols
  // a PC's super key (SUPERS): a logo and its word, the logo alone (large, `big`), or the word
  function superCell(os, superKey) {
    // (the default: the Windows logo alone; super on Linux)
    const k = superKey && superOs(superKey) === os ? superKey : os === 'win' ? 'win-logo' : 'super';
    const [name, logo] = k.split('-'), icon = name === 'super' ? null : name;
    return logo ? ['cmd', icon, '', 4, 'mod sm modkey big'] : ['cmd', icon, os === 'win' ? 'win' : 'super', 4, 'mod sm modkey'];
  }
  // a PC's legends are a Windows keyboard's, whatever the OS
  // ² sits alone in the top-left corner, small, as printed (`corner`)
  const CORNER = new Set(['²']);
  function buildRows(kb, phys, superKey) {
    const os = kb.split('-')[0], pc = os !== 'mac', iso = kb.endsWith('-fr');
    const L = LEGEND[(pc ? 'win' : 'mac') + (iso ? '-fr' : '-us')];
    const key = (code, span = 4) => [code, L[code] || code.toUpperCase(), null, span,
      Array.isArray(L[code]) ? 'dual' : CORNER.has(L[code]) ? 'corner' : undefined];
    const keys = (codes) => codes.split(' ').map((c) => key(c));
    // a MacBook's modifiers as printed (phys): `low` puts a lone glyph in the bottom corner
    const low = phys ? ' low' : '';
    const ret = (span, cls) => ['ret', 'ret', phys ? '' : pc ? 'enter' : 'return', span, 'mod sm ralign' + low + (cls || '')];
    const shift = (code, span, cls) => [code, 'shift', phys ? '' : 'shift', span, 'mod sm modkey' + cls];
    // a MacBook's bottom row: KSV's glyph + short name, right-aligned on the left-hand keys
    // (default), or the printed one
    const macMods = phys
      ? [['fn', 'globe', 'fn', 4, 'mod sm modkey fnkey spread'], ['ctrl', 'ctrl', 'control', 4, 'mod sm modkey'],
        ['opt', 'opt', 'option', 4, 'mod sm modkey'], ['cmd', 'cmd', 'command', 6, 'mod sm modkey'],
        ['space', '', null, 20, 'mod'], ['rcmd', 'cmd', 'command', 6, 'mod sm modkey ralign'],
        ['ropt', 'opt', 'option', 4, 'mod sm modkey ralign']]
      : [['fn', 'globe', 'fn', 4, 'mod sm modkey fnkey'], ['ctrl', 'ctrl', 'ctrl', 4, 'mod sm modkey ralign'],
        ['opt', 'opt', 'opt', 4, 'mod sm modkey ralign'], ['cmd', 'cmd', 'cmd', 6, 'mod sm modkey ralign'],
        ['space', '', null, 20, 'mod'], ['rcmd', 'cmd', 'cmd', 6, 'mod sm modkey'],
        ['ropt', 'opt', 'opt', 4, 'mod sm modkey']];
    // a PC laptop's: ctrl (wider) fn win alt · alt / alt gr ctrl; Linux calls the Windows key super
    const pcMods = [['ctrl', null, 'ctrl', 6, 'mod sm modkey'], ['fn', null, 'fn', 4, 'mod sm modkey'],
      superCell(os, superKey),
      ['opt', null, 'alt', 4, 'mod sm modkey'], ['space', '', null, 22, 'mod'],
      ['ropt', null, iso ? 'alt gr' : 'alt', 4, 'mod sm modkey'], ['rctrl', null, 'ctrl', 4, 'mod sm modkey']];
    // a US MacBook's tab is wide and its `\` square; a PC's (ANSI) share the room
    const macUS = !pc && !iso;
    const rows = [
      // number row
      [...keys('` 1 2 3 4 5 6 7 8 9 0 - ='), ['del', 'del', phys ? '' : pc ? 'backspace' : 'del', 6, 'mod sm ralign' + low]],
      // top letter row; ISO: the return's top
      [['tab', 'tab', phys ? '' : 'tab', macUS ? 6 : 5, 'mod sm' + low], ...keys('q w e r t y u i o p [ ]'),
        iso ? ret(5, ' iso-ret') : key('\\', macUS ? 4 : 5)],
      // home — caps lock = hyperkey; ISO: `\` here, then the return's foot (drawn with its top)
      [['caps', 'caps', phys ? '' : 'caps', 6, 'mod sm hyper' + low], ...keys("a s d f g h j k l ; '"),
        ...(iso ? [key('\\'), ['retfoot', null, null, 4, 'foot']] : [ret(8)])],
      // bottom; ISO: a short left shift and the extra key
      [shift('lshift', iso ? 4 : 8, low), ...(iso ? [key('iso')] : []), ...keys('z x c v b n m , . /'),
        shift('rshift', 10, ' ralign' + low)],
      // modifiers + arrows
      [...(pc ? pcMods : macMods), ['arrows', '', null, 10, 'arrows']]
    ];
    // printed modifiers: larger words, a narrower margin (KEYSPEC.phys)
    if (phys) rows.forEach((row) => row.forEach((k) => { if (/\bsm\b/.test(k[4] || '')) k[4] += ' phys'; }));
    return rows;
  }
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
    letter: 0.330,   // letter key font (and single-legend symbols, and a digit under its symbol)
    fnKey: 0.232,    // F-row keys + .sm modifier base font
    glyph: 0.268,    // .sm modifier corner glyph (⌘ ⌥ ⇧ …, globe)
    sub: 0.196,      // .sm modifier sub-label, esc label, arrow glyph
    dual: 0.300,     // both characters of a two-legend key (shifted above, unshifted below)…
    dualSm: 0.230,   // …except the symbol over a digit (US), smaller, the digit at `letter`
    dualY: [0.28, 0.70], // the two characters' centres
    phys: { sub: 0.215, padX: 0.14 }, // a MacBook's modifiers as printed: the word, the side margin
    big: 0.42,       // a logo alone on its key, centred (a PC's super key: SUPERS `-logo`)
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
    elm.style.setProperty('--r-dual', S.dual);
    elm.style.setProperty('--r-dual-sm', S.dualSm);
    elm.style.setProperty('--r-phys-sub', S.phys.sub);
    elm.style.setProperty('--r-phys-padx', S.phys.padX);
    elm.style.setProperty('--r-big', S.big);
    elm.style.setProperty('--r-dual-y0', S.dualY[0]);
    elm.style.setProperty('--r-dual-y1', S.dualY[1]);
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

  /* The ISO return in the page: an L over two rows, which a box can't be. The key spans its
     row and reaches down over the next one; its surface is an SVG path (the same outline as
     the export's, isoD) redrawn whenever it resizes, styled like a key in styles.css (.iso-*).
     Only the path takes clicks, so the corner it leaves free belongs to the key beside it. */
  let isoN = 0;
  const isoRO = typeof ResizeObserver === 'function' && new ResizeObserver((entries) => entries.forEach((e) => drawIso(e.target)));
  const isoWatched = new Set();
  function isoShape(k) {
    const id = 'iso' + (isoN++), NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'iso-shape');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" class="iso-s0"/><stop offset="' + ONSTATE.ringStop + '" class="iso-s1"/></linearGradient>' +
      '<clipPath id="' + id + 'c"><path/></clipPath>' +
      '<filter id="' + id + 'f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur/></filter></defs>' +
      '<path class="iso-face"/><path class="iso-tint" fill="url(#' + id + 'g)"/><path class="iso-wash"/>' +
      '<path class="iso-inner" clip-path="url(#' + id + 'c)" filter="url(#' + id + 'f)"/>' +
      '<path class="iso-edge"/><path class="iso-ring" stroke="url(#' + id + 'g)"/>';
    k.prepend(svg);
    if (isoRO) {
      // a rebuilt keyboard leaves the old return behind: stop watching it
      isoWatched.forEach((n) => { if (!n.isConnected) { isoRO.unobserve(n); isoWatched.delete(n); } });
      isoRO.observe(k); isoWatched.add(k);
    }
  }
  function drawIso(k) {
    const w = k.offsetWidth, h = k.offsetHeight, kb = k.closest('.ksv-kb');
    if (!w || !h || !kb) return;
    const g = parseFloat(getComputedStyle(kb).rowGap) || 0, keyH = (h - g) / 2;
    // the foot is one column narrower: a column and a gap, (w + g) / 5 for a 5-column top
    const d = isoD(0.5, 0.5, w - 1, h - 1, keyH * KEYSPEC.radius, (w + g) / 5, keyH + g);
    const svg = k.querySelector('.iso-shape');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.querySelectorAll('path').forEach((p) => p.setAttribute('d', d));
    svg.querySelector('feGaussianBlur').setAttribute('stdDeviation', keyH * ONSTATE.innerSize / 2);
  }

  function buildKeyboard(state, onChange, kopts) {
    kopts = kopts || {};
    const kb = el('div', 'ksv-kb' + (kopts.static ? ' ksv-static' : ''));
    applySpec(kb, !!kopts.static, kopts.keyBg);

    const L = layout(layoutId(state));
    kb.dataset.kb = L.kb;
    // function row — esc (wide) + F1..F12 (square, like the letter keys) on the COLS grid,
    // with a blank cell at the far right (the MacBook's Touch ID)
    const fnRow = el('div', 'ksv-fnrow');
    FN.forEach((c, i) => {
      const k = el('button', 'ksv-key ksv-fn' + (i === 0 ? ' esc' : ''), i === 0 ? '<span class="sub">esc</span>' : c);
      k.style.gridColumn = 'span ' + (c === 'esc' ? 6 : 4);
      k.dataset.code = c;
      if (L.name(c)) k.setAttribute('aria-label', L.name(c));
      fnRow.appendChild(k);
    });
    const touchid = el('div', 'ksv-key ksv-fn ksv-touchid' + (L.pc ? ' no-sensor' : ''));
    touchid.style.gridColumn = 'span 4';
    fnRow.appendChild(touchid);
    kb.appendChild(fnRow);

    // main rows
    L.rows.forEach(row => {
      const r = el('div', 'ksv-row');
      row.forEach(([code, label, sub, span, cls]) => {
        if (code === 'arrows') {
          const wrap = el('div', 'ksv-arrows');
          wrap.style.gridColumn = 'span ' + span;
          [['up', 'up'], ['left', 'lf'], ['down', 'dn'], ['right', 'rt']].forEach(([c, pos]) => {
            const a = el('button', 'ksv-key ar ' + pos, icon(c));
            a.dataset.code = c; a.setAttribute('aria-label', L.name(c));
            wrap.appendChild(a);
          });
          r.appendChild(wrap);
          return;
        }
        if (cls === 'foot') {
          // the ISO return's foot: room the return (one row up) reaches down into
          const f = el('div', 'ksv-foot');
          f.style.gridColumn = 'span ' + span;
          r.appendChild(f);
          return;
        }
        const k = el('button', 'ksv-key ' + (cls || ''));
        k.style.gridColumn = 'span ' + span;
        k.dataset.code = code;
        if (sub != null) k.innerHTML = '<span class="cap">' + (label ? icon(label) : '') + '</span><span class="sub">' + sub + '</span>';
        else if (Array.isArray(label)) k.innerHTML = '<span class="dual' + (isDigitKey(label) ? ' num' : '') + '"><span></span><span></span></span>';
        else k.textContent = label;
        if (Array.isArray(label)) k.querySelectorAll(':scope > .dual > span').forEach((n, i) => { n.textContent = label[i]; n.classList.toggle('short', label[i] in SHORT); });
        if (/\biso-ret\b/.test(cls)) isoShape(k);
        if (code === 'caps') k.dataset.sub = sub; // the label app.js puts back when the hyperkey is off
        if (L.name(code)) k.setAttribute('aria-label', L.name(code));
        r.appendChild(k);
      });
      kb.appendChild(r);
    });

    if (kopts.static) {
      // display-only copy for the export preview: out of the tab order and the a11y tree
      kb.inert = true;
    } else {
      // A click applies at once. A second click on the same key (a modifier in DBLABLE or a
      // trigger key) within DOUBLE_MS
      // turns it into a double-tap, replayed from the state before the first click, as
      // long as nothing else changed the selection in between. Nothing is ever pending,
      // so reset, export and the L/R toggle always see what's on screen.
      const snap = () => ({ sel: new Set(state.sel), dbl: new Set(state.dbl || []) });
      const sig = () => [...state.sel].sort().join() + '|' + [...(state.dbl || [])].sort().join();
      let last = null; // { code, before, after, t } — the last click on a key that can double
      kb.addEventListener('click', e => {
        const k = e.target.closest('.ksv-key');
        const code = k && k.dataset.code;
        if (!code || (state.locked && state.locked.has(code))) return;
        const now = performance.now();
        const upgrade = S.canDouble(code) && last && last.code === code && now - last.t < DOUBLE_MS && sig() === last.after;
        const before = upgrade ? last.before : snap();
        const next = S.select(Object.assign({}, state, before), code, { double: upgrade });
        state.sel = next.sel; state.dbl = next.dbl;
        onChange(); // the page repaints the keyboard in its refresh
        last = S.canDouble(code) && !upgrade ? { code, before, t: now, after: sig() } : null;
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

  // produce ordered list of {label, sub} keycaps for the current selection. ORDER puts the
  // modifiers first, then tab / esc / del / return (activation keys, so `mod` stays false)
  const ORDER = ['caps','fn','ctrl','rctrl','opt','cmd','rcmd','ropt','lshift','rshift','tab','esc','del','ret'];
  // keys drawn as an ICONS glyph in the keycap list; everything else is a text label
  const CAPICON = {
    fn: 'globe', ctrl: 'ctrl', rctrl: 'ctrl', opt: 'opt', cmd: 'cmd', rcmd: 'cmd', ropt: 'opt', lshift: 'shift', rshift: 'shift',
    tab: 'tab', del: 'del', ret: 'ret', up: 'up', down: 'down', left: 'left', right: 'right'
  };
  function caps(state) {
    const lr = !!state.lr, L = layout(layoutId(state)), span = (c) => (L.cell[c] && L.cell[c].span) || 4;
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
    // modifiers in ORDER; the trigger keys after them, in click order (several in combo mode)
    const mods = selArr.filter(c => S.MODS.has(c)).sort((a,b)=>ORDER.indexOf(a)-ORDER.indexOf(b));
    const keys = selArr.filter(c => !S.MODS.has(c));
    const out = [];
    mods.forEach(c => {
      const isHyper = c === 'caps' && !!state.hyper;
      const ic = c === 'caps' ? (isHyper ? 'hyper' : 'caps') : CAPICON[c];
      let sub = c === 'caps' ? (isHyper ? 'hyper' : 'caps') : null;
      if (lr && DIR[c] && L.has(PAIR[c])) sub = DIR[c]; // a MacBook's lone ctrl has no side
      out.push({ code: c, icon: ic || null, label: ic ? null : c, sub, mod: S.MODS.has(c), hyper: isHyper, dbl: isDbl(state, c), kb: L.id, span: span(c) });
    });
    keys.forEach(c => {
      const ic = CAPICON[c] || null, lb = L.cell[c] ? L.cell[c].label : c.toUpperCase();
      out.push({ code: c, icon: ic, label: ic ? null : baseLegend(lb), sub: null, mod: false, dbl: isDbl(state, c), kb: L.id, span: span(c) });
    });
    return out;
  }

  /* ---- keycaps export: the shortcut's keys in a row ----
     Each key drawn exactly as in the keyboard (drawKeyFace: shape, labels, selected look, at
     its keyboard width). Theme, surface, frame and grid work as for the keyboard. Two
     choices of its own: where the "+" goes and which keys glow. Drawn through the same
     painters as the keyboard, so PNG and SVG match, and the preview is this very image. */
  // sizes of the keycaps row, in base units; opts.capsSpec overrides any of them (the specimen
  // page's sliders use it to try values): margin, key height, space around a "+", its box and
  // font size
  const CAPS = { pad: 44, keyH: 92, gap: 14, plus: 22, plusSize: 34 };
  const capsSpec = (opts) => Object.assign({}, CAPS, (opts && opts.capsSpec) || {});
  // the "+": 'all' between every two keys, 'key' before each trigger (activation) key (none
  // between the modifiers),
  // 'none'. Glow (the selected, neon look): 'all', 'mods' (modifiers), 'key' (the trigger), 'none'
  const PLUS = ['all', 'key', 'none'], GLOW = ['all', 'mods', 'key', 'none'];
  const plusMode = (opts) => PLUS.includes(opts.plusMode) ? opts.plusMode : 'key';
  const glowMode = (opts) => GLOW.includes(opts.capsGlow) ? opts.capsGlow : 'mods';
  // is there a "+" between list[i - 1] and list[i]?
  const plusBefore = (list, i, mode) => mode === 'all' || (mode === 'key' && !list[i].mod);
  function capsDims(list, opts, scale) {
    const C = capsSpec(opts), mode = plusMode(opts);
    const h = C.keyH, bd = boardDims(1), k = h / bd.keyH, colW = bd.colW * k, g = BOARD.g * k;
    const widths = list.map((c) => c.span * colW + (c.span - 1) * g);
    // the space before each key: none for the first, a "+" box or a plain gap for the others
    const seps = list.map((c, i) => !i ? 0 : plusBefore(list, i, mode) ? 2 * C.gap + C.plus : C.gap);
    const cw = widths.reduce((a, b) => a + b, 0) + seps.reduce((a, b) => a + b, 0);
    const W = cw + 2 * C.pad, H = h + 2 * C.pad;
    return { widths, seps, W, H, cw, ch: h, keyH: h, even: true, pad: C.pad, spec: C, plus: mode, glow: glowMode(opts),
      r: h * KEYSPEC.radius, w: Math.round(W * scale), h: Math.round(H * scale) };
  }
  // output pixel dimensions for the current selection at a scale (1 = base @1x)
  function exportSize(state, scale, opts) {
    const list = caps(state);
    if (!list.length) return null;
    const d = capsDims(list, opts || {}, scale || 1);
    return { w: d.w, h: d.h, keys: list.length };
  }
  function drawCaps(p, list, opts, d, bg) {
    const accent = opts.accent || opts.hyper || '#22d3ee';
    drawCanvas(p, opts, d, bg);
    let x = d.pad;
    const y = d.pad;
    list.forEach((c, i) => {
      if (i) {
        if (plusBefore(list, i, d.plus)) p.text('+', x + d.spec.gap + d.spec.plus / 2, y + d.keyH / 2, { size: d.spec.plusSize, weight: 600, color: opts.plus || '#5a616b' });
        x += d.seps[i];
      }
      const w = d.widths[i];
      const lit = d.glow === 'all' || (d.glow === 'mods' && c.mod) || (d.glow === 'key' && !c.mod);
      drawKeyFace(p, c.code, x, y, w, d.keyH, d.r, lit, opts, accent, { hyper: c.hyper, dbl: c.dbl, bg, kb: c.kb });
      x += w;
    });
  }

  const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };
  // can this browser's canvas encode the format? (an unsupported type silently falls back to PNG)
  function canEncode(fmt) {
    if (fmt === 'svg' || fmt === 'png') return true;
    const c = document.createElement('canvas'); c.width = c.height = 1;
    return c.toDataURL(MIME[fmt]).indexOf('data:' + MIME[fmt]) === 0;
  }

  // keycap image — png / jpg / webp (canvas, at opts.scale) or svg (vector, always transparent)
  function capsImage(state, opts) {
    const list = caps(state);
    if (!list.length) return null;
    const fmt = opts.format || 'png', vector = fmt === 'svg', scale = vector ? 1 : (opts.scale || 2);
    const d = capsDims(list, opts, scale);
    const name = exportName('keycaps', list, opts.bgName) + '.' + fmt;
    const bg = (vector || opts.bg === 'transparent')
      ? (fmt === 'jpg' ? (opts.jpgBg || '#0a0b0d') : null)
      : (opts.bg || '#0a0b0d');
    if (vector) {
      const p = svgPainter();
      drawCaps(p, list, opts, d, bg);
      return { name, svg: p.svg(d.W, d.H) };
    }
    const cv = document.createElement('canvas'); cv.width = d.w; cv.height = d.h;
    const ctx = cv.getContext('2d'); ctx.scale(scale, scale);
    drawCaps(canvasPainter(ctx, scale), list, opts, d, bg);
    return { name, canvas: cv, fmt };
  }

  /* ---- output: one rendered image, downloaded or copied ----
     image() renders the current layout once — { name, svg } or { name, canvas, fmt } —
     so the download and the clipboard always carry the same picture. */
  function image(state, opts) {
    opts = opts || {};
    return opts.layout === 'board' ? boardImage(state, opts) : capsImage(state, opts);
  }
  // downloads go through a Blob and an object URL: no multi-MB base64 string at 4×.
  // Both resolve with what went out, { blob, name } (the page shows it: app.js showShot)
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
        return { blob: b, name: out.name };
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
    let shown; // the image as it looks, for the page
    if (opts.format === 'svg') {
      const blob = (type) => out.then((o) => new Blob([o.svg], { type }));
      if (ClipboardItem.supports && ClipboardItem.supports('image/svg+xml')) item['image/svg+xml'] = blob('image/svg+xml');
      item['text/plain'] = blob('text/plain');
      shown = blob('image/svg+xml');
    } else {
      shown = item['image/png'] = out.then((o) => new Promise((res) => o.canvas.toBlob(res, 'image/png')));
    }
    return navigator.clipboard.write([new ClipboardItem(item)])
      .then(() => Promise.all([shown, out]))
      .then(([blob, o]) => ({ blob, name: o.name }));
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
    // a key by what it reads in its layout (AZERTY's `q` is "a"), by its code otherwise
    const slug = (c) => c.label && /^[a-z0-9]$/i.test(c.label) ? c.label.toLowerCase() : SLUG[c.label] || SLUG[c.code] || c.code;
    const shortcut = (list && list.length) ? list.map(slug).join('-') : '';
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
  // the case in the export: FRAME.pad around the content (d.cw × d.ch: the keyboard, or the
  // keycaps row), rounded to whole grid cells and
  // centred, so with the grid on its four edges sit on grid lines (as in the page). The grid
  // starts on its top-left corner: gridOrigin() gives the first line at or after 0.
  // d.even (keycaps): the same padding on all four sides, the height's; only the top and bottom
  // edges sit on grid lines then, and the grid is centred across the width instead
  function frameRect(d) {
    const fit = (len) => Math.round((len + 2 * FRAME.pad) / GRID.step) * GRID.step;
    const h = fit(d.ch), w = d.even ? d.cw + (h - d.ch) : fit(d.cw);
    return { x: (d.W - w) / 2, y: (d.H - h) / 2, w, h };
  }
  function gridOrigin(d) {
    const f = frameRect(d), first = (v) => v - Math.floor(v / GRID.step) * GRID.step;
    return { x: first(d.even ? f.x + (f.w % GRID.step) / 2 : f.x), y: first(f.y) };
  }
  function boardDims(scale) {
    const b = BOARD;
    const colW = (b.innerW - (b.cols - 1) * b.g) / b.cols;
    const keyH = 4 * colW + 3 * b.g;          // square letter keys, like the selector
    const r = keyH * KEYSPEC.radius;           // corner radius from the shared spec
    const W = b.innerW + b.pad * 2;
    const H = b.pad * 2 + 6 * keyH + 5 * b.rowGap; // fn row + 5 main rows, all the same height
    return { W, H, w: Math.round(W * scale), h: Math.round(H * scale), colW, keyH, r, cw: b.innerW, ch: H - 2 * b.pad };
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
      // rounded rect (or, with s.notch {w, h}, the ISO return's L: isoD): `fills` painted in
      // order, then an optional stroke with an optional glow
      rrect(x, y, w, h, r, s) {
        const shape = (dx) => {
          const p = new Path2D();
          if (s.notch) p.addPath(new Path2D(isoD(x + dx, y, w, h, r, s.notch.w, s.notch.h)));
          else rrPath(p, x + dx, y, w, h, r);
          return p;
        };
        const P = shape(0);
        if (s.glow) {
          // outer glow = the shape's own shadow, painted outside it only (like a CSS
          // box-shadow): the shape is drawn far off-canvas and only its shadow is offset back,
          // under an even-odd clip that excludes the shape. Shadows ignore the transform,
          // hence the scale.
          const off = 1e4, clip = new Path2D();
          clip.rect(-off, -off, 3 * off, 3 * off); clip.addPath(P);
          ctx.save(); ctx.clip(clip, 'evenodd');
          ctx.shadowColor = s.glow.color; ctx.shadowBlur = s.glow.blur * scale; ctx.shadowOffsetX = off * scale;
          ctx.fillStyle = '#000'; ctx.fill(shape(-off));
          ctx.restore();
        }
        (s.fills || []).forEach((f) => { ctx.fillStyle = paint(f); ctx.fill(P); });
        if (s.inner) {
          // inner glow: a stroke's shadow, clipped to the shape so only the inside shows
          ctx.save(); ctx.clip(P);
          ctx.shadowColor = s.inner.color; ctx.shadowBlur = s.inner.blur * scale;
          ctx.lineWidth = 2; ctx.strokeStyle = s.inner.color; ctx.stroke(P);
          ctx.restore();
        }
        if (!s.stroke) return;
        ctx.lineWidth = s.lw; ctx.strokeStyle = paint(s.stroke); ctx.stroke(P);
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
        // a <rect>, or for the ISO return's L (s.notch) a <path>
        const d = s.notch ? isoD(x, y, w, h, r, s.notch.w, s.notch.h) : rrD(x, y, w, h, r);
        const shape = (a) => s.notch ? '<path d="' + d + '"' + a + '/>'
          : '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + r + '"' + a + '/>';
        if (s.glow) {
          // outer glow: the shape's shadow, clipped to everything but the shape (even-odd)
          const id = 'c' + (n++), big = 1e5;
          defs.push('<clipPath id="' + id + '"><path clip-rule="evenodd" d="M' + -big + ' ' + -big + 'H' + big + 'V' + big + 'H' + -big + 'Z' + d + '"/></clipPath>');
          out.push('<g clip-path="url(#' + id + ')">' + shape(' fill="#000"' + shadowOnly(s.glow)) + '</g>');
        }
        (s.fills || []).forEach((f) => out.push(shape(attr('fill', f))));
        if (s.inner) {
          // inner glow: a glowing stroke clipped to the shape (SVG 1.1 clipPath)
          const id = 'c' + (n++);
          defs.push('<clipPath id="' + id + '">' + shape('') + '</clipPath>');
          out.push(shape(' fill="none"' + attr('stroke', s.inner.color) + ' stroke-width="2" clip-path="url(#' + id + ')"' + glow(s.inner)));
        }
        if (s.stroke) out.push(shape(' fill="none"' + attr('stroke', s.stroke) + ' stroke-width="' + s.lw + '"'));
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
  // iso (the ISO return): { h: its full height over two rows, nw / nh: the corner it leaves
  // free }; h stays one key's height, which sizes the glows
  function boardSurface(p, x, y, w, h, r, on, opts, accent, iso) {
    const H = iso ? iso.h : h, notch = iso ? { w: iso.nw, h: iso.nh } : null;
    const base = opts.keyBg || '#131519';
    if (on) {
      const O = ONSTATE;
      // 135°-equivalent accent gradient; used for both the fill and the ring,
      // mirroring the DOM border-box layer
      const grad = { x1: x, y1: y, x2: x + w, y2: y + H, stops: [[0, hexA(accent, O.ringFrom)], [O.ringStop, hexA(accent, O.ringTo)]] };
      p.rrect(x, y, w, H, r, {
        notch, fills: [base, grad, hexA(accent, O.fill)],
        stroke: grad, lw: 1.5, glow: { color: hexA(accent, O.glow), blur: h * O.glowSize },
        inner: { color: hexA(accent, O.inner), blur: h * O.innerSize }
      });
    } else {
      p.rrect(x, y, w, H, r, { notch, fills: [base], stroke: opts.keyBorder || 'rgba(255,255,255,.08)', lw: 1 });
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
  // look: { low (a lone glyph in the bottom corner), phys (a MacBook's printed modifier: KEYSPEC.phys),
  // big (a lone glyph, large and centred: KEYSPEC.big) }
  function bmod(p, x, y, w, h, r, on, opts, accent, glyph, sub, ralign, accentGlyph, iso, look) {
    boardSurface(p, x, y, w, h, r, on, opts, accent, iso);
    look = look || {};
    const S = KEYSPEC, padX = h * (look.phys ? S.phys.padX : S.padX), padY = h * S.padY;
    const gSize = h * S.glyph, sSize = h * (look.phys ? S.phys.sub : S.sub), keyFg = opts.fg || '#d7dbe0';
    const gx = ralign ? x + w - padX : x + padX;
    // a label (the hyperkey's, on a printed caps lock) keeps the glyph in its top corner
    const gTop = look.low && !sub ? y + h - padY - gSize : y + padY;
    const gColor = (!on && accentGlyph) ? (opts.accentInk || accent) : keyFg;
    if (look.big && glyph) { const b = h * S.big; return p.icon(glyph, x + (w - b) / 2, y + (h - b) / 2, b, gColor); }
    if (glyph) p.icon(glyph, ralign ? gx - gSize : gx, gTop, gSize, gColor);
    if (sub) p.text(sub, gx, y + h - padY - sSize / 2, { size: sSize, weight: 500, color: keyFg, align: ralign ? 'right' : 'left' });
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

  // what's behind the keys, shared by the keyboard and the keycaps: fill, grid, case
  function drawCanvas(p, opts, d, bg) {
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
  }

  // a layout's rows, and every key's place in it by code: label, sub-label, span (in COLS)
  // and class (built once per layout)
  const LAYOUTS = {};
  function layout(id) {
    let [kb, look] = String(id).split(':');
    kb = KBS.includes(kb) ? kb : KB_DEFAULT;
    const pc = !kb.startsWith('mac'), phys = look === 'phys' && !pc;
    const superKey = pc && SUPERS.includes(look) && superOs(look) === kb.split('-')[0] ? look : null;
    id = kb + (phys ? ':phys' : superKey ? ':' + superKey : '');
    if (LAYOUTS[id]) return LAYOUTS[id];
    const rows = buildRows(kb, phys, superKey), cell = {};
    rows.forEach((row) => row.forEach(([code, label, sub, span, cls]) => { cell[code] = { label, sub, span, cls }; }));
    FN.forEach((c) => { cell[c] = c === 'esc' ? { span: 6, esc: true } : { span: 4, fnKey: true }; });
    ['up', 'down', 'left', 'right'].forEach((c) => { cell[c] = { span: 4, arrow: true }; });
    const names = Object.assign({}, KEYNAME, pc ? KEYNAME_PC : {}, kb.startsWith('linux') ? KEYNAME_LINUX : {});
    return (LAYOUTS[id] = { id, kb, pc, iso: kb.endsWith('-fr'), rows, cell, has: (c) => !!cell[c], name: (c) => names[c] });
  }

  // the double-tap badge, on a key's top-right corner
  function drawBadge(p, right, top, keyH, accent, bg, opts) {
    const br = keyH * 0.16, bx = right - br * 0.6, by = top + br * 0.6;
    p.circle(bx, by, br, { fill: accent, stroke: bg || opts.badgeRing || '#0a0b0d', lw: 1.5 });
    p.text('2', bx, by + 0.5, { size: br * 1.1, weight: 700, color: opts.hyperFg || '#0a0b0d' });
  }
  // one key as it looks in the keyboard, at any size: surface, labels and double-tap badge.
  // f: { kb (the layout), hyper (caps shows the hyperkey), dbl, bg (for the badge's ring),
  // iso (the ISO return's L, in the keyboard export: see boardSurface) }
  function drawKeyFace(p, code, x, y, w, keyH, r, isSel, opts, accent, f) {
    const c = layout(f.kb).cell[code] || { label: code.toUpperCase(), span: 4 }, keyFg = opts.fg || '#d7dbe0';
    if (c.esc) {
      // esc reads like the other special keys: a small bottom-left label
      boardSurface(p, x, y, w, keyH, r, isSel, opts, accent);
      blabel(p, x, y, w, keyH, opts, 'esc', false);
    } else if (c.fnKey) {
      bkey(p, x, y, w, keyH, r, isSel, opts, accent, code, keyH * KEYSPEC.fnKey, 'center');
    } else if (c.arrow) {
      barrow(p, x, y, w, keyH, r, isSel, opts, accent, code, keyH * KEYSPEC.glyph);
    } else if (code === 'space') {
      bkey(p, x, y, w, keyH, r, isSel, opts, accent, '', 20);
    } else if (Array.isArray(c.label)) {
      // two legends, stacked as printed: the shifted character above the other
      boardSurface(p, x, y, w, keyH, r, isSel, opts, accent);
      const S = KEYSPEC, num = isDigitKey(c.label), t = (size) => ({ size: keyH * size, weight: 400, color: keyFg });
      const sz = (ch, size) => size * (SHORT[ch] || 1);
      p.text(c.label[0], x + w / 2, y + keyH * S.dualY[0], t(sz(c.label[0], num ? S.dualSm : S.dual)));
      p.text(c.label[1], x + w / 2, y + keyH * S.dualY[1], t(sz(c.label[1], num ? S.letter : S.dual)));
    } else if (c.cls && /\bcorner\b/.test(c.cls)) {
      // a lone small character in the top-left corner (², on a French PC)
      boardSurface(p, x, y, w, keyH, r, isSel, opts, accent);
      const size = keyH * KEYSPEC.dual;
      p.text(c.label, x + keyH * KEYSPEC.padX, y + keyH * KEYSPEC.padY + size / 2, { size, weight: 400, color: keyFg, align: 'left' });
    } else if (c.cls && /\bfnkey\b/.test(c.cls)) {
      // like a real Mac: globe icon bottom-left, "fn" text top-right (bottom-right, as printed)
      boardSurface(p, x, y, w, keyH, r, isSel, opts, accent);
      const phys = /\bphys\b/.test(c.cls), padX = keyH * (phys ? KEYSPEC.phys.padX : KEYSPEC.padX), padY = keyH * KEYSPEC.padY;
      const gSize = keyH * KEYSPEC.glyph, sSize = keyH * (phys ? KEYSPEC.phys.sub : KEYSPEC.sub);
      p.icon('globe', x + padX, y + keyH - padY - gSize, gSize, isSel ? keyFg : (opts.accentInk || accent));
      p.text('fn', x + w - padX, phys ? y + keyH - padY - sSize / 2 : y + padY + sSize / 2, { size: sSize, weight: 500, color: keyFg, align: 'right' });
    } else if (c.cls && /\bsm\b/.test(c.cls)) {
      const ralign = /\bralign\b/.test(c.cls), accentGlyph = /\b(modkey|hyper)\b/.test(c.cls);
      const hy = code === 'caps' && f.hyper;
      bmod(p, x, y, w, keyH, r, isSel, opts, accent, hy ? 'hyper' : c.label, hy ? 'hyper' : c.sub, ralign, accentGlyph, f.iso,
        { low: /\blow\b/.test(c.cls), phys: /\bphys\b/.test(c.cls), big: /\bbig\b/.test(c.cls) });
    } else {
      bkey(p, x, y, w, keyH, r, isSel, opts, accent, c.label, keyH * KEYSPEC.letter);
    }
    if (f.dbl) drawBadge(p, x + w, y, keyH, accent, f.bg, opts);
  }

  // the keyboard itself, in base units, through a painter
  function drawBoard(p, state, opts, d, bg) {
    const b = BOARD;
    const sel = state.sel, on = (c) => isOn(state, c);
    const keyH = d.keyH, colW = d.colW, r = d.r;
    const accent = opts.accent || opts.hyper || '#22d3ee', L = layout(layoutId(state));
    drawCanvas(p, opts, d, bg);

    // function row — esc (wide) + F1..F12 (square) + a blank Touch ID square at the far right
    let y = b.pad;
    let fx = b.pad;
    const sqW = 4 * colW + 3 * b.g; // square key width = keyH (one letter unit)
    FN.forEach((c) => {
      const w = c === 'esc' ? 6 * colW + 5 * b.g : sqW;
      drawKeyFace(p, c, fx, y, w, keyH, r, sel.has(c), opts, accent, { kb: L.id });
      fx += w + b.g;
    });
    // Touch ID — blank, deactivated-looking key with a faint sensor ring (none on a PC)
    p.group(0.4, () => {
      boardSurface(p, fx, y, sqW, keyH, r, false, opts, accent);
      if (!L.pc) p.circle(fx + sqW / 2, y + keyH / 2, keyH * 0.2, { stroke: opts.keyBorder || 'rgba(255,255,255,.18)', lw: Math.max(1, keyH * 0.022) });
    });
    y += keyH + b.rowGap;

    // main rows
    L.rows.forEach(row => {
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
        // the ISO return's foot: drawn with the return, a row up
        if (cls === 'foot') { x += w + b.g; return; }
        const iso = cls && /\biso-ret\b/.test(cls) ? { h: 2 * keyH + b.rowGap, nw: colW + b.g, nh: keyH + b.rowGap } : null;
        // greyed out as on screen: locked by the hyperkey or over the modifier limit
        const grey = (state.locked && state.locked.has(code)) || S.maxed(state, code);
        p.group(grey ? 0.28 : 1, () => drawKeyFace(p, code, x, y, w, keyH, r, on(code), opts, accent,
          { kb: L.id, hyper: state.hyper, dbl: isDbl(state, code), bg, iso }));
        x += w + b.g;
      });
      y += keyH + b.rowGap;
    });
  }

  window.KSV = { KBS, LOOKS, SUPERS, hasKey: (kb, c) => layout(kb).has(c), buildKeyboard, buildBoardPreview, caps, render: image, exportImage, copyImage, exportSize, boardSize, boardDims, CAPS, frameRect, gridOrigin, BOARD, FRAME, GRID, THEMES, ink, canEncode, paint, icon, el, HYPER, KEYBG, COLS };
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
  // a polygon with every corner rounded to r (outer corners convex, inner ones concave), as
  // SVG path data — axis-aligned edges, clockwise
  function roundPoly(pts, r) {
    const n = pts.length;
    return pts.map((p, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
      const ux = Math.sign(a[0] - p[0]), uy = Math.sign(a[1] - p[1]), vx = Math.sign(b[0] - p[0]), vy = Math.sign(b[1] - p[1]);
      const sweep = (-ux) * vy - (-uy) * vx > 0 ? 1 : 0; // a right turn (clockwise) is convex
      return (i ? 'L' : 'M') + (p[0] + ux * r) + ' ' + (p[1] + uy * r) + 'A' + r + ' ' + r + ' 0 0 ' + sweep + ' ' + (p[0] + vx * r) + ' ' + (p[1] + vy * r);
    }).join('') + 'Z';
  }
  // the ISO return: a w × h box less its bottom-left corner (nw × nh), all corners rounded
  function isoD(x, y, w, h, r, nw, nh) {
    return roundPoly([[x, y], [x + w, y], [x + w, y + h], [x + nw, y + h], [x + nw, y + h - nh], [x, y + h - nh]], r);
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
