// Renders a count sequence straight to MP4, frame by frame, in a separate
// world so the live stage is untouched. Rendering isn't tied to real time:
// a long 4K sequence just takes longer to export and still plays smoothly.

import { World } from '../sim/world.js';
import { createVideoWriter } from './video-writer.js';
import { createFrameCanvas } from './frame-canvas.js';

const PREROLL_LIMIT = 30; // seconds of simulation to reach the first count

export async function exportSequence({ settings, plan, imageLab, onProgress, signal }) {
  const s = structuredClone(settings);
  const fps = s.export.fps;
  const { w, h } = s.frame;
  const imageMode = s.behaviour === 'image';
  const first = plan.events[0].count;

  // Image sequences need stipple targets for every count up front.
  const targets = new Map();
  if (imageMode) {
    const distinct = [...new Set(plan.counts)];
    for (let i = 0; i < distinct.length; i++) {
      throwIfAborted(signal);
      onProgress({ phase: 'Preparing image', fraction: i / distinct.length });
      targets.set(distinct[i], await imageLab.compute(distinct[i]));
    }
  }

  if (imageMode) s.image.count = first;
  else s.count = first;
  const world = new World(s, { startCount: imageMode ? 1 : first });
  const apply = (count) => {
    if (imageMode) {
      const t = targets.get(count);
      world.setImage({ aspect: t.aspect, targets: t.targets });
    } else {
      world.setCount(count);
    }
  };

  // Pre-roll (not recorded): let the starting state form and settle.
  onProgress({ phase: 'Settling', fraction: 0 });
  apply(first);
  for (let t = 0; t < PREROLL_LIMIT; t += 1 / 30) {
    world.advance(1 / 30);
    if (world.isSettled() && t > 2) break;
  }
  world.advance(1);

  const writer = await createVideoWriter({ width: w, height: h, fps, quality: s.export.quality });
  const frame = createFrameCanvas(w, h);
  const total = Math.ceil(plan.duration * fps);
  let next = 1;
  try {
    for (let f = 0; f < total; f++) {
      throwIfAborted(signal);
      const t = f / fps;
      while (next < plan.events.length && plan.events[next].at <= t) apply(plan.events[next++].count);
      writer.add(frame.render(world));
      world.advance(1 / fps);
      if (f % 6 === 0) {
        onProgress({ phase: 'Rendering', fraction: f / total });
        await writer.drain();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    onProgress({ phase: 'Finishing', fraction: 1 });
    return { blob: await writer.finish(), codec: writer.codec };
  } catch (err) {
    writer.cancel();
    throw err;
  }
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
}
