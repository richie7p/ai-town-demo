// The town's textures, drawn in code from the map definition: one large ground
// texture, then wall runs, room nameplates and one texture per piece of furniture
// (foreground layers sorted by their foot line so residents pass behind them).
// Visible solids are exactly the solid tiles of the collision map.
//
// This file draws the base shapes; environment-detail.js adds material and decor.
// Coordinates inside a furniture drawing are relative to the object's top-left tile.
// The art is hand-laid pixel data, so it is excluded from Prettier (.prettierignore).
import { createCanvas, fillBox, fillOval, fillPath, tileNoise } from './pixel-canvas.js';
import { registerResidentAssets } from './resident-art.js';
import { detailFurniture, detailGround, detailTree, drawDetailedWall } from './environment-detail.js';
import { WORLD_SIZE, ZONE_CENTERS, MAP_ROOMS, MAP_BUILDINGS, MAP_TILES, MAP_WALLS, MAP_OBJECTS, MAP_COLUMNS, MAP_ROWS, TILE_SIZE } from './town-map.js';

const BACKGROUND_KEY = 'town-walkable-floor-v6';
// Small props shared by several pieces of furniture.
function mug(c, x, y, col = '#fff3d9') {
  fillBox(c, x, y, 8, 7, col);
  fillBox(c, x + 8, y + 1, 3, 4, col);
  fillBox(c, x + 2, y, 4, 2, '#735844');
  fillBox(c, x + 2, y + 7, 5, 1, '#a49279');
}
function book(c, x, y, w, h, col) {
  fillBox(c, x, y, w, h, '#52655a');
  fillBox(c, x + 1, y, w - 2, h - 2, col);
  fillBox(c, x + 2, y + 2, w - 4, 2, '#e8d7b1');
}
/** A potted plant standing on (x, y), scaled by s. */
function plant(c, x, y, s = 1) {
  fillBox(c, x - 6 * s, y, 12 * s, 11 * s, '#a77a5e');
  fillBox(c, x - 8 * s, y - 2 * s, 16 * s, 4 * s, '#c79c78');
  fillBox(c, x - 4 * s, y + 3 * s, 3 * s, 6 * s, '#d2a480');
  fillBox(c, x - s, y - 22 * s, 2 * s, 22 * s, '#52724a');
  fillPath(
    c,
    [[x, y - 9 * s], [x - 13 * s, y - 18 * s], [x - 12 * s, y - 25 * s], [x - 5 * s, y - 23 * s], [x, y - 12 * s]],
    '#477454',
  );
  fillPath(
    c,
    [[x, y - 7 * s], [x + 13 * s, y - 16 * s], [x + 14 * s, y - 24 * s], [x + 6 * s, y - 21 * s], [x, y - 12 * s]],
    '#689361',
  );
  fillPath(c, [[x, y - 17 * s], [x - 5 * s, y - 29 * s], [x, y - 35 * s], [x + 5 * s, y - 29 * s]], '#7fa36b');
}
/**
 * The base drawing of one piece of furniture, by `o.kind`. The canvas origin is
 * the object's top-left corner; tall pieces draw upwards into negative y.
 */
function furniture(c, o) {
  const w = o.width,
    h = o.height,
    edge = '#745e4f',
    wood = '#bd966f',
    top = '#d4b48a';
  const box = (x, y, bw, bh, t = top) => {
    fillBox(c, x + 2, y + 5, bw, bh, '#6a665753');
    fillBox(c, x, y, bw, bh, edge);
    fillBox(c, x + 2, y + 2, bw - 4, bh - 6, t);
    fillBox(c, x + 2, y + bh - 7, bw - 4, 5, wood);
  };
  switch (o.kind) {
    case 'bed': {
      const tone = ['#7b9b96', '#bd917c', '#8c99b8', '#b6a477'][(o.tone || 0) % 4];
      fillBox(c, 2, 0, w - 4, h, edge);
      fillBox(c, 6, -8, w - 12, 17, '#b18a66');
      fillBox(c, 8, -6, w - 16, 4, '#ebcda1');
      fillBox(c, 6, 6, w - 12, h - 13, '#eee5cd');
      fillBox(c, 10, 11, w - 20, 18, '#fff8df');
      fillBox(c, 13, 14, w - 26, 9, '#f8f1dd');
      fillBox(c, 6, 35, w - 12, h - 43, tone);
      fillBox(c, 6, 33, w - 12, 10, '#e5dec2');
      for (let y = 51; y < h - 8; y += 14) fillBox(c, 8, y, w - 16, 2, '#ffffff22');
      fillBox(c, 6, h - 9, w - 12, 6, '#ab8867');
      fillBox(c, 4, h - 2, 6, 5, edge);
      fillBox(c, w - 10, h - 2, 6, 5, edge);
      break;
    }
    case 'bookshelf': {
      box(0, -18, w, h + 18, '#735c49');
      for (let row = 0; row < 2; row++) {
        const y = -14 + row * 22;
        for (let x = 6; x < w - 8; x += 9) {
          const b = (Math.floor(x / 9) + row) % 5;
          fillBox(c, x, y + 3 + (b % 3), 6, 15 - (b % 3), ['#899b78', '#bd8e6c', '#7e9aa0', '#beaf7e', '#a27b79'][b]);
          fillBox(c, x + 1, y + 6, 4, 1, '#eddfc3');
        }
        fillBox(c, 3, y + 20, w - 6, 3, top);
      }
      fillBox(c, 0, -21, w, 5, '#ebcda1');
      break;
    }
    case 'cabinet':
    case 'counter':
    case 'cafeCounter': {
      box(0, -8, w, h + 8, '#c7b897');
      for (let x = 3; x < w - 4; x += 32) {
        fillBox(c, x, h - 25, 28, 22, '#a79070');
        fillBox(c, x + 2, h - 23, 24, 18, '#c3a983');
        fillBox(c, x + 21, h - 20, 3, 3, '#776a55');
      }
      fillBox(c, -2, -10, w + 4, 12, '#f0ddba');
      fillBox(c, 0, 1, w, 4, '#bdaf91');
      if (o.kind === 'cafeCounter') {
        box(12, -28, 54, 34, '#a4b4af');
        fillBox(c, 17, -24, 44, 15, '#dde3d5');
        fillBox(c, 23, -19, 16, 7, '#536660');
        fillBox(c, 48, -20, 7, 7, '#b58364');
        fillBox(c, 24, -6, 6, 8, '#64796c');
        mug(c, 37, 3);
        for (let i = 0; i < 5; i++) {
          fillBox(c, 91 + i * 21, -12, 12, 18, ['#d5b67b', '#b88d6a', '#7f9a77'][i % 3]);
          fillBox(c, 90 + i * 21, -15, 14, 4, '#6b7562');
        }
        fillBox(c, 210, -4, 30, 19, '#6c806d');
        fillBox(c, 214, -1, 22, 2, '#ece1bc');
        fillBox(c, 214, 5, 16, 2, '#ece1bc');
      } else if (o.kind === 'counter') {
        fillBox(c, 14, -4, 35, 13, '#889b98');
        fillBox(c, 18, -2, 27, 8, '#c9dad0');
        fillBox(c, 35, -17, 3, 14, '#788e87');
        fillBox(c, 27, -17, 11, 3, '#c9dad0');
        mug(c, w - 23, 1);
      } else {
        for (let x = 12; x < w - 12; x += 39) {
          fillBox(c, x, -18, 23, 15, '#7f8d79');
          fillBox(c, x + 2, -16, 19, 4, '#b9c2a6');
          fillBox(c, x + 8, -12, 7, 5, '#bda780');
        }
      }
      break;
    }
    case 'toolwall': {
      box(0, -34, w, h + 34, '#c3ad84');
      for (let y = -27; y < 15; y += 8) for (let x = 7; x < w - 4; x += 8) fillBox(c, x, y, 2, 2, '#9f8b6b');
      for (let x = 13; x < w - 20; x += 35) {
        fillBox(c, x, -23, 4, 31, '#876650');
        fillBox(c, x - 6, -24, 17, 7, '#8faaa3');
        fillBox(c, x + 17, -21, 3, 21, '#678778');
        fillBox(c, x + 14, -23, 9, 4, '#bcc9bc');
      }
      fillBox(c, 0, 23, w, 9, '#d3b18a');
      break;
    }
    case 'workbench':
    case 'editdesk': {
      box(0, -4, w, h + 4, o.kind === 'workbench' ? '#d4b184' : '#b1c1bb');
      fillBox(c, 4, h - 14, w - 8, 3, '#7e7962');
      fillBox(c, 8, h - 9, 9, 13, edge);
      fillBox(c, w - 17, h - 9, 9, 13, edge);
      if (o.kind === 'workbench') {
        fillBox(c, 15, 7, 51, 29, '#eae1bd');
        fillBox(c, 20, 12, 35, 2, '#819282');
        fillBox(c, 24, 18, 27, 2, '#819282');
        fillBox(c, 26, 23, 2, 11, '#819282');
        fillBox(c, 80, 9, 18, 26, '#a7b49b');
        fillBox(c, 84, 13, 10, 4, '#d8dfbd');
        fillBox(c, 116, 9, 5, 32, '#b77453');
        fillBox(c, 107, 10, 22, 8, '#7b8c81');
        fillBox(c, 146, 19, 26, 5, '#728f88');
        fillBox(c, 164, 16, 8, 11, '#a6b6ab');
        mug(c, 174, 6, '#9baa8e');
      } else {
        for (const x of [18, 113]) {
          fillBox(c, x, -17, 53, 34, '#52675f');
          fillBox(c, x + 3, -14, 47, 27, '#8aa9a2');
          fillBox(c, x + 6, -10, 25, 2, '#d3dfcd');
          fillBox(c, x + 7, -4, 36, 10, '#74968e');
          fillBox(c, x + 22, 17, 10, 6, '#758b80');
          fillBox(c, x + 14, 23, 27, 4, '#7b8f83');
          fillBox(c, x + 1, 32, 50, 12, '#71867b');
          for (let y = 35; y < 43; y += 4)
            for (let xx = x + 5; xx < x + 47; xx += 6) fillBox(c, xx, y, 4, 2, '#bfd0bd');
        }
        mug(c, 91, 22);
      }
      break;
    }
    case 'armchair': {
      const tone = o.tone ? '#c19079' : '#819e8d';
      fillBox(c, 4, 25, 5, 9, edge);
      fillBox(c, 23, 25, 5, 9, edge);
      fillBox(c, 3, -9, 26, 31, '#526d61');
      fillBox(c, 5, -7, 22, 18, tone);
      fillBox(c, 5, 13, 22, 14, tone);
      fillBox(c, 6, 13, 20, 3, '#cbd3ad');
      fillBox(c, 1, 7, 5, 22, '#6f8d7c');
      fillBox(c, 26, 7, 5, 22, '#6f8d7c');
      break;
    }
    case 'chair':
    case 'stool': {
      fillBox(c, 7, 21, 4, 13, edge);
      fillBox(c, 22, 21, 4, 13, edge);
      fillBox(c, 4, 8, 25, 17, '#756451');
      fillBox(c, 5, 7, 23, 13, o.kind === 'chair' ? '#91a293' : '#c8a57b');
      fillBox(c, 7, 9, 19, 2, '#e1cfaa');
      if (o.kind === 'chair') {
        fillBox(c, 5, -5, 3, 19, edge);
        fillBox(c, 24, -5, 3, 19, edge);
        fillBox(c, 4, -7, 24, 9, '#88a08e');
      }
      break;
    }
    case 'coffee': {
      box(0, 2, w, h - 2);
      book(c, 12, 6, 24, 16, '#8b9e8a');
      book(c, 39, 8, 23, 16, '#b38873');
      mug(c, 76, 9);
      break;
    }
    case 'cafeTable': {
      fillBox(c, 24, h - 10, 7, 15, edge);
      fillBox(c, w - 31, h - 10, 7, 15, edge);
      fillOval(c, w / 2, h / 2 + 4, w / 2 - 1, h / 2, '#766657');
      fillOval(c, w / 2, h / 2 - 2, w / 2 - 2, h / 2 - 2, '#d8b88e');
      fillOval(c, w / 2, h / 2 - 5, w / 2 - 5, h / 2 - 6, '#e3c49c');
      mug(c, 19, 20);
      mug(c, w - 29, 30, '#8ba492');
      book(c, 41, 16, 19, 25, '#81968a');
      break;
    }
    case 'plant':
      plant(c, w / 2, h - 12, 1.25);
      break;
    case 'planter': {
      box(0, 6, w, h - 6, '#a7a389');
      for (let x = 14; x < w; x += 21) {
        fillOval(c, x, 4, 13, 10, '#668d60');
        fillOval(c, x - 5, -3, 8, 9, '#86a76e');
        for (let i = 0; i < 3; i++)
          fillBox(c, x - 7 + i * 6, -4 + (i % 2) * 7, 5, 5, ['#d4ad8f', '#e5d3a2', '#a7bb92'][i]);
      }
      break;
    }
    case 'bench': {
      fillBox(c, 7, h - 10, 5, 15, edge);
      fillBox(c, w - 12, h - 10, 5, 15, edge);
      fillBox(c, 6, -13, 4, 28, edge);
      fillBox(c, w - 10, -13, 4, 28, edge);
      for (let i = 0; i < 3; i++) fillBox(c, 0, -16 + i * 7, w, 5, '#b69168');
      for (let i = 0; i < 3; i++) fillBox(c, 0, 10 + i * 6, w, 5, '#caaa7d');
      break;
    }
    case 'backdrop': {
      fillBox(c, 4, -15, 4, h + 12, '#687a70');
      fillBox(c, w - 8, -15, 4, h + 12, '#687a70');
      fillBox(c, 1, -19, w - 2, 6, '#71887c');
      fillBox(c, 10, -13, w - 20, h + 2, '#b6c6c3');
      fillBox(c, 14, -9, w - 28, h - 6, '#cdd7cd');
      fillBox(c, 10, h - 12, w - 20, 10, '#a7bdb6');
      fillBox(c, 0, h - 4, 17, 4, '#687a70');
      fillBox(c, w - 17, h - 4, 17, 4, '#687a70');
      break;
    }
    case 'sign': {
      fillBox(c, 8, 15, 4, 19, '#735f4d');
      fillBox(c, 23, 15, 4, 19, '#735f4d');
      box(0, -21, w, h + 9, '#647f6e');
      fillBox(c, 5, -14, w - 10, 2, '#ece6c9');
      fillBox(c, 5, -7, w - 13, 2, '#ece6c9');
      fillBox(c, 5, 2, w - 10, 2, '#c9d6b5');
      fillBox(c, 5, 8, w - 14, 2, '#c9d6b5');
      break;
    }
    case 'fountain': {
      fillOval(c, w / 2, h / 2 + 3, w / 2, h / 2, '#738a82');
      fillOval(c, w / 2, h / 2 - 3, w / 2 - 2, h / 2 - 3, '#c4ccba');
      fillOval(c, w / 2, h / 2 - 5, w / 2 - 10, h / 2 - 12, '#82adb0');
      fillOval(c, w / 2, h / 2 - 5, w / 2 - 15, h / 2 - 17, '#95bdba');
      fillOval(c, w / 2, h / 2 - 5, 16, 9, '#b3bfb1');
      fillBox(c, w / 2 - 5, h / 2 - 29, 10, 24, '#b3bfb1');
      fillOval(c, w / 2, h / 2 - 30, 15, 6, '#d3d8c4');
      fillBox(c, w / 2 - 1, h / 2 - 41, 2, 13, '#e1ece0');
      break;
    }
    // Bedroom
    case 'wardrobe': {
      fillBox(c, 1, -30, w - 2, h + 28, edge);
      fillBox(c, 3, -28, w - 6, h + 22, '#c99a6c');
      fillBox(c, w / 2 - 1, -26, 2, h + 18, '#8d6a4f');
      fillBox(c, w / 2 - 5, h / 2 - 14, 2, 6, '#f1d6a0');
      fillBox(c, w / 2 + 3, h / 2 - 14, 2, 6, '#f1d6a0');
      fillBox(c, 2, -32, w - 4, 4, '#e2c79b');
      fillBox(c, 3, h - 6, 4, 6, edge);
      fillBox(c, w - 7, h - 6, 4, 6, edge);
      break;
    }
    case 'desk': {
      box(0, -6, w, h + 6, '#c9a477');
      fillBox(c, 10, -4, 18, 13, '#5f6f6a');
      fillBox(c, 12, -2, 14, 8, ['#9fc0b8', '#c3b2d4', '#b8cf9a', '#e0c08e'][(o.tone || 0) % 4]);
      fillBox(c, 36, 2, 12, 9, '#f3ead2');
      fillBox(c, 38, 4, 8, 1, '#a49279');
      fillBox(c, 38, 7, 6, 1, '#a49279');
      fillBox(c, 54, -10, 3, 14, '#6f6a58');
      fillBox(c, 49, -14, 11, 5, '#e9c56f');
      break;
    }
    // Living room
    case 'tv': {
      box(0, 0, w, h, '#a98563');
      fillBox(c, 18, -46, w - 36, 48, '#2f3a3a');
      fillBox(c, 22, -42, w - 44, 40, '#5d8fa0');
      fillBox(c, 26, -38, 30, 4, '#9cc6cf');
      fillBox(c, 26, -30, 18, 3, '#9cc6cf');
      fillBox(c, w / 2 - 6, 2, 12, 4, '#2f3a3a');
      fillBox(c, 6, 4, 10, 14, '#7d8d84');
      fillBox(c, w - 16, 4, 10, 14, '#7d8d84');
      break;
    }
    case 'sofa': {
      const tone = (o.tone || 0) % 2 ? '#86a394' : '#7d9b8c';
      fillBox(c, 0, 8, w, 24, '#55705f');
      fillBox(c, 1, 6, w - 2, 18, tone);
      fillBox(c, 2, 8, w - 4, 2, '#a8c2b2');
      fillBox(c, 0, 22, w, 12, '#4b6355');
      fillBox(c, 0, 22, w, 2, '#6c8a78');
      break;
    }
    case 'lamp': {
      fillBox(c, 11, 24, 10, 5, '#5d5a4f');
      fillBox(c, 15, -22, 3, 48, '#6f6a58');
      fillBox(c, 7, -36, 19, 15, '#efd9a2');
      fillBox(c, 9, -34, 15, 3, '#fff1c8');
      break;
    }
    // Kitchen
    case 'fridge': {
      fillBox(c, 2, -40, w - 4, h + 38, '#9aa7a5');
      fillBox(c, 4, -38, w - 8, h + 32, '#e8eeec');
      fillBox(c, 4, -10, w - 8, 2, '#aebab8');
      fillBox(c, w - 9, -32, 2, 14, '#8c9997');
      fillBox(c, w - 9, -4, 2, 10, '#8c9997');
      fillBox(c, 8, -30, 8, 6, '#f2c6a4');
      fillBox(c, 9, -20, 6, 5, '#b8d6a6');
      break;
    }
    case 'stove': {
      box(0, -8, w, h + 8, '#c9c3b4');
      for (const x of [6, 36]) {
        fillBox(c, x, -4, 22, 14, '#3f4744');
        fillOval(c, x + 11, 3, 7, 5, '#5d6763');
        fillOval(c, x + 11, 3, 3, 2, '#3f4744');
      }
      fillBox(c, 9, -16, 16, 13, '#b55e45');
      fillBox(c, 7, -17, 20, 3, '#8f4636');
      fillBox(c, 14, -21, 6, 3, '#6f3529');
      fillBox(c, 41, -10, 12, 8, '#7d8a87');
      fillBox(c, 53, -8, 8, 2, '#5d6763');
      for (let i = 0; i < 4; i++) fillBox(c, 8 + i * 14, h - 4, 4, 3, '#59605c');
      break;
    }
    case 'sink': {
      box(0, -6, w, h + 6, '#cfc9ba');
      for (let x = 6; x + 22 <= w - 4; x += 30) {
        fillBox(c, x, -2, 22, 12, '#8fa6a8');
        fillBox(c, x + 2, 0, 18, 8, '#c9dfe2');
        fillBox(c, x + 9, -12, 3, 9, '#8c9997');
        fillBox(c, x + 6, -12, 9, 2, '#8c9997');
      }
      break;
    }
    case 'diningTable': {
      fillBox(c, 6, h - 4, 6, 10, edge);
      fillBox(c, w - 12, h - 4, 6, 10, edge);
      fillBox(c, 0, 2, w, h - 2, '#7d5f48');
      fillBox(c, 2, 0, w - 4, h - 6, '#c99a68');
      fillBox(c, 2, 0, w - 4, 3, '#e2bd8a');
      for (let i = 0; i < 4; i++)
        for (const y of [10, h - 20]) {
          fillOval(c, 16 + i * 32, y, 9, 6, '#f6f1e3');
          fillOval(c, 16 + i * 32, y, 5, 3, ['#e3b673', '#9bbf7f', '#d98b6c', '#e8d39a'][(i + (y > 20 ? 1 : 0)) % 4]);
        }
      fillOval(c, w / 2, h / 2 - 3, 15, 8, '#b55e45');
      fillOval(c, w / 2, h / 2 - 4, 11, 5, '#e59a5b');
      fillBox(c, w / 2 - 30, h / 2 - 6, 6, 7, '#f6f1e3');
      fillBox(c, w / 2 + 24, h / 2 - 6, 6, 7, '#9fc7d6');
      break;
    }
    // Bathroom
    case 'shower': {
      fillBox(c, 0, -26, w, 28, '#9fbcc3');
      fillBox(c, 2, -24, w - 4, 24, '#c9dfe4');
      for (let x = 2; x < w - 2; x += 10) fillBox(c, x, -24, 1, 24, '#a9c7cd');
      fillBox(c, 2, -13, w - 4, 1, '#a9c7cd');
      fillBox(c, 2, 0, w - 4, h - 4, '#dde9ea');
      fillBox(c, 6, 4, w - 12, h - 12, '#c3d7d9');
      fillOval(c, w / 2, h / 2, 3, 2, '#8aa3a7');
      fillBox(c, w / 2 - 2, -22, 4, 10, '#8c9997');
      fillBox(c, w / 2 - 7, -14, 14, 3, '#8c9997');
      fillBox(c, -1, -8, w + 2, 3, '#8c9997');
      const curtain = ['#e7b3a8', '#a8c8e7', '#d9cf9b'][Math.floor(o.x / 96) % 3];
      fillBox(c, 0, -6, 20, h - 2, curtain);
      for (let x = 2; x < 20; x += 5) fillBox(c, x, -6, 1, h - 2, '#00000018');
      break;
    }
    case 'toilet': {
      fillBox(c, 8, -16, 16, 13, '#c5d0ce');
      fillBox(c, 9, -15, 14, 10, '#eef3f2');
      fillOval(c, 16, 13, 10, 12, '#c5d0ce');
      fillOval(c, 16, 12, 9, 10, '#eef3f2');
      fillOval(c, 16, 12, 6, 7, '#c9dbdd');
      break;
    }
    // Gym
    case 'treadmill': {
      fillBox(c, 3, 4, w - 6, h - 6, '#2f3533');
      fillBox(c, 6, 8, w - 12, h - 14, '#59625f');
      for (let y = 10; y < h - 8; y += 6) fillBox(c, 6, y, w - 12, 1, '#4a5250');
      fillBox(c, 3, -6, 3, 14, '#4b5553');
      fillBox(c, w - 6, -6, 3, 14, '#4b5553');
      fillBox(c, 1, -16, w - 2, 11, '#4b5553');
      fillBox(c, 4, -14, w - 8, 6, '#7fb0b8');
      break;
    }
    case 'mat': {
      const tone = ['#7fa98a', '#b98ea4', '#8a9fc2'][(o.tone || 0) % 3];
      fillBox(c, 6, 4, w - 12, h - 8, tone);
      fillBox(c, 6, 4, w - 12, 2, '#ffffff44');
      fillBox(c, 5, 0, w - 10, 7, tone);
      fillBox(c, 5, 5, w - 10, 2, '#00000022');
      break;
    }
    case 'weights': {
      box(0, -10, w, h + 10, '#7c7f86');
      for (const y of [-6, 6])
        for (let x = 8; x + 14 <= w - 4; x += 18) {
          fillBox(c, x, y, 4, 9, '#33373b');
          fillBox(c, x + 10, y, 4, 9, '#33373b');
          fillBox(c, x + 4, y + 3, 6, 3, '#a2a8ae');
        }
      break;
    }
    // Outdoors
    case 'parkBench': {
      // A one-tile bench seen from above; the backrest is behind the sitter.
      const back = o.facing === 'left' ? w - 7 : o.facing === 'right' ? 2 : null;
      fillBox(c, 3, 26, 4, 6, edge);
      fillBox(c, w - 7, 26, 4, 6, edge);
      fillBox(c, 1, 6, w - 2, 22, '#7d5f48');
      for (let i = 0; i < 3; i++) fillBox(c, 2, 8 + i * 7, w - 4, 5, '#c49a69');
      if (back !== null) {
        fillBox(c, back, -8, 5, 34, '#7d5f48');
        fillBox(c, back + 1, -6, 3, 30, '#a97f55');
      } else {
        fillBox(c, 1, 24, w - 2, 8, '#7d5f48');
        fillBox(c, 2, 25, w - 4, 4, '#a97f55');
      }
      break;
    }
    case 'tree': {
      detailTree(c, 16, 28, 0.78, o.x + o.y);
      break;
    }
  }
}
/** One 32×32 ground tile of kind `k` at tile (x, y), varied per tile by tileNoise. */
function floor(c, x, y, k) {
  const px = x * 32,
    py = y * 32,
    n = tileNoise(x, y),
    q = (a, b, w, h, col) => fillBox(c, px + a, py + b, w, h, col);
  if (k === 'grass') {
    q(0, 0, 32, 32, n > 0.6 ? '#7f9f6d' : n > 0.3 ? '#789969' : '#85a474');
    q(4 + Math.floor(n * 17), 5, 2, 3, '#a9bd8a');
    q(19, 22 + Math.floor(n * 5), 3, 2, '#698c5e');
    if (n > 0.87) {
      q(8, 19, 3, 3, '#d3c898');
      q(10, 21, 2, 2, '#eee0af');
    }
    return;
  }
  if (k === 'meadow') {
    q(0, 0, 32, 32, n > 0.6 ? '#97b77f' : n > 0.3 ? '#9fbd86' : '#a5c28c');
    q(4 + Math.floor(n * 17), 6, 2, 3, '#bccf9a');
    q(18, 21 + Math.floor(n * 6), 3, 2, '#86a873');
    if (n > 0.82) {
      q(9, 18, 3, 3, n > 0.92 ? '#f2cfd9' : '#f3e6a2');
      q(10, 19, 1, 1, '#ffffff');
    }
    return;
  }
  if (k === 'trail') {
    q(0, 0, 32, 32, n > 0.5 ? '#d6c49c' : '#dccba5');
    q(5 + Math.floor(n * 15), 9, 3, 2, '#bfae86');
    q(18, 22 - Math.floor(n * 8), 2, 2, '#c8b68e');
    return;
  }
  if (k === 'water') {
    q(0, 0, 32, 32, n > 0.5 ? '#74a9bb' : '#7cb0c0');
    q(3 + Math.floor(n * 12), 8, 11, 1, '#a9d0da');
    q(14, 19 + Math.floor(n * 7), 13, 1, '#a9d0da');
    q(6, 27, 6, 1, '#94c3d0');
    return;
  }
  if (k === 'bridge') {
    q(0, 0, 32, 32, '#b99a73');
    for (let xx = 0; xx < 32; xx += 8) q(xx, 0, 1, 32, '#8e7253');
    q(0, 0, 32, 2, '#8e7253');
    return;
  }
  if (k === 'kitchen') {
    q(0, 0, 32, 32, (x + y) % 2 ? '#efe6d2' : '#e0d0b0');
    q(0, 0, 32, 1, '#cdbd9c');
    q(0, 0, 1, 32, '#cdbd9c');
    return;
  }
  if (k === 'bath') {
    q(0, 0, 32, 32, n > 0.5 ? '#d4e5e7' : '#d9e9ea');
    for (let i = 0; i < 32; i += 8) {
      q(i, 0, 1, 32, '#bcd3d6');
      q(0, i, 32, 1, '#bcd3d6');
    }
    return;
  }
  if (k === 'gym') {
    q(0, 0, 32, 32, n > 0.5 ? '#8e8ca6' : '#9493ac');
    q(3 + Math.floor(n * 20), 7, 2, 2, '#a7a6bd');
    q(16, 18 + Math.floor(n * 8), 2, 2, '#7f7d97');
    return;
  }
  if (k === 'wood' || k === 'cafe' || k === 'carpet') {
    const base = { wood: ['#cda97a', '#d7b68a'], cafe: ['#bf966c', '#c7a177'], carpet: ['#c99f73', '#d1a97e'] }[k];
    q(0, 0, 32, 32, n > 0.5 ? base[0] : base[1]);
    for (let yy = 0; yy < 32; yy += 8) {
      q(0, yy, 32, 1, '#ab865c');
      q(((y * 4 + yy / 8) % 2) * 16, yy, 1, 8, '#ab865c');
      if (n > 0.4) q(5, yy + 4, 12, 1, '#c5a680');
    }
    return;
  }
  if (k === 'stone' || k === 'studio') {
    q(0, 0, 32, 32, k === 'studio' ? (n > 0.5 ? '#c6cfca' : '#ced5cd') : n > 0.5 ? '#d7d9c8' : '#dce0cf');
    q(0, 0, 32, 1, '#acb6aa');
    q(0, 0, 1, 32, '#acb6aa');
    q(2, 2, 29, 1, '#edf0df');
    return;
  }
  if (k === 'door') {
    q(0, 0, 32, 32, '#d2af7c');
    for (let yy = 0; yy < 32; yy += 8) q(0, yy, 32, 1, '#b18f68');
    q(0, 29, 32, 3, '#e7c995');
    return;
  }
  if (k === 'wall') {
    q(0, 0, 32, 32, '#b3b9a4');
    return;
  }
  q(0, 0, 32, 32, k === 'paving' ? '#dad8c3' : '#d6c9ad');
  q(0, 0, 32, 1, '#b9b49b');
  q(0, 0, 1, 32, '#b9b49b');
  q(2, 2, 27, 1, '#eee6cb');
  q(16, (x + y) % 2 ? 0 : 16, 1, 16, '#c6bea5');
  if (n > 0.55) q(8, 19, 5, 1, '#c3bba0');
}
function tree(c, x, y, s = 1) {
  detailTree(c, x, y, s, x + y);
}
/** A rug with a light border and fringe on the short sides. */
function rug(c, x, y, w, h, col) {
  fillBox(c, x, y, w, h, col);
  fillBox(c, x + 4, y + 4, w - 8, 2, '#e2d6b2');
  fillBox(c, x + 4, y + h - 6, w - 8, 2, '#e2d6b2');
  fillBox(c, x + 4, y + 4, 2, h - 8, '#e2d6b2');
  fillBox(c, x + w - 6, y + 4, 2, h - 8, '#e2d6b2');
  for (let xx = x + 9; xx < x + w - 7; xx += 9) {
    fillBox(c, xx, y - 3, 3, 3, '#c6b995');
    fillBox(c, xx, y + h, 3, 3, '#c6b995');
  }
}
/** Ground texture: tiles, the tree border, potted plants, rugs, door mats, the avenue sign and furniture shadows. */
function ground(c) {
  c.imageSmoothingEnabled = false;
  for (let y = 0; y < MAP_ROWS; y++) for (let x = 0; x < MAP_COLUMNS; x++) floor(c, x, y, MAP_TILES[y][x]);
  // Trees only grow on plain grass (never on roads, floors or under walls).
  const onGrass = (x, y) => MAP_TILES[Math.floor(y / TILE_SIZE)]?.[Math.floor(x / TILE_SIZE)] === 'grass';
  const treeOnGrass = (x, y, s) => onGrass(x, y) && tree(c, x, y, s);
  for (let x = 40; x < WORLD_SIZE.width; x += 97) {
    treeOnGrass(x, 30, 0.6);
    treeOnGrass(x + 12, WORLD_SIZE.height - 20, 0.65);
  }
  for (let y = 120; y < WORLD_SIZE.height - 60; y += 110) treeOnGrass(20, y, 0.62);
  for (const [x, y, s] of [
    [1700, 690, 0.76],
    [1880, 880, 0.72],
    [2330, 770, 0.74],
    [2470, 1000, 0.7],
    [2140, 1080, 0.66],
    [1700, 1060, 0.7],
    [2560, 640, 0.62],
  ])
    treeOnGrass(x, y, s);
  // Potted shrubs along the north side of the avenue.
  for (const x of [120, 760, 1000, 1300, 1460, 1760, 2400, 2560]) {
    const y = 36 * TILE_SIZE + 26;
    if (!onGrass(x, y - 6)) continue;
    fillBox(c, x - 10, y - 4, 20, 5, '#7d8268');
    fillBox(c, x - 6, y - 20, 12, 18, '#a6ad89');
    plant(c, x, y - 17, 0.7);
  }
  rug(c, 200, 488, 240, 200, '#9aa78c');
  rug(c, 416, 1504, 160, 256, '#b5a487');
  rug(c, 2048, 1440, 128, 288, '#9baea9');
  for (const room of MAP_ROOMS)
    for (const [dx, dy] of room.doors) fillBox(c, dx * 32, dy * 32 + 3, 32, 4, '#f1d19a');
  c.textAlign = 'center';
  c.font = 'bold 17px "Microsoft JhengHei", sans-serif';
  c.fillStyle = '#687e62';
  c.fillText('日 和 大 街', 1600, 1240);
  c.font = '12px sans-serif';
  c.fillText('A LITTLE TOWN, EVERYDAY STORIES', 1600, 1261);
  for (const o of MAP_OBJECTS)
    if (!o.passable && o.kind !== 'tree')
      fillOval(c, o.x + o.width / 2 + 3, o.y + o.height - 2, o.width / 2 + 4, Math.min(12, o.height / 4), '#53654b25');
}
/** Walls as foreground layers: each continuous run along one edge becomes one texture. */
function wallLayers(scene) {
  const layers = [],
    groups = new Map();
  for (const wall of MAP_WALLS) {
    const key = `${wall.zone}:${wall.y}:${wall.edge}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(wall);
  }
  for (const [group, items] of groups) {
    items.sort((a, b) => a.x - b.x);
    const runs = [];
    for (const tile of items) {
      const last = runs.at(-1);
      if (last && last.at(-1).x + 32 === tile.x) last.push(tile);
      else runs.push([tile]);
    }
    for (const [index, run] of runs.entries()) {
      const first = run[0],
        w = run.length * 32,
        up = first.edge === 'north' ? 40 : first.edge === 'south' ? 12 : 24,
        texture = createCanvas(w, 32 + up),
        c = texture.getContext('2d');
      c.imageSmoothingEnabled = false;
      drawDetailedWall(c, w, up, first);
      const key = `town-wall-v6-${group}-${index}`;
      scene.textures.addCanvas(key, texture);
      layers.push({ x: first.x, y: first.y - up, key, depth: first.y + 32 });
    }
  }
  return layers;
}
/** A green nameplate above each building's door. */
function nameplateLayers(scene) {
  return MAP_BUILDINGS.map(room => {
    const measure = createCanvas(1, 1).getContext('2d');
    measure.font = '600 16px "Microsoft JhengHei", sans-serif';
    const width = Math.max(182, Math.ceil(measure.measureText(room.name).width) + 38),
      texture = createCanvas(width, 37),
      c = texture.getContext('2d');
    c.imageSmoothingEnabled = false;
    fillBox(c, 2, 3, width - 2, 34, '#253d3333');
    fillBox(c, 0, 0, width, 33, '#365d4b');
    fillBox(c, 2, 2, width - 4, 29, '#456c55');
    fillBox(c, 3, 2, width - 6, 1, '#93aa7c');
    fillBox(c, 3, 30, width - 6, 1, '#233f36');
    fillBox(c, 7, 8, 2, 2, '#c9be8b');
    fillBox(c, width - 9, 8, 2, 2, '#c9be8b');
    c.textAlign = 'center';
    c.font = measure.font;
    c.fillStyle = '#f3e8c5';
    c.fillText(room.name, width / 2, 20);
    c.font = '7px sans-serif';
    c.fillStyle = '#c4d0b1';
    c.fillText(room.subtitle, width / 2, 28);
    const key = `town-nameplate-v6-${room.zone}`;
    scene.textures.addCanvas(key, texture);
    return { x: (room.x + room.w / 2) * 32 - width / 2, y: room.y * 32 - 42, key, depth: room.y * 32 + 33 };
  });
}
/** Nothing to load: every texture is drawn in code. Kept for the scene's preload hook. */
export function preloadTownAssets() {}
/**
 * Create (once per game) and return the textures and placements the scene needs:
 * the ground, foreground layers with their depths, ambient light positions,
 * equipment sign positions and each resident's sprite sheet.
 */
export function registerTownAssets(scene, agents) {
  if (!scene.textures.exists(BACKGROUND_KEY)) {
    const texture = createCanvas(WORLD_SIZE.width, WORLD_SIZE.height);
    ground(texture.getContext('2d'));
    detailGround(texture.getContext('2d'), MAP_TILES, MAP_ROOMS);
    scene.textures.addCanvas(BACKGROUND_KEY, texture);
  }
  let foreground = scene.registry.get('town-art-foreground-v6');
  if (!foreground) {
    foreground = [...wallLayers(scene), ...nameplateLayers(scene)];
    for (const o of MAP_OBJECTS) {
      const texture = createCanvas(o.width + 32, o.height + 96),
        c = texture.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.translate(16, 72);
      furniture(c, o);
      detailFurniture(c, o);
      const key = `town-object-v6-${o.id}`;
      scene.textures.addCanvas(key, texture);
      foreground.push({ x: o.x - 16, y: o.y - 72, key, depth: o.y + o.height + (o.passable ? -18 : 0) });
    }
    scene.registry.set('town-art-foreground-v6', foreground);
  }
  return {
    backgroundKey: BACKGROUND_KEY,
    backgroundSize: WORLD_SIZE,
    foreground,
    ambient: {
      fountain: { x: 1184, y: 1584, radius: 70 },
      lamps: [
        { x: 1500, y: 1170 },
        { x: 1700, y: 1170 },
        { x: 1500, y: 1330 },
        { x: 1700, y: 1330 },
        { x: 560, y: 1170 },
        { x: 2240, y: 1170 },
      ],
    },
    equipmentLabels: { workshop: { x: 1790, y: 542 }, studio: { x: 1790, y: 1755 } },
    zoneCenters: ZONE_CENTERS,
    ...registerResidentAssets(scene, agents),
  };
}
