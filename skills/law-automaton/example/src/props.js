/*
 * props.js : THE PROGRAMME of the automaton «Писец 1774» (pure math, no THREE, no drawing).
 *
 * Law of the film: nothing appears that the machine does not physically make. The chain is literal:
 *
 *   letters (stroke data below)  ->  one timed pen path per cam revolution (x, y on the page, z = lift,
 *   z < 0 = nib pressure)  ->  three CAM TABLES per revolution: radius_X(phi), radius_Y(phi),
 *   radius_Z(phi) (the cams' physical shapes; cast.js extrudes them)  ->  at any time T the shaft
 *   angle picks phi, the followers READ the radii, and decode() turns the readings back into the
 *   quill-tip position and nib pressure. The arm IK and every grain of ink are computed from those
 *   decoded readings only — never from the letters directly.
 *
 * One revolution of the cam shaft = one programme card (one or two written lines), like Maillardet's
 * automaton. Each revolution starts and ends with the quill resting in the inkwell, so the cam stack
 * can drop to the next triplet while the followers sit on identical radii (the dwell).
 *
 * Time: 150 bpm, 8th = 0.2 s (one escapement tick), bar = 1.6 s, one revolution = 3 bars = 4.8 s.
 *   0.0 - 1.6   winding (3 key clicks on beats 2-4), release on the downbeat of bar 2
 *   1.6 - 20.8  four revolutions
 *   20.8 - 24.0 the machine stands; the sheet is the final card; last bar is the loop
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const FILM = (root.FILM = root.FILM || {});

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // ------------------------------------------------------------------ time
  const BPM = 150, BEAT = 60 / BPM, E8 = BEAT / 2, BAR = BEAT * 4;
  const T_RUN = BAR; // 1.6 escapement released
  const REV = 3 * BAR; // 4.8 s per cam revolution
  const NREV = 4;
  const T_STOP = T_RUN + NREV * REV; // 20.8
  const DURATION = 15 * BAR; // 24.0
  const N = 4096; // cam table samples per revolution

  // revolution phase plan (fractions of a revolution)
  const PH = {
    lift0: 0.035, // quill leaves the ink
    lift1: 0.075, // above the rim
    tap0: 0.075,
    tap1: 0.112, // two wipes on the rim
    go1: 0.15, // arrives over the first letter
    w0: 0.15, // writing window
    w1: 0.925,
    back1: 0.962, // above the well again
    dip1: 0.982, // in the ink (dwell until 0.035 of the next revolution)
  };

  // ------------------------------------------------------------------ page (metres)
  // origin = page centre; x to the writer's right, y up the page (away from the writer); z = height
  // of the nib above the paper (negative = pressing).
  const PAGE = { w: 0.172, h: 0.142 };
  const XH = 0.0086; // x-height of the hand
  const SLANT = 0.21;
  const WELL = { x: 0.132, y: 0.012, zInk: 0.021, zRim: 0.036, zTravel: 0.046, r: 0.0105 };
  const PRESS = 0.0009; // nib travel at full pressure

  // ------------------------------------------------------------------ the hand: glyph strokes
  // Units of x-height, baseline 0, unslanted. A point [x, y, 1] is a corner (the spline breaks there).
  // Written in the order a scribe writes them.
  const G = {};
  const def = (ch, w, strokes) => (G[ch] = { w, s: strokes });
  def('а', 0.86, [[[0.57, 0.8], [0.42, 0.97], [0.2, 0.9], [0.05, 0.58], [0.07, 0.18], [0.24, 0.0], [0.44, 0.1], [0.56, 0.42], [0.61, 1.0, 1], [0.58, 0.5], [0.57, 0.12], [0.67, 0.0], [0.82, 0.1]]]);
  def('в', 0.74, [[[0.12, 1.0], [0.09, 0.5], [0.06, 0.0, 1], [0.35, 0.02], [0.57, 0.17], [0.55, 0.42], [0.3, 0.53], [0.12, 0.53, 1], [0.38, 0.6], [0.5, 0.8], [0.4, 0.98], [0.12, 1.0]]]);
  def('т', 0.82, [[[0.38, 1.0], [0.35, 0.5], [0.33, 0.12], [0.44, 0.0], [0.6, 0.08]], [[-0.02, 0.94], [0.2, 1.0], [0.46, 1.0], [0.78, 1.03]]]);
  def('о', 0.72, [[[0.52, 0.93], [0.34, 1.0], [0.13, 0.86], [0.03, 0.5], [0.09, 0.12], [0.29, 0.0], [0.5, 0.1], [0.6, 0.45], [0.56, 0.82], [0.4, 0.98], [0.27, 0.94]]]);
  def('м', 0.98, [[[0.0, 0.02], [0.08, 0.1], [0.12, 0.5], [0.13, 1.0, 1], [0.27, 0.6], [0.41, 0.22, 1], [0.57, 0.62], [0.73, 1.0, 1], [0.71, 0.5], [0.69, 0.12], [0.79, 0.0], [0.94, 0.09]]]);
  def('и', 0.84, [[[0.0, 0.84], [0.08, 1.0, 1], [0.06, 0.5], [0.06, 0.13], [0.17, 0.0], [0.33, 0.08], [0.47, 0.42], [0.6, 1.0, 1], [0.58, 0.5], [0.57, 0.12], [0.67, 0.0], [0.81, 0.09]]]);
  def('з', 0.66, [[[0.04, 0.86], [0.22, 1.0], [0.46, 0.94], [0.47, 0.7], [0.24, 0.53, 1], [0.48, 0.43], [0.56, 0.17], [0.38, 0.0], [0.13, 0.0], [0.0, 0.12]]]);
  def('ц', 0.84, [[[0.0, 0.84], [0.08, 1.0, 1], [0.06, 0.5], [0.06, 0.13], [0.17, 0.0], [0.33, 0.08], [0.47, 0.42], [0.6, 1.0, 1], [0.58, 0.5], [0.58, 0.04], [0.72, 0.0, 1], [0.73, -0.16], [0.66, -0.34]]]);
  def('я', 0.84, [[[0.6, 0.54], [0.33, 0.5], [0.13, 0.6], [0.11, 0.86], [0.33, 1.0], [0.62, 1.0, 1], [0.6, 0.5], [0.58, 0.12], [0.68, 0.0], [0.82, 0.09]], [[0.34, 0.5], [0.18, 0.22], [0.02, 0.0]]]);
  def('с', 0.66, [[[0.56, 0.84], [0.42, 1.0], [0.17, 0.9], [0.04, 0.52], [0.09, 0.13], [0.3, 0.0], [0.5, 0.05], [0.62, 0.18]]]);
  def('н', 0.82, [[[0.1, 1.0], [0.08, 0.5], [0.06, 0.0]], [[0.62, 1.0], [0.6, 0.5], [0.59, 0.12], [0.68, 0.0], [0.82, 0.09]], [[0.08, 0.5], [0.34, 0.53], [0.6, 0.52]]]);
  def('е', 0.7, [[[0.08, 0.46], [0.42, 0.56], [0.56, 0.78], [0.42, 1.0], [0.16, 0.9], [0.04, 0.5], [0.1, 0.12], [0.3, 0.0], [0.52, 0.07], [0.64, 0.2]]]);
  def('п', 0.82, [[[0.0, 0.84], [0.09, 1.0, 1], [0.07, 0.5], [0.05, 0.0, 1], [0.1, 0.6], [0.3, 0.98], [0.52, 0.92], [0.58, 0.5], [0.57, 0.12], [0.67, 0.0], [0.81, 0.09]]]);
  def('л', 0.8, [[[0.0, 0.04], [0.11, 0.08], [0.2, 0.42], [0.28, 0.86], [0.39, 1.0], [0.58, 1.0, 1], [0.57, 0.5], [0.56, 0.12], [0.66, 0.0], [0.8, 0.09]]]);
  def('р', 0.72, [[[0.0, 0.84], [0.11, 1.0, 1], [0.08, 0.2], [0.04, -0.62]], [[0.1, 0.72], [0.31, 0.99], [0.53, 0.88], [0.59, 0.5], [0.46, 0.1], [0.22, 0.01], [0.08, 0.12]]]);
  def('ь', 0.66, [[[0.12, 1.0], [0.09, 0.5], [0.06, 0.0, 1], [0.35, 0.02], [0.56, 0.18], [0.53, 0.42], [0.3, 0.52], [0.09, 0.47]]]);
  def('i', 0.4, [[[0.0, 0.8], [0.11, 1.0, 1], [0.09, 0.5], [0.07, 0.12], [0.17, 0.0], [0.3, 0.09]], [[0.23, 1.5], [0.19, 1.42], [0.15, 1.33]]]);
  def('x', 0.72, [[[0.0, 0.92], [0.12, 1.0], [0.24, 0.86], [0.46, 0.14], [0.58, 0.0], [0.7, 0.08]], [[0.64, 1.0], [0.3, 0.5], [0.02, 0.0]]]);
  G.n = { w: 0.82, s: G['п'].s };
  def('m', 1.08, [[[0.0, 0.84], [0.09, 1.0, 1], [0.07, 0.5], [0.05, 0.0, 1], [0.08, 0.6], [0.22, 0.98], [0.38, 0.9], [0.42, 0.5], [0.41, 0.0, 1], [0.44, 0.6], [0.58, 0.98], [0.75, 0.9], [0.8, 0.5], [0.79, 0.12], [0.89, 0.0], [1.03, 0.09]]]);
  def('t', 0.54, [[[0.22, 1.48], [0.18, 0.6], [0.16, 0.12], [0.27, 0.0], [0.44, 0.08]], [[0.0, 0.98], [0.24, 1.0], [0.5, 1.0]]]);
  G.a = G['а']; G.e = G['е']; G.o = G['о']; G.c = G['с'];
  def('А', 1.02, [[[0.0, 0.0], [0.2, 0.42], [0.42, 1.02], [0.6, 1.56, 1], [0.72, 1.0], [0.8, 0.42], [0.86, 0.06], [0.98, 0.0]], [[0.24, 0.6], [0.52, 0.64], [0.82, 0.66]]]);
  G.A = G['А'];
  def('Б', 0.92, [[[0.12, 1.5], [0.4, 1.57], [0.66, 1.56], [0.9, 1.62]], [[0.2, 1.56], [0.15, 0.8], [0.1, 0.0, 1], [0.46, 0.02], [0.72, 0.2], [0.72, 0.52], [0.46, 0.74], [0.15, 0.72]]]);
  def('И', 1.02, [[[0.0, 1.38], [0.12, 1.56, 1], [0.09, 0.8], [0.06, 0.0, 1], [0.38, 0.62], [0.82, 1.56, 1], [0.8, 0.8], [0.78, 0.12], [0.88, 0.0], [1.0, 0.09]]]);
  def('X', 1.02, [[[0.0, 1.46], [0.16, 1.56], [0.32, 1.38], [0.68, 0.18], [0.84, 0.0], [0.98, 0.1]], [[0.94, 1.56], [0.5, 0.8], [0.02, 0.0]]]);
  def('1', 0.56, [[[0.02, 1.08], [0.24, 1.24], [0.4, 1.42, 1], [0.32, 0.7], [0.26, 0.0]]]);
  def('7', 0.8, [[[0.0, 1.3], [0.16, 1.42], [0.42, 1.38], [0.74, 1.42, 1], [0.5, 0.86], [0.32, 0.4], [0.24, 0.0]]]);
  def('4', 0.86, [[[0.52, 1.42], [0.26, 0.86], [0.02, 0.44, 1], [0.38, 0.44], [0.8, 0.47]], [[0.62, 0.98], [0.56, 0.46], [0.52, 0.0]]]);
  def('.', 0.32, [[[0.06, 0.08], [0.12, 0.11], [0.15, 0.04], [0.08, 0.0], [0.05, 0.06]]]);
  def('—', 1.0, [[[0.04, 0.5], [0.5, 0.52], [0.96, 0.53]]]);
  def('/', 0.68, [[[0.68, 1.46], [0.34, 0.66], [0.0, -0.12]]]);
  // the paper plane: an outline dart, nose up-right, a fold to the nose, and a flight trail behind it
  def('✈', 2.75, [
    [[-0.1, -0.05], [0.12, 0.12], [0.26, 0.24]],
    [[0.4, 0.34], [0.58, 0.47]],
    [[0.66, 0.92, 1], [2.55, 1.62, 1], [1.12, -0.12, 1], [1.28, 0.62, 1], [0.66, 0.92, 1]],
    [[1.28, 0.62, 1], [2.55, 1.62, 1]],
    [[1.28, 0.62, 1], [1.5, 0.2, 1], [1.7, 0.6]],
  ]);
  G[' '] = { w: 0.5, s: [] };

  // ------------------------------------------------------------------ the programme cards
  // One card per cam revolution. Rows: text, left x and baseline y on the page, size (x-heights).
  const CARDS = [
    { rows: [{ text: 'Автоматизация с 1774', x: -0.0735, y: 0.0452, size: 1 }] },
    { rows: [{ text: 'Бизнес на автопилоте', x: -0.0735, y: 0.0192, size: 1 }] },
    { rows: [{ text: 'AiXenix — теперь с ИИ', x: -0.0735, y: -0.0068, size: 1 }] },
    { rows: [
      { text: 'aixenix.com', x: -0.0735, y: -0.0328, size: 1 },
      { text: '✈ t.me/aixenix', x: -0.0735, y: -0.0588, size: 1 },
    ] },
  ];
  const LETTERSPACE = 0.07;

  // centripetal Catmull-Rom through pts, n samples per span
  function catmull(pts, per) {
    const out = [];
    if (pts.length === 1) return [pts[0].slice(0, 2)];
    const P = [pts[0], ...pts, pts[pts.length - 1]];
    const ext = (a, b) => [2 * a[0] - b[0], 2 * a[1] - b[1]];
    P[0] = ext(pts[0], pts[1]);
    P[P.length - 1] = ext(pts[pts.length - 1], pts[pts.length - 2]);
    for (let i = 1; i < P.length - 2; i++) {
      const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
      const d = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]) + 1e-9, 0.5);
      const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
      const steps = Math.max(2, Math.ceil(per * Math.hypot(p2[0] - p1[0], p2[1] - p1[1])));
      for (let k = i === 1 ? 0 : 1; k <= steps; k++) {
        const t = t1 + ((t2 - t1) * k) / steps;
        const r = [];
        for (let c = 0; c < 2; c++) {
          const A1 = ((t1 - t) / (t1 - t0)) * p0[c] + ((t - t0) / (t1 - t0)) * p1[c];
          const A2 = ((t2 - t) / (t2 - t1)) * p1[c] + ((t - t1) / (t2 - t1)) * p2[c];
          const A3 = ((t3 - t) / (t3 - t2)) * p2[c] + ((t - t2) / (t3 - t2)) * p3[c];
          const B1 = ((t2 - t) / (t2 - t0)) * A1 + ((t - t0) / (t2 - t0)) * A2;
          const B2 = ((t3 - t) / (t3 - t1)) * A2 + ((t - t1) / (t3 - t1)) * A3;
          r.push(((t2 - t) / (t2 - t1)) * B1 + ((t - t1) / (t2 - t1)) * B2);
        }
        out.push(r);
      }
    }
    return out;
  }

  // a stroke with corners -> dense polyline (glyph units)
  function strokePoly(stroke) {
    const out = [];
    let seg = [];
    for (let i = 0; i < stroke.length; i++) {
      seg.push(stroke[i]);
      const corner = stroke[i][2] === 1 && i > 0 && i < stroke.length - 1;
      if (corner || i === stroke.length - 1) {
        const pts = catmull(seg, 60);
        if (out.length) pts.shift();
        out.push(...pts);
        seg = [stroke[i]];
      }
    }
    return out;
  }

  // layout: text -> strokes in page metres, tagged with glyph and word index
  function layoutRow(row) {
    const s = XH * row.size;
    let pen = 0;
    const strokes = [];
    let word = 0, gi = 0;
    for (const ch of Array.from(row.text)) {
      const g = G[ch];
      if (!g) throw new Error('programme: no glyph for ' + JSON.stringify(ch));
      if (ch === ' ') {
        word++;
        pen += g.w + LETTERSPACE;
        continue;
      }
      for (const st of g.s) {
        const poly = strokePoly(st).map(([x, y]) => [row.x + (pen + x + SLANT * y) * s, row.y + y * s]);
        strokes.push({ pts: poly, glyph: gi, word, ch });
      }
      pen += g.w + LETTERSPACE;
      gi++;
    }
    return { strokes, width: pen * s };
  }

  // ------------------------------------------------------------------ timed pen path
  // keyframes: [cost, x, y, z]; pen-down samples carry z <= 0 (pressure), lifts z > 0.
  const DOWN = [-SLANT, -1].map((v, i, a) => v / Math.hypot(a[0], a[1]));
  function strokeKeys(pts, keys, cost0) {
    // arc length, curvature-driven speed, pressure from the downstroke direction
    const n = pts.length;
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = s[n - 1] || 1e-6;
    let cost = cost0;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const dl = Math.hypot(dx, dy) || 1e-9;
      let kappa = 0;
      if (i > 0 && i < n - 1) {
        const a1 = Math.atan2(pts[i][1] - a[1], pts[i][0] - a[0]);
        const a2 = Math.atan2(b[1] - pts[i][1], b[0] - pts[i][0]);
        let da = Math.abs(a2 - a1);
        if (da > Math.PI) da = TAU - da;
        kappa = da / (dl * 0.5 + 1e-9);
      }
      const ends = Math.min(s[i], L - s[i]);
      const v = (1 / (1 + kappa / 420)) * (0.4 + 0.6 * sstep(0, 0.0016, ends));
      if (i > 0) cost += (s[i] - s[i - 1]) / Math.max(0.12, v);
      const dirDown = (dx * DOWN[0] + dy * DOWN[1]) / dl; // 1 = straight down the slant
      let p = Math.pow(clamp(dirDown, 0, 1), 1.6);
      p = 0.1 + 0.9 * p;
      p *= sstep(0, 0.0011, s[i]) * 0.75 + 0.25; // pressure builds after landing
      p *= sstep(0, 0.0018, L - s[i]) * 0.85 + 0.15; // and releases into the hairline exit
      keys.push([cost, pts[i][0], pts[i][1], -PRESS * p]);
    }
    return cost;
  }

  // lifted travel between two page points, hump height h; returns the new cost
  function liftKeys(a, b, h, keys, cost0, minCost) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dur = Math.max(minCost, d * 1.6 + h * 2.5);
    const n = 14;
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const e = u * u * (3 - 2 * u);
      const z = h * Math.sin(Math.PI * Math.min(1, u * 1.08)) ;
      keys.push([cost0 + dur * u, lerp(a[0], b[0], e), lerp(a[1], b[1], e), Math.max(0.0002, z) * (u < 1 ? 1 : 0)]);
    }
    return cost0 + dur;
  }

  // ------------------------------------------------------------------ build one revolution
  function buildRev(card, ri) {
    // writing part, in raw cost units
    const keys = [];
    let cost = 0;
    let prev = null;
    let first = null;
    const rows = card.rows.map(layoutRow);
    rows.forEach((row, rIdx) => {
      row.strokes.forEach((st, k) => {
        const p0 = st.pts[0];
        if (prev) {
          const sameWord = prev.st && prev.st.word === st.word && rIdx === prev.r;
          const h = prev.r !== rIdx ? 0.011 : sameWord ? 0.0032 : 0.0062;
          cost = liftKeys(prev.p, p0, h, keys, cost, prev.r !== rIdx ? 0.012 : 0.0016);
        } else {
          first = p0;
          keys.push([0, p0[0], p0[1], 0.0002]);
        }
        cost = strokeKeys(st.pts, keys, cost);
        const pe = st.pts[st.pts.length - 1];
        prev = { p: pe, st, r: rIdx };
      });
    });
    // close with a lift so the last key is in the air
    const last = prev.p;
    keys.push([cost + 0.0012, last[0] + 0.0012, last[1] + 0.0006, 0.004]);
    cost += 0.0012;
    const wspan = PH.w1 - PH.w0;
    const W = keys.map(([c, x, y, z]) => [PH.w0 + (c / cost) * wspan, x, y, z]);

    // the choreography around the writing: lift out of the ink, wipe on the rim, travel, write,
    // travel back, dip.
    const K = [];
    const wx = WELL.x, wy = WELL.y;
    K.push([0, wx, wy, WELL.zInk]);
    K.push([PH.lift0, wx, wy, WELL.zInk]);
    K.push([PH.lift1, wx + 0.001, wy - 0.002, WELL.zRim + 0.006]);
    // two wipes against the near rim
    const rimX = wx - WELL.r * 0.35, rimY = wy - WELL.r * 0.8;
    const tp = (u) => PH.tap0 + (PH.tap1 - PH.tap0) * u;
    K.push([tp(0.25), rimX, rimY, WELL.zRim + 0.0012]);
    K.push([tp(0.5), rimX + 0.003, rimY - 0.0015, WELL.zRim + 0.006]);
    K.push([tp(0.75), rimX, rimY, WELL.zRim + 0.0012]);
    K.push([tp(1.0), rimX - 0.002, rimY - 0.004, WELL.zTravel]);
    // travel to the first letter, arriving low
    const fx = first[0], fy = first[1];
    const travel = (u) => PH.tap1 + (PH.go1 - PH.tap1) * u;
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      const e = u * u * (3 - 2 * u);
      const zx = lerp(WELL.zTravel, 0.0002, sstep(0.55, 1, u)) + 0.012 * Math.sin(Math.PI * u) * (1 - u);
      K.push([travel(u) - (k === 10 ? 1e-6 : 0), lerp(rimX - 0.002, fx, e), lerp(rimY - 0.004, fy, e), Math.max(0.0002, zx)]);
    }
    for (const k of W) K.push(k);
    // back to the well
    const lx = last[0] + 0.0012, ly = last[1] + 0.0006;
    for (let k = 1; k <= 10; k++) {
      const u = k / 10;
      const e = u * u * (3 - 2 * u);
      const z = lerp(0.004, WELL.zTravel, sstep(0, 0.45, u));
      K.push([PH.w1 + (PH.back1 - PH.w1) * u, lerp(lx, wx, e), lerp(ly, wy, e), z]);
    }
    K.push([PH.dip1, wx, wy, WELL.zInk]);
    K.push([1, wx, wy, WELL.zInk]);

    // resample at N uniform phases
    const tab = new Float32Array(N * 3);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const ph = i / N;
      while (j < K.length - 2 && K[j + 1][0] <= ph) j++;
      const a = K[j], b = K[j + 1];
      const u = b[0] > a[0] ? clamp((ph - a[0]) / (b[0] - a[0]), 0, 1) : 0;
      // inside a lift or travel the keys are already eased; pen-down keys are dense
      tab[i * 3] = lerp(a[1], b[1], u);
      tab[i * 3 + 1] = lerp(a[2], b[2], u);
      tab[i * 3 + 2] = lerp(a[3], b[3], u);
    }
    return { tab, rows, first, last: [lx, ly] };
  }

  // ------------------------------------------------------------------ the cams
  // Global, fixed lever ratios: every X cam encodes x the same way, etc. (one set of followers).
  const MAP = {
    x: { lo: -0.08, hi: 0.142, r0: 0.019, r1: 0.041 },
    y: { lo: -0.072, hi: 0.066, r0: 0.019, r1: 0.044 },
    z: { lo: -0.0012, hi: 0.056, r0: 0.025, r1: 0.038 },
  };
  const enc = (m, v) => m.r0 + ((v - m.lo) / (m.hi - m.lo)) * (m.r1 - m.r0);
  const dec = (m, r) => m.lo + ((r - m.r0) / (m.r1 - m.r0)) * (m.hi - m.lo);

  const REVS = CARDS.map(buildRev);
  // the cam tables: radius per phase sample — these arrays ARE the cams' shapes
  const CAMS = REVS.map((rv) => {
    const X = new Float32Array(N), Y = new Float32Array(N), Z = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      X[i] = enc(MAP.x, rv.tab[i * 3]);
      Y[i] = enc(MAP.y, rv.tab[i * 3 + 1]);
      Z[i] = enc(MAP.z, rv.tab[i * 3 + 2]);
    }
    return { X, Y, Z };
  });

  function camRead(table, ph) {
    const f = (((ph % 1) + 1) % 1) * N;
    const i = Math.floor(f);
    const u = f - i;
    return table[i % N] * (1 - u) + table[(i + 1) % N] * u;
  }

  // ------------------------------------------------------------------ machine state at T
  // shaft phase: the governor holds the shaft at constant speed; a tiny pulse on each escapement
  // tick (the train advances in beats) is folded into the phase but averages out per tick.
  function shaft(T) {
    if (T <= T_RUN) return 0;
    if (T >= T_STOP) return NREV;
    const u = (T - T_RUN) / REV;
    return u;
  }

  function state(T) {
    const s = shaft(T);
    let rev = Math.min(NREV - 1, Math.floor(s));
    let ph = s - rev;
    if (s >= NREV) {
      rev = NREV - 1;
      ph = 1 - 1e-6;
    }
    const cam = CAMS[rev];
    const rX = camRead(cam.X, ph), rY = camRead(cam.Y, ph), rZ = camRead(cam.Z, ph);
    const x = dec(MAP.x, rX), y = dec(MAP.y, rY), z = dec(MAP.z, rZ);
    return { rev, ph, shaft: s, rX, rY, rZ, x, y, z, press: clamp(-z / PRESS, 0, 1), down: z <= 0 };
  }

  // stack position (in triplets): rises to the next card during the dwell around each boundary
  function stackLevel(T) {
    let lv = 0;
    for (let k = 1; k < NREV; k++) {
      const tb = T_RUN + k * REV;
      lv += sstep(tb - 0.03, tb + 0.07, T);
    }
    return lv;
  }

  // ------------------------------------------------------------------ the ink (decoded from the cams)
  // Every revolution: walk the cam tables at N phases, decode, and keep the pen-down runs.
  // Output per run: arrays of samples { x, y, t (global time laid), press, speed } plus landings.
  const INKRUNS = [];
  const LANDINGS = [];
  REVS.forEach((rv, r) => {
    const cam = CAMS[r];
    let run = null;
    let load = 1; // fresh from the well
    let firstLanding = true;
    const dt = REV / N;
    for (let i = 0; i < N; i++) {
      const ph = i / N;
      const x = dec(MAP.x, cam.X[i]), y = dec(MAP.y, cam.Y[i]), z = dec(MAP.z, cam.Z[i]);
      const t = T_RUN + r * REV + ph * REV;
      if (z <= 0) {
        const press = clamp(-z / PRESS, 0, 1);
        if (!run) {
          run = { pts: [], rev: r, land: { t, load, big: firstLanding, rev: r } };
          firstLanding = false;
        } else {
          const p = run.pts[run.pts.length - 1];
          load = Math.max(0.35, load - Math.hypot(x - p.x, y - p.y) * (0.6 + press) * 1.15);
        }
        run.pts.push({ x, y, t, press, load });
      } else if (run) {
        if (run.pts.length > 1) INKRUNS.push(run);
        run = null;
      }
    }
    if (run && run.pts.length > 1) INKRUNS.push(run);
    // place each landing blot a little way INTO its stroke (where the nib has already spread),
    // so a blot never sits before a letter like a full stop
    for (const rn of INKRUNS) {
      if (rn.rev !== r || !rn.land || rn.landDone) continue;
      const P0 = rn.pts; let acc = 0, k = 0;
      const into = rn.land.big ? 0.0011 : 0.0004;
      while (k < P0.length - 1 && acc < into) { acc += Math.hypot(P0[k + 1].x - P0[k].x, P0[k + 1].y - P0[k].y); k++; }
      LANDINGS.push({ x: P0[k].x, y: P0[k].y, t: P0[k].t, load: rn.land.load, big: rn.land.big, rev: r });
      rn.landDone = true;
    }
    // pen speed at each sample (m/s) for pooling
    for (const rn of INKRUNS) {
      if (rn.rev !== r || rn.speedDone) continue;
      const P = rn.pts;
      for (let k = 0; k < P.length; k++) {
        const a = P[Math.max(0, k - 2)], b = P[Math.min(P.length - 1, k + 2)];
        P[k].speed = Math.hypot(b.x - a.x, b.y - a.y) / Math.max(dt, b.t - a.t);
      }
      rn.speedDone = true;
    }
  });

  // last ink of the film (the final card is complete after this)
  const T_LASTINK = INKRUNS.length ? INKRUNS[INKRUNS.length - 1].pts.slice(-1)[0].t : T_STOP;

  // ------------------------------------------------------------------ escapement & winding
  const TICKS = []; // global times of escapement ticks (8ths) while the machine runs
  for (let t = T_RUN; t < T_STOP - 1e-6; t += E8) TICKS.push(Math.round(t * 1000) / 1000);
  function tickCount(T) {
    // fractional ticks: each tick is a quick snap (40 ms) — the escape wheel's stepping
    if (T <= T_RUN) return 0;
    const k = Math.min(TICKS.length, Math.floor((T - T_RUN) / E8 + 1e-6));
    if (k >= TICKS.length) return TICKS.length;
    const into = T - (T_RUN + k * E8);
    return k + sstep(0, 0.045, into);
  }
  const WIND_CLICKS = [BEAT * 1, BEAT * 2, BEAT * 3]; // 0.4 0.8 1.2
  function keyAngle(T) {
    // three quarter turns while winding, then it creeps back as the spring lets down
    let a = 0;
    for (const tc of WIND_CLICKS) a += sstep(tc - 0.16, tc, T) * (Math.PI / 2);
    if (T > T_RUN) a -= ((Math.min(T, T_STOP) - T_RUN) / (T_STOP - T_RUN)) * (Math.PI * 1.5);
    return a;
  }


  // ------------------------------------------------------------------ the figure's kinematics
  // World: metres, y up, desk top at y = 0; the scribe sits at +z and faces -z.
  const PAGE_C = [0.012, 0.0004, 0.012]; // page centre on the desk
  const PAGE_PSI = 0.05; // the sheet lies turned a little anticlockwise, as a right hand likes it
  const cP = Math.cos(PAGE_PSI), sP = Math.sin(PAGE_PSI);
  function pageToWorld(x, y, z) {
    const lx = x, lz = -y;
    return [PAGE_C[0] + lx * cP + lz * sP, PAGE_C[1] + z, PAGE_C[2] - lx * sP + lz * cP];
  }
  const FIG = {
    hip: [0, -0.15, 0.285], // torso pivot
    shoulderR: [0.086, 0.148, 0.272],
    shoulderL: [-0.086, 0.148, 0.272],
    neck: [0, 0.19, 0.282],
    upper: 0.142,
    fore: 0.136,
    aim: [0.3, 0.31, 0.21], // the quill's feather end leans toward this point
    grip: 0.042, // fingers hold the quill this far up from the nib
    quillLen: 0.19,
  };
  const v3 = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  };
  // rotate p about the hip: lean (about x, negative = forward) then yaw (about y)
  function torsoXf(p, lean, yaw) {
    const h = FIG.hip;
    let x = p[0] - h[0], y = p[1] - h[1], z = p[2] - h[2];
    const cl = Math.cos(lean), sl = Math.sin(lean);
    const y1 = y * cl - z * sl, z1 = y * sl + z * cl;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const x2 = x * cy + z1 * sy, z2 = -x * sy + z1 * cy;
    return [x2 + h[0], y1 + h[1], z2 + h[2]];
  }
  function ik2(S, W, a, b, pole) {
    const D = v3.sub(W, S);
    let d = v3.len(D);
    const dir = v3.mul(D, 1 / (d || 1));
    const reach = d;
    d = clamp(d, Math.abs(a - b) + 1e-4, a + b - 1e-4);
    const ca = (a * a + d * d - b * b) / (2 * a * d);
    const sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    let pr = v3.sub(pole, v3.mul(dir, v3.dot(pole, dir)));
    pr = v3.norm(pr);
    const E = v3.add(S, v3.add(v3.mul(dir, a * ca), v3.mul(pr, a * sa)));
    return { E, W: v3.add(S, v3.mul(dir, d)), reach, over: reach - (a + b) };
  }
  // full pose from a decoded nib position (page coords) — the arm only ever follows the cams
  // the hand frame rides the quill: Y = along the quill (nib -> feather), X = the scribe's right
  // (perpendicular to the quill), Z = X x Y (down-back, under the quill). Fingers are authored in it.
  const HAND = { grip: 0.03, wrist: [0.017, 0.062, 0.017] };
  function quillFrame(P) {
    const q = v3.norm(v3.sub(FIG.aim, P));
    const X = v3.norm(v3.sub([1, 0, 0], v3.mul(q, q[0])));
    const Z = v3.cross(X, q);
    return { q, X, Z };
  }
  function fromHand(G, fr, l) {
    return v3.add(G, v3.add(v3.mul(fr.X, l[0]), v3.add(v3.mul(fr.q, l[1]), v3.mul(fr.Z, l[2]))));
  }
  // full pose from a decoded nib position (page coords) — the arm only ever follows the cams
  function pose(st) {
    const P = pageToWorld(st.x, st.y, Math.max(st.z, -PRESS * 0.25));
    const fr = quillFrame(P);
    const G = v3.add(P, v3.mul(fr.q, HAND.grip));
    const W = fromHand(G, fr, HAND.wrist);
    // torso leans toward far targets and turns a little with the hand
    const far = clamp((0.1 - P[2]) / 0.14, 0, 1);
    const lean = -0.03 - 0.1 * sstep(0, 1, far);
    const yaw = clamp(-(P[0] - 0.02) * 0.8, -0.1, 0.1);
    const S = torsoXf(FIG.shoulderR, lean, yaw);
    const ik = ik2(S, W, FIG.upper, FIG.fore, v3.norm([0.45, -1, 0.25]));
    const neck = torsoXf(FIG.neck, lean, yaw);
    return { P, q: fr.q, X: fr.X, Z: fr.Z, G, W: ik.W, S, E: ik.E, lean, yaw, neck, over: ik.over };
  }

  FILM.prog = {
    BPM, BEAT, E8, BAR, T_RUN, REV, NREV, T_STOP, DURATION, N, PH, PAGE, XH, SLANT, WELL, PRESS, MAP,
    CARDS, REVS, CAMS, INKRUNS, LANDINGS, T_LASTINK, TICKS, WIND_CLICKS,
    enc, dec, camRead, state, stackLevel, tickCount, keyAngle, shaft, layoutRow, G,
    PAGE_C, PAGE_PSI, pageToWorld, FIG, v3, torsoXf, ik2, pose, sstep, clamp, lerp, HAND, quillFrame, fromHand,
  };
})();
