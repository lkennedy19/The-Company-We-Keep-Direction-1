// Draws a scene onto a 2D canvas context. The caller sets the transform so
// that one unit is one frame pixel; this works for the scaled stage preview
// and the full-size video/PNG canvas alike.

import { traceBridge } from './bridge.js';
import { dotStep } from './scene.js';

export function drawScene(ctx, scene, { transparent = false, ghost = null } = {}) {
  if (transparent) ctx.clearRect(0, 0, scene.width, scene.height);
  else {
    ctx.fillStyle = scene.background;
    ctx.fillRect(0, 0, scene.width, scene.height);
  }

  if (ghost) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.drawImage(ghost.image, ghost.rect.x, ghost.rect.y, ghost.rect.w, ghost.rect.h);
    ctx.restore();
  }

  if (scene.dotted.length) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = scene.dot.size;
    for (const c of scene.dotted) {
      ctx.strokeStyle = c.hex;
      ctx.setLineDash([0, dotStep(c.r, scene.dot.gap)]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // One path per colour: circles and necks share a winding direction, so a
  // single nonzero fill unions them into smooth blobs.
  for (const group of scene.groups) {
    ctx.beginPath();
    for (const c of group.circles) {
      ctx.moveTo(c.x + c.r, c.y);
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    }
    for (const g of group.bridges) traceBridge(ctx, g);
    for (const [p, q, r] of group.pores) {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.lineTo(r.x, r.y);
      ctx.closePath();
    }
    ctx.fillStyle = group.hex;
    ctx.fill('nonzero');
  }
}
