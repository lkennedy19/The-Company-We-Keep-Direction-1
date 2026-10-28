// The on-screen preview: fits the frame into the viewport, draws the scene,
// and turns pointer input into frame coordinates. Clicking a circle
// recolours it, dragging a circle moves it, and dragging empty space moves
// the centre the cells gather around.

import { buildScene } from '../render/scene.js';
import { drawScene } from '../render/canvas.js';
import { createGlRenderer, glCanDraw } from '../render/webgl.js';
import { glOptions } from '../render/preference.js';

const DRAG_THRESHOLD = 4; // CSS px before a press counts as a drag

export function createStage({ canvas, viewport, frameBox, world, settings, getGhost, onCellClick, onAnchorChange, onFile, onDropState }) {
  const ctx = canvas.getContext('2d');
  // Solid-circle scenes draw on the GPU canvas underneath; the 2D canvas on
  // top handles everything else and the anchor overlay.
  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'stage__canvas stage__canvas--gl';
  glCanvas.setAttribute('aria-hidden', 'true');
  canvas.before(glCanvas);
  const { enabled, allowSoftware } = glOptions();
  const gl = enabled ? createGlRenderer(glCanvas, { allowSoftware }) : null;
  let glShown = false;
  let dpr = 1;
  let cssW = 0;
  let cssH = 0;
  let fit = { scale: 1, x: 0, y: 0 };
  let press = null; // { kind: 'cell' | 'anchor', cell, startX, startY, dragged }

  const resize = () => {
    const rect = viewport.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    glCanvas.width = canvas.width;
    glCanvas.height = canvas.height;
  };
  new ResizeObserver(resize).observe(viewport);
  resize();

  function updateFit() {
    const { w, h } = settings.frame;
    const scale = Math.max(0.01, Math.min(cssW / w, cssH / h));
    fit = { scale, x: (cssW - w * scale) / 2, y: (cssH - h * scale) / 2 };
    frameBox.style.left = `${fit.x}px`;
    frameBox.style.top = `${fit.y}px`;
    frameBox.style.width = `${w * scale}px`;
    frameBox.style.height = `${h * scale}px`;
  }

  function draw() {
    updateFit();
    const { w, h } = settings.frame;
    const scene = buildScene(world);
    const ghost = getGhost();
    const k = fit.scale * dpr;
    const useGl = gl && !gl.lost && glCanDraw(scene, ghost);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (useGl) {
      gl.draw(scene, { scale: k, offsetX: fit.x * dpr, offsetY: fit.y * dpr });
      glShown = true;
    } else if (glShown) {
      gl.clear();
      glShown = false;
    }

    ctx.setTransform(k, 0, 0, k, fit.x * dpr, fit.y * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    if (!useGl) drawScene(ctx, scene, { ghost });
    if (press && press.kind === 'anchor') drawAnchor(world.anchor(), Math.min(w, h));
    ctx.restore();
  }

  function drawAnchor(a, minDim) {
    const arm = minDim * 0.03;
    ctx.save();
    ctx.strokeStyle = 'rgba(29, 28, 24, 0.55)';
    ctx.lineWidth = Math.max(1, minDim * 0.0018);
    ctx.beginPath();
    ctx.moveTo(a.x - arm, a.y);
    ctx.lineTo(a.x + arm, a.y);
    ctx.moveTo(a.x, a.y - arm);
    ctx.lineTo(a.x, a.y + arm);
    ctx.stroke();
    ctx.restore();
  }

  function toFrame(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - fit.x) / fit.scale,
      y: (event.clientY - rect.top - fit.y) / fit.scale,
    };
  }

  function moveAnchor(p) {
    settings.anchor.x = Math.min(1, Math.max(0, p.x / settings.frame.w));
    settings.anchor.y = Math.min(1, Math.max(0, p.y / settings.frame.h));
    onAnchorChange();
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const p = toFrame(event);
    const cell = world.hitTest(p.x, p.y);
    press = { kind: cell ? 'cell' : 'anchor', cell, startX: event.clientX, startY: event.clientY, dragged: false };
    if (cell) world.grab(cell, p.x, p.y);
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.toggle('is-dragging', !!cell);
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = toFrame(event);
    if (!press) {
      canvas.classList.toggle('is-over-cell', !!world.hitTest(p.x, p.y));
      return;
    }
    if (Math.hypot(event.clientX - press.startX, event.clientY - press.startY) > DRAG_THRESHOLD) press.dragged = true;
    if (press.kind === 'cell') world.dragTo(p.x, p.y);
    else if (press.dragged) moveAnchor(p);
  });

  const endPress = (event, cancelled) => {
    if (!press) return;
    if (!cancelled && !press.dragged && press.kind === 'cell') onCellClick(press.cell);
    world.release();
    press = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', (event) => endPress(event, false));
  canvas.addEventListener('pointercancel', (event) => endPress(event, true));

  // Drag and drop an image anywhere on the stage.
  const stage = viewport.closest('.stage');
  stage.addEventListener('dragover', (event) => {
    if (![...event.dataTransfer.types].includes('Files')) return;
    event.preventDefault();
    onDropState(true);
  });
  stage.addEventListener('dragleave', (event) => {
    if (!stage.contains(event.relatedTarget)) onDropState(false);
  });
  stage.addEventListener('drop', (event) => {
    event.preventDefault();
    onDropState(false);
    const file = [...event.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) onFile(file);
  });

  return { draw };
}
