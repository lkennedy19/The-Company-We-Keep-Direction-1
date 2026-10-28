// Settings persistence. Settings are a plain object shared by the UI and the
// simulation; they're remembered per browser so a study survives a reload.
// Storage can be unavailable (private windows, sandboxed previews), so every
// access is guarded and the defaults always work on their own.

import { DEFAULTS } from './config.js';

const STORAGE_KEY = 'tcwk-circle-lab:v1';

export function loadSettings() {
  const settings = structuredClone(DEFAULTS);
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) mergeKnown(settings, upgrade(JSON.parse(raw)));
  } catch {
    // Fall back to defaults.
  }
  return settings;
}

let saveTimer = 0;

export function saveSettings(settings) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Not persisted; the session still works.
    }
  }, 250);
}

// Image settings saved before the halftone method existed (they have
// `sizing` instead of `method`) were tuned for even-sized dots and make the
// halftone look weak, so they start fresh; everything else is kept.
function upgrade(stored) {
  if (stored && stored.image && !('method' in stored.image)) delete stored.image;
  return stored;
}

// Copies values from `source` only where `target` already has a key of the
// same type, so stale or hand-edited storage can't inject unknown settings.
function mergeKnown(target, source) {
  if (!source || typeof source !== 'object') return;
  for (const key of Object.keys(target)) {
    if (!(key in source)) continue;
    const current = target[key];
    const incoming = source[key];
    if (Array.isArray(current)) {
      if (Array.isArray(incoming)) target[key] = incoming.slice();
    } else if (current && typeof current === 'object') {
      mergeKnown(current, incoming);
    } else if (typeof incoming === typeof current) {
      target[key] = incoming;
    }
  }
}
