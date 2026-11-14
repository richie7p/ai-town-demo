// Usage: npm run simulate -- [seed] [capacity]
// Writes a verified replay and a same-seed A/B comparison to output/ (ignored by git).
import { mkdir, writeFile } from 'node:fs/promises';
import { runWorld, comparePair } from '../src/policy.js';
import { measure } from '../src/metrics.js';
import { exportRun, replayRun } from '../src/replay.js';
import { worldHash } from '../src/engine.js';

const seed = Number(process.argv[2] ?? 20261103);
const capacity = Number(process.argv[3] ?? 2);

const state = runWorld({ seed, capacity });
const replay = exportRun(state);
if (worldHash(replayRun(replay)) !== worldHash(state)) throw new Error('Replay mismatch');
const pair = comparePair(seed, capacity === 3 ? 3 : 2);

await mkdir('output', { recursive: true });
await writeFile('output/demo-replay.json', JSON.stringify(replay, null, 2));
await writeFile('output/demo-pair.json', JSON.stringify(pair, null, 2));
console.log(
  JSON.stringify(
    {
      sampleType: 'synthetic-engine-demo',
      ticks: state.tick,
      events: state.events.length,
      metrics: measure(state),
      pairDeltaPP: pair.deltaPercentagePoints,
      replayVerified: true,
    },
    null,
    2,
  ),
);
