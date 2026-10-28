// The built-in sample shown in Image mode until an image is uploaded: three
// shaded spheres, like cells under a lens. Drawn in code so the tool ships
// with no image assets.

export function createSampleImage() {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const sphere = (x, y, r) => {
    const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.04, x, y, r);
    g.addColorStop(0, '#e6e6e6');
    g.addColorStop(0.5, '#7d7d7d');
    g.addColorStop(1, '#0a0a0a');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  sphere(360, 340, 220);
  sphere(610, 290, 165);
  sphere(745, 470, 92);
  return canvas;
}
