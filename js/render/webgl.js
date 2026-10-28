// GPU renderer for scenes made only of solid circles (the common case, and
// the heavy one: Image mode with thousands of circles). Each circle is one
// instanced quad shaded as an anti-aliased disc, so 12,000 circles cost
// about the same as 12. Scenes with dotted circles, goo necks or the source
// image ghost fall back to the 2D renderer (js/render/canvas.js), which
// remains the reference for how everything should look.

const VERTEX = `#version 300 es
in vec2 a_corner;
in vec3 a_circle;   // x, y, r in frame pixels
in vec3 a_colour;
uniform vec2 u_scale;   // frame px → clip space
uniform vec2 u_offset;
uniform float u_pixel;  // device pixels per frame pixel
out vec2 v_local;
out float v_radius;
out vec3 v_colour;
void main() {
  float pad = 1.0 / u_pixel;
  vec2 local = a_corner * (a_circle.z + pad);
  v_local = local;
  v_radius = a_circle.z;
  v_colour = a_colour;
  gl_Position = vec4((a_circle.xy + local) * u_scale + u_offset, 0.0, 1.0);
}`;

const FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_local;
in float v_radius;
in vec3 v_colour;
uniform float u_pixel;
out vec4 outColour;
void main() {
  float edge = (v_radius - length(v_local)) * u_pixel + 0.5;
  float alpha = clamp(edge, 0.0, 1.0);
  if (alpha <= 0.0) discard;
  outColour = vec4(v_colour * alpha, alpha);
}`;

// True when the GPU path can draw this scene exactly.
export function glCanDraw(scene, ghost) {
  if (ghost || scene.dotted.length) return false;
  for (const group of scene.groups) if (group.bridges.length || group.pores.length) return false;
  return true;
}

// Returns null when WebGL2 is missing or only emulated in software (where it
// is slower than the 2D canvas); callers then use the 2D renderer.
export function createGlRenderer(canvas, { preserve = false, allowSoftware = false } = {}) {
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: preserve,
  });
  if (!gl) return null;
  if (!allowSoftware && isSoftware(gl)) return null;

  const program = link(gl, VERTEX, FRAGMENT);
  if (!program) return null;
  const loc = {
    corner: gl.getAttribLocation(program, 'a_corner'),
    circle: gl.getAttribLocation(program, 'a_circle'),
    colour: gl.getAttribLocation(program, 'a_colour'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    offset: gl.getUniformLocation(program, 'u_offset'),
    pixel: gl.getUniformLocation(program, 'u_pixel'),
  };

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(loc.corner);
  gl.vertexAttribPointer(loc.corner, 2, gl.FLOAT, false, 0, 0);

  const instances = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instances);
  gl.enableVertexAttribArray(loc.circle);
  gl.vertexAttribPointer(loc.circle, 3, gl.FLOAT, false, 24, 0);
  gl.vertexAttribDivisor(loc.circle, 1);
  gl.enableVertexAttribArray(loc.colour);
  gl.vertexAttribPointer(loc.colour, 3, gl.FLOAT, false, 24, 12);
  gl.vertexAttribDivisor(loc.colour, 1);
  gl.bindVertexArray(null);

  let data = new Float32Array(6 * 1024);
  const rgbCache = new Map();
  const rgb = (hex) => {
    let c = rgbCache.get(hex);
    if (!c) {
      const v = parseInt(hex.slice(1), 16);
      c = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
      rgbCache.set(hex, c);
    }
    return c;
  };

  return {
    canvas,
    get lost() {
      return gl.isContextLost();
    },

    // Clears the whole canvas to transparent.
    clear() {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },

    // Draws `scene` with the frame mapped to device pixels by
    // x' = x * scale + offsetX (and likewise for y).
    draw(scene, { scale = 1, offsetX = 0, offsetY = 0 } = {}) {
      const w = canvas.width;
      const h = canvas.height;
      this.clear();

      // Frame background, clipped to the frame.
      const fx = Math.round(offsetX);
      const fy = Math.round(offsetY);
      const fw = Math.round(scene.width * scale);
      const fh = Math.round(scene.height * scale);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(fx, h - fy - fh, fw, fh);
      const bg = rgb(scene.background);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      let count = 0;
      for (const group of scene.groups) count += group.circles.length;
      if (!count) return;
      if (data.length < count * 6) data = new Float32Array(count * 6 * 1.5);
      let k = 0;
      for (const group of scene.groups) {
        const c = rgb(group.hex);
        for (const circle of group.circles) {
          data[k++] = circle.x;
          data[k++] = circle.y;
          data[k++] = circle.r;
          data[k++] = c[0];
          data[k++] = c[1];
          data[k++] = c[2];
        }
      }

      gl.useProgram(program);
      gl.uniform2f(loc.scale, (2 * scale) / w, (-2 * scale) / h);
      gl.uniform2f(loc.offset, (2 * offsetX) / w - 1, 1 - (2 * offsetY) / h);
      gl.uniform1f(loc.pixel, scale);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, instances);
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, k), gl.DYNAMIC_DRAW);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.bindVertexArray(null);
    },
  };
}

function isSoftware(gl) {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const name = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
  return /swiftshader|llvmpipe|software|basic render/i.test(name);
}

function link(gl, vertexSource, fragmentSource) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return gl.getShaderParameter(shader, gl.COMPILE_STATUS) ? shader : null;
  };
  const vs = compile(gl.VERTEX_SHADER, vertexSource);
  const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return gl.getProgramParameter(program, gl.LINK_STATUS) ? program : null;
}
