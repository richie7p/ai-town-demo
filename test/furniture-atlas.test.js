import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MAP_OBJECTS } from '../src/town-map.js';
import { ATLAS_KINDS, ATLAS_ROWS, ATLAS_COLUMNS, alphaBounds, atlasRecipe, layoutSprites } from '../src/furniture-atlas.js';

test('the bundled furniture atlas is the 1536x1024 RGBA sheet the recipes expect', async () => {
  const png = await readFile(new URL('../assets/furniture-atlas-v0.8.png', import.meta.url));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, 'expected RGBA so transparent gutters can be trimmed');
});

test('alpha trimming finds the sprite box and flags opaque tiles', () => {
  const size = 8, rgba = new Uint8Array(size * size * 4);
  for (let y = 2; y <= 5; y++) for (let x = 1; x <= 3; x++) rgba[(y * size + x) * 4 + 3] = 255;
  rgba[3] = 10; // faint noise below the threshold is ignored
  assert.deepEqual(alphaBounds(rgba, size, size), { x: 1, y: 2, w: 3, h: 4, opaque: 12 / 64 });
  assert.equal(alphaBounds(new Uint8Array(size * size * 4), size, size), null);
});

test('atlas sprites keep their aspect, stand on the footprint bottom and stay within each recipe limit', () => {
  const fake = key => ({ w: 120 + key.length * 11, h: 150 + (key.charCodeAt(0) % 5) * 17 });
  let drawn = 0;
  for (const object of MAP_OBJECTS) {
    const recipe = atlasRecipe(object);
    if (!recipe) continue;
    for (const [row, col] of recipe.tiles) assert.ok(row >= 0 && row < ATLAS_ROWS && col >= 0 && col < ATLAS_COLUMNS, `${object.id} uses a tile outside the sheet`);
    const items = layoutSprites(object, recipe, fake);
    assert.ok(items.length >= 1, object.id);
    for (const item of items) {
      const b = fake(item.key);
      assert.ok(Math.abs(item.dw / item.dh - b.w / b.h) < 1e-9, `${object.id} is distorted`);
      assert.ok(Math.abs(item.dy + item.dh - object.height) < 1e-9, `${object.id} is not bottom-anchored`);
      assert.ok(item.dh <= object.height + recipe.up + 1e-9, `${object.id} rises above its limit`);
      assert.ok(item.dw <= (recipe.maxW ?? object.width / items.length) + 1e-9, `${object.id} is too wide for its slot`);
      // Sprites may overhang a cell by at most the 16px margin of the object texture.
      assert.ok(item.dx >= -16 && item.dx + item.dw <= object.width + 16, `${object.id} overflows its texture`);
      assert.ok(object.height + recipe.up <= 72 + object.height, `${object.id} overflows the texture top`);
      drawn++;
    }
  }
  assert.ok(drawn > 40);
  assert.equal(layoutSprites(MAP_OBJECTS[0], ATLAS_KINDS.bed, () => undefined), null, 'a missing tile falls back to code art');
});

test('only the tool wall and side-facing cafe chairs keep code-drawn art; side chairs are never replaced', () => {
  const codeDrawn = MAP_OBJECTS.filter(object => !atlasRecipe(object));
  for (const object of codeDrawn) assert.ok(object.kind === 'toolwall' || (['chair', 'stool'].includes(object.kind) && ['left', 'right'].includes(object.facing)), `${object.id} lacks an atlas recipe`);
  assert.ok(MAP_OBJECTS.some(object => object.kind === 'dining') && MAP_OBJECTS.some(object => object.kind === 'record') && MAP_OBJECTS.some(object => object.kind === 'gallery') && MAP_OBJECTS.some(object => object.kind === 'vanity'));
});
