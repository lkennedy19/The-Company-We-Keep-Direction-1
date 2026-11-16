// Runs stippling off the main thread so the stage keeps animating (and
// recording) while a new image or detail level is computed. Posts an early,
// partly relaxed layout first so the circles can start moving at once.

import { stipple } from './stipple.js';

self.onmessage = (event) => {
  const { id, density, w, h, n, seed, uniformity } = event.data;
  const onProgress = (points) => self.postMessage({ id, points, final: false }, [points.buffer]);
  const points = stipple(density, w, h, n, { seed, uniformity, onProgress });
  self.postMessage({ id, points, final: true }, [points.buffer]);
};
