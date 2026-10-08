---
name: law-chain-reaction
description: "Law of the method: one touch, then everything happens by itself. A Rube Goldberg machine on an office desk (three.js): a fingertip tips one domino, every later event is physically caused by the one before, one continuous camera take follows the cause, and every impact is a note of the jingle. The machine is solved from the score, so domino gaps and xylophone bars land hits on the 16th grid. Finale: falling dominoes reveal a pixel logo, a paper roll unrolls the slogan and URLs. Use for ads about automation, workflows, pipelines, 'set it and forget it'. Triggers: chain reaction ad, Rube Goldberg video, domino reveal, one click automation film, business on autopilot; цепная реакция, машина Голдберга, домино, ролик про автоматизацию, бизнес на автопилоте, один клик, сделай ролик-цепочку."
---

# law-chain-reaction: one touch, then everything happens by itself

A 19.2 s, 1920×1080, 30 fps ad film, rendered frame by frame in headless Chromium with three.js r180. It runs on the procedural-film pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`: the gate, snap, render, music engine). Shared notes for the whole AiXenix series are in `skills/aixenix-video/SKILL.md`. Everything below is relative to `example/`.

## The law

**Must happen**
- One human touch only. A fingertip pushes the first domino at 1.07 s. After that no hand, no cut and no new object appears.
- Every event is physically caused by the previous one, and the cause stays in frame:
  1. A domino line knocks a marble off a tee.
  2. The marble rolls over xylophone bars and drops into a tray on a lever.
  3. The lever's stamp hits a sticky note on a ruler catapult, which flips a coin into a piggy bank.
  4. The piggy's balance plank presses the desk fan's button, and the airflow launches a paper plane.
  5. The plane taps the phone's "Subscribe" button (the screen wakes) and drops on a trigger domino.
  6. The trigger tips a batten, the batten fells a 35×9 domino field, and the last row pushes a paper roll.
- ONE continuous camera take. The shots in `src/timeline.js` are bar-long labels on the same camera (cuts are invisible).
- Every impact is a note scheduled on the same grid time: domino ticks on the 16ths, marble = melody, stamp = backbeat, coin = bell, phone = chime, batten = gong, rows = rising arpeggio.
- Text is born by the machine:
  - the hook is printed on the first domino;
  - stage labels are physical: tent card, label-maker tape, sticky note;
  - the logo is the painted backs of the fallen dominoes;
  - slogan and URLs are printed on the roll that unrolls.

**Must not happen:** objects appearing from nowhere, a cause happening off-screen, keyframed "magic" motion, motion-graphics text overlays.

**Why viewers read it:** a Rube Goldberg machine is universally understood as "one input, everything else is automatic". The stage labels (ЗАЯВКА → CRM → СЧЁТ → ОПЛАТА → АВТОПИЛОТ) map the toy onto a business process. The pixel logo appearing under falling dominoes cannot be faked by ordinary animation, and the viewer sees why.

## Good for
- Automation, integrations, workflows, CI/CD, "set it and forget it", onboarding funnels, payments flows.
- Brands with a short name (a 7-row pixel font fits about 7 letters in 35 columns), a slogan and 1–2 URLs.
- 16:9 hero videos, landing-page loops (the last bar is a seamless loop), posters.

## Quick start
Run from the plugin root, then from your copy:
```bash
cp -R skills/law-chain-reaction/example my-chain-ad      # the folder name becomes the slug
cd my-chain-ad
npm --prefix tools ci
npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs                                   # toolchain check
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs                    # the gate: exit 0 = green (WARN is fine)
FILM_NO_NET=1 zsh tools/q.sh node tools/snap.cjs --times 0.9,7.6,13.4,17.6 --scale 0.5 --sheet --out .frames/look
FILM_NO_NET=1 zsh tools/q.sh node tools/render.cjs --scale 0.5 --workers 3 --out exports/draft.mp4
zsh deliver.sh                                                       # master + web + 1280 + loop + poster + dist html
```

Audio checks:
- `node tools/audio/render-audio.cjs` renders the score.
- `node tools/audio/analyze.cjs .tmp/audio/score.wav --cues` must report 0 misses.
- `node tools/audio/peaks.cjs .tmp/audio/score.wav` checks the peaks.

The look-dev fixture (one mid-chain hero frame) is `FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/chain-hero`. Copy `src/scenes/*.js` into `tools/fixtures/chain-hero/scenes/` after edits; its `timeline.js` sets `heroT`.

## Make it yours
| What | File | Identifier |
|---|---|---|
| Hook on the first domino | `src/scenes/01-world.js` | hero domino canvas: `g.fillText('ОДИН', …)`, `g.fillText('КЛИК', …)` |
| Logo mosaic word | `src/scenes/01-world.js` | `mosaic()` → `const word = 'AiXenix'`; glyphs in `GLYPH` (7 rows, any width) |
| Mosaic size | `src/scenes/00-phys.js` | `FD.cols`, `FD.rows` (rows = 7 glyph rows + 2 margins), `FD.pitchX` |
| Mosaic colours | `src/scenes/01-world.js` | `PAL.lacquerMag` (letter pixels), `PAL.lacquerDark` (background pixels) |
| Slogan + URLs on the roll | `src/scenes/01-world.js` | banner block: `fillText('Бизнес на автопилоте')`, `'aixenix.com'`, `'t.me/aixenix'` |
| Phone screen | `src/scenes/01-world.js` | phone canvas: `'t.me/aixenix'`, `'ИИ-инструменты'`, `'каждый день'`, `'Подписаться'`, `'09:41'` |
| Stage labels | `src/scenes/01-world.js` | `dymo('CRM')`, `dymo('ОПЛАТА')`, `dymo('АВТОПИЛОТ')`, sticky note `'СЧЁТ'`/`'№ 0001'`, placard canvas `tc` → `'ЗАЯВКА'` |
| Palette | `src/scenes/01-world.js` | `PAL` (brand magenta / cyan / violet, wood, felt, paper); bar colours `keyCol`; `scene.background`, `scene.fog` |
| Grade, vignette, exposure | `src/scenes/02-film.js` | `COMP_FS` (`aces`, grade lines, `uVig`), `uExp` |
| Melody (re-places the bars) | `src/scenes/00-phys.js` **and** `src/music.js` | `MELODY` in both (keep identical) |
| Event grid (16th indices) | `src/scenes/00-phys.js` | `N` (`tap`, `heroHit`, `marble`, `tray`, `stamp`, `coin`, `button`, `plane`, `phone`, `trigger`, `stick`, `row0`, `roll`) |
| Tempo / length | `00-phys.js` `BPM`, `CR.BARS`, `CR.DUR`; `src/timeline.js` `S16`, `duration: bar(9)`, `shots`, `cues`; `src/music.js` `S16`, `DUR`, `MIX.ride` | everything in 16ths follows; camera times do not (see below) |
| Camera path | `src/scenes/02-film.js` | `K` keyframes `[t, [dx,dy,dz], aperture, sigma, lead]` (seconds) and `action(T)` (what the camera looks at) |
| Music | `src/music.js` | `score()`, `CH`, `plan`, `RUN`, `ROWS`, `ANSWER`, `ROLL_STOP`, `COIN_UP` |
| Fonts | `src/scenes/01-world.js` | `FONT`, `FONT_H` (system fonts only: Futura / Avenir Next / Helvetica Neue) |

Rules when editing:
- After changing `N`, `BPM` or `MELODY`, re-time `K` in `02-film.js` (it is in seconds).
- Mirror any changed event times in `src/music.js`. `render-audio` loads no scene files, so the score cannot read the physics.
- Run `node -e "global.window=global;require('./src/scenes/00-phys.js');console.log(FILM.CR.line.gaps, FILM.CR.field.gaps, FILM.CR.line.e)"` to confirm gaps stay between about 1.5 and 3.5 cm and transfer coefficients `e` stay between about 0.6 and 1.6.

## How the engine works
- **`src/scenes/00-phys.js`** solves the machine once at load. Everything is pure math with a fixed step (`DT = 1/2400`).
  - **Dominoes:** hinged rigid boxes (`buildChain`). Each one free-falls under gravity. Once it touches the domino ahead it leans on it, found by SAT bisection (`lean`). The gap in front of every domino is solved so its hit lands exactly on its grid time. Where a regular spacing is requested (`gap`), the launch speed is solved instead and reported as `e`.
  - **Gravity:** `G = 245` cm/s², real gravity seen at 2× slow motion, which gives a macro "high-speed camera" feel.
  - **Marble:** rolls at 5/7·g·sinα after popping off the tee. Bar positions `M.keys[].s` are where the marble is at each note.
  - **Lever and balance:** their inertia is bisected so the swing takes exactly the beats between two events, stored as tables.
  - **Coin:** ballistic.
  - **Plane:** Catmull-Rom path with an arc-length speed profile and coordinated-turn bank `tan(bank) = v²κ/g`.
  - **Roll:** decelerates, and its radius shrinks with the paper laid down.
- **`src/scenes/01-world.js`** builds the desk and every prop once with three.js. All textures are canvases drawn from seeded hash noise (wood, felt, domino pip atlas, labels). `W.update(T)` poses everything from `FILM.CR` and holds no time state.
- **Dominoes** are two `InstancedMesh` sets with a per-instance pip-atlas cell (`aCell`, patched in `onBeforeCompile`), plus one instanced plate per field domino that carries the painted back colour.
- **Static meshes** are merged per material, and moving rigs are merged in local space (about 80–150 draw calls).
- **`src/scenes/02-film.js`** runs the single camera. Its target is the physics "action point", Gaussian-smoothed over time with a small lead (anticipation). The eye rides keyframed offsets. Focus distance equals the camera-to-target distance (auto-focus on the cause).
- **Render pipeline:** HDR half-float target with depth → half-resolution gather DOF (foreground spill, highlight bokeh) → composite (FXAA, DOF mix, 12-tap glow, ACES, warm/violet grade, vignette, per-frame grain) → `drawImage` 1:1 into the film canvas.
- **`src/music.js`** uses the skill's Web Audio engine, scheduled bar by bar. Instruments are tuned woodblocks, glock + marimba, FM bells, gong and noise for the fan and paper. Master is about −16.5 LUFS, peak about −2.7 dBFS.

## Determinism and gotchas
- **GPU backend.** Headless Chromium uses its default WebGL backend, usually SwiftShader on CPU. `FILM_GL=gpu` only matters for retro films with `crt.js`. The gate checks determinism within one machine (cold, sequential, warm forward and reverse, shuffled with decoys); pixels may differ between machines.
- **Frame cost.** About 0.38 s per frame on a quiet 12-core Mac (gate mean 376 ms). Expect 2–3× slower when other renders share the machine. The first frame takes about 8–10 s (textures, PMREM, `renderer.compile`). MSAA was replaced by FXAA because MSAA doubled the main pass in SwiftShader.
- **The loop bar (last 2.133 s)** is seamless because three things hold:
  - The camera keys are flat from 15.6 s to the end.
  - The fan's top speed `FAN.W` makes a whole number of blade periods per bar.
  - The banner breeze uses `sin(2π·T/BAR)`.

  Keep all three if you change tempo. `deliver.sh` cuts frames `(duration − bar)·fps … end`.
- **No randomness.** Do not use `Math.random`, `Date` or `performance.now` in `src/`; the gate scans for them. Seeds come from `h3`/`fbm` in `01-world.js`.
- **Text placement.** Text drawn into three.js textures is not measured by the gate's safe-area check. Keep must-read text inside about 80 px of the frame edge yourself (check the end card with snap).
- **Stale tables.** If a solved gap goes negative or above the domino height, the timing is unreachable. Move the event a 16th later or change `gap`/`e`. Never time-stretch.
- **Fixture sync.** `tools/fixtures/chain-hero/scenes/` holds copies; re-copy after edits or that fixture tests stale code.

## Files map
```
example/
  deliver.sh                 master + transcodes + poster + dist html (slug = folder name)
  src/timeline.js            9 bar-long shot labels on one take, cue list, 112.5 bpm
  src/scenes/00-phys.js      physics solved from the score (FILM.CR: L, M, LV, CP, COIN, BL, FAN, PL, PH, FD, BN, EV)
  src/scenes/01-world.js     desk, props, textures, mosaic font, W.build / W.update(T)
  src/scenes/02-film.js      camera (action point + K), render pipeline, shot registration
  src/music.js               score: every impact on the grid (engine from procedural-film)
  src/vendor.js              three.js r180 + addons as global THREE
  src/core.js lib.js player.js props.js   procedural-film runtime
  tools/                     gate (check.cjs), snap, render, build, audio/*, q.sh (semaphore, Q_SLOTS=3)
  tools/fixtures/chain-hero  one mid-chain hero frame (look-dev), three-test = three.js smoke
  docs/CONTRACT.md           build contract and project layout
```
