import { useRef, useState } from 'react';
import { SLOT_TIMES, SLOTS, type Config, type WorldState } from '../types';

interface Props {
  config: Config | null;
  state: WorldState | null;
  running: boolean;
  busy: boolean;
  speed: number;
  onRun: () => void;
  onPause: () => void;
  onStep: () => void;
  onSpeed: (s: number) => void;
  onReset: (seed?: number, mode?: 'rule' | 'llm') => void;
  onSave: () => void;
  onLoad: () => void;
  onImport: (file: File) => void;
  onExport: () => void;
}

export const SPEEDS = [0.5, 1, 2, 4];

export function TopBar(p: Props) {
  const [seed, setSeed] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const state = p.state;
  const total = state ? state.days * 6 : 18;
  const tick = state?.tick ?? 0;
  const finished = state ? tick >= total : false;
  const slot = tick % 6;
  const day = Math.min(Math.floor(tick / 6) + 1, state?.days ?? 3);
  const llm = p.config?.mode === 'llm';

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo">🏘️</span>
        <div>
          <h1>AI Town v6.0</h1>
          <small>互動式多 Agent 小鎮 DEMO</small>
        </div>
      </div>

      <div
        className={`mode-badge ${llm ? 'llm' : 'rule'}`}
        title={p.config?.reason ?? ''}
        data-testid="mode-badge"
      >
        {llm ? `LLM Mode · ${p.config?.model}` : 'Rule-based Mode'}
        <small>{llm ? '由 Claude 決策，失敗時會標示為規則備援' : '規則型 Agent（非 LLM 推理）'}</small>
      </div>

      <div className="clock" data-testid="clock">
        {finished ? (
          <strong>模擬結束</strong>
        ) : (
          <strong>
            第 {day} 天 · {SLOTS[slot]} <span>{SLOT_TIMES[slot]}</span>
          </strong>
        )}
        <div className="slots">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < tick ? 'done' : i === tick ? 'now' : ''} title={`第 ${Math.floor(i / 6) + 1} 天 ${SLOTS[i % 6]}`} />
          ))}
        </div>
      </div>

      <div className="controls">
        {p.running ? (
          <button onClick={p.onPause} className="primary">⏸ 暫停</button>
        ) : (
          <button onClick={p.onRun} className="primary" disabled={finished}>▶ 開始</button>
        )}
        <button onClick={p.onStep} disabled={p.running || p.busy || finished}>⏭ 單步</button>
        <label className="speed">
          速度
          <select value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s}×</option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <input
          className="seed"
          placeholder={`seed ${state?.seed ?? ''}`}
          value={seed}
          onChange={(e) => setSeed(e.target.value.replace(/\D/g, ''))}
          title="輸入新的 seed 後按重置；留空則用目前的 seed"
        />
        <button onClick={() => p.onReset(seed ? Number(seed) : undefined)}>↺ 重置</button>
        {p.config?.llm_available || p.config?.requested === 'llm' ? (
          <button onClick={() => p.onReset(seed ? Number(seed) : undefined, llm ? 'rule' : 'llm')}>
            切換到{llm ? '規則' : 'LLM'}
          </button>
        ) : null}
        <span className="sep" />
        <button onClick={p.onSave} title="存到伺服器 saves/quicksave.json">💾 儲存</button>
        <button onClick={p.onLoad} title="讀取伺服器上的 quicksave">📂 載入</button>
        <button onClick={() => file.current?.click()} title="從 JSON 檔還原世界">📥 匯入</button>
        <button onClick={p.onExport} title="下載事件紀錄、交易、統計與最終狀態">⬇ 匯出 JSON</button>
        <input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) p.onImport(f);
            e.target.value = '';
          }}
        />
      </div>
    </header>
  );
}
