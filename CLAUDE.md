# The Company We Keep (Direction 1) — Claude Code Instructions

## Read First

Before making **any** change to this codebase:

1. Read `ROADMAP.md` in full. Confirm your change does not conflict with or make harder any planned work. If it does, flag the conflict and ask before proceeding.
2. Check the design system page at `/[ds-location]/` (if one exists) for established patterns, components, and design tokens.

---

## What This App Is

**Circle Lab**: a browser tool Liam uses to explore a brand identity for The Company We Keep as a system of circles in motion, "under a microscope": what breaks apart, what fuses together. You set a frame size, a circle count (1 → 22 and beyond), colours from the brand palette and a behaviour (Fuse, Disperse, Magnet, Image), and the circles spring apart and snap together as the count changes. Images can be rendered in circles: an organic halftone (circle size follows tone, no grid) or even-sized stippling. The visual references are Rethink's RGD Branding Awards identity (with circles in place of the ® symbol) and New Standard's Brandmelder halftone tool. Output is MP4 (live recording or a rendered count sequence), SVG and PNG. It's a static site (HTML/CSS/ES modules, no build step, no runtime dependencies beyond one vendored file) and runs from any static host.

---

## File Structure

```
/
├── CLAUDE.md                 # This file — Claude Code instructions
├── ROADMAP.md                # Feature roadmap and task backlog (source of truth)
├── README.md                 # Project overview, setup, and usage
├── package.json              # No dependencies; `npm test` runs the headless simulation tests
├── index.html                # App shell: stage, transport bar, control panel
├── css/
│   ├── tokens.css            # UI colour/type/spacing tokens (light + dark). Frame colours are NOT here.
│   ├── app.css               # Page shell: stage, transport, panel, clean view, narrow layout
│   └── controls.css          # Buttons, sliders, segmented pills, swatches, progress
├── js/
│   ├── main.js               # Entry point: wires everything together, runs the animation loop
│   ├── config.js             # Brand palette, frame background, presets, limits, DEFAULTS
│   ├── state.js              # Load/save settings (localStorage, guarded)
│   ├── rng.js / math.js / colour.js   # Seeded RNG, easing helpers, hex/RGB helpers
│   ├── sim/
│   │   ├── world.js          # The cell world: cells, bonds, step order, appearance easing
│   │   ├── forces.js         # Behaviour forces (Fuse/Disperse/Magnet/Image), blended by weight
│   │   ├── contacts.js       # Overlap resolution between cells
│   │   ├── lifecycle.js      # Division and fusion: scheduling, bonds, cascades
│   │   ├── image-targets.js  # Matching cells to stipple points; recursive group splitting
│   │   ├── spatial-grid.js   # Neighbour grid rebuilt each step
│   │   └── point-index.js    # Nearest-point lookup with removal (target matching)
│   ├── render/
│   │   ├── scene.js          # World → flat drawable scene (shared by every renderer)
│   │   ├── bridge.js         # Metaball "neck" geometry (Goo only)
│   │   ├── canvas.js         # Scene → 2D canvas (the reference renderer)
│   │   ├── webgl.js          # Scene → WebGL2 instanced discs (solid-circle scenes; fast at 10k+)
│   │   ├── preference.js     # ?renderer=gpu|2d override for troubleshooting
│   │   └── svg.js            # Scene → SVG markup
│   ├── image/
│   │   ├── image-lab.js      # Source image → stipple targets; re-stipples on changes
│   │   ├── density.js        # Image → ink map (auto levels, contrast, midtones, cutoff, invert)
│   │   ├── stipple.js        # Weighted Voronoi stippling (Lloyd relaxation), uniformity + cell areas
│   │   ├── stipple-worker.js # Runs stipple.js off the main thread; posts an early result first
│   │   └── sample.js         # Built-in sample image (three shaded spheres, drawn in code)
│   ├── export/
│   │   ├── video-writer.js   # WebCodecs H.264 → MP4 via mp4-muxer
│   │   ├── recorder.js       # Live recording of the stage
│   │   ├── sequence.js       # Count sequence planning + live playback
│   │   ├── sequence-export.js# Offline, frame-exact sequence render
│   │   ├── stills.js         # SVG and PNG of the current frame
│   │   ├── frame-canvas.js   # Full-resolution render canvas (GPU for video frames when possible)
│   │   └── save-file.js      # Download link, or the artifact viewer's `downloads` capability
│   ├── ui/
│   │   ├── stage.js          # Preview fit/draw + pointer (click recolours, drag moves)
│   │   ├── panel.js          # Binds the control panel to settings
│   │   ├── keyboard.js       # Shortcuts
│   │   └── status.js         # Toast messages
│   └── vendor/
│       └── mp4-muxer.mjs     # mp4-muxer 5.2.2 (MIT), vendored unmodified with its licence header
└── tests/
    ├── sim.test.mjs          # Node tests: counts converge, cascades are fast, image targets match, resize
    └── image.test.mjs        # Node tests: stipple vs halftone layouts
```

---

## Key Rules

### Scope & Approach

1. **Stay in scope.** Only make changes related to the current task. If you notice something else that needs fixing, note it in the Backlog section of ROADMAP.md — don't fix it.
2. **Understand before building.** Before building anything from scratch, understand the purpose of the application and the context of what already exists. Ask clarifying questions if the intent isn't clear.
3. **Build modularly.** Design components, modules, and data structures to be reusable and self-contained. Prefer small, focused files over monoliths.
4. **No surprise refactors.** Never delete or refactor working code without asking first. If you think something should be restructured, explain why and wait for approval.

### Development Philosophy

5. **Build in small, testable steps.** Each change should leave the app in a working state. Break large features into increments that can be tested and verified independently before moving on.
6. **Prototype risky features in isolation.** When a feature involves unfamiliar APIs, complex integrations, or uncertain approaches, build a minimal standalone proof of concept first. Validate that it works, understand the failure modes, then fold it into the main app. Flag when you think something warrants a prototype.
7. **Think about what comes next.** Before implementing, consider how this task fits into the broader roadmap. Choose data structures, field names, and patterns that won't need to be reworked when later features arrive. If a planned feature defines a field name or pattern, use it.

### Code & File Conventions

8. **Keep files small.** If a file is getting large, split it into focused modules. Use clear, descriptive filenames.
9. **No inline CSS or JS in HTML files** (unless the project explicitly calls for it). Styles and logic go in their own files. Exception: JSON-LD `<script type="application/ld+json">` blocks and analytics snippets (e.g. GA4) belong in the HTML.
10. **Mobile-first by default.** All UI work should be responsive and consider mobile as the primary target. Test or reason through mobile behaviour for any UI change.

### Design System

11. **Check the design system first.** Before creating new UI components or styles, check the design system page for existing patterns. If no design system page exists yet, flag this and ask about setting one up.
12. **Keep the design system in sync.** Whenever you change CSS, layout, component structure, colours, typography, or spacing, check whether the design system page needs updating. If it does, update it in the same commit.

### Roadmap & Task Tracking

13. **ROADMAP.md is the source of truth** for planned work. Read it before every task.
14. **Update ROADMAP.md as you work.** When you begin a task, mark it 🟡 (in progress). Do **not** mark tasks ~~complete~~ until the user has reviewed and approved the work.
15. **Add discovered work to the Backlog.** If you find bugs, tech debt, or ideas during development, add them to the Backlog section of ROADMAP.md rather than acting on them immediately.

### Git & Deployment

16. **Commit after every completed task.** Write clear, descriptive commit messages. One logical change per commit.
17. **Never commit secrets, API keys, or environment-specific config.** Use `.env` files, config templates, and `.gitignore`.

---

## Data Formats

**Settings** (`DEFAULTS` in `js/config.js`) are one plain object shared by the UI and the simulation. The world reads it live every step, so changing a value animates rather than cuts. It's saved to `localStorage` under `tcwk-circle-lab:v1`; `state.js` only merges keys that exist in `DEFAULTS` with matching types, so renaming a field drops the stored value instead of breaking anything. `upgrade()` in `state.js` discards image settings saved before `method` existed (they were tuned for even dots).

```js
{
  frame: { w: 1920, h: 1080 },      // even numbers only (H.264 needs them)
  behaviour: 'fuse',                // fuse | disperse | magnet | image
  count: 5,                         // circle count for fuse/disperse/magnet
  size: 0.8,                        // lone-circle diameter as a fraction of the frame's short side
  shrink: 0.5,                      // radius ∝ count^-shrink (0 = constant size, 0.5 = area kept)
  spacing: 0, variety: 0, life: 0.35, goo: 0, tempo: 0.5,
  colours: ['#B58400'],             // subset of PALETTE, palette order, never empty
  style: 'solid',                   // solid | dotted | mixed ("One solid": the nucleus solid, the rest dotted)
  anchor: { x: 0.5, y: 0.5 },       // normalised centre the cells gather around
  image: { count, dot, method: 'halftone' | 'stipple', levels, contrast, midtones, cutoff, invert, scale, showSource },
  sequence: { from, to, step: 'one' | 'double', hold, pingpong },
  export: { fps: 30 | 60, quality: 'standard' | 'high' | 'max', transparent },
  seed: 7,
}
```

**Palette and background** are fixed brand values in `js/config.js`: `PALETTE = ['#B58400', '#D4B3FF', '#EA5138']`, `FRAME_BACKGROUND = '#F2F2ED'`. Change them there only.

**Image targets** (from `image-lab.js` to `world.setImage`): `{ aspect, targets: [{ u, v, rho, area, rn }] }`. `u`/`v` are 0–1 positions in the image, `rho` is the ink under the point, `area` is its Voronoi cell size in density-map pixels, and `rn` is the radius as a fraction of the image width. The world places them through `world.imageRect` (contain-fit × `image.scale`, centred on the anchor), so moving the anchor or changing the scale needs no re-stipple. Dot size rewrites `rn` in place; count, method, levels, contrast, midtones, cutoff and invert re-stipple (main.js `RESTIPPLE`).

**Image methods** (why there are two, so neither gets "simplified" away):
- `halftone` (default): points laid out nearly evenly (stipple `uniformity` 0.65, so slightly denser in dark areas) and each circle's *area* follows the ink (`r = 0.55 × cell spacing × √ink × dot`). Tone is carried by size, like Brandmelder's halftone but on an organic blue-noise layout. Circles with almost no ink are dropped. This is what makes photos legible.
- `stipple`: classic weighted Voronoi stippling, every circle the same size and tone carried by density alone (the RGD portrait look). Photos read as noise unless they're contrasty and the count is high.
- Both depend on **auto levels** (stretch the 1st–99th percentile of luminance to full range). Without it most photos sit in mid-grey and every circle looks alike, which was the original "not legible" bug.

**How the motion works** (so changes stay consistent):
- Adding a circle = a **division**: a daughter is born inside its parent and a `divide` bond springs them apart along a damped-spring step response (`springStep` in `lifecycle.js`, ≈16% overshoot), then they settle. Removing one = a **fusion**: a `fuse` bond pulls two cells together on an accelerating curve (like magnets snapping), the absorbed one slides under and is removed, and the survivor gets a radius kick (`ABSORB_POP`) so it visibly pops. The older cell survives, so Magnet's nucleus persists. **No metaball necks during transitions** — Liam found the necks "gloopy"; necks now only appear for the optional Goo style at rest.
- Radii follow a damped spring too (`RADIUS_DAMPING` in `world.js`), and contacts are damped springs plus a hard correction beyond a small slack (`contacts.js`), so newborn cells shove the cluster outward with a little bounce.
- **Timing:** `world.genTime` is the length of one cascade generation (`generationTime` in `lifecycle.js`). A single step (4 → 5) gets a comfortable beat; a big jump (1 → 64, or 3 → 6,000 image circles) divides the time budget by the number of doublings needed, so any cascade finishes in about 1–2.5 s at the default tempo. Liam asked for big jumps to be quick, so keep that budget when tuning.
- Cells only divide/fuse when "mature", which turns big jumps into cascades (1 → 2 → 4 → 8 …).
- Cells keep their own colour through divisions and fusions. A different-coloured daughter or absorbed cell is drawn on an "under" layer and slides out from / under its partner, so colours never mix into off-palette tones.
- In Image mode, extra targets are handed out by recursive division (a cell's group of targets splits in half along its longer side at each division), and surplus cells become orphans that fuse into neighbours. The stipple worker posts an early, partly relaxed layout so cells start moving before the final one arrives.
- Behaviours never switch abruptly: `world.weights` eases toward the selected behaviour and every force is weighted by it.
- While recording, the loop advances the world in fixed steps of exactly one video frame (`js/main.js`), so MP4s are smooth regardless of display refresh rate or machine speed. Outside recording, the loop takes at most two 1/60 s steps per displayed frame, so a slow frame can't snowball.

**Rendering:** `scene.js` builds one drawable description per frame. Scenes made only of solid circles (no dotted circles, Goo or source ghost) are drawn by `webgl.js` (instanced anti-aliased discs) on the stage and in video frames; everything else, and every PNG and SVG, goes through `canvas.js`/`svg.js`. `webgl.js` refuses software-emulated WebGL (it's slower than 2D there). If the two ever disagree visually, `canvas.js` is the reference; `?renderer=2d` or `?renderer=gpu` in the URL forces a path.

---

## Deployment

Not deployed yet (see ROADMAP backlog). It's a static site with **no build step**: serve the repo root from any static host (Vercel works as-is). ES modules don't load from `file://`, so locally run a server from the repo root, e.g. `python3 -m http.server 8000`, and open `http://localhost:8000`.

- **MP4 export** uses WebCodecs `VideoEncoder` (H.264 High profile, falling back to VP9-in-MP4) plus the vendored `js/vendor/mp4-muxer.mjs`. Works in Chrome, Edge and Safari; there's no server-side encoding.
- **Hosted as a claude.ai artifact** too. Artifacts can't start downloads themselves, so `js/export/save-file.js` uses the viewer's `downloads` capability when `window.claude` is present and falls back to a normal download link everywhere else. The artifact page is the same app with the `<!doctype>/<html>/<head>/<body>` wrapper stripped (the artifact host adds its own).
- **Tests:** `npm test` (Node 20+) runs the headless simulation and stippling tests in `tests/`.
- **Renderer override:** `?renderer=2d` forces the 2D canvas, `?renderer=gpu` forces WebGL even when it's software-emulated (both for troubleshooting; artifacts don't pass query strings).

---

## Design System

⚠️ **No design system page has been set up yet** — flagged to Liam when the Circle Lab UI was built; ask before creating one.

Two separate visual layers, deliberately kept apart:
- **The frame (the work itself):** background `#F2F2ED` and the palette `#B58400`, `#D4B3FF`, `#EA5138`, defined in `js/config.js`. Never themed, never touched by UI tokens.
- **The tool's UI:** tokens in `css/tokens.css` (light values on `:root`, dark values under `prefers-color-scheme: dark` and `[data-theme="dark"]`). Warm greys biased toward the frame background; ink-coloured selected states so brand colours only ever appear as content. Type: Instrument Sans for UI text, Geist Mono for readouts, labels and numbers (Google Fonts, with system fallbacks). Shapes echo the identity: pill buttons, round slider thumbs, circular swatches.
