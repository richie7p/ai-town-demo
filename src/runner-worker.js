import { step } from './engine.js';
import { propose, comparePair } from './policy.js';
import { replayRun } from './replay.js';
import { viewFrame } from './presentation.js';

self.onmessage = event => {
  try {
    const data = event.data;
    if (data.type === 'compare') {
      self.postMessage({ type: 'result', pair: comparePair(data.seed, data.capacity) });
    } else if (data.type === 'finish') {
      if (data.state.config.policy !== 'rules-demo-v1') throw new Error('LLM 場次請從生活介面逐步執行，不能用離線策略補齊。');
      let state = data.state; const frames = [];
      while (state.tick < 120) {
        state = step(state, propose(state)); frames.push(viewFrame(state));
        if (state.tick % 12 === 0) self.postMessage({ type: 'progress', tick: state.tick });
      }
      self.postMessage({ type: 'result', state, frames });
    } else if (data.type === 'import') {
      const frames = [];
      const state = replayRun(data.data, s => frames.push(viewFrame(s)));
      self.postMessage({ type: 'result', state, frames, audit: data.data.audit || null });
    }
  } catch (error) { self.postMessage({ type: 'error', message: error.message }); }
};
