/*
 * props.js : the SPRAY ENGINE of 07-graffiti (prelude: loads after lib.js, before the timeline,
 * on every page and with snap --only; excluded from the literal-colour scan, so the palette lives here).
 *
 *   FILM.spray.PAL           named colours (concrete, buff, paint, card, metal)
 *   FILM.spray.vnoise/fbm    fast table value noise (pure)
 *   FILM.spray.stroke(o)     one can gesture -> dabs (x, y, sigma, alpha, t) + specks, emitted at a fixed
 *                            time step, so slow parts and dwells deposit more paint (pressure x dwell)
 *   FILM.spray.drawStroke    draws the dabs and specks of a stroke up to time T (soft radial core with a
 *                            faint wide halo, plus discrete droplets thinning out at the fringe)
 *   FILM.spray.piece(o)      a wall piece: ordered groups of strokes, each group optionally clipped by a
 *                            mask (outline ring, fill, stencil cut-out); drips computed from the paint load
 *   FILM.spray.drawPiece     the piece at time T (prefix-of-groups accumulator, live groups, live drips)
 *   FILM.spray.wall(seed)    the concrete wall: albedo, relief shade, pores (generated once, pure)
 *   FILM.spray.can/card      the spray can and the stencil card objects
 *
 * Determinism: every random number is a hash of (seed, index). Caches are pure functions of their
 * keys: the wall, sprites, masks, final piece layers. The per-piece accumulator holds "groups 0..k-1
 * complete" and is extended or rebuilt with the exact same op sequence, so a warm and a cold frame
 * issue identical canvas operations.
 */
(function () {
  'use strict';

  const FILM = window.FILM;
  const L = FILM.lib;
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const h3 = L.h3;
  const SP = (FILM.spray = {});
  SP.clamp = clamp;
  SP.lerp = lerp;
  SP.sstep = sstep;

  // ---------------------------------------------------------------------------
  // Palette (named; scenes read FILM.spray.PAL)
  // ---------------------------------------------------------------------------
  const PAL = {
    // wall
    concrete: '#8c8983',
    concreteCool: '#7f8285',
    concreteWarm: '#958e83',
    buffGrey: '#9d9a93',
    buffDark: '#6f6d69',
    buffBeige: '#a89f8d',
    rust: '#8a4a22',
    grime: '#3b3833',
    ground: '#2b2a28',
    groundLight: '#4a4844',
    // paint (brand + street)
    magenta: '#ff2bd6',
    cyan: '#00f0ff',
    violet: '#bf00ff',
    black: '#141016',
    white: '#f6f4ef',
    chrome: '#cfd3d8',
    deep: '#2a0846',
    navy: '#0b1640',
    yellow: '#ffe14a',
    // faded ghosts under the buff
    ghostRed: '#7d3b36',
    ghostBlue: '#3e5470',
    ghostInk: '#3a3836',
    ghostGreen: '#4f6a4a',
    // objects
    card: '#c4ad84',
    cardDark: '#9c8660',
    canBody: '#1d1c22',
    canMetal: '#d9dde2',
    nozzle: '#f2f0ea',
    brand: '#0a0012',
  };
  SP.PAL = Object.freeze(PAL);

  const rgbCache = new Map();
  function rgb(hex) {
    let v = rgbCache.get(hex);
    if (v) return v;
    const h = hex.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    rgbCache.set(hex, v);
    return v;
  }
  SP.rgb = rgb;
  SP.rgba = (hex, a) => {
    const c = rgb(hex);
    return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
  };
  SP.mixHex = (a, b, t) => {
    const A = rgb(a), B = rgb(b);
    const f = (i) => Math.round(lerp(A[i], B[i], t)).toString(16).padStart(2, '0');
    return '#' + f(0) + f(1) + f(2);
  };

  const mk = (w, h) => FILM.makeCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
  SP.mk = mk;

  // ---------------------------------------------------------------------------
  // Fast value noise from a 256x256 lattice table (pure, built once)
  // ---------------------------------------------------------------------------
  let VN = null;
  function vnTable() {
    if (VN) return VN;
    VN = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) VN[i] = h3(i, 7177, 31);
    return VN;
  }
  function vnoise(x, y) {
    const T = VN || vnTable();
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = xi & 255, y0 = (yi & 255) << 8, x1 = (x0 + 1) & 255, y1 = ((yi + 1) & 255) << 8;
    const a = T[y0 + x0], b = T[y0 + x1], c = T[y1 + x0], d = T[y1 + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct) {
    let s = 0, a = 0.5, n = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += a * vnoise(x * f + o * 37.13, y * f - o * 19.71);
      n += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / n;
  }
  SP.vnoise = vnoise;
  SP.fbm = fbm;

  // ---------------------------------------------------------------------------
  // Paths
  // ---------------------------------------------------------------------------

  /** Catmull-Rom through pts (uniform), resampled every `step` px. Returns flat {X, Y, S, n}. */
  function densePath(pts, smooth, step, closed) {
    const P = pts.slice();
    if (closed) P.push(pts[0]);
    const raw = [];
    if (smooth && P.length > 2) {
      const n = P.length;
      const get = (i) => {
        if (closed) return P[((i % (n - 1)) + (n - 1)) % (n - 1)];
        if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
        if (i >= n) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
        return P[i];
      };
      for (let i = 0; i < n - 1; i++) {
        const p0 = get(i - 1), p1 = P[i], p2 = P[i + 1], p3 = get(i + 2);
        const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
        const m = Math.max(2, Math.ceil(segLen / 3));
        for (let k = 0; k < m; k++) {
          const t = k / m, t2 = t * t, t3 = t2 * t;
          const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
          const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
          raw.push(x, y);
        }
      }
      raw.push(P[n - 1][0], P[n - 1][1]);
    } else {
      for (const p of P) raw.push(p[0], p[1]);
    }
    // resample by arc length
    const X = [raw[0]], Y = [raw[1]], S = [0];
    let acc = 0, carry = 0;
    for (let i = 2; i < raw.length; i += 2) {
      const x0 = raw[i - 2], y0 = raw[i - 1], x1 = raw[i], y1 = raw[i + 1];
      const d = Math.hypot(x1 - x0, y1 - y0);
      if (d < 1e-9) continue;
      let pos = step - carry;
      while (pos <= d) {
        const t = pos / d;
        acc += step;
        X.push(x0 + (x1 - x0) * t);
        Y.push(y0 + (y1 - y0) * t);
        S.push(acc);
        pos += step;
      }
      carry = d - (pos - step);
    }
    const lx = raw[raw.length - 2], ly = raw[raw.length - 1];
    const tail = Math.hypot(lx - X[X.length - 1], ly - Y[Y.length - 1]);
    if (tail > 0.01) {
      X.push(lx);
      Y.push(ly);
      S.push(acc + tail);
    }
    return { X, Y, S, n: X.length };
  }
  SP.densePath = densePath;

  // ---------------------------------------------------------------------------
  // Dab sprite: a soft core with a faint wide halo (spray deposition profile)
  // ---------------------------------------------------------------------------
  const EXT = 4; // the sprite reaches EXT sigma from its centre
  const spriteCache = new Map();
  function dabSprite(color) {
    let c = spriteCache.get(color);
    if (c) return c;
    const N = 128, R = N / 2;
    c = mk(N, N);
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const d = img.data;
    const [r, gg, b] = rgb(color);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const dist = (Math.hypot(x + 0.5 - R, y + 0.5 - R) / R) * EXT;
        let f = 0.84 * Math.exp(-Math.pow(dist, 2.4)) + 0.16 * Math.exp(-(dist / 2.0) * (dist / 2.0));
        f *= 1 - sstep(EXT * 0.8, EXT, dist);
        const i = (y * N + x) * 4;
        d[i] = r;
        d[i + 1] = gg;
        d[i + 2] = b;
        d[i + 3] = Math.round(clamp(f) * 255);
      }
    }
    g.putImageData(img, 0, 0);
    spriteCache.set(color, c);
    return c;
  }
  SP.dabSprite = dabSprite;
  const PROFILE_INT = 2.0; // integral of the profile along a line through the centre, in sigma units

  // ---------------------------------------------------------------------------
  // Stroke: a can gesture
  // ---------------------------------------------------------------------------
  /*
   * o: { pts, smooth=true, closed=false, t0, dur, d0=0 (dwell before moving), d1=0 (dwell after),
   *      color, sigma, opacity=0.95 (centre coverage of one pass at nominal speed), ease=0.55,
   *      kc=0.8 (slow down in corners), tremor=0.5, sigVar=0.12, speck=1 (droplet density),
   *      speckSpread=1.45, seed, drip=1 (paint that can run), can=true }
   */
  function stroke(o) {
    if (o.roller) return rollerStroke(o);
    const seed = L.hash('stroke', o.seed != null ? o.seed : 0) & 0x7fffffff;
    const sigma = o.sigma || 6;
    const path = densePath(o.pts, o.smooth !== false, Math.max(1, Math.min(3, sigma * 0.3)), !!o.closed);
    const { X, Y, S, n } = path;
    const len = S[n - 1] || 1;
    // corner slow-down: time weight per sample
    const kc = o.kc != null ? o.kc : 0.8;
    const TW = new Float64Array(n);
    TW[0] = 0;
    const win = 4;
    for (let i = 1; i < n; i++) {
      const a = Math.max(0, i - win), b = Math.min(n - 1, i + win);
      const ax = X[i] - X[a], ay = Y[i] - Y[a], bx = X[b] - X[i], by = Y[b] - Y[i];
      const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
      const cos = clamp((ax * bx + ay * by) / (la * lb), -1, 1);
      const turn = Math.acos(cos); // 0 straight .. pi reversal
      const w = 1 + kc * Math.pow(turn / (Math.PI / 2), 1.3) * 2.2;
      TW[i] = TW[i - 1] + (S[i] - S[i - 1]) * w;
    }
    const twTot = TW[n - 1] || 1;
    const t0 = o.t0 || 0, dur = Math.max(0.02, o.dur || 0.5), d0 = o.d0 || 0, d1 = o.d1 || 0;
    const ease = o.ease != null ? o.ease : 0.55;
    const vnom = len / dur;
    let minW = 1e9;
    for (let i = 1; i < n; i++) {
      const ds = S[i] - S[i - 1];
      if (ds > 1e-6) minW = Math.min(minW, (TW[i] - TW[i - 1]) / ds);
    }
    const vmax = ((twTot / dur) * (1 + Math.abs(ease))) / Math.max(0.2, minW);
    const dt = clamp((0.5 * sigma) / Math.max(1, vmax), 1 / 5000, 1 / 110);
    const total = d0 + dur + d1;
    const nd = Math.max(2, Math.ceil(total / dt) + 1);
    const D = -Math.log(1 - clamp(o.opacity != null ? o.opacity : 0.95, 0.02, 0.995));
    const tremor = o.tremor != null ? o.tremor : 0.5;
    const sigVar = o.sigVar != null ? o.sigVar : 0.12;
    const speck = o.speck != null ? o.speck : 1;
    const spread = o.speckSpread || 1.45;
    const dabs = new Float32Array(nd * 5);
    const sp = [];
    let ip = 0;
    // position along the path at time-weight w
    const posAt = (w) => {
      while (ip < n - 1 && TW[ip + 1] < w) ip++;
      while (ip > 0 && TW[ip] > w) ip--;
      const a = TW[ip], b = TW[Math.min(n - 1, ip + 1)];
      const f = b > a ? clamp((w - a) / (b - a)) : 0;
      const j = Math.min(n - 1, ip + 1);
      return [X[ip] + (X[j] - X[ip]) * f, Y[ip] + (Y[j] - Y[ip]) * f, ip];
    };
    let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
    for (let k = 0; k < nd; k++) {
      const tl = Math.min(total, k * dt);
      let w;
      if (tl <= d0) w = 0;
      else if (tl >= d0 + dur) w = twTot;
      else {
        const tau = (tl - d0) / dur;
        w = (tau - (ease / TAU) * Math.sin(TAU * tau)) * twTot;
      }
      const [px, py, ii] = posAt(w);
      // normal for the tremor
      const j0 = Math.max(0, ii - 2), j1 = Math.min(n - 1, ii + 2);
      let tx = X[j1] - X[j0], ty = Y[j1] - Y[j0];
      const tl2 = Math.hypot(tx, ty) || 1;
      tx /= tl2;
      ty /= tl2;
      const tt = t0 + tl;
      const trem = tremor * sigma * 0.35 * (L.noise1(tt * 7.3, seed) + 0.4 * L.noise1(tt * 23.1, seed + 3));
      const x = px - ty * trem, y = py + tx * trem;
      const prog = twTot > 0 ? w / twTot : 0;
      const s = sigma * (1 + sigVar * L.noise1(tt * 2.1 + 3.7, seed + 5)) * (o.taper != null ? lerp(1, o.taper, prog) : 1);
      const a = clamp((D * vnom * dt) / (PROFILE_INT * s), 0.002, 0.92) * (o.alpha != null ? o.alpha : 1);
      const q = k * 5;
      dabs[q] = x;
      dabs[q + 1] = y;
      dabs[q + 2] = s;
      dabs[q + 3] = a;
      dabs[q + 4] = tt;
      const e = s * EXT;
      if (x - e < minx) minx = x - e;
      if (y - e < miny) miny = y - e;
      if (x + e > maxx) maxx = x + e;
      if (y + e > maxy) maxy = y + e;
      // droplets: count follows the deposit; radius from a Rayleigh tail, so most land in the fringe
      const ns = a * s * s * 0.33 * speck;
      let cnt = Math.floor(ns);
      if (h3(k, seed, 11) < ns - cnt) cnt++;
      for (let m = 0; m < cnt; m++) {
        const u1 = h3(k, m, seed + 101), u2 = h3(k, m, seed + 202), u3 = h3(k, m, seed + 303);
        const rr = s * spread * Math.sqrt(-2 * Math.log(1 - u1 * 0.9995));
        const ang = u2 * TAU;
        let size = 0.45 + 1.35 * Math.pow(u3, 2.6);
        if (u3 > 0.993) size += 1.2;
        sp.push(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, size, tt);
      }
    }
    const specks = new Float32Array(sp);
    return {
      seed, color: o.color, sigma, t0, t1: t0 + total, tMove0: t0 + d0, tMove1: t0 + d0 + dur,
      dabs, nd, specks, ns: specks.length / 4, path, len, TW, twTot, ease, d0, dur, total,
      box: [minx, miny, maxx, maxy], drip: o.drip != null ? o.drip : 1, can: o.can !== false, canId: o.canId,
      speckAlpha: o.speckAlpha != null ? o.speckAlpha : 0.8, chunks: [],
    };
  }
  SP.stroke = stroke;


  // ---------------------------------------------------------------------------
  // Roller on a pole: a vertical band of flat paint with nap texture, edge ridges ("tram lines"),
  // paint running out along the stroke; wall-aligned slices copied 1:1 so chunks never seam.
  //   o: { roller: true, x (band centre), y0, y1, W, t0, dur, d0, d1, color, load0, load1, seed }
  // ---------------------------------------------------------------------------
  function rollerStroke(o) {
    const seed = L.hash('roller', o.seed != null ? o.seed : 0) & 0x7fffffff;
    const W = Math.round(o.W || 220);
    const x = Math.round(o.x - W / 2);
    const ya = Math.round(o.y0), yb = Math.round(o.y1);
    const top = Math.min(ya, yb), len = Math.max(1, Math.abs(yb - ya));
    const dir = yb >= ya ? 1 : -1;
    const t0 = o.t0 || 0, d0 = o.d0 || 0.04, dur = Math.max(0.05, o.dur || 0.5), d1 = o.d1 || 0.03;
    const total = d0 + dur + d1;
    const ease = o.ease != null ? o.ease : 0.6;
    // pseudo dabs: only for the drip load (the roller lays heavy paint where it starts and lifts)
    const pd = [];
    const R = L.rng(seed);
    for (const [yy, tt, k] of [[ya, t0 + d0 * 0.5, 1.3], [yb, t0 + d0 + dur, 1.0]]) {
      for (let i = 0; i < 14; i++) {
        const xx = x + 8 + (W - 16) * (i + R()) / 14;
        for (let r2 = 0; r2 < 6; r2++) pd.push(xx, yy + (R() - 0.5) * 10, 9, 0.9 * k * (o.dripLoad != null ? o.dripLoad : 1), tt + r2 * 0.004);
      }
    }
    const nd = pd.length / 5;
    // spatter specks thrown off the nap
    const sp = [];
    const nsp = Math.round(len * 0.9);
    for (let i = 0; i < nsp; i++) {
      const u = R();
      const tt = t0 + d0 + u * dur;
      const yy = ya + dir * len * u;
      const side = R() < 0.5 ? -1 : 1;
      const dx = side * (W / 2 + Math.pow(R(), 2.5) * 60);
      sp.push(x + W / 2 + dx, yy + (R() - 0.5) * 30, 0.6 + R() * 1.6, tt);
    }
    // keep specks time-sorted for the chunk index
    const order = [];
    for (let i = 0; i < sp.length / 4; i++) order.push(i);
    order.sort((a2, b2) => sp[a2 * 4 + 3] - sp[b2 * 4 + 3] || a2 - b2);
    const specks = new Float32Array(sp.length);
    order.forEach((i, k) => specks.set(sp.slice(i * 4, i * 4 + 4), k * 4));
    // dabs time-sorted too (two groups already in order)
    const dabs = new Float32Array(pd);
    return {
      kind: 'roller', seed, color: o.color, sigma: W * 0.25, t0, t1: t0 + total, tMove0: t0 + d0, tMove1: t0 + d0 + dur, d0, dur, total, ease,
      x, W, ya, yb, top, len, dir, load0: o.load0 != null ? o.load0 : 1, load1: o.load1 != null ? o.load1 : 0.62,
      dabs, nd, specks, ns: specks.length / 4, box: [x - 70, top - 40, x + W + 70, top + len + 40], drip: o.drip != null ? o.drip : 1,
      can: o.can !== false, canId: o.canId || 'roller', tool: 'roller', speckAlpha: 0.75, chunks: [], tex: null,
      path: { X: [x + W / 2, x + W / 2], Y: [ya, yb], S: [0, len], n: 2 }, TW: new Float64Array([0, len]), twTot: len, len2: len,
    };
  }
  /** rows painted by the roller at time t: from ya to rollerY(t) */
  function rollerY(st, T) {
    const tl = T - st.t0;
    if (tl <= st.d0) return st.ya;
    if (tl >= st.d0 + st.dur) return st.yb;
    const tau = (tl - st.d0) / st.dur;
    const p = tau - (st.ease / TAU) * Math.sin(TAU * tau);
    return st.ya + st.dir * Math.round(st.len * p);
  }
  SP.rollerY = rollerY;
  function rollerTex(st) {
    if (st.tex) return st.tex;
    const W = st.W, H = st.len + 1;
    const c = mk(W, H);
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const d = img.data;
    const [r, gg, b] = rgb(st.color);
    const sd = (st.seed & 0xffff) * 0.013;
    for (let j = 0; j < H; j++) {
      const wy = st.top + j;
      const v = st.dir > 0 ? (wy - st.ya) / st.len : (st.ya - wy) / st.len; // 0 at the start of the stroke
      const load = lerp(st.load0, st.load1, clamp(v)) * (1 + 0.25 * Math.exp(-v * st.len / 30));
      const dTop = wy - st.top, dBot = st.top + st.len - wy;
      for (let i = 0; i < W; i++) {
        const u = i / (W - 1);
        const nap = vnoise(i / 1.25 + sd, wy / 15 + sd) * 0.6 + vnoise(i / 4 + sd * 2, wy / 40) * 0.4;
        let a = 0.93 * clamp(load) + 0.07;
        // ragged ends: where the sleeve met and left the wall the edge is torn by the nap
        const edgeN = 6 + 14 * vnoise(i / 9 + sd * 3, 1.5 + sd) + 6 * vnoise(i / 2.5 + sd, 7.1);
        if (dTop < edgeN + 8) a *= sstep(edgeN - 6, edgeN + 8, dTop) * (0.6 + 0.4 * nap);
        if (dBot < edgeN + 8) a *= sstep(edgeN - 6, edgeN + 8, dBot) * (0.6 + 0.4 * nap);
        // dry streaks where the nap ran out of paint
        a *= 1 - 0.75 * sstep(load - 0.1, load + 0.25, 1 - nap) * clamp((1 - load) * 2.2);
        // edge ridges: paint squeezed off the sleeve ends
        const e = Math.min(u, 1 - u) * W;
        let dark = 1;
        if (e < 7) {
          a = Math.max(a, 0.97 - (e < 1.2 ? (1.2 - e) * 0.5 : 0));
          dark = 0.8 + 0.03 * e;
        }
        const k = (j * W + i) * 4;
        const shade = dark * (0.94 + 0.12 * nap);
        d[k] = clamp(r * shade / 255) * 255;
        d[k + 1] = clamp(gg * shade / 255) * 255;
        d[k + 2] = clamp(b * shade / 255) * 255;
        d[k + 3] = clamp(a) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    st.tex = c;
    return c;
  }
  function drawRollerSlice(ctx, st, tA, tB) {
    const ya2 = rollerY(st, tA), yb2 = rollerY(st, tB);
    const r0 = Math.min(ya2, yb2), r1 = Math.max(ya2, yb2);
    if (r1 <= r0) return;
    const tex = rollerTex(st);
    ctx.globalAlpha = 1;
    ctx.drawImage(tex, 0, r0 - st.top, st.W, r1 - r0, st.x, r0, st.W, r1 - r0);
  }
  /** where the can is on stroke st at global time T (null outside its time) */
  SP.strokePos = function strokePos(st, T) {
    if (st.kind === 'roller') {
      if (T < st.t0 - 1e-6 || T > st.t1 + 1e-6) return null;
      return { x: st.x + st.W / 2, y: rollerY(st, clamp(T, st.t0, st.t1)), dx: 0, dy: st.dir };
    }
    let tl = T - st.t0;
    if (tl < -1e-6 || tl > st.total + 1e-6) return null;
    tl = clamp(tl, 0, st.total);
    let w;
    if (tl <= st.d0) w = 0;
    else if (tl >= st.d0 + st.dur) w = st.twTot;
    else {
      const tau = (tl - st.d0) / st.dur;
      w = (tau - (st.ease / TAU) * Math.sin(TAU * tau)) * st.twTot;
    }
    const { X, Y, n } = st.path;
    const TW = st.TW;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (TW[m] < w) lo = m;
      else hi = m;
    }
    const a = TW[lo], b = TW[hi];
    const f = b > a ? clamp((w - a) / (b - a)) : 0;
    const j0 = Math.max(0, lo - 3), j1 = Math.min(n - 1, lo + 3);
    return { x: X[lo] + (X[hi] - X[lo]) * f, y: Y[lo] + (Y[hi] - Y[lo]) * f, dx: X[j1] - X[j0], dy: Y[j1] - Y[j0] };
  };

  /** number of dabs emitted by time T */
  function dabCount(st, T) {
    if (T < st.t0) return 0;
    if (T >= st.t1) return st.nd;
    let lo = 0, hi = st.nd;
    const D = st.dabs;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (D[m * 5 + 4] <= T) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  function speckCount(st, T) {
    if (T < st.t0) return 0;
    if (T >= st.t1) return st.ns;
    let lo = 0, hi = st.ns;
    const D = st.specks;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (D[m * 4 + 3] <= T) lo = m + 1;
      else hi = m;
    }
    return lo;
  }
  const CHUNK = 2048;
  function speckPath(st, i0, i1) {
    const p = new Path2D();
    const D = st.specks;
    for (let i = i0; i < i1; i++) {
      const q = i * 4;
      const r = D[q + 2] * 0.5;
      p.moveTo(D[q] + r, D[q + 1]);
      p.arc(D[q], D[q + 1], r, 0, TAU);
    }
    return p;
  }

  /** draw the stroke's paint up to T into ctx (whatever transform ctx has) */
  function drawStroke(ctx, st, T, alphaMul) {
    const nd = dabCount(st, T);
    if (!nd) return;
    const spr = dabSprite(st.color);
    const D = st.dabs;
    const am = alphaMul != null ? alphaMul : 1;
    for (let k = 0; k < nd; k++) {
      const q = k * 5;
      const e = D[q + 2] * EXT;
      ctx.globalAlpha = D[q + 3] * am;
      ctx.drawImage(spr, D[q] - e, D[q + 1] - e, 2 * e, 2 * e);
    }
    const ns = speckCount(st, T);
    if (ns) {
      ctx.globalAlpha = st.speckAlpha * am;
      ctx.fillStyle = st.color;
      const full = Math.floor(ns / CHUNK);
      for (let c = 0; c < full; c++) {
        let p = st.chunks[c];
        if (!p) p = st.chunks[c] = speckPath(st, c * CHUNK, (c + 1) * CHUNK);
        ctx.fill(p);
      }
      if (ns > full * CHUNK) ctx.fill(speckPath(st, full * CHUNK, ns));
    }
    ctx.globalAlpha = 1;
  }
  SP.drawStroke = drawStroke;

  // ---------------------------------------------------------------------------
  // Masks
  // ---------------------------------------------------------------------------
  /** a piece-sized mask canvas, drawn by fn(g) in wall coordinates; feather = blur px */
  function makeMask(pc, fn, feather) {
    const c = mk(pc.w, pc.h);
    const g = c.getContext('2d');
    g.translate(-pc.x0, -pc.y0);
    g.fillStyle = '#fff';
    g.strokeStyle = '#fff';
    fn(g);
    if (!feather) return c;
    const c2 = mk(pc.w, pc.h);
    const g2 = c2.getContext('2d');
    g2.filter = `blur(${feather}px)`;
    g2.drawImage(c, 0, 0);
    g2.filter = 'none';
    return c2;
  }
  SP.makeMask = makeMask;
  function maskAlpha(c) {
    if (c.__alpha) return c.__alpha;
    const g = c.getContext('2d', { willReadFrequently: true });
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const a = new Uint8Array(c.width * c.height);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    c.__alpha = a;
    return a;
  }
  SP.maskAlpha = maskAlpha;

  // ---------------------------------------------------------------------------
  // Pieces
  // ---------------------------------------------------------------------------
  /*
   * o: { id, box: [x0, y0, x1, y1] (wall coords), groups: [{ strokes: [stroke specs], mask: (pc) => canvas | null,
   *      drip: { thr, max } }], dripThr }
   * Groups composite bottom to top in array order (not time order): an outline group placed under
   * the fill but painted later reads as the writer outlining around the fill.
   */
  /*
   * Canonical draw order: time chunks of CH seconds, and inside a chunk the strokes in group order
   * (each stroke's dabs, then its droplets). A group at time T is "every chunk before T's chunk"
   * (an exact checkpoint, extended chunk by chunk with the very same canvas operations a cold
   * render issues) plus the dabs of the current chunk up to T.
   */
  const CH = 1 / 15;
  SP.CH = CH;
  function chunkIndex(st) {
    if (st.cr) return st.cr;
    const c0 = Math.floor(st.t0 / CH + 1e-9), c1 = Math.floor(st.t1 / CH + 1e-9);
    const n = c1 - c0 + 1;
    const d = new Int32Array(n + 1), q = new Int32Array(n + 1);
    let k = 0, j = 0;
    for (let c = 0; c < n; c++) {
      d[c] = k;
      q[c] = j;
      const tE = (c0 + c + 1) * CH;
      while (k < st.nd && st.dabs[k * 5 + 4] < tE) k++;
      while (j < st.ns && st.specks[j * 4 + 3] < tE) j++;
    }
    d[n] = st.nd;
    q[n] = st.ns;
    st.cr = { c0, c1, d, q, paths: new Array(n) };
    return st.cr;
  }
  /** one stroke's share of chunk c (absolute index), dabs and droplets with t <= Tcut */
  function drawChunk(ctx, st, c, Tcut) {
    const cr = chunkIndex(st);
    if (c < cr.c0 || c > cr.c1) return;
    const i = c - cr.c0;
    const D = st.dabs;
    let k1 = cr.d[i + 1];
    const full = Tcut === Infinity;
    if (st.kind === 'roller') {
      const tA = Math.max(st.t0, c * CH), tB = Math.min(st.t1, (c + 1) * CH, full ? Infinity : Tcut);
      if (tB > tA) drawRollerSlice(ctx, st, tA, tB);
      k1 = cr.d[i]; // pseudo dabs are never drawn
    }
    if (!full) {
      let k = cr.d[i];
      while (k < k1 && D[k * 5 + 4] <= Tcut) k++;
      k1 = k;
    }
    const k0 = cr.d[i];
    if (k1 > k0) {
      const spr = dabSprite(st.color);
      for (let k = k0; k < k1; k++) {
        const o = k * 5;
        const e = D[o + 2] * EXT;
        ctx.globalAlpha = D[o + 3];
        ctx.drawImage(spr, D[o] - e, D[o + 1] - e, 2 * e, 2 * e);
      }
    }
    let j1 = cr.q[i + 1];
    const j0 = cr.q[i];
    if (!full) {
      let j = j0;
      while (j < j1 && st.specks[j * 4 + 3] <= Tcut) j++;
      j1 = j;
    }
    if (j1 > j0) {
      ctx.globalAlpha = st.speckAlpha;
      ctx.fillStyle = st.color;
      let p = full ? cr.paths[i] : null;
      if (!p) {
        p = speckPath(st, j0, j1);
        if (full) cr.paths[i] = p;
      }
      ctx.fill(p);
    }
    ctx.globalAlpha = 1;
  }

  let scratch = null;
  function getScratch(w, h) {
    if (!scratch || scratch.width < w || scratch.height < h) {
      // one shared canvas, sized once for the biggest piece of the film
      const W = Math.max(w, scratch ? scratch.width : 0, 2700), H = Math.max(h, scratch ? scratch.height : 0, 1720);
      scratch = mk(W, H);
    }
    return scratch;
  }

  function piece(o) {
    const pc = { id: o.id, groups: [], o };
    const pad = 6;
    pc.x0 = Math.floor(o.box[0]) - pad;
    pc.y0 = Math.floor(o.box[1]) - pad;
    pc.w = Math.ceil(o.box[2] - o.box[0]) + 2 * pad;
    pc.h = Math.ceil(o.box[3] - o.box[1]) + 2 * pad;
    let tS = 1e9, tE = -1e9;
    o.groups.forEach((gs, gi) => {
      const strokes = gs.strokes.map((s, si) => stroke(Object.assign({ seed: L.hash(o.id, gi, si) }, s)));
      let a = 1e9, b = -1e9;
      for (const s of strokes) {
        a = Math.min(a, s.t0);
        b = Math.max(b, s.t1);
      }
      tS = Math.min(tS, a);
      tE = Math.max(tE, b);
      pc.groups.push({
        strokes, tStart: a, tEnd: b, c0: Math.floor(a / CH + 1e-9), c1: Math.floor(b / CH + 1e-9),
        maskFn: gs.mask || null, mask: null, drip: gs.drip || null, comp: gs.comp || 'source-over', alpha: gs.alpha != null ? gs.alpha : 1, cp: null,
      });
    });
    pc.tStart = tS;
    pc.tEnd = tE;
    pc.drips = null;
    pc.acc = null;
    return pc;
  }
  SP.piece = piece;

  function groupMask(pc, g) {
    if (!g.maskFn) return null;
    if (!g.mask) g.mask = g.maskFn(pc);
    return g.mask;
  }

  /** checkpoint canvas of group g holding every chunk < cEnd (piece-local, unclipped) */
  function checkpoint(pc, g, cEnd) {
    if (!g.cp) g.cp = { c: mk(pc.w, pc.h), k: g.c0 };
    const cp = g.cp;
    const x = cp.c.getContext('2d');
    if (cp.k > cEnd) {
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-over';
      x.globalAlpha = 1;
      x.clearRect(0, 0, pc.w, pc.h);
      cp.k = g.c0;
    }
    if (cp.k < cEnd) {
      x.setTransform(1, 0, 0, 1, -pc.x0, -pc.y0);
      for (let c = cp.k; c < cEnd; c++) for (const st of g.strokes) drawChunk(x, st, c, Infinity);
      x.setTransform(1, 0, 0, 1, 0, 0);
      cp.k = cEnd;
    }
    return cp.c;
  }

  /** group g at time T, clipped by its mask, composited into tctx at (dx, dy) */
  function renderGroup(pc, g, T, tctx, dx, dy) {
    const cT = Math.min(Math.floor(T / CH + 1e-9), g.c1 + 1);
    const cp = checkpoint(pc, g, Math.max(g.c0, cT));
    const sc = getScratch(pc.w + 4, pc.h + 4);
    const s = sc.getContext('2d');
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalAlpha = 1;
    // the sub-rect draw below filters one texel past its edge: keep a clean border there
    s.clearRect(pc.w, 0, 4, pc.h + 4);
    s.clearRect(0, pc.h, pc.w + 4, 4);
    s.save();
    s.beginPath();
    s.rect(0, 0, pc.w, pc.h);
    s.clip();
    s.globalCompositeOperation = 'copy';
    s.drawImage(cp, 0, 0);
    s.globalCompositeOperation = 'source-over';
    if (cT <= g.c1 && cT >= g.c0) {
      s.translate(-pc.x0, -pc.y0);
      for (const st of g.strokes) drawChunk(s, st, cT, T);
      s.setTransform(1, 0, 0, 1, 0, 0);
    }
    const m = groupMask(pc, g);
    if (m) {
      s.globalCompositeOperation = 'destination-in';
      s.drawImage(m, 0, 0);
    }
    s.restore();
    tctx.save();
    tctx.globalCompositeOperation = g.comp;
    tctx.globalAlpha = g.alpha;
    tctx.drawImage(sc, 0, 0, pc.w, pc.h, dx, dy, pc.w, pc.h);
    tctx.restore();
  }

  /** the piece's accumulator: groups 0..k-1 complete (no drips); extended or rebuilt, never patched */
  function accTo(pc, k) {
    if (!pc.acc) pc.acc = { c: mk(pc.w, pc.h), k: 0, fin: false };
    const A = pc.acc;
    const g = A.c.getContext('2d');
    if (A.fin || A.k > k) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, pc.w, pc.h);
      A.k = 0;
      A.fin = false;
    }
    for (let i = A.k; i < k; i++) {
      const gr = pc.groups[i];
      renderGroup(pc, gr, 1e9, g, 0, 0);
      gr.cp = null; // its complete state now lives in the accumulator
    }
    A.k = k;
    return A.c;
  }

  // ---------------------------------------------------------------------------
  // Drips: where pressure x dwell left more paint than the wall can hold
  // ---------------------------------------------------------------------------
  function computeDrips(pc) {
    if (pc.drips) return pc.drips;
    const cell = 6;
    const gw = Math.ceil(pc.w / cell), gh = Math.ceil(pc.h / cell);
    const drips = [];
    pc.groups.forEach((g, gi) => {
      if (!g.drip) return;
      const thr = g.drip.thr != null ? g.drip.thr : 7;
      const load = new Float32Array(gw * gh);
      const cross = new Float32Array(gw * gh).fill(-1);
      const col = new Array(gw * gh);
      const sig = new Float32Array(gw * gh);
      // merge dabs of the group's strokes in time order
      const all = [];
      for (const st of g.strokes) {
        if (!st.drip) continue;
        for (let k = 0; k < st.nd; k++) all.push(st.dabs[k * 5 + 4], k, st);
      }
      const idx = [];
      for (let i = 0; i < all.length; i += 3) idx.push(i);
      idx.sort((a, b) => all[a] - all[b] || a - b);
      for (const i of idx) {
        const st = all[i + 2], k = all[i + 1];
        const q = k * 5;
        const x = st.dabs[q] - pc.x0, y = st.dabs[q + 1] - pc.y0, s = st.dabs[q + 2], a = st.dabs[q + 3] * st.drip;
        const t = st.dabs[q + 4];
        const R = s * 1.6;
        const cx0 = Math.max(0, Math.floor((x - R) / cell)), cx1 = Math.min(gw - 1, Math.floor((x + R) / cell));
        const cy0 = Math.max(0, Math.floor((y - R) / cell)), cy1 = Math.min(gh - 1, Math.floor((y + R) / cell));
        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const ddx = (cx + 0.5) * cell - x, ddy = (cy + 0.5) * cell - y;
            const dd = Math.sqrt(ddx * ddx + ddy * ddy) / s;
            if (dd > 1.6) continue;
            const j = cy * gw + cx;
            load[j] += a * Math.exp(-Math.pow(dd, 2.4));
            col[j] = st.color;
            sig[j] = s;
            if (cross[j] < 0 && load[j] > thr) cross[j] = t;
          }
        }
      }
      const m = groupMask(pc, g);
      const ma = m ? maskAlpha(m) : null;
      const cands = [];
      for (let j = 0; j < gw * gh; j++) if (cross[j] >= 0) cands.push(j);
      cands.sort((a, b) => load[b] - load[a] || a - b);
      const taken = [];
      const maxN = g.drip.max != null ? g.drip.max : 40;
      for (const j of cands) {
        if (taken.length >= maxN) break;
        const cx = j % gw, cy = (j / gw) | 0;
        const x = (cx + 0.5) * cell, y = (cy + 0.5) * cell;
        const s = sig[j];
        // the drip leaves from the lower edge of the wet patch
        let yb = y;
        for (let yy = cy + 1; yy < gh; yy++) {
          if (load[yy * gw + cx] > thr * 0.45) yb = (yy + 0.5) * cell;
          else break;
        }
        const sep = Math.max(10, s * 1.25);
        let ok = true;
        for (const d of taken) if (Math.abs(d.lx - x) < sep && Math.abs(d.ly - yb) < 60) ok = false;
        if (!ok) continue;
        if (ma) {
          const mx = Math.round(x), my = Math.round(yb - s * 0.4);
          if (mx < 0 || my < 0 || mx >= pc.w || my >= pc.h || ma[my * pc.w + mx] < 140) continue;
        }
        if (g.drip.allow && !g.drip.allow(pc, x, yb)) continue;
        if (g.drip.colors && !g.drip.colors.includes(col[j])) continue;
        const hh = h3(j, gi, L.hash(pc.id) & 0xffff);
        const ex = (load[j] - thr) / thr;
        const scale = g.drip.len != null ? g.drip.len : 1;
        let Lmax = clamp(16 + 120 * Math.sqrt(ex) + 70 * hh, 12, 360) * scale * Math.pow(s / 8, 0.35);
        if (g.drip.vary) Lmax *= 0.35 + 1.3 * h3(j, gi, 4321);
        if (g.drip.floorY != null) Lmax = Math.min(Lmax, g.drip.floorY - (yb + pc.y0));
        if (Lmax < 10) continue;
        const w = clamp(s * (0.42 + 0.3 * hh), 2.6, 9) * (g.drip.w != null ? g.drip.w : 1);
        let t0 = cross[j] + 0.07 + 0.18 * h3(j, 6, 9);
        // a drip can be held until a cue and then race (the drop)
        if (g.drip.startAt != null) t0 = Math.max(t0, g.drip.startAt + (g.drip.spread || 0.25) * h3(j, 8, 9));
        let run = (1.0 + 1.6 * h3(j, gi, 77) + Lmax / 260) * (g.drip.runK != null ? g.drip.runK : 1);
        const deadline = g.drip.deadline != null ? g.drip.deadline : SP.DRIP_DEADLINE;
        if (deadline != null) run = Math.min(run, deadline - t0);
        if (run < 0.25) continue;
        taken.push({ lx: x, ly: yb });
        drips.push({
          x: x + pc.x0 + (h3(j, 5, 9) - 0.5) * s * 0.4, y: yb + pc.y0 - s * 0.25, t0,
          run, Lmax: Lmax * Math.min(1, 0.45 + run / 2.2), w, color: col[j], seed: (j * 31 + gi * 977) & 0xffff, group: gi,
        });
      }
    });
    pc.drips = drips;
    let settle = pc.tEnd;
    for (const d of drips) settle = Math.max(settle, d.t0 + d.run);
    pc.tDone = settle;
    return drips;
  }
  SP.computeDrips = computeDrips;
  SP.DRIP_DEADLINE = null;

  // gravity run: slow start while the paint gathers, fastest at a third, settles exactly at d.run
  function dripLen(d, T) {
    const x = (T - d.t0) / d.run;
    if (x <= 0) return 0;
    if (x >= 1) return d.Lmax;
    const q = 1 - x;
    return d.Lmax * (1 - q * q * q * (1 + 3 * x));
  }
  /** draw one drip at time T (wall coords) */
  function drawDrip(ctx, d, T) {
    const len = dripLen(d, T);
    if (len <= 0.5) return;
    const segs = Math.max(3, Math.ceil(len / 7));
    const xs = [], ys = [], ws = [];
    for (let i = 0; i <= segs; i++) {
      const f = i / segs;
      const y = d.y + len * f;
      const x = d.x + 1.6 * L.noise1((len * f) / 26 + d.seed * 0.01, d.seed) + 0.6 * L.noise1((len * f) / 7, d.seed + 3);
      // wide where it leaves the paint, thinning, then the bead
      const w = d.w * (0.62 + 0.75 * Math.exp(-f * 5) + 0.08 * L.noise1(f * 9, d.seed + 7));
      xs.push(x);
      ys.push(y);
      ws.push(w * 0.5);
    }
    ctx.fillStyle = d.color;
    ctx.beginPath();
    ctx.moveTo(xs[0] - ws[0], ys[0] - d.w * 0.6);
    for (let i = 0; i <= segs; i++) ctx.lineTo(xs[i] - ws[i], ys[i]);
    for (let i = segs; i >= 0; i--) ctx.lineTo(xs[i] + ws[i], ys[i]);
    ctx.lineTo(xs[0] + ws[0], ys[0] - d.w * 0.6);
    ctx.closePath();
    ctx.fill();
    // the bead: paint gathers at the tip, a touch bigger while it still runs
    const run = clamp((dripLen(d, T + 0.08) - len) / 6);
    const br = d.w * (0.62 + 0.18 * run);
    const bx = xs[segs], by = ys[segs] + br * 0.35;
    ctx.beginPath();
    ctx.ellipse(bx, by, br, br * 1.18, 0, 0, TAU);
    ctx.fill();
    // wet sheen
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = PAL.white;
    ctx.beginPath();
    ctx.ellipse(bx - br * 0.35, by - br * 0.35, br * 0.28, br * 0.36, -0.4, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.12;
    ctx.fillRect(xs[(segs * 0.5) | 0] - ws[(segs * 0.5) | 0] * 0.55, d.y, Math.max(0.6, d.w * 0.16), len * 0.8);
    ctx.globalAlpha = 1;
  }
  SP.drawDrip = drawDrip;

  /** the piece at T into ctx (ctx carries the camera transform; piece drawn in wall coords) */
  function drawPiece(ctx, pc, T) {
    if (T < pc.tStart) return;
    const drips = computeDrips(pc);
    if (T >= pc.tDone) {
      ctx.drawImage(finalLayer(pc), pc.x0, pc.y0);
      return;
    }
    const G = pc.groups.length;
    let k = 0;
    while (k < G && pc.groups[k].tEnd <= T) k++;
    if (k > 0) ctx.drawImage(accTo(pc, k), pc.x0, pc.y0);
    for (let i = k; i < G; i++) {
      const g = pc.groups[i];
      if (g.tStart > T) continue;
      renderGroup(pc, g, T, ctx, pc.x0, pc.y0);
    }
    for (const d of drips) if (T > d.t0) drawDrip(ctx, d, T);
  }
  SP.drawPiece = drawPiece;

  function finalLayer(pc) {
    if (pc.acc && pc.acc.fin) return pc.acc.c;
    const c = accTo(pc, pc.groups.length);
    if (!pc.acc.fin) {
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, -pc.x0, -pc.y0);
      for (const d of pc.drips) drawDrip(g, d, 1e6);
      g.setTransform(1, 0, 0, 1, 0, 0);
      pc.acc.fin = true;
    }
    return c;
  }
  SP.finalLayer = finalLayer;

  /** every stroke of the piece that is spraying at T, with the can position */
  SP.activeCans = function activeCans(pc, T, out) {
    for (const g of pc.groups) {
      if (T < g.tStart - 0.3 || T > g.tEnd + 0.3) continue;
      for (const st of g.strokes) {
        if (!st.can) continue;
        if (T < st.t0 - 0.25 || T > st.t1 + 0.25) continue;
        out.push({ st, pc });
      }
    }
    return out;
  };

  // ---------------------------------------------------------------------------
  // Marching squares: closed contour loops of a mask (piece-local px)
  // ---------------------------------------------------------------------------
  function contours(c, step, thr) {
    const a = maskAlpha(c);
    const W = c.width, H = c.height;
    const gw = Math.floor((W - 1) / step) + 1, gh = Math.floor((H - 1) / step) + 1;
    const val = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) val[j * gw + i] = a[Math.min(H - 1, j * step) * W + Math.min(W - 1, i * step)];
    const inside = (i, j) => (i < 0 || j < 0 || i >= gw || j >= gh ? 0 : val[j * gw + i] >= thr ? 1 : 0);
    const V = (i, j) => (i < 0 || j < 0 || i >= gw || j >= gh ? 0 : val[j * gw + i]);
    const pt = new Map();
    const adj = new Map();
    const RW = gw + 3;
    // edge ids with indices shifted by +1 so the -1 border row/column stays unique
    const eH = (i, j) => ((j + 1) * RW + (i + 1)) * 2; // edge (i,j)-(i+1,j)
    const eV = (i, j) => ((j + 1) * RW + (i + 1)) * 2 + 1; // edge (i,j)-(i,j+1)
    const ePoint = (id) => {
      let p = pt.get(id);
      if (p) return p;
      const vert = id & 1, k = id >> 1, i = (k % RW) - 1, j = ((k / RW) | 0) - 1;
      const v0 = V(i, j), v1 = vert ? V(i, j + 1) : V(i + 1, j);
      const f = v1 !== v0 ? clamp((thr - v0) / (v1 - v0)) : 0.5;
      p = vert ? [i * step, (j + f) * step] : [(i + f) * step, j * step];
      pt.set(id, p);
      return p;
    };
    const link = (a2, b2) => {
      if (!adj.has(a2)) adj.set(a2, []);
      if (!adj.has(b2)) adj.set(b2, []);
      adj.get(a2).push(b2);
      adj.get(b2).push(a2);
    };
    const SEGS = {
      1: [['l', 'b']], 2: [['b', 'r']], 3: [['l', 'r']], 4: [['t', 'r']], 6: [['t', 'b']], 7: [['l', 't']],
      8: [['l', 't']], 9: [['t', 'b']], 11: [['t', 'r']], 12: [['l', 'r']], 13: [['b', 'r']], 14: [['l', 'b']],
    };
    for (let j = -1; j < gh; j++) {
      for (let i = -1; i < gw; i++) {
        const tl = inside(i, j), tr = inside(i + 1, j), br = inside(i + 1, j + 1), bl = inside(i, j + 1);
        const cs = tl * 8 + tr * 4 + br * 2 + bl;
        if (cs === 0 || cs === 15) continue;
        const E = { t: eH(i, j), r: eV(i + 1, j), b: eH(i, j + 1), l: eV(i, j) };
        let list = SEGS[cs];
        if (cs === 5 || cs === 10) {
          const centre = (V(i, j) + V(i + 1, j) + V(i + 1, j + 1) + V(i, j + 1)) / 4 >= thr;
          if (cs === 5) list = centre ? [['l', 't'], ['b', 'r']] : [['l', 'b'], ['t', 'r']];
          else list = centre ? [['t', 'r'], ['l', 'b']] : [['l', 't'], ['b', 'r']];
        }
        for (const [p2, q2] of list) link(E[p2], E[q2]);
      }
    }
    const seen = new Set();
    const loops = [];
    for (const start of adj.keys()) {
      if (seen.has(start)) continue;
      const loop = [];
      let prev = -1, cur = start;
      for (let guard = 0; guard < 200000; guard++) {
        seen.add(cur);
        loop.push(ePoint(cur));
        const nb = adj.get(cur);
        let nxt = nb[0] === prev ? nb[1] : nb[0];
        if (nxt === undefined || nxt === start || seen.has(nxt)) break;
        prev = cur;
        cur = nxt;
      }
      if (loop.length > 6) loops.push(loop);
    }
    // smooth twice, keep every 2nd point
    return loops.map((lp) => {
      let P = lp;
      for (let it = 0; it < 2; it++) {
        const n = P.length;
        P = P.map((p, k) => {
          const a2 = P[(k - 1 + n) % n], b2 = P[(k + 1) % n];
          return [(a2[0] + 2 * p[0] + b2[0]) / 4, (a2[1] + 2 * p[1] + b2[1]) / 4];
        });
      }
      return P.filter((_, k) => k % 2 === 0);
    });
  }
  SP.contours = contours;

  // ---------------------------------------------------------------------------
  // Geometry helpers for letters and icons (unit coords -> wall coords)
  // ---------------------------------------------------------------------------
  /** transform: { x, y, s, rot, shear } maps unit point p to wall coords */
  function tf(o, p) {
    const px = (p[0] + (o.shear || 0) * (p[1] - 1)) * o.s, py = p[1] * o.s * (o.sy || 1);
    const c = Math.cos(o.rot || 0), s = Math.sin(o.rot || 0);
    return [o.x + px * c - py * s, o.y + px * s + py * c];
  }
  SP.tf = tf;

  /** arc points: centre, radius, a0..a1 (radians), n */
  SP.arc = (cx, cy, r, a0, a1, n, ry) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * (ry != null ? ry : r)]);
    }
    return out;
  };

  function pathOf(pts, smooth, closed) {
    const d = densePath(pts, smooth, 2, closed);
    const p = new Path2D();
    p.moveTo(d.X[0], d.Y[0]);
    for (let i = 1; i < d.n; i++) p.lineTo(d.X[i], d.Y[i]);
    if (closed) p.closePath();
    return p;
  }
  SP.pathOf = pathOf;

  // ---------------------------------------------------------------------------
  // Throw-up / piece letters from a skeleton: fill, fades, 3D block, outline, highlights
  // ---------------------------------------------------------------------------
  /*
   * o: { id, glyphs: [{ x, y, s, rot, shear, strokes: [{ pts, smooth }], polys: [[pts]] , dot? }],
   *      fat, ow (outline width), ext: [dx, dy], col: { fill, fades: [{ color, y, h, opacity }], block, blockDark, line, hl },
   *      time: { fill: [t0, perGlyph, overlap], fades: [t0, dur], block: [t0, dur], line: [t0, speed, cans], hl: [t0, dur] },
   *      hl: true, drip: { thr } }
   */
  function throwup(o) {
    const fat = o.fat, ow = o.ow;
    const ext = o.ext || [0, 0];
    const extLen = Math.hypot(ext[0], ext[1]);
    const nShift = Math.max(1, Math.ceil(extLen / 2.5));
    // wall-space skeleton
    const strokes = [], polys = [];
    o.glyphs.forEach((g, gi) => {
      for (const s of g.strokes || []) strokes.push({ pts: s.pts.map((p) => tf(g, p)), smooth: s.smooth !== false, gi, w: s.w || 1, hl: s.hl !== false });
      for (const p of g.polys || []) polys.push({ pts: p.map((q) => tf(g, q)), gi });
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes.concat(polys)) for (const p of s.pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    const m = fat / 2 + ow + 40;
    const box = [x0 - m + Math.min(0, ext[0]), y0 - m + Math.min(0, ext[1]), x1 + m + Math.max(0, ext[0]), y1 + m + Math.max(0, ext[1]) + (o.dripRoom || 160)];
    const paths = strokes.map((s) => ({ p: pathOf(s.pts, s.smooth, false), w: s.w }));
    const ppaths = polys.map((s) => pathOf(s.pts, false, true));
    const shape = (g, extra, dx, dy) => {
      g.save();
      g.translate(dx, dy);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      for (const s of paths) {
        g.lineWidth = fat * s.w + extra;
        g.stroke(s.p);
      }
      for (const p of ppaths) {
        g.fill(p);
        if (extra > 0) {
          g.lineWidth = extra;
          g.stroke(p);
        }
      }
      g.restore();
    };
    const shifted = (g, extra) => {
      for (let k = 0; k <= nShift; k++) shape(g, extra, (ext[0] * k) / nShift, (ext[1] * k) / nShift);
    };
    const C = o.col, TM = o.time;
    const groups = [];
    const cans = o.cans || ['a', 'b', 'c'];
    // --- group 0: 3D block (under everything), painted after the fill
    if (extLen > 0 && TM.block) {
      const bs = [];
      const [bt0, bdur] = TM.block;
      const per = bdur / Math.max(1, strokes.length);
      strokes.forEach((s, i) => {
        bs.push({
          pts: s.pts.map((p) => [p[0] + ext[0] * 0.6, p[1] + ext[1] * 0.6]), smooth: s.smooth, t0: bt0 + i * per * 0.8, dur: per, color: C.block,
          sigma: (fat * s.w * 0.5 + extLen) * 0.42, opacity: 0.97, speck: 0.15, tremor: 0.3, canId: cans[i % cans.length], drip: 0,
        });
      });
      if (C.blockDark) {
        strokes.forEach((s, i) => {
          bs.push({
            pts: s.pts.map((p) => [p[0] + ext[0] * 1.1, p[1] + ext[1] * 1.1]), smooth: s.smooth, t0: bt0 + bdur * 0.45 + i * per * 0.5, dur: per * 0.7, color: C.blockDark,
            sigma: fat * s.w * 0.22, opacity: 0.55, speck: 0.3, tremor: 0.3, can: false, drip: 0,
          });
        });
      }
      groups.push({
        strokes: bs,
        mask: (pc) => {
          const c = makeMask(pc, (g) => shifted(g, 0), 0);
          const g = c.getContext('2d');
          g.globalCompositeOperation = 'destination-out';
          g.translate(-pc.x0, -pc.y0);
          shape(g, 0, 0, 0);
          return c;
        },
      });
    }
    // --- group 1: fill and fades (clip: the letter plus its outline ring, soft)
    const fs = [];
    const [ft0, fper, fover] = TM.fill;
    o.glyphs.forEach((g, gi) => {
      const own = strokes.filter((s) => s.gi === gi);
      const ownP = polys.filter((s) => s.gi === gi);
      const tg = ft0 + gi * fper * (1 - (fover || 0));
      own.forEach((s, si) => {
        const d = fper / Math.max(1, own.length + ownP.length);
        if (o.passes2) {
          // two visible passes either side of the skeleton, out and back
          const off = (sign) => {
            const dp = densePath(s.pts, s.smooth, 4, false);
            const out = [];
            for (let i = 0; i < dp.n; i += 3) {
              const j0 = Math.max(0, i - 2), j1 = Math.min(dp.n - 1, i + 2);
              let tx = dp.X[j1] - dp.X[j0], ty = dp.Y[j1] - dp.Y[j0];
              const l = Math.hypot(tx, ty) || 1;
              out.push([dp.X[i] - (ty / l) * fat * s.w * 0.2 * sign, dp.Y[i] + (tx / l) * fat * s.w * 0.2 * sign]);
            }
            const last = dp.n - 1;
            out.push([dp.X[last], dp.Y[last]]);
            return out;
          };
          const a1 = off(1), a2 = off(-1).reverse();
          fs.push({ pts: a1, smooth: true, t0: tg + si * d, dur: d * 0.46, color: C.fill, sigma: fat * s.w * 0.24, opacity: 0.99, speck: 0.5, tremor: 0.5, d0: 0.02, ease: 0.25, canId: cans[gi % cans.length], drip: 0.6 });
          fs.push({ pts: a2, smooth: true, t0: tg + si * d + d * 0.47, dur: d * 0.46, color: C.fill, sigma: fat * s.w * 0.24, opacity: 0.99, speck: 0.5, tremor: 0.5, d0: 0.0, ease: 0.25, canId: cans[gi % cans.length], drip: 0.6 });
        } else {
          fs.push({ pts: s.pts, smooth: s.smooth, t0: tg + si * d, dur: d * 0.92, color: C.fill, sigma: fat * s.w * 0.36, opacity: 0.985, speck: 0.35, tremor: 0.4, d0: 0.02, canId: cans[gi % cans.length], drip: 0.6 });
        }
      });
      ownP.forEach((p, pi) => {
        // polygons fill with a zigzag across their box
        let a = 1e9, b = -1e9, c2 = 1e9, d2 = -1e9;
        for (const q of p.pts) {
          a = Math.min(a, q[0]);
          b = Math.max(b, q[0]);
          c2 = Math.min(c2, q[1]);
          d2 = Math.max(d2, q[1]);
        }
        const zz = [];
        const rows = Math.max(2, Math.ceil((d2 - c2) / (fat * 0.5)));
        for (let r = 0; r <= rows; r++) {
          const yy = c2 + ((d2 - c2) * r) / rows;
          zz.push(r % 2 ? [b, yy] : [a, yy]);
          zz.push(r % 2 ? [a, yy] : [b, yy]);
        }
        const d = fper / Math.max(1, own.length + ownP.length);
        fs.push({ pts: zz, smooth: false, t0: tg + (own.length + pi) * d, dur: d * 0.92, color: C.fill, sigma: fat * 0.3, opacity: 0.95, speck: 0.3, kc: 0.2, canId: cans[gi % cans.length], drip: 0.5 });
      });
    });
    if (C.fades && TM.fades) {
      const [ft, fd] = TM.fades;
      C.fades.forEach((fd2, i) => {
        // a horizontal sweep across the whole piece at height y (wall coords), back and forth
        const yy = fd2.y, hh = fd2.h || fat;
        const pts = [];
        const passes = fd2.passes || 2;
        for (let k = 0; k <= passes; k++) pts.push([k % 2 ? x1 + 30 : x0 - 30, yy + ((k % 2) - 0.5) * hh * 0.25]);
        fs.push({ pts, smooth: true, t0: ft + (i * fd) / C.fades.length, dur: fd / C.fades.length, color: fd2.color, sigma: hh * 0.42, opacity: fd2.opacity || 0.7, speck: 0.25, kc: 0.3, tremor: 0.6, canId: fd2.can || cans[(i + 1) % cans.length], drip: 0.3 });
      });
    }
    groups.push({ strokes: fs, drip: o.fillDrip || null, mask: (pc) => makeMask(pc, (g) => shape(g, ow * (o.fillReach != null ? o.fillReach : 2.3), 0, 0), o.fillFeather != null ? o.fillFeather : 4.5) });
    // --- outlines traced along mask contours, like a writer's cap following the edge
    const holder = { x0: Math.floor(box[0]) - 6, y0: Math.floor(box[1]) - 6, w: Math.ceil(box[2] - box[0]) + 12, h: Math.ceil(box[3] - box[1]) + 12 };
    const traceStrokes = (loops, t0, speed, nCan, color, sigma, canPrefix, extra) => {
      const segs = loops.map((lp) => {
        let len = 0;
        for (let i = 1; i < lp.length; i++) len += Math.hypot(lp[i][0] - lp[i - 1][0], lp[i][1] - lp[i - 1][1]);
        let mx = 1e9;
        for (const p of lp) mx = Math.min(mx, p[0]);
        let ti = 0;
        for (let i = 1; i < lp.length; i++) if (lp[i][1] < lp[ti][1]) ti = i;
        const rot = lp.slice(ti).concat(lp.slice(0, ti + 1));
        return { pts: rot.map((p) => [p[0] + holder.x0, p[1] + holder.y0]), len, mx };
      });
      segs.sort((a2, b2) => a2.mx - b2.mx);
      // a loop much longer than its share is split into consecutive runs for several cans
      const total = segs.reduce((a2, sg) => a2 + sg.len, 0);
      const share = total / Math.max(1, nCan || 3);
      const runs = [];
      for (const sg of segs) {
        const k = Math.max(1, Math.round(sg.len / (share * 1.05)));
        if (k === 1) {
          runs.push(sg);
          continue;
        }
        const n = sg.pts.length;
        for (let q = 0; q < k; q++) {
          const a2 = Math.floor((q * n) / k), b2 = Math.min(n, Math.floor(((q + 1) * n) / k) + 3);
          const pts = sg.pts.slice(a2, b2);
          let len = 0;
          for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          runs.push({ pts, len, mx: sg.mx + q });
        }
      }
      segs.length = 0;
      segs.push(...runs);
      const canT = new Array(nCan || 3).fill(t0);
      const out = [];
      const gate = extra && extra.notBefore;
      segs.forEach((sg) => {
        let ci = 0;
        for (let c = 1; c < canT.length; c++) if (canT[c] < canT[ci]) ci = c;
        if (gate) {
          let mx2 = -1e9;
          for (const p of sg.pts) mx2 = Math.max(mx2, p[0]);
          canT[ci] = Math.max(canT[ci], gate(mx2));
        }
        const dur = Math.max(0.08, sg.len / speed);
        const ex2 = Object.assign({}, extra || {});
        delete ex2.notBefore;
        out.push(Object.assign({ pts: sg.pts, smooth: false, t0: canT[ci], dur, color, sigma, opacity: 0.99, speck: 0.8, tremor: 0.45, sigVar: 0.16, kc: 0.35, ease: 0.3, d0: 0.035, d1: 0.02, canId: canPrefix + ci, drip: 1 }, ex2));
        canT[ci] += dur + 0.05;
      });
      return out;
    };
    if (TM.line) {
      const [lt0, speed, nCan] = TM.line;
      const outer = makeMask(holder, (g) => shifted(g, ow), 0);
      const own = makeMask(holder, (g) => shape(g, ow, 0, 0), 0);
      const loops = contours(outer, 2, 128).concat(extLen > 0 ? contours(own, 2, 128) : []);
      const lineStrokes = traceStrokes(loops, lt0, speed, nCan, C.line, ow * 0.4, (o.canPrefix || '') + 'L');
      groups.push({
        strokes: lineStrokes,
        drip: Object.assign({ thr: 9, max: 14, len: 1 }, o.lineDrip || {}, {
          // an outline drip only runs where nothing of the letter lies below it
          allow: (pc, x, y) => {
            if (!pc.fillOnly) pc.fillOnly = makeMask(pc, (g) => shifted(g, 0), 0);
            const a2 = maskAlpha(pc.fillOnly);
            for (const dy of [4, 14, 34, 60]) {
              const xx = Math.round(x), yy = Math.round(y + dy);
              if (yy >= pc.h) break;
              if (a2[yy * pc.w + xx] > 40) return false;
            }
            return true;
          },
        }),
        mask: (pc) => {
          const c = makeMask(pc, (g) => shifted(g, ow * 2), 1.0);
          const g = c.getContext('2d');
          g.globalCompositeOperation = 'destination-out';
          g.translate(-pc.x0, -pc.y0);
          shape(g, 0, 0, 0);
          return c;
        },
      });
    }
    // sketch: a thin light line traced round the letters before anything else (bottom of the stack)
    if (TM.sketch) {
      const [k0, kspeed, kcans, kcol, ksig, kgate] = TM.sketch;
      const own2 = makeMask(holder, (g) => shape(g, 0, 0, 0), 0);
      const kl = contours(own2, 2, 128).filter((lp) => lp.length > 20);
      const ks = traceStrokes(kl, k0, kspeed, kcans, kcol, ksig || 3.2, (o.canPrefix || '') + 'K', { drip: 0, speck: 1.6, speckSpread: 2.2, opacity: 0.7, sigVar: 0.45, d0: 0.02, d1: 0.01, tremor: 1.4, alpha: 0.85, notBefore: kgate });
      groups.unshift({ strokes: ks });
    }
    // second outline: a light ring outside the black one, under it in the stack, painted last
    if (TM.line2 && o.ow2) {
      const [t2, speed2, nCan2] = TM.line2;
      const ow2 = o.ow2;
      const mid = makeMask(holder, (g) => shifted(g, ow * 2 + ow2), 0);
      const loops2 = contours(mid, 2, 128).filter((lp) => lp.length > 40);
      const st2 = traceStrokes(loops2, t2, speed2, nCan2, C.line2, ow2 * 0.42, (o.canPrefix || '') + 'O', { drip: 0, speck: 0.6 });
      groups.unshift({
        strokes: st2,
        mask: (pc) => {
          const c = makeMask(pc, (g) => shifted(g, ow * 2 + ow2 * 2), 1.2);
          const g = c.getContext('2d');
          g.globalCompositeOperation = 'destination-out';
          g.translate(-pc.x0, -pc.y0);
          shifted(g, ow * 1.6);
          return c;
        },
      });
    }
    // --- group 3: highlights: short white shines hugging the lit (upper-left) inner edge
    if (TM.hl) {
      const [ht0, hdur] = TM.hl;
      const hs = [];
      const nx = -0.6, ny = -0.8;
      strokes.forEach((s2) => {
        if (!s2.hl) return;
        const d = densePath(s2.pts, s2.smooth, 3, false);
        const total = d.S[d.n - 1];
        if (total < fat * 0.9) return;
        let run = [];
        const flush = () => {
          const need = Math.max(6, (fat * 0.9) / 3);
          if (run.length > need) {
            // a short shine: from 12% to 42% of the lit run
            const k0 = Math.floor(run.length * 0.12), k1 = Math.max(k0 + 4, Math.floor(run.length * 0.42));
            const pts = run.slice(k0, Math.min(run.length, k1 + 1));
            if (pts.length >= 4) hs.push({ pts, smooth: true, color: C.hl, sigma: Math.max(2.4, fat * 0.05), opacity: 0.95, speck: 0.35, tremor: 0.15, can: true, canId: 'H', drip: 0, ease: 0.2 });
          }
          run = [];
        };
        for (let i = 0; i < d.n; i++) {
          const j0 = Math.max(0, i - 2), j1 = Math.min(d.n - 1, i + 2);
          let tx = d.X[j1] - d.X[j0], ty = d.Y[j1] - d.Y[j0];
          const l = Math.hypot(tx, ty) || 1;
          tx /= l;
          ty /= l;
          let ax = -ty, ay = tx;
          if (ax * nx + ay * ny < 0) {
            ax = -ax;
            ay = -ay;
          }
          if (ax * nx + ay * ny > 0.55) run.push([d.X[i] + ax * fat * s2.w * 0.29, d.Y[i] + ay * fat * s2.w * 0.29]);
          else flush();
        }
        flush();
      });
      // polygons (icons): shines inset from their lit edges
      polys.forEach((pl) => {
        const P = pl.pts;
        let cx = 0, cy = 0;
        for (const q of P) {
          cx += q[0];
          cy += q[1];
        }
        cx /= P.length;
        cy /= P.length;
        const d = densePath(P, false, 3, true);
        let run = [];
        const inset = Math.max(7, ow * 0.9);
        const flush = () => {
          if (run.length > 8) {
            const k0 = Math.floor(run.length * 0.15), k1 = Math.floor(run.length * 0.5);
            const pts = run.slice(k0, k1 + 1);
            if (pts.length >= 4) hs.push({ pts, smooth: true, color: C.hl, sigma: Math.max(2.2, ow * 0.2), opacity: 0.95, speck: 0.35, tremor: 0.15, canId: 'H', drip: 0, ease: 0.2 });
          }
          run = [];
        };
        for (let i = 0; i < d.n; i++) {
          const j0 = Math.max(0, i - 2), j1 = Math.min(d.n - 1, i + 2);
          let tx = d.X[j1] - d.X[j0], ty = d.Y[j1] - d.Y[j0];
          const l = Math.hypot(tx, ty) || 1;
          tx /= l;
          ty /= l;
          let ax = -ty, ay = tx;
          if ((d.X[i] - cx) * ax + (d.Y[i] - cy) * ay < 0) {
            ax = -ax;
            ay = -ay;
          }
          if (ax * nx + ay * ny > 0.5) run.push([d.X[i] - ax * inset, d.Y[i] - ay * inset]);
          else flush();
        }
        flush();
      });
      const per2 = hdur / Math.max(1, hs.length);
      hs.forEach((h, i) => {
        h.t0 = ht0 + i * per2 * 0.8;
        h.dur = Math.max(0.05, per2 * 0.75);
      });
      if (hs.length) groups.push({ strokes: hs, mask: (pc) => makeMask(pc, (g) => shape(g, -fat * 0.1, 0, 0), 0.8) });
    }
    if (o.marks && o.marks.length) groups.push({ strokes: o.marks, drip: o.marksDrip || null });
    return piece({ id: o.id, box, groups });
  }
  SP.throwup = throwup;

  /** a sparkle (four-point star) as four flicks out of a centre, as a group spec */
  SP.sparkle = function sparkle(cx, cy, r, t0, color, canId) {
    const out = [];
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    dirs.forEach((d, i) => {
      const L2 = r * (i % 2 ? 0.75 : 1);
      out.push({ pts: [[cx, cy], [cx + d[0] * L2, cy + d[1] * L2]], smooth: false, t0: t0 + i * 0.035, dur: 0.07, d0: 0.012, color, sigma: Math.max(2, r * 0.07), opacity: 0.9, ease: -0.7, speck: 0.5, tremor: 0.1, can: i === 0, canId: canId || 'H', drip: 0 });
    });
    return out;
  };

  // ---------------------------------------------------------------------------
  // Tags: fast handstyle scribbles (one connected run plus an underline swoosh)
  // ---------------------------------------------------------------------------
  const TAGT = [
    [[0, 1], [0.22, -0.05], [0.33, 0.12], [0.08, 0.72], [0.42, 1]],
    [[0, 1], [0.02, 0.38], [0.28, 0.3], [0.44, 0.62], [0.5, 1]],
    [[0, 0.32], [0.48, 0.3], [0.02, 1], [0.56, 0.98]],
    [[0.42, 0.34], [0.05, 0.5], [0.18, 1.0], [0.5, 0.72], [0.4, 0.32], [0.6, 0.95]],
    [[0, 0.72], [0.46, 0.56], [0.3, 0.3], [0.02, 0.6], [0.2, 1], [0.56, 0.86]],
    [[0, 1], [0.04, 0.36], [0.32, 0.26], [0.5, 0.42]],
    [[0.5, 0.32], [0.08, 0.38], [0.44, 0.66], [0.02, 1]],
    [[0, 0.05], [0.04, 1], [0.2, 0.55], [0.48, 0.3], [0.2, 0.62], [0.52, 1]],
  ];
  /** unit-height tag skeleton: [{ pts, kind }] with x running right, y down (0 top, 1 baseline) */
  SP.tagSkeleton = function tagSkeleton(seed, nLetters) {
    const R = L.rng(L.hash('tag', seed));
    const n = nLetters || R.int(3, 5);
    const main = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const tpl = TAGT[R.int(0, TAGT.length - 1)];
      const sc = R.range(0.85, 1.15), sx = R.range(0.8, 1.2);
      const dy = R.range(-0.08, 0.08);
      tpl.forEach((p, k) => {
        if (i > 0 && k === 0) return;
        main.push([x + p[0] * sx * sc - (p[1] - 1) * 0.28, (p[1] - 1) * sc + 1 + dy]);
      });
      x = main[main.length - 1][0] + R.range(0.05, 0.16);
    }
    const end = main[main.length - 1];
    const under = [
      [end[0] + 0.1, end[1] - 0.15], [end[0] + 0.32, 1.12], [x * 0.5, 1.3 + R.range(-0.05, 0.06)], [-0.25, 1.2], [-0.1, 1.08],
    ];
    const out = [{ pts: main, kind: 'main' }, { pts: under, kind: 'under' }];
    if (R.chance(0.6)) out.push({ pts: [[x * R.range(0.2, 0.8), -0.32], [x * R.range(0.2, 0.8) + 0.02, -0.3]], kind: 'dot' });
    return out;
  };

  /** a tag as piece groups (one group), placed at x,y (top-left of the letters' box), height h */
  SP.tag = function tag(o) {
    const sk = SP.tagSkeleton(o.seed, o.letters);
    const T = Object.assign({ x: o.x, y: o.y, s: o.h, rot: o.rot || 0, shear: 0 }, {});
    const strokes = [];
    let t = o.t0;
    sk.forEach((part, i) => {
      const pts = part.pts.map((p) => tf(T, p));
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]);
      const dur = part.kind === 'dot' ? 0.05 : Math.max(0.12, len / (o.speed || 1500));
      strokes.push({ pts, smooth: true, t0: t, dur, d0: i === 0 ? 0.05 : 0.02, d1: 0.03, color: o.color, sigma: o.sigma || 4.5, opacity: 0.97, speck: o.speck != null ? o.speck : 1, kc: 1.1, tremor: 0.6, canId: o.canId, drip: 1, alpha: o.alpha });
      t += dur + (part.kind === 'main' ? 0.05 : 0.02);
    });
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const p of s.pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    const m = (o.sigma || 4.5) * 6;
    return { box: [x0 - m, y0 - m, x1 + m, y1 + m + (o.dripRoom != null ? o.dripRoom : 140)], strokes, drip: o.drip || { thr: 8, max: 10 } };
  };

  // ---------------------------------------------------------------------------
  // Stencils: a card held on the wall, sprayed over, lifted to reveal crisp paint with soft overspray
  // ---------------------------------------------------------------------------
  /*
   * o: { id, card: { x, y, w, h }, cut: (g) => draws the cut-out shapes in wall coords (white),
   *      strokes: [stroke specs, wall coords], tPlace, tLift, lift: { dx, dy, rot }, seed }
   */
  function stencil(o) {
    const cd = o.card;
    const over = o.over != null ? o.over : 90;
    const box = [cd.x - over, cd.y - over, cd.x + cd.w + over, cd.y + cd.h + over + (o.dripRoom != null ? o.dripRoom : 80)];
    const cutLocal = () => {
      // card-local cut mask with stencil bridges already in the drawing
      const c = mk(cd.w, cd.h);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.translate(-cd.x, -cd.y);
      o.cut(g);
      return c;
    };
    const st = { id: o.id, card: cd, o, cutC: null, base: null, live: null, fin: null };
    st.cutMask = () => st.cutC || (st.cutC = cutLocal());
    const pc = piece({
      id: o.id,
      box,
      groups: [{
        strokes: o.strokes,
        drip: o.drip || { thr: 6.5, max: 18, len: 0.8 },
        mask: (p) => {
          const c = mk(p.w, p.h);
          const g = c.getContext('2d');
          // overspray reaches the wall around the card; the card edge leaves a soft line
          g.fillStyle = '#fff';
          g.globalAlpha = o.halo != null ? o.halo : 1;
          g.fillRect(0, 0, p.w, p.h);
          g.globalAlpha = 1;
          g.globalCompositeOperation = 'destination-out';
          g.filter = 'blur(2.2px)';
          g.fillRect(cd.x - p.x0, cd.y - p.y0, cd.w, cd.h);
          for (const sh of o.shield || []) g.fillRect(sh.x - p.x0, sh.y - p.y0, sh.w, sh.h);
          g.filter = 'blur(0.9px)';
          g.globalCompositeOperation = 'source-over';
          g.drawImage(st.cutMask(), cd.x - p.x0, cd.y - p.y0);
          g.filter = 'none';
          return c;
        },
      }],
    });
    st.pc = pc;
    st.tPaint0 = pc.tStart;
    st.tPaint1 = pc.tEnd;
    return st;
  }
  SP.stencil = stencil;

  /** stencil card base: cardboard, masking tape, paint ghosts from earlier use; holes cut */
  function cardBase(st) {
    if (st.base) return st.base;
    const cd = st.card;
    const c = mk(cd.w, cd.h);
    const g = c.getContext('2d');
    const img = g.createImageData(cd.w, cd.h);
    const d = img.data;
    const [r0, g0, b0] = rgb(PAL.card);
    const sd = (L.hash(st.id, 'card') & 0xffff) * 0.37;
    for (let y = 0; y < cd.h; y++) {
      for (let x = 0; x < cd.w; x++) {
        const fib = vnoise(x / 1.6 + sd, y / 9 + sd) * 0.5 + vnoise(x / 7 + sd, y / 3) * 0.5;
        const big = fbm(x / 120 + sd, y / 120, 2);
        const edge = Math.min(x, y, cd.w - 1 - x, cd.h - 1 - y);
        let v = 0.9 + (fib - 0.5) * 0.16 + (big - 0.5) * 0.14 - (edge < 6 ? (6 - edge) * 0.03 : 0);
        const i = (y * cd.w + x) * 4;
        d[i] = r0 * v;
        d[i + 1] = g0 * v;
        d[i + 2] = b0 * v;
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // ghosts of earlier sprays on the card
    const R = L.rng(L.hash(st.id, 'ghost'));
    const ghostCols = [PAL.magenta, PAL.cyan, PAL.black, PAL.yellow, PAL.violet];
    for (let k = 0; k < 9; k++) {
      const gx = R.range(0, cd.w), gy = R.range(0, cd.h), rr = R.range(30, 120);
      const grd = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
      const col = ghostCols[k % ghostCols.length];
      grd.addColorStop(0, SP.rgba(col, R.range(0.12, 0.3)));
      grd.addColorStop(1, SP.rgba(col, 0));
      g.fillStyle = grd;
      g.fillRect(gx - rr, gy - rr, 2 * rr, 2 * rr);
    }
    // masking tape at two corners
    g.fillStyle = 'rgba(236,226,196,0.82)';
    for (const [tx, ty, a] of [[18, 10, -0.5], [cd.w - 18, cd.h - 10, -0.5]]) {
      g.save();
      g.translate(tx, ty);
      g.rotate(a);
      g.fillRect(-34, -11, 68, 22);
      g.restore();
    }
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(st.cutMask(), 0, 0);
    // slightly ragged cut edges: a 1px darker rim inside the holes
    st.base = c;
    return c;
  }

  /** the card's own surface at T (base + the spray that landed on it), card-local */
  function cardAt(st, T) {
    const cd = st.card;
    const base = cardBase(st);
    if (T < st.tPaint0) return base;
    const done = T >= st.tPaint1;
    if (done && st.fin) return st.fin;
    let c;
    if (done) c = st.fin = mk(cd.w, cd.h);
    else c = st.live || (st.live = mk(cd.w, cd.h));
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, cd.w, cd.h);
    g.translate(-cd.x, -cd.y);
    for (const s of st.pc.groups[0].strokes) if (T >= s.t0) drawStroke(g, s, done ? 1e9 : T);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(base, 0, 0);
    g.globalCompositeOperation = 'source-over';
    return c;
  }

  /** draw the card object (in wall coords, ctx under the camera) */
  SP.drawCard = function drawCard(ctx, st, T) {
    const o = st.o, cd = st.card;
    const tIn = o.tPlace, tOut = o.tLift;
    if (T < tIn - 0.16 || T > tOut + 0.62) return;
    const qin = sstep(tIn - 0.16, tIn, T);
    const u = sstep(tOut, tOut + 0.55, T);
    const lift = o.lift || { dx: -1, dy: -0.6, rot: -0.22 };
    const sc = 1 + 0.16 * (1 - qin) + 0.32 * u;
    const alpha = qin * (1 - sstep(0.55, 1, u));
    const cx = cd.x + cd.w / 2 + lift.dx * cd.w * 0.7 * u * u, cy = cd.y + cd.h / 2 + lift.dy * cd.h * 1.4 * u * u - 18 * (1 - qin);
    const rot = (lift.rot || 0) * u;
    const sh = 3 + 26 * (1 - qin) + 70 * u;
    ctx.save();
    ctx.globalAlpha = alpha * 0.5;
    ctx.filter = `blur(${(2 + sh * 0.35).toFixed(1)}px)`;
    ctx.fillStyle = PAL.grime;
    ctx.translate(cx + sh * 0.6, cy + sh * 0.8);
    ctx.rotate(rot);
    ctx.scale(sc * 0.98, sc * 0.98);
    ctx.fillRect(-cd.w / 2, -cd.h / 2, cd.w, cd.h);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(sc, sc * (1 - 0.18 * u));
    ctx.drawImage(cardAt(st, T), -cd.w / 2, -cd.h / 2);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // The spray can
  // ---------------------------------------------------------------------------
  const canCache = new Map();
  function canSprite(color) {
    let c = canCache.get(color);
    if (c) return c;
    const W = 120, H = 330;
    c = mk(W, H);
    const g = c.getContext('2d');
    const cyl = (x0, x1, y0, y1, base, light) => {
      const grd = g.createLinearGradient(x0, 0, x1, 0);
      grd.addColorStop(0, SP.mixHex(base, '#000000', 0.55));
      grd.addColorStop(0.18, SP.mixHex(base, '#000000', 0.15));
      grd.addColorStop(0.33, SP.mixHex(base, light, 0.55));
      grd.addColorStop(0.42, SP.mixHex(base, light, 0.2));
      grd.addColorStop(0.75, SP.mixHex(base, '#000000', 0.25));
      grd.addColorStop(1, SP.mixHex(base, '#000000', 0.7));
      return grd;
    };
    // body
    g.fillStyle = cyl(16, 104, 0, 0, PAL.canBody, '#ffffff');
    g.beginPath();
    g.moveTo(16, 92);
    g.lineTo(16, 312);
    g.quadraticCurveTo(16, 324, 60, 326);
    g.quadraticCurveTo(104, 324, 104, 312);
    g.lineTo(104, 92);
    g.closePath();
    g.fill();
    // label band in the paint colour
    g.fillStyle = cyl(16, 104, 0, 0, color, '#ffffff');
    g.fillRect(16, 150, 88, 92);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(16, 196, 88, 5);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(16, 150, 88, 2);
    g.fillRect(16, 240, 88, 2);
    // shoulder dome
    g.fillStyle = cyl(18, 102, 0, 0, PAL.canMetal, '#ffffff');
    g.beginPath();
    g.moveTo(16, 94);
    g.bezierCurveTo(18, 64, 38, 56, 60, 56);
    g.bezierCurveTo(82, 56, 102, 64, 104, 94);
    g.closePath();
    g.fill();
    // cap in the paint colour
    g.fillStyle = cyl(30, 90, 0, 0, color, '#ffffff');
    g.beginPath();
    g.moveTo(32, 66);
    g.lineTo(34, 30);
    g.quadraticCurveTo(60, 22, 86, 30);
    g.lineTo(88, 66);
    g.quadraticCurveTo(60, 72, 32, 66);
    g.fill();
    // actuator
    g.fillStyle = cyl(48, 72, 0, 0, PAL.nozzle, '#ffffff');
    g.beginPath();
    g.moveTo(48, 30);
    g.lineTo(49, 12);
    g.quadraticCurveTo(60, 8, 71, 12);
    g.lineTo(72, 30);
    g.closePath();
    g.fill();
    // rim lines
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(16, 94);
    g.quadraticCurveTo(60, 100, 104, 94);
    g.stroke();
    canCache.set(color, c);
    return c;
  }
  SP.canSprite = canSprite;
  let canShadowC = null;
  function canShadow() {
    if (canShadowC) return canShadowC;
    const raw = mk(116, 250);
    const g = raw.getContext('2d');
    g.fillStyle = PAL.grime;
    g.fillRect(30, 30, 56, 190);
    canShadowC = mk(116, 250);
    const f = canShadowC.getContext('2d');
    f.filter = 'blur(9px)';
    f.drawImage(raw, 0, 0);
    f.filter = 'none';
    return canShadowC;
  }

  /**
   * the can spraying at wall point (x, y): tilt follows the motion, a mist puff blooms at the spot.
   * sigma: spray size, on: 0..1 spraying, vis: 0..1 presence, T: global time for the mist grain
   */
  SP.drawCan = function drawCan(ctx, x, y, color, sigma, tilt, on, vis, T, seed) {
    if (vis <= 0) return;
    const spr = canSprite(color);
    // the can stands off the wall, down and right of the spot it hits, leaning back into the stroke
    const lean = -0.6 + tilt;
    const reach = 44 + sigma * 0.8;
    const nx = x + reach * 0.6, ny = y + reach * 0.8;
    const f = Math.floor(T * 30 + 1e-6);
    if (on > 0) {
      // the spray cone: from the nozzle to the wall, opening to the spray's size
      const dx = x - nx, dy = y - ny, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d, px = -uy, py = ux;
      const w0 = 2.5, w1 = Math.max(7, sigma * 1.5);
      const cg = ctx.createLinearGradient(nx, ny, x, y);
      cg.addColorStop(0, SP.rgba(color, 0.55 * on * vis));
      cg.addColorStop(1, SP.rgba(color, 0.14 * on * vis));
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(nx + px * w0, ny + py * w0);
      ctx.lineTo(x + px * w1 + ux * 6, y + py * w1 + uy * 6);
      ctx.lineTo(x - px * w1 + ux * 6, y - py * w1 + uy * 6);
      ctx.lineTo(nx - px * w0, ny - py * w0);
      ctx.closePath();
      ctx.fill();
      // the cloud where it hits the wall
      const rr = sigma * 3 + 18;
      const grd = ctx.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, SP.rgba(color, 0.36 * on * vis));
      grd.addColorStop(0.45, SP.rgba(color, 0.13 * on * vis));
      grd.addColorStop(1, SP.rgba(color, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr);
      // droplets in flight, inside the cone and around the spot
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.75 * on * vis;
      const pth = new Path2D();
      for (let i = 0; i < 120; i++) {
        const u1 = h3(f, i, seed), u2 = h3(f, i, seed + 1), u3 = h3(f, i, seed + 2);
        let qx, qy;
        if (i < 60) {
          const t = u1;
          const wv = lerp(w0, w1, t) * (u2 * 2 - 1);
          qx = nx + dx * t + px * wv;
          qy = ny + dy * t + py * wv;
        } else {
          const r = (sigma * 1.2 + 5) * Math.sqrt(-2 * Math.log(1 - u1 * 0.999)) * 1.15;
          const a = u2 * TAU;
          qx = x + Math.cos(a) * r;
          qy = y + Math.sin(a) * r;
        }
        const sz = 0.5 + u3 * 1.3;
        pth.moveTo(qx + sz, qy);
        pth.arc(qx, qy, sz, 0, TAU);
      }
      ctx.fill(pth);
      ctx.globalAlpha = 1;
    }
    const k = 0.62;
    // contact shadow on the wall, offset away from the light
    ctx.save();
    ctx.globalAlpha = 0.34 * vis;
    ctx.translate(nx + 24, ny + 30);
    ctx.rotate(lean);
    ctx.drawImage(canShadow(), -58, -20);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = vis;
    ctx.translate(nx, ny);
    ctx.rotate(lean);
    ctx.scale(k, k * 0.86);
    ctx.drawImage(spr, -60, -12);
    ctx.restore();
  };


  // ---------------------------------------------------------------------------
  // The roller on its pole (an object in front of the wall)
  // ---------------------------------------------------------------------------
  SP.drawRoller = function drawRoller(ctx, x, y, W, color, vis, wet, dirY) {
    if (vis <= 0) return;
    ctx.save();
    ctx.globalAlpha = vis;
    // shadow on the wall
    ctx.save();
    ctx.globalAlpha = 0.28 * vis;
    ctx.fillStyle = PAL.grime;
    ctx.translate(26, 34);
    ctx.fillRect(x - W / 2, y - 22, W, 44);
    ctx.restore();
    // pole: from the frame's elbow down and to the right, off frame
    const ex = x + W / 2 + 34, ey = y + 70;
    const pg = ctx.createLinearGradient(ex - 10, 0, ex + 10, 0);
    pg.addColorStop(0, '#1a1b1f');
    pg.addColorStop(0.45, '#8c9099');
    pg.addColorStop(1, '#202227');
    ctx.strokeStyle = pg;
    ctx.lineCap = 'round';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex + 260, ey + 1500);
    ctx.stroke();
    // the frame: a bent steel rod from the sleeve's end to the elbow
    ctx.strokeStyle = '#b9bdc4';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + W / 2 + 4, y);
    ctx.lineTo(x + W / 2 + 26, y);
    ctx.quadraticCurveTo(x + W / 2 + 40, y + 2, ex, ey);
    ctx.stroke();
    // the sleeve: wet nap in the paint colour, cylinder shading
    const sg = ctx.createLinearGradient(0, y - 24, 0, y + 24);
    sg.addColorStop(0, SP.mixHex(color, '#ffffff', 0.25));
    sg.addColorStop(0.35, color);
    sg.addColorStop(0.75, SP.mixHex(color, '#000000', 0.35));
    sg.addColorStop(1, SP.mixHex(color, '#000000', 0.6));
    ctx.fillStyle = sg;
    ctx.beginPath();
    const rr = 14;
    ctx.moveTo(x - W / 2 + rr, y - 24);
    ctx.lineTo(x + W / 2 - rr, y - 24);
    ctx.quadraticCurveTo(x + W / 2, y - 24, x + W / 2, y - 10);
    ctx.lineTo(x + W / 2, y + 10);
    ctx.quadraticCurveTo(x + W / 2, y + 24, x + W / 2 - rr, y + 24);
    ctx.lineTo(x - W / 2 + rr, y + 24);
    ctx.quadraticCurveTo(x - W / 2, y + 24, x - W / 2, y + 10);
    ctx.lineTo(x - W / 2, y - 10);
    ctx.quadraticCurveTo(x - W / 2, y - 24, x - W / 2 + rr, y - 24);
    ctx.fill();
    // nap fibres catching light
    ctx.globalAlpha = vis * 0.35;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 26; i++) {
      const fx = x - W / 2 + 6 + ((i * 37) % 97) / 97 * (W - 12);
      ctx.fillRect(fx, y - 16 + ((i * 13) % 7), 1.4, 5);
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // A shaped stencil: a paper plane held on the wall, sprayed around (a reverse stencil), then it
  // peels off and flies away, leaving its crisp silhouette inside the overspray.
  //   o: { id, pts: plane polygon (wall coords: nose, top wing tip, tail notch, bottom wing tip),
  //        strokes, tPlace, tLift, fly: { dx, dy, rot, s, dur } }
  // ---------------------------------------------------------------------------
  SP.planeStencil = function planeStencil(o) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of o.pts) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    const over = o.over || 220;
    const pth = () => {
      const q = new Path2D();
      q.moveTo(o.pts[0][0], o.pts[0][1]);
      for (let i = 1; i < o.pts.length; i++) q.lineTo(o.pts[i][0], o.pts[i][1]);
      q.closePath();
      return q;
    };
    const pc = piece({
      id: o.id,
      box: [x0 - over, y0 - over, x1 + over, y1 + over + 140],
      groups: [{
        strokes: o.strokes,
        drip: o.drip || { thr: 7, max: 10, len: 0.8 },
        mask: (p) => {
          const c = mk(p.w, p.h);
          const g = c.getContext('2d');
          g.fillStyle = '#fff';
          g.fillRect(0, 0, p.w, p.h);
          g.globalCompositeOperation = 'destination-out';
          g.filter = 'blur(0.9px)';
          g.translate(-p.x0, -p.y0);
          g.fill(pth());
          // slits cut in the card (the fold) let paint through as thin lines
          g.globalCompositeOperation = 'source-over';
          g.strokeStyle = '#fff';
          g.lineCap = 'round';
          for (const [a, z, wd] of o.slits || []) {
            g.lineWidth = wd;
            g.beginPath();
            g.moveTo(a[0], a[1]);
            g.lineTo(z[0], z[1]);
            g.stroke();
          }
          return c;
        },
      }],
    });
    return { kind: 'plane', id: o.id, o, pc, box: [x0, y0, x1, y1], path: pth, live: null, fin: null, tPaint0: pc.tStart, tPaint1: pc.tEnd };
  };
  /** the paper plane object at T (wall coords under the camera) */
  SP.drawPlane = function drawPlane(ctx, ps, T) {
    const o = ps.o;
    const fly = o.fly || { dx: 900, dy: -900, rot: -0.5, s: 2.2, dur: 0.75 };
    if (T < o.tPlace - 0.16 || T > o.tLift + fly.dur) return;
    const [x0, y0, x1, y1] = ps.box;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const qin = sstep(o.tPlace - 0.16, o.tPlace, T);
    const u = clamp((T - o.tLift) / fly.dur);
    const ue = u * u * (3 - 2 * u);
    // it lifts toward the camera, banks and climbs out of frame
    const tx = cx + fly.dx * ue * ue, ty = cy + fly.dy * ue - 60 * Math.sin(u * Math.PI);
    const sc = (1 + 0.14 * (1 - qin)) * (1 + (fly.s - 1) * ue);
    const rot = (fly.rot || 0) * ue;
    const flap = Math.sin(u * Math.PI) * 0.35;
    // shadow on the wall, left behind as it rises
    ctx.save();
    ctx.globalAlpha = 0.35 * qin * (1 - u);
    ctx.fillStyle = PAL.grime;
    ctx.filter = `blur(${(3 + 40 * u).toFixed(1)}px)`;
    ctx.translate(cx + 10 + 60 * u, cy + 14 + 90 * u);
    ctx.scale(1 + u * 0.4, 1 + u * 0.4);
    ctx.translate(-cx, -cy);
    ctx.fill(ps.path());
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = qin;
    ctx.translate(tx, ty);
    ctx.rotate(rot);
    ctx.scale(sc, sc);
    ctx.translate(-cx, -cy);
    const P = o.pts; // nose, top tip, notch, bottom tip
    const tri = (a, b, c2, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.closePath();
      ctx.fill();
    };
    // wings fold up as it flies: the far tips swing toward the keel
    const keel = P[2];
    const lerpP = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
    const topTip = lerpP(P[1], keel, flap), botTip = lerpP(P[3], keel, flap);
    tri(P[0], topTip, keel, '#f3f1ea');
    tri(P[0], keel, botTip, '#d6d3ca');
    // the overspray it caught while it sat on the wall
    if (T >= ps.tPaint0) {
      ctx.save();
      ctx.clip(ps.path());
      for (const st of ps.pc.groups[0].strokes) if (T >= st.t0) drawStroke(ctx, st, Math.min(T, ps.tPaint1));
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(P[0][0], P[0][1]);
    ctx.lineTo(keel[0], keel[1]);
    ctx.stroke();
    ctx.restore();
  };

  // ---------------------------------------------------------------------------
  // The wall: cast-in-place concrete (formwork panels, tie holes, bugholes, cracks, rain streaks,
  // rust), ghosts of old tags, grey buff patches over them. Three canvases in wall coords:
  //   albedo (unshaded colour), shade (relief light, multiplied over everything painted), pores
  //   (alpha: where paint skips into the holes). Pure function of the spec; built once.
  // ---------------------------------------------------------------------------
  const wallCache = new Map();
  SP.wall = function wall(spec) {
    const key = spec.key || 'wall';
    let w = wallCache.get(key);
    if (w) return w;
    w = buildWall(spec);
    wallCache.set(key, w);
    return w;
  };

  function buildWall(spec) {
    const X0 = spec.x0, Y0 = spec.y0, W = spec.w, H = spec.h;
    const alb = mk(W, H), sh = mk(W, H), por = mk(W, H);
    const ga = alb.getContext('2d'), gs = sh.getContext('2d'), gp = por.getContext('2d');
    const ia = ga.createImageData(W, H), is = gs.createImageData(W, H);
    const A = ia.data, S = is.data;
    const hgt = new Float32Array(W * H);
    const seamX = spec.seams || [];
    const liftY = spec.lift != null ? spec.lift : 420;
    const base = spec.base != null ? spec.base : 1000;
    const panelOf = (x) => {
      let k = 0;
      for (const sx of seamX) if (x >= sx) k++;
      return k;
    };
    const tone = [];
    for (let k = 0; k <= seamX.length; k++) tone.push([(h3(k, 3, 77) - 0.5) * 0.07, (h3(k, 4, 77) - 0.5) * 0.05]);
    for (let j = 0; j < H; j++) {
      const y = j + Y0;
      const topF = 1 - sstep(-170, 260, y);
      const baseF = sstep(base - 190, base, y);
      const upper = y < liftY ? 0 : 1;
      let pk = 0;
      for (let i = 0; i < W; i++) {
        const x = i + X0;
        if (pk < seamX.length && x >= seamX[pk]) pk++;
        const big = fbm(x / 330 + 11.3, y / 330 + 5.1, 3);
        const mid = fbm(x / 64 + 3.3, y / 64 + 8.8, 3);
        const fine = vnoise(x / 1.9 + 101.7, y / 1.9 + 57.3);
        const fine2 = vnoise(x / 4.7 + 33.1, y / 4.7 + 71.9);
        const px = h3(x, y, 4242);
        const streak = fbm(x / 23 + 9.1, y / 520 + 2.2, 2);
        const warm = vnoise(x / 610 + 1.7, y / 610 + 4.4);
        let v = (spec.v != null ? spec.v : 0.5) + (big - 0.5) * 0.26 + (mid - 0.5) * 0.11 + (fine - 0.5) * 0.06 + (fine2 - 0.5) * 0.04 + (px - 0.5) * 0.035 + tone[pk][upper];
        v -= sstep(0.48, 0.74, streak) * (spec.streak != null ? spec.streak : 1) * (0.05 + 0.16 * topF);
        v -= baseF * (0.12 + 0.18 * mid);
        const k4 = (j * W + i) * 4;
        A[k4] = clamp(v * (1.0 + (warm - 0.5) * 0.09)) * 255;
        A[k4 + 1] = clamp(v * 0.985) * 255;
        A[k4 + 2] = clamp(v * (0.955 - (warm - 0.5) * 0.09)) * 255;
        A[k4 + 3] = 255;
        hgt[j * W + i] = fine * 0.5 + fine2 * 0.5 + (px - 0.5) * 0.22 + (mid - 0.5) * 0.3;
      }
    }
    const kL = spec.relief != null ? spec.relief : 0.75;
    for (let j = 0; j < H; j++) {
      const j0 = j > 0 ? j - 1 : j, j1 = j < H - 1 ? j + 1 : j;
      for (let i = 0; i < W; i++) {
        const i0 = i > 0 ? i - 1 : i, i1 = i < W - 1 ? i + 1 : i;
        const g = 0.9 + kL * (hgt[j1 * W + i1] - hgt[j0 * W + i0]);
        const k4 = (j * W + i) * 4;
        const v = clamp(g, 0, 1) * 255;
        S[k4] = v;
        S[k4 + 1] = v;
        S[k4 + 2] = v;
        S[k4 + 3] = 255;
      }
    }
    ga.putImageData(ia, 0, 0);
    gs.putImageData(is, 0, 0);
    for (const g of [ga, gs, gp]) g.translate(-X0, -Y0);

    // formwork seams and the lift joint
    for (const sx of seamX) {
      const R = L.rng(L.hash('seam', sx));
      const pts = [];
      for (let y = Y0; y <= base; y += 40) pts.push([sx + R.range(-1.2, 1.2), y]);
      const p = pathOf(pts, false, false);
      ga.strokeStyle = SP.rgba(PAL.grime, 0.38);
      ga.lineWidth = 3;
      ga.stroke(p);
      gs.strokeStyle = 'rgba(0,0,0,0.5)';
      gs.lineWidth = 2;
      gs.stroke(p);
      gs.save();
      gs.translate(2.5, 0);
      gs.strokeStyle = 'rgba(255,255,255,0.28)';
      gs.lineWidth = 1.5;
      gs.stroke(p);
      gs.restore();
    }
    {
      const R = L.rng(L.hash('lift'));
      const pts = [];
      for (let x = X0; x <= X0 + W; x += 60) pts.push([x, liftY + R.range(-2, 2) + Math.sin(x / 300) * 2]);
      const p = pathOf(pts, true, false);
      ga.strokeStyle = SP.rgba(PAL.grime, 0.22);
      ga.lineWidth = 4;
      ga.stroke(p);
      gs.strokeStyle = 'rgba(0,0,0,0.35)';
      gs.lineWidth = 1.6;
      gs.stroke(p);
    }
    // tie holes with rust tears
    for (const th of spec.ties || []) {
      const [tx, ty] = th;
      const R = L.rng(L.hash('tie', tx, ty));
      const len = R.range(50, 210), wd = R.range(7, 15);
      const grd = ga.createLinearGradient(0, ty, 0, ty + len);
      grd.addColorStop(0, SP.rgba(PAL.rust, R.range(0.35, 0.55)));
      grd.addColorStop(1, SP.rgba(PAL.rust, 0));
      ga.fillStyle = grd;
      ga.beginPath();
      ga.moveTo(tx - wd * 0.5, ty);
      for (let y = 0; y <= len; y += 10) ga.lineTo(tx - wd * (0.5 - y / len * 0.3) + Math.sin(y / 17 + tx) * 2, ty + y);
      for (let y = len; y >= 0; y -= 10) ga.lineTo(tx + wd * (0.5 - y / len * 0.3) + Math.sin(y / 17 + tx) * 2, ty + y);
      ga.fill();
      if (R.chance(0.45)) {
        // grout plug
        ga.fillStyle = SP.rgba(PAL.buffGrey, 0.85);
        ga.beginPath();
        ga.arc(tx, ty, 15, 0, TAU);
        ga.fill();
        gs.fillStyle = 'rgba(255,255,255,0.12)';
        gs.beginPath();
        gs.arc(tx, ty, 15, 0, TAU);
        gs.fill();
      }
      ga.fillStyle = SP.rgba(PAL.grime, 0.85);
      ga.beginPath();
      ga.arc(tx, ty, 8.5, 0, TAU);
      ga.fill();
      gs.fillStyle = 'rgba(0,0,0,0.75)';
      gs.beginPath();
      gs.arc(tx, ty, 8, 0, TAU);
      gs.fill();
      gs.fillStyle = 'rgba(255,255,255,0.35)';
      gs.beginPath();
      gs.arc(tx + 1.5, ty + 2, 8.5, 0.1, Math.PI - 0.1);
      gs.arc(tx, ty, 7, Math.PI - 0.1, 0.1, true);
      gs.fill();
      gp.fillStyle = '#fff';
      gp.beginPath();
      gp.arc(tx, ty, 7, 0, TAU);
      gp.fill();
    }
    // cracks
    for (const ck of spec.cracks || []) {
      const R = L.rng(L.hash('crack', ck[0], ck[1]));
      const walk = (x, y, ang, n, wdt, depth) => {
        const pts = [[x, y]];
        for (let k = 0; k < n; k++) {
          ang += R.range(-0.5, 0.5);
          ang = lerp(ang, ck[2], 0.25);
          x += Math.cos(ang) * R.range(5, 12);
          y += Math.sin(ang) * R.range(5, 12);
          pts.push([x, y]);
          if (depth < 2 && R.chance(0.04)) walk(x, y, ang + R.sign() * R.range(0.5, 1.1), (n - k) * 0.4, wdt * 0.6, depth + 1);
        }
        const p = pathOf(pts, false, false);
        gs.strokeStyle = 'rgba(0,0,0,0.75)';
        gs.lineWidth = wdt;
        gs.stroke(p);
        gs.save();
        gs.translate(1.2, 1.2);
        gs.strokeStyle = 'rgba(255,255,255,0.3)';
        gs.lineWidth = wdt * 0.7;
        gs.stroke(p);
        gs.restore();
        ga.strokeStyle = SP.rgba(PAL.grime, 0.4);
        ga.lineWidth = wdt * 1.4;
        ga.stroke(p);
      };
      walk(ck[0], ck[1], ck[2], ck[3], 1.6, 0);
    }
    // bugholes and pores
    {
      const cell = 11;
      const buckets = [new Path2D(), new Path2D(), new Path2D()];
      const lips = new Path2D();
      for (let cy = Math.floor(Y0 / cell); cy * cell < Y0 + H; cy++) {
        for (let cx = Math.floor(X0 / cell); cx * cell < X0 + W; cx++) {
          const u = h3(cx, cy, 9191);
          const dens = 0.05 + 0.32 * sstep(0.5, 0.78, fbm(cx * cell / 260 + 4.1, cy * cell / 260 + 7.7, 2));
          if (u > dens) continue;
          const px = (cx + h3(cx, cy, 1)) * cell, py = (cy + h3(cx, cy, 2)) * cell;
          const big = h3(cx, cy, 3);
          const r = 0.5 + 2.9 * Math.pow(big, 5);
          const b = r > 2.6 ? 2 : r > 1.3 ? 1 : 0;
          buckets[b].moveTo(px + r, py);
          buckets[b].arc(px, py, r, 0, TAU);
          if (r > 1.8) {
            lips.moveTo(px + r + 0.9, py + 1);
            lips.arc(px + 0.9, py + 1, r, 0, TAU);
          }
        }
      }
      gs.fillStyle = 'rgba(255,255,255,0.22)';
      gs.fill(lips);
      const dark = [0.22, 0.38, 0.55];
      buckets.forEach((p, b) => {
        gs.fillStyle = `rgba(0,0,0,${dark[b]})`;
        gs.fill(p);
        ga.fillStyle = SP.rgba(PAL.grime, 0.12 + b * 0.1);
        ga.fill(p);
        gp.fillStyle = `rgba(255,255,255,${[0.25, 0.55, 0.85][b]})`;
        gp.fill(p);
      });
    }
    // ghosts of old paint (faded, before the buff went over)
    for (const gh of spec.ghosts || []) {
      const st = stroke(gh);
      drawStroke(ga, st, 1e9, gh.fade != null ? gh.fade : 0.5);
    }
    // buff patches: flat roller paint over old tags, partly filling the pores
    for (const bf of spec.buffs || []) {
      const R = L.rng(L.hash('buff', bf.x, bf.y));
      const pts = [];
      const n = 26;
      for (let k = 0; k < n; k++) {
        const f = k / n;
        let x, y;
        if (f < 0.25) [x, y] = [bf.x + bf.w * (f / 0.25), bf.y];
        else if (f < 0.5) [x, y] = [bf.x + bf.w, bf.y + bf.h * ((f - 0.25) / 0.25)];
        else if (f < 0.75) [x, y] = [bf.x + bf.w * (1 - (f - 0.5) / 0.25), bf.y + bf.h];
        else [x, y] = [bf.x, bf.y + bf.h * (1 - (f - 0.75) / 0.25)];
        pts.push([x + R.range(-9, 9), y + R.range(-9, 9)]);
      }
      const p = pathOf(pts, true, true);
      ga.save();
      ga.globalAlpha = bf.a != null ? bf.a : 0.93;
      ga.fillStyle = bf.color;
      ga.fill(p);
      ga.clip(p);
      // roller streaks
      for (let y = bf.y - 10; y < bf.y + bf.h + 10; y += 3) {
        const v = vnoise(y / 4 + bf.x, bf.y * 0.01) - 0.5;
        ga.fillStyle = v > 0 ? `rgba(255,255,255,${v * 0.09})` : `rgba(0,0,0,${-v * 0.09})`;
        ga.fillRect(bf.x - 10, y, bf.w + 20, 3);
      }
      ga.restore();
      gs.save();
      gs.globalAlpha = 0.5;
      gs.fillStyle = 'rgb(232,232,232)';
      gs.fill(p);
      gs.restore();
      gp.save();
      gp.globalCompositeOperation = 'destination-out';
      gp.globalAlpha = 0.65;
      gp.fill(p);
      gp.restore();
    }
    // old stencilled words: sprayed through a card long ago, faded, under later buffs
    for (const wd of spec.words || []) {
      const m = SP.stencilText(wd.str, wd.size, { track: 0.05 });
      const pad = Math.round(wd.size * 0.5);
      const c = mk(m.w + 2 * pad, m.h + 2 * pad);
      const g = c.getContext('2d');
      const st2 = stroke({ pts: [[0, pad + m.h * 0.45], [c.width, pad + m.h * 0.5]], smooth: false, t0: 0, dur: 0.5, color: wd.color, sigma: m.h * 0.42, opacity: 0.92, speck: 0.4, seed: L.hash('word', wd.str) & 0xffff });
      drawStroke(g, st2, 1e9);
      // crisp letters, a faint card halo around them
      const hal = mk(c.width, c.height);
      const hg = hal.getContext('2d');
      hg.globalAlpha = 0.16;
      hg.drawImage(c, 0, 0);
      hg.globalAlpha = 1;
      hg.globalCompositeOperation = 'destination-out';
      hg.fillRect(pad * 0.55, pad * 0.55, c.width - pad * 1.1, c.height - pad * 1.1);
      g.globalCompositeOperation = 'destination-in';
      g.filter = 'blur(0.7px)';
      g.drawImage(m.c, pad, pad);
      g.filter = 'none';
      g.globalCompositeOperation = 'source-over';
      g.drawImage(hal, 0, 0);
      ga.save();
      ga.globalAlpha = wd.a != null ? wd.a : 0.75;
      ga.translate(wd.x, wd.y);
      if (wd.rot) ga.rotate(wd.rot);
      ga.drawImage(c, -pad, -pad);
      ga.restore();
    }
    for (const g of [ga, gs, gp]) g.setTransform(1, 0, 0, 1, 0, 0);
    return { x0: X0, y0: Y0, w: W, h: H, albedo: alb, shade: sh, pores: por, base };
  }

  // ---------------------------------------------------------------------------
  // Stencil lettering: system bold face, each enclosed counter bridged like a cut stencil
  // ---------------------------------------------------------------------------
  /**
   * bridge(c, bw, minArea): stencil bridges in place. Every island of card left inside a cut shape
   * (a counter, an eye) would fall out of a real stencil, so a vertical strip is cut through each.
   */
  function bridge(c, bw, minArea, topOnly) {
    const gw = c.width, gh = c.height;
    const gg = c.getContext('2d', { willReadFrequently: true });
    const d = gg.getImageData(0, 0, gw, gh).data;
    const N = gw * gh;
    const out = new Uint8Array(N);
    const st = [];
    for (let i = 0; i < gw; i++) st.push(i, (gh - 1) * gw + i);
    for (let j = 0; j < gh; j++) st.push(j * gw, j * gw + gw - 1);
    while (st.length) {
      const k = st.pop();
      if (out[k] || d[k * 4 + 3] >= 110) continue;
      out[k] = 1;
      const xx = k % gw, yy = (k / gw) | 0;
      if (xx > 0) st.push(k - 1);
      if (xx < gw - 1) st.push(k + 1);
      if (yy > 0) st.push(k - gw);
      if (yy < gh - 1) st.push(k + gw);
    }
    const lab = new Int32Array(N);
    const holes = [];
    for (let k = 0; k < N; k++) {
      if (out[k] || d[k * 4 + 3] >= 110 || lab[k]) continue;
      const id = holes.length + 1;
      let sx = 0, cnt = 0, mny = 1e9, mxy = -1e9;
      const q = [k];
      lab[k] = id;
      while (q.length) {
        const kk = q.pop();
        const xx = kk % gw, yy = (kk / gw) | 0;
        sx += xx;
        cnt++;
        mny = Math.min(mny, yy);
        mxy = Math.max(mxy, yy);
        for (const nb of [kk - 1, kk + 1, kk - gw, kk + gw]) {
          if (nb < 0 || nb >= N || lab[nb] || out[nb] || d[nb * 4 + 3] >= 110) continue;
          lab[nb] = id;
          q.push(nb);
        }
      }
      if (cnt > (minArea || 20)) holes.push({ cx: sx / cnt, y0: mny, y1: mxy });
    }
    gg.save();
    gg.globalCompositeOperation = 'destination-out';
    const solid = (x, y) => y >= 0 && y < gh && d[(y * gw + x) * 4 + 3] >= 110;
    for (const ho of holes) {
      // cut through the ring above and below the island, along the island's centre column
      const x = Math.max(0, Math.min(gw - 1, Math.round(ho.cx)));
      let yt = ho.y0 - 1;
      while (solid(x, yt)) yt--;
      let yb = ho.y1 + 1;
      while (solid(x, yb)) yb++;
      gg.fillRect(ho.cx - bw / 2, yt, bw, ho.y0 - yt + 1);
      if (!topOnly) gg.fillRect(ho.cx - bw / 2, ho.y1, bw, yb - ho.y1 + 1);
    }
    gg.restore();
    return holes.length;
  }
  SP.bridge = bridge;

  const textMaskCache = new Map();
  /** a white text mask with stencil bridges; returns { c, w, h, base } (base = baseline y in c) */
  SP.stencilText = function stencilText(str, size, o) {
    o = o || {};
    const fam = o.family || 'Futura, "Helvetica Neue", sans-serif';
    const wt = o.weight || 700;
    const key = [str, size, fam, wt, o.track || 0, o.bridge || 0].join('|');
    let r = textMaskCache.get(key);
    if (r) return r;
    const font = `${wt} ${size}px ${fam}`;
    const meas = mk(8, 8).getContext('2d');
    meas.font = font;
    const track = (o.track || 0.04) * size;
    const chars = Array.from(str);
    const adv = chars.map((ch) => meas.measureText(ch).width);
    const w = Math.ceil(adv.reduce((a, b) => a + b, 0) + track * (chars.length - 1) + size * 0.3);
    const h = Math.ceil(size * 1.35);
    const base = Math.round(size * 1.02);
    const c = mk(w, h);
    const g = c.getContext('2d');
    let x = size * 0.15;
    const bw = (o.bridge || 0.06) * size;
    chars.forEach((ch, ci) => {
      if (ch === ' ') {
        x += adv[ci] + track;
        return;
      }
      const gw = Math.ceil(adv[ci] + size * 0.4), gh = h;
      const gc = mk(gw, gh);
      const gg = gc.getContext('2d', { willReadFrequently: true });
      gg.font = font;
      gg.fillStyle = '#fff';
      gg.textBaseline = 'alphabetic';
      gg.fillText(ch, size * 0.2, base);
      bridge(gc, bw, size * size * 0.002);
      g.drawImage(gc, Math.round(x - size * 0.2), 0);
      x += adv[ci] + track;
    });
    r = { c, w, h, base };
    textMaskCache.set(key, r);
    return r;
  };

  // ---------------------------------------------------------------------------
  // Frame compositor: wall albedo -> paint (with pore skips) -> relief light -> objects
  // ---------------------------------------------------------------------------
  let paintC = null;
  function camApply(g, cam) {
    g.translate(FILM.W / 2, FILM.H / 2);
    if (cam.rot) g.rotate(cam.rot);
    const z = cam.zoom || 1;
    if (z !== 1) g.scale(z, z);
    g.translate(-cam.x, -cam.y);
  }
  SP.camApply = camApply;
  /** visible wall rect (padded) for the camera */
  SP.viewRect = function viewRect(cam) {
    const z = cam.zoom || 1;
    const hw = FILM.W / 2 / z, hh = FILM.H / 2 / z;
    const r = Math.hypot(hw, hh);
    const c = Math.abs(Math.cos(cam.rot || 0)), s = Math.abs(Math.sin(cam.rot || 0));
    const ex = hw * c + hh * s, ey = hw * s + hh * c;
    void r;
    return [cam.x - ex - 4, cam.y - ey - 4, cam.x + ex + 4, cam.y + ey + 4];
  };
  /** pieces 0..m-1, finished, composited at 1:1 integer offsets into a wall-sized layer */
  function wallAcc(wl, P, m) {
    if (!wl.pacc) wl.pacc = { c: mk(wl.w, wl.h), m: 0 };
    const A = wl.pacc;
    const g = A.c.getContext('2d');
    if (A.m > m) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.clearRect(0, 0, wl.w, wl.h);
      A.m = 0;
    }
    for (let i = A.m; i < m; i++) g.drawImage(finalLayer(P[i]), P[i].x0 - wl.x0, P[i].y0 - wl.y0);
    A.m = m;
    return A.c;
  }
  SP.render = function render(ctx, o) {
    const T = o.T, cam = o.cam, wl = o.wall;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const base = ctx.getTransform();
    ctx.save();
    camApply(ctx, cam);
    ctx.drawImage(wl.albedo, wl.x0, wl.y0);
    ctx.restore();
    if (!paintC || paintC.width !== cw || paintC.height !== ch) paintC = mk(cw, ch);
    const p = paintC.getContext('2d');
    p.setTransform(1, 0, 0, 1, 0, 0);
    p.globalCompositeOperation = 'source-over';
    p.globalAlpha = 1;
    p.filter = 'none';
    p.clearRect(0, 0, cw, ch);
    p.setTransform(base);
    camApply(p, cam);
    const vr = SP.viewRect(cam);
    // the finished prefix of pieces lives baked in one wall-sized layer
    const P = o.pieces;
    let m = 0;
    while (m < P.length) {
      computeDrips(P[m]);
      if (T < P[m].tDone) break;
      m++;
    }
    if (m > 0) p.drawImage(wallAcc(wl, P, m), wl.x0, wl.y0);
    for (let i = m; i < P.length; i++) {
      const pc = P[i];
      if (T < pc.tStart) continue;
      if (pc.x0 > vr[2] || pc.y0 > vr[3] || pc.x0 + pc.w < vr[0] || pc.y0 + pc.h < vr[1]) continue;
      drawPiece(p, pc, T);
    }
    p.globalCompositeOperation = 'destination-out';
    p.globalAlpha = o.pores != null ? o.pores : 0.7;
    p.drawImage(wl.pores, wl.x0, wl.y0);
    p.globalCompositeOperation = 'source-over';
    p.globalAlpha = 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(paintC, 0, 0);
    ctx.restore();
    ctx.save();
    camApply(ctx, cam);
    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(wl.shade, wl.x0, wl.y0);
    ctx.restore();
    if (o.objects) {
      ctx.save();
      camApply(ctx, cam);
      o.objects(ctx);
      ctx.restore();
    }
  };

  // grain tiles (pure), vignette
  const grainTiles = [];
  function grainTile(v) {
    if (grainTiles[v]) return grainTiles[v];
    const N = 256;
    const c = mk(N, N);
    const g = c.getContext('2d');
    const img = g.createImageData(N, N);
    const d = img.data;
    for (let i = 0; i < N * N; i++) {
      const n = (h3(i % N, (i / N) | 0, 515 + v * 17) + h3(i % N, (i / N) | 0, 77 + v) - 1) * 0.5;
      const c2 = 128 + n * 255;
      d[i * 4] = c2;
      d[i * 4 + 1] = c2;
      d[i * 4 + 2] = c2;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    grainTiles[v] = c;
    return c;
  }
  /** vignette + film grain over the whole frame (logical coords, base transform in ctx) */
  SP.grade = function grade(ctx, T, o) {
    o = o || {};
    const W = FILM.W, H = FILM.H;
    const vg = ctx.createRadialGradient(W * 0.5, H * 0.46, H * 0.32, W * 0.5, H * 0.5, H * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(0.55, `rgba(0,0,0,${(o.vig != null ? o.vig : 0.42) * 0.45})`);
    vg.addColorStop(1, `rgba(0,0,0,${o.vig != null ? o.vig : 0.42})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    const f = Math.floor(T * 30 + 1e-6);
    const tile = grainTile(f % 4);
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = o.grain != null ? o.grain : 0.16;
    const ox = Math.floor(h3(f, 3, 9) * 256), oy = Math.floor(h3(f, 4, 9) * 256);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  };
})();
