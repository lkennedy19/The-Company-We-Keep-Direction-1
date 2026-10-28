// Nearest-point lookup over a fixed point set, with removal. Used once per
// image re-target to match cells to stipple points, so it favours simplicity:
// bucketed points, lazy deletion, and an expanding ring search.

export class PointIndex {
  constructor(xs, ys, count, size) {
    this.xs = xs;
    this.ys = ys;
    this.removed = new Uint8Array(count);
    this.remaining = count;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i];
      if (ys[i] > maxY) maxY = ys[i];
    }
    if (!count) minX = minY = maxX = maxY = 0;

    this.size = Math.max(size, 1e-6);
    this.x0 = minX;
    this.y0 = minY;
    this.cols = Math.min(512, Math.floor((maxX - minX) / this.size) + 1);
    this.rows = Math.min(512, Math.floor((maxY - minY) / this.size) + 1);
    this.sizeX = Math.max((maxX - minX) / this.cols, 1e-6) * 1.000001;
    this.sizeY = Math.max((maxY - minY) / this.rows, 1e-6) * 1.000001;
    this.buckets = Array.from({ length: this.cols * this.rows }, () => []);
    for (let i = 0; i < count; i++) this.buckets[this.key(this.col(xs[i]), this.row(ys[i]))].push(i);
  }

  col(x) {
    return Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.x0) / this.sizeX)));
  }

  row(y) {
    return Math.max(0, Math.min(this.rows - 1, Math.floor((y - this.y0) / this.sizeY)));
  }

  key(c, r) {
    return r * this.cols + c;
  }

  remove(i) {
    if (!this.removed[i]) {
      this.removed[i] = 1;
      this.remaining--;
    }
  }

  // Index of the nearest point not yet removed, or -1 when none remain.
  nearest(x, y) {
    if (this.remaining <= 0) return -1;
    const cx = this.col(x);
    const cy = this.row(y);
    const cell = Math.min(this.sizeX, this.sizeY);
    const maxRing = Math.max(this.cols, this.rows);
    let best = -1;
    let bestD2 = Infinity;
    for (let ring = 0; ring <= maxRing; ring++) {
      // Anything in ring k is at least (k - 1) cells away.
      if (best >= 0) {
        const reach = (ring - 1) * cell;
        if (reach > 0 && reach * reach > bestD2) break;
      }
      for (let r = cy - ring; r <= cy + ring; r++) {
        if (r < 0 || r >= this.rows) continue;
        const edgeRow = r === cy - ring || r === cy + ring;
        for (let c = cx - ring; c <= cx + ring; c++) {
          if (c < 0 || c >= this.cols) continue;
          if (!edgeRow && c !== cx - ring && c !== cx + ring) continue;
          const bucket = this.buckets[this.key(c, r)];
          for (let j = 0; j < bucket.length; j++) {
            const i = bucket[j];
            if (this.removed[i]) continue;
            const dx = this.xs[i] - x;
            const dy = this.ys[i] - y;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestD2) {
              bestD2 = d2;
              best = i;
            }
          }
        }
      }
    }
    return best;
  }
}
