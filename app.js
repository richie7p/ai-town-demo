// Page controller: playback, background jobs and wiring between the HTML
// controls, the side panels and the Phaser town scene.
//
// The run (`world`) only grows. `frames` holds one view frame per executed tick
// and `cursor` is the tick being shown; playing from an earlier cursor replays
// saved frames and only runs the policy again once it reaches the newest tick.
import { createWorld, step } from './src/engine.js';
import { propose } from './src/policy.js';
import { exportRun } from './src/replay.js';
import { viewFrame } from './src/presentation.js';
import { WORLD_SIZE, MIN_ZOOM, MAX_ZOOM } from './src/town-view-model.js';
import { createMinimapDataUrl } from './src/town-map.js';
import { activityAnchor } from './src/activity-anchors.js';
import { createTownScene } from './src/town-scene.js';
import {
  ZONES,
  ACTION_NAMES,
  NEEDS,
  WEATHER,
  TOTAL_TICKS,
  TICKS_PER_DAY,
  dayOf,
  slotOf,
  weatherOf,
} from './src/config.js';
import { $, escapeHTML, percent, reducedMotion, scrollBehavior, setHTML, setText } from './src/ui/dom.js';
import { conditionName, phaseOfSlot, NIGHT_LABEL } from './src/ui/labels.js';
import { createJournal } from './src/ui/journal.js';
import {
  portrait,
  profileHTML,
  nowTabHTML,
  memoryTabHTML,
  connectionsTabHTML,
  networkSVG,
  pairLinksHTML,
  networkStatsHTML,
  needsHTML,
  eventEvidenceHTML,
  pairEvidenceHTML,
  comparisonHTML,
} from './src/ui/panels.js';

const TABS = ['now', 'memory', 'connections'];
const TAB_RENDERERS = { now: nowTabHTML, memory: memoryTabHTML, connections: connectionsTabHTML };
const MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const TOAST_MS = 5800;
/** Residents animate for 45% of the playback interval, leaving a pause between steps. */
const ANIMATION_SHARE = 0.45;
const SCENE_CONTROLS = ['zoom-in', 'camera-reset', 'camera-follow', 'town-minimap', 'explore-toggle'];
const RUN_CONTROLS = [
  'reset',
  'step',
  'play',
  'finish',
  'compare',
  'import',
  'export',
  'settings-open',
  'latest',
];

// ---------------------------------------------------------------------------
// State

let world = createWorld();
let frames = [viewFrame(world)];
let cursor = 0;
let selectedId = 'A01';
let activeTab = 'now';
let playTimer = null;
let busy = false;
let worker = null;
let toastTimer;
let cameraFollowing = false;
let exploring = false;
let inspectedObject = null;

const frame = () => frames[cursor];
/** Replace the visible text of a button whose icon stays in place. */
const setButtonLabel = (id, text) => {
  const label = $(id).querySelector('.button-label');
  if (label.textContent !== text) label.textContent = text;
};
const resident = id => frame().agents.find(a => a.id === id);
const playbackInterval = () => Number($('speed').value);

// Several panels need every event up to the cursor; compute that prefix once per position.
let pastCache = { events: null, cursor: -1, list: [] };
function pastEvents() {
  if (pastCache.events !== world.events || pastCache.cursor !== cursor)
    pastCache = { events: world.events, cursor, list: world.events.filter(event => event.tick <= cursor) };
  return pastCache.list;
}
const currentView = () => ({ frame: frame(), selected: selectedId, resident, pastEvents: pastEvents() });

const journal = createJournal($('events'));

// ---------------------------------------------------------------------------
// Town scene

const scene = createTownScene($('town-stage'), {
  backgroundColor:
    getComputedStyle(document.documentElement).getPropertyValue('--stage-bg').trim() || undefined,
  onSelect: id => selectResident(id),
  onExploreChange: ({ active, moving, locationName, message }) => {
    exploring = active;
    $('explore-toggle').setAttribute('aria-pressed', String(active));
    setButtonLabel('explore-toggle', active ? '結束探訪' : '探訪小鎮');
    $('explore-status').hidden = !active;
    $('visitor-location').textContent = `${moving ? '前往' : '你在'} · ${locationName || '小鎮步道'}`;
    $('visitor-hint').textContent = message || '點地面行走 · WASD／方向鍵 · E 查看家具';
    $('scene-hint').textContent = active
      ? '點地面走過去 · 點家具查看 · 拖曳移動視角'
      : '點居民看日常 · 點家具看用途 · 拖曳移動視角';
  },
  onInspectObject: object => {
    inspectedObject = object;
    renderInspectedObject();
  },
  onCameraChange: ({ zoom, following, worldView }) => {
    cameraFollowing = following;
    $('zoom-level').textContent = `${Math.round(zoom * 100)}%`;
    $('zoom-out').disabled = zoom <= MIN_ZOOM;
    $('zoom-in').disabled = zoom >= MAX_ZOOM;
    if (worldView) {
      const viewport = $('minimap-viewport').style;
      viewport.left = `${(100 * worldView.x) / WORLD_SIZE.width}%`;
      viewport.top = `${(100 * worldView.y) / WORLD_SIZE.height}%`;
      viewport.width = `${(100 * worldView.width) / WORLD_SIZE.width}%`;
      viewport.height = `${(100 * worldView.height) / WORLD_SIZE.height}%`;
    }
    $('camera-follow').setAttribute('aria-pressed', String(following));
    setButtonLabel('camera-follow', following ? '正在跟隨' : '跟隨居民');
  },
  onReady: ({ renderer, version, minimapUrl }) => {
    $('scene-status').hidden = true;
    $('town-stage').dataset.renderer = renderer;
    $('town-stage').dataset.phaserVersion = version;
    $('minimap-image').src = minimapUrl || createMinimapDataUrl();
    for (const id of SCENE_CONTROLS) $(id).disabled = false;
    setZoneButtonsDisabled(false);
  },
  onError: error => {
    console.error('Town renderer:', error);
    $('scene-status').hidden = false;
    $('scene-status').classList.add('failed');
    $('scene-status').textContent = '小鎮畫面未能載入，請重新整理頁面。居民資料與生活紀錄仍可從下方查看。';
    for (const id of ['zoom-out', ...SCENE_CONTROLS]) $(id).disabled = true;
    setZoneButtonsDisabled(true);
  },
});

function setZoneButtonsDisabled(disabled) {
  for (const button of document.querySelectorAll('[data-zone]')) button.disabled = disabled;
}

function renderScene(animate) {
  scene.render(frame(), {
    selected: selectedId,
    playing: !!playTimer,
    duration: playbackInterval() * ANIMATION_SHARE,
    reducedMotion: reducedMotion.matches,
    animate,
  });
}

// ---------------------------------------------------------------------------
// Rendering

function render({ animate = false } = {}) {
  const current = frame();
  const slot = slotOf(current.tick);
  setText('day-label', `第 ${String(dayOf(current.tick)).padStart(2, '0')} 天`);
  const night = current.tick > 0 && current.tick % TICKS_PER_DAY === 0;
  setText('phase-label', !current.tick ? '07:00 · 清晨，準備出門' : night ? NIGHT_LABEL : phaseOfSlot(slot));
  const weather = weatherOf(current.config.seed, dayOf(current.tick));
  $('weather-icon').setAttribute('href', `#i-${weather}`);
  setText('weather-name', WEATHER[weather].name);
  setText(
    'condition-label',
    `${conditionName(current.config.capacity)} · 每類 ${current.config.capacity} 件設備`,
  );
  setText('timeline-label', `第 ${dayOf(current.tick)} 天 · ${current.tick ? slot : 0} / ${TICKS_PER_DAY}`);
  setText('timeline-total', `${current.tick} / ${TOTAL_TICKS}`);
  $('seek').max = world.tick;
  $('seek').value = cursor;
  setText('view-mode', viewModeLabel());
  $('latest').hidden = cursor === world.tick;

  const view = currentView();
  renderResidentList(current);
  renderInspector(view);
  renderJournal();
  setHTML($('network'), networkSVG(view));
  setHTML($('pair-links'), pairLinksHTML(view));
  setHTML($('network-stats'), networkStatsHTML(view));
  renderInspectedObject();
  renderResearchSummary(current.metrics, current.tick);
  updateControls();
  renderScene(animate);
}

function viewModeLabel() {
  if (busy) return '正在處理';
  if (cursor < world.tick) return '歷史回放';
  if (world.tick === TOTAL_TICKS) return '十日完成';
  return world.tick ? '最新進度' : '尚未開始';
}

/** One button per resident. Portraits only change with a new town; each step updates the label. */
function renderResidentList(current) {
  const list = $('residents');
  if (!list.children.length)
    list.innerHTML = current.agents
      .map(a => `<button class="resident" id="resident-${a.id}" data-agent="${a.id}"></button>`)
      .join('');
  for (const agent of current.agents) {
    const button = $('resident-' + agent.id);
    const proposal = current.trace?.proposals.find(p => p.actor === agent.id);
    const selected = agent.id === selectedId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
    const zone = ZONES[agent.zone].name;
    button.setAttribute(
      'aria-label',
      `${agent.name}，${zone}，${proposal ? ACTION_NAMES[proposal.action] : '準備開始'}`,
    );
    setHTML(
      button,
      `<div class="mini-portrait">${portrait(agent)}</div><strong>${escapeHTML(agent.name)}</strong><small></small>` +
        '<span class="mini-needs" aria-hidden="true"><i></i><i></i><i></i></span>',
    );
    const label = proposal ? ACTION_NAMES[proposal.action] : zone;
    const small = button.querySelector('small');
    if (small.textContent !== label) small.textContent = label;
    const bars = button.querySelector('.mini-needs').children;
    Object.keys(NEEDS).forEach((need, i) => {
      const value = agent.needs?.[need] ?? 0;
      bars[i].style.width = `${value}%`;
      bars[i].classList.toggle('low', value < 30);
    });
  }
}

function renderInspector(view = currentView()) {
  const agent = view.frame.agents.find(a => a.id === selectedId);
  $('agent-zone').textContent = ZONES[agent.zone].name;
  setHTML($('agent-profile'), profileHTML(agent));
  setHTML($('agent-detail'), TAB_RENDERERS[activeTab](view));
}

function renderJournal() {
  const { total, shown } = journal.render({
    pastEvents: pastEvents(),
    filter: $('event-filter').value,
    resident,
    townId: frames[0],
  });
  setText('events-foot', `截至時段 ${cursor} · 此類共 ${total} 筆，顯示最近 ${shown} 筆。點選可回查事件。`);
}

/** The furniture card, with whoever is placed at that piece right now. */
function renderInspectedObject() {
  $('object-card').hidden = !inspectedObject;
  if (!inspectedObject) return;
  $('object-name').textContent = inspectedObject.name;
  $('object-description').textContent = inspectedObject.description;
  $('object-zone').textContent = ZONES[inspectedObject.zone]?.name || '小鎮公共空間';
  const here = frame().agents.filter(agent => activityAnchor(agent, frame()).objectId === inspectedObject.id);
  $('object-occupants').textContent = here.length
    ? `此刻在這裡：${here.map(a => a.name).join('、')}`
    : '此刻沒有居民使用這個位置。';
}

function renderResearchSummary(m, tick) {
  const life = m.life;
  setText('life-meals', life.mealsCooked);
  setText('life-eaten', life.mealsEaten);
  setText('life-cafe', life.cafeMeals);
  setText('life-shared', life.sharedMeals);
  setText('life-showers', life.showers);
  setText('life-workouts', life.workouts);
  setText('life-nights', life.nightsSlept);
  setHTML($('life-needs'), `<span>此刻全體平均</span>${needsHTML(life.averageNeeds)}`);
  setText('progress-value', `${tick} / ${TOTAL_TICKS}`);
  setText('interaction-value', m.interactionDays);
  setText('y-value', m.final ? percent(m.y) : '—');
  setText('y-detail', m.final ? `${m.qualifiedLinks} / 28 對 · 工程示範值` : '尚未完成十日，不顯示最終指標');
  setText('core-value', m.final ? m.persistentCores.length : '—');
  const thresholds = m.final
    ? ` 連結門檻 2／3／4 日：${[2, 3, 4].map(n => percent(m.sensitivity[n])).join('／')}。`
    : '';
  setText(
    'research-detail',
    `設備借用：${m.borrowAttempts} 次合法嘗試、${m.capacityFailures} 次容量失敗（${percent(m.capacityFailureRate)}）。` +
      `合作完成率：${percent(m.cooperationRate)}，分母 ${m.observedInvitations}，尚未到期 ${m.rightCensoredInvitations}。` +
      thresholds +
      ' 全部數值只使用目前回放位置之前的事件。',
  );
}

function updateControls() {
  for (const id of RUN_CONTROLS) $(id).disabled = busy;
  $('seek').disabled = busy || !world.tick;
  if (!busy) {
    $('step').disabled = cursor >= TOTAL_TICKS;
    $('finish').disabled = world.tick >= TOTAL_TICKS;
  }
  const { state, label } = playButtonState();
  $('play').dataset.state = state;
  setButtonLabel('play', label);
  $('playing-dot').classList.toggle('playing', !!playTimer);
}

/** The play button's icon state (start, playing or replay) and label. */
function playButtonState() {
  if (playTimer) return { state: 'playing', label: '暫停生活' };
  if (cursor === TOTAL_TICKS) return { state: 'replay', label: '從頭回放' };
  if (cursor < world.tick) return { state: 'start', label: '播放回放' };
  return { state: 'start', label: cursor ? '繼續生活' : '開始生活' };
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $('toast').hidden = true;
  }, TOAST_MS);
}

// ---------------------------------------------------------------------------
// Playback

/** Stop playing and freeze any walk or sit transition where it is. */
function stop() {
  clearInterval(playTimer);
  playTimer = null;
  updateControls();
  renderScene(false);
}

/** Show the next tick: a saved one when replaying, otherwise run the policy once. */
function advance() {
  // While playing, wait for residents to finish walking or sitting down.
  if (playTimer && scene.isTransitioning()) return;
  try {
    if (cursor < world.tick) cursor++;
    else if (world.tick < TOTAL_TICKS) {
      world = step(world, propose(world));
      frames.push(viewFrame(world));
      cursor = world.tick;
    } else {
      stop();
      return;
    }
    render({ animate: cursor !== TOTAL_TICKS });
    if (cursor === TOTAL_TICKS) {
      stop();
      toast('十日生活已完成，可以從頭回放，或匯出完整紀錄。');
    }
  } catch (error) {
    stop();
    toast(error.message);
  }
}

function togglePlay() {
  if (busy) return;
  if (playTimer) {
    stop();
    return;
  }
  if (cursor === TOTAL_TICKS) {
    cursor = 0;
    render({ animate: false });
  }
  playTimer = setInterval(advance, playbackInterval());
  updateControls();
  if (cursor === 0) advance();
  else render({ animate: false });
}

function jumpTo(tick) {
  stop();
  cursor = tick;
  render();
}

function selectResident(id) {
  if (!resident(id)) return;
  selectedId = id;
  render({ animate: false });
}

/** Replace the run (new town or verified import) and show its first tick. */
function replaceRun(nextWorld, nextFrames, nextCursor) {
  world = nextWorld;
  frames = nextFrames;
  cursor = nextCursor;
}

// ---------------------------------------------------------------------------
// Background jobs (see src/runner-worker.js). The current run stays until a job succeeds.

const JOB_MESSAGES = {
  compare: '正在比較同種子的兩座小鎮，世界與記憶各自獨立…',
  import: '正在驗證紀錄與回放…',
  finish: '正在完成這十天的生活…',
};

function runInBackground(type, payload, onResult) {
  stop();
  busy = true;
  updateControls();
  worker = new Worker(new URL('./src/runner-worker.js', import.meta.url), { type: 'module' });
  toast(JOB_MESSAGES[type] ?? JOB_MESSAGES.finish);
  const done = () => {
    worker?.terminate();
    worker = null;
    busy = false;
    updateControls();
  };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      $('toast').textContent = `第 ${dayOf(data.tick)} 天已完成，正在繼續…`;
      return;
    }
    done();
    if (data.type === 'error') {
      toast(`目前場次保留：${data.message}`);
      return;
    }
    try {
      onResult(data);
    } catch (error) {
      toast(error.message);
    }
  };
  worker.onerror = () => {
    done();
    toast('處理未完成，原場次保留，請再試一次。');
  };
  worker.postMessage({ type, ...payload });
}

function finishRun() {
  runInBackground('finish', { state: world }, result => {
    replaceRun(result.state, [...frames, ...result.frames], result.state.tick);
    render();
    toast('十日已完成。拖動時間軸，或按「從頭回放」觀看保存的生活。');
  });
}

function compareConditions() {
  const lowCapacity = world.config.capacity === 3 ? 3 : 2;
  runInBackground('compare', { seed: world.config.seed, capacity: lowCapacity }, ({ pair }) => {
    $('pair-panel').hidden = false;
    $('pair-panel').innerHTML = comparisonHTML(pair);
    toast('配對示範完成。數值來自離線策略，不是正式研究結果。');
  });
}

function exportCurrentRun() {
  stop();
  const blob = new Blob([JSON.stringify(exportRun(world))], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ai-town-demo-${world.config.seed}-capacity${world.config.capacity}-tick${world.tick}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`已匯出全部 ${world.tick} 個已執行時段，包含完整提議與記憶紀錄。`);
}

async function importRun(file) {
  if (file.size > MAX_IMPORT_BYTES) {
    toast('檔案超過 20 MB 上限。');
    return;
  }
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('無法讀取 JSON，請選擇本 demo 匯出的紀錄。');
    return;
  }
  runInBackground('import', { data }, result => {
    replaceRun(result.state, result.frames, 0);
    $('pair-panel').hidden = true;
    render();
    toast('回放驗證通過。按「播放回放」從第一天開始觀看。');
  });
}

// ---------------------------------------------------------------------------
// Dialogs and page modes

function showEventEvidence(id) {
  const event = pastEvents().find(e => e.id === id);
  if (!event) return;
  stop();
  $('evidence-title').textContent = '這段日常的來源';
  const related = event.sourceId && pastEvents().find(e => e.id === event.sourceId);
  $('evidence-body').innerHTML = eventEvidenceHTML(event, related, world.config, resident);
  $('evidence-dialog').showModal();
}

function showPairEvidence(key) {
  const dyad = frame().metrics.dyads.find(d => d.key === key);
  if (!dyad) return;
  stop();
  $('evidence-title').textContent = `${resident(dyad.a).name}與${resident(dyad.b).name}的交集`;
  // Sources come from the full log: view frames deliberately keep only recent events.
  const sources = pastEvents()
    .filter(e => e.type === 'interaction' && e.pair === key)
    .map(e => pastEvents().find(source => source.id === e.sourceId) ?? e);
  $('evidence-body').innerHTML = pairEvidenceHTML(dyad, sources, resident);
  $('evidence-dialog').showModal();
}

function openSettings() {
  stop();
  $('seed').value = world.config.seed;
  $('condition').value = world.config.capacity;
  $('settings-error').textContent = '';
  $('settings-dialog').showModal();
}

function createNewTown(event) {
  event.preventDefault();
  if (busy) return;
  try {
    if (!$('seed').value.trim()) throw new Error('請輸入場次種子。');
    const fresh = createWorld({ seed: Number($('seed').value), capacity: Number($('condition').value) });
    stop();
    replaceRun(fresh, [viewFrame(fresh)], 0);
    $('pair-panel').hidden = true;
    $('settings-dialog').close();
    render();
    toast('新小鎮準備好了，按「開始生活」觀察第一天。');
  } catch (error) {
    $('settings-error').textContent = error.message;
  }
}

/** Switch between the town view and the research view (journal and network show in both). */
function showResearch(research) {
  document.body.dataset.view = research ? 'research' : 'town';
  $('research').hidden = !research;
  for (const name of ['life', 'research']) {
    const active = research === (name === 'research');
    $('mode-' + name).classList.toggle('active', active);
    $('mode-' + name).setAttribute('aria-pressed', String(active));
  }
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

function selectTab(tab) {
  activeTab = tab;
  for (const name of TABS) {
    const active = name === tab;
    $('tab-' + name).classList.toggle('active', active);
    $('tab-' + name).setAttribute('aria-selected', String(active));
  }
  $('agent-detail').setAttribute('aria-labelledby', 'tab-' + tab);
  renderInspector();
}

function expandTown(expanded) {
  document.querySelector('.world-panel').classList.toggle('expanded', expanded);
  document.body.classList.toggle('town-expanded', expanded);
  $('fullscreen').setAttribute('aria-pressed', String(expanded));
  setButtonLabel('fullscreen', expanded ? '收回小鎮' : '放大小鎮');
}

// ---------------------------------------------------------------------------
// Event wiring

$('play').addEventListener('click', togglePlay);
$('step').addEventListener('click', () => {
  stop();
  advance();
});
$('latest').addEventListener('click', () => jumpTo(world.tick));
$('seek').addEventListener('input', () => jumpTo(Number($('seek').value)));
$('speed').addEventListener('change', () => {
  if (playTimer) {
    clearInterval(playTimer);
    playTimer = setInterval(advance, playbackInterval());
  }
  render({ animate: false });
});
$('event-filter').addEventListener('change', () => renderJournal());
$('mode-life').addEventListener('click', () => showResearch(false));
$('mode-research').addEventListener('click', () => showResearch(true));
for (const tab of TABS) $('tab-' + tab).addEventListener('click', () => selectTab(tab));
$('settings-open').addEventListener('click', openSettings);
$('settings-form').addEventListener('submit', createNewTown);
$('finish').addEventListener('click', finishRun);
$('compare').addEventListener('click', compareConditions);
$('export').addEventListener('click', exportCurrentRun);
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', event => {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) importRun(file);
});

$('fullscreen').addEventListener('click', () =>
  expandTown(!document.body.classList.contains('town-expanded')),
);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') expandTown(false);
});
$('zoom-in').addEventListener('click', () => scene.zoomIn());
$('zoom-out').addEventListener('click', () => scene.zoomOut());
$('camera-reset').addEventListener('click', () => scene.resetCamera());
$('camera-follow').addEventListener('click', () => scene.setFollow(!cameraFollowing));
$('explore-toggle').addEventListener('click', () => scene.setExplore(!exploring));
$('object-close').addEventListener('click', () => {
  inspectedObject = null;
  renderInspectedObject();
  document.querySelector('#town-stage canvas')?.focus();
});
for (const button of document.querySelectorAll('[data-zone]'))
  button.addEventListener('click', () => scene.focusZone(button.dataset.zone));
$('town-minimap').addEventListener('click', event => {
  // A keyboard activation (no click count) resets the view instead of panning.
  if (!event.detail) {
    scene.resetCamera();
    return;
  }
  const rect = $('town-minimap').getBoundingClientRect();
  scene.panTo(
    ((event.clientX - rect.left) / rect.width) * WORLD_SIZE.width,
    ((event.clientY - rect.top) / rect.height) * WORLD_SIZE.height,
  );
});

// Generated markup carries its action in data attributes.
document.addEventListener('click', event => {
  const target = event.target.closest('[data-agent],[data-event],[data-pair],[data-jump],[data-close]');
  if (!target) return;
  const { close, agent, event: eventId, pair, jump } = target.dataset;
  if (close) $(close).close();
  else if (agent) selectResident(agent);
  else if (eventId) showEventEvidence(eventId);
  else if (pair) showPairEvidence(pair);
  else if (jump) {
    $('evidence-dialog').close();
    if (document.body.dataset.view !== 'town') showResearch(false);
    jumpTo(Number(jump));
    $('town-section').scrollIntoView({ behavior: scrollBehavior() });
  }
});
// SVG nodes and links act as buttons from the keyboard.
$('network').addEventListener('keydown', event => {
  if (!['Enter', ' '].includes(event.key) || !event.target.matches('[role="button"]')) return;
  event.preventDefault();
  event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});
document.querySelector('.inspector-tabs').addEventListener('keydown', event => {
  const moves = { ArrowRight: 1, ArrowLeft: TABS.length - 1 };
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? TABS.length - 1
        : (TABS.indexOf(activeTab) + moves[event.key]) % TABS.length;
  $('tab-' + TABS[index]).click();
  $('tab-' + TABS[index]).focus();
});
window.addEventListener('pagehide', () => {
  stop();
  worker?.terminate();
  scene.destroy();
});

render();
