# Storyboard: AiXenix — «Осциллограф: звук рисует картинку» (ad)

## Logline

A dot on a vector CRT hums, then writes «СЛУШАЙТЕ КАРТИНКУ»; a sine folds into Lissajous knots, the knot becomes a gear train, the gears become two hands that shake on a deal, a chart rises, and the beam writes «БИЗНЕС НА АВТОПИЛОТЕ» → AiXenix → a paper plane loops in and lands by the address → final card.

## Law of the method

Every lit pixel is the phosphor trace of ONE electron beam whose X deflection is the LEFT channel and whose Y deflection is the RIGHT channel of the film's own soundtrack (oscilloscope music). What you hear is literally what you see. The only other pixels are the physical instrument: bezel, graticule, glass glare, the INTENS/FOCUS/X-Y knobs and the two inputs — a cyan patch cable (L) plugged into X and a magenta one (R) plugged into Y, each with an LED lit by that channel's signal. One tube, one phosphor: P31 green from the first frame to the last; the brand colours live on the hardware.

## Numbers

- 900/7 bpm → beat 7/15 s = 14 frames = 22 400 samples; 8th = 7 frames; 16th = 3.5 frames; bar 28/15 s.
- 12 bars = 22.4 s = 672 frames. `at(bar, beat)` = (bar·4 + beat)·7/15 s (0-based).
- Bars 10 and 11 are sample-identical (picture and sound): bar 11 (20.533–22.4 s, frames 616–671) loops seamlessly.
- Tuning: C = 60 Hz (the frame rate's harmonic series). Text is traced at 30 or 60 Hz only — exactly 1 or 2 full traces per 30 fps frame — so words stand still on camera while the bass moves.

## Summary

| # | id | T (s) | picture (= sound) | sound (= picture) |
|---|---|---|---|---|
| 1 | hook | 0.00–2.80 | a glowing dot, a tiny humming ring (beam warming up, focus sharpening); from 0.47 it writes СЛУШАЙТЕ / КАРТИНКУ in six 16th bursts; held | a faint 120 Hz hum; the writing buzz brightens as the path grows; text bass riff C/G at 30/60/90 Hz; half-time kicks from 1.87 |
| 2 | sine | 2.80–3.73 | the lesson: the words fold flat into a horizontal line (only L: the X LED is lit, Y dark), the line stands up vertical (only R), then both: a sine on the time base; parks to a dot for the last 16th | L only (saw, hard left), R only (hard right), then saw + sine; a 16th of silence |
| 3 | knots | 3.73–6.53 | DROP: Lissajous knots 1:2, 2:3, 3:4, 5:6 (beats), 5:8, 5:9, 8:9, 9:10 (8ths), slowly rotating; each kick shakes the knot with a ring and a faint spray of points (the click) | the knot is the interval, two octaves up so it sings on a phone: C/C, C/G, G/C, C/Eb, C/Ab, C/Bb, C/D, Bb/C; ring kicks, hats |
| 4 | gear | 6.53–9.33 | the knot unwinds into a circle (unison), grows 12 teeth; a 7-tooth gear meshes; the train ticks one tooth per beat | circle glides 240→60 Hz; gear bass 60/120/90/108 in 8ths; snares on 2 and 4 |
| 5 | deal | 9.33–11.20 | the beam unwrites the gears while it writes two reaching hands (cuffs); they close the gap; at 10.50 (off-beat) they clasp into a handshake with sleeves to the screen edges, held 0.7 s and shaken on the beat; a high ring rides the outline | hands bass Ab–Bb (48/54 Hz); the clasp is a hit + 960 Hz ring |
| 6 | chart | 11.20–13.07 | axes; five bars rise in 8ths; the trend line writes itself, carrying a small ring that sings higher as it grows, and gets its arrow; parks for a 16th (a burning dot) | a rising C-minor scale, one note per 8th; the riser is the line's ring 500→1500 Hz; silence |
| 7 | slogan | 13.07–15.87 | DROP: БИЗНЕС / НА АВТОПИЛОТЕ written in four 16ths, held ≥ 2.3 s; the kick shakes only the big БИЗНЕС | sawtooth-like text bass riff 30/60/90/120 Hz (C/G), ring kicks gated to the big line, hats |
| 8 | brand | 15.87–16.80 | the beam unwrites the slogan while it writes AiXenix | 60 Hz, then 60/120 |
| 9 | plane | 16.80–18.67 | a paper plane flies in under the name, up its right side, loops the loop above it (afterglow trail), down again and lands right of the address; the name rises; the card lines write themselves | the plane is part of the traced path; 60/120/90 groove |
| 10 | card | 18.67–20.53 | final card: AiXenix · БИЗНЕС НА АВТОПИЛОТЕ · aixenix.com · t.me/aixenix + paper plane; only the name and the plane take the kick | C/G riff at 30/60/90 Hz (whole traces per frame), kicks, hats |
| 11 | loop | 20.53–22.40 | sample-identical repeat of bar 10 | identical; loops |

## Final card (complete from 18.55 s, ≥ 3.8 s)

Scope units (x ±1 = graticule ±5 div, +y up): AiXenix cap 0.25 at baseline +0.19; БИЗНЕС НА АВТОПИЛОТЕ cap 0.085 at −0.045; aixenix.com cap 0.125 at −0.25; t.me/aixenix cap 0.125 at −0.47 (centred at x −0.07) with the paper plane (scale 0.085) to its right at (tg right + 0.15, −0.39).

## Cues (detected as onsets within 10 ms, tools/audio/analyze.cjs --cues)

0.467 write · 3.733 drop · 4.200 / 4.667 / 5.133 / 5.600 knot · 7.467 gear · 10.500 deal · 13.067 drop.
The text bars carry kicks too, but their onsets are masked by the text's own buzz (a 30 Hz path with jumps reads as an onset every 33 ms), so they are not listed as cues.
