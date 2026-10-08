---
name: law-shadow
description: "Law «Тень» (Shadow): nothing is drawn — every letter, icon and logo is the real shadow of ONE hovering chaotic sculpture of office junk turning under 2–3 framed projector spots. At exact yaw angles the shadows on the gallery wall snap into crisp words (hook, slogan, URL, Telegram handle) and a paper plane glides in. Solved shadow art (visual-hull style, per-beam constraints) + three.js shadow maps, volumetric beams, procedural score. Use for a brand ad or end card where chaos turns into order. Triggers: shadow art ad, shadow sculpture, junk shadow letters, words from shadows, chaos to order reveal, shadow typography, gallery spotlight shadows; RU: реклама из теней, теневой арт, тень складывается в буквы, скульптура из хлама, из хаоса в порядок, буквы из тени, ролик «Тень»."
---

# law-shadow — «Тень»

A 21.3 s 1920×1080 / 30 fps ad film where the image is never drawn: one cloud of office junk hangs in a dark
gallery, three projector spots shine through it, and at exact angles its shadows on the back wall lock into
words. It runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`: gate,
snap, render, music engine); notes shared by all ten ads are in `skills/aixenix-video/SKILL.md`. The finished,
working film is in `example/` (AiXenix: «ХАОС?» → gear → «БИЗНЕС НА | АВТОПИЛОТЕ» → paper plane → end card).

## The law

- **Must:** every mark on the wall is a shadow of the one object, computed by real shadow maps of real
  geometry. Words appear only because the object reached a solved yaw; between locks the same junk throws
  chaos. Lights switch on with a clack; the sculpture turns, nods and bobs between locks and is exactly at
  its solved pose (pitch = roll = bob = 0) on every lock.
- **Must not:** no text textures, no gobos shaped like letters, no compositing text over the wall, no
  per-reveal objects that appear and vanish. The panels are plain rectangular "framing shutter" beams.
- **Why viewers read it:** they see the junk and the wall in the same frame (the opening shot stands beside
  spot A, its beam visibly crossing the junk), they watch fragments converge into letters in the last ~10°
  of a turn, and a few recognisable junk silhouettes (a mug, a paper clip, a gear) sit next to the words as
  proof. A turn of a few degrees breaks the word again.

## Good for

Brand end cards; "chaos → order / automation / clarity" messages; 2–4 short text moments (≤ ~12 characters
per panel line); a logo-like icon; a paper-plane CTA for Telegram. Not for long copy, fast cuts or photos.

## Quick start

From the plugin root (needs Node 18+, zsh, ffmpeg on PATH):

```bash
cp -R skills/law-shadow/example my-shadow-ad && cd my-shadow-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                   # Chromium + WebAudio work
FILM_NO_NET=1 node tools/coverage.cjs                                # the shadows are exact (CPU ground truth)
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                    # the gate: exit 0 (cost WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --samples 24 --sheet --scale 0.5   # contact sheet in .frames/
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --scale 0.5 --workers 3 --out exports/draft.mp4
zsh deliver.sh                                                       # master, web, loop, poster, HTML
```

`deliver.sh` writes `exports/<folder>.mp4` (crf 16, with sound), `-web.mp4` (crf 23, silent, faststart; plus
`-1280.mp4` if the web file is over 15 MB), `-loop.mp4` (the last bar), `-poster.jpg` (frame at `POSTER_T`,
default 14 s) and `dist/<folder>.html`. The method fixture is `tools/fixtures/shadow/`
(`check.cjs --fixtures=tools/fixtures/shadow`).

## Make it yours

All paths are relative to `example/`. After ANY change to lights, targets or the cloud: run
`node tools/coverage.cjs` (add `--png` to look at `.tmp/coverage/*.png`), then the gate and a contact sheet.

- **Words, icon, plane** — `src/cast.js`, `CFG.targets`. Each target is one reveal:
  `{ id, light, yaw, items: [...] }`. Item types: `{ t: 'text', s, x, y, cap, maxW, track, font }` (wall metres;
  `font` is a key of `FONTS`: `futura` = Futura Bold, `avenir` = Avenir Next Bold — both have Cyrillic on
  macOS; elsewhere pick an installed font with Cyrillic and update `cap`, the font's cap-height ratio),
  `{ t: 'gear', x, y, r, teeth }` (`gearPath`), `{ t: 'plane', x, y, s }` (`planePath`, a side-view dart).
  Brand line: target `brand`; site: `site`; Telegram + plane: `tg`; hook: `haos`; slogan halves: `biz`, `auto`.
- **Proof silhouettes** — optional `zones: [{ x, y, r, item, scale, face, roll, s0, s1 }]` on a target reserves
  a small circle on its panel where one `ITEM_KINDS` object (mug, clip, gear…) is allowed to cast a
  recognisable shadow at that lock.
- **The flying plane** — target `tg`, `slab: { y0, from, startX }`: pieces above wall height `y0` are lifted as
  one flat slab; `from` is the yaw where the flight starts; `startX` the wall x where it should appear.
  `coverage.cjs` prints the found depth and the flight `from → to`.
- **Panels and lights** — `CFG.lights[]`: `pos` (lens), `panel` `[x0, x1, y0, y1]` on the wall `CFG.WZ`,
  `margin` (soft shutter edge), `col` (beam tint; B is cool, C is warm-magenta, A tungsten).
  Keep each beam passing through a different height band of the cloud (`CFG.O`, `CFG.R`, `CFG.RY`).
- **Timing** — `src/cast.js`: `MOVES` (`[T0, T1, yaw0, yaw1, tilt°]` turn segments; locks are the `T1`s and
  must equal the targets' `yaw`), `LIGHT_ON` (switch-on times by light index), `camAt` keyframes `K`
  (`[T, pos, look, fov]`; keep the camera static over the last bar). `src/timeline.js`: `bpm`, `duration`,
  `shots`, `cues`. Bar length is also hard-coded as `uLoop: 8 / 3` (dust and haze period, two places in
  `initGL`) — change it with the bpm or the loop seam breaks.
- **Colours** — beam tints `CFG.lights[].col`; paper and sticky-note colours `PAPERS`; junk colours inside
  `ITEM_KINDS`; wall albedo and room ambient in `ROOM_FS`; exposure `uExposure`, wall brightness `uWallGain`,
  haze `uDens`, bloom in `new THREE.UnrealBloomPass(...)`.
- **Junk mix** — `ITEM_PLAN` (`[kind, count, zone?]`), kinds in `ITEM_KINDS`; everything is accepted only
  where it breaks no reveal, so counts are upper bounds (`coverage.cjs` checks them too).
- **Music** — `src/music.js`: `CH` (chords per lock), `LOCKS` (lock times, chord, sub, bells),
  `CLACKS`, `TURNS`, `MIX.ride`, `MIX.trim` (master ≈ −16 LUFS), and `score()`. The ratchet reads the real yaw
  from `FILM.shadow.yawAt`, so it follows `MOVES` automatically. Verify with
  `node tools/audio/render-audio.cjs && node tools/audio/analyze.cjs .tmp/audio/score.wav --cues`.
- **Captions** — write `exports/<slug>-shots.md` by hand (law in one line + what happens by second).

## How the engine works

- Each reveal is a constraint (light, yaw, silhouette mask rasterised at 1 cm per wall pixel).
- A spot only lights junk inside its framed beam, so a constraint binds only the junk in that beam at that
  yaw: inside the target, or outside the beam. This relaxation is what makes 7 reveals from one rigid object
  solvable (a plain visual hull of 7 views would be empty).
- Targets are cut into row runs → linked trapezoid strips → pieces (`decompose`, `piecesOf`).
- Each piece is lifted back into 3D along the light rays through its vertices at a searched depth, with
  random tilt and crumple (`candidateS`, `tryLift`); its shadow from that light is the piece, exactly.
  Every vertex, cell centre and edge midpoint is validated against all other reveals; failures are split and
  retried, vertices may bend to follow a thin hull. Two coverings per target at independent depths.
- Bulky junk (`buildDecor`) and proof items (`buildZoneItems`) are densely sampled and accepted only where
  they obey every reveal; they keep away from the lenses so they never throw giant blobs.
- Render (`initGL`, `render`): per light an off-axis projector camera renders distance + coverage of the junk
  into a half-float map; the wall reads coverage with a PCSS-style penumbra; the junk is self-shadowed; a
  quarter-res pass raymarches haze inside the three beam frusta; dust motes, glossy floor reflection,
  bloom, ACES grade, FXAA, grain.
- Everything is seeded (`rng`, `seedOf`) and built once on first draw (~2–5 s); frames are pure functions
  of T.

## Determinism and gotchas

- **GL backend:** non-retro films use Chromium's default headless GL; on the machines this was built on that
  is ANGLE/SwiftShader (software), which is slow but hashes identically across runs. `tools/common.cjs`
  pins SwiftShader only for retro films (when `src/crt.js` exists); `FILM_GL=gpu` opts out of that pin.
  There is no Metal switch in this example. Run gate and render on the same backend you deliver with.
- **Frame cost:** ~170–280 ms per 1080p frame under SwiftShader (gate WARN expected; mean must stay ≤ 400 ms
  on an idle machine). Biggest knobs: `Q.sm` (occlusion map size, 1280), `Q.msaa` (0; FXAA instead),
  `Q.vol` (haze at 1/4 res). Parallel agents on one machine inflate the gate's numbers 2–4×; `tools/q.sh`
  caps concurrent Chromium renders (`Q_SLOTS`, default 3).
- **Loop seam:** the last bar must be static (yaw locked, camera at its final key, lamps settled); dust,
  haze and lamp flicker are periodic with `uLoop`. Grain is per frame by design.
- **Text size:** panel lines are width-limited; keep cap height ≥ 0.6 m on B/C panels at the given camera
  or phone readability suffers. Lowercase URLs read better in Avenir than in Futura.
- **Changing yaws:** two reveals of the same light should differ by ~60–90° (mod 180°); equal directions
  mod 180° make parallel strips and coverage collapses. Beams of different lights should cross the cloud at
  different heights.
- **Load time:** the solve runs in the page on first draw; the HTML player stalls a few seconds once.

## Files map

```
example/
  src/cast.js        the law: CFG (room, lights, targets), solver, junk, choreography (MOVES, LIGHT_ON, camAt), renderer
  src/scenes/*.js    seven thin shots; each calls FILM.shadow.draw(ctx, info.T)
  src/timeline.js    90 bpm, 8 bars, shots and sound cues
  src/music.js       engine + score (drone, ratchet, clacks, lock chords, plane whoosh)
  src/vendor.js      three.js r180 + addons as global THREE
  src/core.js, lib.js, player.js   procedural-film runtime
  tools/coverage.cjs CPU ground truth of every shadow
  tools/check.cjs, snap.cjs, render.cjs, build.cjs, audio/*   pipeline tools; tools/q.sh render semaphore
  tools/fixtures/shadow/   method fixture (one lock frame)
  deliver.sh         all deliverables
  docs/              pipeline templates (contract, art bible, storyboard)
```
