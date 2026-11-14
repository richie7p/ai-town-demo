// The visitor's 16-frame sprite sheet (four directions × four walking phases),
// drawn on a 32×48 grid. Display only; the visitor is not part of the simulation.

export const VISITOR_FRAME = Object.freeze({ width: 32, height: 48 });
/** First frame of each direction's four walking phases is (index × 4). */
export const VISITOR_DIRECTIONS = Object.freeze({ down: 0, left: 1, right: 2, up: 3 });
const FRAMES = 16;
const STRIDE = [0, 2, 0, -2];

export function drawVisitorSheet() {
  const canvas = document.createElement('canvas');
  canvas.width = VISITOR_FRAME.width * FRAMES;
  canvas.height = VISITOR_FRAME.height;
  const context = canvas.getContext('2d');
  const box = (x, y, w, h, color) => {
    context.fillStyle = color;
    context.fillRect(x, y, w, h);
  };
  for (let frame = 0; frame < FRAMES; frame++) {
    const direction = Math.floor(frame / 4);
    const stride = STRIDE[frame % 4];
    const back = direction === VISITOR_DIRECTIONS.up;
    const side = direction === VISITOR_DIRECTIONS.left || direction === VISITOR_DIRECTIONS.right;
    context.save();
    context.translate(frame * VISITOR_FRAME.width, 0);
    // Frames face right; the left-facing ones are mirrored.
    if (direction === VISITOR_DIRECTIONS.left) {
      context.translate(VISITOR_FRAME.width, 0);
      context.scale(-1, 1);
    }
    // Legs and shoes step in opposite directions.
    box(9, 32, 6, 10 + stride, '#344f67');
    box(18, 32, 6, 10 - stride, '#233e54');
    box(8, 41 + stride, 8, 4, '#253940');
    box(17, 41 - stride, 9, 4, '#253940');
    // Coat, with arms and hands swinging against the legs.
    box(8, 20, 17, 14, '#dbeadf');
    box(9, 22, 3, 12, '#adc9bf');
    box(11, 32, 12, 2, '#a9bfb3');
    box(5, 22 + stride, 4, 13, '#cee0d4');
    box(5, 33 + stride, 4, 4, '#e7b58e');
    box(25, 22 - stride, 3, 13, '#9cbdb1');
    box(25, 33 - stride, 3, 4, '#d9a27f');
    if (back) {
      // Backpack.
      box(11, 22, 11, 14, '#447f92');
      box(13, 24, 7, 7, '#7fafba');
      box(13, 33, 7, 2, '#315e78');
    } else {
      // Straps and a name card.
      box(12, 21, 2, 13, '#599098');
      box(21, 21, 2, 13, '#599098');
      box(13, 25, 8, 4, '#f8faf0');
    }
    // Head and cap.
    box(10, 8, 14, 13, '#e8b78f');
    box(10, 9, 3, 9, '#cd9571');
    box(9, 5, 15, 8, '#30595b');
    box(8, 8, 18, 4, '#447d79');
    box(10, 4, 13, 5, '#5e9a8a');
    if (back) box(10, 12, 14, 7, '#3c4542');
    else {
      // Eyes (one in profile) and mouth.
      box(side ? 21 : 14, 14, 2, 2, '#354747');
      if (!side) box(21, 14, 2, 2, '#354747');
      box(side ? 23 : 18, 18, 3, 1, '#aa735e');
    }
    context.restore();
  }
  return canvas;
}
