// Shared constants and deterministic helpers for the V5 research engine.
//
// Everything here is part of the replay contract: changing a persona, a zone,
// the clock or the seeded helpers changes every saved run's checksums.

/** Replay/engine format. Saved runs are only accepted by the same version. */
export const VERSION = 'demo-0.1.0';
export const DAYS = 10;
export const TICKS_PER_DAY = 12;
/** One run lasts ten days of twelve slots. */
export const TOTAL_TICKS = DAYS * TICKS_PER_DAY;

/** The four districts. Two of them lend one kind of equipment each. */
export const ZONES = {
  home: { name: '住宅區', subtitle: '休息・閱讀', color: '#c2926a' },
  workshop: { name: '工坊', subtitle: '製作・修理', color: '#d29441', resource: 'tools' },
  plaza: { name: '公共廣場', subtitle: '交談・散步', color: '#679b75' },
  studio: { name: '活動區', subtitle: '攝影・共同活動', color: '#698cad', resource: 'camera' },
};

/** The eight residents, before the seeded shuffle assigns ids and starting zones. */
export const PERSONAS = [
  { name: '小禾', interests: '模型製作、植物', style: '先規劃，願意解釋步驟', goal: 'workshop', color: '#367760' },
  { name: '阿光', interests: '攝影、散步', style: '較即興，喜歡分享', goal: 'studio', color: '#c48940' },
  { name: '木木', interests: '修理、閱讀', style: '較安靜，可以直接拒絕', goal: 'workshop', color: '#6c7ba7' },
  { name: '小苒', interests: '手作、裝飾', style: '交換想法，也能獨立進行', goal: 'workshop', color: '#b27077' },
  { name: '日青', interests: '攝影、日記', style: '先觀察，再決定是否加入', goal: 'studio', color: '#5d9b9e' },
  { name: '阿岚', interests: '設計、散步', style: '願意嘗試新活動', goal: 'studio', color: '#88805b' },
  { name: '知序', interests: '修理、整理工具', style: '重視時間與歸還', goal: 'workshop', color: '#8e719d' },
  { name: '小麥', interests: '手作、閱讀', style: '有自己的計畫，也可改變安排', goal: 'workshop', color: '#ae7655' },
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
