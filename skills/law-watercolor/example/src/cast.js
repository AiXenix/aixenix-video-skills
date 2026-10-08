/*
 * cast.js : THE PAINTING of the AiXenix ad «Растёт само» (watercolour, wet-on-wet).
 *
 * Law of the method: nobody paints a shape. Clear water is laid on the paper (it glistens), a drop
 * of pigment lands, and the colour blooms and RUNS ALONG THE WET PATHS BY ITSELF. Everything on the
 * sheet — every letter, every branch, every icon — is a wet path that one drop fills.
 *
 * Story (90 bpm, bar 2.667 s, 8 bars = 21.333 s):
 *   bar 1  one drop lands in the wet hook «Растёт само»; the colour runs letter to letter along a wet
 *          thread under the words.
 *   bar 2  the thread climbs on as a trunk; a big drop lands on the hub and blooms; branches run out.
 *   bar 3-4 a rain of drops on the beats: each lands in a wet icon at a branch end and it blooms —
 *          document, chat, chart (bars grow upward), robot, lightning, check, gear, mail — a living
 *          flowchart of a business; salt on the hub; buds wave out along the branches.
 *   bar 5  a branch runs into the wet slogan «Бизнес на автопилоте».
 *   bar 6  the sheet is TILTED: wet pigment runs downhill to the right in streams that pour into the
 *          wet logo; drops rain into the remaining letters of «AiXenix».
 *   bar 7  a running drop draws a looping flight trail and blooms into a paper plane; «aixenix.com»
 *          and «t.me/aixenix» fill. The final card.
 *   bar 8  loop: the paint is frozen; a glint crosses the wet logo once a bar.
 *
 * FILM.cast.def() is the t-independent painting for FILM.wc; FILM.cast.frame(ctx, T) renders it,
 * draws the falling drops onto the sheet and blits the sheet through the camera (zoom, tilt).
 */
(function () {
  'use strict';

  const FILM = window.FILM;
  const WC = FILM.wc;
  const P = WC.PIG;
  const TAU = Math.PI * 2;
  const clamp = WC.clamp, sstep = WC.sstep;
  const mix = WC.mixAbs;

  const BEAT = 60 / 90, BAR = 4 * BEAT, E8 = BEAT / 2, S16 = BEAT / 4;
  const at = (bar, beat) => bar * BAR + beat * BEAT; // bar and beat 0-based
  const T_DROP = at(0, 1); // 0.667 the first drop
  const T_HUB = at(1, 1); // 3.333 the hub drop
  const T_BR = at(1, 2); // 4.000 branches run
  const T_SLOGAN = at(4, 0); // 10.667
  const T_TILT = at(5, 0); // 13.333
  const T_CARD = at(6, 0); // 16.000
  const T_LOOP = at(7, 0); // 18.667
  const HUB = [470, 500];

  // the card column (all type inside x 1140-1835, y 270-792)
  const CARD = { x: 984, logoY: 296, sloganY: 450, sloganY2: 550, siteY: 722, tgY: 872 };
  // ---- MAKE IT YOURS: every word on the sheet. Lengths may change; keep the slogan lines and the links
  // short enough to fit the card column (x 984..1840 at the sizes in CARD / SIZES below).
  const TEXT = {
    hook: 'Растёт само', // the opening line, filled by the first drop
    slogan1: 'Бизнес', // the slogan, two lines
    slogan2: 'на автопилоте',
    logo: 'AiXenix', // the brand word the tilt streams pour into
    site: 'aixenix.com',
    tg: 't.me/aixenix', // shown with the paper plane
  };
  const SIZES = { hook: 84, slogan: 96, logo: 196, site: 110, tg: 92 };
  const HOOK = { str: TEXT.hook, size: SIZES.hook, x: 104, y: 972 };

  const rng = (seed) => FILM.lib.rng('wc06ad-' + seed);

  // ------------------------------------------------------------------ geometry helpers
  function strokeTaper(g, pts, w0, w1) {
    for (let k = 1; k < pts.length; k++) {
      g.lineWidth = w0 + (w1 - w0) * (k / (pts.length - 1));
      g.beginPath();
      g.moveTo(pts[k - 1][0], pts[k - 1][1]);
      g.lineTo(pts[k][0], pts[k][1]);
      g.stroke();
    }
  }
  function bboxPts(pts, pad) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[0] > x1) x1 = p[0];
      if (p[1] > y1) y1 = p[1];
    }
    return [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
  }
  const dirAt = (pts, k) => {
    const a = pts[Math.max(0, k - 2)], b = pts[Math.min(pts.length - 1, k + 2)];
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  /** resample any polyline to 4 px steps with arc length */
  function resample(raw) {
    const pts = [[raw[0][0], raw[0][1], 0]];
    let acc = 0, next = 4;
    for (let k = 1; k < raw.length; k++) {
      acc += Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]);
      if (acc >= next) { pts.push([raw[k][0], raw[k][1], acc]); next += 4; }
    }
    const l = raw[raw.length - 1];
    if (Math.hypot(l[0] - pts[pts.length - 1][0], l[1] - pts[pts.length - 1][1]) > 1) pts.push([l[0], l[1], acc]);
    return pts;
  }
  /** cubic curve from p0 to p3 with sideways bends b1, b2 (fractions of the chord) */
  function curve(x0, y0, x3, y3, b1, b2) {
    const dx = x3 - x0, dy = y3 - y0, Ld = Math.hypot(dx, dy) || 1;
    const nx = -dy / Ld, ny = dx / Ld;
    const x1 = x0 + dx / 3 + nx * b1 * Ld, y1 = y0 + dy / 3 + ny * b1 * Ld;
    const x2 = x0 + (2 * dx) / 3 + nx * b2 * Ld, y2 = y0 + (2 * dy) / 3 + ny * b2 * Ld;
    const raw = [];
    for (let k = 0; k <= 600; k++) {
      const u = k / 600, w = 1 - u;
      raw.push([w * w * w * x0 + 3 * w * w * u * x1 + 3 * w * u * u * x2 + u * u * u * x3, w * w * w * y0 + 3 * w * w * u * y1 + 3 * w * u * u * y2 + u * u * u * y3]);
    }
    return resample(raw);
  }
  /** a source train: the pigment runs down the wet path from t0 at v px/s */
  const train = (pts, t0, v, step) => {
    const out = [];
    for (let k = 0; k < pts.length; k += step || 2) out.push([pts[k][0], pts[k][1], t0 + pts[k][2] / v, 3]);
    return out;
  };
  const tEnd = (pts, t0, v) => t0 + pts[pts.length - 1][2] / v;

  let MEAS = null;
  function measure(str, size) {
    if (!MEAS) MEAS = FILM.makeCanvas(8, 8).getContext('2d');
    MEAS.font = `700 ${size}px Futura`;
    return MEAS.measureText(str).width;
  }

  // ------------------------------------------------------------------ pigments
  const stemPig = (seed, hubFade) => {
    const g0 = mix(P.sap, P.hooker, 0.35 + 0.4 * WC.hh(seed, 1, 77));
    const g1 = mix(g0, P.teal, 0.3 * WC.hh(seed, 2, 77));
    return (x, y) => {
      const d = Math.hypot(x - HUB[0], y - HUB[1]);
      const u = sstep(150, 250, d + 25 * WC.vnoise(x / 40, y / 40, seed));
      const c = mix(P.violet, g1, u);
      if (!hubFade) return c;
      const k = 0.1 + 0.9 * sstep(150, 190, d + 10 * WC.vnoise(x / 9, y / 9, seed + 3));
      return [c[0] * k, c[1] * k, c[2] * k];
    };
  };
  const methodPig = (x, y) => mix(P.violet, P.ultramarine, 0.3 + 0.3 * WC.vnoise(x / 70, y / 70, 31));

  // ------------------------------------------------------------------ icons (wet silhouettes)
  // each draws its mask centred at (x, y), size s; 'destination-out' cuts reserve white details
  const rr = (g, x, y, w, h, r) => {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  };
  const cut = (g, f) => {
    g.save();
    g.globalCompositeOperation = 'destination-out';
    f();
    g.restore();
  };
  const ICON = {
    chat(g, x, y, s) {
      rr(g, x - s * 0.55, y - s * 0.4, s * 1.1, s * 0.7, s * 0.2);
      g.fill();
      g.beginPath();
      g.moveTo(x - s * 0.28, y + s * 0.25);
      g.lineTo(x - s * 0.42, y + s * 0.55);
      g.lineTo(x - s * 0.02, y + s * 0.28);
      g.closePath();
      g.fill();
      cut(g, () => { for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(x + k * s * 0.24, y - s * 0.05, s * 0.07, 0, TAU); g.fill(); } });
    },
    doc(g, x, y, s) {
      const w = s * 0.76, h = s, x0 = x - w / 2, y0 = y - h / 2, f = s * 0.26;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x0 + w - f, y0);
      g.lineTo(x0 + w, y0 + f);
      g.lineTo(x0 + w, y0 + h);
      g.lineTo(x0, y0 + h);
      g.closePath();
      g.fill();
      cut(g, () => {
        for (let k = 0; k < 4; k++) g.fillRect(x0 + w * 0.17, y0 + h * (0.36 + k * 0.15), w * (k === 3 ? 0.42 : 0.66), s * 0.055);
        g.beginPath(); g.moveTo(x0 + w - f, y0); g.lineTo(x0 + w - f, y0 + f); g.lineTo(x0 + w, y0 + f); g.lineWidth = s * 0.04; g.stroke();
      });
    },
    chart(g, x, y, s) {
      const x0 = x - s * 0.55, base = y + s * 0.45;
      g.fillRect(x0, base - s * 0.07, s * 1.1, s * 0.07); // axis (the drop lands here and the bars grow up)
      const hs = [0.38, 0.62, 0.92];
      hs.forEach((h, k) => g.fillRect(x0 + s * (0.1 + k * 0.33), base - s * h, s * 0.22, s * h));
    },
    gear(g, x, y, s) {
      const R = s * 0.42, n = 8;
      g.beginPath();
      for (let k = 0; k < n * 4; k++) {
        const a = (k / (n * 4)) * TAU;
        const r = k % 4 < 2 ? R * 1.22 : R;
        if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      cut(g, () => { g.beginPath(); g.arc(x, y, R * 0.42, 0, TAU); g.fill(); });
    },
    mail(g, x, y, s) {
      const w = s * 1.1, h = s * 0.72;
      rr(g, x - w / 2, y - h / 2, w, h, s * 0.06);
      g.fill();
      cut(g, () => {
        g.lineWidth = s * 0.06;
        g.beginPath();
        g.moveTo(x - w * 0.42, y - h * 0.3);
        g.lineTo(x, y + h * 0.08);
        g.lineTo(x + w * 0.42, y - h * 0.3);
        g.stroke();
      });
    },
    robot(g, x, y, s) {
      rr(g, x - s * 0.48, y - s * 0.3, s * 0.96, s * 0.68, s * 0.16);
      g.fill();
      g.fillRect(x - s * 0.035, y - s * 0.5, s * 0.07, s * 0.22);
      g.beginPath(); g.arc(x, y - s * 0.52, s * 0.09, 0, TAU); g.fill();
      g.fillRect(x - s * 0.62, y - s * 0.08, s * 0.16, s * 0.22);
      g.fillRect(x + s * 0.46, y - s * 0.08, s * 0.16, s * 0.22);
      cut(g, () => {
        g.beginPath(); g.arc(x - s * 0.2, y - s * 0.02, s * 0.1, 0, TAU); g.fill();
        g.beginPath(); g.arc(x + s * 0.2, y - s * 0.02, s * 0.1, 0, TAU); g.fill();
        g.fillRect(x - s * 0.18, y + s * 0.19, s * 0.36, s * 0.055);
      });
    },
    check(g, x, y, s) {
      g.beginPath(); g.arc(x, y, s * 0.5, 0, TAU); g.fill();
      cut(g, () => {
        g.lineWidth = s * 0.12; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x - s * 0.24, y + s * 0.02); g.lineTo(x - s * 0.06, y + s * 0.2); g.lineTo(x + s * 0.26, y - s * 0.18); g.stroke();
      });
    },
    bolt(g, x, y, s) {
      g.beginPath();
      g.moveTo(x + s * 0.12, y - s * 0.6);
      g.lineTo(x - s * 0.34, y + s * 0.08);
      g.lineTo(x - s * 0.02, y + s * 0.08);
      g.lineTo(x - s * 0.14, y + s * 0.6);
      g.lineTo(x + s * 0.34, y - s * 0.1);
      g.lineTo(x + s * 0.02, y - s * 0.1);
      g.closePath();
      g.fill();
    },
  };

  // ------------------------------------------------------------------ the painting
  let DEF = null;
  let INFO = null;
  function def() {
    if (DEF) return DEF;
    const L0 = [], LH = [], L1 = [], L2 = [], L3 = [], LR = [];
    const drops = []; // falling drops drawn as overlay: { x, y, t (impact), r, col }
    const flowers = [];

    // ---- lettering with a wet thread under it: ONE drop at the thread's start fills every letter
    const threadOf = (x0, x1, y, seed) => {
      const raw = [];
      for (let x = x0; x <= x1; x += 3) raw.push([x, y + 1.6 * Math.sin(x / 23 + seed) + 0.8 * WC.vnoise(x / 40, seed, 5)]);
      return resample(raw);
    };
    // a word = a fast wet thread (one drop at its start) + slow wet letters the colour climbs into
    // from the thread, bottom-up, letter after letter. The thread dries pale once the word is full.
    const wordThread = (L, str, size, x, y, t0, pig, o) => {
      o = o || {};
      const wd = measure(str, size);
      const th = threadOf(x - 10, x + wd + 6, y + 3, size);
      const vT = o.vThread || 900, vL = o.vLetters || 240;
      const tFull = t0 + (wd + 20) / (vT * 1.05) + (size * 0.95) / (vL * 1.05);
      const wet = o.wet || [t0 - 0.6, tFull + 1.2, tFull + 2.6];
      const common = { pig, merge: true, sigma: 1.0, conc: o.conc || 0.7, burst: 0.4, srcBoost: 0.3, rim: o.rim || 1.45, gran: 0.25, pool: o.pool != null ? o.pool : 0.38, bead: 1.6, featherStop: 0.2, preWet: o.preWet || 0.9, gloss: 0.9, wet, tFlow: o.tFlow || tFull + 0.8, shimmer: o.shimmer || 0, dryFade: o.dryFade || 0 };
      const thread = Object.assign({}, common, {
        bbox: bboxPts(th, 8), warp: 0.8, shape: (g) => strokeTaper(g, th, o.thread0 || 4.5, o.thread1 || 3),
        drops: [[x - 8, y + 3, t0, 4]], v: vT, conc: (o.conc || 0.7) * 0.9, dryFade: 0.72, wet: [wet[0], Math.min(wet[1], tFull + 0.4), Math.min(wet[2], tFull + 1.6)], bead: 2.0,
      });
      const letters = Object.assign({}, common, {
        bbox: [x - 6, y - size * 0.95, x + wd + 10, y + size * 0.35], warp: 1.2, warpScale: 7,
        shape: (g) => { g.font = `700 ${size}px Futura`; g.textBaseline = 'alphabetic'; g.fillText(str, x, y); },
        drops: [], sweep: { t0: t0 + 0.15, x0: x - 10, v: vT * 0.8 }, v: vL,
      });
      L.push(thread, letters);
      return { thread: th, width: wd, tFull };
    };

    // ---- L0: the halo of the hub drop (method violet family only)
    L0.push({
      bbox: [HUB[0] - 560, HUB[1] - 560, HUB[0] + 560, HUB[1] + 560],
      shape: (g) => WC.blobPath(g, HUB[0], HUB[1], 400, 901, 0.2, 64),
      drops: [[HUB[0], HUB[1], T_HUB + 0.12, 14]],
      pig: (x, y) => {
        const d = Math.hypot(x - HUB[0], y - HUB[1]);
        const cool = 0.5 + 0.5 * WC.vnoise(x / 200, y / 200, 6);
        return mix(P.violet, mix(mix(P.lilac, P.rose, 0.35), P.ultramarine, 0.45 * cool), sstep(60, 280, d));
      },
      v: 320, decay: 0.55, sigma: 1.2, tFlow: T_HUB + 2.2, featherStop: 1.3, conc: 0.06, burst: 0.2, srcBoost: 0.6, rim: 0.3, gran: 0.08, pool: 0.55,
      wet: [T_HUB - 0.4, 6.5, 8.8], merge: true,
    });

    // ---- the rain on the right half (bars 3-4, off-beat 8ths): big wet-in-wet blooms that glaze over
    // each other and dry pale — the luminous ground the card will be written on
    const LA = [], LB = [];
    const RAIN = [
      { L: LA, x: 1270, y: 160, r: 200, t: at(2, 0.5), pig: 'magenta', mix: 'opera' },
      { L: LB, x: 1460, y: 540, r: 225, t: at(2, 1.5), pig: 'lilac', mix: 'bviolet' },
      { L: LA, x: 1720, y: 300, r: 200, t: at(2, 2.5), pig: 'cyan', mix: 'cerulean' },
      { L: LB, x: 1470, y: 135, r: 150, t: at(2, 3.5), pig: 'cerulean', mix: 'cyan' },
      { L: LA, x: 1180, y: 1010, r: 190, t: at(3, 0.5), pig: 'bviolet', mix: 'magenta' },
      { L: LB, x: 1560, y: 1040, r: 160, t: at(3, 1.5), pig: 'opera', mix: 'rose' },
      { L: LA, x: 1830, y: 620, r: 180, t: at(3, 2.5), pig: 'teal', mix: 'cyan' },
    ];
    RAIN.forEach((d, k) => {
      const [pa, pb] = [P[d.pig], P[d.mix]];
      d.L.push({
        bbox: [d.x - d.r * 1.75, d.y - d.r * 1.75, d.x + d.r * 1.75, d.y + d.r * 1.75],
        shape: (g) => WC.blobPath(g, d.x, d.y, d.r * 1.25, 3100 + k, 0.22, 48),
        drops: [[d.x, d.y, d.t, 10]],
        pig: (x, y) => mix(pa, pb, sstep(0.2, 1, Math.hypot(x - d.x, y - d.y) / d.r + 0.3 * WC.vnoise(x / 60, y / 60, k))),
        v: 150, decay: 0.42, sigma: 1.4, tFlow: d.t + 1.7, featherStop: 0.8, stopRim: 0.5, conc: 0.11, burst: 1.6, srcBoost: 1.3, srcFall: 0.4, srcKeep: 0.1, dryFade: 0.72,
        rim: 0.5, gran: 0.12, pool: 0.45, wet: [d.t - 0.5, d.t + 2.4, d.t + 4.2], preWet: 0.5, gloss: 0,
      });
      drops.push({ x: d.x, y: d.y, t: d.t, r: 18, col: d.pig === 'opera' ? 'rose' : d.pig === 'lilac' ? 'violet' : d.pig });
    });

    // ---- L3: the hook, filled by the first drop running along its thread
    const hook = wordThread(L3, HOOK.str, HOOK.size, HOOK.x, HOOK.y, T_DROP, methodPig, {
      wet: [-1, 3.6, 5.6], conc: 0.74, thread0: 6, thread1: 4.5, dryFade: 0.66,
    });
    drops.push({ x: HOOK.x - 8, y: HOOK.y + 3, t: T_DROP, r: 15, col: 'violet', first: true });
    const hookEnd = hook.thread[hook.thread.length - 1];
    const tHookEnd = T_DROP + (hook.width + 20) / (900 * 1.05);

    // ---- L1: the trunk climbs from the thread's end to the hub
    const trunk = curve(hookEnd[0], hookEnd[1], HUB[0] + 22, HUB[1] + 150, 0.28, -0.12);
    const tTrunk0 = Math.max(tHookEnd + 0.4, at(1, 0) - 0.1);
    const vTrunk = trunk[trunk.length - 1][2] / (T_HUB - 0.08 - tTrunk0);
    L1.push({
      bbox: bboxPts(trunk, 14), warp: 1.4, warpScale: 9,
      shape: (g) => strokeTaper(g, trunk, 5, 12),
      drops: train(trunk, tTrunk0, vTrunk), pig: (x, y) => mix(methodPig(x, y), P.indigo, 0.2),
      v: 90, sigma: 1.1, tFlow: T_HUB + 0.3, tau: 0.16, conc: 0.82, burst: 0.25, srcBoost: 0.2, rim: 1.0, gran: 0.2,
      wet: [tTrunk0 - 0.4, 6.0, 8.0], merge: true, preWet: 0.5, gloss: 0.6,
    });

    // ---- LH: the hub — the big drop of the method
    const grains = [];
    {
      const r = rng('salt');
      for (let k = 0; k < 30; k++) {
        const a = r() * TAU, d = 15 + Math.sqrt(r()) * 98;
        grains.push([HUB[0] + Math.cos(a) * d, HUB[1] + Math.sin(a) * d, 6 + r() * 12]);
      }
    }
    LH.push({
      bbox: [HUB[0] - 340, HUB[1] - 340, HUB[0] + 340, HUB[1] + 340],
      shape: (g) => WC.blobPath(g, HUB[0], HUB[1], 255, 911, 0.2, 56),
      drops: [[HUB[0], HUB[1], T_HUB, 13]],
      pig: (x, y) => mix(P.violet, P.indigo, 0.2 + 0.3 * WC.vnoise(x / 60, y / 60, 9)),
      v: 200, decay: 0.34, sigma: 1.4, tFlow: T_HUB + 1.6, featherStop: 0.12, stopRim: 1.0, conc: 0.52, burst: 0.9, srcBoost: 1.5, srcFall: 0.55, srcKeep: 0.08,
      rim: 1.1, gran: 0.3, floc: 0.1, pool: 0.32, saltLift: 0.72,
      wet: [T_HUB - 0.7, 7.2, 9.0],
      salt: { t: at(2, 1), dur: 1.5, grains },
      backruns: [{ x: HUB[0] + 64, y: HUB[1] - 72, t: 7.0, v: 50, stop: 8.1, sigma: 1.9 }],
    });
    drops.push({ x: HUB[0], y: HUB[1], t: T_HUB, r: 22, col: 'violet' });
    {
      const r = rng('splash');
      for (let k = 0; k < 6; k++) {
        const a = r() * TAU, d = 230 + r() * 120, sz = 3 + r() * 5;
        const x = HUB[0] + Math.cos(a) * d, y = HUB[1] + Math.sin(a) * d, t = T_HUB + 0.06 + r() * 0.1;
        if (y > 880 || x > 930 || x < 60 || y < 60) continue;
        LH.push({ bbox: [x - sz - 3, y - sz - 3, x + sz + 3, y + sz + 3], shape: (g) => WC.blobPath(g, x, y, sz, 950 + k, 0.25, 18), drops: [[x, y, t, 2]], pig: 'violet', v: 50, tFlow: t + 0.5, conc: 0.75, rim: 1.3, wet: [t - 0.02, t + 0.6, t + 1.8] });
      }
    }

    // ---- the flowchart: eight icons at branch ends, each blooming from a drop on its beat
    const NODES = [
      { kind: 'doc', x: 300, y: 172, s: 112, pigs: ['cerulean', 'ultramarine'], tf: at(2, 0), b1: -0.18, b2: 0.14 },
      { kind: 'chat', x: 128, y: 372, s: 116, pigs: ['cyan', 'teal'], tf: at(2, 1), b1: 0.2, b2: -0.16 },
      { kind: 'chart', x: 600, y: 150, s: 116, pigs: ['magenta', 'opera'], tf: at(2, 2), b1: 0.16, b2: -0.18 },
      { kind: 'robot', x: 140, y: 650, s: 116, pigs: ['bviolet', 'magenta'], tf: at(2, 3), b1: -0.16, b2: 0.2 },
      { kind: 'bolt', x: 300, y: 812, s: 108, pigs: ['gold', 'orange'], tf: at(3, 0), b1: 0.18, b2: -0.14 },
      { kind: 'check', x: 780, y: 790, s: 106, pigs: ['teal', 'sap'], tf: at(3, 1), b1: -0.2, b2: 0.12 },
      { kind: 'gear', x: 842, y: 318, s: 112, pigs: ['bviolet', 'violet'], tf: at(3, 2), b1: 0.16, b2: -0.2 },
      { kind: 'mail', x: 846, y: 572, s: 108, pigs: ['rose', 'opera'], tf: at(3, 3), b1: -0.16, b2: 0.18 },
    ];
    const branches = [];
    NODES.forEach((nd, i) => {
      const a = Math.atan2(nd.y - HUB[1], nd.x - HUB[0]);
      const a0 = a + (i % 2 ? 0.08 : -0.08);
      const sx = HUB[0] + Math.cos(a0) * 140, sy = HUB[1] + Math.sin(a0) * 140;
      const ex = nd.x - Math.cos(a) * nd.s * 0.5, ey = nd.y - Math.sin(a) * nd.s * 0.5;
      const pts = curve(sx, sy, ex, ey, nd.b1, nd.b2);
      const t0 = Math.min(T_BR + i * 0.08, nd.tf - 0.6);
      const v = pts[pts.length - 1][2] / (nd.tf - 0.1 - t0);
      branches.push({ pts, t0, v, nd });
      L1.push({
        bbox: bboxPts(pts, 12), warp: 1.3, warpScale: 9,
        shape: (g) => strokeTaper(g, pts, 8, 4),
        drops: train(pts, t0, v), pig: stemPig(i, true),
        v: 90, sigma: 1.1, tFlow: nd.tf + 0.5, tau: 0.18, conc: 0.85, burst: 0.25, srcBoost: 0.2, rim: 0.9, gran: 0.2,
        wet: [t0 - 0.35, nd.tf + 0.9, nd.tf + 2.6], merge: true, preWet: 0.4, gloss: 0.5,
      });
      const [pa, pb] = nd.pigs.map((k) => P[k]);
      const late = nd.kind === 'gear' || nd.kind === 'mail' || nd.kind === 'chart';
      const reg = {
        bbox: [nd.x - nd.s, nd.y - nd.s, nd.x + nd.s, nd.y + nd.s], warp: 1.6, warpScale: 9,
        shape: (g) => ICON[nd.kind](g, nd.x, nd.y, nd.s),
        drops: nd.kind === 'chart' ? [[nd.x - nd.s * 0.4, nd.y + nd.s * 0.41, nd.tf, 6]] : [[nd.x, nd.y, nd.tf, 7], [ex, ey, nd.tf - 0.05, 3]],
        snap: true,
        pig: (x, y) => mix(pa, pb, sstep(0.15, 1.0, Math.hypot(x - nd.x, y - nd.y) / (nd.s * 0.6) + 0.2 * WC.vnoise(x / 18, y / 18, i))),
        v: nd.kind === 'chart' ? 150 : 170, sigma: 1.2, tFlow: nd.tf + 1.1, featherStop: 0.2, conc: 0.72, burst: 0.5, srcBoost: 0.9, srcFall: 0.4,
        rim: 1.25, gran: 0.2, pool: 0.3, preWet: 0.6, gloss: 0.7,
        wet: late ? [nd.tf - 0.6, 15.6, 17.4] : [nd.tf - 0.6, nd.tf + 1.6, nd.tf + 3.0],
      };
      if (i === 1 || i === 3) reg.backruns = [{ x: nd.x + nd.s * 0.22, y: nd.y - nd.s * 0.1, t: nd.tf + 1.3, v: 45, stop: nd.tf + 2.1, sigma: 1.9 }];
      L2.push(reg);
      drops.push({ x: nd.x, y: nd.y, t: nd.tf, r: 13, col: nd.pigs[0] });
      flowers.push({ x: nd.x, y: nd.y, size: nd.s * 0.62, big: true });
    });

    // small flowers and leaves on short side shoots (8ths between the icon beats)
    const FL_PIGS = [['rose', 'opera'], ['gold', 'orange'], ['teal', 'cerulean'], ['lilac', 'cerulean'], ['scarlet', 'gold'], ['opera', 'lilac']];
    {
      const r = rng('shoots');
      let n = 0;
      branches.forEach((br, i) => {
        const k = Math.floor(br.pts.length * 0.55);
        if (k < 10) return;
        const p = br.pts[k];
        const side = i % 2 ? 1 : -1;
        const ang = dirAt(br.pts, k) + side * 0.95;
        const len = 70 + r() * 40;
        const pts = curve(p[0], p[1], p[0] + Math.cos(ang) * len, p[1] + Math.sin(ang) * len, side * 0.15, 0);
        const tip = pts[pts.length - 1];
        if (flowers.some((f) => Math.hypot(f.x - tip[0], f.y - tip[1]) < f.size + 42)) return;
        if (tip[0] > 920 || tip[1] > 880 || tip[1] < 80 || tip[0] < 70) return;
        const tArr = br.t0 + p[2] / br.v;
        const tf = Math.max(tArr + 0.4, at(2, 0) + n * E8 + S16);
        n++;
        L1.push({
          bbox: bboxPts(pts, 10), warp: 1.2, shape: (g) => strokeTaper(g, pts, 4.5, 2.6),
          drops: train(pts, tf - 0.4, len / 0.3), pig: stemPig(100 + i), v: 70, tFlow: tf + 0.4, tau: 0.14, conc: 0.8, rim: 0.9,
          wet: [tf - 0.5, tf + 0.6, tf + 2.0], merge: true,
        });
        const [pa, pb] = FL_PIGS[i % FL_PIGS.length].map((q) => P[q]);
        const sz = 34 + r() * 10, np = 5;
        const rot0 = r() * TAU;
        for (let q = 0; q < np; q++) {
          const a = rot0 + (q / np) * TAU;
          L2.push({
            bbox: [tip[0] - sz - 8, tip[1] - sz - 8, tip[0] + sz + 8, tip[1] + sz + 8], warp: 1.6,
            shape: (g) => WC.petalPath(g, tip[0], tip[1], a, sz, sz * 0.62, 1300 + i * 20 + q, 0.16),
            drops: [[tip[0] + Math.cos(a) * sz * 0.28, tip[1] + Math.sin(a) * sz * 0.28, tf + q * 0.03, 3]],
            pig: (x, y) => mix(pa, pb, sstep(0.25, 1, Math.hypot(x - tip[0], y - tip[1]) / sz)), v: 110, tFlow: tf + 0.5, conc: 0.8, srcBoost: 0.9, rim: 1.15,
            wet: [tf - 0.3, tf + 0.8, tf + 2.1],
          });
        }
        L3.push({
          bbox: [tip[0] - 12, tip[1] - 12, tip[0] + 12, tip[1] + 12], shape: (g) => WC.blobPath(g, tip[0], tip[1], 6, 1500 + i, 0.25, 18),
          drops: [[tip[0], tip[1], tf + 0.35, 3]], pig: mix(P.sienna, P.indigo, 0.25), v: 40, bleed: 0.3, bleedDur: 0.3, tFlow: tf + 0.8, conc: 1.0, gran: 0.7,
          wet: [tf + 0.3, tf + 1.0, tf + 2.2],
        });
        flowers.push({ x: tip[0], y: tip[1], size: sz, big: false });
        // a leaf at the shoot's base
        const lk = Math.floor(br.pts.length * 0.32);
        const lp = br.pts[lk];
        const la = dirAt(br.pts, lk) - side * 0.9;
        const ll = 40 + r() * 14;
        const lx = lp[0] + Math.cos(la) * 4, ly = lp[1] + Math.sin(la) * 4;
        const tl = br.t0 + lp[2] / br.v + 0.1;
        if (!flowers.some((f) => Math.hypot(f.x - (lx + Math.cos(la) * ll * 0.6), f.y - (ly + Math.sin(la) * ll * 0.6)) < f.size + ll * 0.5)) {
          L1.push({
            bbox: [lx - ll - 6, ly - ll - 6, lx + ll + 6, ly + ll + 6], warp: 1.4,
            shape: (g) => WC.petalPath(g, lx, ly, la, ll, ll * 0.4, 700 + i, 0.04),
            drops: [[lx + Math.cos(la) * 6, ly + Math.sin(la) * 6, tl, 4]],
            pig: (x, y) => mix(mix(P.hooker, P.sap, 0.6), P.yellow, 0.2 + 0.5 * clamp(Math.hypot(x - lx, y - ly) / ll, 0, 1)),
            v: 120, tFlow: tl + 0.7, conc: 0.62, srcBoost: 0.7, rim: 1.1, wet: [tl - 0.15, tl + 1.0, tl + 2.6],
          });
        }
      });
    }

    // buds: tiny rosettes along the branches, a wave out from the hub (bar 4)
    const buds = [];
    {
      const r = rng('buds');
      const sprays = [];
      branches.forEach((br, i) => {
        for (let k = Math.floor(br.pts.length * 0.3); k < br.pts.length - 8; k += 19) {
          const p = br.pts[k];
          const side = (k / 10 + i) % 2 ? 1 : -1;
          const ang = dirAt(br.pts, k) + side * (0.7 + r() * 0.5);
          const len = 22 + r() * 26;
          const ex = p[0] + Math.cos(ang) * len, ey = p[1] + Math.sin(ang) * len;
          if (ex > 935 || ex < 70 || ey < 70 || ey > 880) continue;
          if (flowers.some((f) => Math.hypot(f.x - ex, f.y - ey) < f.size + 14)) continue;
          if (Math.hypot(ex - HUB[0], ey - HUB[1]) < 215) continue;
          sprays.push({ x0: p[0], y0: p[1], ex, ey, ang, d: Math.hypot(ex - HUB[0], ey - HUB[1]) });
        }
      });
      sprays.sort((a, b) => a.d - b.d);
      const dMin = sprays.length ? sprays[0].d : 0, dMax = sprays.length ? sprays[sprays.length - 1].d : 1;
      sprays.forEach((sp, si) => {
        const tw = at(3, 0) + Math.round((((sp.d - dMin) / Math.max(1, dMax - dMin)) * 2.4) / S16) * S16;
        L2.push({
          bbox: [Math.min(sp.x0, sp.ex) - 5, Math.min(sp.y0, sp.ey) - 5, Math.max(sp.x0, sp.ex) + 5, Math.max(sp.y0, sp.ey) + 5], warp: 0.8,
          shape: (g) => { g.lineWidth = 2.4; g.beginPath(); g.moveTo(sp.x0, sp.y0); g.lineTo(sp.ex, sp.ey); g.stroke(); },
          drops: [[sp.x0, sp.y0, tw - 0.25, 2]], pig: stemPig(900 + si), v: 160, tFlow: tw + 0.1, tau: 0.1, conc: 0.8, burst: 0, srcBoost: 0, rim: 0.6,
          wet: [tw - 0.3, tw + 0.2, tw + 1.4],
        });
        const nb = 3 + (si % 2);
        for (let b = 0; b < nb; b++) {
          const ba = sp.ang + (b - (nb - 1) / 2) * 0.85;
          const bl = 8 + r() * 10;
          const bx = sp.ex + Math.cos(ba) * bl, by = sp.ey + Math.sin(ba) * bl;
          const br2 = 7 + r() * 3;
          const tb = tw + Math.round((r() * 0.3) / S16) * S16;
          const nl = 4 + (buds.length % 2), rot = r() * TAU;
          const pig = mix(P[['rose', 'opera', 'gold', 'orange', 'cerulean', 'teal', 'magenta', 'cyan', 'lilac', 'scarlet'][Math.floor(r() * 10)]], P.violet, 0.1);
          buds.push([bx, by]);
          L2.push({
            bbox: [bx - br2 - 4, by - br2 - 4, bx + br2 + 4, by + br2 + 4], warp: 0.8, warpScale: 5,
            shape: (g) => {
              for (let q = 0; q < nl; q++) {
                const a2 = rot + (q / nl) * TAU;
                g.beginPath();
                g.arc(bx + Math.cos(a2) * br2 * 0.56, by + Math.sin(a2) * br2 * 0.56, br2 * 0.47, 0, TAU);
                g.fill();
              }
            },
            drops: [[bx + Math.cos(rot) * br2 * 0.56, by + Math.sin(rot) * br2 * 0.56, tb, 2]],
            pig, v: 55, sigma: 1.1, tFlow: tb + 0.45, tau: 0.12, conc: 0.95, burst: 0.5, srcBoost: 0.6, rim: 1.2,
            wet: [tb - 0.1, tb + 0.4, tb + 1.6],
          });
        }
      });
    }

    // ---- bar 5: a branch runs from the mail icon into the wet slogan
    const sloPig = (x, y) => mix(P.violet, P.bviolet, 0.25 + 0.25 * WC.vnoise(x / 60, y / 60, 51));
    const tS = T_SLOGAN + S16;
    const s1 = wordThread(L3, TEXT.slogan1, SIZES.slogan, CARD.x, CARD.sloganY, tS, sloPig, { wet: [T_SLOGAN - 0.6, T_SLOGAN + 2.4, T_TILT - 0.05], conc: 0.6, tFlow: T_TILT + 0.4 });
    drops.push({ x: CARD.x - 8, y: CARD.sloganY + 3, t: tS, r: 14, col: 'violet' });
    wordThread(L3, TEXT.slogan2, SIZES.slogan, CARD.x, CARD.sloganY2, tS + 0.3, sloPig, { wet: [T_SLOGAN - 0.6, T_SLOGAN + 2.6, T_TILT - 0.05], conc: 0.6, tFlow: T_TILT + 0.4 });
    {
      const mailN = NODES[7];
      const pts = curve(mailN.x + mailN.s * 0.5, mailN.y - mailN.s * 0.2, CARD.x - 10, CARD.sloganY2 + 3, -0.08, 0.06);
      const v = pts[pts.length - 1][2] / 0.5;
      L1.push({
        bbox: bboxPts(pts, 10), warp: 1.1, shape: (g) => strokeTaper(g, pts, 5, 4),
        drops: train(pts, tS + 0.3 - 0.5, v), pig: mix(P.violet, P.rose, 0.4), v: 80, tFlow: T_SLOGAN + 0.9, tau: 0.12, conc: 0.75, rim: 0.9, dryFade: 0.7,
        wet: [T_SLOGAN - 0.6, T_SLOGAN + 1.6, T_TILT - 0.2], merge: true, preWet: 0.6, gloss: 0.6,
      });
    }

    // ---- bar 6: the tilt. Streams run downhill (to the right) from the wet icons into the logo; drops
    // rain into the other letters on the 8ths.
    const logoX = CARD.x - 2;
    const LOGO = SIZES.logo;
    const logoW = measure(TEXT.logo, LOGO);
    const cyanDeep = mix(P.cyan, P.cerulean, 0.55);
    const sigPig = (x) => {
      const u = clamp((x - logoX) / logoW, 0, 1);
      return u < 0.5 ? mix(P.magenta, P.bviolet, u * 2) : mix(P.bviolet, cyanDeep, (u - 0.5) * 2);
    };
    const letters = [];
    const NL = TEXT.logo.length;
    for (let k = 0; k < NL; k++) {
      const ch = TEXT.logo[k];
      const w = measure(ch, LOGO);
      letters.push({ ch, cx: logoX + measure(TEXT.logo.slice(0, k), LOGO) + w / 2, w });
    }
    const tStream0 = T_TILT + 0.45;
    // the sheet rolls clockwise, so down-right is downhill: three uneven rivulets converge into the «A»
    const STREAMS = [
      { from: [NODES[2].x + 66, 138], to: [letters[0].cx - 30, 196], w: 11, src: 2, bend: 0.06 },
      { from: [NODES[2].x + 64, 204], to: [letters[0].cx - 58, 262], w: 8, src: 2, bend: -0.05 },
      { from: [NODES[6].x + 40, 262], to: [letters[0].cx - 82, 292], w: 13, src: 6, bend: 0.08 },
    ];
    const streamHits = [];
    STREAMS.forEach((st, k) => {
      // a rivulet: wobbly, with beads where it hesitates
      const base = curve(st.from[0], st.from[1], st.to[0], st.to[1], st.bend, -st.bend * 0.5);
      const pts = base.map((p, q) => [p[0], p[1] + 5 * WC.vnoise(q / 18, k, 7) + 2 * WC.vnoise(q / 5, k, 8), p[2]]);
      const t0 = tStream0 + k * 0.12;
      const v = 330 + k * 40;
      const [pa, pb] = NODES[st.src].pigs.map((q) => P[q]);
      LR.push({
        bbox: bboxPts(pts, 14), warp: 1.0, warpScale: 6,
        shape: (g) => {
          for (let q = 1; q < pts.length; q++) {
            const u = q / pts.length;
            g.lineWidth = Math.max(3.5, st.w * (0.35 + 0.65 * u) * (0.6 + 0.8 * Math.max(0, WC.vnoise(q / 9, k, 9))));
            g.beginPath(); g.moveTo(pts[q - 1][0], pts[q - 1][1]); g.lineTo(pts[q][0], pts[q][1]); g.stroke();
          }
        },
        drops: train(pts, t0, v), pig: (x) => mix(pa, pb, clamp((x - st.from[0]) / 300, 0, 1)), v: 120, sigma: 0.9, tFlow: tEnd(pts, t0, v) + 0.3, tau: 0.1,
        conc: 0.85, burst: 0.3, srcBoost: 0, rim: 1.4, gran: 0.2, bead: 2.6, preWet: 0.25, gloss: 0.6, dryFade: 0.8,
        wet: [T_TILT, T_CARD + 0.4, T_CARD + 2.2],
      });
      streamHits.push(tEnd(pts, t0, v));
    });
    const logoDrops = [];
    const tA = Math.min(...streamHits);
    logoDrops.push([letters[0].cx - 40, CARD.logoY - 50, tA, 6]);
    // one drop per remaining letter, on 16ths after beat 2 of bar 6. LOGO_RAIN matches the plips in
    // src/music.js (bar 6) for a 7-letter logo; any other length is spread over the same 7 sixteenths.
    const LOGO_RAIN = [0, 2, 4, 5, 6, 7];
    const rainT = [];
    for (let k = 1; k < NL; k++) rainT.push(at(5, 2) + (NL - 1 === LOGO_RAIN.length ? LOGO_RAIN[k - 1] : Math.round(((k - 1) / Math.max(1, NL - 2)) * 7)) * S16);
    for (let k = 1; k < NL; k++) {
      const t = rainT[k - 1];
      const y = CARD.logoY - 16; // the drop lands at the letter's foot; the colour climbs
      logoDrops.push([letters[k].cx, y, t, 6]);
      drops.push({ x: letters[k].cx, y, t, r: 16, col: k / NL < 0.4 ? 'magenta' : k / NL < 0.7 ? 'bviolet' : 'cyan' });
    }
    L3.push({
      bbox: [logoX - 12, CARD.logoY - LOGO, logoX + logoW + 14, CARD.logoY + 28], warp: 1.3, warpScale: 7,
      shape: (g) => { g.font = `700 ${LOGO}px Futura`; g.textBaseline = 'alphabetic'; g.fillText(TEXT.logo, logoX, CARD.logoY); },
      drops: logoDrops, snap: true, sweep: { t0: tA + 0.2, x0: logoX, v: 520 },
      pig: (x, y) => sigPig(x + 70 * WC.vnoise(x / 45, y / 45, 41)),
      v: 260, sigma: 1.15, merge: true, conc: 1.0, burst: 0.5, srcBoost: 0.8, srcFall: 0.3, rim: 1.7, gran: 0.3, pool: 0.5, bead: 1.4, shimmer: 0.04,
      tFlow: T_CARD + 0.8, featherStop: 0.2, preWet: 0.7, gloss: 0.8,
      wet: [T_TILT + 0.2, 99, 100],
      backruns: [{ x: letters[2].cx, y: CARD.logoY - 70, t: T_CARD + 0.6, v: 45, stop: T_CARD + 1.5, sigma: 1.9 }],
    });

    // ---- bar 7: a running drop draws one looping flight line under the links and blooms into a
    // paper plane (three facets, pale washes with dark wet edges); the links fill from their threads.
    const plane = { x: 1028, y: CARD.tgY - 30, ang: -0.35, s: 0.78 };
    {
      const K = [[790, 790], [836, 806], [858, 870], [900, 940], [980, 990], [1090, 1000], [1160, 950], [1140, 885], [1070, 880], [1010, 930], [960, 900], [962, 868], [978, 856], [988, 852]];
      const raw = [];
      for (let q = 1; q < K.length - 2; q++) {
        const [p0, p1, p2, p3] = [K[q - 1], K[q], K[q + 1], K[q + 2]];
        for (let m = 0; m < 40; m++) {
          const u = m / 40, u2 = u * u, u3 = u2 * u;
          const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
          raw.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1])]);
        }
      }
      const pts = resample(raw);
      const t0 = T_CARD + 0.02;
      const v = pts[pts.length - 1][2] / 0.72;
      LR.push({
        bbox: bboxPts(pts, 10), warp: 0.8,
        shape: (g) => strokeTaper(g, pts, 4.6, 3.2),
        drops: train(pts, t0, v), pig: (x) => mix(P.cerulean, P.bviolet, clamp((x - 830) / 800, 0, 1)), v: 120, sigma: 0.8, tFlow: t0 + 1.0, tau: 0.06,
        conc: 0.8, burst: 0.3, srcBoost: 0, rim: 1.3, bead: 2.4, preWet: 0.3, gloss: 0.6, dryFade: 0.4, wet: [t0 - 0.3, T_LOOP - 1.0, T_LOOP - 0.1],
      });
      const tp = tEnd(pts, t0, v) + 0.03;
      const ca = Math.cos(plane.ang), sa = Math.sin(plane.ang);
      const Pt = (u0, w0) => { const u = u0 * plane.s, w = w0 * plane.s; return [plane.x + u * ca - w * sa, plane.y + u * sa + w * ca]; };
      const poly = (g, p) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (const q of p.slice(1)) g.lineTo(q[0], q[1]); g.closePath(); g.fill(); };
      const wingA = [Pt(95, -1.5), Pt(-86, -56), Pt(-60, -3.5)];
      const wingB = [Pt(95, 2), Pt(-60, 3), Pt(-82, 44)];
      const keel = [Pt(84, 6), Pt(-52, 8), Pt(-44, 24)];
      const pbox = [plane.x - 100, plane.y - 100, plane.x + 100, plane.y + 100];
      const face = (L, shape, at0, pg, conc) => L.push({
        bbox: pbox, warp: 1.6, warpScale: 6, shape: (g) => poly(g, shape), drops: [[at0[0], at0[1], 0, 4]], snap: true, bleed: 0.06, bleedDur: 0.25,
        pig: pg, v: 200, tFlow: 0, conc, burst: 0.6, srcBoost: 0.7, pool: 0.5, rim: 2.6, gran: 0.25, preWet: 0.3, gloss: 0.6, wet: [0, 99, 100],
      });
      const tA2 = tp, tB2 = tp + S16 * 0.5, tC2 = tp + S16;
      face(L3, wingA, Pt(-58, -10), (x, y) => mix(P.cerulean, P.cyan, 0.3 + 0.3 * WC.vnoise(x / 25, y / 25, 3)), 0.34);
      face(L2, wingB, Pt(-56, 10), (x, y) => mix(P.lilac, P.bviolet, 0.4), 0.34);
      face(LR, keel, Pt(-46, 14), mix(P.bviolet, P.ultramarine, 0.4), 0.55);
      // timings (the face helper keeps one signature; set them here)
      const setT = (L, t) => { const R = L[L.length - 1]; R.drops[0][2] = t; R.tFlow = t + 0.6; R.wet = [t - 0.3, 99, 100]; };
      setT(LR, tC2); setT(L2, tB2); setT(L3, tA2);
      drops.push({ x: Pt(-58, -10)[0], y: Pt(-58, -10)[1], t: tp, r: 0, col: 'cyan', splashOnly: true });
      INFO = INFO || {};
      INFO.tp = tp;
    }
    const tTg = at(6, 1.5);
    wordThread(L3, TEXT.tg, SIZES.tg, CARD.x + 152, CARD.tgY, tTg, (x, y) => mix(P.bviolet, P.ultramarine, 0.25 + 0.35 * clamp((x - CARD.x - 152) / 640, 0, 1)), {
      wet: [tTg - 0.6, 99, 100], conc: 0.82, thread0: 4, thread1: 3,
    });
    drops.push({ x: CARD.x + 144, y: CARD.tgY + 3, t: tTg, r: 13, col: 'bviolet' });
    const tSite = at(6, 1);
    wordThread(L3, TEXT.site, SIZES.site, CARD.x, CARD.siteY, tSite, (x, y) => mix(P.magenta, P.bviolet, 0.45 + 0.4 * clamp((x - CARD.x) / 720, 0, 1)), {
      wet: [tSite - 0.6, 99, 100], conc: 0.95, thread0: 4, thread1: 3,
    });
    drops.push({ x: CARD.x - 8, y: CARD.siteY + 3, t: tSite, r: 13, col: 'magenta' });

    INFO = Object.assign(INFO || {}, { drops, flowers, buds, grains, NODES, letters });
    DEF = {
      seed: 'aixenix-ad-06-watercolor',
      layers: [
        { name: 'halo', regions: L0, rimW: 6, mixWarp: 30, mixR: 10 },
        { name: 'hub', regions: LH, rimW: 5.5 },
        { name: 'stems', regions: L1, rimW: 3.6 },
        { name: 'petals', regions: L2, rimW: 3.8 },
        { name: 'glaze', regions: L3, rimW: 3.8, mixWarp: 14 },
        { name: 'runs', regions: LR, rimW: 2.6 },
        { name: 'rainA', regions: LA, rimW: 5 },
        { name: 'rainB', regions: LB, rimW: 5 },
      ],
    };
    return DEF;
  }

  // ------------------------------------------------------------------ overlay: the falling drops
  const DROPCOL = {
    violet: [[236, 222, 252], [184, 150, 232], [118, 76, 196]],
    magenta: [[252, 222, 246], [244, 140, 222], [210, 40, 180]],
    bviolet: [[240, 220, 252], [200, 140, 246], [150, 40, 220]],
    cyan: [[220, 250, 252], [140, 226, 240], [20, 170, 200]],
    teal: [[214, 244, 240], [120, 210, 200], [20, 140, 130]],
    cerulean: [[220, 236, 250], [140, 190, 232], [50, 120, 190]],
    gold: [[252, 240, 210], [244, 204, 120], [214, 140, 30]],
    rose: [[250, 220, 232], [232, 140, 180], [196, 50, 110]],
  };
  const FALL = 0.3;
  // a falling drop, seen from above: it slides in toward its landing point (perspective: near the lens
  // it sits farther from the centre of view), shrinking, a transparent lens trailing a short streak;
  // its tinted shadow tightens under it. On impact it flattens and throws a few uneven satellites.
  function drawDrops(g, T, sheet) {
    if (!INFO) return;
    const cam = camera(T);
    for (const d of INFO.drops) {
      if (T < d.t - FALL || T > d.t + 0.22) continue;
      const cols = DROPCOL[d.col] || DROPCOL.violet;
      const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
      const seed = Math.round(d.t * 1000) + Math.round(d.x);
      if (T < d.t && !d.splashOnly) {
        // first only its shadow, tightening on the landing point; in the last four frames the drop itself
        // streaks in: a 3:1 teardrop of half-clear water that bends the paper under it (no highlight)
        const u = clamp((T - (d.t - FALL)) / FALL, 0, 1);
        const e = u * u;
        g.save();
        const sr = 6 + 30 * (1 - e);
        const sg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, sr);
        sg.addColorStop(0, rgba(cols[2], 0.06 + 0.22 * e));
        sg.addColorStop(1, rgba(cols[2], 0));
        g.fillStyle = sg;
        g.beginPath(); g.arc(d.x, d.y, sr, 0, TAU); g.fill();
        const late = (d.t - T) * 30; // frames to impact
        if (late <= 4) {
          let dx = d.x - cam.cx, dy = d.y - cam.cy;
          const dl = Math.hypot(dx, dy) || 1;
          dx /= dl; dy /= dl;
          const head = 4 + late * (16 + 0.04 * dl); // distance of the head from the landing point
          const hx = d.x + dx * head, hy = d.y + dy * head;
          const r = (d.first ? 13 : 10) + late * 1.2;
          const len = r * 3;
          const ang = Math.atan2(dy, dx);
          g.translate(hx, hy);
          g.rotate(ang);
          g.beginPath();
          g.moveTo(-r, 0);
          g.bezierCurveTo(-r, -r * 1.05, r * 0.6, -r * 0.7, len, 0);
          g.bezierCurveTo(r * 0.6, r * 0.7, -r, r * 1.05, -r, 0);
          g.closePath();
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.clip();
          g.globalAlpha = 0.55;
          const q = 1.25;
          g.drawImage(sheet, hx - len - r, hy - len - r, 2 * (len + r), 2 * (len + r), hx - (len + r) * q, hy - (len + r) * q, 2 * (len + r) * q, 2 * (len + r) * q);
          g.globalCompositeOperation = 'multiply';
          g.globalAlpha = 0.5;
          g.fillStyle = rgba(cols[1], 1);
          g.fillRect(hx - len - r, hy - len - r, 2 * (len + r), 2 * (len + r));
        }
        g.restore();
      } else if (T >= d.t) {
        const u = (T - d.t) / 0.22;
        g.save();
        const fr = 6 + 16 * Math.sqrt(u);
        const fg = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, fr);
        fg.addColorStop(0, rgba(cols[2], 0.45 * (1 - u)));
        fg.addColorStop(1, rgba(cols[2], 0));
        g.fillStyle = fg;
        g.beginPath(); g.arc(d.x, d.y, fr, 0, TAU); g.fill();
        const ns = d.r >= 15 ? 5 : 3;
        for (let k = 0; k < ns; k++) {
          const a = WC.hh(k, 1, seed) * TAU;
          const rr2 = 10 + (20 + 90 * WC.hh(k, 2, seed)) * Math.sqrt(u);
          const sz = (1.2 + 2.2 * WC.hh(k, 3, seed)) * (1 - u * 0.6);
          g.globalAlpha = (1 - u) * 0.7;
          g.fillStyle = rgba(cols[2], 1);
          g.beginPath(); g.ellipse(d.x + Math.cos(a) * rr2, d.y + Math.sin(a) * rr2, sz * 1.8, sz, a, 0, TAU); g.fill();
        }
        g.restore();
      }
    }
    // salt grains on the damp hub
    if (T > at(2, 1) - 0.15 && T < at(2, 1) + 1.6) {
      const a = sstep(at(2, 1) - 0.15, at(2, 1) + 0.02, T) * (1 - sstep(at(2, 1) + 0.6, at(2, 1) + 1.6, T));
      if (a > 0) {
        g.save();
        INFO.grains.forEach((gr, k) => {
          const s = 1.1 + 1.1 * WC.hh(k, 7, 71);
          g.globalAlpha = a * 0.3;
          g.fillStyle = 'rgba(60, 36, 100, 1)';
          g.beginPath(); g.arc(gr[0] + 0.8, gr[1] + 0.9, s, 0, TAU); g.fill();
          g.globalAlpha = a * 0.85;
          g.fillStyle = 'rgba(255, 253, 248, 1)';
          g.beginPath(); g.arc(gr[0], gr[1], s, 0, TAU); g.fill();
        });
        g.restore();
      }
    }
  }

  // ------------------------------------------------------------------ light: glints on wet paint
  function sheen(T) {
    const bands = [{ c: 0.6 * 2184, w: 320, a: 0.06 }];
    // the opening: a glint slides across the wet hook so the water letters can be read before the drop
    if (T < 1.2) bands.push({ c: 0.8 * (HOOK.x - 160 + 900 * sstep(-0.2, 1.1, T)) + 0.6 * HOOK.y, w: 120, a: 0.2 });

    // from the card on: a narrow glint crosses the wet type once a bar
    if (T > T_TILT && T < T_CARD + 0.2) bands.push({ c: 500 + 1700 * sstep(T_TILT, T_CARD, T), w: 160, a: 0.12 * (1 - sstep(T_CARD - 0.3, T_CARD + 0.2, T)) });
    if (T > T_TILT + 1.5) {
      let f = ((T - T_LOOP) / BAR) % 1;
      if (f < 0) f += 1;
      bands.push({ c: 560 + f * 1560, w: 115, a: 0.17 * sstep(T_TILT + 1.5, T_CARD + 0.4, T) }); // u 560..2120: off all wet type at both ends
    }
    return { bands, base: 0.025 };
  }

  // ------------------------------------------------------------------ camera: close on the hook, back to the sheet, the tilt
  // keys: [T, zoom, centre x, centre y] (sheet px). Between keys an S-curve. Every key with zoom >= 1
  // after the opening sits fully on the sheet (no thin desk strips at the frame edge).
  const CAMKEYS = [
    [0, 2.0, 390, 900], [1.9, 2.0, 390, 900], [3.7, 1.42, 676, 620], [5.2, 1.0, 960, 540], [6.15, 1.0, 960, 540],
    [6.85, 1.7, 620, 318], [7.75, 1.7, 620, 318], [8.45, 1.25, 1152, 540], [9.95, 1.25, 1152, 540], [10.6, 1.0, 960, 540],
  ];
  function camera(T) {
    let k = 0;
    while (k < CAMKEYS.length - 1 && T >= CAMKEYS[k + 1][0]) k++;
    let z, cx, cy;
    if (k >= CAMKEYS.length - 1) [, z, cx, cy] = CAMKEYS[CAMKEYS.length - 1];
    else {
      const a = CAMKEYS[k], b = CAMKEYS[k + 1];
      const u0 = clamp((T - a[0]) / (b[0] - a[0]), 0, 1);
      const u = u0 * u0 * (3 - 2 * u0);
      // zoom eases in log space so push-ins feel even
      z = Math.exp(Math.log(a[1]) + (Math.log(b[1]) - Math.log(a[1])) * u);
      cx = a[2] + (b[2] - a[2]) * u;
      cy = a[3] + (b[3] - a[3]) * u;
    }
    const tilt = sstep(T_TILT, T_TILT + 0.55, T) * (1 - sstep(T_CARD - 0.55, T_CARD - 0.05, T));
    z -= 0.2 * tilt;
    return { z, cx, cy, tilt };
  }

  let SHEET = null;
  // the tilted sheet, warped exactly on the CPU: the right side drops away (perspective about the left
  // edge), a slight turn, the dark desk and the sheet's shadow around it
  let WARP = null;
  function tiltWarp(cam) {
    const W = 1920, H = 1080;
    if (!WARP) {
      const c = FILM.makeCanvas(W, H);
      const g = c.getContext('2d', { willReadFrequently: true });
      WARP = { c, g, img: g.createImageData(W, H) };
      WARP.o32 = new Uint32Array(WARP.img.data.buffer);
      WARP.desk = new Uint32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.min(1, Math.hypot(x - 960, y - 540) / 1150);
        const r = 26 - 16 * d, gg = 12 - 12 * d, b = 40 - 22 * d;
        WARP.desk[y * W + x] = 0xff000000 | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
      }
    }
    const src = SHEET.g.getImageData(0, 0, W, H).data;
    const o32 = WARP.o32, desk = WARP.desk;
    const k = 0.22 * cam.tilt, cyS = 540;
    const L = Math.log(1 + k);
    const off = (W - (W / k) * L) * 0.5;
    const rot = 0.19 * cam.tilt, cr = Math.cos(-rot), sr = Math.sin(-rot);
    const z = cam.z;
    for (let Y = 0; Y < H; Y++) {
      for (let X = 0; X < W; X++) {
        // screen -> camera space -> unrotated tilted space -> sheet
        const ax = (X - 960) / z + cam.cx - 960, ay = (Y - 540) / z + cam.cy - 540;
        const u = ax * cr - ay * sr + 960, v = ax * sr + ay * cr + 540;
        const x = (W / k) * (Math.exp((k * (u - off)) / W) - 1);
        const f = 1 / (1 + (k * x) / W);
        const y = cyS + (v - cyS) / f;
        const i = Y * W + X;
        if (x < 0 || y < 0 || x > W - 1.001 || y > H - 1.001) {
          // the shadow of the sheet on the desk (offset down-right)
          const xs = (W / k) * (Math.exp((k * (u - 16 - off)) / W) - 1);
          const ys = cyS + (v - 20 - cyS) * (1 + (k * xs) / W);
          const inS = xs >= 0 && ys >= 0 && xs <= W && ys <= H;
          const dc = desk[i];
          o32[i] = inS ? 0xff000000 | ((((dc >> 16) & 255) * 0.45) << 16) | ((((dc >> 8) & 255) * 0.45) << 8) | ((dc & 255) * 0.45) : dc;
          continue;
        }
        const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
        const p = (y0 * W + x0) * 4, q = p + W * 4;
        const w00 = (1 - fx) * (1 - fy), w10 = fx * (1 - fy), w01 = (1 - fx) * fy, w11 = fx * fy;
        const r = src[p] * w00 + src[p + 4] * w10 + src[q] * w01 + src[q + 4] * w11;
        const g2 = src[p + 1] * w00 + src[p + 5] * w10 + src[q + 1] * w01 + src[q + 5] * w11;
        const b = src[p + 2] * w00 + src[p + 6] * w10 + src[q + 2] * w01 + src[q + 6] * w11;
        o32[i] = 0xff000000 | ((b + 0.5) << 16) | ((g2 + 0.5) << 8) | (r + 0.5);
      }
    }
    WARP.g.putImageData(WARP.img, 0, 0);
    return WARP.c;
  }
  function frame(ctx, T) {
    const pnt = WC.build('ad-06', def);
    const Tp = Math.min(T, T_LOOP); // the paint is finished at the loop bar; only light moves after
    const buf = WC.render(null, pnt, Tp, { sheen: sheen(T), phase: ((T - T_LOOP) / BAR) * TAU });
    if (!SHEET) {
      const c = FILM.makeCanvas(1920, 1080);
      SHEET = { c, g: c.getContext('2d', { willReadFrequently: true }) };
    }
    const g = SHEET.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.drawImage(buf, 0, 0);
    drawDrops(g, Tp, buf);
    const cam = camera(T);
    ctx.save();
    if (cam.z < 1 || cam.tilt > 0 || cam.cx - 960 / cam.z < 0 || cam.cy + 540 / cam.z > 1080) {
      // the desk under the sheet
      const bg = ctx.createRadialGradient(960, 540, 200, 960, 540, 1150);
      bg.addColorStop(0, 'rgba(26, 12, 40, 1)');
      bg.addColorStop(1, 'rgba(10, 0, 18, 1)');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1920, 1080);
    }
    ctx.translate(960, 540);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.cx, -cam.cy);
    if (cam.tilt <= 0) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fillRect(12, 16, 1920, 1080);
      ctx.drawImage(SHEET.c, 0, 0);
    } else {
      ctx.restore();
      ctx.save();
      ctx.drawImage(tiltWarp(cam), 0, 0, 1920, 1080);
    }
    ctx.restore();
  }

  FILM.cast = { TEXT, SIZES, def, frame, camera, sheen, at, BEAT, BAR, T_DROP, T_HUB, T_SLOGAN, T_TILT, T_CARD, T_LOOP, info: () => INFO };
})();
