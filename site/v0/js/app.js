// app.js — seul fichier qui touche au DOM.
// ---------------------------------------------------------------------------
// État global :
//   selected        : touches explicitement sélectionnées dans le clavier
//                     principal (ce que l'utilisateur a cliqué).
//   hyperkeyMods    : modificateurs activés par Caps Lock (hyperkey sauvée).
//   tempHyperkeyMods: édition en cours dans la modal (annulable).
//
// Important : `selected` ne contient jamais les modificateurs de la hyperkey
// automatiquement — ils sont ajoutés uniquement pour l'AFFICHAGE dans
// renderKeyboard(). Ainsi l'export SVG montre Caps Lock (et les autres
// touches explicites), pas les mods développés.
// ---------------------------------------------------------------------------

import { getKeyById } from './keyboardLayout.js';
import { buildFullLayout, cropToSelection } from './layoutEngine.js';
import { renderSvg } from './svgRenderer.js';

// --- Constantes -----------------------------------------------------------

const HYPERKEY_TRIGGER  = 'CapsLock';
const STORAGE_KEY       = 'ksv-hyperkey-mods';
const STORAGE_KEY_SIDE  = 'ksv-side-specific';

// Seules ces touches sont cliquables dans la modal hyperkey.
// Fn est exclu : on ne peut pas l'assigner à la hyperkey.
const SELECTABLE_MODS = new Set([
  'ControlLeft', 'OptionLeft', 'OptionRight',
  'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight',
]);

// Ordre d'affichage dans le résumé : modificateurs d'abord.
const MOD_ORDER = [
  'ControlLeft', 'OptionLeft', 'ShiftLeft', 'MetaLeft',
  'MetaRight', 'OptionRight', 'Fn', 'CapsLock',
];

// Touches considérées comme des « modificateurs » (combinables sans limite).
// Tout le reste est une « activation key » — une seule à la fois dans la sélection.
const MODIFIER_IDS = new Set([
  'Fn', 'ControlLeft', 'OptionLeft', 'OptionRight',
  'MetaLeft', 'MetaRight', 'ShiftLeft', 'ShiftRight',
  'CapsLock',
]);

// Paires gauche/droite pour le mode agnostique.
// right → canonical (left)
const RIGHT_TO_CANONICAL = new Map([
  ['MetaRight',   'MetaLeft'],
  ['OptionRight', 'OptionLeft'],
  ['ShiftRight',  'ShiftLeft'],
]);
// canonical (left) → right
const CANONICAL_TO_RIGHT = new Map([
  ['MetaLeft',   'MetaRight'],
  ['OptionLeft', 'OptionRight'],
  ['ShiftLeft',  'ShiftRight'],
]);

// --- État -----------------------------------------------------------------

const selected        = new Set();
const hyperkeyMods    = new Set();
let   tempHyperkeyMods = new Set();
let   currentSvg      = '';
let   sideSpecific    = false; // false = agnostic (default)

// --- Références DOM -------------------------------------------------------

const els = {
  keyboard:         document.getElementById('keyboard'),
  keyboardWrapper:  document.getElementById('keyboard-wrapper'),
  output:           document.getElementById('output'),
  chips:            document.getElementById('shortcut-chips'),
  download:         document.getElementById('download'),
  reset:            document.getElementById('reset'),
  hyperkeyBtn:      document.getElementById('hyperkey-btn'),
  hyperkeyStatus:   document.getElementById('hyperkey-status'),
  overlay:          document.getElementById('hyperkey-overlay'),
  modalKeyboard:    document.getElementById('hyperkey-keyboard'),
  modalSave:        document.getElementById('hyperkey-save'),
  modalCancel:      document.getElementById('hyperkey-cancel'),
  sideToggle:       document.getElementById('side-specific-toggle'),
};

// --- Helpers --------------------------------------------------------------

function selectedKeys() {
  return [...selected].map(getKeyById).filter(Boolean);
}

function keyLabel(k) {
  const main = k.label || '';
  let text = k.sub ? `${main} ${k.sub}`.trim() : main;
  // In side-specific mode, disambiguate left vs. right when both sides exist.
  if (sideSpecific && CANONICAL_TO_RIGHT.has(k.id))  text += ' (left)';
  if (sideSpecific && RIGHT_TO_CANONICAL.has(k.id))  text += ' (right)';
  return text;
}

function sortForDisplay(keys) {
  return [...keys].sort((a, b) => {
    const ia = MOD_ORDER.indexOf(a.id);
    const ib = MOD_ORDER.indexOf(b.id);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return a.row !== b.row ? a.row - b.row : a.x - b.x;
  });
}

// --- Rendu clavier principal ----------------------------------------------

function renderKeyboard() {
  // En mode agnostique, les deux côtés d'un modificateur sélectionné
  // s'affichent comme actifs (ex. MetaLeft sélectionné → MetaRight aussi mis
  // en surbrillance, puisque « either side triggers the shortcut »).
  const displaySelected = new Set(selected);
  if (!sideSpecific) {
    selected.forEach(id => {
      if (CANONICAL_TO_RIGHT.has(id)) displaySelected.add(CANONICAL_TO_RIGHT.get(id));
    });
  }

  // Touches impliquées par la hyperkey (affichage passif).
  const impliedIds = new Set();
  if (selected.has(HYPERKEY_TRIGGER) && hyperkeyMods.size > 0) {
    hyperkeyMods.forEach(m => {
      impliedIds.add(m);
      // La hyperkey est toujours agnostique : on étend aux deux côtés.
      if (CANONICAL_TO_RIGHT.has(m)) impliedIds.add(CANONICAL_TO_RIGHT.get(m));
    });
  }

  const layout = buildFullLayout(displaySelected, impliedIds);
  els.keyboard.innerHTML = renderSvg(layout, { interactive: true });
}

function renderChips(keys) {
  if (!keys.length) { els.chips.innerHTML = ''; return; }
  const sorted = sortForDisplay(keys);
  els.chips.innerHTML = sorted.map((k, i) => {
    const glyph = k.label || k.sub || '';
    // In side-specific mode, append a superscript L or R for paired modifiers.
    let side = '';
    if (sideSpecific) {
      if (CANONICAL_TO_RIGHT.has(k.id)) side = '<span class="chip-side">L</span>';
      if (RIGHT_TO_CANONICAL.has(k.id))  side = '<span class="chip-side">R</span>';
    }
    const cls = MODIFIER_IDS.has(k.id) ? 'key-chip' : 'key-chip key-chip--action';
    const sep = i < sorted.length - 1 ? '<span class="chip-sep">+</span>' : '';
    return `<span class="${cls}">${glyph}${side}</span>${sep}`;
  }).join('');
}

function renderPreview() {
  const keys = selectedKeys();

  if (!keys.length) {
    els.output.innerHTML =
      '<p class="placeholder">Click keys on the keyboard to build a shortcut.</p>';
    renderChips([]);
    els.download.disabled = true;
    currentSvg = '';
    return;
  }

  const layout = cropToSelection(keys);
  currentSvg = renderSvg(layout);
  els.output.innerHTML = currentSvg;
  renderChips(keys);
  els.download.disabled = false;
}

function updateHyperkeyBtn() {
  if (hyperkeyMods.size === 0) {
    els.hyperkeyStatus.textContent = '';
    els.hyperkeyBtn.textContent = 'Configure hyperkey';
  } else {
    const symbols = [...hyperkeyMods]
      .map(id => { const k = getKeyById(id); return k?.label || ''; })
      .filter(Boolean).join(' ');
    els.hyperkeyStatus.textContent = `Active: ${symbols}`;
    els.hyperkeyBtn.textContent = 'Edit hyperkey';
  }
}

function refresh() {
  renderKeyboard();
  renderPreview();
  updateHyperkeyBtn();
}

// --- Toggle (clavier principal) -------------------------------------------

function toggle(id) {
  // En mode agnostique, les modificateurs droite sont redirigés vers leur
  // canonique gauche (un seul état pour les deux côtés).
  const key = (!sideSpecific && RIGHT_TO_CANONICAL.has(id))
    ? RIGHT_TO_CANONICAL.get(id)
    : id;

  const willAdd = !selected.has(key);

  if (key === HYPERKEY_TRIGGER && willAdd && hyperkeyMods.size > 0) {
    hyperkeyMods.forEach(m => selected.delete(m));
  }

  // Une seule activation key à la fois : si on en ajoute une nouvelle,
  // on retire l'éventuelle précédente.
  if (willAdd && !MODIFIER_IDS.has(key)) {
    selected.forEach(existing => {
      if (!MODIFIER_IDS.has(existing)) selected.delete(existing);
    });
  }

  if (willAdd) selected.add(key);
  else selected.delete(key);
  refresh();
}

els.keyboard.addEventListener('click', (e) => {
  const g = e.target.closest('[data-key-id]');
  if (g) {
    toggle(g.dataset.keyId);
    els.keyboardWrapper.focus(); // keep focus in wrapper for keyboard typing
  }
});

els.keyboard.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const g = e.target.closest('[data-key-id]');
  if (g) { e.preventDefault(); toggle(g.dataset.keyId); }
});

els.reset.addEventListener('click', () => { selected.clear(); refresh(); });

// --- Sélection par frappe clavier -----------------------------------------
// Uniquement quand le cadre du clavier a le focus (l'utilisateur a cliqué
// dedans), pour ne pas intercepter les raccourcis des boutons de l'UI.

const CODE_REMAP = { AltLeft: 'OptionLeft', AltRight: 'OptionRight' };

els.keyboardWrapper.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const id = CODE_REMAP[e.code] ?? e.code;
  const key = getKeyById(id);
  if (!key || key.hole) return;
  e.preventDefault();
  toggle(id);
});

// --- Téléchargement -------------------------------------------------------

els.download.addEventListener('click', () => {
  if (!currentSvg) return;
  const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const name = ('shortcut-' +
    sortForDisplay(selectedKeys()).map(k => k.sub || k.label).join('-') || 'keyboard')
    .replace(/[^a-z0-9-]/gi, '_');
  const a = document.createElement('a');
  a.href = url; a.download = `${name}.svg`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
});

// --- Modal hyperkey -------------------------------------------------------

function buildModalLayout() {
  // La modal est toujours agnostique (gauche = droite) : on étend les mods
  // sélectionnés aux deux côtés pour l'affichage.
  const displayMods = new Set(tempHyperkeyMods);
  tempHyperkeyMods.forEach(m => {
    if (CANONICAL_TO_RIGHT.has(m)) displayMods.add(CANONICAL_TO_RIGHT.get(m));
  });
  const layout = buildFullLayout(displayMods, new Set([HYPERKEY_TRIGGER]));
  layout.keys = layout.keys.map(k => ({
    ...k,
    disabled: k.id !== HYPERKEY_TRIGGER && !SELECTABLE_MODS.has(k.id),
  }));
  return layout;
}

function renderModalKeyboard() {
  els.modalKeyboard.innerHTML = renderSvg(buildModalLayout(), { interactive: true });
}

function openModal() {
  tempHyperkeyMods = new Set(hyperkeyMods); // copie pour pouvoir annuler
  renderModalKeyboard();
  els.overlay.hidden = false;
}

function closeModal() {
  els.overlay.hidden = true;
}

function persistHyperkey() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...hyperkeyMods]));
}

function loadHyperkey() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) saved.forEach(m => hyperkeyMods.add(m));
  } catch (_) { /* localStorage indisponible ou données corrompues */ }
}

function saveModal() {
  hyperkeyMods.clear();
  tempHyperkeyMods.forEach(m => hyperkeyMods.add(m));
  persistHyperkey();
  closeModal();
  refresh(); // met à jour l'affichage si Caps Lock est déjà sélectionné
}

els.hyperkeyBtn.addEventListener('click', openModal);
els.modalCancel.addEventListener('click', closeModal);
els.modalSave.addEventListener('click', saveModal);

// Clic sur le fond de l'overlay = annuler.
els.overlay.addEventListener('click', (e) => {
  if (e.target === els.overlay) closeModal();
});

// Clics dans la modal : seules les touches de SELECTABLE_MODS sont actives.
// Caps Lock n'a pas de data-key-id dans les touches disabled, mais pour
// sécurité on vérifie quand même.
els.modalKeyboard.addEventListener('click', (e) => {
  const g = e.target.closest('[data-key-id]');
  if (!g) return;
  const raw = g.dataset.keyId;
  if (raw === HYPERKEY_TRIGGER) return; // verrouillé
  if (!SELECTABLE_MODS.has(raw)) return;
  // La modal est toujours agnostique : droite → canonique gauche.
  const id = RIGHT_TO_CANONICAL.get(raw) ?? raw;
  if (tempHyperkeyMods.has(id)) tempHyperkeyMods.delete(id);
  else tempHyperkeyMods.add(id);
  renderModalKeyboard();
});

// Touche Échap ferme la modal.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.overlay.hidden) closeModal();
});

// --- Préférence de côté ---------------------------------------------------

function loadSideSpecific() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SIDE));
    if (typeof saved === 'boolean') sideSpecific = saved;
  } catch (_) { }
}

function applySideSpecific(specific) {
  sideSpecific = specific;
  els.sideToggle.checked = specific;
  if (!specific) {
    // Passage en mode agnostique : canonicalise les droites dans selected.
    for (const [right, canonical] of RIGHT_TO_CANONICAL) {
      if (selected.has(right)) {
        selected.delete(right);
        selected.add(canonical);
      }
    }
  }
  localStorage.setItem(STORAGE_KEY_SIDE, JSON.stringify(specific));
  refresh();
}

els.sideToggle.addEventListener('change', () => applySideSpecific(els.sideToggle.checked));

// --- Démarrage -----------------------------------------------------------
loadHyperkey();
loadSideSpecific();
els.sideToggle.checked = sideSpecific;
selected.add('MetaLeft');
selected.add('KeyK');
refresh();
