import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/engine.js';
import { propose, runWorld } from '../src/policy.js';
import { dayOf } from '../src/config.js';
import { exportRun, replayRun } from '../src/replay.js';

test('demo decisions are reproducible without mutating the observed world', () => {
  let state = createWorld({ seed: 24, capacity: 2 });
  for (let i = 0; i < 16; i++) state = step(state, propose(state));
  const before = JSON.stringify(state);
  assert.deepEqual(propose(state), propose(structuredClone(state)));
  assert.equal(JSON.stringify(state), before);
  assert.equal(new Set(propose(state).map(p => p.actor)).size, 8);
});

test("private events unavailable to a role cannot change that role's decision", () => {
  const state = createWorld({ seed: 18 });
  state.agents.forEach(a => {
    a.zone = a.id === 'A08' ? 'studio' : 'home';
  });
  state.tick = 2;
  const secretWorld = structuredClone(state);
  secretWorld.events.push({
    id: 'hidden-memory',
    tick: 1,
    day: 1,
    type: 'talk',
    participants: ['A08'],
    zone: 'studio',
    text: '不可提供給其他角色的內容',
    tags: ['A08', 'studio', 'talk'],
    visibleTo: ['A08'],
  });
  for (const actor of state.agents.filter(a => a.id !== 'A08')) {
    assert.deepEqual(
      propose(secretWorld).find(p => p.actor === actor.id),
      propose(state).find(p => p.actor === actor.id),
    );
  }
});

test('a full demo shows daily movement and varied activities with auditable memory references', () => {
  const state = runWorld({ seed: 20261103, capacity: 2 });
  const proposals = state.trace.flatMap(t => t.proposals);
  const actions = new Set(proposals.map(p => p.action));
  for (const action of [
    'move',
    'talk',
    'reply',
    'invite',
    'accept',
    'decline',
    'borrow',
    'work',
    'join',
    'rest',
    'walk',
  ])
    assert.ok(actions.has(action), action);
  for (const destination of ['home', 'plaza', 'workshop', 'studio'])
    assert.ok(
      proposals.some(p => p.destination === destination),
      destination,
    );
  assert.ok(new Set(proposals.filter(p => ['talk', 'reply'].includes(p.action)).map(p => p.text)).size > 15);

  let referenced = 0,
    crossDay = 0;
  const events = new Map(state.events.map(event => [event.id, event]));
  for (const trace of state.trace)
    for (const proposal of trace.proposals) {
      const observation = trace.observations[proposal.actor];
      for (const id of proposal.citedMemoryIds) {
        referenced++;
        const source = observation.provided.find(memory => memory.id === id);
        assert.ok(source, 'every reference must be actually provided at decision time');
        assert.ok(events.get(id).visibleTo.includes(proposal.actor));
        assert.ok(source.tick < trace.tick);
        assert.ok(source.tags.includes(proposal.actor));
        if (proposal.target) assert.ok(source.tags.includes(proposal.target));
        if (source.day < dayOf(trace.tick)) crossDay++;
      }
    }
  assert.ok(referenced > 0);
  assert.ok(crossDay > 0);
  assert.ok(!state.events.some(e => e.type === 'invalid' && e.reason === '引用未實際提供的記憶'));

  const data = exportRun(state);
  assert.equal(data.config.policy, 'rules-demo-v1');
  assert.equal(data.sampleType, 'synthetic-engine-demo');
  // Saved proposals, including prose and citations, remain the replay authority.
  assert.deepEqual(replayRun(data).events, state.events);
});
