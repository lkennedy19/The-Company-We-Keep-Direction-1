// Count sequences: a timed run such as 1 → 2 → 3 … → 22 (and back), used
// both for live playback on stage and for rendering straight to MP4.

const MAX_STEPS = 400;

// Returns { counts, events: [{ at, count }], duration } in seconds. The
// first event is the starting count at t = 0; each later count arrives one
// `hold` after the previous one, and the end holds long enough to settle.
export function planSequence({ from, to, step, hold, pingpong }) {
  const up = path(from, to, step);
  const counts = pingpong && up.length > 1 ? [...up, ...up.slice(0, -1).reverse()] : up;
  const events = counts.map((count, i) => ({ at: i === 0 ? 0 : hold * i, count }));
  const settle = step === 'double' ? 3.5 : 2.5;
  const duration = hold * (counts.length - 1) + Math.max(hold, settle);
  return { counts, events, duration };
}

function path(from, to, step) {
  const out = [from];
  let current = from;
  const rising = to >= from;
  while (current !== to && out.length < MAX_STEPS) {
    if (step === 'double') current = rising ? Math.min(to, current * 2) : Math.max(to, Math.ceil(current / 2));
    else current += rising ? 1 : -1;
    out.push(current);
  }
  return out;
}

// Plays a plan on the live stage by setting the count at the right moments
// of simulation time (so it stays in step with a recording).
export function createSequencePlayer({ setCount, onChange }) {
  let plan = null;
  let startedAt = 0;
  let next = 0;

  return {
    get playing() {
      return plan !== null;
    },
    progress(world) {
      return plan ? Math.min(1, (world.time - startedAt) / plan.duration) : 0;
    },
    start(newPlan, world) {
      plan = newPlan;
      startedAt = world.time;
      next = 0;
      onChange(true);
      this.update(world);
    },
    stop() {
      if (!plan) return;
      plan = null;
      onChange(false);
    },
    update(world) {
      if (!plan) return;
      const t = world.time - startedAt;
      while (next < plan.events.length && plan.events[next].at <= t) {
        setCount(plan.events[next].count);
        next++;
      }
      if (t >= plan.duration) this.stop();
    },
  };
}
