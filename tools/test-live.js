// Live checks, run in the test browser on a freshly loaded page (dev server: tools/serve.py):
//   tools/test-browser.sh start && node tools/cdp.mjs open http://localhost:8124/
//   node tools/cdp.mjs eval tools/test-live.js
// - parity: for each layout and a few selections, exports the PNG (1×) and the SVG,
//   rasterizes the SVG at the PNG's size and compares them. `over40` is the share of pixels
//   whose colour differs by more than 40/255: anti-aliasing only should stay well under 1%.
//   The SVG must hold no <text> (labels are outlines).
// - behaviour: clicks resolve at once (reset / export right after a modifier click), five
//   modifiers, the greyed-keys option, copy, CSP violations, accessible names, idle glow.
(async () => {
  const violations = [];
  document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective + ' ' + e.blockedURI));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const key = (c) => $('#kbMount .ksv-key[data-code="' + c + '"]');
  const seg = (id, i) => $('#' + id + ' button:nth-child(' + i + ')').click();
  const range = $('#scaleRange');
  const setScale = (v) => { range.value = v; range.dispatchEvent(new Event('input')); };
  const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });

  // capture downloads instead of saving them
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
    const markup = decodeURIComponent(svg.href.split(',')[1]);
    return { file: svg.name, size: W + 'x' + H, over40: (over / (W * H) * 100).toFixed(2) + '%', textTags: (markup.match(/<text/g) || []).length };
  }

  const results = {};
  for (const layout of [1, 2]) {
    seg('layoutSeg', layout); await wait(30);
    const name = layout === 1 ? 'keyboard' : 'keycaps';
    $('#resetBtn').click();
    for (const c of ['ctrl', 'opt', 'cmd']) { key(c).click(); await wait(260); }
    key('k').click(); await wait(30);
    results[name + ' ⌃⌥⌘K'] = await compare();
    $('#resetBtn').click();
    key('lshift').click(); await wait(60); key('lshift').click(); await wait(300); // double-tap
    results[name + ' ⇧⇧'] = await compare();
    $('#resetBtn').click();
    key('F12').click(); await wait(30);
    results[name + ' F12'] = await compare();
  }

  // KSV-02: a click is applied at once, so reset / export right after it see it
  seg('layoutSeg', 1); seg('extSeg', 1); await wait(30);
  $('#resetBtn').click(); await wait(300);
  key('cmd').click(); $('#resetBtn').click(); await wait(300);
  const afterReset = [...document.querySelectorAll('#kbMount .ksv-key.on')].map((k) => k.dataset.code);
  key('opt').click();
  const exported = (await download()).name;
  results.clickResolution = { afterReset, exportRightAfterClick: exported };

  // ⌃⌥⇧⌘ + fn, and the greyed-keys option on the export and its preview
  $('#resetBtn').click(); await wait(30);
  for (const c of ['fn', 'ctrl', 'opt', 'lshift', 'cmd']) { key(c).click(); await wait(260); }
  const held = [...document.querySelectorAll('#kbMount .ksv-key.on')].map((k) => k.dataset.code).filter((c) => !['rshift', 'rcmd', 'ropt'].includes(c));
  seg('dimSeg', 1); await wait(30);
  const prevDimmed = document.querySelectorAll('#preview .ksv-key.maxed').length;
  const dimmed = await download();
  seg('dimSeg', 2); await wait(30);
  const prevPlain = document.querySelectorAll('#preview .ksv-key.maxed').length;
  const plain = await download();
  seg('dimSeg', 1);
  results.fiveMods = { held, previewMaxed: { dimmed: prevDimmed, normal: prevPlain }, exportsDiffer: dimmed.href !== plain.href };

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

  HTMLAnchorElement.prototype.click = click;
  try { localStorage.removeItem('ksv-ui-v1'); } catch (e) { /* ignore */ }
  return results;
})()
