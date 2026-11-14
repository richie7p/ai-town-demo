// Presentation pacing only; these values never affect the research clock.
export const RESIDENT_SCALE = 0.78;
export const SEATED_OFFSET = 14;
export const motionRate = duration =>
  Math.max(0.5, Math.min(4, 1620 / (Number.isFinite(duration) && duration > 0 ? duration : 1620)));
export const walkDuration = (distance, duration) =>
  Math.max(240, (Math.max(0, distance) / 135) * 1000) / motionRate(duration);
export const seatedPose = (presentation, anchor) => (anchor?.seated ? 'rest' : presentation.pose);
