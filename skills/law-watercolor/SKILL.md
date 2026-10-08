---
name: law-watercolor
description: "Law of the method: wet-on-wet watercolour that grows by itself. Nobody paints a shape — clear water is laid on cold-pressed paper (it glistens), one drop of pigment lands, and the colour blooms and runs along the wet paths on its own: letters, icons, branches, a logo, a paper plane. Real watercolour physics (feathered blooms, backruns, drying rims, granulation, salt, subtractive mixing, a tilted sheet whose pigment runs downhill), every pixel computed in JS. Use for an ad, intro, logo reveal or explainer whose message is 'it grows by itself / runs on autopilot'. Triggers: watercolor ad, wet-on-wet animation, ink bloom logo reveal, paint that spreads by itself, organic growth video; акварель по-мокрому, акварельный ролик, растекается само, капля краски распускается, растёт само, реклама акварелью."
---

# law-watercolor — the colour runs along the water by itself

An 8-bar (21.3 s) 1920×1080 advert for AiXenix («Бизнес на автопилоте»), drawn and scored entirely in
JavaScript. It runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`:
timeline → scenes → gate → render); shared notes for all the AiXenix law films are in
`skills/aixenix-video/SKILL.md`. `example/` is the finished film, ready to copy and re-brand.

## The law

**Must happen:** every shape is first a *water mask* (wet paper: a few percent darker, a thin bright rim,
a glint), then a *drop* lands, then the colour *runs through the water by itself* — fingering, feathering,
slowing as it spreads, stopping with a darker rim where the water ends. Words have a wet thread under the
baseline: one drop at the thread's start fills the word, the colour climbing into the letters from below.

**Must not happen:** no wipes, no masks sliding, no shape that appears without a drop and a wet path to
arrive through, no opaque fills, no white "chalk" water, no straight edges (a clipped bounding box is a bug).

**Why viewers read it:** the order is always visible — water, drop, spread — and it is physically familiar.
Repeated on the beat (a rain of drops), it says "nobody draws this, it grows", which is the brand promise.

## Good for

- Ads and intros about automation, growth, "it runs by itself", organic scaling.
- Logo reveals and end cards (the logo is just another wet shape the streams pour into).
- Explainers drawn as a living flowchart: a hub, branches, icons blooming at the ends.

## Quick start

From the plugin's `skills/law-watercolor/` folder (needs Node ≥ 18, ffmpeg on the PATH, zsh):

```bash
cp -R example ../../my-watercolor-ad && cd ../../my-watercolor-ad   # the folder name becomes the slug
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                    # toolchain sanity
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                     # the gate: exit 0 = green (a cost WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.25   # whole film on one sheet (.frames/)
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs                    # exports/<slug>.mp4, master with music, crf 16
zsh tools/deliver.sh                                                  # web mp4, loop mp4, poster jpg, dist/<slug>.html
```

The material proof sheet (every phenomenon on one page) is a fixture:
`FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --fixtures=tools/fixtures/watercolor --shot material --samples 6 --sheet`.

## Make it yours

All paths are relative to `example/`.

- **Words** — `src/cast.js`, the `TEXT` object at the top: `hook`, `slogan1`, `slogan2`, `logo`, `site`, `tg`.
  Sizes in `SIZES`; positions of the card column in `CARD` (`x`, `logoY`, `sloganY`, `sloganY2`, `siteY`,
  `tgY`) and of the hook in `HOOK`. Keep type inside x 80–1840, y 80–1000 (the gate measures canvas text,
  but these words are rasterised into water masks, so check the snap yourself). Cyrillic needs a system
  font with Cyrillic: the masks use `700 …px Futura`.
- **Icons on the flowchart** — `NODES` inside `def()` (kind, position, size, two pigments, bloom time);
  the shapes are the functions in `ICON` (chat, doc, chart, robot, bolt, check, gear, mail).
- **Colours** — pigments are masstone colours over the paper in `PIG` in `src/props.js` (converted to
  per-channel absorbance by `abs()`); brand pigments `magenta`, `cyan`, `bviolet`. The paper is
  `PAPER_RGB`. Per-element colour is the `pig` field of each region (a name, a triple or `(x, y, T) => …`).
- **Timing** — the beat grid at the top of `src/cast.js` (`BEAT`, `BAR`, `at(bar, beat)`, `T_DROP`,
  `T_HUB`, `T_SLOGAN`, `T_TILT`, `T_CARD`, `T_LOOP`). Shots, `bpm`, `duration` and the audio `cues` are in
  `src/timeline.js`. Duration must stay a whole number of bars; the last bar is the loop.
- **Camera** — `CAMKEYS` in `src/cast.js` ([T, zoom, centre x, centre y]); the tilt strength and roll in
  `tiltWarp()` (`k`, `rot`).
- **Music** — `score()` in `src/music.js` (piano, celesta, strings, `drop`, `salt`, `seep` voices are defined
  in `instruments()`); section levels in `MIX.ride`. Every drop on screen has a sound at the same time;
  keep `cues` in `src/timeline.js` in step and verify with
  `node tools/audio/render-audio.cjs && node tools/audio/analyze.cjs .tmp/audio/score.wav --cues`.
- **Loop / poster** — the loop bar is the last bar (`tools/deliver.sh` reads it from the timeline);
  poster time via `POSTER_T=20.0 zsh tools/deliver.sh`.

## How the engine works

- `src/props.js` (`FILM.wc`) is the material. A painting is a stack of *layers* (glazes); a layer holds
  *regions* (washes): a water-mask shape, timed drops, a pigment and physical knobs.
- At load, each layer runs a 16-neighbour Dijkstra on a half-resolution grid: the **arrival time** of the
  wet front from all its drops through a log-normal noisy speed field streaked with paper fibres. That one
  static field gives fingering, feathering, slowing (`decay`) and stopping (`tFlow`).
- A front that enters another region's water takes that region's speed and pigment ("the water decides"),
  which is how a thread fills its letters and a branch fills an icon.
- Colour is Beer–Lambert absorbance per channel, summed over layers: mixing is subtractive and glazes darken.
- Per pixel and per frame: density = front ramp × concentration × pooling/flocculation × drying rim ×
  granulation in the paper valleys × backrun × salt; wet areas are darker, flatter and glossy, dry ones
  lighter with hard rims. `dryFade` makes a wash dry paler (threads, background rain).
- Backruns are a second, scalloped clean-water front (pale inside, dark frilly line); salt is a field of
  spiky stars that grow while the wash is damp.
- Paper: cold-press height field (jittered cells + tooth), raking light, flattened where wet.
- `src/cast.js` (`FILM.cast`) builds the painting (`def()`), draws the falling drops (shadow first, then a
  4-frame translucent teardrop that refracts the paper, then the splat) and blits the sheet through the
  camera; the tilt is an exact CPU perspective warp with a roll and a shadow on the desk.
- The eight scene files are one-liners: each shot calls `FILM.cast.frame(ctx, T)` at global T, so the
  whole film is one continuous take.

## Determinism and gotchas

- Pure Canvas 2D + typed arrays on the CPU: no WebGL, so GPU vs SwiftShader does not matter and frames
  hash the same on every machine with the same Chromium. `FILM_GL=gpu` exists in the shared tools for WebGL
  films (it only matters when a project has `src/crt.js`); this film does not need it.
- The build (paper + arrival fields) takes about 2 s on the first frame of a page; it is cached and is a
  pure function of the painting definition, so warm and cold frames hash identically (the gate checks it).
- Frame cost: median ≈ 50 ms, max ≈ 200 ms (the tilt frames: CPU warp). The gate warns above 150 ms; that
  is expected. Every frame computes at 1920×1080 even for `--scale 0.25` snaps.
- Loop seam: the paint is frozen at `T_LOOP`; only light moves after it (a glint that crosses all wet type
  once per bar and starts and ends off it), and the score's last bar repeats its own bed. If you add motion
  to the last bar, make it periodic in `(T − T_LOOP) / BAR`.
- Bounding boxes clip: a region's `bbox` must contain everything its front can reach (blooms spread past
  their mask when `bleed > 0`); a straight edge in a bloom means the bbox is too small.
- Drops are timed with `drops: [[x, y, t, r]]`; `snap: true` moves a drop onto the nearest wet cell of its
  own mask (a drop aimed at a glyph hole); `sweep` gives each disconnected piece (ё dots, full stops) its own drop.
- Heavy tools go through `tools/q.sh` (a semaphore in `${TMPDIR:-/tmp}/procedural-film-q`, `Q_SLOTS`
  slots, default 3). Always pass `FILM_NO_NET=1`.

## Files map

| Path (in `example/`) | What it is |
|---|---|
| `src/props.js` | the watercolour engine (`FILM.wc`): paper, arrival fields, pigments, render |
| `src/cast.js` | the painting and the story (`FILM.cast`): `TEXT`, `CARD`, `NODES`, drops, camera, tilt |
| `src/timeline.js` | 90 bpm, 8 bars, 8 shots (one per bar), audio cues |
| `src/scenes/01-hook.js` … `08-loop.js` | one-line shots calling `FILM.cast.frame` |
| `src/music.js` | synth engine + this film's `score()` |
| `src/core.js`, `src/lib.js`, `src/player.js` | the procedural-film runtime and HTML player |
| `tools/check.cjs` | the gate (media, determinism, sources, timeline, draw, cost) |
| `tools/snap.cjs`, `tools/render.cjs`, `tools/build.cjs` | stills/contact sheets, MP4 render, HTML build |
| `tools/deliver.sh` | web / loop / poster / html from the master |
| `tools/q.sh` | the machine-wide render semaphore |
| `tools/audio/` | score render and analysis (cues, peaks, seam, loudness helpers) |
| `tools/fixtures/watercolor/` | the material proof sheet |
| `docs/` | contract, art bible, storyboard of this film |
