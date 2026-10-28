// Contact resolution: overlapping cells are pushed apart along the line
// between their centres (position-based, two relaxation passes). Spacing
// sets the rest distance; negative spacing lets neighbours overlap.
// Contacts fade out in Image mode, where every cell is held by its target.

const STIFFNESS = 0.5;
const PASSES = 2;

// How freely a cell moves when pushed: a grabbed cell doesn't move, and
// Magnet's nucleus barely does.
export function mobility(world, cell) {
  if (world.grabbed && world.grabbed.cell === cell) return 0;
  if (cell === world.nucleus) return 1 - 0.9 * world.weights.magnet;
  return 1;
}

export function solveContacts(world) {
  const strength = 1 - world.weights.image;
  if (strength < 0.02) return;
  const gap = world.settings.spacing + 0.35 * world.weights.magnet;
  const cells = world.cells;
  const grid = world.grid;
  const maxR = world.maxR;

  for (let pass = 0; pass < PASSES; pass++) {
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
        const push = (rest - d) * STIFFNESS * strength;
        a.x -= dx * push * (ma / total);
        a.y -= dy * push * (ma / total);
        b.x += dx * push * (mb / total);
        b.y += dy * push * (mb / total);
      });
    }
  }
}
