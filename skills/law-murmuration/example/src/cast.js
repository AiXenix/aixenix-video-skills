/*
 * cast.js : FILM.flock, the murmuration engine of «Мурмурация» (AiXenix ad 09).
 *
 * THE LAW: nothing is drawn. Every shape and every letter on screen is the silhouette of a living flock
 * of 30 000 starlings at sunset. Birds never stop being birds: each one flaps, glides, banks and is
 * steered by its own small decisions (boids: separation, alignment, a curl-noise wind, a pull toward
 * its own spot in the next figure). Only collectively do they make a gear, an arrow, a word.
 *
 * How it works
 *   1. Targets. Each figure is a set of target points sampled from a raster: glyphs of a system font
 *      (Futura Bold), gears, an arrow, a paper plane. Floyd-Steinberg dithering of a weight map gives
 *      an even, blue-noise spread; a chamfer distance transform makes the stroke spines denser.
 *   2. Assignment. When the flock is called to a new figure, every bird keeps its identity and is matched
 *      to a target by a Knothe-Rosenblatt (strip-sorted) map plus local swap refinement, so neighbours
 *      stay neighbours and paths do not cross. Departures are staggered (a sweep across the flock).
 *   3. Simulation. A deterministic fixed-step simulation (dt = 1/30 s) from T = -2 s:
 *      steering to the moving target (PD), density-gradient separation, velocity alignment on a grid,
 *      a curl-noise wind and a per-bird wander. Run once at load; positions are stored per frame
 *      (1/16 px fixed point). The last bar is made exactly periodic (drift-corrected) for the loop.
 *   4. Render. three.js instanced birds (swept wings, tail, motion stretch) with a wing-flap phase,
 *      glide spells, banking density waves (the dark band that travels through a real murmuration),
 *      size and haze by depth; over a painted sunset sky and in front of nothing but the city.
 *
 * Every frame is a pure function of T: the simulation is precomputed deterministically, the per-frame
 * extras (flap, waves, glide, heading) are closed-form in T and periodic with the bar in the loop.
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const FILM = root.FILM;
  const FL = (FILM.flock = FILM.flock || {});

  const W = 1920;
  const H = 1080;
  const FPS = 30;
  const BPM = 90;
  const BEAT = 60 / BPM;
  const BAR = 4 * BEAT;
  const TAU = Math.PI * 2;
  FL.W = W; FL.H = H; FL.BEAT = BEAT; FL.BAR = BAR; FL.FPS = FPS;

  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const easeIO = (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t)); // inOutSine
  FL.util = { clamp, lerp, sstep, easeIO };

  // ---------------------------------------------------------------------------------------------
  // deterministic helpers
  // ---------------------------------------------------------------------------------------------
  function h32(a, b, c) {
    let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul((c | 0) + 0x165667b1, 0x27d4eb2f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
    h = Math.imul(h, 0x297a2d39);
    h ^= h >>> 15;
    return h >>> 0;
  }
  const hf = (a, b, c) => h32(a, b, c) / 4294967296;
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  FL.hf = hf;

  // seeded improved Perlin noise, 3D
  function makePerlin(seed) {
    const r = rng(seed);
    const q = new Uint8Array(256);
    for (let i = 0; i < 256; i++) q[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = q[i]; q[i] = q[j]; q[j] = t;
    }
    const p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) p[i] = q[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y, z) => {
      const u = h < 8 ? x : y;
      const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
      return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    };
    return function (x, y, z) {
      let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z;
      X &= 255; Y &= 255; Z &= 255;
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
      const B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA] & 15, x, y, z), grad(p[BA] & 15, x - 1, y, z), u), lerp(grad(p[AB] & 15, x, y - 1, z), grad(p[BB] & 15, x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1] & 15, x, y, z - 1), grad(p[BA + 1] & 15, x - 1, y, z - 1), u), lerp(grad(p[AB + 1] & 15, x, y - 1, z - 1), grad(p[BB + 1] & 15, x - 1, y - 1, z - 1), u), v),
        w
      );
    };
  }
  FL.makePerlin = makePerlin;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  // ---------------------------------------------------------------------------------------------
  // 1. target sampling: raster -> weight map -> Floyd-Steinberg points
  // ---------------------------------------------------------------------------------------------
  // chamfer (3-4) distance to the outside of the ink, in px
  function distanceMap(cov, w, h) {
    const D = new Float32Array(w * h);
    const BIG = 1e6;
    for (let i = 0; i < w * h; i++) D[i] = cov[i] >= 0.5 ? BIG : 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (D[i] === 0) continue;
        let d = D[i];
        if (x > 0) d = Math.min(d, D[i - 1] + 3);
        if (y > 0) {
          d = Math.min(d, D[i - w] + 3);
          if (x > 0) d = Math.min(d, D[i - w - 1] + 4);
          if (x < w - 1) d = Math.min(d, D[i - w + 1] + 4);
        }
        D[i] = d;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        if (D[i] === 0) continue;
        let d = D[i];
        if (x < w - 1) d = Math.min(d, D[i + 1] + 3);
        if (y < h - 1) {
          d = Math.min(d, D[i + w] + 3);
          if (x < w - 1) d = Math.min(d, D[i + w + 1] + 4);
          if (x > 0) d = Math.min(d, D[i + w - 1] + 4);
        }
        D[i] = d;
      }
    }
    for (let i = 0; i < w * h; i++) D[i] = D[i] / 3;
    return D;
  }

  /**
   * classes: [{ paint(g), density = 1, size = 1, group = 0, z = 0, spine = 0 (0..1 stroke-centre boost) }]
   * Rasterises each class on a w x h canvas (white ink), and returns exactly n points spread over all
   * classes in proportion to ink mass x density: { n, x, y, size, group, z, edge }.
   */
  function sampleClasses(w, h, classes, n, seed) {
    const maps = classes.map((cl) => {
      const c = canvas(w, h);
      const g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#000';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      cl.paint(g);
      const d = g.getImageData(0, 0, w, h).data;
      const cov = new Float32Array(w * h);
      for (let i = 0; i < w * h; i++) cov[i] = d[i * 4] / 255;
      const wt = new Float32Array(w * h);
      let D = null;
      const spine = cl.spine || 0;
      if (spine > 0 || cl.edgeSize) D = distanceMap(cov, w, h);
      let mass = 0;
      const mot = cl.mottle ? makePerlin(h32(seed, 31, 7)) : null;
      for (let i = 0; i < w * h; i++) {
        let v = cov[i];
        if (v > 0 && spine > 0) v *= 1 - spine + spine * Math.min(1, D[i] / (cl.spineSpan || 5));
        if (v > 0 && mot) v *= Math.max(0.15, 1 + cl.mottle * 1.6 * mot((i % w) / 64, Math.floor(i / w) / 64, 0.5));
        wt[i] = v;
        mass += v;
      }
      return { wt, mass, D };
    });
    let tot = 0;
    for (let k = 0; k < classes.length; k++) tot += maps[k].mass * (classes[k].density || 1);
    const counts = classes.map((cl, k) => Math.floor((n * maps[k].mass * (cl.density || 1)) / tot));
    let assigned = counts.reduce((a, b) => a + b, 0);
    for (let k = 0; assigned < n; k = (k + 1) % classes.length) {
      counts[k]++;
      assigned++;
    }
    const X = new Float32Array(n), Y = new Float32Array(n), S = new Float32Array(n), G = new Uint8Array(n), Z = new Float32Array(n), E = new Float32Array(n);
    let o = 0;
    classes.forEach((cl, k) => {
      const { wt, mass, D } = maps[k];
      const want = counts[k];
      const r = rng(h32(seed, k, 77));
      const rho = mass > 0 ? want / mass : 0;
      const px = [], py = [];
      let cur = new Float32Array(w + 2), nxt = new Float32Array(w + 2);
      for (let y = 0; y < h; y++) {
        const ltr = (y & 1) === 0;
        for (let kx = 0; kx < w; kx++) {
          const x = ltr ? kx : w - 1 - kx;
          const i = y * w + x;
          const wv = wt[i];
          let v = wv * rho + cur[x + 1];
          let e;
          if (wv > 0.03) {
            if (v >= 0.5) {
              px.push(x + 0.5 + (r() - 0.5) * 0.9);
              py.push(y + 0.5 + (r() - 0.5) * 0.9);
              v -= 1;
            }
            e = v;
          } else {
            e = v * 0.5;
          }
          if (e === 0) continue;
          if (ltr) {
            cur[x + 2] += e * 0.4375; nxt[x] += e * 0.1875; nxt[x + 1] += e * 0.3125; nxt[x + 2] += e * 0.0625;
          } else {
            cur[x] += e * 0.4375; nxt[x + 2] += e * 0.1875; nxt[x + 1] += e * 0.3125; nxt[x] += e * 0.0625;
          }
        }
        const t = cur; cur = nxt; nxt = t; nxt.fill(0);
      }
      // exact count: drop or duplicate (seeded)
      let idx = [];
      for (let i = 0; i < px.length; i++) idx.push(i);
      if (idx.length > want) {
        for (let i = idx.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
        }
        idx = idx.slice(0, want);
        idx.sort((a, b) => a - b);
      }
      const base = idx.length;
      for (let m = 0; m < want; m++) {
        let xx, yy;
        if (m < base) {
          xx = px[idx[m]]; yy = py[idx[m]];
        } else {
          const j = base ? idx[Math.floor(r() * base)] : 0;
          xx = (px[j] || w / 2) + (r() - 0.5) * 2.2;
          yy = (py[j] || h / 2) + (r() - 0.5) * 2.2;
        }
        X[o] = xx; Y[o] = yy;
        let sz = cl.size || 1;
        let edge = 1;
        if (D) {
          const ii = clamp(Math.floor(yy), 0, h - 1) * w + clamp(Math.floor(xx), 0, w - 1);
          edge = Math.min(1, D[ii] / (cl.spineSpan || 5));
          if (cl.edgeSize) sz *= 1 - cl.edgeSize + cl.edgeSize * edge;
        }
        S[o] = sz;
        E[o] = edge;
        G[o] = cl.group || 0;
        Z[o] = (cl.z || 0) + (r() - 0.5) * (cl.zSpread != null ? cl.zSpread : 0.25);
        o++;
      }
    });
    return { n, x: X, y: Y, size: S, group: G, z: Z, edge: E };
  }
  FL.sampleClasses = sampleClasses;

  // ---------------------------------------------------------------------------------------------
  // shape painters (white ink on the sampling raster)
  // ---------------------------------------------------------------------------------------------
  const FONT = 'Futura, "Futura PT", "Avenir Next", "Helvetica Neue", Arial, sans-serif';
  FL.FONT = FONT;
  function textPainter(str, x, y, size, o) {
    o = o || {};
    return function (g) {
      g.font = `${o.weight || 700} ${size}px ${FONT}`;
      g.textAlign = o.align || 'center';
      g.textBaseline = 'alphabetic';
      if ('letterSpacing' in g) g.letterSpacing = `${o.spacing || 0}px`;
      // letterSpacing adds one trailing gap; shift by half of it to stay centred
      const dx = (o.align || 'center') === 'center' ? (o.spacing || 0) / 2 : 0;
      g.fillText(str, x + dx, y);
    };
  }
  FL.textPainter = textPainter;
  function measure(str, size, o) {
    const c = canvas(8, 8).getContext('2d');
    c.font = `${(o && o.weight) || 700} ${size}px ${FONT}`;
    if ('letterSpacing' in c) c.letterSpacing = `${(o && o.spacing) || 0}px`;
    return c.measureText(str).width;
  }
  FL.measure = measure;

  // a spur gear with trapezoid teeth, tooth centred on angle 0, plus hub and lightening holes
  function gearPath(g, cx, cy, Rp, teeth, add, ded, hub, holes, holeR, holeAt) {
    g.beginPath();
    const M = teeth * 36;
    for (let k = 0; k <= M; k++) {
      const a = (k / M) * TAU;
      let q = ((a * teeth) / TAU) % 1;
      if (q > 0.5) q -= 1;
      const aq = Math.abs(q);
      const f = aq < 0.15 ? 1 : aq < 0.3 ? 1 - (aq - 0.15) / 0.15 : 0;
      const r = Rp - ded + (add + ded) * f;
      const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.moveTo(cx + hub, cy);
    g.arc(cx, cy, hub, 0, TAU, true);
    for (let m = 0; m < holes; m++) {
      const a = (m / holes) * TAU + Math.PI / holes;
      const hx = cx + holeAt * Math.cos(a), hy = cy + holeAt * Math.sin(a);
      g.moveTo(hx + holeR, hy);
      g.arc(hx, hy, holeR, 0, TAU, true);
    }
    g.fill('evenodd');
  }
  FL.gearPath = gearPath;

  // the paper plane, nose to +x, centred near (0,0); 1 = top wing (light), 2 = keel (dark)
  const PLANE = {
    nose: [330, -40],
    wingTip: [-300, -205],
    fold: [-185, 14],
    keel: [-262, 118],
  };
  FL.PLANE = PLANE;
  function planeFace(face, cx, cy, s, rot, gap) {
    const pts = face === 1 ? [PLANE.nose, PLANE.wingTip, PLANE.fold] : [PLANE.nose, PLANE.fold, PLANE.keel];
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    return function (g) {
      g.beginPath();
      pts.forEach((p, i) => {
        const x = cx + s * (p[0] * c - p[1] * sn), y = cy + s * (p[0] * sn + p[1] * c);
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      });
      g.closePath();
      g.fill();
      if (gap) {
        // the fold: a thin lighter gap between wing and keel
        const a = [cx + s * (PLANE.nose[0] * c - PLANE.nose[1] * sn), cy + s * (PLANE.nose[0] * sn + PLANE.nose[1] * c)];
        const b = [cx + s * (PLANE.fold[0] * c - PLANE.fold[1] * sn), cy + s * (PLANE.fold[0] * sn + PLANE.fold[1] * c)];
        g.save();
        g.strokeStyle = '#000';
        g.lineWidth = gap;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.restore();
      }
    };
  }
  FL.planeFace = planeFace;
  function planeOutline(cx, cy, s, rot, wdt) {
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const tf = (p) => [cx + s * (p[0] * c - p[1] * sn), cy + s * (p[0] * sn + p[1] * c)];
    return function (g) {
      const q = [PLANE.nose, PLANE.wingTip, PLANE.fold, PLANE.keel].map(tf);
      g.lineWidth = wdt;
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[3][0], q[3][1]); g.closePath(); g.stroke();
    };
  }
  FL.planeOutline = planeOutline;
  // the crease (nose -> fold) and the wing's outer edges as thin strokes
  function planeCrease(cx, cy, s, rot, wdt) {
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const tf = (p) => [cx + s * (p[0] * c - p[1] * sn), cy + s * (p[0] * sn + p[1] * c)];
    return function (g) {
      const a = tf(PLANE.nose), b = tf(PLANE.fold);
      g.lineWidth = wdt;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    };
  }
  function planeEdge(cx, cy, s, rot, wdt) {
    const c = Math.cos(rot || 0), sn = Math.sin(rot || 0);
    const tf = (p) => [cx + s * (p[0] * c - p[1] * sn), cy + s * (p[0] * sn + p[1] * c)];
    return function (g) {
      const n = tf(PLANE.nose), w = tf(PLANE.wingTip), f = tf(PLANE.fold);
      g.lineWidth = wdt;
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(f[0], f[1]); g.lineTo(w[0], w[1]); g.lineTo(n[0], n[1]); g.stroke();
    };
  }
  FL.planeCrease = planeCrease;
  FL.planeEdge = planeEdge;

  // ---------------------------------------------------------------------------------------------
  // 2. assignment: strip-sorted (Knothe-Rosenblatt) matching + local swap refinement
  // ---------------------------------------------------------------------------------------------
  function sortIdx(arr, idx) {
    return idx.sort((a, b) => arr[a] - arr[b] || a - b);
  }
  function krMatch(px, py, qx, qy, n, strips, byY) {
    const A = byY ? py : px, B = byY ? qy : qx; // primary axis
    const A2 = byY ? px : py, B2 = byY ? qx : qy; // secondary
    const ia = sortIdx(A, Array.from({ length: n }, (_, i) => i));
    const ib = sortIdx(B, Array.from({ length: n }, (_, i) => i));
    const res = new Int32Array(n);
    const per = Math.ceil(n / strips);
    const order = [];
    for (let s = 0; s * per < n; s++) {
      const a0 = s * per, a1 = Math.min(n, a0 + per);
      const sa = sortIdx(A2, ia.slice(a0, a1));
      const sb = sortIdx(B2, ib.slice(a0, a1));
      for (let k = 0; k < sa.length; k++) {
        res[sa[k]] = sb[k];
        order.push(sa[k]);
      }
    }
    // swap refinement along the strip order and across neighbouring strips
    const cost = (a, b) => {
      const dx = px[a] - qx[b], dy = py[a] - qy[b];
      return dx * dx + dy * dy;
    };
    const tryPairs = (ord, span) => {
      for (let i = 0; i < ord.length; i++) {
        const a = ord[i];
        for (let d = 1; d <= span && i + d < ord.length; d++) {
          const b = ord[i + d];
          const ra = res[a], rb = res[b];
          if (cost(a, rb) + cost(b, ra) < cost(a, ra) + cost(b, rb)) {
            res[a] = rb;
            res[b] = ra;
          }
        }
      }
    };
    for (let pass = 0; pass < 3; pass++) {
      tryPairs(order, 6);
      // a cross ordering: sort birds by the secondary axis within coarse primary bands
      const band = sortIdx(A2, Array.from({ length: n }, (_, i) => i));
      tryPairs(band, 4);
    }
    return res;
  }
  FL.krMatch = krMatch;

  // ---------------------------------------------------------------------------------------------
  // the film: formations, simulation, storage
  // ---------------------------------------------------------------------------------------------
  /*
   * script = {
   *   key, N, duration, loopStart (or null), freeFrac,
   *   formations: [ { id, t0, kind: 'swirl' | 'pts', build() -> sampleClasses result (pts),
   *                   groups: [{ cx, cy }], xf(t, g, out) -> out.{x, y, c, s, sc, sy} (pts),
   *                   halo: [[x, y, r], ...], stagger(qx, qy, px, py, i) -> seconds, dur: [a, perPx, lo, hi],
   *                   bulge, size, orbit, gains: { kp, kv, noise } } ],
   *   waves: [ { t, x, y, ang, speed, width, life, amp } ], heading(T) -> angle
   * }
   */
  const films = {};
  FL.film = function film(script) {
    if (!films[script.key]) films[script.key] = buildFilm(script);
    return films[script.key];
  };

  function buildFilm(S) {
    const N = S.N;
    const DUR = S.duration;
    const NFR = Math.round(DUR * FPS) + 1; // frames 0..last, plus one past the end (loop seam)
    const SUB = 1;
    const dt = 1 / FPS / SUB;
    const PRE = 2; // seconds of pre-roll
    const perlin = makePerlin(9091);
    const perlin2 = makePerlin(4417);

    // per-bird constants
    const isFree = new Uint8Array(N);
    const freeOrd = new Int32Array(N).fill(-1);
    let nFree = 0;
    for (let i = 0; i < N; i++) {
      if (hf(i, 11, 3) < (S.freeFrac != null ? S.freeFrac : 0.06)) {
        isFree[i] = 1;
        freeOrd[i] = nFree++;
      }
    }
    const NM = N - nFree;
    const mainIdx = new Int32Array(NM);
    for (let i = 0, k = 0; i < N; i++) if (!isFree[i]) mainIdx[k++] = i;
    const B = {
      wPh: new Float32Array(N), wFx: new Float32Array(N), wFy: new Float32Array(N),
      oR: new Float32Array(N), oW: new Float32Array(N), oPh: new Float32Array(N), oK: new Uint8Array(N), oPc: new Float32Array(N), oPs: new Float32Array(N),
      wKx: new Uint8Array(N), wKy: new Uint8Array(N), wPcx: new Float32Array(N), wPsx: new Float32Array(N), wPcy: new Float32Array(N), wPsy: new Float32Array(N),
      flapC: new Float32Array(N), flapPh: new Float32Array(N), glideM: new Float32Array(N), glidePh: new Float32Array(N),
      bankS: new Float32Array(N), sizeJ: new Float32Array(N), headJ: new Float32Array(N),
      // swirl slot coordinates
      sTh: new Float32Array(N), sRho: new Float32Array(N), sPhi: new Float32Array(N),
      // free-bird mini-flock coordinates
      fRho: new Float32Array(N), fAng: new Float32Array(N), fZ: new Float32Array(N),
    };
    for (let i = 0; i < N; i++) {
      B.wPh[i] = hf(i, 1, 1) * TAU;
      B.wFx[i] = 0.6 + hf(i, 1, 2) * 1.2;
      B.wFy[i] = 0.6 + hf(i, 1, 3) * 1.2;
      B.oR[i] = 0.6 + hf(i, 2, 1) * 1.0;
      const ko = 1 + Math.floor(hf(i, 2, 2) * 3);
      const sg = hf(i, 2, 3) < 0.5 ? -1 : 1;
      B.oW[i] = (sg * TAU * ko) / BAR;
      B.oK[i] = (ko - 1) * 2 + (sg < 0 ? 1 : 0);
      B.oPh[i] = hf(i, 2, 4) * TAU;
      B.oPc[i] = Math.cos(B.oPh[i]); B.oPs[i] = Math.sin(B.oPh[i]);
      B.wKx[i] = Math.floor(hf(i, 1, 2) * 8); B.wKy[i] = Math.floor(hf(i, 1, 3) * 8);
      B.wPcx[i] = Math.cos(B.wPh[i]); B.wPsx[i] = Math.sin(B.wPh[i]);
      B.wPcy[i] = Math.cos(B.wPh[i] * 1.3); B.wPsy[i] = Math.sin(B.wPh[i] * 1.3);
      B.flapC[i] = 14 + Math.floor(hf(i, 3, 1) * 6); // whole cycles per bar: periodic in the loop
      B.flapPh[i] = hf(i, 3, 2) * TAU;
      B.glideM[i] = 1 + Math.floor(hf(i, 3, 3) * 2);
      B.glidePh[i] = hf(i, 3, 4) * TAU;
      B.bankS[i] = hf(i, 4, 1) < 0.5 ? -1 : 1;
      B.sizeJ[i] = 0.85 + hf(i, 4, 2) * 0.3;
      B.headJ[i] = (hf(i, 4, 3) - 0.5) * 0.7;
      B.sTh[i] = hf(i, 5, 1) * TAU;
      B.sRho[i] = Math.sqrt(hf(i, 5, 2));
      B.sPhi[i] = hf(i, 5, 3) * TAU;
      B.fRho[i] = Math.sqrt(hf(i, 6, 1));
      B.fAng[i] = hf(i, 6, 2) * TAU;
      B.fZ[i] = hf(i, 6, 3) - 0.5;
    }

    // grids
    const GX0 = -240, GY0 = -240, CS = 4;
    const GW = Math.ceil((W + 480) / CS), GH = Math.ceil((H + 480) / CS);
    const dens = new Float32Array(GW * GH);
    const VCS = 16;
    const VW = Math.ceil((W + 480) / VCS), VH = Math.ceil((H + 480) / VCS);
    const gvx = new Float32Array(VW * VH), gvy = new Float32Array(VW * VH), gvn = new Float32Array(VW * VH);
    const NCS = 40;
    const NW = Math.ceil((W + 480) / NCS) + 2, NH = Math.ceil((H + 480) / NCS) + 2;
    const psi = new Float32Array(NW * NH);
    const cu = new Float32Array(NW * NH), cv = new Float32Array(NW * NH);

    const CURL = { u: 0, v: 0 };
    function curlAt(x, y) {
      const nfx = (x - GX0) / NCS + 1, nfy = (y - GY0) / NCS + 1;
      const nix = Math.floor(nfx), niy = Math.floor(nfy);
      CURL.u = 0; CURL.v = 0;
      if (nix < 1 || niy < 1 || nix >= NW - 2 || niy >= NH - 2) return CURL;
      const ux = nfx - nix, uy = nfy - niy, o = niy * NW + nix;
      CURL.u = (cu[o] * (1 - ux) + cu[o + 1] * ux) * (1 - uy) + (cu[o + NW] * (1 - ux) + cu[o + NW + 1] * ux) * uy;
      CURL.v = (cv[o] * (1 - ux) + cv[o + 1] * ux) * (1 - uy) + (cv[o + NW] * (1 - ux) + cv[o + NW + 1] * ux) * uy;
      return CURL;
    }
    // formations: build their targets now (t-independent)
    const F = S.formations.map((f, k) => {
      const o = Object.assign({ k, bulge: 0.12, size: 1, orbit: 1, kind: 'pts' }, f);
      if (o.kind === 'pts') {
        o.P = o.build(NM);
        o.gx = new Float32Array(o.groups.length);
        o.gy = new Float32Array(o.groups.length);
        // local coordinates relative to each group's origin
        for (let j = 0; j < NM; j++) {
          const gr = o.groups[o.P.group[j]];
          o.P.x[j] -= gr.cx;
          o.P.y[j] -= gr.cy;
        }
      }
      o.slot = new Int32Array(N);
      o.dep = new Float32Array(N);
      o.dur = new Float32Array(N).fill(1);
      return o;
    });

    // per-time formation state (group transforms), evaluated once per step
    const XF = { x: 0, y: 0, c: 1, s: 0, sc: 1, sy: 1 };
    function groupXf(f, t) {
      const n = f.groups.length;
      if (!f.xfCache) f.xfCache = { t: NaN, x: new Float64Array(n), y: new Float64Array(n), c: new Float64Array(n), s: new Float64Array(n), sc: new Float64Array(n), sy: new Float64Array(n) };
      const C = f.xfCache;
      if (C.t === t) return C;
      for (let g = 0; g < n; g++) {
        XF.x = f.groups[g].cx; XF.y = f.groups[g].cy; XF.c = 1; XF.s = 0; XF.sc = 1; XF.sy = 1;
        if (f.xf) f.xf(t, g, XF);
        C.x[g] = XF.x; C.y[g] = XF.y; C.c[g] = XF.c; C.s[g] = XF.s; C.sc[g] = XF.sc; C.sy[g] = XF.sy;
      }
      C.t = t;
      return C;
    }

    // swirl: a folding sheet. The birds circulate on a lumpy disc that undulates in depth and turns
    // toward and away from the viewer; where the sheet is seen edge-on it folds into dark bands
    // (the caustics a real murmuration shows), where it faces us it opens up light and airy.
    const SW = {};
    function swirlParams(f, t) {
      const p = f.swirl || {};
      SW.cx = (p.cx || 940) + 120 * Math.sin(0.29 * t + 0.4) + (p.vx || 0) * t;
      SW.cy = (p.cy || 420) + 40 * Math.sin(0.43 * t + 1.2);
      SW.A = (p.A || 470) * (1 + 0.12 * Math.sin(0.51 * t + 0.3));
      SW.C = (p.C || 205) * (1 + 0.18 * Math.sin(0.39 * t + 2.1));
      SW.D1 = (p.D || 170) * (0.75 + 0.25 * Math.sin(0.33 * t));
      SW.D2 = (p.D2 || 95);
      SW.al = (p.al != null ? p.al : 0.95) + 0.5 * Math.sin(0.47 * t + 0.6); // turn about the vertical
      SW.be = 0.28 * Math.sin(0.31 * t + 1.0); // tilt
      SW.ca = Math.cos(SW.al); SW.sa = Math.sin(SW.al); SW.cb = Math.cos(SW.be); SW.sb = Math.sin(SW.be);
      SW.Om = p.Om || 0.42;
      SW.ph1 = 0.9 * t; SW.ph2 = -0.7 * t + 1.3;
      SW.t = t;
      SW.rot = (p.rot || -0.08) + 0.08 * Math.sin(0.23 * t);
      SW.cr = Math.cos(SW.rot); SW.sr = Math.sin(SW.rot);
      SW.warp = p.warp != null ? p.warp : 150;
      return SW;
    }
    function swirlPos(i, t, out) {
      // disc coordinates, circulating (inner birds faster), outline lumpy
      const ang = B.sTh[i] + SW.Om * t * (1.35 - 0.6 * B.sRho[i]);
      const lump = 1 + 0.22 * Math.sin(3 * ang + 0.7 * t) + 0.14 * Math.sin(5 * ang - 1.1 * t + 2) + 0.1 * Math.sin(2 * ang + 0.4 * t);
      const rr = B.sRho[i] * lump;
      const u = rr * Math.cos(ang), v = rr * Math.sin(ang);
      const X = SW.A * u;
      const Yy = SW.C * v + 40 * Math.sin(2.2 * u + SW.ph2);
      const Zz = SW.D1 * Math.sin(2.3 * u + SW.ph1) + SW.D2 * Math.sin(1.9 * v + 0.9 * u + SW.ph2) + (B.sPhi[i] - Math.PI) * 6;
      // turn about the vertical axis, then tilt about the horizontal
      const x1 = X * SW.ca + Zz * SW.sa, z1 = -X * SW.sa + Zz * SW.ca;
      const y2 = Yy * SW.cb - z1 * SW.sb, z2 = Yy * SW.sb + z1 * SW.cb;
      out.x = SW.cx + x1 * SW.cr - y2 * SW.sr;
      out.y = SW.cy + x1 * SW.sr + y2 * SW.cr;
      out.z = clamp(z2 / 260, -1, 1);
      if (SW.warp) {
        const cc = curlAt(out.x, out.y);
        out.x += SW.warp * cc.u;
        out.y += SW.warp * cc.v;
      }
      out.size = 1;
    }

    function haloPos(f, i, t, out) {
      const hs = f.halo && f.halo.length ? f.halo : [[960, 120, 70]];
      const fo = freeOrd[i];
      const m = fo % hs.length;
      const hc = hs[m];
      const ph = m * 2.1;
      const cx = hc[0] + 36 * Math.cos((TAU * t) / BAR + ph);
      const cy = hc[1] + 16 * Math.sin((2 * TAU * t) / BAR + ph);
      const ang = B.fAng[i] + ((m % 2 ? -1 : 1) * TAU * t) / BAR;
      const rr = hc[2] * 1.9 * B.fRho[i] * (1 + 0.3 * Math.sin((TAU * t) / BAR * 2 + B.fAng[i] * 3));
      const sk = 0.42 + 0.22 * Math.sin((TAU * t) / BAR + ph + B.fAng[i]);
      out.x = cx + rr * Math.cos(ang) * 1.4;
      out.y = cy + rr * Math.sin(ang) * sk + 30 * Math.sin(ang * 2 + (TAU * t) / BAR);
      out.z = -0.7 + B.fZ[i] * 0.4;
      out.size = 0.9;
    }

    // orbit angles: six whole-bar rates, so cos/sin per rate per time, then angle addition per bird
    const OT = { t: NaN, c: new Float64Array(6), s: new Float64Array(6) };
    function orbitTable(t) {
      for (let k = 0; k < 6; k++) {
        const w = ((k & 1 ? -1 : 1) * TAU * (1 + (k >> 1))) / BAR;
        OT.c[k] = Math.cos(w * t);
        OT.s[k] = Math.sin(w * t);
      }
      OT.t = t;
    }
    const WT = { t: NaN, cx: new Float64Array(8), sx: new Float64Array(8), cy: new Float64Array(8), sy: new Float64Array(8) };
    function wanderTable(t) {
      for (let k = 0; k < 8; k++) {
        const fx = (0.6 + (k + 0.5) * 0.15) * 3, fy = (0.6 + (k + 0.5) * 0.15) * 3.1;
        WT.cx[k] = Math.cos(fx * t); WT.sx[k] = Math.sin(fx * t);
        WT.cy[k] = Math.cos(fy * t); WT.sy[k] = Math.sin(fy * t);
      }
      WT.t = t;
    }
    // position of bird i's slot in formation f at time t (main birds: points, free: halo)
    function slotPos(f, i, t, out) {
      if (f.kind === 'swirl') return swirlPos(f.slot[i], t, out);
      if (isFree[i]) return haloPos(f, i, t, out);
      const j = f.slot[i];
      const P = f.P;
      const g = P.group[j];
      const C = f.xfCache;
      const lx = P.x[j] * C.sc[g], ly = P.y[j] * C.sc[g] * C.sy[g];
      const or = B.oR[i] * f.orbit * (P.size[j] * 2.2);
      if (OT.t !== t) orbitTable(t);
      const k = B.oK[i];
      const ca = OT.c[k], sa = OT.s[k], cb = B.oPc[i], sb = B.oPs[i];
      out.x = C.x[g] + lx * C.c[g] - ly * C.s[g] + or * (ca * cb - sa * sb);
      out.y = C.y[g] + lx * C.s[g] + ly * C.c[g] + or * (sa * cb + ca * sb) * 0.8;
      if (f.ripple) {
        const ra = (TAU * 2 * t) / BAR, rb = (TAU * 3 * t) / BAR + 1.3;
        out.x += f.ripple * Math.sin(P.y[j] * 0.019 + P.x[j] * 0.004 + ra);
        out.y += f.ripple * 0.8 * Math.sin(P.x[j] * 0.015 - P.y[j] * 0.006 + rb);
      }
      out.z = P.z[j] + (f.zOff || 0);
      out.size = P.size[j] * f.size;
    }
    function prepFormation(f, t) {
      if (f.kind === 'swirl') swirlParams(f, t);
      else groupXf(f, t);
    }

    // state
    const px = new Float32Array(N), py = new Float32Array(N), pz = new Float32Array(N);
    const vx = new Float32Array(N), vy = new Float32Array(N), vz = new Float32Array(N);
    const gxPrev = new Float32Array(N), gyPrev = new Float32Array(N), gzPrev = new Float32Array(N);
    const X = new Int16Array(NFR * N), Y = new Int16Array(NFR * N), Z = new Int8Array(NFR * N);

    // formation schedule
    let cur = 0;
    const tStart = -PRE;
    const tmp = { x: 0, y: 0, z: 0, size: 1 };
    const tmpB = { x: 0, y: 0, z: 0, size: 1 };
    // initial: formation 0 is the swirl, slots = identity
    {
      const f0 = F[0];
      for (let i = 0; i < N; i++) f0.slot[i] = i;
      f0.dep.fill(-1e9);
      prepFormation(f0, tStart);
      for (let i = 0; i < N; i++) {
        slotPos(f0, i, tStart, tmp);
        px[i] = tmp.x; py[i] = tmp.y; pz[i] = tmp.z;
        gxPrev[i] = tmp.x; gyPrev[i] = tmp.y; gzPrev[i] = tmp.z;
      }
    }

    function assign(k, t) {
      const f = F[k];
      const prev = F[k - 1];
      const look = t + 0.55;
      prepFormation(f, look);
      if (f.kind === 'swirl') {
        const qx = new Float32Array(N), qy = new Float32Array(N), bx = new Float32Array(N), by = new Float32Array(N);
        for (let i = 0; i < N; i++) {
          swirlPos(i, look, tmp);
          qx[i] = tmp.x; qy[i] = tmp.y;
          bx[i] = px[i]; by[i] = py[i];
        }
        const m = krMatch(bx, by, qx, qy, N, 48, false);
        for (let i = 0; i < N; i++) f.slot[i] = m[i];
      } else {
        const qx = new Float32Array(NM), qy = new Float32Array(NM), bx = new Float32Array(NM), by = new Float32Array(NM);
        const C = f.xfCache;
        for (let j = 0; j < NM; j++) {
          const g = f.P.group[j];
          const lx = f.P.x[j] * C.sc[g], ly = f.P.y[j] * C.sc[g] * C.sy[g];
          qx[j] = C.x[g] + lx * C.c[g] - ly * C.s[g];
          qy[j] = C.y[g] + lx * C.s[g] + ly * C.c[g];
        }
        for (let k2 = 0; k2 < NM; k2++) {
          bx[k2] = px[mainIdx[k2]];
          by[k2] = py[mainIdx[k2]];
        }
        const m = krMatch(bx, by, qx, qy, NM, f.strips || 64, !!f.stripsByY);
        for (let k2 = 0; k2 < NM; k2++) f.slot[mainIdx[k2]] = m[k2];
        for (let i = 0; i < N; i++) if (isFree[i]) f.slot[i] = freeOrd[i];
      }
      // departures and transit durations
      prepFormation(f, look);
      const dd = f.dur || [0.42, 1 / 1700, 0.5, 1.15];
      for (let i = 0; i < N; i++) {
        slotPos(f, i, look, tmp);
        const dist = Math.hypot(tmp.x - px[i], tmp.y - py[i]);
        const st = f.stagger ? f.stagger(tmp.x, tmp.y, px[i], py[i], i) : 0;
        f.dep[i] = t + Math.max(0, st) + hf(i, k, 91) * (f.jitter != null ? f.jitter : 0.12);
        f.dur[i] = clamp(dd[0] + dist * dd[1], dd[2], dd[3]);
      }
      void prev;
    }

    function densAt(x, y) {
      const fx = (x - GX0) / CS - 0.5, fy = (y - GY0) / CS - 0.5;
      let ix = Math.floor(fx), iy = Math.floor(fy);
      if (ix < 0 || iy < 0 || ix >= GW - 1 || iy >= GH - 1) return 0;
      const ux = fx - ix, uy = fy - iy;
      const o = iy * GW + ix;
      return (dens[o] * (1 - ux) + dens[o + 1] * ux) * (1 - uy) + (dens[o + GW] * (1 - ux) + dens[o + GW + 1] * ux) * uy;
    }

    function buildGrids(t) {
      dens.fill(0);
      gvx.fill(0); gvy.fill(0); gvn.fill(0);
      for (let i = 0; i < N; i++) {
        const fx = (px[i] - GX0) / CS - 0.5, fy = (py[i] - GY0) / CS - 0.5;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        if (ix >= 0 && iy >= 0 && ix < GW - 1 && iy < GH - 1) {
          const ux = fx - ix, uy = fy - iy, o = iy * GW + ix;
          dens[o] += (1 - ux) * (1 - uy); dens[o + 1] += ux * (1 - uy);
          dens[o + GW] += (1 - ux) * uy; dens[o + GW + 1] += ux * uy;
        }
        const jx = Math.floor((px[i] - GX0) / VCS), jy = Math.floor((py[i] - GY0) / VCS);
        if (jx >= 0 && jy >= 0 && jx < VW && jy < VH) {
          const o = jy * VW + jx;
          gvx[o] += vx[i]; gvy[o] += vy[i]; gvn[o] += 1;
        }
      }
      for (let o = 0; o < VW * VH; o++) if (gvn[o] > 0) { gvx[o] /= gvn[o]; gvy[o] /= gvn[o]; }
      // curl-noise wind
      const ns = 1 / 300, nt = 0.32 * t;
      for (let jy = 0; jy < NH; jy++) for (let jx = 0; jx < NW; jx++) {
        const x = GX0 + (jx - 1) * NCS, y = GY0 + (jy - 1) * NCS;
        psi[jy * NW + jx] = perlin(x * ns, y * ns, nt) + 0.5 * perlin2(x * ns * 2.1, y * ns * 2.1, nt * 1.7);
      }
      for (let jy = 1; jy < NH - 1; jy++) for (let jx = 1; jx < NW - 1; jx++) {
        const o = jy * NW + jx;
        cu[o] = (psi[o + NW] - psi[o - NW]) * 0.5 * 4;
        cv[o] = -(psi[o + 1] - psi[o - 1]) * 0.5 * 4;
      }
    }

    // gains by state
    function step(t, storeFrame) {
      // formation switch
      while (cur + 1 < F.length && t >= F[cur + 1].t0 - 1e-9) {
        cur++;
        assign(cur, t);
      }
      const f = F[cur];
      const pf = cur > 0 ? F[cur - 1] : null;
      prepFormation(f, t);
      if (pf) prepFormation(pf, t);
      buildGrids(t);
      wanderTable(t);
      const gn = f.gains || {};
      const holdKp = gn.kp || (f.kind === 'swirl' ? 2.4 : 7), holdKv = gn.kv || (f.kind === 'swirl' ? 5.5 : 13);
      const holdNoise = gn.noise != null ? gn.noise : f.kind === 'swirl' ? 900 : 70;
      const sepK = gn.sep != null ? gn.sep : 260;
      const alK = gn.align != null ? gn.align : f.kind === 'swirl' ? 1.6 : 0.4;
      const wander = gn.wander != null ? gn.wander : f.kind === 'swirl' ? 160 : 90;
      const bulge = f.bulge || 0;
      const swing = f.swing || 0;
      const pivX = f.pivot ? f.pivot[0] : 960, pivY = f.pivot ? f.pivot[1] : 470;
      for (let i = 0; i < N; i++) {
        // target
        let gx, gy, gz, transit = 0;
        const dep = f.dep[i];
        if (pf && t < dep + f.dur[i]) {
          let s = (t - dep) / f.dur[i];
          s = s < 0 ? 0 : s > 1 ? 1 : s;
          const e = easeIO(s);
          slotPos(pf, i, t, tmp);
          if (s <= 0) {
            gx = tmp.x; gy = tmp.y; gz = tmp.z;
          } else {
            slotPos(f, i, t, tmpB);
            const dx = tmpB.x - tmp.x, dy = tmpB.y - tmp.y;
            const bs = Math.sin(Math.PI * s) * bulge;
            gx = tmp.x + dx * e - dy * bs;
            gy = tmp.y + dy * e + dx * bs;
            if (swing) {
              // the whole flock swings round a pivot on its way: a turning ribbon, not point-to-point
              const sw = swing * Math.pow(Math.sin(Math.PI * s), 1.4);
              const cs = Math.cos(sw), sn2 = Math.sin(sw);
              const rx = gx - pivX, ry = gy - pivY;
              gx = pivX + rx * cs - ry * sn2;
              gy = pivY + rx * sn2 + ry * cs;
            }
            gz = lerp(tmp.z, tmpB.z, e) + Math.sin(Math.PI * s) * 0.35;
            transit = Math.sin(Math.PI * s);
          }
        } else {
          slotPos(f, i, t, tmp);
          gx = tmp.x; gy = tmp.y; gz = tmp.z;
        }
        const gvxT = (gx - gxPrev[i]) / dt, gvyT = (gy - gyPrev[i]) / dt, gvzT = (gz - gzPrev[i]) / dt;
        gxPrev[i] = gx; gyPrev[i] = gy; gzPrev[i] = gz;
        const kp = lerp(holdKp, 3.2, transit), kv = lerp(holdKv, 7, transit);
        const noise = lerp(holdNoise, 2400, transit);
        const x = px[i], y = py[i];
        // PD steering to the target (feed-forward its velocity)
        let ax = kv * (gvxT + kp * (gx - x) - vx[i]);
        let ay = kv * (gvyT + kp * (gy - y) - vy[i]);
        const az = 6 * (gvzT + 3 * (gz - pz[i]) - vz[i]);
        // separation: down the density gradient
        const sk = sepK * (0.35 + transit) * (4 / CS);
        {
          const fx = (x - GX0) / CS - 0.5, fy = (y - GY0) / CS - 0.5;
          const ix = Math.floor(fx), iy = Math.floor(fy);
          if (ix >= 0 && iy >= 0 && ix < GW - 1 && iy < GH - 1) {
            const ux = fx - ix, uy = fy - iy, o = iy * GW + ix;
            const d00 = dens[o], d10 = dens[o + 1], d01 = dens[o + GW], d11 = dens[o + GW + 1];
            ax -= sk * ((d10 - d00) * (1 - uy) + (d11 - d01) * uy);
            ay -= sk * ((d01 - d00) * (1 - ux) + (d11 - d10) * ux);
          }
        }
        // alignment
        const jx = Math.floor((x - GX0) / VCS), jy = Math.floor((y - GY0) / VCS);
        if (jx >= 0 && jy >= 0 && jx < VW && jy < VH) {
          const o = jy * VW + jx;
          const ak = alK + 2.2 * transit;
          ax += ak * (gvx[o] - vx[i]);
          ay += ak * (gvy[o] - vy[i]);
        }
        // curl-noise wind
        const nfx = (x - GX0) / NCS + 1, nfy = (y - GY0) / NCS + 1;
        const nix = Math.floor(nfx), niy = Math.floor(nfy);
        if (nix >= 1 && niy >= 1 && nix < NW - 2 && niy < NH - 2) {
          const ux = nfx - nix, uy = nfy - niy, o = niy * NW + nix;
          const u = (cu[o] * (1 - ux) + cu[o + 1] * ux) * (1 - uy) + (cu[o + NW] * (1 - ux) + cu[o + NW + 1] * ux) * uy;
          const v = (cv[o] * (1 - ux) + cv[o + 1] * ux) * (1 - uy) + (cv[o + NW] * (1 - ux) + cv[o + NW + 1] * ux) * uy;
          ax += noise * u;
          ay += noise * v;
        }
        // personal wander
        {
          const kx = B.wKx[i], ky = B.wKy[i];
          ax += wander * (WT.sx[kx] * B.wPcx[i] + WT.cx[kx] * B.wPsx[i]);
          ay += wander * (WT.cy[ky] * B.wPcy[i] - WT.sy[ky] * B.wPsy[i]);
        }
        // limits
        const am = Math.sqrt(ax * ax + ay * ay);
        if (am > 9000) { ax *= 9000 / am; ay *= 9000 / am; }
        let nvx = vx[i] + ax * dt, nvy = vy[i] + ay * dt;
        const vm = Math.sqrt(nvx * nvx + nvy * nvy);
        if (vm > 1500) { nvx *= 1500 / vm; nvy *= 1500 / vm; }
        vx[i] = nvx; vy[i] = nvy; vz[i] += az * dt;
        px[i] = x + nvx * dt; py[i] = y + nvy * dt; pz[i] = clamp(pz[i] + vz[i] * dt, -1, 1);
      }
      if (storeFrame >= 0) {
        const o = storeFrame * N;
        for (let i = 0; i < N; i++) {
          X[o + i] = clamp(Math.round((px[i] - 960) * 16), -32767, 32767);
          Y[o + i] = clamp(Math.round((py[i] - 540) * 16), -32767, 32767);
          Z[o + i] = clamp(Math.round(pz[i] * 127), -127, 127);
        }
      }
    }

    const steps = Math.round((DUR + 1 / FPS + PRE) * FPS * SUB);
    const s0 = Math.round(PRE * FPS * SUB);
    for (let s = 0; s <= steps; s++) {
      const t = tStart + s * dt;
      const rel = s - s0;
      const store = rel >= 0 && rel % SUB === 0 && rel / SUB < NFR ? rel / SUB : -1;
      step(t, store);
    }

    // the loop: make the last bar exactly periodic (frame fEnd == frame fL), drift-corrected
    if (S.loopStart != null) {
      const fL = Math.round(S.loopStart * FPS), fE = Math.round(DUR * FPS);
      const span = fE - fL;
      for (let i = 0; i < N; i++) {
        const dx = X[fL * N + i] - X[fE * N + i], dy = Y[fL * N + i] - Y[fE * N + i], dz = Z[fL * N + i] - Z[fE * N + i];
        for (let fr = fL + 1; fr <= fE; fr++) {
          const u = (fr - fL) / span;
          const o = fr * N + i;
          X[o] = Math.round(X[o] + dx * u);
          Y[o] = Math.round(Y[o] + dy * u);
          Z[o] = clamp(Math.round(Z[o] + dz * u), -127, 127);
        }
      }
    }

    return { S, N, NM, NFR, X, Y, Z, F, B, isFree, freeOrd, formationAt: (T) => { let k = 0; while (k + 1 < F.length && T >= F[k + 1].t0 - 1e-9) k++; return k; }, slotPos, prepFormation };
  }

  // ---------------------------------------------------------------------------------------------
  // painted plates: sky, clouds, city (each painted once, t-independent)
  // ---------------------------------------------------------------------------------------------
  const P = () => FILM.lib.pal;
  const plates = {};
  function hex(c) {
    const v = parseInt(c.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  const rgba = (c, a) => {
    const [r, g, b] = hex(c);
    return `rgba(${r},${g},${b},${a})`;
  };
  const SUN = { x: 1090, y: 838 };
  FL.SUN = SUN;

  function skyPlate() {
    if (plates.sky) return plates.sky;
    const pal = P();
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0.0, pal.skyTop);
    gr.addColorStop(0.15, pal.skyHigh);
    gr.addColorStop(0.33, pal.skyRose);
    gr.addColorStop(0.5, pal.skyCoral);
    gr.addColorStop(0.64, pal.skyAmber);
    gr.addColorStop(0.77, pal.skyGold);
    gr.addColorStop(0.88, pal.skyHorizon);
    gr.addColorStop(1.0, pal.skyHorizon);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'screen';
    const glow = (r, col, a, sy) => {
      g.save();
      g.translate(SUN.x, SUN.y);
      g.scale(1, sy || 1);
      const rg = g.createRadialGradient(0, 0, 0, 0, 0, r);
      rg.addColorStop(0, rgba(col, a));
      rg.addColorStop(0.3, rgba(col, a * 0.5));
      rg.addColorStop(0.65, rgba(col, a * 0.14));
      rg.addColorStop(1, rgba(col, 0));
      g.fillStyle = rg;
      g.fillRect(-r, -r, 2 * r, 2 * r);
      g.restore();
    };
    glow(1700, pal.sunHaze, 0.5, 0.36);
    glow(900, pal.sunGlow, 0.62, 0.72);
    glow(300, pal.sunCore, 0.9, 1);
    // light shafts: soft wedges fanning up from the sun, painted small and blown up
    {
      const q = 6;
      const sc = canvas(Math.ceil(W / q), Math.ceil(H / q));
      const sg = sc.getContext('2d');
      const r = rng(2024);
      sg.translate(SUN.x / q, SUN.y / q);
      for (let k = 0; k < 22; k++) {
        const a0 = -Math.PI + 0.12 + (k / 22) * (Math.PI - 0.24) + (r() - 0.5) * 0.05;
        const wdt = 0.02 + r() * 0.05;
        const len = 1400 / q;
        const lg = sg.createLinearGradient(0, 0, Math.cos(a0) * len, Math.sin(a0) * len);
        lg.addColorStop(0, rgba(pal.sunGlow, 0.0));
        lg.addColorStop(0.12, rgba(pal.sunGlow, 0.35 + r() * 0.4));
        lg.addColorStop(1, rgba(pal.sunGlow, 0));
        sg.fillStyle = lg;
        sg.beginPath();
        sg.moveTo(0, 0);
        sg.lineTo(Math.cos(a0 - wdt) * len, Math.sin(a0 - wdt) * len);
        sg.lineTo(Math.cos(a0 + wdt) * len, Math.sin(a0 + wdt) * len);
        sg.closePath();
        sg.fill();
      }
      g.globalAlpha = 0.055;
      g.imageSmoothingQuality = 'high';
      g.drawImage(sc, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
    const dg = g.createRadialGradient(SUN.x, SUN.y, 0, SUN.x, SUN.y, 62);
    dg.addColorStop(0, rgba(pal.sunCore, 1));
    dg.addColorStop(0.78, rgba(pal.sunCore, 1));
    dg.addColorStop(1, rgba(pal.sunCore, 0));
    g.fillStyle = dg;
    g.beginPath();
    g.arc(SUN.x, SUN.y, 62, 0, TAU);
    g.fill();
    plates.sky = c;
    return c;
  }

  // streaky golden-hour clouds, lit from the sun side, painted at 1/3 resolution and upscaled soft
  const CLOUD_PAD = 240;
  function cloudPlate() {
    if (plates.cloud) return plates.cloud;
    const pal = P();
    const q = 3;
    const cw = Math.ceil((W + CLOUD_PAD) / q), ch = Math.ceil(H / q);
    const small = canvas(cw, ch);
    const g = small.getContext('2d');
    const img = g.createImageData(cw, ch);
    const d = img.data;
    const n1 = makePerlin(303), n2 = makePerlin(808);
    const lit = hex(pal.cloudLit), mid = hex(pal.cloudMid), dark = hex(pal.cloudDark), rim = hex(pal.cloudRim);
    const deckAt = (fy) => Math.exp(-Math.pow((fy - 0.13) / 0.075, 2)) * 0.95 + Math.exp(-Math.pow((fy - 0.34) / 0.05, 2)) * 0.6 + Math.exp(-Math.pow((fy - 0.6) / 0.035, 2)) * 0.55 + Math.exp(-Math.pow((fy - 0.71) / 0.02, 2)) * 0.45;
    const field = (X, Y) => {
      let f = 0, a = 1, s = 1;
      for (let o = 0; o < 5; o++) {
        f += a * n1(X * 0.0019 * s, Y * 0.0125 * s, o * 7.3);
        a *= 0.52;
        s *= 2.05;
      }
      const fy = Y / H;
      const deck = deckAt(fy);
      return { v: f + n2(X * 0.0009, Y * 0.004, 2.0) * 0.4 + (deck - 0.66), deck };
    };
    for (let y = 0; y < ch; y++) {
      const Y = y * q;
      const fy = Y / H;
      if (deckAt(fy) < 0.03) {
        for (let x = 0; x < cw; x++) d[(y * cw + x) * 4 + 3] = 0;
        continue;
      }
      for (let x = 0; x < cw; x++) {
        const X = x * q - CLOUD_PAD / 2;
        const A0 = field(X, Y);
        const den = sstep(0.0, 0.36, A0.v) * Math.min(1, A0.deck * 1.2);
        const i = (y * cw + x) * 4;
        if (den <= 0.004) { d[i + 3] = 0; continue; }
        // light from the sun: compare with the density a little toward the sun
        const lx = SUN.x - X, ly = SUN.y - Y, ll = Math.hypot(lx, ly) || 1;
        const A1 = field(X + (lx / ll) * 14, Y + (ly / ll) * 14);
        const lightK = clamp(0.55 + (A0.v - A1.v) * 2.2);
        const ds = Math.hypot((X - SUN.x) / 1250, (Y - SUN.y) / 760);
        const sunK = clamp(1 - ds);
        const hiK = clamp(1 - fy / 0.5);
        let r = lerp(mid[0], lit[0], sunK), gg = lerp(mid[1], lit[1], sunK), b = lerp(mid[2], lit[2], sunK);
        const shade = (1 - lightK) * (0.45 + 0.4 * hiK);
        r = lerp(r, dark[0], shade); gg = lerp(gg, dark[1], shade); b = lerp(b, dark[2], shade);
        const rk = clamp(lightK - 0.55) * 2 * (0.35 + 0.65 * sunK);
        r = lerp(r, rim[0], rk); gg = lerp(gg, rim[1], rk); b = lerp(b, rim[2], rk);
        d[i] = r; d[i + 1] = gg; d[i + 2] = b;
        d[i + 3] = clamp(den * 0.82) * 255;
      }
    }
    g.putImageData(img, 0, 0);
    const c = canvas(W + CLOUD_PAD, H);
    const g2 = c.getContext('2d');
    g2.imageSmoothingEnabled = true;
    g2.imageSmoothingQuality = 'high';
    g2.drawImage(small, 0, 0, cw * q, ch * q);
    plates.cloud = c;
    return c;
  }

  // the city: haze-graded silhouette layers, a TV mast, glass towers and a crane; a few windows lit
  const BEACONS = [];
  function cityPlate() {
    if (plates.city) return plates.city;
    const pal = P();
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const r = rng(5150);
    const skyline = (hMin, hMax, wMin, wMax, base, windows, avoid, rim) => {
      const bs = [];
      let x = -30;
      g.beginPath();
      while (x < W + 30) {
        const w = wMin + r() * (wMax - wMin);
        let h = hMin + Math.pow(r(), 1.7) * (hMax - hMin);
        if (avoid && x > avoid[0] && x < avoid[1]) h *= 0.6;
        const top = base - h;
        const kind = r();
        if (kind < 0.12) {
          g.rect(x, top + 16, w, H - top);
          g.rect(x + w * 0.22, top, w * 0.56, 18);
        } else if (kind < 0.2) {
          g.moveTo(x, top + 20); g.lineTo(x + w / 2, top - 8); g.lineTo(x + w, top + 20); g.lineTo(x + w, H); g.lineTo(x, H); g.closePath();
        } else if (kind < 0.26) {
          g.rect(x, top + 10, w, H - top);
          g.moveTo(x + w * 0.5 + 12, top + 10);
          g.arc(x + w * 0.5, top + 10, 12, 0, Math.PI, true);
        } else {
          g.rect(x, top, w, H - top);
        }
        if (r() < 0.3) g.rect(x + w * (0.2 + r() * 0.6), top - 12 - r() * 26, 2, 34);
        if (r() < 0.12) g.rect(x + w * 0.3, top - 9, 9, 10); // water tank
        bs.push([x, top, w]);
        x += w + (r() < 0.22 ? 3 + r() * 12 : -2);
      }
      g.fill();
      if (rim) {
        // the sun-side rim light along the roof lines
        const keep = g.fillStyle;
        for (const [bx, top, w] of bs) {
          const k = clamp(1 - Math.abs(bx + w / 2 - SUN.x) / 1250);
          if (k <= 0.02) continue;
          g.fillStyle = rgba(pal.rimLight, rim * k * k);
          g.fillRect(bx, top, w, 1.6);
          g.fillRect(bx + (bx + w / 2 < SUN.x ? w - 1.4 : 0), top, 1.4, Math.min(60, H - top));
        }
        g.fillStyle = keep;
      }
      if (windows) {
        for (const [bx, top, w] of bs) {
          for (let wy = top + 9; wy < H - 4; wy += 10) {
            for (let wx = bx + 5; wx < bx + w - 5; wx += 8) {
              const k = r();
              if (k < windows) {
                g.fillStyle = k < windows * 0.55 ? pal.windowWarm : pal.windowDim;
                g.globalAlpha = 0.45 + r() * 0.45;
                g.fillRect(wx, wy, 2.5, 3.5);
              }
            }
          }
        }
        g.globalAlpha = 1;
      }
      return bs;
    };
    const fogOver = (y0, y1, col, a) => {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      const fg = g.createLinearGradient(0, y0, 0, y1);
      fg.addColorStop(0, rgba(col, 0));
      fg.addColorStop(1, rgba(col, a));
      g.fillStyle = fg;
      g.fillRect(0, y0, W, y1 - y0);
      g.restore();
    };
    // far layer, deep in the haze
    g.globalAlpha = 0.42;
    g.fillStyle = pal.cityFar;
    skyline(30, 120, 36, 120, 1010, 0);
    g.globalAlpha = 1;
    fogOver(880, 1080, pal.skyHorizon, 0.75);
    // glass towers (right) and the TV mast (left), between far and mid
    g.fillStyle = pal.cityMid;
    const tower = (x, w, top, cut) => {
      g.beginPath();
      g.moveTo(x, H); g.lineTo(x, top + cut); g.lineTo(x + w, top); g.lineTo(x + w, H); g.closePath(); g.fill();
      // sun-facing edge catches the light
      g.fillStyle = rgba(pal.sunGlow, 0.5);
      g.fillRect(x, top + cut, 2, H - top - cut);
      g.fillStyle = pal.cityMid;
      BEACONS.push([x + w - 3, top - 3, BEACONS.length]);
    };
    tower(1712, 58, 818, 22);
    tower(1780, 52, 792, 26);
    tower(1840, 66, 832, 14);
    // tower details: floor lines and a spire
    g.fillStyle = rgba(pal.windowDim, 0.18);
    for (const [tx, tw, tt] of [[1712, 58, 840], [1780, 52, 818], [1840, 66, 846]]) for (let y = tt; y < H; y += 7) g.fillRect(tx + 4, y, tw - 8, 1);
    g.fillStyle = pal.cityMid;
    g.fillRect(1804, 756, 2, 40);
    BEACONS.push([1805, 754, 5]);
    g.beginPath();
    g.moveTo(80, H); g.lineTo(94, 906); g.lineTo(100, 906); g.lineTo(114, H); g.closePath(); g.fill();
    g.fillRect(84, 898, 26, 12);
    g.fillRect(95.5, 796, 3, 104);
    BEACONS.push([97, 794, 3]);
    // mid layer
    g.fillStyle = pal.cityMid;
    skyline(26, 110, 30, 96, 1040, 0.05, [1640, 1960], 0.5);
    fogOver(950, 1080, pal.skyAmber, 0.3);
    // crane
    g.fillStyle = pal.cityNear;
    g.fillRect(372, 872, 6, 210);
    g.fillRect(262, 870, 236, 4);
    g.beginPath(); g.moveTo(371, 870); g.lineTo(375, 846); g.lineTo(379, 870); g.closePath(); g.fill();
    g.fillRect(278, 874, 16, 10);
    g.fillRect(468, 874, 1.5, 50);
    BEACONS.push([375, 844, 4]);
    // near layer
    g.fillStyle = pal.cityNear;
    skyline(20, 88, 28, 90, 1080, 0.11, null, 0.75);
    plates.city = c;
    return c;
  }

  function vignettePlate() {
    if (plates.vig) return plates.vig;
    const c = canvas(W, H);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(W * 0.55, H * 0.62, H * 0.38, W * 0.5, H * 0.55, H * 1.2);
    rg.addColorStop(0, rgba(P().vignette, 0));
    rg.addColorStop(1, rgba(P().vignette, 0.45));
    g.fillStyle = rg;
    g.fillRect(0, 0, W, H);
    plates.vig = c;
    return c;
  }

  function grainTiles() {
    if (plates.grain) return plates.grain;
    const tiles = [];
    for (let v = 0; v < 4; v++) {
      const c = canvas(256, 256);
      const g = c.getContext('2d');
      const img = g.createImageData(256, 256);
      const d = img.data;
      for (let i = 0; i < 256 * 256; i++) {
        const n = hf(i, v, 4242);
        const o = i * 4;
        if (n > 0.5) { d[o] = 255; d[o + 1] = 236; d[o + 2] = 214; d[o + 3] = (n - 0.5) * 2 * 18; }
        else { d[o] = 30; d[o + 1] = 10; d[o + 2] = 30; d[o + 3] = (0.5 - n) * 2 * 22; }
      }
      g.putImageData(img, 0, 0);
      tiles.push(c);
    }
    plates.grain = tiles;
    return tiles;
  }

  // ---------------------------------------------------------------------------------------------
  // 4. the birds on the GPU: one point sprite per bird, the silhouette computed in the fragment
  //    shader (body, swept wings with an elbow, forked tail), rotated to the heading, wings at the
  //    flap phase, stretched back by the motion, tinted by depth haze from the sky behind it.
  // ---------------------------------------------------------------------------------------------
  let GL = null;
  function initGL(cw, ch, N) {
    if (GL && GL.cw === cw && GL.ch === ch && GL.N === N) return GL;
    const THREE = root.THREE;
    const cv = canvas(cw, ch);
    const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: false, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(cw, ch, false);
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(0, W, 0, H, -10, 10);
    const geo = new THREE.BufferGeometry();
    const aP = new THREE.BufferAttribute(new Float32Array(N * 3), 3);
    const aA = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    const aB = new THREE.BufferAttribute(new Float32Array(N * 4), 4);
    [aP, aA, aB].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('position', aP);
    geo.setAttribute('aA', aA);
    geo.setAttribute('aB', aB);
    const skyTex = new THREE.CanvasTexture(skyPlate());
    skyTex.colorSpace = THREE.NoColorSpace;
    skyTex.minFilter = THREE.LinearFilter;
    skyTex.generateMipmaps = false;
    const ink = hex(P().birdInk).map((v) => v / 255);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uSky: { value: skyTex },
        uRes: { value: new THREE.Vector2(cw, ch) },
        uInk: { value: new THREE.Vector3(ink[0], ink[1], ink[2]) },
        uS: { value: cw / W },
      },
      vertexShader: `
        attribute vec4 aA; // dir.x, dir.y, lift, -
        attribute vec4 aB; // length px, span, haze, stretch px
        uniform float uS;
        varying vec2 vDir; varying float vL; varying float vSpan; varying float vHaze; varying float vStr; varying float vSize; varying float vLift;
        void main() {
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position.xy, 0.0, 1.0);
          float L = aB.x;
          float reach = max(L * 1.02 * max(aB.y, 0.55), 0.62 * L + aB.w);
          float sz = (2.0 * reach + 2.5) * uS;
          gl_PointSize = sz;
          vSize = sz; vDir = aA.xy; vLift = aA.z; vL = L * uS; vSpan = aB.y; vHaze = aB.z; vStr = aB.w * uS;
        }`,
      fragmentShader: `
        uniform sampler2D uSky; uniform vec2 uRes; uniform vec3 uInk;
        varying vec2 vDir; varying float vL; varying float vSpan; varying float vHaze; varying float vStr; varying float vSize; varying float vLift;
        float sdTri(vec2 p, vec2 a, vec2 b, vec2 c) {
          vec2 e0 = b - a, e1 = c - b, e2 = a - c;
          vec2 v0 = p - a, v1 = p - b, v2 = p - c;
          vec2 pq0 = v0 - e0 * clamp(dot(v0, e0) / dot(e0, e0), 0.0, 1.0);
          vec2 pq1 = v1 - e1 * clamp(dot(v1, e1) / dot(e1, e1), 0.0, 1.0);
          vec2 pq2 = v2 - e2 * clamp(dot(v2, e2) / dot(e2, e2), 0.0, 1.0);
          float s = sign(e0.x * e2.y - e0.y * e2.x);
          vec2 d = min(min(vec2(dot(pq0, pq0), s * (v0.x * e0.y - v0.y * e0.x)), vec2(dot(pq1, pq1), s * (v1.x * e1.y - v1.y * e1.x))), vec2(dot(pq2, pq2), s * (v2.x * e2.y - v2.y * e2.x)));
          return -sqrt(d.x) * sign(d.y);
        }
        void main() {
          vec2 q = (gl_PointCoord - 0.5) * vSize;
          vec2 n = vec2(-vDir.y, vDir.x);
          vec2 lp = vec2(dot(q, vDir), dot(q, n)) / vL;
          float fade = 1.0;
          if (lp.x < 0.0) {
            float k = vL / (vL + vStr);
            fade = 1.0 - 0.45 * clamp(-lp.x * k / 0.62, 0.0, 1.0) * clamp(vStr / vL, 0.0, 1.0);
            lp.x *= k;
          }
          lp.y = abs(lp.y);
          float dB = (length(lp / vec2(0.5, 0.12)) - 1.0) * 0.12;
          float dT = min(sdTri(lp, vec2(-0.2, 0.0), vec2(-0.5, 0.11), vec2(-0.5, 0.0)), sdTri(lp, vec2(-0.2, 0.0), vec2(-0.2, 0.07), vec2(-0.5, 0.11)));
          float sp = max(vSpan, 0.16);
          float tipx = -0.34 + (1.0 - vSpan) * 0.24 + vLift * 0.07;
          vec2 elbow = vec2(0.1 + 0.05 * (1.0 - vSpan), 0.48 * sp + 0.05);
          float dW = min(sdTri(lp, vec2(0.22, 0.02), elbow, vec2(-0.24, 0.02)), sdTri(lp, elbow, vec2(tipx, sp), vec2(-0.24, 0.02)));
          float d = min(min(dB, dT), dW) * vL;
          float a = clamp(0.55 - d, 0.0, 1.0) * fade;
          if (a <= 0.003) discard;
          vec3 sky = texture2D(uSky, gl_FragCoord.xy / uRes).rgb;
          vec3 col = mix(uInk, sky, vHaze);
          gl_FragColor = vec4(col * a, a);
        }`,
      transparent: true,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    GL = { cw, ch, N, renderer, scene, cam, aP, aA, aB, canvas: cv };
    return GL;
  }

  // the shader's silhouette, in 2D, for the few birds that pass right by the camera
  function nearBird(ctx, x, y, dx, dy, L, span, alpha, col) {
    const nx = -dy, ny = dx;
    const P = (fx, fy) => [x + (dx * fx + nx * fy) * L, y + (dy * fx + ny * fy) * L];
    const sp = Math.max(0.16, span);
    const tipx = -0.22 + (1 - span) * 0.2;
    const ex = 0.12 + 0.04 * (1 - span), ey = 0.45 * sp + 0.05;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = col;
    ctx.filter = `blur(${(L / 40).toFixed(2)}px)`;
    ctx.beginPath();
    // body
    const b0 = P(0.5, 0), b1 = P(0.15, 0.12), b2 = P(-0.3, 0.07), b3 = P(-0.3, -0.07), b4 = P(0.15, -0.12);
    ctx.moveTo(b0[0], b0[1]); ctx.lineTo(b1[0], b1[1]); ctx.lineTo(b2[0], b2[1]); ctx.lineTo(b3[0], b3[1]); ctx.lineTo(b4[0], b4[1]); ctx.closePath();
    // tail
    const t0 = P(-0.2, 0.08), t1 = P(-0.48, 0.11), t2 = P(-0.5, 0), t3 = P(-0.48, -0.11), t4 = P(-0.2, -0.08);
    ctx.moveTo(t0[0], t0[1]); ctx.lineTo(t1[0], t1[1]); ctx.lineTo(t2[0], t2[1]); ctx.lineTo(t3[0], t3[1]); ctx.lineTo(t4[0], t4[1]); ctx.closePath();
    // wings
    for (const sd of [1, -1]) {
      const w0 = P(0.22, 0.02 * sd), w1 = P(ex, ey * sd), w2 = P(tipx, sp * sd), w3 = P(-0.24, 0.02 * sd);
      ctx.moveTo(w0[0], w0[1]); ctx.lineTo(w1[0], w1[1]); ctx.lineTo(w2[0], w2[1]); ctx.lineTo(w3[0], w3[1]); ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // per-frame bird state and the frame itself
  // ---------------------------------------------------------------------------------------------
  function wavesAt(S, T) {
    // in the loop bar the wave clock wraps with the bar
    let Tw = T;
    if (S.loopStart != null && T >= S.loopStart) Tw = S.loopStart + ((T - S.loopStart) % BAR);
    const out = [];
    for (const w of S.waves || []) {
      const life = w.life || 1.2;
      const age = Tw - w.t;
      if (age < 0 || age >= life) continue;
      out.push({ ox: w.x, oy: w.y, c: Math.cos(w.ang), s: Math.sin(w.ang), front: (w.lead || 0) + age * (w.speed || 1100), inv: 1 / (w.width || 70), env: sstep(0, 0.16, age) * (1 - sstep(life - 0.22, life, age)) * (w.amp || 1) });
    }
    return out;
  }
  FL.wavesAt = wavesAt;

  // bird i's state at T into the GL buffers (and returns nothing); shared by render
  FL.render = function render(ctx, T, script, opts) {
    opts = opts || {};
    const skip = FL.debugSkip || {};
    const film = FL.film(script);
    const S = film.S;
    const pal = P();
    const N = film.N;
    // 1 sky
    ctx.drawImage(skyPlate(), 0, 0, W, H);
    // 2 clouds, drifting until the loop bar, then still
    const tc = S.loopStart != null ? Math.min(T, S.loopStart) : T;
    if (!skip.clouds) ctx.drawImage(cloudPlate(), -CLOUD_PAD + tc * 8, 0, W + CLOUD_PAD, H);
    // 3 birds
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    const G = initGL(cw, ch, N);
    const Pp = G.aP.array, A = G.aA.array, Bb = G.aB.array;
    const fpos = clamp(T * FPS, 0, film.NFR - 2);
    const f0 = Math.floor(fpos + 1e-6);
    const u = fpos - f0;
    const f1 = Math.min(f0 + 1, film.NFR - 1);
    const fm = Math.max(f0 - 1, 0), fp = Math.min(f0 + 1, film.NFR - 1);
    const X = film.X, Y = film.Y, Z = film.Z;
    const o0 = f0 * N, o1 = f1 * N, om = fm * N, op = fp * N;
    const vk = FPS / Math.max(1, fp - fm) / 16;
    const k = film.formationAt(T);
    const F = film.F[k], PF = k > 0 ? film.F[k - 1] : null;
    const hd = S.heading ? S.heading(T) : -0.35;
    const HX = Math.cos(hd), HY = Math.sin(hd);
    const waves = wavesAt(S, T);
    const B = film.B;
    const baseL = opts.birdLen || S.birdLen || 4.2;
    const headW = S.headWeight || 600;
    const isFree = film.isFree;
    for (let i = 0; i < N; i++) {
      const x = (X[o0 + i] * (1 - u) + X[o1 + i] * u) / 16 + 960;
      const y = (Y[o0 + i] * (1 - u) + Y[o1 + i] * u) / 16 + 540;
      const z = (Z[o0 + i] * (1 - u) + Z[o1 + i] * u) / 127;
      const vx = (X[op + i] - X[om + i]) * vk, vy = (Y[op + i] - Y[om + i]) * vk;
      // size from the formation, blended through the transit
      const sCur = F.kind === 'swirl' ? F.size : isFree[i] ? 0.9 : F.P.size[F.slot[i]] * F.size;
      let sz = sCur;
      if (PF && T < F.dep[i] + F.dur[i]) {
        const sPrev = PF.kind === 'swirl' ? PF.size : isFree[i] ? 0.9 : PF.P.size[PF.slot[i]] * PF.size;
        sz = lerp(sPrev, sCur, easeIO((T - F.dep[i]) / F.dur[i]));
      }
      // banking waves: a dark crest (birds roll, wings broadside) between lighter flanks (wings edge-on),
      // and the crest is a compression: birds drawn toward it
      let band = 0, lite = 0, pull = 0, pc = 0, ps = 0;
      for (let q = 0; q < waves.length; q++) {
        const w = waves[q];
        const e = ((x - w.ox) * w.c + (y - w.oy) * w.s - w.front) * w.inv;
        if (e > -3.5 && e < 3.5) {
          const g = Math.exp(-e * e) * w.env;
          band += g;
          const ae = Math.abs(e) - 1.7;
          lite += Math.exp(-ae * ae * 2.0) * w.env * 0.5;
          pull += e * g / w.inv;
          pc = w.c; ps = w.s;
        }
      }
      if (band > 1) band = 1;
      if (lite > 1) lite = 1;
      // heading: own velocity plus the flock's drift, banked by the wave
      let dx = vx + HX * headW, dy = vy + HY * headW;
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      const bank = B.headJ[i] * 0.45 + band * 0.9 * B.bankS[i];
      const cb = Math.cos(bank), sb = Math.sin(bank);
      // wings: flapping with glide spells
      const flap = Math.cos((TAU * B.flapC[i] * T) / BAR + B.flapPh[i]);
      const gl = sstep(0.35, 0.8, Math.sin((TAU * B.glideM[i] * T) / BAR + B.glidePh[i]));
      let span = lerp(0.5 + 0.5 * flap, 0.96, gl);
      span = Math.min(1.3, span * (1 + 0.5 * band) * (1 - 0.3 * lite));
      const depthK = 1 + 0.55 * z;
      const L = baseL * sz * B.sizeJ[i] * depthK * (1 + 0.18 * band) * (1 - 0.08 * lite);
      const speed = Math.hypot(vx, vy) / FPS;
      const haze = clamp((0.06 + 0.34 * (1 - z) * 0.5) * (1 - 0.55 * band) + 0.12 * lite, 0.0, 0.6);
      const pk = 0.04 * (waves.length ? 1 : 0);
      Pp[i * 3] = x - pc * pull * pk; Pp[i * 3 + 1] = y - ps * pull * pk; Pp[i * 3 + 2] = 0;
      A[i * 4] = dx * cb - dy * sb; A[i * 4 + 1] = dx * sb + dy * cb; A[i * 4 + 2] = flap * (1 - gl); A[i * 4 + 3] = 0;
      Bb[i * 4] = L; Bb[i * 4 + 1] = span; Bb[i * 4 + 2] = haze; Bb[i * 4 + 3] = Math.min(13, speed * 0.55);
    }
    G.aP.needsUpdate = true;
    G.aA.needsUpdate = true;
    G.aB.needsUpdate = true;
    if (!skip.gl) G.renderer.render(G.scene, G.cam);
    if (!skip.blit) ctx.drawImage(G.canvas, 0, 0, W, H);
    // 4 the city in front
    ctx.drawImage(cityPlate(), 0, 0, W, H);
    // beacons blink on the beat
    const beat = Math.floor(T / BEAT + 1e-6);
    const inBeat = T / BEAT - beat;
    for (const [bx, by, kk] of BEACONS) {
      const on = (beat + kk) % 2 === 0 ? 1 - sstep(0.0, 0.55, inBeat) : 0.1;
      ctx.fillStyle = pal.beacon;
      ctx.globalAlpha = 0.3 + 0.7 * on;
      ctx.beginPath();
      ctx.arc(bx, by, 2.2 + 1.8 * on, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 4b a few starlings close to the camera, crossing in front of everything (2D silhouettes, motion-smeared)
    for (const nb of S.near || []) {
      if (T < nb.t0 || T > nb.t1) continue;
      for (let k = nb.smear || 3; k >= 0; k--) {
        const tt = T - k * (0.25 / FPS);
        if (tt < nb.t0) continue;
        const u = (tt - nb.t0) / (nb.t1 - nb.t0);
        const iu = 1 - u;
        const x = iu * iu * nb.P[0][0] + 2 * iu * u * nb.P[1][0] + u * u * nb.P[2][0];
        const y = iu * iu * nb.P[0][1] + 2 * iu * u * nb.P[1][1] + u * u * nb.P[2][1];
        let dx = 2 * iu * (nb.P[1][0] - nb.P[0][0]) + 2 * u * (nb.P[2][0] - nb.P[1][0]);
        let dy = 2 * iu * (nb.P[1][1] - nb.P[0][1]) + 2 * u * (nb.P[2][1] - nb.P[1][1]);
        const dl = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= dl; dy /= dl;
        const flap = Math.cos(TAU * nb.fl * tt + (nb.ph || 0));
        nearBird(ctx, x, y, dx, dy, nb.L, 0.45 + 0.55 * flap, k ? 0.16 : 1, pal.birdInk);
      }
    }
    // 5 vignette and grain
    ctx.drawImage(vignettePlate(), 0, 0, W, H);
    const fr = Math.round(T * FPS);
    const gk = S.loopStart != null && T >= S.loopStart ? Math.round((T - S.loopStart) * FPS) % Math.round(BAR * FPS) : fr;
    const tile = grainTiles()[h32(gk, 7, 1) % 4];
    const pat = ctx.createPattern(tile, 'repeat');
    ctx.save();
    ctx.translate(-(h32(gk, 8, 2) % 256), -(h32(gk, 9, 3) % 256));
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.restore();
  };

  // ---------------------------------------------------------------------------------------------
  // THE FILM SCRIPT — «Мурмурация», 90 bpm, 8 bars (21.333 s); every call on the beat grid
  // ---------------------------------------------------------------------------------------------
  const b = (n) => n * BEAT; // beat n -> seconds
  const ALPHA = Math.atan2(345 - 520, 1175 - 847); // line of centres, big gear -> small gear
  const GD = 235 + (235 * 7) / 12 + 18; // centre distance with backlash, so the teeth stay apart
  const G2X = 847 + GD * Math.cos(ALPHA), G2Y = 520 + GD * Math.sin(ALPHA);
  const Z1 = 12, Z2 = 7;
  const GEAR_W = 0.85; // rad/s, the big gear
  const PLANE_T0 = b(19);
  function planeAt(t, out) {
    // forms on the left, then flies a long arc right across the sky, shrinking as it sheds birds
    const t1 = b(20) - 0.3, t2 = b(24) + 0.2;
    const u = easeIO((t - t1) / (t2 - t1));
    const P0 = [600, 410], P1 = [1060, 150], P2 = [1530, 300];
    const iu = 1 - u;
    out.x = iu * iu * P0[0] + 2 * iu * u * P1[0] + u * u * P2[0];
    out.y = iu * iu * P0[1] + 2 * iu * u * P1[1] + u * u * P2[1];
    const tx = 2 * iu * (P1[0] - P0[0]) + 2 * u * (P2[0] - P1[0]);
    const ty = 2 * iu * (P1[1] - P0[1]) + 2 * u * (P2[1] - P1[1]);
    const moving = sstep(t1 - 0.2, t1 + 0.5, t);
    const ang = Math.atan2(ty, tx) * 0.55 * moving - 0.14 * (1 - moving) + 0.05 * Math.sin(2.4 * t);
    out.c = Math.cos(ang);
    out.s = Math.sin(ang);
    out.sc = 1 - 0.18 * u;
    out.sy = 1 - 0.22 * (0.5 + 0.5 * Math.sin(1.9 * t + 0.4));
    if (t > t2) { out.x += (t - t2) * 260; out.y -= (t - t2) * 30; }
  }
  // card layout, measured once
  let CARD = null;
  function cardLayout() {
    if (CARD) return CARD;
    const fUrl = 102, gap = 110, icon = 150, iconGap = 26;
    const w1 = measure('aixenix.com', fUrl, { spacing: 3 });
    const w2 = measure('t.me/aixenix', fUrl, { spacing: 3 });
    const tot = w1 + gap + icon + iconGap + w2;
    const x0 = 960 - tot / 2;
    CARD = { fUrl, x1: x0 + w1 / 2, ix: x0 + w1 + gap + icon / 2, x2: x0 + w1 + gap + icon + iconGap + w2 / 2, base: 656, iy: 622 };
    return CARD;
  }
  const lr = (x0, x1, S) => (qx) => ((qx - x0) / (x1 - x0)) * S;

  FL.SCRIPT = {
    key: 'film',
    N: 30000,
    duration: b(32),
    loopStart: b(28),
    freeFrac: 0.03,
    birdLen: 4.2,
    headWeight: 380,
    heading: (T) => -0.3 + 0.22 * Math.sin((TAU * T) / BAR),
    formations: [
      // 0 the murmuration, already alive when the film opens
      { id: 'swirl', t0: -2, kind: 'swirl', swirl: { cx: 960, cy: 400 }, size: 1 },
      // 1 hook: «30 000 ПТИЦ / НИ ОДНОГО ПИЛОТА»
      {
        id: 'hook', t0: b(2), groups: [{ cx: 0, cy: 0 }], size: 0.7, zOff: 0.2,
        build: (n) => sampleClasses(W, H, [
          { paint: textPainter('30 000 ПТИЦ', 960, 432, 214, { spacing: 8 }), spine: 0.5, edgeSize: 0.3 },
          { paint: textPainter('НИ ОДНОГО ПИЛОТА', 960, 640, 134, { spacing: 6 }), spine: 0.45, edgeSize: 0.3, density: 1.15, size: 0.9 },
        ], n, 1101),
        halo: [[170, 150, 90], [1750, 160, 90]],
        stagger: lr(150, 1770, 0.5), bulge: 0.14, ripple: 3, swing: 0.35, pivot: [960, 480],
      },
      // 2 two meshing gears, turning
      {
        id: 'gears', t0: b(7), size: 0.82, zOff: 0.1,
        groups: [{ cx: 847, cy: 520 }, { cx: G2X, cy: G2Y }],
        build: (n) => sampleClasses(W, H, [
          { paint: (g) => gearPath(g, 847, 520, 235, Z1, 31, 28, 58, 5, 36, 142), group: 0, spine: 0.35 },
          { paint: (g) => gearPath(g, G2X, G2Y, (235 * Z2) / Z1, Z2, 31, 28, 34, 3, 17, 74), group: 1, spine: 0.35, density: 1.1 },
        ], n, 2202),
        xf: (t, g, o) => {
          const th1 = GEAR_W * (t - b(7));
          const th = g === 0 ? th1 : ALPHA + Math.PI + Math.PI / Z2 - (Z1 / Z2) * (th1 - ALPHA);
          o.c = Math.cos(th);
          o.s = Math.sin(th);
        },
        halo: [[240, 260, 90], [1640, 690, 95]],
        stagger: (qx, qy) => {
          const big = Math.hypot(qx - 847, qy - 520) < 300;
          const a = big ? Math.atan2(qy - 520, qx - 847) : Math.atan2(qy - G2Y, qx - G2X);
          return 0.45 * ((a + Math.PI) / TAU) + (big ? 0 : 0.15);
        },
        bulge: 0.16, ripple: 2, swing: 0.9, pivot: [980, 470],
      },
      // 3 the growth arrow, drawn left to right by the flock
      {
        id: 'chart', t0: b(11), groups: [{ cx: 0, cy: 0 }], size: 0.74, zOff: 0.15,
        build: (n) => sampleClasses(W, H, [
          {
            paint: (g) => {
              const pts = [[300, 772], [600, 600], [842, 690], [1172, 440], [1452, 288]];
              g.lineWidth = 64;
              g.lineJoin = 'round';
              g.lineCap = 'round';
              g.beginPath();
              pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
              g.stroke();
              const e = pts[pts.length - 1], d = pts[pts.length - 2];
              const a = Math.atan2(e[1] - d[1], e[0] - d[0]);
              const ca = Math.cos(a), sa = Math.sin(a);
              const tip = [e[0] + ca * 170, e[1] + sa * 170];
              const bl = [e[0] - ca * 10 - sa * 112, e[1] - sa * 10 + ca * 112];
              const br = [e[0] - ca * 10 + sa * 112, e[1] - sa * 10 - ca * 112];
              g.beginPath();
              g.moveTo(tip[0], tip[1]); g.lineTo(bl[0], bl[1]); g.lineTo(br[0], br[1]); g.closePath();
              g.fill();
            },
            spine: 0.4,
          },
        ], n, 3303),
        halo: [[300, 250, 90], [1560, 700, 95]],
        stagger: lr(260, 1640, 0.6), bulge: -0.12, ripple: 3, swing: -0.4, pivot: [900, 520],
      },
      // 4 the promise: «БИЗНЕС НА / АВТОПИЛОТЕ»
      {
        id: 'auto', t0: b(14), groups: [{ cx: 0, cy: 0 }], size: 0.68, zOff: 0.2,
        build: (n) => sampleClasses(W, H, [
          { paint: textPainter('БИЗНЕС НА', 960, 430, 222, { spacing: 8 }), spine: 0.5, edgeSize: 0.3 },
          { paint: textPainter('АВТОПИЛОТЕ', 960, 692, 222, { spacing: 8 }), spine: 0.5, edgeSize: 0.3 },
        ], n, 4404),
        halo: [[170, 140, 90], [1750, 150, 90]],
        stagger: lr(100, 1820, 0.45), bulge: 0.1, ripple: 3, swing: -0.4, pivot: [960, 430],
      },
      // 5 the paper plane: the words fold into it and it flies
      {
        id: 'plane', t0: PLANE_T0, groups: [{ cx: 960, cy: 540 }], size: 0.8, zOff: 0.25,
        build: (n) => sampleClasses(W, H, [
          { paint: planeFace(1, 960, 540, 1.22, 0, 9), spine: 0.2, size: 0.66, z: 0.15, mottle: 0.5 },
          { paint: planeFace(2, 960, 540, 1.22, 0, 9), spine: 0.25, density: 4.5, size: 1.0, z: 0.35, mottle: 0.35 },
          { paint: planeOutline(960, 540, 1.22, 0, 56), density: 0.22, size: 0.62, z: 0.0, zSpread: 0.6 },
        ], n, 5505),
        xf: (t, g, o) => planeAt(t, o), ripple: 7, swing: 0.45, pivot: [760, 420],
        halo: [[260, 690, 90], [1690, 700, 85]],
        stagger: (qx) => (1 - (qx - 250) / 800) * 0.35, bulge: 0.18,
        dur: [0.45, 1 / 1500, 0.5, 1.2],
      },
      // 6 the card: the plane writes it as it flies, its last birds become the little plane
      {
        id: 'card', t0: b(22), groups: [{ cx: 0, cy: 0 }], size: 0.8, zOff: 0.2,
        build: (n) => {
          const L = cardLayout();
          return sampleClasses(W, H, [
            { paint: textPainter('AiXenix', 960, 392, 250, { spacing: 6 }), spine: 0.5, edgeSize: 0.3 },
            { paint: textPainter('БИЗНЕС НА АВТОПИЛОТЕ', 960, 504, 78, { spacing: 4 }), spine: 0.3, density: 1.5, size: 0.7, z: 0.2 },
            { paint: textPainter('aixenix.com', L.x1, L.base, L.fUrl, { spacing: 4 }), spine: 0.3, density: 1.8, size: 0.62, z: 0.35, zSpread: 0.1 },
            { paint: textPainter('t.me/aixenix', L.x2, L.base, L.fUrl, { spacing: 4 }), spine: 0.3, density: 1.8, size: 0.62, z: 0.35, zSpread: 0.1 },
            { paint: planeFace(1, L.ix, L.iy, 0.235, -0.1, 0), density: 1.3, size: 0.6, z: 0.3 },
            { paint: planeFace(2, L.ix, L.iy, 0.235, -0.1, 4), density: 3.2, size: 0.66, z: 0.35 },
          ], n, 6606);
        },
        halo: [[150, 92, 70], [1770, 98, 70]],
        stagger: lr(160, 1760, 1.25), jitter: 0.12, bulge: 0.08, orbit: 0.4, ripple: 1.6,
      },
    ],
    near: [
      { t0: 0.12, t1: 1.3, P: [[2060, 780], [1520, 540], [1080, -140]], L: 50, fl: 6.6, ph: 0.4 },
      { t0: 0.3, t1: 1.45, P: [[2060, 900], [1640, 660], [1330, -120]], L: 36, fl: 7.3, ph: 2.1 },
      { t0: 0.62, t1: 1.95, P: [[-140, 930], [420, 720], [840, -120]], L: 30, fl: 7.9, ph: 1.2 },
      { t0: 13.42, t1: 14.5, P: [[-140, 800], [560, 640], [1060, -140]], L: 42, fl: 7.0, ph: 0.7 },
      { t0: 13.62, t1: 14.6, P: [[-140, 880], [480, 760], [880, -120]], L: 30, fl: 7.7, ph: 2.6 },
    ],
    waves: [
      // wide, soft banking waves (200-240 px), 750-900 px/s, each spanning several letters
      { t: 0.0, x: 300, y: 40, ang: 0.62, speed: 850, width: 200, life: 1.8, lead: -150 },
      { t: b(4), x: -40, y: 520, ang: 0.22, speed: 820, width: 230, life: 2.4, lead: -120 },
      { t: b(6), x: 1960, y: 470, ang: Math.PI - 0.22, speed: 820, width: 230, life: 2.0, lead: -120 },
      { t: b(9), x: 520, y: 60, ang: 0.9, speed: 750, width: 220, life: 1.6, lead: -100 },
      { t: b(12), x: 220, y: 860, ang: -0.55, speed: 900, width: 200, life: 1.9, lead: -100 },
      { t: b(16), x: -40, y: 560, ang: 0.2, speed: 820, width: 240, life: 2.5, lead: -120 },
      { t: b(18), x: 1960, y: 420, ang: Math.PI - 0.3, speed: 820, width: 230, life: 2.0, lead: -120 },
      { t: b(20), x: 300, y: 560, ang: -0.4, speed: 900, width: 200, life: 1.6, lead: -100 },
      { t: b(26), x: 60, y: 500, ang: 0.16, speed: 1350, width: 230, life: 1.3, lead: -150 },
      // the loop bar: one slow wave, finished inside the bar so the wrap is seamless
      { t: b(28), x: -60, y: 480, ang: 0.14, speed: 790, width: 240, life: 2.6, lead: -160 },
    ],
  };
})();
