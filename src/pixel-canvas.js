// Drawing primitives shared by the code-drawn art (town, furniture, residents).
// Every function takes a 2D canvas context `c` first. Coordinates are rounded
// to whole pixels where noted, keeping the pixel-art grid crisp.

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** A filled rectangle snapped to whole pixels. */
export function fillBox(c, x, y, w, h, color) {
  c.fillStyle = color;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A filled polygon drawn as a canvas path (soft, antialiased edges). */
export function fillPath(c, points, color) {
  c.fillStyle = color;
  c.beginPath();
  points.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
}

/** A filled ellipse drawn as a canvas path (soft, antialiased edges). */
export function fillOval(c, x, y, rx, ry, color) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fill();
}

/** A filled ellipse built from one-pixel rows, with hard pixel edges. */
export function fillPixelOval(c, x, y, rx, ry, color) {
  for (let row = -Math.ceil(ry); row <= Math.ceil(ry); row++) {
    const n = 1 - (row / ry) ** 2;
    if (n < 0) continue;
    const span = Math.max(1, Math.round(rx * Math.sqrt(n)));
    fillBox(c, x - span, y + row, span * 2, 1, color);
  }
}

/**
 * A filled polygon by scan-line, with hard pixel edges. Canvas
 * imageSmoothingEnabled alone does not turn antialiasing off for filled paths.
 */
export function fillPixelPolygon(c, points, color) {
  const top = Math.floor(Math.min(...points.map(p => p[1])));
  const bottom = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = top; y < bottom; y++) {
    const scan = y + 0.5;
    const crossings = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [x1, y1] = points[j];
      const [x2, y2] = points[i];
      if ((y1 <= scan && y2 > scan) || (y2 <= scan && y1 > scan))
        crossings.push(x1 + ((scan - y1) * (x2 - x1)) / (y2 - y1));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i < crossings.length; i += 2) {
      const start = Math.ceil(crossings[i] - 0.5);
      const end = Math.ceil(crossings[i + 1] - 0.5);
      if (end > start) fillBox(c, start, y, end - start, 1, color);
    }
  }
}

/** A Bresenham line of `width`×`width` pixel squares from point a to point b. */
export function pixelLine(c, a, b, color, width = 1) {
  let x = Math.round(a[0]);
  let y = Math.round(a[1]);
  const endX = Math.round(b[0]);
  const endY = Math.round(b[1]);
  const dx = Math.abs(endX - x);
  const dy = -Math.abs(endY - y);
  const stepX = x < endX ? 1 : -1;
  const stepY = y < endY ? 1 : -1;
  let error = dx + dy;
  for (;;) {
    fillBox(c, x, y, width, width, color);
    if (x === endX && y === endY) break;
    const doubled = 2 * error;
    if (doubled >= dy) {
      error += dy;
      x += stepX;
    }
    if (doubled <= dx) {
      error += dx;
      y += stepY;
    }
  }
}

/** Stable per-tile pseudo-random value in [0, 1), used to vary floors and decor. */
export const tileNoise = (x, y) =>
  ((Math.imul(x + 71, 73856093) ^ Math.imul(y + 27, 19349663)) >>> 0) / 4294967296;

/** Lighten (positive) or darken (negative) a #rrggbb colour by `amount` per channel. */
export function shade(hex, amount) {
  const channel = value => Math.max(0, Math.min(255, parseInt(value, 16) + amount));
  return (
    '#' +
    hex
      .slice(1)
      .match(/../g)
      .map(value => channel(value).toString(16).padStart(2, '0'))
      .join('')
  );
}
