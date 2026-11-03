import { randomAt, ZONES, dayOf, slotOf } from './config.js';
import { observe } from './memory.js';
import { createWorld, step } from './engine.js';
import { measure } from './metrics.js';

// Offline, seeded demonstration rules, NOT an LLM or a model of human behavior.
// The routine and dialogue templates make the world inspectable; they do not
// prescribe friends, groups, or a desired equipment-condition effect. Replays
// retain the actual proposals and never regenerate them with this policy.
export function propose(state) {
  return state.agents.map(({ id }) => {
    const o = observe(state, id), agent = o.actor, tick = o.tick;
    const r = label => randomAt(state.config.seed, tick, agent.id, label);
    const choose = (items, label) => items.length ? items[Math.floor(r(label) * items.length)] : null;
    const say = (label, lines) => choose(lines, `words:${label}`);
    const out = (action, fields = {}, memory = null) => ({ actor: agent.id, action, text: null, ...fields, citedMemoryIds: memory ? [memory.id] : [] });
    const topic = agent.interests.split('、')[0], slot = slotOf(tick), day = dayOf(tick);
    const held = o.equipment.find(e => e.owner === agent.id);
    const resourceType = ZONES[agent.zone].resource;
    const equipmentName = resourceType === 'camera' ? '攝影設備' : '製作工具';
    const quiet = /安靜|觀察/.test(agent.style);

    const due = o.invitations.find(i => i.due === tick && i.status === 'accepted');
    if (due && r('attendance') > .12) return out(due.from === agent.id ? 'work' : 'join', {
      invitationId: due.id,
      text: say('due', ['約好的時間到了，我來試試。', '我準備好了，看看能不能一起完成。', '照剛才的約定，現在開始吧。']),
    });
    const incoming = o.invitations.find(i => i.to === agent.id && i.status === 'pending' && i.due > tick && o.peers.some(p => p.id === i.from));
    if (incoming) {
      const accept = r('accept') > (quiet ? .28 : .18);
      return out(accept ? 'accept' : 'decline', { invitationId: incoming.id, text: accept
        ? say('accept', ['好，我把這段時間留下來。', '可以，我也想試試看。', '好呀，下一個時段我會留在這裡。'])
        : say('decline', ['謝謝邀請，這次我想自己做。', '我先整理自己的計畫，下次再說。', '今天想安靜一點，先不加入。']) });
    }
    const prepare = o.invitations.find(i => i.from === agent.id && i.due === tick + 1);
    if (prepare && !held && resourceType) return out('borrow', { resourceType, text: `先借${equipmentName}，為約好的活動做準備。` });

    const reply = choose(o.messages.filter(m => o.peers.some(p => p.id === m.from)), 'message');
    if (reply && r('respond') < (quiet ? .57 : .71)) {
      const source = o.provided.find(m => m.id === reply.id);
      const text = source?.text || '';
      const lines = /打算|計畫|想做/.test(text)
        ? [`我今天想留些時間給${topic}，再到廣場走走。`, `我還在想${topic}可以怎麼安排，你呢？`, '先把眼前的事做完，再看看哪裡有空位。']
        : /設備|工具|借/.test(text)
          ? ['嗯，先看看現場還有沒有空的設備。', '借到以後只能用兩個時段，我想先準備好。', '如果沒有空位，我就先做別的事。']
          : /休息|安靜|慢慢/.test(text)
            ? ['好，慢慢來。我也不急著把行程排滿。', '那就在這裡待一會兒，聽聽大家在聊什麼。', '我也是，偶爾留一點空白時間很舒服。']
            : [`我想從${topic}試個小點子，你覺得呢？`, '嗯，我想先聽完你的想法。', '我可能會用另一種方式，等一下再試試。', '有意思，我先記住這個說法。'];
      return out('reply', { target: reply.from, conversationId: reply.conversationId, replyTo: reply.id, text: say('reply', lines) }, source);
    }
    if (held) return out('work', { text: held.type === 'camera'
      ? say('camera-work', ['換個角度試試構圖。', '想把眼前這個畫面記下來。', '再調整一下位置，這次慢慢拍。'])
      : say('tools-work', ['先把零件的位置排好。', '照自己的想法，試一個小做法。', '再修一下細節，看看是否更穩。']) });

    // A loose daily rhythm, offset per person, allows missed plans and free
    // choices. It adds presentation variety without changing engine rules.
    const morning = randomAt(state.config.seed, day, agent.id, 'morning-place') < .45 ? 'home' : 'plaza';
    const breakSlot = randomAt(state.config.seed, agent.id, 'break-slot') < .5 ? 8 : 9;
    const destination = slot <= 2 ? morning : slot >= 11 ? 'home' : slot >= breakSlot ? 'plaza' : agent.goal;
    if (!o.invitations.length && agent.zone !== destination && r('routine') < .62) return out('move', {
      destination, text: destination === 'home' ? '先回住宅區，把今天的步調放慢。' : destination === 'plaza'
        ? say('to-plaza', ['去廣場走走，也許會遇到其他人。', '先去公共廣場換個心情。'])
        : `去${ZONES[destination].name}看看，今天想做點${topic}。`,
    });
    if (r('quiet') < (quiet ? .15 : .08)) return out('rest', { text: say('rest', [
      '先停一下，整理自己的想法。', `想想${topic}還有哪些做法。`, '坐一會兒，今天不用一直趕路。', '這一刻想安靜地待著。',
    ]) });
    if (!o.invitations.length && r('wander') < .07) return out('move', {
      destination: choose(Object.keys(ZONES).filter(z => z !== agent.zone), 'destination'), text: '換個地方走走，看看小鎮另一邊。',
    });

    // Recalled contacts are evidence already provided to this actor. A mild
    // choice bias is only a transparent demo heuristic, never a friendship label.
    const memories = o.provided.filter(m => ['talk', 'reply', 'cooperation'].includes(m.kind) && m.tags.includes(agent.id));
    const recalled = choose(memories.filter(m => o.peers.some(p => m.tags.includes(p.id))), 'recall');
    const familiarPeer = recalled && choose(o.peers.filter(p => recalled.tags.includes(p.id)), 'recalled-peer');
    const peer = familiarPeer && r('revisit') < .42 ? familiarPeer : choose(o.peers, 'peer');
    const sharedMemory = peer && choose(memories.filter(m => m.tags.includes(peer.id) && m.day < day), 'past-contact');
    if (resourceType && peer && r('invite') < .24 && !o.invitations.length) return out('invite', {
      target: peer.id, resourceType, text: say('invite', resourceType === 'camera'
        ? ['兩個時段後一起拍照嗎？我來借設備。', '想一起試試構圖嗎？預留兩個時段準備。', '我有個拍照點子，兩個時段後要不要一起試？']
        : ['兩個時段後一起做個小東西嗎？我先借工具。', '這裡有個手作點子，兩個時段後一起試試？', '要不要一起研究做法？我們約兩個時段後。']),
    });
    if (resourceType && r('equipment') < .43) {
      if (o.equipment.every(e => e.owner) && r('wait') < .4) return out('wait', { reason: 'resource', text: '需要的設備都有人使用，先等一個時段。' });
      return out('borrow', { resourceType, text: `想借一件${equipmentName}，試試今天的點子。` });
    }
    if (peer) {
      if (sharedMemory && r('mention-past') < .5) return out('talk', { target: peer.id, text: sharedMemory.kind === 'cooperation'
        ? '記得之前一起做過事，今天你有什麼打算？'
        : `又碰面了。之前聊過，今天想聽聽你的${peer.interests.split('、')[0]}計畫。` }, sharedMemory);
      const local = {
        home: ['這裡安靜一些，你今天想怎麼安排？', '忙完了嗎？我想留點時間休息。', '我正在整理今天的想法，你呢？'],
        workshop: [`我想試試${topic}，你有什麼打算？`, '工具要輪流用，我想先把步驟想好。', '你比較喜歡先畫草圖，還是直接動手？'],
        plaza: ['剛好在這裡遇到你，今天過得怎麼樣？', '我想在廣場待一會兒，你要去哪裡？', '換個地方走走，思路好像也變了。'],
        studio: ['今天想換個角度拍照，你有想法嗎？', '我想先看看構圖，再決定要不要借設備。', '你喜歡拍細節，還是把整個場景留下來？'],
      };
      return out('talk', { target: peer.id, text: say('talk', local[agent.zone]) });
    }
    return out('walk', { text: say('walk', ['沿著小路走一圈。', '看看附近有沒有新的點子。', '先自己逛逛，不急著找人。']) });
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
