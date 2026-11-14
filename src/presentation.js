import { measure } from './metrics.js';

// Compact view frames avoid retaining 120 copies of the cumulative event/trace log.
export function viewFrame(state) {
  return {
    tick: state.tick,
    config: state.config,
    agents: state.agents,
    equipment: state.equipment,
    events: state.events.slice(-180),
    trace: state.trace.at(-1) ?? null,
    metrics: measure(state),
  };
}
