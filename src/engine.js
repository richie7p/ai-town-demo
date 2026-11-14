// The V5 research engine: a deterministic, synchronous world clock.
//
// Each tick freezes a snapshot, collects at most one proposal per resident and
// settles them all together. Every eligibility check reads the start-of-tick
// snapshot, so the order in which proposals are written can never matter;
// only the seeded priority order decides who wins a contested resource.
//
// The order of settlement phases, the text and the field order of every event
// are part of the replay contract (events are hashed and compared verbatim).
import {
  VERSION,
  DAYS,
  TICKS_PER_DAY,
  TOTAL_TICKS,
  ZONES,
  PERSONAS,
  ACTION_NAMES,
  hash,
  shuffled,
  pairKey,
  dayOf,
} from './config.js';
import { observe } from './memory.js';

const STARTING_ZONES = ['home', 'home', 'plaza', 'plaza', 'workshop', 'workshop', 'studio', 'studio'];
const CAPACITIES = [2, 3, 8];
const MAX_SEED = 999999999;
const MAX_FIELD_LENGTH = 500;
const MAX_CITATIONS = 8;
/** A message may be answered during the two ticks after it was sent. */
const REPLY_WINDOW = 2;
/** Joint work happens exactly two ticks after the invitation. */
const INVITATION_LEAD = 2;
/** Borrowed equipment is usable on the next tick and returned after the one after. */
const LOAN_TICKS = 2;
/** A conversation closes after a full silent tick or when its members part. */
const CONVERSATION_IDLE_TICKS = 2;
const PROPOSAL_FIELDS = [
  'action',
  'target',
  'destination',
  'resourceType',
  'replyTo',
  'conversationId',
  'invitationId',
  'text',
  'reason',
];
const equipmentName = type => (type === 'tools' ? '製作工具' : '攝影設備');

export function createWorld({ seed = 20261103, capacity = 2 } = {}) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > MAX_SEED) throw new Error('種子須為 0–999999999 的整數');
  if (!CAPACITIES.includes(capacity)) throw new Error('設備數須為 2、3 或 8');
  const personas = shuffled(PERSONAS, `${seed}:personas`);
  const locations = shuffled(STARTING_ZONES, `${seed}:locations`);
  return {
    version: VERSION,
    config: { seed, capacity, days: DAYS, ticksPerDay: TICKS_PER_DAY, policy: 'rules-demo-v1' },
    tick: 0,
    agents: personas.map((persona, i) => ({ ...persona, id: `A0${i + 1}`, zone: locations[i] })),
    equipment: ['workshop', 'studio'].flatMap(zone => {
      const type = ZONES[zone].resource;
      return Array.from({ length: capacity }, (_, i) => ({
        id: `${type}-${i + 1}`,
        type,
        zone,
        owner: null,
        usableFrom: null,
        until: null,
      }));
    }),
    conversations: [],
    messages: [],
    invitations: [],
    events: [],
    trace: [],
    lastPairTick: {},
  };
}

/** Checksum of the mutable world (not the append-only event and trace logs). */
export function worldHash(state) {
  return hash({
    version: state.version,
    config: state.config,
    tick: state.tick,
    agents: state.agents,
    equipment: state.equipment,
    conversations: state.conversations,
    messages: state.messages,
    invitations: state.invitations,
    lastPairTick: state.lastPairTick,
  });
}

/** Advance the world by one tick. Returns a new state; the input is not modified. */
export function step(state, rawProposals = []) {
  const supplied = checkStepInput(state, rawProposals);
  const tick = state.tick + 1;
  const next = copyWorld(state, tick);
  const observations = Object.fromEntries(state.agents.map(a => [a.id, observe(state, a.id)]));
  const proposals = state.agents.map(agent => normalizeProposal(supplied.get(agent.id), agent.id, tick));
  const settlement = createSettlement(state, next, proposals, observations);
  const priority = shuffled(
    state.agents.map(a => a.id),
    `${state.config.seed}:priority:${tick}`,
  );

  rejectMalformedProposals(settlement);
  settleReplies(settlement, priority);
  settleTalks(settlement);
  settleIndividualActions(settlement, priority);
  const cooperations = settleWork(settlement);
  settleJoins(settlement, cooperations);
  closeDueInvitations(settlement, cooperations);
  releaseEquipment(settlement);
  closeConversations(next, tick);

  next.trace.push({
    tick,
    beforeHash: worldHash(state),
    afterHash: worldHash(next),
    priority,
    observations,
    proposals,
    eventIds: settlement.newEvents.map(e => e.id),
  });
  return next;
}

function checkStepInput(state, rawProposals) {
  if (state.version !== VERSION) throw new Error('不支援的研究引擎版本');
  if (state.tick >= TOTAL_TICKS) throw new Error('本場已完成十日');
  if (!Array.isArray(rawProposals) || rawProposals.length > 8) throw new Error('每個時段最多八份提議');
  const supplied = new Map();
  for (const proposal of rawProposals) {
    const known = proposal && state.agents.some(a => a.id === proposal.actor);
    if (!known || supplied.has(proposal.actor)) throw new Error('未知角色或同一角色重複提議');
    supplied.set(proposal.actor, proposal);
  }
  return supplied;
}

function copyWorld(state, tick) {
  return {
    ...state,
    tick,
    agents: state.agents.map(a => ({ ...a })),
    equipment: state.equipment.map(e => ({ ...e })),
    conversations: structuredClone(state.conversations),
    messages: state.messages.map(m => ({ ...m })),
    invitations: state.invitations.map(i => ({ ...i })),
    events: [...state.events],
    trace: [...state.trace],
    lastPairTick: { ...state.lastPairTick },
  };
}

/** Keep only known string fields (truncated); a resident without a proposal waits. */
function normalizeProposal(raw = { action: 'wait' }, actor, tick) {
  const proposal = { id: `p${tick}-${actor}`, actor };
  for (const key of PROPOSAL_FIELDS)
    proposal[key] = typeof raw[key] === 'string' ? raw[key].slice(0, MAX_FIELD_LENGTH) : null;
  proposal.citedMemoryIds = Array.isArray(raw.citedMemoryIds)
    ? raw.citedMemoryIds.filter(id => typeof id === 'string').slice(0, MAX_CITATIONS)
    : [];
  return proposal;
}

/** Shared bookkeeping for one tick's settlement: the snapshot, the next world and the event log. */
function createSettlement(state, next, proposals, observations) {
  const tick = next.tick;
  const agents = Object.fromEntries(state.agents.map(a => [a.id, a]));
  const settlement = {
    state,
    next,
    tick,
    agents,
    proposals,
    observations,
    byActor: Object.fromEntries(proposals.map(p => [p.actor, p])),
    failed: new Set(),
    newEvents: [],

    /** Record an event, visible to everyone in the first participant's zone and to all participants. */
    emit(type, participants, text, extra = {}) {
      const origin = agents[participants[0]];
      const visibleTo = origin
        ? state.agents.filter(a => a.zone === origin.zone || participants.includes(a.id)).map(a => a.id)
        : [];
      const event = {
        id: `e${String(next.events.length + 1).padStart(5, '0')}`,
        tick,
        day: dayOf(tick),
        type,
        participants,
        text,
        zone: origin?.zone ?? null,
        tags: [...participants, origin?.zone, extra.resourceType, type].filter(Boolean),
        visibleTo,
        ...extra,
      };
      next.events.push(event);
      settlement.newEvents.push(event);
      return event;
    },

    /** Reject a proposal; a rejected resident takes no further part in this tick. */
    fail(proposal, reason, type = 'invalid') {
      settlement.failed.add(proposal.actor);
      return settlement.emit(type, [proposal.actor], `${agents[proposal.actor].name}：${reason}`, {
        proposalId: proposal.id,
        action: proposal.action,
        success: false,
        reason,
        resourceType: proposal.resourceType,
      });
    },

    /** Both residents exist, differ, and stood in the same zone at the start of the tick. */
    together(a, b) {
      return a !== b && agents[b] && agents[a].zone === agents[b].zone;
    },

    /** Equipment held at the start of the tick. */
    heldBy(id) {
      return state.equipment.find(e => e.owner === id);
    },

    /** A completed reply or cooperation: the evidence behind interaction days. */
    recordInteraction(a, b, kind, sourceId) {
      const pair = pairKey(a, b);
      next.lastPairTick[pair] = tick;
      const what = kind === 'reply' ? '有效回覆' : '合作';
      return settlement.emit('interaction', [a, b], `${agents[a].name}與${agents[b].name}完成${what}`, {
        pair,
        interactionType: kind,
        sourceId,
      });
    },

    /** Proposals of one action whose authors have not failed yet, in resident order. */
    pending(action) {
      return proposals.filter(p => p.action === action && !settlement.failed.has(p.actor));
    },
  };
  return settlement;
}

function rejectMalformedProposals({ proposals, observations, fail }) {
  for (const proposal of proposals) {
    if (!Object.hasOwn(ACTION_NAMES, proposal.action)) fail(proposal, '未知或缺少行動');
    else if (proposal.citedMemoryIds.some(id => !observations[proposal.actor].providedIds.includes(id)))
      fail(proposal, '引用未實際提供的記憶');
  }
}

/** Replies first: they are checked against the snapshot, even if the partner moves away this tick. */
function settleReplies(settlement, priority) {
  const { state, next, tick, byActor, failed, emit, fail, together, recordInteraction } = settlement;
  for (const id of priority) {
    const proposal = byActor[id];
    if (failed.has(id) || proposal.action !== 'reply') continue;
    const message = state.messages.find(m => m.id === proposal.replyTo);
    const conversation = message && state.conversations.find(c => c.id === message.conversationId);
    const valid =
      message &&
      message.to === id &&
      message.from !== id &&
      proposal.target === message.from &&
      proposal.conversationId === message.conversationId &&
      !message.replied &&
      tick - message.tick <= REPLY_WINDOW &&
      conversation &&
      conversation.closedTick === null &&
      together(id, message.from);
    if (!valid) {
      fail(proposal, '回覆來源、期限、位置或對話不符');
      continue;
    }
    const event = emit('reply', [id, message.from], proposal.text || '收到，我回覆你的訊息。', {
      proposalId: proposal.id,
      replyTo: message.id,
      conversationId: conversation.id,
      success: true,
    });
    next.messages.find(m => m.id === message.id).replied = true;
    next.messages.push({
      id: event.id,
      tick,
      from: id,
      to: message.from,
      conversationId: conversation.id,
      replied: false,
      opening: false,
    });
    const live = next.conversations.find(c => c.id === conversation.id);
    live.lastMessageTick = tick;
    recordInteraction(id, message.from, 'reply', event.id);

    // The first valid answer to an opening line confirms everyone who opened it.
    if (message.opening && !live.validated) {
      live.validated = true;
      for (const initiator of live.initiators) {
        const partner = conversation.members.find(member => member !== initiator);
        emit('initiation', [initiator, partner], '新對話發起已獲有效回覆', {
          initiatedTick: conversation.openedTick,
          initiatedDay: dayOf(conversation.openedTick),
          pair: conversation.pair,
          sourceId: conversation.id,
        });
      }
    }
  }
}

/** Talks are grouped by pair, so two residents addressing each other share one conversation. */
function settleTalks(settlement) {
  const { state, next, tick, emit, fail, together } = settlement;
  const byPair = new Map();
  for (const proposal of settlement.pending('talk')) {
    if (!together(proposal.actor, proposal.target)) {
      fail(proposal, '交談對象不在同區');
      continue;
    }
    const key = pairKey(proposal.actor, proposal.target);
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(proposal);
  }

  for (const [key, talks] of [...byPair].sort(([a], [b]) => a.localeCompare(b))) {
    let conversation = next.conversations.find(c => c.pair === key && c.closedTick === null);
    const opening = !conversation;
    // A new conversation needs one full silent tick after the pair last spoke.
    if (opening && (state.lastPairTick[key] ?? -10) >= tick - 1) {
      for (const proposal of talks) fail(proposal, '重新開場前須留一個完整空白時段');
      continue;
    }
    if (opening) {
      conversation = {
        id: `c${next.conversations.length + 1}`,
        pair: key,
        members: key.split('|'),
        openedTick: tick,
        lastMessageTick: tick,
        closedTick: null,
        initiators: talks.map(p => p.actor).sort(),
        validated: false,
      };
      next.conversations.push(conversation);
    }
    for (const proposal of talks) {
      const event = emit('talk', [proposal.actor, proposal.target], proposal.text || '想和你聊聊今天的計畫。', {
        proposalId: proposal.id,
        conversationId: conversation.id,
        opening,
        success: true,
      });
      next.messages.push({
        id: event.id,
        tick,
        from: proposal.actor,
        to: proposal.target,
        conversationId: conversation.id,
        replied: false,
        opening,
      });
    }
    conversation.lastMessageTick = tick;
    next.lastPairTick[key] = tick;
  }
}

/** Invitations, answers, equipment and movement, in seeded priority order. */
function settleIndividualActions(settlement, priority) {
  const handlers = {
    invite: settleInvite,
    accept: settleInvitationAnswer,
    decline: settleInvitationAnswer,
    borrow: settleBorrow,
    return: settleReturn,
    move: settleMove,
    rest: settleIdle,
    walk: settleIdle,
    wait: settleIdle,
  };
  for (const id of priority) {
    if (settlement.failed.has(id)) continue;
    const proposal = settlement.byActor[id];
    handlers[proposal.action]?.(settlement, proposal, settlement.agents[id]);
  }
}

function settleInvite({ next, tick, emit, fail, together }, proposal, actor) {
  const id = actor.id;
  const resourceType = ZONES[actor.zone].resource;
  const due = tick + INVITATION_LEAD;
  // Neither person may already have a live appointment at that tick (including ones made this tick).
  const conflict = next.invitations.some(
    i =>
      i.due === due &&
      ['pending', 'accepted'].includes(i.status) &&
      [i.from, i.to].some(person => [id, proposal.target].includes(person)),
  );
  if (!resourceType || proposal.resourceType !== resourceType || !together(id, proposal.target) || conflict) {
    fail(proposal, '邀請地點、設備類型或預約時段衝突');
    return;
  }
  const invitation = {
    id: `i${next.invitations.length + 1}`,
    from: id,
    to: proposal.target,
    created: tick,
    due,
    zone: actor.zone,
    resourceType,
    status: 'pending',
    accepted: false,
    success: false,
  };
  next.invitations.push(invitation);
  emit('invite', [id, proposal.target], proposal.text || '兩個時段後，一起使用設備吧。', {
    proposalId: proposal.id,
    invitationId: invitation.id,
    resourceType,
    due: invitation.due,
    success: true,
  });
}

function settleInvitationAnswer({ state, next, tick, emit, fail, together }, proposal, actor) {
  const id = actor.id;
  const original = state.invitations.find(i => i.id === proposal.invitationId);
  const answerable =
    original &&
    original.to === id &&
    original.status === 'pending' &&
    original.due > tick &&
    together(id, original.from);
  if (!answerable) {
    fail(proposal, '邀請不存在、已到期或不在同區');
    return;
  }
  const invitation = next.invitations.find(i => i.id === original.id);
  invitation.accepted = proposal.action === 'accept';
  invitation.status = invitation.accepted ? 'accepted' : 'declined';
  const fallback = invitation.accepted ? '我接受這次邀請。' : '這次先照自己的計畫。';
  emit(proposal.action, [id, invitation.from], proposal.text || fallback, {
    proposalId: proposal.id,
    invitationId: invitation.id,
    success: true,
  });
}

function settleBorrow({ state, next, tick, emit, fail, heldBy }, proposal, actor) {
  const id = actor.id;
  if (heldBy(id) || ZONES[actor.zone].resource !== proposal.resourceType || !proposal.resourceType) {
    fail(proposal, '持有中再借，或借用地點不符');
    return;
  }
  // Free both now and at the start of the tick: a same-tick return cannot be borrowed early.
  const free = next.equipment.find(
    e =>
      e.type === proposal.resourceType &&
      e.owner === null &&
      state.equipment.find(snapshot => snapshot.id === e.id).owner === null,
  );
  emit('borrow_attempt', [id], '合法借用嘗試', { proposalId: proposal.id, resourceType: proposal.resourceType });
  if (!free) {
    fail(proposal, '沒有可用設備', 'capacity_failure');
    return;
  }
  Object.assign(free, { owner: id, usableFrom: tick + 1, until: tick + LOAN_TICKS });
  emit('borrow', [id], `${actor.name}借到${equipmentName(proposal.resourceType)}，下一時段可用`, {
    proposalId: proposal.id,
    equipmentId: free.id,
    resourceType: free.type,
    success: true,
  });
}

function settleReturn({ emit, fail, heldBy }, proposal, actor) {
  const item = heldBy(actor.id);
  if (!item) {
    fail(proposal, '沒有持有設備');
    return;
  }
  // The item is released in releaseEquipment(), after every borrower has been settled.
  emit('return', [actor.id], `${actor.name}在本時段結束歸還設備`, {
    proposalId: proposal.id,
    equipmentId: item.id,
    success: true,
  });
}

function settleMove({ next, emit, fail, heldBy }, proposal, actor) {
  const destination = proposal.destination;
  if (heldBy(actor.id) || !Object.hasOwn(ZONES, destination) || destination === actor.zone) {
    fail(proposal, '持有設備不可離區，或目的地不合法');
    return;
  }
  next.agents.find(a => a.id === actor.id).zone = destination;
  emit('move', [actor.id], `${actor.name}前往${ZONES[destination].name}`, {
    proposalId: proposal.id,
    destination,
    success: true,
  });
}

/** Rest, walk and wait always succeed. A wait counts as a resource wait only when it truly was one. */
function settleIdle({ observations, emit, heldBy }, proposal, actor) {
  const resourceWait =
    proposal.action === 'wait' &&
    proposal.reason === 'resource' &&
    !heldBy(actor.id) &&
    !!ZONES[actor.zone].resource &&
    observations[actor.id].equipment.every(e => e.owner !== null);
  emit(proposal.action, [actor.id], proposal.text || `${actor.name}${ACTION_NAMES[proposal.action]}`, {
    proposalId: proposal.id,
    resourceWait,
    success: true,
  });
}

/**
 * Work with held, usable equipment. With an accepted invitation that falls due now
 * and a matching join from the invitee, the work becomes a cooperation.
 * Returns the ids of the invitations completed this tick.
 */
function settleWork(settlement) {
  const { state, tick, agents, byActor, failed, emit, fail, together, heldBy, recordInteraction } = settlement;
  const cooperations = new Set();
  for (const proposal of settlement.pending('work')) {
    const worker = proposal.actor;
    const item = heldBy(worker);
    const invitation = state.invitations.find(i => i.id === proposal.invitationId);
    const invitationMismatch =
      proposal.invitationId && (!invitation || invitation.from !== worker || invitation.due !== tick);
    if (!item || item.usableFrom > tick || item.until < tick || item.zone !== agents[worker].zone || invitationMismatch) {
      fail(proposal, '無可用的持有設備，或工作邀請不符');
      continue;
    }
    const partner = invitation && byActor[invitation.to];
    const joint =
      invitation &&
      invitation.status === 'accepted' &&
      invitation.resourceType === item.type &&
      invitation.zone === agents[worker].zone &&
      together(worker, invitation.to) &&
      partner?.action === 'join' &&
      partner.invitationId === invitation.id &&
      !failed.has(invitation.to);
    emit('work', [worker], `${agents[worker].name}${joint ? '開始共同活動' : '完成單人活動'}`, {
      proposalId: proposal.id,
      equipmentId: item.id,
      invitationId: invitation?.id ?? null,
      mode: joint ? 'joint' : 'solo',
      success: true,
    });
    if (!joint) continue;

    cooperations.add(invitation.id);
    const event = emit(
      'cooperation',
      [worker, invitation.to],
      `${agents[worker].name}與${agents[invitation.to].name}完成合作`,
      { invitationId: invitation.id, proposalIds: [proposal.id, partner.id], success: true },
    );
    recordInteraction(worker, invitation.to, 'cooperation', event.id);
    emit('initiation', [invitation.from, invitation.to], '合作邀請已由完成事件驗證', {
      initiatedTick: invitation.created,
      initiatedDay: dayOf(invitation.created),
      pair: pairKey(invitation.from, invitation.to),
      sourceId: invitation.id,
    });
  }
  return cooperations;
}

function settleJoins(settlement, cooperations) {
  const { state, agents, emit, fail } = settlement;
  for (const proposal of settlement.pending('join')) {
    const invitation = state.invitations.find(i => i.id === proposal.invitationId && i.to === proposal.actor);
    if (!invitation || !cooperations.has(invitation.id)) {
      fail(proposal, '沒有符合條件的共同活動', 'join_failed');
      continue;
    }
    emit('join', [proposal.actor, invitation.from], `${agents[proposal.actor].name}參與共同活動`, {
      proposalId: proposal.id,
      invitationId: invitation.id,
      success: true,
    });
  }
}

/** Every invitation due now is closed as completed or failed. */
function closeDueInvitations({ next, tick, emit }, cooperations) {
  for (const invitation of next.invitations.filter(i => i.due === tick)) {
    invitation.success = cooperations.has(invitation.id);
    invitation.status = invitation.success ? 'completed' : 'failed';
    emit(
      'invitation_outcome',
      [invitation.from, invitation.to],
      invitation.success ? '邀請已完成合作' : '預約時點已到，未完成合作',
      { invitationId: invitation.id, success: invitation.success },
    );
  }
}

/** Loans end automatically after their last tick, or early after a successful return. */
function releaseEquipment({ next, tick, byActor, failed, emit }) {
  for (const item of next.equipment.filter(e => e.owner !== null)) {
    const proposal = byActor[item.owner];
    const expired = item.until <= tick;
    const returned = proposal.action === 'return' && !failed.has(proposal.actor);
    if (!expired && !returned) continue;
    emit('release', [item.owner], '設備歸還，可於下一時段重新借用', {
      equipmentId: item.id,
      resourceType: item.type,
      automatic: expired,
    });
    Object.assign(item, { owner: null, usableFrom: null, until: null });
  }
}

function closeConversations(next, tick) {
  for (const conversation of next.conversations.filter(c => c.closedTick === null)) {
    const [a, b] = conversation.members.map(id => next.agents.find(agent => agent.id === id));
    if (a.zone !== b.zone || tick - conversation.lastMessageTick >= CONVERSATION_IDLE_TICKS)
      conversation.closedTick = tick;
  }
}
