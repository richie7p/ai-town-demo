import { measure } from './metrics.js';

/** Events kept per view frame; older ones are looked up in the full log when needed. */
const RECENT_EVENTS = 180;

/**
 * What the page needs to draw one tick. Keeping only recent events and the
 * last trace entry avoids holding 120 copies of the cumulative logs.
 */
export function viewFrame(state) {
  return {
    tick: state.tick,
    config: state.config,
    agents: state.agents,
    equipment: state.equipment,
    events: state.events.slice(-RECENT_EVENTS),
    trace: state.trace.at(-1) ?? null,
    metrics: measure(state),
  };
}
