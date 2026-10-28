// Binds the control panel to the shared settings object. Sliders and
// checkboxes marked with data-setting write straight into settings; the rest
// (radios, swatches, frame size, sequence, image detail) are wired by hand.
// `actions` (from main.js) handles side effects such as re-stippling.

import { PALETTE, FRAME_PRESETS, BEHAVIOURS, LIMITS } from '../config.js';

const FORMATS = {
  pct: (v) => `${Math.round(v * 100)}%`,
  signed: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`,
  times: (v) => `×${v.toFixed(2)}`,
  seconds: (v) => `${v.toFixed(1)} s`,
  shrink: (v) => (v < 0.005 ? 'Off' : Math.abs(v - 0.5) < 0.005 ? 'Area kept' : v.toFixed(2)),
};

// Image detail slider runs on a log scale: 0 → 10 circles, 1000 → 6000.
const DETAIL_SPAN = Math.log(LIMITS.imageCount.max / LIMITS.imageCount.min);
const detailToCount = (v) => Math.round(LIMITS.imageCount.min * Math.exp((v / 1000) * DETAIL_SPAN));
const countToDetail = (n) => Math.round((1000 * Math.log(n / LIMITS.imageCount.min)) / DETAIL_SPAN);

const $ = (id) => document.getElementById(id);

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], obj)[last] = value;
}

export function bindPanel(settings, actions) {
  const syncers = [];
  const sync = () => syncers.forEach((fn) => fn());

  // --- data-setting sliders and checkboxes --------------------------------
  for (const el of document.querySelectorAll('[data-setting]')) {
    const path = el.dataset.setting;
    const output = document.querySelector(`output[data-for="${path}"]`);
    const format = FORMATS[el.dataset.format] || String;
    const isCheck = el.type === 'checkbox';
    syncers.push(() => {
      const value = getPath(settings, path);
      if (isCheck) el.checked = !!value;
      else el.value = value;
      if (output) output.textContent = format(value);
    });
    el.addEventListener('input', () => {
      const value = isCheck ? el.checked : parseFloat(el.value);
      setPath(settings, path, value);
      if (output) output.textContent = format(value);
      actions.changed(path);
    });
  }

  // --- radio groups ---------------------------------------------------------
  const radios = (name, path, onChange) => {
    const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
    syncers.push(() => {
      const value = getPath(settings, path);
      for (const input of inputs) input.checked = input.value === value;
    });
    for (const input of inputs) {
      input.addEventListener('change', () => {
        if (input.checked) onChange(input.value);
      });
    }
  };
  radios('behaviour', 'behaviour', (v) => actions.setBehaviour(v));
  radios('style', 'style', (v) => {
    settings.style = v;
    actions.changed('style');
  });
  radios('image-sizing', 'image.sizing', (v) => {
    settings.image.sizing = v;
    actions.changed('image.sizing');
  });
  radios('seq-step', 'sequence.step', (v) => {
    settings.sequence.step = v;
    actions.changed('sequence.step');
  });

  const note = $('behaviour-note');
  syncers.push(() => {
    note.textContent = BEHAVIOURS[settings.behaviour].note;
  });

  // --- colour swatches --------------------------------------------------------
  const swatches = $('swatches');
  for (const hex of PALETTE) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swatch';
    button.style.setProperty('--chip', hex);
    button.innerHTML = `<span class="swatch__chip"></span><span>${hex}</span>`;
    button.setAttribute('aria-label', `Use ${hex}`);
    button.addEventListener('click', () => {
      const on = settings.colours.includes(hex);
      // Always keep at least one colour selected.
      if (on && settings.colours.length === 1) return;
      settings.colours = on ? settings.colours.filter((c) => c !== hex) : PALETTE.filter((c) => c === hex || settings.colours.includes(c));
      actions.changed('colours');
      sync();
    });
    swatches.append(button);
    syncers.push(() => button.setAttribute('aria-pressed', String(settings.colours.includes(hex))));
  }
  $('shuffle-btn').addEventListener('click', () => actions.shuffleColours());

  // --- frame size ------------------------------------------------------------
  const preset = $('frame-preset');
  for (const p of FRAME_PRESETS) preset.add(new Option(p.label, p.id));
  preset.add(new Option('Custom', 'custom'));
  const fw = $('frame-w');
  const fh = $('frame-h');
  syncers.push(() => {
    const { w, h } = settings.frame;
    const match = FRAME_PRESETS.find((p) => p.w === w && p.h === h);
    preset.value = match ? match.id : 'custom';
    fw.value = w;
    fh.value = h;
  });
  preset.addEventListener('change', () => {
    const p = FRAME_PRESETS.find((x) => x.id === preset.value);
    if (p) actions.setFrame(p.w, p.h);
  });
  const commitSize = () => actions.setFrame(parseInt(fw.value, 10), parseInt(fh.value, 10));
  fw.addEventListener('change', commitSize);
  fh.addEventListener('change', commitSize);

  // --- image -----------------------------------------------------------------
  const detail = $('image-detail');
  const detailValue = $('image-detail-value');
  syncers.push(() => {
    detail.value = countToDetail(settings.image.count);
    detailValue.textContent = `${settings.image.count} circles`;
  });
  detail.addEventListener('input', () => {
    const n = detailToCount(parseFloat(detail.value));
    detailValue.textContent = `${n} circles`;
    actions.setImageCount(n);
  });
  $('image-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) actions.loadImage(file);
    event.target.value = '';
  });

  // --- sequence --------------------------------------------------------------
  const from = $('seq-from');
  const to = $('seq-to');
  syncers.push(() => {
    from.value = settings.sequence.from;
    to.value = settings.sequence.to;
  });
  const commitRange = () => {
    settings.sequence.from = Math.max(1, parseInt(from.value, 10) || 1);
    settings.sequence.to = Math.max(1, parseInt(to.value, 10) || 1);
    actions.changed('sequence.range');
    sync();
  };
  from.addEventListener('change', commitRange);
  to.addEventListener('change', commitRange);
  $('seq-play').addEventListener('click', () => actions.toggleSequence());
  $('seq-export').addEventListener('click', () => actions.renderSequence());
  $('seq-cancel').addEventListener('click', () => actions.cancelRender());

  // --- export ------------------------------------------------------------------
  const fps = $('export-fps');
  const quality = $('export-quality');
  syncers.push(() => {
    fps.value = String(settings.export.fps);
    quality.value = settings.export.quality;
  });
  fps.addEventListener('change', () => {
    settings.export.fps = parseInt(fps.value, 10);
    actions.changed('export.fps');
  });
  quality.addEventListener('change', () => {
    settings.export.quality = quality.value;
    actions.changed('export.quality');
  });
  $('export-svg').addEventListener('click', () => actions.saveSvg());
  $('export-png').addEventListener('click', () => actions.savePng());

  sync();
  return { sync };
}
