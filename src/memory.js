import { dayOf, ZONES } from './config.js';

export function jaccard(a, b) {
  const left = new Set(a), right = new Set(b), union = new Set([...left, ...right]);
  return union.size ? [...left].filter(x => right.has(x)).length / union.size : 0;
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
  const visible = state.events.filter(x => x.visibleTo.includes(actorId));
  const recent = visible.filter(x => tick - x.tick <= 2).sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id));
  const older = visible.filter(x => tick - x.tick > 2).map(x => ({ ...x, score: 0.7 * jaccard(queryTags, x.tags) + 0.3 * 2 ** (-(tick - x.tick) / 12) }))
    .sort((a, b) => b.score - a.score || b.tick - a.tick || a.id.localeCompare(b.id)).slice(0, 6);
  const provided = [];
  let estimatedTokens = 0;
  for (const event of [...recent, ...older]) {
    const record = { id: event.id, tick: event.tick, day: dayOf(event.tick), kind: event.type, text: event.text, tags: event.tags, sourceKind: 'observed_event', score: event.score ?? null };
    const cost = Math.ceil(new TextEncoder().encode(JSON.stringify(record)).length / 3);
    if (estimatedTokens + cost > 900) continue;
    estimatedTokens += cost;
    provided.push(record);
  }
  return {
    tick, actor: { ...actor }, peers: peers.map(x => ({ ...x })),
    equipment: state.equipment.filter(x => x.zone === actor.zone).map(x => ({ ...x })),
    invitations: structuredClone(invitations), messages: structuredClone(messages),
    queryTags, provided, providedIds: provided.map(x => x.id), estimatedTokens,
    truncated: provided.length < recent.length + older.length,
    reflections: [], tokenMethod: 'UTF-8 bytes / 3 estimate; not model-token accounting',
  };
}
