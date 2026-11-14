import { dayOf, ZONES } from './config.js';

export function jaccard(a, b) {
  const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
  return union.size ? [...left].filter(x => right.has(x)).length / union.size : 0;
}

const OLDER_LIMIT = 6;
const encoder = new TextEncoder();
// Recency term for every whole-tick age in a ten-day run; other ages are computed on demand.
const RECENCY = Array.from({ length: 121 }, (_, age) => 0.3 * 2 ** (-age / 12));
const ranked = (a, b) => b.score - a.score || b.event.tick - a.event.tick || a.event.id.localeCompare(b.event.id);
// Jaccard similarity against a prepared query set; same value as jaccard(queryTags, tags).
function overlap(query, tags) {
  let size = 0, shared = 0;
  for (let i = 0; i < tags.length; i++) {
    if (tags.indexOf(tags[i]) !== i) continue;
    size++;
    if (query.has(tags[i])) shared++;
  }
  const union = query.size + size - shared;
  return union ? shared / union : 0;
}

export function observe(state, actorId) {
  const actor = state.agents.find(x => x.id === actorId);
  if (!actor) throw new Error('Unknown actor');
  const tick = state.tick + 1;
  const peers = state.agents.filter(x => x.zone === actor.zone && x.id !== actorId);
  const invitations = state.invitations.filter(x => [x.from, x.to].includes(actorId) && x.due >= tick && ['pending', 'accepted'].includes(x.status));
  const messages = state.messages.filter(x => x.to === actorId && !x.replied && tick - x.tick <= 2 && state.conversations.some(c => c.id === x.conversationId && c.closedTick === null));
  // Query is fixed from pre-action state; no selected action/target can leak back into retrieval.
  const queryTags = [actor.zone, actor.goal, ZONES[actor.zone].resource, ...messages.map(x => x.from), ...invitations.flatMap(x => [x.from, x.to])].filter(Boolean);
  // One pass over the log: recent events are kept whole, older ones compete for
  // the six best scores. Equivalent to filtering, scoring and fully sorting the
  // visible log, without allocating a scored copy of every remembered event.
  const query = new Set(queryTags), recent = [], older = [];
  const events = state.events;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.visibleTo.includes(actorId)) continue;
    const age = tick - event.tick;
    if (age <= 2) { recent.push(event); continue; }
    if (!(age > 2)) continue;
    const score = 0.7 * overlap(query, event.tags) + (RECENCY[age] ?? 0.3 * 2 ** (-age / 12));
    if (older.length === OLDER_LIMIT && score < older[OLDER_LIMIT - 1].score) continue;
    const entry = { event, score };
    let at = older.length;
    while (at > 0 && ranked(entry, older[at - 1]) < 0) at--;
    if (at === OLDER_LIMIT) continue;
    older.splice(at, 0, entry);
    if (older.length > OLDER_LIMIT) older.pop();
  }
  recent.sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id));
  const candidates = [...recent.map(event => ({ event, score: event.score ?? null })), ...older];
  const provided = [];
  let estimatedTokens = 0;
  for (const { event, score } of candidates) {
    const record = { id: event.id, tick: event.tick, day: dayOf(event.tick), kind: event.type, text: event.text, tags: event.tags, sourceKind: 'observed_event', score };
    const cost = Math.ceil(encoder.encode(JSON.stringify(record)).length / 3);
    if (estimatedTokens + cost > 900) continue;
    estimatedTokens += cost;
    provided.push(record);
  }
  return {
    tick, actor: { ...actor }, peers: peers.map(x => ({ ...x })),
    equipment: state.equipment.filter(x => x.zone === actor.zone).map(x => ({ ...x })),
    invitations: structuredClone(invitations), messages: structuredClone(messages),
    queryTags, provided, providedIds: provided.map(x => x.id), estimatedTokens,
    truncated: provided.length < candidates.length,
    reflections: [], tokenMethod: 'UTF-8 bytes / 3 estimate; not model-token accounting',
  };
}
