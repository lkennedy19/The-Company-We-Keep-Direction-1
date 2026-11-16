// Uniform bucket grid, rebuilt every step with a counting sort into flat
// typed arrays. Keeps neighbour queries cheap with thousands of cells.
// Items outside the bounds are clamped into the edge buckets, and queries
// clamp the same way, so nothing is ever missed, only scanned less cheaply.

const MAX_SIDE = 256;

export class SpatialGrid {
  constructor() {
    this.items = [];
    this.start = new Int32Array(1);
    this.cursor = new Int32Array(1);
    this.keys = new Int32Array(0);
    this.order = new Int32Array(0);
    this.cols = 1;
    this.rows = 1;
  }

  rebuild(items, size, x0, y0, x1, y1) {
    this.items = items;
    this.x0 = x0;
    this.y0 = y0;
    this.cols = clampInt(Math.ceil((x1 - x0) / size), 1, MAX_SIDE);
    this.rows = clampInt(Math.ceil((y1 - y0) / size), 1, MAX_SIDE);
    this.sizeX = (x1 - x0) / this.cols;
    this.sizeY = (y1 - y0) / this.rows;

    const buckets = this.cols * this.rows;
    if (this.start.length < buckets + 1) {
      this.start = new Int32Array(buckets + 1);
      this.cursor = new Int32Array(buckets + 1);
    } else {
      this.start.fill(0, 0, buckets + 1);
    }
    const n = items.length;
    if (this.keys.length < n) {
      this.keys = new Int32Array(n * 2);
      this.order = new Int32Array(n * 2);
    }

    for (let i = 0; i < n; i++) {
      const key = this.keyOf(items[i].x, items[i].y);
      this.keys[i] = key;
      this.start[key + 1]++;
    }
    for (let b = 0; b < buckets; b++) this.start[b + 1] += this.start[b];
    this.cursor.set(this.start.subarray(0, buckets));
    for (let i = 0; i < n; i++) this.order[this.cursor[this.keys[i]]++] = i;
  }

  col(x) {
    return clampInt(Math.floor((x - this.x0) / this.sizeX), 0, this.cols - 1);
  }

  row(y) {
    return clampInt(Math.floor((y - this.y0) / this.sizeY), 0, this.rows - 1);
  }

  keyOf(x, y) {
    return this.row(y) * this.cols + this.col(x);
  }

  // Calls fn(item, index) for every item in buckets overlapping the square
  // of half-size `radius` around (x, y). Callers do their own exact distance test.
  forEachNear(x, y, radius, fn) {
    const c0 = this.col(x - radius);
    const c1 = this.col(x + radius);
    const r0 = this.row(y - radius);
    const r1 = this.row(y + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const key = r * this.cols + c;
        for (let j = this.start[key]; j < this.start[key + 1]; j++) {
          const index = this.order[j];
          fn(this.items[index], index);
        }
      }
    }
  }
}

function clampInt(v, min, max) {
  return v < min ? min : v > max ? max : v;
}
