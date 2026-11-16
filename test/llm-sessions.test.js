import test from 'node:test';
import assert from 'node:assert/strict';
import { TownSessions } from '../server/llm-sessions.mjs';
import { exportRun, replayRun } from '../src/replay.js';

// Stub decision function: no network, no key, no real model.
const proposal = (actor, extra = {}) => ({ actor, action: 'wait', target: null, destination: null, resourceType: null, replyTo: null, conversationId: null, invitationId: null, text: '先在這裡待一下。', reason: '想觀察周圍。', citedMemoryIds: [], ...extra });
const answer = observation => ({ proposal: proposal(observation.actor.id), responseId: `r-${observation.actor.id}`, requestId: null, model: 'stub', elapsedMs: 1, usage: { inputTokens: 10, outputTokens: 2, cachedInputTokens: 0 } });
const make = (decide, options = {}) => new TownSessions({ decide, model: 'stub', configured: true, callLimit: 64, outputDir: null, ...options });

test('each resident gets an independent request built from the same pre-step snapshot', async () => {
  const seen = [];
  const sessions = make(async observation => { seen.push(observation); return answer(observation); });
  const { runtime } = sessions.create({ seed: 7, capacity: 2, maxSteps: 6 });
  const before = sessions.get(runtime.runId).state;
  const snapshot = await sessions.advance(runtime.runId, 0);
  assert.equal(seen.length, 8);
  assert.deepEqual(seen.map(o => o.actor.id).sort(), before.agents.map(a => a.id).sort());
  for (const observation of seen) {
    assert.equal(observation.tick, 1);
    // Another resident's proposal or private view never enters this resident's request.
    assert.ok(!('proposals' in observation) && !('proposal' in observation));
    assert.ok(observation.peers.every(p => p.zone === observation.actor.zone && p.id !== observation.actor.id));
  }
  assert.equal(snapshot.state.tick, 1);
  assert.equal(snapshot.runtime.usage.calls, 8);
  assert.equal(snapshot.runtime.pending, null);
});

test('a failed resident is never filled by a rule action; retry resends only the missing resident', async () => {
  let failOnce = true; const calls = [];
  const sessions = make(async observation => {
    calls.push(observation.actor.id);
    if (observation.actor.id === 'A03' && failOnce) { failOnce = false; throw Object.assign(new Error('模型服務暫時無法完成決策'), { code: 'api_500' }); }
    return answer(observation);
  });
  const { runtime } = sessions.create({ seed: 7, capacity: 2, maxSteps: 6 });
  await assert.rejects(sessions.advance(runtime.runId, 0), error => error.code === 'round_failed');
  const partial = sessions.snapshot(sessions.get(runtime.runId));
  assert.equal(partial.state.tick, 0, 'the world must not advance with a missing proposal');
  assert.equal(partial.state.trace.length, 0);
  assert.equal(partial.runtime.pending.completed, 7);
  assert.deepEqual(partial.runtime.pending.failedActors, ['A03']);
  assert.equal(partial.runtime.usage.failedCalls, 1);
  const retried = await sessions.advance(runtime.runId, 0);
  assert.deepEqual(calls.slice(8), ['A03']);
  assert.equal(retried.state.tick, 1);
  assert.equal(retried.state.trace[0].proposals.length, 8);
  assert.equal(retried.runtime.usage.calls, 9);
  // A lost HTTP reply is recoverable without a second charge.
  assert.equal((await sessions.advance(runtime.runId, 0)).state.tick, 1);
  assert.equal(calls.length, 9);
});

test('call limits are checked before sending a batch, and unconfigured services refuse sessions', async () => {
  let calls = 0;
  const sessions = make(async observation => { calls++; return answer(observation); }, { callLimit: 8 });
  const { runtime } = sessions.create({ seed: 1, capacity: 2, maxSteps: 6 });
  await sessions.advance(runtime.runId, 0);
  await assert.rejects(sessions.advance(runtime.runId, 1), error => error.code === 'call_limit');
  assert.equal(calls, 8);
  assert.throws(() => sessions.create({ seed: 1, capacity: 2, maxSteps: 7 }), error => error.code === 'invalid_limit');
  assert.throws(() => make(async () => {}, { configured: false }).create({ seed: 1, capacity: 2 }), error => error.code === 'not_configured');
});

test('an LLM export with audit replays read-only, and tampered audit is rejected', async () => {
  const sessions = make(async observation => answer(observation));
  const { runtime } = sessions.create({ seed: 11, capacity: 3, maxSteps: 6 });
  await sessions.advance(runtime.runId, 0);
  const snapshot = await sessions.advance(runtime.runId, 1);
  const file = JSON.parse(JSON.stringify(exportRun(snapshot.state, snapshot.runtime)));
  assert.equal(file.sampleType, 'llm-engineering-pilot');
  assert.equal(replayRun(file).tick, 2);
  const missing = structuredClone(file); missing.audit.records = missing.audit.records.filter(r => !(r.tick === 2 && r.actor === 'A05'));
  assert.throws(() => replayRun(missing), /八位居民/);
  const changed = structuredClone(file); changed.audit.records.find(r => r.tick === 1).proposal.text = '被改動的行動';
  assert.throws(() => replayRun(changed), /行動與結算/);
  const noAudit = structuredClone(file); delete noAudit.audit;
  assert.throws(() => replayRun(noAudit), /請求紀錄/);
});
