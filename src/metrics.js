import { pairKey, dayOf, DAYS, TICKS_PER_DAY } from './config.js';

export function measure(state) {
  const ids = state.agents.map(a => a.id);
  const interactions = state.events.filter(e => e.type === 'interaction');
  const initiatives = state.events.filter(e => e.type === 'initiation');
  const dyads = ids.flatMap((a, i) => ids.slice(i + 1).map(b => {
    const key = pairKey(a, b);
    const allDays = [...new Set(interactions.filter(e => e.pair === key).map(e => dayOf(e.tick)))].sort((a, b) => a - b);
    const lateDays = allDays.filter(d => d >= 6 && d <= 10);
    const initiators = [...new Set(initiatives.filter(e => e.pair === key && e.initiatedDay >= 6 && e.initiatedDay <= 10 && e.tick <= 120).map(e => e.participants[0]))];
    return { key, a, b, allDays, lateDays, initiators, qualifies: lateDays.length >= 3 && initiators.includes(a) && initiators.includes(b) };
  }));
  const core = (from, to) => {
    const edges = new Set(dyads.filter(p => p.allDays.filter(d => d >= from && d <= to).length >= 2).map(p => p.key));
    const triples = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) for (let k = j + 1; k < ids.length; k++) {
      const [a, b, c] = [ids[i], ids[j], ids[k]];
      if ([pairKey(a, b), pairKey(a, c), pairKey(b, c)].every(e => edges.has(e))) triples.push([a, b, c].join('|'));
    }
    return triples;
  };
  const earlyCores = core(1, 5), lateCores = core(6, 10);
  const dueInvitations = state.invitations.filter(i => i.due <= state.tick);
  const completed = dueInvitations.filter(i => i.success).length;
  const attempts = state.events.filter(e => e.type === 'borrow_attempt').length;
  const capacityFailures = state.events.filter(e => e.type === 'capacity_failure').length;
  const count = dyads.filter(d => d.qualifies).length;
  return {
    final: state.tick === DAYS * TICKS_PER_DAY, sampleType: 'synthetic-engine-demo', denominator: dyads.length,
    qualifiedLinks: count, y: count / dyads.length, dyads,
    sensitivity: Object.fromEntries([2, 3, 4].map(n => [n, dyads.filter(d => d.lateDays.length >= n && d.initiators.includes(d.a) && d.initiators.includes(d.b)).length / dyads.length])),
    interactionDays: dyads.reduce((n, d) => n + d.allDays.length, 0),
    earlyCores, lateCores, persistentCores: earlyCores.filter(c => lateCores.includes(c)),
    borrowAttempts: attempts, capacityFailures, capacityFailureRate: attempts ? capacityFailures / attempts : null,
    invitations: state.invitations.length, observedInvitations: dueInvitations.length, completedCooperations: completed,
    cooperationRate: dueInvitations.length ? completed / dueInvitations.length : null,
    rightCensoredInvitations: state.invitations.filter(i => i.due > state.tick).length,
    resourceWaits: state.events.filter(e => e.resourceWait).length,
    invalidActions: state.events.filter(e => e.type === 'invalid').length,
  };
}
