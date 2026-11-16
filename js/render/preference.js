// Which renderer to use: 'auto' (GPU when it's real hardware, else 2D),
// 'gpu' (always try the GPU, even emulated) or '2d'. Set with ?renderer=…
// in the page URL, for troubleshooting a machine where one path misbehaves.

export function rendererPreference() {
  try {
    const value = new URLSearchParams(location.search).get('renderer');
    return value === 'gpu' || value === '2d' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

export function glOptions() {
  const pref = rendererPreference();
  return { enabled: pref !== '2d', allowSoftware: pref === 'gpu' };
}
