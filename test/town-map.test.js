import test from 'node:test';
import assert from 'node:assert/strict';
import { ZONES } from '../src/config.js';
import { createWorld, step } from '../src/engine.js';
import { viewFrame } from '../src/presentation.js';
import {
  WORLD_SIZE,
  TILE_SIZE,
  MAP_OBJECTS,
  isWalkable,
  nearestWalkable,
  findWalkPath,
} from '../src/town-map.js';
import { activityAnchor } from '../src/activity-anchors.js';

const zones = Object.keys(ZONES);
const action = (actor, action, fields = {}) => ({ actor, action, ...fields });
function inZone(zone, capacity = 2) {
  const state = createWorld({ capacity });
  state.agents.forEach(agent => {
    agent.zone = zone;
  });
  return state;
}
function assertRoute(path, from, to) {
  assert.ok(path.length, `no route between reachable points ${from} and ${to}`);
  assert.deepEqual(path[0], from);
  assert.deepEqual(path.at(-1), to);
  path.forEach(point => assert.ok(isWalkable(...point), `blocked waypoint ${point}`));
  for (let i = 1; i < path.length; i++) {
    const from = path[i - 1],
      to = path[i];
    const samples = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / 8));
    for (let n = 1; n < samples; n++) {
      const t = n / samples;
      const x = from[0] + (to[0] - from[0]) * t,
        y = from[1] + (to[1] - from[1]) * t;
      assert.ok(isWalkable(x, y), `route crossed an obstacle at ${x},${y}`);
    }
  }
}

test('all resident starting positions are distinct, walkable, and do not modify saved frames', () => {
  for (const zone of zones) {
    const frame = viewFrame(inZone(zone)),
      before = JSON.stringify(frame);
    const anchors = frame.agents.map(agent => activityAnchor(agent, frame));
    assert.equal(new Set(anchors.map(anchor => anchor.point.join(','))).size, 8, `${zone} stacks residents`);
    anchors.forEach(anchor => assert.ok(isWalkable(...anchor.point), `${zone} has a blocked start`));
    frame.agents.forEach((agent, index) => assert.deepEqual(activityAnchor(agent, frame), anchors[index]));
    assert.equal(JSON.stringify(frame), before);
  }
});

test('every inspectable furniture approach connects to the shared outdoor walkway', () => {
  const hub = nearestWalkable([WORLD_SIZE.width / 2, WORLD_SIZE.height / 2]);
  assert.ok(isWalkable(...hub));
  const approaches = MAP_OBJECTS.filter(object => object.approach);
  assert.ok(approaches.length, 'the map must have usable furniture');
  assert.deepEqual(new Set(approaches.map(object => object.zone)), new Set(zones));
  for (const object of approaches) {
    assert.ok(isWalkable(...object.approach), `${object.id} cannot be approached`);
    assertRoute(findWalkPath(hub, object.approach), hub, object.approach);
    assertRoute(findWalkPath(object.approach, hub), object.approach, hub);
  }
});

test('blocked clicks are rejected, and the nearest legal point can be reached without teleporting', () => {
  const origin = nearestWalkable([WORLD_SIZE.width / 2, WORLD_SIZE.height / 2]);
  let blocked;
  for (let y = TILE_SIZE * 2.5; y < WORLD_SIZE.height - TILE_SIZE && !blocked; y += TILE_SIZE) {
    for (let x = TILE_SIZE * 2.5; x < WORLD_SIZE.width - TILE_SIZE; x += TILE_SIZE) {
      if (!isWalkable(x, y)) {
        blocked = [x, y];
        break;
      }
    }
  }
  assert.ok(blocked, 'the town needs walls or other obstacles');
  assert.deepEqual(findWalkPath(origin, blocked), []);
  assert.deepEqual(findWalkPath(blocked, origin), []);
  const nearby = nearestWalkable(blocked);
  assert.ok(isWalkable(...nearby));
  assertRoute(findWalkPath(origin, nearby), origin, nearby);
  for (const point of [
    [-1, 1],
    [1, -1],
    [WORLD_SIZE.width, 1],
    [1, WORLD_SIZE.height],
  ]) {
    assert.equal(isWalkable(...point), false);
    assert.deepEqual(findWalkPath(origin, point), []);
  }
});

test('an interrupted walk can be rerouted from its exact non-centered position', () => {
  const frame = viewFrame(inZone('living'));
  const center = activityAnchor(frame.agents[0], frame).point;
  const from = [center[0] + 6, center[1] + 5];
  assert.ok(isWalkable(...from));
  const destination = nearestWalkable([WORLD_SIZE.width / 2, WORLD_SIZE.height / 2]);
  assertRoute(findWalkPath(from, destination), from, destination);
  const sameTile = [center[0] - 5, center[1] - 4];
  assertRoute(findWalkPath(from, sameTile), from, sameTile);
});

test('successful rest and equipment use are placed at reachable furniture in their actual zone', () => {
  for (const zone of zones) {
    const rest = viewFrame(step(inZone(zone), [action('A01', 'rest')]));
    const agent = rest.agents.find(agent => agent.id === 'A01');
    const anchor = activityAnchor(agent, rest);
    const furniture = MAP_OBJECTS.find(object => object.id === anchor.objectId);
    assert.ok(furniture, `${zone} rest lacks a furniture location`);
    assert.equal(furniture.zone, zone);
    assert.ok(isWalkable(...anchor.point));
  }
  for (const [zone, resourceType] of [
    ['workshop', 'tools'],
    ['studio', 'camera'],
  ]) {
    let state = step(inZone(zone), [action('A01', 'borrow', { resourceType })]);
    for (let i = 0; i < 2; i++) {
      state = step(state, [action('A01', 'work')]);
      const frame = viewFrame(state),
        agent = frame.agents.find(agent => agent.id === 'A01');
      const anchor = activityAnchor(agent, frame);
      const furniture = MAP_OBJECTS.find(object => object.id === anchor.objectId);
      assert.ok(furniture, `${zone} work lacks a furniture location`);
      assert.equal(furniture.zone, zone);
      assert.ok(isWalkable(...anchor.point));
    }
  }
});

test('a delivered conversation brings the two participants close together without mutating the event', () => {
  // Nobody can be spoken to in a private bedroom.
  for (const zone of zones.filter(zone => !ZONES[zone].private)) {
    const frame = viewFrame(
      step(inZone(zone), [action('A01', 'talk', { target: 'A02', text: '一起聊聊今天吧。' })]),
    );
    const before = JSON.stringify(frame);
    const first = activityAnchor(
      frame.agents.find(agent => agent.id === 'A01'),
      frame,
    ).point;
    const second = activityAnchor(
      frame.agents.find(agent => agent.id === 'A02'),
      frame,
    ).point;
    const distance = Math.hypot(first[0] - second[0], first[1] - second[1]);
    assert.ok(distance > 0 && distance <= TILE_SIZE * 3, `${zone} conversation is ${distance}px apart`);
    assertRoute(findWalkPath(first, second), first, second);
    assert.equal(JSON.stringify(frame), before);
  }
});

test('successful collaborators share one workstation even when their resident indices are far apart', () => {
  for (const [zone, resourceType] of [
    ['workshop', 'tools'],
    ['studio', 'camera'],
  ]) {
    let state = step(inZone(zone), [action('A01', 'invite', { target: 'A08', resourceType })]);
    const invitationId = state.invitations[0].id;
    state = step(state, [
      action('A01', 'borrow', { resourceType }),
      action('A08', 'accept', { invitationId }),
    ]);
    const frame = viewFrame(
      step(state, [action('A01', 'work', { invitationId }), action('A08', 'join', { invitationId })]),
    );
    const first = activityAnchor(
      frame.agents.find(agent => agent.id === 'A01'),
      frame,
    );
    const second = activityAnchor(
      frame.agents.find(agent => agent.id === 'A08'),
      frame,
    );
    assert.ok(first.objectId);
    assert.equal(first.objectId, second.objectId, `${zone} collaborators are sent to separate desks`);
    const distance = Math.hypot(first.point[0] - second.point[0], first.point[1] - second.point[1]);
    assert.ok(
      distance > 0 && distance <= TILE_SIZE * 3,
      `${zone} collaborators should occupy distinct adjacent work positions`,
    );
    assert.ok(isWalkable(...first.point) && isWalkable(...second.point));
  }
});

test('receiving a message does not pull a successfully working resident away from their workstation', () => {
  let state = step(inZone('workshop'), [action('A08', 'borrow', { resourceType: 'tools' })]);
  const frame = viewFrame(
    step(state, [action('A08', 'work'), action('A01', 'talk', { target: 'A08', text: '你在做什麼呢？' })]),
  );
  const worker = activityAnchor(
    frame.agents.find(agent => agent.id === 'A08'),
    frame,
  );
  const object = MAP_OBJECTS.find(object => object.id === worker.objectId);
  assert.ok(object, 'the working listener lost their furniture anchor');
  assert.equal(object.zone, 'workshop');
  assert.ok(
    object.approaches?.some(point => point[0] === worker.point[0] && point[1] === worker.point[1]),
    'the worker must remain at a work position',
  );
});

test('a cooperating pair and six solo workers occupy eight distinct work positions', () => {
  const soloIds = ['A02', 'A03', 'A04', 'A05', 'A06', 'A07'];
  let state = step(inZone('workshop', 8), [
    action('A01', 'invite', { target: 'A08', resourceType: 'tools' }),
    ...soloIds.map(id => action(id, 'borrow', { resourceType: 'tools' })),
  ]);
  const invitationId = state.invitations[0].id;
  state = step(state, [
    action('A01', 'borrow', { resourceType: 'tools' }),
    action('A08', 'accept', { invitationId }),
  ]);
  const frame = viewFrame(
    step(state, [
      action('A01', 'work', { invitationId }),
      action('A08', 'join', { invitationId }),
      ...soloIds.map(id => action(id, 'work')),
    ]),
  );
  const anchors = frame.agents.map(agent => activityAnchor(agent, frame));
  assert.equal(
    new Set(anchors.map(anchor => anchor.point.join(','))).size,
    8,
    'a collaboration seat must not overlap a solo worker',
  );
  assert.equal(anchors[0].objectId, anchors[7].objectId);
  for (const anchor of anchors) {
    const object = MAP_OBJECTS.find(object => object.id === anchor.objectId);
    assert.ok(
      object?.approaches?.some(point => point[0] === anchor.point[0] && point[1] === anchor.point[1]),
    );
  }
});

test('all eight borrowers stand alongside the storage furniture they are shown using', () => {
  for (const [zone, resourceType] of [
    ['workshop', 'tools'],
    ['studio', 'camera'],
  ]) {
    const state = inZone(zone, 8);
    const frame = viewFrame(
      step(
        state,
        state.agents.map(agent => action(agent.id, 'borrow', { resourceType })),
      ),
    );
    const anchors = frame.agents.map(agent => activityAnchor(agent, frame));
    assert.equal(new Set(anchors.map(anchor => anchor.point.join(','))).size, 8);
    for (const anchor of anchors) {
      const object = MAP_OBJECTS.find(object => object.id === anchor.objectId);
      assert.ok(object);
      const dx = Math.max(object.x - anchor.point[0], 0, anchor.point[0] - object.x - object.width);
      const dy = Math.max(object.y - anchor.point[1], 0, anchor.point[1] - object.y - object.height);
      assert.ok(Math.hypot(dx, dy) <= TILE_SIZE * 1.5, `${zone} borrower is too far from ${object.id}`);
      assert.ok(isWalkable(...anchor.point));
    }
  }
});
