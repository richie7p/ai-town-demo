import test from 'node:test';
import assert from 'node:assert/strict';
import { createTownScene } from '../src/town-scene.js';
import { createWorld, step } from '../src/engine.js';
import { propose } from '../src/policy.js';
import { viewFrame } from '../src/presentation.js';

// Record Canvas operations without depending on a browser or raster library.
// Geometry and text are observable outputs; the engine still produces real frames.
function contextRecorder() {
  const calls = [];
  const context = new Proxy({}, {
    get(target, name) {
      return target[name] ?? ((...args) => {
        for (const value of args) if (typeof value === 'number') {
          assert.ok(Number.isFinite(value), `${String(name)} received a non-finite coordinate`);
        }
        calls.push({ name, args });
      });
    },
    set(target, name, value) { target[name] = value; return true; },
  });
  return { context, calls };
}

function harness(t, { dpr = 1, box = { left: 0, top: 0, width: 1000, height: 650 } } = {}) {
  const display = contextRecorder(), background = contextRecorder();
  const listeners = new Map(), frames = new Map();
  let nextId = 0, scene;
  const canvas = {
    // Match the HTML's already-correct dimensions: DPR 1 must still build scenery.
    width: 1000, height: 650, style: {},
    getContext: () => display.context,
    setAttribute() {},
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: name => listeners.delete(name),
    getBoundingClientRect: () => box,
  };
  const backdrop = { width: 300, height: 150, getContext: () => background.context };
  const globals = {
    window: { devicePixelRatio: dpr },
    document: { createElement: tag => { assert.equal(tag, 'canvas'); return backdrop; } },
    requestAnimationFrame: callback => { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: undefined,
  };
  const originals = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, globals);
  t.after(() => {
    scene?.destroy();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return {
    canvas, backdrop, display, background, listeners,
    create: options => (scene = createTownScene(canvas, options)),
    flush() {
      let iterations = 0;
      while (frames.size) {
        assert.ok(++iterations < 5, 'settled frame kept scheduling animation');
        const batch = [...frames.values()]; frames.clear();
        for (const callback of batch) callback(performance.now() + 100_000);
      }
    },
    dispatch(name, event) { listeners.get(name)?.(event); },
    setBox(value) { box = value; },
  };
}

test('DPR 1 initializes scenery even with correct canvas dimensions, and rendering never changes frames', t => {
  const h = harness(t), scene = h.create();
  assert.equal(h.backdrop.width, 1000);
  assert.equal(h.backdrop.height, 650);
  assert.ok(h.background.calls.some(c => c.name === 'fillRect' && c.args[2] === 1000 && c.args[3] === 650), 'landscape background was not painted');
  assert.ok(h.background.calls.some(c => c.name === 'fillText' && c.args[0] === '工坊'), 'landscape landmarks were not painted');
  let state = createWorld();
  for (let tick = 0; tick <= 120; tick++) {
    const frame = viewFrame(state), before = JSON.stringify(frame);
    scene.render(frame, { selected: 'A01', duration: 600 });
    h.flush();
    assert.equal(JSON.stringify(frame), before, `render changed simulation data at tick ${tick}`);
    if (tick < 120) state = step(state, propose(state));
  }
  assert.equal(h.display.calls.filter(c => c.name === 'drawImage').length, 121);
  scene.destroy();
  assert.equal(h.listeners.size, 0, 'destroy must remove interaction listeners');
});

test('speech bubbles show delivered utterances but never a rejected action proposal', t => {
  const h = harness(t), scene = h.create();
  const initial = createWorld();
  initial.agents.forEach(a => { a.zone = 'home'; });
  initial.agents.find(a => a.id === 'A03').zone = 'workshop';
  const actual = '這是真正送出的對話', rejected = '這句未送達不可展示';
  const state = step(initial, [
    { actor: 'A01', action: 'talk', target: 'A02', text: actual },
    { actor: 'A03', action: 'talk', target: 'A04', text: rejected },
  ]);
  assert.ok(state.events.some(e => e.type === 'invalid' && e.participants[0] === 'A03'));
  scene.render(viewFrame(state), { selected: 'A01', animate: false, reducedMotion: true });
  h.flush();
  const drawnText = h.display.calls.filter(c => c.name === 'fillText').map(c => c.args[0]);
  assert.ok(drawnText.includes(actual), 'valid dialogue should be visible');
  assert.ok(!drawnText.includes(rejected), 'unexecuted proposal must not become dialogue');
});

test('character selection maps through vertical and horizontal contain letterboxing', t => {
  const h = harness(t, { dpr: 2 }), selected = [];
  const scene = h.create({ onSelect: id => selected.push(id) });
  const state = createWorld();
  state.agents[0].zone = 'home';
  scene.render(viewFrame(state), { animate: false, reducedMotion: true });
  h.flush();
  assert.equal(h.canvas.width, 2000);
  assert.equal(h.canvas.height, 1300);
  // A01 occupies (95,236); click its torso at y=221, not its label.
  for (const box of [
    { left: 17, top: 29, width: 600, height: 1000 },
    { left: 23, top: 37, width: 1200, height: 500 },
  ]) {
    h.setBox(box);
    const scale = Math.min(box.width / 1000, box.height / 650);
    const point = {
      clientX: box.left + (box.width - 1000 * scale) / 2 + 95 * scale,
      clientY: box.top + (box.height - 650 * scale) / 2 + 221 * scale,
    };
    h.dispatch('pointermove', point);
    assert.equal(h.canvas.style.cursor, 'pointer');
    h.dispatch('click', point);
    assert.equal(selected.at(-1), 'A01');
    const before = selected.length;
    h.dispatch('click', { clientX: box.left + 3, clientY: box.top + 3 });
    assert.equal(selected.length, before, 'letterbox area must not select a character');
  }
  assert.deepEqual(selected, ['A01', 'A01']);
});
