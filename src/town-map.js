// Display-only geography: the tile grid, rooms, walls, furniture and walking.
// The V5 engine owns actions, capacity and outcomes; nothing here can change them.
//
// The order in which furniture is defined is also the order it is painted in,
// so reordering the definitions below changes the rendered town.

export const TILE_SIZE = 32;
export const MAP_COLUMNS = 64;
export const MAP_ROWS = 48;
export const WORLD_SIZE = Object.freeze({ width: MAP_COLUMNS * TILE_SIZE, height: MAP_ROWS * TILE_SIZE });

/** Pixel centre of a tile. */
export const tileCenter = (x, y) => [x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2];
const tileOf = pixel => Math.floor(pixel / TILE_SIZE);

export const ZONE_CENTERS = Object.freeze({
  home: tileCenter(15, 12),
  workshop: tileCenter(48, 12),
  plaza: tileCenter(15, 36),
  studio: tileCenter(48, 36),
});

/** The four buildings, in tiles. Each has a two-tile door in the wall facing the avenue. */
export const MAP_ROOMS = Object.freeze([
  room('home', '日和公寓', 'HOME · REST & READ', 3, 3, 'wood', '#c79d76', 19),
  room('workshop', '木光工坊', 'WORKSHOP · MAKE TOGETHER', 36, 3, 'stone', '#8caa9d', 19),
  room('plaza', '街角咖啡・公共客廳', 'COMMONS · MEET & TALK', 3, 28, 'cafe', '#c9a775', 28),
  room('studio', '光影活動室', 'STUDIO · CAPTURE & CREATE', 36, 28, 'studio', '#9a9db9', 28),
]);
function room(zone, name, subtitle, x, y, floor, color, doorRow) {
  const doorColumn = x + 11;
  return {
    zone,
    name,
    subtitle,
    x,
    y,
    w: 25,
    h: 17,
    floor,
    color,
    doors: [
      [doorColumn, doorRow],
      [doorColumn + 1, doorRow],
    ],
  };
}

// ---------------------------------------------------------------------------
// Ground, walls and the walkability grid.

/** Ground kind per tile: grass, path, paving, door, wall or a room's floor. */
export const MAP_TILES = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill('grass'));
const blocked = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill(true));
const walls = [];

function paveArea(x, y, w, h, kind = 'path') {
  for (let row = y; row < y + h; row++)
    for (let column = x; column < x + w; column++)
      if (column >= 0 && row >= 0 && column < MAP_COLUMNS && row < MAP_ROWS) {
        MAP_TILES[row][column] = kind;
        blocked[row][column] = false;
      }
}

function buildWall(x, y, zone, edge = 'inside') {
  blocked[y][x] = true;
  MAP_TILES[y][x] = 'wall';
  walls.push({ x: x * TILE_SIZE, y: y * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE, zone, edge });
}

// Main avenues, the lanes to each door and the paved squares in front of them.
paveArea(1, 22, 62, 4);
paveArea(30, 1, 4, 46);
paveArea(13, 18, 4, 12);
paveArea(46, 18, 4, 12);
paveArea(10, 20, 10, 8, 'paving');
paveArea(43, 20, 10, 8, 'paving');
paveArea(2, 21, 27, 6, 'paving');
paveArea(35, 21, 27, 6, 'paving');

for (const { x, y, w, h, floor, zone, doors } of MAP_ROOMS) {
  paveArea(x + 1, y + 1, w - 2, h - 2, floor);
  const right = x + w - 1;
  const bottom = y + h - 1;
  for (let row = y; row <= bottom; row++)
    for (let column = x; column <= right; column++) {
      const onEdge = column === x || column === right || row === y || row === bottom;
      if (!onEdge) continue;
      if (doors.some(([dx, dy]) => dx === column && dy === row)) {
        paveArea(column, row, 1, 1, 'door');
        continue;
      }
      buildWall(column, row, zone, row === y ? 'north' : row === bottom ? 'south' : 'side');
    }
}
// Four quiet bedrooms open into one shared living room.
for (const x of [9, 15, 21]) for (let y = 4; y <= 10; y++) buildWall(x, y, 'home');
for (let x = 4; x <= 26; x++) if (![6, 12, 18, 24].includes(x)) buildWall(x, 11, 'home', 'south');

export const MAP_WALLS = Object.freeze(walls);

// ---------------------------------------------------------------------------
// Furniture. Solid pieces block their tiles; seats are passable and carry the
// direction a seated resident faces. `approach` is where someone stands to use it.

const objects = [];
/** Seats used for resting or waiting, eight per district (one per resident). */
export const REST_SEATS = { home: [], workshop: [], plaza: [], studio: [] };
/** Places at the work tables, two per table, eight per equipment district. */
export const WORK_SEATS = { workshop: [], studio: [] };

/**
 * Add one piece of furniture. Position and size are in tiles; `approach` and
 * `approaches` are tile coordinates converted to pixel centres.
 */
function furnish(id, zone, kind, [x, y, w, h], name, description, options = {}) {
  const object = {
    id,
    zone,
    kind,
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
    width: w * TILE_SIZE,
    height: h * TILE_SIZE,
    name,
    description,
    ...options,
  };
  if (object.approach) object.approach = tileCenter(...object.approach);
  if (object.approaches) object.approaches = object.approaches.map(point => tileCenter(...point));
  if (!object.passable)
    for (let row = y; row < y + h; row++)
      for (let column = x; column < x + w; column++) blocked[row][column] = true;
  objects.push(Object.freeze(object));
  return object;
}

/** A desk with a seat in front of each end; both places become work seats. */
function furnishWorkTable(zone, i, [x, y], desk, seat) {
  const table = furnish(`${zone}-desk-${i}`, zone, desk.kind, [x, y, 6, 2], desk.name, desk.description, {
    approach: [x + 1, y + 2],
    approaches: [
      [x + 1, y + 2],
      [x + 4, y + 2],
    ],
    facing: 'up',
    tone: i,
  });
  for (let end = 0; end < 2; end++) {
    const seatX = x + (end ? 4 : 1);
    WORK_SEATS[zone].push({ object: table, point: table.approaches[end] });
    furnish(`${zone}-chair-${i}-${end}`, zone, seat.kind, [seatX, y + 2, 1, 1], seat.name, seat.description, {
      passable: true,
      approach: [seatX, y + 2],
      seat: true,
      facing: 'up',
    });
  }
}

/** A row of eight stools along the south wall, used for resting. */
function furnishStoolRow(zone, row, name, description) {
  for (let i = 0; i < 8; i++) {
    const x = 38 + i * 3;
    REST_SEATS[zone].push(
      furnish(`${zone}-seat-${i}`, zone, 'stool', [x, row, 1, 1], name, description, {
        approach: [x, row],
        passable: true,
        seat: true,
        facing: 'up',
      }),
    );
  }
}

// Home: four bedrooms with two beds and a shelf each, then the living room.
for (let i = 0; i < 4; i++) {
  const x = 4 + i * 6;
  furnish(`home-bed-${i}-a`, 'home', 'bed', [x, 5, 2, 3], '單人床', '居民的私人休息角落。', {
    approach: [x + 2, 6],
    facing: 'left',
    tone: i,
  });
  furnish(`home-bed-${i}-b`, 'home', 'bed', [x + 3, 5, 2, 3], '單人床', '居民的私人休息角落。', {
    approach: [x + 2, 9],
    facing: 'right',
    tone: i + 1,
  });
  furnish(`home-shelf-${i}`, 'home', 'bookshelf', [x, 9, 2, 1], '床邊書架', '放著書、相片與小盆栽。', {
    approach: [x + 2, 10],
  });
}
furnish('home-library', 'home', 'bookshelf', [4, 13, 4, 1], '共享書架', '日和公寓的閱讀角落。', {
  approach: [6, 14],
});
furnish('home-kitchen', 'home', 'counter', [22, 13, 4, 1], '茶水檯', '準備熱茶、收拾杯盤的共用角落。', {
  approach: [24, 14],
});
furnish('home-coffee', 'home', 'coffee', [14, 15, 3, 1], '客廳矮桌', '可以在這裡整理想法、和鄰居交談。', {
  approach: [15, 16],
});
const LIVING_ROOM_CHAIRS = [
  [10, 13],
  [12, 13],
  [18, 13],
  [20, 13],
  [10, 17],
  [12, 17],
  [18, 17],
  [20, 17],
];
for (const [i, [x, y]] of LIVING_ROOM_CHAIRS.entries())
  REST_SEATS.home.push(
    furnish(`home-seat-${i}`, 'home', 'armchair', [x, y, 1, 1], '客廳沙發椅', '可坐下閱讀和休息。', {
      approach: [x, y],
      seat: true,
      passable: true,
      facing: 'down',
      tone: i % 2,
    }),
  );
furnish('home-plant', 'home', 'plant', [25, 17, 1, 1], '窗邊植栽', '光線下的一角綠意。', {
  approach: [24, 17],
});

// Workshop: tool wall (where tools are borrowed), cabinet, four work tables, stools.
const TABLE_POSITIONS = {
  workshop: [
    [39, 8],
    [51, 8],
    [39, 14],
    [51, 14],
  ],
  studio: [
    [39, 34],
    [51, 34],
    [39, 40],
    [51, 40],
  ],
};
furnish(
  'workshop-storage',
  'workshop',
  'toolwall',
  [38, 4, 8, 1],
  '工具收納牆',
  '依序收納工具，方便居民借用與歸還。',
  {
    approach: [41, 5],
  },
);
furnish(
  'workshop-cabinet',
  'workshop',
  'cabinet',
  [53, 4, 6, 1],
  '材料櫃',
  '木料、零件與尚未完成的小作品。',
  {
    approach: [56, 5],
  },
);
for (const [i, position] of TABLE_POSITIONS.workshop.entries())
  furnishWorkTable(
    'workshop',
    i,
    position,
    { kind: 'workbench', name: '製作工作桌', description: '居民完成已核准的製作與合作活動。' },
    { kind: 'stool', name: '工作凳', description: '工作桌前的座位。' },
  );
furnishStoolRow('workshop', 18, '工坊休息凳', '等候設備或稍作休息。');
furnish('workshop-plant', 'workshop', 'plant', [58, 12, 1, 1], '工坊盆栽', '桌邊的綠色小角落。', {
  approach: [57, 12],
});

// Café commons: counter, book exchange and four round tables with two chairs each.
furnish(
  'plaza-counter',
  'plaza',
  'cafeCounter',
  [5, 30, 8, 2],
  '咖啡吧檯',
  '飄著咖啡香的公共客廳聚會角落。',
  {
    approach: [9, 32],
  },
);
furnish('plaza-shelf', 'plaza', 'bookshelf', [23, 30, 3, 1], '交換書架', '放著可翻閱的書與居民留下的裝飾。', {
  approach: [24, 31],
});
const CAFE_TABLES = [
  [7, 35],
  [19, 35],
  [7, 40],
  [19, 40],
];
for (const [i, [x, y]] of CAFE_TABLES.entries()) {
  furnish(
    `plaza-table-${i}`,
    'plaza',
    'cafeTable',
    [x, y, 3, 2],
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
  for (let side = 0; side < 2; side++) {
    const chairX = x + (side ? 3 : -1);
    REST_SEATS.plaza.push(
      furnish(
        `plaza-chair-${i}-${side}`,
        'plaza',
        'chair',
        [chairX, y + 1, 1, 1],
        '咖啡座椅',
        '公共客廳的休息座位。',
        {
          approach: [chairX, y + 1],
          seat: true,
          passable: true,
          facing: side ? 'left' : 'right',
          tone: i,
        },
      ),
    );
  }
}
furnish('plaza-plant', 'plaza', 'plant', [25, 41, 1, 1], '咖啡廳琴葉榕', '窗邊舒展的葉片。', {
  approach: [24, 41],
});
furnish('plaza-menu', 'plaza', 'sign', [18, 30, 1, 1], '小鎮留言板', '空間說明與展示用留言板。', {
  approach: [18, 31],
});

// Studio: camera cabinet (where cameras are borrowed), backdrop, editing desks, stools.
furnish(
  'studio-storage',
  'studio',
  'cabinet',
  [38, 30, 8, 1],
  '攝影器材櫃',
  '相機與攝影配件整齊收納在這裡。',
  {
    approach: [41, 31],
  },
);
furnish('studio-backdrop', 'studio', 'backdrop', [52, 30, 7, 2], '攝影背景牆', '共同攝影活動的取景區。', {
  approach: [55, 33],
});
for (const [i, position] of TABLE_POSITIONS.studio.entries())
  furnishWorkTable(
    'studio',
    i,
    position,
    { kind: 'editdesk', name: '影像工作桌', description: '整理構圖、檢視照片的工作位置。' },
    { kind: 'chair', name: '工作椅', description: '影像工作桌前的座位。' },
  );
furnishStoolRow('studio', 43, '活動室休息凳', '觀察作品，或等待下一次共同活動。');

// Outdoor furnishings sit off the main avenues, keeping broad clear crossings.
furnish('garden-fountain', 'plaza', 'fountain', [5, 22, 3, 3], '街角小噴泉', '公共步道旁的流水聲。', {
  approach: [8, 23],
});
furnish('garden-planter-a', 'plaza', 'planter', [22, 22, 3, 1], '花壇', '步道旁的季節花草。', {
  approach: [23, 23],
});
furnish('garden-planter-b', 'studio', 'planter', [54, 23, 4, 1], '香草花壇', '活動室外的小花園。', {
  approach: [55, 24],
});
furnish('garden-bench-a', 'plaza', 'bench', [19, 25, 3, 1], '街邊長椅', '散步時可以停留的地方。', {
  approach: [20, 24],
  seat: true,
  facing: 'up',
});
furnish('garden-bench-b', 'studio', 'bench', [39, 21, 3, 1], '樹蔭長椅', '坐著看大家來來往往。', {
  approach: [40, 22],
  seat: true,
  facing: 'up',
});

export const MAP_OBJECTS = Object.freeze(objects);
const objectsById = new Map(objects.map(object => [object.id, object]));
export const mapObject = id => objectsById.get(id);

// ---------------------------------------------------------------------------
// Walking.

export function isWalkable(x, y) {
  const inside =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x < WORLD_SIZE.width &&
    y < WORLD_SIZE.height;
  return inside && !blocked[tileOf(y)][tileOf(x)];
}

/** The centre of the closest walkable tile (the point's own tile when it is walkable). */
export function nearestWalkable(point) {
  const px = Number.isFinite(point?.[0]) ? point[0] : WORLD_SIZE.width / 2;
  const py = Number.isFinite(point?.[1]) ? point[1] : WORLD_SIZE.height / 2;
  const column = Math.max(0, Math.min(MAP_COLUMNS - 1, tileOf(px)));
  const row = Math.max(0, Math.min(MAP_ROWS - 1, tileOf(py)));
  if (!blocked[row][column]) return tileCenter(column, row);
  let best = null;
  let bestDistance = Infinity;
  for (let y = 0; y < MAP_ROWS; y++)
    for (let x = 0; x < MAP_COLUMNS; x++) {
      if (blocked[y][x]) continue;
      const candidate = tileCenter(x, y);
      const distance = (candidate[0] - px) ** 2 + (candidate[1] - py) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
  return best;
}

const NEIGHBOURS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

/**
 * Shortest four-directional route between two walkable points (breadth-first
 * over tiles). The route starts and ends at the exact points given, travels
 * through tile centres in between, and contains no repeated consecutive points.
 * Returns [] when either end is blocked or unreachable.
 */
export function findWalkPath(from, to) {
  if (!isWalkable(...from) || !isWalkable(...to)) return [];
  const index = (x, y) => y * MAP_COLUMNS + x;
  const start = index(tileOf(from[0]), tileOf(from[1]));
  const end = index(tileOf(to[0]), tileOf(to[1]));
  const previous = new Int32Array(MAP_COLUMNS * MAP_ROWS).fill(-1);
  const queue = new Int32Array(MAP_COLUMNS * MAP_ROWS);
  let head = 0;
  let tail = 0;
  queue[tail++] = start;
  previous[start] = start;
  while (head < tail && previous[end] === -1) {
    const current = queue[head++];
    const x = current % MAP_COLUMNS;
    const y = Math.floor(current / MAP_COLUMNS);
    for (const [dx, dy] of NEIGHBOURS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_COLUMNS || ny >= MAP_ROWS || blocked[ny][nx]) continue;
      const neighbour = index(nx, ny);
      if (previous[neighbour] !== -1) continue;
      previous[neighbour] = current;
      queue[tail++] = neighbour;
    }
  }
  if (previous[end] === -1) return [];

  const route = [];
  for (let at = end; ; at = previous[at]) {
    route.push(tileCenter(at % MAP_COLUMNS, Math.floor(at / MAP_COLUMNS)));
    if (at === start) break;
  }
  route.reverse();
  // Leave and reach the exact endpoints with axis-aligned segments.
  const points = [from.slice(), [route[0][0], from[1]], ...route, [to[0], route.at(-1)[1]], to.slice()];
  return points.filter((p, i) => !i || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
}

/** The room containing a pixel point, or the garden walkway outside. */
export function locationAt(x, y) {
  const inside = MAP_ROOMS.find(
    r =>
      x >= r.x * TILE_SIZE &&
      x < (r.x + r.w) * TILE_SIZE &&
      y >= r.y * TILE_SIZE &&
      y < (r.y + r.h) * TILE_SIZE,
  );
  return inside
    ? { zone: inside.zone, name: inside.name, room: inside.name }
    : { zone: null, name: '花園步道' };
}

// ---------------------------------------------------------------------------
// Minimap: one 4×4 pixel square per tile, furniture in three flat colours.

const MINIMAP_SCALE = 4;
const MINIMAP_GROUND = {
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
const minimapObjectColor = kind =>
  kind === 'plant' || kind === 'planter' ? '#49775a' : kind === 'fountain' ? '#77aeb5' : '#8c7866';

export function createMinimapDataUrl() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_COLUMNS * MINIMAP_SCALE;
  canvas.height = MAP_ROWS * MINIMAP_SCALE;
  const context = canvas.getContext('2d');
  for (let y = 0; y < MAP_ROWS; y++)
    for (let x = 0; x < MAP_COLUMNS; x++) {
      context.fillStyle = MINIMAP_GROUND[MAP_TILES[y][x]];
      context.fillRect(x * MINIMAP_SCALE, y * MINIMAP_SCALE, MINIMAP_SCALE, MINIMAP_SCALE);
    }
  const pixelsPerMinimapPixel = TILE_SIZE / MINIMAP_SCALE;
  for (const object of objects) {
    context.fillStyle = minimapObjectColor(object.kind);
    context.fillRect(
      object.x / pixelsPerMinimapPixel,
      object.y / pixelsPerMinimapPixel,
      object.width / pixelsPerMinimapPixel,
      object.height / pixelsPerMinimapPixel,
    );
  }
  return canvas.toDataURL('image/png');
}
