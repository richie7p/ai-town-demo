import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createWorld, step, worldHash } from '../src/engine.js';
import { observe } from '../src/memory.js';
import { hash } from '../src/config.js';
import { exportRun } from '../src/replay.js';
import { PROMPT_VERSION, PROMPT_HASH, DEFAULT_MODEL } from './llm-policy.mjs';

export class SessionError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
export class TownSessions {
  constructor({ decide, model = DEFAULT_MODEL, configured = true, callLimit = 1024, outputDir = null, maxRuns = 16 } = {}) {
    Object.assign(this, { decide, model, configured, callLimit, outputDir, maxRuns });
    this.runs = new Map(); this.calls = 0; this.active = 0;
  }
  status() { return { configured: this.configured, model: this.model, promptVersion: PROMPT_VERSION, callLimit: this.callLimit, calls: this.calls, remainingCalls: this.callLimit - this.calls }; }
  create({ seed, capacity, maxSteps = 12 } = {}) {
    if (!this.configured) throw new SessionError('not_configured', '尚未設定本機 API 金鑰，請先完成設定或使用離線模式。', 503);
    if (![6, 12, 24, 120].includes(maxSteps)) throw new SessionError('invalid_limit', '本場上限請選 6、12、24 或 120 時段。', 400);
    if (this.runs.size >= this.maxRuns) throw new SessionError('run_limit', '本次啟動已建立足夠多場次，請保存紀錄後重新啟動服務。');
    const state = createWorld({ seed, capacity, policy: 'llm-responses-v1' });
    const id = randomUUID();
    const run = { id, state, maxSteps, records: [], createdAt: new Date().toISOString(), pending: null, inFlight: null, attemptRound: 0, saveError: null };
    this.runs.set(id, run); return this.snapshot(run);
  }
  get(id) { const run = this.runs.get(id); if (!run) throw new SessionError('run_not_found', '找不到這個本機場次。先前紀錄仍可從保存的回放檔載入。', 404); return run; }
  runtime(run) {
    const usage = run.records.reduce((u, r) => ({ calls: u.calls + 1, inputTokens: u.inputTokens + (r.usage?.inputTokens || 0), outputTokens: u.outputTokens + (r.usage?.outputTokens || 0), cachedInputTokens: u.cachedInputTokens + (r.usage?.cachedInputTokens || 0), failedCalls: u.failedCalls + Number(r.status !== 'ok') }), { calls: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, failedCalls: 0 });
    return { format: 'ai-town-llm-audit-v1', runId: run.id, model: this.model, promptVersion: PROMPT_VERSION, promptHash: PROMPT_HASH, createdAt: run.createdAt, maxSteps: run.maxSteps, usage,
      records: run.records, serverRemainingCalls: this.callLimit - this.calls, saveError: run.saveError,
      pending: run.pending ? { tick: run.pending.tick, completed: run.pending.results.size, total: 8, failedActors: run.pending.failedActors } : null };
  }
  snapshot(run) { return structuredClone({ state: run.state, runtime: this.runtime(run) }); }
  progress(id) { const run = this.get(id); const runtime = this.runtime(run); const { records, ...summary } = runtime; return { tick: run.state.tick, runtime: summary }; }
  async advance(id, expectedTick) {
    const run = this.get(id);
    if (!Number.isInteger(expectedTick) || expectedTick < 0) throw new SessionError('invalid_tick', '請求的時段不正確。', 400);
    // A lost HTTP reply can be fetched again without charging the same round twice.
    if (run.state.tick === expectedTick + 1) return this.snapshot(run);
    if (run.state.tick !== expectedTick) throw new SessionError('stale_tick', '畫面進度與本機場次不同，請重新載入場次。');
    if (run.inFlight) return run.inFlight;
    if (run.state.tick >= run.maxSteps) throw new SessionError('session_limit', `已到本場 ${run.maxSteps} 時段上限。可匯出紀錄，或在設定建立較長場次。`);
    if (this.active) throw new SessionError('another_run_busy', '另一場小鎮正在等待模型，請稍後再試。');
    if (!run.pending) run.pending = { tick: expectedTick + 1, beforeHash: worldHash(run.state), observations: run.state.agents.map(a => observe(run.state, a.id)), results: new Map(), failedActors: [] };
    const missing = run.pending.observations.filter(o => !run.pending.results.has(o.actor.id));
    if (this.calls + missing.length > this.callLimit) throw new SessionError('call_limit', '本次服務啟動的 API 請求上限已到，生活已暫停。請保存紀錄。');
    // Reserve the whole batch before sending any request. There is no hidden retry.
    this.calls += missing.length; this.active++; run.attemptRound++;
    run.inFlight = this.completeRound(run, missing).finally(() => { run.inFlight = null; this.active--; });
    return run.inFlight;
  }
  async completeRound(run, missing) {
    const pending = run.pending; pending.failedActors = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < missing.length) {
        const observation = missing[cursor++]; const actor = observation.actor.id;
        const record = { tick: pending.tick, actor, attempt: run.records.filter(r => r.tick === pending.tick && r.actor === actor).length + 1,
          observationHash: hash(observation), promptHash: PROMPT_HASH, startedAt: new Date().toISOString() };
        try {
          const result = await this.decide(structuredClone(observation));
          if (result.proposal.actor !== actor) throw new Error('Actor mismatch');
          Object.assign(record, result, { status: 'ok' }); pending.results.set(actor, record);
        } catch (error) {
          Object.assign(record, error.metadata || {}, { status: 'error', errorCode: error.code || 'decision_error', message: error.code ? error.message : '居民決策未完成，請重試本時段。' });
          pending.failedActors.push(actor);
        }
        run.records.push(record);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, missing.length) }, worker));
    if (worldHash(run.state) !== pending.beforeHash) throw new SessionError('snapshot_changed', '世界快照已變動，這一時段沒有結算。');
    if (pending.results.size === 8) {
      run.state = step(run.state, run.state.agents.map(a => pending.results.get(a.id).proposal)); run.pending = null;
    }
    await this.save(run);
    if (run.pending) {
      const failed = run.records.filter(r => r.tick === pending.tick && r.status === 'error').at(-1);
      throw new SessionError('round_failed', `${failed.message} 已保存 ${pending.results.size}/8 份決策，重試只補未完成的居民。`, 502);
    }
    return this.snapshot(run);
  }
  async save(run) {
    if (!this.outputDir) return;
    try {
      const dir = join(this.outputDir, run.id); await mkdir(dir, { recursive: true });
      const filename = `tick-${String(run.state.tick).padStart(3, '0')}-batch-${String(run.attemptRound).padStart(3, '0')}.json`;
      await writeFile(join(dir, filename), JSON.stringify(exportRun(run.state, this.runtime(run))), { flag: 'wx' }); run.saveError = null;
    } catch { run.saveError = '自動保存未完成，請用「匯出完整紀錄」保留場次。'; }
  }
}
