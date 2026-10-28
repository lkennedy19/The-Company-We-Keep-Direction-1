# The Company We Keep — Roadmap

Source of truth for planned work. 🟡 = in progress, ⬜ = planned, ~~struck~~ = done (only once Liam has reviewed and approved it).

---

## Phase 1 — Circle Lab: a motion + stills tool for the identity 🟡

A browser tool for exploring the identity as a system of circles "under a microscope": what breaks apart, what fuses together. Modeled loosely on Rethink's RGD Branding Awards system (with circles in place of the R) and the dot-rendered imagery in New Standard's Brandmelder identity, but organic rather than grid-based.

- 🟡 Frame size: presets (16:9, 4K, 1:1, 4:5, 9:16) and custom W × H. Background fixed at `#F2F2ED`.
- 🟡 Circle count from 1 upward (slider to 64, typed values up to 400), every circle the same size by default.
- 🟡 Organic transitions: adding a circle makes a cell divide (it stretches, pinches and separates); removing one makes two neighbours fuse. Big jumps cascade like a chain reaction rather than happening all at once.
- 🟡 Colour: `#B58400`, `#D4B3FF`, `#EA5138` as single colour or a mix, plus click-to-recolour. Solid, dotted outline, or "one solid" (the Concept Illustration look).
- 🟡 Behaviours: Fuse (cluster), Disperse (spread across the frame), Magnet (gather around one nucleus), Image.
- 🟡 Image → circles: upload or drop an image; weighted Voronoi stippling places the circles organically, and the circle count sets the detail. Contrast, cutoff (clears a coloured background behind a logo), invert, even or tone-based sizing.
- 🟡 MP4 export: live recording of whatever happens on stage, plus offline-rendered count sequences (e.g. 1 → 22 → 1) at an exact frame rate.
- 🟡 SVG and PNG export of the current frame.

## Phase 2 — Concept studies ⬜

- ⬜ Saved scenes: name and store a full setup (frame, behaviour, colours, count) per concept so studies can be recalled and re-exported.
- ⬜ Concept library: map Cause+Affect's "company we keep" ideas to behaviours and sequences. The insights page (causeandaffect.com/insights) couldn't be reached from the build session, so the mapping still needs the source material.
- ⬜ Headline/text layer in the frame for slide-style compositions like the Concept Illustration references.

---

## Backlog

- **Design system page** — none exists yet (see CLAUDE.md). The tool's UI tokens currently live in `css/tokens.css`.
- **Deployment** — not set up yet. It's a static site with no build step, so Vercel works as-is; when it's deployed, block `CLAUDE.md`/`ROADMAP.md`/`README.md` from public access the same way the portfolio's `vercel.json` does.
- **SVG blobs as single paths** — fused cells export as circles plus "bridge" paths sharing one fill. They look like one shape but need Pathfinder → Unite in Illustrator to become a single path.
- **MP4 in Firefox** — MP4 export depends on WebCodecs H.264 encoding (Chrome, Edge, Safari). Where H.264 isn't available the tool falls back to VP9-in-MP4, which QuickTime can't open.
- **Colour from image** — in Image mode, pick each circle's colour from the nearest palette colour in the source image instead of the colour controls.
- **Poke / stir** — let the pointer push cells around like a needle under the microscope.
- **Uploaded image persistence** — an uploaded image is held in memory only; reloading the page falls back to the built-in sample.
