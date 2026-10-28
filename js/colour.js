// Small colour helpers. Cells ease between colours in RGB so recolouring
// reads as a soft change on film rather than a cut.

export function hexToRgb(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function rgbToHex(rgb) {
  const part = (v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`.toUpperCase();
}

// Moves `rgb` toward `target` in place by fraction `t`.
export function easeRgb(rgb, target, t) {
  rgb[0] += (target[0] - rgb[0]) * t;
  rgb[1] += (target[1] - rgb[1]) * t;
  rgb[2] += (target[2] - rgb[2]) * t;
  return rgb;
}

export function mixRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
