/*
 * props.js : the oscilloscope's vocabulary and the oscilloscope itself.
 *
 * 01 «Осциллограф» — AiXenix. THE LAW: every lit pixel on the screen is the phosphor trace of ONE
 * electron beam whose X deflection is the LEFT channel and whose Y deflection is the RIGHT channel
 * of the film's own soundtrack. src/cast.js composes that stereo signal (FILM.osc); src/music.js
 * plays exactly those samples; this file draws exactly those samples. One source of truth.
 *
 *   FILM.vec    single-stroke vector font (Cyrillic + Latin), shape builders and the beam-program
 *               builder (a set of strokes -> a closed path parameterised by beam time u in [0, 1)).
 *   FILM.scope  the instrument: a WebGL2 vector CRT. For frame T it takes the beam samples of
 *               [T - tail, T + 1/fps), reconstructs the analogue signal between samples (Catmull-Rom,
 *               the DAC's job), deposits a Gaussian beam spot along every segment with energy
 *               proportional to the time the beam spent there (slow = bright, jumps = nearly invisible),
 *               integrates a two-layer phosphor (fast fluorescence + slow afterglow) over the camera
 *               shutter, blooms it through the glass and composites the bezel, graticule and glare.
 *
 * Units: scope units. x in [-1, 1] spans the graticule's 10 divisions (0.2 per division),
 * y in [-0.6, 0.6] its 6 divisions; +y is up. 1 unit = 760 px at 1920x1080.
 * Everything is a pure function of its inputs; GL state is rebuilt from scratch each frame.
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;

  // ------------------------------------------------------------------ vector font
  // Cap height 1, baseline 0, +y up, x-height 0.62. A glyph is { w, s: [stroke, ...] }; a stroke is
  // an array of [x, y]; a one-point stroke is a dwell (the beam rests: a bright dot).
  function arc(cx, cy, rx, ry, a0, a1, n) {
    const m = n || Math.max(6, Math.ceil(Math.abs(a1 - a0) / 10));
    const out = [];
    for (let k = 0; k <= m; k++) {
      const a = (a0 + ((a1 - a0) * k) / m) * DEG;
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
    }
    return out;
  }
  const cat = (...parts) => {
    const out = [];
    for (const p of parts) {
      if (typeof p[0] === 'number') out.push(p);
      else for (const q of p) out.push(q);
    }
    return out;
  };

  const G = {};
  G['А'] = G['A'] = { w: 0.72, s: [[[0, 0], [0.36, 1], [0.72, 0]], [[0.14, 0.36], [0.58, 0.36]]] };
  G['Б'] = { w: 0.6, s: [cat([0.58, 1], [0, 1], [0, 0], [0.28, 0], arc(0.28, 0.28, 0.3, 0.28, -90, 90), [0, 0.56])] };
  G['В'] = { w: 0.6, s: [cat([0, 0], [0, 1], [0.27, 1], arc(0.27, 0.755, 0.27, 0.245, 90, -90), [0, 0.51], [0.3, 0.51], arc(0.3, 0.255, 0.3, 0.255, 90, -90), [0, 0])] };
  G['Е'] = G['E'] = { w: 0.54, s: [[[0.54, 1], [0, 1], [0, 0], [0.54, 0]], [[0, 0.52], [0.44, 0.52]]] };
  G['З'] = { w: 0.6, s: [cat(arc(0.29, 0.75, 0.29, 0.25, 158, -90), arc(0.29, 0.26, 0.31, 0.26, 90, -158))] };
  G['И'] = { w: 0.64, s: [[[0, 1], [0, 0], [0.64, 1], [0.64, 0]]] };
  G['Й'] = { w: 0.64, s: [[[0, 1], [0, 0], [0.64, 1], [0.64, 0]], arc(0.32, 1.2, 0.15, 0.1, 196, 344, 8)] };
  G['К'] = G['K'] = { w: 0.6, s: [[[0, 1], [0, 0]], [[0.58, 1], [0, 0.46], [0.62, 0]]] };
  G['Л'] = { w: 0.64, s: [[[0, 0.02], [0.08, 0.04], [0.14, 0.12], [0.2, 0.4], [0.25, 1], [0.64, 1], [0.64, 0]]] };
  G['Н'] = G['H'] = { w: 0.62, s: [[[0, 1], [0, 0]], [[0, 0.5], [0.62, 0.5]], [[0.62, 1], [0.62, 0]]] };
  G['О'] = G['O'] = { w: 0.74, s: [arc(0.37, 0.5, 0.37, 0.5, 90, 450, 40)] };
  G['П'] = { w: 0.62, s: [[[0, 0], [0, 1], [0.62, 1], [0.62, 0]]] };
  G['Р'] = G['P'] = { w: 0.58, s: [cat([0, 0], [0, 1], [0.3, 1], arc(0.3, 0.74, 0.28, 0.26, 90, -90), [0, 0.48])] };
  G['С'] = G['C'] = { w: 0.66, s: [arc(0.38, 0.5, 0.38, 0.5, 48, 312, 30)] };
  G['Т'] = G['T'] = { w: 0.64, s: [[[0, 1], [0.64, 1]], [[0.32, 1], [0.32, 0]]] };
  G['У'] = { w: 0.64, s: [[[0, 1], [0.35, 0.34]], [[0.64, 1], [0.27, 0.12], [0.19, 0.03], [0.06, 0]]] };
  G['Ш'] = { w: 0.82, s: [[[0, 1], [0, 0], [0.82, 0], [0.82, 1]], [[0.41, 0], [0.41, 1]]] };
  G['X'] = G['Х'] = { w: 0.64, s: [[[0, 1], [0.64, 0]], [[0.64, 1], [0, 0]]] };
  // lowercase latin
  G['a'] = { w: 0.5, s: [arc(0.25, 0.31, 0.25, 0.31, 20, 380, 26), [[0.5, 0.62], [0.5, 0]]] };
  G['c'] = { w: 0.48, s: [arc(0.28, 0.31, 0.28, 0.31, 45, 315, 22)] };
  G['e'] = { w: 0.54, s: [cat([0.02, 0.31], [0.53, 0.31], arc(0.275, 0.31, 0.255, 0.31, 0, 318, 26))] };
  G['i'] = { w: 0.08, s: [[[0.04, 0.88]], [[0.04, 0.62], [0.04, 0]]] };
  G['m'] = { w: 0.78, s: [[[0, 0], [0, 0.62]], cat([0, 0.38], arc(0.195, 0.4, 0.195, 0.22, 180, 0, 10), [0.39, 0]), cat([0.39, 0.4], arc(0.585, 0.4, 0.195, 0.22, 180, 0, 10), [0.78, 0])] };
  G['n'] = { w: 0.48, s: [[[0, 0], [0, 0.62]], cat([0, 0.38], arc(0.24, 0.4, 0.24, 0.22, 180, 0, 12), [0.48, 0])] };
  G['o'] = { w: 0.56, s: [arc(0.28, 0.31, 0.28, 0.31, 90, 450, 28)] };
  G['t'] = { w: 0.36, s: [cat([0.12, 0.92], [0.12, 0.14], arc(0.26, 0.14, 0.14, 0.14, 180, 270, 6), [0.36, 0]), [[0, 0.62], [0.34, 0.62]]] };
  G['x'] = { w: 0.52, s: [[[0, 0.62], [0.52, 0]], [[0.52, 0.62], [0, 0]]] };
  G['.'] = { w: 0.08, s: [[[0.04, 0.04]]] };
  G['/'] = { w: 0.42, s: [[[0, -0.06], [0.42, 1.02]]] };
  G[' '] = { w: 0.34, s: [] };
  // panel lettering (latin caps)
  G['I'] = { w: 0.0, s: [[[0, 0], [0, 1]]] };
  G['N'] = { w: 0.62, s: [[[0, 0], [0, 1], [0.62, 0], [0.62, 1]]] };
  G['S'] = { w: 0.56, s: [cat(arc(0.28, 0.75, 0.27, 0.25, 20, 270, 14), arc(0.28, 0.25, 0.28, 0.25, 90, -160, 14))] };
  G['F'] = { w: 0.52, s: [[[0.52, 1], [0, 1], [0, 0]], [[0, 0.52], [0.42, 0.52]]] };
  G['U'] = { w: 0.6, s: [cat([0, 1], arc(0.3, 0.3, 0.3, 0.3, 180, 360, 12), [0.6, 1])] };
  G['Y'] = { w: 0.64, s: [[[0, 1], [0.32, 0.5], [0.64, 1]], [[0.32, 0.5], [0.32, 0]]] };
  G['L'] = { w: 0.5, s: [[[0, 1], [0, 0], [0.5, 0]]] };
  G['R'] = { w: 0.58, s: [cat([0, 0], [0, 1], [0.3, 1], arc(0.3, 0.74, 0.28, 0.26, 90, -90), [0, 0.48], [0.58, 0])] };
  G['-'] = { w: 0.36, s: [[[0, 0.48], [0.36, 0.48]]] };

  /**
   * text(str, { x, y, size, align, track }) -> strokes in scope units.
   * x, y: anchor (baseline); size: cap height in scope units; align 'center' | 'left'.
   */
  function text(str, o) {
    const size = o.size;
    const track = o.track != null ? o.track : 0.2;
    let wsum = 0;
    const chars = [...str];
    chars.forEach((ch, i) => {
      const g = G[ch] || G[' '];
      wsum += g.w + (i < chars.length - 1 ? track : 0);
    });
    let x0 = o.align === 'left' ? o.x : o.x - (wsum * size) / 2;
    const out = [];
    for (const ch of chars) {
      const g = G[ch] || G[' '];
      for (const s of g.s) out.push(s.map(([px, py]) => [x0 + px * size, o.y + py * size]));
      x0 += (g.w + track) * size;
    }
    out.width = wsum * size;
    return out;
  }

  // ------------------------------------------------------------------ shapes (all in scope units)
  /** circle as one closed stroke, starting at angle a0 */
  function circle(cx, cy, r, n, a0) {
    return [arc(cx, cy, r, r, a0 || 0, (a0 || 0) + 360, n || 64)];
  }

  /**
   * gear(cx, cy, R, teeth, o) -> strokes: toothed rim (closed) + hub circle.
   * o.rot: rotation (rad); o.h: tooth height; o.hub: hub radius.
   */
  function gear(cx, cy, R, teeth, o) {
    o = o || {};
    const h = o.h != null ? o.h : R * 0.16;
    const rot = o.rot || 0;
    const rim = [];
    const per = TAU / teeth;
    // a tooth: flank up over 12% of the pitch, flat top 30%, flank down 12%, root 46%
    const prof = [
      [0.0, 0], [0.12, 1], [0.42, 1], [0.54, 0], [1.0, 0],
    ];
    for (let k = 0; k < teeth; k++) {
      for (let j = 0; j < prof.length - 1; j++) {
        const [f0, l0] = prof[j];
        const [f1, l1] = prof[j + 1];
        const steps = l0 === l1 ? 5 : 2;
        for (let q = 0; q < steps; q++) {
          const f = f0 + ((f1 - f0) * q) / steps;
          const l = l0 + ((l1 - l0) * q) / steps;
          const a = rot + (k + f) * per;
          const r = R - h * 0.5 + h * l;
          rim.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
      }
    }
    rim.push(rim[0].slice());
    const hub = o.hub != null ? o.hub : R * 0.3;
    const out = [rim];
    if (hub > 0) out.push(arc(cx, cy, hub, hub, rot * (180 / Math.PI) + 180, rot * (180 / Math.PI) + 540, 32));
    return out;
  }

  /** paper plane (3/4 view dart) centred on its centroid, nose along +x; scaled by s, rotated by a */
  const PLANE = [
    // a folded paper dart in 3/4 view: near wing, far wing, keel fold under the body
    [[1.0, 0.0], [-0.72, 0.52], [-0.42, 0.04], [1.0, 0.0]],
    [[1.0, 0.0], [-0.42, 0.04], [-0.86, -0.16], [1.0, 0.0]],
    [[-0.42, 0.04], [-0.5, -0.3], [1.0, 0.0]],
  ];
  function plane(cx, cy, s, a) {
    const c = Math.cos(a);
    const sn = Math.sin(a);
    return PLANE.map((st) => st.map(([x, y]) => [cx + s * (x * c - y * sn), cy + s * (x * sn + y * c)]));
  }

  /** transform strokes: scale about origin, then translate */
  function xf(strokes, sx, sy, tx, ty) {
    return strokes.map((st) => st.map(([x, y]) => [x * sx + tx, y * sy + ty]));
  }

  // ------------------------------------------------------------------ beam programs
  /**
   * build(strokes, o) -> program. The beam draws every stroke at constant speed (time = length),
   * rests on dwell points, and jumps between strokes fast (time = o.jump + o.jumpK * distance), then
   * jumps from the last stroke back to the first. A program is { X, Y, C, total, length }:
   * C[k] is the cumulative beam time at point k; pos(u) walks it.
   */
  function build(strokes, o) {
    o = o || {};
    const jump = o.jump != null ? o.jump : 0.006;
    const jumpK = o.jumpK != null ? o.jumpK : 0.012;
    const dwell = o.dwell != null ? o.dwell : 0.035;
    const X = [];
    const Y = [];
    const C = [];
    let t = 0;
    let drawn = 0;
    let px = null;
    let py = null;
    for (const st of strokes) {
      if (!st.length) continue;
      const [x0, y0] = st[0];
      if (px !== null) {
        t += jump + jumpK * Math.hypot(x0 - px, y0 - py);
      }
      X.push(x0); Y.push(y0); C.push(t);
      if (st.length === 1) {
        t += dwell;
        X.push(x0); Y.push(y0); C.push(t);
      }
      for (let k = 1; k < st.length; k++) {
        const d = Math.hypot(st[k][0] - st[k - 1][0], st[k][1] - st[k - 1][1]);
        t += d;
        drawn += d;
        X.push(st[k][0]); Y.push(st[k][1]); C.push(t);
      }
      px = st[st.length - 1][0];
      py = st[st.length - 1][1];
    }
    // close the loop back to the first point
    if (X.length) {
      const d = Math.hypot(X[0] - px, Y[0] - py);
      if (d > 1e-9) t += jump + jumpK * d;
      X.push(X[0]); Y.push(Y[0]); C.push(t);
    }
    return { X: Float64Array.from(X), Y: Float64Array.from(Y), C: Float64Array.from(C), total: t, length: drawn };
  }

  /** program position at beam phase u (any real; wraps). Writes out[0], out[1]. */
  function pos(prog, u, out) {
    const C = prog.C;
    const n = C.length;
    if (n < 2) {
      out[0] = n ? prog.X[0] : 0;
      out[1] = n ? prog.Y[0] : 0;
      return out;
    }
    let f = u - Math.floor(u);
    const t = f * prog.total;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (C[mid] <= t) lo = mid;
      else hi = mid;
    }
    const span = C[hi] - C[lo];
    const a = span > 1e-12 ? (t - C[lo]) / span : 0;
    out[0] = prog.X[lo] + (prog.X[hi] - prog.X[lo]) * a;
    out[1] = prog.Y[lo] + (prog.Y[hi] - prog.Y[lo]) * a;
    return out;
  }

  /**
   * revealed position: the beam traces only the first r of the program (by beam time) during
   * the first `keep` of each cycle, then jumps back to the start. r in (0, 1].
   */
  function posReveal(prog, u, r, out, keep) {
    const k = keep || 0.985;
    const f = u - Math.floor(u);
    if (r >= 1) return pos(prog, f, out);
    const rr = Math.max(1e-4, r);
    if (f < k) return pos(prog, (f / k) * rr, out);
    const a = (f - k) / (1 - k);
    pos(prog, rr, out);
    const ex = out[0];
    const ey = out[1];
    pos(prog, 0, out);
    out[0] = ex + (out[0] - ex) * a;
    out[1] = ey + (out[1] - ey) * a;
    return out;
  }

  FILM.vec = { G, arc, text, circle, gear, plane, PLANE, xf, build, pos, posReveal };

  // ------------------------------------------------------------------ the instrument
  const SCR = { x0: 180, y0: 62, x1: 1740, y1: 1018, r: 74 }; // phosphor face (logical px)
  const CX = 960;
  const CY = 540;
  const UNIT = 760; // px per scope unit
  const DIV = 152; // graticule division (0.2 units)

  const VS_BEAM = `#version 300 es
  precision highp float;
  in vec2 a_c; in vec2 a_p0; in vec2 a_p1; in vec2 a_w0;
  uniform vec2 u_res; uniform float u_sig;
  out vec2 v_l; out float v_len; out vec2 v_w;
  void main() {
    vec2 d = a_p1 - a_p0; float len = length(d);
    vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
    vec2 nrm = vec2(-dir.y, dir.x);
    float ext = 3.0 * u_sig;
    float along = a_c.x < 0.0 ? -ext : len + ext;
    float across = a_c.y * ext;
    vec2 p = a_p0 + dir * along + nrm * across;
    v_l = vec2(along, across); v_len = len; v_w = a_w0;
    vec2 ndc = p / u_res * 2.0 - 1.0;
    gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
  }`;
  const FS_BEAM = `#version 300 es
  precision highp float;
  in vec2 v_l; in float v_len; in vec2 v_w;
  uniform float u_sig;
  out vec4 o;
  float erf_(float x) {
    float s = sign(x); float a = abs(x);
    float t = 1.0 + (0.278393 + (0.230389 + 0.078108 * (a * a)) * a) * a;
    t *= t;
    return s - s / (t * t);
  }
  void main() {
    float s = u_sig;
    float a = v_l.x; float d = v_l.y;
    float g = exp(-d * d / (2.0 * s * s)) / (2.50662827 * s);
    float along;
    if (v_len < 0.02 * s) {
      along = exp(-(a * a) / (2.0 * s * s)) / (2.50662827 * s);
    } else {
      along = (erf_(a / (1.41421356 * s)) - erf_((a - v_len) / (1.41421356 * s))) / (2.0 * v_len);
    }
    float e = g * along;
    o = vec4(v_w * e, 0.0, 1.0);
  }`;
  const VS_QUAD = `#version 300 es
  in vec2 a_c; out vec2 v_uv;
  void main() { v_uv = a_c * 0.5 + 0.5; gl_Position = vec4(a_c, 0.0, 1.0); }`;
  const FS_DOWN = `#version 300 es
  precision highp float;
  in vec2 v_uv; uniform sampler2D u_t; uniform sampler2D u_t2; uniform float u_k2; uniform vec2 u_px; out vec4 o;
  void main() {
    vec4 s = texture(u_t, v_uv + u_px * vec2(-0.5, -0.5)) + texture(u_t, v_uv + u_px * vec2(0.5, -0.5))
           + texture(u_t, v_uv + u_px * vec2(-0.5, 0.5)) + texture(u_t, v_uv + u_px * vec2(0.5, 0.5));
    o = s * 0.25 + texture(u_t2, v_uv) * u_k2;
  }`;
  const FS_BLUR = `#version 300 es
  precision highp float;
  in vec2 v_uv; uniform sampler2D u_t; uniform vec2 u_dir; out vec4 o;
  void main() {
    vec4 s = texture(u_t, v_uv) * 0.2270270;
    s += (texture(u_t, v_uv + u_dir * 1.3846154) + texture(u_t, v_uv - u_dir * 1.3846154)) * 0.3162162;
    s += (texture(u_t, v_uv + u_dir * 3.2307692) + texture(u_t, v_uv - u_dir * 3.2307692)) * 0.0702703;
    o = s;
  }`;
  const FS_COMP = `#version 300 es
  precision highp float;
  in vec2 v_uv;
  uniform sampler2D u_beam; uniform sampler2D u_tail; uniform sampler2D u_b1; uniform sampler2D u_b2; uniform sampler2D u_b3; uniform sampler2D u_b4; uniform sampler2D u_b5;
  uniform vec2 u_res;      // canvas px
  uniform float u_S;       // render scale
  uniform vec3 u_cf; uniform vec3 u_cs; uniform vec3 u_hf; uniform vec3 u_hs; uniform vec3 u_glass; uniform vec3 u_grat;
  uniform float u_exp; uniform float u_bloom;
  out vec4 o;
  float hsh(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
  float sdRound(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    // logical pixel of this fragment (y down)
    vec2 fp = vec2(v_uv.x, 1.0 - v_uv.y) * u_res / u_S;
    vec2 c = vec2(${CX.toFixed(1)}, ${CY.toFixed(1)});
    vec2 half_ = vec2(${((SCR.x1 - SCR.x0) / 2).toFixed(1)}, ${((SCR.y1 - SCR.y0) / 2).toFixed(1)});
    vec2 q = (fp - c) / half_;
    // the face bulges: content sampled with a gentle barrel so straight beams bow toward the rim
    float r2 = dot(q * vec2(1.0, 0.62), q * vec2(1.0, 0.62));
    vec2 qs = q * (1.0 - 0.028 * r2);
    vec2 lp = c + qs * half_;
    vec2 uv = vec2(lp.x, ${'1080.0'} - lp.y) / vec2(1920.0, 1080.0);
    vec4 B = texture(u_beam, uv) + texture(u_tail, uv) * 0.25;
    vec4 bl = texture(u_b1, uv) * 0.55 + texture(u_b2, uv) * 0.42 + texture(u_b3, uv) * 0.32 + texture(u_b4, uv) * 0.26 + texture(u_b5, uv) * 0.22;
    // the sharp trace in the core colours; the light scattered in the glass (bloom) in the halo colours
    vec2 E = B.xy * u_exp;
    vec2 Bl = bl.xy * u_bloom * u_exp;
    vec3 lit = 1.0 - exp(-(E.x * u_cf + E.y * u_cs + Bl.x * u_hf + Bl.y * u_hs));
    vec4 b4 = texture(u_b4, uv);
    vec3 halo = (b4.x * u_hf + b4.y * u_hs) * 0.10 * u_exp;
    lit += 1.0 - exp(-halo);
    // unlit phosphor: dark glass with a faint grain and vignette
    float vig = 1.0 - 0.55 * clamp(r2 * 0.75, 0.0, 1.0);
    float grain = hsh(floor(fp * u_S)) * 0.012 + hsh(floor(fp * u_S * 0.5) + 7.0) * 0.008;
    vec3 base = u_glass * vig + grain * u_glass * 4.0;
    // graticule on the inside face: 10 x 6 divisions, minor ticks on the axes
    vec2 g = (lp - c) / ${DIV.toFixed(1)};
    vec2 fw = fwidth(g);
    vec2 gl = abs(fract(g + 0.5) - 0.5) / max(fw, 1e-4);
    float lineG = 1.0 - clamp(min(gl.x, gl.y) - 0.15, 0.0, 1.0);
    vec2 tk = abs(fract(g * 5.0 + 0.5) - 0.5) / max(fw * 5.0, 1e-4);
    float onAx = (1.0 - clamp(abs(g.y) / fw.y - 0.15, 0.0, 1.0));
    float onAy = (1.0 - clamp(abs(g.x) / fw.x - 0.15, 0.0, 1.0));
    float tickX = (1.0 - clamp(tk.x - 0.15, 0.0, 1.0)) * step(abs(g.y), 0.075);
    float tickY = (1.0 - clamp(tk.y - 0.15, 0.0, 1.0)) * step(abs(g.x), 0.075);
    float grat = max(lineG * 0.55, max(tickX, tickY) * 0.85);
    grat = max(grat, max(onAx, onAy) * 0.7);
    // the graticule is dimmed under bright trace and slightly lit by it (scale illumination)
    vec3 col = base + u_grat * grat * (0.55 + 0.45 * vig) + lit;
    // glare: a soft window reflection on the glass, upper left, and a rim sheen
    float d = sdRound(fp - c, half_, ${SCR.r.toFixed(1)});
    vec2 gp = (fp - vec2(560.0, 250.0)) / vec2(520.0, 190.0);
    float glare = exp(-dot(gp, gp) * 1.6) * 0.035;
    float rim = exp(-abs(d + 10.0) / 18.0) * 0.05;
    col += vec3(0.75, 0.85, 0.95) * (glare + rim * (0.4 + 0.6 * smoothstep(1.0, -1.0, q.y)));
    // inner shadow at the bezel lip
    col *= smoothstep(0.0, -26.0, d) * 0.55 + 0.45 * smoothstep(-2.0, -60.0, d) ;
    float inside = smoothstep(1.0, -1.0, d);
    col = mix(vec3(0.0), col, inside);
    // dither to break gradient banding
    col += (hsh(fp * u_S + 3.1) - 0.5) / 255.0;
    o = vec4(col, 1.0);
  }`;

  let GL = null;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('scope shader: ' + gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('scope link: ' + gl.getProgramInfoLog(p));
    return p;
  }
  function target(gl, w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (!ok) throw new Error('scope: RGBA16F render target incomplete');
    return { tex, fb, w, h };
  }

  function initGL(w, h) {
    const canvas = FILM.makeCanvas(w, h);
    const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false, alpha: false, premultipliedAlpha: false, depth: false, stencil: false });
    if (!gl) throw new Error('scope: WebGL2 unavailable');
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('EXT_float_blend');
    const P = {
      beam: program(gl, VS_BEAM, FS_BEAM),
      down: program(gl, VS_QUAD, FS_DOWN),
      blur: program(gl, VS_QUAD, FS_BLUR),
      comp: program(gl, VS_QUAD, FS_COMP),
    };
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const pts = gl.createBuffer();
    const vaoBeam = gl.createVertexArray();
    const vaoQuad = gl.createVertexArray();
    gl.bindVertexArray(vaoQuad);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    for (const p of [P.down, P.blur, P.comp]) {
      const loc = gl.getAttribLocation(p, 'a_c');
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      }
    }
    gl.bindVertexArray(null);
    const beamRT = target(gl, w, h);
    const tailRT = target(gl, Math.ceil(w / 2), Math.ceil(h / 2));
    const levels = [];
    let lw = w;
    let lh = h;
    for (let k = 0; k < 5; k++) {
      lw = Math.max(1, Math.round(lw / 2));
      lh = Math.max(1, Math.round(lh / 2));
      levels.push({ a: target(gl, lw, lh), b: target(gl, lw, lh) });
    }
    GL = { canvas, gl, P, quad, pts, vaoBeam, vaoQuad, beamRT, tailRT, levels, w, h };
    return GL;
  }

  // The analogue beam between samples: Catmull-Rom reconstruction (the DAC's reconstruction
  // filter, in effect). Points are spaced adaptively: a long chord is subdivided (up to 4 parts),
  // runs of very short chords (slow beam) merge into one segment carrying their summed energy, so
  // the deposit is the same and the rasteriser draws ~5 px segments everywhere.
  const ESCALE = 2e5; // energy unit: keeps half-float deposits well above the subnormal range
  const BUF = [new Float32Array(0), new Float32Array(0)];

  /**
   * Fill the point buffer for frame T: returns the number of points. Each point: x, y (device px),
   * ef, es: the energy the segment STARTING at this point deposits in the fast and slow layers.
   */
  function gather(T, S, osc, iA0, iB0, slot, lmin, lstep) {
    const sr = osc.sr;
    const shut = 1 / FILM.FPS;
    const tf = osc.tauFast;
    const ts = osc.tauSlow;
    const iA = Math.max(0, iA0);
    const iB = Math.min(osc.n - 1, iB0);
    const count = iB - iA + 1;
    if (count < 2) return 0;
    const cap = (count * 4 + 8) * 4;
    if (BUF[slot].length < cap) BUF[slot] = new Float32Array(Math.ceil(cap * 1.25));
    const scratch = BUF[slot];
    const Lx = osc.X;
    const Ly = osc.Y;
    const Ik = osc.I;
    const u = UNIT * S;
    const cx = CX * S;
    const cy = CY * S;
    const T1 = T + shut;
    const LMIN = lmin;
    const LSTEP = lstep;
    const e1 = ESCALE / sr;
    const expo = (t, tau) => {
      if (t >= T1) return 0;
      const a = t > T ? t : T;
      return Math.exp(-(a - t) / tau) - Math.exp(-(T1 - t) / tau);
    };
    const at = (i) => (i < 0 ? 0 : i >= osc.n ? osc.n - 1 : i);
    const PX = (i) => cx + Lx[at(i)] * u;
    const PY = (i) => cy - Ly[at(i)] * u;
    let k = 0;
    let sx = PX(iA);
    let sy = PY(iA);
    let eF = 0;
    let eS = 0;
    let open = false;
    const flush = (x, y) => {
      scratch[k++] = sx;
      scratch[k++] = sy;
      scratch[k++] = eF;
      scratch[k++] = eS;
      sx = x;
      sy = y;
      eF = 0;
      eS = 0;
      open = false;
    };
    for (let i = iA; i < iB; i++) {
      const x1 = PX(i);
      const y1 = PY(i);
      const x2 = PX(i + 1);
      const y2 = PY(i + 1);
      const L = Math.hypot(x2 - x1, y2 - y1);
      const I = Ik[i] * e1;
      if (L < LMIN) {
        const tm = (i + 0.5) / sr;
        eF += I * expo(tm, tf);
        eS += I * expo(tm, ts);
        open = true;
        if (Math.hypot(x2 - sx, y2 - sy) >= LMIN) flush(x2, y2);
        continue;
      }
      if (open) flush(x1, y1);
      const n = Math.min(3, Math.ceil(L / LSTEP));
      const x0 = PX(i - 1);
      const y0 = PY(i - 1);
      const x3 = PX(i + 2);
      const y3 = PY(i + 2);
      for (let q = 1; q <= n; q++) {
        const f = q / n;
        const f2 = f * f;
        const f3 = f2 * f;
        const b0 = -0.5 * f3 + f2 - 0.5 * f;
        const b1 = 1.5 * f3 - 2.5 * f2 + 1;
        const b2 = -1.5 * f3 + 2 * f2 + 0.5 * f;
        const b3 = 0.5 * f3 - 0.5 * f2;
        const tm = (i + (q - 0.5) / n) / sr;
        eF = (I / n) * expo(tm, tf);
        eS = (I / n) * expo(tm, ts);
        flush(b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3, b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3);
      }
    }
    if (open) flush(PX(iB), PY(iB));
    // terminator: the end point of the last segment
    scratch[k++] = sx;
    scratch[k++] = sy;
    scratch[k++] = 0;
    scratch[k++] = 0;
    return k / 4;
  }

  const DBG = { stop: null, noBezel: false, gl: () => GL }; // profiling switches (tools only)
  function drawGL(T, S, osc, look) {
    const w = Math.max(2, Math.round(FILM.W * S));
    const h = Math.max(2, Math.round(FILM.H * S));
    const R = GL && GL.w === w && GL.h === h ? GL : initGL(w, h);
    const gl = R.gl;
    // The camera shutter is open over [T, T + 1/fps): that stretch of the beam is deposited at full
    // resolution. The afterglow of the preceding `tail` seconds (slow phosphor, a soft underlay) is
    // deposited at half resolution. The composite adds them (per-pixel density, area-corrected).
    const sr = osc.sr;
    // sample indices are snapped with a small epsilon: frame times k/30 land on whole samples, and
    // float noise in T * sr must not shift the segmentation (bar 11 must redraw bar 10 exactly)
    const iT = Math.floor(T * sr + 1e-6);
    const nA = gather(T, S, osc, iT, Math.ceil((T + 1 / FILM.FPS) * sr - 1e-6), 0, 5 * S, 9 * S);
    const nB = gather(T, S * 0.5, osc, Math.floor((T - osc.tail) * sr + 1e-6), iT, 1, 8 * S, 14 * S);
    DBG.n = nA + nB;
    gl.disable(gl.DEPTH_TEST);
    const beamPass = (rt, buf, n, sig) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, rt.fb);
      gl.viewport(0, 0, rt.w, rt.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (n < 2) return;
      gl.useProgram(R.P.beam);
      gl.bindVertexArray(R.vaoBeam);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.quad);
      const lc = gl.getAttribLocation(R.P.beam, 'a_c');
      gl.enableVertexAttribArray(lc);
      gl.vertexAttribPointer(lc, 2, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(lc, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, R.pts);
      gl.bufferData(gl.ARRAY_BUFFER, buf.subarray(0, n * 4), gl.STREAM_DRAW);
      const at = (name, off) => {
        const l = gl.getAttribLocation(R.P.beam, name);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 16, off);
        gl.vertexAttribDivisor(l, 1);
      };
      at('a_p0', 0);
      at('a_w0', 8);
      at('a_p1', 16);
      gl.uniform2f(gl.getUniformLocation(R.P.beam, 'u_res'), rt.w, rt.h);
      gl.uniform1f(gl.getUniformLocation(R.P.beam, 'u_sig'), sig);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n - 1);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    };
    beamPass(R.beamRT, BUF[0], DBG.skipA ? 0 : nA, look.sigma * S);
    beamPass(R.tailRT, BUF[1], DBG.skipB ? 0 : nB, Math.max(0.8, look.sigma * S * 0.5));
    DBG.nA = nA;
    DBG.nB = nB;
    if (DBG.stop === 'beam') return R.canvas;
    // ---- bloom chain
    gl.bindVertexArray(R.vaoQuad);
    let src = R.beamRT;
    for (const L of R.levels) {
      gl.useProgram(R.P.down);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.a.fb);
      gl.viewport(0, 0, L.a.w, L.a.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      gl.uniform1i(gl.getUniformLocation(R.P.down, 'u_t'), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, R.tailRT.tex);
      gl.uniform1i(gl.getUniformLocation(R.P.down, 'u_t2'), 1);
      gl.uniform1f(gl.getUniformLocation(R.P.down, 'u_k2'), src === R.beamRT ? 0.25 : 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.uniform2f(gl.getUniformLocation(R.P.down, 'u_px'), 1 / src.w, 1 / src.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.useProgram(R.P.blur);
      gl.uniform1i(gl.getUniformLocation(R.P.blur, 'u_t'), 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.b.fb);
      gl.bindTexture(gl.TEXTURE_2D, L.a.tex);
      gl.uniform2f(gl.getUniformLocation(R.P.blur, 'u_dir'), 1 / L.a.w, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, L.a.fb);
      gl.bindTexture(gl.TEXTURE_2D, L.b.tex);
      gl.uniform2f(gl.getUniformLocation(R.P.blur, 'u_dir'), 0, 1 / L.a.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      src = L.a;
    }
    if (DBG.stop === 'bloom') return R.canvas;
    // ---- composite to the default framebuffer
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, w, h);
    gl.useProgram(R.P.comp);
    const names = ['u_beam', 'u_tail', 'u_b1', 'u_b2', 'u_b3', 'u_b4', 'u_b5'];
    const texs = [R.beamRT.tex, R.tailRT.tex, ...R.levels.map((L) => L.a.tex)];
    names.forEach((nm, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, texs[i]);
      gl.uniform1i(gl.getUniformLocation(R.P.comp, nm), i);
    });
    const U = (nm, ...v) => gl['uniform' + v.length + 'f'](gl.getUniformLocation(R.P.comp, nm), ...v);
    U('u_res', w, h);
    U('u_S', S);
    U('u_cf', ...look.cf);
    U('u_cs', ...look.cs);
    U('u_hf', ...look.hf);
    U('u_hs', ...look.hs);
    U('u_glass', ...look.glass);
    U('u_grat', ...look.grat);
    U('u_exp', look.exposure * S * S);
    U('u_bloom', look.bloom);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    gl.activeTexture(gl.TEXTURE0);
    return R.canvas;
  }

  // ------------------------------------------------------------------ bezel and controls (2D)
  function strokeText(ctx, str, x, y, size, color, width) {
    const st = text(str, { x: 0, y: 0, size: 1, align: 'center', track: 0.28 });
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size, -size);
    ctx.lineWidth = width / size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    for (const s of st) {
      ctx.beginPath();
      if (s.length === 1) ctx.arc(s[0][0], s[0][1], 0.05, 0, TAU);
      else {
        ctx.moveTo(s[0][0], s[0][1]);
        for (let k = 1; k < s.length; k++) ctx.lineTo(s[k][0], s[k][1]);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function knob(ctx, x, y, r, ang, label) {
    // knurled skirt
    ctx.save();
    const sk = ctx.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.15);
    sk.addColorStop(0, '#3a3c42');
    sk.addColorStop(1, '#0d0e11');
    ctx.fillStyle = sk;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.12, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 36; k++) {
      const a = ang + (k * TAU) / 36;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      ctx.lineTo(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1);
      ctx.stroke();
    }
    // cap
    const cp = ctx.createRadialGradient(x - r * 0.25, y - r * 0.35, r * 0.05, x, y, r * 0.85);
    cp.addColorStop(0, '#565961');
    cp.addColorStop(0.6, '#24262b');
    cp.addColorStop(1, '#141519');
    ctx.fillStyle = cp;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.8, 0, TAU);
    ctx.fill();
    // pointer
    ctx.strokeStyle = '#c9ccd2';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(ang) * r * 0.25, y + Math.sin(ang) * r * 0.25);
    ctx.lineTo(x + Math.cos(ang) * r * 0.74, y + Math.sin(ang) * r * 0.74);
    ctx.stroke();
    // scale ticks
    ctx.strokeStyle = 'rgba(200,204,212,0.35)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k <= 10; k++) {
      const a = (135 + k * 27) * DEG;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * r * 1.22, y + Math.sin(a) * r * 1.22);
      ctx.lineTo(x + Math.cos(a) * r * 1.34, y + Math.sin(a) * r * 1.34);
      ctx.stroke();
    }
    ctx.restore();
    strokeText(ctx, label, x, y + r * 1.75, 11, 'rgba(190,196,206,0.55)', 1.6);
  }

  // an input jack with a patch cable plugged in; the cable runs off the left edge of the frame
  function jack(ctx, x, y, label, sub, col, colDark) {
    ctx.save();
    // socket flange
    const g = ctx.createRadialGradient(x - 6, y - 8, 2, x, y, 34);
    g.addColorStop(0, '#d9dbe0');
    g.addColorStop(0.5, '#7d8088');
    g.addColorStop(1, '#2a2c31');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 32, 0, TAU);
    ctx.fill();
    // cable: leaves the plug toward the viewer and falls away off the left edge
    const cab = new Path2D();
    cab.moveTo(x, y);
    cab.bezierCurveTo(x - 30, y + 30, x - 70, y + 70, x - 80, y + 150);
    cab.bezierCurveTo(x - 88, y + 210, x - 100, y + 260, x - 130, y + 300);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 26;
    ctx.save();
    ctx.translate(6, 8);
    ctx.stroke(cab);
    ctx.restore();
    ctx.strokeStyle = colDark;
    ctx.lineWidth = 20;
    ctx.stroke(cab);
    ctx.strokeStyle = col;
    ctx.lineWidth = 9;
    ctx.globalAlpha = 0.55;
    ctx.save();
    ctx.translate(-3, -3);
    ctx.stroke(cab);
    ctx.restore();
    ctx.globalAlpha = 1;
    // plug boot (coloured) and knurled metal sleeve
    const pb = ctx.createRadialGradient(x - 8, y - 10, 2, x, y, 26);
    pb.addColorStop(0, col);
    pb.addColorStop(1, colDark);
    ctx.fillStyle = pb;
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(230,232,236,0.75)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 24.5, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fill();
    ctx.restore();
    strokeText(ctx, label, x, y - 62, 30, 'rgba(225,230,238,0.85)', 3.2);
    strokeText(ctx, sub, x + 52, y + 52, 22, col, 3);
  }

  /** a channel LED next to the jack label: lit by that channel's signal level */
  function led(ctx, x, y, rgb, level) {
    const a = Math.max(0, Math.min(1, level));
    ctx.save();
    ctx.fillStyle = '#0a0b0d';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fill();
    const g = ctx.createRadialGradient(x, y, 0, x, y, 26);
    g.addColorStop(0, `rgba(${rgb},${(0.15 + 0.85 * a).toFixed(3)})`);
    g.addColorStop(0.25, `rgba(${rgb},${(0.08 + 0.5 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${(0.6 * a).toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(x - 1.5, y - 1.5, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // the static panel (body, brushing, bezel lip, screws, jacks, lamp) is drawn once per render scale
  // into a cache and blitted 1:1; only the knobs move.
  let PANEL = null;
  function panelCache() {
    const w = Math.max(2, Math.round(FILM.W * FILM.S));
    const h = Math.max(2, Math.round(FILM.H * FILM.S));
    if (PANEL && PANEL.width === w && PANEL.height === h) return PANEL;
    PANEL = FILM.makeCanvas(w, h);
    const c = PANEL.getContext('2d');
    c.setTransform(w / FILM.W, 0, 0, h / FILM.H, 0, 0);
    panel(c);
    return PANEL;
  }
  function bezel(ctx, look) {
    const cache = panelCache();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
    ctx.restore();
    led(ctx, 136, 268, '0,240,255', look.ledL);
    led(ctx, 136, 578, '255,43,214', look.ledR);
  }
  function panel(ctx) {
    const W = FILM.W;
    const H = FILM.H;
    ctx.save();
    // panel body around the face (even-odd: everything but the face)
    const body = ctx.createLinearGradient(0, 0, 0, H);
    body.addColorStop(0, '#1d1f24');
    body.addColorStop(0.5, '#15171b');
    body.addColorStop(1, '#0e0f12');
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.roundRect(SCR.x0, SCR.y0, SCR.x1 - SCR.x0, SCR.y1 - SCR.y0, SCR.r);
    ctx.fill('evenodd');
    // brushed texture: faint horizontal lines (deterministic), on the panel only
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.roundRect(SCR.x0 - 8, SCR.y0 - 8, SCR.x1 - SCR.x0 + 16, SCR.y1 - SCR.y0 + 16, SCR.r + 8);
    ctx.clip('evenodd');
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let y = 0; y < H; y += 3) {
      const a = FILM.lib.h3(y, 11, 3);
      if (a < 0.5) continue;
      ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();
    // the bezel lip: a raised rounded frame around the glass
    ctx.lineWidth = 14;
    const lip = ctx.createLinearGradient(0, SCR.y0, 0, SCR.y1);
    lip.addColorStop(0, '#3a3d44');
    lip.addColorStop(0.5, '#202227');
    lip.addColorStop(1, '#0a0b0d');
    ctx.strokeStyle = lip;
    ctx.beginPath();
    ctx.roundRect(SCR.x0 - 7, SCR.y0 - 7, SCR.x1 - SCR.x0 + 14, SCR.y1 - SCR.y0 + 14, SCR.r + 7);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.roundRect(SCR.x0 - 14, SCR.y0 - 14, SCR.x1 - SCR.x0 + 28, SCR.y1 - SCR.y0 + 28, SCR.r + 14);
    ctx.stroke();
    // screws
    for (const [x, y] of [[44, 40], [W - 44, 40], [44, H - 40], [W - 44, H - 40]]) {
      const g = ctx.createRadialGradient(x - 2, y - 3, 1, x, y, 10);
      g.addColorStop(0, '#8b8e96');
      g.addColorStop(1, '#25272c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 2);
      ctx.lineTo(x + 6, y + 2);
      ctx.stroke();
    }
    ctx.restore();
    // left strip: the two inputs. LEFT channel drives X, RIGHT channel drives Y.
    // LEFT channel (cyan cable) drives X, RIGHT channel (magenta cable) drives Y
    jack(ctx, 82, 330, 'X', 'L', '#2fe6f2', '#0b5f69');
    jack(ctx, 82, 640, 'Y', 'R', '#ff4fdc', '#6d1360');
    // power lamp
    ctx.save();
    const lampOn = true;
    const lg = ctx.createRadialGradient(90, 860, 1, 90, 860, 26);
    lg.addColorStop(0, lampOn ? 'rgba(255,190,120,0.95)' : 'rgba(80,60,50,0.9)');
    lg.addColorStop(0.35, lampOn ? 'rgba(255,120,60,0.45)' : 'rgba(40,30,25,0.6)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(90, 860, 26, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  /**
   * FILM.scope.draw(ctx, T): one frame of the instrument at global time T.
   * The look (phosphor colours, intensity, focus) comes from FILM.osc.look(T) in src/cast.js.
   */
  function draw(ctx, T) {
    const osc = FILM.osc.get();
    const look = Object.assign({}, FILM.osc.look(T));
    // channel signal level (AC part, RMS over the last 50 ms) for the jack LEDs
    {
      const i1 = Math.min(osc.n, Math.ceil((T + 1 / FILM.FPS) * osc.sr - 1e-6));
      const i0 = Math.max(0, i1 - Math.round(0.05 * osc.sr));
      let mx = 0, my = 0, sx = 0, sy = 0;
      const n = Math.max(1, i1 - i0);
      for (let i = i0; i < i1; i++) {
        mx += osc.X[i];
        my += osc.Y[i];
      }
      mx /= n;
      my /= n;
      for (let i = i0; i < i1; i++) {
        sx += (osc.X[i] - mx) * (osc.X[i] - mx);
        sy += (osc.Y[i] - my) * (osc.Y[i] - my);
      }
      look.ledL = Math.sqrt(Math.sqrt(sx / n) / 0.3);
      look.ledR = Math.sqrt(Math.sqrt(sy / n) / 0.2);
    }
    const S = FILM.S;
    const cv = drawGL(T, S, osc, look);
    ctx.save();
    FILM.baseTransform(ctx);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FILM.W, FILM.H);
    ctx.drawImage(cv, 0, 0, FILM.W, FILM.H);
    if (!DBG.noBezel) bezel(ctx, look);
    ctx.restore();
  }

  FILM.scope = { draw, SCR, CX, CY, UNIT, DIV, DBG };
})();
