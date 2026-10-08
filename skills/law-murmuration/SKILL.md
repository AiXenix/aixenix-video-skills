---
name: law-murmuration
description: "Law of the method: nothing is drawn, the flock makes everything. A living murmuration of 30 000 starlings at sunset forms every shape and every letter. A swirling sheet of birds becomes a hook line, turning gears, a rising arrow, a slogan and a paper plane, then the brand card with URLs, while the birds keep flapping, banking and rippling with dark density waves. Use for a brand or promo video where thousands of small decisions add up to one intelligent shape (AI, automation, teams, networks, community), or when the user asks for a murmuration, a flock-of-birds logo reveal or a swarm that writes text. Triggers: murmuration video, flock of birds forms the logo, starlings write text, swarm typography, birds form letters, мурмурация, стая птиц складывается в логотип, скворцы пишут текст, птицы образуют буквы, ролик со стаей."
---

# law-murmuration: the flock makes everything

This is a worked example of one law, packaged as a project you can copy and re-brand. It runs on the
procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`): the gate, snap,
render and build tools all come from there. The notes shared by all ten AiXenix ads are in
`skills/aixenix-video/SKILL.md`. The ready project is in `example/` (shipped film: 1920x1080, 30 fps,
90 bpm, 8 bars = 21.33 s, the last bar a seamless loop).

## The law

Nothing is drawn. Every shape and every letter on screen is the emergent silhouette of a living
flock of starlings (30 000 by default) over a sunset city.

**Must:**
- Birds stay birds the whole time. Each one flaps on its own phase (a whole number of beats per
  bar), glides in spells, banks, and leaves motion streaks when it is fast.
- Each figure is a target set: points sampled from glyphs (Futura Bold), gears, an arrow or a paper
  plane. Every bird keeps its identity from figure to figure.
- Transitions are flight: departures sweep across the flock, paths arc round a pivot, and the
  birds pass through visible chaos before the next figure snaps in.
- Dark density waves (a band of birds rolling their wings broadside) cross the held figures on the
  beat. These waves are the signature of a real murmuration.
- Text stays readable for at least 2 s, and the final card for at least 3 s.

**Must not:**
- No vector shape or font is ever drawn on top. If a frame could be made with "particles into
  text", it fails the law.
- No figure freezes solid: outlines breathe, birds orbit their spots, and stragglers circle in
  loose mini-flocks.

**Why viewers read it:** they first see a believable murmuration (a folding sheet with dark folds,
stragglers and three birds passing close to the camera). So when the same birds stream into words,
the brain keeps reading them as birds deciding together. That is the metaphor: no pilot, yet one
intelligent shape, a business on autopilot.

## Good for

- AI and automation, swarm intelligence, teams, networks, communities, "many small actions -> one
  result".
- Logo reveals and slogan videos with up to 4 text moments, landscape or square.
- Any brand that wants a calm, epic, golden-hour mood rather than tech neon.

## Quick start

Run from a fresh copy of `example/` (the slug of the outputs is the folder name):

```bash
cp -R example/ ~/my-murmuration && cd ~/my-murmuration
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                            # toolchain alive
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                              # the gate: exit 0 (a cost WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.25   # whole film on one sheet
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/murmuration  # the 5 s hero fixture
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --workers 4                 # exports/<slug>.mp4, crf 16 + audio
zsh deliver.sh                                                                 # -web, -web-1280, -loop, -poster
FILM_NO_NET=1 node tools/build.cjs                                             # dist/<slug>.html player
```

- Each snap, check or render opens the page once and precomputes the whole flock simulation first
  (about 5 s on a laptop).
- Audio alone: `FILM_NO_NET=1 node tools/audio/render-audio.cjs`, then
  `node tools/audio/analyze.cjs .tmp/audio/score.wav --cues`.
- `tools/q.sh` caps parallel Chromium runs. The default is 3; set `Q_SLOTS=N` to change it.

## Make it yours

All paths are relative to `example/`.

- **Texts (four text moments):** in `src/cast.js`, edit `FL.SCRIPT.formations` and change the
  `textPainter('…', x, baselineY, fontPx, { spacing })` calls:
  - formation `id: 'hook'`: `'30 000 ПТИЦ'` and `'НИ ОДНОГО ПИЛОТА'`
  - formation `id: 'auto'`: `'БИЗНЕС НА'` and `'АВТОПИЛОТЕ'`
  - formation `id: 'card'`: `'AiXenix'`, `'БИЗНЕС НА АВТОПИЛОТЕ'`, `'aixenix.com'` and
    `'t.me/aixenix'`
- **URLs:** the two URL strings are also measured in `cardLayout()` (same file) to centre the row;
  change them in both places. `cardLayout()` also holds `fUrl` (URL font size), `base` and `iy`.
- **Font:** `FONT` in `src/cast.js`. Use a system font that has your script (Cyrillic: Futura,
  Helvetica Neue, Avenir Next). Never `@font-face`.
- **Shapes:**
  - gears: `gearPath(...)` in formation `gears`, with `Z1`, `Z2`, `GEAR_W` and the `ALPHA`/`GD`
    centre geometry
  - arrow: the `pts` list in formation `chart`
  - plane: the `PLANE` vertices and the flight path `planeAt()`
  - extra figures: add a formation with a `build: (n) => sampleClasses(W, H, [{ paint(g) {…} }], n, seed)`
- **Colours:** the subject block in `src/lib.js` `pal`: `skyTop … skyHorizon`, `sun*`, `cloud*`,
  `city*`, `rimLight`, `windowWarm`, `beacon`, and `birdInk` (the bird silhouette).
- **Flock:** in `FL.SCRIPT`, set `N` (bird count), `freeFrac` (stragglers), `birdLen` (px),
  `headWeight` (how aligned the headings are) and `near` (birds passing close to the camera). Per
  formation:
  - `size`, `zOff`, `ripple` (outline breathing in px)
  - `swing` + `pivot` (the arc of the transit)
  - `stagger` (departure sweep), `bulge`, `orbit`
  - `halo` (where the stragglers wait)
- **Waves:** `FL.SCRIPT.waves`, as `{ t, x, y, ang, speed, width, life, lead }`. Keep any wave in the
  last bar finished inside the bar.
- **Timing / bpm / duration:**
  - `BPM` in `src/cast.js`. The script times are beats via `b(n)`: `duration`, `loopStart`, every
    `t0`, and the wave `t` values.
  - `src/timeline.js`: `bpm`, the `b()` helper, `duration`, `shots` and `cues`. Every cue must have
    a sound at its exact time.
  - Keep `FPS * 15 / bpm` whole (at 30 fps: 90, 112.5, 75 …) and the duration a whole number of bars.
- **Music:** in `src/music.js`:
  - `CH`, `CHORDS` and `SUBS` (one chord and one sub note per bar)
  - `choir()` (formant "aah" pad), `wings()` (flap-grain rush), `whoosh()` (the panned wave sound),
    `call()` and `hit()`
  - `score()`, and `MIX.ride` and `MIX.trim` for loudness (≈ −16 LUFS)

  Check the score with `analyze.cjs --cues` (0 misses).

## How the engine works

- **Targets.** A figure is rasterised on a canvas and sampled with Floyd-Steinberg dithering into
  exactly the number of non-straggler birds. A chamfer distance transform makes stroke spines
  denser, and edge birds smaller (`sampleClasses`).
- **Identity.** On every call, birds are matched to targets by strip-sorted (Knothe-Rosenblatt)
  matching plus local swap refinement (`krMatch`). Neighbours stay neighbours and paths do not
  cross.
- **Simulation.** A fixed step of 1/30 s from T = −2 s. Each bird is steered toward its moving
  target (PD with feed-forward), plus:
  - separation down a density grid
  - alignment on a velocity grid
  - a curl-noise wind and a personal wander

  Positions are stored per frame as 1/16 px Int16 (about 100 MB for 30 000 birds × 641 frames).
- **Swirl.** The opening murmuration is a lumpy disc of birds circulating inside a sheet that
  undulates in depth, turns and tilts. Where the sheet is edge-on it folds into dark bands.
- **Transit.** Each bird departs at its own staggered time and blends from the old slot to the new
  one with an eased bulge and a swing round a pivot.
- **Loop.** The last bar is drift-corrected so that frame `end` equals frame `loopStart`. Wing
  beats, glides, orbits and halos use whole cycles per bar, and the wave clock wraps.
- **Render.**
  - Plates are painted once on 2D canvases: the sky with the sun and shafts, fbm clouds lit from
    the sun side, three haze layers of city with rim light, windows and beat-blinking beacons.
  - The birds are three.js `Points`, one sprite per bird. The fragment shader draws the starling
    (body, swept wings with elbow, short tail), rotated to its heading, wings at the flap phase,
    stretched by speed, tinted by depth haze sampled from the sky texture.
- **Waves.** A Gaussian band in world space sets the dark crest (wider wings, less haze, birds
  pulled in) and the lighter flanks.

## Determinism and gotchas

- **GPU vs SwiftShader.** Headless Chromium on most machines renders WebGL with SwiftShader (CPU).
  - This film was gated and rendered that way.
  - Hashes are stable on one machine and backend. A real GPU gives slightly different pixels, so
    never mix backends between a gate run and its reference.
  - `FILM_GL=gpu` only affects retro (CRT) films in `tools/common.cjs`. This project does not force
    any ANGLE backend.
- **Point sprites, not instancing.** Instanced meshes were about 12× slower under SwiftShader.
  - Sprite cost grows with motion streaks (`speed * 0.55`, capped at 13 px), so fast transit frames
    cost 200–450 ms.
  - The mean is about 100 ms, which the gate allows (WARN above 150 ms, average must stay ≤ 400 ms).
- **Precompute on first draw.** About 5 s for 30 000 birds. Halving `N` roughly halves both the
  precompute and the frame cost.
- **Purity.** No `Math.random`, `Date` or `performance.now` anywhere in `src/` (the gate scans
  for them). All randomness comes from `hf()`/`rng()` seeded by bird index. The simulation is
  replayed identically on every load, and caches (plates, GL buffers) never change pixels.
- **Readability.**
  - Dense letters read as texture at 1:1 but as solid words on a phone.
  - Keep small text (URLs) at ≥ 100 px font with `density` ≥ 1.8 and bird `size` ≈ 0.6.
  - Keep all text above the skyline (y < 840) and away from the brightest sun glow.
- **Loop seam.** Check it numerically. The mean pixel difference between frame `end−1` and frame
  `loopStart` should equal a normal frame step.
- **Audio cues.** Cue detection high-passes at 500 Hz and needs a 6 dB rise within 12 ms, so every
  cue gets a short `snap()` transient.

## Files map

| Path in `example/` | What it is |
|---|---|
| `src/cast.js` | `FILM.flock`: sampler, matching, simulation, plates, GL birds, render, and `FL.SCRIPT` (the film) |
| `src/timeline.js` | bpm, duration, the 8 shots (one continuous take), and the audio cues |
| `src/scenes/01-dusk.js … 08-loop.js` | one per shot; each calls `FILM.flock.render(ctx, info.T, FILM.flock.SCRIPT)` |
| `src/music.js` | engine (keep) plus the score: choir, wing rush, shakers, hits, whooshes |
| `src/lib.js` | pipeline lib; the subject palette is in `pal` |
| `src/vendor.js` | three.js r180 as global `THREE` (prelude, excluded from scans) |
| `src/core.js`, `src/player.js`, `src/props.js` | pipeline runtime and player (unchanged) |
| `tools/` | gate, snap, render, build, audio analysis, fixtures, and `q.sh` (render semaphore) |
| `tools/fixtures/murmuration/` | 5 s hero fixture (swirl → «БИЗНЕС НА АВТОПИЛОТЕ» with a wave) |
| `tools/fixtures/three-test/` | three.js + determinism smoke fixture |
| `deliver.sh` | web, loop and poster transcodes from `exports/<slug>.mp4` |
| `docs/` | pipeline contract and templates |
