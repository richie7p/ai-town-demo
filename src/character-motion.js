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

/** Seated residents always show the rest pose, whatever they are doing. */
export const seatedPose = (presentation, anchor) => (anchor?.seated ? 'rest' : presentation.pose);
