// HTML for the side panels, the interaction network and the evidence dialog.
// Every function is pure: it receives what to show and returns markup.
import { ZONES, ACTION_NAMES, dayOf, slotOf } from '../config.js';
import { residentPortrait } from '../resident-art.js';
import { escapeHTML as esc, percent } from './dom.js';
import { EVENT_LABELS, FAILURE_KINDS, LIFE_KINDS, conditionName, equipmentLabel } from './labels.js';

export const portrait = agent => `<img src="${residentPortrait(agent)}" alt="" draggable="false">`;
const eventLabel = event => EVENT_LABELS[event.type] || esc(event.type);
const emptyState = (icon, message) =>
  `<div class="empty"><span class="empty-icon">${icon}</span>${message}</div>`;
const intro = text => `<p class="memory-intro">${text}</p>`;

/**
 * A view of the run at the playback cursor.
 * @typedef {object} View
 * @property {object} frame       the view frame being shown
 * @property {string} selected    the selected resident's id
 * @property {(id: string) => object | undefined} resident  look up a resident in the frame
 * @property {object[]} pastEvents every event up to the cursor (not only the frame's recent ones)
 */

/** Portrait, name and description of the selected resident. */
export function profileHTML(agent) {
  return (
    `<div class="agent-profile"><div class="portrait">${portrait(agent)}</div>` +
    `<div><h2>${esc(agent.name)}<small>${agent.id}</small></h2><p>${esc(agent.interests)}</p></div></div>` +
    `<p class="agent-style">${esc(agent.style)}</p>`
  );
}

/** "此刻" tab: this tick's proposal, how it settled, held equipment and recent moments. */
export function nowTabHTML({ frame, selected, resident, pastEvents }) {
  const proposal = frame.trace?.proposals.find(p => p.actor === selected);
  const results = proposal && pastEvents.filter(e => e.proposalId === proposal.id);
  const failure = results?.find(e => FAILURE_KINDS.includes(e.type));
  const held = frame.equipment.find(e => e.owner === selected);
  const recent = pastEvents
    .filter(e => e.participants.includes(selected) && LIFE_KINDS.includes(e.type))
    .slice(-3)
    .reverse();

  const kicker = frame.tick
    ? `第 ${dayOf(frame.tick)} 天 · 時段 ${slotOf(frame.tick)} 的提議`
    : '新的一天，還有很多可能';
  let action = '準備開始今天的生活';
  let thought = '點選「開始生活」，看看誰會先出門，又會遇見誰。';
  let outcome = '';
  if (proposal) {
    const target = proposal.target ? ' · ' + esc(resident(proposal.target)?.name ?? proposal.target) : '';
    action = ACTION_NAMES[proposal.action] + target;
    const destination =
      proposal.destination && `前往${ZONES[proposal.destination]?.name ?? proposal.destination}`;
    thought = esc(proposal.text || destination || '依目前狀態安排自己的活動。');
    const result = failure?.reason || results.find(e => e.type !== 'borrow_attempt')?.text || '本步已結算';
    outcome = `<div class="outcome ${failure ? 'failed' : ''}"><span class="status-dot"></span><span>${esc(result)}</span></div>`;
  }
  const equipment = held
    ? `持有${equipmentLabel(held.type)} · ${held.usableFrom > frame.tick ? '下一時段可用' : '可於下一步使用'}` +
      `<br>於第 ${dayOf(held.until)} 天時段 ${slotOf(held.until)} 結束歸還`
    : '目前未持有設備，可自由安排下一步。';
  const recentLines = recent.length
    ? '<h4 class="mini-heading">最近的小事</h4>' +
      recent
        .map(
          e =>
            `<div class="recent-line"><small>第 ${dayOf(e.tick)} 天 · ${EVENT_LABELS[e.type]}</small>` +
            `<button data-event="${e.id}">${esc(e.text)}</button></div>`,
        )
        .join('')
    : '';

  return (
    `<div class="detail-kicker">${kicker}</div><h3 class="current-action">${action}</h3>` +
    `<p class="thought">${thought}</p>${outcome}<div class="equipment-info">${equipment}</div>${recentLines}`
  );
}

/** "記憶" tab: the remembered events the resident was given before deciding. */
export function memoryTabHTML({ frame, selected }) {
  const proposal = frame.trace?.proposals.find(p => p.actor === selected);
  const observation = frame.trace?.observations[selected];
  const where = observation
    ? `當時位於${ZONES[observation.actor.zone].name}，共 ${observation.provided.length} 筆。`
    : '尚未產生第一份觀察。';
  const cards = observation?.provided.length
    ? observation.provided
        .map(memory => {
          const cited = proposal.citedMemoryIds.includes(memory.id);
          const age = memory.score === null ? '近期觀察' : '較早記憶';
          const crossDay = memory.day < dayOf(frame.tick) ? ' · 跨日' : '';
          return (
            `<button class="memory-card ${cited ? 'cited' : ''}" data-event="${esc(memory.id)}">` +
            `<span>D${memory.day} · 時段 ${slotOf(memory.tick)} · ${age}${crossDay}</span>${esc(memory.text)}` +
            `${cited ? '<br><em>本步已引用</em>' : ''}</button>`
          );
        })
        .join('')
    : emptyState('▤', '生活開始後，記憶也會慢慢累積。');
  const budget = observation
    ? `約 ${observation.estimatedTokens} tokens${observation.truncated ? '，已依容量截取' : ''}。`
    : '';
  return (
    intro(`此步決策前實際取得的事件。${where}<br>綠邊表示這一步的規則策略有引用，點選可查來源。`) +
    cards +
    intro(`${budget}容量為近似估算。尚未接入模型反思；引用不等於因果證據。`)
  );
}

/** "互動" tab: everyone the resident has completed an interaction with, most days first. */
export function connectionsTabHTML({ frame, selected, resident }) {
  const dyads = frame.metrics.dyads
    .filter(d => d.allDays.length && [d.a, d.b].includes(selected))
    .sort((a, b) => b.allDays.length - a.allDays.length || a.key.localeCompare(b.key));
  const rows = dyads.length
    ? dyads
        .map(d => {
          const other = resident(d.a === selected ? d.b : d.a);
          return (
            `<button class="connection-row" data-pair="${d.key}"><span class="mini-portrait">${portrait(other)}</span>` +
            `<span><strong>${esc(other.name)}</strong><small>${d.allDays.map(day => `D${day}`).join(' · ')}</small></span>` +
            `<span>${d.allDays.length} 日 ↗</span></button>`
          );
        })
        .join('')
    : emptyState('↔', '還沒有完成的互動。<br>先看看大家今天會去哪裡。');
  return intro('截至這個時段，已經留下有效回覆或完成合作的交集。互動日數不代表友誼。') + rows;
}

// ---------------------------------------------------------------------------
// Interaction network: residents on an ellipse, a line per pair that interacted.

const NETWORK_CENTER = { x: 180, y: 130 };
const NETWORK_RADIUS = { x: 114, y: 90 };

function networkPositions(agents) {
  return Object.fromEntries(
    agents.map((agent, i) => {
      const angle = (i * Math.PI) / 4 - Math.PI / 2;
      return [
        agent.id,
        {
          x: NETWORK_CENTER.x + NETWORK_RADIUS.x * Math.cos(angle),
          y: NETWORK_CENTER.y + NETWORK_RADIUS.y * Math.sin(angle),
        },
      ];
    }),
  );
}

/** SVG content: a wide transparent hit line under each visible link, then a node per resident. */
export function networkSVG({ frame, selected, resident }) {
  const at = networkPositions(frame.agents);
  const links = frame.metrics.dyads
    .filter(d => d.allDays.length)
    .map(d => {
      const [a, b] = [at[d.a], at[d.b]];
      const coordinates = `x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"`;
      const label = `${esc(resident(d.a).name)}與${esc(resident(d.b).name)}，${d.allDays.length}個互動日`;
      return (
        `<g data-pair="${d.key}" role="button" tabindex="0" aria-label="${label}">` +
        `<line ${coordinates} stroke="transparent" stroke-width="14"/>` +
        `<line ${coordinates} class="network-link${d.qualifies ? ' qualifies' : ''}" stroke-width="${Math.min(4.5, 1.2 + d.allDays.length / 2)}" stroke-linecap="round" opacity=".85"/></g>`
      );
    })
    .join('');
  const nodes = frame.agents
    .map(agent => {
      const { x, y } = at[agent.id];
      return (
        `<g data-agent="${agent.id}" role="button" tabindex="0" aria-label="查看${esc(agent.name)}">` +
        `<circle cx="${x}" cy="${y}" r="18" fill="${agent.color}" class="node-ring${agent.id === selected ? ' selected' : ''}" stroke-width="3"/>` +
        `<text x="${x}" y="${y + 4.5}" text-anchor="middle" fill="white" font-size="12" font-weight="700">${esc(agent.name.slice(-1))}</text>` +
        `<text x="${x}" y="${y + 33}" text-anchor="middle" class="node-name" font-size="11">${esc(agent.name)}</text></g>`
      );
    })
    .join('');
  return '<circle cx="180" cy="130" r="91" class="network-ring" stroke-dasharray="3 6"/>' + links + nodes;
}

/** One button per pair that interacted, most interaction days first. */
export function pairLinksHTML({ frame, resident }) {
  const dyads = frame.metrics.dyads.filter(d => d.allDays.length);
  if (!dyads.length) return intro('交集會隨著生活逐步出現。');
  return dyads
    .sort((a, b) => b.allDays.length - a.allDays.length)
    .map(
      d =>
        `<button data-pair="${d.key}">${esc(resident(d.a).name)} × ${esc(resident(d.b).name)} · ${d.allDays.length} 日</button>`,
    )
    .join('');
}

export function networkStatsHTML({ frame }) {
  const pairs = frame.metrics.dyads.filter(d => d.allDays.length).length;
  return (
    `<div><strong>${pairs}</strong>有過交集的組合</div>` +
    `<div><strong>${frame.metrics.completedCooperations}</strong>已完成合作</div>`
  );
}

// ---------------------------------------------------------------------------
// Evidence dialog and comparison table.

export function evidenceCardHTML(event, resident) {
  const people = event.participants.map(id => esc(resident(id)?.name ?? id)).join('、');
  const zone = event.zone ? ' · ' + ZONES[event.zone].name : '';
  const reason = event.failure_reason || event.reason;
  return (
    `<article class="evidence-card"><small>D${dayOf(event.tick)} · 時段 ${slotOf(event.tick)} · ${eventLabel(event)} · ${event.id}</small>` +
    `<p>${esc(event.text)}</p><div class="evidence-meta">${people}${zone}${reason ? ' · ' + esc(reason) : ''}</div>` +
    `<button data-jump="${event.tick}">回到這個時段 →</button></article>`
  );
}

/** An event, the interaction it led to (if any) and which run it belongs to. */
export function eventEvidenceHTML(event, related, config, resident) {
  return (
    evidenceCardHTML(event, resident) +
    (related ? '<p class="evidence-note">對應的互動事件</p>' + evidenceCardHTML(related, resident) : '') +
    `<p class="evidence-note">場次 ${config.seed} · ${conditionName(config.capacity)}。這是已保存的世界事件，回放不會重新產生對話。</p>`
  );
}

/** All evidence behind one pair's interaction days, newest first. */
export function pairEvidenceHTML(dyad, sources, resident) {
  const days = dyad.allDays.map(d => 'D' + d).join('、') || '尚無';
  return (
    `<p class="evidence-note">共 ${dyad.allDays.length} 個互動日（${days}）。以下列出全部 ${sources.length} 次有效回覆或合作證據；同一天最多計一個互動日。這些接觸不等於友誼。</p>` +
    sources
      .slice()
      .reverse()
      .map(event => evidenceCardHTML(event, resident))
      .join('')
  );
}

export function comparisonHTML(pair) {
  const rows = [
    ['A8', pair.a],
    ['B' + pair.lowCapacity, pair.b],
  ]
    .map(
      ([name, m]) =>
        `<tr><td>${name}</td><td>${percent(m.y)}</td><td>${m.capacityFailures} / ${m.borrowAttempts}</td><td>${m.completedCooperations}</td></tr>`,
    )
    .join('');
  const delta = pair.deltaPercentagePoints;
  return (
    `<h3>同種子的兩座小鎮 <span class="mini-label">SEED ${pair.seed}</span></h3>` +
    `<table><thead><tr><th>設備條件</th><th>主要指標 Y</th><th>容量失敗／嘗試</th><th>完成合作</th></tr></thead><tbody>${rows}</tbody></table>` +
    `<p class="delta">B − A = ${delta > 0 ? '+' : ''}${delta.toFixed(2)} 個百分點</p>` +
    `<p>${esc(pair.note)} 目前觀看的場次保留。</p>`
  );
}
