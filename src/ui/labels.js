// Wording shared by the page: event kinds, journal filters and time of day.
import { SLOT_TIMES } from '../config.js';

/** Journal label for each event type. */
export const EVENT_LABELS = {
  talk: '交談',
  reply: '回覆',
  invite: '邀請合作',
  accept: '接受邀請',
  decline: '婉拒邀請',
  borrow: '借用成功',
  borrow_attempt: '借用嘗試',
  capacity_failure: '設備不足',
  return: '提前歸還',
  release: '歸還完成',
  move: '移動',
  work: '設備活動',
  join: '加入合作',
  cooperation: '合作完成',
  interaction: '互動日證據',
  initiation: '發起已驗證',
  invitation_outcome: '邀請結算',
  rest: '休息',
  walk: '散步',
  wait: '等待',
  cook: '煮飯',
  eat: '吃飯',
  shower: '洗澡',
  sleep: '睡覺',
  exercise: '運動',
  invalid: '無效行動',
  join_failed: '未能加入',
};

export const FAILURE_KINDS = ['invalid', 'capacity_failure', 'join_failed'];
/** Everyday moments: what the journal and "recent" list show by default. */
export const LIFE_KINDS = [
  'talk',
  'reply',
  'invite',
  'accept',
  'decline',
  'cooperation',
  'work',
  'move',
  'rest',
  'walk',
  'wait',
  'borrow',
  'cook',
  'eat',
  'shower',
  'exercise',
];
/** Looking after oneself: meals, washing, exercise and sleep (including the night). */
export const HOME_KINDS = ['cook', 'eat', 'shower', 'exercise', 'sleep', 'rest'];

/** Event types shown by each journal filter (missing filter: everything). */
export const JOURNAL_FILTERS = {
  life: LIFE_KINDS,
  home: HOME_KINDS,
  social: [
    'talk',
    'reply',
    'invite',
    'accept',
    'decline',
    'cooperation',
    'interaction',
    'initiation',
    'invitation_outcome',
    'join',
  ],
  equipment: ['borrow', 'borrow_attempt', 'capacity_failure', 'return', 'release', 'work'],
  failed: FAILURE_KINDS,
};

const PHASES = ['清晨，慢慢醒來', '上午，各自忙碌', '午後，走走聊聊', '傍晚，回家吃飯'];
/** Time of day for a slot (1–12): the clock time and one of four phases of three slots each. */
export const phaseOfSlot = slot => `${SLOT_TIMES[slot - 1]} · ${PHASES[Math.floor((slot - 1) / 3)]}`;
export const NIGHT_LABEL = '深夜 · 大家都睡了';

/** "A8" for the ample condition, "B2"/"B3" for the low-capacity ones. */
export const conditionName = capacity => (capacity === 8 ? 'A8' : 'B' + capacity);

export const equipmentLabel = type => (type === 'tools' ? '製作工具' : '攝影設備');
