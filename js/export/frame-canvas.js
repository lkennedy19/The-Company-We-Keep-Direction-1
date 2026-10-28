// A full-resolution canvas for video frames and PNG stills: one canvas
// pixel per frame pixel, independent of the on-screen preview's scale.

import { buildScene } from '../render/scene.js';
import { drawScene } from '../render/canvas.js';

export function createFrameCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  return {
    canvas,
    render(world, { transparent = false } = {}) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawScene(ctx, buildScene(world), { transparent });
      return canvas;
    },
  };
}
