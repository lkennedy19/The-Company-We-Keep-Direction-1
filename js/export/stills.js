// Still exports of the current frame: SVG (vector, editable) and PNG.

import { buildScene } from '../render/scene.js';
import { sceneToSvg } from '../render/svg.js';
import { createFrameCanvas } from './frame-canvas.js';

export function currentSvg(world) {
  const s = world.settings;
  const title = `The Company We Keep · ${world.liveCount} ${world.liveCount === 1 ? 'circle' : 'circles'}`;
  return new Blob([sceneToSvg(buildScene(world), { transparent: s.export.transparent, title })], {
    type: 'image/svg+xml',
  });
}

export function currentPng(world) {
  const { w, h } = world.settings.frame;
  const canvas = createFrameCanvas(w, h).render(world, { transparent: world.settings.export.transparent });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The PNG could not be created.'))), 'image/png');
  });
}
