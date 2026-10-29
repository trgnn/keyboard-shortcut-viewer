// svgRenderer.js
// ---------------------------------------------------------------------------
// Construit une chaîne SVG à partir du résultat de layoutEngine. Aucun accès
// au DOM : on renvoie simplement du texte SVG, ce qui rend la fonction facile
// à tester et réutilisable (affichage ET téléchargement utilisent la même
// sortie).
// ---------------------------------------------------------------------------

// --- Réglages visuels (faciles à modifier) --------------------------------
const UNIT = 60;   // pas d'une touche, en px (largeur d'une touche standard)
const GAP = 6;     // espace entre deux touches, en px
const RADIUS = 8;  // arrondi des coins
const PAD = 10;    // marge intérieure autour de tout le schéma, en px

const COLORS = {
  highlightFill: '#2f6df6',   // remplissage des touches du raccourci
  highlightText: '#ffffff',
  highlightStroke: '#1b4fd0',
  impliedFill: '#dbeafe',     // touches activées passivement (ex. mods hyperkey)
  impliedText: '#1d4ed8',
  impliedStroke: '#93c5fd',
  neutralFill: '#ffffff',
  neutralText: '#333333',
  neutralStroke: '#cccccc',
  disabledFill: '#f5f5f5',    // touches grisées (modal hyperkey)
  disabledText: '#c8c8c8',
  disabledStroke: '#e8e8e8',
};

const STROKE = { neutral: 1, highlight: 2 };
const ALIGN_PAD = 9; // retrait (px) depuis le bord pour les libellés ferrés

// Échappe le texte destiné au contenu XML/SVG.
function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Petit globe trait fin (touche fn), dessiné centré sur (cx, cy).
function renderGlobe(cx, cy, color) {
  const r = 8;
  const f = (n) => n.toFixed(1);
  return `<g fill="none" stroke="${color}" stroke-width="1.3">` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}"/>` +
    `<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * 0.45)}" ry="${r}"/>` +
    `<line x1="${f(cx - r)}" y1="${f(cy)}" x2="${f(cx + r)}" y2="${f(cy)}"/>` +
    `<line x1="${f(cx - r * 0.78)}" y1="${f(cy - r * 0.5)}" x2="${f(cx + r * 0.78)}" y2="${f(cy - r * 0.5)}"/>` +
    `<line x1="${f(cx - r * 0.78)}" y1="${f(cy + r * 0.5)}" x2="${f(cx + r * 0.78)}" y2="${f(cy + r * 0.5)}"/>` +
    `</g>`;
}

// Un nœud texte avec ancrage et position explicites.
function textNode(anchorX, y, color, size, content, anchor = 'middle') {
  return `<text x="${anchorX.toFixed(1)}" y="${y.toFixed(1)}" ` +
    `fill="${color}" font-size="${size}" text-anchor="${anchor}" ` +
    `dominant-baseline="central">${escapeXml(content)}</text>`;
}

// Calcule la position X et l'ancrage pour un libellé selon l'alignement de la
// touche (left | right | undefined = centre).
function glyphAnchor(align, x, w) {
  if (align === 'left')  return { anchorX: x + ALIGN_PAD, anchor: 'start' };
  if (align === 'right') return { anchorX: x + w - ALIGN_PAD, anchor: 'end' };
  return { anchorX: x + w / 2, anchor: 'middle' };
}

// Rendu d'une touche : <rect> + symbole/icône (+ sous-libellé éventuel).
// En mode `interactive`, on enveloppe le tout dans un <g data-key-id="…">
// pour que app.js puisse détecter les clics ; l'export reste lui « propre ».
function renderKey(key, interactive) {
  // Touche « trou » (emplacement Touch ID) : rien dessiné, non cliquable.
  if (key.hole) return '';

  const x = PAD + key.relX * UNIT + GAP / 2;
  const y = PAD + key.relRow * UNIT + GAP / 2;
  const w = key.w * UNIT - GAP;
  const h = (key.h || 1) * UNIT - GAP;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const fill = key.highlighted ? COLORS.highlightFill
             : key.implied    ? COLORS.impliedFill
             : key.disabled   ? COLORS.disabledFill
             : COLORS.neutralFill;
  const stroke = key.highlighted ? COLORS.highlightStroke
               : key.implied    ? COLORS.impliedStroke
               : key.disabled   ? COLORS.disabledStroke
               : COLORS.neutralStroke;
  const textColor = key.highlighted ? COLORS.highlightText
                  : key.implied    ? COLORS.impliedText
                  : key.disabled   ? COLORS.disabledText
                  : COLORS.neutralText;
  const strokeW = key.highlighted ? STROKE.highlight : STROKE.neutral;

  const rect =
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" ` +
    `width="${w.toFixed(1)}" height="${h.toFixed(1)}" ` +
    `rx="${RADIUS}" ry="${RADIUS}" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="${strokeW}"/>`;

  // Position et ancrage selon l'alignement de la touche.
  const { anchorX, anchor } = glyphAnchor(key.align, x, w);
  const glyphY = key.sub ? cy - 7 : cy;

  let glyph;
  if (key.icon === 'globe') {
    // Pour les icônes, anchorX est un bord (pas un centre) : on décale du rayon
    // pour que l'icône reste à l'intérieur du padding de la touche.
    const GLOBE_R = 8;
    const globeCx = key.align === 'right' ? anchorX - GLOBE_R
                  : key.align === 'left'  ? anchorX + GLOBE_R
                  : anchorX;
    glyph = renderGlobe(globeCx, glyphY, textColor);
  } else if (key.label) {
    glyph = textNode(anchorX, glyphY, textColor, 20, key.label, anchor);
  } else {
    glyph = '';
  }

  // Si la touche n'a que du texte secondaire (pas de label ni d'icône),
  // on le place en bas de la touche plutôt qu'en dessous d'un glyph imaginaire.
  const subY = (!key.label && !key.icon && key.sub) ? y + h - 10 : cy + 13;
  const subText = key.sub
    ? textNode(anchorX, subY, textColor, 11, key.sub, anchor)
    : '';
  const inner = rect + glyph + subText;

  if (interactive) {
    // Les touches désactivées ou impliquées n'ont pas data-key-id → non cliquables.
    if (key.disabled) {
      return `<g class="key is-disabled">${inner}</g>`;
    }
    if (key.implied) {
      return `<g class="key is-implied">${inner}</g>`;
    }
    const cls = key.highlighted ? 'key is-selected' : 'key';
    return `<g class="${cls}" data-key-id="${key.id}" role="button" tabindex="0">` +
      inner + `</g>`;
  }
  return inner;
}

// Construit le SVG complet. viewBox calculé d'après la zone (recadrée ou
// complète). `interactive` ajoute les attributs nécessaires aux clics.
export function renderSvg(layout, { interactive = false } = {}) {
  const width = layout.widthUnits * UNIT + PAD * 2;
  const height = layout.heightUnits * UNIT + PAD * 2;

  const body = layout.keys.map((k) => renderKey(k, interactive)).join('\n  ');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" ` +
    `viewBox="0 0 ${width.toFixed(1)} ${height.toFixed(1)}" ` +
    `font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif">\n  ` +
    body +
    `\n</svg>`
  );
}
