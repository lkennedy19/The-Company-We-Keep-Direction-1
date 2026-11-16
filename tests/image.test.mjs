// Checks for the image pipeline's pure parts: stippling places points on
// the inked area, and halftone layouts spread evenly while stipple layouts
// follow the ink. Run with `npm test`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stipple, STRIDE } from '../js/image/stipple.js';

// A 120 × 80 map: left half dark (ink 0.9), right half light (ink 0.15).
function halves() {
  const w = 120;
  const h = 80;
  const density = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) density[y * w + x] = x < w / 2 ? 0.9 : 0.15;
  return { density, w, h };
}

function leftShare(points, n) {
  let left = 0;
  for (let i = 0; i < n; i++) if (points[i * STRIDE] < 0.5) left++;
  return left / n;
}

test('stipple packs points where the ink is', () => {
  const { density, w, h } = halves();
  const n = 400;
  const points = stipple(density, w, h, n, { seed: 3, uniformity: 0 });
  assert.equal(points.length, n * STRIDE);
  // Ink ratio 0.9 : 0.15 → about 86% of points on the dark half.
  assert.ok(leftShare(points, n) > 0.75, `left share ${leftShare(points, n)}`);
});

test('halftone layout spreads points more evenly and reports cell areas', () => {
  const { density, w, h } = halves();
  const n = 400;
  const points = stipple(density, w, h, n, { seed: 3, uniformity: 0.65 });
  const share = leftShare(points, n);
  assert.ok(share > 0.5 && share < 0.7, `left share ${share}`);
  let area = 0;
  for (let i = 0; i < n; i++) {
    const u = points[i * STRIDE];
    const v = points[i * STRIDE + 1];
    assert.ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, 'point outside the image');
    area += points[i * STRIDE + 3];
  }
  // Every inked pixel belongs to exactly one point's cell.
  assert.equal(area, w * h);
});
