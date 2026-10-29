// Live checks, run in the test browser on a freshly loaded page (dev server: tools/serve.py):
//   tools/test-browser.sh start && node tools/cdp.mjs open http://localhost:8124/
//   node tools/cdp.mjs eval tools/test-live.js
// - parity: for each layout and a few selections, exports the PNG (1×) and the SVG,
//   rasterizes the SVG at the PNG's size and compares them. `over40` is the share of pixels
//   whose colour differs by more than 40/255: anti-aliasing only should stay well under 1%.
//   The SVG must hold no <text> (labels are outlines).
// - behaviour: clicks resolve at once (reset / export right after a modifier click), five
//   modifiers, the greyed-keys option, copy, CSP violations, accessible names, idle glow.
// - keyboards: every keyboard / language / look from the dropdowns keeps the keyboard's
//   height and carries ⌘K over; a list closes when the keyboard takes the pointer; ⇧S folds
//   the rail and the toggle follows it.
// - shortcuts: a swatch picks the shortcut to edit, a key in two shows both colours, ⇧R clears
//   only the one being edited, an empty one shows as an outline; a swatch's clear button
//   empties its shortcut; multi shortcut off leaves one shortcut, recoloured by the swatches.
// - colours: a swatch's edit button opens the picker above it (inside the window); a hex
//   recolours the swatch and the keys, *default* brings the colour back, Escape closes.
(async () => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const key = (c) => $('#kbMount .ksv-key[data-code="' + c + '"]');
  // clear keys: the ⇧R hotkey (no button since v1.3), every shortcut
  const clearKeys = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'R', shiftKey: true }));
  const seg = (id, i) => $('#' + id + ' button:nth-child(' + i + ')').click();
  const range = $('#scaleRange');
  const setScale = (v) => { range.value = v; range.dispatchEvent(new Event('input')); };
  const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });

  // capture downloads instead of saving them (exports are object URLs: keep their blobs)
  const blobs = new Map(), makeURL = URL.createObjectURL;
  URL.createObjectURL = (b) => { const u = makeURL(b); blobs.set(u, b); return u; };
  const files = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) files.push({ name: this.download, href: this.href }); else click.call(this); };
  const download = async () => { const n = files.length; $('#exportBtn').click(); for (let i = 0; i < 100 && files.length === n; i++) await wait(30); return files[files.length - 1]; };

  async function compare() {
    seg('extSeg', 1); seg('bgSeg', 1); setScale(1); await wait(30);
    const png = await download();
    seg('extSeg', 4); await wait(30);
    const svg = await download();
    const a = await load(png.href), b = await load(svg.href);
    const W = a.naturalWidth, H = a.naturalHeight;
    const px = (img, bg) => {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      if (bg) { x.fillStyle = bg; x.fillRect(0, 0, W, H); }
      x.drawImage(img, 0, 0, W, H);
      return x.getImageData(0, 0, W, H).data;
    };
    const p = px(a), q = px(b, '#0a0b0d'); // the SVG is transparent: put it on the dark export bg
    let over = 0;
    for (let i = 0; i < p.length; i += 4) {
      if ((Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2])) / 3 > 40) over++;
    }
    const markup = await blobs.get(svg.href).text();
    return { file: svg.name, size: W + 'x' + H, over40: (over / (W * H) * 100).toFixed(2) + '%', textTags: (markup.match(/<text/g) || []).length };
  }

  const results = {};
  for (const layout of [1, 2]) {
    seg('layoutSeg', layout); await wait(30);
    const name = layout === 1 ? 'keyboard' : 'keycaps';
    clearKeys();
    for (const c of ['ctrl', 'opt', 'cmd']) { key(c).click(); await wait(260); }
    key('k').click(); await wait(30);
    results[name + ' ⌃⌥⌘K'] = await compare();
    clearKeys();
    key('lshift').click(); await wait(60); key('lshift').click(); await wait(300); // double-tap
    results[name + ' ⇧⇧'] = await compare();
    clearKeys();
    key('F12').click(); await wait(30);
    results[name + ' F12'] = await compare();
  }

  // KSV-02: a click is applied at once, so reset / export right after it see it
  seg('layoutSeg', 1); seg('extSeg', 1); await wait(30);
  clearKeys(); await wait(300);
  key('cmd').click(); clearKeys(); await wait(300);
  const afterReset = [...document.querySelectorAll('#kbMount .ksv-key.on')].map((k) => k.dataset.code);
  key('opt').click();
  const exported = (await download()).name;
  results.clickResolution = { afterReset, exportRightAfterClick: exported };

  // ⌃⌥⇧⌘ + fn; the keys left unavailable are greyed out on screen and in the preview alike
  clearKeys(); await wait(30);
  for (const c of ['fn', 'ctrl', 'opt', 'lshift', 'cmd']) { key(c).click(); await wait(260); }
  const held = [...document.querySelectorAll('#kbMount .ksv-key.on')].map((k) => k.dataset.code).filter((c) => !['rshift', 'rcmd', 'ropt'].includes(c));
  const maxed = (root) => [...document.querySelectorAll(root + ' .ksv-key.maxed')].map((k) => k.dataset.code).join();
  results.fiveMods = { held, maxedOnScreen: maxed('#kbMount'), maxedInPreview: maxed('#preview') };

  // copy is only offered for the formats the clipboard takes
  results.copyEnabled = {};
  for (const [i, f] of [[1, 'png'], [2, 'jpg'], [3, 'webp'], [4, 'svg']]) { seg('extSeg', i); await wait(20); results.copyEnabled[f] = !$('#copyBtn').disabled; }

  // copy: the configured output lands on the clipboard
  if (navigator.clipboard.read) {
    seg('extSeg', 1); await wait(30);
    $('#copyBtn').click(); await wait(800);
    const items = await navigator.clipboard.read().catch((e) => e.message);
    results.copy = Array.isArray(items) ? items.map((i) => i.types.join('+')).join(', ') : items;
  }

  // every button has an accessible name; the export preview is out of the a11y tree
  results.unnamedButtons = [...document.querySelectorAll('button')]
    .filter((b) => !b.closest('[inert]') && !b.textContent.trim() && !b.getAttribute('aria-label'))
    .map((b) => b.outerHTML.slice(0, 60));

  // the background glow settles: nothing moves once idle
  const lit = $('.grid-lit');
  await wait(1500);
  const g1 = lit.style.cssText; await wait(500);
  results.glowIdle = g1 === lit.style.cssText;

  results.fonts = [...document.fonts].map((f) => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.status);
  results.cspViolations = violations;

  // keyboards: each dropdown choice rebuilds the keyboard at the same height, ⌘K carried over
  const pick = async (id, label) => {
    $('#' + id + ' .pick-btn').click(); await wait(20);
    const o = [...document.querySelectorAll('#' + id + ' .pick-opt')].find((n) => (n.getAttribute('aria-label') || n.textContent) === label);
    if (o) o.click(); await wait(80);
    return !!o;
  };
  const kbH = () => Math.round($('#kbMount .ksv-kb').getBoundingClientRect().height);
  clearKeys(); key('cmd').click(); await wait(250); key('k').click(); await wait(250);
  const h0 = kbH(), seen = [];
  for (const [id, label] of [['langPick', 'AZERTY FR'], ['lookPick', 'Custom modifiers'], ['osPick', 'Windows / Linux'],
    ['lookPick', 'Linux logo and super'], ['langPick', 'QWERTY US'], ['lookPick', 'Framework logo'], ['osPick', 'MacBook'], ['lookPick', 'Default modifiers']]) {
    const found = await pick(id, label);
    seen.push(label + (found ? '' : ' (missing)') + ': ' + $('#kbMount .ksv-kb').dataset.kb + (kbH() === h0 ? '' : ' height ' + kbH()) +
      (key('cmd').classList.contains('on') && key('k').classList.contains('on') ? '' : ' lost ⌘K'));
  }
  results.keyboards = seen;
  $('#osPick .pick-btn').click(); await wait(20);
  $('.panel').dispatchEvent(new MouseEvent('mouseenter'));
  results.listClosesOnKeyboard = $('#osPick .pick-list').hidden;
  const btnRight = () => Math.round($('#railBtn').getBoundingClientRect().right);
  const open = btnRight();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', shiftKey: true })); await wait(450);
  const folded = { railInert: $('.rail').inert, toggleMoved: btnRight() > open };
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'S', shiftKey: true })); await wait(450);
  results.railFold = { ...folded, back: btnRight() === open && !$('.rail').inert };

  // shortcuts: one per swatch; a key in two of them carries both colours
  const chips = () => [...document.querySelectorAll('#accentSwatches .sw-chip')];
  results.multiDefaultOff = $('#multiSeg button.on').textContent === 'off' && $('#digitHint').textContent === 'color';
  $('#multiSeg button:last-child').click(); await wait(30);
  results.digitHintOn = $('#digitHint').textContent === 'shortcut';
  clearKeys(); await wait(30);
  key('cmd').click(); await wait(250); key('k').click(); await wait(250);
  chips()[1].click(); await wait(30);
  key('cmd').click(); await wait(250); key('c').click(); await wait(250);
  const shared = key('cmd').classList.contains('multi') && key('k').classList.contains('on') && key('c').classList.contains('on');
  document.querySelectorAll('#accentSwatches .sw-clear')[1].click(); await wait(30);
  results.shortcuts = { shared, clearsOnlyActive: key('cmd').classList.contains('on') && !key('cmd').classList.contains('multi') && !key('c').classList.contains('on'),
    emptyOutlined: chips()[1].classList.contains('empty') && !chips()[0].classList.contains('empty') };
  chips()[1].click(); await wait(30); key('c').click(); await wait(250);
  document.querySelectorAll('#accentSwatches .sw-clear')[0].click(); await wait(30);
  results.shortcuts.clearButton = !key('k').classList.contains('on') && key('c').classList.contains('on');
  $('#multiSeg button:first-child').click(); await wait(30);
  chips()[3].click(); await wait(30);
  results.shortcuts.multiOff = key('c').classList.contains('on') && getComputedStyle(key('c')).getPropertyValue('--accent').trim() === '#ff3d8b'
    && !document.querySelector('#accentSwatches .sw-chip.empty');
  $('#multiSeg button:last-child').click(); await wait(30);
  // ⇧2 picks the second shortcut (by the digit key's place); ⇧R empties them all
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '@', code: 'Digit2', shiftKey: true })); await wait(30);
  results.shortcuts.shiftDigit = chips()[1].classList.contains('on');
  clearKeys(); await wait(30);
  results.shortcuts.clearsAll = !document.querySelector('#kbMount .ksv-key.on') && chips().every((c) => c.classList.contains('empty'));
  chips()[0].click(); await wait(30);
  $('#multiSeg button:first-child').click(); await wait(30);

  // double-tap off: a double-click is two clicks (no badge), and existing double-taps go
  clearKeys(); await wait(30);
  key('k').click(); await wait(60); key('k').click(); await wait(300);
  const dblOn = key('k').classList.contains('dbl');
  $('#dblSeg button:first-child').click(); await wait(30);
  const cleared = !key('k').classList.contains('dbl');
  key('j').click(); await wait(60); key('j').click(); await wait(300);
  results.doubleTapOption = { dblOn, cleared, offTwoClicks: !key('j').classList.contains('dbl') && !key('j').classList.contains('on') };
  $('#dblSeg button:last-child').click(); await wait(30);
  clearKeys(); await wait(30);

  // colours: edit the first (the one in use) through the picker's hex, then back to default
  document.querySelector('#accentSwatches .sw-edit').click(); await wait(30);
  const pk = $('.picker'), hexIn = pk.querySelector('.pk-hex'), pr = pk.getBoundingClientRect();
  hexIn.focus(); hexIn.value = '#ffd400'; hexIn.dispatchEvent(new Event('input')); await wait(30);
  const recoloured = getComputedStyle(document.documentElement.querySelector('#app')).getPropertyValue('--accent').trim() === '#ffd400'
    && chips()[0].style.getPropertyValue('--sw') === '#ffd400';
  pk.querySelector('.pk-reset').click(); await wait(30);
  const back = chips()[0].style.getPropertyValue('--sw') === '#22d3ee' && pk.querySelector('.pk-reset').hidden;
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(30);
  results.colors = { inWindow: pr.top >= 0, recoloured, back, closes: !$('.picker') };

  // keycaps with nothing selected: nothing to export or copy
  seg('layoutSeg', 2); clearKeys(); await wait(30);
  results.emptyKeycaps = { exportDisabled: $('#exportBtn').disabled, copyDisabled: $('#copyBtn').disabled };
  seg('layoutSeg', 1);

  HTMLAnchorElement.prototype.click = click;
  URL.createObjectURL = makeURL;
  try { localStorage.removeItem('ksv-ui-v1'); } catch (e) { /* ignore */ }
  return results;
})()
