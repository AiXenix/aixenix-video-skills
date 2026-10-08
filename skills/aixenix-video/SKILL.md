---
name: aixenix-video
description: Code-drawn ad videos where one visible LAW creates every pixel — oscilloscope music, a 1774 clockwork automaton, a Rube Goldberg chain reaction, shadow sculpture, a split-flap departure board, wet watercolour, live graffiti, one-sheet origami, a starling murmuration, ferrofluid. Use when the user wants a striking procedural/code-generated promo, ad, intro or explainer video (three.js / Canvas2D, no video generators), wants to pick one of these ten styles, or wants to invent a new "law" style. Триггеры: «сделай рекламный ролик кодом», «видео в стиле табло / осциллограф / мурмурация / акварель / граффити», «крышесносная техника видео», «процедурное видео three.js».
---

# AiXenix video laws

Ten ways to make a short ad entirely in code, each built on one **law of the method**: a hard rule that creates the whole image and that the viewer can *read* — so the technique itself is the show. Every law ships as its own skill with a complete working example (an AiXenix ad, 19–24 s, 1920×1080, 30 fps, with its own synthesised score).

All laws run on the **procedural-film** pipeline bundled in this plugin (`skills/procedural-film/SKILL.md`): every frame is a pure function of time, rendered headless frame by frame, gated for determinism, then encoded with ffmpeg. Read it once; the law skills only describe what differs.

## Pick a law

| Skill | The law (everything on screen obeys it) | Best for |
|---|---|---|
| `law-oscilloscope` | Every pixel is the trace of ONE electron beam whose X/Y are the left/right channels of the film's own soundtrack. | tech, music, «the sound draws the picture» |
| `law-automaton` | A 1774-style clockwork writer pens every mark; the quill path is stored in brass cam profiles. | heritage, craft, «automation since 1774» |
| `law-chain-reaction` | One touch, then a Rube Goldberg machine does everything; every impact is a note of the jingle. | process automation, workflows, cause → effect |
| `law-shadow` | Nothing is drawn — the words are the real shadows of one floating cloud of junk under spotlights. | «order out of chaos», reveals |
| `law-splitflap` | Only a mechanical Solari board: text and pictures are mosaics of flaps that step one by one, each one a click. | launches, «departures», announcements |
| `law-watercolor` | Nothing is painted by hand: water is laid, a drop falls, colour runs along the wet paths by itself. | growth, calm premium, «it grows by itself» |
| `law-graffiti` | A wall painted live by hands-free cans, a roller pole and stencils; drips run by gravity. | loud, youth, manifestos, Telegram/social |
| `law-origami` | One sheet, never cut or glued, folds itself from figure to figure; every crease stays. | elegance, «one tool does it all» |
| `law-murmuration` | Nothing is drawn — 30 000 starlings form every shape and letter. | collective intelligence, AI, scale |
| `law-ferrofluid` | An invisible magnet types every image as Rosensweig spikes in black magnetic fluid. | «invisible force», luxury product shots |

Each law folder holds `SKILL.md` (how to make your own video with it), `README.md` (Russian quick guide) and `example/` (the full project: `src/`, `tools/`, `docs/`).

## Shared engine

`engine/` is a ready project template = procedural-film foundation + **three.js r180 with addons** pre-bundled as the global `THREE` in `src/vendor.js` (EffectComposer, RenderPass, ShaderPass, UnrealBloomPass, OutputPass, BokehPass, AfterimagePass, FilmPass, SMAAPass, RoundedBoxGeometry, ParametricGeometry, ConvexGeometry, DecalGeometry, SimplexNoise, ImprovedNoise, MeshSurfaceSampler, BufferGeometryUtils, MarchingCubes, RoomEnvironment, CopyShader, FXAAShader). The tools are patched so `vendor.js` loads first and is exempt from the media/source scans. `tools/fixtures/three-test/` is a minimal three.js scene that passes the determinism gate: render into your own canvas with `preserveDrawingBuffer: true`, then `ctx.drawImage` it 1:1 into the frame.

```bash
cp -R skills/aixenix-video/engine/. my-film/ && cd my-film
npm --prefix tools ci && npx --prefix tools playwright install chromium
FILM_NO_NET=1 node tools/smoke.cjs
FILM_NO_NET=1 zsh tools/q.sh node tools/check.cjs --fixtures=tools/fixtures/three-test
```

## Make a video

1. Choose the law with the user (table above) — or invent one (below).
2. Open that law's `SKILL.md`, copy its `example/` to a new folder and follow its Quick start.
3. Edit the content where its "Make it yours" section points (brand, slogan, URLs, colours, timing, music).
4. Keep the gate green (`node tools/check.cjs`), look at contact sheets (`tools/snap.cjs --sheet`), run a harsh critic pass, render (`tools/render.cjs`), deliver (`deliver.sh` where present).

Formats: 1920×1080 at 30 fps by default; the last bar is a seamless loop (for site backgrounds). A vertical cut means changing `width/height` in `src/timeline.js` and re-framing the camera/layout — check every text block against the safe area.

## Invent a new law

The ten laws work because the *method of making the picture* is visible and strict — not because the texture is pretty. A new law needs:

1. **The rule** — what must create every pixel and what is forbidden (e.g. «only shadows», «one unbroken line», «only mechanical flaps»).
2. **A real engine for it** — physics, mechanics, optics or simulation that actually obeys the rule (no faking with ordinary motion graphics).
3. **A camera grammar** that shows the rule working (one take, macro reveal, pull-back).
4. **One metaphor** linking the rule to the message.
5. **The critic test**: «Could this be made with ordinary animation? Is the rule readable without explanation? Is the call to action readable on a phone for ≥ 3 s?» If the first answer is yes, it is not a law.

## Determinism and performance (all laws)

- No `Math.random`, `Date`, `performance.now` in your code; seed everything; simulations run at a fixed step from T = 0 (precomputed at load) so any frame order gives identical pixels.
- Caches only if their output equals a cold draw; never a growing pooled canvas; 2D canvases that you read back: `getContext('2d', { willReadFrequently: true })`.
- WebGL headless defaults to SwiftShader (CPU, 0.4–4 s/frame for heavy scenes). Some examples enable ANGLE Metal on macOS in `tools/common.cjs` (≈ 100× faster); `FILM_GL=swiftshader` restores the default. Determinism was proven per machine — re-run the gate on yours.
- Heavy tools go through `tools/q.sh` (a semaphore; `Q_SLOTS` sets the parallel renders).
