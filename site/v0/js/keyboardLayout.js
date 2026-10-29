// keyboardLayout.js
// ---------------------------------------------------------------------------
// DONNÉES STATIQUES : disposition d'un clavier MacBook (QWERTY US, ANSI),
// reproduite d'après la photo Apple.
//
// Chaque touche est décrite par :
//   id      : identifiant unique stable (ex. "KeyK", "MetaLeft", "Space")
//   label   : libellé principal affiché (symbole pour les modificateurs)
//   sub     : sous-libellé optionnel (le mot, ex. "command") sous le symbole
//   row     : index de rangée (0 = rangée de fonction … 5 = barre d'espace)
//   x       : position horizontale, en « unités de touche » (fractionnaire car
//             Tab, Shift, Espace… sont plus larges)
//   w       : largeur relative (1 = touche standard)
//   h       : hauteur relative (1 par défaut ; 0.7 pour la rangée F, 0.5 pour
//             les flèches haut/bas en demi-hauteur)
//   yOffset : décalage vertical dans la rangée, en unités de rangée (sert à
//             placer la flèche bas sous la flèche haut)
//   align   : alignement horizontal du libellé : 'left' | 'right' | absent
//             (absent = centré). Les modificateurs de bord suivent l'arête
//             la plus proche, comme sur le clavier physique.
//
// La grille reste purement logique : aucune coordonnée en pixels ici.
// ---------------------------------------------------------------------------

export const KEYS = [
  // --- Rangée 0 : fonction (même hauteur que les autres rangées) ---------
  { id: 'Escape', sub: 'esc',   row: 0, x: 0,     w: 1.25, align: 'left' },
  { id: 'F1',     label: 'F1',  row: 0, x: 1.25,  w: 1 },
  { id: 'F2',     label: 'F2',  row: 0, x: 2.25,  w: 1 },
  { id: 'F3',     label: 'F3',  row: 0, x: 3.25,  w: 1 },
  { id: 'F4',     label: 'F4',  row: 0, x: 4.25,  w: 1 },
  { id: 'F5',     label: 'F5',  row: 0, x: 5.25,  w: 1 },
  { id: 'F6',     label: 'F6',  row: 0, x: 6.25,  w: 1 },
  { id: 'F7',     label: 'F7',  row: 0, x: 7.25,  w: 1 },
  { id: 'F8',     label: 'F8',  row: 0, x: 8.25,  w: 1 },
  { id: 'F9',     label: 'F9',  row: 0, x: 9.25,  w: 1 },
  { id: 'F10',    label: 'F10', row: 0, x: 10.25, w: 1 },
  { id: 'F11',    label: 'F11', row: 0, x: 11.25, w: 1 },
  { id: 'F12',    label: 'F12', row: 0, x: 12.25, w: 1 },
  // Emplacement Touch ID : laissé volontairement vide (un « trou » de la
  // taille d'une touche, non dessiné et non sélectionnable -> voir `hole`).
  { id: 'TouchID', row: 0, x: 14, w: 1, hole: true },

  // --- Rangée 1 : chiffres -----------------------------------------------
  { id: 'Backquote', label: '`',  row: 1, x: 0,  w: 1 },
  { id: 'Digit1',    label: '1',  row: 1, x: 1,  w: 1 },
  { id: 'Digit2',    label: '2',  row: 1, x: 2,  w: 1 },
  { id: 'Digit3',    label: '3',  row: 1, x: 3,  w: 1 },
  { id: 'Digit4',    label: '4',  row: 1, x: 4,  w: 1 },
  { id: 'Digit5',    label: '5',  row: 1, x: 5,  w: 1 },
  { id: 'Digit6',    label: '6',  row: 1, x: 6,  w: 1 },
  { id: 'Digit7',    label: '7',  row: 1, x: 7,  w: 1 },
  { id: 'Digit8',    label: '8',  row: 1, x: 8,  w: 1 },
  { id: 'Digit9',    label: '9',  row: 1, x: 9,  w: 1 },
  { id: 'Digit0',    label: '0',  row: 1, x: 10, w: 1 },
  { id: 'Minus',     label: '-',  row: 1, x: 11, w: 1 },
  { id: 'Equal',     label: '=',  row: 1, x: 12, w: 1 },
  { id: 'Backspace', label: '⌫', sub: 'delete', row: 1, x: 13, w: 2, align: 'right' },

  // --- Rangée 2 : Tab + QWERTY -------------------------------------------
  { id: 'Tab',          label: '⇥', sub: 'tab', row: 2, x: 0,    w: 1.5, align: 'left' },
  { id: 'KeyQ',         label: 'Q',  row: 2, x: 1.5,  w: 1 },
  { id: 'KeyW',         label: 'W',  row: 2, x: 2.5,  w: 1 },
  { id: 'KeyE',         label: 'E',  row: 2, x: 3.5,  w: 1 },
  { id: 'KeyR',         label: 'R',  row: 2, x: 4.5,  w: 1 },
  { id: 'KeyT',         label: 'T',  row: 2, x: 5.5,  w: 1 },
  { id: 'KeyY',         label: 'Y',  row: 2, x: 6.5,  w: 1 },
  { id: 'KeyU',         label: 'U',  row: 2, x: 7.5,  w: 1 },
  { id: 'KeyI',         label: 'I',  row: 2, x: 8.5,  w: 1 },
  { id: 'KeyO',         label: 'O',  row: 2, x: 9.5,  w: 1 },
  { id: 'KeyP',         label: 'P',  row: 2, x: 10.5, w: 1 },
  { id: 'BracketLeft',  label: '[',  row: 2, x: 11.5, w: 1 },
  { id: 'BracketRight', label: ']',  row: 2, x: 12.5, w: 1 },
  { id: 'Backslash',    label: '\\', row: 2, x: 13.5, w: 1.5, align: 'right' },

  // --- Rangée 3 : CapsLock + ASDF + Entrée -------------------------------
  { id: 'CapsLock',  label: '⇪', sub: 'caps lock', row: 3, x: 0, w: 1.75, align: 'left' },
  { id: 'KeyA',      label: 'A',  row: 3, x: 1.75,  w: 1 },
  { id: 'KeyS',      label: 'S',  row: 3, x: 2.75,  w: 1 },
  { id: 'KeyD',      label: 'D',  row: 3, x: 3.75,  w: 1 },
  { id: 'KeyF',      label: 'F',  row: 3, x: 4.75,  w: 1 },
  { id: 'KeyG',      label: 'G',  row: 3, x: 5.75,  w: 1 },
  { id: 'KeyH',      label: 'H',  row: 3, x: 6.75,  w: 1 },
  { id: 'KeyJ',      label: 'J',  row: 3, x: 7.75,  w: 1 },
  { id: 'KeyK',      label: 'K',  row: 3, x: 8.75,  w: 1 },
  { id: 'KeyL',      label: 'L',  row: 3, x: 9.75,  w: 1 },
  { id: 'Semicolon', label: ';',  row: 3, x: 10.75, w: 1 },
  { id: 'Quote',     label: "'",  row: 3, x: 11.75, w: 1 },
  { id: 'Enter',     label: '⏎', sub: 'return', row: 3, x: 12.75, w: 2.25, align: 'right' },

  // --- Rangée 4 : Shift + ZXCV + Shift -----------------------------------
  { id: 'ShiftLeft', label: '⇧', sub: 'shift', row: 4, x: 0, w: 2.25, align: 'left' },
  { id: 'KeyZ',      label: 'Z',  row: 4, x: 2.25,  w: 1 },
  { id: 'KeyX',      label: 'X',  row: 4, x: 3.25,  w: 1 },
  { id: 'KeyC',      label: 'C',  row: 4, x: 4.25,  w: 1 },
  { id: 'KeyV',      label: 'V',  row: 4, x: 5.25,  w: 1 },
  { id: 'KeyB',      label: 'B',  row: 4, x: 6.25,  w: 1 },
  { id: 'KeyN',      label: 'N',  row: 4, x: 7.25,  w: 1 },
  { id: 'KeyM',      label: 'M',  row: 4, x: 8.25,  w: 1 },
  { id: 'Comma',     label: ',',  row: 4, x: 9.25,  w: 1 },
  { id: 'Period',    label: '.',  row: 4, x: 10.25, w: 1 },
  { id: 'Slash',     label: '/',  row: 4, x: 11.25, w: 1 },
  { id: 'ShiftRight', label: '⇧', sub: 'shift', row: 4, x: 12.25, w: 2.75, align: 'right' },

  // --- Rangée 5 : fn + modificateurs + espace + flèches ------------------
  { id: 'Fn',          icon: 'globe', sub: 'fn', row: 5, x: 0,    w: 1,    align: 'left' },
  { id: 'ControlLeft', label: '⌃', sub: 'control', row: 5, x: 1,    w: 1,    align: 'left' },
  { id: 'OptionLeft',  label: '⌥', sub: 'option',  row: 5, x: 2,    w: 1,    align: 'left' },
  { id: 'MetaLeft',    label: '⌘', sub: 'command', row: 5, x: 3,    w: 1.25, align: 'left' },
  { id: 'Space',       sub: 'space',                row: 5, x: 4.25, w: 5.5 },
  { id: 'MetaRight',   label: '⌘', sub: 'command', row: 5, x: 9.75, w: 1.25, align: 'left' },
  { id: 'OptionRight', label: '⌥', sub: 'option',  row: 5, x: 11,   w: 1,    align: 'left' },

  // Pavé fléché : toutes les flèches en demi-hauteur (h: 0.5).
  // ◀ et ▶ ont yOffset: 0.5 (calées en bas), créant le creux caractéristique
  // au-dessus des flèches latérales.
  { id: 'ArrowLeft',  label: '◀', row: 5, x: 12, w: 1, h: 0.5, yOffset: 0.5 },
  { id: 'ArrowUp',    label: '▲', row: 5, x: 13, w: 1, h: 0.5 },
  { id: 'ArrowDown',  label: '▼', row: 5, x: 13, w: 1, h: 0.5, yOffset: 0.5 },
  { id: 'ArrowRight', label: '▶', row: 5, x: 14, w: 1, h: 0.5, yOffset: 0.5 },
];

// Index id -> touche, pour les recherches directes.
const BY_ID = new Map(KEYS.map((k) => [k.id, k]));

// Accès direct par identifiant (utilisé par le sélecteur cliquable).
export function getKeyById(id) {
  return BY_ID.get(id) || null;
}

// ---------------------------------------------------------------------------
// RÉSOLUTION D'UNE SAISIE UTILISATEUR -> touche (conservée pour usage
// programmatique : recherche par nom, alias, lettre/chiffre brut…).
// ---------------------------------------------------------------------------

const ALIASES = {
  cmd: 'MetaLeft', command: 'MetaLeft', '⌘': 'MetaLeft', meta: 'MetaLeft',
  win: 'MetaLeft', super: 'MetaLeft',
  opt: 'OptionLeft', option: 'OptionLeft', alt: 'OptionLeft', '⌥': 'OptionLeft',
  shift: 'ShiftLeft', '⇧': 'ShiftLeft',
  ctrl: 'ControlLeft', control: 'ControlLeft', '⌃': 'ControlLeft',
  fn: 'Fn', globe: 'Fn', '🌐': 'Fn',
  esc: 'Escape', escape: 'Escape',
  tab: 'Tab', '⇥': 'Tab',
  caps: 'CapsLock', capslock: 'CapsLock', '⇪': 'CapsLock',
  enter: 'Enter', return: 'Enter', '⏎': 'Enter', '↵': 'Enter',
  space: 'Space', espace: 'Space', spacebar: 'Space', '␣': 'Space',
  backspace: 'Backspace', delete: 'Backspace', del: 'Backspace', '⌫': 'Backspace',
  left: 'ArrowLeft', arrowleft: 'ArrowLeft', '←': 'ArrowLeft', '◀': 'ArrowLeft',
  right: 'ArrowRight', arrowright: 'ArrowRight', '→': 'ArrowRight', '▶': 'ArrowRight',
  up: 'ArrowUp', arrowup: 'ArrowUp', '↑': 'ArrowUp', '▲': 'ArrowUp',
  down: 'ArrowDown', arrowdown: 'ArrowDown', '↓': 'ArrowDown', '▼': 'ArrowDown',
};

const PUNCTUATION = {
  '`': 'Backquote', '-': 'Minus', '=': 'Equal', '[': 'BracketLeft',
  ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon', "'": 'Quote',
  ',': 'Comma', '.': 'Period', '/': 'Slash',
};

export function findKey(rawInput) {
  if (!rawInput) return null;
  const input = String(rawInput).trim();
  if (!input) return null;
  const lower = input.toLowerCase();

  if (ALIASES[lower]) return BY_ID.get(ALIASES[lower]);
  if (/^f([1-9]|1[0-2])$/.test(lower)) return BY_ID.get('F' + lower.slice(1));
  if (/^[a-z]$/.test(lower)) return BY_ID.get('Key' + lower.toUpperCase());
  if (/^[0-9]$/.test(input)) return BY_ID.get('Digit' + input);
  if (PUNCTUATION[input]) return BY_ID.get(PUNCTUATION[input]);
  if (BY_ID.has(input)) return BY_ID.get(input);

  return null;
}

// Bornes réelles du clavier (pour ne pas dépasser les bords lors du recadrage).
export const BOUNDS = {
  rowMin: 0,
  rowMax: Math.max(...KEYS.map((k) => k.row)),
  xMin: 0,
  xMax: Math.max(...KEYS.map((k) => k.x + k.w)),
};
