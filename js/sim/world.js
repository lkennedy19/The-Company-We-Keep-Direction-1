// The cell world: positions, radii, colours, and the bonds that animate a
// division or a fusion. Settings are read live every step, so any control
// change becomes motion rather than a cut.
//
// Units are frame pixels (e.g. 0–1920 × 0–1080) and seconds.

import { createRng } from '../rng.js';
import { hexToRgb, easeRgb, rgbToHex } from '../colour.js';
import { PALETTE } from '../config.js';
import { TAU, lerp } from '../math.js';
import { SpatialGrid } from './spatial-grid.js';
import { applyForces, disperseSpacing } from './forces.js';
import { solveContacts } from './contacts.js';
import { scheduleLifecycle, advanceBonds, generationTime, generationsBetween } from './lifecycle.js';
import { assignImageTargets } from './image-targets.js';

const STEP = 1 / 60;
// Radius spring: cells settle into a new size with a slight overshoot, so a
// change in count reads as a springy breath rather than a slow ease.
const RADIUS_DAMPING = 0.55;
const MODES = ['fuse', 'disperse', 'magnet', 'image'];
const rgbCache = new Map();

function cachedRgb(hex) {
  let rgb = rgbCache.get(hex);
  if (!rgb) {
    rgb = hexToRgb(hex);
    rgbCache.set(hex, rgb);
  }
  return rgb;
}

export class World {
  constructor(settings, { seed = settings.seed, startCount = 1 } = {}) {
    this.settings = settings;
    this.rng = createRng(seed);
    this.time = 0;
    this.nextId = 0;
    this.cells = [];
    this.bonds = [];
    this.grid = new SpatialGrid();
    this.mode = settings.behaviour;
    this.weights = Object.fromEntries(MODES.map((m) => [m, m === this.mode ? 1 : 0]));
    this.targetCount = settings.count;
    this.genTime = generationTime(settings, 1);
    this.image = null;
    this.imageActive = false;
    this.imageRect = { x: 0, y: 0, w: 1, h: 1 };
    this.grabbed = null;
    this.frameW = settings.frame.w;
    this.frameH = settings.frame.h;
    this.anyDead = false;
    this.liveCount = 0;
    this.maxR = 0;
    this.nucleus = null;
    this.seedCells(startCount);
  }

  // Scatters `n` cells loosely around the anchor. They then relax into
  // whatever the current behaviour asks for.
  seedCells(n) {
    const a = this.anchor();
    const R = this.baseRadius(n);
    for (let i = 0; i < n; i++) {
      const angle = this.rng.range(0, TAU);
      const dist = n === 1 ? 0 : Math.sqrt(this.rng.next()) * R * Math.sqrt(n) * 1.2;
      this.cells.push(this.createCell(a.x + Math.cos(angle) * dist, a.y + Math.sin(angle) * dist, R, i));
    }
    this.liveCount = this.cells.length;
    this.R = R;
    this.maxR = R;
  }

  anchor() {
    return { x: this.settings.anchor.x * this.frameW, y: this.settings.anchor.y * this.frameH };
  }

  minDim() {
    return Math.min(this.frameW, this.frameH);
  }

  baseRadius(n) {
    const s = this.settings;
    return 0.5 * s.size * this.minDim() * Math.pow(Math.max(1, n), -s.shrink);
  }

  createCell(x, y, r, ci) {
    const cell = {
      id: this.nextId++,
      x,
      y,
      qx: x,
      qy: y,
      vx: 0,
      vy: 0,
      r,
      rv: 0,
      ci,
      lock: null,
      rgb: null,
      hex: '',
      easing: false,
      jitter: this.rng.range(-1, 1),
      wander: this.rng.range(0, TAU),
      phase: this.rng.range(0, TAU),
      readyAt: this.time,
      bond: null,
      absorbing: 0,
      absorbed: false,
      dead: false,
      target: null,
      pending: null,
      goal: null,
      orphan: false,
    };
    cell.hex = this.colourFor(cell);
    cell.rgb = cachedRgb(cell.hex).slice();
    return cell;
  }

  colourFor(cell) {
    if (cell.lock) return cell.lock;
    const list = this.settings.colours.length ? this.settings.colours : PALETTE.slice(0, 1);
    const k = list.length;
    return list[((cell.ci % k) + k) % k];
  }

  colourRgb(cell) {
    return cachedRgb(this.colourFor(cell)).slice();
  }

  isLive(cell) {
    return !cell.dead && !cell.absorbed;
  }

  setCount(n) {
    this.targetCount = Math.max(1, Math.round(n));
    this.genTime = generationTime(this.settings, generationsBetween(this.countLive(), this.targetCount));
  }

  // `image` is { aspect, targets: [{ u, v, rho, rn }] } in normalised image
  // space; see js/image/image-lab.js.
  setImage(image) {
    this.image = image;
    this.updateImageRect();
    if (this.mode === 'image') this.retarget();
  }

  // Matches cells to the current image and sizes the cascade to it.
  retarget() {
    const generations = assignImageTargets(this, this.image.targets);
    this.genTime = generationTime(this.settings, generations);
  }

  advance(dt) {
    let remaining = Math.min(dt, 0.25);
    while (remaining > 1e-6) {
      const h = Math.min(STEP, remaining);
      this.step(h);
      remaining -= h;
    }
  }

  step(dt) {
    this.time += dt;
    this.syncFrame();
    this.syncMode();
    this.blendWeights(dt);
    this.updateImageRect();
    this.liveCount = this.countLive();
    scheduleLifecycle(this, dt);
    this.liveCount = this.countLive();
    this.R = this.baseRadius(this.liveCount);
    this.nucleus = this.cells.find((c) => this.isLive(c)) || null;
    this.updateAppearance(dt);
    this.rebuildGrid();
    applyForces(this, dt);
    advanceBonds(this, dt);
    this.solveContactsCarryingAbsorbed(dt);
    if (this.anyDead) {
      this.cells = this.cells.filter((c) => !c.dead);
      this.anyDead = false;
    }
  }

  // Contacts push a survivor around but skip the cell it is absorbing, so the
  // absorbed cell is carried by the same displacement. Only the fusion bond
  // changes the distance between them, which lets every fusion finish.
  solveContactsCarryingAbsorbed(dt) {
    for (const c of this.cells) {
      c.qx = c.x;
      c.qy = c.y;
    }
    solveContacts(this, dt);
    for (const bond of this.bonds) {
      if (bond.type !== 'fuse') continue;
      bond.b.x += bond.a.x - bond.a.qx;
      bond.b.y += bond.a.y - bond.a.qy;
    }
  }

  countLive() {
    let n = 0;
    for (const c of this.cells) if (!c.dead && !c.absorbed) n++;
    return n;
  }

  syncFrame() {
    const { w, h } = this.settings.frame;
    if (w === this.frameW && h === this.frameH) return;
    const sx = w / this.frameW;
    const sy = h / this.frameH;
    for (const c of this.cells) {
      c.x *= sx;
      c.y *= sy;
    }
    this.frameW = w;
    this.frameH = h;
  }

  syncMode() {
    const next = this.settings.behaviour;
    if (next !== this.mode) {
      const leavingImage = this.mode === 'image';
      this.mode = next;
      if (next === 'image' && this.image) {
        this.updateImageRect();
        this.retarget();
      } else if (leavingImage) {
        for (const c of this.cells) {
          c.target = null;
          c.pending = null;
          c.goal = null;
          c.orphan = false;
        }
      }
    }
    this.imageActive = this.mode === 'image' && !!this.image;
  }

  blendWeights(dt) {
    const rate = 1 - Math.exp(-dt * 2.2);
    for (const m of MODES) {
      const goal = m === this.mode ? 1 : 0;
      this.weights[m] += (goal - this.weights[m]) * rate;
    }
  }

  updateImageRect() {
    if (!this.image) return;
    const { scale } = this.settings.image;
    const a = this.anchor();
    const aspect = this.image.aspect;
    let w;
    let h;
    if (aspect > this.frameH / this.frameW) {
      h = this.frameH * scale;
      w = h / aspect;
    } else {
      w = this.frameW * scale;
      h = w * aspect;
    }
    this.imageRect = { x: a.x - w / 2, y: a.y - h / 2, w, h };
  }

  updateAppearance(dt) {
    const s = this.settings;
    const omega = lerp(9, 18, s.tempo);
    const stiffness = omega * omega;
    const damping = 2 * RADIUS_DAMPING * omega;
    const colourRate = 1 - Math.exp(-dt * 5);
    const pulse = 0.03 * s.life;
    const rect = this.imageRect;
    let maxR = 0;
    for (const c of this.cells) {
      if (c.dead) continue;
      let goal = c.target && this.imageActive
        ? c.target.rn * rect.w
        : this.R * Math.pow(2, s.variety * 1.3 * c.jitter);
      goal *= 1 + pulse * Math.sin(this.time * 1.9 + c.phase);
      const bond = c.bond;
      if (c.absorbed && bond) goal = Math.min(goal, bond.a.r * 0.92);
      c.rv += (stiffness * (goal - c.r) - damping * c.rv) * dt;
      c.r = Math.max(0, c.r + c.rv * dt);
      if (c.r > maxR) maxR = c.r;

      // Cells keep their own colour through divisions and fusions (no muddy
      // in-between mixes); only recolouring eases from one colour to another.
      // The hex string is only rebuilt while a colour is actually changing.
      const targetHex = this.colourFor(c);
      if (c.hex !== targetHex || c.easing) {
        const target = cachedRgb(targetHex);
        easeRgb(c.rgb, target, colourRate);
        const settled = Math.abs(c.rgb[0] - target[0]) + Math.abs(c.rgb[1] - target[1]) + Math.abs(c.rgb[2] - target[2]) < 1.5;
        if (settled) c.rgb = target.slice();
        c.easing = !settled;
        c.hex = settled ? targetHex : rgbToHex(c.rgb);
      }
    }
    this.maxR = maxR;
  }

  rebuildGrid() {
    const s = this.settings;
    const contactReach = 2 * this.maxR * (1 + Math.max(0, s.spacing) + 0.35 * this.weights.magnet);
    const repelReach = this.weights.disperse > 0.01 ? disperseSpacing(this) : 0;
    const size = Math.max(contactReach, repelReach, this.minDim() / 200);
    const padX = this.frameW * 0.25;
    const padY = this.frameH * 0.25;
    this.grid.rebuild(this.cells, size, -padX, -padY, this.frameW + padX, this.frameH + padY);
  }

  // --- Pointer interaction -------------------------------------------------

  hitTest(x, y) {
    for (let i = this.cells.length - 1; i >= 0; i--) {
      const c = this.cells[i];
      if (!this.isLive(c)) continue;
      const dx = x - c.x;
      const dy = y - c.y;
      if (dx * dx + dy * dy <= c.r * c.r) return c;
    }
    return null;
  }

  grab(cell, x, y) {
    this.grabbed = { cell, x, y };
  }

  dragTo(x, y) {
    if (this.grabbed) {
      this.grabbed.x = x;
      this.grabbed.y = y;
    }
  }

  release() {
    this.grabbed = null;
  }

  // Click-to-recolour: steps a cell through the brand palette. Its
  // descendants inherit the colour.
  cycleColour(cell) {
    const current = this.colourFor(cell);
    const index = PALETTE.indexOf(current);
    cell.lock = PALETTE[(index + 1) % PALETTE.length];
  }

  clearColourLocks() {
    for (const c of this.cells) c.lock = null;
  }

  shuffleColours() {
    for (const c of this.cells) {
      c.lock = null;
      c.ci = this.rng.int(997);
    }
  }

  // True once nothing is dividing or fusing and the count matches the goal.
  isSettled() {
    if (this.bonds.length) return false;
    if (this.imageActive) return !this.cells.some((c) => (c.pending && c.pending.length) || c.orphan);
    return this.liveCount === this.targetCount;
  }
}
