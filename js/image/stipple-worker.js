// Runs stippling off the main thread so the stage keeps animating (and
// recording) while a new image or detail level is computed.

import { stipple } from './stipple.js';

self.onmessage = (event) => {
  const { id, density, w, h, n, seed } = event.data;
  const points = stipple(density, w, h, n, { seed });
  self.postMessage({ id, points }, [points.buffer]);
};
