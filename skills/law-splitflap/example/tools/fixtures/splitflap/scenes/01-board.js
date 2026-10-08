/*
 * 01-board.js : the departure board. ONE continuous take — every shot of the timeline draws the
 * same giant Solari split-flap board at global time T; the shots are only chapters of its schedule.
 *
 * The law: everything on screen is a flap. 36 x 14 = 504 modules, each a drum of 72 flaps:
 *   [blank, 62 printed glyphs, 8 takeoff-picture flaps P1..P8, 1 card flap]  (cyclic)
 * A glyph flap carries a printed character (top half on its front, bottom half of the NEXT flap on
 * its back, exactly like a real drum). A picture flap carries THIS module's tile of a picture, so a
 * picture exists only as a mosaic of 504 tiles. A module can only advance one flap at a time
 * (RATE flaps per second): to go from A to Z it clatters through everything in between.
 *
 * Layers (back to front): wall, board bezel, 504 module housings + hinge pins, static top flaps,
 * static bottom flaps, falling flaps (rotating about the hinge, with bounce), post (DOF, bloom,
 * vignette, grain). Everything is a pure function of T: the per-module flip schedule is planned once
 * at load from the script (deterministic), and each frame rebuilds every instance from it.
 *
 * The drum, the flip physics and the schedule are in src/cast.js (FILM.board), shared with the score.
 */
(function () {
  'use strict';
  const LIB = FILM.lib;
  const TL = FILM.TIMELINE;
  const SCRIPT = TL.boardScript || 'film';
  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, u) => a + (b - a) * u;
  // the board's mechanics and schedule live in src/cast.js (shared with the score)
  const B = FILM.board;
  const { COLS, ROWS, NMOD, PX, PY, FW, FH, HG, FACE_H, TH_TOP, TH_BOT, mx, my, IX0, IX1, IY0, IY1, IASP } = B;
  const { CHARS, NG, P0, NP, CARD, LAYOUT, MODS } = B;
  const stateAt = B.stateAt;
  B.plan();
  const BEAT = 60 / (TL.bpm || 112.5);
  const BAR = 4 * BEAT;
  const b = B.beatTime;


  // ------------------------------------------------------------------ printed art (canvas)
  const FLAP_HEX = '#141217';
  const INK_HEX = '#f2ede0';
  const GC = 8; // glyph atlas grid
  const GW = 128;
  const GH = Math.round((GW * FACE_H) / FW); // 180
  // the printed art is rasterised on the CPU (willReadFrequently): the GPU canvas path did not
  // hash identically from run to run on long translucent strokes (the contrail)
  const CPU2D = { willReadFrequently: true };
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  function glyphAtlas() {
    const cv = makeCanvas(GW * GC, GH * GC);
    const g = cv.getContext('2d', CPU2D);
    g.fillStyle = '#000';
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const size = Math.round(GH * 0.86);
    g.font = `700 condensed ${size}px "Helvetica Neue"`;
    const capH = size * 0.714; // Helvetica Neue cap height
    for (let i = 1; i < NG; i++) {
      const ch = CHARS[i];
      const cx = (i % GC) * GW + GW / 2;
      const cy = Math.floor(i / GC) * GH;
      const base = cy + GH / 2 + capH / 2; // cap height centred on the hinge
      const w = g.measureText(ch).width;
      const maxW = GW * 0.86;
      g.save();
      g.translate(cx, base);
      if (w > maxW) g.scale(maxW / w, 1);
      g.fillText(ch, 0, 0);
      g.restore();
    }
    return cv;
  }

  // picture space: the full board face area, x right, y up, in world units; the canvas maps it
  const PW = 2048;
  const PROWS = 3; // picture atlases: two canvases of 2 x 3 frames (frames 0-5 and 6-10)
  const PH = Math.round(PW / IASP);
  function picCtx(g, W, H) {
    // returns helpers to draw in board units: X(col) etc.
    return {
      W,
      H,
      colX: (c) => ((mx(c) - IX0) / (IX1 - IX0)) * W, // module centre
      rowY: (r) => ((IY1 - my(r)) / (IY1 - IY0)) * H,
      mw: (FW / (IX1 - IX0)) * W, // one module face width in px
      mh: (FACE_H / (IY1 - IY0)) * H,
    };
  }

  // a side-view twin-jet, nose to +x, fuselage length 1, origin on the main-gear contact point;
  // o.sil: backlit silhouette (in front of the moon)
  function airliner(g, o) {
    const sil = !!o.sil;
    const gear = o.gear || 0;
    g.save();
    g.translate(0.02, -(0.06 + 0.085 * gear + 0.024 * gear)); // fuselage centre above the gear contact
    const BODY = sil ? '#241238' : '#f3effa';
    const BELLY = sil ? '#140a22' : '#b8a6d8';
    const EDGE = sil ? 'rgba(255,90,220,0.9)' : 'rgba(255,255,255,0)';
    // gear (behind the wing)
    if (gear > 0.02) {
      g.fillStyle = '#2a2238';
      const sl = 0.085 * gear;
      g.fillRect(-0.03, 0.05, 0.012, sl);
      g.fillRect(0.375, 0.05, 0.01, sl * 0.95);
      g.fillStyle = '#1a1424';
      g.beginPath();
      g.arc(-0.03, 0.06 + sl, 0.024 * gear, 0, PI * 2);
      g.arc(-0.004, 0.06 + sl, 0.024 * gear, 0, PI * 2);
      g.arc(0.38, 0.058 + sl * 0.95, 0.019 * gear, 0, PI * 2);
      g.fill();
    }
    // fin (brand gradient) and tailplane
    const fin = g.createLinearGradient(-0.5, -0.26, -0.3, -0.05);
    fin.addColorStop(0, '#00f0ff');
    fin.addColorStop(0.55, '#bf00ff');
    fin.addColorStop(1, '#ff2bd6');
    g.fillStyle = sil ? '#2c1046' : fin;
    g.beginPath();
    g.moveTo(-0.27, -0.055);
    g.lineTo(-0.405, -0.265);
    g.lineTo(-0.485, -0.265);
    g.lineTo(-0.47, -0.045);
    g.closePath();
    g.fill();
    // fuselage
    const body = g.createLinearGradient(0, -0.065, 0, 0.065);
    body.addColorStop(0, BODY);
    body.addColorStop(0.5, BODY);
    body.addColorStop(1, BELLY);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(0.5, 0.008);
    g.bezierCurveTo(0.5, -0.03, 0.47, -0.06, 0.41, -0.062);
    g.lineTo(-0.27, -0.062);
    g.bezierCurveTo(-0.36, -0.062, -0.44, -0.055, -0.505, -0.044);
    g.lineTo(-0.505, -0.028);
    g.bezierCurveTo(-0.4, -0.01, -0.3, 0.06, -0.2, 0.062);
    g.lineTo(0.41, 0.062);
    g.bezierCurveTo(0.465, 0.06, 0.5, 0.04, 0.5, 0.008);
    g.closePath();
    g.fill();
    if (sil) {
      g.strokeStyle = EDGE;
      g.lineWidth = 0.008;
      g.beginPath();
      g.moveTo(0.48, -0.03);
      g.bezierCurveTo(0.46, -0.058, 0.43, -0.062, 0.41, -0.062);
      g.lineTo(-0.27, -0.062);
      g.lineTo(-0.405, -0.265);
      g.stroke();
    }
    // tailplane sliver
    g.fillStyle = sil ? '#1c0c2c' : '#d8cdef';
    g.beginPath();
    g.moveTo(-0.36, -0.018);
    g.lineTo(-0.5, -0.05);
    g.lineTo(-0.53, -0.04);
    g.lineTo(-0.43, -0.004);
    g.closePath();
    g.fill();
    if (!sil) {
      // cheat line + windows + cockpit
      const cl = g.createLinearGradient(-0.3, 0, 0.45, 0);
      cl.addColorStop(0, '#bf00ff');
      cl.addColorStop(1, '#ff2bd6');
      g.fillStyle = cl;
      g.fillRect(-0.3, 0.008, 0.74, 0.011);
      g.fillStyle = '#3a2a5c';
      for (let k = 0; k < 30; k++) g.fillRect(-0.29 + k * 0.022, -0.026, 0.009, 0.013);
      g.beginPath();
      g.moveTo(0.43, -0.04);
      g.lineTo(0.465, -0.038);
      g.lineTo(0.482, -0.022);
      g.lineTo(0.43, -0.022);
      g.closePath();
      g.fill();
    }
    // near wing
    g.fillStyle = sil ? '#1e0e30' : '#d4c8ec';
    g.beginPath();
    g.moveTo(0.13, 0.035);
    g.lineTo(-0.11, 0.045);
    g.lineTo(-0.23, 0.15);
    g.lineTo(-0.16, 0.152);
    g.closePath();
    g.fill();
    g.fillStyle = sil ? '#ff2bd6' : '#bf00ff';
    g.fillRect(-0.232, 0.15, 0.075, 0.008); // winglet edge
    // engine on its pylon
    g.fillStyle = sil ? '#1a0c2a' : '#cfc4e8';
    g.fillRect(0.02, 0.05, 0.07, 0.03);
    const eg = g.createLinearGradient(0, 0.06, 0, 0.13);
    eg.addColorStop(0, sil ? '#2a1640' : '#f1ecf8');
    eg.addColorStop(1, sil ? '#12081e' : '#8d7cb8');
    g.fillStyle = eg;
    g.beginPath();
    g.ellipse(0.06, 0.095, 0.085, 0.034, 0, 0, PI * 2);
    g.fill();
    g.fillStyle = sil ? '#ff2bd6' : '#2c1f48';
    g.beginPath();
    g.ellipse(0.143, 0.095, 0.011, 0.03, 0, 0, PI * 2);
    g.fill();
    // lights
    const dot = (x, y, col, r) => {
      const gl = g.createRadialGradient(x, y, 0, x, y, r);
      gl.addColorStop(0, '#ffffff');
      gl.addColorStop(0.28, col);
      gl.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gl;
      g.beginPath();
      g.arc(x, y, r, 0, PI * 2);
      g.fill();
    };
    dot(-0.2, 0.15, 'rgba(255,40,90,0.95)', 0.05);
    dot(-0.49, -0.05, 'rgba(255,255,255,0.95)', 0.045);
    dot(0.0, 0.066, 'rgba(255,40,90,0.9)', 0.035);
    if (o.lights) dot(0.36, 0.06, 'rgba(255,252,235,1)', 0.05);
    g.restore();
  }

  function rngDraw(seed) {
    return LIB.rng(LIB.hash('splitflap-art', seed));
  }

  // the takeoff, 11 printed frames: [gear-contact x, y (fractions of W, H), length (of W), pitch deg, gear, outline]
  const RWY = 0.815; // runway line (fraction of H)
  const PLANE = [
    [0.27, RWY, 0.4, 0, 1, 0],
    [0.34, RWY, 0.4, 0, 1, 0],
    [0.42, RWY, 0.4, 2, 1, 0],
    [0.5, RWY, 0.4, 6, 1, 0],
    [0.57, RWY - 0.04, 0.39, 10, 1, 0],
    [0.63, 0.7, 0.37, 13, 0.7, 0],
    [0.68, 0.585, 0.34, 14, 0.4, 1],
    [0.73, 0.47, 0.31, 15, 0.1, 1],
    [0.78, 0.37, 0.27, 15, 0, 1],
    [0.805, 0.28, 0.2, 15, 0, 1],
    [0.785, 0.205, 0.125, 13, 0, 1],
  ];
  const MOON = [0.745, 0.3, 0.165]; // x, y (fractions), radius (of H)
  function drawSky(g, P, k) {
    const { W, H } = P;
    const sky = g.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0, '#120530');
    sky.addColorStop(0.4, '#1e0840');
    sky.addColorStop(0.72, '#3d0d63');
    sky.addColorStop(0.9, '#82197f');
    sky.addColorStop(1, '#d6309c');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // stars
    const r = rngDraw('stars');
    for (let i = 0; i < 300; i++) {
      const x = r() * W;
      const y = Math.pow(r(), 1.5) * H * 0.6;
      const s = 1.5 + r() * 3.2;
      g.fillStyle = `rgba(240,230,255,${0.3 + r() * 0.7})`;
      g.fillRect(x, y, s, s);
    }
    // moon and halo
    const [mxf, myf, mrf] = MOON;
    const mx0 = W * mxf;
    const my0 = H * myf;
    const mr = H * mrf;
    const halo = g.createRadialGradient(mx0, my0, mr * 0.9, mx0, my0, mr * 2.8);
    halo.addColorStop(0, 'rgba(255,60,220,0.32)');
    halo.addColorStop(0.45, 'rgba(191,0,255,0.12)');
    halo.addColorStop(1, 'rgba(191,0,255,0)');
    g.fillStyle = halo;
    g.fillRect(0, 0, W, H);
    const moon = g.createRadialGradient(mx0 - mr * 0.35, my0 - mr * 0.35, mr * 0.1, mx0, my0, mr);
    moon.addColorStop(0, '#efe0f6');
    moon.addColorStop(0.65, '#dcc4ec');
    moon.addColorStop(1, '#b896d4');
    g.fillStyle = moon;
    g.beginPath();
    g.arc(mx0, my0, mr, 0, PI * 2);
    g.fill();
    const cr = rngDraw('craters');
    g.fillStyle = 'rgba(150,100,190,0.32)';
    for (let i = 0; i < 10; i++) {
      const a = cr() * PI * 2;
      const d = Math.sqrt(cr()) * mr * 0.72;
      g.beginPath();
      g.arc(mx0 + Math.cos(a) * d, my0 + Math.sin(a) * d, mr * (0.05 + cr() * 0.13), 0, PI * 2);
      g.fill();
    }
    // two thin cloud bands lit by the moon
    const cl = rngDraw('clouds');
    for (const [cy, cx0, cx1, a] of [
      [0.36, 0.52, 1.05, 0.5],
      [0.18, -0.05, 0.42, 0.28],
    ]) {
      for (let i = 0; i < 26; i++) {
        const x = W * lerp(cx0, cx1, cl());
        const y = H * (cy + (cl() - 0.5) * 0.05);
        const rw = W * (0.04 + cl() * 0.07);
        const rh = H * (0.008 + cl() * 0.014);
        const gg = g.createRadialGradient(x, y, 0, x, y, rw);
        gg.addColorStop(0, `rgba(226,170,255,${a * (0.35 + cl() * 0.4)})`);
        gg.addColorStop(1, 'rgba(226,170,255,0)');
        g.fillStyle = gg;
        g.save();
        g.translate(x, y);
        g.scale(1, rh / rw);
        g.translate(-x, -y);
        g.beginPath();
        g.arc(x, y, rw, 0, PI * 2);
        g.fill();
        g.restore();
      }
    }
    // horizon glow
    const hz = g.createLinearGradient(0, H * 0.56, 0, H * 0.72);
    hz.addColorStop(0, 'rgba(255,43,214,0)');
    hz.addColorStop(1, 'rgba(255,100,210,0.6)');
    g.fillStyle = hz;
    g.fillRect(0, H * 0.56, W, H * 0.16);
    // skyline with lit windows
    const sr = rngDraw('skyline');
    let x = -10;
    const base = H * 0.72;
    while (x < W + 10) {
      const bw = 24 + sr() * 80;
      const bh = 16 + Math.pow(sr(), 2.0) * H * 0.14;
      g.fillStyle = '#13051f';
      g.fillRect(x, base - bh, bw, bh + 2);
      if (sr() < 0.25) {
        g.fillStyle = 'rgba(255,40,90,0.9)';
        g.fillRect(x + bw / 2 - 2, base - bh - 6, 4, 4);
      }
      for (let wy = base - bh + 8; wy < base - 6; wy += 12) {
        for (let wx = x + 5; wx < x + bw - 6; wx += 10) {
          if (sr() < 0.24) {
            g.fillStyle = sr() < 0.7 ? 'rgba(255,214,150,0.9)' : 'rgba(0,240,255,0.85)';
            g.fillRect(wx, wy, 4, 6);
          }
        }
      }
      x += bw + sr() * 8;
    }
    // ground: dark field, the runway band, wet tarmac below it
    g.fillStyle = '#0d0418';
    g.fillRect(0, base, W, H - base);
    const ry0 = H * (RWY - 0.045);
    const ry1 = H * (RWY + 0.045);
    const rw = g.createLinearGradient(0, ry0, 0, ry1);
    rw.addColorStop(0, '#1d1030');
    rw.addColorStop(1, '#2a1840');
    g.fillStyle = rw;
    g.fillRect(0, ry0, W, ry1 - ry0);
    // wet tarmac: reflections of the lights below the runway
    const wet = g.createLinearGradient(0, ry1, 0, H);
    wet.addColorStop(0, '#2c1044');
    wet.addColorStop(0.5, '#1a0a2c');
    wet.addColorStop(1, '#0c0418');
    g.fillStyle = wet;
    g.fillRect(0, ry1, W, H - ry1);
    // the magenta horizon mirrored in the wet tarmac, and the skyline's windows as long streaks
    const hzr = g.createLinearGradient(0, ry1, 0, H);
    hzr.addColorStop(0, 'rgba(255,60,200,0.28)');
    hzr.addColorStop(0.6, 'rgba(255,60,200,0.06)');
    hzr.addColorStop(1, 'rgba(255,60,200,0)');
    g.fillStyle = hzr;
    g.fillRect(0, ry1, W, H - ry1);
    const wr = rngDraw('wet-streaks');
    for (let i = 0; i < 70; i++) {
      const x = wr() * W;
      const len = H * (0.04 + wr() * 0.09);
      const st = g.createLinearGradient(0, ry1, 0, ry1 + len);
      const c = wr() < 0.7 ? '255,214,150' : '0,240,255';
      st.addColorStop(0, `rgba(${c},${0.25 + wr() * 0.25})`);
      st.addColorStop(1, `rgba(${c},0)`);
      g.fillStyle = st;
      g.fillRect(x, ry1 + 4, 3 + wr() * 3, len);
    }
    // moon reflection streak
    const mrf2 = g.createLinearGradient(0, ry1, 0, H);
    mrf2.addColorStop(0, 'rgba(255,170,240,0.35)');
    mrf2.addColorStop(1, 'rgba(255,170,240,0)');
    g.fillStyle = mrf2;
    g.fillRect(mx0 - mr * 0.5, ry1, mr, H - ry1);
    // centre-line dashes, streaking with the plane's speed
    const speed = [0, 0.4, 0.8, 1, 1, 0.6, 0.3, 0.1, 0, 0, 0][k];
    g.fillStyle = 'rgba(245,240,255,0.8)';
    const dash = W / 14;
    for (let i = -1; i < 16; i++) {
      const dx = i * dash + ((k * 0.37) % 1) * dash;
      g.fillRect(dx, H * RWY - 4, 46 + speed * 70, 8);
    }
    // edge lights + their reflections on the wet tarmac
    for (let i = 0; i < 34; i++) {
      const dx = (i + 0.5) * (W / 34);
      for (const [yy, col, rr] of [
        [ry0, '0,240,255', 14],
        [ry1, '255,250,235', 18],
      ]) {
        const gl = g.createRadialGradient(dx, yy, 0, dx, yy, rr);
        gl.addColorStop(0, '#ffffff');
        gl.addColorStop(0.3, `rgba(${col},0.75)`);
        gl.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = gl;
        g.fillRect(dx - rr, yy - rr, rr * 2, rr * 2);
      }
      const rf = g.createLinearGradient(0, ry1, 0, ry1 + H * 0.12);
      rf.addColorStop(0, 'rgba(255,240,250,0.32)');
      rf.addColorStop(1, 'rgba(255,240,250,0)');
      g.fillStyle = rf;
      g.fillRect(dx - 3, ry1 + 6, 6, H * 0.12);
    }
    // approach light bars in the foreground
    for (let i = 0; i < 9; i++) {
      const dx = W * (0.04 + i * 0.12);
      const yy = H * 0.94;
      for (let j = -2; j <= 2; j++) {
        const gl = g.createRadialGradient(dx + j * 16, yy, 0, dx + j * 16, yy, 10);
        gl.addColorStop(0, 'rgba(255,255,255,0.95)');
        gl.addColorStop(1, 'rgba(255,43,214,0)');
        g.fillStyle = gl;
        g.fillRect(dx + j * 16 - 10, yy - 10, 20, 20);
      }
    }
  }
  function planeXY(P, k) {
    const p = PLANE[k];
    return [p[0] * P.W, p[1] * P.H, p[2] * P.W, (p[3] * PI) / 180];
  }
  function drawContrail(g, P, k) {
    if (k < 5) return;
    // tail points from lift-off to now, joined by a Catmull-Rom spline
    const pts = [];
    for (let i = 4; i <= Math.min(k, NP - 1); i++) {
      const [x, y, L, a] = planeXY(P, i);
      pts.push([x - Math.cos(a) * L * 0.47, y + Math.sin(a) * L * 0.47 - L * 0.07]);
    }
    if (pts.length < 2) return;
    const cr = [];
    const ext = (a, b2) => [2 * a[0] - b2[0], 2 * a[1] - b2[1]];
    const Q = [ext(pts[0], pts[1]), ...pts, ext(pts[pts.length - 1], pts[pts.length - 2])];
    for (let i = 1; i < Q.length - 2; i++) {
      for (let s2 = 0; s2 < 16; s2++) {
        const t = s2 / 16;
        const t2 = t * t;
        const t3 = t2 * t;
        const f = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        cr.push([f(Q[i - 1][0], Q[i][0], Q[i + 1][0], Q[i + 2][0]), f(Q[i - 1][1], Q[i][1], Q[i + 1][1], Q[i + 2][1])]);
      }
    }
    cr.push(pts[pts.length - 1]);
    g.save();
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const [lw, col] of [
      [70, 'rgba(255,120,230,0.07)'],
      [34, 'rgba(255,170,240,0.16)'],
      [14, 'rgba(255,225,250,0.32)'],
      [5, 'rgba(255,245,255,0.5)'],
    ]) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.moveTo(cr[0][0], cr[0][1]);
      for (let i = 1; i < cr.length; i++) g.lineTo(cr[i][0], cr[i][1]);
      g.stroke();
    }
    g.restore();
  }

  function drawPlaneAt(g, P, k) {
    const [x, y, L, a] = planeXY(P, k);
    const p = PLANE[k];
    if (p[0] > 1.3) return;
    g.save();
    g.translate(x, y);
    g.rotate(-a);
    // landing light beam ahead of the nose gear
    if (k < 6) {
      const bx = 0.36 * L;
      const by = -0.12 * L;
      const beam = g.createRadialGradient(bx, by, 0, bx, by, L * 0.6);
      beam.addColorStop(0, 'rgba(255,255,255,0.9)');
      beam.addColorStop(0.07, 'rgba(255,250,235,0.55)');
      beam.addColorStop(0.4, 'rgba(255,220,255,0.1)');
      beam.addColorStop(1, 'rgba(255,220,255,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(bx, by);
      g.arc(bx, by, L * 0.6, -0.25, 0.3);
      g.closePath();
      g.fill();
    }
    g.scale(L, L);
    if (p[5]) {
      // a dark rim so the lit plane separates from the moon: the silhouette, a touch larger, behind
      g.save();
      g.scale(1.045, 1.12);
      airliner(g, { gear: p[4], sil: true, lights: false });
      g.restore();
    }
    airliner(g, { gear: p[4], sil: false, lights: k < 6 });
    g.restore();
    // its reflection on the wet tarmac while it is low
    if (k < 5) {
      g.save();
      g.globalAlpha = 0.22;
      g.translate(x, P.H * (RWY + 0.045) * 2 - y + P.H * 0.02);
      g.scale(1, -0.6);
      g.rotate(-a);
      g.scale(L, L);
      airliner(g, { gear: p[4], sil: false, lights: true });
      g.restore();
    }
  }
  function drawTakeoff(g, P, k) {
    drawSky(g, P, k);
    drawContrail(g, P, k);
    drawPlaneAt(g, P, k);
  }

  function drawCard(g, P) {
    const { W, H } = P;
    g.fillStyle = FLAP_HEX;
    g.fillRect(0, 0, W, H);
    // the wordmark across the mark rows
    const [r0, r1] = LAYOUT.mark;
    const top = P.rowY(r0) - P.mh * 0.5;
    const bot = P.rowY(r1) + P.mh * 0.5;
    let capH = (bot - top) * 0.9;
    let size = capH / 0.72;
    g.save();
    g.font = `700 ${size}px Futura`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    const word = 'AiXenix';
    let w = g.measureText(word).width;
    // about 60 % of the board's width, scaled uniformly (never squeezed)
    const maxW = W * 0.6;
    if (w > maxW) {
      size *= maxW / w;
      capH *= maxW / w;
      w = maxW;
      g.font = `700 ${size}px Futura`;
    }
    const cx = W / 2;
    const base = (top + bot) / 2 + capH / 2;
    g.translate(cx, base);
    const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
    grd.addColorStop(0, '#ff2bd6');
    grd.addColorStop(0.5, '#bf00ff');
    grd.addColorStop(1, '#00f0ff');
    g.fillStyle = grd;
    g.fillText(word, 0, 0);
    g.restore();
    // the paper plane with a dashed flight path
    const [c0, c1, pr0, pr1] = LAYOUT.plane;
    const x0 = P.colX(c0) - P.mw / 2;
    const x1 = P.colX(c1) + P.mw / 2;
    const y0 = P.rowY(pr0) - P.mh / 2;
    const y1 = P.rowY(pr1) + P.mh / 2;
    const pw = Math.min(x1 - x0, y1 - y0);
    const ph = pw; // a square stage, centred in the block
    g.save();
    g.translate(x0 + (x1 - x0 - pw) / 2, y0 + (y1 - y0 - ph) / 2);
    const pt = (u, v) => [pw * u, ph * v];
    // a dashed flight path loops in from the left
    g.strokeStyle = '#00f0ff';
    g.lineWidth = pw * 0.05;
    g.setLineDash([pw * 0.1, pw * 0.085]);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(...pt(-0.02, 1.02));
    g.bezierCurveTo(...pt(0.3, 1.06), ...pt(0.42, 0.84), ...pt(0.26, 0.78));
    g.bezierCurveTo(...pt(0.1, 0.72), ...pt(0.08, 0.92), ...pt(0.38, 0.7));
    g.stroke();
    g.setLineDash([]);
    // a plain paper plane: cream paper, a magenta fold
    const N = pt(0.96, 0.06); // nose
    const L = pt(0.08, 0.46); // near wing tip
    const F = pt(0.45, 0.57); // centre fold
    const K = pt(0.58, 0.9); // keel tip
    const tri = (a, b2, c, fill) => {
      g.fillStyle = fill;
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b2);
      g.lineTo(...c);
      g.closePath();
      g.fill();
    };
    const wing = g.createLinearGradient(...L, ...N);
    wing.addColorStop(0, '#fbf3e2');
    wing.addColorStop(1, '#ece0c6');
    tri(N, L, F, wing);
    tri(N, F, K, '#cdbd9c');
    tri(N, pt(0.55, 0.62), F, '#ff2bd6');
    g.strokeStyle = 'rgba(40,10,40,0.5)';
    g.lineWidth = pw * 0.014;
    g.beginPath();
    g.moveTo(...N);
    g.lineTo(...F);
    g.stroke();
    g.restore();
  }


  // ------------------------------------------------------------------ three.js scene
  let R = null;
  const FLAP_VS = /* glsl */ `
    attribute vec4 aInfo;   // face front, face back, shadow reach, kind (0 top, 1 bottom, 2 falling)
    attribute vec2 aMod;    // col, row
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vW;
    varying vec4 vInfo;
    varying vec2 vMod;
    void main() {
      vUv = uv;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vW = wp.xyz;
      vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      vInfo = aInfo;
      vMod = aMod;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
  const FLAP_FS = /* glsl */ `
    precision highp float;
    uniform sampler2D uGlyph;
    uniform sampler2D uPicA;
    uniform sampler2D uPicB;
    uniform sampler2D uCard;
    uniform vec3 uFlap;
    uniform vec3 uInk;
    uniform vec3 uKeyDir;
    uniform vec3 uKeyCol;
    uniform vec3 uFillCol;
    uniform vec3 uRimA;
    uniform vec3 uRimB;
    uniform vec3 uCam;
    uniform float uT;
    varying vec2 vUv;
    varying vec3 vN;
    varying vec3 vW;
    varying vec4 vInfo;
    varying vec2 vMod;
    const float COLS = ${COLS}.0;
    const float ROWS = ${ROWS}.0;
    const float PX = ${PX};
    const float PY = ${PY};
    const float FW = ${FW};
    const float FH = ${FH};
    const float HG = ${HG};
    const float IX0 = ${IX0.toFixed(6)};
    const float IX1 = ${IX1.toFixed(6)};
    const float IY0 = ${IY0.toFixed(6)};
    const float IY1 = ${IY1.toFixed(6)};
    const float NG = ${NG}.0;
    const float P0 = ${P0}.0;
    const float CARD = ${CARD}.0;
    float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float vnoise(vec2 p) {
      vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }
    void main() {
      bool front = gl_FrontFacing;
      float face = floor((front ? vInfo.x : vInfo.y) + 0.5);
      float kind = floor(vInfo.w + 0.5);
      // local flap coordinates: u across, v from the hinge (0) to the free edge (1)
      vec2 lp = vec2((vUv.x - 0.5) * FW, vUv.y * FH);
      // rounded free-edge corners, small axle notches at the hinge corners
      vec2 q = vec2(abs(lp.x) - (FW * 0.5 - 0.05), lp.y - (FH - 0.05));
      if (q.x > 0.0 && q.y > 0.0 && length(q) > 0.05) discard;
      if (abs(lp.x) > FW * 0.5 - 0.035 && lp.y < 0.05) discard;
      // print coordinates on the full face (fv up)
      float d = (HG + vUv.y * FH) / (HG + FH);
      float fv = front ? 0.5 + 0.5 * d : 0.5 - 0.5 * d;
      float fu = vUv.x;
      // glyph
      float gi = clamp(face, 0.0, NG - 1.0);
      vec2 cell = vec2(mod(gi, 8.0), floor(gi / 8.0));
      vec2 guv = vec2((cell.x + fu) / 8.0, (7.0 - cell.y + fv) / 8.0);
      float ink = texture2D(uGlyph, guv).r;
      // picture tile of this module
      float xc = (floor(vMod.x + 0.5) - (COLS - 1.0) * 0.5) * PX;
      float yc = ((ROWS - 1.0) * 0.5 - floor(vMod.y + 0.5)) * PY;
      float wx = xc + (fu - 0.5) * FW;
      float wy = yc + (fv - 0.5) * 2.0 * (HG + FH);
      vec2 iuv = vec2((wx - IX0) / (IX1 - IX0), (wy - IY0) / (IY1 - IY0));
      vec2 modc = floor(vMod + 0.5);
      float pk = clamp(face - P0, 0.0, ${NP - 1}.0);
      float pb = step(5.5, pk);
      float pl = pk - 6.0 * pb;
      vec2 puv = vec2((mod(pl, 2.0) + iuv.x) / 2.0, (2.0 - floor(pl / 2.0) + iuv.y) / 3.0);
      vec3 pic = mix(texture2D(uPicA, puv).rgb, texture2D(uPicB, puv).rgb, pb);
      vec3 card = texture2D(uCard, iuv).rgb;
      // wear: per physical flap (module x drum position)
      float seed = fract(vMod.x * 0.1173 + vMod.y * 0.3191 + face * 0.0731 + (front ? 0.0 : 0.37)) * 61.0;
      float n1 = vnoise(lp * 14.0 + seed);
      float n2 = vnoise(lp * 70.0 + seed * 1.7);
      float printWear = smoothstep(0.8, 0.97, n2) * 0.22;
      vec3 base;
      if (face < NG - 0.5) base = mix(uFlap * (0.85 + 0.3 * n1), uInk * (0.93 + 0.07 * n1), ink * (1.0 - printWear));
      else if (face < CARD - 0.5) base = pic;
      else base = card;
      // light falls off over the board from the ceiling strip above it
      float topFall = smoothstep(IY0 - 4.0, IY1 + 1.0, wy);
      float pools = 0.0;
      for (int i = 0; i < 4; i++) {
        float px = (float(i) - 1.5) * 11.0;
        pools += exp(-pow((wx - px) / 6.2, 2.0)) * mix(0.35, 1.0, topFall * topFall);
      }
      float keyI = 0.42 + 0.95 * pools * mix(0.55, 1.0, topFall);

      vec3 N = normalize(vN) * (front ? 1.0 : -1.0);
      vec3 V = normalize(uCam - vW);
      vec3 Lk = normalize(uKeyDir);
      float ndl = dot(N, Lk);
      float diff = clamp((ndl + 0.2) / 1.2, 0.0, 1.0);
      // shadows and occlusion on the resting halves
      float sh = 1.0;
      float reach = vInfo.z;
      if (kind < 1.5) {
        float v = vUv.y;
        sh *= 1.0 - 0.85 * (1.0 - smoothstep(reach - 0.1, reach + 0.1, v)) * step(0.001, reach);
        sh *= mix(0.5, 1.0, smoothstep(0.0, 0.12, v)); // axle occlusion at the split
        if (kind < 0.5) sh *= mix(1.0, 0.72, smoothstep(0.8, 1.0, v)); // housing lip over the top flap
        else sh *= mix(1.0, 0.88, smoothstep(0.5, 1.0, v));
      }
      // GGX key spec on satin plastic, plus the reflected ceiling strip (the flip glint)
      vec3 H = normalize(Lk + V);
      float nh = max(dot(N, H), 0.0);
      float rough = 0.42 - 0.12 * n1;
      float a2 = rough * rough * rough * rough;
      float dd = nh * nh * (a2 - 1.0) + 1.0;
      float D = a2 / (3.14159 * dd * dd);
      float Fk = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
      float spec = D * Fk * 0.25 * max(ndl, 0.0);
      vec3 Rv = reflect(-V, N);
      float Fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
      float strip = smoothstep(0.94, 0.995, dot(Rv, Lk)) * (0.7 + 0.3 * n2);
      vec3 col = base * uKeyCol * keyI * diff * sh + base * uFillCol;
      // a flap is very slightly curved: the glint runs along it rather than lighting it flat
      float glint = strip * Fr * 0.5 * (0.2 + 0.8 * smoothstep(0.05, 1.0, vUv.y)) * mix(sh, 1.0, 0.4);
      col += uKeyCol * keyI * (spec * sh + min(glint, 0.2));
      col += uRimA * pow(max(dot(N, normalize(vec3(-1.0, -0.2, 0.25))), 0.0), 4.0) * 0.05;
      col += uRimB * pow(max(dot(N, normalize(vec3(1.0, -0.2, 0.25))), 0.0), 4.0) * 0.05;
      gl_FragColor = vec4(col, 1.0);
    }`;

  function init() {
    const W = FILM.W;
    const H = FILM.H;
    const SC = FILM.S || 1;
    const cw = Math.round(W * SC);
    const ch = Math.round(H * SC);
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(cw, ch, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050208);
    const cam = new THREE.PerspectiveCamera(28, W / H, 6, 160);

    // environment for the metal parts
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environment = env;

    const keyDir = new THREE.Vector3(0.0, 1.0, 0.8).normalize();
    const key = new THREE.DirectionalLight(0xfff1e0, 2.2);
    key.position.copy(keyDir).multiplyScalar(50);
    scene.add(key);
    scene.add(new THREE.HemisphereLight(0x3a2a5a, 0x08040c, 0.6));

    // textures
    const aniso = renderer.capabilities.getMaxAnisotropy();
    const glyphTex = new THREE.CanvasTexture(glyphAtlas());
    glyphTex.colorSpace = THREE.NoColorSpace;
    glyphTex.anisotropy = aniso;
    glyphTex.minFilter = THREE.LinearMipmapLinearFilter;
    // (two moderate canvases rather than one 4096 x 6804: the tall one did not hash identically)
    const picTex = [0, 1].map((half) => {
      const cv = makeCanvas(PW * 2, PH * PROWS);
      const g = cv.getContext('2d', CPU2D);
      for (let j = 0; j < 6; j++) {
        const k = half * 6 + j;
        if (k >= NP) break;
        const P = picCtx(g, PW, PH);
        g.save();
        g.translate((j % 2) * PW, Math.floor(j / 2) * PH);
        g.beginPath();
        g.rect(0, 0, PW, PH);
        g.clip();
        drawTakeoff(g, P, k);
        g.restore();
      }
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = aniso;
      return tex;
    });
    const cardCv = makeCanvas(PW * 2, PH * 2);
    drawCard(cardCv.getContext('2d', CPU2D), picCtx(cardCv.getContext('2d', CPU2D), PW * 2, PH * 2));
    const cardTex = new THREE.CanvasTexture(cardCv);
    cardTex.colorSpace = THREE.SRGBColorSpace;
    cardTex.anisotropy = aniso;

    // flaps
    const MAXI = NMOD * 10;
    const fgeo = new THREE.PlaneGeometry(FW, FH, 1, 1);
    fgeo.translate(0, HG + FH / 2, 0);
    const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 4), 4);
    const aMod = new THREE.InstancedBufferAttribute(new Float32Array(MAXI * 2), 2);
    aInfo.setUsage(THREE.DynamicDrawUsage);
    aMod.setUsage(THREE.DynamicDrawUsage);
    fgeo.setAttribute('aInfo', aInfo);
    fgeo.setAttribute('aMod', aMod);
    const col = (hex) => new THREE.Color(hex);
    const fmat = new THREE.ShaderMaterial({
      vertexShader: FLAP_VS,
      fragmentShader: FLAP_FS,
      side: THREE.DoubleSide,
      uniforms: {
        uGlyph: { value: glyphTex },
        uPicA: { value: picTex[0] },
        uPicB: { value: picTex[1] },
        uCard: { value: cardTex },
        uFlap: { value: col(FLAP_HEX) },
        uInk: { value: col(INK_HEX) },
        uKeyDir: { value: keyDir },
        uKeyCol: { value: new THREE.Color(1.0, 0.94, 0.86).multiplyScalar(1.7) },
        uFillCol: { value: new THREE.Color(0.045, 0.04, 0.055) },
        uRimA: { value: col('#ff2bd6') },
        uRimB: { value: col('#00f0ff') },
        uCam: { value: new THREE.Vector3() },
        uT: { value: 0 },
      },
    });
    const flaps = new THREE.InstancedMesh(fgeo, fmat, MAXI);
    flaps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    flaps.frustumCulled = false;
    scene.add(flaps);

    // the grille: one frame bar between every row and every column; the flaps sit in its windows
    const BWd = COLS * PX + 0.2;
    const BHt = ROWS * PY + 0.2;
    const gmat = new THREE.MeshStandardMaterial({ color: 0x0e0d12, roughness: 0.38, metalness: 0.6, envMapIntensity: 0.35 });
    const hbar = new THREE.RoundedBoxGeometry(BWd, PY - FACE_H - 0.16, 0.16, 2, 0.03);
    const vbar = new THREE.RoundedBoxGeometry(PX - FW - 0.095, BHt, 0.16, 2, 0.02);
    const hb = new THREE.InstancedMesh(hbar, gmat, ROWS + 1);
    const vb = new THREE.InstancedMesh(vbar, gmat, COLS + 1);
    const m4 = new THREE.Matrix4();
    for (let r = 0; r <= ROWS; r++) {
      m4.makeTranslation(0, my(r) + PY / 2, 0.0);
      hb.setMatrixAt(r, m4);
    }
    for (let c = 0; c <= COLS; c++) {
      m4.makeTranslation(mx(c) - PX / 2, 0, -0.01);
      vb.setMatrixAt(c, m4);
    }
    scene.add(hb);
    scene.add(vb);
    const pgeo = new THREE.CylinderGeometry(0.028, 0.028, 0.05, 10);
    pgeo.rotateZ(PI / 2);
    const pmat = new THREE.MeshStandardMaterial({ color: 0x4a4654, roughness: 0.5, metalness: 0.9 });
    const pins = new THREE.InstancedMesh(pgeo, pmat, NMOD * 2);
    for (const M of MODS) {
      for (let s = 0; s < 2; s++) {
        m4.makeTranslation(mx(M.c) + (s ? 1 : -1) * (FW / 2 + 0.012), my(M.r), 0.0);
        pins.setMatrixAt(M.i * 2 + s, m4);
      }
    }
    scene.add(pins);
    // backplate + bezel
    const back = new THREE.Mesh(new THREE.PlaneGeometry(BWd + 1.6, BHt + 1.6), new THREE.MeshStandardMaterial({ color: 0x030205, roughness: 0.9, metalness: 0.1 }));
    back.position.z = -0.45;
    scene.add(back);
    // the terminal wall: dark plaster lit in scallops by the four downlights above the board
    const LIGHT_Y = IY1 + 2.35;
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 90),
      new THREE.ShaderMaterial({
        uniforms: { uLy: { value: LIGHT_Y } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `
          uniform float uLy; varying vec3 vW;
          float h(vec2 p){ p = fract(p * vec2(213.1, 471.7)); p += dot(p, p + 23.3); return fract(p.x * p.y); }
          void main(){
            float acc = 0.0;
            for (int i = 0; i < 4; i++) {
              float x = (float(i) - 1.5) * 11.0;
              float d = uLy - vW.y;
              float w = 0.9 + 0.62 * max(d, 0.0);
              float cone = exp(-pow((vW.x - x) / w, 2.0)) * smoothstep(-0.6, 0.5, d) / (1.0 + 0.05 * d * d);
              acc += cone;
            }
            float grain = 0.85 + 0.3 * h(floor(vW.xy * 40.0));
            vec3 base = vec3(0.016, 0.013, 0.02) * grain;
            vec3 col = base * (0.25 + 5.5 * acc) + vec3(0.03, 0.022, 0.016) * acc * acc;
            gl_FragColor = vec4(col, 1.0);
          }`,
      })
    );
    wall.position.z = -0.6;
    scene.add(wall);
    // the downlights themselves: small hot discs in the ceiling line, they bloom
    const dlMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 1.85, 1.65) });
    const dlGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24);
    const housingMat = new THREE.MeshStandardMaterial({ color: 0x15141a, roughness: 0.4, metalness: 0.8 });
    const housingGeo = new THREE.CylinderGeometry(0.78, 0.78, 0.5, 24);
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 11;
      const hsg = new THREE.Mesh(housingGeo, housingMat);
      hsg.position.set(x, LIGHT_Y + 0.3, 2.2);
      scene.add(hsg);
      const disc = new THREE.Mesh(dlGeo, dlMat);
      disc.position.set(x, LIGHT_Y + 0.02, 2.2);
      scene.add(disc);
    }
    const bezMat = new THREE.MeshStandardMaterial({ color: 0x1b1a22, roughness: 0.35, metalness: 0.85, envMapIntensity: 0.9 });
    const bz = (w, h, x, y) => {
      const m = new THREE.Mesh(new THREE.RoundedBoxGeometry(w, h, 0.9, 3, 0.12), bezMat);
      m.position.set(x, y, -0.15);
      scene.add(m);
    };
    bz(BWd + 1.2, 0.9, 0, BHt / 2 + 0.15);
    bz(BWd + 1.2, 0.9, 0, -BHt / 2 - 0.15);
    bz(0.9, BHt + 0.4, -BWd / 2 - 0.15, 0);
    bz(0.9, BHt + 0.4, BWd / 2 + 0.15, 0);

    // post
    // single-sample: the MSAA happens in each sub-pose render (subRT); accumulating into an MSAA
    // target across draws is not reliably preserved on every GPU
    const rt = new THREE.WebGLRenderTarget(cw, ch, { type: THREE.HalfFloatType });
    const composer = new THREE.EffectComposer(renderer, rt);
    composer.setPixelRatio(1);
    composer.setSize(cw, ch);
    // motion blur: SUB poses across a 180-degree shutter, averaged (deterministic, no history)
    const SUB = TL.motionSub || 4;
    const SHUTTER = 0.5 / (FILM.FPS || 30);
    const subRT = new THREE.WebGLRenderTarget(cw, ch, { type: THREE.HalfFloatType, samples: 4 });
    const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const qMat = new THREE.ShaderMaterial({
      uniforms: { tex: { value: null }, w: { value: 1 / SUB } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D tex; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tex, vUv).rgb * w, 1.0); }',
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const qMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), qMat);
    qMesh.frustumCulled = false;
    const accum = {
      enabled: true,
      needsSwap: false,
      clear: false,
      renderToScreen: false,
      setSize() {},
      dispose() {},
      render(rnd, writeBuffer, readBuffer) {
        const T0 = R.T0;
        rnd.setRenderTarget(readBuffer);
        rnd.setClearColor(0x000000, 1);
        rnd.clear(true, true, false);
        const ac = rnd.autoClear;
        for (let i = 0; i < SUB; i++) {
          pose(T0 + ((i + 0.5) / SUB - 0.5) * SHUTTER);
          rnd.autoClear = true;
          rnd.setRenderTarget(subRT);
          rnd.render(scene, cam);
          qMat.uniforms.tex.value = subRT.texture;
          rnd.autoClear = false;
          rnd.setRenderTarget(readBuffer);
          rnd.render(qMesh, qCam);
        }
        rnd.autoClear = ac;
        pose(T0); // the depth pass (DOF) sees the frame-centre pose
      },
    };
    composer.addPass(accum);
    const bokeh = new THREE.BokehPass(scene, cam, { focus: 30, aperture: 0.0004, maxblur: 0.006 });
    if (!TL.noDof) composer.addPass(bokeh);
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(cw, ch), 0.22, 0.5, 0.92);
    composer.addPass(bloom);
    composer.addPass(new THREE.OutputPass());
    const finish = new THREE.ShaderPass({
      uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 }, uRes: { value: new THREE.Vector2(cw, ch) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uSeed; uniform vec2 uRes; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed) * 43758.5453); }
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y;
          float vig = smoothstep(1.15, 0.35, length(d));
          c *= mix(0.55, 1.0, vig);
          c += (h(floor(vUv * uRes)) - 0.5) * 0.026;
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    composer.addPass(finish);

    R = { canvas, renderer, scene, cam, composer, bokeh, bloom, finish, flaps, aInfo, aMod, fmat, cw, ch };
  }

  // ------------------------------------------------------------------ camera
  const CAMK = [
    [0, [2.4, 6.9, 43.2], [0.75, 5.0, 0], 'out'],
    [b(2, 3), [1.3, 6.1, 40.4], [0.8, 4.85, 0]],
    [b(4, 0) - 0.2, [-4.5, -0.8, 49], [0.4, 0.1, 0]],
    [b(5, 2), [-3.8, -0.4, 47], [1.2, 0.5, 0]],
    [b(6, 0), [-2.8, 1.2, 31.5], [0.0, 0.8, 0]],
    [b(7, 0), [-2.2, -0.2, 40.2], [0.2, -0.7, 0]],
    [b(7, 3) + 0.25, [-2.1, -0.15, 39.4], [0.2, -0.65, 0]],
    [b(8, 1), [-1.8, 2.2, 33.5], [0.0, 2.0, 0]],
    [b(9, 0), [-1.3, 2.1, 31.0], [0.0, 1.95, 0]],
  ];
  function cameraAt(T) {
    if (TL.debugCam) return TL.debugCam;
    if (SCRIPT === 'fixture') {
      return { pos: [-10, -2.5, 49], look: [0.5, 0, 0], fov: 28 };
    }
    // keyframes: [T, pos, look]; each segment eases in and out (a slow, weighted dolly)
    const K = CAMK;
    let i = 0;
    while (i < K.length - 1 && T >= K[i + 1][0]) i++;
    let pos;
    let look;
    if (i >= K.length - 1) {
      pos = K[K.length - 1][1].slice();
      look = K[K.length - 1][2].slice();
    } else {
      const [t0, p0, l0] = K[i];
      const [t1, p1, l1] = K[i + 1];
      const u = clamp((T - t0) / (t1 - t0), 0, 1);
      const e = K[i][3] === 'out' ? 1 - (1 - u) * (1 - u) : u * u * u * (u * (u * 6 - 15) + 10);
      pos = p0.map((v, k) => lerp(v, p1[k], e));
      look = l0.map((v, k) => lerp(v, l1[k], e));
    }
    // the card bars breathe with period one bar (the last bar is the seamless loop)
    if (T > b(9, 0)) {
      const u = ((T - b(9, 0)) / BAR) % 1;
      const w = (1 - Math.cos(2 * PI * u)) / 2;
      pos[0] += 0.35 * w;
      pos[1] += 0.08 * w;
      pos[2] -= 0.7 * w;
    }
    return { pos, look, fov: 28 };
  }

  // ------------------------------------------------------------------ frame
  // pose(T): every instance and the camera at time T (pure function of T)
  function pose(T) {
    const { flaps, aInfo, aMod } = R;
    const im = flaps.instanceMatrix.array;
    const ia = aInfo.array;
    const ma = aMod.array;
    let n = 0;
    const put = (M, th, fF, fB, reach, kind) => {
      const zo = kind < 1.5 ? 0.008 : 0.02;
      const c = Math.cos(th);
      const s = Math.sin(th);
      const o = n * 16;
      im[o] = 1;
      im[o + 1] = 0;
      im[o + 2] = 0;
      im[o + 3] = 0;
      im[o + 4] = 0;
      im[o + 5] = c;
      im[o + 6] = s;
      im[o + 7] = 0;
      im[o + 8] = 0;
      im[o + 9] = -s;
      im[o + 10] = c;
      im[o + 11] = 0;
      im[o + 12] = mx(M.c);
      im[o + 13] = my(M.r);
      im[o + 14] = zo;
      im[o + 15] = 1;
      const a = n * 4;
      ia[a] = fF;
      ia[a + 1] = fB;
      ia[a + 2] = reach;
      ia[a + 3] = kind;
      ma[n * 2] = M.c;
      ma[n * 2 + 1] = M.r;
      n++;
    };
    for (const M of MODS) {
      const st = stateAt(M, T);
      put(M, TH_TOP, st.top, st.top, st.shTop, 0);
      put(M, TH_BOT, st.bot, st.bot, st.shBot, 1);
      if (!TL.debugNoFall) for (let k = 0; k < st.nf; k++) put(M, st.fall[k * 4], st.fall[k * 4 + 1], st.fall[k * 4 + 2], 0, 2);
    }
    flaps.count = n;
    flaps.instanceMatrix.needsUpdate = true;
    aInfo.needsUpdate = true;
    aMod.needsUpdate = true;
    const C = cameraAt(T);
    R.cam.position.set(C.pos[0], C.pos[1], C.pos[2]);
    R.cam.fov = C.fov;
    R.cam.updateProjectionMatrix();
    R.cam.lookAt(C.look[0], C.look[1], C.look[2]);
    R.cam.updateMatrixWorld();
    R.bokeh.uniforms.focus.value = Math.hypot(C.pos[0] - C.look[0], C.pos[1] - C.look[1], C.pos[2] - C.look[2]);
    R.fmat.uniforms.uCam.value.copy(R.cam.position);
    R.fmat.uniforms.uT.value = T;
  }

  function draw(ctx, t, info) {
    if (!R) init();
    // the frame's centre time; the accumulation pass renders SUB poses across a 180-degree shutter
    R.T0 = info.T;
    pose(info.T);
    R.finish.uniforms.uSeed.value = (info.frame % 97) * 0.731;
    R.composer.render();
    ctx.save();
    ctx.drawImage(R.canvas, 0, 0, FILM.W, FILM.H);
    ctx.restore();
  }

  // ------------------------------------------------------------------ registry + schedule export
  for (const shot of TL.shots) if (shot.file === '01-board.js') FILM.scene({ id: shot.id, draw });

})();
