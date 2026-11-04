import { createWorld, step } from './src/engine.js';
import { propose } from './src/policy.js';
import { exportRun } from './src/replay.js';
import { viewFrame } from './src/presentation.js';
import { residentPortrait } from './src/resident-art.js';
import { WORLD_SIZE } from './src/town-view-model.js';
import { activityAnchor, createMinimapDataUrl } from './src/town-map.js';
import { createTownScene } from './src/town-scene.js';
import { ZONES, dayOf, slotOf, ACTION_NAMES } from './src/config.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const percent = value => value === null ? 'NA' : `${(value * 100).toFixed(1)}%`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const failureKinds = ['invalid','capacity_failure','join_failed'];
const socialKinds = ['talk','reply','invite','accept','decline','cooperation','interaction','initiation','invitation_outcome','join'];
const equipmentKinds = ['borrow','borrow_attempt','capacity_failure','return','release','work'];
const lifeKinds = ['talk','reply','invite','accept','decline','cooperation','work','move','rest','walk','wait','borrow'];
const kinds = {talk:'交談',reply:'回覆',invite:'邀請合作',accept:'接受邀請',decline:'婉拒邀請',borrow:'借用成功',borrow_attempt:'借用嘗試',capacity_failure:'設備不足',return:'提前歸還',release:'歸還完成',move:'移動',work:'設備活動',join:'加入合作',cooperation:'合作完成',interaction:'互動日證據',initiation:'發起已驗證',invitation_outcome:'邀請結算',rest:'休息',walk:'散步',wait:'等待',invalid:'無效行動',join_failed:'未能加入'};
let state = createWorld(), frames = [viewFrame(state)], viewed = 0, selected = 'A01', activeTab = 'now';
let timer = null, busy = false, worker = null, toastTimer;
const frame = () => frames[viewed];
const pastEvents = () => state.events.filter(event => event.tick <= viewed);
const actor = id => frame().agents.find(a => a.id === id);
let cameraFollowing = false, exploring = false, inspectedObject = null;
const scene = createTownScene($('town-stage'), {
  onSelect: id => selectAgent(id),
  onExploreChange: ({active,moving,locationName,message}) => {
    exploring=active;
    $('explore-toggle').setAttribute('aria-pressed',String(active));
    $('explore-toggle').textContent=active?'↙ 結束探訪':'↗ 探訪小鎮';
    $('explore-status').hidden=!active;
    $('visitor-location').textContent=`${moving?'前往':'你在'} · ${locationName || '小鎮步道'}`;
    $('visitor-hint').textContent=message || '點地面行走 · WASD／方向鍵 · E 查看家具';
    $('scene-hint').textContent=active?'點地面走過去 · 點家具查看 · 拖曳移動視角':'點居民看日常 · 點家具看用途 · 拖曳移動視角';
  },
  onInspectObject: object => {inspectedObject=object;renderObject();},
  onCameraChange: ({zoom,following,worldView}) => {
    cameraFollowing = following;
    $('zoom-level').textContent = `${Math.round(zoom*100)}%`;
    $('zoom-out').disabled = zoom <= 1;
    $('zoom-in').disabled = zoom >= 3.5;
    if(worldView){
      const rect=$('minimap-viewport');
      rect.style.left=`${100*worldView.x/WORLD_SIZE.width}%`;
      rect.style.top=`${100*worldView.y/WORLD_SIZE.height}%`;
      rect.style.width=`${100*worldView.width/WORLD_SIZE.width}%`;
      rect.style.height=`${100*worldView.height/WORLD_SIZE.height}%`;
    }
    $('camera-follow').setAttribute('aria-pressed', String(following));
    $('camera-follow').textContent = following ? '◎ 正在跟隨' : '◎ 跟隨居民';
  },
  onReady: ({renderer,version,minimapUrl}) => {
    $('scene-status').hidden = true;
    $('town-stage').dataset.renderer = renderer;
    $('town-stage').dataset.phaserVersion = version;
    $('minimap-image').src=minimapUrl || createMinimapDataUrl();
    for(const id of ['zoom-in','camera-reset','camera-follow','town-minimap','explore-toggle']) $(id).disabled = false;
    document.querySelectorAll('[data-zone]').forEach(button=>button.disabled=false);
  },
  onError: error => {
    console.error('Town renderer:', error);
    $('scene-status').hidden = false;
    $('scene-status').classList.add('failed');
    $('scene-status').textContent = '小鎮畫面未能載入，請重新整理頁面。居民資料與生活紀錄仍可從下方查看。';
    for(const id of ['zoom-in','zoom-out','camera-reset','camera-follow','town-minimap','explore-toggle']) $(id).disabled = true;
    document.querySelectorAll('[data-zone]').forEach(button=>button.disabled=true);
  },
});

function portrait(agent) {
  return `<img src="${residentPortrait(agent)}" alt="" draggable="false">`;
}
function renderObject() {
  $('object-card').hidden=!inspectedObject;
  if(!inspectedObject)return;
  $('object-name').textContent=inspectedObject.name;
  $('object-description').textContent=inspectedObject.description;
  $('object-zone').textContent=ZONES[inspectedObject.zone]?.name || '小鎮公共空間';
  const nearby=frame().agents.filter(agent=>activityAnchor(agent,frame()).objectId===inspectedObject.id);
  $('object-occupants').textContent=nearby.length?`此刻在這裡：${nearby.map(a=>a.name).join('、')}`:'此刻沒有居民使用這個位置。';
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => {$('toast').hidden = true;}, 5800); }
function controls() {
  for (const id of ['reset','step','play','finish','compare','import','export','settings-open','latest']) $(id).disabled = busy;
  $('seek').disabled = busy || !state.tick;
  if (!busy) { $('step').disabled = viewed >= 120; $('finish').disabled = state.tick >= 120; }
  $('play').textContent = timer ? 'Ⅱ 暫停生活' : viewed === 120 ? '↻ 從頭回放' : viewed < state.tick ? '▶ 播放回放' : viewed ? '▶ 繼續生活' : '▶ 開始生活';
  $('playing-dot').classList.toggle('playing', !!timer);
}
function stop() { clearInterval(timer); timer = null; controls(); scene.render(frame(), {selected,playing:false,duration:Number($('speed').value)*0.45,reducedMotion:reduced.matches,animate:false}); }
function selectAgent(id) { if (!actor(id)) return; selected = id; render({animate:false}); }
function advance() {
  try {
    if (viewed < state.tick) viewed++;
    else if (state.tick < 120) {state = step(state, propose(state)); frames.push(viewFrame(state)); viewed = state.tick;}
    else {stop(); return;}
    render({animate:viewed!==120});
    if (viewed === 120) {stop(); toast('十日生活已完成，可以從頭回放，或匯出完整紀錄。');}
  } catch (error) {stop(); toast(error.message);}
}
function start() {
  if (busy) return;
  if (timer) {stop(); return;}
  if (viewed === 120) {viewed = 0; render({animate:false});}
  timer = setInterval(advance, Number($('speed').value)); controls();
  if(viewed===0)advance();else render({animate:false});
}
function background(type, payload, apply) {
  stop(); busy = true; controls();
  worker = new Worker(new URL('./src/runner-worker.js', import.meta.url), {type:'module'});
  toast(type === 'compare' ? '正在比較同種子的兩座小鎮，世界與記憶各自獨立…' : type === 'import' ? '正在驗證紀錄與回放…' : '正在完成這十天的生活…');
  const finish = () => {worker?.terminate(); worker = null; busy = false; controls();};
  worker.onmessage = ({data}) => {
    if (data.type === 'progress') {$('toast').textContent = `第 ${dayOf(data.tick)} 天已完成，正在繼續…`; return;}
    finish();
    if (data.type === 'error') {toast(`目前場次保留：${data.message}`); return;}
    try {apply(data);} catch (error) {toast(error.message);}
  };
  worker.onerror = () => {finish(); toast('處理未完成，原場次保留，請再試一次。');};
  worker.postMessage({type,...payload});
}
function renderResidents(current) {
  if (!$('residents').children.length) $('residents').innerHTML = current.agents.map(a => `<button class="resident" id="resident-${a.id}" data-agent="${a.id}"></button>`).join('');
  for (const a of current.agents) {
    const el = $('resident-'+a.id), p = current.trace?.proposals.find(p => p.actor === a.id);
    el.classList.toggle('selected',a.id === selected); el.setAttribute('aria-pressed', String(a.id === selected));
    el.setAttribute('aria-label',`${a.name}，${ZONES[a.zone].name}，${p ? ACTION_NAMES[p.action] : '準備開始'}`);
    el.innerHTML = `<div class="mini-portrait">${portrait(a)}</div><strong>${esc(a.name)}</strong><small>${p ? ACTION_NAMES[p.action] : ZONES[a.zone].name}</small>`;
  }
}
function renderAgent(current) {
  const a = current.agents.find(a => a.id === selected), p = current.trace?.proposals.find(p => p.actor === selected), o = current.trace?.observations[selected];
  const events = pastEvents(), result = p && events.filter(e => e.proposalId === p.id), failure = result?.find(e => failureKinds.includes(e.type));
  const held = current.equipment.find(e => e.owner === selected);
  $('agent-zone').textContent = ZONES[a.zone].name;
  $('agent-profile').innerHTML = `<div class="agent-profile"><div class="portrait">${portrait(a)}</div><div><h2>${esc(a.name)}<small>${a.id}</small></h2><p>${esc(a.interests)}</p></div></div><p class="agent-style">${esc(a.style)}</p>`;
  if (activeTab === 'now') {
    const recent = events.filter(e => e.participants.includes(selected) && lifeKinds.includes(e.type)).slice(-3).reverse();
    $('agent-detail').innerHTML = `<div class="detail-kicker">${current.tick ? `第 ${dayOf(current.tick)} 天 · 時段 ${slotOf(current.tick)} 的提議` : '新的一天，還有很多可能'}</div><h3 class="current-action">${p ? ACTION_NAMES[p.action]+(p.target ? ' · '+esc(actor(p.target)?.name ?? p.target) : '') : '準備開始今天的生活'}</h3><p class="thought">${p ? esc(p.text || (p.destination ? `前往${(ZONES[p.destination]?.name ?? p.destination)}` : '依目前狀態安排自己的活動。')) : '點選「開始生活」，看看誰會先出門，又會遇見誰。'}</p>${p ? `<div class="outcome ${failure ? 'failed' : ''}"><span class="status-dot"></span><span>${esc(failure?.reason || result?.find(e => !['borrow_attempt'].includes(e.type))?.text || '本步已結算')}</span></div>` : ''}<div class="equipment-info">${held ? `持有${held.type === 'tools' ? '製作工具' : '攝影設備'} · ${held.usableFrom > current.tick ? '下一時段可用' : '可於下一步使用'}<br>於第 ${dayOf(held.until)} 天時段 ${slotOf(held.until)} 結束歸還` : '目前未持有設備，可自由安排下一步。'}</div>${recent.length ? '<h4 class="mini-heading">最近的小事</h4>'+recent.map(e => `<div class="recent-line"><small>第 ${dayOf(e.tick)} 天 · ${kinds[e.type]}</small><button data-event="${e.id}">${esc(e.text)}</button></div>`).join('') : ''}`;
  } else if (activeTab === 'memory') {
    $('agent-detail').innerHTML = `<p class="memory-intro">此步決策前實際取得的事件。${o ? `當時位於${ZONES[o.actor.zone].name}，共 ${o.provided.length} 筆。` : '尚未產生第一份觀察。'}<br>綠邊表示這一步的規則策略有引用，點選可查來源。</p>${o?.provided.length ? o.provided.map(m => `<button class="memory-card ${p.citedMemoryIds.includes(m.id) ? 'cited' : ''}" data-event="${esc(m.id)}"><span>D${m.day} · 時段 ${slotOf(m.tick)} · ${m.score === null ? '近期觀察' : '較早記憶'}${m.day < dayOf(current.tick) ? ' · 跨日' : ''}</span>${esc(m.text)}${p.citedMemoryIds.includes(m.id) ? '<br><em>本步已引用</em>' : ''}</button>`).join('') : '<div class="empty"><span class="empty-icon">▤</span>生活開始後，記憶也會慢慢累積。</div>'}<p class="memory-intro">${o ? `約 ${o.estimatedTokens} tokens${o.truncated ? '，已依容量截取' : ''}。` : ''}容量為近似估算。尚未接入模型反思；引用不等於因果證據。</p>`;
  } else {
    const dyads = current.metrics.dyads.filter(d => d.allDays.length && [d.a,d.b].includes(selected)).sort((a,b) => b.allDays.length-a.allDays.length || a.key.localeCompare(b.key));
    $('agent-detail').innerHTML = '<p class="memory-intro">截至這個時段，已經留下有效回覆或完成合作的交集。互動日數不代表友誼。</p>'+(dyads.length ? dyads.map(d => {const other=actor(d.a===selected ? d.b : d.a); return `<button class="connection-row" data-pair="${d.key}"><span class="mini-portrait">${portrait(other)}</span><span><strong>${esc(other.name)}</strong><small>${d.allDays.map(day => `D${day}`).join(' · ')}</small></span><span>${d.allDays.length} 日 ↗</span></button>`;}).join('') : '<div class="empty"><span class="empty-icon">↔</span>還沒有完成的互動。<br>先看看大家今天會去哪裡。</div>');
  }
}
function renderEvents() {
  const filter = $('event-filter').value;
  const pool = pastEvents().filter(e => filter === 'all' || (filter === 'life' ? lifeKinds : filter === 'social' ? socialKinds : filter === 'equipment' ? equipmentKinds : failureKinds).includes(e.type));
  const events = pool.slice(-60).reverse();
  $('events').innerHTML = events.length ? events.map(e => {
    const a = actor(e.participants[0]);
    return `<button class="event-row" data-event="${e.id}"><span class="event-time">DAY ${String(dayOf(e.tick)).padStart(2,'0')}<small>時段 ${String(slotOf(e.tick)).padStart(2,'0')}</small></span><span class="event-portrait">${a ? portrait(a) : ''}</span><span class="event-body"><strong>${esc(a?.name ?? '小鎮')}</strong><span class="event-tag">${kinds[e.type] || esc(e.type)}</span><p>${esc(e.text)}</p></span><span class="event-arrow">↗</span></button>`;
  }).join('') : '<div class="empty"><span class="empty-icon">☷</span>還沒有這一類片段。<br>開始生活，讓故事慢慢發生。</div>';
  $('events-foot').textContent = `截至時段 ${viewed} · 此類共 ${pool.length} 筆，顯示最近 ${events.length} 筆。點選可回查事件。`;
}
function renderNetwork(current) {
  const points = Object.fromEntries(current.agents.map((a,i) => [a.id,{x:180+114*Math.cos(i*Math.PI/4-Math.PI/2),y:130+90*Math.sin(i*Math.PI/4-Math.PI/2)}]));
  const dyads = current.metrics.dyads.filter(d => d.allDays.length);
  $('network').innerHTML = '<circle cx="180" cy="130" r="91" fill="#eef0e5" stroke="#d9e1cb" stroke-dasharray="3 6"/>'+dyads.map(d => {const a=points[d.a],b=points[d.b];return `<g data-pair="${d.key}" role="button" tabindex="0" aria-label="${esc(actor(d.a).name)}與${esc(actor(d.b).name)}，${d.allDays.length}個互動日"><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="14"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${d.qualifies ? '#659259' : '#aebf98'}" stroke-width="${Math.min(4,1+d.allDays.length/2)}" opacity=".7"/></g>`;}).join('')+current.agents.map(a => `<g data-agent="${a.id}" role="button" tabindex="0" aria-label="查看${esc(a.name)}"><circle cx="${points[a.id].x}" cy="${points[a.id].y}" r="17" fill="${a.color}" stroke="${a.id===selected ? '#d3b86e' : '#fafbf4'}" stroke-width="3"/><text x="${points[a.id].x}" y="${points[a.id].y+4}" text-anchor="middle" fill="white" font-size="11">${esc(a.name.slice(-1))}</text><text x="${points[a.id].x}" y="${points[a.id].y+32}" text-anchor="middle" fill="#7f9073" font-size="10">${esc(a.name)}</text></g>`).join('');
  $('pair-links').innerHTML = dyads.length ? dyads.sort((a,b)=>b.allDays.length-a.allDays.length).map(d => `<button data-pair="${d.key}">${esc(actor(d.a).name)} × ${esc(actor(d.b).name)} · ${d.allDays.length} 日</button>`).join('') : '<p class="memory-intro">交集會隨著生活逐步出現。</p>';
  $('network-stats').innerHTML = `<div><strong>${dyads.length}</strong>有過交集的組合</div><div><strong>${current.metrics.completedCooperations}</strong>已完成合作</div>`;
}
function render({animate=false} = {}) {
  const current=frame(),m=current.metrics;
  $('day-label').textContent = `第 ${String(dayOf(current.tick)).padStart(2,'0')} 天`;
  const slot=slotOf(current.tick);
  $('phase-label').textContent = current.tick ? ['清晨，慢慢醒來','上午，各自忙碌','午後，走走聊聊','傍晚，準備休息'][Math.floor((slot-1)/3)]+` · ${slot}/12` : '清晨，準備出門';
  $('condition-label').textContent = `${current.config.capacity===8 ? 'A8' : 'B'+current.config.capacity} · 每類 ${current.config.capacity} 件設備`;
  $('timeline-label').textContent = `第 ${dayOf(current.tick)} 天 · ${current.tick ? slot : 0} / 12`;
  $('timeline-total').textContent = `${current.tick} / 120`;
  $('seek').max=state.tick; $('seek').value=viewed;
  $('view-mode').textContent = busy ? '正在處理' : viewed<state.tick ? '歷史回放' : state.tick===120 ? '十日完成' : state.tick ? '最新進度' : '尚未開始';
  $('latest').hidden = viewed===state.tick;
  renderResidents(current); renderAgent(current); renderEvents(); renderNetwork(current); renderObject();
  $('progress-value').textContent = `${current.tick} / 120`;
  $('interaction-value').textContent = m.interactionDays;
  $('y-value').textContent = m.final ? percent(m.y) : '—';
  $('y-detail').textContent = m.final ? `${m.qualifiedLinks} / 28 對 · 工程示範值` : '尚未完成十日，不顯示最終指標';
  $('core-value').textContent = m.final ? m.persistentCores.length : '—';
  $('research-detail').textContent = `設備借用：${m.borrowAttempts} 次合法嘗試、${m.capacityFailures} 次容量失敗（${percent(m.capacityFailureRate)}）。合作完成率：${percent(m.cooperationRate)}，分母 ${m.observedInvitations}，尚未到期 ${m.rightCensoredInvitations}。`+(m.final ? ` 連結門檻 2／3／4 日：${[2,3,4].map(n=>percent(m.sensitivity[n])).join('／')}。` : '')+' 全部數值只使用目前回放位置之前的事件。';
  controls(); scene.render(current,{selected,playing:!!timer,duration:Number($('speed').value)*0.45,reducedMotion:reduced.matches,animate});
}
function evidenceCard(e) {
  return `<article class="evidence-card"><small>D${dayOf(e.tick)} · 時段 ${slotOf(e.tick)} · ${kinds[e.type] || esc(e.type)} · ${e.id}</small><p>${esc(e.text)}</p><div class="evidence-meta">${e.participants.map(id=>esc(actor(id)?.name ?? id)).join('、')}${e.zone ? ' · '+ZONES[e.zone].name : ''}${e.failure_reason || e.reason ? ' · '+esc(e.failure_reason || e.reason) : ''}</div><button data-jump="${e.tick}">回到這個時段 →</button></article>`;
}
function showEvent(id) {
  const e=pastEvents().find(e=>e.id===id); if(!e) return;
  stop(); $('evidence-title').textContent = '這段日常的來源';
  const related=e.sourceId && pastEvents().find(x=>x.id===e.sourceId);
  $('evidence-body').innerHTML = evidenceCard(e)+(related ? '<p class="evidence-note">對應的互動事件</p>'+evidenceCard(related) : '')+`<p class="evidence-note">場次 ${state.config.seed} · ${state.config.capacity===8 ? 'A8' : 'B'+state.config.capacity}。這是已保存的世界事件，回放不會重新產生對話。</p>`;
  $('evidence-dialog').showModal();
}
function showPair(key) {
  const dyad=frame().metrics.dyads.find(d=>d.key===key);if(!dyad) return;
  stop(); $('evidence-title').textContent = `${actor(dyad.a).name}與${actor(dyad.b).name}的交集`;
  const interactions=pastEvents().filter(e=>e.type==='interaction' && e.pair===key);
  // Resolve source events from the full prefix; viewFrame intentionally keeps only 180 recent events.
  const sources=interactions.map(e=>pastEvents().find(s=>s.id===e.sourceId) ?? e);
  $('evidence-body').innerHTML = `<p class="evidence-note">共 ${dyad.allDays.length} 個互動日（${dyad.allDays.map(d=>'D'+d).join('、') || '尚無'}）。以下列出全部 ${sources.length} 次有效回覆或合作證據；同一天最多計一個互動日。這些接觸不等於友誼。</p>`+sources.slice().reverse().map(evidenceCard).join('');
  $('evidence-dialog').showModal();
}
function mode(research) {
  $('research').hidden=!research;
  for(const name of ['life','research']) {const active=research===(name==='research');$('mode-'+name).classList.toggle('active',active);$('mode-'+name).setAttribute('aria-pressed',String(active));}
  if(research) $('research').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
  else $('town-section').scrollIntoView({behavior:reduced.matches?'instant':'smooth',block:'start'});
}
$('play').addEventListener('click',start);
$('step').addEventListener('click',()=>{stop();advance();});
$('latest').addEventListener('click',()=>{stop();viewed=state.tick;render();});
$('speed').addEventListener('change',()=>{if(timer){clearInterval(timer);timer=setInterval(advance,Number($('speed').value));}});
$('seek').addEventListener('input',()=>{stop();viewed=Number($('seek').value);render();});
$('event-filter').addEventListener('change',renderEvents);
$('mode-life').addEventListener('click',()=>mode(false));$('mode-research').addEventListener('click',()=>mode(true));
for(const tab of ['now','memory','connections']) $('tab-'+tab).addEventListener('click',()=>{
  activeTab=tab;
  for(const name of ['now','memory','connections']) {const active=name===tab;$('tab-'+name).classList.toggle('active',active);$('tab-'+name).setAttribute('aria-selected',String(active));}
  $('agent-detail').setAttribute('aria-labelledby','tab-'+tab);renderAgent(frame());
});
$('settings-open').addEventListener('click',()=>{stop();$('seed').value=state.config.seed;$('condition').value=state.config.capacity;$('settings-error').textContent='';$('settings-dialog').showModal();});
$('settings-form').addEventListener('submit',event=>{
  event.preventDefault();if(busy)return;
  try {
    if(!$('seed').value.trim()) throw new Error('請輸入場次種子。');
    const fresh=createWorld({seed:Number($('seed').value),capacity:Number($('condition').value)});
    stop();state=fresh;frames=[viewFrame(state)];viewed=0;$('pair-panel').hidden=true;
    $('settings-dialog').close();render();toast('新小鎮準備好了，按「開始生活」觀察第一天。');
  } catch(error){$('settings-error').textContent=error.message;}
});
function expandTown(expanded) {
  document.querySelector('.world-panel').classList.toggle('expanded', expanded);
  document.body.classList.toggle('town-expanded', expanded);
  $('fullscreen').setAttribute('aria-pressed', String(expanded));
  $('fullscreen').innerHTML = expanded ? '↙ <span>收回小鎮</span>' : '⛶ <span>放大小鎮</span>';
}
$('fullscreen').addEventListener('click',()=>expandTown(!document.body.classList.contains('town-expanded')));
document.addEventListener('keydown',event=>{if(event.key==='Escape')expandTown(false);});
$('zoom-in').addEventListener('click',()=>scene.zoomIn());
$('zoom-out').addEventListener('click',()=>scene.zoomOut());
$('camera-reset').addEventListener('click',()=>scene.resetCamera());
$('camera-follow').addEventListener('click',()=>scene.setFollow(!cameraFollowing));
$('explore-toggle').addEventListener('click',()=>scene.setExplore(!exploring));
$('object-close').addEventListener('click',()=>{inspectedObject=null;renderObject();document.querySelector('#town-stage canvas')?.focus();});
for(const button of document.querySelectorAll('[data-zone]')) button.addEventListener('click',()=>scene.focusZone(button.dataset.zone));
$('town-minimap').addEventListener('click',event=>{
  if(!event.detail){scene.resetCamera();return;}
  const rect=$('town-minimap').getBoundingClientRect();
  scene.panTo((event.clientX-rect.left)/rect.width*WORLD_SIZE.width,(event.clientY-rect.top)/rect.height*WORLD_SIZE.height);
});
$('finish').addEventListener('click',()=>background('finish',{state},result=>{state=result.state;frames.push(...result.frames);viewed=state.tick;render();toast('十日已完成。拖動時間軸，或按「從頭回放」觀看保存的生活。');}));
$('compare').addEventListener('click',()=>background('compare',{seed:state.config.seed,capacity:state.config.capacity===3?3:2},({pair})=>{
  $('pair-panel').hidden=false;
  $('pair-panel').innerHTML=`<h3>同種子的兩座小鎮 <span class="mini-label">SEED ${pair.seed}</span></h3><table><thead><tr><th>設備條件</th><th>主要指標 Y</th><th>容量失敗／嘗試</th><th>完成合作</th></tr></thead><tbody>${[['A8',pair.a],['B'+pair.lowCapacity,pair.b]].map(([name,m])=>`<tr><td>${name}</td><td>${percent(m.y)}</td><td>${m.capacityFailures} / ${m.borrowAttempts}</td><td>${m.completedCooperations}</td></tr>`).join('')}</tbody></table><p class="delta">B − A = ${pair.deltaPercentagePoints>0?'+':''}${pair.deltaPercentagePoints.toFixed(2)} 個百分點</p><p>${esc(pair.note)} 目前觀看的場次保留。</p>`;
  toast('配對示範完成。數值來自離線策略，不是正式研究結果。');
}));
$('export').addEventListener('click',()=>{
  stop();const blob=new Blob([JSON.stringify(exportRun(state))],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`ai-town-demo-${state.config.seed}-capacity${state.config.capacity}-tick${state.tick}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1500);toast(`已匯出全部 ${state.tick} 個已執行時段，包含完整提議與記憶紀錄。`);
});
$('import').addEventListener('click',()=>$('file').click());
$('file').addEventListener('change',async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  if(file.size>20*1024*1024){toast('檔案超過 20 MB 上限。');return;}
  try{const data=JSON.parse(await file.text());background('import',{data},result=>{state=result.state;frames=result.frames;viewed=0;$('pair-panel').hidden=true;render();toast('回放驗證通過。按「播放回放」從第一天開始觀看。');});}catch{toast('無法讀取 JSON，請選擇本 demo 匯出的紀錄。');}
});
document.addEventListener('click',event=>{
  const target=event.target.closest('[data-agent],[data-event],[data-pair],[data-jump],[data-close]');if(!target)return;
  if(target.dataset.close)$(target.dataset.close).close();
  else if(target.dataset.agent)selectAgent(target.dataset.agent);
  else if(target.dataset.event)showEvent(target.dataset.event);
  else if(target.dataset.pair)showPair(target.dataset.pair);
  else if(target.dataset.jump){stop();viewed=Number(target.dataset.jump);$('evidence-dialog').close();render();$('town-section').scrollIntoView({behavior:reduced.matches?'instant':'smooth'});}
});
$('network').addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&event.target.matches('[role="button"]')){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
document.querySelector('.inspector-tabs').addEventListener('keydown',event=>{
  if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
  event.preventDefault();const tabs=['now','memory','connections'];let i=tabs.indexOf(activeTab);i=event.key==='Home'?0:event.key==='End'?2:(i+(event.key==='ArrowRight'?1:2))%3;$('tab-'+tabs[i]).click();$('tab-'+tabs[i]).focus();
});
window.addEventListener('pagehide',()=>{stop();worker?.terminate();scene.destroy();});
render();
