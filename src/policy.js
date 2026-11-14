// Offline, seeded demonstration rules, NOT an LLM or a model of human behaviour.
//
// Residents follow a daily rhythm (wake up, wash, eat, go out, come home for
// dinner, spend the evening in the living room; the engine puts everyone to bed
// after the last slot) bent by their needs,
// habits and the weather, and they talk, invite and borrow equipment as in V5.
// The rules make the world inspectable; they do not prescribe friends, groups or
// a desired equipment-condition effect. Replays keep the actual proposals and
// never regenerate them with this policy.
//
// Every random draw is randomAt(seed, tick, resident, label): changing a label,
// a threshold or the order of the rules below changes every generated run.
import { randomAt, ZONES, dayOf, slotOf, weatherOf, TOTAL_TICKS } from './config.js';
import { observe } from './memory.js';
import { createWorld, step } from './engine.js';
import { measure } from './metrics.js';

/** Meal slots: breakfast 08:30, lunch 13:00, dinner 19:00. */
const MEAL_SLOTS = { 2: 'breakfast', 5: 'lunch', 9: 'dinner' };
const LAST_SLOT = 12;
/** Invitations fall due two slots later, so the last one is made before everyone heads home. */
const LAST_INVITE_SLOT = 6;
const HUNGRY = 35;
const PECKISH = 70;
const GRUBBY = 30;
const TIRED = 18;

const LINES = {
  due: ['約好的時間到了，我來試試。', '我準備好了，看看能不能一起完成。', '照剛才的約定，現在開始吧。'],
  accept: ['好，我把這段時間留下來。', '可以，我也想試試看。', '好呀，下一個時段我會留在這裡。'],
  decline: ['謝謝邀請，這次我想自己做。', '我先整理自己的計畫，下次再說。', '今天想安靜一點，先不加入。'],
  replyEquipment: [
    '嗯，先看看現場還有沒有空的設備。',
    '借到以後只能用兩個時段，我想先準備好。',
    '如果沒有空位，我就先做別的事。',
  ],
  replyCalm: [
    '好，慢慢來。我也不急著把行程排滿。',
    '那就在這裡待一會兒，聽聽大家在聊什麼。',
    '我也是，偶爾留一點空白時間很舒服。',
  ],
  replyFood: ['好啊，一起吃吧。', '聞起來好香，我也要一碗。', '吃飽再說，今天好餓。'],
  cameraWork: ['換個角度試試構圖。', '想把眼前這個畫面記下來。', '再調整一下位置，這次慢慢拍。'],
  toolsWork: ['先把零件的位置排好。', '照自己的想法，試一個小做法。', '再修一下細節，看看是否更穩。'],
  cameraInvite: [
    '兩個時段後一起拍照嗎？我來借設備。',
    '想一起試試構圖嗎？預留兩個時段準備。',
    '我有個拍照點子，兩個時段後要不要一起試？',
  ],
  toolsInvite: [
    '兩個時段後一起做個小東西嗎？我先借工具。',
    '這裡有個手作點子，兩個時段後一起試試？',
    '要不要一起研究做法？我們約兩個時段後。',
  ],
  cook: ['來煮一鍋大家都能吃的。', '煮點簡單的家常菜。', '試試新的菜色，等等一起吃。'],
  eatHome: ['開動了。', '好好吃，謝謝煮飯的人。', '吃飽才有力氣。'],
  eatCafe: ['點一份今日簡餐。', '咖啡配三明治。', '在這裡吃個午餐吧。'],
  shower: ['洗個熱水澡。', '洗完澡清爽多了。', '沖個澡，換件衣服。'],
  sleep: ['晚安，明天見。', '今天好累，早點睡。', '關燈，睡覺。'],
  exercise: ['跑一會兒步。', '做幾組重訓。', '伸展一下筋骨。'],
  restLiving: ['在沙發上看一下電視。', '窩在沙發上休息。', '翻翻客廳的雜誌。'],
  restBedroom: ['在床上看一會兒書。', '回房間安靜一下。', '整理一下房間。'],
  restTired: ['好累，先坐一下。', '休息一會兒再繼續。', '腳有點痠，坐一下。'],
  walkPark: ['沿著河邊走一圈。', '看看今天的花開了沒。', '在公園裡吹吹風。'],
  walk: ['沿著小路走一圈。', '看看附近有沒有新的點子。', '先自己逛逛，不急著找人。'],
  smallTalk: {
    living: ['今晚要看什麼節目？', '今天過得怎麼樣？', '我想在沙發上待一下，你呢？'],
    kitchen: ['好香，今天誰煮的？', '要不要一起吃？我多煮了一點。', '冰箱裡還有一些菜。'],
    bathroom: ['還要等一下嗎？', '熱水好舒服。', '早安，今天也要加油。'],
    gym: ['你每天都來運動嗎？', '跑步機借我一下？', '練完再一起去吃飯吧。'],
    workshop: [null, '工具要輪流用，我想先把步驟想好。', '你比較喜歡先畫草圖，還是直接動手？'],
    studio: [
      '今天想換個角度拍照，你有想法嗎？',
      '我想先看看構圖，再決定要不要借設備。',
      '你喜歡拍細節，還是把整個場景留下來？',
    ],
    plaza: [
      '剛好在這裡遇到你，今天過得怎麼樣？',
      '這裡的咖啡不錯，你常來嗎？',
      '換個地方坐坐，思路好像也變了。',
    ],
    park: ['今天的風好舒服。', '河邊有好多鳥。', '要不要一起走一圈？'],
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
    restWhenExhausted(me) ??
    morningRoutine(me) ??
    washWhenGrubby(me) ??
    eatWhenHungry(me) ??
    replyToMessage(me) ??
    useHeldEquipment(me) ??
    followDailyRoutine(me) ??
    chatAtGatherings(me) ??
    doWhatThisPlaceIsFor(me) ??
    socialiseOrUseEquipment(me) ??
    idle(me)
  );
}

function createDecisionContext(state, observation) {
  const agent = observation.actor;
  const tick = observation.tick;
  const chance = label => randomAt(state.config.seed, tick, agent.id, label);
  const choose = (items, label) => (items.length ? items[Math.floor(chance(label) * items.length)] : null);
  const resourceType = ZONES[agent.zone].resource;
  const held = observation.equipment.find(e => e.owner === agent.id);
  const me = {
    agent,
    tick,
    observation,
    seed: state.config.seed,
    needs: agent.needs,
    habits: agent.habits,
    zone: agent.zone,
    chance,
    choose,
    say: (label, lines) => choose(lines, `words:${label}`),
    topic: agent.interests.split('、')[0],
    day: dayOf(tick),
    slot: slotOf(tick),
    weather: observation.weather,
    held,
    resourceType,
    equipmentName: resourceType === 'camera' ? '攝影設備' : '製作工具',
    mealtime: MEAL_SLOTS[slotOf(tick)],
    // At mealtimes the peckish eat too; away from home at lunch only the properly hungry bother.
    hungry:
      agent.needs.fullness < HUNGRY ||
      (!!MEAL_SLOTS[slotOf(tick)] &&
        agent.needs.fullness <
          (MEAL_SLOTS[slotOf(tick)] === 'lunch' && ZONES[agent.zone].building !== 'house' ? 50 : PECKISH)),
    quiet: /安靜|觀察/.test(agent.style),
    /** A proposal, optionally citing one of the memories this resident was given. */
    propose: (action, fields = {}, memory = null) => ({
      actor: agent.id,
      action,
      text: null,
      ...fields,
      citedMemoryIds: memory ? [memory.id] : [],
    }),
    /** Head somewhere (null when already there; equipment cannot leave its district). */
    goTo: (destination, text) => {
      if (destination === agent.zone || held) return null;
      return me.propose('move', { destination, text: text ?? `去${ZONES[destination].name}。` });
    },
  };
  return me;
}

// ---------------------------------------------------------------------------
// Appointments (V5): keep, answer and prepare for joint equipment use.

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
    i =>
      i.to === agent.id &&
      i.status === 'pending' &&
      i.due > tick &&
      observation.peers.some(p => p.id === i.from),
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

// ---------------------------------------------------------------------------
// Body and home: sleep, rest, wash and eat.

function restWhenExhausted(me) {
  if (me.needs.energy >= TIRED) return null;
  if (me.zone === 'bedroom') return me.propose('sleep', { text: '撐不住了，先睡一下。' });
  return me.propose('rest', { text: me.say('rest-tired', LINES.restTired) });
}

/** On waking: wash first when needed, otherwise straight to the kitchen. */
function morningRoutine(me) {
  if (me.slot !== 1 || me.zone !== 'bedroom') return null;
  if (me.needs.hygiene < 45) return me.goTo('bathroom', '起床，先去梳洗。');
  return me.goTo('kitchen', '早安，去廚房看看有什麼吃的。');
}

/**
 * Eat when hungry, or at mealtimes when not full. In the kitchen: eat what is
 * cooked, or cook (some like to more than others), or go to the café instead.
 */
function eatWhenHungry(me) {
  const { mealtime } = me;
  if (!me.hungry || me.held) return null;
  if (ZONES[me.zone].servesMeals) return me.propose('eat', { text: me.say('eat-cafe', LINES.eatCafe) });
  if (me.zone === 'kitchen') {
    if (me.observation.meals.some(m => m.servings > 0))
      return me.propose('eat', { text: me.say('eat-home', LINES.eatHome) });
    // Nothing cooked yet: cook (keen cooks, or anyone really hungry), or wait for whoever is cooking.
    if (me.chance('cook') < 0.45 + 0.5 * me.habits.cook || me.needs.fullness < 25)
      return me.propose('cook', { text: me.say('cook', LINES.cook) });
    if (me.observation.peers.length) return null; // chat while someone cooks
    return me.propose('wait', { text: '等一下，看看有沒有人要煮飯。' });
  }
  // Lunch out of the house is at the café; otherwise mostly home, sometimes the café.
  const atHome = ZONES[me.zone].building === 'house';
  const cafe = mealtime === 'lunch' && !atHome ? true : me.chance('eat-out') < 0.2 * me.habits.cafe;
  return cafe ? me.goTo('plaza', '去咖啡館吃點東西。') : me.goTo('kitchen', '肚子餓了，回家吃飯。');
}

/** Wash when grubby (and, once in the bathroom, finish washing before anything else). */
function washWhenGrubby(me) {
  if (me.held) return null;
  if (me.zone === 'bathroom' && me.needs.hygiene < 85)
    return me.propose('shower', { text: me.say('shower', LINES.shower) });
  if (me.needs.hygiene >= GRUBBY || me.hungry) return null;
  return me.goTo('bathroom', '該洗個澡了。');
}

// ---------------------------------------------------------------------------
// Conversations and equipment (V5).

/** Answer an unanswered message from someone nearby, in a tone that fits what was said. */
function replyToMessage(me) {
  const { observation, topic } = me;
  const message = me.choose(
    observation.messages.filter(m => observation.peers.some(p => p.id === m.from)),
    'message',
  );
  if (!message || me.chance('respond') >= (me.quiet ? 0.7 : 0.85)) return null;
  const source = observation.provided.find(memory => memory.id === message.id);
  const heard = source?.text || '';
  const lines = /打算|計畫|想做/.test(heard)
    ? [
        `我今天想留些時間給${topic}，再出去走走。`,
        `我還在想${topic}可以怎麼安排，你呢？`,
        '先把眼前的事做完，再看看哪裡有空位。',
      ]
    : /設備|工具|借/.test(heard)
      ? LINES.replyEquipment
      : /煮|吃|香|菜/.test(heard)
        ? LINES.replyFood
        : /休息|安靜|慢慢|沙發|風/.test(heard)
          ? LINES.replyCalm
          : [
              `我想從${topic}試個小點子，你覺得呢？`,
              '嗯，我想先聽完你的想法。',
              '我可能會用另一種方式，等一下再試試。',
              '有意思，我先記住這個說法。',
            ];
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
    me.held.type === 'camera'
      ? me.say('camera-work', LINES.cameraWork)
      : me.say('tools-work', LINES.toolsWork);
  return me.propose('work', { text });
}

// ---------------------------------------------------------------------------
// The day's rhythm.

/**
 * Where to spend the day: the favourite district most days, the gym, park or
 * café as habits suggest (never the park in the rain). Fixed per resident and day.
 */
function daytimePlace(me) {
  const r = label => randomAt(me.seed, me.day, me.agent.id, 'day-place', label);
  // A rainy day at home, on the sofa, for the quieter residents.
  if (me.weather === 'rain' && me.quiet && r('stay-in') < 0.5) return 'living';
  if (me.habits.gym > r('gym') * 3) return 'gym';
  if (me.weather !== 'rain' && me.habits.park > r('park') * 3) return 'park';
  if (me.habits.cafe > r('cafe') * 3) return 'plaza';
  return me.agent.goal;
}

/**
 * Where the routine wants this resident in this slot (null: stay where they are):
 * breakfast at home, one place for the day, then home for dinner and the evening.
 */
function routineDestination(me) {
  const { slot } = me;
  // Breakfast at home for anyone not already full; the rest set off for the day.
  if (slot <= 2) return me.needs.fullness < PECKISH ? 'kitchen' : daytimePlace(me);
  if (slot <= 8) return slot === 5 ? null : daytimePlace(me); // lunch is left to hunger
  if (slot === 9) return 'kitchen';
  // After dinner the full drift to the sofa for the evening; the rest stay at the table.
  if (me.zone === 'kitchen' && me.needs.fullness < PECKISH) return null;
  const evening = randomAt(me.seed, me.day, me.agent.id, 'evening-place');
  return me.habits.gym > evening * 2.5 ? 'gym' : 'living';
}

function followDailyRoutine(me) {
  // Appointments keep people in place; the hungry stay where food is.
  if (me.observation.invitations.length) return null;
  if (me.hungry && (me.zone === 'kitchen' || ZONES[me.zone].servesMeals)) return null;
  const destination = routineDestination(me);
  if (!destination || destination === me.zone || me.chance('routine') >= 0.9) return null;
  const reasons = {
    kitchen: '回家吃飯，順便看看大家。',
    living: '回客廳坐一下，聽聽大家今天的事。',
    bedroom: '回房間安靜一下。',
    gym: '去健身房動一動。',
    park: me.say('to-park', ['去河邊公園走走。', '天氣不錯，去公園吧。']),
    plaza: me.say('to-cafe', ['去街角咖啡坐坐。', '去咖啡館換個心情。']),
    workshop: `去工坊，今天想做點${me.topic}。`,
    studio: `去攝影室看看，今天想拍點${me.topic}。`,
  };
  return me.goTo(destination, reasons[destination]);
}

/** Shared rooms are for company: with others around, most residents start a conversation. */
function chatAtGatherings(me) {
  const gathering =
    ['kitchen', 'living', 'plaza', 'park'].includes(me.zone) && me.observation.peers.length > 0;
  if (!gathering || me.chance('gathering-chat') >= (me.quiet ? 0.45 : 0.65)) return null;
  return socialiseOrUseEquipment(me);
}

/** In-place activity that suits the room, before or instead of socialising. */
function doWhatThisPlaceIsFor(me) {
  const { zone, needs } = me;
  if (zone === 'gym' && needs.energy > 30 && me.chance('workout') < 0.65)
    return me.propose('exercise', { text: me.say('exercise', LINES.exercise) });
  if (zone === 'bedroom') return me.propose('rest', { text: me.say('rest-bedroom', LINES.restBedroom) });
  if (zone === 'bathroom') {
    if (needs.hygiene < 85) return me.propose('shower', { text: me.say('shower', LINES.shower) });
    const next = needs.fullness < PECKISH ? 'kitchen' : (routineDestination(me) ?? 'living');
    return me.goTo(next === 'bathroom' ? 'living' : next, '洗好了。');
  }
  if (zone === 'kitchen' && needs.fullness < PECKISH && me.observation.meals.some(m => m.servings > 0))
    return me.propose('eat', { text: me.say('eat-home', LINES.eatHome) });
  if (zone === 'living' && (me.quiet ? 0.4 : 0.25) > me.chance('tv'))
    return me.propose('rest', { text: me.say('rest-living', LINES.restLiving) });
  if (zone === 'park' && me.chance('stroll') < 0.35)
    return me.propose('walk', { text: me.say('walk-park', LINES.walkPark) });
  return null;
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
  const familiarPeer =
    recalled &&
    me.choose(
      observation.peers.filter(p => recalled.tags.includes(p.id)),
      'recalled-peer',
    );
  const peer =
    familiarPeer && me.chance('revisit') < 0.6 ? familiarPeer : me.choose(observation.peers, 'peer');
  const sharedMemory =
    peer &&
    me.choose(
      memories.filter(m => m.tags.includes(peer.id) && m.day < day),
      'past-contact',
    );

  const canInvite = me.slot <= LAST_INVITE_SLOT && !observation.invitations.length;
  if (resourceType && peer && canInvite && me.chance('invite') < 0.3) {
    const lines = resourceType === 'camera' ? LINES.cameraInvite : LINES.toolsInvite;
    return me.propose('invite', { target: peer.id, resourceType, text: me.say('invite', lines) });
  }
  if (resourceType && me.slot <= 8 && me.chance('equipment') < 0.55) {
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
  const lines = (LINES.smallTalk[agent.zone] ?? LINES.smallTalk.plaza).map(
    line => line ?? `我想試試${me.topic}，你有什麼打算？`,
  );
  const rainy = me.weather === 'rain' && ['plaza', 'living', 'kitchen'].includes(agent.zone);
  return me.propose('talk', {
    target: peer.id,
    text: rainy && me.chance('rain-talk') < 0.3 ? '外面雨好大，今天就待在室內吧。' : me.say('talk', lines),
  });
}

/** Nothing else to do: walk outdoors, otherwise sit for a while. */
function idle(me) {
  if (me.zone === 'park') return me.propose('walk', { text: me.say('walk-park', LINES.walkPark) });
  if (me.chance('idle-walk') < 0.4) return me.propose('walk', { text: me.say('walk', LINES.walk) });
  return me.propose('rest', {
    text: me.say('rest', ['坐一會兒，今天不用一直趕路。', '先停一下，整理自己的想法。']),
  });
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
