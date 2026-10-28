// Converts an image into an ink-density map (0 = empty, 1 = full ink) at a
// resolution matched to the number of circles: enough pixels per circle for
// accurate placement without slowing the stippler down.

export function densityResolution(n, aspect) {
  const pixels = Math.min(160000, Math.max(40000, n * 40));
  const w = Math.max(16, Math.round(Math.sqrt(pixels / aspect)));
  const h = Math.max(16, Math.round(w * aspect));
  return { w, h };
}

// `contrast` runs −1…1. `cutoff` (0–0.9) clears faint ink, such as a
// coloured background behind a logo. `invert` puts circles on the light
// parts instead. Transparent pixels are always empty, so logos on
// transparent PNGs work either way round.
export function buildDensity(source, n, { contrast = 0, cutoff = 0.05, invert = false } = {}) {
  const srcW = source.width;
  const srcH = source.height;
  const aspect = srcH / srcW;
  const { w, h } = densityResolution(n, aspect);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const k = contrast >= 0 ? 1 + 3 * contrast : 1 + contrast;
  const density = new Float32Array(w * h);
  let total = 0;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const alpha = data[i * 4 + 3] / 255;
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    let ink = invert ? luminance : 1 - luminance;
    ink = (ink - 0.5) * k + 0.5;
    ink = Math.min(1, Math.max(0, ink)) * alpha;
    ink = ink <= cutoff ? 0 : (ink - cutoff) / (1 - cutoff);
    density[i] = ink;
    total += ink;
  }
  return { density, w, h, aspect, coverage: total / (w * h) };
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
