import { ACTION_LABELS, ITEM_NAMES, type ActionType, type HistoryPoint, type Summary, type WorldState } from '../types';

function Spark({ data, field, color, label }: { data: HistoryPoint[]; field: keyof HistoryPoint; color: string; label: string }) {
  const values = data.map((d) => Number(d[field]));
  const w = 150;
  const h = 34;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - ((v - min) / span) * (h - 4) - 2}`)
    .join(' ');
  return (
    <div className="spark">
      <div>
        <span>{label}</span>
        <b>{values.at(-1) ?? 0}</b>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
        <polyline points={pts} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export function StatsPanel({ summary, state }: { summary: Summary; state: WorldState }) {
  const actions = Object.entries(summary.actions).sort((a, b) => b[1] - a[1]);
  const maxCount = Math.max(1, ...actions.map(([, v]) => v));
  const failed = Object.values(summary.failed_actions).reduce((a, b) => a + b, 0);
  const res = summary.resources;
  return (
    <section className="panel stats" data-testid="stats">
      <h3>統計</h3>
      <div className="kpis">
        <div><b>{summary.total_actions}</b><span>行動次數</span></div>
        <div><b>{failed}</b><span>失敗行動</span></div>
        <div><b data-testid="social-count">{summary.social_interactions}</b><span>社交互動</span></div>
        <div><b>{summary.cooperations}</b><span>合作</span></div>
        <div><b>{summary.invitations_fulfilled}/{summary.invitations}</b><span>邀約赴約</span></div>
        <div><b>{summary.transactions}</b><span>交易</span></div>
        <div><b>{summary.events}</b><span>突發事件</span></div>
        <div><b>{summary.goals_done}/{Object.keys(state.residents).length}</b><span>達成目標</span></div>
      </div>
      <div className="stat-grid">
        <div>
          <h4>資源</h4>
          <div className="kv small">
            <span>居民總資金</span><b>{res.money_total} 元</b>
            <span>市場貨架</span>
            <b>{Object.entries(res.market_shelf).map(([k, v]) => `${ITEM_NAMES[k]}${v}`).join(' ')}</b>
            <span>市場倉庫</span>
            <b>{Object.entries(res.market_warehouse).map(([k, v]) => `${ITEM_NAMES[k]}${v}`).join(' ')}</b>
            <span>咖啡廳套餐</span><b>{res.cafe_meals} 份</b>
            <span>故障設備</span>
            <b className={res.broken_equipment.length ? 'warn' : ''}>{res.broken_equipment.join('、') || '無'}</b>
            <span>平均熟悉／信任</span><b>{summary.avg_familiarity} ／ {summary.avg_trust}</b>
            <span>帳本稽核</span>
            <b className={summary.audit.length ? 'warn' : 'ok'}>{summary.audit.length ? summary.audit.join('；') : '✓ 無負庫存、無重複交易'}</b>
          </div>
        </div>
        <div>
          <h4>趨勢</h4>
          <Spark data={summary.history} field="money_total" color="#e9c46a" label="總資金" />
          <Spark data={summary.history} field="market_stock" color="#81b29a" label="市場貨架總量" />
          <Spark data={summary.history} field="avg_hunger" color="#e76f51" label="平均飢餓" />
          <Spark data={summary.history} field="social_total" color="#8d6cab" label="累計社交互動" />
        </div>
        <div>
          <h4>行動分布</h4>
          {actions.map(([k, v]) => (
            <div className="hbar" key={k}>
              <span>{ACTION_LABELS[k as ActionType] ?? k}</span>
              <div>
                <i style={{ width: `${(v / maxCount) * 100}%` }} />
                {summary.failed_actions[k] ? <i className="f" style={{ width: `${(summary.failed_actions[k] / maxCount) * 100}%` }} /> : null}
              </div>
              <b>{v}</b>
            </div>
          ))}
          {actions.length === 0 && <p className="empty">尚無資料</p>}
        </div>
      </div>
    </section>
  );
}

const EVENT_BUTTONS = [
  { type: 'market_shortage', label: '📦 市場缺貨', hint: '清空麵包與蔬菜，隔天清晨也不補貨' },
  { type: 'equipment_failure', label: '⚠ 設備故障', hint: '隨機一台設備故障，要修理工帶零件來修' },
  { type: 'community_event', label: '🎉 社區活動', hint: '王姐在公告欄宣布傍晚廣場聚會' },
];

export function EventTriggers({
  state,
  disabled,
  onTrigger,
}: {
  state: WorldState;
  disabled: boolean;
  onTrigger: (type: string) => void;
}) {
  const active = state.events.filter((e) => !e.resolved && e.start_tick <= state.tick && state.tick < e.end_tick);
  return (
    <section className="panel triggers">
      <h3>突發事件</h3>
      <div className="trigger-buttons">
        {EVENT_BUTTONS.map((b) => (
          <button key={b.type} onClick={() => onTrigger(b.type)} disabled={disabled} title={b.hint} data-testid={`trigger-${b.type}`}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="active-events">
        {active.length === 0 ? (
          <span className="empty">目前沒有進行中的事件</span>
        ) : (
          active.map((e) => (
            <div key={e.id} className={`ev ${e.type}`}>
              <b>{e.title}</b> {e.detail}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
