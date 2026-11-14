// Where each resident is drawn for a view frame, and what they appear to be doing.
//
// Placement is derived only from events the engine already recorded: a seat
// for a successful rest, a work table for successful work, a spot beside the
// person they actually spoke with. These points are presentation only; they
// never decide eligibility, distance or any research outcome.
import {
  TILE_SIZE,
  ZONE_CENTERS,
  REST_SEATS,
  WORK_SEATS,
  tileCenter,
  mapObject,
  isWalkable,
  nearestWalkable,
  locationAt,
} from './town-map.js';

/** Eight standing spots per district, one per resident (by resident order). */
const IDLE_SPOTS = {
  home: [5, 8, 11, 13, 17, 19, 22, 25].map(x => [x, 16]),
  workshop: [38, 41, 44, 47, 50, 53, 56, 59].map(x => [x, 12]),
  plaza: [5, 8, 11, 14, 17, 20, 23, 26].map(x => [x, 33]),
  studio: [38, 41, 44, 47, 50, 53, 56, 59].map(x => [x, 38]),
};
/** Where a conversation gathers when nobody in it is tied to furniture (tiles). */
const CONVERSATION_SPOTS = { home: [16, 17], workshop: [48, 12], plaza: [15, 37], studio: [48, 38] };
const EQUIPMENT_DISTRICTS = ['workshop', 'studio'];
const SPEECH_KINDS = new Set(['talk', 'reply', 'invite', 'accept', 'decline']);
const FAILURE_KINDS = new Set(['invalid', 'capacity_failure', 'join_failed']);
/** Event kinds that show what a resident is doing in their district. */
const ACTIVITY_KINDS = new Set([
  ...SPEECH_KINDS,
  'rest',
  'wait',
  'work',
  'join',
  'borrow',
  'return',
  'walk',
  'move',
]);
const SEARCH_RADIUS = 8;
const workLabel = zone => (zone === 'studio' ? '整理構圖與攝影' : '在工作桌製作');
const pointKey = point => point.join(',');
const toTile = point => point.map(n => Math.floor(n / TILE_SIZE));

const anchorsByFrame = new WeakMap();

/**
 * The anchor for one resident in a frame: `point` (pixels), `label`, `facing`,
 * `seated` and, when furniture is involved, its `objectId`. Returns a copy.
 */
export function activityAnchor(agent, frame) {
  const anchor = frameAnchors(frame).get(agent.id);
  if (!anchor) return { point: nearestWalkable(ZONE_CENTERS[agent.zone] ?? [1024, 768]), label: '觀察中' };
  return { ...anchor, point: anchor.point.slice() };
}

function frameAnchors(frame) {
  if (!anchorsByFrame.has(frame)) {
    const earliestTick = Math.min(frame.tick, ...frame.events.map(e => e.tick));
    const byTick = new Map();
    const anchorsAt = tick => {
      if (!byTick.has(tick)) byTick.set(tick, placeResidents(frame, tick, earliestTick, anchorsAt));
      return byTick.get(tick);
    };
    anchorsByFrame.set(frame, anchorsAt(frame.tick));
  }
  return anchorsByFrame.get(frame);
}

/** Anchors for every resident at `tick`, using the frame's agents and (recent) events. */
function placeResidents(frame, tick, earliestTick, anchorsAt) {
  const history = frame.events.filter(e => e.tick <= tick);
  const succeededNow = history.filter(e => e.tick === tick && e.success === true);
  const agents = zonesAt(frame, tick);
  const failedNow = new Set(
    history
      .filter(e => e.tick === tick && (e.success === false || FAILURE_KINDS.has(e.type)))
      .map(e => e.participants[0]),
  );
  // A rejected action changes nothing on screen: keep the previous tick's placement.
  const previous = failedNow.size && tick > earliestTick ? anchorsAt(tick - 1) : null;

  const anchors = new Map();
  const working = new Set(); // working at a table during this tick
  const locked = new Set(); // tied to furniture during this tick (working, resting, waiting)
  for (const [index, agent] of agents.entries()) {
    if (failedNow.has(agent.id) && previous?.has(agent.id)) {
      const kept = previous.get(agent.id);
      anchors.set(agent.id, { ...kept, point: kept.point.slice() });
      continue;
    }
    anchors.set(agent.id, anchorForLatestActivity(agent, index, history, tick, { working, locked }));
  }
  seatWorkers(agents, anchors, working, succeededNow);
  gatherConversations(agents, anchors, locked, succeededNow);
  separateOverlaps(agents, anchors, { working, locked, failedNow });
  return anchors;
}

/**
 * Residents with the zone they were in at `tick`. Move events record the zone
 * the mover left, so undoing later moves (latest first, earliest last) restores it.
 */
function zonesAt(frame, tick) {
  const agents = frame.agents.map(agent => ({ ...agent }));
  for (const event of frame.events.slice().reverse()) {
    if (event.tick <= tick || event.type !== 'move' || !event.success) continue;
    const mover = agents.find(agent => agent.id === event.participants[0]);
    if (mover) mover.zone = event.zone;
  }
  return agents;
}

function anchorForLatestActivity(agent, index, history, tick, { working, locked }) {
  const latest = history
    .filter(
      e =>
        e.success === true &&
        e.participants?.[0] === agent.id &&
        ACTIVITY_KINDS.has(e.type) &&
        (e.type === 'move' ? e.destination === agent.zone : !e.zone || e.zone === agent.zone),
    )
    .at(-1);
  const kind = latest?.type;
  const slot = index % 8;
  const happeningNow = latest?.tick === tick;

  if (kind === 'rest' || kind === 'wait') {
    const seat = REST_SEATS[agent.zone][slot];
    if (happeningNow) locked.add(agent.id);
    return {
      point: seat.approach.slice(),
      objectId: seat.id,
      label: kind === 'rest' ? '坐下休息' : '坐下等候',
      facing: seat.facing,
      seated: true,
    };
  }
  if ((kind === 'work' || kind === 'join') && WORK_SEATS[agent.zone]) {
    const seat = WORK_SEATS[agent.zone][slot];
    if (happeningNow) {
      working.add(agent.id);
      locked.add(agent.id);
    }
    return {
      point: seat.point.slice(),
      objectId: seat.object.id,
      label: workLabel(agent.zone),
      facing: 'up',
      seated: false,
    };
  }
  if ((kind === 'borrow' || kind === 'return') && WORK_SEATS[agent.zone]) {
    const studio = agent.zone === 'studio';
    return {
      point: tileCenter(38 + index, studio ? 31 : 5),
      objectId: mapObject(studio ? 'studio-storage' : 'workshop-storage').id,
      label: kind === 'borrow' ? '在器材櫃借用設備' : '歸還器材',
      facing: 'up',
      seated: false,
    };
  }
  if (kind === 'walk') {
    const spot = IDLE_SPOTS[agent.zone][(index + latest.tick) % 8];
    return { point: tileCenter(...spot), label: '在附近散步', facing: 'down', seated: false };
  }
  return {
    point: tileCenter(...IDLE_SPOTS[agent.zone][slot]),
    label: '在附近觀察',
    facing: 'down',
    seated: false,
  };
}

/**
 * Give every current worker a distinct work seat. Partners of a completed
 * cooperation share one table first; everyone else then takes their own seat
 * or the first free one. This stays collision-free even with eight items (A8).
 */
function seatWorkers(agents, anchors, working, succeededNow) {
  const residentIndex = id => agents.findIndex(agent => agent.id === id);
  for (const zone of EQUIPMENT_DISTRICTS) {
    const workers = agents.filter(agent => agent.zone === zone && working.has(agent.id));
    const seats = WORK_SEATS[zone];
    const usedSeats = new Set();
    const seated = new Set();
    const seat = (id, seatIndex) => {
      const { point, object } = seats[seatIndex];
      usedSeats.add(seatIndex);
      seated.add(id);
      anchors.set(id, {
        point: point.slice(),
        objectId: object.id,
        label: workLabel(zone),
        facing: 'up',
        seated: false,
      });
    };
    const tableIsFree = table => !usedSeats.has(table * 2) && !usedSeats.has(table * 2 + 1);

    for (const event of succeededNow.filter(e => e.type === 'cooperation')) {
      const partners = event.participants.filter(id => workers.some(worker => worker.id === id));
      if (partners.length !== 2) continue;
      const preferredTable = Math.floor(residentIndex(partners[0]) / 2);
      const table = [preferredTable, 0, 1, 2, 3].find(tableIsFree);
      if (table === undefined) continue;
      seat(partners[0], table * 2);
      seat(partners[1], table * 2 + 1);
    }
    for (const worker of workers) {
      if (seated.has(worker.id)) continue;
      const preferred = residentIndex(worker.id) % 8;
      seat(worker.id, usedSeats.has(preferred) ? seats.findIndex((_, i) => !usedSeats.has(i)) : preferred);
    }
  }
}

/**
 * Residents who actually spoke this tick form groups (merged when they share a
 * member). Members tied to furniture stay put and the others stand next to
 * them; otherwise the group gathers around the district's conversation spot.
 */
function gatherConversations(agents, anchors, locked, succeededNow) {
  const speech = succeededNow.filter(e => SPEECH_KINDS.has(e.type));
  for (const zone of Object.keys(IDLE_SPOTS)) {
    const present = new Set(agents.filter(agent => agent.zone === zone).map(agent => agent.id));
    const groups = [];
    for (const event of speech) {
      const speakers = event.participants.filter(id => present.has(id));
      if (speakers.length < 2) continue;
      const touching = groups.filter(group => speakers.some(id => group.has(id)));
      const merged = new Set(speakers);
      for (const group of touching) for (const id of group) merged.add(id);
      for (const group of touching) groups.splice(groups.indexOf(group), 1);
      groups.push(merged);
    }

    for (const [groupIndex, group] of groups.entries()) {
      const members = [...group].sort();
      const fixed = members.filter(id => locked.has(id));
      const [cx, cy] = fixed.length ? toTile(anchors.get(fixed[0]).point) : CONVERSATION_SPOTS[zone];
      // Several free-standing groups in one district are spread three tiles apart.
      const offset = fixed.length ? 0 : groupIndex * 3;
      const taken = new Set(
        [...anchors]
          .filter(([id]) => !group.has(id) || locked.has(id))
          .map(([, anchor]) => pointKey(anchor.point)),
      );
      const spots = [];
      for (let radius = 0; radius < SEARCH_RADIUS; radius++)
        for (let dy = -radius; dy <= radius; dy++)
          for (let dx = -radius; dx <= radius; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            const point = tileCenter(cx + dx + offset, cy + dy);
            if (isWalkable(...point) && locationAt(...point).zone === zone && !taken.has(pointKey(point)))
              spots.push(point);
          }

      let nextSpot = 0;
      for (const id of members) {
        if (locked.has(id)) continue;
        const point = spots[nextSpot++];
        if (!point) continue;
        anchors.set(id, {
          ...anchors.get(id),
          point,
          objectId: undefined,
          label: '與身旁的居民交談',
          seated: false,
          facing: point[0] < cx * TILE_SIZE + TILE_SIZE / 2 ? 'right' : 'left',
        });
      }
    }
  }
}

const NEARBY_DIRECTIONS = radius => [
  [-radius, 0],
  [radius, 0],
  [0, radius],
  [0, -radius],
  [-radius, -radius],
  [radius, -radius],
  [-radius, radius],
  [radius, radius],
];

/**
 * A vacated conversation spot can coincide with someone else's destination.
 * Furniture users keep their place; the other resident moves to a free tile nearby
 * rather than two bodies being drawn on top of each other.
 */
function separateOverlaps(agents, anchors, { working, locked, failedNow }) {
  const rank = id => (working.has(id) ? 0 : locked.has(id) ? 1 : failedNow.has(id) ? 2 : 3);
  const occupied = new Set();
  const byRank = agents.slice().sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id));
  for (const agent of byRank) {
    const anchor = anchors.get(agent.id);
    if (occupied.has(pointKey(anchor.point))) {
      const [cx, cy] = toTile(anchor.point);
      let free = null;
      for (let radius = 1; radius < SEARCH_RADIUS && !free; radius++)
        for (const [dx, dy] of NEARBY_DIRECTIONS(radius)) {
          const candidate = tileCenter(cx + dx, cy + dy);
          if (
            isWalkable(...candidate) &&
            locationAt(...candidate).zone === agent.zone &&
            !occupied.has(pointKey(candidate))
          ) {
            free = candidate;
            break;
          }
        }
      if (free) anchor.point = free;
    }
    occupied.add(pointKey(anchor.point));
  }
}
