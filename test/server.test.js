import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('local server serves the demo and excludes repository/private files', { timeout: 15000 }, async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const [line] = await once(child.stdout, 'data');
  const base = line.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /AI 小鎮/);
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(base + '/src/engine.js')).status, 200);
  const landscape = await fetch(base + '/assets/town-grand-v1.png');
  assert.equal(landscape.status, 200);
  assert.equal(landscape.headers.get('content-type'), 'image/png');
  const picture = new Uint8Array(await landscape.arrayBuffer());
  assert.deepEqual([...picture.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const phaser = await fetch(base + '/vendor/phaser.js');
  assert.equal(phaser.status, 200);
  assert.match(phaser.headers.get('content-type'), /(?:text|application)\/javascript/);
  const bundle = await phaser.text();
  assert.match(bundle, /Phaser/);
  assert.match(bundle, /4\.2\.1/);
  const license = await fetch(base + '/vendor/phaser.LICENSE.txt');
  assert.equal(license.status, 200);
  assert.match(await license.text(), /MIT License/);
  for (const path of [
    '/.git/config',
    '/.env',
    '/package.json',
    '/package-lock.json',
    '/output/demo-replay.json',
    '/src/../../.env',
    '/assets/private.png',
    '/assets/../package.json',
    '/node_modules/phaser/package.json',
    '/node_modules/phaser/dist/phaser.min.js',
    '/vendor/package.json',
    '/vendor/phaser.js.map',
    '/vendor/../node_modules/phaser/package.json',
  ]) {
    assert.equal((await fetch(base + path)).status, 404, `${path} must stay private`);
  }
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
