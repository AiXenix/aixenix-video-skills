/*
 * cast.js : «Один лист» (08-origami) — the origami engine every shot draws through.
 *
 * THE LAW: one A4 sheet (2.97 x 2.10 units), never cut, never glued, folds itself from figure to
 * figure; every crease it ever made stays on the paper. Nothing else is in the frame but light, a
 * desk and the sheet's shadow.
 *
 * How it is computed (all at load, deterministic, then a pure function of global time T):
 *   - The sheet is a set of convex paper polygons. Each fold op is a rigid "simple fold": a line in
 *     the current folded state, a moving side and an angle. A selected polygon that straddles the
 *     line is SPLIT along it — that split edge is the crease, recorded in paper coordinates with its
 *     birth time and mountain/valley sign. Polygons are never merged again, so creases accumulate.
 *   - Ops form a stack: push folds, pop unfolds (exact reversal). A polygon remembers its rigid
 *     transform in every configuration (cf[cfg]); a frame interpolates one op at most.
 *   - Flat folds keep a real layer order (overlap-aware stacking, 0.09 mm per layer).
 *   - The gear is a closed planar linkage: the folded strip is pleated along 32 creases and its
 *     hinge angles curl it into a ring whose ends meet. It rolls tooth by tooth (pivot on the hull).
 *   - Global rigid motion G(T) (standing arrow, flight, mid-air unfold, falling sheet) and the
 *     camera are keyed in beats.
 *   - Render: three.js r180; paper = MeshPhysicalMaterial patched with two printed faces (front
 *     document, back card), a crease height field (every born crease bends the shading normal
 *     and marks the fibre), and translucency that carries the far side's ink.
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const L = FILM.lib;
  const PAL = L.pal;
  const OR = (FILM.origami = FILM.origami || {});

  // ---------------------------------------------------------------- time
  const BPM = 112.5;
  const BEAT = 60 / BPM;
  OR.BPM = BPM;
  OR.BEAT = BEAT;
  const bt = (b) => b * BEAT;

  // ---------------------------------------------------------------- sheet
  const A = 1.485; // half length (paper X)
  const B = 1.05; // half width (paper Y)
  const DZ = 0.0009; // layer spacing
  OR.A = A;
  OR.B = B;
  const PI = Math.PI;
  const TAU = PI * 2;
  const DEG = PI / 180;

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const eio = (t) => {
    t = clamp(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  };
  // paper fold: lifts gently, flies, lands with a short slap
  const efold = (t) => {
    t = clamp(t);
    const a = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    return lerp(a, t * t * (3 - 2 * t), 0.35);
  };
  const eout = (t) => 1 - Math.pow(1 - clamp(t), 3);

  // ---------------------------------------------------------------- vec / rigid transforms
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const scl = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.sqrt(dot(a, a));
  const nrm = (a) => scl(a, 1 / (len(a) || 1));
  const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const mk = (R, t) => ({ R, t });
  const ID = mk(I3(), [0, 0, 0]);
  function mulR(a, b) {
    return [
      a[0] * b[0] + a[1] * b[3] + a[2] * b[6], a[0] * b[1] + a[1] * b[4] + a[2] * b[7], a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
      a[3] * b[0] + a[4] * b[3] + a[5] * b[6], a[3] * b[1] + a[4] * b[4] + a[5] * b[7], a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
      a[6] * b[0] + a[7] * b[3] + a[8] * b[6], a[6] * b[1] + a[7] * b[4] + a[8] * b[7], a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
    ];
  }
  const mulRv = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  const tfMul = (a, b) => mk(mulR(a.R, b.R), add(mulRv(a.R, b.t), a.t));
  const tfApply = (T, p) => add(mulRv(T.R, p), T.t);
  function tfInv(T) {
    const R = T.R;
    const Rt = [R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]];
    return mk(Rt, scl(mulRv(Rt, T.t), -1));
  }
  function rotR(D, phi) {
    const c = Math.cos(phi), s = Math.sin(phi), C = 1 - c;
    const x = D[0], y = D[1], z = D[2];
    return [
      c + x * x * C, x * y * C - z * s, x * z * C + y * s,
      y * x * C + z * s, c + y * y * C, y * z * C - x * s,
      z * x * C - y * s, z * y * C + x * s, c + z * z * C,
    ];
  }
  function rotAbout(P, D, phi) {
    const R = rotR(D, phi);
    return mk(R, sub(P, mulRv(R, P)));
  }
  const transl = (v) => mk(I3(), v.slice());
  const rotX = (a) => mk(rotR([1, 0, 0], a), [0, 0, 0]);
  const rotY = (a) => mk(rotR([0, 1, 0], a), [0, 0, 0]);
  const rotZ = (a) => mk(rotR([0, 0, 1], a), [0, 0, 0]);
  const chain = (...ts) => ts.reduce((acc, t) => tfMul(acc, t), ID);
  // orthonormal frame -> rotation (columns f, l, u map body x, y, z)
  const frameR = (f, l, u) => [f[0], l[0], u[0], f[1], l[1], u[1], f[2], l[2], u[2]];
  // quaternion helpers for smooth pose blends
  function quatFromR(R) {
    const m00 = R[0], m01 = R[1], m02 = R[2], m10 = R[3], m11 = R[4], m12 = R[5], m20 = R[6], m21 = R[7], m22 = R[8];
    const tr = m00 + m11 + m22;
    let w, x, y, z;
    if (tr > 0) {
      const s = 0.5 / Math.sqrt(tr + 1);
      w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s;
    } else if (m00 > m11 && m00 > m22) {
      const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
      w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
      w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s;
    } else {
      const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
      w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s;
    }
    return [x, y, z, w];
  }
  function quatToR(q) {
    const [x, y, z, w] = q;
    return [
      1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
      2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
      2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
    ];
  }
  function slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bb = b;
    if (d < 0) { d = -d; bb = b.map((v) => -v); }
    if (d > 0.9995) {
      const r = a.map((v, i) => v + (bb[i] - v) * t);
      const n = Math.hypot(r[0], r[1], r[2], r[3]);
      return r.map((v) => v / n);
    }
    const th = Math.acos(d), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, i) => wa * v + wb * bb[i]);
  }
  function tfBlend(a, b, t) {
    return mk(quatToR(slerp(quatFromR(a.R), quatFromR(b.R), t)), [lerp(a.t[0], b.t[0], t), lerp(a.t[1], b.t[1], t), lerp(a.t[2], b.t[2], t)]);
  }

  // ---------------------------------------------------------------- the program (beats)
  // Folds land on the beat: each window ends on the beat (or 8th) where the paper slaps down.
  const TM = {
    stir: [2.15, 3.1],
    stand0: [3.2, 4.0], // the page stands up, face to camera
    F0: [4.2, 5.0], // folds its top half back: one sheet, two layers, the reverse sealed inside (lands b5)
    lie: [5.05, 5.75], // lies back down
    turn: [5.45, 6.5], // turns on the desk (overlapping the lie), long side across
    gear: [6.5, 9.25], // teeth pleat in pairs from the middle (land 7.0 7.5 8.0 8.5), the strip curls shut (lands 9.25)
    spin: [9.25, 11.75], // lifts onto an invisible axle, 8 clockwork ticks on 16ths (9.75 .. 11.5), sets down
    tickDur: 0.2,
    gearPop: [11.8, 13.0], // uncurls, unpleats from the ends inward
    corners: [13.25, 14.5], // lands 14.0, 14.5
    edges: [14.6, 16.0], // lands 15.5, 16.0: a long arrow
    arrow: [16.05, 16.5, 17.0, 17.75], // up (stands at 16.5, leaning forward), hop, back down by 17.75
    halving: [17.8, 18.5],
    wings: [18.5, 19.5], // lands 19.0, 19.5
    flight: [19.75, 27.0], // takes off, one loop, glides, touches down (26.25), slides to a stop (27)
    wingsP: [27.05, 27.5],
    halvingP: [27.5, 28.0], // the body falls open
    edgesP: [28.05, 29.0], // lands 28.5, 29.0
    cornersP: [29.05, 30.0], // lands 29.5, 30.0
    open: [30.4, 32.0], // the folded card opens like a book, landing on the downbeat of bar 9
    loop: 36, // the last bar is a seamless loop
    end: 40,
  };
  OR.TM = TM;
  OR.DURATION = bt(TM.end);
  const W2 = [[0, 0.47], [0.53, 1]]; // two staggered parts: lands at 47 % and 100 %
  const WC = [[0, 0.6], [0.4, 1]]; // corners: each part 0.75 beat
  const WE = [[0, 0.643], [0.357, 1]]; // edges: each part 0.9 beat
  const WW = [[0, 0.5], [0.3, 1]]; // wings
  const WP = [[0, 0.4737], [0.42, 1]]; // unfolding doors

  // ---------------------------------------------------------------- polygons, configs, ops
  let POLYS = null;
  let NCFG = 0;
  let CUR = 0;
  const OPS = [];
  const EVENTS = [];
  const CREASES = [];
  let PID = 0;

  function polyArea(pts) {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return a / 2;
  }
  const centroid2 = (pts) => {
    let x = 0, y = 0;
    for (const p of pts) { x += p[0]; y += p[1]; }
    return [x / pts.length, y / pts.length];
  };
  const polyWorld = (p, cid) => p.pts.map((q) => tfApply(p.cf[cid], [q[0], q[1], 0]));
  function child(p, pts) {
    return { id: PID++, pts, cf: p.cf.slice(), mv: Object.assign({}, p.mv), pan: Object.assign({}, p.pan), corr: Object.assign({}, p.corr) };
  }

  // split p by plane through P with normal M (in config cid). Returns { pos, neg, seg } or null.
  const EPS = 1e-7;
  function splitPoly(p, cid, Pp, M) {
    const w = polyWorld(p, cid);
    const d = w.map((q) => dot(sub(q, Pp), M));
    let hasP = false, hasN = false;
    for (const v of d) { if (v > EPS) hasP = true; if (v < -EPS) hasN = true; }
    if (!(hasP && hasN)) return { side: hasP ? 1 : hasN ? -1 : 0, d };
    const pos = [], neg = [], on = [];
    const n = p.pts.length;
    for (let i = 0; i < n; i++) {
      const a = p.pts[i], b = p.pts[(i + 1) % n];
      const da = d[i], db = d[(i + 1) % n];
      if (da >= -EPS) pos.push(a);
      if (da <= EPS) neg.push(a);
      if (Math.abs(da) <= EPS) on.push(a);
      if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) {
        const t = da / (da - db);
        const q = [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
        pos.push(q); neg.push(q); on.push(q);
      }
    }
    if (pos.length < 3 || neg.length < 3 || Math.abs(polyArea(pos)) < 1e-9 || Math.abs(polyArea(neg)) < 1e-9) {
      return { side: dot(sub(centroidW(w), Pp), M) > 0 ? 1 : -1, d };
    }
    // the crease: extreme points of `on`
    let s0 = on[0], s1 = on[0], best = -1;
    for (let i = 0; i < on.length; i++) for (let j = i + 1; j < on.length; j++) {
      const dd = Math.hypot(on[i][0] - on[j][0], on[i][1] - on[j][1]);
      if (dd > best) { best = dd; s0 = on[i]; s1 = on[j]; }
    }
    return { side: 2, pos: child(p, pos), neg: child(p, neg), seg: [s0, s1] };
  }
  const centroidW = (w) => {
    let x = 0, y = 0, z = 0;
    for (const q of w) { x += q[0]; y += q[1]; z += q[2]; }
    return [x / w.length, y / w.length, z / w.length];
  };


  // overlap-aware compaction of layer heights in a flat config (key: current z)
  function overlapConvex(a, b) {
    const polys = [a, b];
    for (const P of polys) {
      for (let i = 0; i < P.length; i++) {
        const p = P[i], q = P[(i + 1) % P.length];
        const nx = -(q[1] - p[1]), ny = q[0] - p[0];
        const nl = Math.hypot(nx, ny) || 1;
        let amin = 1e9, amax = -1e9, bmin = 1e9, bmax = -1e9;
        for (const v of a) { const s = (v[0] * nx + v[1] * ny) / nl; if (s < amin) amin = s; if (s > amax) amax = s; }
        for (const v of b) { const s = (v[0] * nx + v[1] * ny) / nl; if (s < bmin) bmin = s; if (s > bmax) bmax = s; }
        if (Math.min(amax, bmax) - Math.max(amin, bmin) < 2e-5) return false;
      }
    }
    return true;
  }
  function compact(cid) {
    const items = POLYS.map((p) => {
      const w = polyWorld(p, cid);
      const xy = w.map((q) => [q[0], q[1]]);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of xy) { if (q[0] < x0) x0 = q[0]; if (q[0] > x1) x1 = q[0]; if (q[1] < y0) y0 = q[1]; if (q[1] > y1) y1 = q[1]; }
      return { p, xy, z: p.cf[cid].t[2], bb: [x0, x1, y0, y1], h: 0 };
    });
    items.sort((a, b) => a.z - b.z || a.p.id - b.p.id);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let h = 0;
      for (let j = 0; j < i; j++) {
        const o = items[j];
        if (o.h + 1 <= h) continue;
        if (o.bb[0] > it.bb[1] - 1e-5 || o.bb[1] < it.bb[0] + 1e-5 || o.bb[2] > it.bb[3] - 1e-5 || o.bb[3] < it.bb[2] + 1e-5) continue;
        if (overlapConvex(it.xy, o.xy)) h = o.h + 1;
      }
      it.h = h;
      const T = it.p.cf[cid];
      it.p.cf[cid] = mk(T.R, [T.t[0], T.t[1], h * DZ]);
    }
  }

  // A fold op. parts: [{ P, D, M, toward, amount, sel(p) }]; flat: the result is a flat stack.
  function pushFold(name, parts, win, opts = {}) {
    const base = CUR;
    const res = NCFG++;
    const op = { kind: 'fold', name, id: OPS.length, base, res, parts: [], flat: !!opts.flat };
    OPS.push(op);
    const t0 = bt(win[0]), t1 = bt(win[1]);
    const windows = opts.windows || parts.map(() => [0, 1]);
    parts.forEach((sp, j) => {
      const D = nrm(sp.D), M = nrm(sp.M);
      const sgn = Math.sign(dot(cross(D, M), sp.toward)) || 1;
      const phi = sgn * sp.amount;
      const tw = nrm(sp.toward);
      let ext = 0;
      for (const p of POLYS) ext = Math.max(ext, dot(p.cf[base].t, tw) / DZ);
      const lift = opts.lift === false ? [0, 0, 0] : scl(tw, (ext + 0.5) * DZ);
      const Pl = add(sp.P, lift);
      const part = { P: sp.P, Pl, D, M, phi, sel: sp.sel || (() => true), full: rotAbout(Pl, D, phi), win: windows[j], strength: sp.amount / PI, noCrease: !!sp.noCrease };
      op.parts.push(part);
      // split
      const next = [];
      for (const p of POLYS) {
        if (p.mv[op.id] || !part.sel(p)) { next.push(p); continue; }
        const r = splitPoly(p, base, sp.P, M);
        if (r.side === 2) {
          r.pos.mv[op.id] = j + 1;
          r.neg.mv[op.id] = 0;
          next.push(r.pos, r.neg);
          if (!part.noCrease) {
            const nf = mulRv(p.cf[base].R, [0, 0, 1]);
            const vel = scl(cross(D, M), Math.sign(phi));
            const valley = dot(vel, nf) > 0;
            const born = t0 + (t1 - t0) * lerp(part.win[0], part.win[1], 0.15);
            const dur = (t1 - t0) * (part.win[1] - part.win[0]) * 0.7;
            CREASES.push({ a: r.seg[0], b: r.seg[1], k: (valley ? -1 : 1) * Math.min(1, part.strength), born, dur, op: name });
          }
        } else {
          if (r.side === 1) p.mv[op.id] = j + 1;
          next.push(p);
        }
      }
      POLYS = next;
    });
    for (const p of POLYS) {
      const j = p.mv[op.id] || 0;
      const b = p.cf[base];
      p.cf[res] = j ? tfMul(op.parts[j - 1].full, b) : b;
    }
    if (op.flat) compact(res);
    for (const p of POLYS) {
      const j = p.mv[op.id] || 0;
      const b = p.cf[base];
      const raw = j ? tfMul(op.parts[j - 1].full, b) : b;
      p.corr[op.id] = sub(p.cf[res].t, raw.t);
    }
    CUR = res;
    EVENTS.push({ kind: 'push', op, t0, t1, win: windows });
    return op;
  }
  function popOp(op, win, windows) {
    EVENTS.push({ kind: 'pop', op, t0: bt(win[0]), t1: bt(win[1]), win: windows || op.parts.map(() => [0, 1]) });
    CUR = op.base;
  }

  // ---------------------------------------------------------------- the gear (closed linkage)
  // The doubled A5 (paper X in [-A, 0], two layers) pleats along paper Y: 32 creases, four per tooth,
  // and curls UP round its middle panel until the two ends meet: an 8-tooth gear whose axis is paper X.
  const GEAR = { N: 8 };
  function gearProfile() {
    const N = GEAR.N;
    const al = 15 * DEG, ga = 4 * DEG, be = TAU / N - al - 2 * ga;
    const R = 1, r = 1 / 1.3;
    const verts = [];
    const pol = (rad, th) => [rad * Math.cos(th), rad * Math.sin(th)];
    const top = PI / 2;
    verts.push(pol(R, top));
    for (let j = 0; j < N; j++) {
      const c = top + j * (TAU / N);
      if (j > 0) verts.push(pol(R, c - al / 2));
      verts.push(pol(R, c + al / 2));
      verts.push(pol(r, c + al / 2 + ga));
      verts.push(pol(r, c + al / 2 + ga + be));
    }
    verts.push(pol(R, top + TAU - al / 2));
    const a0 = pol(R, top - al / 2), a1 = pol(R, top + al / 2);
    verts[0] = [(a0[0] + a1[0]) / 2, (a0[1] + a1[1]) / 2];
    verts.push(verts[0]);
    const lens = [], dirs = [];
    for (let i = 0; i < verts.length - 1; i++) {
      const dx = verts[i + 1][0] - verts[i][0], dy = verts[i + 1][1] - verts[i][1];
      lens.push(Math.hypot(dx, dy));
      dirs.push(Math.atan2(dy, dx));
    }
    const total = lens.reduce((a, b) => a + b, 0);
    const k = (2 * B) / total;
    GEAR.R = R * k;
    GEAR.r = r * k;
    GEAR.lens = lens.map((l) => l * k);
    GEAR.n = lens.length; // 33 panels
    const psi = [0];
    for (let i = 1; i < dirs.length; i++) {
      let d = dirs[i] - dirs[i - 1];
      while (d > PI) d -= TAU;
      while (d < -PI) d += TAU;
      psi.push(d);
    }
    GEAR.psi = psi; // turn between panel i-1 and i (CCW: the ends curl up and meet overhead)
    GEAR.c = TAU / (GEAR.n - 1);
    GEAR.zeta = psi.map((v, i) => (i === 0 ? 0 : v - GEAR.c));
    const ys = [-B];
    for (let i = 0; i < GEAR.n; i++) ys.push(ys[i] + GEAR.lens[i]);
    GEAR.y = ys;
    GEAR.mid = 16; // the land that stays on the desk
  }
  function gearChain(rip, curl) {
    const n = GEAR.n, m = GEAR.mid;
    const Q = new Array(n + 1), F = new Array(n);
    const turn = (i) => GEAR.zeta[i] * rip[i] + GEAR.c * curl;
    F[m] = 0;
    Q[m] = [GEAR.y[m], 0];
    for (let k = m; k < n; k++) {
      Q[k + 1] = [Q[k][0] + GEAR.lens[k] * Math.cos(F[k]), Q[k][1] + GEAR.lens[k] * Math.sin(F[k])];
      if (k + 1 < n) F[k + 1] = F[k] + turn(k + 1);
    }
    for (let k = m - 1; k >= 0; k--) {
      F[k] = F[k + 1] - turn(k + 1);
      Q[k] = [Q[k + 1][0] - GEAR.lens[k] * Math.cos(F[k]), Q[k + 1][1] - GEAR.lens[k] * Math.sin(F[k])];
    }
    return { Q, F };
  }
  // panel k: paper Y runs along the chain (in the local Y-Z plane), paper X is the gear axis
  function panelTF(ch, k) {
    const c = Math.cos(ch.F[k]), s = Math.sin(ch.F[k]);
    const R = [1, 0, 0, 0, c, -s, 0, s, c];
    const y = GEAR.y[k];
    return mk(R, [0, ch.Q[k][0] - c * y, ch.Q[k][1] - s * y]);
  }
  // teeth pleat in pairs from the middle outward (a tooth's 4 creases fold together, so the rest of the
  // strip stays flat on the desk), each pair landing on an 8th; then the strip curls shut
  const gearRank = (i) => {
    const g = Math.floor((i - 1) / 4);
    return g <= 3 ? 3 - g : g - 4;
  };
  function gearParams(u) {
    const b = lerp(TM.gear[0], TM.gear[1], u);
    const n = GEAR.n;
    const rip = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      const land = TM.gear[0] + 0.5 + 0.5 * gearRank(i);
      rip[i] = efold((b - (land - 0.42)) / 0.42);
    }
    const curl = efold((b - (TM.gear[1] - 0.72)) / 0.72);
    return { rip, curl };
  }
  function pushGear(win) {
    gearProfile();
    const base = CUR;
    const res = NCFG++;
    const op = { kind: 'gear', name: 'gear', id: OPS.length, base, res, parts: [] };
    OPS.push(op);
    const t0 = bt(win[0]), t1 = bt(win[1]);
    for (let i = 1; i < GEAR.n; i++) {
      const yk = GEAR.y[i];
      const next = [];
      for (const p of POLYS) {
        const r = splitPoly(p, base, [0, yk, 0], [0, 1, 0]);
        if (r.side === 2) {
          next.push(r.pos, r.neg);
          const nf = mulRv(p.cf[base].R, [0, 0, 1]);
          const valley = (GEAR.psi[i] > 0) === (nf[2] > 0);
          const born = bt(TM.gear[0] + 0.5 + 0.5 * gearRank(i) - 0.3);
          CREASES.push({ a: r.seg[0], b: r.seg[1], k: (valley ? -1 : 1) * 0.3, born, dur: bt(0.3), op: 'gear' });
        } else next.push(p);
      }
      POLYS = next;
    }
    for (const p of POLYS) {
      const cy = centroidW(polyWorld(p, base))[1];
      let k = 0;
      while (k < GEAR.n - 1 && cy > GEAR.y[k + 1]) k++;
      p.pan[op.id] = k;
    }
    const full = gearChain(new Array(GEAR.n).fill(1), 1);
    GEAR.full = full;
    for (const p of POLYS) p.cf[res] = tfMul(panelTF(full, p.pan[op.id]), p.cf[base]);
    CUR = res;
    EVENTS.push({ kind: 'push', op, t0, t1 });
    return op;
  }

  // ---------------------------------------------------------------- build the whole program
  const OPN = {};
  function build() {
    if (POLYS) return;
    PID = 0;
    POLYS = [{ id: PID++, pts: [[-A, -B], [A, -B], [A, B], [-A, B]], cf: [ID], mv: {}, pan: {}, corr: {} }];
    NCFG = 1;
    CUR = 0;
    const Z = [0, 0, 1];
    const NZ = [0, 0, -1];
    const Y = [0, 1, 0];
    // F0: the top half folds back behind the bottom half (mountain). From here on the reverse side is
    // sealed between the two layers, so every later fold can only ever show the printed front.
    OPN.F0 = pushFold('F0', [{ P: [0, 0, 0], D: Y, M: [1, 0, 0], toward: NZ, amount: PI }], TM.F0, { flat: true });
    // the gear
    OPN.gear = pushGear(TM.gear);
    popOp(OPN.gear, TM.gearPop);
    // the paper plane: a classic dart on the doubled A5 (X in [-A, 0]); keel X = -A/2, tip at +Y
    const kx = -A / 2, h = A / 2;
    OR.KEEL = kx;
    const tip = [kx, B, 0];
    OPN.corners = pushFold('corners', [
      { P: tip, D: nrm([1, -1, 0]), M: nrm([1, 1, 0]), toward: Z, amount: PI },
      { P: tip, D: nrm([-1, -1, 0]), M: nrm([-1, 1, 0]), toward: Z, amount: PI },
    ], TM.corners, { flat: true, windows: WC });
    const s22 = Math.sin(22.5 * DEG), c22 = Math.cos(22.5 * DEG);
    OPN.edges = pushFold('edges', [
      { P: tip, D: [s22, -c22, 0], M: [c22, s22, 0], toward: Z, amount: PI },
      { P: tip, D: [-s22, -c22, 0], M: [-c22, s22, 0], toward: Z, amount: PI },
    ], TM.edges, { flat: true, windows: WE });
    void h;
    const TH = 164 * DEG;
    OR.TH = TH;
    OPN.halving = pushFold('halving', [{ P: [kx, 0, 0], D: Y, M: [1, 0, 0], toward: Z, amount: TH }], TM.halving, { lift: false });
    const halvingOp = OPN.halving;
    const Rh = halvingOp.parts[0].full;
    const dW = 0.22;
    const WA = 76 * DEG;
    const inTop = (p) => !!p.mv[halvingOp.id];
    // each wing folds away from the other half (valley halving: the other half is above)
    OPN.wings = pushFold('wings', [
      { P: [kx - dW, 0, 0], D: Y, M: [-1, 0, 0], toward: NZ, amount: WA, sel: (p) => !inTop(p) },
      { P: tfApply(Rh, [kx + dW, 0, 0]), D: mulRv(Rh.R, Y), M: mulRv(Rh.R, [1, 0, 0]), toward: mulRv(Rh.R, NZ), amount: WA, sel: inTop },
    ], TM.wings, { lift: false, windows: WW });
    popOp(OPN.wings, TM.wingsP, [[0, 1], [0, 1]]);
    popOp(OPN.halving, TM.halvingP);
    popOp(OPN.edges, TM.edgesP, WP);
    popOp(OPN.corners, TM.cornersP, WP);
    popOp(OPN.F0, TM.open);
    CREASES.sort((a, b) => a.born - b.born);
    OR.ANCHOR = POLYS.findIndex((p) => p.mv[OPN.F0.id]); // a polygon of the bottom layer
    buildSpin();
    buildFlight();
    tessellate();
  }

  // ---------------------------------------------------------------- per-frame state
  function findEvent(T) {
    let ev = null;
    for (const e of EVENTS) {
      if (e.t0 <= T) ev = e;
      else break;
    }
    return ev;
  }
  function partFrac(ev, j, T) {
    const u = clamp((T - ev.t0) / (ev.t1 - ev.t0));
    const w = ev.win ? ev.win[j] : [0, 1];
    const a = efold((u - w[0]) / (w[1] - w[0]));
    return ev.kind === 'push' ? a : 1 - a;
  }
  OR.opFrac = (name, T) => {
    // eased fraction (0 unfolded .. 1 folded) of op `name` at T
    const op = OPN[name];
    let f = 0;
    for (const e of EVENTS) {
      if (e.op !== op || e.t0 > T) continue;
      f = T >= e.t1 ? (e.kind === 'push' ? 1 : 0) : partFrac(e, 0, T);
    }
    return f;
  };

  // returns per-poly transforms + bend info at T (local frame, before G)
  function localState(T) {
    const ev = findEvent(T);
    const out = new Array(POLYS.length);
    if (!ev) {
      for (let i = 0; i < POLYS.length; i++) out[i] = { T: POLYS[i].cf[0] };
      return out;
    }
    const done = T >= ev.t1;
    const op = ev.op;
    if (done) {
      const cid = ev.kind === 'push' ? op.res : op.base;
      for (let i = 0; i < POLYS.length; i++) out[i] = { T: POLYS[i].cf[cid] };
      return out;
    }
    if (op.kind === 'gear') {
      const u = clamp((T - ev.t0) / (ev.t1 - ev.t0));
      const gp = ev.kind === 'push' ? gearParams(u) : gearPopParams(u);
      const ch = gearChain(gp.rip, gp.curl);
      const tfs = new Array(GEAR.n);
      for (let k = 0; k < GEAR.n; k++) tfs[k] = panelTF(ch, k);
      for (let i = 0; i < POLYS.length; i++) {
        const p = POLYS[i];
        out[i] = { T: tfMul(tfs[p.pan[op.id]], p.cf[op.base]) };
      }
      out.gearChain = ch;
      return out;
    }
    const fr = op.parts.map((_, j) => partFrac(ev, j, T));
    const uAll = clamp((T - ev.t0) / (ev.t1 - ev.t0));
    for (let i = 0; i < POLYS.length; i++) {
      const p = POLYS[i];
      const j = p.mv[op.id] || 0;
      const base = p.cf[op.base];
      const corr = p.corr[op.id] || [0, 0, 0];
      if (!j) {
        const a = ev.kind === 'push' ? eio(uAll) : 1 - eio(uAll);
        out[i] = { T: mk(base.R, add(base.t, scl(corr, a))) };
        continue;
      }
      const part = op.parts[j - 1];
      const a = fr[j - 1];
      const Tr = tfMul(rotAbout(part.Pl, part.D, part.phi * a), base);
      const c = sstep(0.55, 1, a);
      out[i] = { T: mk(Tr.R, add(Tr.t, scl(corr, c))), bend: { P: part.Pl, D: part.D, sgn: Math.sign(part.phi), amt: Math.sin(PI * a) * (ev.kind === 'push' ? 1 : -0.6) } };
    }
    return out;
  }
  function gearPopParams(u) {
    // reverse: uncurl over 0..0.5, then unpleat from the ends inward over 0.45..1
    const curl = 1 - eio(u / 0.5);
    const n = GEAR.n;
    const rip = new Array(n).fill(1);
    for (let i = 1; i < n; i++) {
      const g = Math.floor((i - 1) / 4);
      const rank = g <= 3 ? 3 - g : g - 4;
      const s0 = 0.46 + (3 - rank) * 0.12;
      rip[i] = 1 - efold((u - s0) / 0.17);
    }
    return { rip, curl };
  }

  // ---------------------------------------------------------------- the gear spins (clockwork ticks)
  const SPIN = {};
  function buildSpin() {
    const ch = GEAR.full;
    let cy = 0, cz = 0;
    for (let k = 0; k < GEAR.n; k++) { cy += ch.Q[k][0]; cz += ch.Q[k][1]; }
    SPIN.C = [0, cy / GEAR.n, cz / GEAR.n];
    SPIN.ticks = [];
    for (let i = 0; i < 8; i++) SPIN.ticks.push(TM.spin[0] + 0.5 + i * 0.25);
  }
  const backOut = (u) => {
    u = clamp(u);
    const s = 1.3;
    return 1 + (s + 1) * Math.pow(u - 1, 3) + s * Math.pow(u - 1, 2);
  };
  // local transform of the whole ring while it ticks round on its axle (paper X)
  function spinLocal(T) {
    const b = T / BEAT;
    const lift = 0.07 * (eio((b - TM.spin[0]) / 0.35) - eio((b - (TM.spin[1] - 0.3)) / 0.3));
    let ang = 0;
    for (const e of SPIN.ticks) ang += (TAU / 8) * backOut((b - (e - TM.tickDur)) / TM.tickDur);
    return tfMul(transl([0, 0, lift]), rotAbout(SPIN.C, [1, 0, 0], -ang));
  }

  // ---------------------------------------------------------------- flight path
  const FL = {};
  function bez(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return add(add(scl(p0, u * u * u), scl(p1, 3 * u * u * t)), add(scl(p2, 3 * u * t * t), scl(p3, t * t * t)));
  }
  function buildFlight() {
    const pts = [], seg = [], cen = [];
    // the loop is tilted toward the camera (beta), so its wings are seen, not only its profile
    const rho = 2.1, beta = 46 * DEG;
    const Uh = [0, -Math.sin(beta), Math.cos(beta)];
    const E = [2.3, 0.35, 0.55];
    const C = add(E, scl(Uh, rho));
    // takeoff from the rest pose (keel on the desk at the origin)
    for (let i = 0; i < 400; i++) { pts.push(bez([0, 0, 0], [0.9, 0, 0], [E[0] - 1.1, E[1], E[2]], E, i / 400)); seg.push(0); cen.push(null); }
    // one full loop; a slow sideways drift so the exit does not retrace the entry
    const yd = -0.55;
    for (let i = 0; i < 1600; i++) {
      const t = i / 1600;
      const th = -PI / 2 + TAU * t;
      const c = add(C, [0, yd * t, 0]);
      pts.push(add(c, add(scl([1, 0, 0], rho * Math.cos(th)), scl(Uh, rho * Math.sin(th)))));
      seg.push(1);
      cen.push(c);
    }
    // glide down to touch-down, then slide to a stop at L
    const X0 = add(E, [0, yd, 0]);
    const TD = [4.15, -0.62, 0];
    const Lp = [4.85, -0.62, 0];
    FL.L = Lp;
    for (let i = 0; i < 500; i++) { pts.push(bez(X0, add(X0, [0.65, 0, 0]), add(TD, [-0.75, 0, 0]), TD, i / 500)); seg.push(2); cen.push(null); }
    for (let i = 0; i <= 120; i++) { pts.push([lerp(TD[0], Lp[0], i / 120), TD[1], 0]); seg.push(3); cen.push(null); }
    const n = pts.length;
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + len(sub(pts[i], pts[i - 1]));
    // desired "up": world up on the ground legs, toward the loop centre in the loop, blended at the seams
    const fw = [], up = [];
    const iL0 = 400, iL1 = 2000;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let f = sub(b, a);
      f = len(f) > 1e-9 ? nrm(f) : fw[i - 1] || [1, 0, 0];
      let uLoop = [0, 0, 1];
      const ci = cen[Math.min(Math.max(i, iL0), iL1 - 1)];
      if (ci) uLoop = nrm(sub(ci, pts[Math.min(Math.max(i, iL0), iL1 - 1)]));
      const w = sstep(iL0 - 160, iL0 + 120, i) * (1 - sstep(iL1 - 120, iL1 + 160, i));
      let u = nrm(add(scl([0, 0, 1], 1 - w), scl(uLoop, w)));
      if (Math.abs(dot(u, f)) > 0.98) u = up[i - 1] || [0, 0, 1];
      u = nrm(sub(u, scl(f, dot(u, f))));
      fw.push(f);
      up.push(u);
    }
    FL.pts = pts; FL.s = s; FL.fw = fw; FL.up = up; FL.len = s[n - 1];
    FL.sTD = s[400 + 1600 + 500 - 1];
    // distance along the path keyed in beats (monotone cubic): takeoff, loop, glide, touch-down, stop
    const sLoop0 = s[400], sLoop1 = s[2000 - 1];
    const K = [[TM.flight[0], 0], [20.8, sLoop0], [24.3, sLoop1], [26.25, FL.sTD], [TM.flight[1], FL.len]];
    const nK = K.length;
    const d = [];
    for (let k = 0; k < nK - 1; k++) d.push((K[k + 1][1] - K[k][1]) / (K[k + 1][0] - K[k][0]));
    const m = new Array(nK);
    m[0] = 0;
    m[nK - 1] = 0;
    for (let k = 1; k < nK - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (2 * d[k - 1] * d[k]) / (d[k - 1] + d[k]);
    FL.K = K; FL.Km = m;
  }
  function flightS(b) {
    const K = FL.K, m = FL.Km;
    if (b <= K[0][0]) return 0;
    if (b >= K[K.length - 1][0]) return FL.len;
    let k = 0;
    while (b > K[k + 1][0]) k++;
    const h = K[k + 1][0] - K[k][0];
    const t = (b - K[k][0]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * K[k][1] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * K[k + 1][1] + (t3 - t2) * h * m[k + 1];
  }
  function poseAtS(sv) {
    const s = FL.s, n = s.length;
    let lo = 0, hi = n - 1;
    sv = clamp(sv, 0, FL.len);
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (s[mid] <= sv) lo = mid; else hi = mid;
    }
    const t = s[hi] > s[lo] ? (sv - s[lo]) / (s[hi] - s[lo]) : 0;
    const p = add(scl(FL.pts[lo], 1 - t), scl(FL.pts[hi], t));
    const f = nrm(add(scl(FL.fw[lo], 1 - t), scl(FL.fw[hi], t)));
    let u = add(scl(FL.up[lo], 1 - t), scl(FL.up[hi], t));
    u = nrm(sub(u, scl(f, dot(u, f))));
    const l = cross(u, f);
    let T = mk(frameR(f, l, u), p);
    // settle exactly level and straight for the landing slide
    const w = sstep(FL.sTD - 0.6, FL.sTD, sv);
    if (w > 0) T = tfBlend(T, mk(I3(), p), w);
    // banking flourish: a little roll as it pulls into the loop and exits
    return T;
  }
  function flightG(T) {
    return poseAtS(flightS(T / BEAT));
  }


  // ---------------------------------------------------------------- global placement G(T)
  // G maps the folding (local) frame to the desk. Local: the sheet lies flat, front up, X along its length.
  const A5 = chain(rotZ(-PI / 2), transl([A / 2, 0, 0])); // doubled A5 centred, its long side (paper Y) along desk X
  const pivotG = (piv, R) => chain(transl(piv), R, transl(scl(piv, -1)));
  const S = (th) => rotAbout([-A / 2, 0, 0], [0, 1, 0], th / 2); // symmetric body: both halves rise about the keel
  // the arrow stands on its tail edge, tip up, face to the camera (-Y)
  const LEAN = 32 * DEG;
  const ARROW = tfMul(rotY(LEAN), mk([1, 0, 0, 0, 0, -1, 0, 1, 0], [0, 0, 0]));
  function arrowPose(hop) {
    const tail = [-A / 2, -B, 0];
    const at = [-0.35, 0.0, (A / 2) * Math.sin(LEAN) + hop];
    const t = sub(at, mulRv(ARROW.R, tail));
    return mk(ARROW.R, t);
  }
  function anchorG(T, base, ls) {
    // keep the bottom layer still while the top layer swings open
    const a = ls[OR.ANCHOR].T;
    const W = tfMul(base, POLYS[OR.ANCHOR].cf[OPN.F0.res]);
    return tfMul(W, tfInv(a));
  }
  function G(T, ls) {
    const b = T / BEAT;
    if (b < TM.stand0[0]) return ID;
    if (b < TM.lie[0]) {
      const a = eio((b - TM.stand0[0]) / (TM.stand0[1] - TM.stand0[0]));
      return pivotG([-A, 0, 0], rotY((-PI / 2) * a));
    }
    if (b < TM.gear[0]) {
      const a = eio((b - TM.lie[0]) / (TM.lie[1] - TM.lie[0]));
      const u = eio((b - TM.turn[0]) / (TM.turn[1] - TM.turn[0]));
      return tfMul(tfBlend(ID, A5, u), pivotG([-A, 0, 0], rotY((-PI / 2) * (1 - a))));
    }
    if (b < TM.spin[0] || (b >= TM.gearPop[0] && b < TM.arrow[0])) return A5;
    if (b < TM.gearPop[0]) return tfMul(A5, spinLocal(T));
    if (b < TM.arrow[0]) return A5;
    if (b < TM.halving[0]) {
      const [a0, a1, a2, a3] = TM.arrow;
      let u = 0, hop = 0;
      const ss = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
      if (b < a1) u = ss((b - a0) / (a1 - a0));
      else if (b < a2) {
        u = 1;
        const hh = (b - a1) / (a2 - a1);
        hop = 0.3 * Math.sin(PI * Math.min(1, hh * 1.4)) * (hh < 1 / 1.4 ? 1 : 0);
      } else u = 1 - ss((b - a2) / (a3 - a2));
      const g1 = arrowPose(hop);
      if (u >= 1) return g1;
      const r = quatToR(slerp(quatFromR(A5.R), quatFromR(g1.R), u));
      const tailL = [-A / 2, -B, 0];
      const p0 = tfApply(A5, tailL), p1 = tfApply(g1, tailL);
      const pt = [lerp(p0[0], p1[0], u), lerp(p0[1], p1[1], u), lerp(p0[2], p1[2], u) + 0.25 * Math.sin(PI * u)];
      return mk(r, sub(pt, mulRv(r, tailL)));
    }
    if (b < TM.flight[0]) return tfMul(A5, S(OR.TH * OR.opFrac('halving', T)));
    if (b < TM.flight[1]) return chain(flightG(T), A5, S(OR.TH));
    const base = chain(transl(FL.L), A5);
    if (b < TM.open[0]) return tfMul(base, S(OR.TH * OR.opFrac('halving', T)));
    return anchorG(T, base, ls);
  }
  OR.G = G;

  // displacement along world z for the flat sheet: the stir before it stands up
  function flutter(X, Y, T) {
    const b = T / BEAT;
    if (b >= TM.stir[0] && b < TM.stir[1]) {
      const u = (b - TM.stir[0]) / (TM.stir[1] - TM.stir[0]);
      const env = Math.sin(PI * u) * Math.sin(PI * u);
      const d = Math.hypot(X - A, Y + B) / 1.35;
      const wave = Math.max(0, 1 - d) ** 2;
      const ripple = 0.5 + 0.5 * Math.sin(TAU * (d * 1.2 - u * 1.6));
      return 0.13 * env * wave * (0.7 + 0.3 * ripple);
    }
    return 0;
  }

  // ---------------------------------------------------------------- tessellation + geometry buffers
  let GEO = null;
  function tessellate() {
    const verts = []; // per triangle-vertex: poly index, X, Y
    const polyRange = [];
    const areas = [];
    POLYS.forEach((p, pi) => {
      const pts = p.pts;
      let maxE = 0;
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) maxE = Math.max(maxE, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
      const lv = clamp(Math.ceil(Math.log2(maxE / 0.16)), 0, 4);
      const start = verts.length / 3;
      const ccw = polyArea(pts) > 0;
      const emit = (a, b, c, l) => {
        if (l === 0) {
          if (ccw) verts.push(pi, a[0], a[1], pi, b[0], b[1], pi, c[0], c[1]);
          else verts.push(pi, a[0], a[1], pi, c[0], c[1], pi, b[0], b[1]);
          return;
        }
        const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2], ca = [(c[0] + a[0]) / 2, (c[1] + a[1]) / 2];
        emit(a, ab, ca, l - 1); emit(ab, b, bc, l - 1); emit(ca, bc, c, l - 1); emit(ab, bc, ca, l - 1);
      };
      for (let i = 1; i < pts.length - 1; i++) emit(pts[0], pts[i], pts[i + 1], lv);
      polyRange.push([start, verts.length / 3]);
      areas.push(Math.abs(polyArea(pts)));
    });
    const nv = verts.length / 3;
    GEO = {
      nv,
      poly: new Int32Array(nv),
      paper: new Float32Array(nv * 2),
      pos: new Float32Array(nv * 3),
      nor: new Float32Array(nv * 3),
      tan: new Float32Array(nv * 3),
      bit: new Float32Array(nv * 3),
      ranges: polyRange,
      areas,
    };
    for (let i = 0; i < nv; i++) {
      GEO.poly[i] = verts[i * 3];
      GEO.paper[i * 2] = verts[i * 3 + 1];
      GEO.paper[i * 2 + 1] = verts[i * 3 + 2];
    }
  }

  let localStateCache = null;
  function updateGeometry(T) {
    const ls = localState(T);
    localStateCache = { T, v: ls };
    const g = G(T, ls);
    const bb = T / BEAT;
    const fl = bb >= TM.stir[0] && bb < TM.stir[1];
    const { pos, nor, tan, bit, paper, ranges } = GEO;
    for (let pi = 0; pi < POLYS.length; pi++) {
      const st = ls[pi];
      const Tw = tfMul(g, st.T);
      const R = Tw.R;
      const n0 = [R[2], R[5], R[8]];
      const tx = [R[0], R[3], R[6]];
      const ty = [R[1], R[4], R[7]];
      let bend = null;
      if (st.bend && Math.abs(st.bend.amt) > 1e-4) {
        // the flap lags behind its own motion: a soft bow that grows away from the hinge
        const P = tfApply(g, st.bend.P);
        const D = mulRv(g.R, st.bend.D);
        bend = { P, D, k: 0.06 * st.bend.amt, sp: st.bend.sgn };
      }
      const [s, e] = ranges[pi];
      for (let v = s; v < e; v++) {
        const X = paper[v * 2], Y = paper[v * 2 + 1];
        let p = tfApply(Tw, [X, Y, 0]);
        let n = n0;
        if (bend) {
          const rel = sub(p, bend.P);
          const along = scl(bend.D, dot(rel, bend.D));
          const rv = sub(rel, along);
          const r = len(rv);
          if (r > 1e-6) {
            const vel = nrm(cross(bend.D, rv));
            const sgn = Math.sign(dot(vel, n0)) || 1;
            const nn = scl(n0, sgn); // unit along the motion
            const disp = -bend.k * bend.sp * r * r;
            p = add(p, scl(nn, disp));
            n = nrm(add(n0, scl(rv, (2 * bend.k * bend.sp * sgn * r) / r)));
          }
        }
        if (fl) {
          const f = flutter(X, Y, T);
          if (f !== 0) {
            const h = 0.01;
            const fx = (flutter(X + h, Y, T) - f) / h, fy = (flutter(X, Y + h, T) - f) / h;
            // displacement along world z; slope along the paper axes mapped to world
            p = [p[0], p[1], p[2] + f];
            const gx = scl(tx, fx), gy = scl(ty, fy);
            const grad = add(gx, gy); // world-xy gradient of the bump
            const sz = n0[2] >= 0 ? 1 : -1;
            n = nrm([n[0] - grad[0] * sz, n[1] - grad[1] * sz, n[2]]);
          }
        }
        pos[v * 3] = p[0]; pos[v * 3 + 1] = p[1]; pos[v * 3 + 2] = p[2];
        nor[v * 3] = n[0]; nor[v * 3 + 1] = n[1]; nor[v * 3 + 2] = n[2];
        tan[v * 3] = tx[0]; tan[v * 3 + 1] = tx[1]; tan[v * 3 + 2] = tx[2];
        bit[v * 3] = ty[0]; bit[v * 3 + 1] = ty[1]; bit[v * 3 + 2] = ty[2];
      }
    }
    return g;
  }

  // ---------------------------------------------------------------- printed faces (canvas, once)
  const TEXS = 820; // px per unit
  function fibres(ctx, w, h, seed) {
    const r = L.rng('origami-fibre-' + seed);
    // low-frequency mottling
    for (let i = 0; i < 260; i++) {
      const x = r() * w, y = r() * h, rad = 40 + r() * 220;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const a = 0.025 + r() * 0.03;
      const col = r() < 0.5 ? 'rgba(185,174,156,' + a + ')' : 'rgba(255,253,248,' + a * 1.4 + ')';
      g.addColorStop(0, col);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // fibres
    ctx.lineCap = 'round';
    for (let i = 0; i < 5200; i++) {
      const x = r() * w, y = r() * h;
      const l = 6 + r() * 34, a0 = r() * TAU, bend = (r() - 0.5) * 0.9;
      ctx.strokeStyle = r() < 0.62 ? 'rgba(150,138,120,' + (0.05 + r() * 0.09) + ')' : 'rgba(255,255,255,' + (0.1 + r() * 0.16) + ')';
      ctx.lineWidth = 0.6 + r() * 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a0 + bend) * l * 0.5, y + Math.sin(a0 + bend) * l * 0.5, x + Math.cos(a0) * l, y + Math.sin(a0) * l);
      ctx.stroke();
    }
    // tooth: per-pixel grain
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const n = (L.h3(x, y, seed) - 0.5) * 9 + (L.h3(x >> 2, y >> 2, seed + 7) - 0.5) * 6;
        d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n * 1.05, 0, 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }
  function inkText(ctx, text, x, y, font, color, opts = {}) {
    ctx.save();
    ctx.font = font;
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = 'alphabetic';
    if ('letterSpacing' in ctx && opts.spacing) ctx.letterSpacing = opts.spacing;
    ctx.fillStyle = color;
    ctx.globalAlpha = opts.alpha == null ? 1 : opts.alpha;
    ctx.fillText(text, x, y);
    ctx.restore();
  }
  function frontCanvas() {
    // portrait document, page-up = paper +X; canvas x = (B - Y), canvas y = (A - X)
    const w = Math.round(2 * B * TEXS), h = Math.round(2 * A * TEXS);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = PAL.opPaper;
    g.fillRect(0, 0, w, h);
    fibres(g, w, h, 11);
    const u = TEXS;
    const mx = 0.2 * u;
    // header rule + tiny meta bars
    g.fillStyle = PAL.opInkGrey;
    g.globalAlpha = 0.55;
    g.fillRect(mx, 0.2 * u, 0.42 * u, 0.035 * u);
    g.fillRect(w - mx - 0.3 * u, 0.2 * u, 0.3 * u, 0.035 * u);
    g.globalAlpha = 0.8;
    g.fillRect(mx, 0.3 * u, w - 2 * mx, 0.008 * u);
    g.globalAlpha = 1;
    // the hook, printed
    inkText(g, 'Один лист.', mx - 0.01 * u, 0.62 * u, '700 ' + Math.round(0.25 * u) + 'px "Futura", "Helvetica Neue", sans-serif', PAL.opInk);
    inkText(g, 'Ни одного разреза.', mx, 0.86 * u, '600 ' + Math.round(0.155 * u) + 'px "Futura", "Helvetica Neue", sans-serif', PAL.opInk, { alpha: 0.88 });
    // the routine: paragraphs of grey type, a form table, a signature line
    const r = L.rng('origami-doc');
    g.fillStyle = PAL.opInkGrey;
    let y = 1.08 * u;
    for (let para = 0; para < 3; para++) {
      const lines = 3 + Math.floor(r() * 2);
      for (let i = 0; i < lines; i++) {
        let x = mx;
        const end = i === lines - 1 ? mx + (0.35 + r() * 0.5) * (w - 2 * mx) : w - mx;
        while (x < end - 0.05 * u) {
          const ww = Math.min(end - x, (0.05 + r() * 0.16) * u);
          g.globalAlpha = 0.42 + r() * 0.12;
          g.fillRect(x, y, ww, 0.026 * u);
          x += ww + 0.028 * u;
        }
        y += 0.068 * u;
      }
      y += 0.06 * u;
    }
    // table
    const rows = 9, cols = 4;
    const tx0 = mx, tx1 = w - mx, ty0 = y + 0.02 * u, rh = 0.105 * u;
    g.strokeStyle = PAL.opInkGrey;
    g.globalAlpha = 0.6;
    g.lineWidth = 0.006 * u;
    for (let i = 0; i <= rows; i++) { g.beginPath(); g.moveTo(tx0, ty0 + i * rh); g.lineTo(tx1, ty0 + i * rh); g.stroke(); }
    const cx = [0, 0.38, 0.62, 0.82, 1];
    for (const f of cx) { g.beginPath(); g.moveTo(tx0 + f * (tx1 - tx0), ty0); g.lineTo(tx0 + f * (tx1 - tx0), ty0 + rows * rh); g.stroke(); }
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const x0 = tx0 + cx[j] * (tx1 - tx0) + 0.03 * u;
      const ww = (cx[j + 1] - cx[j]) * (tx1 - tx0) * (0.3 + r() * 0.5);
      g.globalAlpha = i === 0 ? 0.62 : 0.36 + r() * 0.12;
      g.fillRect(x0, ty0 + i * rh + rh * 0.38, ww, 0.024 * u);
    }
    y = ty0 + rows * rh + 0.14 * u;
    for (let i = 0; i < 3; i++) {
      let x = mx;
      while (x < w - mx - 0.1 * u) {
        const ww = Math.min(w - mx - x, (0.05 + r() * 0.15) * u);
        g.globalAlpha = 0.4;
        g.fillRect(x, y, ww, 0.026 * u);
        x += ww + 0.028 * u;
      }
      y += 0.068 * u;
    }
    g.globalAlpha = 0.6;
    g.fillRect(w - mx - 0.62 * u, h - 0.3 * u, 0.62 * u, 0.007 * u);
    g.fillRect(mx, h - 0.3 * u, 0.36 * u, 0.007 * u);
    g.globalAlpha = 1;
    return c;
  }
  function planeIcon(g, x, y, s, col) {
    // a plain paper dart seen from above, nose right
    g.save();
    g.translate(x, y);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(1.0 * s, 0);
    g.lineTo(-0.62 * s, -0.5 * s);
    g.lineTo(-0.34 * s, -0.04 * s);
    g.closePath();
    g.fill();
    g.globalAlpha = 0.7;
    g.beginPath();
    g.moveTo(1.0 * s, 0);
    g.lineTo(-0.34 * s, 0.04 * s);
    g.lineTo(-0.5 * s, 0.42 * s);
    g.closePath();
    g.fill();
    g.restore();
  }
  function backCanvas() {
    // landscape card read from the back, card opened: canvas x = A - X, canvas y = B - Y
    const w = Math.round(2 * A * TEXS), h = Math.round(2 * B * TEXS);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = PAL.opPaper;
    g.fillRect(0, 0, w, h);
    fibres(g, w, h, 23);
    const u = TEXS;
    const px = (X) => (X + A) * u;
    const py = (v) => (B - v) * u; // v = back-view up
    // the inside of the card: wordmark across the centre fold, then the promise and the two addresses
    const cx = px(0);
    const fs = Math.round(0.56 * u);
    g.save();
    g.font = '700 ' + fs + 'px "Futura", "Helvetica Neue", sans-serif';
    g.textAlign = 'center';
    const tw = g.measureText('AiXenix').width;
    const grad = g.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
    grad.addColorStop(0, PAL.opMagentaInk);
    grad.addColorStop(0.55, PAL.opVioletInk);
    grad.addColorStop(1, PAL.opCyanInk);
    g.fillStyle = grad;
    g.fillText('AiXenix', cx, py(0.13));
    g.restore();
    const F = (w, sz) => w + ' ' + Math.round(sz * u) + 'px "Futura", "Helvetica Neue", sans-serif';
    inkText(g, 'Бизнес на автопилоте', cx, py(-0.22), F(600, 0.2), PAL.opInk, { align: 'center' });
    inkText(g, 'aixenix.com', cx, py(-0.56), F(700, 0.185), PAL.opMagentaInk, { align: 'center' });
    g.save();
    g.font = F(700, 0.185);
    const tw2 = g.measureText('t.me/aixenix').width;
    g.restore();
    const ix = cx - (tw2 + 0.3 * u) / 2;
    planeIcon(g, ix + 0.11 * u, py(-0.87) - 0.065 * u, 0.12 * u, PAL.opVioletInk);
    inkText(g, 't.me/aixenix', ix + 0.3 * u, py(-0.87), F(700, 0.185), PAL.opVioletInk);
    return c;
  }
  function deskCanvas() {
    const w = 1024, h = 1024;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = PAL.opDesk;
    g.fillRect(0, 0, w, h);
    const img = g.getImageData(0, 0, w, h);
    const d = img.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const streak = Math.sin(y * 0.045 + 3 * Math.sin(x * 0.004) + L.h3(x >> 5, y >> 3, 3) * 0.8) * 2.2;
      const n = (L.h3(x, y, 77) - 0.5) * 7 + streak;
      d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n * 0.8, 0, 255); d[i + 2] = clamp(d[i + 2] + n * 1.2, 0, 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------- renderer
  let R3 = null;
  const MAXC = 1024;
  const CFG = (OR.cfg = Object.assign({ msaa: 0, shadow: 2048, bokeh: false, bloom: true, paper: 'phys', desk: 'std', fxaa: true, deskDof: true, env: true, shadowType: 'pcf' }, OR.cfg || {}));
  // paper-space cell grid: each cell lists the creases that can reach it (sorted by birth)
  const GX = 48, GY = 34, CRR = 0.085;
  function creaseGrid() {
    const cw = (2 * A) / GX, chh = (2 * B) / GY;
    const lists = [];
    for (let i = 0; i < GX * GY; i++) lists.push([]);
    const halfDiag = Math.hypot(cw, chh) / 2;
    CREASES.slice(0, MAXC).forEach((c, idx) => {
      const x0 = Math.min(c.a[0], c.b[0]) - CRR, x1 = Math.max(c.a[0], c.b[0]) + CRR;
      const y0 = Math.min(c.a[1], c.b[1]) - CRR, y1 = Math.max(c.a[1], c.b[1]) + CRR;
      const i0 = clamp(Math.floor((x0 + A) / cw), 0, GX - 1), i1 = clamp(Math.floor((x1 + A) / cw), 0, GX - 1);
      const j0 = clamp(Math.floor((y0 + B) / chh), 0, GY - 1), j1 = clamp(Math.floor((y1 + B) / chh), 0, GY - 1);
      const ab = [c.b[0] - c.a[0], c.b[1] - c.a[1]];
      const l2 = Math.max(1e-12, ab[0] * ab[0] + ab[1] * ab[1]);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = -A + (i + 0.5) * cw, py = -B + (j + 0.5) * chh;
        const t = clamp(((px - c.a[0]) * ab[0] + (py - c.a[1]) * ab[1]) / l2);
        const d = Math.hypot(px - (c.a[0] + ab[0] * t), py - (c.a[1] + ab[1] * t));
        if (d <= CRR + halfDiag) lists[j * GX + i].push(idx);
      }
    });
    let total = 0, maxN = 0;
    for (const l of lists) { total += l.length; maxN = Math.max(maxN, l.length); }
    const LW = 2048;
    const LH = Math.max(1, Math.ceil(total / LW));
    const head = new Float32Array(GX * GY * 4);
    const list = new Float32Array(LW * LH * 4);
    let off = 0;
    lists.forEach((l, ci) => {
      head[ci * 4] = off;
      head[ci * 4 + 1] = l.length;
      for (const v of l) { list[off * 4] = v; off++; }
    });
    return { head, list, LW, LH, maxN, total };
  }
  function initThree(w, h) {
    build();
    const THREE = window.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(w, h, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = CFG.shadowType === 'basic' ? THREE.BasicShadowMap : CFG.shadowType === 'vsm' ? THREE.VSMShadowMap : THREE.PCFShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(PAL.opBg);
    scene.fog = new THREE.Fog(new THREE.Color(PAL.opBg), 16, 42);
    const cam = new THREE.PerspectiveCamera(32, w / h, 0.05, 200);
    cam.up.set(0, 0, 1);

    // paper textures
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const mkTex = (cv) => {
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = aniso;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    const texF = mkTex(frontCanvas());
    const texB = mkTex(backCanvas());

    // crease table
    const cdata = new Float32Array(MAXC * 2 * 4);
    CREASES.slice(0, MAXC).forEach((c, i) => {
      cdata.set([c.a[0], c.a[1], c.b[0], c.b[1]], i * 8);
      cdata.set([c.k, c.born, Math.max(0.05, c.dur), 0], i * 8 + 4);
    });
    const ctex = new THREE.DataTexture(cdata, MAXC * 2, 1, THREE.RGBAFormat, THREE.FloatType);
    ctex.minFilter = THREE.NearestFilter;
    ctex.magFilter = THREE.NearestFilter;
    ctex.needsUpdate = true;

    const grid = creaseGrid();
    const mkData = (arr, w, h) => {
      const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat, THREE.FloatType);
      t.minFilter = THREE.NearestFilter;
      t.magFilter = THREE.NearestFilter;
      t.needsUpdate = true;
      return t;
    };
    OR.gridInfo = { maxN: grid.maxN, total: grid.total };
    const uni = {
      uCHead: { value: mkData(grid.head, GX, GY) }, uCList: { value: mkData(grid.list, grid.LW, grid.LH) },
      uFront: { value: texF }, uBack: { value: texB }, uCrease: { value: ctex },
      uCreaseN: { value: 0 }, uTime: { value: 0 }, uTrans: { value: 0.22 }, uGlow: { value: 0 }, uInk: { value: 1 },
      uPaperC: { value: new THREE.Color(PAL.opPaper).convertSRGBToLinear() },
    };
    const mat = CFG.paper === 'phys'
      ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide,
        sheen: 0.35, sheenRoughness: 0.55, sheenColor: new THREE.Color(PAL.opKey), envMapIntensity: 0.35,
      })
      : CFG.paper === 'std'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide, envMapIntensity: 0.35 })
        : new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
    const LAMB = CFG.paper === 'lambert';
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uni);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aPaper;\nattribute vec3 aTan;\nattribute vec3 aBit;\nvarying vec2 vPaper;\nvarying vec3 vTanV;\nvarying vec3 vBitV;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvPaper = aPaper;\nvTanV = normalize(normalMatrix * aTan);\nvBitV = normalize(normalMatrix * aBit);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec2 vPaper; varying vec3 vTanV; varying vec3 vBitV;
uniform sampler2D uFront; uniform sampler2D uBack; uniform sampler2D uCrease; uniform sampler2D uCHead; uniform sampler2D uCList;
uniform int uCreaseN; uniform float uTime; uniform float uTrans; uniform float uGlow; uniform float uInk; uniform vec3 uPaperC;
vec3 gTrans;
#define PA ${A.toFixed(4)}
#define PB ${B.toFixed(4)}
vec3 creaseField(vec2 p, float aa) {
  vec2 g = vec2(0.0); float line = 0.0;
  ivec2 cell = clamp(ivec2(floor((p + vec2(PA, PB)) / vec2(2.0 * PA / ${GX}.0, 2.0 * PB / ${GY}.0))), ivec2(0), ivec2(${GX - 1}, ${GY - 1}));
  vec4 hd = texelFetch(uCHead, cell, 0);
  int off = int(hd.x + 0.5), cnt = int(hd.y + 0.5);
  for (int j = 0; j < 160; j++) {
    if (j >= cnt) break;
    int li = off + j;
    int i = int(texelFetch(uCList, ivec2(li % ${2048}, li / ${2048}), 0).x + 0.5);
    vec4 q = texelFetch(uCrease, ivec2(2 * i + 1, 0), 0);
    if (q.y > uTime) break;
    vec4 s = texelFetch(uCrease, ivec2(2 * i, 0), 0);
    float f = clamp((uTime - q.y) / q.z, 0.0, 1.0);
    vec2 ab = s.zw - s.xy;
    float l2 = max(dot(ab, ab), 1e-9);
    float t = clamp(dot(p - s.xy, ab) / l2, 0.0, 1.0);
    vec2 dv = p - (s.xy + ab * t);
    float d = length(dv);
    if (d > ${CRR}) continue;
    vec2 dir = d > 1e-6 ? dv / d : vec2(0.0);
    float k = q.x * f;
    float e1 = exp(-d / 0.022), e2 = exp(-d / max(0.0035, aa));
    g -= dir * k * (0.036 * e1 + 0.44 * e2);
    float w = max(0.0022, aa * 0.8);
    line += k * exp(-(d * d) / (w * w));
  }
  return vec3(g, line);
}`)
        .replace('#include <map_fragment>', `
vec2 uvF = vec2((PB - vPaper.y) / (2.0 * PB), (vPaper.x + PA) / (2.0 * PA));
vec2 uvB = vec2((PA - vPaper.x) / (2.0 * PA), (vPaper.y + PB) / (2.0 * PB));
vec4 tF = texture2D(uFront, uvF);
vec4 tB = texture2D(uBack, uvB);
tB.rgb = mix(uPaperC, tB.rgb, uInk); // the sealed inner faces only show their print when they can be seen
vec3 tThis = gl_FrontFacing ? tF.rgb : tB.rgb;
vec3 tOther = gl_FrontFacing ? tB.rgb : tF.rgb;
float aaw = length(fwidth(vPaper));
vec3 cf = creaseField(vPaper, aaw);
float lineV = clamp(-cf.z, 0.0, 1.5), lineM = clamp(cf.z, 0.0, 1.5);
diffuseColor.rgb *= tThis;
diffuseColor.rgb *= 1.0 - 0.10 * lineV;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.07 * lineM);
gTrans = uTrans * tThis;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 nF = normal * faceDirection;
  nF = normalize(nF - cf.x * normalize(vTanV) - cf.y * normalize(vBitV));
  normal = nF * faceDirection;
}`)
        .replace(LAMB ? '#include <lights_lambert_pars_fragment>' : '#include <lights_physical_pars_fragment>', `${LAMB ? '#include <lights_lambert_pars_fragment>' : '#include <lights_physical_pars_fragment>'}
void RE_Direct_Paper(const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ${LAMB ? 'LambertMaterial' : 'PhysicalMaterial'} material, inout ReflectedLight reflectedLight) {
  ${LAMB ? 'RE_Direct_Lambert' : 'RE_Direct_Physical'}(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
  float back = saturate(-dot(geometryNormal, directLight.direction));
  reflectedLight.directDiffuse += directLight.color * back * gTrans * 0.6;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Paper`);
    };
    mat.customProgramCacheKey = () => 'origami-paper-v2-' + CFG.paper;

    const geo = new THREE.BufferGeometry();
    const attr = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    geo.setAttribute('position', attr(GEO.pos, 3));
    geo.setAttribute('normal', attr(GEO.nor, 3));
    geo.setAttribute('aTan', attr(GEO.tan, 3));
    geo.setAttribute('aBit', attr(GEO.bit, 3));
    geo.setAttribute('aPaper', new THREE.BufferAttribute(GEO.paper, 2));
    const sheet = new THREE.Mesh(geo, mat);
    sheet.castShadow = true;
    sheet.receiveShadow = true;
    sheet.frustumCulled = false;
    scene.add(sheet);

    // desk
    const dtex = new THREE.CanvasTexture(deskCanvas());
    dtex.colorSpace = THREE.SRGBColorSpace;
    dtex.wrapS = dtex.wrapT = THREE.RepeatWrapping;
    dtex.repeat.set(9, 9);
    dtex.anisotropy = aniso;
    const deskMat = CFG.desk === 'std'
      ? new THREE.MeshStandardMaterial({ map: dtex, roughness: 0.86, metalness: 0.0, color: 0xffffff, envMapIntensity: 0.25 })
      : new THREE.MeshLambertMaterial({ map: dtex, color: 0xffffff });
    const deskUni = { uFocus: { value: 4 }, uDof: { value: 0 } };
    if (CFG.deskDof) {
      deskMat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, deskUni);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uFocus; uniform float uDof;')
          .replace('#include <map_fragment>', `
#ifdef USE_MAP
  float lensBias = clamp(uDof * abs(-vViewPosition.z - uFocus) / max(uFocus, 0.5), 0.0, 5.5);
  vec4 sampledDiffuseColor = texture2D(map, vMapUv, lensBias);
  diffuseColor *= sampledDiffuseColor;
#endif`);
      };
      deskMat.customProgramCacheKey = () => 'origami-desk-v1';
    }
    const desk = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), deskMat);
    desk.position.set(0, 0, -0.0016);
    desk.receiveShadow = true;
    scene.add(desk);

    // light
    const key = new THREE.SpotLight(new THREE.Color(PAL.opKey), 3.4, 0, 0.62, 0.9, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(CFG.shadow, CFG.shadow);
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.004;
    key.shadow.radius = 5;
    key.shadow.camera.near = 2;
    key.shadow.camera.far = 40;
    scene.add(key);
    scene.add(key.target);
    const rim = new THREE.DirectionalLight(new THREE.Color(PAL.opRim), 0.75);
    scene.add(rim);
    scene.add(rim.target);
    const accent = new THREE.DirectionalLight(new THREE.Color(PAL.opAccent), 0.3);
    scene.add(accent);
    scene.add(accent.target);
    const hemi = new THREE.HemisphereLight(new THREE.Color(PAL.opSky), new THREE.Color(PAL.opGround), 0.42);
    scene.add(hemi);
    const pmrem = new THREE.PMREMGenerator(renderer);
    if (CFG.env) {
      scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.12;
    }

    // post
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: CFG.msaa });
    const composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(w, h);
    composer.addPass(new THREE.RenderPass(scene, cam));
    const bokeh = new THREE.BokehPass(scene, cam, { focus: 4.0, aperture: 0.0005, maxblur: 0.006 });
    if (CFG.bokeh) composer.addPass(bokeh);
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(Math.round(w / 2), Math.round(h / 2)), 0.38, 0.45, 1.25);
    if (CFG.bloom) composer.addPass(bloom);
    const grade = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uRes: { value: new THREE.Vector2(w, h) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform vec2 uRes; varying vec2 vUv;
float h21(vec2 p){ uvec2 q = uvec2(ivec2(p)) * uvec2(1597334673u, 3812015801u); uint n = (q.x ^ q.y) * 1597334673u; n ^= n >> 16; n *= 2246822519u; n ^= n >> 13; return float(n) * (1.0 / 4294967296.0); }
void main(){
  vec4 c = texture2D(tDiffuse, vUv);
  vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
  float v = 1.0 - uVig * smoothstep(0.35, 1.05, length(q));
  c.rgb *= v;
  float n = h21(floor(vUv * uRes) + vec2(floor(uTime * 30.0 + 0.5) * 1931.0, floor(uTime * 30.0 + 0.5) * 727.0)) - 0.5;
  c.rgb += n * 0.012;
  gl_FragColor = c;
}`,
    });
    composer.addPass(grade);
    composer.addPass(new THREE.OutputPass());
    if (CFG.fxaa) {
      const fx = new THREE.ShaderPass(THREE.FXAAShader);
      fx.uniforms.resolution.value.set(1 / w, 1 / h);
      composer.addPass(fx);
    }
    R3 = { THREE, canvas, renderer, scene, cam, sheet, geo, mat, uni, key, rim, accent, hemi, composer, bloom, bokeh, grade, deskUni, w, h };
  }

  // ---------------------------------------------------------------- camera + light tracks (beats)
  // az: degrees around the target (0 = +X side looking -X; 180 = -X side looking +X; 270 = -Y side)
  const LX = 4.85, LY = -0.62; // landing spot; the opened card centres at (LX, LY - A/2)
  const CY = LY - A / 2;
  const CAM = [
    { b: 0, az: 182, el: 57, d: 5.3, t: [0.12, 0.02, 0], fov: 31 },
    { b: 2.9, az: 184, el: 50, d: 5.4, t: [0.0, 0.0, 0.25], fov: 31 },
    { b: 4.0, az: 192, el: 10, d: 7.0, t: [-A, 0, 1.42], fov: 31 },
    { b: 4.9, az: 214, el: 14, d: 6.0, t: [-A, 0, 0.85], fov: 31 },
    { b: 5.8, az: 218, el: 38, d: 4.5, t: [-0.7, 0, 0.0], fov: 31 },
    { b: 6.6, az: 232, el: 38, d: 3.8, t: [0.0, 0.0, 0.0], fov: 31 },
    { b: 8.6, az: 262, el: 13, d: 2.55, t: [0.0, -0.55, 0.22], fov: 31 },
    { b: 9.4, az: 268, el: 9, d: 2.35, t: [0.0, -0.6, 0.27], fov: 31 },
    { b: 11.6, az: 270, el: 9, d: 2.3, t: [0.0, -0.6, 0.27], fov: 31 },
    { b: 13.0, az: 254, el: 50, d: 3.6, t: [0.0, 0.0, 0.0], fov: 31 },
    { b: 15.9, az: 250, el: 54, d: 3.5, t: [0.25, 0.0, 0.0], fov: 31 },
    { b: 16.5, az: 268, el: 8, d: 5.4, t: [0.05, 0, 1.05], fov: 31 },
    { b: 17.0, az: 268, el: 9, d: 5.4, t: [0.05, 0, 1.2], fov: 31 },
    { b: 17.9, az: 246, el: 26, d: 3.9, t: [0.0, 0.0, 0.25], fov: 31 },
    { b: 19.6, az: 242, el: 22, d: 4.0, t: [0.25, 0.0, 0.3], fov: 31 },
    { b: 21.0, az: 262, el: 9, d: 7.0, t: [2.3, -0.4, 1.7], fov: 32 },
    { b: 25.0, az: 270, el: 11, d: 6.8, t: [3.0, -0.5, 1.2], fov: 32 },
    { b: 27.0, az: 258, el: 24, d: 4.6, t: [LX, LY, 0.3], fov: 31 },
    { b: 29.0, az: 216, el: 46, d: 4.2, t: [LX, LY - 0.25, 0.05], fov: 31 },
    { b: 30.4, az: 183, el: 67, d: 3.95, t: [LX - 0.05, CY, 0.0], fov: 31 },
    { b: 36, az: 181, el: 68, d: 3.88, t: [LX - 0.04, CY, 0.0], fov: 31 },
  ];
  function hermite(keys, b, field) {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].b <= b) i++;
    const k1 = keys[i], k2 = keys[Math.min(i + 1, keys.length - 1)];
    if (b <= keys[0].b) return keys[0][field];
    if (b >= keys[keys.length - 1].b) return keys[keys.length - 1][field];
    const u = eio((b - k1.b) / (k2.b - k1.b));
    const a = k1[field], c = k2[field];
    if (Array.isArray(a)) return a.map((v, j) => lerp(v, c[j], u));
    return lerp(a, c, u);
  }
  function cameraAt(T) {
    const b = T / BEAT;
    let az = hermite(CAM, b, 'az'), el = hermite(CAM, b, 'el'), d = hermite(CAM, b, 'd');
    const t = hermite(CAM, b, 't'), fov = hermite(CAM, b, 'fov');
    // a slow breathing orbit (period = 1 bar in the loop bar so it closes)
    if (b >= TM.loop) {
      const ph = TAU * (b - TM.loop) / 4;
      az += 1.2 * Math.sin(ph);
      el += 0.5 * Math.sin(ph);
    } else {
      az += 1.6 * Math.sin(b * 0.37);
    }
    // in flight the camera half-follows the plane (smooth: the plane path is itself smooth)
    const fw = Math.min(sstep(TM.flight[0] + 0.6, TM.flight[0] + 1.6, b), 1 - sstep(TM.flight[1] - 1.6, TM.flight[1] - 0.2, b));
    if (fw > 0) {
      const pp = flightG(T).t;
      for (let i = 0; i < 3; i++) t[i] = lerp(t[i], pp[i] + (i === 2 ? 0.15 : 0), 0.55 * fw);
    }
    const ar = az * DEG, er = el * DEG;
    const pos = [t[0] + d * Math.cos(er) * Math.cos(ar), t[1] + d * Math.cos(er) * Math.sin(ar), t[2] + d * Math.sin(er)];
    // aperture: macro softness in the close shots, none on the readable card
    const ap = 0.00055 * (1 - sstep(TM.open[0], TM.open[1] + 0.5, b)) + 0.00025 * sstep(TM.flight[0], TM.flight[0] + 1, b) * (1 - sstep(TM.flight[1] - 1, TM.flight[1], b));
    return { pos, t, fov, ap };
  }
  // key light: azimuth/elevation around the action, keyed
  // key: azimuth/elevation around the action, intensity, fill (hemisphere) level
  const KEY = [
    { b: 0, az: 150, el: 33, i: 1.0, f: 1.0 },
    { b: 4, az: 150, el: 30, i: 1.0, f: 1.0 },
    { b: 6.6, az: 190, el: 30, i: 0.9, f: 1.0 },
    { b: 8.6, az: 200, el: 26, i: 0.7, f: 0.9 },
    { b: 11.8, az: 206, el: 28, i: 0.7, f: 0.9 },
    { b: 13.2, az: 210, el: 34, i: 0.9, f: 1.0 },
    { b: 16.5, az: 218, el: 32, i: 0.9, f: 1.0 },
    { b: 20, az: 208, el: 44, i: 1.0, f: 1.0 },
    { b: 27, az: 206, el: 42, i: 1.0, f: 1.0 },
    { b: 29.6, az: 176, el: 10, i: 1.2, f: 0.35 },
    { b: 32.0, az: 168, el: 8, i: 1.3, f: 0.3 },
    { b: 34.5, az: 120, el: 9, i: 1.4, f: 0.34 },
    { b: 36, az: 116, el: 9.5, i: 1.4, f: 0.34 },
  ];
  function lightAt(T) {
    const b = T / BEAT;
    let az = hermite(KEY, b, 'az'), el = hermite(KEY, b, 'el');
    const i = hermite(KEY, b, 'i');
    const f = hermite(KEY, b, 'f');
    if (b >= TM.loop) {
      const ph = TAU * (b - TM.loop) / 4;
      az += 7 * Math.sin(ph);
      el += 1.2 * (1 - Math.cos(ph));
    }
    return { az, el, i, f };
  }
  OR.cameraAt = cameraAt;

  // ---------------------------------------------------------------- render
  OR.render = function render(ctx, T, opts = {}) {
    const W = ctx.canvas.width, H = ctx.canvas.height;
    if (!R3 || R3.w !== W || R3.h !== H) initThree(W, H);
    const THREE = R3.THREE;
    T = clamp(T, 0, OR.DURATION);
    updateGeometry(T);
    const g = R3.geo;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.aTan.needsUpdate = true;
    g.attributes.aBit.needsUpdate = true;
    // creases born so far
    let n = 0;
    while (n < CREASES.length && n < MAXC && CREASES[n].born <= T) n++;
    R3.uni.uCreaseN.value = n;
    R3.uni.uTime.value = T;
    // the reverse side is visible only while the page folds back (a glimpse) and once the card opens
    const bI = T / BEAT;
    R3.uni.uInk.value = (bI >= TM.F0[0] && bI < TM.F0[1] + 0.25) || bI >= TM.open[0] ? 1 : 0;
    // camera
    const c = cameraAt(T);
    R3.cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    R3.cam.fov = c.fov;
    R3.cam.aspect = W / H;
    R3.cam.updateProjectionMatrix();
    R3.cam.lookAt(c.t[0], c.t[1], c.t[2]);
    // lights follow the action softly
    const l = lightAt(T);
    const ar = l.az * DEG, er = l.el * DEG;
    const kd = 13;
    const kt = [c.t[0] * 0.6, c.t[1] * 0.6, c.t[2] * 0.5];
    R3.key.position.set(kt[0] + kd * Math.cos(er) * Math.cos(ar), kt[1] + kd * Math.cos(er) * Math.sin(ar), kt[2] + kd * Math.sin(er));
    R3.key.target.position.set(kt[0], kt[1], kt[2]);
    R3.key.intensity = 5.2 * l.i;
    R3.hemi.intensity = 0.42 * l.f;
    R3.key.target.updateMatrixWorld();
    const caz = Math.atan2(c.pos[1] - c.t[1], c.pos[0] - c.t[0]);
    R3.rim.position.set(kt[0] - 6 * Math.cos(caz - 0.5), kt[1] - 6 * Math.sin(caz - 0.5), kt[2] + 1.8);
    R3.rim.target.position.set(kt[0], kt[1], kt[2]);
    R3.rim.target.updateMatrixWorld();
    R3.accent.position.set(kt[0] + 6 * Math.cos(caz + 1.2), kt[1] + 6 * Math.sin(caz + 1.2), kt[2] + 0.9);
    R3.accent.target.position.set(kt[0], kt[1], kt[2]);
    R3.accent.target.updateMatrixWorld();
    R3.accent.intensity = 0.3 + 0.55 * sstep(TM.open[0] - 0.4, TM.open[1], bI);
    R3.rim.intensity = 0.75 * (1 - 0.7 * sstep(TM.open[0], TM.open[1] + 1, bI));
    // grain seed: in the loop bar it repeats with the bar, so the last frame flows into the first loop frame
    const fi = Math.round(T * FILM.FPS), f0 = Math.round(bt(TM.loop) * FILM.FPS), fBar = Math.round(bt(4) * FILM.FPS);
    R3.grade.uniforms.uTime.value = (fi >= f0 ? f0 + ((fi - f0) % fBar) : fi) / FILM.FPS;
    // deterministic auto-exposure: area-weighted key light on the paper faces the camera sees
    {
      const kp = R3.key.position, cp = R3.cam.position;
      let num = 0, den = 0;
      for (let pi = 0; pi < GEO.ranges.length; pi++) {
        const v = GEO.ranges[pi][0];
        const nx = GEO.nor[v * 3], ny = GEO.nor[v * 3 + 1], nz = GEO.nor[v * 3 + 2];
        const px = GEO.pos[v * 3], py = GEO.pos[v * 3 + 1], pz = GEO.pos[v * 3 + 2];
        let lx = kp.x - px, ly = kp.y - py, lz = kp.z - pz;
        const ll = Math.hypot(lx, ly, lz) || 1;
        let vx = cp.x - px, vy = cp.y - py, vz = cp.z - pz;
        const vl = Math.hypot(vx, vy, vz) || 1;
        const nl = (nx * lx + ny * ly + nz * lz) / ll, nv = (nx * vx + ny * vy + nz * vz) / vl;
        const w = GEO.areas[pi] * Math.abs(nv);
        den += w;
        if (nl * nv > 0) num += w * Math.abs(nl);
      }
      const lit = den > 0 ? num / den : 0.5;
      const B = 5.2 * l.i * lit;
      R3.renderer.toneMappingExposure = 1.22 * Math.min(1, Math.pow(2.9 / Math.max(B, 1e-3), 0.75));
    }
    const fd = Math.hypot(c.pos[0] - c.t[0], c.pos[1] - c.t[1], c.pos[2] - c.t[2]);
    R3.bokeh.uniforms.focus.value = fd;
    R3.deskUni.uFocus.value = fd;
    R3.deskUni.uDof.value = c.ap * 9000;
    R3.bokeh.uniforms.aperture.value = c.ap;
    R3.bokeh.uniforms.maxblur.value = 0.007;
    R3.composer.render();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R3.canvas, 0, 0, W, H);
    ctx.restore();
  };

  // the keel midpoint in the world (the plane's centre), for the score's flight whoosh
  OR.keelAt = (T) => {
    build();
    const g = G(T, null);
    return tfApply(g, [-A / 2, 0, 0]);
  };
  // profiling hooks (used only by an out-of-tree harness)
  OR._dbg = { update: (T) => updateGeometry(T), r3: () => R3 };

  // debugging/info for the tools and the storyboard
  OR.info = () => {
    build();
    return { polys: POLYS.length, creases: CREASES.length, verts: GEO.nv, gear: { R: GEAR.R, r: GEAR.r, n: GEAR.n }, flightLen: FL.len };
  };
})();
