/*
 * cast.js : THE SCORE. One electron beam, one stereo signal.
 *
 * FILM.osc.get() computes, once per page, the film's entire soundtrack as two Float32Arrays at
 * 48 kHz: X (LEFT channel) and Y (RIGHT channel), in scope units. src/music.js plays these exact
 * samples (times a fixed gain); src/props.js (FILM.scope) draws these exact samples as the trace of
 * the beam. Nothing else is drawn and nothing else is heard.
 *
 * How a picture becomes music:
 *   - a shape is a closed beam program (FILM.vec.build); tracing it f times per second is a note of
 *     pitch f whose timbre is the shape. Rhythm = changing the trace rate or the shape on the grid.
 *   - two sines on X and Y at p:q make a Lissajous knot: the knot IS the interval p:q.
 *   - a kick drum is a ring whose radius decays while its pitch drops (sin/cos chirp) — added to
 *     the shape, it shakes the picture on the beat; hats and snares are noise, the trace frizzes.
 *   - the text sections pump between 30 Hz and 60 Hz: exactly 1 or 2 traces per 30 fps frame, so
 *     the words stand still on camera while the bass moves.
 *
 * Grid: 900/7 bpm, beat 7/15 s = 14 frames = 22 400 samples, bar 28/15 s, 12 bars = 22.4 s.
 * Bars 10 and 11 are sample-identical: the last bar loops seamlessly (picture and sound).
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const V = FILM.vec;
  const h3 = FILM.lib.h3;
  const TAU = Math.PI * 2;

  const SR = 48000;
  const BEAT = 7 / 15;
  const S16 = BEAT / 4;
  const E8 = BEAT / 2;
  const NBARS = 12;
  const DUR = NBARS * 4 * BEAT; // 22.4 s
  const at = (bar, beat) => (bar * 4 + (beat || 0)) * BEAT;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (v) => {
    const x = clamp(v, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const eout = (v) => 1 - Math.pow(1 - clamp(v, 0, 1), 3);
  const einout = (v) => {
    const x = clamp(v, 0, 1);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  };

  // ------------------------------------------------------------------ the cast (beam programs)
  let P = null;
  // a reaching hand: left hand pointing right, thumb up, fingers together, with its sleeve cuff
  const HAND = {
    outline: [
      [-0.58, 0.125], [-0.34, 0.14], [-0.2, 0.16], [-0.12, 0.2], [-0.04, 0.255], [0.03, 0.29], [0.09, 0.3], [0.125, 0.285],
      [0.12, 0.255], [0.075, 0.215], [0.02, 0.175], [0.07, 0.155], [0.2, 0.14], [0.33, 0.125], [0.42, 0.11], [0.47, 0.09], [0.49, 0.065],
      [0.48, 0.04], [0.45, 0.025], [0.34, 0.012], [0.2, -0.005], [0.08, -0.035], [-0.04, -0.085], [-0.16, -0.13], [-0.3, -0.145],
      [-0.58, -0.125],
    ],
    details: [
      [[-0.58, 0.17], [-0.86, 0.17], [-0.86, -0.17], [-0.58, -0.17], [-0.58, 0.17]],
      [[0.12, 0.093], [0.3, 0.078], [0.44, 0.06]],
      [[0.1, 0.045], [0.26, 0.036], [0.4, 0.03]],
    ],
  };
  const HAND_S = 0.72;
  function handStrokes(mirror, tx, ty, s) {
    const m = mirror ? -1 : 1;
    const f = ([x, y]) => [tx + m * x * s, ty + y * s];
    return [HAND.outline.map(f), ...HAND.details.map((d) => d.map(f))];
  }
  // the clasp: a handshake drawn as one line drawing (front hand from the right wraps its four
  // fingers over the left hand; the left thumb rests on the front hand's back)
  const CLASP_RAW = [
      [[-1.008, -0.022], [-0.941, 0.246], [-0.762, 0.202], [-0.829, -0.067], [-1.008, -0.022]],
      [[-0.773, 0.168], [-0.582, 0.202], [-0.448, 0.235], [-0.370, 0.246]],
      [[-0.818, -0.045], [-0.650, -0.090], [-0.504, -0.134], [-0.403, -0.157]],
      [[-0.112, 0.246], [-0.109, 0.240], [-0.091, 0.267], [-0.057, 0.290], [-0.012, 0.306], [0.041, 0.313], [0.096, 0.311], [0.146, 0.300], [0.187, 0.280], [0.214, 0.255], [0.190, 0.224], [0.112, 0.202]],
      [[1.008, 0.022], [0.941, -0.246], [0.762, -0.202], [0.829, 0.067], [1.008, 0.022]],
      [[0.773, 0.045], [0.582, 0.134], [0.403, 0.202], [0.246, 0.224]],
      [[-0.067, 0.263], [-0.202, 0.269], [-0.314, 0.263]],
      [[-0.314, 0.263], [-0.381, 0.224], [-0.414, 0.112], [-0.414, -0.112], [-0.403, -0.179], [-0.403, -0.179], [-0.396, -0.204], [-0.378, -0.223], [-0.353, -0.230], [-0.328, -0.223], [-0.309, -0.204], [-0.302, -0.179], [-0.296, -0.193], [-0.277, -0.212], [-0.252, -0.218], [-0.227, -0.212], [-0.208, -0.193], [-0.202, -0.168], [-0.195, -0.182], [-0.176, -0.200], [-0.151, -0.207], [-0.126, -0.200], [-0.108, -0.182], [-0.101, -0.157], [-0.094, -0.171], [-0.076, -0.189], [-0.050, -0.196], [-0.025, -0.189], [-0.007, -0.171], [0.000, -0.146], [0.022, -0.112], [0.112, -0.067]],
      [[0.112, -0.067], [0.336, -0.090], [0.560, -0.134], [0.818, -0.134]],
      [[-0.302, -0.151], [-0.297, 0.022]],
      [[-0.202, -0.151], [-0.196, 0.022]],
      [[-0.101, -0.151], [-0.095, 0.022]],
      [[-0.336, 0.179], [-0.056, 0.190]],
    ];
  const CLASP_S = 0.86;
  const CLASP = [
    ...CLASP_RAW.map((st) => st.map(([x, y]) => [x * CLASP_S, y * CLASP_S])),
    // forearms: the sleeves run from the cuffs off both edges of the screen
    [[-0.941 * CLASP_S, 0.246 * CLASP_S], [-1.16, 0.25]],
    [[-1.008 * CLASP_S, -0.022 * CLASP_S], [-1.16, -0.05]],
    [[0.941 * CLASP_S, -0.246 * CLASP_S], [1.16, -0.25]],
    [[1.008 * CLASP_S, 0.022 * CLASP_S], [1.16, 0.05]],
  ];

  // gear train geometry
  const GA = { R: 0.4, n: 12, h: 0.075, hub: 0.12 };
  const GB = { R: 0.4 * 7 / 12, n: 7, h: 0.075, hub: 0.075 };
  const BETA = 28 * (Math.PI / 180);
  const CA = [-0.24, -0.06];
  const CB = [CA[0] + (GA.R + GB.R) * Math.cos(BETA), CA[1] + (GA.R + GB.R) * Math.sin(BETA)];
  const PA = TAU / GA.n;
  const PB = TAU / GB.n;
  const ROT_A0 = BETA - 0.27 * PA;
  const ROT_B0 = BETA + Math.PI - 0.77 * PB;

  // chart geometry
  const CH = {
    axes: [[[-0.74, 0.5], [-0.74, -0.46], [0.8, -0.46]]],
    bars: [-0.6, -0.36, -0.12, 0.12, 0.36].map((x, k) => ({ x, w: 0.13, h: [0.16, 0.27, 0.36, 0.5, 0.68][k] })),
    line: [[-0.66, -0.28], [-0.42, -0.14], [-0.2, -0.2], [0.04, 0.02], [0.26, -0.02], [0.62, 0.36]],
  };

  function card() {
    const brand = V.text('AiXenix', { x: 0, y: 0.19, size: 0.25, align: 'center', track: 0.2 });
    const slogan = V.text('БИЗНЕС НА АВТОПИЛОТЕ', { x: 0, y: -0.045, size: 0.085, align: 'center', track: 0.22 });
    const site = V.text('aixenix.com', { x: 0, y: -0.25, size: 0.125, align: 'center', track: 0.2 });
    const tg = V.text('t.me/aixenix', { x: -0.07, y: -0.47, size: 0.125, align: 'center', track: 0.2 });
    const tgRight = -0.07 + tg.width / 2;
    return { brand, slogan, site, tg, planeAt: [tgRight + 0.15, -0.39], planeS: 0.085, planeA: 0.32 };
  }

  function cast() {
    if (P) return P;
    const C = card();
    const hook = [
      ...V.text('СЛУШАЙТЕ', { x: 0, y: 0.08, size: 0.23, align: 'center', track: 0.2 }),
      ...V.text('КАРТИНКУ', { x: 0, y: -0.3, size: 0.23, align: 'center', track: 0.2 }),
    ];
    const sl1 = V.text('БИЗНЕС', { x: 0, y: 0.08, size: 0.23, align: 'center', track: 0.2 });
    const sl2 = V.text('НА АВТОПИЛОТЕ', { x: 0, y: -0.27, size: 0.15, align: 'center', track: 0.2 });
    const brandBig = V.text('AiXenix', { x: 0, y: -0.13, size: 0.31, align: 'center', track: 0.2 });
    P = {
      C,
      hook: V.build(hook),
      sl1: V.build(sl1),
      sl2: V.build(sl2),
      brandBig: V.build(brandBig),
      brand: V.build(C.brand),
      cslogan: V.build(C.slogan),
      site: V.build(C.site),
      tg: V.build(C.tg),
      plane: V.build(V.plane(0, 0, 1, 0)),
      circle: V.build(V.circle(0, 0, 1, 96, 0)),
      gearA: V.build(V.gear(0, 0, GA.R, GA.n, { h: GA.h, hub: GA.hub })),
      gearB: V.build(V.gear(0, 0, GB.R, GB.n, { h: GB.h, hub: GB.hub })),
      handL: V.build(handStrokes(false, 0, 0, HAND_S)),
      handR: V.build(handStrokes(true, 0, 0, HAND_S)),
      clasp: V.build(CLASP),
      axes: V.build(CH.axes),
      bars: CH.bars.map((b) => V.build([[[b.x, 0], [b.x, 1], [b.x + b.w, 1], [b.x + b.w, 0]]])),
      line: V.build([CH.line]),
      arrow: V.build([[[0.52, 0.34], [0.62, 0.36], [0.6, 0.26]]]),
    };
    return P;
  }

  // ------------------------------------------------------------------ composite: several programs share one beam
  // Parts are evaluated by beam phase; each part gets a share of the cycle proportional to its weight.
  // A part's reveal r: r >= 1 the whole program; 0 <= r < 1 only [0, r] (being written);
  // r < 0 only [-r, 1] (being erased from its start). comp() records which part the beam is in.
  const tmp = [0, 0];
  let lastPart = 0;
  function posFrom(prog, u, a, out) {
    const k = 0.985;
    const f = u - Math.floor(u);
    const aa = Math.min(0.9999, Math.max(0, a));
    if (f < k) return V.pos(prog, aa + (f / k) * (1 - aa), out);
    const q = (f - k) / (1 - k);
    V.pos(prog, 0, out);
    const ex = out[0];
    const ey = out[1];
    V.pos(prog, aa, out);
    out[0] = ex + (out[0] - ex) * q;
    out[1] = ey + (out[1] - ey) * q;
    return out;
  }
  function part(prog, u, r, out) {
    if (r >= 1) return V.pos(prog, u, out);
    if (r >= 0) return V.posReveal(prog, u, r, out);
    return posFrom(prog, u, -r, out);
  }
  /** parts: flat array of [prog, weight, reveal, sx, sy, rot, tx, ty] records */
  function comp(parts, n, u, out) {
    let total = 0;
    for (let k = 0; k < n; k++) total += parts[k * 8 + 1];
    let f = (u - Math.floor(u)) * total;
    let k = 0;
    for (; k < n - 1; k++) {
      const w = parts[k * 8 + 1];
      if (f < w) break;
      f -= w;
    }
    lastPart = k;
    const b = k * 8;
    const w = parts[b + 1];
    part(parts[b], w > 0 ? f / w : 0, parts[b + 2], tmp);
    const sx = parts[b + 3];
    const sy = parts[b + 4];
    const a = parts[b + 5];
    const x = tmp[0] * sx;
    const y = tmp[1] * sy;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out[0] = x * c - y * s + parts[b + 6];
    out[1] = x * s + y * c + parts[b + 7];
    return out;
  }
  const PARTS = new Array(8 * 8);
  function setPart(k, prog, weight, reveal, sx, sy, rot, tx, ty) {
    const b = k * 8;
    PARTS[b] = prog;
    PARTS[b + 1] = weight;
    PARTS[b + 2] = reveal;
    PARTS[b + 3] = sx;
    PARTS[b + 4] = sy;
    PARTS[b + 5] = rot;
    PARTS[b + 6] = tx;
    PARTS[b + 7] = ty;
  }
  const EPS_W = 1e-4;

  // ------------------------------------------------------------------ the score
  // pitch helpers: a pattern of 8ths starting at t0
  const pat = (t, t0, arr, step) => arr[clamp(Math.floor((t - t0) / (step || E8) + 1e-9), 0, arr.length - 1)];
  // 16th-step reveal: k steps from t0, each step snaps in over the first 45% of its 16th
  const steps = (t, t0, k) => {
    const x = (t - t0) / S16;
    const i = Math.floor(x + 1e-9);
    const f = x - i;
    return clamp((i + eout(f / 0.45)) / k, 0, 1);
  };
  // tick rotation: one tooth per beat, mechanical ease-out over the first 40% of the beat
  const tick = (t, t0) => {
    const x = Math.max(0, (t - t0) / BEAT);
    const i = Math.floor(x + 1e-9);
    return i + eout((x - i) / 0.4);
  };
  const saw = (ph) => ph - Math.floor(ph);

  // Lissajous knots in C minor (C = 60 Hz, here two octaves up): [X Hz, Y Hz, p, duration].
  // X:Y = p:q is both the knot and the interval: octave, fifth, fourth, minor third, minor sixth,
  // minor seventh, tone, tone. A knot depends only on the ratio, so the octave is free: high enough
  // to sing on a phone speaker.
  const KNOTS = [
    [240, 480, 1, BEAT], [240, 360, 2, BEAT], [360, 480, 3, BEAT], [240, 288, 5, BEAT],
    [240, 384, 5, E8], [240, 432, 5, E8], [240, 270, 8, E8], [432, 480, 9, E8],
  ];

  // flight of the paper plane in bar 9: under the name, up its right side, a loop-the-loop above
  // it, down the right side again (Catmull-Rom through these points)
  const FLIGHT = [
    [-1.3, -0.32], [-0.62, -0.43], [0.1, -0.39], [0.62, -0.27], [0.86, 0.02], [0.78, 0.36], [0.52, 0.51],
    [0.31, 0.39], [0.4, 0.24], [0.66, 0.28], [0.87, 0.13], [0.88, -0.14], [0.7, -0.33],
  ];
  const fl = [0, 0, 0];
  function flight(s) {
    const n = FLIGHT.length - 1;
    const x = clamp(s, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(x));
    const f = x - i;
    const P0 = FLIGHT[Math.max(0, i - 1)];
    const P1 = FLIGHT[i];
    const P2 = FLIGHT[i + 1];
    const P3 = FLIGHT[Math.min(n, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (-a + 3 * b - 3 * c + d) * f * f * f);
    const dcr = (a, b, c, d) => 0.5 * ((-a + c) + 2 * (2 * a - 5 * b + 4 * c - d) * f + 3 * (-a + 3 * b - 3 * c + d) * f * f);
    fl[0] = cr(P0[0], P1[0], P2[0], P3[0]);
    fl[1] = cr(P0[1], P1[1], P2[1], P3[1]);
    fl[2] = Math.atan2(dcr(P0[1], P1[1], P2[1], P3[1]), dcr(P0[0], P1[0], P2[0], P3[0]));
    return fl;
  }

  /** intensity knob keyframes [t, I]: the operator turns the beam up for long paths (every move >= 150 ms) */
  const KNOB = [
    [0, 0.12], [at(0, 1), 0.12], [at(0, 1) + 0.25, 3.0], [at(1, 2), 3.0], [at(1, 2) + 0.2, 1.2], [at(2, 0), 1.2],
    [at(3, 2), 1.4], [at(3, 3), 1.0], [at(4, 0), 1.6], [at(5, 0), 1.6], [at(5, 1), 1.7],
    [at(6, 0), 1.7], [at(7, 0), 2.0], [at(7, 1), 3.4], [at(8, 2), 3.4], [at(8, 3), 2.0], [at(9, 0), 2.2],
    [at(9, 2.5), 2.4], [at(10, 0), 4.8], [DUR, 4.8],
  ];
  function knob(t) {
    let i = 0;
    while (i < KNOB.length - 2 && KNOB[i + 1][0] <= t) i++;
    const [t0, v0] = KNOB[i];
    const [t1, v1] = KNOB[i + 1];
    return t1 > t0 ? lerp(v0, v1, clamp((t - t0) / (t1 - t0), 0, 1)) : v1;
  }

  // ------------------------------------------------------------------ percussion (added to the beam)
  // kick: [t, ring radius, decay]. On text the ring rides only the big letters / the plane (kg), so the
  // small lines of the card never shake; the sound of the kick is then gated by that part's share.
  const KICKS = [];
  const HATS = [];
  const SNARES = [];
  function buildDrums() {
    if (KICKS.length) return;
    KICKS.push([at(1, 0), 0.07, 0.05], [at(1, 2), 0.07, 0.05]);
    for (let b = 2; b <= 6; b++) for (let q = 0; q < 4; q++) if (!(b === 6 && q === 3)) KICKS.push([at(b, q), b <= 3 ? 0.24 : 0.16, b <= 3 ? 0.085 : 0.07]);
    for (let b = 7; b <= 11; b++) for (let q = 0; q < 4; q++) KICKS.push([at(b, q), 0.06, 0.035]);
    for (let b = 1; b <= 11; b++) {
      for (let q = 0; q < 4; q++) {
        if (b === 6 && q === 3) continue;
        if (b === 1 && q < 2) continue;
        HATS.push([at(b, q + 0.5), b >= 7 || b === 1 ? 0.004 : 0.012, q]);
      }
    }
    for (const [b, q] of [[4, 1], [4, 3], [5, 1]]) SNARES.push([at(b, q), 0.016, q]);
  }

  // ------------------------------------------------------------------ the beam at sample i
  let OSC = null;
  function compute() {
    const p = cast();
    buildDrums();
    const N = Math.round(DUR * SR);
    const X = new Float32Array(N);
    const Y = new Float32Array(N);
    const I = new Float32Array(N);
    const o = [0, 0];
    const o2 = [0, 0];
    let ph = 0; // beam phase of the current program (cycles)
    const C = p.C;
    const wBrand = p.brand.total;
    const wSl = p.cslogan.total;
    const wSite = p.site.total;
    const wTg = p.tg.total;
    const wPl = p.plane.total * C.planeS;
    const wS1 = p.sl1.total;
    const wS2 = p.sl2.total;
    let kickIdx = 0;
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      let f = 60;
      let x = 0;
      let y = 0;
      let kg = 1; // how much of the kick ring this stretch of the path carries
      let ring = 0; // riser ring on the chart line
      if (t < at(0, 1)) {
        // ---- a dot hums: a tiny ring at 120 Hz (mains hum), breathing
        f = 120;
        const r = 0.012 + 0.008 * sstep(t / BEAT);
        x = r * Math.cos(TAU * ph);
        y = r * Math.sin(TAU * ph);
      } else if (t < at(0, 2.5)) {
        // ---- the dot writes the hook, two to three letters per 16th
        f = 60;
        V.posReveal(p.hook, ph, steps(t, at(0, 1), 6), o);
        x = o[0];
        y = o[1];
      } else if (t < at(1, 2)) {
        f = pat(t, at(0, 2.5), [60, 30, 30, 60, 30, 30, 90]);
        V.pos(p.hook, ph, o);
        x = o[0];
        y = o[1];
      } else if (t < at(1, 2.5)) {
        // ---- the words fold flat: only X (LEFT) is left — a horizontal line
        f = 60;
        const m = einout((t - at(1, 2)) / E8);
        V.pos(p.hook, ph, o);
        x = lerp(o[0], -0.8 + 1.6 * saw(ph), m);
        y = o[1] * (1 - m) * (1 - m);
      } else if (t < at(1, 3)) {
        // ---- the line stands up: only Y (RIGHT) — a vertical line
        f = 60;
        const m = einout((t - at(1, 2.5)) / E8);
        x = (-0.8 + 1.6 * saw(ph)) * (1 - m);
        y = (-0.5 + 1.0 * saw(ph)) * m;
      } else if (t < at(1, 3.75)) {
        // ---- both: time base on X (saw), a sine on Y — a sine wave on the screen
        f = 60;
        const fr = saw(ph);
        const g = eout((t - at(1, 3)) / (0.3 * BEAT));
        const a = 0.42 * eout((t - at(1, 3)) / (0.6 * BEAT));
        x = (-0.8 + 1.6 * fr) * g;
        y = a * Math.sin(TAU * 2 * fr) + (-0.5 + fr) * (1 - g);
      } else if (t < at(2, 0)) {
        // ---- a 16th of silence before the drop: the beam parks
        x = 0;
        y = 0;
      } else if (t < at(3, 2)) {
        // ---- Lissajous knots tighten: the knot is the interval
        let t0 = at(2, 0);
        let k = 0;
        while (k < KNOTS.length - 1 && t >= t0 + KNOTS[k][3]) {
          t0 += KNOTS[k][3];
          k++;
        }
        const [fx, fy, pp] = KNOTS[k];
        const tau = t - t0;
        const acc = 0.9 + 0.1 * Math.exp(-tau / 0.06);
        x = 0.6 * acc * Math.sin(TAU * fx * tau);
        y = 0.5 * acc * Math.sin(TAU * (fy + 0.3) * tau + Math.PI / (2 * pp));
      } else if (t < at(3, 3)) {
        // ---- the knot unwinds into a circle: unison on both channels, gliding 240 -> 60 Hz
        f = 240 * Math.pow(0.25, sstep((t - at(3, 2)) / BEAT));
        const r = lerp(0.5, GA.R, eout((t - at(3, 2)) / BEAT));
        x = r * Math.cos(TAU * ph);
        y = r * Math.sin(TAU * ph);
      } else if (t < at(4, 0)) {
        // ---- the circle grows teeth and starts to turn
        f = 60;
        const m = eout((t - at(3, 3)) / (0.8 * BEAT));
        const rot = ROT_A0 + PA * 0.5 * sstep((t - at(3, 3)) / BEAT);
        V.pos(p.circle, ph, o);
        const cx = o[0] * GA.R;
        const cy = o[1] * GA.R;
        V.pos(p.gearA, ph, o2);
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        x = lerp(cx, o2[0] * c - o2[1] * s, m);
        y = lerp(cy, o2[0] * s + o2[1] * c, m);
      } else if (t < at(5, 0)) {
        // ---- a gear train: the big gear ticks a tooth per beat, the small one meshes
        f = pat(t, at(4, 0), [60, 60, 120, 60, 90, 60, 120, 108]);
        const g = eout((t - at(4, 0)) / E8);
        const aA = ROT_A0 + PA * (0.5 + tick(t, at(4, 0)));
        const aB = ROT_B0 - PB * (0.5 + tick(t, at(4, 0)));
        const ax = lerp(0, CA[0], g);
        const ay = lerp(0, CA[1], g);
        const bs = Math.max(0.02, g);
        setPart(0, p.gearA, p.gearA.total, 1, 1, 1, aA, ax, ay);
        setPart(1, p.gearB, p.gearB.total * bs, 1, bs, bs, aB, lerp(ax + (GA.R + 0.02) * Math.cos(BETA), CB[0], g), lerp(ay + (GA.R + 0.02) * Math.sin(BETA), CB[1], g));
        comp(PARTS, 2, ph, o);
        x = o[0];
        y = o[1];
      } else if (t < at(5, 2.5)) {
        // ---- the beam unwrites the gears while it writes two hands; the hands reach for each other
        f = pat(t, at(5, 0), [48, 48, 96, 48, 54]);
        const m = sstep((t - at(5, 0)) / BEAT);
        const app = einout((t - at(5, 0.5)) / (2 * BEAT));
        const gap = lerp(0.62, 0.0, app);
        const lx = -0.49 * HAND_S - gap / 2;
        const rx = 0.49 * HAND_S + gap / 2;
        let n = 0;
        if (m < 1) {
          const aA = ROT_A0 + PA * (0.5 + 4);
          const aB = ROT_B0 - PB * (0.5 + 4);
          setPart(n++, p.gearA, p.gearA.total * (1 - m) + EPS_W, -m, 1, 1, aA, CA[0], CA[1]);
          setPart(n++, p.gearB, p.gearB.total * (1 - m) + EPS_W, -m, 1, 1, aB, CB[0], CB[1]);
        }
        setPart(n++, p.handL, p.handL.total * m + EPS_W, Math.max(1e-3, m), 1, 1, 0, lx, 0.0);
        setPart(n++, p.handR, p.handR.total * m + EPS_W, Math.max(1e-3, m), 1, 1, 0, rx, 0.0);
        comp(PARTS, n, ph, o);
        x = o[0];
        y = o[1];
      } else if (t < at(6, 0)) {
        // ---- the clasp (on the off-beat): a handshake, shaken
        f = pat(t, at(5, 2.5), [108, 54, 54]);
        const tau = t - at(5, 2.5);
        const shake = 0.035 * Math.sin((TAU * tau) / E8) * Math.exp(-tau / 0.5);
        V.pos(p.clasp, ph, o);
        x = o[0];
        y = o[1] + shake;
      } else if (t < at(6, 3.75)) {
        // ---- a rising chart on a rising scale; the trend line sings higher and higher as it grows
        f = pat(t, at(6, 0), [60, 67.5, 72, 80, 90, 96, 108, 120]);
        const r = clamp((t - at(6, 0)) / (3.5 * BEAT), 0, 1);
        const base = CH.axes[0][1][1];
        setPart(0, p.axes, p.axes.total, 1, 1, 1, 0, 0, 0);
        let n = 1;
        for (let k = 0; k < CH.bars.length; k++) {
          const hk = CH.bars[k].h * eout((t - at(6, 0) - k * E8 * 1.4) / E8);
          if (hk <= 0.002) continue;
          setPart(n++, p.bars[k], 2 * hk + CH.bars[k].w, 1, 1, hk, 0, 0, base);
        }
        const lineK = n;
        setPart(n++, p.line, p.line.total * Math.max(0.03, r), Math.max(0.01, r), 1, 1, 0, 0, 0);
        if (r > 0.92) setPart(n++, p.arrow, p.arrow.total, 1, 1, 1, 0, 0, 0);
        comp(PARTS, n, ph, o);
        x = o[0];
        y = o[1];
        if (lastPart >= lineK) ring = r;
      } else if (t < at(7, 0)) {
        // ---- a 16th of silence: the beam parks
        x = 0;
        y = 0;
      } else if (t < at(8, 2)) {
        // ---- DROP: «БИЗНЕС НА АВТОПИЛОТЕ» written in four 16ths, then the bass riff (C / G)
        f = t < at(7, 1) ? 60 : pat(t, at(7, 1), [30, 30, 60, 30, 90, 30, 60, 90, 30, 30, 60, 120]);
        const r = steps(t, at(7, 0), 4);
        const r1 = clamp((r * (wS1 + wS2)) / wS1, 0, 1);
        const r2 = clamp((r * (wS1 + wS2) - wS1) / wS2, 0, 1);
        setPart(0, p.sl1, wS1 * r1 + EPS_W, Math.max(1e-3, r1), 1, 1, 0, 0, 0);
        setPart(1, p.sl2, wS2 * r2 + EPS_W, Math.max(1e-3, r2), 1, 1, 0, 0, 0);
        comp(PARTS, 2, ph, o);
        x = o[0];
        y = o[1];
        kg = lastPart === 0 ? 1 : 0;
      } else if (t < at(8, 3)) {
        // ---- the beam unwrites the slogan while it writes the name
        f = 60;
        const m = sstep((t - at(8, 2)) / BEAT);
        setPart(0, p.sl1, wS1 * (1 - m) + EPS_W, -m, 1, 1, 0, 0, 0);
        setPart(1, p.sl2, wS2 * (1 - m) + EPS_W, -m, 1, 1, 0, 0, 0);
        setPart(2, p.brandBig, p.brandBig.total * m + EPS_W, Math.max(1e-3, m), 1, 1, 0, 0, 0);
        comp(PARTS, 3, ph, o);
        x = o[0];
        y = o[1];
        kg = lastPart === 0 ? 1 - m : lastPart === 2 ? m : 0;
      } else if (t < at(9, 0)) {
        // ---- AiXenix
        f = pat(t, at(8, 3), [60, 120]);
        V.pos(p.brandBig, ph, o);
        x = o[0];
        y = o[1];
      } else if (t < at(10, 0)) {
        // ---- a paper plane flies in, loops above the name and lands by the address; the card writes itself
        f = pat(t, at(9, 0), [60, 60, 120, 60, 90, 60, 60, 30]);
        const mv = einout((t - at(9, 2)) / (1.5 * BEAT)); // the name moves up to its card place
        const sB = lerp(0.31, 0.25, mv) / 0.25; // the card program has cap 0.25 at baseline 0.19
        const tyB = lerp(-0.13, 0.19, mv) - 0.19 * sB;
        const fs = clamp((t - at(9, 0)) / (2.9 * BEAT), 0, 1);
        const fp = flight(einout(fs));
        const land = sstep((t - at(9, 2.8)) / (0.8 * BEAT));
        let da = C.planeA - fp[2];
        da -= TAU * Math.round(da / TAU);
        const plx = lerp(fp[0], C.planeAt[0], land);
        const ply = lerp(fp[1], C.planeAt[1], land);
        const pla = fp[2] + da * land;
        const pls = lerp(0.11, C.planeS, land);
        const rS = steps(t, at(9, 2.5), 5);
        setPart(0, p.brand, wBrand * sB, 1, sB, sB, 0, 0, tyB);
        setPart(1, p.plane, p.plane.total * pls, 1, pls, pls, pla, plx, ply);
        let n = 2;
        if (t >= at(9, 2.5)) {
          setPart(n++, p.cslogan, wSl * rS + EPS_W, Math.max(1e-3, rS), 1, 1, 0, 0, 0);
          setPart(n++, p.site, wSite * rS + EPS_W, Math.max(1e-3, rS), 1, 1, 0, 0, 0);
          setPart(n++, p.tg, wTg * rS + EPS_W, Math.max(1e-3, rS), 1, 1, 0, 0, 0);
        }
        comp(PARTS, n, ph, o);
        x = o[0];
        y = o[1];
        kg = lastPart <= 1 ? 1 : 0;
      } else {
        // ---- the card. Bars 10 and 11 are identical: C / G riff at 30-60-90 Hz, whole traces per frame
        f = pat(t, at(t < at(11, 0) ? 10 : 11, 0), [30, 30, 60, 30, 90, 30, 60, 60]);
        setPart(0, p.brand, wBrand, 1, 1, 1, 0, 0, 0);
        setPart(1, p.plane, wPl, 1, C.planeS, C.planeS, C.planeA, C.planeAt[0], C.planeAt[1]);
        setPart(2, p.cslogan, wSl, 1, 1, 1, 0, 0, 0);
        setPart(3, p.site, wSite, 1, 1, 1, 0, 0, 0);
        setPart(4, p.tg, wTg, 1, 1, 1, 0, 0, 0);
        comp(PARTS, 5, ph, o);
        x = o[0];
        y = o[1];
        kg = lastPart <= 1 ? 1 : 0;
      }

      // ---- percussion: rings and noise added to the beam
      while (kickIdx < KICKS.length - 1 && KICKS[kickIdx + 1][0] <= t) kickIdx++;
      if (kg > 0) {
        for (let q = Math.max(0, kickIdx - 1); q <= kickIdx; q++) {
          const [tk, A0, ka] = KICKS[q];
          const tau = t - tk;
          if (tau < 0 || tau > 0.4) continue;
          const fs = 420;
          const fe = 44;
          const kf = 0.022;
          const phs = TAU * (fe * tau + (fs - fe) * kf * (1 - Math.exp(-tau / kf)));
          const A = kg * A0 * (1 - Math.exp(-tau / 0.00012)) * Math.exp(-tau / ka) * (1 - sstep((tau - 2.2 * ka) / (1.2 * ka)));
          x += A * Math.cos(phs);
          y += A * Math.sin(phs);
          if (tau < 0.003) {
            // the beater click: 3 ms of noise (a spray of faint points around the shape)
            const j = Math.round(tau * SR);
            const e = kg * A0 * (A0 > 0.2 ? 0.9 : 0.35) * (1 - tau / 0.003);
            x += e * (h3(j, 7, q & 3) * 2 - 1);
            y += e * (h3(j, 8, q & 3) * 2 - 1);
          }
        }
      }
      for (const [th, Ah, id] of HATS) {
        const tau = t - th;
        if (tau < 0 || tau > 0.09) continue;
        const j = Math.round(tau * SR);
        const e = Ah * Math.exp(-tau / 0.014);
        x += e * (h3(j, 1, id) * 2 - 1);
        y += e * (h3(j, 2, id) * 2 - 1);
      }
      for (const [ts, As, id] of SNARES) {
        const tau = t - ts;
        if (tau < 0 || tau > 0.25) continue;
        const j = Math.round(tau * SR);
        const e = As * Math.exp(-tau / 0.05);
        x += e * (h3(j, 3, id) * 2 - 1) + 0.035 * Math.exp(-tau / 0.04) * Math.sin(TAU * 185 * tau);
        y += e * (h3(j, 4, id) * 2 - 1) + 0.035 * Math.exp(-tau / 0.04) * Math.cos(TAU * 185 * tau);
      }
      // the handshake rings: a bright high note, a small fast circle riding the outline
      {
        const tau = t - at(5, 2.5);
        if (tau >= 0 && tau < 0.9) {
          const A = 0.018 * (1 - Math.exp(-tau / 0.0004)) * Math.exp(-tau / 0.16);
          x += A * Math.cos(TAU * 960 * tau);
          y += A * Math.sin(TAU * 960 * tau);
        }
      }
      // the riser: the growing trend line carries a small ring whose pitch climbs 500 -> 1500 Hz
      if (ring > 0) {
        const tau = t - at(6, 0);
        const A = 0.02 * Math.pow(ring, 1.4);
        // phase of a gliding tone: integral of fr over time (exponential glide)
        const T3 = 3.5 * BEAT;
        const phs = TAU * ((500 * T3) / Math.log(3)) * (Math.pow(3, clamp(tau / T3, 0, 1)) - 1);
        x += A * Math.cos(phs);
        y += A * Math.sin(phs);
      }
      if (t >= at(6, 0) && t < at(6, 3.75)) {
        const e = 0.006 * Math.pow((t - at(6, 0)) / (3.75 * BEAT), 2);
        x += e * (h3(i, 5, 9) * 2 - 1);
        y += e * (h3(i, 6, 9) * 2 - 1);
      }

      X[i] = x;
      Y[i] = y;
      I[i] = knob(t);
      ph += f / SR;
      if (ph > 1e6) ph -= 1e6;
    }
    // the last bar loops: copy bar 10 onto bar 11 so the seam is sample-exact (it already is by
    // construction; this guards against float drift in the phase accumulator)
    const b10 = Math.round(at(10, 0) * SR);
    const b11 = Math.round(at(11, 0) * SR);
    for (let i = b11; i < N; i++) {
      X[i] = X[i - (b11 - b10)];
      Y[i] = Y[i - (b11 - b10)];
      I[i] = I[i - (b11 - b10)];
    }
    OSC = { sr: SR, n: N, X, Y, I, tauFast: 0.004, tauSlow: 0.05, tail: 0.15, DUR, BEAT, at };
    return OSC;
  }

  // ------------------------------------------------------------------ the look per frame
  // One tube, one phosphor: P31-like green from first frame to last (white-green core, green
  // afterglow and halation). The brand colours live on the hardware: the cyan and magenta patch
  // cables and the channel LEDs.
  const GREEN = { cf: [0.55, 1.0, 0.62], cs: [0.16, 0.8, 0.3], hf: [0.3, 1.0, 0.45], hs: [0.08, 0.7, 0.22], glass: [0.008, 0.018, 0.012], grat: [0.10, 0.17, 0.13] };
  function look(T) {
    const I = knob(T);
    const warm = sstep(T / 0.45);
    return {
      cf: GREEN.cf,
      cs: GREEN.cs.map((v) => v * 0.7),
      hf: GREEN.hf,
      hs: GREEN.hs,
      glass: GREEN.glass,
      grat: GREEN.grat,
      exposure: 2.6,
      bloom: 1.0,
      sigma: lerp(3.2, 1.25, warm),
      knobI: (135 + clamp(Math.log2(I / 0.1) / Math.log2(60), 0, 1) * 270) * (Math.PI / 180),
      knobF: (135 + (0.5 + 0.5 * warm) * 160) * (Math.PI / 180),
    };
  }

  FILM.osc = {
    get: () => OSC || compute(),
    look,
    SR,
    BEAT,
    DUR,
    at,
  };
})();
