// Display-only furniture sprite recipes for assets/furniture-atlas-v0.8.png.
// The atlas is 6 columns x 4 rows of 256px tiles; each tile holds one object on
// transparent pixels. Nothing here touches collision, anchors or research data.
export const FURNITURE_ATLAS_KEY = 'furniture-atlas-v0.8';
export const FURNITURE_ATLAS_URL = 'assets/furniture-atlas-v0.8.png';
export const ATLAS_TILE = 256, ATLAS_COLUMNS = 6, ATLAS_ROWS = 4;
const R = (row, col) => [row, col];

// up: pixels a sprite may rise above its collision footprint. maxW overrides the
// footprint width for objects (plants, chairs) that are drawn wider than one cell.
export const ATLAS_KINDS = Object.freeze({
  bed: { tiles: [R(0, 0)], up: 10 },
  bookshelf: { tiles: [R(0, 1)], up: 28, repeat: true },
  counter: { tiles: [R(0, 2), R(0, 3)], up: 40 },
  cafeCounter: { tiles: [R(0, 4), R(0, 2), R(0, 3)], up: 36 },
  cabinet: { tiles: [R(0, 5)], up: 36, repeat: true },
  workbench: { tiles: [R(1, 0)], up: 6, count: 2 },
  editdesk: { tiles: [R(1, 1)], up: 6, count: 2 },
  armchair: { tiles: [R(1, 2)], up: 14, maxW: 46 },
  chair: { tiles: [R(1, 3)], up: 18, maxW: 30 },
  stool: { tiles: [R(1, 3)], up: 18, maxW: 30 },
  coffee: { tiles: [R(1, 4)], up: 20 },
  cafeTable: { tiles: [R(1, 5)], up: 22 },
  plant: { tiles: [R(2, 0)], up: 30, maxW: 46 },
  planter: { tiles: [R(2, 1)], up: 30, repeat: true },
  bench: { tiles: [R(2, 2)], up: 16 },
  backdrop: { tiles: [R(2, 3)], up: 40, repeat: true },
  sign: { tiles: [R(2, 4)], up: 34, maxW: 40 },
  fountain: { tiles: [R(2, 5)], up: 8 },
  sofa: { tiles: [R(3, 0)], up: 32 },
  vanity: { tiles: [R(3, 1)], up: 30 },
  dining: { tiles: [R(3, 3)], up: 40 },
  record: { tiles: [R(3, 4)], up: 26 },
  gallery: { tiles: [R(3, 5)], up: 30 },
});
const BY_ID = Object.freeze({
  'workshop-cabinet': { tiles: [R(0, 1)], up: 28, repeat: true },
});

// Returns a recipe, or null when the code-drawn art should be kept
// (tool wall, and side-facing cafe chairs whose profile the atlas lacks).
export function atlasRecipe(object) {
  if (BY_ID[object.id]) return BY_ID[object.id];
  if (['chair', 'stool'].includes(object.kind) && ['left', 'right'].includes(object.facing)) return null;
  const recipe = ATLAS_KINDS[object.kind];
  if (!recipe) return null;
  // Chairs tucked under work desks stay low so a standing worker is not framed by a tall backrest.
  if (/^(workshop|studio)-chair-/.test(object.id)) return { ...recipe, up: 8, maxW: 28 };
  return recipe;
}

export function alphaBounds(rgba, width, height, threshold = 24) {
  let minX = width, minY = height, maxX = -1, maxY = -1, solid = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const alpha = rgba[(y * width + x) * 4 + 3];
    if (alpha >= 250) solid++;
    if (alpha < threshold) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, opaque: solid / (width * height) };
}

// Places bottom-anchored sprites in object-local pixels, never distorting aspect.
// bounds(key) -> {w,h} of the trimmed sprite or undefined; undefined means "use code art".
export function layoutSprites(object, recipe, bounds) {
  const first = bounds(recipe.tiles[0].join(','));
  if (!first) return null;
  const maxH = object.height + recipe.up;
  let list = recipe.tiles;
  if (recipe.repeat || recipe.count) {
    const count = recipe.count || Math.max(1, Math.round(object.width / (maxH * first.w / first.h)));
    list = Array.from({ length: count }, () => recipe.tiles[0]);
  }
  const slot = object.width / list.length, items = [];
  for (const [index, tile] of list.entries()) {
    const key = tile.join(','), b = bounds(key);
    if (!b) return null;
    const scale = Math.min((recipe.maxW ?? slot) / b.w, maxH / b.h), dw = b.w * scale, dh = b.h * scale;
    items.push({ key, row: tile[0], col: tile[1], dx: index * slot + (slot - dw) / 2, dy: object.height - dh, dw, dh });
  }
  return items;
}
