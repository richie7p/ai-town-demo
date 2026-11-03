import { VERSION, DAYS, TICKS_PER_DAY, ZONES, PERSONAS, ACTION_NAMES, hash, shuffled, pairKey, dayOf } from './config.js';
import { observe } from './memory.js';

export function createWorld({ seed = 20261103, capacity = 2 } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 999999999) throw new Error('種子須為 0–999999999 的整數');
  if (![2, 3, 8].includes(capacity)) throw new Error('設備數須為 2、3 或 8');
  const personas = shuffled(PERSONAS, `${seed}:personas`);
  const locations = shuffled(['home', 'home', 'plaza', 'plaza', 'workshop', 'workshop', 'studio', 'studio'], `${seed}:locations`);
  return {
    version: VERSION, config: { seed, capacity, days: DAYS, ticksPerDay: TICKS_PER_DAY, policy: 'rules-demo-v1' }, tick: 0,
    agents: personas.map((p, i) => ({ ...p, id: `A0${i + 1}`, zone: locations[i] })),
    equipment: ['workshop', 'studio'].flatMap(zone => Array.from({ length: capacity }, (_, i) => ({ id: `${ZONES[zone].resource}-${i + 1}`, type: ZONES[zone].resource, zone, owner: null, usableFrom: null, until: null }))),
    conversations: [], messages: [], invitations: [], events: [], trace: [], lastPairTick: {},
  };
}

export function worldHash(state) {
  return hash({ version: state.version, config: state.config, tick: state.tick, agents: state.agents, equipment: state.equipment, conversations: state.conversations, messages: state.messages, invitations: state.invitations, lastPairTick: state.lastPairTick });
}

export function step(state, rawProposals = []) {
  if (state.version !== VERSION) throw new Error('不支援的研究引擎版本');
  if (state.tick >= DAYS * TICKS_PER_DAY) throw new Error('本場已完成十日');
  if (!Array.isArray(rawProposals) || rawProposals.length > 8) throw new Error('每個時段最多八份提議');
  const supplied = new Map();
  for (const p of rawProposals) {
    if (!p || !state.agents.some(a => a.id === p.actor) || supplied.has(p.actor)) throw new Error('未知角色或同一角色重複提議');
    supplied.set(p.actor, p);
  }
  const tick = state.tick + 1;
  const next = { ...state, tick, agents: state.agents.map(a => ({ ...a })), equipment: state.equipment.map(e => ({ ...e })), conversations: structuredClone(state.conversations), messages: state.messages.map(m => ({ ...m })), invitations: state.invitations.map(i => ({ ...i })), events: [...state.events], trace: [...state.trace], lastPairTick: { ...state.lastPairTick } };
  const priority = shuffled(state.agents.map(a => a.id), `${state.config.seed}:priority:${tick}`);
  const observations = Object.fromEntries(state.agents.map(a => [a.id, observe(state, a.id)]));
  const proposals = state.agents.map(a => {
    const p = supplied.get(a.id) ?? { action: 'wait' };
    const field = key => typeof p[key] === 'string' ? p[key].slice(0, 500) : null;
    return { id: `p${tick}-${a.id}`, actor: a.id, action: field('action'), target: field('target'), destination: field('destination'), resourceType: field('resourceType'), replyTo: field('replyTo'), conversationId: field('conversationId'), invitationId: field('invitationId'), text: field('text'), reason: field('reason'), citedMemoryIds: Array.isArray(p.citedMemoryIds) ? p.citedMemoryIds.filter(x => typeof x === 'string').slice(0, 8) : [] };
  });
  const byActor = Object.fromEntries(proposals.map(p => [p.actor, p]));
  const failed = new Set();
  const newEvents = [];
  const agents = Object.fromEntries(state.agents.map(a => [a.id, a]));
  const held = id => state.equipment.find(e => e.owner === id);
  const activeConv = key => next.conversations.find(c => c.pair === key && c.closedTick === null);
  function emit(type, participants, text, extra = {}) {
    const origin = agents[participants[0]];
    const visibleTo = origin ? state.agents.filter(a => a.zone === origin.zone || participants.includes(a.id)).map(a => a.id) : [];
    const event = { id: `e${String(next.events.length + 1).padStart(5, '0')}`, tick, day: dayOf(tick), type, participants, text, zone: origin?.zone ?? null, tags: [...participants, origin?.zone, extra.resourceType, type].filter(Boolean), visibleTo, ...extra };
    next.events.push(event); newEvents.push(event); return event;
  }
  function failure(p, reason, type = 'invalid') {
    failed.add(p.actor);
    return emit(type, [p.actor], `${agents[p.actor].name}：${reason}`, { proposalId: p.id, action: p.action, success: false, reason, resourceType: p.resourceType });
  }
  function coLocated(a, b) { return a !== b && agents[b] && agents[a].zone === agents[b].zone; }
  function interaction(a, b, type, sourceId) {
    const pair = pairKey(a, b); next.lastPairTick[pair] = tick;
    return emit('interaction', [a, b], `${agents[a].name}與${agents[b].name}完成${type === 'reply' ? '有效回覆' : '合作'}`, { pair, interactionType: type, sourceId });
  }
  for (const p of proposals) {
    if (!Object.hasOwn(ACTION_NAMES, p.action)) failure(p, '未知或缺少行動');
    else if (p.citedMemoryIds.some(id => !observations[p.actor].providedIds.includes(id))) failure(p, '引用未實際提供的記憶');
  }

  // All eligibility checks use the start-of-tick snapshot, including replies while a peer moves.
  for (const id of priority) {
    const p = byActor[id]; if (failed.has(id) || p.action !== 'reply') continue;
    const m = state.messages.find(x => x.id === p.replyTo);
    const c = m && state.conversations.find(x => x.id === m.conversationId);
    if (!m || m.to !== id || m.from === id || p.target !== m.from || p.conversationId !== m.conversationId || m.replied || tick - m.tick > 2 || !c || c.closedTick !== null || !coLocated(id, m.from)) { failure(p, '回覆來源、期限、位置或對話不符'); continue; }
    const event = emit('reply', [id, m.from], p.text || '收到，我回覆你的訊息。', { proposalId: p.id, replyTo: m.id, conversationId: c.id, success: true });
    next.messages.find(x => x.id === m.id).replied = true;
    next.messages.push({ id: event.id, tick, from: id, to: m.from, conversationId: c.id, replied: false, opening: false });
    const nc = next.conversations.find(x => x.id === c.id); nc.lastMessageTick = tick;
    interaction(id, m.from, 'reply', event.id);
    if (m.opening && !nc.validated) {
      nc.validated = true;
      for (const from of nc.initiators) emit('initiation', [from, c.members.find(x => x !== from)], '新對話發起已獲有效回覆', { initiatedTick: c.openedTick, initiatedDay: dayOf(c.openedTick), pair: c.pair, sourceId: c.id });
    }
  }

  const talkGroups = new Map();
  for (const p of proposals.filter(p => p.action === 'talk' && !failed.has(p.actor))) {
    if (!coLocated(p.actor, p.target)) { failure(p, '交談對象不在同區'); continue; }
    const key = pairKey(p.actor, p.target); if (!talkGroups.has(key)) talkGroups.set(key, []); talkGroups.get(key).push(p);
  }
  for (const [key, talks] of [...talkGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    let c = activeConv(key);
    const isOpening = !c;
    if (!c && (state.lastPairTick[key] ?? -10) >= tick - 1) { talks.forEach(p => failure(p, '重新開場前須留一個完整空白時段')); continue; }
    if (!c) {
      c = { id: `c${next.conversations.length + 1}`, pair: key, members: key.split('|'), openedTick: tick, lastMessageTick: tick, closedTick: null, initiators: talks.map(p => p.actor).sort(), validated: false };
      next.conversations.push(c);
    }
    for (const p of talks) {
      const event = emit('talk', [p.actor, p.target], p.text || '想和你聊聊今天的計畫。', { proposalId: p.id, conversationId: c.id, opening: isOpening, success: true });
      next.messages.push({ id: event.id, tick, from: p.actor, to: p.target, conversationId: c.id, replied: false, opening: isOpening });
    }
    c.lastMessageTick = tick; next.lastPairTick[key] = tick;
  }

  for (const id of priority) {
    const p = byActor[id]; if (failed.has(id)) continue;
    const actor = agents[id], item = held(id);
    if (p.action === 'invite') {
      const resourceType = ZONES[actor.zone].resource;
      const conflict = next.invitations.some(i => i.due === tick + 2 && ['pending', 'accepted'].includes(i.status) && [i.from, i.to].some(a => [id, p.target].includes(a)));
      if (!resourceType || p.resourceType !== resourceType || !coLocated(id, p.target) || conflict) { failure(p, '邀請地點、設備類型或預約時段衝突'); continue; }
      const invitation = { id: `i${next.invitations.length + 1}`, from: id, to: p.target, created: tick, due: tick + 2, zone: actor.zone, resourceType, status: 'pending', accepted: false, success: false };
      next.invitations.push(invitation);
      emit('invite', [id, p.target], p.text || '兩個時段後，一起使用設備吧。', { proposalId: p.id, invitationId: invitation.id, resourceType, due: invitation.due, success: true });
    } else if (p.action === 'accept' || p.action === 'decline') {
      const old = state.invitations.find(i => i.id === p.invitationId);
      if (!old || old.to !== id || old.status !== 'pending' || old.due <= tick || !coLocated(id, old.from)) { failure(p, '邀請不存在、已到期或不在同區'); continue; }
      const inv = next.invitations.find(i => i.id === old.id);
      inv.status = p.action === 'accept' ? 'accepted' : 'declined'; inv.accepted = p.action === 'accept';
      emit(p.action, [id, inv.from], p.text || (inv.accepted ? '我接受這次邀請。' : '這次先照自己的計畫。'), { proposalId: p.id, invitationId: inv.id, success: true });
    } else if (p.action === 'borrow') {
      if (item || ZONES[actor.zone].resource !== p.resourceType || !p.resourceType) { failure(p, '持有中再借，或借用地點不符'); continue; }
      const free = next.equipment.find(e => e.type === p.resourceType && e.owner === null && state.equipment.find(s => s.id === e.id).owner === null);
      emit('borrow_attempt', [id], '合法借用嘗試', { proposalId: p.id, resourceType: p.resourceType });
      if (!free) { failure(p, '沒有可用設備', 'capacity_failure'); continue; }
      Object.assign(free, { owner: id, usableFrom: tick + 1, until: tick + 2 });
      emit('borrow', [id], `${actor.name}借到${p.resourceType === 'tools' ? '製作工具' : '攝影設備'}，下一時段可用`, { proposalId: p.id, equipmentId: free.id, resourceType: free.type, success: true });
    } else if (p.action === 'return') {
      if (!item) { failure(p, '沒有持有設備'); continue; }
      // Release after all proposals, so same-tick borrowers cannot see a return early.
      emit('return', [id], `${actor.name}在本時段結束歸還設備`, { proposalId: p.id, equipmentId: item.id, success: true });
    } else if (p.action === 'move') {
      if (item || !Object.hasOwn(ZONES, p.destination) || p.destination === actor.zone) { failure(p, '持有設備不可離區，或目的地不合法'); continue; }
      next.agents.find(a => a.id === id).zone = p.destination;
      emit('move', [id], `${actor.name}前往${ZONES[p.destination].name}`, { proposalId: p.id, destination: p.destination, success: true });
    } else if (['rest', 'walk', 'wait'].includes(p.action)) {
      const resourceWait = p.action === 'wait' && p.reason === 'resource' && !item && !!ZONES[actor.zone].resource && observations[id].equipment.every(e => e.owner !== null);
      emit(p.action, [id], p.text || `${actor.name}${ACTION_NAMES[p.action]}`, { proposalId: p.id, resourceWait, success: true });
    }
  }

  const cooperations = new Set();
  for (const p of proposals.filter(p => p.action === 'work' && !failed.has(p.actor))) {
    const item = held(p.actor), inv = state.invitations.find(i => i.id === p.invitationId);
    if (!item || item.usableFrom > tick || item.until < tick || item.zone !== agents[p.actor].zone || (p.invitationId && (!inv || inv.from !== p.actor || inv.due !== tick))) { failure(p, '無可用的持有設備，或工作邀請不符'); continue; }
    const other = inv && byActor[inv.to];
    const joint = inv && inv.status === 'accepted' && inv.resourceType === item.type && inv.zone === agents[p.actor].zone && coLocated(p.actor, inv.to) && other?.action === 'join' && other.invitationId === inv.id && !failed.has(inv.to);
    emit('work', [p.actor], `${agents[p.actor].name}${joint ? '開始共同活動' : '完成單人活動'}`, { proposalId: p.id, equipmentId: item.id, invitationId: inv?.id ?? null, mode: joint ? 'joint' : 'solo', success: true });
    if (joint) {
      cooperations.add(inv.id);
      const event = emit('cooperation', [p.actor, inv.to], `${agents[p.actor].name}與${agents[inv.to].name}完成合作`, { invitationId: inv.id, proposalIds: [p.id, other.id], success: true });
      interaction(p.actor, inv.to, 'cooperation', event.id);
      emit('initiation', [inv.from, inv.to], '合作邀請已由完成事件驗證', { initiatedTick: inv.created, initiatedDay: dayOf(inv.created), pair: pairKey(inv.from, inv.to), sourceId: inv.id });
    }
  }
  for (const p of proposals.filter(p => p.action === 'join' && !failed.has(p.actor))) {
    const inv = state.invitations.find(i => i.id === p.invitationId && i.to === p.actor);
    if (!inv || !cooperations.has(inv.id)) failure(p, '沒有符合條件的共同活動', 'join_failed');
    else emit('join', [p.actor, inv.from], `${agents[p.actor].name}參與共同活動`, { proposalId: p.id, invitationId: inv.id, success: true });
  }
  for (const inv of next.invitations.filter(i => i.due === tick)) {
    inv.success = cooperations.has(inv.id); inv.status = inv.success ? 'completed' : 'failed';
    emit('invitation_outcome', [inv.from, inv.to], inv.success ? '邀請已完成合作' : '預約時點已到，未完成合作', { invitationId: inv.id, success: inv.success });
  }
  for (const item of next.equipment.filter(e => e.owner !== null)) {
    const p = byActor[item.owner];
    if (item.until <= tick || (p.action === 'return' && !failed.has(p.actor))) {
      emit('release', [item.owner], '設備歸還，可於下一時段重新借用', { equipmentId: item.id, resourceType: item.type, automatic: item.until <= tick });
      Object.assign(item, { owner: null, usableFrom: null, until: null });
    }
  }
  for (const c of next.conversations.filter(c => c.closedTick === null)) {
    const [a, b] = c.members.map(id => next.agents.find(x => x.id === id));
    if (a.zone !== b.zone || tick - c.lastMessageTick >= 2) c.closedTick = tick;
  }
  next.trace.push({ tick, beforeHash: worldHash(state), afterHash: worldHash(next), priority, observations, proposals, eventIds: newEvents.map(e => e.id) });
  return next;
}
