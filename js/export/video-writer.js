// Encodes canvas frames to an MP4 file in the browser: WebCodecs does the
// H.264 encoding, mp4-muxer (vendored) wraps the frames into an .mp4.
// Frames get exact timestamps (frame index ÷ fps), so the video plays
// smoothly even if the machine rendered it slower than real time.

import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';

// High profile at the highest level first so 4K works; fall back through
// lower profiles. VP9-in-MP4 is the last resort for browsers without an
// H.264 encoder (it plays in browsers but not QuickTime).
const AVC_CODECS = ['avc1.640034', 'avc1.640033', 'avc1.64002A', 'avc1.640028', 'avc1.4D0034', 'avc1.42003E', 'avc1.42001F'];
const VP9_CODECS = ['vp09.00.51.08', 'vp09.00.41.08', 'vp09.00.10.08'];

// Megabits per second at 1920 × 1080, 60 fps. Flat colour compresses well;
// the extra bitrate keeps circle edges crisp.
const QUALITY = { standard: 8, high: 16, max: 32 };

export function videoSupported() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export function bitrateFor(width, height, fps, quality) {
  const base = (QUALITY[quality] || QUALITY.high) * 1e6;
  return Math.round(base * ((width * height) / (1920 * 1080)) * Math.sqrt(fps / 60));
}

async function pickConfig(width, height, fps, bitrate) {
  const candidates = [
    ...AVC_CODECS.map((codec) => ({ mux: 'avc', config: { codec, avc: { format: 'avc' } } })),
    ...VP9_CODECS.map((codec) => ({ mux: 'vp9', config: { codec } })),
  ];
  for (const candidate of candidates) {
    const config = { ...candidate.config, width, height, bitrate, framerate: fps, latencyMode: 'quality' };
    try {
      const { supported } = await VideoEncoder.isConfigSupported(config);
      if (supported) return { mux: candidate.mux, config };
    } catch {
      // Try the next one.
    }
  }
  return null;
}

export async function createVideoWriter({ width, height, fps, quality }) {
  if (!videoSupported()) {
    throw new Error("This browser can't encode video. Use Chrome, Edge or Safari to export MP4.");
  }
  const picked = await pickConfig(width, height, fps, bitrateFor(width, height, fps, quality));
  if (!picked) {
    throw new Error(`This browser can't encode ${width} × ${height} video. Try a smaller frame size.`);
  }

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: picked.mux, width, height, frameRate: fps },
    fastStart: 'in-memory',
  });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (err) => {
      failure = err;
    },
  });
  encoder.configure(picked.config);

  const frameDuration = 1e6 / fps;
  let frames = 0;

  return {
    codec: picked.mux,
    get frames() {
      return frames;
    },
    add(canvas) {
      if (failure) throw failure;
      const frame = new VideoFrame(canvas, {
        timestamp: Math.round(frames * frameDuration),
        duration: Math.round(frameDuration),
      });
      encoder.encode(frame, { keyFrame: frames % (fps * 2) === 0 });
      frame.close();
      frames++;
    },
    // Waits for the encoder to catch up, so an offline render doesn't pile
    // thousands of frames into memory.
    async drain(limit = 8) {
      while (encoder.encodeQueueSize > limit && !failure) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      if (failure) throw failure;
    },
    async finish() {
      await encoder.flush();
      if (failure) throw failure;
      muxer.finalize();
      encoder.close();
      return new Blob([muxer.target.buffer], { type: 'video/mp4' });
    },
    cancel() {
      try {
        encoder.close();
      } catch {
        // Already closed.
      }
    },
  };
}
