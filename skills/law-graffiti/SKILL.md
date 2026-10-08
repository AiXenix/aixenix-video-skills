---
name: law-graffiti
description: "Law of the method «Graffiti»: a concrete wall is painted LIVE by a crew of spray cans with no hands, a roller on a pole and stencil cards. Every image and every word is sprayed, rolled or stencilled; drips run by gravity; cards peel off; a paper-plane stencil flies away. A procedural ad film (1920×1080, 30 fps, 24 s, seamless last-bar loop) with its own spray engine and a boom-bap score. Use it for a street-art / graffiti / spray-paint / stencil / mural / manifesto-wall video, or to remake the AiXenix graffiti ad for another brand. Triggers: graffiti video, spray paint animation, street art ad, stencil reveal, mural timelapse, wall manifesto; граффити ролик, баллончик, стрит-арт реклама, трафарет, роспись стены, манифест на стене, сделай граффити-видео."
---

# Law: Graffiti

A 24-second advert in which a crew paints a railway wall while you watch. It runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`: gate, snap, render, music engine). Notes shared by all the AiXenix ads are in `skills/aixenix-video/SKILL.md`. `example/` is the finished AiXenix ad «Бизнес на автопилоте». Copy it, change the words and colours, and render.

## The law

**Must happen:**
- Everything on screen is put on the wall by a tool you can see: a spray can, the roller on its pole, or a stencil card.
- Paint accumulates. Slow passes and dwells deposit more paint, and paint that pools runs down as a drip with a bead at its tip.
- Stencils are slapped on, sprayed across, and peeled off. They leave crisp edges inside a soft overspray frame.
- Words are paint: throw-up letters built from skeleton strokes, or a system bold face cut into a card.
- The final card (brand · slogan · site · paper plane + channel) is a part of the wall, held at least 3 s.

**Must not happen:**
- Text or shapes fading, sliding or scaling in by themselves.
- Glows, particles assembling into words, kinetic type, glitches.
- Paint appearing without a tool, or a drip that runs upward or never stops.

**Why viewers read it:** cause and effect is always on screen. A can hisses and a line grows under it, a card lifts and letters are there, the drop hits and drips race down. The robots of the slogan are literally the hand-less cans.

## Good for

- Loud brand manifestos: «рутину — роботам», before/after (cross out the old words and paint the new ones).
- Launch teasers, channel promos, website hero loops (the last bar is a pixel-exact loop).
- Any brand whose word reads well as a bubble or wildstyle piece. You can add Latin and Cyrillic glyph skeletons yourself.

## Quick start

From the plugin root (the folder name becomes the slug and the export names):

```bash
cp -R skills/law-graffiti/example my-graffiti-ad
cd my-graffiti-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                                   # the gate: exit 0 = green (WARN ok)
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/spray   # one-frame material proof
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.25  # whole film on one sheet -> .frames/
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 22.5                       # one full-size frame
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --scale 0.5 --out exports/draft.mp4
zsh deliver.sh   # master (crf 16) + web + 1280 + loop + poster + dist/<slug>.html
```

- `ffmpeg` must be on PATH (or set `FFMPEG`).
- `tools/q.sh` caps parallel Chromium runs at 3 machine-wide (`Q_SLOTS` overrides). Its lock lives in `${TMPDIR:-/tmp}/procedural-film-q`.
- A full 1080p render takes about 2 minutes on a laptop.

## Make it yours

All paths are relative to `example/`. Almost everything lives in `src/cast.js`.

- **Brand piece:** `HERO_WORD` (char, x offset, tilt, dy) and `HERO_W` (word width in cap heights), drawn from the `GLYPH` skeleton table. The table has A, i, X, e, n, x. Add letters as `{ w, strokes: [{ pts, smooth, w, hl }], polys }` in a unit box: cap height 1, baseline y = 1, x-height 0.44. Size and place it with `HERO` (`cx`, `base`, `s`). The train's piece in `carPiece()` reuses `HERO_WORD`.
- **Hook phrase:** the `wordGlyphs(CYR, 'РУТИНУ —', …)` and `wordGlyphs(CYR, 'РОБОТАМ', …)` calls in `G.build` (pieces `hook-1`, `hook-2`). Letters come from the `CYR` skeleton table, so add any missing letter there. Position is set by `HOOK`.
- **Old routine words:** `WORDS` (`[text, size, x, top, colour, tilt, 'x'|'s']`). They are baked into the wall and crossed out on the beats; times are in `crossAt`.
- **Slogan:** `words6` in `G.build` (three cards peeled on beats 3, 3½ and 4 of bar 6).
- **URLs and CTA:** the `textStencil('st-site', …'aixenix.com'…)`, `textStencil('st-tme', …'t.me/aixenix'…)` and `textStencil('st-daily', …'ИИ-ИНСТРУМЕНТЫ КАЖДЫЙ ДЕНЬ'…)` calls. Stencil text uses the system Futura Bold 700 (`SP.stencilText`, family option). Only Futura 600–700, Helvetica Neue, Avenir Next or Chalkboard SE carry Cyrillic in Chromium. `@font-face` is forbidden.
- **Colours:**
  - `SP.PAL` in `src/props.js`: paint (`magenta`, `cyan`, `violet`, `black`, `white`, `chrome`…), concrete, buff, card.
  - The local `C` table in `src/cast.js`: rolled field `C.field`, routine-word inks, train.
  - Each piece's `col: { fill, fades, block, line, line2, hl }`.
- **The paper plane:** `PLANE` (four points: nose, wing tip, notch, wing tip). Its speed-streak overspray is `streak(...)` in `G.build`, and its flight is `fly`.
- **Wall layout:** `WALL` (formwork seams, tie holes, cracks, ghost tags, buff patches) and `ZONE` (the rectangle the roller fills).
- **Duration / bpm:**
  - `BPM` and `NBARS` in `src/cast.js`; `bpm`, `duration` and `shots` (one shot per bar) in `src/timeline.js`. Each shot file in `src/scenes/` is three lines calling `FILM.G.frame`.
  - All event times use `b(bar, beat)`.
  - The camera is `KEYS_A` (before the train) and `KEYS_B` (wide final). The hidden cut is `TCUT` and the train timing is `TRAIN`.
  - Keep a beat a whole number of frames (90 bpm = 20 frames at 30 fps).
- **Music:** `src/music.js`, inside `score()` and the tables above it: `CH` (chords), `HARM`, `BASS`, `RIFF`/`RIFF2` (the hook), `MIX.ride` (section levels in dB). Picture sounds are generated from the choreography: `FILM.G.sprays()` (a hiss per can gesture), `rolls()`, `cards()` (slap + peel), `trainT()`. Re-timing the picture re-times the sound. Timeline `cues` are only for `tools/audio/analyze.cjs --cues`.

## How the engine works

- **Gesture to dabs.** A can path (Catmull-Rom) is traversed with a smooth speed profile and slowed in corners. Dabs are emitted at a fixed time step, so a dwell literally deposits more paint (`SP.stroke` in `src/props.js`).
- **Dab.** A soft core plus a faint wide halo (`dabSprite`), and droplets with a Rayleigh-tailed radius. The droplets are solid in the core and sparse speckle at the fringe.
- **Pieces and groups.** A piece is ordered groups of strokes. Each group is clipped by a canvas mask (fill, outline ring, stencil cut, shielded neighbours). Layer order can differ from time order, so an outline painted last can sit under the fill (`SP.piece`).
- **Throw-ups.** `SP.throwup` builds the following from skeleton strokes and canvas masks: sketch, two-pass fill, fades, 3D block, a black outline traced along marching-squares contours, a light second outline, shines.
- **Drips.** A 6 px load grid accumulates every dab in time order. Where it crosses the group's threshold a drip starts, with length from the excess and a finite run. Groups can hold drips until a cue (`startAt`), make them race (`runK`), floor them (`floorY`), or filter by colour.
- **Roller.** `{ roller: true }` strokes lay a band with nap texture, torn ends, tram-line edges and paint running out. It is copied 1:1 in wall-aligned slices.
- **Stencils.** `SP.stencil` / `SP.planeStencil` hold a card, spray through it (with soft overspray outside the card) and draw the card as an object that slaps and peels or flies. `SP.bridge` cuts stencil bridges into every enclosed island automatically.
- **Wall.** `SP.wall` generates concrete once: albedo, relief shade and pores. Paint skips into the pores, then the relief light multiplies over wall and paint together, so paint sits on the texture.
- **Frame.** `SP.render` draws the albedo, the paint layer (finished pieces baked in one wall-sized accumulator), pore skips and relief light. `src/cast.js` then adds the ground with sheared parallax, cards, cans with a spray cone, the train and the grade.

## Determinism and gotchas

- **Pure 2D canvas, no WebGL.** GPU vs SwiftShader does not change a pixel here, and this copy enables no ANGLE backend.
  - `FILM_GL=gpu` only matters for retro films: it stops `tools/common.cjs` pinning a `crt.js` film to SwiftShader.
  - If you add three.js/WebGL, pin a backend and re-run the gate on every target machine.
- **Caches are exact.**
  - Within a group, draws follow a canonical order: 1/15 s time chunks, then strokes.
  - Checkpoints and accumulators only extend or rebuild with the same canvas operations, so a warm frame equals a cold one.
  - The shared scratch keeps a cleared 4 px border, because sub-rectangle blits filter one texel past their edge.
  - The gate checks five orders (cold, sequential, warm forward, warm reverse, shuffled); keep it green after every change.
- **Frame cost.** At 1080p the median is about 90 ms and the mean about 105 ms (gate WARN above 150 ms is fine). The first frame takes about 2 s because it generates the concrete. Big rolled fields and many simultaneous groups cost the most.
- **Loop seam.** The last bar must be static apart from periodic motion:
  - every drip is cut at `SP.DRIP_DEADLINE`;
  - every can and card must be gone by `LOOP0` (tools fade out 0.22 s after their last stroke);
  - the handheld shake fades out before `LOOP0`;
  - the breathing, the bead and the grain clock repeat every bar.
  - Verify with a frame at `duration` vs the first loop frame (`FILM.G.frame` at both should match to 0 px).
- **Hidden cut.** `TCUT` must fall on a frame where the train cars cover the whole frame with no coupling gap in view; check the frames around it.
- **Text.** Never call `fillText` on the frame canvas: words are stencil masks and skeleton letters. Keep must-read text inside x 80–1840, y 80–1000.
- **Tools.** Run every tool with `FILM_NO_NET=1`, and run heavy tools through `zsh tools/q.sh`.

## Files map (`example/`)

| Path | What |
|---|---|
| `src/props.js` | the spray engine `FILM.spray`: palette, noise, strokes, roller, dabs, drips, pieces, throw-ups, tags, stencils, plane stencil, cans, roller tool, wall, compositor, grade |
| `src/cast.js` | the film: glyphs, wall history, every piece with beat times, camera, ground, train, tools, frame, score hooks (`FILM.G`) |
| `src/timeline.js` | 1920×1080, 30 fps, 90 bpm, 9 one-bar shots, cues |
| `src/scenes/*.js` | one per bar; each calls `FILM.G.frame(ctx, T)` |
| `src/music.js` | engine and the boom-bap score with picture-driven SFX |
| `src/core.js`, `src/lib.js`, `src/player.js` | procedural-film runtime (unchanged) |
| `tools/` | gate (`check.cjs`), `snap.cjs`, `render.cjs`, `build.cjs`, `audio/*`, `q.sh`, `fixtures/spray` (material proof) |
| `deliver.sh` | the full delivery in one command |
| `docs/` | art bible, storyboard, contract |
