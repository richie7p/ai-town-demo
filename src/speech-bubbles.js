// Speech bubble text and placement. Pure functions; the scene draws the result.

const BUBBLE_MARGIN = 8;
/** Bubbles sit this far above a resident's feet. */
const ABOVE_HEAD = 88;
/** Any overlap outweighs every possible distance from the ideal spot. */
const OVERLAP_PENALTY = 10000000;

/** Break text into lines of `columns` characters (CJK text has no word breaks). */
export function wrapText(text, columns = 16) {
  const lines = [];
  for (const [i, character] of Array.from(String(text)).entries()) {
    if (i % columns === 0) lines.push('');
    lines[lines.length - 1] += character;
  }
  return lines.join('\n');
}

/**
 * Place bubbles one after another, each at the first of nine candidate spots
 * (above, above-higher or below × centred, left or right) that overlaps the
 * fewest earlier bubbles and lies closest to the spot above the speaker.
 * `bubbles` are {x, y, width, height} with x/y the speaker's feet; returns {x, y} per bubble.
 */
export function placeBubbles(bubbles, world) {
  const placed = [];
  for (const { x: footX, y: footY, width, height } of bubbles) {
    const idealX = footX - width / 2;
    const idealY = footY - height - ABOVE_HEAD;
    let best = null;
    for (const dy of [0, -height - 12, height + 118])
      for (const dx of [0, -width - BUBBLE_MARGIN, width + BUBBLE_MARGIN]) {
        const x = Math.max(10, Math.min(world.width - width - 10, idealX + dx));
        const y = Math.max(8, Math.min(world.height - height - 10, idealY + dy));
        const overlaps = placed.filter(
          other =>
            x < other.x + other.width + BUBBLE_MARGIN &&
            x + width + BUBBLE_MARGIN > other.x &&
            y < other.y + other.height + BUBBLE_MARGIN &&
            y + height + BUBBLE_MARGIN > other.y,
        ).length;
        const score = overlaps * OVERLAP_PENALTY + (x - idealX) ** 2 + (y - idealY) ** 2;
        if (!best || score < best.score) best = { x, y, score };
      }
    placed.push({ x: best.x, y: best.y, width, height });
  }
  return placed.map(({ x, y }) => ({ x, y }));
}
