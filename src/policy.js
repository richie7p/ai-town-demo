// Offline, seeded demonstration rules, NOT an LLM or a model of human behaviour.
//
// The routine and dialogue templates make the world inspectable; they do not
// prescribe friends, groups or a desired equipment-condition effect. Replays
// keep the actual proposals and never regenerate them with this policy.
//
// Every random draw is randomAt(seed, tick, resident, label): changing a label,
// a threshold or the order of the rules below changes every generated run.
import { randomAt, ZONES, dayOf, slotOf, TOTAL_TICKS } from './config.js';
import { observe } from './memory.js';
import { createWorld, step } from './engine.js';
import { measure } from './metrics.js';

const LINES = {
  due: ['約好的時間到了，我來試試。', '我準備好了，看看能不能一起完成。', '照剛才的約定，現在開始吧。'],
  accept: ['好，我把這段時間留下來。', '可以，我也想試試看。', '好呀，下一個時段我會留在這裡。'],
  decline: ['謝謝邀請，這次我想自己做。', '我先整理自己的計畫，下次再說。', '今天想安靜一點，先不加入。'],
  replyEquipment: ['嗯，先看看現場還有沒有空的設備。', '借到以後只能用兩個時段，我想先準備好。', '如果沒有空位，我就先做別的事。'],
  replyCalm: ['好，慢慢來。我也不急著把行程排滿。', '那就在這裡待一會兒，聽聽大家在聊什麼。', '我也是，偶爾留一點空白時間很舒服。'],
  cameraWork: ['換個角度試試構圖。', '想把眼前這個畫面記下來。', '再調整一下位置，這次慢慢拍。'],
  toolsWork: ['先把零件的位置排好。', '照自己的想法，試一個小做法。', '再修一下細節，看看是否更穩。'],
  toPlaza: ['去廣場走走，也許會遇到其他人。', '先去公共廣場換個心情。'],
  cameraInvite: ['兩個時段後一起拍照嗎？我來借設備。', '想一起試試構圖嗎？預留兩個時段準備。', '我有個拍照點子，兩個時段後要不要一起試？'],
  toolsInvite: ['兩個時段後一起做個小東西嗎？我先借工具。', '這裡有個手作點子，兩個時段後一起試試？', '要不要一起研究做法？我們約兩個時段後。'],
  walk: ['沿著小路走一圈。', '看看附近有沒有新的點子。', '先自己逛逛，不急著找人。'],
  smallTalk: {
    home: ['這裡安靜一些，你今天想怎麼安排？', '忙完了嗎？我想留點時間休息。', '我正在整理今天的想法，你呢？'],
    workshop: [null, '工具要輪流用，我想先把步驟想好。', '你比較喜歡先畫草圖，還是直接動手？'],
    plaza: ['剛好在這裡遇到你，今天過得怎麼樣？', '我想在廣場待一會兒，你要去哪裡？', '換個地方走走，思路好像也變了。'],
    studio: ['今天想換個角度拍照，你有想法嗎？', '我想先看看構圖，再決定要不要借設備。', '你喜歡拍細節，還是把整個場景留下來？'],
  },
};

/** One proposal per resident for the next tick. Reads the world, never changes it. */
export function propose(state) {
  return state.agents.map(({ id }) => decide(state, observe(state, id)));
}

/** The rules, in order of precedence; the first that applies decides the action. */
function decide(state, observation) {
  const me = createDecisionContext(state, observation);
  return (
    keepAppointment(me) ??
    answerInvitation(me) ??
    prepareForAppointment(me) ??
    replyToMessage(me) ??
    useHeldEquipment(me) ??
    followDailyRoutine(me) ??
    pauseQuietly(me) ??
    wanderElsewhere(me) ??
    socialiseOrUseEquipment(me) ??
    me.propose('walk', { text: me.say('walk', LINES.walk) })
  );
}

function createDecisionContext(state, observation) {
  const agent = observation.actor;
  const tick = observation.tick;
  const chance = label => randomAt(state.config.seed, tick, agent.id, label);
  const choose = (items, label) => (items.length ? items[Math.floor(chance(label) * items.length)] : null);
  const resourceType = ZONES[agent.zone].resource;
  return {
    agent,
    tick,
    observation,
    seed: state.config.seed,
    chance,
    choose,
    say: (label, lines) => choose(lines, `words:${label}`),
    topic: agent.interests.split('、')[0],
    day: dayOf(tick),
    slot: slotOf(tick),
    held: observation.equipment.find(e => e.owner === agent.id),
    resourceType,
    equipmentName: resourceType === 'camera' ? '攝影設備' : '製作工具',
    quiet: /安靜|觀察/.test(agent.style),
    /** A proposal, optionally citing one of the memories this resident was given. */
    propose: (action, fields = {}, memory = null) => ({
      actor: agent.id,
      action,
      text: null,
      ...fields,
      citedMemoryIds: memory ? [memory.id] : [],
    }),
  };
}

/** Show up for an accepted invitation that falls due now (most of the time). */
function keepAppointment(me) {
  const due = me.observation.invitations.find(i => i.due === me.tick && i.status === 'accepted');
  if (!due || me.chance('attendance') <= 0.12) return null;
  return me.propose(due.from === me.agent.id ? 'work' : 'join', {
    invitationId: due.id,
    text: me.say('due', LINES.due),
  });
}

/** Accept or decline a pending invitation from someone who is still here. */
function answerInvitation(me) {
  const { observation, agent, tick } = me;
  const incoming = observation.invitations.find(
    i => i.to === agent.id && i.status === 'pending' && i.due > tick && observation.peers.some(p => p.id === i.from),
  );
  if (!incoming) return null;
  const accept = me.chance('accept') > (me.quiet ? 0.28 : 0.18);
  return me.propose(accept ? 'accept' : 'decline', {
    invitationId: incoming.id,
    text: accept ? me.say('accept', LINES.accept) : me.say('decline', LINES.decline),
  });
}

/** One tick before one's own appointment, borrow the equipment it needs. */
function prepareForAppointment(me) {
  const hosting = me.observation.invitations.find(i => i.from === me.agent.id && i.due === me.tick + 1);
  if (!hosting || me.held || !me.resourceType) return null;
  return me.propose('borrow', {
    resourceType: me.resourceType,
    text: `先借${me.equipmentName}，為約好的活動做準備。`,
  });
}

/** Answer an unanswered message from someone nearby, in a tone that fits what was said. */
function replyToMessage(me) {
  const { observation, topic } = me;
  const message = me.choose(
    observation.messages.filter(m => observation.peers.some(p => p.id === m.from)),
    'message',
  );
  if (!message || me.chance('respond') >= (me.quiet ? 0.57 : 0.71)) return null;
  const source = observation.provided.find(memory => memory.id === message.id);
  const heard = source?.text || '';
  const lines = /打算|計畫|想做/.test(heard)
    ? [`我今天想留些時間給${topic}，再到廣場走走。`, `我還在想${topic}可以怎麼安排，你呢？`, '先把眼前的事做完，再看看哪裡有空位。']
    : /設備|工具|借/.test(heard)
      ? LINES.replyEquipment
      : /休息|安靜|慢慢/.test(heard)
        ? LINES.replyCalm
        : [`我想從${topic}試個小點子，你覺得呢？`, '嗯，我想先聽完你的想法。', '我可能會用另一種方式，等一下再試試。', '有意思，我先記住這個說法。'];
  return me.propose(
    'reply',
    {
      target: message.from,
      conversationId: message.conversationId,
      replyTo: message.id,
      text: me.say('reply', lines),
    },
    source,
  );
}

function useHeldEquipment(me) {
  if (!me.held) return null;
  const text =
    me.held.type === 'camera' ? me.say('camera-work', LINES.cameraWork) : me.say('tools-work', LINES.toolsWork);
  return me.propose('work', { text });
}

/**
 * A loose daily rhythm, offset per person, that still allows missed plans:
 * mornings at home or in the plaza, the day at one's favourite district,
 * an afternoon break in the plaza and evenings at home.
 */
function followDailyRoutine(me) {
  const { agent, slot, day, seed } = me;
  const morning = randomAt(seed, day, agent.id, 'morning-place') < 0.45 ? 'home' : 'plaza';
  const breakSlot = randomAt(seed, agent.id, 'break-slot') < 0.5 ? 8 : 9;
  const destination = slot <= 2 ? morning : slot >= 11 ? 'home' : slot >= breakSlot ? 'plaza' : agent.goal;
  if (me.observation.invitations.length || agent.zone === destination || me.chance('routine') >= 0.62) return null;
  const text =
    destination === 'home'
      ? '先回住宅區，把今天的步調放慢。'
      : destination === 'plaza'
        ? me.say('to-plaza', LINES.toPlaza)
        : `去${ZONES[destination].name}看看，今天想做點${me.topic}。`;
  return me.propose('move', { destination, text });
}

function pauseQuietly(me) {
  if (me.chance('quiet') >= (me.quiet ? 0.15 : 0.08)) return null;
  return me.propose('rest', {
    text: me.say('rest', [
      '先停一下，整理自己的想法。',
      `想想${me.topic}還有哪些做法。`,
      '坐一會兒，今天不用一直趕路。',
      '這一刻想安靜地待著。',
    ]),
  });
}

function wanderElsewhere(me) {
  if (me.observation.invitations.length || me.chance('wander') >= 0.07) return null;
  return me.propose('move', {
    destination: me.choose(
      Object.keys(ZONES).filter(zone => zone !== me.agent.zone),
      'destination',
    ),
    text: '換個地方走走，看看小鎮另一邊。',
  });
}

/**
 * Pick someone nearby (mildly preferring a person recalled from memory) and
 * invite, borrow, wait for equipment or talk. Recalled contacts are evidence
 * already provided to this resident; the preference is a transparent demo
 * heuristic, never a friendship label.
 */
function socialiseOrUseEquipment(me) {
  const { observation, agent, day, resourceType } = me;
  const memories = observation.provided.filter(
    m => ['talk', 'reply', 'cooperation'].includes(m.kind) && m.tags.includes(agent.id),
  );
  const recalled = me.choose(
    memories.filter(m => observation.peers.some(p => m.tags.includes(p.id))),
    'recall',
  );
  const familiarPeer = recalled && me.choose(observation.peers.filter(p => recalled.tags.includes(p.id)), 'recalled-peer');
  const peer = familiarPeer && me.chance('revisit') < 0.42 ? familiarPeer : me.choose(observation.peers, 'peer');
  const sharedMemory = peer && me.choose(memories.filter(m => m.tags.includes(peer.id) && m.day < day), 'past-contact');

  if (resourceType && peer && me.chance('invite') < 0.24 && !observation.invitations.length) {
    const lines = resourceType === 'camera' ? LINES.cameraInvite : LINES.toolsInvite;
    return me.propose('invite', { target: peer.id, resourceType, text: me.say('invite', lines) });
  }
  if (resourceType && me.chance('equipment') < 0.43) {
    if (observation.equipment.every(e => e.owner) && me.chance('wait') < 0.4)
      return me.propose('wait', { reason: 'resource', text: '需要的設備都有人使用，先等一個時段。' });
    return me.propose('borrow', { resourceType, text: `想借一件${me.equipmentName}，試試今天的點子。` });
  }
  if (!peer) return null;
  if (sharedMemory && me.chance('mention-past') < 0.5) {
    const text =
      sharedMemory.kind === 'cooperation'
        ? '記得之前一起做過事，今天你有什麼打算？'
        : `又碰面了。之前聊過，今天想聽聽你的${peer.interests.split('、')[0]}計畫。`;
    return me.propose('talk', { target: peer.id, text }, sharedMemory);
  }
  const smallTalk = LINES.smallTalk[agent.zone].map(line => line ?? `我想試試${me.topic}，你有什麼打算？`);
  return me.propose('talk', { target: peer.id, text: me.say('talk', smallTalk) });
}

/** Run a whole ten-day world with this policy, optionally reporting every state. */
export function runWorld(config, onStep = null) {
  let state = createWorld(config);
  onStep?.(state);
  while (state.tick < TOTAL_TICKS) {
    state = step(state, propose(state));
    onStep?.(state);
  }
  return state;
}

/** Same-seed A8 versus B2/B3 comparison of the primary outcome. */
export function comparePair(seed, lowCapacity = 2) {
  if (![2, 3].includes(lowCapacity)) throw new Error('低可用量為每類 2 或 3 件');
  const a = measure(runWorld({ seed, capacity: 8 }));
  const b = measure(runWorld({ seed, capacity: lowCapacity }));
  return {
    kind: 'synthetic-engine-demo',
    seed,
    lowCapacity,
    a,
    b,
    deltaPercentagePoints: 100 * (b.y - a.y),
    note: '單一規則型配對；非 LLM 結果，不計信賴區間，不納入研究樣本。',
  };
}
