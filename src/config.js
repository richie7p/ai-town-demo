// Shared constants and deterministic helpers for the research engine.
//
// Everything here is part of the replay contract: changing a persona, a zone,
// the clock or the seeded helpers changes every saved run's checksums.

/**
 * Replay/engine format. Saved runs are only accepted by the same version.
 * demo-0.2.0 adds daily life (needs, meals, sleep, the shared house and park)
 * to the V5 rules; runs saved by demo-0.1.0 cannot be replayed by it.
 */
export const VERSION = 'demo-0.2.0';
export const POLICY = 'life-rules-v2';
export const DAYS = 10;
export const TICKS_PER_DAY = 12;
/** One run lasts ten days of twelve slots. */
export const TOTAL_TICKS = DAYS * TICKS_PER_DAY;

/**
 * Places a resident can be. The shared house is split into rooms; each resident
 * has a private bedroom (`private`: nobody else sees or hears what happens there).
 * The workshop and studio each lend one kind of equipment; the bathroom has three
 * showers; the café always serves a simple meal.
 */
export const ZONES = {
  bedroom: { name: '臥室', subtitle: '睡覺・獨處', color: '#b98a6e', building: 'house', private: true },
  living: { name: '客廳', subtitle: '聊天・看電視', color: '#c2926a', building: 'house' },
  kitchen: { name: '廚房餐廳', subtitle: '煮飯・吃飯', color: '#d0a35f', building: 'house' },
  bathroom: { name: '浴室', subtitle: '洗澡・梳洗', color: '#7fa7b3', building: 'house', showers: 3 },
  gym: { name: '健身房', subtitle: '運動・伸展', color: '#8f8fb3', building: 'house' },
  workshop: { name: '工坊', subtitle: '製作・修理', color: '#d29441', resource: 'tools' },
  studio: { name: '攝影室', subtitle: '攝影・共同活動', color: '#698cad', resource: 'camera' },
  plaza: { name: '街角咖啡', subtitle: '交談・簡餐', color: '#679b75', servesMeals: true },
  park: { name: '河畔公園', subtitle: '散步・野餐', color: '#5f9a63' },
};

/**
 * The eight residents, before the seeded shuffle assigns ids. `goal` is the
 * district where they like to spend the day; `habits` (0–1) tilt how often they
 * cook, go to the gym, walk in the park and sit in the café.
 */
export const PERSONAS = [
  {
    name: '小禾',
    interests: '模型製作、植物',
    style: '先規劃，願意解釋步驟',
    goal: 'workshop',
    color: '#367760',
    habits: { cook: 0.7, gym: 0.2, park: 0.6, cafe: 0.3 },
  },
  {
    name: '阿光',
    interests: '攝影、散步',
    style: '較即興，喜歡分享',
    goal: 'studio',
    color: '#c48940',
    habits: { cook: 0.2, gym: 0.3, park: 0.7, cafe: 0.5 },
  },
  {
    name: '木木',
    interests: '修理、閱讀',
    style: '較安靜，可以直接拒絕',
    goal: 'workshop',
    color: '#6c7ba7',
    habits: { cook: 0.4, gym: 0.1, park: 0.3, cafe: 0.6 },
  },
  {
    name: '小苒',
    interests: '手作、裝飾',
    style: '交換想法，也能獨立進行',
    goal: 'workshop',
    color: '#b27077',
    habits: { cook: 0.6, gym: 0.3, park: 0.4, cafe: 0.5 },
  },
  {
    name: '日青',
    interests: '攝影、日記',
    style: '先觀察，再決定是否加入',
    goal: 'studio',
    color: '#5d9b9e',
    habits: { cook: 0.3, gym: 0.2, park: 0.5, cafe: 0.7 },
  },
  {
    name: '阿岚',
    interests: '設計、散步',
    style: '願意嘗試新活動',
    goal: 'studio',
    color: '#88805b',
    habits: { cook: 0.4, gym: 0.6, park: 0.6, cafe: 0.4 },
  },
  {
    name: '知序',
    interests: '修理、整理工具',
    style: '重視時間與歸還',
    goal: 'workshop',
    color: '#8e719d',
    habits: { cook: 0.5, gym: 0.7, park: 0.2, cafe: 0.3 },
  },
  {
    name: '小麥',
    interests: '手作、閱讀',
    style: '有自己的計畫，也可改變安排',
    goal: 'workshop',
    color: '#ae7655',
    habits: { cook: 0.8, gym: 0.2, park: 0.4, cafe: 0.5 },
  },
];

/** Every action a proposal may name, with its display label. */
export const ACTION_NAMES = {
  talk: '開口交談',
  reply: '回覆',
  invite: '邀請合作',
  accept: '接受邀請',
  decline: '婉拒邀請',
  borrow: '借用',
  return: '歸還',
  work: '使用設備',
  join: '加入合作',
  move: '移動',
  walk: '散步',
  rest: '休息',
  wait: '等待',
  cook: '煮飯',
  eat: '吃飯',
  shower: '洗澡',
  sleep: '睡覺',
  exercise: '運動',
};

/** Clock time at the start of each of the twelve daily slots. */
export const SLOT_TIMES = [
  '07:00',
  '08:30',
  '10:00',
  '11:30',
  '13:00',
  '14:30',
  '16:00',
  '17:30',
  '19:00',
  '20:30',
  '22:00',
  '23:30',
];

/** The three daily needs (0–100). Each falls every slot and is restored by matching actions. */
export const NEEDS = {
  fullness: { name: '飽足', decay: 6 },
  energy: { name: '精力', decay: 5 },
  hygiene: { name: '清潔', decay: 3 },
};

export const WEATHER = {
  sunny: { name: '晴' },
  cloudy: { name: '多雲' },
  rain: { name: '雨' },
};

/** Day number (1–10) of a tick. Tick 0, before the first slot, counts as day 1. */
export const dayOf = tick => Math.floor((Math.max(1, tick) - 1) / TICKS_PER_DAY) + 1;
/** Slot within the day (1–12). Tick 0 counts as slot 1. */
export const slotOf = tick => ((Math.max(1, tick) - 1) % TICKS_PER_DAY) + 1;
/** Order-independent key for a pair of resident ids, e.g. "A01|A04". */
export const pairKey = (a, b) => [a, b].sort().join('|');

/**
 * 32-bit FNV-1a over the code points of a string (objects are JSON-encoded first).
 * A stable checksum for detecting accidental changes, not a cryptographic signature.
 */
export function hash(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let h = 2166136261;
  // Walk code points by index (the same sequence as `for…of` over the string)
  // without allocating a string per character. Unpaired surrogates stay as is.
  for (let i = 0, n = text.length; i < n; i++) {
    let codePoint = text.charCodeAt(i);
    if (codePoint >= 0xd800 && codePoint <= 0xdbff && i + 1 < n) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint = (codePoint - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    h ^= codePoint;
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Deterministic number in [0, 1) derived from any list of labels. */
export const randomAt = (...parts) => parseInt(hash(parts), 16) / 4294967296;

/** Deterministic shuffle: each position draws a seeded rank and the list is sorted by it. */
export function shuffled(values, seed) {
  return values
    .map((value, index) => ({ value, rank: randomAt(seed, index) }))
    .sort((a, b) => a.rank - b.rank)
    .map(entry => entry.value);
}

/** The day's weather, the same for every run with this seed. */
export function weatherOf(seed, day) {
  const r = randomAt(seed, day, 'daily-weather');
  return r < 0.5 ? 'sunny' : r < 0.8 ? 'cloudy' : 'rain';
}

/** Clock time of a tick ("07:00" for tick 0 and the first slot of each day). */
export const timeOf = tick => SLOT_TIMES[slotOf(tick) - 1];
