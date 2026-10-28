// Behaviour forces. Each behaviour is a set of accelerations weighted by
// world.weights, which ease toward the selected behaviour. Switching from
// Fuse to Disperse therefore reads as the body bursting apart, not a cut.
//
// The medium is viscous (strong damping, like cells in fluid), so motion
// settles instead of bouncing.

import { mobility } from './contacts.js';

const K_FUSE = 3.2; // spring toward the anchor, 1/s²
const K_NUCLEUS = 14; // Magnet: nucleus held at the anchor
const MAGNET_PULL = 0.55; // Magnet: constant pull toward the nucleus, × short side per s²
const MAGNET_SWIRL = 0.1; // Magnet: tangential drift, × short side per s²
const K_CENTER = 0.25; // Disperse: weak pull toward the anchor
const K_REPEL = 18; // Disperse: soft-sphere push between neighbours
const K_WALL = 30; // Disperse: keeps centres inside the padded frame
const K_IMAGE = 28; // Image: spring toward each cell's target
const WANDER = 0.35; // Brownian drift, × short side per s², scaled by Life

// The neighbour distance Disperse aims for: a little under hexagonal packing
// of the live cells over the padded frame, so the edge cells aren't squeezed
// out past the walls.
export function disperseSpacing(world) {
  const inset = disperseInset(world);
  const area = Math.max(1, (world.frameW - 2 * inset) * (world.frameH - 2 * inset));
  return 0.95 * Math.sqrt(area / Math.max(1, world.liveCount));
}

// Disperse keeps circles inside the frame with a small margin.
function disperseInset(world) {
  const inset = 0.06 * world.minDim() + 0.9 * world.R;
  return Math.min(inset, 0.45 * world.minDim());
}

export function applyForces(world, dt) {
  const s = world.settings;
  const w = world.weights;
  const minDim = world.minDim();
  const anchor = world.anchor();
  const nucleus = world.nucleus;
  const rect = world.imageRect;
  const pad = disperseInset(world);
  const cells = world.cells;
  const rng = world.rng;

  const wanderAmp = s.life * WANDER * minDim * (1 - 0.7 * w.image);
  const wanderTurn = 2.2 * Math.sqrt(dt);
  const swirl = MAGNET_SWIRL * minDim * (0.4 + s.life);

  for (const c of cells) {
    if (c.dead) continue;
    if (c.absorbed && c.bond) {
      // A cell being absorbed rides along with its survivor; the bond
      // closes the gap between them.
      c.vx = c.bond.a.vx;
      c.vy = c.bond.a.vy;
      continue;
    }
    let ax = 0;
    let ay = 0;

    if (w.fuse > 1e-3) {
      ax += w.fuse * K_FUSE * (anchor.x - c.x);
      ay += w.fuse * K_FUSE * (anchor.y - c.y);
    }

    if (w.magnet > 1e-3 && nucleus) {
      if (c === nucleus) {
        ax += w.magnet * K_NUCLEUS * (anchor.x - c.x);
        ay += w.magnet * K_NUCLEUS * (anchor.y - c.y);
      } else {
        const dx = nucleus.x - c.x;
        const dy = nucleus.y - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const pull = w.magnet * MAGNET_PULL * minDim * Math.min(1, d / (nucleus.r + c.r));
        ax += (dx / d) * pull - (dy / d) * swirl * w.magnet;
        ay += (dy / d) * pull + (dx / d) * swirl * w.magnet;
      }
    }

    if (w.disperse > 1e-3) {
      ax += w.disperse * K_CENTER * (anchor.x - c.x);
      ay += w.disperse * K_CENTER * (anchor.y - c.y);
      if (c.x < pad) ax += w.disperse * K_WALL * (pad - c.x);
      if (c.x > world.frameW - pad) ax += w.disperse * K_WALL * (world.frameW - pad - c.x);
      if (c.y < pad) ay += w.disperse * K_WALL * (pad - c.y);
      if (c.y > world.frameH - pad) ay += w.disperse * K_WALL * (world.frameH - pad - c.y);
    }

    if (w.image > 1e-3 && c.goal && world.imageActive) {
      const gx = rect.x + c.goal.u * rect.w;
      const gy = rect.y + c.goal.v * rect.h;
      ax += w.image * K_IMAGE * (gx - c.x);
      ay += w.image * K_IMAGE * (gy - c.y);
    }

    c.wander += rng.gauss() * wanderTurn;
    ax += Math.cos(c.wander) * wanderAmp;
    ay += Math.sin(c.wander) * wanderAmp;

    c.vx += ax * dt;
    c.vy += ay * dt;
  }

  if (w.disperse > 1e-3) repel(world, dt, disperseSpacing(world), w.disperse);

  const damping = 3.2 * (w.fuse + w.magnet) + 2.6 * w.disperse + 8 * w.image;
  const decay = Math.exp(-damping * dt);
  const maxSpeed = 2.5 * minDim;
  for (const c of cells) {
    if (c.dead) continue;
    c.vx *= decay;
    c.vy *= decay;
    const speed = Math.hypot(c.vx, c.vy);
    if (speed > maxSpeed) {
      c.vx *= maxSpeed / speed;
      c.vy *= maxSpeed / speed;
    }
    c.x += c.vx * dt;
    c.y += c.vy * dt;
  }

  const grab = world.grabbed;
  if (grab && !grab.cell.dead) {
    const c = grab.cell;
    const follow = Math.min(1, dt * 25);
    c.x += (grab.x - c.x) * follow;
    c.y += (grab.y - c.y) * follow;
    c.vx = 0;
    c.vy = 0;
  }
}

// Soft-sphere repulsion: neighbours closer than `spacing` push apart, with
// no force beyond it. Together with the walls this spreads cells evenly
// without snapping them to a lattice.
function repel(world, dt, spacing, weight) {
  const cells = world.cells;
  const grid = world.grid;
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    if (a.dead || a.absorbed) continue;
    grid.forEachNear(a.x, a.y, spacing, (b, j) => {
      if (j <= i || b.dead || b.absorbed) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= spacing * spacing || d2 < 1e-9) return;
      const d = Math.sqrt(d2);
      const f = weight * K_REPEL * spacing * (1 - d / spacing) * dt;
      const ma = mobility(world, a);
      const mb = mobility(world, b);
      a.vx -= (dx / d) * f * ma;
      a.vy -= (dy / d) * f * ma;
      b.vx += (dx / d) * f * mb;
      b.vy += (dy / d) * f * mb;
    });
  }
}
