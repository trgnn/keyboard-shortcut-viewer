// Loads the site's scripts into a sandbox, as the page would, for the Node tests.
// The DOM isn't there: the only thing the engine asks of it at render time is the canvas
// measure of the text baseline (svgText), stubbed here with the value measured in the browser, so SVG
// output is deterministic.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BASELINE = 0.300625; // measured in Helium: alphabetic baseline below the canvas 'middle' line, per px of font size

export function loadKSV() {
  const ctx = { console };
  ctx.window = ctx;
  ctx.document = {
    createElement: () => ({ getContext: () => ({ measureText: () => ({ alphabeticBaseline: -BASELINE * 100 }) }) }),
  };
  vm.createContext(ctx);
  for (const file of ['select.js', 'glyphs.js', 'ksv.js']) {
    vm.runInContext(readFileSync(new URL('../site/' + file, import.meta.url), 'utf8'), ctx, { filename: file });
  }
  return ctx;
}
