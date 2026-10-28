# Circle Lab — The Company We Keep

A browser tool for exploring The Company We Keep identity as circles in motion, as if under a microscope: what breaks apart, what fuses together.

- **Count:** go from 1 circle to 2, 3 … 22 and beyond. Adding a circle makes a cell divide; removing one makes two cells fuse. Big jumps cascade like a chain reaction.
- **Behaviours:** Fuse (one body), Disperse (spread across the frame), Magnet (gather around one nucleus), Image (settle into the shape of a picture).
- **Colour:** `#B58400`, `#D4B3FF`, `#EA5138`, alone or mixed, in solid, dotted, or "one solid" style. Click a circle to recolour it.
- **Image → circles:** upload or drop an image. The circle count sets the detail, and circles are placed organically by weighted Voronoi stippling rather than a halftone grid.
- **Export:** MP4 (record the stage live, or render a count sequence frame by frame), SVG, PNG.

## Run it

No build step. Serve the folder and open it in Chrome, Edge or Safari (MP4 export needs WebCodecs H.264):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` straight from disk won't work, because browsers block ES modules on `file://`.

## Keys

| Key | Action |
| --- | --- |
| ↑ / ↓ | One circle more / fewer |
| Shift + ↑ / ↓ | Five more / fewer (double / halve the detail in Image mode) |
| F, D, M, I | Fuse, Disperse, Magnet, Image |
| R | Start / stop recording |
| Space | Play / stop the sequence |
| H | Clean view (just the frame, for screen capture); Esc to exit |

## Exports

- **Record** captures exactly what happens on stage, at the full frame size and the chosen frame rate. The simulation steps one video frame at a time while recording, so the file is smooth even if the preview isn't.
- **Render MP4** (Sequence panel) builds a count sequence such as 1 → 22 → 1 offline in a fresh simulation, so the result is exact and repeatable.
- **SVG** has one layer per colour, named by hex. Fused shapes are circles plus "neck" paths with the same fill; use Pathfinder → Unite in Illustrator if you need them as single shapes.

## Tests

```sh
npm test
```

Runs headless checks of the simulation (Node 20+).

## Credits

`js/vendor/mp4-muxer.mjs` is [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) 5.2.2 by Vanilagy (MIT), vendored unmodified.
