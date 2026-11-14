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
      let state = data.state;
      const frames = [];
      while (state.tick < 120) {
        state = step(state, propose(state));
        frames.push(viewFrame(state));
        if (state.tick % 12 === 0) self.postMessage({ type: 'progress', tick: state.tick });
      }
      self.postMessage({ type: 'result', state, frames });
    } else if (data.type === 'import') {
      const frames = [];
      const state = replayRun(data.data, s => frames.push(viewFrame(s)));
      self.postMessage({ type: 'result', state, frames });
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
