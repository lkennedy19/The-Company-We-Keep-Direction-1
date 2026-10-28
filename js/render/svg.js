// Serialises a scene to SVG. One layer per colour, named by its hex, so it
// drops into Illustrator or Figma ready to recolour. Fused blobs are circles
// plus neck paths sharing a fill; Pathfinder → Unite merges them into one
// shape if needed.

import { bridgePathData } from './bridge.js';
import { dotStep } from './scene.js';

export function sceneToSvg(scene, { transparent = false, title = '' } = {}) {
  const fmt = (n) => (Math.round(n * 100) / 100).toString();
  const { width, height } = scene;
  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
  ];
  if (title) out.push(`  <title>${escapeXml(title)}</title>`);
  if (!transparent) out.push(`  <rect id="background" width="${width}" height="${height}" fill="${scene.background}"/>`);

  if (scene.dotted.length) {
    out.push(
      `  <g id="dotted" fill="none" stroke-width="${fmt(scene.dot.size)}" stroke-linecap="round">`,
    );
    for (const c of scene.dotted) {
      out.push(
        `    <circle cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="${fmt(c.r)}" stroke="${c.hex}" stroke-dasharray="0 ${fmt(dotStep(c.r, scene.dot.gap))}"/>`,
      );
    }
    out.push('  </g>');
  }

  for (const group of scene.groups) {
    const id = `fill-${group.hex.slice(1)}${group.under ? '-under' : ''}`;
    out.push(`  <g id="${id}" fill="${group.hex}">`);
    for (const c of group.circles) {
      out.push(`    <circle cx="${fmt(c.x)}" cy="${fmt(c.y)}" r="${fmt(c.r)}"/>`);
    }
    for (const g of group.bridges) out.push(`    <path d="${bridgePathData(g, fmt)}"/>`);
    for (const [p, q, r] of group.pores) {
      out.push(`    <path d="M${fmt(p.x)} ${fmt(p.y)}L${fmt(q.x)} ${fmt(q.y)}L${fmt(r.x)} ${fmt(r.y)}Z"/>`);
    }
    out.push('  </g>');
  }

  out.push('</svg>');
  return out.join('\n') + '\n';
}

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[ch]);
}
