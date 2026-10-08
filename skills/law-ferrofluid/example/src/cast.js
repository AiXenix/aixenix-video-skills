/*
 * cast.js : the DIRECTOR of «Феррофлюид» (prelude slot reused). One continuous physical set; this file
 * says, for any global time T, where the camera is, how the studio is lit, and — the law of the film —
 * where the invisible magnet field is. The liquid (src/props.js) only ever answers the field.
 *
 *   FILM.ferroState(T) -> state for FILM.ferro.render(ctx, state)
 *
 * Physics of a word: the field ramps up under the whole word first (sub-critical: the liquid only
 * heaps up and draws fluid in from around it), then crosses the critical field on the beat and the
 * surface snaps into Rosensweig spikes, starting at the magnet centre and running outward; the snap
 * sends ripples across the pool. Field off: the spikes slump back into a mirror.
 *
 * 100 bpm, beat 0.6 s = 18 frames, bar 2.4 s = 72 frames, 9 bars = 21.6 s. Bar 9 (frames 576–647) is a
 * seamless loop: everything in it is periodic in whole frames (72, or a divisor).
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const LIB = FILM.lib;
  const P = LIB.pal;

  const BEAT = 0.6, BAR = 2.4, FPS = 30;
  const DUR = 21.6;
  const LOOP0 = 19.2, LOOPF = 576, BARF = 72, BEATF = 18;
  const PC = [0, -1.0]; // pool centre (x, z); props.js POOL.cz must match
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, u) => a + (b - a) * u;
  const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
  const easeIO = (u) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  const easeO = (u) => 1 - Math.pow(1 - clamp(u), 3);

  // hex -> linear rgb (lights are linear HDR)
  function lin(hex) {
    const h = hex.replace('#', '');
    const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    return c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  }
  const MAG = lin(P.ffMagenta), CYA = lin(P.ffCyan), VIO = lin(P.ffViolet), KEY = lin(P.ffKey), SWP = lin(P.ffSweep);

  // ---------------------------------------------------------------------------------------------
  // Liquid response envelopes (seconds since the event)
  // ---------------------------------------------------------------------------------------------
  function rise(tau, f = 4.6, z = 0.34) { // under-damped: the surface overshoots and rings
    if (tau <= 0) return 0;
    const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * tau) * (Math.cos(wd * tau) + ((z * w) / wd) * Math.sin(wd * tau));
  }
  const fall = (tau, k = 0.075) => (tau <= 0 ? 1 : Math.exp(-tau / k)); // field off: spikes slump
  const SUB = 0.26; // sub-critical field level of a swell (the critical field is 0.30)
  // a shape's field: swell from a to s (heap, no spikes), snap at s (+ delay), off at b
  function word(T, a, s, b, delay) {
    const sw = SUB * sstep(a, s, T);
    const sn = rise(T - s - (delay || 0), 4.8, 0.33);
    return (sw * (1 - sn) + 1.0 * sn) * fall(T - b);
  }
  // the on-beat sharpening (integer-frame phase, so it is exact at the loop seam)
  function snapAt(T, a, b, amt) {
    const f = Math.round(T * FPS), fa = Math.round(a * FPS), fb = Math.round(b * FPS);
    if (f < fa || f > fb + 15) return 0;
    const k = Math.floor((f - fa) / BEATF);
    const fb0 = fa + k * BEATF;
    if (fb0 > fb) return 0;
    return amt * Math.exp(-((f - fb0) / FPS) / 0.11);
  }

  // ---------------------------------------------------------------------------------------------
  // Field painting helpers (field canvas, px coordinates; value = F / 1.5 as alpha)
  // ---------------------------------------------------------------------------------------------
  let FD = null;
  const X = (x) => (x - FD.x0) * FD.px;
  const Z = (z) => (z - FD.z0) * FD.px;
  const S = (d) => d * FD.px;
  const alphaOf = (F) => clamp(F / 1.5, 0, 1);
  function begin(g, F, blurW) {
    g.globalAlpha = alphaOf(F);
    g.filter = blurW > 0 ? `blur(${S(blurW).toFixed(2)}px)` : 'none';
    g.fillStyle = P.ffField;
    g.strokeStyle = P.ffField;
  }
  const layoutCache = {};
  function layout(g, str, size, maxW, family, weight, track) {
    const key = [str, size, maxW, family, weight, track].join('|');
    if (layoutCache[key]) return layoutCache[key];
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${weight} ${S(size).toFixed(1)}px ${family}`;
    const ws = Array.from(str).map((ch) => g.measureText(ch).width / FD.px);
    g.restore();
    const tr = track * size;
    const total = ws.reduce((a, b) => a + b, 0) + tr * (ws.length - 1);
    const k = Math.min(1, maxW / total);
    const xs = [];
    let x = -total / 2;
    for (const w of ws) { xs.push((x + w / 2) * k); x += w + tr; }
    const out = { xs, k, chars: Array.from(str), total: total * k };
    layoutCache[key] = out;
    return out;
  }
  // a line of letters; fOf(i, n, xCentre) gives each letter's field strength
  function letters(g, str, cx, cz, size, maxW, fOf, opt = {}) {
    const family = opt.family || 'Futura';
    const weight = opt.weight || 700;
    const L = layout(g, str, size, maxW, family, weight, opt.track != null ? opt.track : 0.04);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.font = `${weight} ${S(size).toFixed(1)}px ${family}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = L.chars.length;
    for (let i = 0; i < n; i++) {
      if (L.chars[i] === ' ') continue;
      const F = fOf(i, n, L.xs[i]);
      if (F <= 0.002) continue;
      begin(g, F, opt.blur != null ? opt.blur : 0.05);
      g.save();
      g.translate(X(cx + L.xs[i]), Z(cz));
      g.scale(L.k, 1);
      g.fillText(L.chars[i], 0, 0);
      g.restore();
    }
    g.restore();
  }
  function disc(g, x, z, r, F, blur = 0.05) {
    if (F <= 0.002 || r <= 0) return;
    begin(g, F, blur);
    g.beginPath();
    g.arc(X(x), Z(z), S(r), 0, TAU);
    g.fill();
  }
  function ring(g, x, z, r, w, F, blur = 0.08) {
    if (F <= 0.002 || r <= 0) return;
    begin(g, F, blur);
    g.lineWidth = S(w);
    g.beginPath();
    g.arc(X(x), Z(z), S(r), 0, TAU);
    g.stroke();
  }
  // gear: teeth march out from the rim, six straight spokes grow in to the hub
  function gear(g, x, z, th, F, grow) {
    if (F <= 0.002) return;
    const Ro = 3.15, Rr = 2.55, Ri = 1.85, Rh = 0.95, nT = 10, nS = 6;
    const gt = sstep(0.0, 0.55, grow), gs = sstep(0.35, 1.0, grow);
    begin(g, F, 0.07);
    g.save();
    g.translate(X(x), Z(z));
    g.rotate(th);
    g.beginPath();
    g.arc(0, 0, S(Rr), 0, TAU);
    g.arc(0, 0, S(Ri), 0, TAU, true);
    g.fill('evenodd');
    const tipR = Rr + (Ro - Rr) * gt;
    for (let i = 0; i < nT; i++) {
      const a = (i / nT) * TAU;
      const hw0 = 0.2 * (TAU / nT), hw1 = 0.13 * (TAU / nT);
      g.beginPath();
      g.moveTo(S(Math.cos(a - hw0) * (Rr - 0.05)), S(Math.sin(a - hw0) * (Rr - 0.05)));
      g.lineTo(S(Math.cos(a - hw1) * tipR), S(Math.sin(a - hw1) * tipR));
      g.lineTo(S(Math.cos(a + hw1) * tipR), S(Math.sin(a + hw1) * tipR));
      g.lineTo(S(Math.cos(a + hw0) * (Rr - 0.05)), S(Math.sin(a + hw0) * (Rr - 0.05)));
      g.closePath();
      g.fill();
    }
    if (gs > 0) {
      const inner = Ri - (Ri - Rh) * gs;
      g.lineWidth = S(0.4);
      g.lineCap = 'butt';
      for (let i = 0; i < nS; i++) {
        const a = (i / nS) * TAU;
        g.beginPath();
        g.moveTo(S(Math.cos(a) * (Ri + 0.05)), S(Math.sin(a) * (Ri + 0.05)));
        g.lineTo(S(Math.cos(a) * (inner - 0.05)), S(Math.sin(a) * (inner - 0.05)));
        g.stroke();
      }
      g.beginPath();
      g.arc(0, 0, S(Rh * gs), 0, TAU);
      g.arc(0, 0, S(Rh * gs * 0.45), 0, TAU, true);
      g.fill('evenodd');
    }
    g.restore();
  }
  // a folded paper plane seen from above-behind (generic, no circle): main sheet, crease gap, lower flap, keel
  const PLANE = [
    [[0.62, -0.52], [-0.62, 0.02], [-0.1, 0.13]],
    [[0.62, -0.52], [-0.02, 0.2], [0.06, 0.5]],
    [[-0.13, 0.17], [-0.05, 0.22], [-0.2, 0.42]],
  ];
  function plane(g, x, z, size, rot, F) {
    if (F <= 0.002) return;
    g.save();
    g.translate(X(x), Z(z));
    g.rotate(rot);
    [1.0, 0.92, 0.85].forEach((k, i) => {
      begin(g, F * k, 0.05);
      g.beginPath();
      PLANE[i].forEach(([u, v], j) => (j ? g.lineTo(S(u * size), S(v * size)) : g.moveTo(S(u * size), S(v * size))));
      g.closePath();
      g.fill();
    });
    g.restore();
  }

  // ---------------------------------------------------------------------------------------------
  // The choreography of the field (global T)
  // ---------------------------------------------------------------------------------------------
  const EV = {
    prick: 0.6, hex7: 1.2, flower: 1.8,
    hookSw: 2.4, hookSnap: 2.55, hookOff: 4.74,
    lub1: 4.8, dub1: 5.1, lub2: 6.0, dub2: 6.3,
    gearOn: 6.6, gearOff: 8.25,
    tagSw: 8.4, tagSnap: 8.7, tagOff: 11.85,
    planeSw: 11.85, planeOn: 12.0, planeOff: 14.25,
    brandSw: 14.4, brandSnap: 14.7,
    etch0: 15.0, etch1: 16.2,
  };
  FILM.ferroEvents = EV;
  const SPOT = [0.42, -0.5]; // where the first spike pricks up

  function planeX(T) {
    const u = clamp((T - EV.planeSw) / (EV.planeOff + 0.15 - EV.planeSw));
    return lerp(-9.6, 10.4, u * 0.35 + easeIO(u) * 0.65);
  }
  const PLANE_Z = -1.0;

  function gearAngle(T) { // one 20-degree tick per beat; 3 ticks = 60 deg (the lattice's own symmetry)
    let th = 0;
    for (let k = 0; k < 3; k++) th += (TAU / 18) * rise(T - (EV.gearOn + 0.6 + k * BEAT), 3.2, 0.42);
    return th;
  }

  // the brand's on-beat pulse, frame-exact and periodic inside the loop bar
  function brandPulse(T) {
    let f = Math.round(T * FPS);
    if (f >= LOOPF) f = LOOPF + ((f - LOOPF) % BARF);
    const f0 = Math.round((EV.brandSnap + 0.6) * FPS);
    if (f < f0) return 0;
    const ph = (f - LOOPF + 10 * BARF) % BEATF; // pulses on the bar's beats (frames 576, 594, 612, 630)
    return 0.1 * Math.exp(-(ph / FPS) / 0.12);
  }

  function drawField(T) {
    return function (g, fd) {
      FD = fd;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighten';
      const cx = PC[0], cz = PC[1];

      // 1. the awakening: 1 spike, then 7 (a hexagon), then 19: the lattice reveals itself on the beats
      if (T > EV.prick - 0.3 && T < EV.hookSw + 0.4) {
        const off = fall(T - (EV.hookSw - 0.04), 0.06);
        disc(g, SPOT[0], SPOT[1], 0.09, (0.3 * sstep(0.3, 0.6, T) * (1 - rise(T - EV.prick)) + 1.15 * rise(T - EV.prick, 5.5, 0.28)) * off, 0.03);
        disc(g, SPOT[0], SPOT[1], 0.24, 1.05 * rise(T - EV.hex7, 5, 0.3) * off, 0.04);
        disc(g, SPOT[0], SPOT[1], 0.42, 0.98 * rise(T - EV.flower, 5, 0.3) * off, 0.05);
      }

      // 2. hook «НЕВИДИМАЯ / СИЛА»: swells under both lines, snaps on 2.7 from the centre outward
      if (T > EV.hookSw - 0.05 && T < EV.hookOff + 0.5) {
        const sn = snapAt(T, EV.hookSnap + 0.9, EV.hookOff - 0.1, 0.14);
        const f = (i, n, x) => (1 + sn) * word(T, EV.hookSw, EV.hookSnap, EV.hookOff, Math.abs(x) * 0.012);
        letters(g, 'НЕВИДИМАЯ', cx, cz - 1.45, 2.55, 17.6, f);
        letters(g, 'СИЛА', cx, cz + 1.75, 2.55, 17.6, f);
      }

      // 3. heartbeat: lub-dub rings bloom from the centre
      if (T > EV.lub1 - 0.05 && T < EV.gearOn + 0.6) {
        for (const [tb, a] of [[EV.lub1, 1.0], [EV.dub1, 0.7], [EV.lub2, 1.0], [EV.dub2, 0.75]]) {
          const tau = T - tb;
          if (tau < 0 || tau > 1.4) continue;
          const r = 0.45 + 2.7 * easeO(tau / 1.1);
          ring(g, cx, cz, r, 0.62 - 0.22 * clamp(tau / 1.1), a * 1.45 * rise(tau, 6, 0.3) * Math.exp(-tau / 0.75));
        }
        const core = 0.7 * rise(T - EV.lub1, 5, 0.3) * fall(T - EV.gearOn, 0.12);
        const th = Math.max(T >= EV.lub1 ? Math.exp(-(T - EV.lub1) / 0.18) : 0, T >= EV.lub2 ? Math.exp(-(T - EV.lub2) / 0.18) : 0);
        disc(g, cx, cz, 0.62 + 0.3 * th, core * (0.8 + 0.55 * th), 0.08);
        ring(g, cx, cz, 2.2, 0.62, 1.05 * rise(T - (EV.gearOn - 0.3), 4.5, 0.35) * fall(T - (EV.gearOn + 0.12), 0.08));
      }

      // 4. gear: the ring marches out into teeth, spokes grow in; turns one tick per beat
      if (T > EV.gearOn - 0.05 && T < EV.gearOff + 0.5) {
        const F = 1.05 * rise(T - EV.gearOn, 4.2, 0.4) * fall(T - EV.gearOff) + snapAt(T, EV.gearOn + 0.6, EV.gearOff - 0.1, 0.18);
        gear(g, cx, cz, gearAngle(T), F, clamp((T - EV.gearOn) / 0.55));
      }

      // 5. «БИЗНЕС НА / АВТОПИЛОТЕ»: swell 8.4, snap 8.7
      if (T > EV.tagSw - 0.05 && T < EV.tagOff + 0.5) {
        const sn = snapAt(T, EV.tagSnap + 0.9, EV.tagOff - 0.2, 0.12);
        const f = (i, n, x) => (1.04 + sn) * word(T, EV.tagSw, EV.tagSnap, EV.tagOff, Math.abs(x) * 0.012);
        letters(g, 'БИЗНЕС НА', cx, cz - 1.5, 2.3, 13.8, f, { track: 0.06 });
        letters(g, 'АВТОПИЛОТЕ', cx, cz + 1.55, 2.75, 17.2, f);
      }

      // 6. the paper plane glides across; the lattice travels with the field (see lattice())
      if (T > EV.planeSw - 0.05 && T < EV.planeOff + 0.5) {
        const bank = 0.06 * Math.sin((T - EV.planeOn) * 2.2);
        const F = 1.1 * word(T, EV.planeSw, EV.planeOn, EV.planeOff, 0) + snapAt(T, EV.planeOn + 0.6, EV.planeOff, 0.1);
        plane(g, planeX(T), PLANE_Z, 5.6, 0.05 + bank, F);
      }

      // 7. «AiXenix»: swell 14.4, snap 14.7, stays through the end card
      if (T > EV.brandSw - 0.05) {
        const sn = brandPulse(T);
        letters(g, 'AiXenix', cx, cz + 1.7, 4.47, 15.6, (i, n, x) => (1.02 + sn) * word(T, EV.brandSw, EV.brandSnap, 1e9, Math.abs(x) * 0.01), { blur: 0.05, track: 0.015 });
      }

      g.restore();
    };
  }

  function lattice(T) {
    if (T >= EV.gearOn && T < EV.tagSw) return { x: PC[0], z: PC[1], rot: gearAngle(T) };
    if (T >= EV.planeSw && T < EV.brandSw) return { x: planeX(T) - planeX(EV.planeSw), z: PC[1], rot: 0 };
    return { x: PC[0], z: PC[1], rot: 0 };
  }

  // ripple sources: the liquid is alive from frame 0; every snap and collapse sends rings out
  const RIPPLES = [
    { x: -4.5, z: -3.2, t: -1.1, a: 0.012 },
    { x: 3.5, z: -2.8, t: -0.5, a: 0.01 },
    { x: SPOT[0], z: SPOT[1], t: 0.6, a: 0.012 },
    { x: SPOT[0], z: SPOT[1], t: 1.2, a: 0.014 },
    { x: SPOT[0], z: SPOT[1], t: 1.8, a: 0.016 },
    { x: -3, z: -2.4, t: 2.57, a: 0.02 },
    { x: 3, z: 0.7, t: 2.57, a: 0.02 },
    { x: 0, z: -1.0, t: 4.78, a: 0.022 },
    { x: 0, z: -1.0, t: 4.8, a: 0.018 },
    { x: 0, z: -1.0, t: 5.1, a: 0.012 },
    { x: 0, z: -1.0, t: 6.0, a: 0.018 },
    { x: 0, z: -1.0, t: 6.3, a: 0.012 },
    { x: 0, z: -1.0, t: 8.28, a: 0.02 },
    { x: -2.5, z: -2.5, t: 8.72, a: 0.02 },
    { x: 2.5, z: 0.5, t: 8.72, a: 0.02 },
    { x: 0, z: -1.0, t: 11.9, a: 0.022 },
    { x: 0, z: 0.7, t: 14.72, a: 0.022 },
  ];
  function ripples(T) {
    const out = [];
    for (const r of RIPPLES) {
      const age = T - r.t;
      if (age <= 0 || age > 3.4) continue;
      out.push({ x: r.x, z: r.z, age, amp: r.a * sstep(0, 0.05, age) });
    }
    return out.slice(-6);
  }

  // ---------------------------------------------------------------------------------------------
  // Camera: per-shot moves (cuts at 2.4, 4.8, 8.4, 12.0, 14.4)
  // ---------------------------------------------------------------------------------------------
  function orbit(look, el, az, D) {
    const e = (el * Math.PI) / 180, a = (az * Math.PI) / 180;
    return [look[0] + D * Math.cos(e) * Math.sin(a), look[1] + D * Math.sin(e), look[2] + D * Math.cos(e) * Math.cos(a)];
  }
  const FINAL = { look: [0, 0, 2.5], el: 58, az: 0, D: 19.0 };
  function camera(T) {
    let look, el, az, D, aper = 0, fov = 30;
    if (T < 2.4) {
      const u = T / 2.4;
      look = [0.25 + 0.25 * u, 0.06, -0.55];
      el = lerp(12.5, 16.5, easeIO(u));
      az = lerp(-16, -6, u);
      D = lerp(4.6, 3.7, easeIO(u));
      aper = lerp(15, 26, sstep(0.4, 1.2, T)); fov = 28;
    } else if (T < 4.8) {
      const u = (T - 2.4) / 2.4;
      look = [0, 0, PC[1] + 0.15];
      el = lerp(42, 47, easeO(u));
      az = lerp(4, -1.5, u);
      D = lerp(24.5, 22.2, easeO(u));
      aper = 6;
    } else if (T < 8.4) {
      const u = (T - 4.8) / 3.6;
      look = [0, 0, PC[1]];
      el = lerp(31, 54, easeIO(u));
      az = lerp(14, -10, u);
      D = lerp(12.5, 15.0, easeIO(u));
      aper = lerp(7, 5, u);
    } else if (T < 12.0) {
      const u = (T - 8.4) / 3.6;
      look = [0, 0, PC[1] + 0.1];
      el = lerp(50, 53, u);
      az = lerp(-2, 2, u);
      D = lerp(23.2, 21.6, easeO(u));
      aper = 5;
    } else if (T < 14.4) { // the camera only half-follows: the plane visibly crosses the frame
      const u = (T - 12.0) / 2.4;
      look = [lerp(-3.2, 3.6, easeIO(u)), 0.05, PLANE_Z + 0.2];
      el = lerp(36, 41, u);
      az = lerp(-12, 10, u);
      D = 14.0;
      aper = 9;
    } else {
      const e = easeO((T - 14.4) / 2.4);
      look = [0, 0, lerp(1.4, FINAL.look[2], e)];
      el = lerp(52, FINAL.el, e);
      az = lerp(-3, FINAL.az, e);
      D = lerp(22.6, FINAL.D, e);
      aper = 0;
    }
    return { pos: orbit(look, el, az, D), look, fov, focus: D, aper, maxCoc: 22, el };
  }

  // ---------------------------------------------------------------------------------------------
  // Studio lights (reflection-space area lights)
  // ---------------------------------------------------------------------------------------------
  function rig(T, camEl) {
    if (T < 2.4) {
      // macro: a black studio, two strip boxes behind the camera, thin brand-colour accents
      const wake = sstep(0.4, 0.9, T);
      const u = clamp(T / 2.3);
      return [
        { az: 4, el: lerp(4.5, 30, easeIO(u)), w: 1.3, h: 0.009, soft: 0.005, power: 8 * (0.45 + 0.55 * sstep(0, 0.35, T)) * (1 - sstep(1.6, 2.1, T)), color: SWP }, // the sweep
        { az: 162, el: 28, w: 0.03, h: 0.45, soft: 0.02, power: 40 * wake, color: KEY },
        { az: 198, el: 28, w: 0.03, h: 0.45, soft: 0.02, power: 40 * wake, color: KEY },
        { az: 180, el: 17, w: 0.7, h: 0.02, soft: 0.012, power: 5 * wake, color: KEY },
        { az: -62, el: 9, w: 0.045, h: 0.3, soft: 0.03, power: 55 * wake, color: MAG },
        { az: 128, el: 6, w: 0.05, h: 0.3, soft: 0.03, power: 55 * wake, color: CYA },
      ];
    }
    // wide: a black studio. One crisp-edged softbox is placed so its reflection sits exactly behind the
    // shape in the black mirror (a magenta panel with a violet surround), a thin cyan strip runs under it;
    // two strip boxes behind the camera and a cyan side strip give the cones their glints. The panel
    // switches on with the cut, as the field swells.
    const B = band(T);
    const on = sstep(2.4, 2.62, T);
    const tn = (deg) => Math.tan((deg * Math.PI) / 180);
    const L = [
      { az: 0, el: camEl + B.off, w: 1.1, h: 0.42, soft: 0.6, fall: 2.4, power: 1.2 * on, color: VIO },
      { az: 0, el: camEl + B.off, w: 0.55, h: 0.2, soft: 0.4, fall: 2.8, power: 1.45 * on, color: MAG },
      { az: 180, el: 25, w: 0.8, h: 0.25, soft: 0.1, power: 8.5, color: KEY },
      { az: 162, el: 26, w: 0.03, h: 0.45, soft: 0.02, power: 40, color: KEY },
      { az: 198, el: 26, w: 0.03, h: 0.45, soft: 0.02, power: 40, color: KEY },
      { az: 180, el: 13, w: 0.7, h: 0.025, soft: 0.02, power: 14, color: KEY },
      { az: 120, el: 7, w: 0.05, h: 0.3, soft: 0.03, power: 50, color: CYA },
      { az: 0, el: 4, w: 1.6, h: 0.02, soft: 0.02, power: 2.0, color: VIO },
    ];
    if (T >= EV.etch0) {
      // the light sweep across the etched rim; in the loop bar a periodic glint (zero at the seam)
      const loop = T >= LOOP0;
      const ph = loop ? ((Math.round(T * FPS) - LOOPF) % BARF) / BARF : clamp((T - EV.etch0) / (EV.etch1 - EV.etch0));
      const pw = loop ? 4 * Math.pow(Math.sin(Math.PI * ph), 2) : 6 * sstep(EV.etch0 - 0.3, EV.etch0, T) * (1 - sstep(EV.etch1, EV.etch1 + 0.6, T));
      if (pw > 0) L[7] = { az: lerp(-70, 70, ph), el: 16, w: 0.05, h: 0.13, soft: 0.04, power: pw * 2.5, color: SWP };
    }
    return L.slice(0, 8);
  }

  // where the shape sits on screen, so the softbox's reflection lands right behind it (deg offset from
  // the camera elevation, half-height in deg, gnomonic half-width)
  function band(T) {
    if (T < 4.8) return { off: -0.6, h: 7.0, w: 0.42 };
    if (T < 8.4) return { off: 0.5, h: lerp(10.5, 9.5, clamp((T - 4.8) / 3.6)), w: 0.36 };
    if (T < 12.0) return { off: -0.4, h: 7.2, w: 0.44 };
    if (T < 14.4) return { off: 0.2, h: 7.0, w: 0.52 };
    return { off: lerp(-3.5, -5.6, easeO((T - 14.4) / 2.4)), h: 5.6, w: 0.44 };
  }

  // ---------------------------------------------------------------------------------------------
  // Etched rim: «БИЗНЕС НА АВТОПИЛОТЕ» / «aixenix.com  [plane]  t.me/aixenix»
  // ---------------------------------------------------------------------------------------------
  function engrave(e, ER) {
    const px = ER.px;
    const EX = (x) => (x - ER.x0) * px, EZ = (z) => (z - ER.z0) * px;
    e.save();
    e.setTransform(1, 0, 0, 1, 0, 0);
    e.fillStyle = P.ffField;
    e.textBaseline = 'middle';
    e.filter = 'blur(1.0px)';
    e.font = `600 ${(0.66 * px).toFixed(1)}px "Avenir Next"`;
    e.textAlign = 'center';
    if ('letterSpacing' in e) e.letterSpacing = `${(0.17 * px).toFixed(1)}px`;
    e.fillText('БИЗНЕС НА АВТОПИЛОТЕ', EX(0), EZ(5.2));
    if ('letterSpacing' in e) e.letterSpacing = `${(0.03 * px).toFixed(1)}px`;
    e.font = `600 ${(0.98 * px).toFixed(1)}px "Avenir Next"`;
    e.textAlign = 'right';
    e.fillText('aixenix.com', EX(-1.0), EZ(6.3));
    e.textAlign = 'left';
    e.fillText('t.me/aixenix', EX(1.15), EZ(6.3));
    // a classic paper dart from the side: upper wing and keel, split by the fold
    const pc = [0.07, 6.3], sz = 1.05;
    const poly = (pts) => { e.beginPath(); pts.forEach(([u, v], k) => { const a = EX(pc[0] + u * sz), b = EZ(pc[1] + v * sz); k ? e.lineTo(a, b) : e.moveTo(a, b); }); e.closePath(); e.fill(); };
    poly([[0.62, 0.0], [-0.62, -0.26], [-0.46, 0.0]]);           // wing, seen from the side
    poly([[0.2, 0.05], [-0.46, 0.05], [-0.36, 0.3]]);             // keel hanging under the fold
    e.restore();
  }

  // ---------------------------------------------------------------------------------------------
  FILM.ferroState = function ferroState(T) {
    const cam = camera(T);
    const macro = T < 2.4;
    return {
      T,
      cam,
      field: drawField(T),
      lattice: lattice(T),
      ripples: ripples(T),
      lights: rig(T, cam.el),
      amb: { top: [0.0016, 0.0006, 0.0034], bot: [0.0005, 0.0002, 0.0009] },
      spike: macro
        ? { a: 0.16, h: 0.36, fc: 0.3, mound: 0.05, kr: 0.82, coneK: 1.7, breath: 0.03, breathW: TAU / 0.8, swell: 0.04, draw: 0.015 }
        : { a: 0.18, h: 0.36, fc: 0.3, mound: 0.015, kr: 0.74, coneK: 1.5, breath: 0.03, breathW: TAU / 0.8, swell: 0.07, draw: 0.022 },
      engrave, engraveKey: 'rim-v5',
      etch: { front: T < EV.etch0 ? -14 : lerp(-12, 13, easeIO(clamp((T - EV.etch0) / (EV.etch1 - EV.etch0)))), soft: 1.6, bright: 0.15, glint: T < EV.etch1 + 0.3 ? 0.4 : 0, bump: sstep(14.6, 15.1, T) },
      post: macro ? { bloom: 0.16, bloomThreshold: 1.4, exposure: 1.0, vig: 0.38, grain: 0.012 } : { bloom: 0.3, bloomThreshold: 1.2, exposure: 1.0, vig: 0.38, grain: 0.012 },
      plateFade: 1.1,
      plateRefl: macro ? 1.0 : lerp(0.14, 0.3, sstep(14.5, 15.0, T)),
      wake: T >= EV.planeOn && T < EV.brandSw + 1.0 ? { x: planeX(Math.min(T, EV.planeOff)) - 3.2, z: PLANE_Z + 0.4, amp: 0.016 * fall(T - EV.planeOff, 0.6), age: T - EV.planeOn } : null,
      skyK: 0.0,
      refine: macro ? 0.12 : T >= 12.0 && T < 14.4 ? 0.08 : 0,
      grainSeed: Math.round(T * FPS) % BARF, // the loop bar's grain repeats too
    };
  };
  FILM.ferroConst = { BEAT, BAR, DUR, LOOP0, PC };
})();
