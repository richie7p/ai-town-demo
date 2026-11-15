import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  ACTION_ICONS,
  ITEM_NAMES,
  SLOTS,
  type DecisionSource,
  type Resident,
  type WorldState,
} from '../types';

const SOURCE_LABEL: Record<DecisionSource, string> = {
  rule: '規則決策',
  llm: 'LLM 決策',
  llm_fallback: 'LLM 失敗 → 規則備援',
  engine: '引擎強制',
};

export function locName(state: WorldState, id: string) {
  return state.locations[id]?.name ?? id;
}

function clock(tick: number) {
  return `D${Math.floor(tick / 6) + 1} ${SLOTS[tick % 6]}`;
}

function Bar({ label, value, invert, color }: { label: string; value: number; invert?: boolean; color: string }) {
  const bad = invert ? value >= 70 : value <= 25;
  return (
    <div className={`bar ${bad ? 'bad' : ''}`}>
      <span>{label}</span>
      <div>
        <i style={{ width: `${value}%`, background: color }} />
      </div>
      <b>{value}</b>
    </div>
  );
}

export function ResidentList({
  state,
  selected,
  onSelect,
}: {
  state: WorldState;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="resident-list" data-testid="resident-list">
      {Object.values(state.residents).map((r) => (
        <button
          key={r.id}
          className={`resident-card ${selected === r.id ? 'selected' : ''}`}
          onClick={() => onSelect(r.id)}
          data-testid={`resident-${r.id}`}
        >
          <span className="dot" style={{ background: r.color }} />
          <span className="who">
            <b>{r.name}</b>
            <small>{r.occupation}</small>
          </span>
          <span className="where">
            {r.last_action ? (r.last_success ? ACTION_ICONS[r.last_action.type] : '❌') : '🌅'} {r.activity}
            <small>📍{locName(state, r.location)}</small>
          </span>
          <span className="mini">
            <i title={`飢餓 ${r.needs.hunger}`} style={{ height: `${r.needs.hunger}%`, background: '#e76f51' }} />
            <i title={`精力 ${r.needs.energy}`} style={{ height: `${r.needs.energy}%`, background: '#2a9d8f' }} />
            <i title={`孤單 ${r.needs.social}`} style={{ height: `${r.needs.social}%`, background: '#8d6cab' }} />
          </span>
        </button>
      ))}
    </div>
  );
}

type Tab = 'status' | 'relations' | 'memory' | 'facts' | 'view';

export function ResidentDetail({ state, resident, version }: { state: WorldState; resident: Resident; version: number }) {
  const [tab, setTab] = useState<Tab>('status');
  const [view, setView] = useState<Record<string, unknown> | null>(null);
  const r = resident;

  useEffect(() => {
    if (tab !== 'view') return;
    api.perception(r.id).then(setView).catch(() => setView(null));
  }, [tab, r.id, version]);

  const inventory = Object.entries(r.inventory);
  const invites = Object.values(state.invitations).filter((i) => i.by === r.id || i.to === r.id);
  const goalPct = Math.min(100, Math.round((r.goal.progress / r.goal.target) * 100));

  return (
    <div className="detail" data-testid="resident-detail">
      <div className="detail-head">
        <span className="avatar" style={{ background: r.color }}>{r.name.slice(-1)}</span>
        <div>
          <h2>
            {r.name} <small>{r.occupation}</small>
          </h2>
          <div className="tags">
            {r.personality.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <p className="bio">{r.bio}</p>
        </div>
      </div>

      <div className={`decision ${r.decision_source}`}>
        <div className="decision-top">
          <span className="src">{SOURCE_LABEL[r.decision_source]}</span>
          <span>📍 {locName(state, r.location)} · {r.activity}</span>
        </div>
        <p>
          <b>當前目標：</b>
          {r.intention}
        </p>
        <p className="reason">
          <b>{r.decision_source === 'llm' ? 'LLM 理由：' : '決策依據：'}</b>
          {r.reasoning}
        </p>
        {r.fallback_reason ? <p className="fallback">備援原因：{r.fallback_reason}</p> : null}
        {r.last_result ? <p className={`result ${r.last_success ? '' : 'fail'}`}>結果：{r.last_result}</p> : null}
      </div>

      <nav className="tabs">
        {(
          [
            ['status', '狀態'],
            ['relations', '人際'],
            ['memory', `記憶 ${r.memories.length}`],
            ['facts', `知識 ${Object.keys(r.facts).length}`],
            ['view', '它看到的世界'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button key={key} className={tab === key ? 'on' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'status' && (
        <div className="tab-body">
          <Bar label="飢餓" value={r.needs.hunger} invert color="#e76f51" />
          <Bar label="精力" value={r.needs.energy} color="#2a9d8f" />
          <Bar label="孤單" value={r.needs.social} invert color="#8d6cab" />
          <div className="kv">
            <span>💰 金錢</span>
            <b>{r.money} 元</b>
            <span>🎒 物品</span>
            <b>{inventory.length ? inventory.map(([k, v]) => `${ITEM_NAMES[k] ?? k}×${v}`).join('、') : '（空）'}</b>
            <span>📈 紀錄</span>
            <b>
              {Object.entries(r.counters)
                .map(([k, v]) => `${COUNTER_NAMES[k] ?? k} ${v}`)
                .join('、') || '—'}
            </b>
          </div>
          <div className="goal">
            <div>
              🎯 {r.goal.text} {r.goal.done ? <span className="done">已達成</span> : null}
            </div>
            <div className="goal-bar">
              <i style={{ width: `${goalPct}%` }} />
              <b>
                {r.goal.progress} / {r.goal.target}
              </b>
            </div>
          </div>
          {invites.length > 0 && (
            <div className="invites">
              <h4>邀約</h4>
              {invites.map((i) => {
                const other = state.residents[i.by === r.id ? i.to : i.by];
                return (
                  <div key={i.id} className={`invite ${i.status}`}>
                    {i.by === r.id ? '我約' : '被約'} {other.name} · 第 {i.day} 天{SLOTS[i.slot]} ·{' '}
                    {locName(state, i.location)} <em>{INVITE_STATUS[i.status] ?? i.status}</em>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'relations' && (
        <div className="tab-body">
          <table className="rel">
            <thead>
              <tr>
                <th>對象</th>
                <th>熟悉度</th>
                <th>信任</th>
                <th>互動</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(r.relations)
                .sort((a, b) => b[1].familiarity - a[1].familiarity)
                .map(([id, rel]) => (
                  <tr key={id}>
                    <td>
                      <span className="dot" style={{ background: state.residents[id]?.color }} />
                      {state.residents[id]?.name}
                    </td>
                    <td>
                      <div className="cell-bar">
                        <i style={{ width: `${rel.familiarity}%` }} />
                        {rel.familiarity}
                      </div>
                    </td>
                    <td>
                      <div className="cell-bar trust">
                        <i style={{ width: `${rel.trust}%` }} />
                        {rel.trust}
                      </div>
                    </td>
                    <td>{rel.interactions}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'memory' && (
        <ol className="tab-body memories">
          {[...r.memories].reverse().map((m, i) => (
            <li key={i} className={`imp${m.importance}`}>
              <small>{clock(m.tick)}</small> {m.text}
            </li>
          ))}
          {r.memories.length === 0 && <li>還沒有記憶</li>}
        </ol>
      )}

      {tab === 'facts' && (
        <ul className="tab-body facts">
          {Object.values(r.facts).map((f) => (
            <li key={f.id}>
              {f.text}
              <small>
                {clock(f.learned_tick)} ·{' '}
                {f.source === 'seen'
                  ? '親眼看到'
                  : f.source === 'board'
                    ? '公告欄'
                    : f.source === 'supplier'
                      ? '供應商通知'
                      : f.source === 'organizer'
                        ? '自己發起'
                        : `聽${state.residents[f.source]?.name ?? f.source}說`}
              </small>
            </li>
          ))}
          {Object.keys(r.facts).length === 0 && <li className="empty">目前不知道任何特別的消息（其他人知道的事，它不一定知道）</li>}
        </ul>
      )}

      {tab === 'view' && (
        <div className="tab-body perception">
          <p className="hint">這是 Agent 做決策時「唯一」能看到的資料（非全知視角）。</p>
          <pre>{view ? JSON.stringify(view, null, 1) : '讀取中…'}</pre>
        </div>
      )}
    </div>
  );
}

const COUNTER_NAMES: Record<string, string> = {
  work: '工作',
  meals: '用餐',
  chats: '聊天',
  purchases: '購物',
  furniture: '家具',
  illustrations: '插畫',
  repairs: '修理',
  meals_made: '做套餐',
  cooperations: '合作',
  event_attendance: '活動人數',
};

const INVITE_STATUS: Record<string, string> = {
  pending: '等待回覆',
  accepted: '已答應',
  declined: '婉拒',
  fulfilled: '已赴約',
  broken: '被放鴿子',
  expired: '雙方都沒到',
};
