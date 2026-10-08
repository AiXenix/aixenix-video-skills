# Art bible — 01 «Осциллограф»

## 1. The law
One electron beam. X deflection = LEFT channel, Y deflection = RIGHT channel of the film's own
soundtrack (FILM.osc, src/cast.js). Nothing else glows. src/music.js plays the same samples; the
renderer (src/props.js, FILM.scope) draws the same samples. No graphics are allowed on the screen that
the beam did not draw.

## 2. The physics the renderer honours
- Brightness ∝ time the beam spends per pixel (1/speed): slow strokes and dwell dots are bright,
  blanking jumps between strokes are faint lines (kept: they prove there is one beam).
- Between samples the beam follows the reconstructed analogue signal (Catmull-Rom), not straight chords.
- Gaussian spot σ = 1.25 px (focus; defocused 3.2 px at power-on, sharpening over 0.45 s).
- Two-layer phosphor: fast fluorescence (τ 4 ms) and slow afterglow (τ 50 ms), integrated over the
  camera shutter [T, T + 1/30). Moving things leave afterglow trails; the head is the fresh colour.
- Halation/bloom through the glass, a 2.8 % barrel bulge of the face, vignette, faint phosphor grain,
  inner graticule 10 × 6 divisions of 0.2 units with minor ticks on the axes, a soft window glare.

## 3. Palette
- Story (P31-like): core #8cffa0-ish white-green, afterglow green, halo #4dff73; glass #020503.
- No colour change: one tube, one phosphor, green to the end (a phosphor cannot change hue; the critic
  pass caught an earlier cyan/magenta finale as the one motion-graphics moment).
- Brand colours on the hardware: cyan patch cable + LED on the X/L input (#00f0ff), magenta cable + LED
  on the Y/R input (#ff2bd6); the LEDs are lit by each channel's signal level.
- Panel: matte charcoal #15171b with faint brushed lines, steel jacks, black knurled knobs, an amber lamp.

## 4. Geometry
Frame 1920×1080. Phosphor face x 180–1740, y 62–1018, corner radius 74. Beam centre (960, 540),
1 scope unit = 760 px. Must-read text within x ±0.9, y ±0.5 units.

## 5. Lettering
Single-stroke vector font (src/props.js FILM.vec.G): Cyrillic caps, Latin caps/lowercase for the
brand and the addresses, cap height 1, x-height 0.62; dots of i and «.» are dwell points (the beam rests).
Panel labels (X / L, Y / R, INTENS, FOCUS, X-Y) use the same font, stroked in grey on the panel.

## 6. Mistakes to avoid
- Text traced at a pitch that is not a whole number of traces per frame crawls on camera → 30 / 60 Hz only.
- Text traced too fast (120 Hz+) loses its curves (few samples per letter) → keep long paths slow.
- Kicks/hats are the picture too: a loud kick is a big ring, a hat is fuzz. On text the kick ring rides
  only the big letters (and the plane), never the small CTA lines; hats on text are tiny.
- Any EQ/compressor/limiter on the audio would bend the picture → none; the shapes are sized for headroom.
