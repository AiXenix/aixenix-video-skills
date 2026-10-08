---
name: law-origami
description: "Law of the method «One sheet» (origami): ONE sheet of A4, never cut, never glued, folds itself on a desk from a printed page into a gear, an arrow and a paper plane; the plane loops, lands and unfolds, and the folded card opens like a book to show the message inside. Every crease it ever made stays on the paper. A procedural ad film (three.js rigid-origami simulation, 1920×1080, 30 fps, 21.3 s, seamless last-bar loop) with a plucked paper-foley score. Use it for an origami / paper-folding / paper-plane / unfold-reveal / crease-pattern video, or to remake the AiXenix ad for another brand. Triggers: origami video, paper folding animation, paper plane ad, folded paper reveal, one sheet no cuts, crease pattern; оригами ролик, складывание бумаги, бумажный самолётик реклама, один лист без разрезов, раскрытие открытки, сделай оригами-видео."
---

# Law: One sheet (origami)

A 21-second advert in which a printed page folds itself into a gear, an arrow and a paper plane, flies a loop, lands, unfolds and opens like a greeting card whose inside is the call to action. It runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`: gate, snap, render, music engine). Notes shared by all the AiXenix ads are in `skills/aixenix-video/SKILL.md`. `example/` is the finished AiXenix ad «Бизнес на автопилоте». Copy it, change the words and colours, and render.

## The law

**Must happen:**
- One sheet with a fixed area: every figure is the same polygons rigidly rotated about crease lines (simple folds), plus one closed linkage for the gear.
- Every crease is born at the moment its fold starts and stays on the paper until the end: shading relief plus a fibre-break line. The final card shows the whole fold history: the pleats of the gear, the centre fold of the card, two fans from the dart plane.
- The paper moves by itself (no hands): it stands up, folds, curls, ticks, flies and lands. Folds land on the beat and are heard as paper.
- The message is printed on the reverse and stays sealed inside until the card opens. The very first fold folds the top half BACK, so the reverse is sandwiched between two layers. After that every fold, the gear's inside and the plane's outside can only show the printed front.
- The final card (brand · slogan · site · paper plane + channel) is held at least 3 s under a low raking light that makes the creases glow.

**Must not happen:**
- Cuts, glue, a second sheet, text or shapes appearing by themselves, stretching or morphing paper.
- The reverse (message side) visible before the card opens. The only exception is a deliberate glimpse while the first fold seals it.
- Flat, emissive "UI card" lighting: the paper must read as paper (fibre, translucency, contact shadow).

**Why viewers read it:** a document everyone recognises does impossible things while staying visibly one piece. Its creases accumulate, so by the end the sheet is a record of everything it did. The reveal is physical: a card opening. Nothing is composited.

## Good for

- Brands about automation, transformation or "one thing becomes many": the routine document turns itself into machines and flies.
- Paper-plane / Telegram calls to action: the plane is the story, not a logo.
- Any message that should arrive as a physical reveal (an invitation, a card, a letter).
- Remakes: change the two printed faces and the palette. The folds and timing carry over.

## Quick start

Run from the plugin root (or anywhere you keep `example/`):

```bash
cp -R skills/law-origami/example my-ad && cd my-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                   # Chromium + WebAudio work
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                    # the gate: exit 0 (cost WARN is normal)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.5    # contact sheet in .frames/
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 5.4,9.0,18.5               # stills at global seconds
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --fixtures=tools/fixtures/origami --times 12.2   # the engine at any T
FILM_NO_NET=1 zsh tools/q.sh node tools/audio/render-audio.cjs && node tools/audio/analyze.cjs .tmp/audio/score.wav --cues
zsh deliver.sh                                                        # master, web, loop, poster, dist/<slug>.html
```

- `deliver.sh` renders `exports/<slug>.mp4` (crf 16, with sound). The slug is the folder name. It also writes `-web.mp4` (crf 23, no audio, faststart, plus `-1280.mp4` if the web file is over 15 MB), `-loop.mp4` (the last shot), `-poster.jpg` and `dist/<slug>.html`.
- `WORKERS=4` speeds up the render. `POSTER_T=18.5` picks the poster frame.
- A full render on a CPU rasteriser takes about 10–15 min.

## Make it yours

All paths are relative to `example/`.

| What | Where |
|---|---|
| Brand wordmark, slogan, site, channel, plane icon | `src/cast.js` → `backCanvas()`: the `'AiXenix'` `fillText`, then `inkText(g, 'Бизнес на автопилоте', …)`, `'aixenix.com'`, `'t.me/aixenix'`, `planeIcon()`. Coordinates are card units (`px(x)`, `py(v)`; the card spans x −1.485..1.485, v −1.05..1.05). |
| Hook on the printed page | `src/cast.js` → `frontCanvas()`: `'Один лист.'` and `'Ни одного разреза.'`. The grey "routine" bars and the table are drawn in the same function. |
| Fonts | The same two functions: `"Futura", "Helvetica Neue", sans-serif` (system fonts, no `@font-face`). Use a face with Cyrillic if you keep Russian text. |
| Colours | `src/lib.js`, palette block `op*`: `opBg`, `opDesk`, `opPaper`, `opInk`, `opInkGrey`, `opMagentaInk`, `opVioletInk`, `opCyanInk` (wordmark gradient), `opKey` (key light), `opRim`, `opAccent` (reveal kicker), `opSky`, `opGround`. |
| Duration / bpm | `src/cast.js`: `BPM` and `TM` (every window is in beats; `TM.loop` is the first beat of the loop bar, `TM.end` the last). `src/timeline.js`: `bpm`, `duration`, `shots[]` and `cues[]` in seconds. Keep them equal to the `TM` beats × 60/bpm. `src/music.js`: `const BEAT` inside `score()`, and the `MIX.ride` times. |
| Camera and light | `src/cast.js`: `CAM` keys (beat, azimuth, elevation, distance, target, fov), `KEY` keys (light azimuth/elevation/intensity/fill), `LX`, `LY` (landing spot = card position). |
| Flight path and timing | `src/cast.js` → `buildFlight()`: loop radius `rho`, tilt `beta`, touch-down `TD`, stop `Lp`, and the `K` keys (beat → distance along the path; touch-down is the 4th key). Probe landmarks with `FILM.origami.keelAt(T)`. |
| Figures | `src/cast.js` → `build()` (the fold program: `F0`, `gear`, `corners`, `edges`, `halving`, `wings`, then the pops) and `gearProfile()` (`GEAR.N` teeth, land/flank angles). The paper size is `A`, `B`. |
| Music | `src/music.js`: `CH`, `PROG`, `ROOT`, `MIX.ride`, `score()`. Note lists: `pleatNotes`, `tickNotes`, `foldNotes`, `mel`, `doorNotes`, `cardMel`. Paper foley: `slap()` and `fold()`. The flight whoosh reads `FILM.origami.keelAt`. |
| Quality vs speed | `src/cast.js` → `CFG` (`msaa`, `shadow`, `bokeh`, `bloom`, `paper`, `desk`, `fxaa`, `deskDof`, `env`, `shadowType`). It can be overridden before the scripts load with `window.FILM = { origami: { cfg: {...} } }`. |

After editing, run the gate, snap the moments you touched, render the audio and check that every cue matches (`analyze.cjs --cues`, 10 ms window).

## How the engine works

Everything lives in `src/cast.js` and runs once at load, then each frame is a pure function of the global time T. All nine scene files just call `FILM.origami.render(ctx, T)`, so the film is one continuous take.

- **Polygons and creases.** The sheet starts as one convex polygon in paper coordinates. A fold op is a line in the current folded state, a moving side and an angle. Each selected polygon that straddles the line is split along it. The split edge is recorded as a crease (paper coordinates, birth time, mountain/valley sign).
- **Configurations.** Every polygon stores its rigid transform per configuration (`cf[cfg]`). Ops form a stack: `pushFold` folds and `popOp` unfolds by exact reversal. A frame interpolates at most one op, with a small bow on the moving flap.
- **Layers.** After each flat fold the layer heights are re-stacked from real overlaps, 0.09 mm per layer. The correction is blended over the fold, so layers never pop.
- **The gear** is a closed planar linkage of 33 panels. The pleats form tooth by tooth: a tooth's four turns sum to zero, so the rest of the strip stays flat. A uniform curl then closes the ring. It spins in eight eased "escapement" ticks.
- **Global placement `G(T)`** covers standing up, the arrow pose, a symmetric body frame for the plane halves, the flight, and the landing. When the card opens, the bottom layer is the anchor and stays still while the top layer swings over.
- **The flight** is a sampled Bezier + tilted-loop path with "up" toward the loop centre. Distance along it is keyed in beats through a monotone cubic.
- **Shading.** The paper is a patched `MeshPhysicalMaterial` with two canvas-printed faces (front document and back card). Every born crease bends the normal and marks a fibre line. Creases are looked up through a 48×34 paper-space cell grid, about 15 per fragment.
- **Translucency.** Back-lit paper glows. The reverse's ink is gated by `uInk`, so the sealed side never leaks.
- **Camera, light, exposure and post** are keyed in beats. A deterministic auto-exposure (area-weighted key-light N·L of the visible faces) only ever darkens. The post chain is half-resolution bloom, vignette, grain and FXAA. A mip-bias blur on the desk texture stands in for depth of field.

## Determinism and gotchas

- **GPU vs SwiftShader.**
  - Headless Chromium usually renders WebGL with SwiftShader, a CPU rasteriser. On this film the tools pass no GL flags, so Chromium picks its default. `tools/common.cjs` adds `--use-angle=swiftshader` only for retro films (when `src/crt.js` exists), and `FILM_GL=gpu` opts out of that.
  - Hashes are reproducible on one machine and backend. Never compare or concatenate frames rendered by different machines or GL backends.
- **Frame cost.** In isolation a frame takes 220–450 ms on SwiftShader. The gate reports a cost WARN, and it reads higher when other Chromium jobs share the CPU. The first frame of a fresh page takes 3–10 s: canvas textures with per-pixel grain, plus building the fold program. MSAA and the Bokeh pass roughly double the cost, which is why they are off.
- **Loop seam.**
  - The loop bar starts at `TM.loop`.
  - Camera and light offsets in it are periodic with a period of one bar.
  - The grain seed wraps by frame index.
  - Check it with `snap.cjs --times <loop start>,<duration>`: the two frames must match.
  - The score's last bar repeats the previous bar's groove: `analyze.cjs --seam`.
- **Keep the reverse sealed.** Any valley fold before `F0`, or a single-layer sheet that is back-lit, will show the message early. `uInk` is 1 only during `F0` and after `TM.open[0]`. Extend that window if you add a deliberate glimpse.
- **Timing changes ripple.** If you move a `TM` window, also update `timeline.js` cues (seconds), the matching `score()` calls, and the `CAM`/`KEY` beats around it.
- **Text in textures.** Printed text is drawn into canvas textures, so the gate's safe-area check cannot see it. Keep the card text inside the sheet yourself, and snap the final card at full scale.
- **Fonts.** On Linux, Futura falls back to another sans, which shifts the card layout. Snap and adjust the sizes in `backCanvas()`.
- **Semaphore.** `zsh tools/q.sh` limits heavy tools to `Q_SLOTS` (default 3) Chromium processes per machine. The lock lives in `${TMPDIR:-/tmp}/procedural-film-q`.

## Files map (`example/`)

| File | Role |
|---|---|
| `src/cast.js` | The origami engine: fold program, gear linkage, flight, G(T), textures, three.js renderer, camera/light tracks, `FILM.origami.render`. |
| `src/timeline.js` | 10 bars at 112.5 bpm = 21.333 s, nine shots (labels on one take), 42 sound cues. |
| `src/scenes/01-page.js … 09-loop.js` | Thin wrappers: `FILM.origami.render(ctx, T)`. |
| `src/music.js` | Engine (kept) + this film's `CH`, `MIX.ride`, `score()`. |
| `src/lib.js` | Shared lib; the `op*` palette block is this film's colours. |
| `src/core.js`, `src/player.js` | FILM runtime and the HTML player. |
| `src/vendor.js` | three.js r180 with add-ons as the global `THREE`. |
| `tools/` | Pipeline tools: `check`, `snap`, `render`, `build`, `audio/*`, `q.sh`. |
| `tools/fixtures/origami/` | One long shot that renders the engine at any global T (look tests). |
| `tools/fixtures/three-test/` | three.js + bloom determinism smoke test. |
| `deliver.sh` | Render and every delivery file. |
| `docs/` | Pipeline templates (contract, art bible, storyboard). |
