import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { ResidentDetail, ResidentList } from './components/Residents';
import { EventTriggers, StatsPanel } from './components/Stats';
import { Timeline } from './components/Timeline';
import { TopBar } from './components/TopBar';
import { PhaserTown } from './game/PhaserTown';
import type { Config, LogEntry, Payload, Summary, WorldState } from './types';

const BASE_INTERVAL = 2600; // 1× 速度時，每個時段間隔（毫秒）

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [state, setState] = useState<WorldState | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [version, setVersion] = useState(0);
  const [selected, setSelected] = useState<string | null>('lin');
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const runningRef = useRef(false);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  const interval = BASE_INTERVAL / speed;
  const animMs = Math.min(1600, interval * 0.75);

  const notify = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast((t) => (t?.text === text ? null : t)), 3500);
  }, []);

  const apply = useCallback((payload: Payload) => {
    setConfig(payload.config);
    setState(payload.state);
    setSummary(payload.summary);
    setEntries(payload.new_entries);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    api.state().then(apply).catch((e) => notify(`無法連線到後端：${e.message}`, true));
  }, [apply, notify]);

  const step = useCallback(async () => {
    setBusy(true);
    try {
      const payload = await api.step();
      apply(payload);
      if (payload.state.tick >= payload.state.days * 6) {
        runningRef.current = false;
        setRunning(false);
        notify('模擬結束！可以匯出 JSON 或重置世界。');
      }
    } catch (e) {
      runningRef.current = false;
      setRunning(false);
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }, [apply, notify]);

  const run = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    while (runningRef.current) {
      const started = performance.now();
      await step();
      const wait = BASE_INTERVAL / speedRef.current - (performance.now() - started);
      if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
    }
  }, [step]);

  const pause = () => {
    runningRef.current = false;
    setRunning(false);
  };

  const act = async (fn: () => Promise<Payload>, message: string) => {
    pause();
    try {
      apply(await fn());
      notify(message);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const save = async () => {
    try {
      const res = await api.save('quicksave');
      notify(`已儲存（第 ${res.tick} 個時段）到伺服器 saves/quicksave.json`);
    } catch (e) {
      notify((e as Error).message, true);
    }
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const snapshot = data.format === 'ai-town-v6-export' ? data.final_state : data;
      await act(() => api.loadSnapshot(snapshot), `已從 ${file.name} 還原世界`);
    } catch (e) {
      notify(`匯入失敗：${(e as Error).message}`, true);
    }
  };

  const freshIds = new Set(entries.map((e) => e.id));
  const resident = state && selected ? state.residents[selected] : null;

  return (
    <div className="app">
      <TopBar
        config={config}
        state={state}
        running={running}
        busy={busy}
        speed={speed}
        onRun={run}
        onPause={pause}
        onStep={step}
        onSpeed={setSpeed}
        onReset={(seed, mode) => act(() => api.reset(seed, mode), '世界已重置為初始狀態')}
        onSave={save}
        onLoad={() => act(() => api.load('quicksave'), '已載入 quicksave')}
        onImport={importFile}
        onExport={() => {
          window.location.href = api.exportUrl;
        }}
      />
      {config && config.requested === 'llm' && config.mode !== 'llm' && (
        <div className="notice">⚠ 要求使用 LLM Mode，但{config.reason}。</div>
      )}
      <main className="layout">
        <div className="left">
          <section className="panel map-panel">
            <PhaserTown
              state={state}
              entries={entries}
              version={version}
              animMs={animMs}
              selected={selected}
              onSelect={setSelected}
            />
            <p className="map-hint">點選地圖上的居民或右側清單查看詳情。數字標籤是即時庫存；所有變化都來自引擎驗證過的行動。</p>
          </section>
          {state && <EventTriggers state={state} disabled={busy || state.tick >= state.days * 6} onTrigger={(t) => act(() => api.trigger(t), '事件已觸發')} />}
          {state && summary && <StatsPanel summary={summary} state={state} />}
        </div>
        <div className="right">
          {state && (
            <section className="panel">
              <h3>居民（{Object.keys(state.residents).length}）</h3>
              <ResidentList state={state} selected={selected} onSelect={setSelected} />
            </section>
          )}
          {state && resident && (
            <section className="panel">
              <ResidentDetail state={state} resident={resident} version={version} />
            </section>
          )}
          {state && <Timeline state={state} selected={selected} freshIds={freshIds} onSelect={setSelected} />}
        </div>
      </main>
      {toast && <div className={`toast ${toast.error ? 'error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
