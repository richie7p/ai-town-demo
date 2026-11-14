// V5 outcome measures, computed from the event log alone.
//
// Primary outcome Y: share of the 28 resident pairs that, during days 6–10,
// interacted on at least three days and where both residents initiated at
// least once (validated by the end of day 10). Persistent cores are triples
// whose three pairs each met on two or more days in both halves of the run.
import { pairKey, dayOf, TOTAL_TICKS, NEEDS } from './config.js';

const LATE_WINDOW = { from: 6, to: 10 };
const EARLY_WINDOW = { from: 1, to: 5 };
const QUALIFYING_DAYS = 3;
const SENSITIVITY_THRESHOLDS = [2, 3, 4];
/** A pair counts as a core edge within a window after this many interaction days. */
const CORE_EDGE_DAYS = 2;

const inWindow = (day, { from, to }) => day >= from && day <= to;

export function measure(state) {
  const ids = state.agents.map(a => a.id);
  const log = scanEvents(state.events);
  const dyads = ids.flatMap((a, i) =>
    ids.slice(i + 1).map(b => {
      const key = pairKey(a, b);
      const allDays = [...(log.interactionDays.get(key) ?? [])].sort((x, y) => x - y);
      const lateDays = allDays.filter(day => inWindow(day, LATE_WINDOW));
      const initiators = [...(log.lateInitiators.get(key) ?? [])];
      const bothInitiated = initiators.includes(a) && initiators.includes(b);
      return {
        key,
        a,
        b,
        allDays,
        lateDays,
        initiators,
        qualifies: lateDays.length >= QUALIFYING_DAYS && bothInitiated,
      };
    }),
  );
  const earlyCores = coreTriples(ids, dyads, EARLY_WINDOW);
  const lateCores = coreTriples(ids, dyads, LATE_WINDOW);
  const dueInvitations = state.invitations.filter(i => i.due <= state.tick);
  const completed = dueInvitations.filter(i => i.success).length;
  const qualified = dyads.filter(d => d.qualifies).length;
  const shareAtThreshold = days =>
    dyads.filter(d => d.lateDays.length >= days && d.initiators.includes(d.a) && d.initiators.includes(d.b))
      .length / dyads.length;

  return {
    final: state.tick === TOTAL_TICKS,
    sampleType: 'synthetic-engine-demo',
    denominator: dyads.length,
    qualifiedLinks: qualified,
    y: qualified / dyads.length,
    dyads,
    sensitivity: Object.fromEntries(SENSITIVITY_THRESHOLDS.map(days => [days, shareAtThreshold(days)])),
    interactionDays: dyads.reduce((sum, d) => sum + d.allDays.length, 0),
    earlyCores,
    lateCores,
    persistentCores: earlyCores.filter(core => lateCores.includes(core)),
    borrowAttempts: log.borrowAttempts,
    capacityFailures: log.capacityFailures,
    capacityFailureRate: log.borrowAttempts ? log.capacityFailures / log.borrowAttempts : null,
    invitations: state.invitations.length,
    observedInvitations: dueInvitations.length,
    completedCooperations: completed,
    cooperationRate: dueInvitations.length ? completed / dueInvitations.length : null,
    rightCensoredInvitations: state.invitations.filter(i => i.due > state.tick).length,
    resourceWaits: log.resourceWaits,
    invalidActions: log.invalidActions,
    // Daily life (descriptive only; not part of the V5 outcome measures).
    life: {
      ...log.life,
      averageNeeds: Object.fromEntries(
        Object.keys(NEEDS).map(need => [
          need,
          Math.round(state.agents.reduce((sum, a) => sum + a.needs[need], 0) / state.agents.length),
        ]),
      ),
    },
  };
}

/** One pass over the log, grouping evidence by pair. Sets keep first-seen order. */
function scanEvents(events) {
  const interactionDays = new Map();
  const lateInitiators = new Map();
  const counts = { borrowAttempts: 0, capacityFailures: 0, resourceWaits: 0, invalidActions: 0 };
  const life = {
    mealsCooked: 0,
    mealsEaten: 0,
    cafeMeals: 0,
    showers: 0,
    nightsSlept: 0,
    naps: 0,
    workouts: 0,
  };
  const diners = new Map(); // "tick|zone" → residents eating there together
  const setFor = (map, key) => {
    let set = map.get(key);
    if (!set) map.set(key, (set = new Set()));
    return set;
  };
  for (const event of events) {
    switch (event.type) {
      case 'interaction':
        setFor(interactionDays, event.pair).add(dayOf(event.tick));
        break;
      case 'initiation':
        if (inWindow(event.initiatedDay, LATE_WINDOW) && event.tick <= TOTAL_TICKS)
          setFor(lateInitiators, event.pair).add(event.participants[0]);
        break;
      case 'borrow_attempt':
        counts.borrowAttempts++;
        break;
      case 'capacity_failure':
        counts.capacityFailures++;
        break;
      case 'invalid':
        counts.invalidActions++;
        break;
      case 'cook':
        life.mealsCooked++;
        break;
      case 'eat': {
        life.mealsEaten++;
        if (!event.mealId) life.cafeMeals++;
        const table = `${event.tick}|${event.zone}`;
        diners.set(table, (diners.get(table) ?? 0) + 1);
        break;
      }
      case 'shower':
        life.showers++;
        break;
      case 'sleep':
        if (event.automatic) life.nightsSlept++;
        else life.naps++;
        break;
      case 'exercise':
        life.workouts++;
        break;
    }
    if (event.resourceWait) counts.resourceWaits++;
  }
  // A shared meal: two or more residents eating at the same table in the same slot.
  life.sharedMeals = [...diners.values()].filter(n => n >= 2).length;
  return { interactionDays, lateInitiators, ...counts, life };
}

/** All triples (as "A|B|C") whose three pairs are core edges within the window. */
function coreTriples(ids, dyads, window) {
  const edges = new Set(
    dyads
      .filter(d => d.allDays.filter(day => inWindow(day, window)).length >= CORE_EDGE_DAYS)
      .map(d => d.key),
  );
  const triples = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++)
      for (let k = j + 1; k < ids.length; k++) {
        const [a, b, c] = [ids[i], ids[j], ids[k]];
        if ([pairKey(a, b), pairKey(a, c), pairKey(b, c)].every(edge => edges.has(edge)))
          triples.push([a, b, c].join('|'));
      }
  return triples;
}
