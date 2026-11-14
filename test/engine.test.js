import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step, worldHash } from '../src/engine.js';
import { measure } from '../src/metrics.js';
import { observe, jaccard } from '../src/memory.js';
import { runWorld, propose, comparePair } from '../src/policy.js';
import { exportRun, replayRun } from '../src/replay.js';
import { pairKey, dayOf, hash } from '../src/config.js';

const p = (actor, action, more = {}) => ({ actor, action, ...more });
const world = () => {
  const s = createWorld();
  s.agents.forEach(a => {
    a.zone = 'workshop';
  });
  return s;
};
const borrow = actor => p(actor, 'borrow', { resourceType: 'tools' });
const invite = () => p('A01', 'invite', { target: 'A02', resourceType: 'tools' });
const answer = (s, from = 'A02', to = 'A01') => {
  const m = s.messages.findLast(m => m.from === to && m.to === from && !m.replied);
  return p(from, 'reply', { target: to, replyTo: m.id, conversationId: m.conversationId });
};

test('each tick is immutable, single-action, and rejects duplicate/unknown actors', () => {
  const s = world(),
    before = JSON.stringify(s);
  const n = step(s, [borrow('A01')]);
  assert.equal(JSON.stringify(s), before);
  assert.equal(n.trace[0].proposals.length, 8);
  assert.equal(n.tick, 1);
  assert.throws(() => step(s, [borrow('A01'), borrow('A01')]));
  assert.throws(() => step(s, [p('A09', 'wait')]));
});

test('resource arbitration does not depend on proposal arrival order', () => {
  const s = world(),
    requests = ['A01', 'A02', 'A03', 'A04'].map(borrow);
  const a = step(s, requests),
    b = step(s, [...requests].reverse());
  assert.equal(worldHash(a), worldHash(b));
  assert.deepEqual(a.events, b.events);
  assert.equal(a.equipment.filter(e => e.owner).length, 2);
  assert.equal(measure(a).borrowAttempts, 4);
  assert.equal(measure(a).capacityFailures, 2);
});

test('borrow at s is usable s+1 and s+2, then automatically returned', () => {
  let s = step(world(), [borrow('A01')]);
  assert.equal(s.equipment.find(e => e.owner === 'A01').usableFrom, 2);
  assert.equal(s.equipment.find(e => e.owner === 'A01').until, 3);
  s = step(s, [p('A01', 'work')]);
  s = step(s, [p('A01', 'work')]);
  assert.equal(s.events.filter(e => e.type === 'work' && e.success).length, 2);
  assert.equal(
    s.equipment.some(e => e.owner === 'A01'),
    false,
  );
  s = step(s, [p('A01', 'work')]);
  assert.ok(s.events.some(e => e.tick === 4 && e.type === 'invalid' && e.participants[0] === 'A01'));
});

test('held equipment prevents movement and additional borrowing, not capacity failure', () => {
  let s = step(world(), [borrow('A01')]);
  s = step(s, [p('A01', 'move', { destination: 'studio' })]);
  assert.equal(s.agents[0].zone, 'workshop');
  s = step(s, [borrow('A01')]);
  assert.equal(measure(s).borrowAttempts, 1);
  assert.equal(measure(s).capacityFailures, 0);
  assert.equal(measure(s).invalidActions, 2);
});

test('same-tick return cannot be reborrowed until next tick', () => {
  let s = step(world(), [borrow('A01'), borrow('A02')]);
  s = step(s, [p('A01', 'return'), borrow('A03')]);
  assert.equal(measure(s).capacityFailures, 1);
  assert.equal(
    s.equipment.some(e => e.owner === 'A03'),
    false,
  );
  s = step(s, [borrow('A03')]);
  assert.ok(s.equipment.some(e => e.owner === 'A03'));
});

test('cooperation needs invite, then accept/borrow, then matching work/join', () => {
  let s = step(world(), [invite()]);
  s = step(s, [borrow('A01'), p('A02', 'accept', { invitationId: 'i1' })]);
  assert.equal(measure(s).completedCooperations, 0);
  s = step(s, [p('A01', 'work', { invitationId: 'i1' }), p('A02', 'join', { invitationId: 'i1' })]);
  assert.equal(measure(s).completedCooperations, 1);
  assert.equal(measure(s).interactionDays, 1);
  assert.equal(s.equipment.find(e => e.owner === 'A01').until, 4);
  assert.equal(s.events.filter(e => e.type === 'initiation').length, 1);
});

test('acceptance without join permits solo work but never cooperation', () => {
  let s = step(world(), [invite()]);
  s = step(s, [borrow('A01'), p('A02', 'accept', { invitationId: 'i1' })]);
  s = step(s, [p('A01', 'work', { invitationId: 'i1' })]);
  assert.ok(s.events.some(e => e.type === 'work' && e.mode === 'solo'));
  assert.equal(measure(s).completedCooperations, 0);
  assert.equal(measure(s).cooperationRate, 0);
  assert.equal(measure(s).interactionDays, 0);
});

test('simultaneous talk merges, needs a later reply, and validates both initiators', () => {
  let s = step(world(), [p('A01', 'talk', { target: 'A02' }), p('A02', 'talk', { target: 'A01' })]);
  assert.equal(s.conversations.length, 1);
  assert.equal(measure(s).interactionDays, 0);
  s = step(s, [answer(s)]);
  assert.deepEqual(
    s.events
      .filter(e => e.type === 'initiation')
      .map(e => e.participants[0])
      .sort(),
    ['A01', 'A02'],
  );
  assert.equal(measure(s).interactionDays, 1);
});

test('same message may receive only one valid reply', () => {
  let s = step(world(), [p('A01', 'talk', { target: 'A02' })]);
  const reply = answer(s);
  s = step(s, [reply]);
  s = step(s, [reply]);
  assert.equal(s.events.filter(e => e.type === 'reply').length, 1);
  assert.ok(s.events.some(e => e.type === 'invalid' && e.tick === 3));
});

test('new events cannot be read or replied to in their creation tick', () => {
  const s = step(world(), [
    p('A01', 'talk', { target: 'A02' }),
    p('A02', 'reply', { target: 'A01', replyTo: 'e00001', conversationId: 'c1' }),
  ]);
  assert.equal(s.events.filter(e => e.type === 'reply').length, 0);
  assert.ok(Object.values(s.trace[0].observations).every(o => o.provided.length === 0));
});

test('reply at exactly two ticks is valid, but a third-tick reply is expired', () => {
  let s = step(world(), [p('A01', 'talk', { target: 'A02' })]);
  const reply = answer(s);
  const atDeadline = step(step(s), [reply]);
  assert.equal(atDeadline.events.filter(e => e.type === 'reply').length, 1);
  const expired = step(step(step(s)), [reply]);
  assert.equal(expired.events.filter(e => e.type === 'reply').length, 0);
  assert.ok(expired.events.some(e => e.type === 'invalid' && e.tick === 4));
});

test('nightfall sends everyone to their private bedroom, so a last-slot message cannot be answered next morning', () => {
  let s = world();
  s.tick = 11;
  s = step(s, [p('A01', 'talk', { target: 'A02' }), borrow('A03')]);
  assert.ok(s.agents.every(a => a.zone === 'bedroom'));
  assert.equal(s.events.filter(e => e.type === 'sleep' && e.automatic).length, 8);
  assert.ok(
    s.equipment.every(e => e.owner === null),
    'equipment goes back at night',
  );
  assert.ok(s.agents.every(a => a.needs.energy === 100));
  assert.equal(s.conversations[0].closedTick, 12);
  s = step(s, [answer(s)]);
  assert.equal(measure(s).interactionDays, 0);
  assert.ok(s.events.some(e => e.type === 'invalid' && e.participants[0] === 'A02'));
});
test('reply uses pre-move location then departure closes the conversation', () => {
  let s = step(world(), [p('A01', 'talk', { target: 'A02' })]);
  s = step(s, [answer(s), p('A01', 'move', { destination: 'living' })]);
  assert.equal(measure(s).interactionDays, 1);
  assert.equal(s.conversations[0].closedTick, 2);
});

test('conversation closes after two empty ticks; reopening requires an empty tick', () => {
  let s = step(world(), [p('A01', 'talk', { target: 'A02' })]);
  s = step(step(s));
  assert.equal(s.conversations[0].closedTick, 3);
  s = step(s, [p('A02', 'talk', { target: 'A01' })]);
  assert.equal(s.conversations.length, 2);
  const blocked = world();
  blocked.lastPairTick['A01|A02'] = 0;
  assert.equal(step(blocked, [p('A01', 'talk', { target: 'A02' })]).conversations.length, 0);
});

test('roles cannot see unseen events or cite memories absent from their prompt', () => {
  let s = world();
  s.agents[7].zone = 'living';
  s = step(s, [p('A01', 'talk', { target: 'A02', text: '工坊的訊息' })]);
  assert.equal(
    observe(s, 'A08').provided.some(e => e.text === '工坊的訊息'),
    false,
  );
  s = step(s, [p('A08', 'wait', { citedMemoryIds: ['not-provided'] })]);
  assert.ok(s.events.some(e => e.type === 'invalid' && e.participants[0] === 'A08'));
  assert.equal(jaccard([], []), 0);
  assert.equal(jaccard(['a', 'b'], ['b', 'c']), 1 / 3);
});

function syntheticMetricWorld() {
  const s = createWorld();
  s.tick = 120;
  return s;
}
function contact(s, a, b, day) {
  s.events.push({ type: 'interaction', pair: pairKey(a, b), tick: (day - 1) * 12 + 2, participants: [a, b] });
}
function initiated(s, a, b, day) {
  s.events.push({
    type: 'initiation',
    pair: pairKey(a, b),
    tick: (day - 1) * 12 + 2,
    initiatedDay: day,
    participants: [a, b],
  });
}

test('Y uses 28 dyads, three distinct late days, and both validated late initiators', () => {
  const s = syntheticMetricWorld();
  for (const day of [6, 6, 8, 10]) contact(s, 'A01', 'A02', day);
  initiated(s, 'A01', 'A02', 6);
  assert.equal(measure(s).y, 0);
  initiated(s, 'A02', 'A01', 5);
  assert.equal(measure(s).y, 0);
  initiated(s, 'A02', 'A01', 8);
  assert.equal(measure(s).y, 1 / 28);
  assert.equal(measure(s).interactionDays, 3);
  assert.equal(measure(s).sensitivity[4], 0);
});

test('fixed ABC core survives expansion to ABCD without treating overlap as samples', () => {
  const s = syntheticMetricWorld();
  for (const day of [1, 2])
    for (const [a, b] of [
      ['A01', 'A02'],
      ['A01', 'A03'],
      ['A02', 'A03'],
    ])
      contact(s, a, b, day);
  const ids = ['A01', 'A02', 'A03', 'A04'];
  for (const day of [6, 7])
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) contact(s, ids[i], ids[j], day);
  const m = measure(s);
  assert.deepEqual(m.persistentCores, ['A01|A02|A03']);
  assert.equal(m.lateCores.length, 4);
  assert.equal(m.y, 0);
});

test('pending invitations at the horizon are censored, expired failures are observed, zero denominator is null', () => {
  let s = world();
  s.tick = 118;
  s = step(s, [invite()]);
  s = step(s);
  assert.equal(measure(s).rightCensoredInvitations, 1);
  assert.equal(measure(s).cooperationRate, null);
  let expired = step(world(), [invite()]);
  expired = step(step(expired));
  assert.equal(measure(expired).observedInvitations, 1);
  assert.equal(measure(expired).rightCensoredInvitations, 0);
  assert.equal(measure(expired).cooperationRate, 0);
});

test('full 10-day replay is identical, does not run policy, and rejects altered trace/event data', () => {
  const s = runWorld({ seed: 42, capacity: 2 });
  const exported = exportRun(s),
    restored = replayRun(JSON.parse(JSON.stringify(exported)));
  assert.equal(worldHash(s), worldHash(restored));
  assert.deepEqual(measure(s), measure(restored));
  const bad = structuredClone(exported);
  bad.events[0].text = 'tampered';
  assert.throws(() => replayRun(bad), /事件紀錄/);
  const badTrace = structuredClone(exported);
  badTrace.decisionTrace[0].observations.A01.providedIds.push('fabricated');
  assert.throws(() => replayRun(badTrace), /記憶紀錄/);
  const badHash = structuredClone(exported);
  badHash.frames[0].afterHash = 'broken';
  assert.throws(() => replayRun(badHash), /校驗/);
});

test('seeded A/B worlds share initial personas/positions and remain isolated', () => {
  const a = createWorld({ seed: 73, capacity: 8 }),
    b = createWorld({ seed: 73, capacity: 2 });
  assert.deepEqual(a.agents, b.agents);
  const n = step(a, propose(a));
  assert.equal(b.events.length, 0);
  assert.notEqual(n.events, b.events);
  assert.equal(comparePair(73).a.final, true);
});

test('multiple seeded runs preserve one-item-per-person and visible, earlier memories', () => {
  for (const seed of [0, 1, 17, 20261103])
    for (const capacity of [2, 3, 8]) {
      const s = runWorld({ seed, capacity }, frame => {
        const owners = frame.equipment.filter(e => e.owner).map(e => e.owner);
        assert.equal(new Set(owners).size, owners.length);
        for (const e of frame.equipment.filter(e => e.owner))
          assert.equal(frame.agents.find(a => a.id === e.owner).zone, e.zone);
      });
      assert.equal(s.tick, 120);
      const sources = new Map(s.events.map(e => [e.id, e]));
      for (const t of s.trace)
        for (const [id, o] of Object.entries(t.observations)) {
          assert.ok(o.provided.every(e => e.tick < t.tick && sources.get(e.id).visibleTo.includes(id)));
          assert.ok(o.provided.filter(e => t.tick - e.tick > 2).length <= 6);
        }
      assert.ok(measure(s).y >= 0 && measure(s).y <= 1);
    }
});

test('single-pass memory retrieval matches the full filter, score and sort it replaced', () => {
  const reference = (state, id) => {
    const o = observe(state, id),
      tick = state.tick + 1;
    const visible = state.events.filter(e => e.visibleTo.includes(id));
    const recent = visible
      .filter(e => tick - e.tick <= 2)
      .sort((a, b) => b.tick - a.tick || a.id.localeCompare(b.id));
    const older = visible
      .filter(e => tick - e.tick > 2)
      .map(e => ({ ...e, score: 0.7 * jaccard(o.queryTags, e.tags) + 0.3 * 2 ** (-(tick - e.tick) / 12) }))
      .sort((a, b) => b.score - a.score || b.tick - a.tick || a.id.localeCompare(b.id))
      .slice(0, 6);
    let tokens = 0;
    const provided = [...recent, ...older]
      .map(e => ({
        id: e.id,
        tick: e.tick,
        day: dayOf(e.tick),
        kind: e.type,
        text: e.text,
        tags: e.tags,
        sourceKind: 'observed_event',
        score: e.score ?? null,
      }))
      .filter(record => {
        const cost = Math.ceil(new TextEncoder().encode(JSON.stringify(record)).length / 3);
        if (tokens + cost > 900) return false;
        tokens += cost;
        return true;
      });
    return { provided, estimatedTokens: tokens, truncated: provided.length < recent.length + older.length };
  };
  let compared = 0,
    truncated = 0;
  runWorld({ seed: 4242, capacity: 2 }, state => {
    if (state.tick % 7 && state.tick < 118) return;
    for (const { id } of state.agents) {
      const o = observe(state, id),
        expected = reference(state, id);
      assert.deepEqual(o.provided, expected.provided);
      assert.equal(o.estimatedTokens, expected.estimatedTokens);
      assert.equal(o.truncated, expected.truncated);
      assert.deepEqual(
        o.providedIds,
        expected.provided.map(m => m.id),
      );
      compared++;
      truncated += o.truncated;
    }
  });
  assert.ok(
    compared >= 144 && truncated > 0,
    'the comparison must include observations that hit the capacity limit',
  );
});

test('checksum walks code points exactly like string iteration, including unpaired surrogates', () => {
  const reference = text => {
    let h = 2166136261;
    for (const c of text) {
      h ^= c.codePointAt(0);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  };
  for (const text of [
    '',
    'A01',
    '小鎮生活',
    '相機📷與工具🛠️',
    '\ud83d',
    '\ude00\ud83d',
    'a\ud83dz',
    '\ud800𐀀',
    '􏿿',
  ])
    assert.equal(hash(text), reference(text), JSON.stringify(text));
  assert.equal(hash({ a: '居民', b: [1, 2] }), reference(JSON.stringify({ a: '居民', b: [1, 2] })));
});
