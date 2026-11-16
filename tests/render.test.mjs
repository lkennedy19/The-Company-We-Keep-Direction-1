// Headless checks for the scene and SVG export: outlined circles are real
// strokes (editable in Figma), the stroke width follows the setting, and
// "One solid" fills only the nucleus. Run with `node --test tests/`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../js/config.js';
import { World } from '../js/sim/world.js';
import { buildScene } from '../js/render/scene.js';
import { sceneToSvg } from '../js/render/svg.js';

function settledWorld(overrides) {
  const settings = { ...structuredClone(DEFAULTS), count: 6, ...overrides };
  const world = new World(settings);
  world.setCount(settings.count);
  for (let t = 0; t < 8; t += 1 / 60) world.advance(1 / 60);
  return world;
}

const circlesIn = (svg) => svg.match(/<circle [^>]*\/>/g) || [];

test('outline: every circle is a continuous stroke with no fill', () => {
  const world = settledWorld({ style: 'outline', stroke: { width: 3.5, pattern: 'line' } });
  const scene = buildScene(world);
  assert.equal(scene.groups.length, 0);
  assert.equal(scene.outlines.reduce((n, g) => n + g.circles.length, 0), 6);

  const circles = circlesIn(sceneToSvg(scene));
  assert.equal(circles.length, 6);
  for (const circle of circles) {
    assert.match(circle, /fill="none"/);
    assert.match(circle, /stroke="#[0-9A-F]{6}"/);
    assert.match(circle, /stroke-width="3.5"/);
    assert.doesNotMatch(circle, /dasharray/);
  }
});

test('outline: dotted pattern writes round dashes', () => {
  const world = settledWorld({ style: 'outline', stroke: { width: 2, pattern: 'dots' } });
  for (const circle of circlesIn(sceneToSvg(buildScene(world)))) {
    assert.match(circle, /stroke-dasharray="0 [\d.]+"/);
    assert.match(circle, /stroke-linecap="round"/);
  }
});

test('one solid: the nucleus is filled, the rest are outlined', () => {
  const world = settledWorld({ style: 'mixed' });
  const scene = buildScene(world);
  assert.equal(scene.groups.reduce((n, g) => n + g.circles.length, 0), 1);
  assert.equal(scene.outlines.reduce((n, g) => n + g.circles.length, 0), 5);
  const svg = sceneToSvg(scene);
  assert.match(svg, /<g id="fill-[0-9A-F]{6}" fill="#[0-9A-F]{6}">/);
  assert.match(svg, /<g id="outline-[0-9A-F]{6}">/);
});

test('solid: no outlines', () => {
  const scene = buildScene(settledWorld({ style: 'solid' }));
  assert.equal(scene.outlines.length, 0);
  assert.doesNotMatch(sceneToSvg(scene), /stroke/);
});
