/*
 * cast.js : «Тень» — the one sculpture and the room it hangs in.
 *
 * THE LAW: nothing in this film is drawn. Every letter, the gear and the paper plane on the wall
 * are the real shadows of ONE hovering cloud of office junk, cast by three projector spots.
 *
 * How the junk is built (shadow art, after Mitra & Pauly 2009 / the GEB cover, plus the
 * Cornelia Parker "exploded view"):
 *   1. Each reveal is a constraint (light k, object yaw θ, target silhouette on the wall).
 *   2. A spot only lights what is inside its framed beam, so a constraint only binds the junk that
 *      sits inside that beam at that yaw: such junk must project inside the target, everything
 *      else is free.
 *   3. Each target is cut into wall-space scraps (row runs → monotone strips → pieces). Each scrap
 *      is LIFTED back into 3D along the light rays through its corners, at a random depth with a
 *      random tilt and crumple: its shadow from that light is the scrap, exactly, whatever the depth.
 *   4. The depth is searched until every sample point of the lifted scrap also obeys every OTHER
 *      constraint (inside the other target, or outside the other beam). Scraps that cannot be
 *      placed are split and retried. The union of the lifted scraps' shadows is the target.
 *   5. Bulky junk (cups, gears, keys, clips, cables, balls) is accepted only where it obeys every
 *      constraint — it fills the cloud and joins the chaos between locks.
 * The renderer (below) never sees a target: walls are lit by real shadow maps of that geometry.
 *
 * Everything is seeded and t-independent; built once on first use. Exposes FILM.shadow.
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const FILM = (root.FILM = root.FILM || {});
  const DEG = Math.PI / 180;

  // ---------------------------------------------------------------------------
  // Seeded randomness (no Math.random anywhere)
  // ---------------------------------------------------------------------------
  function mix32(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  function seedOf() {
    let h = 0x9e3779b9;
    for (let a = 0; a < arguments.length; a++) {
      const v = arguments[a];
      if (typeof v === 'string') for (let i = 0; i < v.length; i++) h = mix32(h ^ (v.charCodeAt(i) + 0x2545f491));
      else h = mix32(h ^ (Math.round(v * 1000003) | 0));
    }
    return h;
  }
  function rng(seed) {
    let a = seed >>> 0 || 1;
    const f = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.range = (lo, hi) => lo + (hi - lo) * f();
    f.int = (lo, hi) => lo + Math.floor((hi - lo + 1) * f());
    f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
    f.sign = () => (f() < 0.5 ? -1 : 1);
    return f;
  }

  // ---------------------------------------------------------------------------
  // The room, the lights, the reveals
  // ---------------------------------------------------------------------------
  const CFG = {
    WZ: -6.0, // back wall plane
    O: [0, 2.45, 0], // sculpture centre (world)
    R: 1.75, RY: 1.15, // the cloud lives inside this spheroid (object frame)
    PPM: 100, // mask pixels per wall metre
    lights: [
      // pos: projector lens; panel: the framed (shutter) rectangle it lights on the back wall [x0,x1,y0,y1]
      { id: 'A', pos: [0.25, 1.87, 2.0], panel: [-3.7, 3.7, 5.15, 7.65], margin: 0.22, col: [1.0, 0.93, 0.82] },
      { id: 'B', pos: [1.45, 1.47, 2.2], panel: [-5.35, -0.45, 3.0, 4.6], margin: 0.2, col: [0.88, 0.97, 1.04] },
      { id: 'C', pos: [-1.45, 2.09, 2.2], panel: [0.45, 5.35, 3.0, 4.6], margin: 0.2, col: [1.03, 0.9, 1.0] },
    ],
    targets: [
      { id: 'haos', light: 0, yaw: 0, zones: [{ x: 3.0, y: 5.65, r: 0.55, item: 'mug', scale: 1.6, face: true, roll: 0.5, s0: 0.12, s1: 0.45 }], items: [{ t: 'text', s: 'ХАОС?', x: -0.25, y: 6.4, cap: 1.15, maxW: 6.2, track: 0.05 }] },
      { id: 'gear', light: 2, yaw: 100, items: [{ t: 'gear', x: 2.95, y: 3.78, r: 0.7, teeth: 12 }] },
      { id: 'biz', light: 1, yaw: 180, items: [{ t: 'text', s: 'БИЗНЕС НА', x: -2.9, y: 3.8, cap: 0.62, maxW: 4.45, track: 0.04 }] },
      { id: 'auto', light: 2, yaw: 180, items: [{ t: 'text', s: 'АВТОПИЛОТЕ', x: 2.9, y: 3.8, cap: 0.62, maxW: 4.45, track: 0.03 }] },
      {
        id: 'brand', light: 0, yaw: 270, zones: [{ x: -3.1, y: 7.2, r: 0.38, item: 'clip', scale: 4, face: true, s0: 0.08, s1: 0.3 }],
        items: [
          { t: 'text', s: 'AiXenix', x: 0, y: 6.76, cap: 1.04, maxW: 6.5, track: 0.03 },
          { t: 'text', s: 'БИЗНЕС НА АВТОПИЛОТЕ', x: 0, y: 5.58, cap: 0.37, maxW: 6.5, track: 0.06 },
        ],
      },
      { id: 'site', light: 1, yaw: 270, zones: [{ x: -4.85, y: 4.25, r: 0.28, item: 'gear', scale: 1.4, face: true, s0: 0.08, s1: 0.3 }], items: [{ t: 'text', s: 'aixenix.com', x: -2.9, y: 3.78, cap: 0.7, maxW: 4.5, track: 0.02, font: 'avenir' }] },
      {
        // the paper plane is a flat SLAB of scraps at one depth, in its own lane above the address: its
        // shadow stays a plane over the last 35° of the turn and glides across the panel to land
        id: 'tg', light: 2, yaw: 270, slab: { y0: 3.82, from: 235, startX: 0.95 },
        items: [
          { t: 'text', s: 't.me/aixenix', x: 3.3, y: 3.45, cap: 0.6, maxW: 3.9, track: 0.02, font: 'avenir' },
          { t: 'plane', x: 4.3, y: 4.2, s: 0.58 },
        ],
      },
    ],
  };

  // ---------------------------------------------------------------------------
  // Target masks (wall space). Raster covers the light's outer panel at PPM px / m, y down.
  // ---------------------------------------------------------------------------
  function outerOf(L) {
    const [x0, x1, y0, y1] = L.panel, m = L.margin;
    return [x0 - m, x1 + m, y0 - m, y1 + m];
  }

  const FONTS = {
    futura: { css: '700 {S}px Futura', cap: 0.754 },
    avenir: { css: '700 {S}px "Avenir Next"', cap: 0.708 },
  };

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w; c.height = h; return c;
    }
    return new OffscreenCanvas(w, h);
  }

  function gearPath(g, cx, cy, r, teeth) {
    // classic gear: trapezoid teeth, a rim, 5 spokes and a hub with an axle hole (even-odd)
    const rt = r, rr = r * 0.8, n = teeth;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2 - Math.PI / 2;
      const w = (Math.PI * 2) / n;
      const pts = [
        [rr, a0 - w * 0.5], [rr, a0 - w * 0.27], [rt, a0 - w * 0.17], [rt, a0 + w * 0.17], [rr, a0 + w * 0.27],
      ];
      for (let k = 0; k < pts.length; k++) {
        const [rad, a] = pts[k];
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
        if (i === 0 && k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
    }
    g.closePath();
    // window holes between spokes
    const ri = r * 0.6, rh = r * 0.27, ns = 5;
    for (let i = 0; i < ns; i++) {
      const a0 = (i / ns) * Math.PI * 2 - Math.PI / 2 + 0.2;
      const a1 = a0 + (Math.PI * 2) / ns;
      const sp = 0.16; // spoke half-angle at the hub (radians, ~ width)
      const aa0 = a0 + sp, aa1 = a1 - sp;
      const ab0 = a0 + sp * 0.62 * (rh / ri) * 2.2, ab1 = a1 - sp * 0.62 * (rh / ri) * 2.2;
      g.moveTo(cx + Math.cos(aa0) * ri, cy + Math.sin(aa0) * ri);
      g.arc(cx, cy, ri, aa0, aa1, false);
      g.lineTo(cx + Math.cos(ab1) * (rh * 1.25), cy + Math.sin(ab1) * (rh * 1.25));
      g.arc(cx, cy, rh * 1.25, ab1, ab0, true);
      g.closePath();
    }
    // axle hole
    g.moveTo(cx + rh * 0.55, cy);
    g.arc(cx, cy, rh * 0.55, 0, Math.PI * 2, true);
    g.closePath();
    g.fill('evenodd');
  }

  function planePath(g, cx, cy, s) {
    // an ordinary paper dart, side view, nose to the right (not any logo): wing + keel with a fold gap
    const P = (x, y) => [cx + x * s, cy - y * s];
    const wing = [P(1.05, 0.12), P(-0.95, 0.62), P(-0.55, 0.02)];
    const keel = [P(0.98, 0.04), P(-0.5, -0.06), P(-0.72, -0.42)];
    for (const poly of [wing, keel]) {
      g.beginPath();
      g.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) g.lineTo(poly[i][0], poly[i][1]);
      g.closePath();
      g.fill();
    }
  }

  function buildMask(T) {
    const L = CFG.lights[T.light];
    const [ox0, ox1, oy0, oy1] = outerOf(L);
    const PPM = CFG.PPM;
    const W = Math.ceil((ox1 - ox0) * PPM), H = Math.ceil((oy1 - oy0) * PPM);
    const cv = makeCanvas(W, H);
    const g = cv.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    const toPx = (x, y) => [(x - ox0) * PPM, (oy1 - y) * PPM];
    for (const it of T.items) {
      if (it.t === 'text') {
        const F = FONTS[it.font || 'futura'];
        let cap = it.cap;
        const fontPx = (c) => (c * PPM) / F.cap;
        g.font = F.css.replace('{S}', fontPx(cap).toFixed(2));
        if ('letterSpacing' in g) g.letterSpacing = (it.track || 0) * fontPx(cap) + 'px';
        let w = g.measureText(it.s).width / PPM;
        if (it.maxW && w > it.maxW) {
          cap *= it.maxW / w;
          g.font = F.css.replace('{S}', fontPx(cap).toFixed(2));
          if ('letterSpacing' in g) g.letterSpacing = (it.track || 0) * fontPx(cap) + 'px';
          w = g.measureText(it.s).width / PPM;
        }
        it._cap = cap; it._w = w;
        g.textAlign = 'center'; g.textBaseline = 'alphabetic';
        const [px, py] = toPx(it.x + ((it.track || 0) * fontPx(cap)) / PPM / 2, it.y - cap / 2);
        g.fillText(it.s, px, py);
      } else if (it.t === 'gear') {
        const [px, py] = toPx(it.x, it.y);
        gearPath(g, px, py, it.r * PPM, it.teeth);
      } else if (it.t === 'plane') {
        const [px, py] = toPx(it.x, it.y);
        planePath(g, px, py, it.s * PPM);
      }
    }
    {
      const im0 = g.getImageData(0, 0, W, H).data;
      const A = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : im0[(y * W + x) * 4] / 255);
      const edges = [];
      for (let y = 2; y < H - 2; y += 2)
        for (let x = 2; x < W - 2; x += 2) {
          const v = A(x, y);
          if (v > 0.3 && v < 0.7) edges.push([x, y]);
        }
      const R = rng(seedOf('fringe', T.id));
      const capPx = Math.max(...T.items.map((it) => (it._cap || it.r || it.s || 0.5))) * PPM;
      const n = Math.round(edges.length * 0.012);
      for (let i = 0; i < n; i++) {
        const [x, y] = edges[Math.floor(R() * edges.length) % edges.length];
        let nx = A(x - 2, y) - A(x + 2, y), ny = A(x, y - 2) - A(x, y + 2);
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l; // outward normal (toward empty)
        const ang = Math.atan2(ny, nx) + R.range(-0.9, 0.9);
        const cut = R() < 0.15;
        const len = capPx * R.range(0.035, cut ? 0.06 : 0.11), wid = capPx * R.range(0.012, 0.03);
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const bx = x - dx * len * (cut ? 0.9 : 0.25), by = y - dy * len * (cut ? 0.9 : 0.25);
        g.fillStyle = cut ? '#000' : '#fff';
        g.beginPath();
        g.moveTo(bx - dy * wid, by + dx * wid);
        g.lineTo(bx + dy * wid, by - dx * wid);
        g.lineTo(bx + dx * len + dy * wid * 0.3, by + dy * len - dx * wid * 0.3);
        g.closePath();
        g.fill();
      }
    }
    const img = g.getImageData(0, 0, W, H).data;
    const a = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) a[i] = img[i * 4] / 255;
    // eroded binary mask (1 px) used to validate other constraints' junk
    const bin = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) bin[i] = a[i] >= 0.5 ? 1 : 0;
    const ero = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        ero[i] = bin[i] & bin[i - 1] & bin[i + 1] & bin[i - W] & bin[i + W];
      }
    let area = 0;
    for (let i = 0; i < W * H; i++) area += bin[i];
    // zones: small regions where a recognisable junk silhouette is ALLOWED to fall at this lock (proof that
    // it is all shadow). They join the validation masks only; scraps never tile them.
    const binCore = bin, eroCore = ero;
    const binZ = bin.slice(), eroZ = ero.slice();
    for (const z of T.zones || []) {
      const cx = (z.x - ox0) * PPM, cy = (oy1 - z.y) * PPM, r = z.r * PPM;
      for (let y = Math.max(1, Math.floor(cy - r)); y < Math.min(H - 1, Math.ceil(cy + r)); y++)
        for (let x = Math.max(1, Math.floor(cx - r)); x < Math.min(W - 1, Math.ceil(cx + r)); x++)
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) { binZ[y * W + x] = 1; eroZ[y * W + x] = 1; }
    }
    return { W, H, ox0, ox1, oy0, oy1, a, bin: binZ, ero, eroZ, binCore, eroCore, area, canvas: cv };
  }

  // ---------------------------------------------------------------------------
  // Wall-space decomposition: row runs → linked trapezoids → strips → pieces
  // ---------------------------------------------------------------------------
  function runsAt(M, py) {
    // py: px row coordinate (float, y down). Linear interpolation of the AA alpha between rows.
    const { W, H, a } = M;
    const yy = py - 0.5;
    let j0 = Math.floor(yy);
    const f = yy - j0;
    const r0 = Math.max(0, Math.min(H - 1, j0)), r1 = Math.max(0, Math.min(H - 1, j0 + 1));
    const val = (i) => (i < 0 || i >= W ? 0 : a[r0 * W + i] * (1 - f) + a[r1 * W + i] * f);
    const runs = [];
    let inside = false, start = 0, pv = 0;
    for (let i = 0; i <= W; i++) {
      const v = val(i);
      if (!inside && v >= 0.5) {
        start = i - 0.5 + (0.5 - pv) / Math.max(1e-6, v - pv);
        inside = true;
      } else if (inside && v < 0.5) {
        const x = i - 0.5 + (pv - 0.5) / Math.max(1e-6, pv - v);
        if (x - start > 0.6) runs.push([start, x]);
        inside = false;
      }
      pv = v;
    }
    return runs;
  }

  // Returns a list of "cells": trapezoids between consecutive rows {y0,y1 (px), a:[xl,xr], b:[xl,xr], chain}
  // grouped as chains of 1-1 links. Junction trapezoids (splits/merges) are their own chains.
  function decompose(M, hrPx) {
    // bbox rows that contain ink
    let top = M.H, bot = 0;
    for (let y = 0; y < M.H; y++) {
      let any = false;
      for (let x = 0; x < M.W; x++) if (M.a[y * M.W + x] >= 0.5) { any = true; break; }
      if (any) { if (y < top) top = y; bot = y; }
    }
    if (top > bot) return [];
    const rows = [];
    for (let py = top + 0.5; py <= bot + 0.5 + 1e-6; py += hrPx) rows.push({ y: py, runs: runsAt(M, py) });
    const chains = []; // each chain: {cells: [{y0,y1,a,b}]}
    let open = new Map(); // run index in current row -> chain
    for (let r = 0; r < rows.length - 1; r++) {
      const A = rows[r].runs, B = rows[r + 1].runs;
      const nextOpen = new Map();
      // overlap graph
      const adjA = A.map(() => []), adjB = B.map(() => []);
      for (let i = 0; i < A.length; i++)
        for (let j = 0; j < B.length; j++)
          if (A[i][0] < B[j][1] && B[j][0] < A[i][1]) { adjA[i].push(j); adjB[j].push(i); }
      const seenA = new Uint8Array(A.length), seenB = new Uint8Array(B.length);
      for (let i0 = 0; i0 < A.length; i0++) {
        if (seenA[i0] || !adjA[i0].length) continue;
        // component
        const ca = [], cb = [];
        const stack = [['a', i0]];
        seenA[i0] = 1;
        while (stack.length) {
          const [side, k] = stack.pop();
          if (side === 'a') { ca.push(k); for (const j of adjA[k]) if (!seenB[j]) { seenB[j] = 1; stack.push(['b', j]); } }
          else { cb.push(k); for (const i of adjB[k]) if (!seenA[i]) { seenA[i] = 1; stack.push(['a', i]); } }
        }
        ca.sort((p, q) => A[p][0] - A[q][0]);
        cb.sort((p, q) => B[p][0] - B[q][0]);
        const y0 = rows[r].y, y1 = rows[r + 1].y;
        if (ca.length === 1 && cb.length === 1) {
          const i = ca[0], j = cb[0];
          let ch = open.get(i);
          if (!ch) { ch = { cells: [] }; chains.push(ch); }
          ch.cells.push({ y0, y1, a: A[i].slice(), b: B[j].slice() });
          nextOpen.set(j, ch);
        } else if (ca.length === 1) {
          // split: distribute a by the widths of the b runs, contiguous
          const a = A[ca[0]];
          const tot = cb.reduce((s, j) => s + (B[j][1] - B[j][0]), 0);
          let x = a[0];
          for (const j of cb) {
            const w = ((B[j][1] - B[j][0]) / tot) * (a[1] - a[0]);
            chains.push({ cells: [{ y0, y1, a: [x, x + w], b: B[j].slice() }], junction: true });
            x += w;
          }
        } else if (cb.length === 1) {
          const b = B[cb[0]];
          const tot = ca.reduce((s, i) => s + (A[i][1] - A[i][0]), 0);
          let x = b[0];
          for (const i of ca) {
            const w = ((A[i][1] - A[i][0]) / tot) * (b[1] - b[0]);
            chains.push({ cells: [{ y0, y1, a: A[i].slice(), b: [x, x + w] }], junction: true });
            x += w;
          }
        } else {
          for (const i of ca)
            for (const j of adjA[i]) {
              const lo = Math.max(A[i][0], B[j][0]), hi = Math.min(A[i][1], B[j][1]);
              if (hi - lo > 0.5) chains.push({ cells: [{ y0, y1, a: [lo, hi], b: [lo, hi] }], junction: true });
            }
        }
      }
      open = nextOpen;
    }
    return chains;
  }

  // Cut chains into pieces. A piece is a grid: rows [{y, xl, xr}] (wall metres) and column fractions.
  function piecesOf(M, chains, R, opt) {
    const PPM = CFG.PPM;
    const toW = (px, py) => [M.ox0 + px / PPM, M.oy1 - py / PPM];
    const out = [];
    for (const ch of chains) {
      const cells = ch.cells;
      let i = 0;
      while (i < cells.length) {
        const k = Math.min(cells.length - i, R.int(opt.kMin, opt.kMax));
        const seg = cells.slice(i, i + k);
        i += k;
        const rows = [{ y: seg[0].y0, xl: seg[0].a[0], xr: seg[0].a[1] }];
        for (const c of seg) rows.push({ y: c.y1, xl: c.b[0], xr: c.b[1] });
        // simplify rows: drop interior rows whose boundary is within tol of the linear interpolation
        const tol = 0.35; // px
        const keep = [rows[0]];
        let anchor = 0;
        for (let r = 1; r < rows.length - 1; r++) {
          // test if rows anchor..r+1 can be spanned linearly
          const A0 = rows[anchor], B0 = rows[r + 1];
          let ok = true;
          for (let q = anchor + 1; q <= r; q++) {
            const u = (rows[q].y - A0.y) / (B0.y - A0.y);
            if (Math.abs(A0.xl + (B0.xl - A0.xl) * u - rows[q].xl) > tol || Math.abs(A0.xr + (B0.xr - A0.xr) * u - rows[q].xr) > tol) { ok = false; break; }
          }
          if (!ok) { keep.push(rows[r]); anchor = r; }
        }
        keep.push(rows[rows.length - 1]);
        // to wall metres
        const wrows = keep.map((rw) => {
          const [xl, y] = toW(rw.xl, rw.y);
          const [xr] = toW(rw.xr, rw.y);
          return { y, xl, xr };
        });
        let maxW = 0;
        for (const rw of wrows) maxW = Math.max(maxW, rw.xr - rw.xl);
        const ncut = Math.max(1, Math.ceil(maxW / (opt.maxW * R.range(0.75, 1.15))));
        const cuts = [0];
        for (let c = 1; c < ncut; c++) cuts.push(Math.min(0.97, Math.max(0.03, c / ncut + R.range(-0.25, 0.25) / ncut)));
        cuts.push(1);
        for (let c = 0; c < ncut; c++) out.push({ rows: wrows, f0: cuts[c], f1: cuts[c + 1] });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Constraints, poses, validation
  // ---------------------------------------------------------------------------
  let CONS = null; // [{idx, light, L, cos, sin, h, ox0.., W, H, ero, M}]

  function poseWorld(c, qx, qy, qz, out) {
    out[0] = CFG.O[0] + c.cos * qx + c.sin * qz;
    out[1] = CFG.O[1] + c.h + qy;
    out[2] = CFG.O[2] - c.sin * qx + c.cos * qz;
    return out;
  }

  const _p = [0, 0, 0];
  // true if object-frame point q obeys constraint c (outside its beam, or inside its target)
  function okOne(c, qx, qy, qz) {
    poseWorld(c, qx, qy, qz, _p);
    const L = c.L;
    const dz = _p[2] - L[2];
    if (dz >= -1e-6) return true;
    const t = (CFG.WZ - L[2]) / dz;
    const wx = L[0] + (_p[0] - L[0]) * t, wy = L[1] + (_p[1] - L[1]) * t;
    if (wx <= c.ox0 || wx >= c.ox1 || wy <= c.oy0 || wy >= c.oy1) return true;
    const ix = ((wx - c.ox0) * CFG.PPM) | 0, iy = ((c.oy1 - wy) * CFG.PPM) | 0;
    return (ZONE_MODE ? c.eroZ : c.ero)[iy * c.W + ix] === 1;
  }
  let BLAME = null;
  let ZONE_MODE = false; // only the zone items may cast into the proof zones
  function okAll(qx, qy, qz, skip) {
    for (let i = 0; i < CONS.length; i++) {
      if (i === skip) continue;
      if (!okOne(CONS[i], qx, qy, qz)) { if (BLAME) BLAME[i]++; return false; }
    }
    return true;
  }
  function insideCloud(qx, qy, qz, pad) {
    const R = CFG.R + (pad || 0), RY = CFG.RY + (pad || 0);
    return (qx * qx + qz * qz) / (R * R) + (qy * qy) / (RY * RY) <= 1;
  }

  // s-interval along the ray L→w (wall point) inside the cloud spheroid at pose c
  function rayInterval(c, wx, wy) {
    const L = c.L;
    const dx = wx - L[0], dy = wy - L[1], dz = CFG.WZ - L[2];
    const ox = L[0] - CFG.O[0], oy = L[1] - CFG.O[1] - c.h, oz = L[2] - CFG.O[2];
    const iR = 1 / (CFG.R * CFG.R), iRY = 1 / (CFG.RY * CFG.RY);
    const A = (dx * dx + dz * dz) * iR + dy * dy * iRY;
    const B = 2 * ((ox * dx + oz * dz) * iR + oy * dy * iRY);
    const C = (ox * ox + oz * oz) * iR + oy * oy * iRY - 1;
    const D = B * B - 4 * A * C;
    if (D <= 0) return null;
    const sq = Math.sqrt(D);
    return [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
  }

  // world point on the ray at fraction s, to object frame of pose c
  function liftToObj(c, wx, wy, s, out) {
    const L = c.L;
    const px = L[0] + (wx - L[0]) * s, py = L[1] + (wy - L[1]) * s, pz = L[2] + (CFG.WZ - L[2]) * s;
    const dx = px - CFG.O[0], dy = py - CFG.O[1] - c.h, dz = pz - CFG.O[2];
    out[0] = c.cos * dx - c.sin * dz;
    out[1] = dy;
    out[2] = c.sin * dx + c.cos * dz;
    return out;
  }

  // ---------------------------------------------------------------------------
  // Lifting a wall piece into a crumpled 3D scrap
  // ---------------------------------------------------------------------------
  function pieceGrid(pc, colsTarget) {
    // returns wall-space vertex grid [ri][ci] -> [x, y]
    const rows = pc.rows;
    let w = 0;
    for (const r of rows) w = Math.max(w, (r.xr - r.xl) * (pc.f1 - pc.f0));
    const nc = Math.max(1, Math.min(6, Math.round(w / colsTarget)));
    const grid = [];
    for (const r of rows) {
      const line = [];
      for (let c = 0; c <= nc; c++) {
        const f = pc.f0 + ((pc.f1 - pc.f0) * c) / nc;
        line.push([r.xl + (r.xr - r.xl) * f, r.y]);
      }
      grid.push(line);
    }
    // vertically subdivide long spans so crumple has vertices to fold
    const out = [grid[0]];
    for (let i = 1; i < grid.length; i++) {
      const g0 = grid[i - 1], g1 = grid[i];
      const span = Math.abs(g1[0][1] - g0[0][1]);
      const sub = Math.max(1, Math.min(6, Math.round(span / colsTarget)));
      for (let k = 1; k <= sub; k++) {
        const u = k / sub;
        out.push(g0.map((p, j) => [p[0] + (g1[j][0] - p[0]) * u, p[1] + (g1[j][1] - p[1]) * u]));
      }
    }
    return out;
  }

  // depths (s) at which the piece's centre and corner rays are all valid points: the piece's slice of the hull
  function candidateS(c, grid, opt, strict) {
    let cx = 0, cy = 0, n = 0;
    for (const line of grid) for (const p of line) { cx += p[0]; cy += p[1]; n++; }
    const corners = [grid[0][0], grid[0][grid[0].length - 1], grid[grid.length - 1][0], grid[grid.length - 1][grid[0].length - 1]];
    const rays = strict ? corners.concat([[cx / n, cy / n]]) : [[cx / n, cy / n]];
    const N = 200, out = [];
    const q = [0, 0, 0];
    for (let k = 0; k <= N; k++) {
      const sv = opt.sMin + ((opt.sMax - opt.sMin) * k) / N;
      let ok = true;
      for (const r of rays) {
        liftToObj(c, r[0], r[1], sv, q);
        if (!insideCloud(q[0], q[1], q[2], 0.02) || !okAll(q[0], q[1], q[2], c.idx)) { ok = false; break; }
      }
      if (ok) out.push(sv);
    }
    return out;
  }

  function tryLift(c, grid, R, opt, cands, calm) {
    // centre
    let cx = 0, cy = 0, n = 0;
    for (const line of grid) for (const p of line) { cx += p[0]; cy += p[1]; n++; }
    cx /= n; cy /= n;
    let sc;
    const ds = (opt.sMax - opt.sMin) / 200;
    if (cands && cands.length) sc = R.pick(cands) + R.range(-0.45, 0.45) * ds;
    else {
      const iv = rayInterval(c, cx, cy);
      if (!iv) return null;
      const s0 = Math.max(iv[0], opt.sMin), s1 = Math.min(iv[1], opt.sMax);
      if (s1 - s0 < 1e-3) return null;
      sc = R.range(s0 + (s1 - s0) * 0.04, s1 - (s1 - s0) * 0.04);
    }
    const cm = calm == null ? 1 : calm;
    const ax = R.range(-opt.tilt, opt.tilt) * cm, ay = R.range(-opt.tilt, opt.tilt) * cm;
    // crumple: two creases + vertex noise (in s units)
    const k1 = R.range(-1, 1) * opt.crumple * cm, k2 = R.range(-1, 1) * opt.crumple * 0.7 * cm;
    const a1 = R.range(0, Math.PI), a2 = R.range(0, Math.PI);
    const n1 = [Math.cos(a1), Math.sin(a1)], n2 = [Math.cos(a2), Math.sin(a2)];
    const o1 = R.range(-0.05, 0.05), o2 = R.range(-0.05, 0.05);
    const vtx = [];
    const tmp = [0, 0, 0];
    for (let i = 0; i < grid.length; i++) {
      const line = [];
      for (let j = 0; j < grid[i].length; j++) {
        const [wx, wy] = grid[i][j];
        const u = wx - cx, v = wy - cy;
        let s = sc + ax * u + ay * v;
        s += k1 * Math.abs(n1[0] * u + n1[1] * v - o1) + k2 * Math.abs(n2[0] * u + n2[1] * v - o2);
        s += (R() - 0.5) * opt.jitter * cm;
        liftToObj(c, wx, wy, s, tmp);
        if (!(insideCloud(tmp[0], tmp[1], tmp[2], 0.06) && okAll(tmp[0], tmp[1], tmp[2], c.idx))) {
          // let the scrap bend to follow a thin slanted hull: snap this vertex to the nearest valid depth
          let found = false;
          for (let k = 1; k <= 14 && !found; k++)
            for (const sg of [-1, 1]) {
              const s2 = s + sg * k * ds * 0.6;
              liftToObj(c, wx, wy, s2, tmp);
              if (insideCloud(tmp[0], tmp[1], tmp[2], 0.06) && okAll(tmp[0], tmp[1], tmp[2], c.idx)) { found = true; break; }
            }
          if (!found) { if (BLAME) BLAME.cloud = (BLAME.cloud || 0) + 1; return null; }
        }
        line.push([tmp[0], tmp[1], tmp[2]]);
      }
      vtx.push(line);
    }
    // validate vertices and cell centres against every other constraint
    for (let i = 0; i < vtx.length; i++)
      for (let j = 0; j < vtx[i].length; j++) {
        const q = vtx[i][j];
        if (!okAll(q[0], q[1], q[2], c.idx)) return null;
      }
    for (let i = 0; i < vtx.length - 1; i++)
      for (let j = 0; j < vtx[i].length - 1; j++) {
        const a = vtx[i][j], b = vtx[i][j + 1], d = vtx[i + 1][j], e = vtx[i + 1][j + 1];
        const mx = (a[0] + b[0] + d[0] + e[0]) / 4, my = (a[1] + b[1] + d[1] + e[1]) / 4, mz = (a[2] + b[2] + d[2] + e[2]) / 4;
        if (!okAll(mx, my, mz, c.idx)) return null;
        // edge midpoints
        if (!okAll((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, c.idx)) return null;
        if (!okAll((a[0] + d[0]) / 2, (a[1] + d[1]) / 2, (a[2] + d[2]) / 2, c.idx)) return null;
      }
    return { vtx, sc };
  }

  function splitPiece(pc) {
    // halve along the longer dimension (rows or columns)
    const rows = pc.rows;
    const h = Math.abs(rows[0].y - rows[rows.length - 1].y);
    let w = 0;
    for (const r of rows) w = Math.max(w, (r.xr - r.xl) * (pc.f1 - pc.f0));
    if (w >= h || rows.length < 3) {
      const fm = (pc.f0 + pc.f1) / 2;
      return [{ rows, f0: pc.f0, f1: fm }, { rows, f0: fm, f1: pc.f1 }];
    }
    // split rows: insert an interpolated middle row
    const ym = (rows[0].y + rows[rows.length - 1].y) / 2;
    let k = 0;
    while (k < rows.length - 1 && !((rows[k].y - ym) * (rows[k + 1].y - ym) <= 0)) k++;
    const r0 = rows[k], r1 = rows[k + 1];
    const u = (ym - r0.y) / (r1.y - r0.y || 1);
    const mid = { y: ym, xl: r0.xl + (r1.xl - r0.xl) * u, xr: r0.xr + (r1.xr - r0.xr) * u };
    const A = rows.slice(0, k + 1).concat([mid]);
    const B = [mid].concat(rows.slice(k + 1));
    return [{ rows: A, f0: pc.f0, f1: pc.f1 }, { rows: B, f0: pc.f0, f1: pc.f1 }];
  }

  // ---------------------------------------------------------------------------
  // Build everything
  // ---------------------------------------------------------------------------
  let BUILT = null;
  function build() {
    if (BUILT) return BUILT;
    const masks = CFG.targets.map(buildMask);
    CONS = CFG.targets.map((T, idx) => {
      const L = CFG.lights[T.light];
      const M = masks[idx];
      const yaw = T.yaw * DEG;
      return {
        idx, id: T.id, light: T.light, L: L.pos, yaw, cos: Math.cos(yaw), sin: Math.sin(yaw), h: T.h || 0,
        ox0: M.ox0, ox1: M.ox1, oy0: M.oy0, oy1: M.oy1, W: M.W, H: M.H, ero: M.ero, eroZ: M.eroZ, M,
      };
    });
    const scraps = []; // {cons, vtx (object frame grid), kind, seed}
    const stats = [];
    const opt = { kMin: 6, kMax: 30, maxW: 0.42, sMin: 0.03, sMax: 0.62, tilt: 0.09, crumple: 0.018, jitter: 0.004, tries: 30 };
    for (let ci = 0; ci < CONS.length; ci++) {
      const c = CONS[ci];
      const R = rng(seedOf('pieces', c.id));
      const chains = decompose(c.M, 2.5);
      let base = piecesOf(c.M, chains, R, opt);
      let ok = 0, fail = 0;
      BLAME = new Array(CONS.length).fill(0);
      const T = CFG.targets[ci];
      if (T.slab) {
        const pcy = (p) => { let sy = 0; for (const r of p.rows) sy += r.y; return sy / p.rows.length; };
        const slabP = base.filter((p) => pcy(p) >= T.slab.y0);
        base = base.filter((p) => pcy(p) < T.slab.y0);
        const grids = slabP.map((p) => pieceGrid(p, 0.07));
        let best = null;
        for (let sv = opt.sMin + 0.02; sv <= opt.sMax; sv += 0.004) {
          const RS = rng(seedOf('slab', c.id, Math.round(sv * 1000)));
          const lifted = [];
          for (const g of grids) {
            let res = null;
            for (let k = 0; k < 4 && !res; k++) res = tryLift(c, g, RS, opt, [sv], 0.08);
            if (!res) break;
            lifted.push(res.vtx);
          }
          if (!stats.slabScan) stats.slabScan = [];
          if (lifted.length < grids.length) { stats.slabScan.push(sv.toFixed(3) + ':' + lifted.length + '/' + grids.length); continue; }
          // flight: where is the slab's shadow when the turn is 35° short of the lock?
          let qx = 0, qy = 0, qz = 0, n = 0;
          for (const v of lifted) for (const line of v) for (const q of line) { qx += q[0]; qy += q[1]; qz += q[2]; n++; }
          qx /= n; qy /= n; qz /= n;
          const wallAt = (yawDeg) => {
            const cc = { cos: Math.cos(yawDeg * DEG), sin: Math.sin(yawDeg * DEG), h: c.h };
            const P = poseWorld(cc, qx, qy, qz, [0, 0, 0]);
            const L = c.L, t = (CFG.WZ - L[2]) / (P[2] - L[2]);
            return [L[0] + (P[0] - L[0]) * t, L[1] + (P[1] - L[1]) * t];
          };
          const a = wallAt(T.slab.from), b = wallAt(T.yaw);
          const score = (b[0] > a[0] ? 0 : -100) - Math.abs(a[0] - T.slab.startX) - Math.abs(a[1] - b[1]) * 0.5;
          stats.slabScan.push(sv.toFixed(3) + ':ok a=' + a[0].toFixed(2) + ',' + a[1].toFixed(2) + ' b=' + b[0].toFixed(2));
          if (!best || score > best.score) best = { score, sv, lifted, a, b };
        }
        if (best) {
          for (const v of best.lifted) scraps.push({ cons: ci, vtx: v, layer: 0, slab: true, seed: seedOf('scrap', c.id, scraps.length) });
          ok += best.lifted.length;
          stats.slab = { s: +best.sv.toFixed(3), from: best.a.map((x) => +x.toFixed(2)), to: best.b.map((x) => +x.toFixed(2)), pieces: best.lifted.length };
        } else {
          base = base.concat(slabP);
          stats.slab = 'none';
        }
      }
      const layers = 2; // cover each target twice, at independent depths
      for (let layer = 0; layer < layers; layer++) {
        const queue = base.map((p) => ({ p, depth: 0 }));
        while (queue.length) {
          const { p, depth } = queue.shift();
          const grid = pieceGrid(p, 0.07);
          let res = null;
          let cands = candidateS(c, grid, opt, true);
          if (!cands.length) cands = candidateS(c, grid, opt, false);
          if (cands.length) {
            for (let k = 0; k < opt.tries && !res; k++) res = tryLift(c, grid, R, opt, cands, k < opt.tries / 3 ? 1 : k < (opt.tries * 2) / 3 ? 0.35 : 0);
          }
          if (res) {
            scraps.push({ cons: ci, vtx: res.vtx, layer, seed: seedOf('scrap', c.id, scraps.length) });
            ok++;
          } else if (depth < 5) {
            for (const q of splitPiece(p)) queue.push({ p: q, depth: depth + 1 });
          } else {
            fail++;
          }
        }
      }
      stats.push({ id: c.id, area: c.M.area, pieces: base.length, ok, fail, blame: BLAME.map((v, i) => CONS[i].id + ':' + v).filter((x) => !x.endsWith(':0')).join(' ') + ' cloud:' + (BLAME.cloud || 0) });
      BLAME = null;
    }
    BUILT = { masks, cons: CONS, scraps, stats };
    if (typeof THREE !== 'undefined') {
      BUILT.decor = buildDecor(BUILT);
      BUILT.decor = BUILT.decor.concat(buildZoneItems(BUILT));
    }
    return BUILT;
  }

  // ---------------------------------------------------------------------------
  // CPU ground truth: project every scrap at constraint c's pose through its light → canvas
  // ---------------------------------------------------------------------------
  function project(ci, extraYaw) {
    const B = build();
    const c = B.cons[ci];
    const M = c.M;
    const cv = makeCanvas(M.W, M.H);
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, M.W, M.H);
    g.fillStyle = '#000';
    const yaw = c.yaw + (extraYaw || 0);
    const cc = { cos: Math.cos(yaw), sin: Math.sin(yaw), h: c.h };
    const P = [0, 0, 0];
    const proj = (q) => {
      poseWorld(cc, q[0], q[1], q[2], P);
      const L = c.L;
      const t = (CFG.WZ - L[2]) / (P[2] - L[2]);
      const wx = L[0] + (P[0] - L[0]) * t, wy = L[1] + (P[1] - L[1]) * t;
      return [(wx - M.ox0) * CFG.PPM, (M.oy1 - wy) * CFG.PPM];
    };
    g.beginPath();
    for (const s of B.scraps) {
      const v = s.vtx;
      for (let i = 0; i < v.length - 1; i++)
        for (let j = 0; j < v[i].length - 1; j++) {
          let a = proj(v[i][j]), b = proj(v[i][j + 1]), d = proj(v[i + 1][j + 1]), e = proj(v[i + 1][j]);
          for (const tri of [[a, b, d], [a, d, e]]) {
            let [p0, p1, p2] = tri;
            if ((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]) < 0) { const t = p1; p1 = p2; p2 = t; }
            g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath();
          }
        }
    }
    for (const d of B.decor || []) {
      const t = d.tris;
      for (let i = 0; i < t.length; i += 9) {
        let p0 = proj([t[i], t[i + 1], t[i + 2]]), p1 = proj([t[i + 3], t[i + 4], t[i + 5]]), p2 = proj([t[i + 6], t[i + 7], t[i + 8]]);
        if ((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]) < 0) { const tt = p1; p1 = p2; p2 = tt; }
        g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.closePath();
      }
    }
    g.fill('nonzero');
    // compare with mask
    const img = g.getImageData(0, 0, M.W, M.H).data;
    // holes counted inside the 2px-eroded target, false shadow outside the 2px-dilated target (AA edges excluded)
    let hole = 0, extra = 0, inner = 0;
    const W = M.W;
    for (let y = 2; y < M.H - 2; y++)
      for (let x = 2; x < W - 2; x++) {
        const i = y * W + x;
        const sh = img[i * 4] < 128 ? 1 : 0;
        const e2 = M.eroCore[i] & M.eroCore[i - 1] & M.eroCore[i + 1] & M.eroCore[i - W] & M.eroCore[i + W];
        const d2 = M.bin[i] | M.bin[i - 1] | M.bin[i + 1] | M.bin[i - W] | M.bin[i + W] | M.bin[i - 2] | M.bin[i + 2] | M.bin[i - 2 * W] | M.bin[i + 2 * W];
        if (e2) { inner++; if (!sh) hole++; }
        if (!d2 && sh) extra++;
      }
    return { canvas: cv, hole, extra, area: inner };
  }

  // upper bound: fraction of target pixels whose ray has at least one point valid for all other constraints
  function hullCoverage(ci, step) {
    const B = build();
    const c = B.cons[ci], M = c.M;
    let tot = 0, ok = 0;
    const q = [0, 0, 0];
    for (let y = 0; y < M.H; y += step)
      for (let x = 0; x < M.W; x += step) {
        if (!M.bin[y * M.W + x]) continue;
        tot++;
        const wx = M.ox0 + (x + 0.5) / CFG.PPM, wy = M.oy1 - (y + 0.5) / CFG.PPM;
        const iv = rayInterval(c, wx, wy);
        if (!iv) continue;
        let found = false;
        for (let k = 0; k <= 160 && !found; k++) {
          const sv = iv[0] + ((iv[1] - iv[0]) * k) / 160;
          liftToObj(c, wx, wy, sv, q);
          if (okAll(q[0], q[1], q[2], ci)) found = true;
        }
        if (found) ok++;
      }
    return ok / Math.max(1, tot);
  }

  // debug: per-pixel count of valid depth samples along each target ray (grey = thickness of the hull)
  function hullImage(ci) {
    const B = build();
    const c = B.cons[ci], M = c.M;
    const cv = makeCanvas(M.W, M.H);
    const g = cv.getContext('2d');
    const im = g.createImageData(M.W, M.H);
    const q = [0, 0, 0];
    for (let y = 0; y < M.H; y++)
      for (let x = 0; x < M.W; x++) {
        const i = y * M.W + x;
        let v = 0;
        if (M.bin[i]) {
          const wx = M.ox0 + (x + 0.5) / CFG.PPM, wy = M.oy1 - (y + 0.5) / CFG.PPM;
          const iv = rayInterval(c, wx, wy);
          if (iv) for (let k = 0; k <= 60; k++) {
            liftToObj(c, wx, wy, iv[0] + ((iv[1] - iv[0]) * k) / 60, q);
            if (okAll(q[0], q[1], q[2], ci)) v++;
          }
          im.data[i * 4] = v ? 60 + v * 3 : 255; im.data[i * 4 + 1] = v ? 60 + v * 3 : 0; im.data[i * 4 + 2] = v ? 60 + v * 3 : 0;
        }
        im.data[i * 4 + 3] = 255;
      }
    g.putImageData(im, 0, 0);
    return cv;
  }


  // ===========================================================================
  // CHOREOGRAPHY — a pure function of global T (90 bpm: beat 2/3 s, bar 8/3 s)
  // ===========================================================================
  const BEAT = 2 / 3;
  const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  // a turn: starts from rest, glides in and stops dead on the lock
  function turnEase(p) {
    p = clamp01(p);
    const a = p * p * p * (p * (p * 6 - 15) + 10); // smootherstep
    const b = 1 - Math.pow(1 - p, 3);
    return lerp(a, b, p); // more glide at the end, firm stop
  }
  const MOVES = [
    // [T0, T1, yaw0, yaw1, tilt°] — holds in between. Locks: 1.333 ХАОС?, 5.333 gear, 8.0 slogan, 13.333 final
    [0.0, 4 / 3, -64, 0, 7],
    [10 / 3, 16 / 3, 0, 100, 10],
    [19 / 3, 8.0, 100, 180, 9],
    [32 / 3, 40 / 3, 180, 270, 6],
  ];
  // between locks the sculpture also nods and rolls a little (and bobs), so pieces converge from every
  // direction; at every lock pitch = roll = bob = 0 exactly, so the solved poses are untouched
  function wobbleAt(T) {
    for (const m of MOVES) {
      if (T > m[0] && T < m[1]) {
        const p = (T - m[0]) / (m[1] - m[0]);
        const env = Math.sin(Math.PI * p) * Math.pow(1 - p, 0.35);
        return { pitch: m[4] * env * DEG, roll: m[4] * 0.55 * Math.sin(2 * Math.PI * p) * Math.pow(1 - p, 0.5) * DEG, h: 0.12 * env };
      }
    }
    return { pitch: 0, roll: 0, h: 0 };
  }
  function yawAt(T) {
    let y = MOVES[0][2];
    let tLock = -1;
    for (const m of MOVES) {
      if (T >= m[1]) { y = m[3]; tLock = m[1]; }
      else if (T > m[0]) { y = lerp(m[2], m[3], turnEase((T - m[0]) / (m[1] - m[0]))); tLock = -1; break; }
      else { y = m[2]; break; }
    }
    // mechanical detent: the sculpture clunks into place — 0.5° damped wobble for ~0.3 s
    if (tLock >= 0) {
      const d = T - tLock;
      if (d < 0.4) y += 0.0 * Math.exp(-d * 14) * Math.sin(d * 2 * Math.PI * 7.5);
    }
    return y;
  }
  // light switch-on: a hard clack with a short tungsten bloom
  function lamp(T, t0) {
    if (T < t0) return 0;
    const u = (T - t0) / (1 / 30);
    if (u < 1) return 0.55;
    if (u < 2) return 1.18;
    return 1 + 0.12 * Math.exp(-(T - t0 - 2 / 30) * 6);
  }
  const LIGHT_ON = [0, BEAT * 11, BEAT * 7]; // by light index: A 0.0, B 7.333, C 4.667
  function camAt(T) {
    // one continuous move; the last bar (from 18.667) is static so the film loops
    const K = [
      // proof shot: beside spot A, its beam runs through the junk onto the wall
      [0.0, [1.2, 2.35, 4.6], [-0.15, 3.9, -6.0], 50],
      [1.5, [-0.3, 3.85, 9.6], [0.0, 4.45, -6.0], 40],
      [3.333, [-0.35, 3.9, 9.9], [0.05, 4.4, -6.0], 40],
      [5.333, [0.4, 4.35, 10.4], [0.55, 4.25, -6.0], 38],
      [8.0, [0.0, 4.55, 11.3], [0.0, 3.95, -6.0], 36],
      [13.333, [0.0, 4.55, 11.2], [0.0, 3.95, -6.0], 36],
      [16.0, [0.0, 4.6, 10.9], [0.0, 4.0, -6.0], 35],
      [18.667, [0.0, 5.2, 9.5], [0.0, 4.42, -6.0], 31.5],
    ];
    if (T >= K[K.length - 1][0]) { const k = K[K.length - 1]; return { pos: k[1].slice(), look: k[2].slice(), fov: k[3] }; }
    let i = 0;
    while (i < K.length - 2 && T >= K[i + 1][0]) i++;
    const a = K[i], b = K[i + 1];
    const u = sstep(a[0], b[0], T);
    const L3 = (p, q) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)];
    return { pos: L3(a[1], b[1]), look: L3(a[2], b[2]), fov: lerp(a[3], b[3], u) };
  }
  function state(T) {
    const w = wobbleAt(T);
    return {
      yaw: yawAt(T) * DEG,
      pitch: w.pitch,
      roll: w.roll,
      h: w.h,
      lights: LIGHT_ON.map((t0) => lamp(T, t0)).map((v, k) => v * [1, 1, 1][k]),
      cam: camAt(T),
      ambient: 1,
    };
  }

  // ===========================================================================
  // JUNK GEOMETRY (object frame) — scraps of paper + bulky office junk
  // ===========================================================================
  const PAPERS = [
    // [r,g,b] linear-ish albedo, kind: 0 paper (printed), 1 sticky, 2 kraft/card, 3 newsprint
    { c: [0.82, 0.81, 0.77], k: 0, w: 30 },
    { c: [0.86, 0.8, 0.64], k: 0, w: 14 },
    { c: [0.93, 0.8, 0.22], k: 1, w: 9 },
    { c: [0.95, 0.32, 0.72], k: 1, w: 6 },
    { c: [0.32, 0.82, 0.92], k: 1, w: 6 },
    { c: [0.52, 0.36, 0.21], k: 2, w: 8 },
    { c: [0.66, 0.66, 0.63], k: 3, w: 10 },
    { c: [0.9, 0.9, 0.88], k: 0, w: 10 },
  ];
  function pickPaper(R) {
    let tot = 0;
    for (const p of PAPERS) tot += p.w;
    let x = R() * tot;
    for (const p of PAPERS) { x -= p.w; if (x <= 0) return p; }
    return PAPERS[0];
  }

  function buildJunkGeometry(B) {
    const pos = [], nrm = [], col = [], mat = [], uvs = [];
    const tri = (a, b, c, color, kind, var1, ua, ub, uc) => {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      for (const [p, u] of [[a, ua], [b, ub], [c, uc]]) {
        pos.push(p[0], p[1], p[2]); nrm.push(nx, ny, nz); col.push(color[0], color[1], color[2]); mat.push(kind, var1); uvs.push(u[0], u[1]);
      }
    };
    for (const sc of B.scraps) {
      const R = rng(sc.seed);
      const P = pickPaper(R);
      const shade = R.range(0.88, 1.06);
      const color = [P.c[0] * shade, P.c[1] * shade, P.c[2] * shade];
      const v = sc.vtx;
      const nr = v.length, ncol = v[0].length;
      // physical extents for print-line uv
      const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      let wv = 0, hv = 0;
      for (let j = 0; j < ncol - 1; j++) wv += dist(v[0][j], v[0][j + 1]);
      for (let i = 0; i < nr - 1; i++) hv += dist(v[i][0], v[i + 1][0]);
      const var1 = R();
      const U = (i, j) => [(j / Math.max(1, ncol - 1)) * wv + var1 * 3, (i / Math.max(1, nr - 1)) * hv];
      for (let i = 0; i < nr - 1; i++)
        for (let j = 0; j < ncol - 1; j++) {
          tri(v[i][j], v[i][j + 1], v[i + 1][j + 1], color, P.k, var1, U(i, j), U(i, j + 1), U(i + 1, j + 1));
          tri(v[i][j], v[i + 1][j + 1], v[i + 1][j], color, P.k, var1, U(i, j), U(i + 1, j + 1), U(i + 1, j));
        }
    }
    for (const d of B.decor || []) {
      const t = d.tris;
      for (let i = 0; i < t.length; i += 9) {
        tri([t[i], t[i + 1], t[i + 2]], [t[i + 3], t[i + 4], t[i + 5]], [t[i + 6], t[i + 7], t[i + 8]], d.color, d.kind, d.var1, [0, 0], [0, 0], [0, 0]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('mat', new THREE.Float32BufferAttribute(mat, 2));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeBoundingSphere();
    return g;
  }

  // ===========================================================================
  // SHADERS
  // ===========================================================================
  const GLSL_LIGHTS = /* glsl */ `
    uniform mat4 uLVP[3];
    uniform vec3 uLPos[3];
    uniform vec3 uLCol[3];
    uniform vec4 uLIn[3];
    uniform vec2 uLSize[3];
    uniform sampler2D uSM0;
    uniform sampler2D uSM1;
    uniform sampler2D uSM2;
    float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float beamShape(vec2 uv, vec4 inn) {
      float fx = smoothstep(inn.x * 0.45, inn.x, uv.x) * (1.0 - smoothstep(inn.y, 1.0 - (1.0 - inn.y) * 0.45, uv.x));
      float fy = smoothstep(inn.z * 0.45, inn.z, uv.y) * (1.0 - smoothstep(inn.w, 1.0 - (1.0 - inn.w) * 0.45, uv.y));
      vec2 c = (uv - 0.5) * 2.0;
      return fx * fy * (1.0 - 0.16 * dot(c, c));
    }
    vec2 lightUV(int k, vec3 P, out float w) {
      vec4 c = uLVP[k] * vec4(P, 1.0);
      w = c.w;
      return c.xy / c.w * 0.5 + 0.5;
    }
    float vis1(sampler2D sm, ivec2 i, ivec2 sz, float d, float bias) {
      vec4 t = texelFetch(sm, clamp(i, ivec2(0), sz - 1), 0);
      return (t.g < 0.5 || d < t.r + bias) ? 1.0 : 0.0;
    }
    float visBil(sampler2D sm, vec2 uv, float d, float bias) {
      ivec2 sz = textureSize(sm, 0);
      vec2 st = uv * vec2(sz) - 0.5;
      ivec2 i0 = ivec2(floor(st));
      vec2 f = fract(st);
      float a = vis1(sm, i0, sz, d, bias), b = vis1(sm, i0 + ivec2(1, 0), sz, d, bias);
      float c = vis1(sm, i0 + ivec2(0, 1), sz, d, bias), e = vis1(sm, i0 + ivec2(1, 1), sz, d, bias);
      return mix(mix(a, b, f.x), mix(c, e, f.x), f.y);
    }
    float visNear(sampler2D sm, vec2 uv, float d, float bias) {
      ivec2 sz = textureSize(sm, 0);
      return vis1(sm, ivec2(uv * vec2(sz)), sz, d, bias);
    }
    float atten(float d) { return 9.0 / (1.5 + d * d * 0.14 + d * 0.35); }
  `;

  // wall: coverage from the light's occlusion map, PCSS-style penumbra from the blocker distance
  const GLSL_WALLSHADOW = /* glsl */ `
    const vec2 PD[12] = vec2[](
      vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
      vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
      vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));
    float wallCover(sampler2D sm, vec2 uv, vec2 sizeM, float d, float lightSize, float extraBlur, float rot) {
      ivec2 sz = textureSize(sm, 0);
      vec2 texel = 1.0 / vec2(sz);
      float bsum = 0.0, bn = 0.0;
      for (int i = 0; i < 6; i++) {
        vec2 o = (i == 0 ? vec2(0.0) : PD[i * 2] * 7.0) * texel;
        vec4 t = texelFetch(sm, clamp(ivec2((uv + o) * vec2(sz)), ivec2(0), sz - 1), 0);
        if (t.g > 0.5) { bsum += t.r; bn += 1.0; }
      }
      float pen = extraBlur;
      if (bn > 0.5) { float db = bsum / bn; pen += min(lightSize * max(d - db, 0.0) / max(db, 0.05), 0.02); }
      vec2 rad = vec2(pen) / sizeM;
      if (max(rad.x * float(sz.x), rad.y * float(sz.y)) < 0.6) return texture(sm, uv).g;
      float cs = cos(rot), sn = sin(rot);
      float acc = texture(sm, uv).g;
      for (int i = 0; i < 12; i++) {
        vec2 p = PD[i];
        p = vec2(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
        acc += texture(sm, uv + p * rad).g;
      }
      return acc / 13.0;
    }
  `;

  const JUNK_VS = /* glsl */ `
    attribute vec3 color;
    attribute vec2 mat;
    varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec2 vUv;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vC = color; vM = mat; vUv = uv;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;
  const JUNK_FS = /* glsl */ `
    uniform vec3 uCamPos; uniform float uAmb; uniform float uBounce;
    varying vec3 vW; varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec2 vUv;
    ${GLSL_LIGHTS}
    vec3 shadeOne(int k, sampler2D sm, vec3 P, vec3 N, vec3 V, float kind, inout vec3 spec) {
      vec3 col = uLCol[k];
      if (dot(col, col) < 1e-6) return vec3(0.0);
      float w; vec2 uv = lightUV(k, P, w);
      if (w <= 0.0 || uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec3(0.0);
      float beam = beamShape(uv, uLIn[k]);
      if (beam <= 0.0) return vec3(0.0);
      vec3 L = uLPos[k] - P; float d = length(L); L /= d;
      float vis = visBil(sm, uv, d, 0.025 + d * 0.004);
      float ndl = dot(N, L);
      float diff = ndl > 0.0 ? ndl : (kind < 2.5 ? -ndl * 0.42 : 0.0); // thin paper glows from behind
      if (kind > 4.5 && kind < 5.5) diff *= 0.45;
      vec3 H = normalize(L + V);
      float sp = kind > 5.5 ? pow(max(dot(N, H), 0.0), 12.0) * 0.08
               : kind > 4.5 ? pow(max(dot(N, H), 0.0), 80.0) * 2.4
               : kind > 3.5 ? pow(max(dot(N, H), 0.0), 40.0) * 0.6
               : pow(max(dot(N, H), 0.0), 18.0) * 0.06;
      float at = min(atten(d), 1.7);
      spec += col * beam * vis * at * sp * step(0.0, ndl);
      return col * beam * vis * at * diff;
    }
    void main() {
      vec3 V = normalize(uCamPos - vW);
      vec3 N = normalize(vN);
      if (!gl_FrontFacing) N = -N;
      float kind = vM.x;
      vec3 alb = vC;
      // office print: faint typed lines on white paper, grid on newsprint
      if (kind < 0.5) {
        float ly = fract(vUv.y * 95.0);
        float lineMask = smoothstep(0.35, 0.5, ly) * (1.0 - smoothstep(0.62, 0.77, ly));
        float word = step(0.28, fract(sin(floor(vUv.x * 38.0) * 12.9898 + floor(vUv.y * 95.0) * 78.233 + vM.y * 40.0) * 43758.5453));
        float margin = step(0.012, fract(vUv.x * 0.9 + vM.y)) ;
        alb *= 1.0 - 0.34 * lineMask * word * margin;
      } else if (kind > 2.5 && kind < 3.5) {
        float g = max(smoothstep(0.9, 1.0, fract(vUv.x * 60.0)), smoothstep(0.9, 1.0, fract(vUv.y * 60.0)));
        alb *= 1.0 - 0.18 * g;
      }
      vec3 spec = vec3(0.0);
      vec3 lit = shadeOne(0, uSM0, vW, N, V, kind, spec) + shadeOne(1, uSM1, vW, N, V, kind, spec) + shadeOne(2, uSM2, vW, N, V, kind, spec);
      // ambient + bounce from the bright wall panels behind (from -z)
      float hemi = 0.5 + 0.5 * N.y;
      vec3 amb = vec3(0.020, 0.019, 0.026) * uAmb * (0.35 + hemi)
               + vec3(0.07, 0.065, 0.06) * uBounce * max(dot(N, vec3(0.0, 0.15, -1.0)), 0.0)
               + vec3(0.11, 0.1, 0.09) * uBounce * max(dot(N, normalize(vec3(-0.35, 0.85, 0.45))), 0.0)
               + vec3(0.03, 0.03, 0.035) * uBounce;
      vec3 c = alb * (lit + amb) + spec;
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const DIST_VS = /* glsl */ `
    varying vec3 vW;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
  `;
  const DIST_FS = /* glsl */ `
    uniform vec3 uL; varying vec3 vW;
    void main() { gl_FragColor = vec4(length(vW - uL), 1.0, 0.0, 1.0); }
  `;

  const ROOM_VS = /* glsl */ `
    varying vec3 vW; varying vec3 vN;
    void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
  `;
  const ROOM_FS = /* glsl */ `
    uniform vec3 uCamPos; uniform float uAmb; uniform float uWZ; uniform float uBounce; uniform float uWallGain;
    varying vec3 vW; varying vec3 vN;
    ${GLSL_LIGHTS}
    ${GLSL_WALLSHADOW}
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = hash12(i), b = hash12(i + vec2(1, 0)), c = hash12(i + vec2(0, 1)), d = hash12(i + vec2(1, 1));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    vec3 wallOne(int k, sampler2D sm, vec3 P, vec3 N, float soft, float rot) {
      vec3 col = uLCol[k];
      if (dot(col, col) < 1e-6) return vec3(0.0);
      float w; vec2 uv = lightUV(k, P, w);
      if (w <= 0.0 || uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec3(0.0);
      float beam = beamShape(uv, uLIn[k]);
      if (beam <= 0.0) return vec3(0.0);
      vec3 L = uLPos[k] - P; float d = length(L); L /= d;
      float cov = wallCover(sm, uv, uLSize[k], d, 0.0025, soft, rot);
      return col * beam * max(dot(N, L), 0.0) * (1.0 - cov) * atten(d) * uWallGain;
    }
    vec3 wallLit(vec3 P, float soft, float rot) {
      vec3 N = vec3(0.0, 0.0, 1.0);
      return wallOne(0, uSM0, P, N, soft, rot) + wallOne(1, uSM1, P, N, soft, rot) + wallOne(2, uSM2, P, N, soft, rot);
    }
    // reflection: 5 wide taps of the occlusion map, no blocker search
    vec3 reflOne(int k, sampler2D sm, vec3 P, float blur) {
      vec3 col = uLCol[k];
      if (dot(col, col) < 1e-6) return vec3(0.0);
      float w; vec2 uv = lightUV(k, P, w);
      if (w <= 0.0 || uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) return vec3(0.0);
      float beam = beamShape(uv, uLIn[k]);
      if (beam <= 0.0) return vec3(0.0);
      vec2 r = vec2(blur) / uLSize[k];
      float cov = (texture(sm, uv).g + texture(sm, uv + vec2(r.x, 0.0)).g + texture(sm, uv - vec2(r.x, 0.0)).g
                 + texture(sm, uv + vec2(0.0, r.y)).g + texture(sm, uv - vec2(0.0, r.y)).g) * 0.2;
      vec3 L = uLPos[k] - P; float d = length(L);
      return col * beam * max(L.z / d, 0.0) * (1.0 - cov) * atten(d) * uWallGain;
    }
    vec3 wallRefl(vec3 P, float blur) { return reflOne(0, uSM0, P, blur) + reflOne(1, uSM1, P, blur) + reflOne(2, uSM2, P, blur); }
    void main() {
      vec3 N = normalize(vN);
      float rot = hash12(gl_FragCoord.xy) * 6.2831;
      vec3 c;
      if (N.z > 0.5) {
        // back wall: warm grey plaster
        float n = vnoise(vW.xy * 3.1) * 0.6 + vnoise(vW.xy * 11.0) * 0.4;
        vec3 alb = vec3(0.42, 0.405, 0.39) * (0.92 + 0.12 * n);
        c = alb * (wallLit(vW, 0.0, rot) + vec3(0.012, 0.011, 0.016) * uAmb);
      } else if (N.y > 0.5) {
        // floor: dark polished concrete, glossy reflection of the lit wall
        float n = vnoise(vW.xz * 1.7) * 0.6 + vnoise(vW.xz * 7.0) * 0.4;
        vec3 alb = vec3(0.05, 0.048, 0.05) * (0.85 + 0.3 * n);
        vec3 V = normalize(vW - uCamPos);
        vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
        vec3 refl = vec3(0.0);
        if (R.z < -0.01) {
          float t = (uWZ - vW.z) / R.z;
          vec3 Q = vW + R * t;
          if (Q.y > 0.0 && Q.y < 9.0) {
            float blur = 0.05 + t * 0.035;
            vec3 a = vec3(0.42, 0.405, 0.39) * wallRefl(Q, blur);
            float fres = 0.05 + 0.5 * pow(1.0 - max(dot(-V, vec3(0.0, 1.0, 0.0)), 0.0), 5.0);
            refl = a * fres * (0.55 + 0.6 * n) * exp(-t * 0.05);
          }
        }
        // light pooling near the wall from the panels
        float nearWall = exp(-(vW.z - uWZ) * 0.55);
        c = alb * (vec3(0.02, 0.019, 0.022) * uAmb + vec3(0.09, 0.085, 0.08) * uBounce * nearWall) + refl;
      } else {
        // side walls and ceiling: almost black
        c = vec3(0.006, 0.005, 0.009) * uAmb + vec3(0.012, 0.011, 0.011) * uBounce;
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const FIX_VS = ROOM_VS;
  const FIX_FS = /* glsl */ `
    uniform vec3 uCamPos; uniform vec3 uEmit; uniform float uAmb; uniform float uBounce; uniform vec3 uBase;
    varying vec3 vW; varying vec3 vN;
    void main() {
      vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
      vec3 V = normalize(uCamPos - vW);
      float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      vec3 c = uBase * (0.012 * uAmb + 0.05 * uBounce * max(dot(N, vec3(0.0, 0.2, -1.0)), 0.0)) + rim * 0.02 * uBounce + uEmit;
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const DUST_VS = /* glsl */ `
    attribute vec4 seed;
    uniform float uT; uniform float uLoop; uniform float uPx;
    varying float vB;
    ${GLSL_LIGHTS}
    void main() {
      float tau = 6.28318530718 / uLoop;
      vec3 P = position + vec3(
        0.09 * sin(uT * tau * (1.0 + floor(seed.x * 2.0)) + seed.y * 6.28),
        0.06 * sin(uT * tau * (1.0 + floor(seed.z * 2.0)) + seed.w * 6.28) + 0.05 * sin(uT * tau + seed.x * 6.28),
        0.09 * cos(uT * tau * (1.0 + floor(seed.y * 2.0)) + seed.z * 6.28));
      float b = 0.0;
      for (int k = 0; k < 3; k++) {
        vec3 col = uLCol[k];
        if (dot(col, col) < 1e-6) continue;
        float w; vec2 uv = lightUV(k, P, w);
        if (w <= 0.0 || uv.x <= 0.0 || uv.x >= 1.0 || uv.y <= 0.0 || uv.y >= 1.0) continue;
        float d = length(uLPos[k] - P);
        float v = k == 0 ? visNear(uSM0, uv, d, 0.03) : (k == 1 ? visNear(uSM1, uv, d, 0.03) : visNear(uSM2, uv, d, 0.03));
        b += beamShape(uv, uLIn[k]) * v * atten(d) * (col.r + col.g + col.b) / 3.0;
      }
      vB = b * (0.35 + 0.65 * seed.w);
      vec4 mv = viewMatrix * vec4(P, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = clamp(uPx * (0.6 + seed.x) / -mv.z, 1.0, 9.0);
    }
  `;
  const DUST_FS = /* glsl */ `
    varying float vB;
    void main() {
      vec2 c = gl_PointCoord - 0.5;
      float a = smoothstep(0.5, 0.0, length(c));
      gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * vB * a * 0.05, 1.0);
    }
  `;

  const QUAD_VS = /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;
  const VOL_FS = /* glsl */ `
    uniform sampler2D uDepth; uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos;
    uniform vec4 uPl[18]; uniform float uT; uniform float uLoop; uniform float uDens;
    uniform sampler3D uNoise;
    varying vec2 vUv;
    ${GLSL_LIGHTS}
    float haze(vec3 P) {
      float tau = 6.28318530718 / uLoop;
      vec3 q = P * 0.33 + vec3(0.21 * sin(uT * tau), 0.13 * cos(uT * tau), 0.17 * sin(uT * tau + 1.3));
      float n = texture(uNoise, q).r * 0.65 + texture(uNoise, q * 2.7 + 0.37).r * 0.35;
      return 0.55 + 0.9 * n * n;
    }
    vec3 march(int k, sampler2D sm, vec3 ro, vec3 rd, float tMax, float jit) {
      vec3 col = uLCol[k];
      if (dot(col, col) < 1e-6) return vec3(0.0);
      float t0 = 0.0, t1 = tMax;
      for (int p = 0; p < 6; p++) {
        vec4 pl = uPl[k * 6 + p];
        float dn = dot(pl.xyz, rd), dist = dot(pl.xyz, ro) + pl.w;
        if (abs(dn) < 1e-6) { if (dist < 0.0) return vec3(0.0); }
        else { float t = -dist / dn; if (dn > 0.0) t0 = max(t0, t); else t1 = min(t1, t); }
      }
      if (t1 <= t0) return vec3(0.0);
      const int N = 22;
      float dt = (t1 - t0) / float(N);
      vec3 acc = vec3(0.0);
      for (int i = 0; i < N; i++) {
        vec3 P = ro + rd * (t0 + (float(i) + jit) * dt);
        float w; vec2 uv = lightUV(k, P, w);
        float beam = beamShape(uv, uLIn[k]);
        if (beam <= 0.0) continue;
        vec3 Ld = P - uLPos[k]; float d = length(Ld);
        float v = visNear(sm, uv, d, 0.02);
        float ph = 0.6 + 0.4 * dot(normalize(Ld), -rd);
        acc += col * (beam * v * atten(d) * haze(P) * ph);
      }
      return acc * dt * uDens;
    }
    void main() {
      float z = texture(uDepth, vUv).r;
      vec4 ndc = vec4(vUv * 2.0 - 1.0, z * 2.0 - 1.0, 1.0);
      vec4 vp = uInvProj * ndc; vp /= vp.w;
      vec3 rdv = normalize(vp.xyz);
      float tMax = length(vp.xyz);
      vec3 rd = normalize(mat3(uCamWorld) * rdv);
      float jit = hash12(gl_FragCoord.xy);
      vec3 c = march(0, uSM0, uCamPos, rd, tMax, jit) + march(1, uSM1, uCamPos, rd, tMax, jit) + march(2, uSM2, uCamPos, rd, tMax, jit);
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  const FINAL_FS = /* glsl */ `
    uniform sampler2D uTex; uniform sampler2D uVol; uniform vec2 uVolTexel; uniform float uExposure; uniform vec2 uRes;
    varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main() {
      vec3 v = texture(uVol, vUv).rgb * 0.4;
      v += (texture(uVol, vUv + vec2(uVolTexel.x, 0.0)).rgb + texture(uVol, vUv - vec2(uVolTexel.x, 0.0)).rgb
          + texture(uVol, vUv + vec2(0.0, uVolTexel.y)).rgb + texture(uVol, vUv - vec2(0.0, uVolTexel.y)).rgb) * 0.15;
      vec3 c = (texture(uTex, vUv).rgb + v) * uExposure;
      vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
      c *= 1.0 - 0.42 * smoothstep(0.35, 1.05, length(q));
      c = aces(c);
      c = pow(c, vec3(1.0 / 2.2));
      gl_FragColor = vec4(c, 1.0);
    }
  `;
  // FXAA (Lottes, console variant) on the graded LDR image, then film grain
  const FXAA_FS = /* glsl */ `
    uniform sampler2D uTex; uniform vec2 uPx; uniform float uFrame;
    varying vec2 vUv;
    float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec3 nw = texture(uTex, vUv + vec2(-1.0, -1.0) * uPx).rgb, ne = texture(uTex, vUv + vec2(1.0, -1.0) * uPx).rgb;
      vec3 sw = texture(uTex, vUv + vec2(-1.0, 1.0) * uPx).rgb, se = texture(uTex, vUv + vec2(1.0, 1.0) * uPx).rgb;
      vec3 m = texture(uTex, vUv).rgb;
      float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, vec2(-8.0), vec2(8.0)) * uPx;
      vec3 a = 0.5 * (texture(uTex, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uTex, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture(uTex, vUv - dir * 0.5).rgb + texture(uTex, vUv + dir * 0.5).rgb);
      float lb = luma(b);
      vec3 c = (lb < lMin || lb > lMax) ? a : b;
      float g = h(gl_FragCoord.xy + vec2(uFrame * 17.0, uFrame * 31.0)) - 0.5;
      c += g * 0.026;
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  // ===========================================================================
  // GL STATE
  // ===========================================================================
  let G = null;
  const Q = { msaa: 0, sm: 1280, vol: 4 };
  function noise3D(n) {
    const data = new Uint8Array(n * n * n);
    const R = rng(seedOf('haze-noise'));
    const lat = new Float32Array(n * n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = R();
    // smooth by box blur (tileable)
    const idx = (x, y, z) => ((z + n) % n) * n * n + ((y + n) % n) * n + ((x + n) % n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          let s = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += lat[idx(x + dx, y + dy, z + dz)];
          data[idx(x, y, z)] = Math.round((s / 27) * 255);
        }
    // stretch contrast
    let lo = 255, hi = 0;
    for (const v of data) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    for (let i = 0; i < data.length; i++) data[i] = Math.round(((data[i] - lo) / Math.max(1, hi - lo)) * 255);
    const tex = new THREE.Data3DTexture(data, n, n, n);
    tex.format = THREE.RedFormat; tex.type = THREE.UnsignedByteType;
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
    tex.unpackAlignment = 1;
    tex.needsUpdate = true;
    return tex;
  }

  function makeFixture(L, target, R) {
    // a profile spot on a tripod: body tube, front lens, yoke, stand
    const grp = new THREE.Group();
    const dir = new THREE.Vector3(target[0] - L[0], target[1] - L[1], target[2] - L[2]).normalize();
    const body = new THREE.Group();
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.5, 20, 1, false), null);
    tube.rotation.x = Math.PI / 2; tube.position.z = 0.27;
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 20), null);
    back.rotation.x = Math.PI / 2; back.position.z = 0.6;
    const fins = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), null);
    fins.rotation.x = Math.PI / 2; fins.position.z = 0.5;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.085, 24), null);
    lens.position.z = 0.015;
    body.add(tube, back, fins);
    body.position.set(L[0], L[1], L[2]);
    body.lookAt(L[0] - dir.x, L[1] - dir.y, L[2] - dir.z); // +z of the group points back, away from the beam
    const lensG = new THREE.Group();
    lensG.add(lens);
    lensG.position.set(L[0], L[1], L[2]);
    lensG.lookAt(L[0] - dir.x, L[1] - dir.y, L[2] - dir.z);
    lens.rotation.y = Math.PI; // face the beam direction
    // stand
    const stand = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, L[1] - 0.12, 8), null);
    pole.position.set(L[0], (L[1] - 0.12) / 2, L[2] + 0.38);
    stand.add(pole);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 6), null);
      const fx = L[0] + Math.cos(a) * 0.36, fz = L[2] + 0.38 + Math.sin(a) * 0.36;
      leg.position.set((fx + L[0]) / 2, 0.22, (fz + L[2] + 0.38) / 2);
      leg.lookAt(L[0], 0.55, L[2] + 0.38);
      leg.rotateX(Math.PI / 2);
      stand.add(leg);
    }
    grp.add(body, stand);
    return { grp, lens, body, fins };
  }

  function offAxis(cam, L, outer, near, far) {
    const D = L[2] - CFG.WZ;
    const l = ((outer[0] - L[0]) * near) / D, r = ((outer[1] - L[0]) * near) / D;
    const b = ((outer[2] - L[1]) * near) / D, t = ((outer[3] - L[1]) * near) / D;
    cam.position.set(L[0], L[1], L[2]);
    cam.rotation.set(0, 0, 0);
    cam.updateMatrixWorld(true);
    cam.projectionMatrix.makePerspective(l, r, t, b, near, far);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  // frustum planes (inside: n·P + w >= 0): 4 sides through the lens, the wall, the lens plane
  function beamPlanes(L, outer) {
    const Lv = new THREE.Vector3(L[0], L[1], L[2]);
    const C = [
      new THREE.Vector3(outer[0], outer[2], CFG.WZ), new THREE.Vector3(outer[1], outer[2], CFG.WZ),
      new THREE.Vector3(outer[1], outer[3], CFG.WZ), new THREE.Vector3(outer[0], outer[3], CFG.WZ),
    ];
    const mid = new THREE.Vector3((outer[0] + outer[1]) / 2, (outer[2] + outer[3]) / 2, CFG.WZ);
    const pls = [];
    for (let i = 0; i < 4; i++) {
      const a = C[i].clone().sub(Lv), b = C[(i + 1) % 4].clone().sub(Lv);
      const n = new THREE.Vector3().crossVectors(a, b).normalize();
      let w = -n.dot(Lv);
      if (n.dot(mid) + w < 0) { n.negate(); w = -w; }
      pls.push(new THREE.Vector4(n.x, n.y, n.z, w));
    }
    pls.push(new THREE.Vector4(0, 0, 1, -CFG.WZ)); // z >= WZ
    pls.push(new THREE.Vector4(0, 0, -1, L[2] - 0.05)); // z <= Lz - 0.05
    return pls;
  }

  function initGL(W, H) {
    const B = build();
    const canvas = makeCanvas(W, H);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;

    const lightU = {
      uLVP: { value: [new THREE.Matrix4(), new THREE.Matrix4(), new THREE.Matrix4()] },
      uLPos: { value: CFG.lights.map((L) => new THREE.Vector3(L.pos[0], L.pos[1], L.pos[2])) },
      uLCol: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uLIn: { value: CFG.lights.map(() => new THREE.Vector4()) },
      uLSize: { value: CFG.lights.map(() => new THREE.Vector2()) },
      uSM0: { value: null }, uSM1: { value: null }, uSM2: { value: null },
    };
    // projector cameras + occlusion maps
    const proj = CFG.lights.map((L, k) => {
      const outer = outerOf(L);
      const ow = outer[1] - outer[0], oh = outer[3] - outer[2];
      const sw = Math.min(Q.sm, Math.round((ow / Math.max(ow, oh)) * Q.sm)), sh = Math.round((sw * oh) / ow);
      const rt = new THREE.WebGLRenderTarget(sw, sh, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, generateMipmaps: false });
      const cam = new THREE.PerspectiveCamera();
      offAxis(cam, L.pos, outer, 0.05, L.pos[2] - CFG.WZ + 1);
      lightU.uLIn.value[k].set(L.margin / ow, 1 - L.margin / ow, L.margin / oh, 1 - L.margin / oh);
      lightU.uLSize.value[k].set(ow, oh);
      lightU.uLVP.value[k].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      return { rt, cam, outer, planes: beamPlanes(L.pos, outer) };
    });
    lightU.uSM0.value = proj[0].rt.texture; lightU.uSM1.value = proj[1].rt.texture; lightU.uSM2.value = proj[2].rt.texture;

    const scene = new THREE.Scene();
    const common = { uCamPos: { value: new THREE.Vector3() }, uAmb: { value: 1 }, uBounce: { value: 0 } };
    // junk
    const junkGeo = buildJunkGeometry(B);
    const junkMat = new THREE.ShaderMaterial({ vertexShader: JUNK_VS, fragmentShader: JUNK_FS, uniforms: Object.assign({}, lightU, common), side: THREE.DoubleSide });
    const junk = new THREE.Mesh(junkGeo, junkMat);
    const junkPivot = new THREE.Group();
    junkPivot.position.set(CFG.O[0], CFG.O[1], CFG.O[2]);
    junkPivot.add(junk);
    scene.add(junkPivot);
    const distMat = new THREE.ShaderMaterial({ vertexShader: DIST_VS, fragmentShader: DIST_FS, uniforms: { uL: { value: new THREE.Vector3() } }, side: THREE.DoubleSide });

    // room
    const roomMat = new THREE.ShaderMaterial({ vertexShader: ROOM_VS, fragmentShader: ROOM_FS, uniforms: Object.assign({}, lightU, common, { uWZ: { value: CFG.WZ }, uWallGain: { value: 2.9 } }) });
    const room = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), roomMat); wall.position.set(0, 5, CFG.WZ);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), roomMat); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 7);
    const lw = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), roomMat); lw.rotation.y = Math.PI / 2; lw.position.set(-12, 5, 7);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), roomMat); rw.rotation.y = -Math.PI / 2; rw.position.set(12, 5, 7);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), roomMat); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 9.5, 7);
    room.add(wall, floor, lw, rw, ceil);
    scene.add(room);

    // fixtures
    const fixMats = [];
    const fixtures = CFG.lights.map((L, k) => {
      const o = outerOf(L);
      const f = makeFixture(L.pos, [(o[0] + o[1]) / 2, (o[2] + o[3]) / 2, CFG.WZ], null);
      const bodyMat = new THREE.ShaderMaterial({ vertexShader: FIX_VS, fragmentShader: FIX_FS, uniforms: Object.assign({}, common, { uEmit: { value: new THREE.Vector3() }, uBase: { value: new THREE.Vector3(0.12, 0.12, 0.13) } }), side: THREE.DoubleSide });
      const lensMat = new THREE.ShaderMaterial({ vertexShader: FIX_VS, fragmentShader: FIX_FS, uniforms: Object.assign({}, common, { uEmit: { value: new THREE.Vector3() }, uBase: { value: new THREE.Vector3(0.1, 0.1, 0.12) } }), side: THREE.DoubleSide });
      f.grp.traverse((o2) => { if (o2.isMesh) o2.material = bodyMat; });
      f.lens.material = lensMat;
      const ventMat = new THREE.ShaderMaterial({ vertexShader: FIX_VS, fragmentShader: FIX_FS, uniforms: Object.assign({}, common, { uEmit: { value: new THREE.Vector3() }, uBase: { value: new THREE.Vector3(0.1, 0.1, 0.1) } }), side: THREE.DoubleSide });
      f.fins.material = ventMat;
      scene.add(f.grp);
      scene.add(f.lens.parent);
      fixMats.push({ bodyMat, lensMat, ventMat });
      return f;
    });

    // dust motes, seeded inside the beams
    const DR = rng(seedOf('dust'));
    const dpos = [], dseed = [];
    for (let i = 0; i < 2600; i++) {
      const k = i % 3;
      const L = CFG.lights[k].pos, o = outerOf(CFG.lights[k]);
      const wx = DR.range(o[0], o[1]), wy = DR.range(o[2], o[3]);
      const s = Math.pow(DR(), 0.8) * 0.97 + 0.02;
      dpos.push(L[0] + (wx - L[0]) * s, L[1] + (wy - L[1]) * s, L[2] + (CFG.WZ - L[2]) * s);
      dseed.push(DR(), DR(), DR(), DR());
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(dpos, 3));
    dg.setAttribute('seed', new THREE.Float32BufferAttribute(dseed, 4));
    const dustMat = new THREE.ShaderMaterial({ vertexShader: DUST_VS, fragmentShader: DUST_FS, uniforms: Object.assign({}, lightU, { uT: { value: 0 }, uLoop: { value: 8 / 3 }, uPx: { value: 30 } }), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    const dust = new THREE.Points(dg, dustMat);
    dust.frustumCulled = false;
    scene.add(dust);

    const camera = new THREE.PerspectiveCamera(33, W / H, 0.1, 80);

    // render targets
    const depthTex = new THREE.DepthTexture(W, H);
    depthTex.type = THREE.UnsignedIntType;
    const sceneRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: Q.msaa, depthTexture: depthTex, depthBuffer: true });
    const VW = Math.round(W / Q.vol), VH = Math.round(H / Q.vol);
    const volRT = new THREE.WebGLRenderTarget(VW, VH, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

    const quadGeo = new THREE.PlaneGeometry(2, 2);
    const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mkQuad = (fs, uniforms) => {
      const m = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
      const sc = new THREE.Scene();
      const mesh = new THREE.Mesh(quadGeo, m); mesh.frustumCulled = false;
      sc.add(mesh);
      return { scene: sc, mat: m };
    };
    const planesFlat = [];
    for (const p of proj) for (const v of p.planes) planesFlat.push(v);
    const volQ = mkQuad(VOL_FS, Object.assign({}, lightU, {
      uDepth: { value: depthTex }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
      uPl: { value: planesFlat }, uT: { value: 0 }, uLoop: { value: 8 / 3 }, uDens: { value: 0.03 }, uNoise: { value: noise3D(32) },
    }));
    const finalQ = mkQuad(FINAL_FS, { uTex: { value: sceneRT.texture }, uVol: { value: volRT.texture }, uVolTexel: { value: new THREE.Vector2(1 / VW, 1 / VH) }, uExposure: { value: 1.0 }, uRes: { value: new THREE.Vector2(W, H) } });
    const ldrRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    const fxaaQ = mkQuad(FXAA_FS, { uTex: { value: ldrRT.texture }, uPx: { value: new THREE.Vector2(1 / W, 1 / H) }, uFrame: { value: 0 } });
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(Math.round(W / 2), Math.round(H / 2)), 0.45, 0.55, 1.3);

    G = { W, H, canvas, renderer, scene, camera, junk, junkPivot, junkMat, distMat, room, roomMat, fixtures, fixMats, dust, dustMat, proj, lightU, common, sceneRT, volRT, volQ, finalQ, ldrRT, fxaaQ, bloom, B };
    return G;
  }

  function render(T, opts) {
    const W = Math.round((FILM.W || 1920) * (FILM.S || 1)), H = Math.round((FILM.H || 1080) * (FILM.S || 1));
    if (!G || G.W !== W || G.H !== H) initGL(W, H);
    const st = state(T);
    if (opts && opts.yaw != null) st.yaw = opts.yaw;
    if (opts && opts.lights) st.lights = opts.lights;
    if (opts && opts.cam) st.cam = opts.cam;
    const { renderer, scene, camera } = G;
    // pose
    G.junkPivot.rotation.set(st.pitch || 0, st.yaw, st.roll || 0, 'ZXY');
    G.junkPivot.position.set(CFG.O[0], CFG.O[1] + st.h, CFG.O[2]);
    G.junkPivot.updateMatrixWorld(true);
    // lights
    let bounce = 0;
    CFG.lights.forEach((L, k) => {
      const I = st.lights[k] * 1.0;
      G.lightU.uLCol.value[k].set(L.col[0] * I, L.col[1] * I, L.col[2] * I);
      G.fixMats[k].lensMat.uniforms.uEmit.value.set(L.col[0] * I * 9.0 + 0.004, L.col[1] * I * 9.0 + 0.004, L.col[2] * I * 9.0 + 0.005);
      G.fixMats[k].ventMat.uniforms.uEmit.value.set(0.0, 0.0, 0.0);
      bounce += I;
    });
    G.common.uBounce.value = bounce / 3;
    G.common.uAmb.value = st.ambient;
    // 1. occlusion maps: only the junk, distance to the lens in R, coverage in G
    const skip = (opts && opts.skip) || {};
    G.room.visible = false; G.dust.visible = false;
    G.fixtures.forEach((f) => { f.grp.visible = false; f.lens.parent.visible = false; });
    scene.overrideMaterial = G.distMat;
    renderer.setClearColor(0x000000, 0);
    if (!skip.shadow) CFG.lights.forEach((L, k) => {
      G.distMat.uniforms.uL.value.set(L.pos[0], L.pos[1], L.pos[2]);
      renderer.setRenderTarget(G.proj[k].rt);
      renderer.clear(true, true, true);
      renderer.render(scene, G.proj[k].cam);
    });
    scene.overrideMaterial = null;
    G.room.visible = true; G.dust.visible = true;
    G.fixtures.forEach((f) => { f.grp.visible = true; f.lens.parent.visible = true; });
    // 2. camera + scene
    camera.fov = st.cam.fov; camera.aspect = W / H; camera.near = 0.1; camera.far = 80;
    camera.position.set(st.cam.pos[0], st.cam.pos[1], st.cam.pos[2]);
    camera.lookAt(st.cam.look[0], st.cam.look[1], st.cam.look[2]);
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    G.common.uCamPos.value.copy(camera.position);
    G.dustMat.uniforms.uT.value = T;
    renderer.setRenderTarget(G.sceneRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, true, true);
    if (skip.junk) G.junkPivot.visible = false;
    if (skip.room) G.room.visible = false;
    if (!skip.scene) renderer.render(scene, camera);
    G.junkPivot.visible = true; G.room.visible = true;
    // 3. volumetric haze in the beams (quarter res)
    const vu = G.volQ.mat.uniforms;
    vu.uInvProj.value.copy(camera.projectionMatrixInverse);
    vu.uCamWorld.value.copy(camera.matrixWorld);
    vu.uCamPos.value.copy(camera.position);
    vu.uT.value = T;
    renderer.setRenderTarget(G.volRT);
    if (!skip.vol) renderer.render(G.volQ.scene, renderer._q || (renderer._q = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)));
    // 4. composite, bloom, grade
    if (!skip.bloom) G.bloom.render(renderer, null, G.sceneRT, 0, false);
    renderer.setRenderTarget(G.ldrRT);
    renderer.render(G.finalQ.scene, renderer._q);
    G.fxaaQ.mat.uniforms.uFrame.value = Math.round(T * (FILM.FPS || 30));
    renderer.setRenderTarget(null);
    renderer.render(G.fxaaQ.scene, renderer._q);
    return G.canvas;
  }

  function draw(ctx, T, opts) {
    const cv = render(T, opts);
    ctx.save();
    if (FILM.baseTransform) FILM.baseTransform(ctx);
    ctx.drawImage(cv, 0, 0, FILM.W || 1920, FILM.H || 1080);
    ctx.restore();
  }

  // ===========================================================================
  // DECOR — bulky junk accepted only where it obeys every constraint
  // ===========================================================================
  function soup(geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(m);
    return Array.from(g.attributes.position.array);
  }
  function merge(parts) { let out = []; for (const p of parts) out = out.concat(p); return out; }
  const M4 = () => new THREE.Matrix4();
  const ITEM_KINDS = {
    paperBall(R) {
      const r = R.range(0.035, 0.07);
      const g = new THREE.IcosahedronGeometry(r, 1);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const k = 0.72 + 0.5 * R();
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
      }
      return { tris: soup(g, M4()), color: R.pick([[0.82, 0.81, 0.77], [0.86, 0.8, 0.64], [0.9, 0.9, 0.88], [0.93, 0.8, 0.22]]), kind: 0 };
    },
    pencil(R) {
      const L = R.range(0.12, 0.19);
      const body = new THREE.CylinderGeometry(0.0045, 0.0045, L, 6, 1);
      const tip = new THREE.ConeGeometry(0.0045, 0.022, 6); tip.translate(0, L / 2 + 0.011, 0);
      const cap = new THREE.CylinderGeometry(0.0047, 0.0047, 0.012, 6); cap.translate(0, -L / 2 - 0.006, 0);
      const col = R.pick([[0.85, 0.6, 0.08], [0.85, 0.6, 0.08], [0.08, 0.2, 0.5], [0.6, 0.06, 0.08], [0.1, 0.1, 0.1]]);
      return { tris: merge([soup(body, M4()), soup(tip, M4()), soup(cap, M4())]), color: col, kind: 4 };
    },
    keycap(R) {
      const g = new THREE.BoxGeometry(0.018, 0.011, 0.018);
      return { tris: soup(g, M4()), color: R() < 0.7 ? [0.1, 0.1, 0.11] : [0.78, 0.78, 0.76], kind: 4 };
    },
    clip(R) {
      // paper clip: wire loops
      const w = 0.009, Lc = R.range(0.03, 0.045);
      const pts = [[0, -Lc / 2 + w], [0, Lc / 2 - w * 0.5], [w * 0.5, Lc / 2], [w, Lc / 2 - w * 0.5], [w, -Lc / 2 + w * 0.6], [w * 0.25, -Lc / 2 + w * 0.2], [-w * 0.5, -Lc / 2 + w * 0.6], [-w * 0.5, Lc / 2 - w * 1.5]];
      const curve = new THREE.CatmullRomCurve3(pts.map((q) => new THREE.Vector3(q[0], q[1], 0)), false, 'catmullrom', 0.2);
      const g = new THREE.TubeGeometry(curve, 14, 0.0012, 3, false);
      return { tris: soup(g, M4()), color: R.pick([[0.6, 0.6, 0.62], [0.6, 0.6, 0.62], [0.85, 0.15, 0.6], [0.1, 0.7, 0.85]]), kind: 5 };
    },
    gear(R) {
      const r = R.range(0.025, 0.07), n = Math.max(8, Math.round(r * 260));
      const sh = new THREE.Shape();
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, w = (Math.PI * 2) / n;
        const pts = [[r * 0.82, a0], [r * 0.82, a0 + w * 0.25], [r, a0 + w * 0.35], [r, a0 + w * 0.65], [r * 0.82, a0 + w * 0.75]];
        for (let k = 0; k < pts.length; k++) {
          const x = Math.cos(pts[k][1]) * pts[k][0], y = Math.sin(pts[k][1]) * pts[k][0];
          if (i === 0 && k === 0) sh.moveTo(x, y); else sh.lineTo(x, y);
        }
      }
      const hole = new THREE.Path(); hole.absarc(0, 0, r * 0.22, 0, Math.PI * 2, true); sh.holes.push(hole);
      const g = new THREE.ExtrudeGeometry(sh, { depth: r * 0.16, bevelEnabled: false, curveSegments: 6 });
      return { tris: soup(g, M4()), color: R() < 0.5 ? [0.72, 0.52, 0.22] : [0.62, 0.62, 0.64], kind: 5 };
    },
    mug(R) {
      const prof = [[0.0, -0.05], [0.042, -0.05], [0.045, -0.045], [0.046, 0.05], [0.041, 0.05], [0.040, -0.04], [0.0, -0.04]].map((q) => new THREE.Vector2(q[0], q[1]));
      const g = new THREE.LatheGeometry(prof, 18);
      const h = new THREE.TorusGeometry(0.024, 0.006, 6, 12, Math.PI * 1.15); h.rotateZ(-Math.PI * 0.575); h.translate(0.046, 0.0, 0);
      return { tris: merge([soup(g, M4()), soup(h, M4())]), color: R.pick([[0.8, 0.78, 0.74], [0.85, 0.12, 0.6], [0.06, 0.06, 0.07]]), kind: 4 };
    },
    disc(R) {
      const g = new THREE.RingGeometry(0.0075, 0.06, 28, 1);
      return { tris: soup(g, M4()), color: [0.72, 0.74, 0.8], kind: 5 };
    },
    floppy(R) {
      const g = new THREE.BoxGeometry(0.09, 0.093, 0.0033);
      const sh = new THREE.BoxGeometry(0.045, 0.03, 0.0036); sh.translate(0.0, 0.031, 0);
      return { tris: merge([soup(g, M4()), soup(sh, M4())]), color: R.pick([[0.05, 0.07, 0.12], [0.1, 0.1, 0.1], [0.5, 0.08, 0.35]]), kind: 4 };
    },
    stapler(R) {
      const a = new THREE.BoxGeometry(0.16, 0.022, 0.04); a.translate(0, 0.0, 0);
      const b = new THREE.BoxGeometry(0.15, 0.018, 0.034); b.rotateZ(0.12); b.translate(0.004, 0.026, 0);
      return { tris: merge([soup(a, M4()), soup(b, M4())]), color: R.pick([[0.05, 0.05, 0.06], [0.6, 0.06, 0.08]]), kind: 4 };
    },
    mouse(R) {
      const g = new THREE.SphereGeometry(0.03, 12, 8); g.scale(1, 0.55, 1.75);
      return { tris: soup(g, M4()), color: R.pick([[0.08, 0.08, 0.09], [0.75, 0.75, 0.74]]), kind: 4 };
    },
    cable(R) {
      const n = 5, pts = [];
      let x = 0, y = 0, z = 0, dx = R.range(-1, 1), dy = R.range(-1, 1), dz = R.range(-1, 1);
      for (let i = 0; i < n; i++) {
        pts.push(new THREE.Vector3(x, y, z));
        dx += R.range(-0.9, 0.9); dy += R.range(-0.9, 0.9); dz += R.range(-0.9, 0.9);
        const l = Math.hypot(dx, dy, dz) || 1;
        const st = R.range(0.06, 0.12);
        x += (dx / l) * st; y += (dy / l) * st; z += (dz / l) * st;
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, 18, R.range(0.003, 0.0055), 4, false);
      return { tris: soup(g, M4()), color: R.pick([[0.02, 0.02, 0.022], [0.02, 0.02, 0.022], [0.75, 0.75, 0.72], [0.9, 0.15, 0.55], [0.1, 0.65, 0.85]]), kind: 6 };
    },
    rubberBand(R) {
      const g = new THREE.TorusGeometry(R.range(0.015, 0.025), 0.0018, 3, 12);
      return { tris: soup(g, M4()), color: R.pick([[0.8, 0.5, 0.2], [0.9, 0.2, 0.25], [0.2, 0.5, 0.85]]), kind: 6 };
    },
    keyboard(R) {
      const base = new THREE.BoxGeometry(0.44, 0.025, 0.15);
      const parts = [soup(base, M4())];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 14; c++) {
        const k = new THREE.BoxGeometry(0.024, 0.012, 0.024); k.translate(-0.2 + c * 0.0305, 0.018, -0.052 + r * 0.033); parts.push(soup(k, M4()));
      }
      return { tris: merge(parts), color: R.pick([[0.07, 0.07, 0.08], [0.72, 0.72, 0.7]]), kind: 4 };
    },
    binder(R) {
      const a = new THREE.BoxGeometry(0.29, 0.32, 0.006); a.translate(0, 0, -0.03);
      const b = new THREE.BoxGeometry(0.29, 0.32, 0.006); b.rotateY(R.range(0.2, 1.2)); b.translate(0.0, 0, 0.03);
      const sp = new THREE.BoxGeometry(0.006, 0.32, 0.06); sp.translate(-0.145, 0, 0);
      return { tris: merge([soup(a, M4()), soup(b, M4()), soup(sp, M4())]), color: R.pick([[0.08, 0.12, 0.35], [0.5, 0.06, 0.08], [0.06, 0.06, 0.07], [0.85, 0.12, 0.6], [0.05, 0.55, 0.7]]), kind: 4 };
    },
    book(R) {
      const g = new THREE.BoxGeometry(R.range(0.15, 0.22), R.range(0.21, 0.27), R.range(0.015, 0.04));
      return { tris: soup(g, M4()), color: R.pick([[0.6, 0.55, 0.45], [0.2, 0.25, 0.4], [0.55, 0.2, 0.12], [0.8, 0.78, 0.72]]), kind: 2 };
    },
    phone(R) {
      const b = new THREE.BoxGeometry(0.2, 0.06, 0.18);
      const h = new THREE.BoxGeometry(0.21, 0.04, 0.05); h.translate(0, 0.06, -0.04);
      return { tris: merge([soup(b, M4()), soup(h, M4())]), color: [0.08, 0.08, 0.09], kind: 4 };
    },
    lamp(R) {
      const a = new THREE.CylinderGeometry(0.008, 0.008, 0.32, 6); a.rotateZ(0.5); a.translate(0.08, 0.15, 0);
      const b = new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6); b.rotateZ(-0.7); b.translate(0.1, 0.42, 0);
      const sh = new THREE.ConeGeometry(0.07, 0.11, 14, 1, true); sh.rotateZ(2.3); sh.translate(-0.03, 0.52, 0);
      const ba = new THREE.CylinderGeometry(0.07, 0.08, 0.02, 14);
      return { tris: merge([soup(a, M4()), soup(b, M4()), soup(sh, M4()), soup(ba, M4())]), color: R.pick([[0.05, 0.05, 0.06], [0.75, 0.74, 0.7]]), kind: 4 };
    },
    sheet(R) {
      // an A4-ish sheet, folded once or crumpled into a few facets
      const w = 0.21 * R.range(0.4, 1), h = 0.297 * R.range(0.35, 1);
      const g = new THREE.PlaneGeometry(w, h, 3, 4);
      const p = g.attributes.position;
      const fold = R.range(-0.9, 0.9);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        p.setZ(i, Math.abs(x) * fold * 0.6 + (R() - 0.5) * 0.02 + Math.sin(y * 9) * 0.008);
      }
      return { tris: soup(g, M4()), color: R.pick([[0.82, 0.81, 0.77], [0.86, 0.8, 0.64], [0.9, 0.9, 0.88]]), kind: 0 };
    },
    notepad(R) {
      const g = new THREE.BoxGeometry(0.076, 0.076, R.range(0.004, 0.012));
      return { tris: soup(g, M4()), color: R.pick([[0.93, 0.8, 0.22], [0.95, 0.32, 0.72], [0.32, 0.82, 0.92]]), kind: 1 };
    },
  };
  const ITEM_PLAN = [['keyboard', 3], ['binder', 8], ['book', 8], ['phone', 3], ['lamp', 2], ['paperBall', 220], ['pencil', 90], ['keycap', 160], ['clip', 120], ['gear', 60], ['mug', 8], ['disc', 14], ['floppy', 18], ['stapler', 6], ['mouse', 8], ['cable', 90], ['rubberBand', 40], ['notepad', 30], ['sheet', 120],
    // fill the hollow heart of the cloud with small junk that fits between the beams
    ['paperBall', 140, 'core'], ['keycap', 90, 'core'], ['sheet', 70, 'core'], ['clip', 50, 'core'], ['notepad', 24, 'core'], ['pencil', 36, 'core'], ['gear', 20, 'core']];

  // one recognisable object per zone, placed on the light ray through the zone so its shadow lands there at
  // that lock — and validated against every other lock like everything else
  function buildZoneItems(B) {
    ZONE_MODE = true;
    const out = [];
    B.zoneStats = [];
    const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), v = new THREE.Vector3();
    CFG.targets.forEach((T, ci) => {
      (T.zones || []).forEach((z, zi) => {
        const c = B.cons[ci];
        const R = rng(seedOf('zone', T.id, zi));
        let done = false, tries = 0;
        while (!done && tries < 2500) {
          tries++;
          const it = ITEM_KINDS[z.item](R);
          const sc = z.scale || 1;
          const a = R() * Math.PI * 2, rr = Math.sqrt(R()) * z.r * 0.35;
          const wx = z.x + Math.cos(a) * rr, wy = z.y + Math.sin(a) * rr;
          const sv = R.range(z.s0 || 0.1, z.s1 || 0.3);
          const qo = liftToObj(c, wx, wy, sv, [0, 0, 0]);
          if (!insideCloud(qo[0], qo[1], qo[2], 0.25)) continue;
          if (z.face) {
            // face the light so the silhouette reads (rotate about the light ray only)
            e.set(R.range(-0.25, 0.25), R.range(-0.25, 0.25), z.roll != null ? R.range(-z.roll, z.roll) : R() * 6.283);
          } else e.set(R() * 6.283, R() * 6.283, R() * 6.283);
          q.setFromEuler(e);
          // undo the pose yaw so 'face' is relative to the world at this lock
          q.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -c.yaw));
          m.compose(new THREE.Vector3(qo[0], qo[1], qo[2]), q, new THREE.Vector3(sc, sc, sc));
          const t = it.tris, pts = new Array(t.length);
          let ok = true;
          for (let i = 0; i < t.length && ok; i += 3) {
            v.set(t[i], t[i + 1], t[i + 2]).applyMatrix4(m);
            pts[i] = v.x; pts[i + 1] = v.y; pts[i + 2] = v.z;
            if (!okAll(v.x, v.y, v.z, -1)) ok = false;
          }
          if (ok) for (let i = 0; i < t.length && ok; i += 9) {
            const ax = pts[i], ay = pts[i + 1], az = pts[i + 2], bx = pts[i + 3], by = pts[i + 4], bz = pts[i + 5], cx = pts[i + 6], cy = pts[i + 7], cz = pts[i + 8];
            const ee = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
            const n = Math.max(1, Math.ceil(ee / 0.006));
            for (let aa = 0; aa <= n && ok; aa++)
              for (let bb = 0; aa + bb <= n && ok; bb++) {
                const u = aa / n, w = bb / n, r0 = 1 - u - w;
                if (!okAll(ax * r0 + bx * u + cx * w, ay * r0 + by * u + cy * w, az * r0 + bz * u + cz * w, -1)) ok = false;
              }
          }
          if (!ok) continue;
          out.push({ name: z.item + '@' + T.id, tris: pts, color: it.color, kind: it.kind, var1: R() });
          done = true;
        }
        B.zoneStats.push(T.id + ':' + z.item + ':' + (done ? 'ok@' + tries : 'FAIL'));
      });
    });
    ZONE_MODE = false;
    return out;
  }

  function buildDecor(B) {
    const out = [];
    const stats = {};
    const q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), sc = new THREE.Vector3(1, 1, 1), tp = new THREE.Vector3();
    for (const [name, count, zone] of ITEM_PLAN) {
      const R = rng(seedOf('decor', name, zone || ''));
      let placed = 0, tries = 0;
      while (placed < count && tries < count * 60) {
        tries++;
        const it = ITEM_KINDS[name](R);
        // position: uniform in the cloud, denser toward the middle
        let x, y, z;
        do { x = R.range(-1, 1); y = R.range(-1, 1); z = R.range(-1, 1); } while (x * x + y * y + z * z > 1);
        const k = zone === 'core' ? 0.55 * Math.pow(R(), 0.4) : Math.pow(R(), 0.5);
        tp.set(x * CFG.R * 0.96 * k, y * CFG.RY * 0.96 * k, z * CFG.R * 0.96 * k);
        e.set(R() * 6.283, R() * 6.283, R() * 6.283); q.setFromEuler(e);
        m.compose(tp, q, sc);
        const t = it.tris;
        const v = new THREE.Vector3();
        const pts = new Array(t.length);
        let ok = true;
        for (let i = 0; i < t.length && ok; i += 3) {
          v.set(t[i], t[i + 1], t[i + 2]).applyMatrix4(m);
          pts[i] = v.x; pts[i + 1] = v.y; pts[i + 2] = v.z;
          if (!insideCloud(v.x, v.y, v.z, 0.05) || !okAll(v.x, v.y, v.z, -1)) ok = false;
        }
        // dense barycentric sampling so no face can bridge a gap between letters
        if (ok) for (let i = 0; i < t.length && ok; i += 9) {
          const ax = pts[i], ay = pts[i + 1], az = pts[i + 2], bx = pts[i + 3], by = pts[i + 4], bz = pts[i + 5], cx = pts[i + 6], cy = pts[i + 7], cz = pts[i + 8];
          const e = Math.max(Math.hypot(bx - ax, by - ay, bz - az), Math.hypot(cx - ax, cy - ay, cz - az), Math.hypot(cx - bx, cy - by, cz - bz));
          const n = Math.max(1, Math.ceil(e / 0.008));
          for (let a = 0; a <= n && ok; a++)
            for (let b = 0; a + b <= n && ok; b++) {
              const u = a / n, w = b / n, r = 1 - u - w;
              if (!okAll(ax * r + bx * u + cx * w, ay * r + by * u + cy * w, az * r + bz * u + cz * w, -1)) ok = false;
            }
        }
        if (!ok) continue;
        {
          const rho = Math.hypot(tp.x, tp.z);
          for (const L of CFG.lights) {
            const rl = Math.hypot(L.pos[0] - CFG.O[0], L.pos[2] - CFG.O[2]);
            if (Math.hypot(rl - rho, L.pos[1] - CFG.O[1] - tp.y) < 1.15) { ok = false; break; }
          }
        }
        if (!ok) continue;
        out.push({ name, tris: pts, color: it.color, kind: it.kind, var1: R() });
        placed++;
      }
      stats[name + (zone ? '-' + zone : '')] = placed + '/' + count;
    }
    B.decorStats = stats;
    return out;
  }

  // debug: fraction of the cloud volume that is free (obeys every constraint), per height slice
  function freeStats() {
    build();
    const out = [];
    for (let iy = -5; iy <= 5; iy++) {
      const y = (iy / 5) * CFG.RY * 0.95;
      let tot = 0, free = 0;
      for (let ix = -20; ix <= 20; ix++)
        for (let iz = -20; iz <= 20; iz++) {
          const x = (ix / 20) * CFG.R, z = (iz / 20) * CFG.R;
          if (!insideCloud(x, y, z, 0)) continue;
          tot++;
          if (okAll(x, y, z, -1)) free++;
        }
      out.push([y.toFixed(2), tot, (free / Math.max(1, tot)).toFixed(2)]);
    }
    return out;
  }

  FILM.shadow = { Q, CFG, build, project, rng, seedOf, DEG, hullCoverage, hullImage, state, render, draw, yawAt, freeStats };
})();
