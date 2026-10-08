---
name: law-splitflap
description: "Split-flap law: everything on screen is shown only by a giant mechanical Solari departure board — 504 flap modules in three.js. Text is printed glyph flaps, pictures are mosaics of per-module picture flaps, and every module steps through its drum one flap at a time, so letters visibly clatter in order. The clatter itself is the percussion of the score. Use for ads, intros, announcements, launches, travel/airport/logistics themes or any 'status changes' story. Triggers: split-flap, Solari board, flip board, departure board, airport board, flap display, mechanical board animation, 'табло вылетов', 'перекидное табло', 'механическое табло', 'табло Solari', 'аэропортовое табло', 'ролик табло', 'буквы перещёлкиваются'."
---

# law-splitflap — the departure board

Runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`: gate, snap, render, music engine). Shared notes for the AiXenix series are in `skills/aixenix-video/SKILL.md`. `example/` is the finished 21.3 s ad «Табло вылетов» for AiXenix («Бизнес на автопилоте»): copy it and change the words, pictures and music.

## The law

**Only the board.** The frame is a wall-sized Solari split-flap board: 36 × 14 = 504 modules, each a drum of 75 flaps. The drum order is: blank, 62 printed glyphs (Cyrillic А–Я, the Latin letters Cyrillic lacks, digits, `. : - / ·`), 11 picture flaps P1–P11 and 1 card flap. The drum is cyclic.

What must happen:
- **Text is glyph flaps**, one character per module, printed in white on a black flap. Each glyph is split at the hinge: the top half is printed on the front of flap *k*, the bottom half on the back of flap *k − 1*, exactly like a real drum.
- **Pictures are mosaics.** A picture flap carries only this module's tile of a picture. The runway and plane, the moon and the AiXenix wordmark exist only as 504 tiles, cut by the hinge line and the grille.
- **One flap at a time.** A module advances one flap per step, at 30 flaps per second. To go from А to Я it clatters through everything in between. Each flap falls about its hinge with acceleration, then hits and bounces.
- **Animation is flip-book.** A moving picture is consecutive picture flaps on the drum; each single flip advances the image one frame. The takeoff is 10 ripples of one flip each, on the 16ths.
- **The clatter is the rhythm.** Every flap impact the picture schedules is a click in the score. Clicks are panned by column and tuned to the bar's chord, and landings sit on beats.

What must not happen: overlays, captions, glows or particles that are not printed on a flap. No module may jump a glyph. No "kinetic type".

Why viewers read it: the bands of the alphabet running across the board during a storm, and the hinge split in every letter, prove it is a machine. When a picture assembles out of the same flaps, the law is legible in the first seconds.

## Good for

- 15–30 s ads with a "before → after" story told as statuses: ОТМЕНЁН → ВЫЛЕТ: СЕЙЧАС.
- Launches, timetables, travel, logistics, "your flight is now boarding" CTAs.
- Any brand that wants a tactile, analog, mechanical feel.
- A logo reveal as a mosaic picture plus a URL in glyph flaps.

## Quick start

Run from a copy of `example/` (the folder name becomes the output slug). You need Node 18+, ffmpeg and zsh.

```bash
cp -R example my-board && cd my-board
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                   # toolchain ok
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                    # the gate: exit 0 (a WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/splitflap   # one hero cascade
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.5 --out .frames/sheet
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs                   # exports/my-board.mp4 (crf 16, with sound)
zsh tools/deliver.sh                                                 # web mp4, loop mp4, poster jpg, dist html
```

Check the score with `FILM_NO_NET=1 zsh tools/q.sh node tools/audio/render-audio.cjs`, then `node tools/audio/analyze.cjs .tmp/audio/score.wav --cues`. Every cue should land within 10 ms.

## Make it yours

All paths are relative to `example/`.

- **Words on the board:** `src/cast.js` → `LAYOUT`:
  - `head`: the header row and clock
  - `hook`: rows of `[time, destination, status]`
  - `motto`, `flight`, `site`, `gate`: `[string, column, row]`
  - `mark`: the wordmark rows on the card
  - `plane`: the paper-plane block

  The board is 36 columns × 14 rows; keep strings ≤ 36 characters and inside the camera framing.
- **Characters:** a string may only use characters printed on the drum: `CHARS` in `src/cast.js`, plus Latin homoglyphs mapped by `HOMO`. `gi()` throws on anything else. Adding glyphs lengthens every roll.
- **When things happen:** `SCRIPTS.film` in `src/cast.js`. Times are `b(bar, beat)`.
  - `land()` makes a module arrive on a beat (its start is computed backwards from the number of steps).
  - `go()` starts a roll at a time and lets it settle like a real board.
  - `run()` refuses overlapping runs.
  - The storm is `tide()`; the takeoff ripples are the `NP` loop.
- **Brand name, wordmark, colours:**
  - Wordmark: `drawCard()` in `src/scenes/01-board.js` (`word`, the Futura font, the gradient stops `#ff2bd6 → #bf00ff → #00f0ff`, the paper plane).
  - Flap and print colours: `FLAP_HEX`, `INK_HEX`.
  - Airliner livery: `airliner()` (fin gradient, cheat line).
- **The picture (takeoff mosaic):**
  - Scene: `drawSky()`, with the moon in `MOON` and the runway line in `RWY`.
  - Flight path, one row per picture flap: `PLANE`.
  - Contrail: `drawContrail()`.
  - Up to 12 picture flaps fit the two atlases (`PROWS`); `NP` in `src/cast.js` must match `PLANE.length`.
- **Camera:** `CAMK` keyframes `[T, pos, look, ease]` in `src/scenes/01-board.js`. `cameraAt()` adds the one-bar "breathe" in the last two bars, which is the loop.
- **Duration / bpm:** `src/timeline.js` (`bpm`, `duration`, `shots`, `cues`). Keep a whole number of bars. At 112.5 bpm a bar is 64 frames, so every 16th lands on a frame. Then re-time `SCRIPTS.film`, `CAMK` and the score.
- **Music:** `src/music.js`:
  - `CH`: chords.
  - `BARS`: per bar the chord, the sub root and the click resonance tones.
  - `MIX.ride`: section levels.
  - `clatterRide()`: the clatter's own fader.
  - `clickVariant()`: the flap timbre.
  - `score()`: the composition; every `FILM.TIMELINE.cues` entry is implemented at its time.
- **Texts in docs:** `exports/<slug>-shots.md` is written by hand. Use the timeline briefs as the source.

## How the engine works

- `src/cast.js` (a prelude, loaded before the timeline) owns the mechanics: drum, flap physics (`theta()`: accelerating fall, then decaying hops), planner and scripts. It exposes `FILM.board`: `stateAt(module, t)`, `impacts()`, the constants and `LAYOUT`.
- Each module keeps a flat list of release times. `stateAt` binary-searches it and returns:
  - the top face (the next flap),
  - the bottom face (the last settled flap),
  - up to 7 flaps in flight or hopping, with their angles and faces,
  - the analytic shadow reach those flaps cast on the resting halves.
- Each run gets a deterministic phase offset (`jit()`, hashed per module), so the motors are out of step with each other and with the camera. Flaps are seen at every angle; without it, every flap shows the same pose on every frame.
- `src/scenes/01-board.js` rebuilds one `InstancedMesh` every frame: a top flap, a bottom flap and the falling flaps, with each flap a plane rotated about its hinge. A custom shader handles:
  - sampling the glyph atlas, or this module's tile of the picture or card atlas,
  - key-light pools from four downlights, GGX satin specular and a narrow glint as flaps pass horizontal,
  - axle and lip occlusion, flap shadows, and per-flap wear.
- Post-processing: a 4-sub-pose accumulation pass gives motion blur (a 180° shutter), then BokehPass (DOF), UnrealBloom, OutputPass, and finally vignette and grain.
- All printed art (glyph atlas, 11 takeoff frames, card) is drawn once with Canvas 2D at init, in Helvetica Neue Condensed Bold and Futura. There are no font files.
- `src/music.js` turns `FILM.board.impacts()` (about 40 000 impacts) into per-bar stereo buffers of synthesised plastic clicks. It also adds a motor rumble that follows the number of running modules, under a beat (kick, clap, hats, sub, pad, plucks, bells).
- `src/timeline.js` lists 7 chapters. They are one continuous take: every shot calls the same `draw` at global `T`.

## Determinism and gotchas

- **GPU vs SwiftShader.** Headless Chromium defaults to SwiftShader (CPU GL). The board renders 3000 lit flaps four times per frame; on SwiftShader that is very slow (about 0.75 s per frame before motion blur was added). `tools/common.cjs` therefore uses ANGLE Metal on macOS (`process.platform === 'darwin'`), at about 10 ms per frame in the gate.
  - `FILM_GL=swiftshader` forces the software path anywhere.
  - `FILM_GL=metal` forces Metal.
  - On Linux and Windows the default (SwiftShader) is used. Expect a frame-cost WARN and long renders; use `--scale 0.5` for drafts.
- **Determinism traps found on the GPU path, all fixed in the example:**
  1. Accumulating sub-poses into a multisampled target: the composer target is single-sample, and MSAA happens in each sub-pose render.
  2. One very tall picture atlas (4096 × 6800): split into two textures.
  3. GPU-rasterised 2D canvases with long translucent strokes: the art canvases use `{ willReadFrequently: true }`, i.e. CPU raster.

  If the gate's determinism check flickers, run it several times and look at what differs in `fresh shuffled` vs `cold`.
- **The gate does not scan `src/cast.js`.** The gate excludes the prelude name `cast.js` from its `Math.random`/`Date` scan. Keep it pure by hand: `grep -n "Math.random\|Date\|performance.now" src/cast.js`.
- **The score renders without the scene files** (`tools/audio/render-audio.cjs` loads only the preludes, timeline and music). This is why the schedule lives in `cast.js`.
- **Long rolls.** With 75 flaps, a blank → picture roll takes about 2.1 s. `land()` starts it early, so text you want readable must not have a roll starting next to it. The flight row is gated to start no earlier than half a beat after the motto lands.
- **The homing turn passes the picture flaps.** A full extra drum turn (`land(..., extra = 1)`) flashes picture tiles mid-word. Use it only where those tiles are dark (here, the header row).
- **Loop seam.** The last bar has no flips. The camera "breathe" uses `(1 − cos 2πu)/2`, which has zero velocity at both bar ends. Grain changes per frame, as everywhere. `deliver.sh` renders the last bar on its own for `-loop.mp4`.
- **Text safety.** Board text is drawn by WebGL, so the gate's safe-area check cannot see it. Check margins on snaps (≥ 96 px is title-safe at 1920 × 1080).
- **Bitrate.** Grain and flaps are expensive to encode: the crf-23 web file is about 11.5 MB for 21 s. Reduce the grain in the `finish` pass if a platform needs smaller files.

## Files map

| Path (in `example/`) | What it is |
|---|---|
| `src/cast.js` | Drum, flap physics, planner, `LAYOUT`, `SCRIPTS.film` / `SCRIPTS.fixture`, `FILM.board` |
| `src/scenes/01-board.js` | three.js board, shaders, printed art (`glyphAtlas`, `drawSky`, `airliner`, `drawCard`), camera `CAMK`, motion blur, post |
| `src/music.js` | Engine (kept) + `CH`, `BARS`, `MIX.ride`, clatter synthesis, `score()` |
| `src/timeline.js` | 112.5 bpm, 10 bars, 7 chapters, `cues` |
| `src/vendor.js` | three.js r180 + addons as global `THREE` |
| `src/core.js`, `src/lib.js`, `src/player.js` | Pipeline runtime (unchanged) |
| `tools/fixtures/splitflap/` | Hero fixture: hook text → storm → runway mosaic (`boardScript: 'fixture'`) |
| `tools/fixtures/three-test/` | three.js determinism smoke |
| `tools/common.cjs` | GL backend selection (`FILM_GL`) |
| `tools/q.sh` | Semaphore (`Q_SLOTS`, default 3; lock in `${TMPDIR:-/tmp}/procedural-film-q`) |
| `tools/deliver.sh` | Web, loop and poster files plus the HTML build, from the master |
| `docs/` | Pipeline contract and templates |
