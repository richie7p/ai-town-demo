// How a view frame is shown: positions, routes, poses and speech bubbles.
// Presentation geometry only. These never determine interaction eligibility,
// movement duration, equipment use or any V5 research outcome.
import { activityAnchor } from './activity-anchors.js';
import { findWalkPath } from './town-map.js';
export { WORLD_SIZE, ZONE_CENTERS } from './town-map.js';

/** Fallback point for an empty route: the central crossing of the avenues. */
const CROSSING = [1040, 784];
const SPEECH_KINDS = new Set(['talk', 'reply', 'invite', 'accept', 'decline']);
const FAILURE_KINDS = new Set(['invalid', 'capacity_failure', 'join_failed']);
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 3.5;
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

export const clampZoom = value => clamp(Number.isFinite(value) ? value : 1, MIN_ZOOM, MAX_ZOOM);

/** The next frame directly follows the previous one in the same run, so residents may walk. */
export function isContinuousFrame(previous, next) {
  return (
    !!previous &&
    next.tick === previous.tick + 1 &&
    next.config.seed === previous.config.seed &&
    next.config.capacity === previous.config.capacity
  );
}

export function characterPosition(agent, frame) {
  return activityAnchor(agent, frame).point;
}

/** Walking route between two points; the zones are accepted for API stability but not needed. */
export function presentationPath(from, to, _oldZone, _newZone) {
  return findWalkPath(from, to);
}

/** The point at `progress` (0–1) of the route's total length. */
export function samplePath(path, progress) {
  if (!path.length) return CROSSING.slice();
  const ratio = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
  if (ratio === 0) return path[0].slice();
  if (ratio === 1) return path.at(-1).slice();
  const lengths = path.slice(1).map((point, i) => Math.hypot(point[0] - path[i][0], point[1] - path[i][1]));
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * ratio;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 1;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    remaining -= lengths[i];
  }
  return path.at(-1).slice();
}

/** The dominant axis decides the facing; a negligible move keeps the fallback. */
export function directionBetween(from, to, fallback = 'down') {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  if (Math.hypot(dx, dy) < 0.1) return fallback;
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

/**
 * What one resident visibly does in this frame, from the settled events of its
 * own proposal: a failed proposal shows no activity; otherwise work, rest or
 * talk (in that order of precedence) or idle.
 */
export function characterPresentation(frame, id) {
  const proposal = frame.trace?.proposals.find(p => p.actor === id);
  const events = frame.events.filter(e => e.tick === frame.tick);
  const results = proposal ? events.filter(e => e.proposalId === proposal.id) : [];
  const failed = results.some(e => FAILURE_KINDS.has(e.type) || e.success === false);
  const delivered = results.find(e => e.success === true && SPEECH_KINDS.has(e.type));
  const work = results.find(e => e.success === true && ['work', 'join'].includes(e.type));
  const rest = results.some(e => e.success === true && ['rest', 'wait'].includes(e.type));
  const held = frame.equipment.find(e => e.owner === id) ?? null;
  // A joiner's equipment is the host's, found through the shared invitation.
  const workEquipment =
    work?.equipmentId ||
    (work?.invitationId && events.find(e => e.type === 'work' && e.invitationId === work.invitationId)?.equipmentId);

  let pose = 'idle';
  if (!failed) {
    if (work) pose = workEquipment?.startsWith('camera') || held?.type === 'camera' ? 'camera' : 'work';
    else if (rest) pose = 'rest';
    else if (delivered) pose = 'talk';
  }
  return {
    proposal,
    failed,
    delivered,
    pose,
    held,
    target: delivered?.participants.find(p => p !== id) ?? null,
  };
}

/**
 * Up to `limit` lines spoken successfully this tick, at most one per speaker,
 * with the selected resident's own line first.
 */
export function visibleUtterances(frame, selected, limit = 3) {
  const speakers = new Set();
  return frame.events
    .filter(e => e.tick === frame.tick && SPEECH_KINDS.has(e.type) && e.success === true && e.text)
    .sort((a, b) => Number(b.participants[0] === selected) - Number(a.participants[0] === selected))
    .filter(e => {
      const speaker = e.participants[0];
      if (speakers.has(speaker)) return false;
      speakers.add(speaker);
      return true;
    })
    .slice(0, Math.max(0, limit));
}
