import test from 'node:test';
import assert from 'node:assert/strict';
import { wrapText, placeBubbles } from '../src/speech-bubbles.js';
import { shade, tileNoise } from '../src/pixel-canvas.js';
import { RESIDENT_CLIPS, RESIDENT_DIRECTIONS } from '../src/resident-motion.js';

const WORLD = { width: 2048, height: 1536 };
const overlaps = (a, b) =>
  a.x < b.x + b.width + 8 && a.x + a.width + 8 > b.x && a.y < b.y + b.height + 8 && a.y + a.height + 8 > b.y;

test('bubble text wraps every sixteen characters, counting surrogate pairs as one', () => {
  assert.equal(wrapText('一二三四五六七八九十一二三四五六七八'), '一二三四五六七八九十一二三四五六\n七八');
  assert.equal(
    wrapText('📷'.repeat(17))
      .split('\n')
      .map(line => Array.from(line).length)
      .join(),
    '16,1',
  );
  assert.equal(wrapText(''), '');
});

test('bubbles above residents standing together are spread apart and stay inside the town', () => {
  const bubbles = [0, 1, 2].map(i => ({ x: 1000 + i * 20, y: 700, width: 200, height: 70 }));
  const spots = placeBubbles(bubbles, WORLD).map(spot => ({ ...spot, width: 200, height: 70 }));
  for (let i = 0; i < spots.length; i++) {
    assert.ok(spots[i].x >= 10 && spots[i].x + 200 <= WORLD.width - 10);
    assert.ok(spots[i].y >= 8 && spots[i].y + 70 <= WORLD.height - 10);
    for (let j = 0; j < i; j++)
      assert.equal(overlaps(spots[i], spots[j]), false, `bubbles ${i} and ${j} overlap`);
  }
  // A lone bubble sits centred above the speaker's feet.
  assert.deepEqual(placeBubbles([{ x: 500, y: 600, width: 180, height: 60 }], WORLD), [{ x: 410, y: 452 }]);
  // Near the top edge it is pushed back inside.
  assert.equal(placeBubbles([{ x: 500, y: 40, width: 180, height: 60 }], WORLD)[0].y >= 8, true);
});

test('colour shading clamps each channel and tile noise is stable', () => {
  assert.equal(shade('#367760', 26), '#50917a');
  assert.equal(shade('#f0f0f0', 40), '#ffffff');
  assert.equal(shade('#101010', -40), '#000000');
  assert.equal(tileNoise(3, 4), tileNoise(3, 4));
  assert.ok(tileNoise(3, 4) >= 0 && tileNoise(3, 4) < 1);
});

test('every directional resident clip exists for all four directions', () => {
  for (const direction of RESIDENT_DIRECTIONS)
    for (const clip of [
      direction,
      `sit-${direction}`,
      `rest-${direction}`,
      `talk-${direction}`,
      `idle-${direction}`,
    ])
      assert.ok(RESIDENT_CLIPS[clip], clip);
});
