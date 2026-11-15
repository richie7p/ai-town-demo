import { useMemo, useState } from 'react';
import { ACTION_ICONS, SLOTS, type LogEntry, type WorldState } from '../types';

type Filter = 'all' | 'social' | 'event' | 'fail' | 'selected';

const KIND_ICON: Record<string, string> = {
  chat: '💬',
  invite: '💌',
  cooperate: '🤝',
  meeting: '📅',
  event: '⚡',
  goal: '🎯',
  system: '🕰️',
};

const SOURCE_TAG: Record<string, string> = { rule: '規則', llm: 'LLM', llm_fallback: '備援', engine: '' };

export function Timeline({
  state,
  selected,
  freshIds,
  onSelect,
}: {
  state: WorldState;
  selected: string | null;
  freshIds: Set<string>;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [hideRoutine, setHideRoutine] = useState(true);

  const rows = useMemo(() => {
    let list = state.log;
    if (filter === 'social') list = list.filter((e) => ['chat', 'invite', 'cooperate', 'meeting'].includes(e.kind));
    if (filter === 'event') list = list.filter((e) => e.kind === 'event' || e.kind === 'goal');
    if (filter === 'fail') list = list.filter((e) => !e.success);
    if (filter === 'selected' && selected)
      list = list.filter((e) => e.actor === selected || e.targets.includes(selected));
    if (hideRoutine && filter === 'all')
      list = list.filter((e) => !(e.success && (e.action === 'rest' || e.action === 'move') && e.kind === 'action'));
    return [...list].reverse().slice(0, 250);
  }, [state.log, filter, hideRoutine, selected]);

  return (
    <section className="panel timeline" data-testid="timeline">
      <header>
        <h3>事件時間軸</h3>
        <div className="filters">
          {(
            [
              ['all', '全部'],
              ['social', '社交'],
              ['event', '事件'],
              ['fail', '失敗'],
              ['selected', '選取的居民'],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button key={key} className={filter === key ? 'on' : ''} onClick={() => setFilter(key)} disabled={key === 'selected' && !selected}>
              {label}
            </button>
          ))}
          <label>
            <input type="checkbox" checked={hideRoutine} onChange={(e) => setHideRoutine(e.target.checked)} /> 隱藏日常休息
          </label>
        </div>
      </header>
      <ol>
        {rows.map((e) => (
          <Row key={e.id} entry={e} fresh={freshIds.has(e.id)} onSelect={onSelect} />
        ))}
        {rows.length === 0 && <li className="empty">還沒有紀錄，按「單步」或「開始」推進模擬。</li>}
      </ol>
    </section>
  );
}

function Row({ entry: e, fresh, onSelect }: { entry: LogEntry; fresh: boolean; onSelect: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const icon = KIND_ICON[e.kind] ?? (e.action ? ACTION_ICONS[e.action] : '•');
  return (
    <li className={`row ${e.kind} ${e.success ? '' : 'fail'} ${fresh ? 'fresh' : ''}`}>
      <span className="when">
        D{e.day} {SLOTS[e.slot]}
      </span>
      <span className="icon">{e.success ? icon : '❌'}</span>
      <div className="what">
        <p>
          <span className="text" onClick={() => e.actor && onSelect(e.actor)}>
            {e.text}
          </span>
          {SOURCE_TAG[e.source] ? <em className={`src ${e.source}`}>{SOURCE_TAG[e.source]}</em> : null}
        </p>
        {e.reason && <p className="reason">原因：{e.reason}</p>}
        {e.say && (
          <div className="say">
            {e.say.split('\n').map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
        {e.changes.length > 0 && (
          <div className="changes">
            {(open ? e.changes : e.changes.slice(0, 3)).map((c, i) => (
              <span key={i}>{c}</span>
            ))}
            {e.changes.length > 3 && (
              <button onClick={() => setOpen(!open)}>{open ? '收起' : `+${e.changes.length - 3} 項變化`}</button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
