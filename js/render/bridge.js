// The "neck" between two circles of the same colour: the classic metaball
// connector (after Hiroyuki Sato's Paper.js example). It's pure vector
// geometry, so the canvas preview, the MP4 and the SVG export all draw the
// exact same shape.
//
// `spread` (0–1) is how far up each circle the neck attaches. At 0 the neck
// collapses to a line of zero width, so fading spread to 0 lets a dividing
// cell pinch off without a visible pop.

const HALF_PI = Math.PI / 2;
const HANDLE = 2.4;
// Below this spread a neck is a hairline; skip it rather than draw a thread.
const MIN_SPREAD = 0.05;

// Returns the neck geometry, or null when there's nothing to draw.
export function bridgeGeometry(x1, y1, r1, x2, y2, r2, spread) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  const maxDist = (r1 + r2) * 1.75;
  if (spread <= 0.001 || r1 <= 0 || r2 <= 0 || d < 1e-6) return null;
  if (d > maxDist || d <= Math.abs(r1 - r2)) return null;

  // Spread also fades out toward the reach limit, so necks never snap.
  const v = spread * (1 - smooth(maxDist * 0.7, maxDist, d));
  if (v < MIN_SPREAD) return null;

  let u1 = 0;
  let u2 = 0;
  if (d < r1 + r2) {
    u1 = Math.acos(clampUnit((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d)));
    u2 = Math.acos(clampUnit((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d)));
  }
  const angle = Math.atan2(dy, dx);
  const maxSpread = Math.acos(clampUnit((r1 - r2) / d));

  const a1 = angle + u1 + (maxSpread - u1) * v;
  const a2 = angle - u1 - (maxSpread - u1) * v;
  const a3 = angle + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
  const a4 = angle - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;

  const p1 = polar(x1, y1, a1, r1);
  const p2 = polar(x1, y1, a2, r1);
  const p3 = polar(x2, y2, a3, r2);
  const p4 = polar(x2, y2, a4, r2);

  const total = r1 + r2;
  const handleBase = Math.min(v * HANDLE, Math.hypot(p3.x - p1.x, p3.y - p1.y) / total);
  const handle = handleBase * Math.min(1, (d * 2) / total);
  const h1 = polar(p1.x, p1.y, a1 - HALF_PI, r1 * handle);
  const h2 = polar(p2.x, p2.y, a2 + HALF_PI, r1 * handle);
  const h3 = polar(p3.x, p3.y, a3 + HALF_PI, r2 * handle);
  const h4 = polar(p4.x, p4.y, a4 - HALF_PI, r2 * handle);

  // The outline runs p1 → p3 along one side, through circle 2's centre,
  // p4 → p2 along the other side and back through circle 1's centre. The
  // centre detours stay inside the circles, which are filled anyway.
  const c1 = { x: x1, y: y1 };
  const c2 = { x: x2, y: y2 };
  // Normalise winding to match canvas arc(), so one nonzero fill unions the
  // necks with the circles.
  const area = shoelace([p1, p3, c2, p4, p2, c1]);
  return area >= 0
    ? { start: p1, curves: [[h1, h3, p3], [h4, h2, p2]], via: [c2, c1], mid: p4 }
    : { start: p2, curves: [[h2, h4, p4], [h3, h1, p1]], via: [c2, c1], mid: p3 };
}

// Canvas: appends the neck as a closed subpath on the current path.
export function traceBridge(ctx, g) {
  const [first, second] = g.curves;
  ctx.moveTo(g.start.x, g.start.y);
  ctx.bezierCurveTo(first[0].x, first[0].y, first[1].x, first[1].y, first[2].x, first[2].y);
  ctx.lineTo(g.via[0].x, g.via[0].y);
  ctx.lineTo(g.mid.x, g.mid.y);
  ctx.bezierCurveTo(second[0].x, second[0].y, second[1].x, second[1].y, second[2].x, second[2].y);
  ctx.lineTo(g.via[1].x, g.via[1].y);
  ctx.closePath();
}

// SVG: the same outline as path data.
export function bridgePathData(g, fmt) {
  const [first, second] = g.curves;
  const pt = (p) => `${fmt(p.x)} ${fmt(p.y)}`;
  return (
    `M${pt(g.start)}C${pt(first[0])} ${pt(first[1])} ${pt(first[2])}` +
    `L${pt(g.via[0])}L${pt(g.mid)}` +
    `C${pt(second[0])} ${pt(second[1])} ${pt(second[2])}L${pt(g.via[1])}Z`
  );
}

function polar(x, y, angle, r) {
  return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

function smooth(edge0, edge1, x) {
  const t = clampUnit((x - edge0) / (edge1 - edge0));
  const k = t < 0 ? 0 : t;
  return k * k * (3 - 2 * k);
}

function shoelace(points) {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}
