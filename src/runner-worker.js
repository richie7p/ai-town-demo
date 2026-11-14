// Long jobs run off the main thread: finishing the run, the A/B comparison and
// verifying an imported replay. The page keeps its current run until a job
// succeeds; any error is reported back instead of a partial result.
import { TOTAL_TICKS, TICKS_PER_DAY } from './config.js';
import { step } from './engine.js';
import { propose, comparePair } from './policy.js';
import { replayRun } from './replay.js';
import { viewFrame } from './presentation.js';

const jobs = {
  compare: ({ seed, capacity }) => ({ pair: comparePair(seed, capacity) }),

  finish: ({ state }) => {
    const frames = [];
    while (state.tick < TOTAL_TICKS) {
      state = step(state, propose(state));
      frames.push(viewFrame(state));
      if (state.tick % TICKS_PER_DAY === 0) self.postMessage({ type: 'progress', tick: state.tick });
    }
    return { state, frames };
  },

  import: ({ data }) => {
    const frames = [];
    const state = replayRun(data, snapshot => frames.push(viewFrame(snapshot)));
    return { state, frames };
  },
};

self.onmessage = ({ data }) => {
  try {
    const job = jobs[data.type];
    if (job) self.postMessage({ type: 'result', ...job(data) });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
};
