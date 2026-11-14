// Presentation pacing only; these values never affect the research clock.

/** Residents are drawn at 78% of their 64×96 atlas frame. */
export const RESIDENT_SCALE = 0.78;
/** How far a seated body sinks below its standing foot point, in pixels. */
export const SEATED_OFFSET = 14;
/** Animation time at the default playback speed (1×), in milliseconds. */
const BASE_DURATION = 1620;
/** Walking speed at 1×, in pixels per second. */
const WALK_SPEED = 135;
const MIN_WALK_MS = 240;

/** Animation speed multiplier for a playback step duration (0.5×–4×). */
export const motionRate = duration =>
  Math.max(
    0.5,
    Math.min(4, BASE_DURATION / (Number.isFinite(duration) && duration > 0 ? duration : BASE_DURATION)),
  );

/** Time to walk `distance` pixels at the playback speed. */
export const walkDuration = (distance, duration) =>
  Math.max(MIN_WALK_MS, (Math.max(0, distance) / WALK_SPEED) * 1000) / motionRate(duration);

/**
 * The pose to show: a furniture pose from the anchor (sleeping in bed, showering,
 * running on a treadmill) wins; seated residents show the rest pose; otherwise
 * the pose of what they did.
 */
export const seatedPose = (presentation, anchor) => {
  if (presentation.pose === 'sleep') return 'sleep';
  if (anchor?.pose === 'sleep' || anchor?.pose === 'shower' || anchor?.pose === 'run') return anchor.pose;
  return anchor?.seated ? 'rest' : presentation.pose;
};
