// SVG export snapshots: the painter output is a deterministic string, so any change to
// what gets drawn shows up here. Review the diff, then accept it with
//   UPDATE_SNAPSHOTS=1 node --test 'tests/*.test.mjs'
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadKSV } from './load.mjs';

const { KSV } = loadKSV();
const base = { bg: 'transparent', keyBg: '#131519', keyBorder: 'rgba(255,255,255,.12)', plus: '#5a616b',
  accent: '#22d3ee', hyper: '#22d3ee', hyperFg: '#0a0b0d', format: 'svg', bgName: 'alpha' };
// KSV's own modifier labels (look: 'custom') unless a case says otherwise
const state = (sel, extra = {}) => ({ sel: new Set(sel), dbl: new Set(), lr: false, hyper: false, locked: new Set(), look: 'custom', ...extra });

const CASES = {
  'board-cmd-k': [state(['cmd', 'k']), { layout: 'board' }],
  'board-hyper-space': [state(['caps', 'space'], { hyper: true, locked: new Set(['ctrl', 'opt', 'cmd', 'rcmd', 'ropt']) }), { layout: 'board' }],
  'board-five-mods': [state(['fn', 'ctrl', 'opt', 'lshift', 'cmd']), { layout: 'board' }],
  'board-double-shift-lr': [state(['rshift'], { lr: true, dbl: new Set(['rshift']) }), { layout: 'board' }],
  'board-frame-grid': [state(['cmd', 'k']), { layout: 'board', frame: true, grid: true, gridColor: 'rgba(255,255,255,.02)' }],
  'board-translucent-frame': [state(['cmd', 'k']), { layout: 'board', frame: true, keyBg: 'rgba(19,21,25,0.6)', frameFill: 'rgba(13,15,18,0.4)' }],
  'keycaps-hyper-f12': [state(['caps', 'F12'], { hyper: true }), { layout: 'keycaps' }],
  'keycaps-cmd-k': [state(['cmd', 'k']), { layout: 'keycaps' }],
  'keycaps-no-plus-frame-grid': [state(['ctrl', 'opt', 'F10']), { layout: 'keycaps', plusMode: 'none', frame: true, grid: true, gridColor: 'rgba(255,255,255,.02)' }],
  'keycaps-double-shift': [state(['lshift'], { dbl: new Set(['lshift']) }), { layout: 'keycaps' }],
  'keycaps-cmd-double-k': [state(['cmd', 'k'], { dbl: new Set(['k']) }), { layout: 'keycaps' }],
  // tab is the trigger, not a modifier: one "+" before it, only the modifiers glow
  'keycaps-plus-key-glow-mods': [state(['ctrl', 'opt', 'tab']), { layout: 'keycaps', plusMode: 'key', capsGlow: 'mods' }],
  // the other layouts: ISO return (an L), AZERTY legends, a Windows laptop's bottom row
  'board-mac-fr-return': [state(['cmd', 'ret'], { kb: 'mac-fr' }), { layout: 'board' }],
  'board-win-fr-ctrl-1': [state(['ctrl', '1'], { kb: 'win-fr', dbl: new Set(['1']) }), { layout: 'board' }],
  'board-win-us-ctrl-alt-del': [state(['rctrl', 'opt', 'del'], { kb: 'win-us', lr: true }), { layout: 'board' }],
  // the modifiers as printed on a MacBook; a Linux laptop (super key); ² in its corner
  'board-mac-us-printed-hyper': [state(['caps', 'rcmd', 'k'], { look: 'printed', hyper: true, lr: true }), { layout: 'board' }],
  'board-mac-fr-printed-ret': [state(['fn', 'ret'], { kb: 'mac-fr', look: 'printed' }), { layout: 'board' }],
  'board-linux-fr-super-2': [state(['cmd', '`'], { kb: 'linux-fr' }), { layout: 'board' }],
  'board-linux-us-framework-super': [state(['cmd', 'space'], { kb: 'linux-us', superKey: 'framework' }), { layout: 'board' }],
  'board-win-fr-logo-only-e': [state(['cmd', 'e'], { kb: 'win-fr', superKey: 'win-logo' }), { layout: 'board' }],
  'keycaps-linux-framework-logo-l': [state(['cmd', 'l'], { kb: 'linux-us', superKey: 'framework-logo' }), { layout: 'keycaps' }],
  'keycaps-linux-tux-super-t': [state(['cmd', 't'], { kb: 'linux-us', superKey: 'tux' }), { layout: 'keycaps' }],
  'keycaps-mac-printed-fn-ctrl-tab': [state(['fn', 'ctrl', 'tab'], { look: 'printed' }), { layout: 'keycaps' }],
  'keycaps-mac-fr-cmd-a-1': [state(['cmd', 'q', '1'], { kb: 'mac-fr', combo: true }), { layout: 'keycaps' }],
};

for (const [name, [st, opts]] of Object.entries(CASES)) {
  test(name, () => {
    const out = KSV.render(st, { ...base, ...opts });
    assert.ok(out && out.svg, 'renders an SVG');
    assert.ok(!out.svg.includes('<text'), 'labels are outlines, not text');
    const file = new URL('snapshots/' + name + '.svg', import.meta.url);
    if (process.env.UPDATE_SNAPSHOTS || !existsSync(file)) writeFileSync(file, out.svg + '\n');
    assert.equal(out.svg + '\n', readFileSync(file, 'utf8'));
  });
}

test("a MacBook's modifiers read as printed by default", () => {
  const st = (look) => ({ sel: new Set(['cmd', 'k']), dbl: new Set(), lr: false, hyper: false, locked: new Set(), look });
  assert.equal(KSV.render(st(undefined), { ...base, layout: 'board' }).svg, KSV.render(st('printed'), { ...base, layout: 'board' }).svg);
  assert.notEqual(KSV.render(st('custom'), { ...base, layout: 'board' }).svg, KSV.render(st('printed'), { ...base, layout: 'board' }).svg);
});

test('export names spell out symbol keys', () => {
  const out = KSV.render(state(['cmd', '/']), { ...base, layout: 'board' });
  assert.equal(out.name, 'KSV-keyboard-alpha_cmd-slash.svg');
});
