// Image → circles. Holds the current source image, turns it into stipple
// targets for the world, and recomputes when the detail (circle count),
// contrast, cutoff or invert change. Dot size and sizing only rescale the existing
// targets in place, so they respond instantly.

import { buildDensity } from './density.js';
import { stipple } from './stipple.js';
import { createSampleImage } from './sample.js';

export function createImageLab(settings, { onTargets, onBusy }) {
  let source = null;
  let sourceName = 'Sample: three cells';
  let current = null; // { aspect, coverage, n, targets }
  let worker = null;
  let jobId = 0;
  const jobs = new Map();
  let debounce = 0;
  let refreshId = 0;

  try {
    worker = new Worker(new URL('./stipple-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const job = jobs.get(event.data.id);
      if (job) {
        jobs.delete(event.data.id);
        job.resolve(event.data.points);
      }
    };
    worker.onerror = () => {
      // Module workers can be unavailable (older browsers, some sandboxes).
      worker = null;
      for (const job of jobs.values()) job.fallback();
      jobs.clear();
    };
  } catch {
    worker = null;
  }

  function ensureSource() {
    if (!source) source = createSampleImage();
    return source;
  }

  function runStipple(density, w, h, n, seed) {
    if (!worker) return Promise.resolve(stipple(density, w, h, n, { seed }));
    return new Promise((resolve) => {
      const id = ++jobId;
      const copy = density.slice();
      jobs.set(id, { resolve, fallback: () => resolve(stipple(copy, w, h, n, { seed })) });
      worker.postMessage({ id, density, w, h, n, seed }, [density.buffer]);
    });
  }

  // Targets for `n` circles from the current source. Used for live changes
  // and, separately, for each step of a rendered image sequence.
  async function compute(n) {
    const img = ensureSource();
    const { contrast, cutoff, invert } = settings.image;
    const map = buildDensity(img, n, { contrast, cutoff, invert });
    const points = await runStipple(map.density, map.w, map.h, n, settings.seed);
    const targets = [];
    for (let i = 0; i < n; i++) {
      targets.push({ u: points[i * 3], v: points[i * 3 + 1], rho: points[i * 3 + 2], rn: 0 });
    }
    const result = { aspect: map.aspect, coverage: map.coverage, n, targets };
    applyRadii(result);
    return result;
  }

  // Even sizing: circles just touch in the darkest areas (hexagonal packing
  // of the inked area). By tone: darker areas get bigger circles.
  function applyRadii(result) {
    const { dot, sizing } = settings.image;
    const inkArea = Math.max(1e-4, result.coverage) * result.aspect;
    const perCircle = inkArea / Math.max(1, result.n);
    const even = 0.5 * Math.sqrt((2 * perCircle) / Math.sqrt(3));
    for (const t of result.targets) {
      t.rn = even * dot * (sizing === 'tone' ? 0.35 + 0.95 * t.rho : 1);
    }
  }

  async function refresh() {
    const n = settings.image.count;
    const id = ++refreshId;
    onBusy(true);
    try {
      const result = await compute(n);
      if (id !== refreshId) return;
      current = result;
      onTargets({ aspect: result.aspect, targets: result.targets });
    } finally {
      if (id === refreshId) onBusy(false);
    }
  }

  return {
    get source() {
      return ensureSource();
    },
    get sourceName() {
      return sourceName;
    },
    get current() {
      return current;
    },
    setSource(img, name) {
      source = img;
      sourceName = name;
      return refresh();
    },
    // Debounced, so dragging a slider doesn't queue a job per pixel.
    schedule(delay = 140) {
      clearTimeout(debounce);
      debounce = setTimeout(refresh, delay);
    },
    refresh,
    compute,
    rescale() {
      if (current) applyRadii(current);
    },
  };
}
