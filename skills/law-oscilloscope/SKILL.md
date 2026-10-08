---
name: law-oscilloscope
description: "Oscilloscope-music ad film: every lit pixel is the trace of ONE electron beam on a vector CRT whose X is the LEFT and Y the RIGHT channel of the film's own soundtrack — what you hear is literally what you see (Lissajous knots are intervals, a kick is a ring that shakes the picture, words are bass notes). 1920x1080, 30 fps, 22.4 s, seamless last bar, ships an MP4 whose audio redraws the film on a real scope in X-Y mode. Use for: oscilloscope music, sound draws the picture, X-Y scope ad, vector CRT logo, Lissajous intro, audio-visual brand film. RU: осциллограф, звук рисует картинку, осциллографическая музыка, фигуры Лиссажу, ролик где звук и есть изображение, векторный ЭЛТ, луч пишет текст."
---

# law-oscilloscope — «Звук рисует картинку»

A finished, re-brandable ad built on the procedural-film pipeline bundled in this plugin
(`skills/procedural-film/SKILL.md`; shared notes for all ten ads in `skills/aixenix-video/SKILL.md`).
The working project is `example/`: copy it, change the words and the score, render.

## The law

**Must:** every lit pixel on the phosphor face is the trace of a single electron beam. Its X
deflection is the LEFT audio sample, its Y deflection the RIGHT audio sample, of the very
soundtrack that plays. Picture and sound are computed once, from one array (`FILM.osc`).

- A shape is a closed beam path; tracing it *f* times per second is a note of pitch *f* whose
  timbre is the shape. Rhythm = changing the trace rate or the shape on the beat grid.
- Two sines at p:q on X and Y are a Lissajous knot — the knot *is* the musical interval.
- Loud means big. A kick is a decaying, pitch-dropping ring added to the beam (the picture
  shakes); a hat or a snare is noise (the trace frizzes). Silence is a parked, burning dot.
- Brightness follows physics: ∝ time the beam spends per pixel (1/speed). Slow strokes and dots
  glow, blanking jumps between letters show as faint retrace lines — keep them, they prove one beam.
- Words are written by the beam (single-stroke vector font), revealed stroke by stroke.

**Must not:** no graphics on the screen that the beam did not draw; no colour change of the
phosphor (one tube, one phosphor — a critic pass rejected a cyan/magenta finale as "motion
graphics"); no EQ, compressor, limiter or reverb on the audio (any filter bends the picture).
The only other pixels are the instrument: bezel, graticule, glass glare, knobs, and two input
jacks — a cyan cable (L) into X, a magenta cable (R) into Y, each with an LED lit by its channel.

**Why viewers read it:** the hook says «СЛУШАЙТЕ КАРТИНКУ», then a three-second lesson shows the
law on screen: the words fold into a horizontal line (only L sounds, only the X LED lights), the
line stands up (only R), both channels make a sine. After that every knot, gear and handshake is
heard as it is seen. Proof for sceptics: route the MP4's audio into a real scope in X-Y mode.

## Good for

Brands with a technical, engineering or audio story; a hypnotic opener for tech channels; any ad
where "the medium is the message" — the film is its own soundtrack. Text is limited to short
lines (a hook, a 2–3-word slogan, a name, two URLs): a single beam dims as the path grows.

## Quick start

Run from the plugin folder; needs Node 18+, zsh and ffmpeg on PATH.

```bash
cp -R skills/law-oscilloscope/example my-ad && cd my-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                  # toolchain alive
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                   # the gate: exit 0 (WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 1.6,5.0,10.9,14.2,19.9 --out .frames/look --scale 0.5
FILM_NO_NET=1 zsh tools/q.sh node tools/audio/render-audio.cjs      # .tmp/audio/score.wav
node tools/audio/analyze.cjs .tmp/audio/score.wav --cues            # onsets vs timeline cues (10 ms)
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --scale 0.5 --out exports/draft.mp4
zsh deliver.sh                                                       # master + web + loop + poster + HTML
```

`deliver.sh` writes `exports/<slug>.mp4` (crf 16, the beam signal re-muxed as 320k AAC),
`exports/<slug>-web.mp4` (crf 23, silent, faststart; plus `-1280` when over 15 MB),
`exports/<slug>-loop.mp4` (the last bar), `exports/<slug>-poster.jpg` and `dist/<slug>.html`.
Variables: `SLUG`, `WORKERS` (3), `POSTER_T` (20.0), `LOOP_FROM` (616), `LOOP_N` (56).
Look-development fixture (one bar of the real score): `--fixtures=tools/fixtures/scope` on
`snap.cjs` / `check.cjs`.

## Make it yours

All paths are relative to `example/`.

- **Brand name, slogan, URLs (final card)** — `src/cast.js`, function `card()`: the strings
  `'AiXenix'`, `'БИЗНЕС НА АВТОПИЛОТЕ'`, `'aixenix.com'`, `'t.me/aixenix'`, their `size` (cap
  height in scope units) and `y` (baseline); `planeAt`/`planeS`/`planeA` place the paper plane.
- **Hook, slogan drop, big name** — `src/cast.js`, function `cast()`: `hook` (`'СЛУШАЙТЕ'`,
  `'КАРТИНКУ'`), `sl1` / `sl2` (`'БИЗНЕС'`, `'НА АВТОПИЛОТЕ'`), `brandBig` (`'AiXenix'`).
- **Missing letters** — `src/props.js`, glyph table `G` (exposed as `FILM.vec.G`): each glyph is
  `{ w, s: [strokes] }`, cap height 1, x-height 0.62, `arc()` helper; a one-point stroke is a dwell
  dot. Unknown characters render as a space — add the glyph, then snap a frame.
- **Colours** — `src/cast.js`, object `GREEN` (used by `look()`): `cf`/`cs` core colours of the fast
  and slow phosphor layers, `hf`/`hs` halation, `glass`, `grat` (graticule). Hardware brand colours:
  `src/props.js`, the `jack(...)` calls in `panel()` (cable colours) and `led(...)` calls in `bezel()`.
- **Duration / bpm** — `src/cast.js`: `BEAT` (7/15 s = 14 frames), `NBARS` (12), `at(bar, beat)`;
  `src/timeline.js`: helper `b()`, `bpm`, `duration`, `shots`, `cues`. The loop is the copy of bar
  10 onto bar 11 at the end of `compute()` (`b10`, `b11`); match `LOOP_FROM`/`LOOP_N` in `deliver.sh`.
- **Music** — `src/cast.js`, inside `compute()`: one `if` branch per section, each with a `pat(t,
  t0, [Hz, …])` pitch pattern in 8ths; `KNOTS` (Lissajous intervals), `buildDrums()` (`KICKS`,
  `HATS`, `SNARES` as `[time, size, decay]`), the riser and the handshake ring after the drums.
  Tuning is C = 60 Hz. Keep every **text** trace rate a multiple of 30 Hz (= fps) so words stand still.
- **Story shapes** — `src/cast.js`: `HAND`, `CLASP_RAW` (handshake), `GA`/`GB` (gears), `CH` (chart),
  `FLIGHT` (plane path); `src/props.js`: `PLANE`, `gear()`.
- **Brightness** — `src/cast.js`, `KNOB` keyframes (the scope's intensity knob; it also turns the
  drawn knob). Raise it for long text paths; every move ≥ 150 ms.
- **Loudness** — `src/music.js`, `GAIN` (0.4 → about −16 LUFS, peak −4 dBFS). It is the scope's
  volts/div: it scales the sound, never the picture.

## How the engine works

- `src/cast.js` precomputes the whole film once per page: `X`, `Y` (scope units) and `I`
  (intensity) as `Float32Array`s at 48 kHz, 1 075 200 samples, by walking sections sample by sample.
- `src/props.js` `FILM.vec.build(strokes)` turns strokes into a closed beam program: drawing time
  ∝ length, dwell points rest, jumps between strokes are fast. `pos()` / `posReveal()` sample it.
- `comp()` lets several programs share one beam (gears, card lines, the plane), each with a share
  of the cycle; reveal `r ≥ 0` writes a part, `r < 0` erases it from its start (unwrite → rewrite
  transitions instead of point-by-point morphs, which look like signal loss).
- Percussion is added to the beam; on text the kick ring rides only the big line and the plane
  (`kg` gate), so small CTA lines never shake.
- `src/music.js` copies the same samples × `GAIN` into an `AudioBuffer` — nothing else.
- The renderer (`FILM.scope.draw`) takes the samples of [T − 0.15 s, T + 1/30 s), reconstructs the
  analogue beam between samples (Catmull-Rom), and deposits Gaussian segments (woscope erf
  formula) into RGBA16F targets with additive blending: the shutter window at full resolution, the
  afterglow at half resolution.
- Two-layer phosphor: fast fluorescence (τ 4 ms) and slow afterglow (τ 50 ms), integrated exactly
  over the camera shutter; a 5-level bloom chain; composite with barrel bulge, procedural graticule,
  vignette, grain and glare. The panel is drawn once into a cache; only the knobs and LEDs move.

## Determinism and gotchas

- **GL backend.** Headless Chromium here renders WebGL2 on SwiftShader (CPU); the gate's five-way
  determinism passes on it. No GPU flags are set for this film; `FILM_GL=gpu` only matters for retro
  films with `crt.js` (it opts out of the pinned SwiftShader). Hashes are per machine/backend.
- **Frame cost** ≈ 200–500 ms per 1080p frame on SwiftShader (gate WARN, allowed); the afterglow pass
  dominates. Knobs: `tail` in `compute()`'s `OSC`, the `lmin`/`lstep` spacing arguments of `gather()`
  in `drawGL()`. Timings swing 2× with machine load.
- **Loop seam.** Bars 10 and 11 must be sample-identical: every note of the card is a whole number
  of cycles per 8th, bar 11 is copied from bar 10, and `drawGL()` snaps sample indices with a 1e-6
  epsilon (without it float noise in `T * sr` shifts the segmentation and the seam frames differ).
- **Text crawl.** A text trace rate that is not a multiple of the frame rate shows a moving bright
  band on camera; 120 Hz+ text loses its curves (too few samples per letter).
- **Cues.** Kicks on pure-sine sections are clean onsets; on text the buzz itself makes an onset
  every cycle, so only real transients are listed in `src/timeline.js` `cues`.
- **Headroom by construction.** Paths that leave the screen (sleeves, plane entry) still cost
  amplitude; keep |x| ≤ ~1.6 units so peaks stay under −3.6 dBFS without a limiter.
- **Audio codec.** AAC 128k smears the X-Y picture; the master uses 320k.

## Files map

| Path (in `example/`) | Role |
|---|---|
| `src/cast.js` | THE SCORE: shapes, text, sections, drums, intensity, phosphor look → `FILM.osc` |
| `src/props.js` | vector font `G`, shapes, beam-program builder (`FILM.vec`), WebGL scope + panel (`FILM.scope`) |
| `src/music.js` | plays `FILM.osc` samples × `GAIN` |
| `src/timeline.js` | 1920×1080, 30 fps, 900/7 bpm, 11 shots naming the story beats, cues |
| `src/scenes/*.js` | one line each: `FILM.scope.draw(ctx, info.T)` |
| `src/core.js`, `lib.js`, `player.js` | procedural-film foundation (unchanged) |
| `tools/` | gate, snap, render, build, audio analysis; `q.sh` (semaphore in `$TMPDIR`, 3 slots) |
| `tools/fixtures/scope/` | look-dev fixture: bar 4 (gear train) of the real score |
| `docs/storyboard.md`, `docs/art-bible.md` | the plan by second and the visual rules |
| `deliver.sh` | master, web, loop, poster, HTML |
