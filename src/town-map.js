// Display-only geography: the tile grid, rooms, walls, furniture and walking.
// The research engine owns actions, capacity and outcomes; nothing here can change them.
//
// The town: a shared house (eight bedrooms around a living room, a kitchen and
// dining room, a bathroom and a gym), the workshop, the café, the studio, a
// garden with a pond and a riverside park, joined by two avenues.
//
// The order in which furniture is defined is also the order it is painted in,
// so reordering the definitions below changes the rendered town.

export const TILE_SIZE = 32;
export const MAP_COLUMNS = 96;
export const MAP_ROWS = 60;
export const WORLD_SIZE = Object.freeze({ width: MAP_COLUMNS * TILE_SIZE, height: MAP_ROWS * TILE_SIZE });

/** Pixel centre of a tile. */
export const tileCenter = (x, y) => [x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2];
const tileOf = pixel => Math.floor(pixel / TILE_SIZE);

/** Camera targets for the district buttons, and a fallback point for every engine zone. */
export const ZONE_CENTERS = Object.freeze({
  house: tileCenter(24, 18),
  bedroom: tileCenter(16, 6),
  living: tileCenter(16, 18),
  kitchen: tileCenter(38, 18),
  bathroom: tileCenter(38, 6),
  gym: tileCenter(38, 30),
  workshop: tileCenter(66, 11),
  plaza: tileCenter(15, 49),
  studio: tileCenter(66, 49),
  park: tileCenter(86, 28),
});

// ---------------------------------------------------------------------------
// Rooms. Each room is a rectangle in tiles including its walls; neighbouring
// rooms share a wall line. Doors are wall tiles turned into floor.

const BEDROOM_NAMES = ['一號', '二號', '三號', '四號', '五號', '六號', '七號', '八號'];
const rooms = [];
function room(zone, name, subtitle, x, y, w, h, floor, color, doors, extra = {}) {
  rooms.push({ zone, name, subtitle, x, y, w, h, floor, color, doors, ...extra });
}
// The house: bedrooms along the top and bottom, the living room between them.
for (let k = 0; k < 4; k++) {
  const x = 2 + 7 * k;
  room('bedroom', `${BEDROOM_NAMES[k]}臥室`, 'BEDROOM', x, 2, 8, 9, 'wood', '#b98a6e', [[x + 5, 10]], {
    bedroom: k,
    building: 'house',
  });
  room('bedroom', `${BEDROOM_NAMES[k + 4]}臥室`, 'BEDROOM', x, 26, 8, 9, 'wood', '#b98a6e', [[x + 5, 26]], {
    bedroom: k + 4,
    building: 'house',
  });
}
room('living', '客廳', 'LIVING ROOM', 2, 10, 29, 17, 'carpet', '#c2926a', [], { building: 'house' });
// The kitchen is the hall: the front door, the open side to the living room, bathroom and gym.
const KITCHEN_OPENING = Array.from({ length: 8 }, (_, i) => [30, 14 + i]);
room(
  'kitchen',
  '廚房餐廳',
  'KITCHEN & DINING',
  30,
  10,
  17,
  17,
  'kitchen',
  '#d0a35f',
  [...KITCHEN_OPENING, [46, 17], [46, 18]],
  {
    building: 'house',
  },
);
room(
  'bathroom',
  '浴室',
  'BATHROOM',
  30,
  2,
  17,
  9,
  'bath',
  '#7fa7b3',
  [
    [37, 10],
    [38, 10],
  ],
  { building: 'house' },
);
room(
  'gym',
  '健身房',
  'GYM',
  30,
  26,
  17,
  9,
  'gym',
  '#8f8fb3',
  [
    [37, 26],
    [38, 26],
  ],
  { building: 'house' },
);
room('workshop', '木光工坊', 'WORKSHOP · MAKE TOGETHER', 54, 3, 25, 17, 'stone', '#8caa9d', [
  [65, 19],
  [66, 19],
]);
room('plaza', '街角咖啡', 'CAFÉ · MEET & EAT', 3, 41, 25, 17, 'cafe', '#c9a775', [
  [14, 41],
  [15, 41],
]);
room('studio', '光影攝影室', 'STUDIO · CAPTURE & CREATE', 54, 41, 25, 17, 'studio', '#9a9db9', [
  [65, 41],
  [66, 41],
]);
export const MAP_ROOMS = Object.freeze(rooms.map(r => Object.freeze(r)));

/** Buildings carry one nameplate above their main door. */
export const MAP_BUILDINGS = Object.freeze([
  {
    name: '日和合租屋',
    subtitle: 'SHARED HOUSE · LIVE TOGETHER',
    x: 2,
    y: 2,
    w: 45,
    door: [46, 17],
    zone: 'house',
  },
  { name: '木光工坊', subtitle: 'WORKSHOP · MAKE TOGETHER', x: 54, y: 3, w: 25, zone: 'workshop' },
  { name: '街角咖啡', subtitle: 'CAFÉ · MEET & EAT', x: 3, y: 41, w: 25, zone: 'plaza' },
  { name: '光影攝影室', subtitle: 'STUDIO · CAPTURE & CREATE', x: 54, y: 41, w: 25, zone: 'studio' },
]);

/** Outdoor park areas (walkable meadow) in tiles: the riverside strip and the pond garden. */
const PARK_AREAS = [
  { x: 80, y: 1, w: 15, h: 58 },
  { x: 29, y: 42, w: 18, h: 16 },
];

// ---------------------------------------------------------------------------
// Ground, walls and the walkability grid.

/** Ground kind per tile: grass, meadow, trail, path, paving, water, bridge, door, wall or a floor. */
export const MAP_TILES = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill('grass'));
const blocked = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLUMNS).fill(true));
const inside = (x, y) => x >= 0 && y >= 0 && x < MAP_COLUMNS && y < MAP_ROWS;

function paveArea(x, y, w, h, kind = 'path', walkable = true) {
  for (let row = y; row < y + h; row++)
    for (let column = x; column < x + w; column++)
      if (inside(column, row)) {
        MAP_TILES[row][column] = kind;
        blocked[row][column] = !walkable;
      }
}

// Park meadows first; roads and water are laid over them.
for (const { x, y, w, h } of PARK_AREAS) paveArea(x, y, w, h, 'meadow');
// Main avenues, the street down from the workshop and the short lanes to each door.
paveArea(1, 37, 94, 4);
paveArea(48, 1, 4, 58);
paveArea(47, 16, 1, 4);
paveArea(65, 20, 2, 17);
paveArea(29, 41, 18, 1);
paveArea(10, 36, 10, 6, 'paving');
paveArea(61, 36, 10, 6, 'paving');
// The river with a bridge where the avenue crosses it, the pond and the park trails.
paveArea(89, 0, 3, MAP_ROWS, 'water', false);
paveArea(88, 37, 5, 4, 'bridge');
paveArea(34, 47, 6, 5, 'water', false);
paveArea(82, 6, 2, 30, 'trail');
paveArea(82, 41, 2, 14, 'trail');
paveArea(84, 20, 4, 2, 'trail');
paveArea(30, 44, 16, 2, 'trail');
paveArea(30, 53, 16, 2, 'trail');

// Room floors, then walls on every room edge, then doors carved through them.
for (const r of MAP_ROOMS) paveArea(r.x + 1, r.y + 1, r.w - 2, r.h - 2, r.floor);
const wallTiles = new Map();
for (const r of MAP_ROOMS)
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++)
      if (x === r.x || y === r.y || x === r.x + r.w - 1 || y === r.y + r.h - 1)
        wallTiles.set(`${x},${y}`, [x, y]);
for (const r of MAP_ROOMS)
  for (const [x, y] of r.doors) {
    wallTiles.delete(`${x},${y}`);
    paveArea(x, y, 1, 1, 'door');
  }
const roomAtTile = (x, y) =>
  MAP_ROOMS.find(r => x > r.x && x < r.x + r.w - 1 && y > r.y && y < r.y + r.h - 1) ?? null;
const walls = [];
for (const [x, y] of wallTiles.values()) {
  blocked[y][x] = true;
  MAP_TILES[y][x] = 'wall';
}
for (const [x, y] of wallTiles.values()) {
  // A wall running left–right is drawn as the tall back wall of the room below it
  // (north), or as a low front edge (south); walls running up–down are sides.
  const horizontal = wallTiles.has(`${x - 1},${y}`) || wallTiles.has(`${x + 1},${y}`);
  const below = roomAtTile(x, y + 1);
  const above = roomAtTile(x, y - 1);
  const side = roomAtTile(x + 1, y) ?? roomAtTile(x - 1, y);
  const edge = horizontal ? (below ? 'north' : 'south') : 'side';
  const owner = horizontal ? (below ?? above) : (side ?? below ?? above);
  walls.push({
    x: x * TILE_SIZE,
    y: y * TILE_SIZE,
    width: TILE_SIZE,
    height: TILE_SIZE,
    zone: owner?.zone ?? 'house',
    edge,
  });
}
walls.sort((a, b) => a.y - b.y || a.x - b.x);
export const MAP_WALLS = Object.freeze(walls);

// ---------------------------------------------------------------------------
// Furniture. Solid pieces block their tiles; seats are passable and carry the
// direction a seated resident faces. `approach` is where someone stands to use it.

const objects = [];
/** Seats used for resting or waiting, per zone. */
export const REST_SEATS = {
  bedroom: [],
  living: [],
  kitchen: [],
  bathroom: [],
  gym: [],
  workshop: [],
  plaza: [],
  studio: [],
  park: [],
};
/** Places at the work tables, two per table, eight per equipment district. */
export const WORK_SEATS = { workshop: [], studio: [] };
/** Daily-life places: beds and desks by bedroom, dining and café seats, stoves, showers, exercise spots. */
export const LIFE_SPOTS = {
  beds: [],
  desks: [],
  eat: { kitchen: [], plaza: [] },
  cook: [],
  shower: [],
  exercise: [],
};

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

/** A passable seat; `list` collects it for the resident-placement tables. */
function seat(id, zone, kind, [x, y], name, description, facing, list, extra = {}) {
  const object = furnish(id, zone, kind, [x, y, 1, 1], name, description, {
    approach: [x, y],
    seat: true,
    passable: true,
    facing,
    ...extra,
  });
  list?.push(object);
  return object;
}

/** A desk with a seat in front of each end; both places become work seats. */
function furnishWorkTable(zone, i, [x, y], desk, chair) {
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
    WORK_SEATS[zone].push({ object: table, point: table.approaches[end] });
    seat(
      `${zone}-chair-${i}-${end}`,
      zone,
      chair.kind,
      [x + (end ? 4 : 1), y + 2],
      chair.name,
      chair.description,
      'up',
    );
  }
}

/** A row of eight stools along the south wall, used for resting. */
function furnishStoolRow(zone, x0, row, name, description) {
  for (let i = 0; i < 8; i++)
    seat(`${zone}-seat-${i}`, zone, 'stool', [x0 + i * 3, row], name, description, 'up', REST_SEATS[zone]);
}

// Bedrooms: a bed, a desk with a chair, a wardrobe and a plant each.
for (const r of MAP_ROOMS.filter(r => r.zone === 'bedroom')) {
  const top = r.y === 2;
  const k = r.bedroom;
  const x0 = r.x;
  const bedY = top ? 3 : r.y + 5;
  const deskY = top ? 3 : r.y + 7;
  const bed = furnish(
    `bedroom-${k}-bed`,
    'bedroom',
    'bed',
    [x0 + 1, bedY, 2, 3],
    '單人床',
    '睡覺的地方，鋪著自己挑的被子。',
    {
      approach: [x0 + 3, bedY + 1],
      facing: 'left',
      tone: k,
      bedroom: k,
    },
  );
  // A sleeper lies with their head on the pillow and is drawn above the bed (then tucked in).
  LIFE_SPOTS.beds.push({
    object: bed,
    point: [bed.x + bed.width / 2, bed.y + 84],
    depth: bed.y + bed.height + 2,
  });
  furnish(
    `bedroom-${k}-desk`,
    'bedroom',
    'desk',
    [x0 + 4, deskY, 2, 1],
    '書桌',
    '看書、寫日記，或安靜待一會兒。',
    {
      approach: [x0 + 4, top ? deskY + 1 : deskY - 1],
      tone: k,
      bedroom: k,
    },
  );
  const chair = seat(
    `bedroom-${k}-chair`,
    'bedroom',
    'stool',
    [x0 + 4, top ? deskY + 1 : deskY - 1],
    '書桌椅',
    '書桌前的椅子。',
    top ? 'up' : 'down',
    REST_SEATS.bedroom,
    { bedroom: k },
  );
  LIFE_SPOTS.desks.push(chair);
  furnish(
    `bedroom-${k}-wardrobe`,
    'bedroom',
    'wardrobe',
    [x0 + 6, top ? 3 : r.y + 6, 1, 2],
    '衣櫃',
    '掛著每天要穿的衣服。',
    {
      approach: [x0 + 5, top ? 4 : r.y + 6],
      bedroom: k,
    },
  );
  furnish(
    `bedroom-${k}-plant`,
    'bedroom',
    'plant',
    [x0 + 6, top ? 8 : r.y + 1, 1, 1],
    '小盆栽',
    '窗邊的一點綠意。',
    {
      approach: [x0 + 5, top ? 8 : r.y + 1],
      bedroom: k,
    },
  );
}

// Living room: a TV corner with a sofa and armchairs, a game table and the bookshelf.
furnish('living-tv', 'living', 'tv', [8, 14, 4, 1], '電視櫃', '晚上大家常一起看節目。', {
  approach: [10, 15],
});
furnish('living-coffee', 'living', 'coffee', [8, 17, 4, 1], '客廳矮桌', '放著零食和遙控器。', {
  approach: [10, 18],
});
for (let i = 0; i < 4; i++)
  seat(
    `living-sofa-${i}`,
    'living',
    'sofa',
    [8 + i, 19],
    '沙發',
    '坐下看電視、聊天或休息。',
    'up',
    REST_SEATS.living,
    { tone: i },
  );
seat(
  'living-armchair-0',
  'living',
  'armchair',
  [6, 17],
  '單人沙發',
  '靠窗的單人座位。',
  'right',
  REST_SEATS.living,
  { tone: 1 },
);
seat(
  'living-armchair-1',
  'living',
  'armchair',
  [13, 17],
  '單人沙發',
  '靠牆的單人座位。',
  'left',
  REST_SEATS.living,
  { tone: 0 },
);
furnish(
  'living-game-table',
  'living',
  'cafeTable',
  [20, 17, 3, 2],
  '桌遊桌',
  '有時大家會在這裡下棋、拼圖。',
  {
    approach: [19, 18],
    approaches: [
      [19, 18],
      [23, 18],
    ],
  },
);
seat(
  'living-game-chair-0',
  'living',
  'chair',
  [19, 18],
  '桌遊椅',
  '桌遊桌旁的座位。',
  'right',
  REST_SEATS.living,
  { tone: 2 },
);
seat(
  'living-game-chair-1',
  'living',
  'chair',
  [23, 18],
  '桌遊椅',
  '桌遊桌旁的座位。',
  'left',
  REST_SEATS.living,
  { tone: 2 },
);
furnish(
  'living-bookshelf',
  'living',
  'bookshelf',
  [24, 11, 3, 1],
  '共享書架',
  '大家把看完的書放在這裡交換。',
  { approach: [25, 12] },
);
furnish('living-plant-a', 'living', 'plant', [3, 11, 1, 1], '客廳植栽', '角落的大葉植物。', {
  approach: [4, 11],
});
furnish('living-plant-b', 'living', 'plant', [3, 25, 1, 1], '客廳植栽', '角落的大葉植物。', {
  approach: [4, 25],
});
furnish('living-lamp', 'living', 'lamp', [16, 11, 1, 1], '立燈', '晚上點亮客廳的暖光。', {
  approach: [16, 12],
});

// Kitchen and dining: the cooking line along the north wall, one long table with eight chairs.
furnish('kitchen-fridge', 'kitchen', 'fridge', [31, 11, 1, 1], '冰箱', '大家的食材都放在這裡。', {
  approach: [31, 12],
});
furnish('kitchen-stove', 'kitchen', 'stove', [32, 11, 2, 1], '爐台', '煮一鍋夠三個人吃的飯菜。', {
  approach: [32, 12],
  approaches: [
    [32, 12],
    [33, 12],
  ],
});
for (const point of [
  [32, 12],
  [33, 12],
])
  LIFE_SPOTS.cook.push({ point: tileCenter(...point), objectId: 'kitchen-stove' });
furnish('kitchen-sink', 'kitchen', 'sink', [34, 11, 2, 1], '水槽', '洗菜、洗碗的地方。', {
  approach: [34, 12],
});
furnish('kitchen-counter', 'kitchen', 'counter', [39, 11, 4, 1], '流理台', '備料、放剛煮好的菜。', {
  approach: [40, 12],
});
furnish('kitchen-shelf', 'kitchen', 'cabinet', [43, 11, 3, 1], '碗盤櫃', '整齊收著每個人的碗筷。', {
  approach: [44, 12],
});
furnish(
  'kitchen-table',
  'kitchen',
  'diningTable',
  [33, 16, 4, 2],
  '餐桌',
  '早餐和晚餐時，大家圍著這張桌子吃飯聊天。',
  {
    approach: [32, 16],
  },
);
for (let i = 0; i < 4; i++) {
  LIFE_SPOTS.eat.kitchen.push(
    seat(
      `kitchen-chair-${i}-n`,
      'kitchen',
      'chair',
      [33 + i, 15],
      '餐椅',
      '餐桌旁的座位。',
      'down',
      REST_SEATS.kitchen,
      { tone: 3 },
    ),
  );
  LIFE_SPOTS.eat.kitchen.push(
    seat(
      `kitchen-chair-${i}-s`,
      'kitchen',
      'chair',
      [33 + i, 18],
      '餐椅',
      '餐桌旁的座位。',
      'up',
      REST_SEATS.kitchen,
      { tone: 3 },
    ),
  );
}
furnish('kitchen-island', 'kitchen', 'counter', [40, 21, 4, 1], '中島', '站著喝杯咖啡、聊兩句。', {
  approach: [41, 22],
});
furnish('kitchen-plant', 'kitchen', 'plant', [45, 25, 1, 1], '廚房盆栽', '香草盆栽，煮菜時順手摘一點。', {
  approach: [44, 25],
});

// Bathroom: three showers, two toilets and the sinks.
for (const [i, x] of [31, 34, 42].entries()) {
  const shower = furnish(
    `bathroom-shower-${i}`,
    'bathroom',
    'shower',
    [x, 3, 2, 2],
    '淋浴間',
    '三間淋浴間，早晚都有人排隊。',
    {
      approach: [x, 5],
      passable: true,
    },
  );
  LIFE_SPOTS.shower.push({ object: shower, point: [shower.x + shower.width / 2, shower.y + 54] });
}
furnish('bathroom-toilet-0', 'bathroom', 'toilet', [44, 7, 1, 1], '馬桶', '浴室角落的隔間。', {
  approach: [43, 7],
});
furnish('bathroom-toilet-1', 'bathroom', 'toilet', [45, 7, 1, 1], '馬桶', '浴室角落的隔間。', {
  approach: [45, 8],
});
furnish('bathroom-sinks', 'bathroom', 'sink', [31, 8, 3, 1], '洗手台', '刷牙、洗臉、整理頭髮。', {
  approach: [32, 7],
});
furnish('bathroom-plant', 'bathroom', 'plant', [40, 3, 1, 1], '浴室植栽', '喜歡濕氣的蕨類。', {
  approach: [39, 4],
});
seat(
  'bathroom-bench',
  'bathroom',
  'bench',
  [36, 8],
  '更衣長凳',
  '等淋浴間時坐一下。',
  'up',
  REST_SEATS.bathroom,
);

// Gym: three treadmills, exercise mats and a weight rack.
for (const [i, x] of [31, 33, 35].entries()) {
  const treadmill = furnish(
    `gym-treadmill-${i}`,
    'gym',
    'treadmill',
    [x, 28, 1, 2],
    '跑步機',
    '晚上常有人在這裡跑步。',
    {
      approach: [x, 29],
      passable: true,
    },
  );
  LIFE_SPOTS.exercise.push({
    object: treadmill,
    point: [treadmill.x + 16, treadmill.y + 40],
    facing: 'up',
    pose: 'run',
  });
}
for (const [i, x] of [40, 42, 44].entries()) {
  const mat = furnish(`gym-mat-${i}`, 'gym', 'mat', [x, 30, 1, 2], '運動墊', '伸展、瑜伽或做核心訓練。', {
    approach: [x, 31],
    passable: true,
    tone: i,
  });
  LIFE_SPOTS.exercise.push({ object: mat, point: [mat.x + 16, mat.y + 44], facing: 'down', pose: 'stretch' });
}
furnish('gym-weights', 'gym', 'weights', [42, 27, 3, 1], '啞鈴架', '各種重量的啞鈴。', {
  approach: [43, 28],
});
seat('gym-bench', 'gym', 'bench', [38, 32], '休息長凳', '運動完坐著喘口氣。', 'up', REST_SEATS.gym);
furnish('gym-plant', 'gym', 'plant', [45, 33, 1, 1], '健身房盆栽', '門邊的盆栽。', { approach: [44, 33] });

// Workshop: tool wall (where tools are borrowed), cabinet, four work tables, stools.
furnish(
  'workshop-storage',
  'workshop',
  'toolwall',
  [56, 4, 8, 1],
  '工具收納牆',
  '依序收納工具，方便居民借用與歸還。',
  {
    approach: [59, 5],
  },
);
furnish(
  'workshop-cabinet',
  'workshop',
  'cabinet',
  [71, 4, 6, 1],
  '材料櫃',
  '木料、零件與尚未完成的小作品。',
  {
    approach: [74, 5],
  },
);
for (const [i, position] of [
  [57, 8],
  [69, 8],
  [57, 14],
  [69, 14],
].entries())
  furnishWorkTable(
    'workshop',
    i,
    position,
    { kind: 'workbench', name: '製作工作桌', description: '居民完成已核准的製作與合作活動。' },
    { kind: 'stool', name: '工作凳', description: '工作桌前的座位。' },
  );
furnishStoolRow('workshop', 56, 18, '工坊休息凳', '等候設備或稍作休息。');
furnish('workshop-plant', 'workshop', 'plant', [76, 12, 1, 1], '工坊盆栽', '桌邊的綠色小角落。', {
  approach: [75, 12],
});

// Café: counter, book exchange and four round tables with two chairs each.
furnish('plaza-counter', 'plaza', 'cafeCounter', [5, 43, 8, 2], '咖啡吧檯', '點一杯咖啡，或一份今日簡餐。', {
  approach: [9, 45],
});
furnish('plaza-shelf', 'plaza', 'bookshelf', [23, 43, 3, 1], '交換書架', '放著可翻閱的書與居民留下的裝飾。', {
  approach: [24, 44],
});
for (const [i, [x, y]] of [
  [7, 48],
  [19, 48],
  [7, 53],
  [19, 53],
].entries()) {
  furnish(
    `plaza-table-${i}`,
    'plaza',
    'cafeTable',
    [x, y, 3, 2],
    '咖啡圓桌',
    '坐在桌邊吃東西，或與身旁的人交談。',
    {
      approach: [x - 1, y + 1],
      approaches: [
        [x - 1, y + 1],
        [x + 3, y + 1],
      ],
    },
  );
  for (let side = 0; side < 2; side++) {
    const chair = seat(
      `plaza-chair-${i}-${side}`,
      'plaza',
      'chair',
      [x + (side ? 3 : -1), y + 1],
      '咖啡座椅',
      '咖啡館的座位。',
      side ? 'left' : 'right',
      REST_SEATS.plaza,
      { tone: i },
    );
    LIFE_SPOTS.eat.plaza.push(chair);
  }
}
furnish('plaza-plant', 'plaza', 'plant', [25, 54, 1, 1], '咖啡廳琴葉榕', '窗邊舒展的葉片。', {
  approach: [24, 54],
});
furnish('plaza-menu', 'plaza', 'sign', [18, 43, 1, 1], '今日菜單', '今天的簡餐與甜點。', {
  approach: [18, 44],
});

// Studio: camera cabinet (where cameras are borrowed), backdrop, editing desks, stools.
furnish(
  'studio-storage',
  'studio',
  'cabinet',
  [56, 43, 8, 1],
  '攝影器材櫃',
  '相機與攝影配件整齊收納在這裡。',
  {
    approach: [59, 44],
  },
);
furnish('studio-backdrop', 'studio', 'backdrop', [70, 43, 7, 2], '攝影背景牆', '共同攝影活動的取景區。', {
  approach: [73, 46],
});
for (const [i, position] of [
  [57, 47],
  [69, 47],
  [57, 52],
  [69, 52],
].entries())
  furnishWorkTable(
    'studio',
    i,
    position,
    { kind: 'editdesk', name: '影像工作桌', description: '整理構圖、檢視照片的工作位置。' },
    { kind: 'chair', name: '工作椅', description: '影像工作桌前的座位。' },
  );
furnishStoolRow('studio', 56, 56, '攝影室休息凳', '觀察作品，或等待下一次共同活動。');

// Pond garden and riverside park: benches, a picnic table, flower beds and trees.
furnish('garden-planter-a', 'park', 'planter', [30, 42, 4, 1], '花壇', '季節花草。', { approach: [31, 44] });
furnish('garden-planter-b', 'park', 'planter', [41, 42, 4, 1], '花壇', '季節花草。', { approach: [42, 44] });
seat(
  'garden-bench-0',
  'park',
  'parkBench',
  [32, 46],
  '池畔長椅',
  '坐著看水裡的魚。',
  'right',
  REST_SEATS.park,
);
seat(
  'garden-bench-1',
  'park',
  'parkBench',
  [42, 49],
  '池畔長椅',
  '坐著看水裡的魚。',
  'left',
  REST_SEATS.park,
);
furnish('park-picnic', 'park', 'cafeTable', [84, 24, 3, 2], '野餐桌', '天氣好的時候，大家會帶便當來這裡。', {
  approach: [83, 25],
  approaches: [
    [83, 25],
    [87, 25],
  ],
});
seat(
  'park-picnic-seat-0',
  'park',
  'chair',
  [83, 25],
  '野餐椅',
  '野餐桌旁的座位。',
  'right',
  REST_SEATS.park,
  { tone: 1 },
);
seat('park-picnic-seat-1', 'park', 'chair', [87, 25], '野餐椅', '野餐桌旁的座位。', 'left', REST_SEATS.park, {
  tone: 1,
});
for (const [i, y] of [10, 16, 30, 46].entries())
  seat(
    `park-bench-${i}`,
    'park',
    'parkBench',
    [84, y],
    '河畔長椅',
    '面向河流的長椅。',
    'right',
    REST_SEATS.park,
  );
furnish('park-flowers-a', 'park', 'planter', [85, 4, 3, 1], '花圃', '公園入口的花圃。', {
  approach: [84, 5],
});
furnish('park-flowers-b', 'park', 'planter', [85, 50, 3, 1], '花圃', '靠近河邊的花圃。', {
  approach: [84, 51],
});
for (const [i, [x, y]] of [
  [81, 3],
  [86, 8],
  [81, 13],
  [87, 18],
  [81, 27],
  [86, 33],
  [81, 44],
  [86, 54],
  [93, 6],
  [93, 22],
  [93, 46],
  [30, 50],
  [45, 55],
].entries())
  furnish(`park-tree-${i}`, 'park', 'tree', [x, y, 1, 1], '大樹', '樹蔭下很涼快。', { approach: [x, y + 1] });

export const MAP_OBJECTS = Object.freeze(objects);
const objectsById = new Map(objects.map(object => [object.id, object]));
export const mapObject = id => objectsById.get(id);

// ---------------------------------------------------------------------------
// Standing spots for residents, per zone (tile coordinates).

const row8 = (x0, y, step = 3) => Array.from({ length: 8 }, (_, i) => [x0 + i * step, y]);
/** Eight standing spots per zone, one per resident (by resident order). */
export const IDLE_SPOTS = Object.freeze({
  living: row8(4, 22),
  kitchen: [
    [38, 14],
    [40, 14],
    [42, 14],
    [44, 14],
    [38, 20],
    [40, 23],
    [42, 23],
    [44, 20],
  ],
  bathroom: row8(33, 6, 1),
  gym: row8(31, 31, 1),
  workshop: row8(56, 12),
  plaza: row8(5, 46),
  studio: row8(56, 50),
  park: [
    [82, 8],
    [83, 12],
    [82, 18],
    [83, 22],
    [82, 28],
    [83, 34],
    [82, 42],
    [83, 48],
  ],
});
/** Where a conversation gathers when nobody in it is tied to furniture (tiles). */
export const CONVERSATION_SPOTS = Object.freeze({
  living: [17, 22],
  kitchen: [41, 18],
  bathroom: [37, 6],
  gym: [36, 32],
  workshop: [66, 12],
  plaza: [15, 51],
  studio: [66, 50],
  park: [84, 38],
});
/** Where borrowing residents stand, in front of each equipment cabinet (first tile, one per resident). */
export const BORROW_SPOTS = Object.freeze({
  workshop: { x: 56, y: 5, objectId: 'workshop-storage' },
  studio: { x: 56, y: 44, objectId: 'studio-storage' },
});

/**
 * The open sky as a few rectangles (pixels): every tile outside the buildings,
 * merged row by row. Rain is drawn only here.
 */
export const OUTDOOR_RECTS = Object.freeze(
  (() => {
    const indoor = (x, y) => MAP_ROOMS.some(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    const rects = [];
    let open = new Map(); // "start,end" of a run → rectangle still growing downwards
    for (let y = 0; y < MAP_ROWS; y++) {
      const runs = [];
      for (let x = 0; x < MAP_COLUMNS; x++) {
        if (indoor(x, y)) continue;
        if (runs.length && runs.at(-1)[1] === x - 1) runs.at(-1)[1] = x;
        else runs.push([x, x]);
      }
      const next = new Map();
      for (const [start, end] of runs) {
        const key = `${start},${end}`;
        const rect = open.get(key) ?? { x: start, y, w: end - start + 1, h: 0 };
        if (!open.has(key)) rects.push(rect);
        rect.h++;
        next.set(key, rect);
      }
      open = next;
    }
    return rects.map(r =>
      Object.freeze({
        x: r.x * TILE_SIZE,
        y: r.y * TILE_SIZE,
        width: r.w * TILE_SIZE,
        height: r.h * TILE_SIZE,
      }),
    );
  })(),
);

// ---------------------------------------------------------------------------
// Walking.

export function isWalkable(x, y) {
  const within =
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    x >= 0 &&
    y >= 0 &&
    x < WORLD_SIZE.width &&
    y < WORLD_SIZE.height;
  return within && !blocked[tileOf(y)][tileOf(x)];
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

const inRect = (x, y, r) =>
  x >= r.x * TILE_SIZE && x < (r.x + r.w) * TILE_SIZE && y >= r.y * TILE_SIZE && y < (r.y + r.h) * TILE_SIZE;

/** The room (or park) containing a pixel point, or the street outside. */
export function locationAt(x, y) {
  // Rooms share wall lines; prefer the room whose interior holds the point.
  const room =
    MAP_ROOMS.find(r => inRect(x, y, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 })) ??
    MAP_ROOMS.find(r => inRect(x, y, r));
  if (room) return { zone: room.zone, name: room.name, room: room.name, bedroom: room.bedroom ?? null };
  if (PARK_AREAS.some(area => inRect(x, y, area))) return { zone: 'park', name: '河畔公園', room: null };
  return { zone: null, name: '日和大街' };
}

// ---------------------------------------------------------------------------
// Minimap: one 3×3 pixel square per tile, furniture in a few flat colours.

const MINIMAP_SCALE = 3;
const MINIMAP_GROUND = {
  grass: '#93ad88',
  meadow: '#a3bf8f',
  trail: '#d8c9a3',
  path: '#dccdaf',
  paving: '#d9d4bd',
  water: '#7fb2c2',
  bridge: '#b99a73',
  wood: '#d3b48c',
  carpet: '#cfae86',
  kitchen: '#e2d6bd',
  bath: '#c9dde0',
  gym: '#b9b8cf',
  stone: '#d7d7c8',
  cafe: '#d8bc91',
  studio: '#c5ccd1',
  wall: '#68766d',
  door: '#f5d78f',
};
const minimapObjectColor = kind =>
  kind === 'plant' || kind === 'planter' || kind === 'tree'
    ? '#49775a'
    : kind === 'shower'
      ? '#8fbfca'
      : '#8c7866';

export function createMinimapDataUrl() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = MAP_COLUMNS * MINIMAP_SCALE;
  canvas.height = MAP_ROWS * MINIMAP_SCALE;
  const context = canvas.getContext('2d');
  for (let y = 0; y < MAP_ROWS; y++)
    for (let x = 0; x < MAP_COLUMNS; x++) {
      context.fillStyle = MINIMAP_GROUND[MAP_TILES[y][x]] ?? '#93ad88';
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
