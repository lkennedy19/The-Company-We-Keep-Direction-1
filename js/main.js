// Entry point: wires settings, the cell world, the stage, the panel, the
// image lab and the exporters together, and runs the animation loop.

import { LIMITS, PALETTE, BEHAVIOURS, FRAME_PRESETS } from './config.js';
import { loadSettings, saveSettings } from './state.js';
import { World } from './sim/world.js';
import { createStage } from './ui/stage.js';
import { bindPanel } from './ui/panel.js';
import { bindKeyboard } from './ui/keyboard.js';
import { createStatus } from './ui/status.js';
import { createImageLab } from './image/image-lab.js';
import { createRecorder } from './export/recorder.js';
import { planSequence, createSequencePlayer } from './export/sequence.js';
import { exportSequence } from './export/sequence-export.js';
import { currentSvg, currentPng } from './export/stills.js';
import { saveFile, prepareSaving, timestamp } from './export/save-file.js';
import { videoSupported } from './export/video-writer.js';

const $ = (id) => document.getElementById(id);
// Image settings that change where circles go (the rest only resize them).
const RESTIPPLE = new Set(['image.method', 'image.levels', 'image.contrast', 'image.midtones', 'image.cutoff', 'image.invert']);
const clampInt = (v, min, max) => Math.min(max, Math.max(min, Math.round(v)));
const even = (v) => clampInt(v, LIMITS.frame.min, LIMITS.frame.max) & ~1;

const settings = loadSettings();
normalise(settings);

const world = new World(settings, { startCount: 1 });
world.setCount(settings.count);

const status = createStatus($('status'));
let imageBusy = false;
let imageStale = false; // image settings changed while another behaviour was showing
let renderJob = null;

const imageLab = createImageLab(settings, {
  onTargets: (image) => world.setImage(image),
  onBusy: (busy) => {
    imageBusy = busy;
  },
});

const recorder = createRecorder({
  onChange: ({ state, error }) => {
    const on = state === 'recording';
    $('record-btn').setAttribute('aria-pressed', String(on));
    $('record-label').textContent = state === 'finishing' ? 'Saving…' : state === 'starting' ? 'Starting…' : on ? 'Stop' : 'Record';
    $('record-time').hidden = !on;
    if (error) status.show(error, { error: true });
  },
});

const sequence = createSequencePlayer({
  setCount: (n) => setCount(n, true),
  onChange: (playing) => {
    $('seq-play').textContent = playing ? 'Stop' : 'Play on stage';
  },
});

const app = $('app');
const stage = createStage({
  canvas: $('stage-canvas'),
  viewport: $('viewport'),
  frameBox: $('frame-box'),
  world,
  settings,
  getGhost: () =>
    settings.image.showSource && settings.behaviour === 'image' && world.image
      ? { image: imageLab.source, rect: world.imageRect }
      : null,
  onCellClick: (cell) => {
    world.cycleColour(cell);
  },
  onAnchorChange: persist,
  onFile: (file) => loadImage(file),
  onDropState: (on) => {
    $('drop-hint').hidden = !on;
    $('stage').classList.toggle('is-dropping', on);
  },
});

// --- Actions -----------------------------------------------------------------

function persist() {
  saveSettings(settings);
}

function activeCount() {
  return settings.behaviour === 'image' ? settings.image.count : settings.count;
}

function setCount(n, fromSequence = false) {
  if (!fromSequence) sequence.stop();
  if (settings.behaviour === 'image') {
    setImageCount(n);
    return;
  }
  settings.count = clampInt(n, LIMITS.count.min, LIMITS.count.max);
  world.setCount(settings.count);
  syncCount();
  persist();
}

function setImageCount(n) {
  settings.image.count = clampInt(n, LIMITS.imageCount.min, LIMITS.imageCount.max);
  if (settings.behaviour === 'image') imageLab.schedule();
  syncCount();
  panel.sync();
  persist();
}

function nudge(direction, big) {
  if (settings.behaviour === 'image') {
    const factor = big ? 2 : 1.25;
    setCount(settings.image.count * Math.pow(factor, direction));
  } else {
    setCount(settings.count + direction * (big ? 5 : 1));
  }
}

function setBehaviour(behaviour) {
  if (!BEHAVIOURS[behaviour] || behaviour === settings.behaviour) {
    panel.sync();
    return;
  }
  sequence.stop();
  const wasImage = settings.behaviour === 'image';
  settings.behaviour = behaviour;
  if (behaviour === 'image') {
    const current = imageLab.current;
    if (!current || imageStale || current.n !== settings.image.count) imageLab.refresh();
    imageStale = false;
  } else if (wasImage) {
    world.setCount(settings.count);
  }
  syncCount();
  panel.sync();
  persist();
}

function setFrame(w, h) {
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    panel.sync();
    return;
  }
  if (recorder.state !== 'idle' || renderJob) {
    status.show('Stop recording or rendering before changing the frame size.', { error: true });
    panel.sync();
    return;
  }
  settings.frame = { w: even(w), h: even(h) };
  panel.sync();
  persist();
}

async function loadImage(file) {
  try {
    const bitmap = await createImageBitmap(file);
    $('image-name').textContent = file.name;
    await imageLab.setSource(bitmap, file.name);
    if (settings.behaviour !== 'image') setBehaviour('image');
    status.show(`Rendering ${file.name} in ${settings.image.count} circles`);
  } catch {
    status.show("That file couldn't be read as an image. Try a PNG or JPG.", { error: true });
  }
}

async function toggleRecord() {
  if (renderJob) {
    status.show('Wait for the MP4 render to finish first.', { error: true });
    return;
  }
  if (recorder.recording) {
    const blob = await recorder.stop();
    if (blob) await deliver(blob, fileName('recording', 'mp4'), 'Saved the recording');
  } else if (recorder.state === 'idle') {
    await recorder.start(settings);
  }
}

function currentPlan() {
  const s = settings.sequence;
  const limits = settings.behaviour === 'image' ? LIMITS.imageCount : LIMITS.count;
  const from = clampInt(s.from, limits.min, limits.max);
  const to = clampInt(s.to, limits.min, limits.max);
  return planSequence({ from, to, step: s.step, hold: s.hold, pingpong: s.pingpong });
}

function toggleSequence() {
  if (sequence.playing) sequence.stop();
  else sequence.start(currentPlan(), world);
}

async function renderSequence() {
  if (renderJob) return;
  if (recorder.state !== 'idle') {
    status.show('Stop recording before rendering a sequence.', { error: true });
    return;
  }
  sequence.stop();
  const controller = new AbortController();
  renderJob = controller;
  const plan = currentPlan();
  $('seq-progress').hidden = false;
  $('seq-export').disabled = true;
  try {
    const { blob, codec } = await exportSequence({
      settings,
      plan,
      imageLab,
      signal: controller.signal,
      onProgress: ({ phase, fraction }) => {
        $('seq-progress-bar').value = fraction;
        $('seq-progress-label').textContent = `${phase} ${Math.round(fraction * 100)}%`;
      },
    });
    const name = fileName(`sequence-${plan.counts[0]}-to-${Math.max(...plan.counts)}`, 'mp4');
    const note = codec === 'vp9' ? ' (VP9: plays in browsers, not QuickTime)' : '';
    await deliver(blob, name, `Saved the sequence${note}`);
  } catch (err) {
    if (err.name === 'AbortError') status.show('Render cancelled');
    else status.show(`The render failed: ${err.message}`, { error: true });
  } finally {
    renderJob = null;
    $('seq-progress').hidden = true;
    $('seq-export').disabled = false;
  }
}

async function saveSvg() {
  await deliver(currentSvg(world), fileName('frame', 'svg'), 'Saved the SVG');
}

async function savePng() {
  try {
    await deliver(await currentPng(world), fileName('frame', 'png'), 'Saved the PNG');
  } catch (err) {
    status.show(err.message, { error: true });
  }
}

async function deliver(blob, name, message) {
  try {
    const saved = await saveFile(name, blob);
    if (saved) status.show(`${message}: ${name}`);
  } catch (err) {
    status.show(err.message, { error: true });
  }
}

function fileName(kind, ext) {
  const { w, h } = settings.frame;
  return `tcwk-${settings.behaviour}-${kind}-${w}x${h}-${timestamp()}.${ext}`;
}

function toggleClean(force) {
  const on = typeof force === 'boolean' ? force : !app.classList.contains('is-clean');
  app.classList.toggle('is-clean', on);
  const hint = $('clean-hint');
  hint.hidden = !on;
  if (on) setTimeout(() => (hint.hidden = true), 2500);
}

const panel = bindPanel(settings, {
  setBehaviour,
  setFrame,
  setImageCount,
  loadImage,
  toggleSequence,
  renderSequence,
  cancelRender: () => renderJob && renderJob.abort(),
  saveSvg,
  savePng,
  shuffleColours: () => world.shuffleColours(),
  changed(path) {
    if (path === 'colours') world.clearColourLocks();
    if (RESTIPPLE.has(path)) {
      if (settings.behaviour === 'image') imageLab.schedule();
      else imageStale = true;
    }
    if (path === 'image.dot') imageLab.rescale();
    if (path.startsWith('sequence')) syncSequenceSummary();
    persist();
  },
});

bindKeyboard({
  nudge,
  setBehaviour,
  toggleRecord,
  toggleSequence,
  toggleClean: () => toggleClean(),
  exitClean: () => toggleClean(false),
});

$('count-up').addEventListener('click', () => nudge(1, false));
$('count-down').addEventListener('click', () => nudge(-1, false));
$('count-slider').addEventListener('input', (event) => {
  const v = parseFloat(event.target.value);
  setCount(settings.behaviour === 'image' ? Math.round(LIMITS.imageCount.min * Math.exp((v / 1000) * Math.log(LIMITS.imageCount.max / LIMITS.imageCount.min))) : v);
});
$('record-btn').addEventListener('click', toggleRecord);
$('clean-btn').addEventListener('click', () => toggleClean(true));

// --- Readouts ------------------------------------------------------------------

function syncCount() {
  const slider = $('count-slider');
  const image = settings.behaviour === 'image';
  $('count-value').textContent = activeCount();
  $('count-label').textContent = image ? 'circles · detail' : activeCount() === 1 ? 'circle' : 'circles';
  if (image) {
    slider.min = '0';
    slider.max = '1000';
    slider.value = String(Math.round((1000 * Math.log(settings.image.count / LIMITS.imageCount.min)) / Math.log(LIMITS.imageCount.max / LIMITS.imageCount.min)));
  } else {
    slider.min = String(LIMITS.count.min);
    slider.max = String(Math.max(LIMITS.count.slider, settings.count));
    slider.value = String(settings.count);
  }
}

function syncSequenceSummary() {
  const plan = currentPlan();
  const { counts } = plan;
  const first = counts[0];
  const turn = counts.reduce((far, c) => (Math.abs(c - first) > Math.abs(far - first) ? c : far), first);
  const route = counts.at(-1) === first && counts.length > 1 ? `${first} → ${turn} → ${first}` : `${first} → ${counts.at(-1)}`;
  const steps = counts.length - 1;
  $('seq-summary').textContent = `${route} · ${steps} ${steps === 1 ? 'step' : 'steps'} · ${plan.duration.toFixed(1)} s`;
}

function updateReadout() {
  const { w, h } = settings.frame;
  app.style.setProperty('--frame-ratio', `${w} / ${h}`);
  const preset = FRAME_PRESETS.find((p) => p.w === w && p.h === h);
  const parts = [`${w} × ${h} px`, `n = ${world.liveCount}`];
  if (preset) parts[0] += ` · ${preset.label.split('·')[1].trim()}`;
  if (imageBusy) parts.push('placing circles…');
  if (sequence.playing) parts.push(`sequence ${Math.round(sequence.progress(world) * 100)}%`);
  $('readout').textContent = parts.join('  ·  ');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

// --- Loop ------------------------------------------------------------------------

let last = performance.now();
let backlog = 0;

function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (recorder.recording) {
    // Fixed steps of exactly one video frame; see js/export/recorder.js.
    const step = 1 / recorder.fps;
    backlog += dt;
    let steps = 0;
    while (backlog >= step && steps < 2) {
      world.advance(step);
      sequence.update(world);
      recorder.capture(world);
      backlog -= step;
      steps++;
    }
    if (backlog > step) backlog = 0;
    $('record-time').textContent = formatTime(recorder.seconds);
  } else {
    backlog = 0;
    // At most two simulation steps per displayed frame: if a frame runs
    // long, the motion slows for a moment instead of piling up catch-up
    // steps that make the next frame slower still.
    world.advance(Math.min(dt, 1 / 30));
    sequence.update(world);
  }
  stage.draw();
  updateReadout();
  requestAnimationFrame(frame);
}

// --- Start -------------------------------------------------------------------------

function normalise(s) {
  s.frame.w = even(s.frame.w);
  s.frame.h = even(s.frame.h);
  s.colours = PALETTE.filter((c) => s.colours.includes(c));
  if (!s.colours.length) s.colours = [PALETTE[0]];
  if (!BEHAVIOURS[s.behaviour]) s.behaviour = 'fuse';
  s.count = clampInt(s.count, LIMITS.count.min, LIMITS.count.max);
  s.image.count = clampInt(s.image.count, LIMITS.imageCount.min, LIMITS.imageCount.max);
  if (!['solid', 'dotted', 'mixed'].includes(s.style)) s.style = 'solid';
  if (![30, 60].includes(s.export.fps)) s.export.fps = 60;
}

prepareSaving();
syncCount();
syncSequenceSummary();
$('video-support').textContent = videoSupported()
  ? 'MP4 renders at the frame size above. Record captures the stage live; Render MP4 builds a sequence frame by frame.'
  : "This browser can't encode MP4. SVG and PNG still work; use Chrome, Edge or Safari for video.";
if (settings.behaviour === 'image') imageLab.refresh();
requestAnimationFrame(frame);

// Exposed for debugging and automated checks.
window.circleLab = { settings, world, imageLab, actions: { setCount, setBehaviour, setFrame, saveSvg, savePng, toggleRecord, renderSequence } };
