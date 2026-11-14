// Export and verified re-import of a run.
//
// A replay file keeps every proposal. Importing re-settles those proposals with
// the engine (the policy is never run again) and requires every checksum, the
// event log and the decision trace to match exactly before anything is shown.
import { VERSION, DAYS, TICKS_PER_DAY, TOTAL_TICKS } from './config.js';
import { createWorld, step } from './engine.js';

export const REPLAY_FORMAT = 'ai-town-replay-v1';

/** The complete run so far, independent of where the viewer's playback cursor is. */
export function exportRun(state) {
  return {
    format: REPLAY_FORMAT,
    engineVersion: VERSION,
    sampleType: 'synthetic-engine-demo',
    config: state.config,
    frames: state.trace.map(t => ({
      tick: t.tick,
      beforeHash: t.beforeHash,
      afterHash: t.afterHash,
      proposals: t.proposals,
    })),
    events: state.events,
    decisionTrace: state.trace,
    notice: '工程示範資料。無 LLM 呼叫、無真實人類資料；不得作正式實驗結果。FNV checksum 僅用於意外變更檢查。',
  };
}

/**
 * Rebuild a run from its proposals and verify it. `onStep` receives every
 * verified state (including the initial one), but only after the whole file
 * validated, so a broken import can never partially replace what is on screen.
 */
export function replayRun(data, onStep = null) {
  const supported =
    data?.format === REPLAY_FORMAT &&
    data.engineVersion === VERSION &&
    Array.isArray(data.frames) &&
    data.frames.length <= TOTAL_TICKS;
  if (!supported) throw new Error('不支援的回放檔案或版本');
  const { days, ticksPerDay, policy } = data.config ?? {};
  if (days !== DAYS || ticksPerDay !== TICKS_PER_DAY || policy !== 'rules-demo-v1')
    throw new Error('回放設定與本版不符');

  let state = createWorld(data.config);
  const verified = [state];
  for (const frame of data.frames) {
    if (frame.tick !== state.tick + 1 || !Array.isArray(frame.proposals)) throw new Error('回放時段不連續');
    const next = step(state, frame.proposals);
    const trace = next.trace.at(-1);
    if (trace.beforeHash !== frame.beforeHash || trace.afterHash !== frame.afterHash)
      throw new Error(`第 ${frame.tick} 時段校驗不符`);
    state = next;
    verified.push(state);
  }
  if (JSON.stringify(data.events) !== JSON.stringify(state.events)) throw new Error('事件紀錄與重播結果不一致');
  if (JSON.stringify(data.decisionTrace) !== JSON.stringify(state.trace))
    throw new Error('決策／記憶紀錄與重播結果不一致');
  for (const snapshot of verified) onStep?.(snapshot);
  return state;
}
