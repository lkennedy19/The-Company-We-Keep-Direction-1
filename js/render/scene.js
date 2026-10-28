// Turns the world into a flat description of what to draw. The canvas and
// SVG renderers both consume it, so the preview, the MP4 and the SVG export
// always match.

import { FRAME_BACKGROUND, PALETTE } from '../config.js';
import { rgbToHex } from '../colour.js';
import { smoothstep } from '../math.js';
import { bridgeGeometry } from './bridge.js';

// How far up each circle a neck attaches at its fullest (0–1).
const NECK = 0.5;

export function buildScene(world) {
  const s = world.settings;
  const minDim = world.minDim();
  const groups = new Map();
  const dotted = [];
  const info = new Map();

  // Two layers: "under" holds cells sliding beneath another (being absorbed,
  // or a different-coloured daughter emerging from its parent), so colours
  // never blend into off-palette mixes.
  const groupFor = (hex, under = false) => {
    const key = `${under ? 'u' : 'm'}${hex}`;
    let group = groups.get(key);
    if (!group) {
      group = { hex, under, circles: [], bridges: [], pores: [] };
      groups.set(key, group);
    }
    return group;
  };

  for (const c of world.cells) {
    if (c.dead || c.r < 0.05) continue;
    const hex = rgbToHex(c.rgb);
    const solid = s.style === 'solid' || (s.style === 'mixed' && c === world.nucleus);
    const circle = { x: c.x, y: c.y, r: c.r, hex };
    if (solid) groupFor(hex, isUnder(world, c)).circles.push(circle);
    else dotted.push(circle);
    info.set(c, { hex, solid });
  }

  // Necks for same-coloured cells mid-division (thinning out as they
  // separate) and mid-fusion (thickening as they meet). Cells of different
  // colours slide over/under each other instead.
  for (const bond of world.bonds) {
    const a = info.get(bond.a);
    const b = info.get(bond.b);
    if (!a || !b || !a.solid || !b.solid) continue;
    if (world.colourFor(bond.a) !== world.colourFor(bond.b)) continue;
    const dividing = bond.type === 'divide';
    const spread = dividing ? NECK * (1 - smoothstep(0.55, 1, bond.t)) : NECK * smoothstep(0, 0.45, bond.t);
    const g = bridgeGeometry(bond.a.x, bond.a.y, bond.a.r, bond.b.x, bond.b.y, bond.b.r, spread);
    if (g) groupFor(a.hex).bridges.push(g);
  }

  if (s.goo > 0.01) addRestingNecks(world, info, groupFor, s.goo);

  return {
    width: world.frameW,
    height: world.frameH,
    background: FRAME_BACKGROUND,
    groups: orderGroups(groups),
    dotted,
    dot: { size: Math.max(2, minDim * 0.0042), gap: minDim * 0.0115 },
  };
}

function isUnder(world, cell) {
  const bond = cell.bond;
  if (!bond) return false;
  if (cell.absorbed) return true;
  return bond.type === 'divide' && bond.b === cell && world.colourFor(cell) !== world.colourFor(bond.a);
}

// Goo: neighbours of the same colour that sit close together share a neck,
// so a resting cluster reads as tissue rather than separate discs. Once goo
// is high, the small pore left between three touching cells is filled too.
function addRestingNecks(world, info, groupFor, goo) {
  const cells = world.cells;
  const reachFactor = 1 + 0.5 * goo;
  const fillPores = goo > 0.5;
  const touching = new Map();
  const touch = (a, b) => {
    if (!touching.has(a)) touching.set(a, new Set());
    touching.get(a).add(b);
  };

  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    const ai = info.get(a);
    if (!ai || !ai.solid || a.absorbed) continue;
    world.grid.forEachNear(a.x, a.y, (a.r + world.maxR) * reachFactor + 2, (b, j) => {
      if (j <= i || b.absorbed) return;
      const bi = info.get(b);
      if (!bi || !bi.solid || bi.hex !== ai.hex) return;
      if (a.bond && a.bond === b.bond) return;
      const contact = a.r + b.r;
      const reach = contact * reachFactor;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d > reach) return;
      // Full neck while touching, gone by the edge of reach.
      const spread = NECK * goo * (1 - smoothstep(contact, reach, d));
      const g = bridgeGeometry(a.x, a.y, a.r, b.x, b.y, b.r, spread);
      if (g) groupFor(ai.hex).bridges.push(g);
      if (fillPores && d <= contact * 1.04) {
        touch(a, b);
        touch(b, a);
      }
    });
  }

  for (const [a, neighbours] of touching) {
    for (const b of neighbours) {
      if (b.id <= a.id) continue;
      for (const c of neighbours) {
        if (c.id <= b.id || !touching.get(b)?.has(c)) continue;
        groupFor(info.get(a).hex).pores.push(clockwise(a, b, c));
      }
    }
  }
}

// Triangle corners ordered to match canvas arc() winding (see bridge.js).
function clockwise(a, b, c) {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const pts = [{ x: a.x, y: a.y }, { x: b.x, y: b.y }, { x: c.x, y: c.y }];
  return cross >= 0 ? pts : [pts[0], pts[2], pts[1]];
}

// The under layer first, then brand colours in palette order; in-between
// colours (cells easing to a new colour) draw last.
function orderGroups(groups) {
  return [...groups.values()].sort(
    (p, q) => Number(q.under) - Number(p.under) || rank(p.hex) - rank(q.hex) || (p.hex < q.hex ? -1 : 1),
  );
}

function rank(hex) {
  const i = PALETTE.indexOf(hex);
  return i < 0 ? PALETTE.length : i;
}

// Evenly spaced dots around a circle: the dash step that fits a whole
// number of dots, so the pattern never shows a seam.
export function dotStep(r, gap) {
  const circumference = 2 * Math.PI * r;
  const count = Math.max(6, Math.round(circumference / gap));
  return circumference / count;
}
