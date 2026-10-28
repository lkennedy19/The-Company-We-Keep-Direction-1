// Image → circles. Holds the current source image, turns it into targets
// for the world, and recomputes when the detail (circle count), method or
// tone settings change. Dot size only rescales the existing targets in
// place, so it responds instantly.
//
// Two methods:
// - Halftone: circles spread evenly (organic, no grid) and their size
//   follows the tone, so dark areas fill in and light areas shrink to
//   specks. Reads like a photograph, like Brandmelder's halftone.
// - Stipple: every circle the same size, packed densely where the image is
//   dark. The RGD portrait look; needs a contrasty image and lots of circles.

import { buildDensity } from './density.js';
import { stipple, STRIDE } from './stipple.js';
import { createSampleImage } from './sample.js';

const UNIFORMITY = { halftone: 0.65, stipple: 0 };
const MIN_INK = 0.01; // halftone circles fainter than this would be invisible

export function createImageLab(settings, { onTargets, onBusy }) {
  let source = null;
  let sourceName = 'Sample: three cells';
  let current = null; // { aspect, coverage, n, method, w, targets }
  let worker = null;
  let jobId = 0;
  const jobs = new Map();
  let debounce = 0;
  let refreshId = 0;

  try {
    worker = new Worker(new URL('./stipple-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (event) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      if (!event.data.final) {
        if (job.onEarly) job.onEarly(event.data.points);
        return;
      }
      jobs.delete(event.data.id);
      job.resolve(event.data.points);
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

  function runStipple(density, w, h, n, options, onEarly) {
    const { seed, uniformity } = options;
    if (!worker) return Promise.resolve(stipple(density, w, h, n, { seed, uniformity }));
    return new Promise((resolve) => {
      const id = ++jobId;
      const copy = density.slice();
      jobs.set(id, { resolve, onEarly, fallback: () => resolve(stipple(copy, w, h, n, { seed, uniformity })) });
      worker.postMessage({ id, density, w, h, n, seed, uniformity }, [density.buffer]);
    });
  }

  // Targets for `n` circles from the current source. Used for live changes
  // and, separately, for each step of a rendered image sequence. `onEarly`
  // receives a quick, partly relaxed result before the final one.
  async function compute(n, onEarly = null) {
    const img = ensureSource();
    const { levels, contrast, midtones, cutoff, invert, method } = settings.image;
    const map = buildDensity(img, n, { levels, contrast, midtones, cutoff, invert });
    const meta = { aspect: map.aspect, coverage: map.coverage, n, method, w: map.w };
    const toResult = (points) => {
      const result = { ...meta, targets: toTargets(points, n, method) };
      applyRadii(result);
      return result;
    };
    const points = await runStipple(
      map.density,
      map.w,
      map.h,
      n,
      { seed: settings.seed, uniformity: UNIFORMITY[method] ?? 0 },
      onEarly ? (early) => onEarly(toResult(early)) : null,
    );
    return toResult(points);
  }

  function toTargets(points, n, method) {
    const targets = [];
    for (let i = 0; i < n; i++) {
      const ink = points[i * STRIDE + 2];
      if (method === 'halftone' && ink < MIN_INK) continue;
      targets.push({ u: points[i * STRIDE], v: points[i * STRIDE + 1], rho: ink, area: points[i * STRIDE + 3], rn: 0 });
    }
    return targets;
  }

  // rn is the radius as a fraction of the image width.
  function applyRadii(result) {
    const { dot } = settings.image;
    if (result.method === 'halftone') {
      // Each circle gets the room of its own cell: full ink just overlaps its
      // neighbours (solid darks), and the circle's area follows the tone.
      for (const t of result.targets) {
        const spacing = Math.sqrt((2 * Math.max(1, t.area)) / Math.sqrt(3));
        t.rn = (0.55 * spacing * Math.sqrt(t.rho) * dot) / result.w;
      }
    } else {
      // Even size: circles just touch in the darkest areas.
      const inkArea = Math.max(1e-4, result.coverage) * result.aspect;
      const even = 0.5 * Math.sqrt((2 * inkArea) / (Math.sqrt(3) * Math.max(1, result.n)));
      for (const t of result.targets) t.rn = even * dot;
    }
  }

  async function refresh() {
    const n = settings.image.count;
    const id = ++refreshId;
    onBusy(true);
    try {
      const result = await compute(n, (early) => {
        if (id === refreshId) onTargets({ aspect: early.aspect, targets: early.targets });
      });
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
