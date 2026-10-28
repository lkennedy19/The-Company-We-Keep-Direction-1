// Weighted Voronoi stippling (Secord, 2002). Points are first scattered in
// proportion to a placement weight, then Lloyd-relaxed: each point moves to
// the weighted centre of the pixels nearest to it. The result is an organic,
// evenly-jittered spread with no halftone grid. Runs in a worker
// (stipple-worker.js) or on the main thread.
//
// `uniformity` sets how much the layout follows the image: 0 packs points by
// ink alone (classic stippling: tone shown by density); higher values spread
// them more evenly over the inked area, which is what the organic halftone
// wants (tone shown by circle size instead).

import { createRng } from '../rng.js';

export const STRIDE = 4;

// Returns Float32Array [u, v, ink, area] per point: position in 0–1 image
// space, the ink under the point, and the area of its Voronoi cell in
// density-map pixels (how much room it has, used to size halftone dots).
// `onProgress(points)` receives an early, partly relaxed layout.
export function stipple(density, w, h, n, { seed = 1, uniformity = 0, iterations = defaultIterations(n), onProgress = null } = {}) {
  const rng = createRng(seed);
  const size = w * h;
  const weights = new Float32Array(size);
  let total = 0;
  for (let i = 0; i < size; i++) {
    const ink = density[i];
    weights[i] = ink > 0 ? uniformity + (1 - uniformity) * ink : 0;
    total += weights[i];
  }
  if (total <= 0) {
    weights.fill(1);
    total = size;
  }
  const cdf = new Float64Array(size);
  let running = 0;
  for (let i = 0; i < size; i++) {
    running += weights[i];
    cdf[i] = running;
  }

  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const sample = (i) => {
    const idx = search(cdf, rng.next() * total);
    xs[i] = (idx % w) + rng.next();
    ys[i] = Math.floor(idx / w) + rng.next();
  };
  for (let i = 0; i < n; i++) sample(i);

  const grid = new PointGrid(w, h, n);
  const sx = new Float64Array(n);
  const sy = new Float64Array(n);
  const sw = new Float64Array(n);
  const area = new Float64Array(n);
  const early = Math.min(6, iterations - 1);

  for (let iter = 0; iter < iterations; iter++) {
    grid.build(xs, ys, n);
    sx.fill(0);
    sy.fill(0);
    sw.fill(0);
    area.fill(0);
    let hint = 0;
    for (let y = 0; y < h; y++) {
      const py = y + 0.5;
      for (let x = 0; x < w; x++) {
        const d = weights[y * w + x];
        if (d <= 0) continue;
        const px = x + 0.5;
        hint = grid.nearest(px, py, xs, ys, hint);
        sx[hint] += d * px;
        sy[hint] += d * py;
        sw[hint] += d;
        area[hint] += 1;
      }
    }
    for (let i = 0; i < n; i++) {
      if (sw[i] > 0) {
        xs[i] = sx[i] / sw[i];
        ys[i] = sy[i] / sw[i];
      } else {
        sample(i);
      }
    }
    if (onProgress && iter === early) onProgress(pack(density, w, h, n, xs, ys, area));
  }
  return pack(density, w, h, n, xs, ys, area);
}

function pack(density, w, h, n, xs, ys, area) {
  const out = new Float32Array(n * STRIDE);
  for (let i = 0; i < n; i++) {
    out[i * STRIDE] = xs[i] / w;
    out[i * STRIDE + 1] = ys[i] / h;
    out[i * STRIDE + 2] = localDensity(density, w, h, xs[i], ys[i]);
    out[i * STRIDE + 3] = area[i];
  }
  return out;
}

export function defaultIterations(n) {
  return n < 500 ? 50 : n < 3000 ? 36 : 28;
}

function search(cdf, value) {
  let lo = 0;
  let hi = cdf.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function localDensity(density, w, h, x, y) {
  const cx = Math.min(w - 1, Math.max(0, Math.floor(x)));
  const cy = Math.min(h - 1, Math.max(0, Math.floor(y)));
  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const px = cx + dx;
      const py = cy + dy;
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      sum += density[py * w + px];
      count++;
    }
  }
  return count ? sum / count : 0;
}

// Bucket grid over the points, rebuilt each iteration, with a ring search
// seeded by the previous pixel's answer (neighbouring pixels almost always
// share a nearest point, which makes the bound tight from the start).
class PointGrid {
  constructor(w, h, n) {
    const size = Math.max(1, Math.sqrt((w * h) / Math.max(1, n)));
    this.cols = Math.max(1, Math.min(1024, Math.ceil(w / size)));
    this.rows = Math.max(1, Math.min(1024, Math.ceil(h / size)));
    this.cw = w / this.cols;
    this.ch = h / this.rows;
    this.start = new Int32Array(this.cols * this.rows + 1);
    this.cursor = new Int32Array(this.cols * this.rows);
    this.keys = new Int32Array(n);
    this.order = new Int32Array(n);
  }

  key(x, y) {
    const c = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cw)));
    const r = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.ch)));
    return r * this.cols + c;
  }

  build(xs, ys, n) {
    this.start.fill(0);
    for (let i = 0; i < n; i++) {
      const k = this.key(xs[i], ys[i]);
      this.keys[i] = k;
      this.start[k + 1]++;
    }
    for (let b = 0; b < this.cols * this.rows; b++) this.start[b + 1] += this.start[b];
    this.cursor.set(this.start.subarray(0, this.cols * this.rows));
    for (let i = 0; i < n; i++) this.order[this.cursor[this.keys[i]]++] = i;
  }

  nearest(x, y, xs, ys, hint) {
    let best = hint;
    let dx = xs[hint] - x;
    let dy = ys[hint] - y;
    let bestD2 = dx * dx + dy * dy;
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cw)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.ch)));
    const cell = Math.min(this.cw, this.ch);
    const maxRing = Math.max(this.cols, this.rows);
    for (let ring = 0; ring <= maxRing; ring++) {
      const reach = (ring - 1) * cell;
      if (reach > 0 && reach * reach > bestD2) break;
      const r0 = cy - ring;
      const r1 = cy + ring;
      for (let r = r0; r <= r1; r++) {
        if (r < 0 || r >= this.rows) continue;
        const edgeRow = r === r0 || r === r1;
        const step = edgeRow ? 1 : ring * 2 || 1;
        for (let c = cx - ring; c <= cx + ring; c += step) {
          if (c < 0 || c >= this.cols) continue;
          const k = r * this.cols + c;
          for (let j = this.start[k]; j < this.start[k + 1]; j++) {
            const i = this.order[j];
            dx = xs[i] - x;
            dy = ys[i] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = i;
            }
          }
        }
      }
    }
    return best;
  }
}
