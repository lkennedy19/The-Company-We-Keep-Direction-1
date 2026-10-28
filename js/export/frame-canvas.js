// A full-resolution canvas for video frames and PNG stills: one canvas
// pixel per frame pixel, independent of the on-screen preview's scale.
// Video frames of solid-circle scenes render on the GPU (fast enough for
// thousands of circles per frame); everything else, and every PNG, uses the
// 2D renderer. `render` returns whichever canvas holds the frame.

import { buildScene } from '../render/scene.js';
import { drawScene } from '../render/canvas.js';
import { createGlRenderer, glCanDraw } from '../render/webgl.js';
import { glOptions } from '../render/preference.js';

export function createFrameCanvas(width, height, { gpu = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: true });
  let gl = null;
  const { enabled, allowSoftware } = glOptions();
  if (gpu && enabled) {
    const glCanvas = document.createElement('canvas');
    glCanvas.width = width;
    glCanvas.height = height;
    gl = createGlRenderer(glCanvas, { preserve: true, allowSoftware });
  }

  return {
    canvas,
    render(world, { transparent = false } = {}) {
      const scene = buildScene(world);
      if (gl && !gl.lost && !transparent && glCanDraw(scene, null)) {
        gl.draw(scene);
        return gl.canvas;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawScene(ctx, scene, { transparent });
      return canvas;
    },
  };
}
