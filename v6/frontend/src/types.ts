// 與後端 aitown/models.py 對應的型別（只列出前端用到的欄位）

export type ActionType = 'move' | 'work' | 'rest' | 'eat' | 'shop' | 'chat' | 'invite' | 'cooperate';
export type DecisionSource = 'rule' | 'llm' | 'llm_fallback' | 'engine';

export interface Needs {
  hunger: number;
  energy: number;
  social: number;
}

export interface Relation {
  familiarity: number;
  trust: number;
  interactions: number;
  last_tick: number | null;
}

export interface Memory {
  tick: number;
  kind: string;
  text: string;
  with_ids: string[];
  importance: number;
}

export interface Fact {
  id: string;
  text: string;
  learned_tick: number;
  source: string;
  importance: number;
}

export interface Action {
  type: ActionType;
  location: string;
  target?: string | null;
  item?: string | null;
  quantity?: number;
  say?: string | null;
}

export interface Resident {
  id: string;
  name: string;
  job: string;
  occupation: string;
  color: string;
  personality: string[];
  traits: Record<string, number>;
  bio: string;
  home: string;
  location: string;
  prev_location: string;
  needs: Needs;
  money: number;
  inventory: Record<string, number>;
  goal: { kind: string; target: number; text: string; progress: number; done: boolean };
  intention: string;
  reasoning: string;
  decision_source: DecisionSource;
  fallback_reason: string | null;
  activity: string;
  last_action: Action | null;
  last_result: string;
  last_success: boolean;
  memories: Memory[];
  facts: Record<string, Fact>;
  relations: Record<string, Relation>;
  counters: Record<string, number>;
}

export interface Equipment {
  id: string;
  name: string;
  working: boolean;
}

export interface Location {
  id: string;
  name: string;
  kind: 'home' | 'market' | 'cafe' | 'workshop' | 'plaza';
  owner: string | null;
  open_slots: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  equipment: Record<string, Equipment>;
  stock: Record<string, number>;
  warehouse: Record<string, number>;
  notices: { fact_id: string; text: string; posted_tick: number; by: string }[];
}

export interface LogEntry {
  id: string;
  tick: number;
  day: number;
  slot: number;
  kind: string;
  actor: string | null;
  targets: string[];
  location: string | null;
  action: ActionType | null;
  success: boolean;
  text: string;
  reason: string;
  changes: string[];
  source: DecisionSource;
  say: string | null;
}

export interface Invitation {
  id: string;
  by: string;
  to: string;
  location: string;
  day: number;
  slot: number;
  purpose: string;
  status: string;
  note: string;
}

export interface ActiveEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  start_tick: number;
  end_tick: number;
  location: string | null;
  params: Record<string, unknown>;
  resolved: boolean;
}

export interface WorldState {
  version: string;
  seed: number;
  days: number;
  tick: number;
  mode: 'rule' | 'llm';
  residents: Record<string, Resident>;
  locations: Record<string, Location>;
  invitations: Record<string, Invitation>;
  log: LogEntry[];
  events: ActiveEvent[];
  counters: Record<string, number>;
}

export interface HistoryPoint {
  tick: number;
  money_total: number;
  market_stock: number;
  cafe_meals: number;
  avg_hunger: number;
  avg_energy: number;
  avg_social: number;
  social_total: number;
}

export interface Summary {
  tick: number;
  day: number;
  slot: number;
  finished: boolean;
  actions: Record<string, number>;
  failed_actions: Record<string, number>;
  decision_sources: Record<string, number>;
  total_actions: number;
  social_interactions: number;
  chats: number;
  invitations: number;
  invitations_fulfilled: number;
  cooperations: number;
  events: number;
  transactions: number;
  money_flow: number;
  resources: {
    money_total: number;
    market_shelf: Record<string, number>;
    market_warehouse: Record<string, number>;
    cafe_meals: number;
    broken_equipment: string[];
  };
  avg_familiarity: number;
  avg_trust: number;
  goals_done: number;
  history: HistoryPoint[];
  audit: string[];
}

export interface Config {
  requested: string;
  mode: 'rule' | 'llm';
  model: string | null;
  llm_available: boolean;
  reason: string;
  seed: number;
  days: number;
  slots: string[];
}

export interface Payload {
  config: Config;
  state: WorldState;
  summary: Summary;
  new_entries: LogEntry[];
}

export const SLOTS = ['清晨', '上午', '中午', '下午', '傍晚', '夜晚'];
export const SLOT_TIMES = ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00'];
export const ITEM_NAMES: Record<string, string> = {
  bread: '麵包',
  vegetables: '蔬菜',
  meal: '套餐',
  wood: '木材',
  parts: '零件',
};
export const ACTION_LABELS: Record<ActionType, string> = {
  move: '移動',
  work: '工作',
  rest: '休息',
  eat: '吃飯',
  shop: '購物',
  chat: '聊天',
  invite: '邀約',
  cooperate: '合作',
};
export const ACTION_ICONS: Record<ActionType, string> = {
  move: '🚶',
  work: '🔨',
  rest: '💤',
  eat: '🍽️',
  shop: '🛒',
  chat: '💬',
  invite: '💌',
  cooperate: '🤝',
};
