/*
 * props.js : the FERROFLUID engine (prelude slot reused; this film has no doodle props).
 *
 * One physical set, rendered with three.js (global THREE from src/vendor.js):
 *   - a polished, spun-steel plate (circular brushing, etched lettering on its rim);
 *   - a puddle of black ferrofluid on it (rounded-rectangle pool with a convex meniscus edge);
 *   - an invisible magnet field F(x, z) under the plate. F is painted, every frame, into a 2D "field
 *     canvas" (world units, top view). The liquid answers it and nothing else:
 *       mound  : the fluid heaps up where the field is (blurred F)
 *       spikes : above the critical field the surface breaks into a hexagonal lattice of
 *                Rosensweig cones; every cone samples F at its own lattice site, so cones rise whole.
 * The surface is a screen-space projected grid (uniform vertex density on screen), displaced in the
 * vertex shader; the fragment shader recomputes the analytic gradient per pixel, so every cone has
 * crisp per-pixel reflections. Lighting is a studio environment of soft area lights evaluated in
 * reflection space (glossy black liquid = reflections only).
 *
 * Determinism: every frame is a pure function of the state passed to render(); the field canvas and
 * every render target are fully redrawn each frame. No Math.random / Date / performance.now here.
 *
 * API: FILM.ferro.render(ctx, st) draws the frame into ctx (FILM canvas). See DEFAULTS for st.
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const FERRO = (FILM.ferro = {});

  // ---------------------------------------------------------------------------------------------
  // World constants (world units; y up; the camera usually sits on +z looking toward -z)
  // ---------------------------------------------------------------------------------------------
  const POOL = { hx: 11.0, hz: 5.6, r: 3.0, edge: 0.32, depth: 0.075, cz: -1.0 }; // rounded-rect puddle
  const FIELD = { x0: -12.5, z0: -7.6, w: 25, h: 13.2, px: 44 }; // field canvas world rect, px per unit
  const ENGR = { x0: -9.5, z0: 4.6, w: 19, h: 3.2, px: 128 }; // etched rim lettering rect (in front of pool)
  FERRO.POOL = POOL;
  FERRO.FIELD = FIELD;
  FERRO.ENGR = ENGR;

  const GRID_X = 1920, GRID_Y = 1700; // projected grid resolution (vertices)
  const NL = 8; // env area lights

  let R = null;

  // ---------------------------------------------------------------------------------------------
  // GLSL
  // ---------------------------------------------------------------------------------------------
  const GLSL_COMMON = /* glsl */ `
  uniform sampler2D uField;   // R: field strength / 1.5
  uniform sampler2D uMound;   // R: blurred field / 1.5
  uniform sampler2D uWide;    // R: widely blurred field / 1.5 (fluid drawn in from around a shape)
  uniform vec2 uWideTexel;
  uniform vec2 uSwell;        // swell height (saturating in F), drawdown depth
  uniform vec4 uFieldRect;    // x0, z0, 1/w, 1/h
  uniform vec2 uMoundTexel;   // 1/w, 1/h of mound texture
  uniform float uA;           // lattice spacing
  uniform vec3 uLat;          // lattice frame: offset x, offset z, rotation
  uniform vec4 uSpike;        // max spike height, critical field, mound height, kernel radius factor
  uniform vec4 uPool;         // half x, half z, corner radius, edge width
  uniform vec2 uPool2;        // depth, centre z
  uniform float uTime;
  uniform float uBreath;      // per-site breathing amplitude
  uniform float uBreathW;     // breathing angular frequency
  uniform float uConeK;       // cone profile exponent (1 straight, 2 concave)
  uniform vec4 uRip[6];       // ripple sources: x, z, age (s), amp
  uniform vec4 uRipK;         // speed, wavenumber, decay, width
  uniform vec4 uWake;         // V wake behind a shape moving +x: tail x, z, amplitude, age

  float h21(vec2 c) { return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453); }
  float h22(vec2 c) { return fract(sin(dot(c, vec2(269.5, 183.3))) * 43758.5453); }

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  // inside distance s (>0 inside), pool-space
  float poolS(vec2 p) { return -sdRoundRect(p - vec2(0.0, uPool2.y), uPool.xy, uPool.z); }

  float fieldAt(vec2 w) {
    vec2 uv = (w - uFieldRect.xy) * uFieldRect.zw;
    return texture2D(uField, vec2(uv.x, 1.0 - uv.y)).r * 1.5;
  }
  // cubic B-spline sampling (4 bilinear taps): C2-smooth, so a mirror surface shows no texel facets
  float bicubic(sampler2D tex, vec2 uv, vec2 texel) {
    vec2 st = uv / texel - 0.5;
    vec2 i = floor(st);
    vec2 f = st - i;
    vec2 f2 = f * f, f3 = f2 * f;
    vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
    vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
    vec2 w3 = f3 / 6.0;
    vec2 g0 = w0 + w1, g1 = w2 + w3;
    vec2 h0 = (i - 1.0 + w1 / g0 + 0.5) * texel;
    vec2 h1 = (i + 1.0 + w3 / g1 + 0.5) * texel;
    float a = texture2D(tex, vec2(h0.x, h0.y)).r, b = texture2D(tex, vec2(h1.x, h0.y)).r;
    float c = texture2D(tex, vec2(h0.x, h1.y)).r, d = texture2D(tex, vec2(h1.x, h1.y)).r;
    return g0.y * (g0.x * a + g1.x * b) + g1.y * (g0.x * c + g1.x * d);
  }
  float moundLin(vec2 w) {
    vec2 uv = (w - uFieldRect.xy) * uFieldRect.zw;
    return texture2D(uMound, vec2(uv.x, 1.0 - uv.y)).r;
  }
  float moundAt(vec2 w) {
    vec2 uv = (w - uFieldRect.xy) * uFieldRect.zw;
    return bicubic(uMound, vec2(uv.x, 1.0 - uv.y), uMoundTexel) * 1.5;
  }
  float wideAt(vec2 w) {
    vec2 uv = (w - uFieldRect.xy) * uFieldRect.zw;
    return bicubic(uWide, vec2(uv.x, 1.0 - uv.y), uWideTexel) * 1.5;
  }

  // ripples: outgoing wave packets
  float ripple(vec2 p) {
    float h = 0.0;
    for (int i = 0; i < 6; i++) {
      vec4 r = uRip[i];
      if (r.w == 0.0 || r.z <= 0.0) continue;
      float d = length(p - r.xy);
      float front = uRipK.x * r.z;
      float x = d - front;
      float env = exp(-x * x / (uRipK.w * uRipK.w)) * exp(-r.z * uRipK.z) / (1.0 + 0.35 * d);
      h += r.w * env * sin(x * uRipK.y);
    }
    return h;
  }

  // Kelvin-like V wake: two wave packets on arms diverging from the tail
  float wake(vec2 p) {
    if (uWake.z == 0.0) return 0.0;
    vec2 d = p - uWake.xy;
    float s = -d.x;
    if (s <= 0.0) return 0.0;
    float n = abs(d.y);
    float x = n - s * 0.36;
    float env = exp(-x * x / 0.06) * exp(-s / 3.2) * smoothstep(0.0, 0.5, s) * smoothstep(0.0, 0.4, uWake.w);
    return uWake.z * env * sin(x * 13.0 - s * 2.5);
  }
  // spike lattice: height and analytic gradient (world xz)
  vec3 spikes(vec2 p) {
    if (moundLin(p) < 0.0015) return vec3(0.0);
    float a = uA;
    float c = cos(uLat.z), s = sin(uLat.z);
    vec2 d = p - uLat.xy;
    vec2 lp = vec2(c * d.x + s * d.y, -s * d.x + c * d.y); // into lattice frame
    // axial coords for a triangular lattice with spacing a
    float rr = lp.y / (a * 0.8660254);
    float qq = lp.x / a - rr * 0.5;
    // cube rounding
    float x = qq, z = rr, y = -x - z;
    float rx = floor(x + 0.5), ry = floor(y + 0.5), rz = floor(z + 0.5);
    float dx = abs(rx - x), dy = abs(ry - y), dz = abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    vec2 n = vec2(rx, rz);
    float H = 0.0; vec2 G = vec2(0.0);
    float Rk = a * uSpike.w;
    for (int k = 0; k < 7; k++) {
      vec2 o = k == 0 ? vec2(0.0) : k == 1 ? vec2(1.0, 0.0) : k == 2 ? vec2(-1.0, 0.0) : k == 3 ? vec2(0.0, 1.0)
             : k == 4 ? vec2(0.0, -1.0) : k == 5 ? vec2(1.0, -1.0) : vec2(-1.0, 1.0);
      vec2 cell = n + o;
      float j1 = h21(cell), j2 = h22(cell);
      vec2 sl = vec2(a * (cell.x + cell.y * 0.5), a * 0.8660254 * cell.y) + (vec2(j1, j2) - 0.5) * a * 0.07;
      vec2 sw = vec2(c * sl.x - s * sl.y, s * sl.x + c * sl.y) + uLat.xy; // site in world
      vec2 dv = p - sw;
      float r = length(dv);
      if (r >= Rk) continue;
      float F = fieldAt(sw);
      float on = smoothstep(uSpike.y, uSpike.y + 0.32, F);
      if (on <= 0.0) continue;
      float sharp = smoothstep(uSpike.y + 0.05, uSpike.y + 0.75, F);
      float breath = 1.0 + uBreath * sin(uTime * uBreathW + j1 * 6.2831);
      float A = uSpike.x * on * (0.55 + 0.45 * min(F, 1.5)) * (0.9 + 0.2 * j2) * breath;
      float u = r / Rk;
      float bump = (1.0 - u * u); bump *= bump;          // rounded
      float cone = pow(1.0 - u, uConeK);                 // cusp tip, concave flank
      float f = mix(bump, cone, sharp);
      float df = mix(-4.0 * u * (1.0 - u * u), -uConeK * pow(max(1.0 - u, 1e-4), uConeK - 1.0), sharp);
      H += A * f;
      if (r > 1e-6) G += A * df * dv / (r * Rk);
    }
    return vec3(H, G);
  }

  // full surface: returns height and gradient. cheap parts by central differences
  // rounded puddle edge with a finite contact angle (a vertical tangent aliased into a dotted rim)
  float edgeProfile(float s) {
    float e = clamp(s / uPool.w, 0.0, 1.0);
    float k = 1.0 - e;
    return 1.0 - k * k * k;
  }
  float softPart(vec2 p) {
    // pool depth * meniscus + mound + ripples, with interior gating; continuous (0) across the rim
    float s = poolS(p);
    if (s <= 0.0) return 0.0;
    float ep = edgeProfile(s);
    float inner = smoothstep(0.0, uPool.w * 2.5, s);
    float mb = moundAt(p);
    // the liquid heaps where the field is: a swell that saturates below the critical field (spikes ride on it)
    float heap = uSwell.x * (1.0 - exp(-mb * 5.0)) * exp(-max(mb - 0.3, 0.0) * 4.0) + uSpike.z * mb;
    float draw = -uSwell.y * wideAt(p);
    return ep * uPool2.x + inner * (heap + draw + ripple(p) + wake(p));
  }
  float heightAt(vec2 p) {
    float s = poolS(p);
    if (s < 0.0) return -0.03;
    float h = softPart(p);
    float inner = smoothstep(uPool.w * 0.8, uPool.w * 3.0, s);
    if (inner > 0.0) h += inner * spikes(p).x;
    return h;
  }
  // cheap height for marching secondary rays: no drawdown, no ripples, bilinear heap (all tiny terms)
  float heightFast(vec2 p) {
    float s = poolS(p);
    if (s < 0.0) return -0.03;
    float ep = edgeProfile(s);
    float inner = smoothstep(0.0, uPool.w * 2.5, s);
    float mb = moundLin(p) * 1.5;
    float h = ep * uPool2.x + inner * (uSwell.x * (1.0 - exp(-mb * 5.0)) * exp(-max(mb - 0.3, 0.0) * 4.0) + uSpike.z * mb);
    float inner2 = smoothstep(uPool.w * 0.8, uPool.w * 3.0, s);
    if (inner2 > 0.0) h += inner2 * spikes(p).x;
    return h;
  }
  vec3 surface(vec2 p) {
    float s = poolS(p);
    if (s < -0.02) return vec3(-0.03, 0.0, 0.0);
    float e = 0.01;
    float h0 = softPart(p);
    float hx = softPart(p + vec2(e, 0.0)) - h0;
    float hz = softPart(p + vec2(0.0, e)) - h0;
    vec2 G = vec2(hx, hz) / e;
    float inner = smoothstep(uPool.w * 0.8, uPool.w * 3.0, s);
    if (inner > 0.0) {
      vec3 sp = spikes(p);
      h0 += inner * sp.x;
      G += inner * sp.yz; // gating gradient ignored (smooth, tiny where spikes exist)
    }
    return vec3(h0, G);
  }
  `;

  const FLUID_VS = /* glsl */ `
  ${GLSL_COMMON}
  uniform mat4 uInvVP;
  uniform float uPlaneY;
  varying vec2 vXZ;
  varying vec3 vWorld;
  void main() {
    vec2 g = position.xy;
    vec4 n0 = uInvVP * vec4(g * 2.0 - 1.0, -1.0, 1.0); n0 /= n0.w;
    vec4 f0 = uInvVP * vec4(g * 2.0 - 1.0, 1.0, 1.0); f0 /= f0.w;
    vec3 dir = f0.xyz - n0.xyz;
    float t = dir.y < -1e-6 ? (uPlaneY - n0.y) / dir.y : 1.0;
    t = clamp(t, 0.0, 1.0);
    vec3 P = n0.xyz + dir * t;
    vec2 xz = P.xz;
    float h = -0.03;
    float s = poolS(xz);
    if (s > 0.0) {
      float sp = 0.0;
      float inner = smoothstep(uPool.w * 0.8, uPool.w * 3.0, s);
      if (inner > 0.0) sp = inner * spikes(xz).x;
      h = softPart(xz) + sp;
    }
    vXZ = xz;
    vec3 W = vec3(xz.x, h, xz.y);
    vWorld = W;
    gl_Position = projectionMatrix * viewMatrix * vec4(W, 1.0);
  }
  `;

  const ENV_GLSL = /* glsl */ `
  uniform vec3 uLc[${NL}];   // light centre dir
  uniform vec3 uLu[${NL}];   // tangent u
  uniform vec3 uLv[${NL}];   // tangent v
  uniform vec4 uLs[${NL}];   // half u, half v, soft, falloff (0 hard box, >0 radial gaussian-ish)
  uniform vec3 uLk[${NL}];   // colour * power
  uniform vec3 uAmbTop;
  uniform vec3 uAmbBot;
  vec3 env(vec3 r, float blur) {
    vec3 col = mix(uAmbBot, uAmbTop, smoothstep(-0.3, 0.8, r.y));
    for (int i = 0; i < ${NL}; i++) {
      vec3 k = uLk[i];
      if (k.x + k.y + k.z <= 0.0) continue;
      float d = dot(r, uLc[i]);
      if (d <= 0.02) continue;
      vec2 q = vec2(dot(r, uLu[i]), dot(r, uLv[i])) / d;
      vec4 s = uLs[i];
      float sf = s.z + blur;
      float m = smoothstep(s.x + sf, s.x - sf, abs(q.x)) * smoothstep(s.y + sf, s.y - sf, abs(q.y));
      if (s.w > 0.0) m *= exp(-dot(q / s.xy, q / s.xy) * s.w);
      col += k * m;
    }
    return col;
  }
  `;

  const FLUID_FS = /* glsl */ `
  ${GLSL_COMMON}
  ${ENV_GLSL}
  varying vec2 vXZ;
  varying vec3 vWorld;
  uniform vec3 uFluidBase;
  uniform float uMaxH;
  uniform float uTraceLen;
  uniform float uRefine;
  uniform mat4 uVP;
  // shade a surface point seen along direction rd (single bounce to the environment)
  vec3 shadeHit(vec3 P, vec3 rd) {
    vec3 hg = surface(P.xz);
    vec3 N = normalize(vec3(-hg.y, 1.0, -hg.z));
    float nv = max(dot(N, -rd), 0.0);
    vec3 R2 = reflect(rd, N);
    float fr = 0.045 + 0.955 * pow(1.0 - nv, 5.0);
    return fr * env(R2, 0.01) + uFluidBase * (0.3 + 0.7 * N.y);
  }
  vec3 traceEnv(vec3 P, vec3 rd) {
    if (uTraceLen <= 0.0) return env(rd, 0.004);
    // the fast height omits tiny terms (drawdown, ripples): shift it so the ray starts above it
    float bias = min(0.0, P.y - heightFast(P.xz)) - 0.004;
    float t = 0.004;
    vec3 q = P;
    float prevT = t;
    for (int i = 0; i < 24; i++) {
      q = P + rd * t;
      if (q.y > uMaxH && rd.y >= 0.0) break;
      if (t > uTraceLen) break;
      float h = heightFast(q.xz) + bias;
      float gap = q.y - h;
      if (gap < 0.0) {
        float a = prevT, b = t;
        for (int j = 0; j < 5; j++) {
          float m = 0.5 * (a + b);
          vec3 qm = P + rd * m;
          if (qm.y - heightFast(qm.xz) - bias < 0.0) b = m; else a = m;
        }
        vec3 hit = P + rd * b;
        return shadeHit(hit, rd);
      }
      prevT = t;
      t += clamp(gap * 0.5, 0.005, 0.09);
    }
    return env(rd, 0.004);
  }
  void main() {
    float s = poolS(vXZ);
    if (s < -0.02) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); gl_FragDepth = gl_FragCoord.z; return; }
    // mesh-guided refinement: march the analytic surface along the view ray around the raster point,
    // so silhouettes and depth are exact even where the projected grid is coarse (grazing views)
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vWorld - cameraPosition);
    float tm = length(vWorld - cameraPosition);
    vec3 Wp = vWorld;
    if (uRefine > 0.0) {
    float t = tm - uRefine;
    for (int k = 0; k < 6; k++) {
      vec3 q0 = ro + rd * t;
      if (q0.y - heightAt(q0.xz) > 0.0) break;
      t -= uRefine;
    }
    float tPrev = t;
    bool hit = false;
    for (int i = 0; i < 40; i++) {
      vec3 q = ro + rd * t;
      float gap = q.y - heightAt(q.xz);
      if (gap < 0.0) { hit = true; break; }
      tPrev = t;
      t += clamp(gap * 0.35, 0.002, 0.04);
      if (t > tm + 4.0 * uRefine) break;
    }
    if (hit) {
      float a0 = tPrev, b0 = t;
      for (int j = 0; j < 7; j++) {
        float m = 0.5 * (a0 + b0);
        vec3 qm = ro + rd * m;
        if (qm.y - heightAt(qm.xz) < 0.0) b0 = m; else a0 = m;
      }
      Wp = ro + rd * b0;
    }
    }
    vec4 clip = uVP * vec4(Wp, 1.0);
    gl_FragDepth = uRefine > 0.0 ? clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0) : gl_FragCoord.z;
    vec2 xz = Wp.xz;
    vec3 hg = surface(xz);
    vec3 N = normalize(vec3(-hg.y, 1.0, -hg.z));
    vec3 V = normalize(cameraPosition - Wp);
    if (dot(N, V) < 0.02) N = normalize(N + V * (-dot(N, V) + 0.02));
    float nv = max(dot(N, V), 0.0);
    vec3 Rf = reflect(-V, N);
    float fr = 0.045 + 0.955 * pow(1.0 - nv, 5.0);
    vec3 P = Wp + N * 0.002;
    vec3 c = fr * traceEnv(P, Rf) + uFluidBase * (0.3 + 0.7 * N.y);
    gl_FragColor = vec4(c, 1.0);
  }
  `;

  const PLATE_VS = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
  `;

  const PLATE_FS = /* glsl */ `
  ${ENV_GLSL}
  varying vec3 vWorld;
  uniform sampler2D uEngr;      // R: etched mask (blurred edges)
  uniform vec4 uEngrRect;       // x0, z0, 1/w, 1/h
  uniform vec2 uEngrTexel;
  uniform vec4 uEtch;           // reveal front x, reveal soft, etched brightness, sweep glint
  uniform vec3 uEtchCol;
  uniform vec2 uPlateC;         // brushing centre
  uniform float uPlateFade;
  uniform float uPlateRefl;
  uniform float uEtchBump;
  float hp(vec2 c) { return fract(sin(dot(c, vec2(41.3, 289.1))) * 17351.237); }
  void main() {
    vec3 P = vWorld;
    vec3 V = normalize(cameraPosition - P);
    vec2 rel = P.xz - uPlateC;
    float rad = length(rel);
    vec2 radial = rad > 1e-4 ? rel / rad : vec2(1.0, 0.0);
    vec3 N = vec3(0.0, 1.0, 0.0);
    // etched lettering
    vec2 euv = (P.xz - uEngrRect.xy) * uEngrRect.zw;
    // sampled in uniform control flow (mipmapped: implicit derivatives must not sit inside a branch)
    vec2 tuv = clamp(vec2(euv.x, 1.0 - euv.y), 0.0, 1.0);
    float inR = step(0.0, euv.x) * step(euv.x, 1.0) * step(0.0, euv.y) * step(euv.y, 1.0);
    float etch = texture2D(uEngr, tuv).r * inR;
    float ex = (texture2D(uEngr, tuv + vec2(uEngrTexel.x, 0.0)).r - texture2D(uEngr, tuv - vec2(uEngrTexel.x, 0.0)).r) * inR;
    float ez = (texture2D(uEngr, tuv - vec2(0.0, uEngrTexel.y)).r - texture2D(uEngr, tuv + vec2(0.0, uEngrTexel.y)).r) * inR;
    vec2 eg = vec2(ex, ez);
    N = normalize(vec3(eg.x * 0.3 * uEtchBump, 1.0, eg.y * 0.3 * uEtchBump));
    // spun steel: microfacets spread along the radial direction -> highlights stretch radially
    vec3 tr = vec3(radial.x, 0.0, radial.y);
    vec3 acc = vec3(0.0);
    float ws = 0.0;
    for (int k = -3; k <= 3; k++) {
      float o = float(k) * 0.035;
      float w = exp(-float(k * k) * 0.22);
      vec3 Nk = normalize(N + tr * o);
      acc += w * env(reflect(-V, Nk), 0.01);
      ws += w;
    }
    acc /= ws;
    float nv = max(dot(N, V), 0.0);
    vec3 F0 = vec3(0.56, 0.57, 0.6) * uPlateRefl;
    vec3 fr = F0 + (1.0 - F0) * pow(1.0 - nv, 5.0);
    // fine concentric lathe rings (band-limited by screen footprint)
    float fw = max(fwidth(rad), 1e-4);
    float ring = sin(rad * 260.0) * clamp(1.0 - fw * 70.0, 0.0, 1.0);
    float grain = 0.93 + 0.05 * ring;
    vec3 col = acc * fr * grain;
    // etched grooves: frosted and recessed. The frost scatters the light the sweep brings (revealed left
    // to right); the groove walls shade like a cut: the far wall catches light, the near wall is in shadow
    float lit = 1.0 - smoothstep(uEtch.x - uEtch.y, uEtch.x + uEtch.y, P.x);
    float groove = smoothstep(0.4, 0.75, etch);
    float wall = clamp(-eg.y * 2.2, -1.0, 1.0);            // +: far wall (faces the camera and the key)
    vec3 frostC = uEtchCol * (uEtch.z * lit * (0.82 + 0.35 * wall) + uEtch.w * exp(-pow((P.x - uEtch.x) / 1.2, 2.0)));
    col = mix(col, col * mix(1.0, 0.35, lit) + frostC, groove);
    col *= 1.0 - 0.55 * lit * clamp(eg.y * 3.0, 0.0, 1.0) * (1.0 - groove); // shadow cast inside the near lip
    // distance falloff into the dark studio
    float fall = exp(-max(length((P.xz - uPlateC) * vec2(0.8, 1.15)) - 9.6, 0.0) * uPlateFade);
    col *= fall;
    gl_FragColor = vec4(col, 1.0);
  }
  `;

  const SKY_FS = /* glsl */ `
  ${ENV_GLSL}
  varying vec3 vWorld;
  uniform float uSkyK;
  void main() {
    vec3 d = normalize(vWorld - cameraPosition);
    gl_FragColor = vec4(env(d, 0.05) * uSkyK, 1.0);
  }
  `;

  // post: DOF (gather, depth-driven) at full res
  const QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
  `;
  const DOF_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform vec2 uRes;
  uniform float uNear, uFar;
  uniform float uFocus;     // focus distance (view-space)
  uniform float uAper;      // max CoC px at infinity-ish scale
  uniform float uMaxCoc;
  varying vec2 vUv;
  float viewZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    float z = d * 2.0 - 1.0;
    return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
  }
  float coc(float z) { return clamp(uAper * abs(z - uFocus) / z, 0.0, uMaxCoc); }
  void main() {
    vec3 c0 = texture2D(tColor, vUv).rgb;
    float z0 = viewZ(vUv);
    float r0 = coc(z0);
    if (uAper <= 0.0 || r0 < 0.6) { gl_FragColor = vec4(c0, 1.0); return; }
    vec3 acc = c0; float wsum = 1.0;
    const int NS = 24;
    for (int i = 0; i < NS; i++) {
      float fi = float(i) + 0.5;
      float ang = fi * 2.39996323;
      float rad = sqrt(fi / float(NS)) * r0;
      vec2 off = vec2(cos(ang), sin(ang)) * rad / uRes;
      vec2 uv = vUv + off;
      vec3 c = texture2D(tColor, uv).rgb;
      float rz = coc(viewZ(uv));
      float w = smoothstep(rad - 1.0, rad + 1.0, max(rz, r0 * 0.5));
      acc += c * w; wsum += w;
    }
    gl_FragColor = vec4(acc / wsum, 1.0);
  }
  `;
  const FINAL_FS = /* glsl */ `
  uniform sampler2D tColor;
  uniform float uExposure;
  uniform float uVig;
  uniform float uGrainSeed;
  uniform float uGrain;
  uniform vec3 uLift;
  uniform vec2 uRes;
  varying vec2 vUv;
  vec3 aces(vec3 x) {
    const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
  }
  vec3 toSRGB(vec3 c) {
    return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
  }
  float hq(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uGrainSeed) * 43758.5453); }
  void main() {
    vec3 c = texture2D(tColor, vUv).rgb * uExposure;
    vec2 q = vUv - 0.5; q.x *= uRes.x / uRes.y;
    float v = 1.0 - uVig * smoothstep(0.35, 1.05, length(q));
    c *= v;
    c = aces(c) + uLift;
    c = toSRGB(clamp(c, 0.0, 1.0));
    c += (hq(floor(vUv * uRes)) - 0.5) * uGrain;
    gl_FragColor = vec4(c, 1.0);
  }
  `;

  // ---------------------------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------------------------
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function init(W, H) {
    const T3 = THREE;
    const canvas = makeCanvas(W, H);
    const renderer = new T3.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.autoClear = true;
    renderer.toneMapping = T3.NoToneMapping;
    renderer.outputColorSpace = T3.LinearSRGBColorSpace;

    const scene = new T3.Scene();
    const cam = new T3.PerspectiveCamera(30, W / H, 0.5, 400);

    // field canvases
    const fcv = makeCanvas(Math.round(FIELD.w * FIELD.px), Math.round(FIELD.h * FIELD.px));
    // CPU raster pinned (willReadFrequently): Chrome may otherwise move a canvas between GPU and CPU
    // raster mid-session, and the two round blending/blur differently (a determinism failure)
    const fg = fcv.getContext('2d', { willReadFrequently: true });
    const mcv = makeCanvas(Math.round(fcv.width / 2), Math.round(fcv.height / 2));
    const mg = mcv.getContext('2d', { willReadFrequently: true });
    const fieldTex = new T3.CanvasTexture(fcv);
    fieldTex.minFilter = T3.LinearFilter; fieldTex.magFilter = T3.LinearFilter; fieldTex.generateMipmaps = false;
    fieldTex.colorSpace = T3.NoColorSpace; fieldTex.flipY = true;
    const wcv = makeCanvas(Math.round(fcv.width / 8), Math.round(fcv.height / 8));
    const wg = wcv.getContext('2d', { willReadFrequently: true });
    const wideTex = new T3.CanvasTexture(wcv);
    wideTex.minFilter = T3.LinearFilter; wideTex.magFilter = T3.LinearFilter; wideTex.generateMipmaps = false;
    wideTex.colorSpace = T3.NoColorSpace; wideTex.flipY = true;
    const moundTex = new T3.CanvasTexture(mcv);
    moundTex.minFilter = T3.LinearFilter; moundTex.magFilter = T3.LinearFilter; moundTex.generateMipmaps = false;
    moundTex.colorSpace = T3.NoColorSpace; moundTex.flipY = true;

    // engraving canvas (static content, drawn once by the program's engrave() hook)
    const ecv = makeCanvas(Math.round(ENGR.w * ENGR.px), Math.round(ENGR.h * ENGR.px));
    const eg = ecv.getContext('2d', { willReadFrequently: true });
    const engrTex = new T3.CanvasTexture(ecv);
    engrTex.minFilter = T3.LinearMipmapLinearFilter; engrTex.magFilter = T3.LinearFilter; engrTex.generateMipmaps = true;
    engrTex.colorSpace = T3.NoColorSpace; engrTex.flipY = true; engrTex.anisotropy = 4;

    const envUniforms = {
      uLc: { value: Array.from({ length: NL }, () => new T3.Vector3(0, 1, 0)) },
      uLu: { value: Array.from({ length: NL }, () => new T3.Vector3(1, 0, 0)) },
      uLv: { value: Array.from({ length: NL }, () => new T3.Vector3(0, 0, 1)) },
      uLs: { value: Array.from({ length: NL }, () => new T3.Vector4(0.1, 0.1, 0.02, 0)) },
      uLk: { value: Array.from({ length: NL }, () => new T3.Vector3(0, 0, 0)) },
      uAmbTop: { value: new T3.Vector3(0.004, 0.002, 0.006) },
      uAmbBot: { value: new T3.Vector3(0.001, 0.0, 0.002) },
    };
    const fluidUniforms = Object.assign({}, envUniforms, {
      uField: { value: fieldTex },
      uMound: { value: moundTex },
      uFieldRect: { value: new T3.Vector4(FIELD.x0, FIELD.z0, 1 / FIELD.w, 1 / FIELD.h) },
      uMoundTexel: { value: new T3.Vector2(1 / mcv.width, 1 / mcv.height) },
      uWide: { value: wideTex },
      uWideTexel: { value: new T3.Vector2(1 / wcv.width, 1 / wcv.height) },
      uSwell: { value: new T3.Vector2(0.07, 0.02) },
      uA: { value: 0.16 },
      uLat: { value: new T3.Vector3(0, 0, 0) },
      uSpike: { value: new T3.Vector4(0.14, 0.32, 0.12, 0.8) },
      uPool: { value: new T3.Vector4(POOL.hx, POOL.hz, POOL.r, POOL.edge) },
      uPool2: { value: new T3.Vector2(POOL.depth, POOL.cz) },
      uTime: { value: 0 },
      uBreath: { value: 0.03 },
      uBreathW: { value: 2 * Math.PI / 0.8 },
      uConeK: { value: 1.5 },
      uRip: { value: [new T3.Vector4(), new T3.Vector4(), new T3.Vector4(), new T3.Vector4(), new T3.Vector4(), new T3.Vector4()] },
      uRipK: { value: new T3.Vector4(3.2, 9.0, 1.4, 0.7) },
      uWake: { value: new T3.Vector4(0, 0, 0, 0) },
      uInvVP: { value: new T3.Matrix4() },
      uPlaneY: { value: POOL.depth },
      uFluidBase: { value: new T3.Vector3(0.0035, 0.0028, 0.0032) },
      uMaxH: { value: 0.6 },
      uTraceLen: { value: 1.6 },
      uRefine: { value: 0.12 },
      uVP: { value: new T3.Matrix4() },
    });
    const fluidMat = new T3.ShaderMaterial({ vertexShader: FLUID_VS, fragmentShader: FLUID_FS, uniforms: fluidUniforms });
    fluidMat.extensions = { derivatives: true };

    // projected grid geometry: xy in [-m, 1+m]
    const mX = 0.02, mY = 0.12;
    const gx = GRID_X, gy = GRID_Y;
    const pos = new Float32Array((gx + 1) * (gy + 1) * 3);
    let k = 0;
    for (let j = 0; j <= gy; j++) {
      const v = -mY + (1 + 2 * mY) * (j / gy);
      for (let i = 0; i <= gx; i++) {
        pos[k++] = -mX + (1 + 2 * mX) * (i / gx);
        pos[k++] = v;
        pos[k++] = 0;
      }
    }
    const idx = new Uint32Array(gx * gy * 6);
    k = 0;
    for (let j = 0; j < gy; j++) {
      for (let i = 0; i < gx; i++) {
        const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 1, d = c + 1;
        idx[k++] = a; idx[k++] = b; idx[k++] = d;
        idx[k++] = a; idx[k++] = d; idx[k++] = c;
      }
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.BufferAttribute(pos, 3));
    geo.setIndex(new T3.BufferAttribute(idx, 1));
    const fluid = new T3.Mesh(geo, fluidMat);
    fluid.frustumCulled = false;
    fluid.renderOrder = 0;
    scene.add(fluid);

    const plateUniforms = Object.assign({}, envUniforms, {
      uEngr: { value: engrTex },
      uEngrRect: { value: new T3.Vector4(ENGR.x0, ENGR.z0, 1 / ENGR.w, 1 / ENGR.h) },
      uEngrTexel: { value: new T3.Vector2(1.2 / ecv.width, 1.2 / ecv.height) },
      uEtch: { value: new T3.Vector4(99, 1, 0.3, 0) },
      uEtchCol: { value: new T3.Vector3(0.9, 0.92, 1.0) },
      uPlateC: { value: new T3.Vector2(0, POOL.cz) },
      uPlateFade: { value: 0.12 },
      uPlateRefl: { value: 1.0 },
      uEtchBump: { value: 0.0 },
    });
    const plateMat = new T3.ShaderMaterial({ vertexShader: PLATE_VS, fragmentShader: PLATE_FS, uniforms: plateUniforms });
    plateMat.extensions = { derivatives: true };
    // the plate sits a hair behind in depth: at the meniscus, where the liquid meets the steel at the
    // same height, the liquid always wins the depth test (a tie there resolved differently per render)
    plateMat.polygonOffset = true;
    plateMat.polygonOffsetFactor = 1;
    plateMat.polygonOffsetUnits = 8;
    const plate = new T3.Mesh(new T3.PlaneGeometry(240, 240), plateMat);
    plate.rotation.x = -Math.PI / 2;
    plate.renderOrder = 1;
    plate.frustumCulled = false;
    scene.add(plate);

    const skyMat = new T3.ShaderMaterial({ vertexShader: PLATE_VS, fragmentShader: SKY_FS, uniforms: Object.assign({}, envUniforms, { uSkyK: { value: 0.25 } }), side: T3.BackSide, depthWrite: false });
    const sky = new T3.Mesh(new T3.SphereGeometry(300, 48, 24), skyMat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    scene.add(sky);

    // render targets
    const SS = 2;
    const rtScene = new T3.WebGLRenderTarget(W * SS, H * SS, { type: T3.HalfFloatType, samples: 0, depthBuffer: true });
    rtScene.depthTexture = new T3.DepthTexture(W * SS, H * SS);
    rtScene.depthTexture.type = T3.UnsignedIntType;
    const rtA = new T3.WebGLRenderTarget(W, H, { type: T3.HalfFloatType, depthBuffer: false });

    const quadGeo = new T3.PlaneGeometry(2, 2);
    const quadScene = new T3.Scene();
    const quadCam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new T3.Mesh(quadGeo, null);
    quad.frustumCulled = false;
    quadScene.add(quad);
    const dofMat = new T3.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: DOF_FS, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rtScene.texture }, tDepth: { value: rtScene.depthTexture }, uRes: { value: new T3.Vector2(W, H) }, uNear: { value: 0.5 }, uFar: { value: 400 }, uFocus: { value: 20 }, uAper: { value: 0 }, uMaxCoc: { value: 18 } },
    });
    const finalMat = new T3.ShaderMaterial({
      vertexShader: QUAD_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rtA.texture }, uExposure: { value: 1 }, uVig: { value: 0.35 }, uGrainSeed: { value: 0 }, uGrain: { value: 0.012 }, uLift: { value: new T3.Vector3(0.004, 0.0, 0.008) }, uRes: { value: new T3.Vector2(W, H) } },
    });
    const bloom = new T3.UnrealBloomPass(new T3.Vector2(W, H), 0.6, 0.5, 0.9);

    R = { canvas, renderer, scene, cam, fcv, fg, mcv, mg, wcv, wg, wideTex, fieldTex, moundTex, ecv, eg, engrTex, engrKey: null, fluid, fluidMat, plate, plateMat, sky, skyMat, envUniforms, rtScene, rtA, quad, quadScene, quadCam, dofMat, finalMat, bloom, W, H };
  }

  // ---------------------------------------------------------------------------------------------
  // Lights: { az, el (deg), w, h (gnomonic half extents), soft, fall, roll (deg), color [r,g,b], power }
  // az 0 = far side (-z), +90 = right (+x), -90 = left, 180 = behind the camera.
  // ---------------------------------------------------------------------------------------------
  function setLights(lights, amb) {
    const U = R.envUniforms;
    for (let i = 0; i < NL; i++) {
      const L = lights && lights[i];
      if (!L || !(L.power > 0)) { U.uLk.value[i].set(0, 0, 0); continue; }
      const az = (L.az * Math.PI) / 180, el = (L.el * Math.PI) / 180;
      const c = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      let u = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
      let v = new THREE.Vector3().crossVectors(u, c).normalize();
      const rl = ((L.roll || 0) * Math.PI) / 180;
      if (rl) {
        const u2 = u.clone().multiplyScalar(Math.cos(rl)).addScaledVector(v, Math.sin(rl));
        const v2 = v.clone().multiplyScalar(Math.cos(rl)).addScaledVector(u, -Math.sin(rl));
        u = u2; v = v2;
      }
      U.uLc.value[i].copy(c);
      U.uLu.value[i].copy(u);
      U.uLv.value[i].copy(v);
      U.uLs.value[i].set(L.w, L.h, L.soft != null ? L.soft : 0.02, L.fall || 0);
      const col = L.color || [1, 1, 1];
      U.uLk.value[i].set(col[0] * L.power, col[1] * L.power, col[2] * L.power);
    }
    if (amb) {
      U.uAmbTop.value.set(amb.top[0], amb.top[1], amb.top[2]);
      U.uAmbBot.value.set(amb.bot[0], amb.bot[1], amb.bot[2]);
    }
  }

  // world-unit drawing on the field canvas: x right, z down (toward the camera)
  function fieldCtx() {
    const g = R.fg;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.filter = 'none';
    g.fillStyle = FILM.lib.pal.ffNull;
    g.fillRect(0, 0, R.fcv.width, R.fcv.height);
    g.setTransform(FIELD.px, 0, 0, FIELD.px, -FIELD.x0 * FIELD.px, -FIELD.z0 * FIELD.px);
    return g;
  }

  FERRO.fieldPx = () => FIELD.px;

  // ---------------------------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------------------------
  FERRO.render = function render(ctx, st) {
    const W = FILM.W || 1920, H = FILM.H || 1080;
    if (!R) init(W, H);
    const DBG = FILM.ferroDebug || {};
    const U = R.fluidMat.uniforms;
    const PU = R.plateMat.uniforms;

    // 1. field (pure function of st)
    const g = fieldCtx();
    g.save();
    if (st.field) st.field(g, FIELD);
    g.restore();
    g.setTransform(1, 0, 0, 1, 0, 0);
    // mound: blurred, downsampled copy
    const mg = R.mg;
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.filter = 'none';
    mg.globalAlpha = 1;
    mg.fillStyle = FILM.lib.pal.ffNull;
    mg.fillRect(0, 0, R.mcv.width, R.mcv.height);
    mg.filter = `blur(${(st.moundBlur != null ? st.moundBlur : 0.35) * FIELD.px / 2}px)`;
    mg.drawImage(R.fcv, 0, 0, R.mcv.width, R.mcv.height);
    mg.filter = 'none';
    // wide: the fluid drawn in from around a shape (a shallow trough)
    const wg = R.wg;
    wg.setTransform(1, 0, 0, 1, 0, 0);
    wg.filter = 'none';
    wg.globalAlpha = 1;
    wg.fillStyle = FILM.lib.pal.ffNull;
    wg.fillRect(0, 0, R.wcv.width, R.wcv.height);
    wg.filter = `blur(${(1.1 * FIELD.px) / 8}px)`;
    wg.drawImage(R.mcv, 0, 0, R.wcv.width, R.wcv.height);
    wg.filter = 'none';
    R.fieldTex.needsUpdate = true;
    R.moundTex.needsUpdate = true;
    R.wideTex.needsUpdate = true;

    // engraving (static per key)
    if (st.engrave && st.engraveKey !== R.engrKey) {
      const e = R.eg;
      e.setTransform(1, 0, 0, 1, 0, 0);
      e.fillStyle = FILM.lib.pal.ffNull;
      e.fillRect(0, 0, R.ecv.width, R.ecv.height);
      e.setTransform(ENGR.px, 0, 0, ENGR.px, -ENGR.x0 * ENGR.px, -ENGR.z0 * ENGR.px);
      st.engrave(e, ENGR);
      e.setTransform(1, 0, 0, 1, 0, 0);
      R.engrTex.needsUpdate = true;
      R.engrKey = st.engraveKey;
    }

    // 2. uniforms
    const sp = st.spike || {};
    U.uA.value = sp.a != null ? sp.a : 0.16;
    U.uSpike.value.set(sp.h != null ? sp.h : 0.14, sp.fc != null ? sp.fc : 0.32, sp.mound != null ? sp.mound : 0.12, sp.kr != null ? sp.kr : 0.8);
    U.uBreath.value = sp.breath != null ? sp.breath : 0.03;
    U.uConeK.value = sp.coneK != null ? sp.coneK : 1.5;
    U.uSwell.value.set(sp.swell != null ? sp.swell : 0.07, sp.draw != null ? sp.draw : 0.02);
    U.uBreathW.value = sp.breathW != null ? sp.breathW : (2 * Math.PI) / 0.8;
    const lat = st.lattice || {};
    U.uLat.value.set(lat.x || 0, lat.z || 0, lat.rot || 0);
    U.uTime.value = st.T || 0;
    U.uMaxH.value = POOL.depth + U.uSpike.value.x * 1.6 + U.uSpike.value.z * 1.5 + U.uSwell.value.x + 0.06;
    U.uTraceLen.value = st.traceLen != null ? st.traceLen : 1.0;
    U.uRefine.value = st.refine != null ? st.refine : 0;
    if (DBG.noTrace) U.uTraceLen.value = 0;
    const rips = st.ripples || [];
    for (let i = 0; i < 6; i++) {
      const r = rips[i];
      if (r) U.uRip.value[i].set(r.x, r.z, r.age, r.amp);
      else U.uRip.value[i].set(0, 0, 0, 0);
    }
    if (st.ripK) U.uRipK.value.set(st.ripK[0], st.ripK[1], st.ripK[2], st.ripK[3]);
    const wk = st.wake;
    if (wk) U.uWake.value.set(wk.x, wk.z, wk.amp, wk.age); else U.uWake.value.set(0, 0, 0, 0);
    setLights(st.lights, st.amb);
    if (st.fluidBase) U.uFluidBase.value.set(st.fluidBase[0], st.fluidBase[1], st.fluidBase[2]);
    const et = st.etch || {};
    PU.uEtch.value.set(et.front != null ? et.front : -99, et.soft != null ? et.soft : 1.5, et.bright != null ? et.bright : 0, et.glint || 0);
    PU.uPlateFade.value = st.plateFade != null ? st.plateFade : 0.12;
    PU.uPlateRefl.value = st.plateRefl != null ? st.plateRefl : 1.0;
    PU.uEtchBump.value = et.bump != null ? et.bump : 1.0;
    R.skyMat.uniforms.uSkyK.value = st.skyK != null ? st.skyK : 0.25;

    // 3. camera
    const c = st.cam;
    R.cam.fov = c.fov || 30;
    R.cam.aspect = W / H;
    R.cam.near = 0.5;
    R.cam.far = 400;
    R.cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
    R.cam.up.set(0, 1, 0);
    R.cam.lookAt(c.look[0], c.look[1], c.look[2]);
    if (c.roll) R.cam.rotateZ(c.roll);
    R.cam.updateProjectionMatrix();
    R.cam.updateMatrixWorld(true);
    const vp = new THREE.Matrix4().multiplyMatrices(R.cam.projectionMatrix, R.cam.matrixWorldInverse);
    U.uInvVP.value.copy(vp).invert();
    U.uVP.value.copy(vp);

    // 4. scene -> rtScene
    const rd = R.renderer;
    rd.setRenderTarget(R.rtScene);
    rd.setClearColor(0x000000, 1);
    rd.clear(true, true, true);
    R.fluid.visible = !DBG.noFluid;
    R.plate.visible = !DBG.noPlate;
    R.sky.visible = !DBG.noSky;
    rd.render(R.scene, R.cam);
    if (DBG.stop === 'scene') { const px = new Uint16Array(4); rd.readRenderTargetPixels(R.rtScene, 0, 0, 1, 1, px); return; }

    // 5. DOF -> rtA
    const pp = st.post || {};
    const D = R.dofMat.uniforms;
    D.uFocus.value = c.focus != null ? c.focus : 20;
    D.uAper.value = c.aper || 0;
    D.uMaxCoc.value = c.maxCoc || 18;
    R.quad.material = R.dofMat;
    rd.setRenderTarget(R.rtA);
    rd.render(R.quadScene, R.quadCam);

    // 6. bloom (in place on rtA)
    if (DBG.stop === 'dof') { const px = new Uint16Array(4); rd.readRenderTargetPixels(R.rtA, 0, 0, 1, 1, px); return; }
    if (!DBG.noBloom && (pp.bloom != null ? pp.bloom : 0.5) > 0) {
      R.bloom.strength = pp.bloom != null ? pp.bloom : 0.5;
      R.bloom.radius = pp.bloomRadius != null ? pp.bloomRadius : 0.55;
      R.bloom.threshold = pp.bloomThreshold != null ? pp.bloomThreshold : 0.9;
      R.bloom.render(rd, null, R.rtA, 0, false);
    }

    // 7. final grade -> canvas
    const F = R.finalMat.uniforms;
    F.uExposure.value = pp.exposure != null ? pp.exposure : 1;
    F.uVig.value = pp.vig != null ? pp.vig : 0.35;
    F.uGrain.value = pp.grain != null ? pp.grain : 0.012;
    F.uGrainSeed.value = st.grainSeed != null ? st.grainSeed : Math.round((st.T || 0) * 30) % 97;
    R.quad.material = R.finalMat;
    rd.setRenderTarget(null);
    rd.render(R.quadScene, R.quadCam);

    if (DBG.sync) { const px = new Uint8Array(4); const gl = rd.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    ctx.save();
    FILM.baseTransform(ctx);
    ctx.drawImage(R.canvas, 0, 0, W, H);
    ctx.restore();
  };
})();
