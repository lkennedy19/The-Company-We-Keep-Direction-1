// Contacts between cells. Overlapping neighbours push each other apart with
// a damped spring, so a newborn cell shoves the cluster outward with a
// little bounce instead of oozing into place. Anything beyond a small slack
// is also corrected directly, so circles never sink visibly into each other.
// Spacing sets the rest distance; negative spacing lets neighbours overlap.
// Contacts fade out in Image mode, where every cell is held by its target.

const K_CONTACT = 320; // spring stiffness, 1/s²
const C_CONTACT = 18; // damping along the contact normal, 1/s
const SLACK = 0.05; // overlap tolerated before a hard correction, × rest distance
const HARD = 0.6; // fraction of the excess overlap removed per step

// How freely a cell moves when pushed: a grabbed cell doesn't move, and
// Magnet's nucleus barely does.
export function mobility(world, cell) {
  if (world.grabbed && world.grabbed.cell === cell) return 0;
  if (cell === world.nucleus) return 1 - 0.9 * world.weights.magnet;
  return 1;
}

export function solveContacts(world, dt) {
  const strength = 1 - world.weights.image;
  if (strength < 0.02) return;
  const gap = world.settings.spacing + 0.35 * world.weights.magnet;
  const cells = world.cells;
  const grid = world.grid;
  const maxR = world.maxR;

  for (let i = 0; i < cells.length; i++) {
    const a = cells[i];
    if (a.dead || a.absorbed) continue;
    const reach = (a.r + maxR) * (1 + Math.max(0, gap)) + 1;
    grid.forEachNear(a.x, a.y, reach, (b, j) => {
      if (j <= i || b.dead || b.absorbed) return;
      if (a.bond && a.bond === b.bond) return;
      const rest = (a.r + b.r) * (1 + gap);
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rest * rest) return;
      let d = Math.sqrt(d2);
      if (d < 1e-6) {
        const angle = world.rng.next() * Math.PI * 2;
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        d = 1e-6;
      } else {
        dx /= d;
        dy /= d;
      }
      const ma = mobility(world, a);
      const mb = mobility(world, b);
      const total = ma + mb;
      if (!total) return;
      const wa = ma / total;
      const wb = mb / total;
      const overlap = rest - d;

      // Spring push plus damping of the closing speed.
      const closing = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
      const impulse = (K_CONTACT * overlap - C_CONTACT * closing) * dt * strength;
      if (impulse > 0) {
        a.vx -= dx * impulse * 2 * wa;
        a.vy -= dy * impulse * 2 * wa;
        b.vx += dx * impulse * 2 * wb;
        b.vy += dy * impulse * 2 * wb;
      }

      const excess = overlap - SLACK * rest;
      if (excess > 0) {
        const push = excess * HARD * strength;
        a.x -= dx * push * wa;
        a.y -= dy * push * wa;
        b.x += dx * push * wb;
        b.y += dy * push * wb;
      }
    });
  }
}
