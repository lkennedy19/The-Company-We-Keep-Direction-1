// Converts an image into an ink map (0 = empty, 1 = full ink) at a
// resolution matched to the number of circles: enough pixels per circle for
// accurate placement without slowing the stippler down.
//
// Tone handling, in order: auto levels (stretch the darkest and lightest
// 1% to the full range, so a flat photo uses every tone), contrast,
// midtones (a gamma curve), then cutoff. Most photos sit in the middle
// greys, and without the levels stretch their circles all look alike.

export function densityResolution(n, aspect) {
  const pixels = Math.min(320000, Math.max(60000, n * 48));
  const w = Math.max(16, Math.round(Math.sqrt(pixels / aspect)));
  const h = Math.max(16, Math.round(w * aspect));
  return { w, h };
}

// `contrast` and `midtones` run −1…1; `cutoff` (0–0.9) clears faint ink,
// such as a coloured background behind a logo. `invert` puts circles on the
// light parts instead. Transparent pixels are always empty, so logos on
// transparent PNGs work either way round.
export function buildDensity(source, n, { levels = true, contrast = 0, midtones = 0, cutoff = 0.05, invert = false } = {}) {
  const aspect = source.height / source.width;
  const { w, h } = densityResolution(n, aspect);
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);

  const size = w * h;
  const luminance = new Float32Array(size);
  const alpha = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    luminance[i] = (0.2126 * data[i * 4] + 0.7152 * data[i * 4 + 1] + 0.0722 * data[i * 4 + 2]) / 255;
    alpha[i] = data[i * 4 + 3] / 255;
  }

  const [low, high] = levels ? percentiles(luminance, alpha, 0.01, 0.99) : [0, 1];
  const span = Math.max(0.02, high - low);
  const k = contrast >= 0 ? 1 + 3 * contrast : 1 + contrast;
  const gamma = Math.pow(2, -1.5 * midtones);

  const density = new Float32Array(size);
  let total = 0;
  for (let i = 0; i < size; i++) {
    const tone = Math.min(1, Math.max(0, (luminance[i] - low) / span));
    let ink = invert ? tone : 1 - tone;
    ink = Math.min(1, Math.max(0, (ink - 0.5) * k + 0.5));
    ink = Math.pow(ink, gamma) * alpha[i];
    ink = ink <= cutoff ? 0 : (ink - cutoff) / (1 - cutoff);
    density[i] = ink;
    total += ink;
  }
  return { density, w, h, aspect, coverage: total / size };
}

// Luminance at the given lower/upper fractions of the visible pixels.
function percentiles(luminance, alpha, lowFraction, highFraction) {
  const bins = new Float64Array(256);
  let count = 0;
  for (let i = 0; i < luminance.length; i++) {
    if (alpha[i] < 0.5) continue;
    bins[Math.min(255, Math.floor(luminance[i] * 256))]++;
    count++;
  }
  if (!count) return [0, 1];
  const find = (target) => {
    let seen = 0;
    for (let b = 0; b < 256; b++) {
      seen += bins[b];
      if (seen >= target) return b / 255;
    }
    return 1;
  };
  return [find(count * lowFraction), find(count * highFraction)];
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}
