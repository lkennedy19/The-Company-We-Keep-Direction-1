// Image mode: matching cells to stipple points.
//
// Targets are { u, v, rho, rn } in normalised image space (u, v in 0–1,
// rn = radius as a fraction of the image width), placed in the frame through
// world.imageRect. With more targets than cells, each cell claims its nearest
// target and the leftovers become that cell's "pending" group, which it hands
// out by dividing: the group splits in half along its longer side, one half
// per daughter, until every cell holds one target. The picture grows out of
// the cells like tissue rather than popping in. With fewer targets than
// cells, the unmatched cells become orphans and fuse into their neighbours.

import { PointIndex } from './point-index.js';
import { divide } from './lifecycle.js';

export function assignImageTargets(world, targets) {
  const rect = world.imageRect;
  const live = world.cells.filter((c) => !c.dead && !c.absorbed);
  for (const c of live) {
    c.target = null;
    c.pending = null;
    c.goal = null;
    c.orphan = false;
  }
  const n = targets.length;
  if (!n || !live.length) return 1;

  const tx = new Float64Array(n);
  const ty = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    tx[i] = rect.x + targets[i].u * rect.w;
    ty[i] = rect.y + targets[i].v * rect.h;
  }
  const cx = new Float64Array(live.length);
  const cy = new Float64Array(live.length);
  live.forEach((c, i) => {
    cx[i] = c.x;
    cy[i] = c.y;
  });
  const area = Math.max(1, rect.w * rect.h);

  if (n >= live.length) {
    const free = new PointIndex(tx, ty, n, 2 * Math.sqrt(area / n));
    for (const c of world.rng.shuffle(live.slice())) {
      const i = free.nearest(c.x, c.y);
      if (i < 0) break;
      free.remove(i);
      c.target = targets[i];
    }
    const owners = new PointIndex(cx, cy, live.length, 2 * Math.sqrt(area / live.length));
    for (let i = 0; i < n; i++) {
      if (!free.removed[i]) {
        const owner = live[owners.nearest(tx[i], ty[i])];
        (owner.pending ||= []).push(targets[i]);
      }
    }
  } else {
    const available = new PointIndex(cx, cy, live.length, 2 * Math.sqrt(area / live.length));
    const order = world.rng.shuffle(Array.from({ length: n }, (_, i) => i));
    for (const i of order) {
      const k = available.nearest(tx[i], ty[i]);
      if (k < 0) break;
      available.remove(k);
      live[k].target = targets[i];
    }
    for (const c of live) if (!c.target) c.orphan = true;
  }

  for (const c of live) setGoal(c);

  // Generations the cascade needs: how often the largest group must halve,
  // or how often the cell count must halve to shed the orphans.
  let largest = 1;
  for (const c of live) if (c.pending) largest = Math.max(largest, c.pending.length + 1);
  return n >= live.length ? Math.max(1, Math.ceil(Math.log2(largest))) : Math.max(1, Math.ceil(Math.log2(live.length / n)));
}

// Divides `cell` and shares its group of targets between the two halves.
export function splitGroup(world, cell) {
  const rect = world.imageRect;
  const group = [cell.target, ...cell.pending];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const t of group) {
    const x = t.u * rect.w;
    const y = t.v * rect.h;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const alongX = maxX - minX >= maxY - minY;
  group.sort(alongX ? (p, q) => p.u - q.u : (p, q) => p.v - q.v);
  const half = Math.ceil(group.length / 2);
  const first = group.slice(0, half);
  const second = group.slice(half);
  const c1 = centroid(first);
  const c2 = centroid(second);
  const angle = Math.atan2((c2.v - c1.v) * rect.h, (c2.u - c1.u) * rect.w);
  const child = divide(world, cell, angle);
  assignGroup(cell, first);
  assignGroup(child, second);
}

function assignGroup(cell, group) {
  const c = centroid(group);
  let rep = 0;
  let bestD = Infinity;
  group.forEach((t, i) => {
    const d = (t.u - c.u) ** 2 + (t.v - c.v) ** 2;
    if (d < bestD) {
      bestD = d;
      rep = i;
    }
  });
  cell.target = group[rep];
  cell.pending = group.length > 1 ? group.filter((_, i) => i !== rep) : null;
  cell.orphan = false;
  setGoal(cell);
}

// A cell heads for the middle of its group while it still has targets to
// hand out, then for its own target.
function setGoal(cell) {
  if (cell.pending && cell.pending.length) {
    cell.goal = centroid([cell.target, ...cell.pending]);
  } else if (cell.target) {
    cell.goal = { u: cell.target.u, v: cell.target.v };
  } else {
    cell.goal = null;
  }
}

function centroid(group) {
  let u = 0;
  let v = 0;
  for (const t of group) {
    u += t.u;
    v += t.v;
  }
  return { u: u / group.length, v: v / group.length };
}
