// layoutEngine.js
// ---------------------------------------------------------------------------
// LOGIQUE PURE (aucun DOM, aucun SVG). Deux fonctions :
//
//   buildFullLayout(selectedIds)
//     -> le clavier COMPLET, chaque touche portant un flag `highlighted`.
//        Sert au sélecteur cliquable.
//
//   cropToSelection(selectedKeys, margin)
//     -> recadre autour d'un ensemble ARBITRAIRE de touches (>= 1) : bounding
//        box + marge, sans dépasser les bords, coordonnées recalées sur (0,0).
//        Sert à l'aperçu/export.
//
// Les deux renvoient la même forme :
//   { keys: [ { ...touche, relX, relRow, highlighted } ], widthUnits, heightUnits }
// ce qui permet à svgRenderer de traiter les deux indifféremment.
// ---------------------------------------------------------------------------

import { KEYS, BOUNDS } from './keyboardLayout.js';

const DEFAULT_MARGIN = 1; // marge, en unités de touche / rangées

// Bornes verticales réelles d'une touche, en tenant compte de yOffset et h.
const top = (k) => k.row + (k.yOffset || 0);
const bottom = (k) => top(k) + (k.h || 1);

// Construit la sortie commune (touches recalées sur (0,0) + dimensions) à
// partir d'un sous-ensemble de touches. `selectedIds` marque les surlignées,
// `impliedIds` marque les touches passives (activées indirectement, ex. hyperkey).
function pack(keys, selectedIds, impliedIds = new Set()) {
  const originX = Math.min(...keys.map((k) => k.x));
  const originTop = Math.min(...keys.map(top));
  const farX = Math.max(...keys.map((k) => k.x + k.w));
  const farBottom = Math.max(...keys.map(bottom));

  return {
    keys: keys.map((k) => ({
      ...k,
      relX: k.x - originX,
      relRow: top(k) - originTop, // yOffset déjà replié dans relRow
      highlighted: selectedIds.has(k.id),
      implied: impliedIds.has(k.id) && !selectedIds.has(k.id),
    })),
    widthUnits: farX - originX,
    heightUnits: farBottom - originTop,
  };
}

// Clavier complet, avec une sélection mise en évidence.
// `impliedIds` : touches activées passivement (ex. mods de la hyperkey).
export function buildFullLayout(selectedIds = new Set(), impliedIds = new Set()) {
  return pack(KEYS, selectedIds, impliedIds);
}

// Recadrage autour d'un ensemble de touches sélectionnées (au moins une).
// Renvoie null si la sélection est vide.
export function cropToSelection(selectedKeys, margin = DEFAULT_MARGIN) {
  if (!selectedKeys || !selectedKeys.length) return null;

  // 1. Bounding box couvrant TOUTES les touches sélectionnées.
  const xMin = Math.min(...selectedKeys.map((k) => k.x));
  const xMax = Math.max(...selectedKeys.map((k) => k.x + k.w));
  const rowMin = Math.min(...selectedKeys.map((k) => k.row));
  const rowMax = Math.max(...selectedKeys.map((k) => k.row));

  // 2. Marge, bornée aux bords réels du clavier.
  const cropXMin = Math.max(BOUNDS.xMin, xMin - margin);
  const cropXMax = Math.min(BOUNDS.xMax, xMax + margin);
  const cropRowMin = Math.max(BOUNDS.rowMin, rowMin - margin);
  const cropRowMax = Math.min(BOUNDS.rowMax, rowMax + margin);

  const selectedIds = new Set(selectedKeys.map((k) => k.id));

  // 3. Touches dont la rangée est dans la zone ET qui la chevauchent en X.
  const visible = KEYS.filter((k) => {
    const inRows = k.row >= cropRowMin && k.row <= cropRowMax;
    const overlapsX = k.x < cropXMax && k.x + k.w > cropXMin;
    return inRows && overlapsX;
  });

  // 4. Recalage sur (0,0) + dimensions (gère hauteurs/offsets variables).
  return pack(visible, selectedIds);
}
