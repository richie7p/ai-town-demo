import { VERSION, hash } from './config.js';
import { createWorld, step } from './engine.js';

export function exportRun(state, audit = null) {
  const llm = state.config.policy === 'llm-responses-v1';
  return { format: 'ai-town-replay-v1', engineVersion: VERSION, sampleType: llm ? 'llm-engineering-pilot' : 'synthetic-engine-demo', config: state.config,
    frames: state.trace.map(t => ({ tick: t.tick, beforeHash: t.beforeHash, afterHash: t.afterHash, proposals: t.proposals })),
    events: state.events, decisionTrace: state.trace,
    ...(llm ? { audit } : {}),
    notice: llm ? 'LLM 工程試跑，非正式實驗結果。含實際模型請求的行動、觀察校驗與用量；載入回放不呼叫 API。校驗不構成來源簽章。'
      : '工程示範資料。無 LLM 呼叫、無真實人類資料；不得作正式實驗結果。FNV checksum 僅用於意外變更檢查。' };
}

export function replayRun(data, onStep = null) {
  if (!data || data.format !== 'ai-town-replay-v1' || data.engineVersion !== VERSION || !Array.isArray(data.frames) || data.frames.length > 120) throw new Error('不支援的回放檔案或版本');
  if (data.config?.days !== 10 || data.config?.ticksPerDay !== 12 || !['rules-demo-v1', 'llm-responses-v1'].includes(data.config?.policy)) throw new Error('回放設定與本版不符');
  let state = createWorld(data.config);
  const verified = [state];
  for (const frame of data.frames) {
    if (frame.tick !== state.tick + 1 || !Array.isArray(frame.proposals)) throw new Error('回放時段不連續');
    const next = step(state, frame.proposals);
    const trace = next.trace.at(-1);
    if (trace.beforeHash !== frame.beforeHash || trace.afterHash !== frame.afterHash) throw new Error(`第 ${frame.tick} 時段校驗不符`);
    state = next; verified.push(state);
  }
  if (JSON.stringify(data.events) !== JSON.stringify(state.events)) throw new Error('事件紀錄與重播結果不一致');
  if (JSON.stringify(data.decisionTrace) !== JSON.stringify(state.trace)) throw new Error('決策／記憶紀錄與重播結果不一致');
  if (state.config.policy === 'llm-responses-v1') {
    if (data.sampleType !== 'llm-engineering-pilot' || data.audit?.format !== 'ai-town-llm-audit-v1' || !Array.isArray(data.audit.records) || data.audit.records.length > 2048) throw new Error('缺少 LLM 請求紀錄');
    for (const trace of state.trace) {
      const records = data.audit.records.filter(r => r.tick === trace.tick && r.status === 'ok');
      if (records.length !== 8 || new Set(records.map(r => r.actor)).size !== 8) throw new Error('LLM 時段缺少八位居民的決策');
      for (const p of trace.proposals) {
        const r = records.find(r => r.actor === p.actor);
        if (!r || r.observationHash !== hash(trace.observations[p.actor]) || r.promptHash !== data.audit.promptHash) throw new Error('LLM 觀察紀錄校驗不符');
        for (const key of Object.keys(p).filter(key => key !== 'id')) if (JSON.stringify(r.proposal?.[key]) !== JSON.stringify(p[key])) throw new Error('LLM 行動與結算紀錄不符');
      }
    }
  }
  // Deliver frames only after the entire file validates; an invalid import cannot partially replace the UI.
  for (const snapshot of verified) onStep?.(snapshot);
  return state;
}
