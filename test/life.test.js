import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/engine.js';
import { observe } from '../src/memory.js';
import { measure } from '../src/metrics.js';
import { runWorld } from '../src/policy.js';
import { exportRun, replayRun } from '../src/replay.js';
import { NEEDS, ZONES, weatherOf, dayOf, TICKS_PER_DAY } from '../src/config.js';

const p = (actor, action, more = {}) => ({ actor, action, ...more });
const at = zone => {
  const s = createWorld();
  s.agents.forEach(a => {
    a.zone = zone;
  });
  return s;
};

test('everyone starts in their own bedroom with seeded, bounded needs', () => {
  const s = createWorld({ seed: 7 });
  assert.ok(s.agents.every(a => a.zone === 'bedroom'));
  assert.deepEqual(
    s.agents.map(a => a.bedroom),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  for (const a of s.agents)
    for (const need of Object.keys(NEEDS)) assert.ok(a.needs[need] >= 0 && a.needs[need] <= 100, need);
  assert.deepEqual(createWorld({ seed: 7 }).agents, s.agents);
});

test('a cooked pot feeds three people from the next slot, and the cook eats while cooking', () => {
  let s = at('kitchen');
  const hungry = s.agents.find(a => a.id === 'A01').needs.fullness;
  s = step(s, [p('A01', 'cook'), p('A02', 'eat')]);
  assert.ok(
    s.events.some(e => e.type === 'invalid' && e.participants[0] === 'A02'),
    'nothing to eat in the same slot',
  );
  assert.equal(s.meals.length, 1);
  assert.ok(s.agents.find(a => a.id === 'A01').needs.fullness > hungry);

  s = step(
    s,
    ['A02', 'A03', 'A04', 'A05'].map(id => p(id, 'eat')),
  );
  const eaten = s.events.filter(e => e.tick === 2 && e.type === 'eat');
  assert.equal(eaten.length, 3, 'three servings');
  assert.equal(s.meals[0].servings, 0);
  assert.ok(
    eaten.every(e => e.participants.includes('A01')),
    'the cook takes part in a shared meal',
  );
  assert.match(eaten[0].text, /煮的飯/);
});

test('the café always serves a meal; eating elsewhere fails', () => {
  let s = at('plaza');
  s.agents[1].zone = 'park';
  s = step(s, [p('A01', 'eat'), p('A02', 'eat')]);
  assert.ok(s.events.some(e => e.type === 'eat' && e.participants[0] === 'A01' && e.mealId === null));
  assert.ok(s.events.some(e => e.type === 'invalid' && e.participants[0] === 'A02'));
});

test('the bathroom has three showers; the fourth resident in priority order waits', () => {
  let s = at('bathroom');
  s = step(
    s,
    ['A01', 'A02', 'A03', 'A04'].map(id => p(id, 'shower')),
  );
  assert.equal(s.events.filter(e => e.type === 'shower').length, ZONES.bathroom.showers);
  assert.equal(s.events.filter(e => e.type === 'invalid' && /淋浴間/.test(e.reason)).length, 1);
  const clean = s.agents.filter(a => a.needs.hygiene >= 75);
  assert.ok(clean.length >= 3);
});

test('bedrooms are private: no conversations there and nobody else sees what happens', () => {
  let s = at('bedroom');
  s = step(s, [p('A01', 'talk', { target: 'A02' }), p('A03', 'rest', { text: '在房間裡寫日記。' })]);
  assert.ok(s.events.some(e => e.type === 'invalid' && e.participants[0] === 'A01'));
  const diary = s.events.find(e => e.type === 'rest' && e.participants[0] === 'A03');
  assert.deepEqual(diary.visibleTo, ['A03']);
  assert.deepEqual(observe(s, 'A04').peers, []);
  assert.equal(
    observe(s, 'A04').provided.some(m => m.id === diary.id),
    false,
  );
});

test('naps happen only in bedrooms, exercise only in the gym, cooking only in the kitchen', () => {
  let s = at('living');
  s = step(s, [p('A01', 'sleep'), p('A02', 'exercise'), p('A03', 'cook')]);
  assert.equal(s.events.filter(e => e.type === 'invalid').length, 3);
  s = at('gym');
  s = step(s, [p('A01', 'exercise')]);
  assert.ok(s.events.some(e => e.type === 'exercise'));
});

test('needs fall every slot, stay within 0–100, and exhaustion stops strenuous actions', () => {
  let s = at('gym');
  s.agents.forEach(a => {
    a.needs = { fullness: 3, energy: 50, hygiene: 1 };
  });
  s = step(s, [p('A01', 'exercise'), p('A02', 'rest')]);
  assert.ok(s.events.some(e => e.type === 'invalid' && /太餓/.test(e.reason)));
  for (const a of s.agents) for (const v of Object.values(a.needs)) assert.ok(v >= 0 && v <= 100);
  const rested = s.agents.find(a => a.id === 'A02');
  assert.equal(rested.needs.energy, 50 - NEEDS.energy.decay + 12);
});

test('weather is fixed per seed and day, and observations carry the clock and weather', () => {
  assert.equal(weatherOf(20261103, 3), weatherOf(20261103, 3));
  const s = createWorld();
  const o = observe(s, 'A01');
  assert.equal(o.time, '07:00');
  assert.equal(o.weather, weatherOf(s.config.seed, 1));
});

test('a replay saved by the previous engine is refused with an explanation', () => {
  const data = exportRun(createWorld());
  assert.throws(() => replayRun({ ...data, engineVersion: 'demo-0.1.0' }), /demo-0\.1\.0.*無法重播/);
});

test('over ten days every resident sleeps every night, eats every day and keeps up with washing', () => {
  const state = runWorld({ seed: 20261103, capacity: 2 });
  const m = measure(state);
  assert.equal(m.life.nightsSlept, 80);
  for (const agent of state.agents)
    for (let day = 1; day <= 10; day++) {
      const ate = state.events.some(
        e => e.day === day && e.participants[0] === agent.id && (e.type === 'eat' || e.type === 'cook'),
      );
      assert.ok(ate, `${agent.name} did not eat on day ${day}`);
    }
  assert.ok(m.life.showers >= 30, 'residents wash regularly');
  assert.ok(m.life.mealsCooked > 0 && m.life.sharedMeals > 0);
  // Every night ends with everyone asleep in their own room.
  for (const t of [12, 60, 120]) {
    const night = state.events.filter(e => e.tick === t && e.type === 'sleep' && e.automatic);
    assert.equal(night.length, 8);
  }
  assert.equal(dayOf(TICKS_PER_DAY * 3), 3);
});
