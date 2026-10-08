---
name: law-automaton
description: "Clockwork automaton ad: an 18th-century brass-and-porcelain scribe (after Jaquet-Droz, 1774) writes every word with a goose quill, and its arm is driven by brass cams whose profiles are computed from the letters' pen paths. Nothing appears that the machine does not physically write: wet glossy ink that dries, a blot where the nib lands, an escapement ticking the beat. A cut to the oval glass back shows the cam stack turning and the followers riding it. Use for a 15-30 s brand film or end card about automation, craft, precision, heritage or handwriting. Triggers: automaton ad, clockwork writer, quill writes the logo, cams write the text, mechanical handwriting video, Jaquet-Droz; ролик с автоматоном, механический писец, перо пишет логотип, кулачки пишут текст, часовой механизм пишет, рукописная концовка, автоматизация с 1774."
---

# law-automaton: the clockwork scribe

This film runs on the procedural-film pipeline bundled in this plugin
(`skills/procedural-film/SKILL.md`: gate, snap, render, beat grid, music engine). Notes shared by all
the AiXenix law films are in `skills/aixenix-video/SKILL.md`. The finished example lives in
`example/`. Copy it and change the texts. Don't start from scratch.

## The law

**Nothing appears that the machine does not physically make.**

- Every mark on the sheet is laid by the quill nib, and only while the nib touches the paper.
- The nib position is never animated. It is **decoded from the cams**. Each programme card is one
  shaft revolution with three cams (X, Y, and lift/pressure), and each cam's radius as a function of
  shaft angle *is* the pen path.
- The arm (two-bone IK), the hand, the head's gaze, the followers, the ink ribbons and the quill
  scratch in the score all read those same decoded radii. If you edit a letter, the cam's shape
  changes with it.
- The machine never does impossible things. Ink appears only behind a moving nib. The cam stack drops
  to the next card only while the quill rests in the inkwell, where every card has identical radii.
  The escapement ticks on every 8th and stops when the spring runs down.
- Must not: titles, overlays, text fades, particles, or a logo that pops in. The final card is the
  finished sheet itself.

Viewers read it because they see both halves. The quill writes the line in close-up, then the reveal
cuts to the glass back, where the wavy brass profiles turn and the steel followers ride them in time
with the ticks. Cause and effect share the screen. Wet ink, a blot when the quill lands, and pressure
on the downstrokes keep the writing from looking like a font animation.

## Good for

- Brand end cards and short ads about automation, "on autopilot", reliability, craft, heritage or
  "since <year>".
- Any message of up to ~4 short lines that can be handwritten. Cyrillic and Latin glyphs are included.
- Landscape 1920×1080, 30 fps, 18–24 s. The example is 24.0 s = 15 bars at 150 bpm.

## Quick start

Run from the plugin root. Requires node ≥ 18, ffmpeg and zsh.

```bash
cp -R skills/law-automaton/example my-ad && cd my-ad      # the folder name becomes the slug
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                         # toolchain sanity
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs          # the gate (exit 0; a cost WARN is normal)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.5   # .frames/film-sheet.png
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 7.3,22.8                   # full-res stills
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/automaton   # hero views
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --workers 2                      # exports/<slug>.mp4
zsh deliver.sh        # master + -web.mp4 (+ -1280 if > 15 MB) + -loop.mp4 + -poster.jpg + dist/<slug>.html
```

Audio checks (run them after changing music or timing):

```bash
FILM_NO_NET=1 node tools/audio/render-audio.cjs
node tools/audio/analyze.cjs .tmp/audio/score.wav --cues   # every timeline cue matched within 10 ms
node tools/audio/peaks.cjs .tmp/audio/score.wav
```

`tools/q.sh` is a machine-wide semaphore. It allows 3 Chromium renders at once (`Q_SLOTS` overrides
this), and its lock lives in `${TMPDIR:-/tmp}/procedural-film-q`.

## Make it yours

All paths are relative to `example/`.

| What | Where |
|---|---|
| Hook, slogan, brand line, URLs | `src/props.js` → `CARDS`: one card per cam revolution, each with `rows: [{ text, x, y, size }]` (page metres; `y` is the baseline, measured up from the page centre). The example has 4 cards; card 4 has two rows (`aixenix.com`, `✈ t.me/aixenix`). |
| Number of cards | `src/props.js` → `NREV` must equal `CARDS.length`. The machine stops at `T_STOP = T_RUN + NREV * REV`; then update `DURATION` (props.js), the shot times and cues in `src/timeline.js`, and the bar numbers in `src/music.js` (`PROG`, `MEL`, coda). |
| New letters | `src/props.js` → `def(ch, width, strokes)` / `G`. Strokes are point lists in x-height units, unslanted, baseline 0; a third element `1` marks a corner. Loading fails with `programme: no glyph for "…"` if a character is missing. `'✈'` is the paper plane. |
| Hand size, slant, page | `src/props.js` → `XH` (x-height), `SLANT`, `LETTERSPACE`, `PAGE`, `WELL` (inkwell), `PAGE_C`/`PAGE_PSI` (where the sheet lies). Keep lines inside `MAP.x/MAP.y`, or the cams overflow. |
| Writing speed / dip choreography | `src/props.js` → `PH` (`w0..w1` is the writing window inside each revolution). |
| Tempo, bar, revolution length | `src/props.js` → `BPM`, `REV` (3 bars), `T_RUN` (release); `src/timeline.js` → `BAR`, shot `start`/`end`, `cues`; `src/music.js` → `BEAT` inside `score()`. Change all three together. |
| Colours / materials | `src/cast.js` → `M.velvet` (coat; `color`, `sheenColor`), `M.brass`, `M.camBrass`, `M.porcelain`, `M.silk`, `M.wood` (via `woodCanvas` base RGB); ink colours `wetC`/`dryC` in `inkMaterial`; paper tint in `paperCanvas`; light colours `candleSpot`, `moon`; the grade in `finalMat` (shadow split-tone, `uWarm`). |
| Ink drying time | `src/cast.js` → `DRY`. The last ink plus `DRY` must end before the loop bar. |
| Cameras | `src/scenes/01-wind.js` … `08-loop.js`, one per shot, built from `FILM.cast.anchor(T,'key'/'stack'/'escape'/'head')`, `nibAvg`, `spline`. The final-card framing is `FILM.CARD_CAM` in `src/scenes/07-card.js` (shared by 06 and 08). |
| Per-shot lighting knobs | Fields of the camera spec passed to `FILM.cast.render`: `exposure`, `fstop`, `focus` (`'nib'` / point / metres), `envTop`/`envTopI` (overhead reflection lobe), `envCand` (candle lobe; 0 inside the torso), `back`/`backAt`/`backFrom` (aimable warm spot), `rscale` (render scale: 0.8 while moving, 1 for the card). |
| Music | `src/music.js` → `CH` (chords), `PROG` (chord per bar), `BASS`, `MEL` (music-box melody), `score()` (harpsichord `harpBuf`, escapement ticks from `FILM.prog.TICKS`, clunks per card, quill scratch from `FILM.prog.INKRUNS`), `MIX.bus` / `MIX.ride`. |
| Shot titles / briefs | `src/timeline.js` → `title`, `shots[].title`, `shots[].brief`. |

## How the engine works

- `src/props.js` (pure math, no THREE) lays the text out from glyph strokes (centripetal
  Catmull-Rom). Each card becomes a timed pen path: lift out of the ink, two wipes on the rim,
  travel, write, travel back, dip. Pen speed slows on curves, and pressure comes from the downstroke
  direction (pointed-pen contrast).
- Each path is resampled at `N = 4096` phases into three **cam tables** (`CAMS[r].X/Y/Z`), using one
  fixed lever ratio per axis (`MAP`) shared by every card.
- `state(T)` turns time into shaft phase, reads the active triplet (`camRead`) and decodes it
  (`dec`) into nib x, y, lift and pressure. `pose()` solves the quill frame, the wrist and a two-bone
  arm IK from that decoded nib.
- `INKRUNS` and `LANDINGS` are built by walking the decoded tables. They become one ribbon mesh whose
  vertices carry the time they were laid, so the ink shader shows only `vT <= T`. The ink is wet
  (blue-black, glossy, beaded normals) and dries matte brown-black over `DRY`. Edges are antialiased
  analytically, with fibre feathering.
- `src/cast.js` builds the world once: the desk, sheet, brass inkwell, candle, the figure (sculpted
  coat with an oval glass caseback, doll head with glass eyes, brass wig, porcelain hands), and the
  mechanism. The mechanism is the extruded cams (`camGeo` uses the very same tables), knife-edge
  followers in guides with springs, the escapement with a balance and hairspring, and the gear train.
  `update(T)` poses everything; nothing accumulates between frames.
- Rendering: an HDR target, then a half-res depth-of-field gather, then bloom on a copy, then a final
  grade (FXAA, ACES, vignette, per-pixel grain). The environment is an **analytic** workshop lobe set
  injected into every material (`envify`), because a PMREM lookup costs ~360 ms a frame on SwiftShader.
- The score (`src/music.js`) is scheduled from the same programme data. Ticks come from `TICKS`,
  clunks from the card boundaries, and the scratch envelope from `INKRUNS` pressure and speed.

## Determinism and gotchas

- **GL backend.** Headless Chromium here renders WebGL with **SwiftShader** (software); that is what
  the gate's hashes are measured on. `tools/common.cjs` only forces SwiftShader for retro films (when
  `src/crt.js` exists), and `FILM_GL=gpu` opts out of that. This project uses no ANGLE Metal switch.
  If you add one, guard it with `process.platform === 'darwin'` and keep `FILM_GL` as the override.
- **Frame cost.** The gate measured a mean of 287 ms per frame (max 429 ms) on a 12-core machine. That is a WARN against the 150 ms default, but under 400 ms. Expect 1 s or more per frame while other renders share the CPU. The
  levers are `rscale`, the DOF tap count, the shadow map size, the number of physical materials, and
  cam outline points (`camGeo` `M`). A 720-frame render took ~9 min with 2 workers.
- **Don't edit files while the gate runs.** Its warm passes reuse a page, and its cold passes reload
  the sources. A mid-run edit shows up as a determinism failure.
- **First frame.** The gate rejects a flat frame, so `01-wind.js` fades from 0.3, not from black.
- **Loop seam.** The last shot has a static camera; the candle `flicker()` is periodic in one bar; the
  escapement has stopped; all ink must be dry before the loop starts (`T_LASTINK + DRY <` the last
  shot's start). Check it with `analyze.cjs --seam` and by diffing the first and last loop frames.
- **Text is geometry.** The gate's safe-area text scan can't see it, so check the card on a 0.25-scale
  sheet. Hairlines are ~0.2 mm; thicken `PRESS`/the base width in `buildInk` if your card is smaller.
- **Reach.** The arm must reach every page point. `P.pose(P.state(T)).over` must stay < 0 across the
  film (it is −2 cm in the example). Move `PAGE_C` or the lines if it goes positive.
- **Inside the torso** the candle can't be seen, so mechanism shots set `envCand: 0`, and the coat is
  double-sided.

## Files map

```
example/
  deliver.sh                 render + transcodes + poster + player (slug = folder name)
  src/props.js               THE PROGRAMME: glyphs, cards, pen paths, cam tables, decode, IK, ink runs, ticks
  src/cast.js                THE MACHINE: three.js world, materials, analytic env, ink shader, post, cameras API
  src/scenes/01-08*.js       one camera per shot (wind, wake, hook, reveal, sign, urls, card, loop)
  src/timeline.js            150 bpm, 8 shots, 11 cues
  src/music.js               engine + score (harpsichord, music box, escapement, clunks, quill scratch)
  src/vendor.js              three.js r180 + addons as global THREE
  src/core.js lib.js player.js   procedural-film runtime
  tools/                     gate, snap, render, build, audio tools (npm ci here)
  tools/fixtures/automaton/  hero fixture views (one frame per planned shot)
  tools/fixtures/three-test/ three.js determinism smoke
  docs/                      procedural-film templates and contract
```
