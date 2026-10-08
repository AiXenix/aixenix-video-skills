/*
 * 00-phys.js : the machine's physics, solved once at load (pure math, no THREE, no time state).
 *
 * THE LAW: one touch, then everything happens by itself. Every event below is caused by the one
 * before it, and every impact lands on the 16th-note grid because the MACHINE IS BUILT FROM THE
 * SCORE: domino gaps, xylophone key positions, lever inertia, catapult and balance trims are all
 * solved here so that the physics, integrated with a fixed step, hits the music's grid.
 *
 *   units: cm, seconds; y up; world desk top at y = 0
 *   gravity G = 245 cm/s^2 = 9.81 m/s^2 seen at 2x slow motion (a macro "high-speed" look)
 *
 * Exposes FILM.CR.P (poses as pure functions of global time T) and FILM.CR.EV (sound events).
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const FILM = (root.FILM = root.FILM || {});
  const CR = (FILM.CR = FILM.CR || {});

  // ------------------------------------------------------------------ grid
  const BPM = 112.5;
  const S16 = 60 / BPM / 4; // 0.1333 s = 4 frames at 30 fps
  const tn = (n) => n * S16;
  const G = 245;
  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  CR.BPM = BPM; CR.S16 = S16; CR.tn = tn; CR.G = G; CR.BARS = 9; CR.DUR = 144 * S16;

  // ------------------------------------------------------------------ the score that builds the machine
  // melody played by the marble on the xylophone ramp: [16th index, note]
  const MELODY = [
    [26, 'A4'], [28, 'D5'], [30, 'E5'], [32, 'F#5'], [34, 'A5'], [36, 'F#5'], [37, 'E5'], [38, 'D5'],
    [40, 'E5'], [42, 'F#5'], [44, 'A5'], [45, 'B5'], [46, 'D6'],
  ];
  const N = {
    tap: 8, heroHit: 11, lineLast: 22, marble: 24, tray: 48, stamp: 56, coin: 60, button: 64, plane: 68,
    phone: 84, trigger: 88, stick: 90, row0: 96, roll: 105,
  };
  CR.N = N; CR.MELODY = MELODY;
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(n) { const m = /^([A-G])(#|b)?(\d)$/.exec(n); return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
  CR.midi = midi;

  // ------------------------------------------------------------------ 2D domino model (u along the fall, y up)
  // A domino is a box (height h, thickness t) standing with its FRONT-bottom edge on the pivot p.
  function corners(p, th, h, t) {
    const c = Math.cos(th), s = Math.sin(th);
    const L = [[-t, 0], [0, 0], [0, h], [-t, h]];
    return L.map(([lx, ly]) => [p + lx * c + ly * s, -lx * s + ly * c]);
  }
  function satOverlap(A, B) {
    const polys = [A, B];
    for (const P of polys) {
      for (let i = 0; i < 4; i++) {
        const a = P[i], b = P[(i + 1) % 4];
        const nx = -(b[1] - a[1]), ny = b[0] - a[0];
        let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
        for (const q of A) { const d = q[0] * nx + q[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
        for (const q of B) { const d = q[0] * nx + q[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
        if (a1 <= b0 + 1e-7 || b1 <= a0 + 1e-7) return false;
      }
    }
    return true;
  }
  // largest angle of domino i (behind) that does not cut domino j (in front, at angle thj)
  function lean(di, dj, thj) {
    const B = corners(dj.p, thj, dj.h, dj.t);
    let lo = 0, hi = PI / 2;
    if (!satOverlap(corners(di.p, hi, di.h, di.t), B)) return hi;
    for (let k = 0; k < 26; k++) {
      const m = (lo + hi) / 2;
      if (satOverlap(corners(di.p, m, di.h, di.t), B)) hi = m; else lo = m;
    }
    return lo;
  }
  // distance from i's pivot to a standing j's back face when i (at angle th) just touches j
  function gapFor(hi, hj, th) { return hi * Math.cos(th) <= hj ? hi * Math.sin(th) : hj * Math.tan(th); }

  const DT = 1 / 2400;
  // free hinged fall from (th0, w0): returns a sampled table {t0, dt, th[]} up to tEnd (floor bounces included)
  function fall(h, t, th0, w0, t0, tEnd, opt) {
    opt = opt || {};
    const k = G / ((h * h + t * t) / 3);
    const th = [], om = [];
    let a = th0, w = w0, bounced = 0;
    const steps = Math.ceil((tEnd - t0) / DT);
    for (let i = 0; i <= steps; i++) {
      th.push(a); om.push(w);
      const acc = k * (-t / 2 * Math.cos(a) + h / 2 * Math.sin(a));
      w += acc * DT; a += w * DT;
      if (a >= PI / 2) { a = PI / 2 - (a - PI / 2) * 0.2; w = -Math.abs(w) * (bounced < 3 ? 0.22 : 0); bounced++; if (Math.abs(w) < 0.2) { w = 0; a = PI / 2; } }
      if (a < 0 && !opt.allowBack) { a = 0; w = 0; }
    }
    return { t0, dt: DT, th, om };
  }
  function sample(tab, T) {
    if (T <= tab.t0) return { th: tab.th[0], om: tab.om[0] };
    const f = (T - tab.t0) / tab.dt;
    const i = Math.floor(f);
    if (i >= tab.th.length - 1) return { th: tab.th[tab.th.length - 1], om: 0 };
    const r = f - i;
    return { th: lerp(tab.th[i], tab.th[i + 1], r), om: lerp(tab.om[i], tab.om[i + 1], r) };
  }

  /*
   * A chain: dominoes d[0..n-1] (h, t). Domino 0 starts at its own time (a finger flick, or a hit
   * from outside with w0); domino k is hit at hits[k]. Two things are SOLVED so every hit lands on
   * the grid: the gap in front of each domino (from the angle it has reached at the next hit time)
   * and, where spec.gap[k] asks for a regular spacing, the launch speed of domino k-1 that makes
   * exactly that gap (reported back as the transfer coefficient e[k-1], kept inside 0.6..1.3).
   */
  function thetaAfter(h, t, th0, w0, dur) {
    const k = G / ((h * h + t * t) / 3);
    let a = th0, w = w0;
    const steps = Math.round(dur / DT);
    for (let i = 0; i < steps; i++) { w += k * (-t / 2 * Math.cos(a) + h / 2 * Math.sin(a)) * DT; a += w * DT; if (a < 0) { a = 0; w = 0; } if (a > PI / 2) return PI / 2; }
    return a;
  }
  function buildChain(spec) {
    const d = spec.d.map((q) => ({ h: q.h, t: q.t, p: 0 }));
    const n = d.length;
    const hits = spec.hits.slice();
    const gapT = spec.gap || [];
    const w0s = new Array(n).fill(0);
    const start0 = spec.push ? spec.push.t0 : spec.T0;
    // launch speed of domino k (hit at tk) that reaches gap g to domino k+1 at tk1
    const solveW = (k, tk, tk1, g, th0) => {
      let lo = 0.0, hi = 60;
      for (let i = 0; i < 50; i++) {
        const m = (lo + hi) / 2;
        const th = thetaAfter(d[k].h, d[k].t, th0, m, tk1 - tk);
        if (gapFor(d[k].h, d[k + 1].h, th) < g) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    };
    // domino 0
    let push = null;
    if (spec.push) {
      // the finger's flick: constant angular acceleration for push.dur up to the release speed W
      const P = spec.push;
      const relT = P.t0 + P.dur;
      let W = P.w;
      if (gapT[1] != null) {
        let lo = 0.5, hi = 40;
        for (let i = 0; i < 50; i++) {
          const m = (lo + hi) / 2;
          const th = thetaAfter(d[0].h, d[0].t, 0.5 * m * P.dur, m, hits[1] - relT);
          if (gapFor(d[0].h, d[1].h, th) < gapT[1]) lo = m; else hi = m;
        }
        W = (lo + hi) / 2;
      }
      push = { t0: P.t0, dur: P.dur, W };
    } else {
      w0s[0] = gapT[1] != null ? solveW(0, start0, hits[1], gapT[1], 0) : spec.w0;
    }
    const tabs = [];
    const mk = (k) => {
      if (k === 0 && push) {
        const k0 = Math.round(push.dur / DT);
        const th = [], om = [];
        for (let i = 0; i <= k0; i++) { const u = i * DT; th.push(0.5 * (push.W / push.dur) * u * u); om.push((push.W / push.dur) * u); }
        const rest = fall(d[0].h, d[0].t, th[k0], om[k0], push.t0 + k0 * DT, spec.tEnd);
        return { t0: push.t0, dt: DT, th: th.concat(rest.th.slice(1)), om: om.concat(rest.om.slice(1)) };
      }
      return fall(d[k].h, d[k].t, 0, w0s[k], k === 0 ? start0 : hits[k], spec.tEnd);
    };
    tabs.push(mk(0));
    const gaps = [], e = [null];
    for (let k = 1; k < n; k++) {
      const s = sample(tabs[k - 1], hits[k]);
      const g = gapFor(d[k - 1].h, d[k].h, s.th);
      gaps.push(g);
      d[k].p = d[k - 1].p + g + d[k].t;
      if (k < n - 1 && gapT[k + 1] != null) w0s[k] = solveW(k, hits[k], hits[k + 1], gapT[k + 1], 0);
      else w0s[k] = (spec.e && spec.e[k] != null ? spec.e[k] : 0.9) * s.om;
      e.push(w0s[k] / Math.max(1e-6, s.om));
      tabs.push(mk(k));
    }
    // optional tail: the last domino's fall is cut short by an obstacle (handled by the caller)
    const self = {
      d, tabs, hits, gaps, n, e, push, lastCap: null,
      angles(T) {
        const out = new Array(n);
        // the last domino is free once hit; everyone before leans on the one ahead once they touched it
        for (let k = n - 1; k >= 0; k--) {
          const started = k === 0 ? T >= tabs[0].t0 : T >= hits[k];
          if (!started) { out[k] = 0; continue; }
          let free = sample(tabs[k], T).th;
          if (k === n - 1 && self.lastCap != null) free = Math.min(free, self.lastCap);
          if (k < n - 1 && T >= hits[k + 1]) out[k] = Math.min(free, lean(d[k], d[k + 1], out[k + 1]));
          else out[k] = free;
        }
        return out;
      },
    };
    return self;
  }

  // ================================================================== LAYOUT (cm)
  const L = (CR.L = {});
  L.riser = { x0: 0, x1: 75, z0: -48, z1: -32, y: 12, th: 1.8 };
  L.lineZ = -40;
  L.heroX = 66; // hero domino pivot (front-bottom edge), falls toward -x
  L.dom = { h: 4.8, w: 2.4, t: 0.75 };
  L.hero = { h: 9.0, w: 4.4, t: 1.35 };

  // ------------------------------------------------------------------ 1. the tap and the «заявка» line
  const LINE_N = 13;
  const lineSpec = {
    d: [{ h: L.hero.h, t: L.hero.t }].concat(Array.from({ length: LINE_N }, () => ({ h: L.dom.h, t: L.dom.t }))),
    push: { t0: tn(N.tap), dur: 0.12 },
    hits: [null].concat(Array.from({ length: LINE_N }, (_, i) => tn(N.heroHit + i))),
    gap: [null, 2.6].concat(Array.from({ length: LINE_N - 1 }, () => 2.45)),
    tEnd: tn(40),
  };
  const line = buildChain(lineSpec);
  CR.line = line;
  // the last domino's top edge knocks the marble off a brass tee at tn(24)
  const lastL = line.d[LINE_N];
  const sM = sample(line.tabs[LINE_N], tn(N.marble));
  const RM = 0.8; // marble radius
  const railY = 0.25; // rail height above the riser top
  const TEE = (CR.TEE = {});
  {
    const cU = lastL.p + lastL.h * Math.sin(sM.th), cY = lastL.h * Math.cos(sM.th); // top-front corner (u, y over the riser)
    TEE.dy = 0.35; // the corner meets the marble a little under its centre: it pops up and forward
    const dxm = Math.sqrt(RM * RM - TEE.dy * TEE.dy);
    TEE.u = cU + dxm; TEE.cy = cY + TEE.dy;
    TEE.cupR = 0.55; TEE.cupTop = TEE.cy - Math.sqrt(RM * RM - TEE.cupR * TEE.cupR);
    TEE.x = L.heroX - TEE.u;
    // impulse along the contact normal (light glass marble, heavier domino: x1.25)
    const vcU = sM.om * lastL.h * Math.cos(sM.th), vcY = -sM.om * lastL.h * Math.sin(sM.th);
    const nU = dxm / RM, nY = TEE.dy / RM;
    const vn = (vcU * nU + vcY * nY) * 1.25;
    TEE.vu = vn * nU; TEE.vy = vn * nY;
    // after the knock the domino comes to rest against the tee's cup rim
    line.lastCap = Math.atan2(TEE.u - TEE.cupR - lastL.p, TEE.cupTop);
    // flight from the tee down onto the rails (marble centre railY + RM over the riser)
    const dh = TEE.cy - (railY + RM);
    TEE.tf = (TEE.vy + Math.sqrt(TEE.vy * TEE.vy + 2 * G * dh)) / G;
    TEE.uLand = TEE.u + TEE.vu * TEE.tf;
  }
  L.marbleStartX = L.heroX - TEE.uLand;

  // ------------------------------------------------------------------ 2. marble on the xylophone ramp
  // it lands on two brass rails and rolls (5/7 g sin a) on; the bars sit where the marble is at each note
  const M = (CR.M = {});
  M.v0 = TEE.vu * 0.85; M.a = 2.5;
  M.t0 = tn(N.marble) + TEE.tf;
  M.slope = Math.asin(M.a / ((5 / 7) * G));
  M.x0 = L.marbleStartX; M.y0 = L.riser.y + railY; // rail top at the start (marble rests on it)
  const sAt = (T) => { const u = Math.max(0, T - M.t0); return M.v0 * u + 0.5 * M.a * u * u; };
  M.keys = MELODY.map(([n, note], i) => ({ n, note, t: tn(n), s: sAt(tn(n)), m: midi(note), i }));
  // the marble rides two brass rails and brushes each bar below it: a bar sounds when the marble's
  // contact point crosses its leading edge, so bars sit exactly where the marble is on each note
  for (let i = 0; i < M.keys.length; i++) {
    const k = M.keys[i];
    k.w = 1.75; // bar width along the ramp
    k.len = 14 * Math.pow(2, -(k.m - midi('A4')) / 15); // bar length: longer = lower (exaggerated so the score reads)
  }
  M.sEnd = M.keys[M.keys.length - 1].s + 4.0; // the rails run on a little past the last bar
  // the marble leaves the ramp end and drops into the CRM tray at tn(48)
  {
    // time it reaches the end
    const disc = M.v0 * M.v0 + 2 * M.a * M.sEnd;
    M.tEnd = M.t0 + (-M.v0 + Math.sqrt(disc)) / M.a;
    M.vEnd = M.v0 + M.a * (M.tEnd - M.t0);
    M.tLand = tn(N.tray);
    const tf = M.tLand - M.tEnd;
    const ca = Math.cos(M.slope), sa = Math.sin(M.slope);
    M.endX = M.x0 - M.sEnd * ca;
    M.endY = M.y0 - M.sEnd * sa; // rail top
    M.vx = -M.vEnd * ca; M.vy = -M.vEnd * sa;
    M.landX = M.endX + M.vx * tf;
    M.landY = M.endY + RM + M.vy * tf - 0.5 * G * tf * tf; // marble centre at landing
    M.tf = tf;
  }
  M.R = RM;
  M.pos = function (T) {
    if (T < tn(N.marble)) return { x: TEE.x, y: L.riser.y + TEE.cy, z: L.lineZ, roll: 0, phase: 'tee' };
    if (T < M.t0) {
      const u = T - tn(N.marble);
      return { x: TEE.x - TEE.vu * u, y: L.riser.y + TEE.cy + TEE.vy * u - 0.5 * G * u * u, z: L.lineZ, roll: (TEE.vu * u) / RM, phase: 'pop' };
    }
    const ca = Math.cos(M.slope), sa = Math.sin(M.slope);
    if (T < M.tEnd) {
      const s = sAt(T);
      // a small dip as it crosses each gap (the click you hear)
      let dip = 0;
      for (const k of M.keys) { const ds = s - k.s; if (ds > -0.5 && ds < 0.35) dip = Math.max(dip, 0.06 * Math.cos(((ds + 0.08) / 0.43) * PI * 0.5)); }
      return { x: M.x0 - s * ca, y: M.y0 + RM - s * sa - dip, z: L.lineZ, roll: (s + TEE.vu * TEE.tf) / RM, phase: 'ramp' };
    }
    const u = T - M.tEnd;
    if (T < M.tLand) {
      return { x: M.endX + M.vx * u, y: M.endY + RM + M.vy * u - 0.5 * G * u * u, z: L.lineZ, roll: (M.sEnd + TEE.vu * TEE.tf + M.vEnd * u) / RM, phase: 'air' };
    }
    // in the tray: it rides the lever (resolved by the caller with the lever pose)
    return { x: M.landX, y: M.landY, z: L.lineZ, roll: (M.sEnd + TEE.vu * TEE.tf + M.vEnd * M.tf) / RM + Math.min(1.2, (T - M.tLand) * 6), phase: 'tray' };
  };
  // index of the key last struck at T (and the time since): drives key vibration
  M.keyHits = MELODY.map(([n]) => tn(n));

  // ------------------------------------------------------------------ 3. the lever: CRM tray -> rubber stamp
  // a 44 cm wooden arm on a pivot block, pre-balanced and resting on a stop; the marble's weight
  // tips it; the stamp hangs from its tip on a pin and meets the raised end of the catapult.
  const LV = (CR.LV = {});
  LV.rTray = 8.5; // tray centre distance from the pivot
  LV.arm = 42; // pivot -> stamp pin
  LV.px = M.landX + LV.rTray * Math.cos(12 * PI / 180); // pivot x (the tray sits under the marble's landing point)
  LV.phi0 = 12 * PI / 180; // tip-up rest angle
  // pivot height: the tray floor (arm top + 0.5) sits right under the marble's landing centre
  LV.py = (M.landY - RM) - 0.5 * Math.cos(LV.phi0) - LV.rTray * Math.sin(LV.phi0);
  LV.z = L.lineZ;
  LV.stampLen = 6.4; // pin -> rubber face
  LV.tipX = (phi) => LV.px - LV.arm * Math.cos(phi);
  LV.tipY = (phi) => LV.py + LV.arm * Math.sin(phi);
  // catapult (ruler on a glue-stick fulcrum), along +z under the stamp
  const CP = (CR.CP = {});
  CP.x = LV.tipX(0);
  CP.fz = -34; CP.fy = 2.4; // fulcrum top
  CP.short = 7; CP.long = 21; CP.th = 0.35; // ruler: 28 cm
  CP.psi0 = Math.atan2(CP.fy - 0.15, CP.long); // long end rests on the desk
  CP.shortY = (psi) => CP.fy + CP.short * Math.sin(psi); // short end (load end) top height
  // the stamp face meets the raised invoice: tip height at impact
  CP.invoiceTop = CP.shortY(CP.psi0) + CP.th / 2 + 0.05;
  LV.phiImp = Math.asin((CP.invoiceTop + LV.stampLen - LV.py) / LV.arm);
  // solve the arm's inertia so the marble's weight swings it from phi0 to phiImp in exactly tn(56)-tn(48)
  {
    const mM = 5.5; // g
    const target = tn(N.stamp) - tn(N.tray);
    const swing = (I) => {
      let phi = LV.phi0, w = 0, t = 0;
      while (phi > LV.phiImp && t < 5) { const tau = mM * G * LV.rTray * Math.cos(phi); w -= (tau / I) * DT; phi += w * DT; t += DT; }
      return { t, w };
    };
    let lo = 200, hi = 400000;
    for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (swing(m).t < target) lo = m; else hi = m; }
    LV.I = Math.sqrt(lo * hi);
    LV.wImp = swing(LV.I).w;
  }
  LV.tStart = tn(N.tray); LV.tImp = tn(N.stamp);
  {
    const mM = 5.5; const tab = []; let phi = LV.phi0, w = 0;
    const steps = Math.ceil((tn(N.stamp) - tn(N.tray)) / DT) + 2;
    for (let i = 0; i <= steps; i++) { tab.push(phi); const tau = mM * G * LV.rTray * Math.cos(phi); w -= (tau / LV.I) * DT; phi += w * DT; }
    LV.tab = tab;
  }
  LV.phi = function (T) {
    if (T <= LV.tStart) return LV.phi0;
    if (T < LV.tImp) {
      const f = (T - LV.tStart) / DT; const i = Math.min(LV.tab.length - 2, Math.floor(f));
      return Math.max(LV.phiImp, lerp(LV.tab[i], LV.tab[i + 1], f - i));
    }
    const u = T - LV.tImp;
    // after impact: the ruler gives way (short end goes down ~2 cm over 40 ms), then the arm rests
    const drop = 2 * CP.short * Math.sin(CP.psi0); // short end travel
    const k = sstep(0, 0.045, u);
    const extra = Math.asin(clamp((drop * k) / LV.arm, -1, 1));
    const settle = 0.004 * Math.exp(-u * 9) * Math.sin(u * 60);
    return LV.phiImp - extra + settle;
  };
  // the stamp hangs plumb from the pin (small pendulum swing during the motion)
  LV.stampSwing = function (T) {
    if (T <= LV.tStart) return 0;
    const u = T - LV.tStart;
    if (T < LV.tImp) return -0.06 * sstep(0, 1, u / (LV.tImp - LV.tStart)); // lags behind the descending arm
    const v = T - LV.tImp;
    return -0.06 * Math.exp(-v * 7) * Math.cos(v * 18);
  };
  CP.psi = function (T) {
    if (T < LV.tImp) return CP.psi0;
    const u = T - LV.tImp;
    // snap: from +psi0 (long end down) to -psi0' (long end up, short end on the desk)
    const psiEnd = -Math.atan2(CP.fy - 0.15, CP.short) * 0.999;
    const k = sstep(0, 0.045, u);
    let psi = lerp(CP.psi0, psiEnd, k);
    // the ruler rattles back down after the coin leaves (long end falls back)
    if (u > 0.06) psi = lerp(psiEnd, CP.psi0, sstep(0.06, 0.32, u)) + 0.02 * Math.exp(-(u - 0.32) * 12) * Math.sin((u - 0.32) * 50) * (u > 0.32 ? 1 : 0);
    return psi;
  };
  CP.longEnd = (psi) => ({ z: CP.fz + CP.long * Math.cos(psi), y: CP.fy - CP.long * Math.sin(psi) });

  // ------------------------------------------------------------------ 4. coin -> piggy bank «оплата»
  const PG = (CR.PG = {});
  PG.x = CP.x - 2.5; PG.z = 9; // piggy centre on the balance plank
  // balance plank along z on a wedge fulcrum
  const BL = (CR.BL = {});
  BL.x = PG.x; BL.fz = 2.5; BL.fy = 2.4; BL.len0 = 10; BL.len1 = 19; // to counterweight end (-z) / to fan end (+z)
  BL.beta0 = Math.atan2(BL.fy - 0.25, BL.len0); // counterweight end resting on the desk -> fan end up
  BL.piggyR = PG.z - BL.fz; // 6.5 cm from the fulcrum on the fan side
  PG.slot = () => ({ x: PG.x, y: BL.fy + 0.6 + BL.piggyR * Math.sin(BL.beta0) + 8.3, z: PG.z - 0.5 }); // slot on the back
  const COIN = (CR.COIN = {});
  COIN.r = 1.5; COIN.th = 0.24;
  COIN.tL = LV.tImp + 0.035; COIN.tA = tn(N.coin);
  {
    const le = CP.longEnd(-Math.atan2(CP.fy - 0.15, CP.short) * 0.6);
    COIN.p0 = { x: CP.x, y: le.y + 0.35, z: le.z - 1.6 };
    const s = PG.slot();
    COIN.p1 = { x: s.x, y: s.y + 0.4, z: s.z };
    const T = COIN.tA - COIN.tL;
    COIN.v = { x: (COIN.p1.x - COIN.p0.x) / T, z: (COIN.p1.z - COIN.p0.z) / T, y: (COIN.p1.y - COIN.p0.y + 0.5 * G * T * T) / T };
  }
  COIN.pos = function (T) {
    if (T < COIN.tL) {
      // resting on the ruler's long end (rides it)
      const psi = CP.psi(T);
      const le = CP.longEnd(psi);
      return { x: CP.x, y: le.y + CP.th / 2 + COIN.th / 2, z: le.z - 1.6, flip: psi, spin: 0, inside: false };
    }
    if (T < COIN.tA) {
      const u = T - COIN.tL;
      const fl = (u / (COIN.tA - COIN.tL));
      return { x: COIN.p0.x + COIN.v.x * u, y: COIN.p0.y + COIN.v.y * u - 0.5 * G * u * u, z: COIN.p0.z + COIN.v.z * u, flip: fl * (PI * 4 + PI / 2), spin: 0, inside: false };
    }
    // slides into the slot and vanishes inside the piggy (physically: behind the slot)
    const u = T - COIN.tA;
    const s = PG.slot();
    return { x: s.x, y: s.y + 0.4 - Math.min(4, 30 * u + 0.5 * G * u * u), z: s.z, flip: PI * 4 + PI / 2, spin: 0, inside: u > 0.05 };
  };

  // balance: the coin's extra weight tips the pre-trimmed plank; fan end comes down on the button
  BL.tStart = tn(N.coin); BL.tBtn = tn(N.button);
  BL.betaBtn = -Math.atan2(2.2, BL.len1) * 0.25; // fan end lowered onto the button
  {
    const mC = 7.5;
    const target = BL.tBtn - BL.tStart;
    const tip = (I) => { let b = BL.beta0, w = 0, t = 0; while (b > BL.betaBtn && t < 5) { const tau = mC * G * BL.piggyR * Math.cos(b); w -= (tau / I) * DT; b += w * DT; t += DT; } return t; };
    let lo = 100, hi = 1e7;
    for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (tip(m) < target) lo = m; else hi = m; }
    BL.I = Math.sqrt(lo * hi);
  }
  {
    const mC = 7.5; const tab = []; let b = BL.beta0, w = 0;
    const steps = Math.ceil((BL.tBtn - BL.tStart) / DT) + 2;
    for (let i = 0; i <= steps; i++) { tab.push(b); const tau = mC * G * BL.piggyR * Math.cos(b); w -= (tau / BL.I) * DT; b += w * DT; }
    BL.tab = tab;
  }
  BL.beta = function (T) {
    if (T <= BL.tStart) return BL.beta0;
    if (T < BL.tBtn) {
      const f = (T - BL.tStart) / DT; const i = Math.min(BL.tab.length - 2, Math.floor(f));
      return Math.max(BL.betaBtn, lerp(BL.tab[i], BL.tab[i + 1], f - i));
    }
    const u = T - BL.tBtn;
    return BL.betaBtn - 0.012 * Math.exp(-u * 10) * Math.sin(u * 40); // button spring
  };

  // ------------------------------------------------------------------ 5. desk fan
  const FAN = (CR.FAN = {});
  FAN.x = BL.x; FAN.z = BL.fz + BL.len1 + 4.2; // base centre; the button sits under the plank's end
  FAN.headY = 13.5; FAN.R = 6.2;
  FAN.tOn = tn(N.button);
  // loop-safe top speed: whole blade periods (3 blades) per bar
  FAN.W = (14 * (2 * PI / 3)) / (16 * S16);
  FAN.tau = 0.32;
  FAN.omega = (T) => (T < FAN.tOn ? 0 : FAN.W * (1 - Math.exp(-(T - FAN.tOn) / FAN.tau)));
  FAN.angle = (T) => { if (T < FAN.tOn) return 0; const u = T - FAN.tOn; return FAN.W * (u - FAN.tau * (1 - Math.exp(-u / FAN.tau))); };

  // ------------------------------------------------------------------ 6. paper plane: fan -> phone
  const PL = (CR.PL = {});
  PL.tGo = tn(N.plane); PL.tHit = tn(N.phone);
  // phone on a stand behind the field's right end, screen yawed toward the incoming plane
  const PH = (CR.PH = {});
  PH.x = 53; PH.z = -25.5; PH.yaw = -0.42; PH.tilt = 0.30; PH.w = 7.2; PH.h = 15; PH.d = 0.8; PH.baseY = 4.4;
  // screen point where the nose taps
  PH.basis = function () {
    const cy = Math.cos(PH.yaw), sy = Math.sin(PH.yaw);
    const n = { x: sy * Math.cos(PH.tilt), y: Math.sin(PH.tilt), z: cy * Math.cos(PH.tilt) }; // screen normal (toward viewer)
    const up = { x: -sy * Math.sin(PH.tilt), y: Math.cos(PH.tilt), z: -cy * Math.sin(PH.tilt) };
    const right = { x: cy, y: 0, z: -sy };
    return { n, up, right };
  };
  {
    const B = PH.basis();
    // must match the build: stand group at (x, 0, z) yawed; phone body at local (0, baseY + 0.4, 1.0) tilted back
    const zl = 1.0 - (PH.h / 2) * Math.sin(PH.tilt);
    const c = { x: PH.x + zl * Math.sin(PH.yaw), y: PH.baseY + 0.4 + (PH.h / 2) * Math.cos(PH.tilt), z: PH.z + zl * Math.cos(PH.yaw) };
    PH.center = c;
    // the nose taps the «Подписаться» button near the bottom of the screen
    PH.tap = { x: c.x - B.up.x * 4.9 + B.n.x * 0.5, y: c.y - B.up.y * 4.9 + B.n.y * 0.5, z: c.z - B.up.z * 4.9 + B.n.z * 0.5 };
  }
  // flight path: launch stand in front of the fan, along the front of the desk, banking left into the phone
  PL.pts = [
    [FAN.x + 9.5, 9.0, FAN.z],
    [FAN.x + 30, 12.5, FAN.z + 2.5],
    [-8, 15.5, 31],
    [22, 16.5, 27],
    [42, 15.0, 10],
    [PH.tap.x - 13 * Math.sin(PH.yaw) * 0.0 - 6, PH.tap.y + 2.0, PH.tap.z + 12],
    [PH.tap.x, PH.tap.y, PH.tap.z],
  ];
  function catmull(P, u) {
    const n = P.length - 1;
    const f = clamp(u, 0, 1) * n;
    const i = Math.min(n - 1, Math.floor(f));
    const r = f - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)];
    const o = [];
    for (let k = 0; k < 3; k++) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      o.push(0.5 * (2 * b + (-a + c) * r + (2 * a - 5 * b + 4 * c - d) * r * r + (-a + 3 * b - 3 * c + d) * r * r * r));
    }
    return o;
  }
  // arc-length table
  {
    const K = 600; const arc = [0]; let prev = catmull(PL.pts, 0);
    for (let i = 1; i <= K; i++) { const q = catmull(PL.pts, i / K); arc.push(arc[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2])); prev = q; }
    PL.arc = arc; PL.len = arc[K]; PL.K = K;
  }
  const uAtS = (s) => {
    const A = PL.arc; let lo = 0, hi = PL.K;
    if (s <= 0) return 0; if (s >= A[hi]) return 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (A[m] < s) lo = m; else hi = m; }
    return (lo + (s - A[lo]) / (A[hi] - A[lo])) / PL.K;
  };
  // speed: thrust from the fan for the first 0.35 s, then a glide that slowly bleeds speed
  {
    const T = PL.tHit - PL.tGo;
    const raw = (u) => { const a = 1 - Math.exp(-u / 0.16); return a * (1 - 0.28 * (u / T)); };
    let acc = 0; const n = 2000; const tab = [0];
    for (let i = 1; i <= n; i++) { acc += raw((i - 0.5) / n * T) * (T / n); tab.push(acc); }
    PL.sTab = tab.map((v) => (v / acc) * PL.len); PL.T = T;
  }
  PL.sAt = (T) => { const u = clamp((T - PL.tGo) / PL.T, 0, 1) * 2000; const i = Math.min(1999, Math.floor(u)); return lerp(PL.sTab[i], PL.sTab[i + 1], u - i); };
  // pose: position + forward + bank (coordinated turn: tan(bank) = v^2 kappa / g)
  PL.pose = function (T) {
    if (T < PL.tGo) {
      // sitting on its stand; it trembles once the fan's air arrives
      const w = FAN.omega(T) / FAN.W;
      const q = catmull(PL.pts, 0);
      const jit = w * 0.13 * Math.sin(T * 63) + w * 0.08 * Math.sin(T * 41);
      // the air lifts its nose and rocks it before it lets go
      return { p: [q[0], q[1] + 0.25 * w * (0.6 + 0.4 * Math.sin(T * 37)), q[2]], fwd: [1, 0, 0], bank: jit, pitch: 0.12 * w, phase: 'stand' };
    }
    if (T < PL.tHit) {
      const s = PL.sAt(T);
      const u = uAtS(s);
      const p = catmull(PL.pts, u);
      const e = 0.002;
      const a = catmull(PL.pts, Math.max(0, u - e)), b = catmull(PL.pts, Math.min(1, u + e));
      const fwd = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const fl = Math.hypot(...fwd); fwd[0] /= fl; fwd[1] /= fl; fwd[2] /= fl;
      // horizontal curvature for the bank
      const a2 = catmull(PL.pts, Math.max(0, u - 0.02)), b2 = catmull(PL.pts, Math.min(1, u + 0.02));
      const h1 = Math.atan2(p[2] - a2[2], p[0] - a2[0]), h2 = Math.atan2(b2[2] - p[2], b2[0] - p[0]);
      let dh = h2 - h1; while (dh > PI) dh -= 2 * PI; while (dh < -PI) dh += 2 * PI;
      const ds = Math.hypot(b2[0] - a2[0], b2[2] - a2[2]) / 2 || 1;
      const kappa = dh / ds;
      const dt = 1 / 60;
      const v = (PL.sAt(T + dt) - PL.sAt(T - dt)) / (2 * dt);
      const bank = clamp(Math.atan((v * v * kappa) / G), -0.75, 0.75);
      return { p, fwd, bank, pitch: 0, v, phase: 'fly' };
    }
    // tap, bounce off the screen and flutter down onto the trigger domino (hit at tn(88)), then rest
    const B = PH.basis();
    const u = T - PL.tHit;
    const tFall = tn(N.trigger) - PL.tHit;
    const top = PL.trigTop; // where it meets the trigger domino's top
    const q0 = [PH.tap.x, PH.tap.y, PH.tap.z];
    if (T < tn(N.trigger)) {
      const k = u / tFall;
      // it bounces back off the glass (toward the viewer) and drops: drag-limited, not a free fall
      const rb = 3.2 * Math.sin(Math.min(1, k * 2.2) * PI * 0.5) * (1 - k * 0.6);
      const kk = 1 - Math.pow(1 - k, 1.6);
      const x = lerp(q0[0], top[0], kk) + B.n.x * rb;
      const z = lerp(q0[2], top[2], kk) + B.n.z * rb;
      const y = lerp(q0[1], top[1], Math.pow(k, 1.25));
      return { p: [x, y, z], fwd: PL.fwdEnd, bank: 0.35 * Math.sin(k * 7) * (1 - k * 0.5), pitch: -0.35 - 0.8 * k, phase: 'fall' };
    }
    const v2 = T - tn(N.trigger);
    const k2 = sstep(0, 0.45, v2);
    const p = [lerp(top[0], PL.rest[0], k2), lerp(top[1], PL.rest[1], k2 * k2) + 0.4 * Math.sin(k2 * PI) * (1 - k2), lerp(top[2], PL.rest[2], k2)];
    return { p, fwd: PL.fwdEnd, bank: lerp(0.3, 0.12, k2), pitch: lerp(-1.15, -0.06, sstep(0, 1, k2)), phase: 'rest' };
  };
  {
    const b = catmull(PL.pts, 1), a = catmull(PL.pts, 0.985);
    const f = [b[0] - a[0], 0, b[2] - a[2]]; const l = Math.hypot(f[0], f[2]); PL.fwdEnd = [f[0] / l, 0, f[2] / l];
  }

  // ------------------------------------------------------------------ 7. the field: trigger -> «АВТОПИЛОТ» bar -> 9 rows -> banner roll
  // 35 columns x 9 rows; every column is the same 2D chain along +z (rows fall toward the viewer).
  const FD = (CR.FD = {});
  FD.cols = 35; FD.rows = 9; FD.pitchX = 3.0; FD.x0 = -((FD.cols - 1) / 2) * FD.pitchX;
  FD.bar = { h: 5.6, t: 0.9, len: FD.cols * FD.pitchX + 3.6 };
  // chain: [trigger domino, the bar, row0..row8]; hits on the grid
  const fieldSpec = {
    d: [{ h: L.dom.h, t: L.dom.t }, { h: FD.bar.h, t: FD.bar.t }].concat(Array.from({ length: FD.rows }, () => ({ h: L.dom.h, t: L.dom.t }))),
    T0: tn(N.trigger),
    hits: [null, tn(N.stick)].concat(Array.from({ length: FD.rows }, (_, r) => tn(N.row0 + r))),
    gap: [null, 2.2, 2.5].concat(Array.from({ length: FD.rows - 1 }, () => 2.45)),
    e: [null, null, null].concat(Array.from({ length: FD.rows - 1 }, () => null)).concat([0.9]),
    tEnd: tn(144),
  };
  const field = buildChain(fieldSpec);
  CR.field = field;
  // place the chain so that row 0's back face is at z = -14
  FD.zOff = -14 - (field.d[2].p - field.d[2].t);
  FD.rowZ = (r) => FD.zOff + field.d[2 + r].p; // pivot (front-bottom edge) z of row r
  FD.trigX = 50.5; // the trigger domino stands behind the bar's right part, in front of the phone
  // where the falling plane meets the trigger's top
  {
    const zT = FD.zOff + field.d[0].p - field.d[0].t * 0.5;
    PL.trigTop = [FD.trigX + 0.6, L.dom.h + 0.85, zT - 0.3];
    PL.rest = [FD.trigX - 4.5, 0.75, zT - 1.6];
  }
  // banner roll in front of row 8: the falling row meets it at tn(105)
  const BN = (CR.BN = {});
  {
    const last = field.d[2 + FD.rows - 1];
    const s = sample(field.tabs[2 + FD.rows - 1], tn(N.roll));
    BN.r0 = 1.35; // outer radius of the roll
    // top-front corner of the falling domino
    const cu = last.p + last.h * Math.sin(s.th), cyy = last.h * Math.cos(s.th);
    // the roll touches that corner: centre at (cu + dx, r0) with |corner - centre| = r0
    const dy = BN.r0 - cyy;
    const dx = Math.sqrt(Math.max(0, BN.r0 * BN.r0 - dy * dy));
    BN.z0 = FD.zOff + cu + dx; // roll centre z at rest
    BN.v0 = 26; BN.dist = 21.5; BN.a = (BN.v0 * BN.v0) / (2 * BN.dist);
    BN.t0 = tn(N.roll); BN.tStop = BN.t0 + BN.v0 / BN.a;
    BN.w = FD.cols * FD.pitchX + 2; // roll length along x
    BN.core = 0.55; // card core radius
    BN.paperT = (BN.r0 * BN.r0 - BN.core * BN.core) * PI / (BN.dist + 3.5); // paper thickness that fits the length
  }
  BN.travel = (T) => { if (T <= BN.t0) return 0; const u = Math.min(T, BN.tStop) - BN.t0; return BN.v0 * u - 0.5 * BN.a * u * u; };
  BN.radius = (T) => Math.sqrt(Math.max(BN.core * BN.core, BN.r0 * BN.r0 - (BN.travel(T) * BN.paperT) / PI));

  // the last row stops against the roll (it pushes it) then lies down on the paper
  // (its free fall already continues past the contact: the roll has moved away)

  // ------------------------------------------------------------------ the action point (camera follows the cause)
  CR.FIELD_CENTER = { x: 0, y: 0, z: FD.rowZ(4) };

  // ------------------------------------------------------------------ sound events (music.js reads these)
  const EV = [];
  EV.push({ t: tn(N.tap), kind: 'tap' });
  for (let k = 1; k <= LINE_N; k++) EV.push({ t: line.hits[k], kind: 'domino', i: k });
  EV.push({ t: tn(N.marble), kind: 'knock' });
  for (const k of M.keys) EV.push({ t: k.t, kind: 'key', note: k.note, i: k.i });
  EV.push({ t: tn(N.tray), kind: 'tray' });
  EV.push({ t: tn(N.stamp), kind: 'stamp' });
  EV.push({ t: COIN.tL, kind: 'coinUp' });
  EV.push({ t: tn(N.coin), kind: 'coin' });
  EV.push({ t: tn(N.button), kind: 'button' });
  EV.push({ t: tn(N.plane), kind: 'plane' });
  EV.push({ t: tn(N.phone), kind: 'phone' });
  EV.push({ t: tn(N.trigger), kind: 'trigger' });
  EV.push({ t: tn(N.stick), kind: 'bar' });
  for (let r = 0; r < FD.rows; r++) EV.push({ t: tn(N.row0 + r), kind: 'row', i: r });
  EV.push({ t: tn(N.roll), kind: 'roll' });
  EV.push({ t: BN.tStop, kind: 'rollStop' });
  CR.EV = EV;
  CR.lean = lean; CR.corners = corners; CR.sample = sample; CR.catmull = catmull;
})();
