// Presentation geometry only. These positions never determine interaction
// eligibility, movement duration, equipment use, or any V5 research outcome.
import { WORLD_SIZE, ZONE_CENTERS, activityAnchor, findWalkPath } from './town-map.js';
export { WORLD_SIZE, ZONE_CENTERS } from './town-map.js';
const crossing = [1040, 784];
const utteranceKinds = new Set(['talk', 'reply', 'invite', 'accept', 'decline']);
const failureKinds = new Set(['invalid', 'capacity_failure', 'join_failed']);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const clampZoom = value => clamp(Number.isFinite(value) ? value : 1, 1, 3.5);

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
export function presentationPath(from, to, _oldZone, _newZone) {
  return findWalkPath(from, to);
}
export function samplePath(path, progress) {
  if (!path.length) return crossing.slice();
  const ratio = clamp(Number.isFinite(progress) ? progress : 1, 0, 1);
  if (ratio === 0) return path[0].slice();
  if (ratio === 1) return path.at(-1).slice();
  const lengths = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  let distance = lengths.reduce((a, b) => a + b, 0) * ratio;
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i]) {
      const t = lengths[i] ? distance / lengths[i] : 1;
      return [path[i][0] + (path[i + 1][0] - path[i][0]) * t, path[i][1] + (path[i + 1][1] - path[i][1]) * t];
    }
    distance -= lengths[i];
  }
  return path.at(-1).slice();
}
export function directionBetween(from, to, fallback = 'down') {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  if (Math.hypot(dx, dy) < 0.1) return fallback;
  return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
}
export function characterPresentation(frame, id) {
  const proposal = frame.trace?.proposals.find(p => p.actor === id);
  const events = frame.events.filter(e => e.tick === frame.tick);
  const results = proposal ? events.filter(e => e.proposalId === proposal.id) : [];
  const failed = results.some(e => failureKinds.has(e.type) || e.success === false);
  const delivered = results.find(e => e.success === true && utteranceKinds.has(e.type));
  const work = results.find(e => e.success === true && ['work', 'join'].includes(e.type));
  const rest = results.some(e => e.success === true && ['rest', 'wait'].includes(e.type));
  const held = frame.equipment.find(e => e.owner === id) ?? null;
  const workEquipment =
    work?.equipmentId ||
    (work?.invitationId &&
      events.find(e => e.type === 'work' && e.invitationId === work.invitationId)?.equipmentId);
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
export function visibleUtterances(frame, selected, limit = 3) {
  const seen = new Set();
  return frame.events
    .filter(e => e.tick === frame.tick && utteranceKinds.has(e.type) && e.success === true && e.text)
    .sort((a, b) => Number(b.participants[0] === selected) - Number(a.participants[0] === selected))
    .filter(e => {
      const id = e.participants[0];
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .slice(0, Math.max(0, limit));
}
