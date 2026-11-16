// Headless checks for the cell simulation: counts converge through
// division/fusion cascades in every behaviour, and Image mode ends with one
// cell per stipple target. Run with `node --test tests/`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/config.js';
import { World } from '../js/sim/world.js';

function settingsWith(overrides = {}) {
  return { ...structuredClone(DEFAULTS), ...overrides };
}

function runUntilSettled(world, maxSeconds) {
  for (let t = 0; t < maxSeconds; t += 1 / 60) {
    world.advance(1 / 60);
    if (world.isSettled() && t > 0.5) return t;
  }
  return Infinity;
}

function assertFinite(world) {
  for (const c of world.cells) {
    assert.ok(Number.isFinite(c.x) && Number.isFinite(c.y) && Number.isFinite(c.r), `cell ${c.id} is not finite`);
  }
}

for (const behaviour of ['fuse', 'disperse', 'magnet']) {
  test(`${behaviour}: 1 → 22 → 1 converges`, () => {
    const settings = settingsWith({ behaviour, count: 1 });
    const world = new World(settings);
    world.setCount(22);
    const up = runUntilSettled(world, 30);
    assert.ok(up < 30, `did not reach 22 (live ${world.liveCount})`);
    assert.equal(world.cells.length, 22);
    assertFinite(world);

    world.setCount(1);
    const down = runUntilSettled(world, 40);
    assert.ok(down < 40, `did not fuse back to 1 (live ${world.liveCount})`);
    assert.equal(world.cells.length, 1);
    assertFinite(world);
  });
}

test('fuse keeps the cluster on the anchor and cells from overlapping much', () => {
  const settings = settingsWith({ behaviour: 'fuse', count: 1, life: 0 });
  const world = new World(settings);
  world.setCount(12);
  runUntilSettled(world, 30);
  world.advance(3);
  const cx = world.cells.reduce((s, c) => s + c.x, 0) / world.cells.length;
  const cy = world.cells.reduce((s, c) => s + c.y, 0) / world.cells.length;
  assert.ok(Math.abs(cx - 960) < 40 && Math.abs(cy - 540) < 40, `centroid ${cx},${cy}`);
  let worst = 0;
  for (const a of world.cells) {
    for (const b of world.cells) {
      if (a === b) continue;
      const overlap = (a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y)) / (a.r + b.r);
      worst = Math.max(worst, overlap);
    }
  }
  assert.ok(worst < 0.08, `worst overlap ${worst}`);
});

test('disperse spreads cells across the frame', () => {
  const settings = settingsWith({ behaviour: 'disperse', count: 1, life: 0 });
  const world = new World(settings);
  world.setCount(22);
  runUntilSettled(world, 30);
  world.advance(4);
  const xs = world.cells.map((c) => c.x);
  const ys = world.cells.map((c) => c.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 1920 * 0.6, 'not spread horizontally');
  assert.ok(Math.max(...ys) - Math.min(...ys) > 1080 * 0.5, 'not spread vertically');
});

test('image mode grows one cell per target and fuses back down', () => {
  const settings = settingsWith({ behaviour: 'image', count: 3 });
  const world = new World(settings, { startCount: 3 });
  const grid = (n) => {
    const targets = [];
    const side = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      targets.push({ u: ((i % side) + 0.5) / side, v: (Math.floor(i / side) + 0.5) / side, rho: 1, rn: 0.01 });
    }
    return { aspect: 1, targets };
  };
  world.setImage(grid(300));
  runUntilSettled(world, 30);
  assert.equal(world.cells.length, 300);
  const claimed = new Set(world.cells.map((c) => c.target));
  assert.equal(claimed.size, 300, 'every target has exactly one cell');

  world.setImage(grid(40));
  runUntilSettled(world, 40);
  assert.equal(world.cells.length, 40);
  assertFinite(world);

  settings.behaviour = 'fuse';
  settings.count = 4;
  world.setCount(4);
  runUntilSettled(world, 40);
  assert.equal(world.cells.length, 4);
});

test('frame resize rescales positions', () => {
  const settings = settingsWith({ behaviour: 'disperse', count: 1 });
  const world = new World(settings);
  world.setCount(10);
  runUntilSettled(world, 20);
  settings.frame = { w: 1080, h: 1920 };
  world.advance(4);
  for (const c of world.cells) {
    assert.ok(c.x > -100 && c.x < 1180 && c.y > -100 && c.y < 2020, `cell outside resized frame: ${c.x},${c.y}`);
  }
});

test('cascades fit a short time budget at any size', async () => {
  const { generationsBetween, generationTime } = await import('../js/sim/lifecycle.js');
  assert.equal(generationsBetween(1, 2), 1);
  assert.equal(generationsBetween(5, 6), 1);
  assert.equal(generationsBetween(1, 22), 5);
  assert.equal(generationsBetween(22, 1), 5);
  const s = settingsWith();
  // One generation per step for small changes, squeezed for big jumps.
  assert.ok(generationTime(s, 1) > generationTime(s, 10));
  assert.ok(generationTime(s, 10) * 10 <= 2.4);

  const world = new World(settingsWith({ behaviour: 'fuse', count: 1, life: 0 }));
  world.setCount(64);
  assert.ok(runUntilSettled(world, 10) < 3, 'fuse 1 → 64 took too long');

  const image = new World(settingsWith({ behaviour: 'image' }), { startCount: 3 });
  const targets = Array.from({ length: 6000 }, (_, i) => ({ u: (i % 100) / 100, v: Math.floor(i / 100) / 60, rho: 1, rn: 0.003 }));
  image.setImage({ aspect: 0.6, targets });
  assert.ok(runUntilSettled(image, 10) < 3.5, 'image 3 → 6000 took too long');
  assert.equal(image.cells.length, 6000);
});
