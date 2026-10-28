// Division and fusion. Raising the count makes cells divide: a daughter is
// born inside its parent, the pair stretches, pinches and separates. Lowering
// it makes neighbours fuse: two cells drift together and one absorbs the
// other. Only "mature" cells take part, so a big jump (1 → 22) cascades like
// a chain reaction (1 → 2 → 4 → 8 …) instead of happening all at once.

import { lerp, easeInOut } from '../math.js';
import { mobility } from './contacts.js';
import { splitGroup } from './image-targets.js';

// Expected delay before an eligible cell starts dividing/fusing (~70 ms), so
// simultaneous events stagger organically rather than firing on one frame.
const START_RATE = 14;
const BOND_STIFFNESS = 0.4;

export function isIdle(world, cell) {
  return (
    !cell.dead &&
    !cell.absorbed &&
    !cell.bond &&
    cell.absorbing === 0 &&
    world.time >= cell.readyAt &&
    !(world.grabbed && world.grabbed.cell === cell)
  );
}

function maturity(world) {
  const base = lerp(0.7, 0.15, world.settings.tempo) * world.rng.range(0.7, 1.35);
  return world.imageActive ? base * 0.6 : base;
}

export function scheduleLifecycle(world, dt) {
  if (world.imageActive) scheduleImage(world, dt);
  else scheduleCount(world, dt);
}

function scheduleCount(world, dt) {
  const diff = world.targetCount - world.liveCount;
  if (!diff) return;
  const chance = 1 - Math.exp(-dt * START_RATE);
  const candidates = world.rng.shuffle(world.cells.filter((c) => isIdle(world, c)));
  let budget = Math.abs(diff);
  for (const cell of candidates) {
    if (budget <= 0) break;
    if (!isIdle(world, cell) || world.rng.next() > chance) continue;
    if (diff > 0) {
      divide(world, cell);
      budget--;
    } else {
      const partner = findPartner(world, cell, true);
      if (!partner) continue;
      // The older cell survives, so Magnet's nucleus is never absorbed.
      if (cell.id < partner.id) fuse(world, cell, partner, true);
      else fuse(world, partner, cell, true);
      budget--;
    }
  }
}

function scheduleImage(world, dt) {
  const chance = 1 - Math.exp(-dt * START_RATE * 1.5);
  const cells = world.cells;
  const n = cells.length;
  for (let i = 0; i < n; i++) {
    const cell = cells[i];
    if (!isIdle(world, cell) || world.rng.next() > chance) continue;
    if (cell.pending && cell.pending.length) {
      splitGroup(world, cell);
    } else if (cell.orphan) {
      const partner = findPartner(world, cell, false);
      if (partner) fuse(world, partner, cell, partner.orphan);
    }
  }
}

// Nearest cell that can take part in a fusion with `cell`. Prefers a
// same-coloured neighbour when one is nearly as close, and in Image mode
// prefers cells that belong to the image over other leftovers.
function findPartner(world, cell, idleOnly) {
  const colour = world.colourFor(cell);
  let best = null;
  let bestD = Infinity;
  let bestMatch = null;
  let bestMatchD = Infinity;

  const consider = (other) => {
    if (other === cell || other.dead || other.absorbed) return;
    if (idleOnly ? !isIdle(world, other) : other.bond) return;
    const d = Math.hypot(other.x - cell.x, other.y - cell.y);
    if (d < bestD) {
      best = other;
      bestD = d;
    }
    const matches = world.imageActive ? !other.orphan : world.colourFor(other) === colour;
    if (matches && d < bestMatchD) {
      bestMatch = other;
      bestMatchD = d;
    }
  };

  world.grid.forEachNear(cell.x, cell.y, (cell.r + world.maxR) * 3, consider);
  if (!best) for (const other of world.cells) consider(other);
  if (bestMatch && bestMatchD <= bestD * (world.imageActive ? 2 : 1.6)) return bestMatch;
  return best;
}

export function divide(world, parent, angle = world.rng.range(0, Math.PI * 2)) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const child = world.createCell(parent.x, parent.y, parent.r, parent.ci + 1);
  child.lock = parent.lock;
  child.rgb = parent.rgb.slice();
  // A daughter of a different colour starts in that colour at once; the
  // scene draws it under its parent so it emerges rather than blends.
  if (world.colourFor(child) !== world.colourFor(parent)) child.rgb = world.colourRgb(child);
  child.vx = parent.vx;
  child.vy = parent.vy;
  child.wander = parent.wander + Math.PI;
  const nudge = Math.max(0.5, parent.r * 0.02);
  parent.x -= ux * nudge;
  parent.y -= uy * nudge;
  child.x += ux * nudge;
  child.y += uy * nudge;

  const bond = {
    type: 'divide',
    a: parent,
    b: child,
    t: 0,
    ux,
    uy,
    duration: lerp(1.15, 0.4, world.settings.tempo) * world.rng.range(0.85, 1.2) * (world.imageActive ? 0.7 : 1),
  };
  parent.bond = bond;
  child.bond = bond;
  world.bonds.push(bond);
  world.cells.push(child);
  world.liveCount++;
  return child;
}

// `absorbed` is drawn into `survivor` and disappears once fully inside it.
// When `mutual`, both travel to meet halfway; otherwise the survivor mostly
// keeps its own course (used when it already has a place in an image).
export function fuse(world, survivor, absorbed, mutual) {
  const d0 = Math.hypot(absorbed.x - survivor.x, absorbed.y - survivor.y);
  const travel = Math.min(4, d0 / Math.max(1, 2 * world.R));
  const bond = {
    type: 'fuse',
    a: survivor,
    b: absorbed,
    t: 0,
    d0,
    mutual,
    duration: lerp(1.2, 0.4, world.settings.tempo) * world.rng.range(0.85, 1.2) * (1 + 0.25 * travel),
  };
  absorbed.absorbed = true;
  absorbed.bond = bond;
  survivor.absorbing++;
  world.bonds.push(bond);
  world.liveCount--;
}

export function advanceBonds(world, dt) {
  const keep = [];
  const gap = Math.max(-0.3, world.settings.spacing);
  for (const bond of world.bonds) {
    const { a, b } = bond;
    bond.t = Math.min(1, bond.t + dt / bond.duration);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);

    if (bond.type === 'divide') {
      if (d > 1e-6) {
        bond.ux = dx / d;
        bond.uy = dy / d;
      }
      const rest = (a.r + b.r) * (1 + gap) * easeInOut(bond.t);
      const correction = (rest - d) * BOND_STIFFNESS;
      const ma = mobility(world, a);
      const mb = mobility(world, b);
      const total = ma + mb || 1;
      a.x -= bond.ux * correction * (ma / total);
      a.y -= bond.uy * correction * (ma / total);
      b.x += bond.ux * correction * (mb / total);
      b.y += bond.uy * correction * (mb / total);
      if (bond.t >= 1) {
        a.bond = null;
        b.bond = null;
        a.readyAt = world.time + maturity(world);
        b.readyAt = world.time + maturity(world);
        continue;
      }
    } else {
      if (a.dead) {
        // The survivor vanished (e.g. it was itself absorbed); let go.
        b.absorbed = false;
        b.bond = null;
        world.liveCount++;
        continue;
      }
      const rest = bond.t >= 1 ? 0 : bond.d0 * (1 - easeInOut(bond.t));
      if (d > rest && d > 1e-6) {
        const correction = (d - rest) * (bond.t >= 1 ? 0.3 : BOND_STIFFNESS);
        const wa = bond.mutual ? 0.5 * mobility(world, a) : 0.1;
        a.x += (dx / d) * correction * wa;
        a.y += (dy / d) * correction * wa;
        b.x -= (dx / d) * correction * (1 - wa);
        b.y -= (dy / d) * correction * (1 - wa);
      }
      if (bond.t >= 1 && d <= Math.max(1, 0.12 * a.r)) {
        b.dead = true;
        world.anyDead = true;
        a.absorbing--;
        if (!a.absorbing) a.readyAt = world.time + maturity(world);
        continue;
      }
    }
    keep.push(bond);
  }
  world.bonds = keep;
}
