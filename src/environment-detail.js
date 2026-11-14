import { fillBox, fillPath, fillPixelOval, tileNoise } from './pixel-canvas.js';
// Material and decor pass over the base town art (town-assets.js): wood grain,
// books, photos, windows, rugs and trees. All detail stays inside existing
// furniture and walls or on non-solid floor decals, so it never changes where
// anyone can walk. The art is hand-laid pixel data, excluded from Prettier.
/** A bevelled panel: drop shadow, dark frame, base fill and a light top-left edge. */
function inset(c, x, y, w, h, base, light = '#f0d5a0', dark = '#6b5942') {
  fillBox(c, x + 3, y + 5, w, h, '#243c3430');
  fillBox(c, x, y, w, h, dark);
  fillBox(c, x + 2, y + 2, w - 4, h - 4, base);
  fillBox(c, x + 2, y + 2, w - 4, 2, light);
  fillBox(c, x + 2, y + 2, 2, h - 4, light);
  fillBox(c, x + 2, y + h - 4, w - 4, 2, dark);
}
/** Wood grain lines across a surface, varied by seed. */
function grain(c, x, y, w, h, seed = 0) {
  for (let yy = y + 5; yy < y + h - 3; yy += 7) {
    const dx = Math.floor(tileNoise(yy, seed) * 15);
    fillBox(c, x + 4 + dx, yy, Math.max(3, w - 12 - dx), 1, '#6d4c3529');
    if (w > 40) fillBox(c, x + 7, yy + 2, Math.floor(w * 0.25), 1, '#fff0c735');
  }
}
// Small props.
function mug(c, x, y, color = '#f7ecd2') {
  fillPixelOval(c, x + 5, y + 8, 6, 2, '#5e574733');
  fillBox(c, x, y + 1, 9, 8, '#76644f');
  fillBox(c, x + 1, y + 1, 7, 6, color);
  fillBox(c, x + 8, y + 2, 4, 4, color);
  fillBox(c, x + 9, y + 3, 2, 2, '#967554');
  fillBox(c, x + 2, y + 1, 5, 2, '#6b4e37');
  fillBox(c, x + 2, y + 3, 1, 3, '#fff6dc');
}
function book(c, x, y, w, h, color) {
  fillBox(c, x + 1, y + 2, w, h, '#534b3e');
  fillBox(c, x, y, w, h - 2, color);
  fillBox(c, x + 3, y + 2, w - 4, h - 5, '#e9dfc4');
  fillBox(c, x + 3, y + 3, w - 4, 1, '#fff5d8');
  fillBox(c, x, y, 3, h - 2, color);
  fillBox(c, x + 2, y + 2, 1, h - 5, '#ffffff40');
}
function plant(c, x, y, s = 1) {
  fillPixelOval(c, x + 2 * s, y + 10 * s, 11 * s, 3 * s, '#273f3930');
  fillBox(c, x - 7 * s, y, 14 * s, 11 * s, '#8e5e48');
  fillBox(c, x - 5 * s, y + s, 10 * s, 8 * s, '#ba8059');
  fillBox(c, x - 4 * s, y + 2 * s, 3 * s, 6 * s, '#d8a475');
  fillBox(c, x - 9 * s, y - 3 * s, 18 * s, 4 * s, '#deb386');
  fillBox(c, x - 7 * s, y - 2 * s, 14 * s, 2 * s, '#7b6343');
  fillBox(c, x - s, y - 30 * s, 2 * s, 29 * s, '#3e654a');
  for (const [dy, flip, color] of [
    [-7, true, '#3d704e'],
    [-14, false, '#4e8558'],
    [-21, true, '#6a965c'],
    [-28, false, '#8ead70'],
  ]) {
    const side = flip ? -1 : 1;
    fillPath(
      c,
      [
        [x, y + dy * s],
        [x + 11 * side * s, y + (dy - 7) * s],
        [x + 13 * side * s, y + (dy - 15) * s],
        [x + 5 * side * s, y + (dy - 13) * s],
      ],
      color,
    );
  }
}
function camera(c, x, y, s = 1) {
  fillBox(c, x, y, 19 * s, 12 * s, '#263d43');
  fillBox(c, x + 2 * s, y + 2 * s, 15 * s, 8 * s, '#536b71');
  fillBox(c, x + 3 * s, y - 3 * s, 7 * s, 3 * s, '#384e54');
  fillBox(c, x + 14 * s, y - 2 * s, 3 * s, 2 * s, '#b7c2b3');
  fillPixelOval(c, x + 10 * s, y + 6 * s, 5 * s, 5 * s, '#9baea8');
  fillPixelOval(c, x + 10 * s, y + 6 * s, 3 * s, 3 * s, '#233c4b');
  fillBox(c, x + 9 * s, y + 3 * s, 2 * s, 2 * s, '#8fb9c0');
}
function pastry(c, x, y) {
  fillPixelOval(c, x + 9, y + 9, 13, 4, '#f6e8ce');
  fillPixelOval(c, x + 8, y + 6, 9, 5, '#ad6c39');
  fillPath(
    c,
    [
      [x, y + 6],
      [x + 3, y],
      [x + 8, y - 2],
      [x + 12, y],
      [x + 16, y + 5],
      [x + 12, y + 8],
      [x + 8, y + 5],
      [x + 4, y + 8],
    ],
    '#dfae65',
  );
  for (const dx of [4, 8, 12]) fillBox(c, x + dx, y + 1, 2, 4, '#f0c782');
}
/** A framed photo with a small landscape, varied by seed. */
function photo(c, x, y, w, h, seed = 0) {
  fillBox(c, x, y, w, h, '#385c69');
  fillBox(c, x + 2, y + 2, w - 4, h - 4, '#b8d5ce');
  fillBox(c, x + 2, y + h * 0.55, w - 4, h * 0.45 - 2, '#86a67a');
  fillPath(
    c,
    [[x + 3, y + h - 2], [x + w * 0.43, y + h * 0.3], [x + w * 0.73, y + h - 2]],
    seed % 2 ? '#78929a' : '#5c826e',
  );
  fillPath(c, [ [x + w * 0.4, y + h - 2], [x + w * 0.75, y + h * 0.45], [x + w - 2, y + h - 2], ], '#9cb995');
  fillBox(c, x + w - 8, y + 4, 4, 4, '#fae5b1');
}
/** A café chair seen from the side, with its backrest on the far side from where the sitter faces. */
function sideChair(c, o) {
  // Each furniture object owns its transparent texture, so clearing its old
  // north-facing backrest cannot erase the floor or a neighboring object.
  c.clearRect(-2, -10, o.width + 4, o.height + 14);
  c.save();
  if (o.facing === 'left') {
    c.translate(o.width, 0);
    c.scale(-1, 1);
  }
  const wood = '#6b5944',
    light = '#c5ac7f',
    cushion = '#88a38e';
  // Facing right: the narrow backrest is west of the seated hips, while the
  // cushion remains on the original tile-center seat. Mirror for facing left.
  fillBox(c, 6, 17, 4, 17, wood);
  fillBox(c, 7, 19, 1, 12, light);
  fillBox(c, 22, 19, 4, 15, wood);
  fillBox(c, 23, 22, 1, 10, '#ac9168');
  fillBox(c, 4, -6, 4, 28, wood);
  fillBox(c, 4, -6, 2, 24, light);
  fillPath(c, [ [3, -5], [8, -3], [10, 1], [10, 15], [7, 18], [3, 15], ], '#53796b');
  fillBox(c, 4, -3, 3, 16, cushion);
  fillBox(c, 4, -2, 1, 12, '#b6c5a0');
  fillBox(c, 8, 1, 2, 13, '#3e665b');
  fillPath(c, [ [7, 8], [24, 8], [28, 12], [27, 23], [7, 23], [4, 19], [4, 12], ], wood);
  fillPath(c, [ [8, 9], [24, 9], [26, 12], [25, 19], [7, 19], [6, 15], ], cushion);
  fillBox(c, 8, 10, 15, 2, '#b3c4a0');
  fillBox(c, 8, 17, 17, 2, '#6e927b');
  fillBox(c, 9, 20, 16, 2, '#a58c64');
  fillBox(c, 6, 7, 4, 12, '#5c7965');
  fillBox(c, 6, 7, 2, 10, '#a7b996');
  c.restore();
}

/** Detail for one piece of furniture, drawn over its base drawing in the same coordinates. */
export function detailFurniture(c, o) {
  const w = o.width,
    h = o.height,
    tone = o.tone || 0;
  switch (o.kind) {
    case 'workbench':
    case 'editdesk': {
      const edit = o.kind === 'editdesk';
      inset(c, 0, -5, w, h + 4, edit ? '#9fbbb5' : '#c99a64', edit ? '#cee0ce' : '#f1d2a0', '#5e5144');
      fillBox(c, 3, h - 15, w - 6, 7, edit ? '#708e86' : '#9c704e');
      fillBox(c, 4, h - 15, w - 8, 2, edit ? '#b9cfc0' : '#dbb27c');
      for (const x of [8, w - 17]) {
        fillBox(c, x, h - 9, 9, 13, '#4d5145');
        fillBox(c, x + 1, h - 9, 3, 10, '#8b8465');
      }
      if (!edit) {
        grain(c, 4, 0, w - 8, h - 20, tone);
        fillBox(c, 13, 7, 56, 32, '#748f88');
        fillBox(c, 16, 9, 50, 28, '#d4e0c1');
        for (let xx = 20; xx < 65; xx += 8) fillBox(c, xx, 11, 1, 24, '#b1c3a9');
        for (let yy = 14; yy < 36; yy += 7) fillBox(c, 18, yy, 45, 1, '#b1c3a9');
        fillBox(c, 26, 16, 24, 14, '#7d9c92');
        fillBox(c, 28, 18, 20, 10, '#d9e7cf');
        fillBox(c, 34, 15, 2, 20, '#79968b');
        inset(c, 79, 8, 23, 29, '#9eae84', '#c7d2a9', '#6e7d5f');
        fillBox(c, 85, 14, 11, 4, '#dee1be');
        fillBox(c, 85, 23, 11, 1, '#6c7d65');
        fillBox(c, 113, 11, 5, 30, '#9a593e');
        fillBox(c, 114, 12, 2, 26, '#cf9565');
        fillBox(c, 105, 10, 21, 7, '#526b71');
        fillBox(c, 106, 10, 18, 2, '#acc2b7');
        fillBox(c, 140, 14, 4, 20, '#8c6a4a');
        fillBox(c, 137, 12, 10, 5, '#c7d0bc');
        fillBox(c, 153, 21, 24, 5, '#5d7c76');
        fillBox(c, 171, 18, 7, 12, '#bbcbbd');
        mug(c, 174, 4, '#91ad8d');
        if (tone % 2) {
          fillBox(c, 80, 43, 49, 4, '#976b47');
          fillBox(c, 80, 43, 49, 1, '#efc98c');
          for (let x = 83; x < 127; x += 5) fillBox(c, x, 44, 1, 3, '#493f36');
        } else {
          fillBox(c, 136, 38, 32, 3, '#d8ba72');
          for (let x = 140; x < 168; x += 5) fillBox(c, x, 38, 1, 3, '#7f7450');
        }
        for (let i = 0; i < 6; i++) fillBox(c, 73 + i * 7, 39 + (i % 2) * 3, 3, 1, '#eacb8b');
      } else {
        for (const [x, i] of [[16, 0], [113, 1]]) {
          fillBox(c, x, -21, 56, 38, '#304a4e');
          fillBox(c, x + 2, -19, 52, 32, '#527378');
          fillBox(c, x + 4, -17, 48, 27, '#284451');
          fillBox(c, x + 5, -16, 9, 25, '#3c5862');
          for (let yy = -13; yy < 7; yy += 5) fillBox(c, x + 7, yy, 5, 2, '#7c9d9e');
          photo(c, x + 17, -14, 29, 21, tone + i);
          fillBox(c, x + 48, -13, 2, 18, '#879d95');
          fillBox(c, x + 49, -8, 1, 5, '#d7be88');
          fillBox(c, x + 23, 16, 9, 6, '#4f6d68');
          fillBox(c, x + 13, 22, 29, 4, '#5c7c73');
          fillBox(c, x + 17, 22, 22, 1, '#c1d6c2');
          inset(c, x + 1, 32, 49, 13, '#647e76', '#a9bfb0', '#4f625b');
          for (let yy = 35; yy < 43; yy += 4)
            for (let xx = x + 5; xx < x + 46; xx += 5) fillBox(c, xx, yy, 3, 2, '#c8d6c0');
          fillBox(c, x + 56, 34, 8, 11, '#547269');
          fillBox(c, x + 59, 35, 2, 3, '#b6c9b1');
        }
        camera(c, 79, 29, 0.85);
        fillBox(c, 78, 6, 24, 15, '#eadfbc');
        photo(c, 80, 7, 17, 11, tone);
        mug(c, 90, 49, '#c49a78');
      }
      break;
    }
    case 'bed': {
      const color = ['#719b91', '#bc8c81', '#839ab4', '#b6a574'][tone % 4];
      inset(c, 2, 0, w - 4, h, '#b08b65', '#e3bb87', '#69533f');
      inset(c, 5, -10, w - 10, 18, '#bc9569', '#e5c48d', '#765942');
      grain(c, 9, -6, w - 18, 10, tone);
      fillBox(c, 7, 7, w - 14, h - 19, '#e5ddc3');
      fillBox(c, 10, 10, w - 20, 23, '#f7efd5');
      fillBox(c, 13, 12, w - 26, 17, '#fff8e3');
      fillBox(c, 15, 14, w - 30, 2, '#fffdf0');
      fillBox(c, 13, 29, w - 26, 2, '#cabfa3');
      fillBox(c, 7, 35, w - 14, h - 47, color);
      for (let yy = 43; yy < h - 13; yy += 12)
        for (let xx = 12; xx < w - 12; xx += 12) {
          fillBox(c, xx, yy, 6, 1, '#f2e9ce72');
          fillBox(c, xx + 2, yy - 2, 1, 5, '#f2e9ce52');
        }
      fillBox(c, 7, 34, w - 14, 8, '#e4d4b1');
      fillBox(c, 7, 40, w - 14, 2, '#fbefcd');
      fillBox(c, 7, h - 16, w - 14, 6, '#00000015');
      inset(c, 4, h - 9, w - 8, 8, '#b89162', '#d8b47d', '#65513f');
      break;
    }
    case 'bookshelf': {
      inset(c, 0, -24, w, h + 24, '#6d503d', '#dab27b', '#594533');
      for (let row = 0; row < 2; row++) {
        const y = -19 + row * 23;
        fillBox(c, 4, y, w - 8, 19, '#554b39');
        for (let x = 7; x < w - 8; x += 8) {
          const b = (Math.floor(x / 8) + row) % 5,
            hh = 13 + (b % 3) * 2;
          fillBox(c, x, y + 19 - hh, 6, hh, ['#779c8c', '#c4866b', '#789ba7', '#c5ae6e', '#9b7a91'][b]);
          fillBox(c, x + 1, y + 21 - hh, 4, 1, '#ead6af');
          fillBox(c, x + 4, y + 20 - hh, 1, hh - 2, '#ffffff28');
        }
        fillBox(c, 3, y + 19, w - 6, 4, '#c69b65');
        fillBox(c, 4, y + 19, w - 8, 1, '#ecd19b');
      }
      if (w > 90) {
        plant(c, w - 18, -28, 0.5);
        inset(c, 15, -37, 24, 17, '#dbc298', '#f2deac', '#73563f');
        photo(c, 18, -34, 18, 11, 1);
      } else {
        book(c, 7, -28, 20, 6, '#a3b18c');
        mug(c, w - 22, -32, '#c6d3ad');
      }
      break;
    }
    case 'cafeCounter': {
      inset(c, 0, -8, w, h + 8, '#b29d77', '#e4d0a1', '#6f5c44');
      for (let x = 4; x < w - 5; x += 32) {
        inset(c, x, h - 26, 27, 23, '#ba9c70', '#d3b88a', '#8e744e');
        fillBox(c, x + 21, h - 19, 2, 4, '#5c6249');
      }
      inset(c, -2, -12, w + 4, 14, '#e7d5b1', '#fbebc8', '#9a8663');
      grain(c, 3, -9, w - 6, 8, 3);
      inset(c, 13, -35, 58, 38, '#668785', '#c0d1bd', '#3c5b58');
      fillBox(c, 17, -31, 50, 13, '#a6bcb2');
      fillBox(c, 21, -27, 27, 7, '#334e50');
      for (const x of [23, 32, 41]) fillBox(c, x, -25, 4, 2, '#d5bf7f');
      for (const x of [53, 60]) {
        fillPixelOval(c, x, -24, 3, 3, '#dfd8bc');
        fillBox(c, x, -25, 1, 2, '#365456');
      }
      fillBox(c, 22, -14, 33, 3, '#dbe2ca');
      fillBox(c, 24, -13, 4, 10, '#324e4d');
      fillBox(c, 47, -13, 4, 10, '#324e4d');
      fillBox(c, 18, -1, 45, 5, '#3b5550');
      for (let x = 21; x < 62; x += 5) fillBox(c, x, 0, 2, 3, '#a4b8a7');
      mug(c, 31, -5);
      mug(c, 48, -5, '#c7d4ad');
      for (let i = 0; i < 3; i++) {
        fillBox(c, 83 + i * 16, -22, 12, 24, ['#c6ac76', '#a9815e', '#87a07c'][i]);
        fillBox(c, 82 + i * 16, -25, 14, 4, '#5e705a');
        fillBox(c, 86 + i * 16, -15, 6, 8, '#eee0b9');
      }
      inset(c, 143, -18, 63, 24, '#9eb7ae', '#d6e3cb', '#5c756c');
      fillBox(c, 147, -14, 55, 16, '#bdd6ca');
      for (let i = 0; i < 3; i++) pastry(c, 150 + i * 16, -9);
      fillBox(c, 145, 5, 59, 3, '#d6c49d');
      inset(c, 215, -16, 28, 26, '#355c50', '#8da882', '#244a42');
      fillBox(c, 219, -12, 20, 2, '#e8dfb5');
      for (let yy = -5; yy < 5; yy += 5) fillBox(c, 219, yy, 15, 1, '#d0cfaa');
      mug(c, 217, 22, '#87a99a');
      fillBox(c, 75, 30, 26, 17, '#ddd5ba');
      fillBox(c, 79, 33, 18, 1, '#9c9b77');
      fillBox(c, 79, 37, 15, 1, '#9c9b77');
      break;
    }
    case 'toolwall': {
      inset(c, 0, -43, w, h + 43, '#b89566', '#e4c797', '#6c5943');
      for (let yy = -36; yy < 21; yy += 7)
        for (let xx = 7; xx < w - 4; xx += 7) fillBox(c, xx, yy, 1, 2, '#7a694d');
      for (let x = 13, i = 0; x < w - 21; x += 34, i++) {
        if (i % 3 === 0) {
          fillBox(c, x, -29, 5, 39, '#9b6545');
          fillBox(c, x + 1, -28, 2, 35, '#d1a36d');
          fillBox(c, x - 6, -32, 20, 8, '#4c6970');
          fillBox(c, x - 5, -32, 17, 2, '#b4c5b7');
        } else if (i % 3 === 1) {
          fillBox(c, x, -32, 9, 6, '#ccd0b4');
          fillBox(c, x + 1, -26, 7, 30, '#6d897f');
          fillBox(c, x + 3, -26, 2, 30, '#b1c5b2');
          fillBox(c, x + 2, 4, 5, 8, '#a47751');
        } else {
          fillBox(c, x, -29, 4, 36, '#d0bc81');
          fillBox(c, x, -27, 1, 30, '#f5dfaa');
          for (let yy = -23; yy < 8; yy += 5) fillBox(c, x + 2, yy, 2, 1, '#665e43');
          fillBox(c, x + 13, -30, 5, 30, '#a46a46');
          fillBox(c, x + 9, -33, 13, 6, '#c1ccb6');
        }
        fillBox(c, x - 2, -35, 11, 2, '#725e44');
      }
      inset(c, 0, 23, w, 9, '#b48c60', '#f0cb91', '#71593d');
      break;
    }
    case 'armchair': {
      const color = tone ? '#b98072' : '#668d81',
        light = tone ? '#d8a18d' : '#8eb09b',
        dark = tone ? '#895f59' : '#456d64';
      inset(c, 3, -12, 26, 33, dark, light, '#38594f');
      fillBox(c, 6, -9, 20, 18, color);
      fillBox(c, 8, -7, 16, 1, light);
      fillBox(c, 7, 10, 18, 16, color);
      fillBox(c, 8, 11, 16, 2, light);
      fillBox(c, 8, 15, 16, 1, light);
      fillBox(c, 8, 16, 16, 5, color);
      fillBox(c, 8, 21, 16, 2, dark);
      for (const x of [1, 26]) inset(c, x, 5, 6, 24, dark, light, '#3d5a4d');
      fillBox(c, 9, 24, 15, 2, dark);
      fillBox(c, 11, -3, 10, 10, light);
      fillBox(c, 12, -2, 8, 1, '#d1c9a1');
      fillBox(c, 15, 0, 2, 2, color);
      break;
    }
    case 'cafeTable': {
      fillPixelOval(c, w / 2, h / 2 - 5, w / 2 - 5, h / 2 - 6, '#dfbd86');
      fillPixelOval(c, w / 2 - 1, h / 2 - 6, w / 2 - 8, h / 2 - 10, '#e9ca93');
      fillBox(c, w / 2 - 2, 4, 1, h - 20, '#a7774820');
      mug(c, 17, 17);
      mug(c, w - 28, 30, '#7f9f89');
      book(c, 41, 11, 18, 22, '#70978a');
      pastry(c, 37, 39);
      break;
    }
    case 'plant': {
      plant(c, w / 2, h - 12, 1.12);
      break;
    }
    case 'cabinet': {
      grain(c, 6, h - 23, w - 12, 16, 3);
      if (o.zone === 'studio') {
        camera(c, 17, -21, 0.9);
        camera(c, 61, -21, 0.9);
        book(c, w - 55, -14, 28, 10, '#9f8b99');
      }
      break;
    }
    case 'counter': {
      for (let i = 0; i < 3; i++) mug(c, 63 + i * 17, -3, ['#f3e1b8', '#89aa98', '#c59875'][i]);
      plant(c, w - 13, -13, 0.55);
      break;
    }
    case 'coffee': {
      grain(c, 4, 5, w - 8, h - 10, 2);
      book(c, 11, 7, 25, 17, '#668a7b');
      book(c, 40, 8, 23, 16, '#b78670');
      mug(c, 75, 9);
      break;
    }
    case 'chair':
    case 'stool': {
      if (o.kind === 'chair' && ['left', 'right'].includes(o.facing)) {
        sideChair(c, o);
        break;
      }
      fillBox(c, 8, 10, 17, 1, '#f1d7a2');
      fillBox(c, 8, 19, 17, 2, '#80724e');
      if (o.kind === 'chair') {
        fillBox(c, 7, -4, 18, 2, '#adc4a0');
        fillBox(c, 15, -3, 2, 4, '#b4c9a5');
      }
      break;
    }
    case 'bench': {
      for (const x of [10, w - 13]) for (const yy of [-13, 19]) fillBox(c, x, yy, 2, 2, '#4b614b');
      grain(c, 2, 10, w - 4, 16, 2);
      break;
    }
    case 'planter': {
      for (let x = 13, i = 0; x < w; x += 19, i++) {
        fillPixelOval(c, x, 6, 12, 9, '#416e4b');
        fillPixelOval(c, x - 4, 0, 8, 8, '#719659');
        fillPixelOval(c, x + 5, 2, 6, 6, '#92ac6c');
        for (let j = 0; j < 3; j++) {
          const xx = x - 6 + j * 5,
            yy = -5 + (j % 2) * 8;
          fillBox(c, xx, yy, 5, 5, ['#e3b283', '#e6d295', '#bc9ab5'][(i + j) % 3]);
          fillBox(c, xx + 2, yy + 2, 2, 2, '#f8e8b7');
        }
      }
      break;
    }
    case 'backdrop': {
      for (let x = 20; x < w - 15; x += 14) fillBox(c, x, -10, 2, h - 7, '#8da69a33');
      fillBox(c, 14, h - 12, w - 28, 3, '#e0e2cf');
      break;
    }
    case 'fountain': {
      for (const [dx, dy, ww] of [[-23, -8, 13], [10, 7, 16], [-12, 13, 10], [18, -16, 8]])
        fillBox(c, w / 2 + dx, h / 2 + dy, ww, 1, '#cee5d488');
      fillBox(c, w / 2 - 4, h / 2 - 28, 3, 19, '#d8ddc5');
      break;
    }
  }
}
function rug(c, x, y, w, h, color) {
  fillBox(c, x + 2, y + 3, w, h, '#4a59482a');
  fillBox(c, x, y, w, h, color);
  for (const n of [3, 8]) {
    fillBox(c, x + n, y + n, w - n * 2, 2, '#e9d7ac');
    fillBox(c, x + n, y + h - n - 2, w - n * 2, 2, '#e9d7ac');
    fillBox(c, x + n, y + n, 2, h - n * 2, '#e9d7ac');
    fillBox(c, x + w - n - 2, y + n, 2, h - n * 2, '#e9d7ac');
  }
  for (let xx = x + 14; xx < x + w - 12; xx += 18)
    for (let yy = y + 14; yy < y + h - 10; yy += 18) {
      fillBox(c, xx, yy, 3, 1, '#f2d8ad65');
      fillBox(c, xx + 1, yy - 1, 1, 3, '#f2d8ad65');
    }
  for (let xx = x + 6; xx < x + w - 5; xx += 7) {
    fillBox(c, xx, y - 3, 2, 3, '#dfcaa0');
    fillBox(c, xx, y + h, 2, 3, '#dfcaa0');
  }
}
/** Floor decals over the ground texture: rugs, door mats and paving wear. */
export function detailGround(c, tiles, rooms) {
  for (let y = 0; y < tiles.length; y++)
    for (let x = 0; x < tiles[y].length; x++)
      if (tiles[y][x] === 'grass') {
        for (let i = 0; i < 4; i++) {
          const xx = x * 32 + 2 + Math.floor(tileNoise(x + i, y) * 27),
            yy = y * 32 + 3 + Math.floor(tileNoise(x, y + i) * 25);
          fillBox(c, xx, yy, 2, 1, '#aec190');
          fillBox(c, xx + 1, yy - 2, 1, 3, '#7f9e6b');
        }
        for (const [dx, dy, side] of [[-1, 0, 'l'], [1, 0, 'r'], [0, -1, 't'], [0, 1, 'b']]) {
          const neighbor = tiles[y + dy]?.[x + dx];
          if (!neighbor || neighbor === 'grass' || neighbor === 'wall' || neighbor === 'meadow') continue;
          if (side === 'l' || side === 'r') {
            fillBox(c, x * 32 + (side === 'l' ? 0 : 30), y * 32, 2, 32, '#5f8458');
          } else fillBox(c, x * 32, y * 32 + (side === 't' ? 0 : 30), 32, 2, '#5f8458');
        }
      }
  rug(c, 200, 488, 240, 200, '#6d937d');
  rug(c, 416, 1504, 160, 256, '#a98565');
  rug(c, 2048, 1440, 128, 288, '#789b94');
  // A small rug beside each bed.
  const bedsideColors = ['#a88973', '#8f9c79', '#8d98a4', '#b5a171'];
  for (const room of rooms.filter(r => r.zone === 'bedroom'))
    rug(c, (room.x + 3) * 32 + 2, (room.y === 2 ? 5 : room.y + 4) * 32 + 4, 56, 40, bedsideColors[room.bedroom % 4]);
  for (const room of rooms) {
    const px = room.x * 32,
      py = room.y * 32;
    for (let x = px + 55; x < px + room.w * 32 - 70; x += 192) {
      fillPath(c, [ [x, py + 32], [x + 44, py + 32], [x + 75, py + 117], [x + 18, py + 117], ], '#fff2ba12');
      fillBox(c, x + 33, py + 37, 2, 69, '#fff7cd15');
    }
  }
}
/** A tree with a trunk and layered round canopy, standing on (x, y). */
export function detailTree(c, x, y, s = 1, seed = 0) {
  fillPixelOval(c, x + 7 * s, y + 7 * s, 36 * s, 12 * s, '#3557423d');
  fillBox(c, x - 5 * s, y - 31 * s, 10 * s, 37 * s, '#655240');
  fillBox(c, x - 3 * s, y - 29 * s, 3 * s, 32 * s, '#a88d5e');
  fillBox(c, x + 3 * s, y - 24 * s, 2 * s, 24 * s, '#4b513c');
  const shapes = [[-21, -51, 18, 21], [-9, -68, 23, 22], [13, -62, 20, 23], [26, -45, 16, 17], [-5, -37, 30, 17]];
  for (const [a, b, rx, ry] of shapes) fillPixelOval(c, x + a * s, y + b * s, rx * s, ry * s, '#376c4d');
  for (const [a, b, rx, ry] of shapes.slice(0, 4))
    fillPixelOval(c, x + (a - 3) * s, y + (b - 5) * s, (rx - 2) * s, (ry - 3) * s, '#648b55');
  for (let i = 0; i < 19; i++) {
    const xx = (tileNoise(i, seed) * 65 - 33) * s,
      yy = (-76 + tileNoise(seed, i) * 43) * s;
    fillBox(c, x + xx, y + yy, 5 * s, 3 * s, i % 3 ? '#88a668' : '#a0b575');
    fillBox(c, x + xx - 2 * s, y + yy + 3 * s, 3 * s, 2 * s, '#75995c');
  }
}
/** A window with a frame and curtains, tinted per district. */
/** Curtain colour beside the windows and the stripe along the top of the walls, per room. */
const CURTAINS = {
  bedroom: '#b98877',
  living: '#b98877',
  kitchen: '#c7a26c',
  bathroom: '#8fb3bb',
  gym: '#9c9cb8',
  studio: '#8c9ca8',
  plaza: '#769782',
};
const WALL_ACCENTS = {
  bedroom: '#9a8576',
  living: '#829a7c',
  kitchen: '#a39570',
  bathroom: '#7a9aa0',
  gym: '#8686a0',
  plaza: '#628c78',
  studio: '#7a9396',
  workshop: '#7b9782',
};
function windowArt(c, x, y, zone) {
  inset(c, x, y, 57, 34, '#a7c5bb', '#ebddba', '#5c7e72');
  fillBox(c, x + 4, y + 4, 49, 24, '#b9d9cd');
  fillPath(c, [ [x + 5, y + 25], [x + 18, y + 13], [x + 29, y + 25], ], '#8eb596');
  fillPath(c, [ [x + 25, y + 25], [x + 43, y + 10], [x + 52, y + 25], ], '#a6c3a5');
  fillBox(c, x + 27, y + 2, 3, 28, '#e9dfbf');
  fillBox(c, x + 3, y + 16, 50, 2, '#e9dfbf');
  fillBox(c, x + 4, y + 3, 19, 2, '#f6f0d5');
  const tone = CURTAINS[zone] ?? '#99aa83';
  for (const xx of [x - 3, x + 49]) {
    fillBox(c, xx, y - 2, 11, 28, tone);
    fillBox(c, xx + 2, y, 2, 25, '#ffffff3d');
    fillBox(c, xx + 7, y + 2, 2, 24, '#00000015');
  }
  fillBox(c, x - 5, y - 4, 67, 3, '#7d654b');
  inset(c, x - 4, y + 30, 65, 6, '#b9966b', '#e7cca0', '#7e6c4d');
  if (['bedroom', 'living', 'kitchen', 'plaza'].includes(zone)) plant(c, x + 43, y + 26, 0.36);
}
/**
 * One run of wall tiles, `w` pixels wide, rising `up` pixels above its tile row.
 * North walls are tallest and carry windows; side and inside walls are thinner.
 */
export function drawDetailedWall(c, w, up, first) {
  const north = first.edge === 'north',
    side = first.edge === 'side' || first.edge === 'inside',
    accent = WALL_ACCENTS[first.zone] ?? '#7b9782';
  fillBox(c, 0, up, w, 32, '#526d59');
  fillBox(c, 2, up + 2, w - 4, 25, '#ded9bc');
  fillBox(c, 2, up + 21, w - 4, 7, '#b4b491');
  fillBox(c, 0, 0, w, up + 3, '#e7dfc4');
  fillBox(c, 0, 0, w, 5, accent);
  fillBox(c, 1, 5, w - 2, 3, '#a8b799');
  fillBox(c, 1, up - 3, w - 2, 3, '#f7e9c7');
  fillBox(c, 0, up + 26, w, 5, '#8f9475');
  fillBox(c, 2, up + 26, w - 4, 1, '#d6d1aa');
  if (side) {
    fillBox(c, 0, 0, 5, up + 32, accent);
    fillBox(c, w - 5, 0, 5, up + 32, accent);
    fillBox(c, 5, 0, 2, up + 32, '#b3bca0');
  }
  if (north) {
    for (let x = 40; x < w - 65; x += 192) {
      windowArt(c, x, 9, first.zone);
      if (x + 144 < w - 30) {
        inset(c, x + 116, 14, 33, 27, '#d9c8a1', '#f0deb0', '#6c5b45');
        photo(c, x + 120, 18, 25, 19, first.zone === 'studio' ? 1 : 0);
      }
    }
    if (w > 250) {
      const x = w - 40;
      fillPixelOval(c, x, 23, 12, 12, '#5d7864');
      fillPixelOval(c, x, 23, 10, 10, '#ecdfb6');
      fillBox(c, x - 1, 16, 2, 8, '#6e775b');
      fillBox(c, x, 22, 6, 2, '#6e775b');
      fillBox(c, x - 1, 14, 2, 2, '#baad7c');
    }
    for (let x = 17; x < w - 12; x += 192) {
      fillBox(c, x, 13, 3, 17, '#6d7556');
      fillPixelOval(c, x + 1, 16, 7, 5, '#b7a56b');
      fillBox(c, x - 5, 16, 12, 7, '#ecce8d');
      fillBox(c, x - 3, 18, 8, 2, '#fff0b1');
    }
  }
}
