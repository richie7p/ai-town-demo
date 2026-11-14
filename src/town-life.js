// Decorative town life: the house cat, the ducks and the rain texture.
// None of it is part of the simulation; the cat's schedule depends only on the clock.
import { createCanvas, fillBox } from './pixel-canvas.js';
import { TICKS_PER_DAY, dayOf, slotOf } from './config.js';
import { tileCenter } from './town-map.js';

export const CAT_FRAME = Object.freeze({ width: 22, height: 16 });
/** Cat sheet frames: 0–1 walking, 2 sitting, 3 curled up asleep. */
const CAT = { walkA: 0, walkB: 1, sit: 2, sleep: 3 };

const at = (x, y) => {
  const [px, py] = tileCenter(x, y);
  return [px, py + 10];
};

/**
 * Where the cat is during a tick: curled up on the armchair at night, by the
 * fridge at breakfast, napping on a different patch of living-room rug each day,
 * on the bookshelf in the late afternoon and under the dinner table in the evening.
 */
export function catSpot(tick) {
  const night = tick === 0 || tick % TICKS_PER_DAY === 0;
  if (night) return { point: at(6, 17), frame: CAT.sleep };
  const slot = slotOf(tick);
  const day = dayOf(tick);
  if (slot <= 2) return { point: at(31, 13), frame: CAT.sit };
  if (slot <= 7) {
    const naps = [at(5, 22), at(12, 23), at(18, 21)];
    return { point: naps[day % naps.length], frame: slot % 2 ? CAT.sleep : CAT.sit };
  }
  if (slot === 8) return { point: at(25, 12), frame: CAT.sit };
  if (slot <= 10) return { point: at(32, 20), frame: CAT.sit };
  return { point: at(13, 21), frame: CAT.sleep };
}

/** A small orange tabby, drawn facing right. */
export function drawCatSheet() {
  const { width: w, height: h } = CAT_FRAME;
  const canvas = createCanvas(w * 4, h);
  const c = canvas.getContext('2d');
  const fur = '#d8964c';
  const dark = '#a8682e';
  const light = '#f2c690';
  const ink = '#3d2c22';
  for (let frame = 0; frame < 4; frame++) {
    c.save();
    c.translate(frame * w, 0);
    if (frame === CAT.sleep) {
      // Curled into a ball, tail around the nose.
      fillBox(c, 4, 7, 14, 8, dark);
      fillBox(c, 5, 6, 12, 8, fur);
      fillBox(c, 7, 7, 3, 1, dark);
      fillBox(c, 11, 7, 3, 1, dark);
      fillBox(c, 13, 9, 5, 4, fur);
      fillBox(c, 14, 8, 1, 1, dark);
      fillBox(c, 17, 8, 1, 1, dark);
      fillBox(c, 15, 11, 2, 1, ink);
      fillBox(c, 4, 13, 12, 2, light);
    } else if (frame === CAT.sit) {
      fillBox(c, 6, 6, 8, 9, fur);
      fillBox(c, 7, 8, 2, 1, dark);
      fillBox(c, 7, 11, 2, 1, dark);
      fillBox(c, 4, 12, 4, 3, fur);
      fillBox(c, 2, 10, 2, 4, dark);
      fillBox(c, 11, 1, 7, 6, fur);
      fillBox(c, 11, 0, 2, 2, fur);
      fillBox(c, 16, 0, 2, 2, fur);
      fillBox(c, 13, 3, 1, 1, ink);
      fillBox(c, 16, 3, 1, 1, ink);
      fillBox(c, 14, 5, 2, 1, '#e59a8f');
      fillBox(c, 9, 13, 2, 2, light);
      fillBox(c, 12, 13, 2, 2, light);
    } else {
      const step = frame === CAT.walkA ? 1 : -1;
      fillBox(c, 3, 6, 13, 6, fur);
      fillBox(c, 5, 7, 2, 4, dark);
      fillBox(c, 9, 7, 2, 4, dark);
      fillBox(c, 0, 4 + step, 4, 2, dark);
      fillBox(c, 14, 2, 7, 6, fur);
      fillBox(c, 14, 1, 2, 2, fur);
      fillBox(c, 19, 1, 2, 2, fur);
      fillBox(c, 18, 4, 1, 1, ink);
      fillBox(c, 20, 6, 1, 1, '#e59a8f');
      fillBox(c, 4 + step, 12, 2, 3, fur);
      fillBox(c, 13 - step, 12, 2, 3, fur);
      fillBox(c, 7 - step, 12, 2, 3, dark);
      fillBox(c, 11 + step, 12, 2, 3, dark);
    }
    c.restore();
  }
  return canvas;
}

/** A white duck, two paddling frames. */
export function drawDuckSheet() {
  const canvas = createCanvas(32, 12);
  const c = canvas.getContext('2d');
  for (let frame = 0; frame < 2; frame++) {
    c.save();
    c.translate(frame * 16, 0);
    fillBox(c, 2, 5, 10, 5, '#f4f1e6');
    fillBox(c, 3, 9, 8, 1, '#c9d7d6');
    fillBox(c, 9, 1, 4, 5, '#f4f1e6');
    fillBox(c, 13, 3, 3, 2, '#e8a33a');
    fillBox(c, 11, 2, 1, 1, '#2f2f2f');
    fillBox(c, 4, 6, 4, 1, '#d9d4c3');
    fillBox(c, frame ? 1 : 3, 10, 9, 2, '#9fc9d4');
    c.restore();
  }
  return canvas;
}

/** A 96×96 tile of slanted rain streaks for a scrolling overlay. */
export function drawRainTile() {
  const size = 96;
  const canvas = createCanvas(size, size);
  const c = canvas.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(((i * 37) % size) + (i % 3) * 5);
    const y = Math.floor((i * 53) % size);
    const length = 10 + (i % 4) * 3;
    for (let j = 0; j < length; j++)
      fillBox(
        c,
        (x - Math.floor(j / 4) + size) % size,
        (y + j) % size,
        1,
        1,
        j < 3 ? '#f4fbffcc' : '#d9eaf4aa',
      );
  }
  return canvas;
}
