import { randomAt, ZONES } from './config.js';
import { observe } from './memory.js';
import { createWorld, step } from './engine.js';
import { measure } from './metrics.js';

// A seeded engineering fixture policy. This is NOT an LLM or a model of human behavior.
export function propose(state) {
  return state.agents.map(agent => {
    const o = observe(state, agent.id), tick = o.tick;
    const r = label => randomAt(state.config.seed, tick, agent.id, label);
    const choose = (items, label) => items.length ? items[Math.floor(r(label) * items.length)] : null;
    const out = (action, fields = {}) => ({ actor: agent.id, action, text: null, ...fields, citedMemoryIds: [] });
    const held = o.equipment.find(e => e.owner === agent.id);
    const resourceType = ZONES[agent.zone].resource;
    const due = o.invitations.find(i => i.due === tick && i.status === 'accepted');
    if (due && r('attendance') > .12) return out(due.from === agent.id ? 'work' : 'join', { invitationId: due.id });
    const incoming = o.invitations.find(i => i.to === agent.id && i.status === 'pending' && i.due > tick);
    if (incoming) return out(r('accept') > .2 ? 'accept' : 'decline', { invitationId: incoming.id });
    const prepare = o.invitations.find(i => i.from === agent.id && i.due === tick + 1);
    if (prepare && !held) return out('borrow', { resourceType });
    const reply = choose(o.messages.filter(m => o.peers.some(p => p.id === m.from)), 'message');
    if (reply && r('respond') < .76) return out('reply', { target: reply.from, conversationId: reply.conversationId, replyTo: reply.id, text: '我聽到了，我們可以照這個方式試試。' });
    if (held) return out('work');
    if (r('quiet') < .07) return out('rest', { text: '先停一下，整理自己的想法。' });
    if (agent.zone !== agent.goal && r('go') < .52) return out('move', { destination: agent.goal });
    if (r('wander') < .09) return out('move', { destination: choose(Object.keys(ZONES).filter(z => z !== agent.zone), 'destination') });
    const peer = choose(o.peers, 'peer');
    if (resourceType && peer && r('invite') < .21 && !o.invitations.length) return out('invite', { target: peer.id, resourceType, text: '我有個小計畫，兩個時段後一起做嗎？' });
    if (resourceType && r('equipment') < .46) {
      if (o.equipment.every(e => e.owner) && r('wait') < .4) return out('wait', { reason: 'resource', text: '需要的設備都有人使用，先等一個時段。' });
      return out('borrow', { resourceType });
    }
    if (peer) return out('talk', { target: peer.id, text: `我今天想做${agent.interests.split('、')[0]}，你有什麼打算？` });
    return out('walk');
  });
}

export function runWorld(config, onStep = null) {
  let state = createWorld(config);
  onStep?.(state);
  while (state.tick < 120) { state = step(state, propose(state)); onStep?.(state); }
  return state;
}

export function comparePair(seed, lowCapacity = 2) {
  if (![2, 3].includes(lowCapacity)) throw new Error('低可用量為每類 2 或 3 件');
  const a = runWorld({ seed, capacity: 8 }), b = runWorld({ seed, capacity: lowCapacity });
  const ma = measure(a), mb = measure(b);
  return { kind: 'synthetic-engine-demo', seed, lowCapacity, a: ma, b: mb, deltaPercentagePoints: 100 * (mb.y - ma.y), note: '單一規則型配對；非 LLM 結果，不計信賴區間，不納入研究樣本。' };
}
