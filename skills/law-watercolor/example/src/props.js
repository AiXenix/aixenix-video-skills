/*
 * props.js : the WATERCOLOUR ENGINE of «Акварель по-мокрому» (AiXenix demo 06).
 *
 * Material: wet-on-wet transparent watercolour on cold-pressed paper, seen straight down.
 * Every pixel is computed here from (painting, T); nothing is carried between frames.
 *
 * How it works — a painting is a stack of LAYERS (glazes); a layer is a set of REGIONS (washes).
 *   1. Build (once per page, t-independent, cached by key):
 *        - the paper: cold-press height field (cells + tooth) -> raking-light shading, valley map
 *          (where granulating pigment settles), a flattened "wet" luminance, warm white base;
 *        - each region's water mask is rasterised (shape fn -> scratch canvas -> warped alpha);
 *        - an ARRIVAL-TIME field per layer: a 16-neighbour Dijkstra on a half-res grid from timed
 *          pigment drops (sources), with a log-normal noisy speed + paper fibres, so fronts finger
 *          and feather like pigment running into wet paper; flow stops at the region's tFlow;
 *        - pigment absorbance (Beer-Lambert, per channel) per cell, blurred where fronts meet so
 *          neighbouring colours mix wet-in-wet; upsampled to full res with paper-tooth jitter;
 *        - static per-pixel factors: edge distance (drying rim / water bead), source proximity
 *          (dense pigment where the drop landed), flocculation, soft feather where flow stopped;
 *        - optional BACKRUN fields (a second, scalloped front of clean water pushing pigment out:
 *          pale cauliflower with a dark frilly line) and SALT starbursts (spiky pale stars).
 *   2. Frame (pure function of T): per region scalars (wetness, dryness, concentration), then per
 *      active pixel: density = front ramp x conc x statics x rim x granulation x backrun x salt;
 *      absorbances add across layers (subtractive mixing: yellow + blue = green, glazes darken);
 *      colour = paper x shading x exp(-A) + wet sheen. Wet areas: darker, flatter, glossy, with
 *      a dark bead at their edge; dry areas: lighter, hard dark rims, granulation in the tooth.
 *
 * API (FILM.wc):
 *   build(key, def)            -> painting (cached; def = { seed, layers:[{ name, rimW, regions:[...] }] })
 *   render(ctx, painting, T, o) draws the frame at logical 1920x1080 (o.sheen: { phase, amp })
 *   abs(rgb | hex)              -> [ar, ag, ab] absorbance of a masstone over the paper
 *   PIG                         named pigment absorbances
 *   noise / hash helpers        vnoise, fbm, hh
 *
 * Region spec (times in film seconds, lengths in logical px):
 *   shape(g)    draws the water mask (fill/stroke, any colour) in logical coords
 *   bbox        [x0, y0, x1, y1] of the mask
 *   drops       [[x, y, t, r?], ...] pigment drops (r = drop radius, default 5)
 *   pig         pigment name | [ar,ag,ab] | fn(x, y, T) -> [ar,ag,ab]
 *   v           front speed in the mask (px/s)          sigma  speed noise (feathering), default 1
 *   bleed       speed fraction outside the mask (0 = hard edge)
 *   tFlow       nothing moves after this                tau    softness of the advancing front (s)
 *   conc        density                                  burst  extra density right after the drop
 *   srcBoost    extra density near the drop              srcFall its reach in seconds of travel
 *   wet         [tWet, tDry0, tDry1] pre-wet glisten start, drying start, dry
 *   rim, gran, floc    drying rim strength, granulation, flocculation mottling
 *   merge       fronts may cross into other merge regions of the layer
 *   backruns    [{ x, y, t, v, stop, sigma }]           salt { t, dur, grains: [[x, y, r], ...] }
 *   featherStop seconds of soft fade where flow stopped inside wet paper
 *
 * Determinism: no Math.random / Date / performance; noise is hashed; the build is a pure function of
 * the def; the one output canvas and its ImageData are fully overwritten every frame.
 */
(function () {
  'use strict';

  const FILM = window.FILM;
  const W = 1920, H = 1080, N = W * H;
  const GW = 960, GH = 540, GN = GW * GH;
  const INF = 1e9;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sstep = (a, b, x) => {
    const u = clamp((x - a) / (b - a), 0, 1);
    return u * u * (3 - 2 * u);
  };

  // ---------------------------------------------------------------------------
  // hashing + noise (local, fast)
  // ---------------------------------------------------------------------------
  function hh(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hh(ix, iy, s), b = hh(ix + 1, iy, s), c = hh(ix, iy + 1, s), d = hh(ix + 1, iy + 1, s);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  }
  function fbm(x, y, s, oct) {
    let sum = 0, amp = 0.5, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise(x * f, y * f, s + o * 1013);
      norm += amp;
      amp *= 0.5;
      f *= 2.07;
    }
    return sum / norm;
  }
  const seedOf = (k) => (FILM.lib && FILM.lib.hash ? FILM.lib.hash('wc', k) : 12345) & 0x7fffffff;

  // ---------------------------------------------------------------------------
  // pigments: masstone colour over the paper -> Beer-Lambert absorbance per channel
  // ---------------------------------------------------------------------------
  const PAPER_RGB = [248, 243, 233];
  function parseHex(h) {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }
  function abs(c) {
    const rgb = typeof c === 'string' ? parseHex(c) : c;
    return [0, 1, 2].map((k) => Math.max(0.015, -Math.log(Math.max(4, rgb[k]) / PAPER_RGB[k])));
  }
  const PIG = {
    violet: abs([92, 52, 150]), // dioxazine violet: the method
    indigo: abs([48, 56, 104]),
    ultramarine: abs([56, 78, 178]),
    cerulean: abs([62, 148, 204]),
    teal: abs([22, 158, 150]),
    sap: abs([96, 146, 52]),
    hooker: abs([40, 104, 66]),
    yellow: abs([246, 198, 36]),
    gold: abs([228, 150, 34]),
    orange: abs([240, 104, 38]),
    scarlet: abs([222, 54, 52]),
    rose: abs([216, 48, 112]),
    opera: abs([242, 52, 176]),
    lilac: abs([170, 120, 210]),
    sienna: abs([168, 82, 42]),
    magenta: abs([246, 43, 214]), // brand #ff2bd6 as a pigment
    cyan: abs([16, 214, 236]), // brand #00f0ff
    bviolet: abs([176, 18, 246]), // brand #bf00ff
  };
  const mixAbs = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // ---------------------------------------------------------------------------
  // paper (cold press)
  // ---------------------------------------------------------------------------
  let PAPER = null;
  function paper() {
    if (PAPER) return PAPER;
    const s0 = 7177;
    const hgt = new Float32Array(N);
    const CELL = 9;
    for (let y = 0; y < H; y++) {
      const cy = Math.floor(y / CELL);
      for (let x = 0; x < W; x++) {
        const cx = Math.floor(x / CELL);
        let d1 = 1e9, d2 = 1e9;
        for (let j = -1; j <= 1; j++) {
          for (let i = -1; i <= 1; i++) {
            const gx = cx + i, gy = cy + j;
            const px = (gx + 0.15 + 0.7 * hh(gx, gy, s0)) * CELL;
            const py = (gy + 0.15 + 0.7 * hh(gx, gy, s0 + 1)) * CELL;
            const dx = px - x, dy = py - y;
            const d = dx * dx + dy * dy;
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
          }
        }
        const f1 = Math.sqrt(d1) / CELL, f2 = Math.sqrt(d2) / CELL;
        const dome = 1 - clamp(f1 * 1.15, 0, 1);
        const ridge = clamp((f2 - f1) * 2.2, 0, 1);
        const tooth = vnoise(x / 2.4, y / 2.4, s0 + 9) * 0.5 + 0.5;
        const grain = vnoise(x / 5.3, y / 5.3, s0 + 7) * 0.5 + 0.5;
        const swell = vnoise(x / 15, y / 15, s0 + 5) * 0.5 + 0.5;
        hgt[y * W + x] = 0.12 * dome * dome + 0.04 * ridge + 0.26 * tooth + 0.36 * grain + 0.22 * swell;
      }
    }
    // smooth the height a touch, then shade with a raking light from the top left, normalised to a
    // small fixed contrast: cold press reads as a soft tooth, not an emboss
    const hs = new Float32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i;
        const yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
        hs[i] = (hgt[i] * 4 + hgt[xl] + hgt[xr] + hgt[yu] + hgt[yd]) / 8;
      }
    }
    const slope = new Float32Array(N);
    let s2 = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const hx = hs[i + (x < W - 1 ? 1 : 0)] - hs[i - (x > 0 ? 1 : 0)];
        const hy = hs[i + (y < H - 1 ? W : 0)] - hs[i - (y > 0 ? W : 0)];
        const v = 0.62 * hx + 0.78 * hy;
        slope[i] = v;
        s2 += v * v;
      }
    }
    const sd = Math.sqrt(s2 / N) || 1;
    let m1 = 0, v1 = 0;
    for (let i = 0; i < N; i++) m1 += hs[i];
    m1 /= N;
    for (let i = 0; i < N; i++) v1 += (hs[i] - m1) * (hs[i] - m1);
    const hsd = Math.sqrt(v1 / N) || 1;
    const PD = new Float32Array(N); // dry luminance (with shading)
    const PF = new Float32Array(N); // flattened luminance (water fills the tooth)
    const PG = new Float32Array(N); // valley map -1..1 (granulation)
    const P32 = new Uint32Array(N);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const shade = 1 + 0.013 * clamp(slope[i] / sd, -3, 3);
        const nx = x / W - 0.5, ny = y / H - 0.47;
        const mott = 1 + 0.012 * fbm(x / 230, y / 230, s0 + 21, 3);
        const vig = 1 - 0.07 * (nx * nx * 1.1 + ny * ny * 1.6);
        const base = mott * vig;
        PD[i] = base * shade;
        PF[i] = base * (1 + (shade - 1) * 0.3);
        const speck = hh(x >> 1, y >> 1, s0 + 33);
        PG[i] = clamp(((m1 - hs[i]) / hsd) * 0.42 + (speck - 0.5) * 0.18 + 0.25 * vnoise(x / 4.5, y / 4.5, s0 + 41), -1, 1);
        const r = clamp(PAPER_RGB[0] * PD[i], 0, 255) | 0;
        const g = clamp(PAPER_RGB[1] * PD[i], 0, 255) | 0;
        const b = clamp(PAPER_RGB[2] * PD[i], 0, 255) | 0;
        P32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }
    PAPER = { hgt, PD, PF, PG, P32 };
    return PAPER;
  }

  // ---------------------------------------------------------------------------
  // binary heap (typed, deterministic tie order)
  // ---------------------------------------------------------------------------
  function Heap(cap) {
    this.k = new Float64Array(cap);
    this.v = new Int32Array(cap);
    this.n = 0;
  }
  Heap.prototype.push = function (key, val) {
    if (this.n >= this.k.length) {
      const k2 = new Float64Array(this.k.length * 2); k2.set(this.k); this.k = k2;
      const v2 = new Int32Array(this.v.length * 2); v2.set(this.v); this.v = v2;
    }
    const K = this.k, V = this.v;
    let i = this.n++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = key; V[i] = val;
  };
  Heap.prototype.pop = function () {
    const K = this.k, V = this.v;
    const topK = K[0], topV = V[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= key) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = key; V[i] = val;
    }
    this.topK = topK;
    return topV;
  };

  // 16-neighbour stencil (cells), lengths in logical px (a cell is 2 px)
  const NB = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    NB.push([dx, dy, 2 * Math.hypot(dx, dy)]);
  }

  // ---------------------------------------------------------------------------
  // build one layer
  // ---------------------------------------------------------------------------
  let SCR = null;
  function scratch() {
    if (!SCR) {
      const c = FILM.makeCanvas(16, 16);
      SCR = { c, g: c.getContext('2d', { willReadFrequently: true }) };
    }
    return SCR;
  }

  function rasterMasks(regs, maskF, maskA, seed) {
    const S = scratch();
    for (let ri = 0; ri < regs.length; ri++) {
      const R = regs[ri];
      if (!R.shape) continue;
      const amp = R.warp != null ? R.warp : 2.2;
      const pad = Math.ceil(amp) + 2;
      const x0 = clamp(Math.floor(R.bbox[0]) - pad, 0, W), y0 = clamp(Math.floor(R.bbox[1]) - pad, 0, H);
      const x1 = clamp(Math.ceil(R.bbox[2]) + pad, 0, W), y1 = clamp(Math.ceil(R.bbox[3]) + pad, 0, H);
      const bw = x1 - x0, bh = y1 - y0;
      if (bw <= 0 || bh <= 0) continue;
      S.c.width = bw;
      S.c.height = bh;
      const g = S.g;
      g.setTransform(1, 0, 0, 1, -x0, -y0);
      g.fillStyle = '#fff';
      g.strokeStyle = '#fff';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      R.shape(g);
      const a = g.getImageData(0, 0, bw, bh).data;
      const ws = seed + ri * 7919;
      const sc = R.warpScale || 11;
      const al = (px, py) => {
        // bilinear alpha at a fractional position inside the scratch
        const ix = Math.floor(px), iy = Math.floor(py);
        const u = px - ix, w = py - iy;
        const at = (qx, qy) => (qx < 0 || qy < 0 || qx >= bw || qy >= bh ? 0 : a[(qy * bw + qx) * 4 + 3]);
        return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - w) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * w;
      };
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          let sx = x - x0, sy = y - y0;
          if (amp > 0) {
            sx += amp * vnoise(x / sc, y / sc, ws);
            sy += amp * vnoise(x / sc, y / sc, ws + 1);
          }
          const v = al(sx, sy);
          if (v < 8) continue;
          const i = y * W + x;
          if (v >= 128 || maskA[i] < v) {
            maskF[i] = ri + 1;
            maskA[i] = v > 255 ? 255 : v;
          }
        }
      }
    }
  }

  function speedNoise(seed, fibres) {
    // log-speed noise in [-2, 2] quantised to Uint8: big soft lobes + small fingers + paper fibres
    const Q = new Uint8Array(GN);
    const Fn = new Float32Array(GN);
    for (let y = 0; y < GH; y++) {
      for (let x = 0; x < GW; x++) {
        const v = 0.55 * vnoise(x / 22, y / 22, seed) + 0.3 * vnoise(x / 8, y / 8, seed + 1) + 0.25 * vnoise(x / 3.2, y / 3.2, seed + 2);
        Fn[y * GW + x] = v * 1.25;
      }
    }
    // fibres: short slightly curved lines where water races along the paper's fibres
    const nf = fibres != null ? fibres : 5200;
    for (let f = 0; f < nf; f++) {
      let x = hh(f, 1, seed + 3) * GW, y = hh(f, 2, seed + 3) * GH;
      let a = hh(f, 3, seed + 3) * Math.PI * 2;
      const len = 5 + hh(f, 4, seed + 3) * 16;
      const bend = (hh(f, 5, seed + 3) - 0.5) * 0.12;
      for (let s = 0; s < len; s++) {
        const ix = x | 0, iy = y | 0;
        if (ix >= 0 && iy >= 0 && ix < GW && iy < GH) Fn[iy * GW + ix] += 0.75;
        x += Math.cos(a); y += Math.sin(a); a += bend;
      }
    }
    for (let i = 0; i < GN; i++) Q[i] = clamp(Math.round((Fn[i] + 2) * 63.75), 0, 255);
    return Q;
  }

  // multi-source arrival time on the half-res grid
  function arrival(opts) {
    const { Tg, labG, srcs, passable, regs } = opts;
    const MG = opts.maskG || null, BD = opts.bleedDur || null;
    const ET = MG ? new Float32Array(GN) : null; // when the front left the water mask (bleed budget)
    const heap = new Heap(1 << 18);
    for (const s of srcs) {
      const R = regs[s.L - 1];
      const rr = Math.max(1, s.r / 2);
      const cx = s.x / 2, cy = s.y / 2;
      for (let dy = -Math.ceil(rr); dy <= Math.ceil(rr); dy++) {
        for (let dx = -Math.ceil(rr); dx <= Math.ceil(rr); dx++) {
          const gx = Math.round(cx + dx), gy = Math.round(cy + dy);
          if (gx < 0 || gy < 0 || gx >= GW || gy >= GH) continue;
          const d = Math.hypot(gx - cx, gy - cy);
          if (d > rr) continue;
          const c = gy * GW + gx;
          const t = s.t + (d * 2) / (R.v * 3);
          if (t < Tg[c]) {
            Tg[c] = t;
            labG[c] = s.L;
            heap.push(Tg[c], c); // the stored (float32) value, so the stale check below is exact
          }
        }
      }
    }
    while (heap.n > 0) {
      const c = heap.pop();
      const k = heap.topK;
      if (k > Tg[c]) continue;
      const L = labG[c];
      const cx = c % GW, cy = (c - cx) / GW;
      for (let q = 0; q < 16; q++) {
        const nb = NB[q];
        const nx = cx + nb[0], ny = cy + nb[1];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        const sp = passable(L, n, k);
        if (sp <= 0) continue;
        const tn = k + nb[2] / sp;
        // the water decides: a front entering another merge region's water becomes that region
        const m2 = MG !== null ? MG[n] : 0;
        const L2 = m2 !== 0 && m2 !== L && opts.mg && opts.mg[L] && opts.mg[m2] ? m2 : L;
        if (tn < Tg[n] && tn <= opts.tMax[L2]) {
          let et = 0;
          if (MG !== null && MG[n] === 0) {
            et = MG[c] !== 0 ? k : ET[c];
            if (tn > et + BD[L]) continue;
          }
          Tg[n] = tn;
          labG[n] = L2;
          if (ET !== null) ET[n] = et;
          heap.push(Tg[n], n);
        }
      }
    }
  }

  function boxBlurNorm(vals, valid, r, chans) {
    // normalised separable box blur (twice), only valid cells contribute
    const tmp = new Float32Array(GN);
    const wv = new Float32Array(GN);
    const wt = new Float32Array(GN);
    for (let i = 0; i < GN; i++) wv[i] = valid[i];
    const pass = (src, dst, horiz) => {
      const L1 = horiz ? GW : GH, L2 = horiz ? GH : GW;
      for (let b = 0; b < L2; b++) {
        let acc = 0;
        const idx = (a) => (horiz ? b * GW + a : a * GW + b);
        for (let a = -r; a <= r; a++) if (a >= 0 && a < L1) acc += src[idx(a)];
        for (let a = 0; a < L1; a++) {
          dst[idx(a)] = acc;
          const out = a - r, inn = a + r + 1;
          if (out >= 0) acc -= src[idx(out)];
          if (inn < L1) acc += src[idx(inn)];
        }
      }
    };
    // weights
    pass(wv, tmp, true); pass(tmp, wt, false); pass(wt, tmp, true); pass(tmp, wt, false);
    for (const ch of chans) {
      const v = new Float32Array(GN);
      for (let i = 0; i < GN; i++) v[i] = ch[i] * valid[i];
      const o = new Float32Array(GN);
      pass(v, tmp, true); pass(tmp, o, false); pass(o, tmp, true); pass(tmp, o, false);
      for (let i = 0; i < GN; i++) if (valid[i] > 0 && wt[i] > 1e-6) ch[i] = o[i] / wt[i];
    }
  }

  function chamferInside(maskF) {
    // distance (px) from each mask pixel to the nearest non-mask pixel
    const D = new Float32Array(N);
    for (let i = 0; i < N; i++) D[i] = maskF[i] ? 1e6 : 0;
    const A = 1, B = 1.4142;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let d = D[i];
        if (d === 0) continue;
        if (x > 0) d = Math.min(d, D[i - 1] + A); else d = Math.min(d, A);
        if (y > 0) {
          d = Math.min(d, D[i - W] + A);
          if (x > 0) d = Math.min(d, D[i - W - 1] + B);
          if (x < W - 1) d = Math.min(d, D[i - W + 1] + B);
        } else d = Math.min(d, A);
        D[i] = d;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        let d = D[i];
        if (d === 0) continue;
        if (x < W - 1) d = Math.min(d, D[i + 1] + A);
        if (y < H - 1) {
          d = Math.min(d, D[i + W] + A);
          if (x < W - 1) d = Math.min(d, D[i + W + 1] + B);
          if (x > 0) d = Math.min(d, D[i + W - 1] + B);
        }
        D[i] = d;
      }
    }
    return D;
  }

  function regionDefaults(R) {
    const t0 = R.drops && R.drops.length ? Math.min(...R.drops.map((s) => s[2])) : 0;
    const o = Object.assign(
      {
        v: 160, sigma: 1, bleed: 0, tau: 0.22, conc: 1, burst: 0.45, srcBoost: 0.5, srcFall: 0.5,
        rim: 1.2, gran: 0.18, floc: 0.06, pool: 0.26, merge: false, stopRim: 0, bead: 0, shimmer: 0, srcKeep: 0.45, saltLift: 0.75, preWet: 99, gloss: 0, dryFade: 0, featherStop: 0.3, warp: 2.2,
      },
      R
    );
    o.t0 = t0;
    if (o.tFlow == null) o.tFlow = t0 + 1.6;
    if (!o.wet) o.wet = [t0 - 0.3, o.tFlow, o.tFlow + 1.4];
    return o;
  }

  function buildLayer(lay, li, seed) {
    const P = paper();
    const regs = lay.regions.map(regionDefaults);
    const nR = regs.length;
    const ls = seed + li * 104729;
    // 1 masks
    const maskF = new Uint16Array(N);
    const maskA = new Uint8Array(N);
    rasterMasks(regs, maskF, maskA, ls);
    const maskG = new Uint16Array(GN);
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i1 = (gy * 2) * W + gx * 2, i2 = i1 + W + 1;
        maskG[gy * GW + gx] = maskA[i1] >= 128 ? maskF[i1] : maskA[i2] >= 128 ? maskF[i2] : 0;
      }
    }
    // drops marked snap land on the nearest wet cell of their own mask (a drop aimed at a glyph's hole)
    regs.forEach((R, ri) => {
      if (!R.snap || !R.drops) return;
      const L = ri + 1;
      R.drops = R.drops.map((d) => {
        const gx = Math.round(d[0] / 2), gy = Math.round(d[1] / 2);
        let best = null, bd = 1e9;
        for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) {
          const x = gx + dx, y = gy + dy;
          if (x < 0 || y < 0 || x >= GW || y >= GH || maskG[y * GW + x] !== L) continue;
          const dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = [x * 2 + 1, y * 2 + 1]; }
        }
        return best ? [best[0], best[1], d[2], d[3]] : d;
      });
    });
    // text and other many-piece masks: one timed drop per connected piece (left to right sweep)
    const visit = new Int32Array(GN);
    regs.forEach((R, ri) => {
      if (!R.sweep) return;
      const L = ri + 1;
      const out = [];
      const stack = [];
      for (let c0 = 0; c0 < GN; c0++) {
        if (maskG[c0] !== L || visit[c0] === L) continue;
        let best = c0;
        stack.push(c0);
        visit[c0] = L;
        let count = 0;
        while (stack.length) {
          const c = stack.pop();
          count++;
          const cx = c % GW, cy = (c - cx) / GW;
          const bx = best % GW;
          if (cx < bx || (cx === bx && c < best)) best = c;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx, ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            const n = ny * GW + nx;
            if (maskG[n] === L && visit[n] !== L) { visit[n] = L; stack.push(n); }
          }
        }
        if (count < 6) continue;
        const bx = best % GW, by = (best - bx) / GW;
        out.push([bx * 2 + 3, by * 2 + 1, R.sweep.t0 + Math.max(0, bx * 2 - R.sweep.x0) / R.sweep.v, 4]);
      }
      R.drops = (R.drops || []).concat(out);
      R.t0 = Math.min(...R.drops.map((q) => q[2]));
    });
    // 2 speed field + arrival
    const FQ = speedNoise(ls + 11, lay.fibres);
    const v = new Float32Array(nR + 1), sigL = new Float32Array(nR + 1), bl = new Float32Array(nR + 1), mg = new Uint8Array(nR + 1), tMax = new Float32Array(nR + 1);
    const lutBy = new Map();
    const luts = [null];
    for (let r = 1; r <= nR; r++) {
      const R = regs[r - 1];
      v[r] = R.v; sigL[r] = R.sigma; bl[r] = R.bleed; mg[r] = R.merge ? 1 : 0; tMax[r] = R.tFlow;
      const key = R.sigma.toFixed(3);
      if (!lutBy.has(key)) {
        const lut = new Float32Array(256);
        const lutOut = new Float32Array(256);
        for (let q = 0; q < 256; q++) {
          const fn = q / 63.75 - 2;
          lut[q] = Math.exp(R.sigma * fn - 0.12 * R.sigma * R.sigma);
          lutOut[q] = Math.min(2.2, Math.exp(R.sigma * 1.7 * fn - 1.1 * R.sigma));
        }
        lutBy.set(key, [lut, lutOut]);
      }
      luts.push(lutBy.get(key));
    }
    // a bloom slows as its water spreads thin: speed x 1 / (1 + (t - t0) / decay)
    const dec = new Float32Array(nR + 1), t0L = new Float32Array(nR + 1);
    for (let r = 1; r <= nR; r++) { dec[r] = regs[r - 1].decay || 0; t0L[r] = regs[r - 1].t0; }
    const passable = (L, n, k) => {
      const m = maskG[n];
      const q = FQ[n];
      let f = 0;
      if (m === L) f = luts[L][0][q];
      else if (m === 0) f = bl[L] > 0 ? bl[L] * luts[L][1][q] : 0;
      else if (mg[L] && mg[m]) return v[m] * luts[m][0][q];
      if (f === 0) return 0;
      const d = dec[L];
      return d > 0 ? (v[L] * f) / (1 + Math.max(0, k - t0L[L]) / d) : v[L] * f;
    };
    const Tg = new Float32Array(GN).fill(INF);
    const labG = new Uint16Array(GN);
    const srcs = [];
    regs.forEach((R, ri) => (R.drops || []).forEach((s) => srcs.push({ x: s[0], y: s[1], t: s[2], r: s[3] || 5, L: ri + 1 })));
    srcs.sort((a, b) => a.t - b.t || a.L - b.L);
    const bDur = new Float32Array(nR + 1);
    for (let r = 1; r <= nR; r++) bDur[r] = regs[r - 1].bleedDur != null ? regs[r - 1].bleedDur : 0.6;
    arrival({ Tg, labG, srcs, passable, regs, tMax, maskG, bleedDur: bDur, mg });
    // 3 dilate (for interpolation), pigment absorbance per cell, blur where colours meet
    const Ti = new Float32Array(Tg), labI = new Uint16Array(labG);
    for (let it = 0; it < 2; it++) {
      const T2 = new Float32Array(Ti), L2 = new Uint16Array(labI);
      for (let gy = 0; gy < GH; gy++) {
        for (let gx = 0; gx < GW; gx++) {
          const c = gy * GW + gx;
          if (Ti[c] < INF) continue;
          let best = INF, bl2 = 0;
          if (gx > 0 && Ti[c - 1] < best) { best = Ti[c - 1]; bl2 = labI[c - 1]; }
          if (gx < GW - 1 && Ti[c + 1] < best) { best = Ti[c + 1]; bl2 = labI[c + 1]; }
          if (gy > 0 && Ti[c - GW] < best) { best = Ti[c - GW]; bl2 = labI[c - GW]; }
          if (gy < GH - 1 && Ti[c + GW] < best) { best = Ti[c + GW]; bl2 = labI[c + GW]; }
          if (best < INF) { T2[c] = best + 0.04; L2[c] = bl2; }
        }
      }
      Ti.set(T2); labI.set(L2);
    }
    const aR = new Float32Array(GN), aG = new Float32Array(GN), aB = new Float32Array(GN);
    const mixWarp = lay.mixWarp != null ? lay.mixWarp : 22;
    const valid = new Float32Array(GN);
    for (let c = 0; c < GN; c++) {
      const L = labI[c];
      if (!L || Ti[c] >= INF) continue;
      const gx = c % GW, gy = (c - gx) / GW;
      let R = regs[L - 1];
      if (R.merge) {
        // wet-in-wet: where two merge washes meet, their pigments finger into each other
        const qx = clamp(gx + Math.round(mixWarp * fbm(gx / 13, gy / 13, ls + 301, 3)), 0, GW - 1);
        const qy = clamp(gy + Math.round(mixWarp * fbm(gx / 13, gy / 13, ls + 302, 3)), 0, GH - 1);
        const cq = qy * GW + qx;
        const Lq = labI[cq];
        if (Lq && Lq !== L && Ti[cq] < INF && regs[Lq - 1].merge) R = regs[Lq - 1];
      }
      const p = typeof R.pig === 'function' ? R.pig(gx * 2 + 1, gy * 2 + 1, Ti[c]) : typeof R.pig === 'string' ? PIG[R.pig] : R.pig;
      aR[c] = p[0]; aG[c] = p[1]; aB[c] = p[2];
      valid[c] = regs[L - 1].merge ? 1 : 0;
    }
    boxBlurNorm(null, valid, lay.mixR != null ? lay.mixR : 6, [aR, aG, aB]);
    // 4 edge distance at full res (rim + bead)
    const core = new Uint8Array(N);
    for (let i = 0; i < N; i++) core[i] = maskF[i] && maskA[i] >= 128 ? 1 : 0;
    const Dedge = chamferInside(core);
    const rimW = lay.rimW || 4.2;
    // 5 full-res active pixels -> compact arrays
    const idxT = new Int32Array(N);
    const TvT = new Float32Array(N);
    const labT = new Uint16Array(N);
    const arT = new Uint8Array(N), agT = new Uint8Array(N), abT = new Uint8Array(N);
    const dsT = new Uint8Array(N), bsT = new Uint8Array(N), rmT = new Uint8Array(N), flT = new Uint8Array(N);
    const inv = new Int32Array(N).fill(-1);
    let n = 0;
    const flocS = ls + 77;
    const bil = (A, fx, fy) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = clamp(x0, 0, GW - 1), ay = clamp(y0, 0, GH - 1);
      const bx = clamp(x0 + 1, 0, GW - 1), by = clamp(y0 + 1, 0, GH - 1);
      const u = fx - x0, w = fy - y0;
      const a = A[ay * GW + ax], b = A[ay * GW + bx], c = A[by * GW + ax], d = A[by * GW + bx];
      return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
    };
    const bilT = (fx, fy) => {
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const ax = clamp(x0, 0, GW - 1), ay = clamp(y0, 0, GH - 1);
      const bx = clamp(x0 + 1, 0, GW - 1), by = clamp(y0 + 1, 0, GH - 1);
      const u = fx - x0, w = fy - y0;
      let a = Ti[ay * GW + ax], b = Ti[ay * GW + bx], c = Ti[by * GW + ax], d = Ti[by * GW + bx];
      let mx = -1;
      for (const z of [a, b, c, d]) if (z < INF && z > mx) mx = z;
      if (mx < 0) return INF;
      if (a >= INF) a = mx + 0.08;
      if (b >= INF) b = mx + 0.08;
      if (c >= INF) c = mx + 0.08;
      if (d >= INF) d = mx + 0.08;
      return (a * (1 - u) + b * u) * (1 - w) + (c * (1 - u) + d * u) * w;
    };
    const RCH = new Float32Array(GN);
    for (let c = 0; c < GN; c++) RCH[c] = Tg[c] < INF ? 1 : 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const m = maskF[i];
        const cN = (y >> 1) * GW + (x >> 1);
        const fx = (x + 0.5) / 2 - 0.5, fy = (y + 0.5) / 2 - 0.5;
        let reach = 1;
        if (!m) {
          // outside the water mask (a bleed): a smooth iso-line of the reached cells, never a 2 px stair
          reach = bil(RCH, fx, fy);
          if (reach < 0.3) continue;
        }
        let T = bilT(fx, fy);
        let L = T < INF ? labI[cN] || m : m;
        if (!L) continue;
        if (!m && T >= INF) continue;
        const R = regs[L - 1];
        let ds = 1, bs = 0;
        if (T < INF) {
          T += (P.hgt[i] - 0.5) * 0.05 * (140 / Math.max(40, R.v)); // tooth: the front breaks on the grain
          const pool = 1 + R.pool * (0.65 * fbm(x / 110, y / 110, flocS + L * 3, 2) + 0.35 * fbm(x / 44, y / 44, flocS + L * 3 + 7, 2)) * 1.8;
          const floc = 1 + R.floc * fbm(x / 7, y / 7, flocS + L, 2) * 1.6;
          const fs = sstep(0, R.featherStop, R.tFlow - T);
          ds = pool * floc * (0.12 + 0.88 * Math.pow(fs, 0.8));
          if (!m) ds *= 0.62 * sstep(0, 0.2, R.tFlow - T) * sstep(0.3, 0.75, reach);
          bs = Math.exp(-Math.max(0, T - R.t0) / R.srcFall);
        }
        if (m) ds *= maskA[i] / 255;
        let rim = m ? Math.exp(-Math.max(0, Dedge[i] - 0.5) / rimW) : 0;
        if (m && T < INF && R.stopRim > 0) rim = Math.max(rim, R.stopRim * Math.exp(-Math.max(0, R.tFlow - T) / 0.09));
        idxT[n] = i;
        TvT[n] = T;
        labT[n] = L;
        const q = 48;
        arT[n] = clamp(Math.round(bil(aR, fx, fy) * q), 0, 255);
        agT[n] = clamp(Math.round(bil(aG, fx, fy) * q), 0, 255);
        abT[n] = clamp(Math.round(bil(aB, fx, fy) * q), 0, 255);
        dsT[n] = clamp(Math.round(ds * 100), 0, 255);
        bsT[n] = clamp(Math.round(bs * 255), 0, 255);
        rmT[n] = clamp(Math.round(rim * 255), 0, 255);
        flT[n] = m ? 1 : 0;
        inv[i] = n;
        n++;
      }
    }
        const out = {
      name: lay.name,
      regs,
      n,
      idx: idxT.slice(0, n),
      Tv: TvT.slice(0, n),
      lab: labT.slice(0, n),
      ar: arT.slice(0, n), ag: agT.slice(0, n), ab: abT.slice(0, n),
      ds: dsT.slice(0, n), bs: bsT.slice(0, n), rm: rmT.slice(0, n), fl: flT.slice(0, n),
      TB: null, SD: null,
    };
    // 6 backruns: a second front of clean water inside a region's reached cells
    const bsrc = [];
    regs.forEach((R, ri) => (R.backruns || []).forEach((b) => bsrc.push({ x: b.x, y: b.y, t: b.t, r: b.r || 4, L: ri + 1, v: b.v || 90, stop: b.stop || b.t + 1, sigma: b.sigma || 1.7 })));
    if (bsrc.length) {
      const bregs = regs.map((R) => Object.assign({}, R));
      const bTmax = new Float32Array(nR + 1);
      const bv = new Float32Array(nR + 1);
      const bl2 = new Map();
      const bl3 = [null];
      for (let r = 1; r <= nR; r++) {
        const b = bsrc.find((s) => s.L === r);
        bTmax[r] = b ? b.stop : -1;
        bv[r] = b ? b.v : 1;
        bregs[r - 1].v = bv[r];
        const sg = b ? b.sigma : 1;
        const key = sg.toFixed(3);
        if (!bl2.has(key)) {
          const lut = new Float32Array(256);
          for (let q = 0; q < 256; q++) lut[q] = Math.exp(sg * (q / 63.75 - 2));
          bl2.set(key, lut);
        }
        bl3.push(bl2.get(key));
      }
      const FQ2 = speedNoise(ls + 503, 2600);
      const TbG = new Float32Array(GN).fill(INF);
      const lbG = new Uint16Array(GN);
      arrival({
        Tg: TbG, labG: lbG, srcs: bsrc.sort((a, b) => a.t - b.t), regs: bregs, tMax: bTmax,
        passable: (L, c) => (labG[c] === L && Tg[c] < INF ? bv[L] * bl3[L][FQ2[c]] : 0),
      });
      const TB = new Float32Array(n).fill(INF);
      const BR = new Float32Array(GN);
      for (let c = 0; c < GN; c++) BR[c] = TbG[c] < INF ? 1 : 0;
      for (let j = 0; j < n; j++) {
        const i = out.idx[j];
        const x = i % W, y = (i - x) / W;
        const c = (y >> 1) * GW + (x >> 1);
        const L = out.lab[j];
        if (lbG[c] !== L && !(c + 1 < GN && lbG[c + 1] === L) && !(c + GW < GN && lbG[c + GW] === L)) continue;
        const fx = (x + 0.5) / 2 - 0.5, fy = (y + 0.5) / 2 - 0.5;
        if (bil(BR, fx, fy) < 0.5) continue; // smooth contour of the backrun, not cell steps
        const x0 = clamp(Math.floor(fx), 0, GW - 1), y0 = clamp(Math.floor(fy), 0, GH - 1);
        const x1 = clamp(x0 + 1, 0, GW - 1), y1 = clamp(y0 + 1, 0, GH - 1);
        const u = fx - Math.floor(fx), w = fy - Math.floor(fy);
        let a = TbG[y0 * GW + x0], b = TbG[y0 * GW + x1], cc = TbG[y1 * GW + x0], d = TbG[y1 * GW + x1];
        let mx = -1;
        for (const z of [a, b, cc, d]) if (z < INF && z > mx) mx = z;
        if (mx < 0) continue;
        if (a >= INF) a = mx + 0.05;
        if (b >= INF) b = mx + 0.05;
        if (cc >= INF) cc = mx + 0.05;
        if (d >= INF) d = mx + 0.05;
        TB[j] = (a * (1 - u) + b * u) * (1 - w) + (cc * (1 - u) + d * u) * w + (P.hgt[i] - 0.5) * 0.03;
      }
      out.TB = TB;
      out.bStopArr = bTmax;
    }
    // 7 salt starbursts
    let anySalt = false;
    const SD = new Uint8Array(n).fill(255);
    regs.forEach((R, ri) => {
      if (!R.salt) return;
      anySalt = true;
      const gs = ls + 9001 + ri * 31;
      R.salt.grains.forEach((gr, gi) => {
        const [sx, sy, sr] = gr;
        const nRay = 9 + Math.floor(hh(gi, 1, gs) * 8);
        const rays = [];
        for (let k = 0; k < nRay; k++) rays.push([hh(gi, 10 + k, gs) * Math.PI * 2, 0.55 + 0.45 * hh(gi, 40 + k, gs)]);
        const R0 = Math.ceil(sr * 1.35);
        for (let y = Math.max(0, Math.floor(sy - R0)); y <= Math.min(H - 1, Math.ceil(sy + R0)); y++) {
          for (let x = Math.max(0, Math.floor(sx - R0)); x <= Math.min(W - 1, Math.ceil(sx + R0)); x++) {
            const j = inv[y * W + x];
            if (j < 0 || out.lab[j] !== ri + 1) continue;
            const dx = x - sx, dy = y - sy;
            const d = Math.hypot(dx, dy);
            const th = Math.atan2(dy, dx);
            let spike = 0;
            for (const [a, len] of rays) {
              let da = Math.abs(th - a);
              if (da > Math.PI) da = Math.PI * 2 - da;
              const s = Math.exp(-(da * da) / (0.025 + 0.05 * (d / sr))) * len;
              if (s > spike) spike = s;
            }
            const rough = 0.85 + 0.3 * vnoise(x / 2.2, y / 2.2, gs + gi);
            const reff = sr * (0.42 + 0.58 * spike) * rough;
            const u = d / Math.max(1, reff);
            if (u > 1.27) continue;
            const q = Math.round(u * 200);
            if (q < SD[j]) SD[j] = q;
          }
        }
      });
    });
    if (anySalt) out.SD = SD;
    return out;
  }

  // ---------------------------------------------------------------------------
  // build + cache
  // ---------------------------------------------------------------------------
  const BUILT = {};
  function build(key, def) {
    if (BUILT[key]) return BUILT[key];
    if (typeof def === 'function') def = def();
    const seed = seedOf(def.seed || key);
    paper();
    const layers = def.layers.map((lay, li) => buildLayer(lay, li, seed));
    const pnt = { key, layers, def };
    BUILT[key] = pnt;
    return pnt;
  }

  // ---------------------------------------------------------------------------
  // frame
  // ---------------------------------------------------------------------------
  let OUT = null;
  function outBuf() {
    if (!OUT) {
      const c = FILM.makeCanvas(W, H);
      const g = c.getContext('2d', { willReadFrequently: true });
      const img = g.createImageData(W, H);
      OUT = {
        c, g, img,
        o32: new Uint32Array(img.data.buffer),
        AR: new Float32Array(N), AG: new Float32Array(N), AB: new Float32Array(N), WET: new Float32Array(N), MEN: new Float32Array(N), RIMH: new Float32Array(N),
        band: new Float32Array(W + H + 4),
      };
    }
    return OUT;
  }
  const LUTN = 4096, LUTK = 512; // exp(-A) for A in [0, 8)
  const EXPL = new Float32Array(LUTN);
  for (let q = 0; q < LUTN; q++) EXPL[q] = Math.exp(-q / LUTK);

  function regionScalars(L, t) {
    const n = L.regs.length + 1;
    const S = L._S || (L._S = {
      conc: new Float32Array(n), aSrc: new Float32Array(n), invTau: new Float32Array(n), wet: new Float32Array(n),
      dry: new Float32Array(n), rimA: new Float32Array(n), granA: new Float32Array(n), salt: new Float32Array(n), bStop: new Float32Array(n), bead: new Float32Array(n), shim: new Float32Array(n), lift: new Float32Array(n), pw: new Float32Array(n), gl: new Float32Array(n),
    });
    for (let r = 1; r < n; r++) {
      const R = L.regs[r - 1];
      const [tw, td0, td1] = R.wet;
      const wetIn = sstep(tw, tw + 0.25, t);
      const dry = sstep(td0, td1, t);
      const w = wetIn * (1 - dry);
      const since = Math.max(0, t - R.t0);
      S.wet[r] = w;
      S.dry[r] = dry;
      S.conc[r] = R.conc * (1 + 0.3 * w) * (1 - R.dryFade * dry) * (1 + R.burst * Math.exp(-since / 0.45));
      S.aSrc[r] = R.srcBoost * (R.srcKeep + (1 - R.srcKeep) * Math.exp(-since / 1.1));
      S.bead[r] = R.bead;
      S.shim[r] = R.shimmer;
      S.lift[r] = R.saltLift;
      S.pw[r] = R.preWet;
      S.gl[r] = R.gloss;
      S.invTau[r] = 1 / R.tau;
      S.rimA[r] = R.rim;
      S.granA[r] = R.gran;
      S.salt[r] = R.salt ? sstep(R.salt.t, R.salt.t + (R.salt.dur || 1.4), t) : 0;
      S.bStop[r] = L.bStopArr ? L.bStopArr[r] : 0;
    }
    return S;
  }

  // two tileable 256 px smooth noise fields; a cos/sin blend of them is periodic in the phase
  let NTILE = null;
  function shimTiles() {
    if (NTILE) return NTILE;
    const A = new Float32Array(65536), Bn = new Float32Array(65536);
    const per = (x, y, s, f) => {
      // value noise wrapped on a 256 px torus with f cells per side
      const gx = (x / 256) * f, gy = (y / 256) * f;
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const u = gx - ix, v = gy - iy;
      const uu = u * u * (3 - 2 * u), vv = v * v * (3 - 2 * v);
      const q = (a, b) => hh(((a % f) + f) % f, ((b % f) + f) % f, s);
      const a = q(ix, iy), b = q(ix + 1, iy), c = q(ix, iy + 1), d = q(ix + 1, iy + 1);
      return (a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv) * 2 - 1;
    };
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      A[y * 256 + x] = 0.65 * per(x, y, 811, 16) + 0.35 * per(x, y, 812, 32);
      Bn[y * 256 + x] = 0.65 * per(x, y, 813, 16) + 0.35 * per(x, y, 814, 32);
    }
    NTILE = { A, B: Bn };
    return NTILE;
  }

  function render(ctx, pnt, T, o) {
    o = o || {};
    const P = paper();
    const B = outBuf();
    const { AR, AG, AB, WET, MEN, RIMH, o32 } = B;
    AR.fill(0); AG.fill(0); AB.fill(0); WET.fill(0); MEN.fill(0); RIMH.fill(0);
    const t = T;
    for (const L of pnt.layers) {
      const S = regionScalars(L, t);
      const { idx, Tv, lab, ar, ag, ab, ds, bs, rm, fl, TB, SD } = L;
      const { conc, aSrc, invTau, wet, dry, rimA, granA, salt, bStop, bead, shim, lift, pw, gl } = S;
      const cph = Math.cos(o.phase || 0), sph = Math.sin(o.phase || 0);
      const NT = shimTiles();
      const PG = P.PG;
      const n = L.n;
      for (let j = 0; j < n; j++) {
        const i = idx[j];
        const r = lab[j];
        const T0 = Tv[j];
        const w = wet[r];
        if (T0 > t) {
          // clear water ahead of the pigment: only flatter, a touch darker (and only preWet s before the front)
          if (w > 0 && fl[j] === 1 && T0 - t < pw[r]) {
            if (w > WET[i]) WET[i] = w;
            const g2 = w * gl[r];
            if (g2 > MEN[i]) MEN[i] = g2; // water written on purpose (letters, paths): darker, a glint, a rim
            const rr = rm[j] * (1 / 255);
            const rh = g2 * rr * rr * rr;
            if (rh > RIMH[i]) RIMH[i] = rh;
          }
          continue;
        }
        let a = (t - T0) * invTau[r];
        const f = a >= 1 ? 1 : a * a * (3 - 2 * a);
        const rim = rm[j] * (1 / 255);
        const dr = dry[r];
        let D = conc[r] * f * ds[j] * 0.01 * (1 + aSrc[r] * bs[j] * (1 / 255));
        D *= 1 + (rimA[r] * dr + 0.55 * w) * rim;
        D *= 1 + granA[r] * (0.3 + 0.7 * dr) * PG[i];
        if (bead[r] > 0 && w > 0) {
          const ag2 = t - T0;
          if (ag2 < 0.5) D *= 1 + bead[r] * w * Math.exp(-ag2 * 11); // the wet leading bead of a loaded stroke
        }
        if (shim[r] !== 0) {
          const ti = ((i / W) & 255) * 256 + ((i % W) & 255);
          D *= 1 + shim[r] * (NT.A[ti] * cph + NT.B[ti] * sph); // pigment drifting in still-wet paint (periodic)
        }
        if (TB !== null) {
          const tb = TB[j];
          if (tb < t) {
            const end = bStop[r];
            const tt = (t < end ? t : end) - tb;
            if (tt >= 0) D *= 0.36 + 0.64 * Math.exp(-tt * 6) + 1.1 * Math.exp(-tt * 10);
          }
        }
        if (SD !== null) {
          const sd = SD[j];
          if (sd < 255) {
            const p = salt[r] * 1.27;
            if (p > 0) {
              const u = sd / 200;
              const k = clamp((p - u) / 0.14, 0, 1);
              const e = (u - p) / 0.07;
              D *= 1 - lift[r] * k * (0.8 + 0.2 * PG[i]) + 0.35 * Math.exp(-e * e) * (1 - k);
            }
          }
        }
        if (D < 0) D = 0;
        AR[i] += D * ar[j] * (1 / 48);
        AG[i] += D * ag[j] * (1 / 48);
        AB[i] += D * ab[j] * (1 / 48);
        if (w > WET[i]) WET[i] = w;
      }
    }
    // sheen: a soft reflected window, sliding with o.sheen.phase
    const sh = o.sheen || {};
    const band = B.band;
    const ca = 0.8, sa = 0.6;
    // o.sheen.bands: [{ c (centre along 0.8x+0.6y, px), w (px), a (amplitude) }]; o.sheen.base: everywhere
    const bands = sh.bands || [{ c: 0.35 * (W * ca + H * sa), w: 260, a: 0.075 }];
    const base = sh.base != null ? sh.base : 0.03;
    for (let u = 0; u < band.length; u++) {
      let v = base;
      for (const bd of bands) {
        const e = (u - bd.c) / bd.w;
        if (e > -4 && e < 4) v += bd.a * Math.exp(-e * e);
      }
      band[u] = v;
    }
    const { PD, PF, P32 } = P;
    const pr = PAPER_RGB[0], pg = PAPER_RGB[1], pb = PAPER_RGB[2];
    for (let y = 0; y < H; y++) {
      const row = y * W;
      const ys = y * sa;
      for (let x = 0; x < W; x++) {
        const i = row + x;
        const ar = AR[i], ag = AG[i], ab = AB[i], w = WET[i];
        if (w === 0 && ar === 0 && ag === 0 && ab === 0) {
          o32[i] = P32[i];
          continue;
        }
        let Lm = PD[i];
        let s = 0;
        if (w > 0) {
          Lm = (PF[i] + (PD[i] - PF[i]) * (1 - 0.75 * w)) * (1 - 0.025 * w - 0.085 * MEN[i]); // written water reads darker (wet paper), not white
          // clear water glints less than a loaded wash (it reads as a ghost otherwise)
          const load = ar + ag + ab;
          s = w * band[(x * ca + ys) | 0] * 255 * (0.6 + 12 * (PD[i] - PF[i] > 0 ? PD[i] - PF[i] : 0)) * (load > 0.6 ? 1 : Math.max(0.1 + 1.5 * load, 0.42 * MEN[i]));
          if (RIMH[i] > 0.05 && load < 0.3) s += 34 * RIMH[i] * (1 - load * 3.3);
        }
        let qa = (ar * LUTK) | 0, qg = (ag * LUTK) | 0, qb = (ab * LUTK) | 0;
        if (qa >= LUTN) qa = LUTN - 1;
        if (qg >= LUTN) qg = LUTN - 1;
        if (qb >= LUTN) qb = LUTN - 1;
        let R = pr * Lm * EXPL[qa] + s, G = pg * Lm * EXPL[qg] + s, Bc = pb * Lm * EXPL[qb] + s;
        R = R > 255 ? 255 : R < 0 ? 0 : R | 0;
        G = G > 255 ? 255 : G < 0 ? 0 : G | 0;
        Bc = Bc > 255 ? 255 : Bc < 0 ? 0 : Bc | 0;
        o32[i] = 0xff000000 | (Bc << 16) | (G << 8) | R;
      }
    }
    B.g.putImageData(B.img, 0, 0);
    if (ctx) ctx.drawImage(B.c, 0, 0, W, H);
    return B.c;
  }

  // ---------------------------------------------------------------------------
  // small geometry helpers for painting definitions
  // ---------------------------------------------------------------------------
  /** blobPath(g, cx, cy, r, seed, wob, n): a closed irregular round wash outline */
  function blobPath(g, cx, cy, r, seed, wob, n) {
    n = n || 48;
    wob = wob == null ? 0.18 : wob;
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = r * (1 + wob * (0.6 * vnoise(Math.cos(a) * 1.6 + 5, Math.sin(a) * 1.6 + 5, seed) + 0.4 * vnoise(Math.cos(a) * 4 + 9, Math.sin(a) * 4 + 9, seed + 1)));
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }
  /** petalPath(g, cx, cy, ang, len, wid, seed): a rounded petal from (cx,cy) along ang */
  function petalPath(g, cx, cy, ang, len, wid, seed, base) {
    const n = 40;
    base = base == null ? 0.12 : base;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    g.beginPath();
    for (let k = 0; k <= n; k++) {
      const u = k / n; // around the outline: 0..1 along one side and back
      const s = u < 0.5 ? u * 2 : (1 - u) * 2; // 0 at base, 1 at tip
      const side = u < 0.5 ? 1 : -1;
      const along = base * len + s * len * (1 - base);
      const prof = Math.sin(Math.pow(s, 0.85) * Math.PI) * (s < 0.98 ? 1 : 0.6);
      const half = wid * 0.5 * Math.pow(Math.max(0, prof), 0.7) * (1 + 0.12 * vnoise(s * 3, side * 2, seed));
      const tipW = s > 0.9 ? 1 : 1;
      const px = along + 0.0 * tipW, py = side * half;
      const x = cx + px * ca - py * sa, y = cy + px * sa + py * ca;
      if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
  }

  FILM.wc = { _dbg: () => ({ OUT, BUILT }), buffer: () => outBuf().c, W, H, build, render, abs, PIG, mixAbs, hh, vnoise, fbm, blobPath, petalPath, sstep, clamp, paper, PAPER_RGB };
})();
