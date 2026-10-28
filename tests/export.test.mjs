// SVG export snapshots: the painter output is a deterministic string, so any change to
// what gets drawn shows up here. Review the diff, then accept it with
//   UPDATE_SNAPSHOTS=1 node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { loadKSV } from './load.mjs';

const { KSV } = loadKSV();
const base = { bg: 'transparent', keyBg: '#131519', keyBorder: 'rgba(255,255,255,.12)', plus: '#5a616b',
  accent: '#22d3ee', hyper: '#22d3ee', hyperFg: '#0a0b0d', format: 'svg', bgName: 'alpha' };
const state = (sel, extra = {}) => ({ sel: new Set(sel), dbl: new Set(), lr: false, hyper: false, locked: new Set(), ...extra });

const CASES = {
  'board-cmd-k': [state(['cmd', 'k']), { layout: 'board' }],
  'board-hyper-space': [state(['caps', 'space'], { hyper: true, locked: new Set(['ctrl', 'opt', 'cmd', 'rcmd', 'ropt']) }), { layout: 'board' }],
  'board-five-mods-undimmed': [state(['fn', 'ctrl', 'opt', 'lshift', 'cmd']), { layout: 'board', dim: false }],
  'board-double-shift-lr': [state(['rshift'], { lr: true, dbl: new Set(['rshift']) }), { layout: 'board' }],
  'keycaps-hyper-f12': [state(['caps', 'F12'], { hyper: true }), { layout: 'keycaps' }],
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

test('export names spell out symbol keys', () => {
  const out = KSV.render(state(['cmd', '/']), { ...base, layout: 'board' });
  assert.equal(out.name, 'KSV-keyboard-alpha_cmd-slash.svg');
});
