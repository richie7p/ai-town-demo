// What a resident knows before deciding: its surroundings plus a bounded set of
// remembered events. The observation is built only from the start-of-tick
// state, so the action a resident later picks can never influence retrieval.
import { dayOf, ZONES } from './config.js';

/** Recent events (this many ticks or fewer) are always offered first. */
const RECENT_TICKS = 2;
/** At most this many older events are retrieved, ranked by relevance. */
const OLDER_LIMIT = 6;
/** Approximate token budget for the remembered events. */
const TOKEN_BUDGET = 900;
const TAG_WEIGHT = 0.7;
const RECENCY_WEIGHT = 0.3;
/** Recency halves every twelve ticks (one day). */
const RECENCY_HALF_LIFE = 12;

const encoder = new TextEncoder();
const recency = age => RECENCY_WEIGHT * 2 ** (-age / RECENCY_HALF_LIFE);
// Precomputed for every whole-tick age within a run; other ages fall back to the formula.
const RECENCY_BY_AGE = Array.from({ length: 121 }, (_, age) => recency(age));

/** Jaccard similarity of two tag lists. */
export function jaccard(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  const union = new Set([...left, ...right]);
  return union.size ? [...left].filter(x => right.has(x)).length / union.size : 0;
}

/** Same value as jaccard([...query], tags), against a query that is already a set. */
function tagSimilarity(query, tags) {
  let distinct = 0;
  let shared = 0;
  for (let i = 0; i < tags.length; i++) {
    if (tags.indexOf(tags[i]) !== i) continue;
    distinct++;
    if (query.has(tags[i])) shared++;
  }
  const union = query.size + distinct - shared;
  return union ? shared / union : 0;
}

/** Higher score first, then newer, then by id. */
const byRelevance = (a, b) =>
  b.score - a.score || b.event.tick - a.event.tick || a.event.id.localeCompare(b.event.id);
const byNewest = (a, b) => b.tick - a.tick || a.id.localeCompare(b.id);

/**
 * Everything one resident may use for its next proposal.
 * `provided` lists the remembered events; a proposal may only cite their ids.
 */
export function observe(state, actorId) {
  const actor = state.agents.find(agent => agent.id === actorId);
  if (!actor) throw new Error('Unknown actor');
  const tick = state.tick + 1;
  const peers = state.agents.filter(agent => agent.zone === actor.zone && agent.id !== actorId);
  const invitations = state.invitations.filter(
    i => [i.from, i.to].includes(actorId) && i.due >= tick && ['pending', 'accepted'].includes(i.status),
  );
  const openConversation = id => state.conversations.some(c => c.id === id && c.closedTick === null);
  const messages = state.messages.filter(
    m => m.to === actorId && !m.replied && tick - m.tick <= RECENT_TICKS && openConversation(m.conversationId),
  );
  const queryTags = [
    actor.zone,
    actor.goal,
    ZONES[actor.zone].resource,
    ...messages.map(m => m.from),
    ...invitations.flatMap(i => [i.from, i.to]),
  ].filter(Boolean);

  const { recent, older } = recallEvents(state.events, actorId, tick, new Set(queryTags));
  const candidates = [...recent.map(event => ({ event, score: event.score ?? null })), ...older];
  const provided = [];
  let estimatedTokens = 0;
  for (const { event, score } of candidates) {
    const record = {
      id: event.id,
      tick: event.tick,
      day: dayOf(event.tick),
      kind: event.type,
      text: event.text,
      tags: event.tags,
      sourceKind: 'observed_event',
      score,
    };
    // A record that does not fit is skipped; a smaller one later in the list may still fit.
    const cost = Math.ceil(encoder.encode(JSON.stringify(record)).length / 3);
    if (estimatedTokens + cost > TOKEN_BUDGET) continue;
    estimatedTokens += cost;
    provided.push(record);
  }

  return {
    tick,
    actor: { ...actor },
    peers: peers.map(peer => ({ ...peer })),
    equipment: state.equipment.filter(e => e.zone === actor.zone).map(e => ({ ...e })),
    invitations: structuredClone(invitations),
    messages: structuredClone(messages),
    queryTags,
    provided,
    providedIds: provided.map(record => record.id),
    estimatedTokens,
    truncated: provided.length < candidates.length,
    reflections: [],
    tokenMethod: 'UTF-8 bytes / 3 estimate; not model-token accounting',
  };
}

/**
 * One pass over the event log: recent visible events are kept whole (newest first),
 * older ones compete for the OLDER_LIMIT best relevance scores. This equals scoring
 * and fully sorting every visible event, without copying the whole log per resident.
 */
function recallEvents(events, actorId, tick, query) {
  const recent = [];
  const older = [];
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event.visibleTo.includes(actorId)) continue;
    const age = tick - event.tick;
    if (age <= RECENT_TICKS) {
      recent.push(event);
      continue;
    }
    if (!(age > RECENT_TICKS)) continue; // not a number
    const score = TAG_WEIGHT * tagSimilarity(query, event.tags) + (RECENCY_BY_AGE[age] ?? recency(age));
    if (older.length === OLDER_LIMIT && score < older[OLDER_LIMIT - 1].score) continue;
    const entry = { event, score };
    let position = older.length;
    while (position > 0 && byRelevance(entry, older[position - 1]) < 0) position--;
    if (position === OLDER_LIMIT) continue;
    older.splice(position, 0, entry);
    if (older.length > OLDER_LIMIT) older.pop();
  }
  recent.sort(byNewest);
  return { recent, older };
}
