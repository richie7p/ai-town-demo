// Display-only geography. The V5 engine owns actions, capacity and outcomes.
export const TILE_SIZE = 32;
export const WORLD_SIZE = Object.freeze({ width: 2048, height: 1536 });
export const MAP_COLUMNS = 64,
  MAP_ROWS = 48;
const center = (x, y) => [x * TILE_SIZE + 16, y * TILE_SIZE + 16];
export const ZONE_CENTERS = Object.freeze({
  home: center(15, 12),
  workshop: center(48, 12),
  plaza: center(15, 36),
  studio: center(48, 36),
});
export const MAP_ROOMS = Object.freeze([
  {
    zone: 'home',
    name: '日和公寓',
    subtitle: 'HOME · REST & READ',
    x: 3,
    y: 3,
    w: 25,
    h: 17,
    floor: 'wood',
    color: '#c79d76',
    doors: [
      [14, 19],
      [15, 19],
    ],
  },
  {
    zone: 'workshop',
    name: '木光工坊',
    subtitle: 'WORKSHOP · MAKE TOGETHER',
    x: 36,
    y: 3,
    w: 25,
    h: 17,
    floor: 'stone',
    color: '#8caa9d',
    doors: [
      [47, 19],
      [48, 19],
    ],
  },
  {
    zone: 'plaza',
    name: '街角咖啡・公共客廳',
    subtitle: 'COMMONS · MEET & TALK',
    x: 3,
    y: 28,
    w: 25,
    h: 17,
    floor: 'cafe',
    color: '#c9a775',
    doors: [
      [14, 28],
      [15, 28],
    ],
  },
  {
    zone: 'studio',
    name: '光影活動室',
    subtitle: 'STUDIO · CAPTURE & CREATE',
    x: 36,
    y: 28,
    w: 25,
    h: 17,
    floor: 'studio',
    color: '#9a9db9',
    doors: [
      [47, 28],
      [48, 28],
    ],
  },
]);
export const MAP_TILES = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill('grass'));
const blocked = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill(true));
const walls = [];
function floorRect(x, y, w, h, kind = 'path') {
  for (let j = y; j < y + h; j++)
    for (let i = x; i < x + w; i++)
      if (i >= 0 && j >= 0 && i < MAP_COLUMNS && j < MAP_ROWS) {
        MAP_TILES[j][i] = kind;
        blocked[j][i] = false;
      }
}
floorRect(1, 22, 62, 4);
floorRect(30, 1, 4, 46);
floorRect(13, 18, 4, 12);
floorRect(46, 18, 4, 12);
floorRect(10, 20, 10, 8, 'paving');
floorRect(43, 20, 10, 8, 'paving');
floorRect(2, 21, 27, 6, 'paving');
floorRect(35, 21, 27, 6, 'paving');
function wall(x, y, zone, edge = 'inside') {
  blocked[y][x] = true;
  MAP_TILES[y][x] = 'wall';
  walls.push({ x: x * 32, y: y * 32, width: 32, height: 32, zone, edge });
}
for (const room of MAP_ROOMS) {
  floorRect(room.x + 1, room.y + 1, room.w - 2, room.h - 2, room.floor);
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) {
      if (x !== room.x && x !== room.x + room.w - 1 && y !== room.y && y !== room.y + room.h - 1) continue;
      if (room.doors.some(p => p[0] === x && p[1] === y)) {
        floorRect(x, y, 1, 1, 'door');
        continue;
      }
      wall(x, y, room.zone, y === room.y ? 'north' : y === room.y + room.h - 1 ? 'south' : 'side');
    }
}
// Four quiet bedrooms open into one shared living room.
for (const x of [9, 15, 21]) for (let y = 4; y <= 10; y++) wall(x, y, 'home');
for (let x = 4; x <= 26; x++) if (![6, 12, 18, 24].includes(x)) wall(x, 11, 'home', 'south');
export const MAP_WALLS = Object.freeze(walls);
const objects = [];
function add(id, zone, kind, x, y, w, h, name, description, options = {}) {
  const o = {
    id,
    zone,
    kind,
    x: x * 32,
    y: y * 32,
    width: w * 32,
    height: h * 32,
    name,
    description,
    ...options,
  };
  if (o.approach) o.approach = center(...o.approach);
  if (o.approaches) o.approaches = o.approaches.map(p => center(...p));
  if (!o.passable) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) blocked[j][i] = true;
  objects.push(Object.freeze(o));
  return o;
}
const restSeats = { home: [], workshop: [], plaza: [], studio: [] };
const workSeats = { workshop: [], studio: [] };
for (let i = 0; i < 4; i++) {
  const x = 4 + i * 6;
  add(`home-bed-${i}-a`, 'home', 'bed', x, 5, 2, 3, '單人床', '居民的私人休息角落。', {
    approach: [x + 2, 6],
    facing: 'left',
    tone: i,
  });
  add(`home-bed-${i}-b`, 'home', 'bed', x + 3, 5, 2, 3, '單人床', '居民的私人休息角落。', {
    approach: [x + 2, 9],
    facing: 'right',
    tone: i + 1,
  });
  add(`home-shelf-${i}`, 'home', 'bookshelf', x, 9, 2, 1, '床邊書架', '放著書、相片與小盆栽。', {
    approach: [x + 2, 10],
  });
}
add('home-library', 'home', 'bookshelf', 4, 13, 4, 1, '共享書架', '日和公寓的閱讀角落。', {
  approach: [6, 14],
});
add('home-kitchen', 'home', 'counter', 22, 13, 4, 1, '茶水檯', '準備熱茶、收拾杯盤的共用角落。', {
  approach: [24, 14],
});
add('home-coffee', 'home', 'coffee', 14, 15, 3, 1, '客廳矮桌', '可以在這裡整理想法、和鄰居交談。', {
  approach: [15, 16],
});
for (const [i, [x, y]] of [
  [10, 13],
  [12, 13],
  [18, 13],
  [20, 13],
  [10, 17],
  [12, 17],
  [18, 17],
  [20, 17],
].entries()) {
  const o = add(`home-seat-${i}`, 'home', 'armchair', x, y, 1, 1, '客廳沙發椅', '可坐下閱讀和休息。', {
    approach: [x, y],
    seat: true,
    passable: true,
    facing: 'down',
    tone: i % 2,
  });
  restSeats.home.push(o);
}
add('home-plant', 'home', 'plant', 25, 17, 1, 1, '窗邊植栽', '光線下的一角綠意。', { approach: [24, 17] });
add(
  'workshop-storage',
  'workshop',
  'toolwall',
  38,
  4,
  8,
  1,
  '工具收納牆',
  '依序收納工具，方便居民借用與歸還。',
  { approach: [41, 5] },
);
add('workshop-cabinet', 'workshop', 'cabinet', 53, 4, 6, 1, '材料櫃', '木料、零件與尚未完成的小作品。', {
  approach: [56, 5],
});
for (const [i, [x, y]] of [
  [39, 8],
  [51, 8],
  [39, 14],
  [51, 14],
].entries()) {
  const o = add(
    `workshop-desk-${i}`,
    'workshop',
    'workbench',
    x,
    y,
    6,
    2,
    '製作工作桌',
    '居民完成已核准的製作與合作活動。',
    {
      approach: [x + 1, y + 2],
      approaches: [
        [x + 1, y + 2],
        [x + 4, y + 2],
      ],
      facing: 'up',
      tone: i,
    },
  );
  for (let j = 0; j < 2; j++) {
    workSeats.workshop.push({ object: o, point: o.approaches[j] });
    add(
      `workshop-chair-${i}-${j}`,
      'workshop',
      'stool',
      x + (j ? 4 : 1),
      y + 2,
      1,
      1,
      '工作凳',
      '工作桌前的座位。',
      { passable: true, approach: [x + (j ? 4 : 1), y + 2], seat: true, facing: 'up' },
    );
  }
}
for (let i = 0; i < 8; i++) {
  const x = 38 + i * 3;
  const o = add(
    `workshop-seat-${i}`,
    'workshop',
    'stool',
    x,
    18,
    1,
    1,
    '工坊休息凳',
    '等候設備或稍作休息。',
    { approach: [x, 18], passable: true, seat: true, facing: 'up' },
  );
  restSeats.workshop.push(o);
}
add('workshop-plant', 'workshop', 'plant', 58, 12, 1, 1, '工坊盆栽', '桌邊的綠色小角落。', {
  approach: [57, 12],
});
add('plaza-counter', 'plaza', 'cafeCounter', 5, 30, 8, 2, '咖啡吧檯', '飄著咖啡香的公共客廳聚會角落。', {
  approach: [9, 32],
});
add('plaza-shelf', 'plaza', 'bookshelf', 23, 30, 3, 1, '交換書架', '放著可翻閱的書與居民留下的裝飾。', {
  approach: [24, 31],
});
for (const [i, [x, y]] of [
  [7, 35],
  [19, 35],
  [7, 40],
  [19, 40],
].entries()) {
  const table = add(
    `plaza-table-${i}`,
    'plaza',
    'cafeTable',
    x,
    y,
    3,
    2,
    '咖啡圓桌',
    '坐在桌邊休息，或與身旁的人交談。',
    {
      approach: [x - 1, y + 1],
      approaches: [
        [x - 1, y + 1],
        [x + 3, y + 1],
      ],
    },
  );
  for (let j = 0; j < 2; j++) {
    const cx = x + (j ? 3 : -1);
    const o = add(
      `plaza-chair-${i}-${j}`,
      'plaza',
      'chair',
      cx,
      y + 1,
      1,
      1,
      '咖啡座椅',
      '公共客廳的休息座位。',
      { approach: [cx, y + 1], seat: true, passable: true, facing: j ? 'left' : 'right', tone: i },
    );
    restSeats.plaza.push(o);
  }
}
add('plaza-plant', 'plaza', 'plant', 25, 41, 1, 1, '咖啡廳琴葉榕', '窗邊舒展的葉片。', {
  approach: [24, 41],
});
add('plaza-menu', 'plaza', 'sign', 18, 30, 1, 1, '小鎮留言板', '空間說明與展示用留言板。', {
  approach: [18, 31],
});
add('studio-storage', 'studio', 'cabinet', 38, 30, 8, 1, '攝影器材櫃', '相機與攝影配件整齊收納在這裡。', {
  approach: [41, 31],
});
add('studio-backdrop', 'studio', 'backdrop', 52, 30, 7, 2, '攝影背景牆', '共同攝影活動的取景區。', {
  approach: [55, 33],
});
for (const [i, [x, y]] of [
  [39, 34],
  [51, 34],
  [39, 40],
  [51, 40],
].entries()) {
  const o = add(
    `studio-desk-${i}`,
    'studio',
    'editdesk',
    x,
    y,
    6,
    2,
    '影像工作桌',
    '整理構圖、檢視照片的工作位置。',
    {
      approach: [x + 1, y + 2],
      approaches: [
        [x + 1, y + 2],
        [x + 4, y + 2],
      ],
      facing: 'up',
      tone: i,
    },
  );
  for (let j = 0; j < 2; j++) {
    workSeats.studio.push({ object: o, point: o.approaches[j] });
    add(
      `studio-chair-${i}-${j}`,
      'studio',
      'chair',
      x + (j ? 4 : 1),
      y + 2,
      1,
      1,
      '工作椅',
      '影像工作桌前的座位。',
      { passable: true, approach: [x + (j ? 4 : 1), y + 2], seat: true, facing: 'up' },
    );
  }
}
for (let i = 0; i < 8; i++) {
  const x = 38 + i * 3;
  const o = add(
    `studio-seat-${i}`,
    'studio',
    'stool',
    x,
    43,
    1,
    1,
    '活動室休息凳',
    '觀察作品，或等待下一次共同活動。',
    { approach: [x, 43], passable: true, seat: true, facing: 'up' },
  );
  restSeats.studio.push(o);
}
// Outdoor furnishings sit off the main avenues, keeping broad clear crossings.
add('garden-fountain', 'plaza', 'fountain', 5, 22, 3, 3, '街角小噴泉', '公共步道旁的流水聲。', {
  approach: [8, 23],
});
add('garden-planter-a', 'plaza', 'planter', 22, 22, 3, 1, '花壇', '步道旁的季節花草。', {
  approach: [23, 23],
});
add('garden-planter-b', 'studio', 'planter', 54, 23, 4, 1, '香草花壇', '活動室外的小花園。', {
  approach: [55, 24],
});
add('garden-bench-a', 'plaza', 'bench', 19, 25, 3, 1, '街邊長椅', '散步時可以停留的地方。', {
  approach: [20, 24],
  seat: true,
  facing: 'up',
});
add('garden-bench-b', 'studio', 'bench', 39, 21, 3, 1, '樹蔭長椅', '坐著看大家來來往往。', {
  approach: [40, 22],
  seat: true,
  facing: 'up',
});
export const MAP_OBJECTS = Object.freeze(objects);
const objectById = new Map(objects.map(o => [o.id, o]));
export function isWalkable(x, y) {
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x >= WORLD_SIZE.width ||
    y >= WORLD_SIZE.height
  )
    return false;
  return !blocked[Math.floor(y / 32)][Math.floor(x / 32)];
}
export function nearestWalkable(point) {
  const px = Number.isFinite(point?.[0]) ? point[0] : 1024,
    py = Number.isFinite(point?.[1]) ? point[1] : 768;
  const x = Math.max(0, Math.min(63, Math.floor(px / 32))),
    y = Math.max(0, Math.min(47, Math.floor(py / 32)));
  if (!blocked[y][x]) return center(x, y);
  let best = null,
    distance = Infinity;
  for (let j = 0; j < 48; j++)
    for (let i = 0; i < 64; i++)
      if (!blocked[j][i]) {
        const p = center(i, j),
          d = (p[0] - px) ** 2 + (p[1] - py) ** 2;
        if (d < distance) {
          distance = d;
          best = p;
        }
      }
  return best;
}
export function findWalkPath(from, to) {
  if (!isWalkable(...from) || !isWalkable(...to)) return [];
  const sx = Math.floor(from[0] / 32),
    sy = Math.floor(from[1] / 32),
    tx = Math.floor(to[0] / 32),
    ty = Math.floor(to[1] / 32);
  const start = sy * 64 + sx,
    end = ty * 64 + tx,
    previous = new Int32Array(3072).fill(-1),
    queue = new Int32Array(3072);
  let head = 0,
    tail = 0;
  queue[tail++] = start;
  previous[start] = start;
  while (head < tail && previous[end] === -1) {
    const v = queue[head++],
      x = v % 64,
      y = Math.floor(v / 64);
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        n = ny * 64 + nx;
      if (nx < 0 || ny < 0 || nx >= 64 || ny >= 48 || blocked[ny][nx] || previous[n] !== -1) continue;
      previous[n] = v;
      queue[tail++] = n;
    }
  }
  if (previous[end] === -1) return [];
  const route = [];
  for (let at = end; ; at = previous[at]) {
    route.push(center(at % 64, Math.floor(at / 64)));
    if (at === start) break;
  }
  route.reverse();
  // Preserve arbitrary endpoints while only traversing axis-aligned tile centers.
  const result = [from.slice(), [route[0][0], from[1]], ...route, [to[0], route.at(-1)[1]], to.slice()];
  return result.filter((p, i) => !i || p[0] !== result[i - 1][0] || p[1] !== result[i - 1][1]);
}
export function locationAt(x, y) {
  const room = MAP_ROOMS.find(
    r => x >= r.x * 32 && x < (r.x + r.w) * 32 && y >= r.y * 32 && y < (r.y + r.h) * 32,
  );
  return room ? { zone: room.zone, name: room.name, room: room.name } : { zone: null, name: '花園步道' };
}
const defaultPoints = {
  home: [
    [5, 16],
    [8, 16],
    [11, 16],
    [13, 16],
    [17, 16],
    [19, 16],
    [22, 16],
    [25, 16],
  ],
  workshop: [
    [38, 12],
    [41, 12],
    [44, 12],
    [47, 12],
    [50, 12],
    [53, 12],
    [56, 12],
    [59, 12],
  ],
  plaza: [
    [5, 33],
    [8, 33],
    [11, 33],
    [14, 33],
    [17, 33],
    [20, 33],
    [23, 33],
    [26, 33],
  ],
  studio: [
    [38, 38],
    [41, 38],
    [44, 38],
    [47, 38],
    [50, 38],
    [53, 38],
    [56, 38],
    [59, 38],
  ],
};
const socialCenters = { home: [16, 17], workshop: [48, 12], plaza: [15, 37], studio: [48, 38] };
const cache = new WeakMap();
const activityKinds = new Set([
  'rest',
  'wait',
  'work',
  'join',
  'borrow',
  'return',
  'walk',
  'move',
  'talk',
  'reply',
  'invite',
  'accept',
  'decline',
]);
function frameAnchors(frame) {
  if (cache.has(frame)) return cache.get(frame);
  const memo = new Map(),
    earliest = Math.min(frame.tick, ...frame.events.map(e => e.tick));
  function build(tick) {
    if (memo.has(tick)) return memo.get(tick);
    const history = frame.events.filter(e => e.tick <= tick),
      current = history.filter(e => e.tick === tick && e.success === true);
    const agents = frame.agents.map(a => ({ ...a }));
    // Events record the origin zone. Walk backward through later successful
    // moves so a past placement does not inherit a future destination.
    for (const event of frame.events.slice().reverse())
      if (event.tick > tick && event.type === 'move' && event.success) {
        const a = agents.find(a => a.id === event.participants[0]);
        if (a) a.zone = event.zone;
      }
    const anchors = new Map(),
      working = new Set(),
      locked = new Set();
    const failures = new Set(
      history
        .filter(
          e =>
            e.tick === tick &&
            (e.success === false || ['invalid', 'capacity_failure', 'join_failed'].includes(e.type)),
        )
        .map(e => e.participants[0]),
    );
    const before = failures.size && tick > earliest ? build(tick - 1) : null;
    for (const [index, agent] of agents.entries()) {
      if (failures.has(agent.id) && before?.has(agent.id)) {
        const a = before.get(agent.id);
        anchors.set(agent.id, { ...a, point: a.point.slice() });
        continue;
      }
      const latest = history
        .filter(
          e =>
            e.success === true &&
            e.participants?.[0] === agent.id &&
            activityKinds.has(e.type) &&
            (e.type === 'move' ? e.destination === agent.zone : !e.zone || e.zone === agent.zone),
        )
        .at(-1);
      const kind = latest?.type;
      let a = {
        point: center(...defaultPoints[agent.zone][index % 8]),
        label: '在附近觀察',
        facing: 'down',
        seated: false,
      };
      if (['rest', 'wait'].includes(kind)) {
        const o = restSeats[agent.zone][index % 8];
        a = {
          point: o.approach.slice(),
          objectId: o.id,
          label: kind === 'rest' ? '坐下休息' : '坐下等候',
          facing: o.facing,
          seated: true,
        };
        if (latest.tick === tick) locked.add(agent.id);
      } else if (['work', 'join'].includes(kind) && workSeats[agent.zone]) {
        const seat = workSeats[agent.zone][index % 8];
        a = {
          point: seat.point.slice(),
          objectId: seat.object.id,
          label: agent.zone === 'studio' ? '整理構圖與攝影' : '在工作桌製作',
          facing: 'up',
          seated: false,
        };
        if (latest.tick === tick) {
          working.add(agent.id);
          locked.add(agent.id);
        }
      } else if (['borrow', 'return'].includes(kind) && workSeats[agent.zone]) {
        const o = objectById.get(agent.zone === 'studio' ? 'studio-storage' : 'workshop-storage');
        a = {
          point: center(38 + index, agent.zone === 'studio' ? 31 : 5),
          objectId: o.id,
          label: kind === 'borrow' ? '在器材櫃借用設備' : '歸還器材',
          facing: 'up',
          seated: false,
        };
      } else if (kind === 'walk') {
        const point = defaultPoints[agent.zone][(index + latest.tick) % 8];
        a = { point: center(...point), label: '在附近散步', facing: 'down', seated: false };
      }
      anchors.set(agent.id, a);
    }
    // Reserve shared benches for completed cooperation first, then assign all
    // other workers unused seats. This also stays collision-free in A8 runs.
    for (const zone of ['workshop', 'studio']) {
      const workers = agents.filter(a => a.zone === zone && working.has(a.id)),
        slots = workSeats[zone],
        used = new Set(),
        assigned = new Set();
      const assign = (id, n) => {
        const slot = slots[n];
        used.add(n);
        assigned.add(id);
        anchors.set(id, {
          point: slot.point.slice(),
          objectId: slot.object.id,
          label: zone === 'studio' ? '整理構圖與攝影' : '在工作桌製作',
          facing: 'up',
          seated: false,
        });
      };
      for (const event of current.filter(e => e.type === 'cooperation')) {
        const pair = event.participants.filter(id => workers.some(a => a.id === id));
        if (pair.length !== 2) continue;
        const preferred = Math.floor(agents.findIndex(a => a.id === pair[0]) / 2);
        const bench = [preferred, 0, 1, 2, 3].find(n => !used.has(n * 2) && !used.has(n * 2 + 1));
        if (bench !== undefined) {
          assign(pair[0], bench * 2);
          assign(pair[1], bench * 2 + 1);
        }
      }
      for (const worker of workers)
        if (!assigned.has(worker.id)) {
          const preferred = agents.findIndex(a => a.id === worker.id) % 8,
            n = !used.has(preferred) ? preferred : slots.findIndex((_, i) => !used.has(i));
          assign(worker.id, n);
        }
    }
    // Actual delivered speech groups the current participants. Working and
    // resting listeners stay at their furniture; the speaker approaches them.
    const social = current.filter(e => ['talk', 'reply', 'invite', 'accept', 'decline'].includes(e.type));
    for (const zone of Object.keys(defaultPoints)) {
      const peers = agents.filter(a => a.zone === zone),
        ids = new Set(peers.map(a => a.id)),
        groups = [];
      for (const event of social) {
        const pair = event.participants.filter(id => ids.has(id));
        if (pair.length < 2) continue;
        const touches = groups.filter(g => pair.some(id => g.has(id))),
          group = new Set(pair);
        for (const g of touches) for (const id of g) group.add(id);
        for (const g of touches) groups.splice(groups.indexOf(g), 1);
        groups.push(group);
      }
      let groupIndex = 0;
      for (const group of groups) {
        const ordered = [...group].sort(),
          fixed = ordered.filter(id => locked.has(id));
        const [cx, cy] = fixed.length
          ? anchors.get(fixed[0]).point.map(n => Math.floor(n / 32))
          : socialCenters[zone];
        const occupied = new Set(
            [...anchors].filter(([id]) => !group.has(id) || locked.has(id)).map(([, a]) => a.point.join(',')),
          ),
          candidate = [];
        for (let radius = 0; radius < 8; radius++)
          for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++)
              if (Math.max(Math.abs(dx), Math.abs(dy)) === radius) {
                const point = center(cx + dx + (fixed.length ? 0 : groupIndex * 3), cy + dy);
                if (
                  isWalkable(...point) &&
                  locationAt(...point).zone === zone &&
                  !occupied.has(point.join(','))
                )
                  candidate.push(point);
              }
        let next = 0;
        for (const id of ordered) {
          if (locked.has(id)) continue;
          const old = anchors.get(id),
            point = candidate[next++];
          if (point)
            anchors.set(id, {
              ...old,
              point,
              objectId: undefined,
              label: '與身旁的居民交談',
              seated: false,
              facing: point[0] < cx * 32 + 16 ? 'right' : 'left',
            });
        }
        groupIndex++;
      }
    }
    // A vacated conversation spot can coincide with another resident's next
    // destination. Keep furniture users in place and choose a nearby free tile
    // for the other resident rather than drawing two bodies on top of each other.
    const occupied = new Set(),
      priority = id => (working.has(id) ? 0 : locked.has(id) ? 1 : failures.has(id) ? 2 : 3);
    for (const agent of agents
      .slice()
      .sort((a, b) => priority(a.id) - priority(b.id) || a.id.localeCompare(b.id))) {
      const anchor = anchors.get(agent.id);
      if (occupied.has(anchor.point.join(','))) {
        const [cx, cy] = anchor.point.map(n => Math.floor(n / 32));
        let point = null;
        for (let radius = 1; radius < 8 && !point; radius++)
          for (const [dx, dy] of [
            [-radius, 0],
            [radius, 0],
            [0, radius],
            [0, -radius],
            [-radius, -radius],
            [radius, -radius],
            [-radius, radius],
            [radius, radius],
          ]) {
            const candidate = center(cx + dx, cy + dy);
            if (
              isWalkable(...candidate) &&
              locationAt(...candidate).zone === agent.zone &&
              !occupied.has(candidate.join(','))
            ) {
              point = candidate;
              break;
            }
          }
        if (point) anchor.point = point;
      }
      occupied.add(anchor.point.join(','));
    }
    memo.set(tick, anchors);
    return anchors;
  }
  const result = build(frame.tick);
  cache.set(frame, result);
  return result;
}
export function activityAnchor(agent, frame) {
  const a = frameAnchors(frame).get(agent.id);
  return a
    ? { ...a, point: a.point.slice() }
    : { point: nearestWalkable(ZONE_CENTERS[agent.zone] ?? [1024, 768]), label: '觀察中' };
}
export function createMinimapDataUrl() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const c = canvas.getContext('2d');
  const colors = {
    grass: '#93ad88',
    path: '#dccdaf',
    paving: '#d9d4bd',
    wood: '#d3b48c',
    stone: '#d7d7c8',
    cafe: '#d8bc91',
    studio: '#c5ccd1',
    wall: '#68766d',
    door: '#f5d78f',
  };
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 64; x++) {
      c.fillStyle = colors[MAP_TILES[y][x]];
      c.fillRect(x * 4, y * 4, 4, 4);
    }
  for (const o of objects) {
    c.fillStyle =
      o.kind === 'plant' || o.kind === 'planter' ? '#49775a' : o.kind === 'fountain' ? '#77aeb5' : '#8c7866';
    c.fillRect(o.x / 8, o.y / 8, o.width / 8, o.height / 8);
  }
  return canvas.toDataURL('image/png');
}
