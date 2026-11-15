// Brand constants and the default settings. Everything the controls can
// change lives in DEFAULTS (and is persisted per browser); the palette and
// frame background are fixed brand values.

export const FRAME_BACKGROUND = '#F2F2ED';

// The D1 colour palette, exact hex values from the brand sheet, in the
// sheet's order. Groups are only for laying out the swatches.
export const PALETTE_GROUPS = [
  { label: 'Neutrals', colours: ['#212121', '#D2CCBE', '#F2F2ED', '#FFFFFF'] },
  { label: 'Tints', colours: ['#E5ECF3', '#EDEDBF', '#F2E9F2'] },
  { label: 'Accents', colours: ['#0000FF', '#FFB6FF', '#C9AAED', '#FF7537', '#7A7900', '#EFD000'] },
];

export const PALETTE = PALETTE_GROUPS.flatMap((group) => group.colours);

export const FRAME_PRESETS = [
  { id: 'hd', label: '1920 × 1080 · 16:9', w: 1920, h: 1080 },
  { id: '4k', label: '3840 × 2160 · 4K', w: 3840, h: 2160 },
  { id: 'square', label: '1080 × 1080 · 1:1', w: 1080, h: 1080 },
  { id: 'portrait', label: '1080 × 1350 · 4:5', w: 1080, h: 1350 },
  { id: 'story', label: '1080 × 1920 · 9:16', w: 1080, h: 1920 },
];

export const LIMITS = {
  count: { min: 1, max: 400, slider: 64 },
  imageCount: { min: 10, max: 12000 },
  frame: { min: 64, max: 7680 },
  stroke: { min: 0.5, max: 20 },
};

export const BEHAVIOURS = {
  fuse: { label: 'Fuse', note: 'Cells pull into one body. Watch what fuses together.' },
  disperse: { label: 'Disperse', note: 'Cells push apart and spread out across the frame.' },
  magnet: { label: 'Magnet', note: 'The oldest cell holds the centre. The rest gather and orbit it.' },
  image: { label: 'Image', note: 'Cells divide and settle into the shape of an image.' },
};

export const DEFAULTS = {
  frame: { w: 1920, h: 1080 },
  behaviour: 'fuse',
  count: 5,
  // Diameter of a lone circle as a fraction of the frame's shorter side.
  size: 0.8,
  // Radius ∝ count^-shrink. 0 keeps every circle the same size as the count
  // rises; 0.5 conserves total area, like a cell dividing.
  shrink: 0.5,
  // Gap between neighbours as a fraction of their combined radii. Negative
  // values let them overlap.
  spacing: 0,
  variety: 0,
  life: 0.35,
  goo: 0,
  tempo: 0.5,
  colours: ['#FF7537'],
  // solid | outline | mixed ("One solid": the nucleus filled, the rest outlined)
  style: 'solid',
  // Outline stroke, in frame pixels (the same number Figma shows for the
  // exported SVG). pattern: line | dots.
  stroke: { width: 2, pattern: 'line' },
  anchor: { x: 0.5, y: 0.5 },
  image: {
    count: 3000,
    dot: 1,
    // halftone: circle size follows tone on an organic layout (most legible)
    // stipple: even circles, packed by tone (the RGD portrait look)
    method: 'halftone',
    levels: true,
    contrast: 0.1,
    midtones: 0,
    cutoff: 0.05,
    invert: false,
    scale: 0.9,
    showSource: false,
  },
  sequence: { from: 1, to: 22, step: 'one', hold: 1.2, pingpong: true },
  export: { fps: 60, quality: 'high', transparent: false },
  seed: 7,
};
