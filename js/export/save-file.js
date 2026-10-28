// Hands a generated file (MP4, SVG, PNG) to the person. When the tool runs
// inside a claude.ai artifact the page can't start downloads itself, so it
// asks through the viewer's `downloads` capability; everywhere else (local,
// Vercel) it uses an ordinary download link.

let hostSaver;

function getHostSaver() {
  if (hostSaver === undefined) {
    const claude = typeof window !== 'undefined' ? window.claude : undefined;
    hostSaver = claude && typeof claude.use === 'function'
      ? claude.use('downloads').catch(() => null)
      : Promise.resolve(null);
  }
  return hostSaver;
}

// Call early so the first save doesn't wait on the capability handshake.
export function prepareSaving() {
  getHostSaver();
}

// Resolves true when the file was handed over, false if the person declined.
export async function saveFile(filename, blob) {
  const host = await getHostSaver();
  if (host) {
    try {
      await host.save({ filename, data: blob });
      return true;
    } catch (err) {
      if (err && err.code === 'declined') return false;
      throw new Error((err && err.message) || 'The file could not be saved.');
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

export function timestamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}
