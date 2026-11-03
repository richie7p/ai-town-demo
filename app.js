import { createWorld, step } from './src/engine.js';
import { propose } from './src/policy.js';
import { exportRun } from './src/replay.js';
import { viewFrame } from './src/presentation.js';
import { ZONES, dayOf, slotOf, ACTION_NAMES } from './src/config.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const percent = x => x === null ? 'NA' : `${(x * 100).toFixed(1)}%`;
let state = createWorld();
let frames = [viewFrame(state)], viewed = 0, selected = 'A01', timer = null, busy = false, worker = null, toastTimer;

function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500); }
function stop() { clearInterval(timer); timer = null; $('play').textContent = '▶ 開始播放'; }
function controls() {
  for (const id of ['condition', 'seed', 'reset', 'step', 'play', 'finish', 'compare', 'import', 'export']) $(id).disabled = busy;
  if (!busy) for (const id of ['step', 'play', 'finish']) $(id).disabled = state.tick >= 120;
}
function newRun() {
  try {
    const seed = Number($('seed').value), capacity = Number($('condition').value);
    if (!$('seed').value.trim()) throw new Error('請填入設定種子');
    const fresh = createWorld({ seed, capacity });
    stop(); state = fresh; frames = [viewFrame(state)]; viewed = 0;
    $('pair-panel').hidden = true; render(); toast(`已建立 ${capacity === 8 ? 'A8' : `B${capacity}`} 新場次，種子 ${seed}`);
  } catch (e) { toast(e.message); }
}
function advance() {
  try {
    state = step(state, propose(state)); frames.push(viewFrame(state)); viewed = state.tick; render();
    if (state.tick >= 120) { stop(); toast('十日工程示範完成，可匯出紀錄並重新載入驗證。'); }
  } catch (e) { stop(); toast(e.message); }
}
function background(type, payload, apply) {
  stop(); busy = true; controls();
  worker = new Worker(new URL('./src/runner-worker.js', import.meta.url), { type: 'module' });
  toast(type === 'compare' ? '正在執行同種子的 A／B 工程配對，兩個世界與記憶各自獨立…' : type === 'import' ? '正在驗證全部事件、記憶紀錄與狀態校驗…' : '正在完成剩餘時段…');
  const finish = () => { worker?.terminate(); worker = null; busy = false; controls(); };
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') { $('toast').textContent = `工程示範已結算 D${dayOf(data.tick)}，正在繼續…`; return; }
    finish();
    if (data.type === 'error') { toast(`未變更本場資料：${data.message}`); return; }
    apply(data);
  };
  worker.onerror = () => { finish(); toast('處理未完成，本場資料保留。請重新嘗試。'); };
  worker.postMessage({ type, ...payload });
}

function tree(x, y, s = 1, color = '#9cb478') {
  return `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="0" cy="20" rx="16" ry="6" fill="#8ba07828"/><path d="M0 3v19" stroke="#8a9166" stroke-width="4"/><circle cx="-7" cy="1" r="12" fill="${color}"/><circle cx="7" cy="-3" r="13" fill="${color}"/><circle cy="-13" r="14" fill="${color}"/><path d="M-4-16q-7 2-7 9" fill="none" stroke="#ffffff35" stroke-width="3" stroke-linecap="round"/></g>`;
}
function house(x, y, s = 1, roof = '#668b73') {
  return `<g transform="translate(${x},${y}) scale(${s})"><ellipse cx="55" cy="98" rx="65" ry="12" fill="#687f6220"/><rect x="4" y="36" width="108" height="58" rx="3" fill="#f8f0d9"/><path d="M-8 38 56-2l67 40Z" fill="${roof}"/><path d="M-7 38h130" stroke="#456959" stroke-width="4"/><path d="M81 5V-6h13v19" fill="${roof}"/><rect x="46" y="57" width="22" height="37" rx="3" fill="#76937e"/><circle cx="62" cy="77" r="1.6" fill="#f8e2a2"/><rect x="16" y="54" width="20" height="20" rx="2" fill="#b4c8bd" stroke="#fff9" stroke-width="4"/><rect x="79" y="54" width="20" height="20" rx="2" fill="#b4c8bd" stroke="#fff9" stroke-width="4"/><path d="M26 54v20m-10-10h20m53-10v20m-10-10h20" stroke="#fff9" stroke-width="2"/><path d="M37 96h40" stroke="#c7bc9e" stroke-width="5" stroke-linecap="round"/></g>`;
}
function makeTown() {
  const foliage = [[32,70,1.3],[70,98,.9],[30,204,1],[352,74,1],[360,199,.8],[457,65,.9],[751,90,1.3],[740,208,.8],[34,360,1],[70,462,1.1],[350,453,1.1],[459,365,.8],[745,360,1.1],[750,478,.9],[440,474,.7]];
  $('town-art').innerHTML = `<defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r=".9" fill="#91a77725"/></pattern><filter id="soft"><feDropShadow dx="0" dy="2" stdDeviation="1.5" flood-color="#567159" flood-opacity=".1"/></filter></defs>
    <rect width="800" height="540" fill="#eaf0df"/><rect width="800" height="540" fill="url(#dots)"/>
    <rect x="19" y="49" width="355" height="197" rx="40" fill="#e4e8d4"/><rect x="433" y="49" width="349" height="197" rx="40" fill="#eae7cc"/>
    <rect x="19" y="302" width="355" height="200" rx="40" fill="#dfebd5"/><rect x="433" y="302" width="349" height="200" rx="40" fill="#e0e8d5"/>
    <path d="M400 0v540M0 274h800" stroke="#e2d9bc" stroke-width="34"/><path d="M400 0v540M0 274h800" stroke="#f8f1db" stroke-width="23"/><path d="M400 0v540M0 274h800" stroke="#dcd2b2" stroke-width="1.2" stroke-dasharray="6 9"/>
    <path d="M366 252h68v44h-68Z" fill="#dce6c8"/><circle cx="400" cy="274" r="19" fill="#98af7b"/><circle cx="400" cy="274" r="13" fill="#aabf8a"/>
    ${house(94,91,.83,'#7a9582')}${house(195,73,1,'#6d8c77')}
    <g transform="translate(505 76)"><ellipse cx="98" cy="113" rx="108" ry="11" fill="#81926b24"/><rect x="5" y="40" width="185" height="70" rx="3" fill="#f5e7bf"/><path d="M-5 41 90-2h108v43Z" fill="#c09b59"/><path d="M-5 42h203" stroke="#9b864e" stroke-width="5"/><rect x="18" y="60" width="38" height="34" fill="#b5c7b2" stroke="#fcf5df" stroke-width="5"/><path d="M37 60v34M18 77h38" stroke="#fcf5df" stroke-width="3"/><rect x="80" y="58" width="62" height="52" fill="#869a7d"/><path d="M86 65h50m-50 8h50m-50 8h50m-50 8h50m-50 8h50" stroke="#6d836b" stroke-width="2"/><rect x="158" y="70" width="18" height="24" fill="#a5bc9f"/><circle cx="99" cy="23" r="13" fill="#f6e6ba"/><text x="99" y="29" text-anchor="middle" font-size="20" fill="#8c7e4c">⚒</text></g>
    <g transform="translate(199 350)"><ellipse cy="28" rx="69" ry="29" fill="#cfdbc6"/><ellipse cy="20" rx="55" ry="24" fill="#92b9b3" stroke="#f5f4e5" stroke-width="9"/><ellipse cy="20" rx="35" ry="13" fill="#aed3c9"/><path d="M0 20V-13" stroke="#e3e6d6" stroke-width="12"/><ellipse cy="-13" rx="26" ry="10" fill="#b4d2c4" stroke="#f2f2e4" stroke-width="5"/><path d="M0-13v-20" stroke="#d3e2cf" stroke-width="6"/><circle cy="-34" r="6" fill="#e9ecda"/><path d="M-18-9q-9 15-6 24m41-24q9 15 6 24" stroke="#e4f4e4" fill="none" stroke-width="2"/></g>
    <g fill="#a18e61" stroke="#f3eed8" stroke-width="2"><rect x="83" y="365" width="49" height="10" rx="2"/><rect x="270" y="365" width="49" height="10" rx="2"/></g><path d="M89 376v8m37-8v8m150-8v8m37-8v8" stroke="#7c865e" stroke-width="4"/>
    ${house(533,324,1.1,'#759394')}<g transform="translate(684 384)"><path d="M0 0v37m0-22-15 22m15-22 15 22" stroke="#657b6d" stroke-width="3"/><rect x="-15" y="-9" width="30" height="20" rx="4" fill="#647a70"/><circle cy="1" r="7" fill="#c4d6b9"/></g>
    ${foliage.map((p, i) => tree(...p, ['#99b47b','#aec18b','#8aa77b'][i % 3])).join('')}
    <g font-family="Microsoft JhengHei, sans-serif" fill="#526a48" font-size="14" text-anchor="middle" font-weight="700"><text x="195" y="32">住宅區</text><text x="604" y="32">工坊</text><text x="195" y="303">公共廣場</text><text x="604" y="303">活動區</text></g>
    <g font-size="10" font-family="Microsoft JhengHei, sans-serif" text-anchor="middle" fill="#7c8c6c"><text x="195" y="49">休息・閱讀・交談</text><text x="604" y="49" id="tools-label">製作工具</text><text x="195" y="320">散步・自在交流</text><text x="604" y="320" id="camera-label">攝影設備</text></g>`;
  for (const a of state.agents) {
    const button = document.createElement('button'); button.className = 'avatar'; button.id = `avatar-${a.id}`;
    button.addEventListener('click', () => { selected = a.id; render(); }); $('avatars').append(button);
  }
}

function renderAgent(frame) {
  const a = frame.agents.find(a => a.id === selected), t = frame.trace;
  const p = t?.proposals.find(p => p.actor === selected), o = t?.observations[selected];
  const outcome = p && frame.events.find(e => e.proposalId === p.id && ['invalid', 'capacity_failure', 'join_failed'].includes(e.type));
  const held = frame.equipment.find(e => e.owner === selected);
  const target = p?.target && frame.agents.find(a => a.id === p.target);
  $('agent-detail').innerHTML = `<div class="agent-profile"><div class="agent-disc" style="background:${a.color}">${esc(a.name.slice(-1))}</div><div><h3>${esc(a.name)}<small>${a.id}</small></h3><p>${esc(a.interests)}</p></div></div><div class="agent-bio">${esc(a.style)}<br><span class="agent-location">${ZONES[a.zone].name}${held ? ' · 持有' + (held.type === 'tools' ? '製作工具' : '攝影設備') : ' · 未持有設備'}</span></div>
    <div class="decision"><div class="label">${p ? `D${dayOf(frame.tick)} / 時段 ${slotOf(frame.tick)} 的行動提議` : '下一個時段，故事開始'}</div><strong>${p ? ACTION_NAMES[p.action] + (target ? ' → ' + esc(target.name) : '') : '等待第一份提議'}</strong><p>${p ? esc(p.text || (p.destination ? `前往${ZONES[p.destination].name}` : '依當前狀態採取行動。')) : '點選「下一時段」，觀察八位角色如何各自決定。'}</p>${p ? `<div class="decision-result"><span class="status-tag ${outcome ? 'bad' : ''}">${outcome ? '未成立' : '已結算'}</span><span>${outcome ? esc(outcome.reason) : '提議與結果已分開記錄'}</span></div>` : ''}</div>
    <div class="memory-title">此步實際取得的事件<small>${o?.provided.length ?? 0} 筆</small></div><div class="memory-list">${o?.provided.length ? o.provided.map(m => `<div class="memory-item"><span>${esc(m.id)} · D${m.day} / ${slotOf(m.tick)}${m.day < dayOf(frame.tick) ? ' · 跨日' : ''}${m.score !== null ? ' · 檢索 ' + m.score.toFixed(2) : ' · 近期'}</span>${esc(m.text)}</div>`).join('') : '<div class="empty">尚未取得可見事件。<br>各角色的記憶相互隔離。</div>'}</div>
    <p class="memory-foot">${o ? `決策前位置：${ZONES[o.actor.zone].name} · 約 ${o.estimatedTokens} tokens${o.truncated ? ' · 已依上限截取' : ''}<br>` : ''}容量採近似估算。尚未加入模型反思。</p>`;
}
const kinds = { talk: '交談', reply: '有效回覆', invite: '合作邀請', accept: '接受', decline: '拒絕', borrow: '借用成功', borrow_attempt: '借用嘗試', capacity_failure: '容量不足', return: '提前歸還', release: '歸還完成', move: '移動', work: '設備活動', join: '加入合作', cooperation: '合作完成', interaction: '互動日證據', initiation: '發起已驗證', invitation_outcome: '邀請結算', rest: '休息', walk: '散步', wait: '等待', invalid: '無效行動', join_failed: '加入未成立' };
const social = ['talk','reply','invite','accept','decline','cooperation','interaction','initiation','invitation_outcome','join'];
const failedKinds = ['invalid','capacity_failure','join_failed'];
const equipmentKinds = ['borrow','borrow_attempt','capacity_failure','return','release','work'];
function renderEvents(frame) {
  const filter = $('event-filter').value;
  const events = frame.events.filter(e => filter === 'all' || (filter === 'social' ? social : filter === 'equipment' ? equipmentKinds : failedKinds).includes(e.type)).slice(-60).reverse();
  $('events').innerHTML = events.length ? events.map(e => `<div class="event-row"><div class="event-time">D${dayOf(e.tick)} / ${String(slotOf(e.tick)).padStart(2, '0')}<small>${e.id}</small></div><span class="event-tag ${failedKinds.includes(e.type) ? 'failed' : social.includes(e.type) ? 'social' : ''}">${kinds[e.type] || esc(e.type)}</span><div class="event-text">${esc(e.text)}</div></div>`).join('') : '<div class="empty">這裡將保存已結算的事件。<br>角色的想法，須經過引擎確認才算發生。</div>';
}
function renderNetwork(frame) {
  const points = Object.fromEntries(frame.agents.map((a, i) => [a.id, { x: 150 + 95 * Math.cos(i * Math.PI / 4 - Math.PI / 2), y: 123 + 88 * Math.sin(i * Math.PI / 4 - Math.PI / 2) }]));
  $('network').innerHTML = `<circle cx="150" cy="123" r="89" fill="#f5f7ef" stroke="#e2e8d8" stroke-dasharray="3 6"/>` + frame.metrics.dyads.filter(d => d.allDays.length).map(d => {
    const a = points[d.a], b = points[d.b]; return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${d.qualifies ? '#3b775b' : '#b9cab0'}" stroke-width="${Math.min(4, 1 + d.allDays.length / 2)}" opacity=".8"/>`;
  }).join('') + frame.agents.map(a => `<g><circle cx="${points[a.id].x}" cy="${points[a.id].y}" r="15" fill="${a.color}" stroke="white" stroke-width="3"/><text x="${points[a.id].x}" y="${points[a.id].y + 4}" text-anchor="middle" fill="white" font-size="10">${a.id.slice(-2)}</text><text x="${points[a.id].x}" y="${points[a.id].y + 28}" text-anchor="middle" fill="#7b8b72" font-size="9">${esc(a.name)}</text></g>`).join('');
  $('network-stats').innerHTML = `<div><strong>${frame.metrics.completedCooperations}</strong>已完成合作</div><div><strong>${frame.metrics.capacityFailures}</strong>容量失敗</div><div><strong>${frame.metrics.qualifiedLinks}</strong>末五日合格對</div>`;
}
function render() {
  const frame = frames[viewed], m = frame.metrics;
  $('progress-value').textContent = frame.tick ? `第 ${dayOf(frame.tick)} 日` : '準備開始';
  $('progress-detail').textContent = `${frame.tick} / 120 時段${frame.tick ? ` · 本日時段 ${slotOf(frame.tick)}` : ''}`;
  $('progress-bar').style.width = `${frame.tick / 120 * 100}%`;
  $('equipment-value').innerHTML = `${frame.equipment.filter(e => e.owner).length} <em>/ ${frame.equipment.length}</em>`;
  $('interaction-value').textContent = m.interactionDays;
  $('y-value').textContent = m.final ? percent(m.y) : '—';
  $('y-detail').textContent = m.final ? `${m.qualifiedLinks} / 28 對 · 工程示範值` : `截至目前 ${m.qualifiedLinks} / 28 對 · 尚未完成`;
  $('clock-badge').textContent = frame.tick ? `DAY ${String(dayOf(frame.tick)).padStart(2, '0')} · ${String(slotOf(frame.tick)).padStart(2, '0')} / 12` : '初始狀態';
  $('map-condition').textContent = `${frame.config.capacity === 8 ? 'A8' : 'B' + frame.config.capacity} / 每類 ${frame.config.capacity} 件`;
  for (const [type, label] of [['tools', '製作工具'], ['camera', '攝影設備']]) $(type + '-label').textContent = `${label} · 可借 ${frame.equipment.filter(e => e.type === type && !e.owner).length} / ${frame.config.capacity}`;
  const centers = { home: [195, 207], workshop: [602, 207], plaza: [195, 440], studio: [602, 448] };
  for (const zone of Object.keys(ZONES)) {
    const group = frame.agents.filter(a => a.zone === zone);
    group.forEach((a, i) => {
      const cols = Math.min(4, group.length), x = centers[zone][0] + ((i % 4) - (cols - 1) / 2) * 56, y = centers[zone][1] + Math.floor(i / 4) * 39;
      const el = $('avatar-' + a.id); el.style.left = `${x / 8}%`; el.style.top = `${y / 5.4}%`; el.style.setProperty('--avatar', a.color);
      el.innerHTML = esc(a.name.slice(-1)) + (frame.equipment.some(e => e.owner === a.id) ? '<span class="held-dot"></span>' : '');
      el.dataset.label = a.name; el.setAttribute('aria-label', `${a.id} ${a.name}，${ZONES[zone].name}`); el.classList.toggle('selected', a.id === selected);
    });
  }
  $('seek').max = state.tick; $('seek').value = viewed; $('seek').disabled = busy || state.tick === 0;
  $('timeline-label').textContent = `回放 ${viewed} / ${state.tick}`; $('view-mode').textContent = viewed === state.tick ? '最新狀態' : '歷史回放';
  renderAgent(frame); renderEvents(frame); renderNetwork(frame); controls();
}

$('reset').addEventListener('click', newRun);
$('condition').addEventListener('change', newRun);
$('step').addEventListener('click', () => { stop(); advance(); });
$('play').addEventListener('click', () => {
  if (timer) { stop(); return; }
  if (viewed !== state.tick) { viewed = state.tick; render(); }
  $('play').textContent = 'Ⅱ 暫停播放'; timer = setInterval(advance, Number($('speed').value));
});
$('speed').addEventListener('change', () => { if (timer) { clearInterval(timer); timer = setInterval(advance, Number($('speed').value)); } });
$('seek').addEventListener('input', () => { stop(); viewed = Number($('seek').value); render(); });
$('event-filter').addEventListener('change', () => renderEvents(frames[viewed]));
$('finish').addEventListener('click', () => background('finish', { state }, result => { state = result.state; frames.push(...result.frames); viewed = state.tick; render(); toast('十日完成。指標僅為規則型工程示範，完整紀錄可匯出。'); }));
$('compare').addEventListener('click', () => background('compare', { seed: state.config.seed, capacity: state.config.capacity === 3 ? 3 : 2 }, ({ pair }) => {
  const panel = $('pair-panel'); panel.hidden = false;
  panel.innerHTML = `<div class="panel-heading"><div><span class="section-number">AB</span><h2>同種子的工程配對</h2></div><span class="small-label">SEED ${pair.seed}</span></div><div class="pair-body"><table><thead><tr><th>條件</th><th>主要指標 Y</th><th>容量失敗 / 合法嘗試</th><th>已完成合作</th></tr></thead><tbody>${[['A8', pair.a], ['B' + pair.lowCapacity, pair.b]].map(([name, m]) => `<tr><td>${name}</td><td>${percent(m.y)}</td><td>${m.capacityFailures} / ${m.borrowAttempts}</td><td>${m.completedCooperations}</td></tr>`).join('')}</tbody></table><p class="delta">B − A = ${pair.deltaPercentagePoints > 0 ? '+' : ''}${pair.deltaPercentagePoints.toFixed(2)} 個百分點</p><p>${pair.note} 本次比較不會覆蓋目前場次。</p></div>`;
  panel.scrollIntoView({ behavior: 'smooth', block: 'center' }); toast('A／B 工程配對完成。');
}));
$('export').addEventListener('click', () => {
  stop(); const blob = new Blob([JSON.stringify(exportRun(state))], { type: 'application/json' });
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `ai-town-demo-${state.config.seed}-capacity${state.config.capacity}-tick${state.tick}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast(`已匯出 ${state.tick} 個已結算時段的完整紀錄。`);
});
$('import').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  if (file.size > 20 * 1024 * 1024) { toast('檔案超過 20 MB 上限。'); return; }
  try {
    const data = JSON.parse(await file.text());
    background('import', { data }, result => { state = result.state; frames = result.frames; viewed = state.tick; $('seed').value = state.config.seed; $('condition').value = state.config.capacity; $('pair-panel').hidden = true; render(); toast('回放驗證通過：事件、記憶與狀態一致。'); });
  } catch { toast('無法讀取 JSON，請選擇本 demo 匯出的回放檔案。'); }
});
window.addEventListener('pagehide', () => { stop(); worker?.terminate(); });
makeTown(); render();
