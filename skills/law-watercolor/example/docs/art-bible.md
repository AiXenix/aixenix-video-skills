# Art bible — AiXenix ad «Растёт само» (watercolour, 06)

House style for this film only (it replaces the skill's paper/blueprint bible: no ink line, no plates, no grain post).

## 1. Frame and camera
- 1920x1080, 30 fps, 21.333 s = 8 bars at 90 bpm. Safe area for type: x 80–1840, y 80–1000.
- One top-down take over a sheet of cold-pressed paper lying on a dark desk (#0a0012 family). Opening: 1.62x close on the sheet's lower-left corner (desk visible) and the wet hook; eases back to the whole sheet by 5.333. Bar 6: the sheet tilts (exact CPU perspective warp: right side away, a 1.4° turn, 0.88x, shadow on the desk) and settles flat by 16.0.
- Eight shots = eight bars of the same take; every shot draws the same sheet at global T, so the cuts are invisible.

## 2. Material: wet-on-wet transparent watercolour (engine `src/props.js`, FILM.wc)
- **Paper**: warm white (248, 243, 233); cold-press tooth from jittered cells + two noise octaves, raking light from the top left at ±1.7 %; faint mottle and vignette. Never embossed.
- **Colour** is Beer–Lambert absorbance per channel, summed across glazes: mixing is subtractive (yellow + blue = green, rose over gold = scarlet). Paint never covers, it stains.
- **Arrival-time fronts**: every wash grows from timed drops through a noisy, fibre-streaked speed field (16-neighbour Dijkstra, half-res). Fronts finger and feather; a bloom slows as it spreads (decay); flow stops at tFlow, softly if inside wet paper, hard at the water mask.
- **Wet**: darker (+30 % density), flatter (water fills the tooth), glossy (reflected window band), a dark bead along wet edges and a wet leading bead on loaded strokes; clear water only flattens and darkens 2.5 % (no white outlines). **Dry**: lighter, hard dark rim (4–5 px), a dark stop-rim where a bloom halted in damp paper, granulation in the paper valleys.
- **Effects**: wet-in-wet fingering where washes meet (merge regions), backruns/cauliflowers (a second clean-water front: pale inside, dark frilly line), salt starbursts (spiky pale stars with a dark fringe), flocculation and pooling.

## 2.2 Palette (named pigments, masstone over the paper; `FILM.wc.PIG`)
violet (92,52,150) the method · indigo (48,56,104) · ultramarine (56,78,178) · cerulean (62,148,204) · teal (22,158,150) · sap (96,146,52) · hooker (40,104,66) · yellow (246,198,36) · gold (228,150,34) · orange (240,104,38) · scarlet (222,54,52) · rose (216,48,112) · opera (242,52,176) · lilac (170,120,210) · sienna (168,82,42) · brand magenta #ff2bd6 · brand cyan #00f0ff · brand violet #bf00ff (signature only).

## 3. Lettering (born by the law: a wet thread under every word, one drop at its start)
- Futura Bold 700 rasterised as a water mask + a wavy wet thread under the baseline; one drop at the thread's start fills the word; orphan pieces (ё dots, i dots, full stops) get a slower sweep drop. Before the colour arrives the water letters glisten (gloss).
- Hook «Растёт само» 84 px at (104, 972), violet/ultramarine. Slogan «Бизнес / на автопилоте» 96 px, two lines (432 / 532) joined by a running link. «AiXenix» 196 px at baseline 300, magenta→violet→cyan, fed by the tilt streams and by a drop per letter; left wet (glint) into the loop. «aixenix.com» 86 px (700), plane + «t.me/aixenix» 80 px (818).

## 10. Subject reference — what must be true
- A drop into wet paper blooms with feathered fingers and a dark core; into dry paper it makes a hard-edged dot (the splash satellites).
- Pigment runs along wet channels (stems) from the bloom; each flower is pre-wetted (glistens) a beat before its colour drops in; petals are separate washes with dry gaps; centres are dropped wet-into-wet and bleed.
- Washes dry lighter; rims appear as they dry; salt only works on a damp wash; backruns only form when wetter water hits a drying wash.
- The drop is a violet lens (magnified paper, violet shadow with a caustic); the impact flattens it into the pool with a crown of droplets.
- Mistakes to avoid: embossed paper (keep shading ≤ 2 %); opaque flat fills (use pooling, source boost, rims); white "chalk" ghosts of clear water (no meniscus; sheen on clear water ×0.1); stems cutting notches into the bloom (heart on its own layer); anything still changing in the loop bar (the paint is frozen at T 13.333, only the reflected light moves).
- Stair-stepped bleed/backrun edges (use the smooth iso-line of the reached cells, bilinear arrival time); stems plugged into the bloom (stem pigment faint inside r 138–192); leaves glazed over petals (skipped); colour from nowhere (the halo is only the method's violet family).
- Icons are wet silhouettes with reserved (cut) white details: chat dots, document lines, gear hole, mail V, robot eyes, check mark; the chart's drop lands on its axis so the bars grow upward.
- The rain blooms on the right dry 50 % paler (dryFade) into a luminous ground for the card; they must never sit dark under type.
