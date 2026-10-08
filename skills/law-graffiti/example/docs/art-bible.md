# Art bible: «Граффити» (AiXenix ad, v2 of demo 07)

The house style of the skill (paper and blueprint plates, ink lines, hatching) does **not** apply to this film.
This bible replaces it with one material: aerosol paint on cast concrete, filmed by a handheld dolly.
Every rule below is implemented in `src/props.js` (engine) and `src/cast.js` (choreography); the numbers here are the numbers in the code.

## 1. Frame

- 1920×1080, 30 fps, 24.0 s = 9 bars at 90 bpm (beat 0.6667 s = 20 frames, bar 2.6667 s = 80 frames). `mode: 'none'` on every shot: the engine paints its own ground (railway ballast, sleepers, rails), no core grain.
- Safe area for must-read text: x 80…1840, y 80…1000. The two text cuts (the phrase stencil and the promise stencil) sit inside it at their reading moments; the wordmark «AiXenix» spans x ≈ 390…1560 at the final framing.
- The last bar (21.333–24.0 s) is a seamless loop: everything painted is finished and every drip has settled by 21.27 s (`SP.DRIP_DEADLINE`); the camera's breathing, the glints and the grain are periodic with period = 1 bar (frame at 24.0 s == frame 640, verified 0 px).

## 2. Palettes

### 2.1 Wall (unshaded albedo; the relief light multiplies over wall and paint alike)

| name | hex | use |
|---|---|---|
| concrete | `#8c8983` | reference tone (the generator works in value 0.49 ± mottling) |
| concreteCool | `#7f8285` | cool buff patches |
| buffGrey | `#9d9a93` | roller buff over old tags |
| buffDark | `#6f6d69` | dark buff patches |
| buffBeige | `#a89f8d` | warm buff patches |
| rust | `#8a4a22` | tears under the formwork tie holes |
| grime | `#3b3833` | seams, cracks, shadows of cans and cards |
| ghostRed / ghostBlue / ghostInk / ghostGreen | `#7d3b36` `#3e5470` `#3a3836` `#4f6a4a` | faded old tags under the buff |

### 2.2 Paint (subject palette: brand colours are native spray colours here)

| name | hex | use |
|---|---|---|
| magenta | `#ff2bd6` | hero fill, bubble throw-up, play icon, fades |
| cyan | `#00f0ff` | 3D block of the hero, bolt/eye tags, stencil phrase top, lock arrows, t.me line |
| violet | `#bf00ff` | cloud rim, spark throw-up, robot stencil, bottom fades |
| deep | `#2a0846` | cloud core |
| black | `#141016` | outlines, tags, the band under the phrase |
| white | `#f6f4ef` | second outlines, highlights, promise text, sparkles |
| chrome | `#cfd3d8` | chrome fills (nodes, </>), silver tags |
| yellow | `#ffe14a` | one accent (bolt icon, one tag) |

### 2.3 Objects

card `#c4ad84` / cardDark `#9c8660` (stencil cardboard), canBody `#1d1c22`, canMetal `#d9dde2`, nozzle `#f2f0ea`.

## 3. The spray (props.js)

- **Gesture**: a can path (Catmull-Rom through control points) traversed with a sinusoidal speed profile `p(τ) = τ − (e/2π)·sin 2πτ` and slowed in corners (time weight `1 + kc·2.2·(turn/90°)^1.3`).
- **Dabs** are emitted at a fixed time step `dt = 0.5σ / v_max` (1/5000…1/110 s), so slow passes and dwells (`d0`, `d1`) deposit more paint: pressure × dwell is literal.
- **Profile** of one dab: `0.84·exp(−(d/σ)^2.4) + 0.16·exp(−(d/2σ)²)`, cut at 4σ. Alpha per dab `a = D·v_nom·dt / (2.0·σ)` with `D = −ln(1 − opacity)`, so one pass at nominal speed reaches the requested centre coverage and overlap accumulates like real paint.
- **Droplets**: per dab `a·σ²·0.33·speck` specks, radius from a Rayleigh tail (scale 1.45σ), size 0.45…1.8 px (rare 3 px): solid in the core, a thinning speckle at the fringe.
- **Caps**: skinny tags σ 3.5–5.5 px; outlines σ = 0.4·outline width; fills σ = 0.36·fat; band/cloud fat caps σ 30–70 px.
- **Drips**: a 6 px load grid accumulates every dab's deposit in time order; where it crosses the group's threshold (6.2…9) a drip starts 0.07–0.25 s later from the lower edge of the wet patch, length `16 + 120·√excess` px, width 0.42–0.72σ, running down with `L(x) = Lmax·(1 − (1−x)³(1+3x))` (slow start, fastest at a third, exact stop). Outline drips only start where no letter lies below.
- **Wall interaction**: pores of the concrete erase paint at 62 % (paint skips into bugholes), then the relief-light map multiplies over wall and paint together, so paint sits *on* the texture.

## 4. Pieces

- **Throw-up / piece** (letters and icons from a skeleton): soft sloppy fill (clip = shape + 1.15 outline, 4.5 px feather) → horizontal fade sweeps → 3D block (union of shifted shapes) → black outline traced along marching-squares contours of the silhouette and of the letters → white second outline outside it → short white shines on the upper-left inner edges → marks. Layer order is bottom-up `line2, block, fill, line, highlights, marks`; time order is fill, fades, block, line, line2, highlights.
- **Tag**: one continuous handstyle run plus an underline swoosh, skinny cap, fast (1500–1800 px/s), drips at the dwells.
- **Stencil**: a cardboard card (tape, ghost overspray from earlier jobs) slaps on in 0.16 s, gets sprayed in sweeps that stay 5–20 % inside its edges, lifts in 0.55 s (scale up, rotate, fade, shadow growing). On the wall: crisp cut letters (0.9 px feather) plus a soft overspray frame around the card (2.2 px feathered edge). Every enclosed island of card gets a bridge (text: top and bottom; icons: top only).
- **Cloud**: six fat-cap core rows (deep violet) and 40 overlapping spiral puffs on a bubbly rim (violet / magenta-violet), left to right as the camera arrives.

## 5. Camera

One handheld dolly, never cut: Hermite keys on x (980 → 1250 → 1535 → 1800 → 2250 → 2585 → 2690 → 2700 px) with set velocities, a zoom ease 1.0 → 0.94 in bars 4–5, an aperiodic handheld shake (±4.6 px, ±0.12°) that fades out before the loop, and a periodic breathing (±5 px, ±0.08°, period one bar) everywhere. Parallax: a blurred chain-link fence (factor 3.2) in bar 1, a blurred lamp pole (3.0) in bar 4, the sidewalk sheared per row (0.0042 px/px).

## 6. Text

- Phrase stencil «БЕЗ КУРСОВ И ВОДЫ»: Futura Bold 700, 106 px, cyan top / magenta bottom on a black band.
- Wordmark «AiXenix»: drawn letters (skeleton strokes, fat 0.23 cap height), wildstyle-ish tilts ±0.07 rad, two i-dots are four-point stars, arrows off X and x.
- Promise stencil «РАБОЧИЕ ИИ-ИНСТРУМЕНТЫ КАЖДЫЙ ДЕНЬ» (46 px, white) and «t.me/aixenix» (44 px, cyan), Futura Bold 700.
- No `fillText` on the frame canvas; text exists only as stencil cuts (system font, no `@font-face`).

## 7. Determinism

Every random number is `lib.h3` / `lib.rng` of a seed. Draw order inside a group is canonical (time chunks of 1/15 s, then strokes), so checkpoints extended chunk by chunk equal a cold build. Per-piece accumulators hold "groups 0..k−1 complete"; a wall-sized accumulator holds "pieces 0..m−1 finished"; both only extend or rebuild. The shared scratch keeps a cleared 4 px border because the sub-rectangle blit filters one texel past its edge.

## 10. Subject reference

### 10.1 Spray paint on concrete
Soft core, a faint wide halo, droplets at the fringe; overlapping passes build opacity; slow motion and stops pool paint that runs down as drips with a bead at the tip; on rough concrete the paint follows the relief and skips the deepest pores.

### 10.2 Stencils
The card leaves a crisp edge where it was flat and a fuzzy overspray frame around its outline; islands need bridges.

### 10.3 Pieces
Fill first and sloppily, outline last and crisp; fades by sweeping a second colour across; a 3D block and a second (light) outline lift the piece off a dark background; white shines and four-point sparkles finish it.

### 10.N Mistakes to avoid
- A fill with crisp edges before the outline → it reads as a sticker. Fill must be soft and overshoot.
- Black outline drips running *over* the fill → only allow drips with nothing of the letter below.
- Highlights along the whole stroke → they read as a second outline; keep shines short and on the lit side only, none on crossbars.
- A small "e" counter → the e becomes a blob; keep the eye open (bar at 0.765, arc ry 0.315, stroke 0.86 fat).
- Anything moving in the loop bar that is not periodic (cans, drips, cards) → finish it by 13.28 s.

## Ad additions (v2)

- **Roller on a pole** (`SP.stroke({ roller: true })`): a vertical band 260 px wide, nap texture (noise stretched along the motion), edge ridges ("tram lines"), paint load 1.0 → 0.66 along each stroke with dry streaks, spatter specks; wall-aligned slices copied 1:1 per time chunk, so the band never seams. Pseudo-dabs at both ends feed the drip load; the field's drips are held and released on the drop (`drip.startAt`, `runK` < 1 = racing).
- **Routine words** are old stencils baked into the wall (Futura Bold through a card, faint card halo), painted after the buffs so they stay readable, then crossed out live (X for short words, strike-through for long ones).
- **Sketch**: before the drop two cans trace the AiXenix contours in a 3 px white line; the fill covers it.
- **Shielded stencils**: the three word-cards abut; each card's mask also blocks the paint under its neighbours, so one black sweep leaves no bars between the words.
- **Reverse stencil**: the paper-plane card blocks paint; a slit cut along its fold lets a thin line through; the card peels off and flies at the camera (scale ×3.2, banks −0.5 rad) leaving the crisp silhouette in the violet/magenta ring.
- **Train**: three commuter cars pre-rendered with a horizontal smear (10 offset copies + 4 px blur), carrying tags sprayed with the same engine; the camera cut to the wide framing happens while the cars cover the whole frame (frames 580–583).
