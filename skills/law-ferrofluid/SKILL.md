---
name: law-ferrofluid
description: "Invisible-magnet ferrofluid film law: a pool of black magnetic fluid on polished steel where an invisible field \"types\" every image — the liquid swells under a shape, then snaps into sharp Rosensweig spikes (hexagonal lattice) on the beat and slumps back into a mirror. No drawn graphics: words, logos, icons and the end card are born from the liquid and its reflections; the CTA is etched in the steel. Use for a 18–24 s product or brand ad / logo reveal / premium tech teaser (AI, automation, 'invisible force' metaphor), rendered in three.js and fully deterministic. Triggers: ferrofluid ad, magnetic liquid logo, Rosensweig spikes, invisible force video, black liquid reveal; феррофлюид, магнитная жидкость, ролик с феррожидкостью, шипы из жидкости, невидимая сила, логотип из магнитной жидкости."
---

# law-ferrofluid — the invisible magnet

A procedural ad in which an invisible force does all the work. It runs on the procedural-film pipeline
bundled in this plugin (`skills/procedural-film/SKILL.md`: the gate, snap, render, beat grid), with the
notes shared by all ten AiXenix laws in `skills/aixenix-video/SKILL.md`. The finished example
(«Феррофлюид», AiXenix — «Бизнес на автопилоте», 100 bpm, 9 bars, 21.6 s, 1920×1080, 30 fps) is in
`example/`.

## The law

One physical set: a puddle of black ferrofluid on a spun-steel plate, lit by a dark studio. An
invisible magnet field under the plate is the only cause of every image.

Must happen:
- Every shape (word, ring, gear, plane, logo) is the liquid answering the field: first a sub-critical
  **swell** (the fluid heaps under the shape and draws a shallow trough around it), then on the beat
  the field crosses the critical value and the surface **snaps into Rosensweig spikes**, centre first.
- Spikes stand on a hexagonal lattice; each cone samples the field at its own lattice site, so cones
  rise whole. When the magnet turns (gear) or travels (plane), the lattice travels with it.
- Switching the field sends ripples across the mirror; switching it off slumps the spikes back flat.
- The black liquid is shown only through reflections (strip boxes, a softbox behind the shape, cyan
  and magenta accents). Colour lives in the reflections, never in the liquid.
- The only non-liquid text is the CTA etched into the steel rim, revealed by a light sweep.

Must not happen: drawn overlays, kinetic type, letter-by-letter typing, particles, glows on flat text,
camera fly-arounds that do the storytelling, anything the field could not have done.

Why viewers read it: the macro opening shows a single spike, then 7, then 19 — the lattice and the
cause are learned in two seconds; after that every word is obviously "pulled out" of the liquid.

## Good for

- Brand / logo reveals and end cards for tech, AI and automation ("an invisible force puts things in order").
- Premium product teasers where a dark, glossy, reflective look fits.
- Short words and simple icons (gear, plane, ring, arrow). Long sentences do not read in spikes:
  keep to ≤ 2 lines of ≤ 10 bold letters per text moment.

## Quick start

Run from a fresh copy of `example/` (macOS with a GPU renders ~0.2–0.5 s per frame; see the GPU notes).

```bash
cp -R example/ ~/my-ferro-ad && cd ~/my-ferro-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                      # browser + audio work
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                      # the gate: exit 0 (WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/ferro   # one hero frame
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.5 --out .frames/sheet
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 3.4,10.6,18.0 --out .frames/key
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --workers 2       # exports/<folder>.mp4 with sound
zsh deliver.sh                                                          # gate + master + web/1280/loop/poster + html
```

`deliver.sh` names the outputs after the folder (`SLUG=name zsh deliver.sh` overrides; `POSTER_T`
picks the poster time, `WORKERS` the render pages). `tools/q.sh` is a machine-wide semaphore
(`Q_SLOTS`, default 3) so parallel runs never start too many Chromium instances.

## Make it yours

All paths are relative to `example/`.

- **Words in spikes** — `src/cast.js`, inside `drawField(T)`: the `letters(g, 'НЕВИДИМАЯ', …)`,
  `'СИЛА'`, `'БИЗНЕС НА'`, `'АВТОПИЛОТЕ'` and `'AiXenix'` calls. Arguments: string, centre x, centre z
  (world units, pool centre `PC`), font size, max width (letters squeeze to fit). Font family/weight:
  the `opt` argument of `letters()` (default Futura 700; system fonts only, no `@font-face`).
- **Etched CTA** — `src/cast.js`, `engrave(e, ER)`: the tagline, `'aixenix.com'`, `'t.me/aixenix'` and
  the paper-plane glyph polygons. Bump `engraveKey` in `FILM.ferroState` after any change (the
  engraving is drawn once per key). The rim rectangle is `ENGR` in `src/props.js`.
- **Icons** — `ring()`, `gear()` (`nT` teeth, `nS` spokes) and `plane()` / `PLANE` in `src/cast.js`.
  Any Canvas2D drawing in world units works as a field shape; paint it with `begin(g, F, blur)`
  (F = field strength, 1.0 = full spikes, the critical field is 0.30).
- **Timing** — the `EV` table in `src/cast.js` (swell `…Sw`, snap `…Snap`, off times, gear, plane,
  etch sweep), constants `BEAT`, `BAR`, `DUR`, `LOOP0`, `LOOPF`, `BARF`; camera moves in `camera(T)`
  and the end-card framing `FINAL`. Then `src/timeline.js`: `bpm`, `duration`, the `shots` (one thin
  file per shot in `src/scenes/`, all calling the same engine) and the `cues` list.
- **Colours** — the brand palette in `src/lib.js` (`ffMagenta`, `ffCyan`, `ffViolet`, `ffKey`,
  `ffSweep`, `ffVoid`, …); where each light sits and how bright it is: `rig(T, camEl)` and `band(T)` in
  `src/cast.js`. Liquid base colour: `fluidBase` (state) / `uFluidBase` in `src/props.js`.
- **Look of the spikes** — `spike` in `FILM.ferroState` (`a` lattice spacing, `h` height, `kr` cone
  radius, `coneK` flank curve, `swell`, `draw`); pool size/shape `POOL` and field canvas `FIELD` in
  `src/props.js`.
- **Music** — `src/music.js`: the `CH` chord table, `MIX.ride`, and `score(E, I)` (sound vocabulary:
  `swell`, `burst`, `bigHit`, `snapHit`, `rattle`, `collapse`, `pulse`, `clap`). Keep every cue in
  `src/timeline.js` matched by a transient: `node tools/audio/render-audio.cjs` then
  `node tools/audio/analyze.cjs .tmp/audio/score.wav --cues` (pass within 10 ms).
- **Duration / bpm** — change `bpm` and `duration` in `src/timeline.js` together with `BEAT`, `BAR`,
  `DUR`, `LOOP0`, `LOOPF`, `BARF`, `BEATF` in `src/cast.js`, keep the length a whole number of bars
  and re-time `EV`, the shots, the cues and `score()`.

## How the engine works

- `src/props.js` (the engine, in the prelude slot) builds one three.js scene: a projected screen-space
  grid (~3M vertices) for the liquid, a big plane for the steel, render targets, DOF, bloom and a grade.
- Each frame the director (`src/cast.js` → `FILM.ferroState(T)`) paints the field into a 2D canvas in
  world units; two blurred copies give the swell and the drawdown trough. They are uploaded as textures.
- The liquid height is analytic: pool depth × rounded meniscus + saturating swell − drawdown + ripples +
  V wake + a sum of cone kernels over the 7 nearest hex-lattice sites (`spikes()`), gated by the field.
- The fragment shader re-marches the exact surface around the rasterised point (grazing views), takes
  the analytic gradient per pixel, and traces one reflection ray through the height field, so spikes
  mirror in the pool and in each other.
- Lighting is a studio of soft-edged area lights evaluated in reflection space (`env()`), which is why
  black liquid can look glossy and still black.
- The steel shader blurs reflections along the radial direction (spun metal) and cuts the engraving
  from a canvas texture: matte frosted grooves with lit and shaded walls, revealed by a moving front.
- The render is 2× supersampled, depth-of-field gathered from the depth buffer, bloomed, ACES-graded,
  then copied into the FILM canvas.

## Determinism and gotchas

- **GPU vs SwiftShader.** Headless Chromium defaults to software WebGL (~4 s a frame for this scene).
  `tools/common.cjs` adds ANGLE Metal flags on macOS (`process.platform === 'darwin'`). Elsewhere the
  default applies; `FILM_GL=gpu` asks for the hardware GPU on Linux/Windows and `FILM_GL=swiftshader`
  forces software everywhere. Hashes are per machine/driver; the gate checks determinism on yours.
- **Frame cost.** The gate warns above 150 ms; keep the mean under ~400 ms. Biggest levers: the
  macro refinement (`refine` in the state), the reflection trace (`traceLen`, `heightFast()`),
  supersampling `SS` and `GRID_X/GRID_Y` in `src/props.js`. Measure with the GPU synced (a 1-pixel
  `readPixels`), not with snap timings.
- **Two determinism traps already fixed — keep them fixed.** (1) Never sample a mipmapped texture
  inside a divergent `if` (undefined derivatives → random mip level); the engraving is sampled in
  uniform control flow. (2) Chrome can move a 2D canvas between GPU and CPU raster mid-session and the
  two round blending differently; the field canvases are created with `willReadFrequently: true`.
- **Loop seam.** The last bar repeats in whole frames: grain seed, beat pulses (`brandPulse`) and the
  glint sweep are computed from the frame index modulo 72. Check: render frames 576 and 648 and diff.
- **Text safety.** Spike text needs bold, wide strokes (≥ 3 lattice cells); thin letters vanish.
  Keep the etched CTA ≥ ~50 px cap height and inside the 80 px margin; `FINAL` sets the framing.
- **Fonts.** System fonts only (Futura, Avenir Next, Helvetica Neue have Cyrillic on macOS).

## Files map

| Path (in `example/`) | What it is |
|---|---|
| `src/props.js` | the ferrofluid engine (three.js scene, GLSL, render targets, post) |
| `src/cast.js` | the director: field choreography, camera, lights, ripples, engraving |
| `src/timeline.js` | bpm, duration, shots, cues |
| `src/scenes/*.js` | ten thin shot files, each renders `FILM.ferroState(info.T)` |
| `src/music.js` | synth engine + the score |
| `src/lib.js` | pipeline helpers; brand palette `ff*` |
| `src/vendor.js` | three.js r180 + addons as global `THREE` |
| `src/core.js`, `src/player.js` | pipeline runtime and HTML player |
| `tools/` | gate, snap, render, build, audio tools (`npm --prefix tools ci`) |
| `tools/fixtures/ferro/` | one hero frame of spike letters (look development) |
| `deliver.sh` | gate + master + web / 1280 / loop / poster + HTML |
| `docs/` | pipeline templates (contract, art bible, storyboard) |
