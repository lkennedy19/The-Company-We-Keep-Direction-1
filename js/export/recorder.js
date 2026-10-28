// Live recording: captures whatever happens on stage (count changes,
// behaviour switches, recolouring) into an MP4 at the full frame size.
//
// While recording, the app advances the simulation in fixed steps of exactly
// one video frame (see main.js), so the file is smooth even if the preview
// stutters, and a 120 Hz display doesn't double the speed.

import { createVideoWriter } from './video-writer.js';
import { createFrameCanvas } from './frame-canvas.js';

export function createRecorder({ onChange }) {
  let state = 'idle'; // idle | starting | recording | finishing
  let writer = null;
  let frame = null;
  let fps = 60;

  const set = (next, detail = {}) => {
    state = next;
    onChange({ state, ...detail });
  };

  return {
    get state() {
      return state;
    },
    get recording() {
      return state === 'recording';
    },
    get fps() {
      return fps;
    },
    get seconds() {
      return writer ? writer.frames / fps : 0;
    },

    async start(settings) {
      if (state !== 'idle') return;
      set('starting');
      try {
        fps = settings.export.fps;
        const { w, h } = settings.frame;
        writer = await createVideoWriter({ width: w, height: h, fps, quality: settings.export.quality });
        frame = createFrameCanvas(w, h);
        set('recording', { codec: writer.codec });
      } catch (err) {
        writer = null;
        set('idle', { error: err.message });
      }
    },

    capture(world) {
      if (state !== 'recording') return;
      try {
        writer.add(frame.render(world));
      } catch (err) {
        writer.cancel();
        writer = null;
        set('idle', { error: `Recording stopped: ${err.message}` });
      }
    },

    // Resolves to the MP4 blob, or null if nothing was recorded.
    async stop() {
      if (state !== 'recording') return null;
      set('finishing');
      try {
        const blob = writer.frames ? await writer.finish() : null;
        if (!blob) writer.cancel();
        return blob;
      } catch (err) {
        set('idle', { error: `Couldn't finish the video: ${err.message}` });
        return null;
      } finally {
        writer = null;
        if (state !== 'idle') set('idle');
      }
    },
  };
}
