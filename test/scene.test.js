import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, step } from '../src/engine.js';
import { propose } from '../src/policy.js';
import { viewFrame } from '../src/presentation.js';
import { isWalkable, TILE_SIZE } from '../src/town-map.js';
import {
  WORLD_SIZE, ZONE_CENTERS, characterPosition, presentationPath, samplePath,
  directionBetween, characterPresentation, visibleUtterances,
  isContinuousFrame, clampZoom,
} from '../src/town-view-model.js';

const action = (actor, action, more = {}) => ({ actor, action, ...more });
function inZone(zone = 'workshop') {
  const state = createWorld();
  state.agents.forEach(agent => { agent.zone = zone; });
  return state;
}
function assertPoint(point) {
  assert.equal(point.length, 2);
  assert.ok(point.every(Number.isFinite), `non-finite point: ${point}`);
  assert.ok(point[0] >= 0 && point[0] <= WORLD_SIZE.width);
  assert.ok(point[1] >= 0 && point[1] <= WORLD_SIZE.height);
}
function assertWalkPath(path) {
  assert.ok(path.length, 'a reachable presentation route must not be empty');
  for (let i = 0; i < path.length; i++) {
    const point = path[i];
    assertPoint(point);
    assert.ok(isWalkable(...point), `route waypoint is blocked: ${point}`);
    if (!i) continue;
    const previous = path[i - 1];
    const distance = Math.hypot(point[0] - previous[0], point[1] - previous[1]);
    const samples = Math.max(1, Math.ceil(distance / (TILE_SIZE / 4)));
    for (let n = 1; n < samples; n++) {
      const t = n / samples;
      const sample = [previous[0] + (point[0] - previous[0]) * t, previous[1] + (point[1] - previous[1]) * t];
      assert.ok(isWalkable(...sample), `route crossed a wall or furniture: ${sample}`);
    }
  }
}

// Phaser renders these values in the browser. Testing real engine frames here
// keeps the display/research boundary verifiable without a mock game engine.
test('the full 10-day run has finite display geometry and presentation never changes frames', () => {
  let state = createWorld(), previous;
  for (let tick = 0; tick <= 120; tick++) {
    const frame = viewFrame(state), before = JSON.stringify(frame);
    for (const agent of frame.agents) {
      const position = characterPosition(agent, frame);
      assertPoint(position);
      assert.ok(isWalkable(...position), `resident ${agent.id} has a blocked anchor at tick ${tick}`);
      const display = characterPresentation(frame, agent.id);
      assert.ok(['idle', 'talk', 'rest', 'work', 'camera'].includes(display.pose));
      if (previous) {
        const oldAgent = previous.agents.find(a => a.id === agent.id);
        const from = characterPosition(oldAgent, previous);
        const path = presentationPath(from, position, oldAgent.zone, agent.zone);
        assertWalkPath(path);
        assert.deepEqual(samplePath(path, 0), from);
        assert.deepEqual(samplePath(path, 1), position);
        for (const progress of [0.1, 0.5, 0.9]) assertPoint(samplePath(path, progress));
        assert.ok(['up', 'down', 'left', 'right'].includes(directionBetween(from, position)));
      }
    }
    for (const event of visibleUtterances(frame, 'A01')) {
      assert.equal(event.tick, tick);
      assert.equal(event.success, true);
    }
    assert.equal(new Set(frame.agents.map(agent => characterPosition(agent, frame).join(','))).size, frame.agents.length, `residents overlap at tick ${tick}`);
    assert.equal(JSON.stringify(frame), before, `display helpers changed tick ${tick}`);
    previous = frame;
    if (tick < 120) state = step(state, propose(state));
  }
});

test('only delivered utterances become bubbles or talking poses, including when replaying a past step', () => {
  const initial = inZone('home');
  initial.agents.find(a => a.id === 'A03').zone = 'workshop';
  const actual = '這是真正送出的對話', rejected = '這句未送達不可展示';
  const spoken = step(initial, [
    action('A01', 'talk', { target: 'A02', text: actual }),
    action('A03', 'talk', { target: 'A04', text: rejected }),
  ]);
  const past = viewFrame(spoken);
  assert.deepEqual(visibleUtterances(past, 'A01').map(e => e.text), [actual]);
  assert.equal(characterPresentation(past, 'A01').pose, 'talk');
  assert.equal(characterPresentation(past, 'A01').target, 'A02');
  assert.equal(characterPresentation(past, 'A03').failed, true);
  assert.equal(characterPresentation(past, 'A03').pose, 'idle');
  assert.equal(characterPresentation(past, 'A03').delivered, undefined);

  const message = spoken.messages.find(m => m.from === 'A01');
  const replied = step(spoken, [action('A02', 'reply', {
    target: 'A01', replyTo: message.id, conversationId: message.conversationId, text: '現在才回覆',
  })]);
  const current = viewFrame(replied);
  assert.deepEqual(visibleUtterances(current, 'A02').map(e => e.text), ['現在才回覆']);
  assert.deepEqual(visibleUtterances(viewFrame(step(replied)), 'A01'), []);
  assert.deepEqual(visibleUtterances(past, 'A01').map(e => e.text), [actual]);
});

test('all eight residents can enter and leave every district without crossing walls or furniture', () => {
  const zones = ['home', 'workshop', 'plaza', 'studio'];
  const frames = Object.fromEntries(zones.map(zone => [zone, viewFrame(inZone(zone))]));
  for (const origin of zones) for (const destination of zones) {
    const fromFrame = frames[origin], toFrame = frames[destination];
    for (const [index, agent] of fromFrame.agents.entries()) {
      const from = characterPosition(agent, fromFrame);
      const to = characterPosition(toFrame.agents[index], toFrame);
      const path = presentationPath(from, to, origin, destination);
      const before = JSON.stringify(path);
      assertWalkPath(path);
      assert.deepEqual(samplePath(path, 0), from);
      assert.deepEqual(samplePath(path, 1), to);
      assert.equal(JSON.stringify(path), before);
    }
  }
});

test('bubble limits preserve the selected speaker without reordering source events', () => {
  const frame = viewFrame(step(inZone(), [1, 3, 5, 7].map(i => action(`A0${i}`, 'talk', {
    target: `A0${i + 1}`, text: `第 ${i} 位角色開口`,
  }))));
  const before = JSON.stringify(frame.events);
  const bubbles = visibleUtterances(frame, 'A07');
  assert.equal(bubbles.length, 3);
  assert.equal(bubbles[0].participants[0], 'A07');
  assert.equal(new Set(bubbles.map(e => e.participants[0])).size, bubbles.length);
  assert.deepEqual(visibleUtterances(frame, 'A07', 0), []);
  assert.equal(JSON.stringify(frame.events), before);
});

test('borrowing and failed actions do not animate equipment use or a blocked move', () => {
  const borrowed = step(inZone(), ['A01', 'A02', 'A03'].map(id => action(id, 'borrow', { resourceType: 'tools' })));
  const frame = viewFrame(borrowed);
  const failure = frame.events.find(e => e.type === 'capacity_failure');
  assert.ok(failure, 'the fixture must exhaust the two available tools');
  const failedDisplay = characterPresentation(frame, failure.participants[0]);
  assert.equal(failedDisplay.failed, true);
  assert.equal(failedDisplay.pose, 'idle');
  assert.equal(failedDisplay.held, null);
  const owner = borrowed.equipment.find(e => e.owner).owner;
  const justBorrowed = characterPresentation(frame, owner);
  assert.equal(justBorrowed.pose, 'idle');
  assert.equal(justBorrowed.held.usableFrom, borrowed.tick + 1);

  const blocked = viewFrame(step(borrowed, [action(owner, 'move', { destination: 'studio' })]));
  const before = frame.agents.find(a => a.id === owner), after = blocked.agents.find(a => a.id === owner);
  assert.equal(characterPresentation(blocked, owner).failed, true);
  assert.equal(characterPresentation(blocked, owner).pose, 'idle');
  assert.deepEqual(characterPosition(after, blocked), characterPosition(before, frame));
});

test('equipment use keeps its correct pose on the final usable tick after automatic return', () => {
  for (const [zone, resourceType, pose] of [['workshop', 'tools', 'work'], ['studio', 'camera', 'camera']]) {
    let state = step(inZone(zone), [action('A01', 'borrow', { resourceType })]);
    state = step(state, [action('A01', 'work')]);
    assert.equal(characterPresentation(viewFrame(state), 'A01').pose, pose);
    state = step(state, [action('A01', 'work')]);
    const finalUse = characterPresentation(viewFrame(state), 'A01');
    assert.equal(finalUse.held, null, 'the engine already returned the equipment at the end of this tick');
    assert.equal(finalUse.pose, pose, 'a successful final use must still be shown');
    state = step(state, [action('A01', 'work')]);
    assert.equal(characterPresentation(viewFrame(state), 'A01').failed, true);
    assert.equal(characterPresentation(viewFrame(state), 'A01').pose, 'idle');
  }
});

test('a successful camera collaborator uses the camera pose; a failed join remains idle', () => {
  let state = step(inZone('studio'), [action('A01', 'invite', { target: 'A02', resourceType: 'camera' })]);
  const invitationId = state.invitations[0].id;
  state = step(state, [
    action('A01', 'borrow', { resourceType: 'camera' }),
    action('A02', 'accept', { invitationId }),
  ]);
  const success = viewFrame(step(state, [action('A01', 'work', { invitationId }), action('A02', 'join', { invitationId })]));
  assert.equal(characterPresentation(success, 'A01').pose, 'camera');
  assert.equal(characterPresentation(success, 'A02').held, null);
  assert.equal(characterPresentation(success, 'A02').pose, 'camera');
  const failed = viewFrame(step(state, [action('A02', 'join', { invitationId })]));
  assert.equal(characterPresentation(failed, 'A02').failed, true);
  assert.equal(characterPresentation(failed, 'A02').pose, 'idle');
});

test('only consecutive frames from the same run animate, and camera/geometry limits stay safe', () => {
  const initial = createWorld(), first = viewFrame(initial), second = viewFrame(step(initial));
  assert.equal(isContinuousFrame(first, second), true);
  assert.equal(isContinuousFrame(undefined, first), false);
  assert.equal(isContinuousFrame(second, first), false);
  assert.equal(isContinuousFrame(second, second), false);
  assert.equal(isContinuousFrame(first, viewFrame(step(step(initial)))), false);
  assert.equal(isContinuousFrame(first, viewFrame(step(createWorld({ seed: 42 })))), false);
  assert.equal(isContinuousFrame(first, viewFrame(step(createWorld({ capacity: 8 })))), false);
  assert.equal(clampZoom(-1), 1);
  assert.equal(clampZoom(10), 3.5);
  assert.equal(clampZoom(1.75), 1.75);
  for (const value of [NaN, Infinity, undefined]) assert.equal(clampZoom(value), 1);
  for (const center of Object.values(ZONE_CENTERS)) assertPoint(center);
  assertPoint(samplePath([], 0.5));
  const stationary = [[10, 20], [10, 20]];
  for (const progress of [-1, 0, 0.5, 1, 2, NaN]) assert.deepEqual(samplePath(stationary, progress), [10, 20]);
  assert.equal(directionBetween([10, 20], [10, 20], 'left'), 'left');
  assert.equal(directionBetween([0, 0], [10, 0]), 'right');
  assert.equal(directionBetween([10, 0], [0, 0]), 'left');
  assert.equal(directionBetween([0, 10], [0, 0]), 'up');
  assert.equal(directionBetween([0, 0], [0, 10]), 'down');
});
