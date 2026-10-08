/*
 * cast.js : THE MACHINE — the world of «Автоматон 1774» in three.js (global THREE from vendor.js).
 *
 * Everything that moves is posed from FILM.prog (props.js): the cam shaft angle, the stack level,
 * the three follower readings, and the arm IK solved from the DECODED readings. The ink on the
 * sheet is one precomputed ribbon mesh built from the same decoded readings; each vertex carries the
 * time it was laid and the shader shows what was laid up to T (wet and glossy, then dry). The frame
 * is a pure function of T: nothing accumulates between frames.
 *
 * Render path (tuned for SwiftShader): scene -> HDR target (no MSAA; ink edges are antialiased
 * analytically, the rest by FXAA) -> half-res depth-of-field gather -> bloom on the half-res copy ->
 * final grade (sharp/blurred mix by circle of confusion, FXAA, ACES, vignette, grain).
 *
 * FILM.cast.render(ctx, T, cam) draws one frame. cam = { pos, look, fov, focus (point | metres |
 * 'nib'), fstop, exposure, bloom, vignette, fade, roll, inner }.
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const P = FILM.prog;
  const T3 = window.THREE;
  const TAU = Math.PI * 2;
  const { clamp, lerp, sstep, v3 } = P;

  // ------------------------------------------------------------------ deterministic noise
  function h2(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return lerp(lerp(h2(xi, yi, s), h2(xi + 1, yi, s), u), lerp(h2(xi, yi + 1, s), h2(xi + 1, yi + 1, s), u), v);
  }
  function fbm(x, y, s, oct) {
    let a = 0, amp = 0.5, f = 1;
    for (let i = 0; i < (oct || 4); i++) { a += amp * vnoise(x * f, y * f, s + i * 17); f *= 2.03; amp *= 0.5; }
    return a;
  }
  const rng = (seed) => { let i = 0; return () => h2(seed, i++, 991); };
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  const V = (a) => new T3.Vector3(a[0], a[1], a[2]);

  // ------------------------------------------------------------------ procedural textures
  function paperCanvas() {
    const W = 2048, H = Math.round((2048 * P.PAGE.h) / P.PAGE.w);
    const c = canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const m = fbm(x / 260, y / 260, 3, 4);
        const fib = fbm(x / 9, y / 34, 7, 2);
        const laid = 0.5 + 0.5 * Math.sin((y / H) * P.PAGE.h * 1000 * TAU * 0.9);
        const chain = Math.exp(-Math.pow(((x / W) * P.PAGE.w * 1000) % 24 - 12, 2) / 1.2);
        const ex = Math.min(x, W - 1 - x) / W, ey = Math.min(y, H - 1 - y) / H;
        const edge = 1 - sstep(0, 0.05, Math.min(ex, ey * 1.2));
        let r = 232 - 9 * m - 5 * fib - 2.5 * laid - 3 * chain - 18 * edge;
        let gg = 222 - 11 * m - 6 * fib - 2.6 * laid - 3 * chain - 26 * edge;
        let b = 198 - 16 * m - 8 * fib - 2.7 * laid - 3 * chain - 38 * edge;
        const fx = fbm(x / 60 + 40, y / 60, 11, 3);
        if (fx > 0.7) { const k = (fx - 0.7) * 3; r -= 20 * k; gg -= 32 * k; b -= 44 * k; }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b;
        const dn = fbm(x / 14, y / 14, 23, 3);
        const ein = Math.min(x, W - 1 - x, y, H - 1 - y);
        d[i + 3] = ein > 9 + dn * 12 ? 255 : 0;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function woodCanvas(seed, base, W, H, stripes) {
    const c = canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const warp = fbm(x / 300, y / 60, seed, 4) * 7;
      const ring = 0.5 + 0.5 * Math.sin((x / W) * stripes + warp * 3.2 + fbm(x / 40, y / 400, seed + 3, 2) * 2);
      const fine = fbm(x / 2.5, y / 90, seed + 9, 2);
      const fig = fbm(x / 120, y / 18, seed + 5, 3);
      const k = 0.6 + 0.22 * ring + 0.18 * fine + 0.25 * (fig - 0.5);
      d[i] = base[0] * k; d[i + 1] = base[1] * k; d[i + 2] = base[2] * k; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function engraveCanvas(seed, density) {
    const W = 1024, H = 1024;
    const c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, W, H);
    const r = rng(seed);
    g.lineCap = 'round';
    for (let k = 0; k < (density || 70); k++) {
      const cx = r() * W, cy = r() * H, R = 24 + r() * 80, a0 = r() * TAU, turns = 1.2 + r() * 1.4, dir = r() < 0.5 ? 1 : -1;
      g.strokeStyle = 'rgba(30,30,30,0.95)'; g.lineWidth = 2.5 + r() * 2;
      g.beginPath();
      for (let s = 0; s <= 90; s++) {
        const u = s / 90, a = a0 + dir * u * turns * TAU, rr = R * (1 - u * 0.86);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        s ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      for (let l = 0; l < 7; l++) {
        const u = 0.08 + l * 0.11, a = a0 + dir * u * turns * TAU, rr = R * (1 - u * 0.86);
        const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
        g.beginPath(); g.ellipse(x, y, 9 * (1 - u * 0.6), 3, a + dir * 0.7, 0, TAU); g.fillStyle = 'rgba(40,40,40,0.85)'; g.fill();
      }
    }
    return c;
  }
  function brushedCanvas(seed) {
    const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = 120 + 60 * (fbm(x / 1.5, y / 70, seed, 2) - 0.5) + 50 * (fbm(x / 60, y / 60, seed + 4, 3) - 0.5);
      d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function featherCanvas() {
    const W = 256, H = 1024, c = canvas(W, H), g = c.getContext('2d');
    g.clearRect(0, 0, W, H);
    const r = rng(77);
    for (let y = 30; y < H - 6; y += 2) {
      const u = y / H;
      const len = W * 0.48 * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.1)), 0.7) * (0.88 + 0.12 * r());
      if (r() < 0.03) continue;
      for (const side of [-1, 1]) {
        const ww = side < 0 ? len * 0.6 : len;
        const sh = 230 - u * 40 - r() * 20;
        g.strokeStyle = `rgba(${sh + 10},${sh},${sh - 18},0.9)`;
        g.lineWidth = 1.7;
        g.beginPath(); g.moveTo(W / 2, y);
        g.quadraticCurveTo(W / 2 + side * ww * 0.55, y - 16, W / 2 + side * ww, y - 40 - r() * 10);
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(252,247,236,1)'; g.lineWidth = 6; g.beginPath(); g.moveTo(W / 2, 20); g.lineTo(W / 2, H); g.stroke();
    return c;
  }
  // the porcelain face: painted on the sphere's UV (u = phi / 2pi, the face centre at u = 0.75)
  function faceCanvas() {
    const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const fx = 0.75 * W, fy = 0.5 * H;
    const U = (dphi) => fx - (dphi / TAU) * W;
    const Vv = (dth) => fy + (dth / Math.PI) * H;
    for (const s of [-1, 1]) {
      const gr = g.createRadialGradient(U(s * 0.62), Vv(0.3), 0, U(s * 0.62), Vv(0.3), 46);
      gr.addColorStop(0, 'rgba(236,120,128,0.55)'); gr.addColorStop(1, 'rgba(236,120,128,0)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
    g.lineCap = 'round';
    for (const s of [-1, 1]) {
      g.strokeStyle = 'rgba(110,78,52,0.75)'; g.lineWidth = 2.4;
      g.beginPath();
      for (let k = 0; k <= 24; k++) { const u = k / 24; const a = lerp(0.14, 0.58, u) * s; const th = -0.27 - 0.05 * Math.sin(Math.PI * Math.pow(u, 0.8)) + 0.02 * u; k ? g.lineTo(U(a), Vv(th)) : g.moveTo(U(a), Vv(th)); }
      g.stroke();
    }
    g.fillStyle = 'rgba(196,74,86,0.95)';
    g.beginPath();
    g.moveTo(U(-0.2), Vv(0.42));
    g.quadraticCurveTo(U(-0.1), Vv(0.37), U(0), Vv(0.395));
    g.quadraticCurveTo(U(0.1), Vv(0.37), U(0.2), Vv(0.42));
    g.quadraticCurveTo(U(0.0), Vv(0.5), U(-0.2), Vv(0.42));
    g.fill();
    g.strokeStyle = 'rgba(120,40,50,0.8)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(U(-0.19), Vv(0.42)); g.quadraticCurveTo(U(0), Vv(0.435), U(0.19), Vv(0.42)); g.stroke();
    g.fillStyle = 'rgba(170,110,100,0.35)';
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(U(s * 0.06), Vv(0.255), 3, 2, 0, 0, TAU); g.fill(); }
    return c;
  }

  // ------------------------------------------------------------------ geometry helpers
  function lathe(profile, segs, phiStart, phiLen) {
    return new T3.LatheGeometry(profile.map(([r, y]) => new T3.Vector2(Math.max(1e-4, r), y)), segs || 40, phiStart || 0, phiLen || TAU);
  }
  // spur gear with crossings: n teeth, pitch radius rp, thickness th (axis = local z)
  function gearGeo(n, rp, th, opt) {
    opt = opt || {};
    const m = (2 * rp) / n, ra = rp + m * 0.9, rf = rp - m * 1.1;
    const sh = new T3.Shape();
    const steps = n * 6;
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * TAU;
      const ph = ((a / TAU) * n) % 1;
      let r;
      if (opt.pointed) r = ph < 0.55 ? lerp(rf, ra, ph / 0.55) : ph < 0.68 ? lerp(ra, rf, (ph - 0.55) / 0.13) : rf;
      else r = ph < 0.1 ? rf : ph < 0.25 ? lerp(rf, ra, (ph - 0.1) / 0.15) : ph < 0.45 ? ra : ph < 0.6 ? lerp(ra, rf, (ph - 0.45) / 0.15) : rf;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      i ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    const hub = opt.hub || rp * 0.2;
    const rim = rf - Math.max(m * 1.5, rp * 0.13);
    const spokes = opt.spokes == null ? (rp > 0.009 ? 5 : 0) : opt.spokes;
    if (spokes && rim > hub * 1.8) {
      const sw = opt.spokeW || Math.max(rp * 0.07, 0.001);
      for (let s = 0; s < spokes; s++) {
        const a0 = (s / spokes) * TAU, a1 = ((s + 1) / spokes) * TAU;
        const hole = new T3.Path();
        const ri = hub + sw * 0.5, ro = rim;
        const N = 10;
        for (let k = 0; k <= N; k++) { const a = lerp(a0 + sw / ro, a1 - sw / ro, k / N); const x = Math.cos(a) * ro, y = Math.sin(a) * ro; k ? hole.lineTo(x, y) : hole.moveTo(x, y); }
        for (let k = N; k >= 0; k--) { const a = lerp(a0 + sw / ri, a1 - sw / ri, k / N); hole.lineTo(Math.cos(a) * ri, Math.sin(a) * ri); }
        sh.holes.push(hole);
      }
    }
    const axle = new T3.Path(); axle.absarc(0, 0, opt.axle || Math.min(hub * 0.45, 0.0014), 0, TAU, true); sh.holes.push(axle);
    const g = new T3.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -th / 2);
    return g;
  }
  // a cam: radius table (one revolution), follower world angle alpha, thickness th. Horizontal.
  function camGeo(table, alpha, th) {
    const sh = new T3.Shape();
    const M = 2048;
    for (let k = 0; k < M; k++) {
      const i = Math.floor((k / M) * P.N);
      const r = table[i];
      const psi = alpha - (TAU * i) / P.N;
      const x = Math.cos(psi) * r, y = Math.sin(psi) * r;
      k ? sh.lineTo(x, y) : sh.moveTo(x, y);
    }
    sh.closePath();
    for (let s = 0; s < 5; s++) {
      const a = (s / 5) * TAU + 0.3;
      const hp = new T3.Path(); hp.absarc(Math.cos(a) * 0.0105, Math.sin(a) * 0.0105, 0.0036, 0, TAU, true); sh.holes.push(hp);
    }
    const ax = new T3.Path(); ax.absarc(0, 0, 0.0027, 0, TAU, true); sh.holes.push(ax);
    const g = new T3.ExtrudeGeometry(sh, { depth: th, bevelEnabled: false, curveSegments: 8 });
    g.rotateX(-Math.PI / 2); // shape angle == world atan2(-z, x)
    return g;
  }
  const _up = new T3.Vector3(0, 1, 0);
  function between(mesh, a, b, keepLen) {
    const A = V(a), B = V(b);
    const d = B.clone().sub(A); const L = d.length();
    mesh.position.copy(A);
    mesh.quaternion.setFromUnitVectors(_up, d.normalize());
    if (!keepLen) mesh.scale.set(1, L, 1);
  }
  function capsule(a, b, r, mat, parent) {
    const A = V(a), B = V(b), L = A.distanceTo(B);
    const m = new T3.Mesh(new T3.CapsuleGeometry(r, Math.max(0.0001, L), 4, 10), mat);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_up, B.clone().sub(A).normalize());
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // a sculpted body with an elliptic section; faces where hole(phi, y) are dropped. phi 0 = +z (back)
  function bodyGeo(rows, segPhi, phi0, phi1, hole) {
    const pos = [], uv = [], idx = [];
    const nr = rows.length;
    for (let j = 0; j < nr; j++) {
      const [y, rx, rz, zoff] = rows[j];
      for (let i = 0; i <= segPhi; i++) {
        const ph = lerp(phi0, phi1, i / segPhi);
        pos.push(Math.sin(ph) * rx, y, Math.cos(ph) * rz + (zoff || 0));
        uv.push(i / segPhi, j / (nr - 1));
      }
    }
    for (let j = 0; j < nr - 1; j++) for (let i = 0; i < segPhi; i++) {
      const a = j * (segPhi + 1) + i, b = a + 1, c = a + segPhi + 1, d = c + 1;
      if (hole) {
        const ph = lerp(phi0, phi1, (i + 0.5) / segPhi), y = (rows[j][0] + rows[j + 1][0]) / 2;
        if (hole(ph, y)) continue;
      }
      idx.push(a, b, c, b, d, c);
    }
    const g = new T3.BufferGeometry();
    g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function rowsFrom(ctrl, n) {
    const out = [];
    const ys = ctrl.map((c) => c[0]);
    for (let k = 0; k <= n; k++) {
      const y = lerp(ys[0], ys[ys.length - 1], k / n);
      let i = 0; while (i < ctrl.length - 2 && ctrl[i + 1][0] < y) i++;
      const a = ctrl[Math.max(0, i - 1)], b = ctrl[i], c = ctrl[i + 1], d = ctrl[Math.min(ctrl.length - 1, i + 2)];
      const t = (y - b[0]) / (c[0] - b[0] || 1);
      const cr = (p0, p1, p2, p3) => 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
      out.push([y, cr(a[1], b[1], c[1], d[1]), cr(a[2], b[2], c[2], d[2]), cr(a[3] || 0, b[3] || 0, c[3] || 0, d[3] || 0)]);
    }
    return out;
  }

  // ------------------------------------------------------------------ analytic environment
  // SwiftShader pays ~360 ms a frame for a PMREM lookup; this analytic workshop (a moonlit window,
  // the candle, a warm lamp corner, a warm desk below) costs a few ALU ops and no texture fetches.
  const ENV = { i: { value: 1 }, topDir: { value: new T3.Vector3(0.15, 1.0, 0.35).normalize() }, topI: { value: 1 }, candI: { value: 1 } };
  const ENV_GLSL = `
    uniform float uEnvI; uniform vec3 uTopDir; uniform float uTopI; uniform float uCandI;
    vec3 envDir(vec3 d, float r) {
      float rr = clamp(r, 0.03, 1.0);
      float s = 2.0 / (rr * rr * rr + 0.0035);
      vec3 c = vec3(0.006, 0.004, 0.003);
      c += vec3(0.03, 0.017, 0.009) * smoothstep(-0.1, -0.85, d.y);
      c += vec3(0.012, 0.008, 0.005) * exp(-d.y * d.y * 9.0);
      float lt = max(dot(d, uTopDir), 0.0);
      float st = min(s * 0.12, 14.0);
      c += vec3(0.62, 0.44, 0.26) * pow(lt, st) * (0.06 + st * 0.02) * uTopI;
      vec3 win = normalize(vec3(-0.5, 0.38, 0.78));
      float lw = max(dot(d, win), 0.0);
      float sw = min(s * 0.5, 400.0);
      c += vec3(0.42, 0.55, 1.0) * pow(lw, sw) * (0.04 + sw * 0.004);
      vec3 cnd = normalize(vec3(-0.62, 0.22, -0.62));
      float lc = max(dot(d, cnd), 0.0);
      float sc = min(s, 900.0);
      c += vec3(2.6, 1.45, 0.62) * pow(lc, sc) * (0.02 + sc * 0.006) * uCandI;
      vec3 lamp = normalize(vec3(0.72, 0.12, 0.62));
      float ll = max(dot(d, lamp), 0.0);
      float sl = min(s * 0.3, 120.0);
      c += vec3(0.7, 0.38, 0.16) * pow(ll, sl) * (0.05 + sl * 0.015);
      return c * uEnvI;
    }`;
  function envify(m) {
    if (!m || m.isShaderMaterial || m.isMeshBasicMaterial || m.userData.envified) return m;
    m.userData.envified = true;
    const prev = m.onBeforeCompile;
    const hadKey = m.hasOwnProperty('customProgramCacheKey') ? m.customProgramCacheKey : null;
    m.onBeforeCompile = (sh, rd) => {
      if (prev && prev !== T3.Material.prototype.onBeforeCompile) prev(sh, rd);
      sh.uniforms.uEnvI = ENV.i; sh.uniforms.uTopDir = ENV.topDir; sh.uniforms.uTopI = ENV.topI; sh.uniforms.uCandI = ENV.candI;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\n' + ENV_GLSL)
        .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
          {
            vec3 nW = inverseTransformDirection(geometryNormal, viewMatrix);
            vec3 rW = inverseTransformDirection(reflect(-geometryViewDir, geometryNormal), viewMatrix);
            iblIrradiance += envDir(nW, 1.0) * PI;
            #if defined( RE_IndirectSpecular )
              radiance += envDir(rW, material.roughness);
              #ifdef USE_CLEARCOAT
                clearcoatRadiance += envDir(inverseTransformDirection(reflect(-geometryViewDir, geometryClearcoatNormal), viewMatrix), material.clearcoatRoughness);
              #endif
            #endif
          }`);
    };
    m.customProgramCacheKey = () => 'env1|' + (hadKey ? hadKey.call(m) : '');
    return m;
  }

  // ------------------------------------------------------------------ the world
  let R = null;

  function build(Wpx, Hpx) {
    const cvs = canvas(Wpx, Hpx);
    const renderer = new T3.WebGLRenderer({ canvas: cvs, antialias: false, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1);
    renderer.setSize(Wpx, Hpx, false);
    renderer.outputColorSpace = T3.LinearSRGBColorSpace;
    renderer.toneMapping = T3.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T3.PCFShadowMap;

    const scene = new T3.Scene();
    scene.background = new T3.Color(0x030204);
    const cam = new T3.PerspectiveCamera(30, Wpx / Hpx, 0.01, 12);



    // ---------------- materials
    const brushed = new T3.CanvasTexture(brushedCanvas(5)); brushed.wrapS = brushed.wrapT = T3.RepeatWrapping;
    const engrTex = new T3.CanvasTexture(engraveCanvas(9, 70)); engrTex.wrapS = engrTex.wrapT = T3.RepeatWrapping;
    const engrFine = new T3.CanvasTexture(engraveCanvas(19, 160)); engrFine.wrapS = engrFine.wrapT = T3.RepeatWrapping; engrFine.repeat.set(2, 2);
    const M = {};
    M.brass = new T3.MeshStandardMaterial({ color: 0xdcaa58, metalness: 1, roughness: 0.3, roughnessMap: brushed });
    M.brassDark = new T3.MeshStandardMaterial({ color: 0xb0843f, metalness: 1, roughness: 0.42, roughnessMap: brushed });
    M.brassEngr = new T3.MeshStandardMaterial({ color: 0xd4a65c, metalness: 1, roughness: 0.36, bumpMap: engrTex, bumpScale: 2.2, roughnessMap: engrTex });
    M.brassHair = new T3.MeshStandardMaterial({ color: 0xd9ad62, metalness: 1, roughness: 0.3, bumpMap: engrFine, bumpScale: 2.5 });
    const ringC = canvas(1024, 1024), rg = ringC.getContext('2d');
    { const img = rg.createImageData(1024, 1024), d = img.data; for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) { const r = Math.hypot(x - 512, y - 512); const v = 150 + 55 * Math.sin(r * 0.9) * Math.sin(r * 0.13 + 1) + 30 * (fbm(r / 3, Math.atan2(y - 512, x - 512) * 40, 3, 2) - 0.5); const i = (y * 1024 + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } rg.putImageData(img, 0, 0); }
    const ringTex = new T3.CanvasTexture(ringC); ringTex.repeat.set(9.5, 9.5); ringTex.offset.set(0.5, 0.5);
    M.camBrass = new T3.MeshStandardMaterial({ color: 0xe0a650, metalness: 1, roughness: 0.2, roughnessMap: ringTex, bumpMap: ringTex, bumpScale: 0.6 });
    M.steel = new T3.MeshStandardMaterial({ color: 0xc4c8cf, metalness: 1, roughness: 0.16 });
    M.blued = new T3.MeshStandardMaterial({ color: 0x3550a8, metalness: 1, roughness: 0.2 });
    M.ruby = new T3.MeshStandardMaterial({ color: 0xc0103a, metalness: 0.2, roughness: 0.05, emissive: 0x300008 });
    M.porcelain = new T3.MeshPhysicalMaterial({ color: 0xefe2cc, roughness: 0.45, clearcoat: 1, clearcoatRoughness: 0.07 });
    const faceTex = new T3.CanvasTexture(faceCanvas()); faceTex.colorSpace = T3.SRGBColorSpace;
    M.face = new T3.MeshPhysicalMaterial({ color: 0xf6efe6, map: faceTex, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 });
    const velC = canvas(512, 512), vg = velC.getContext('2d');
    { const img = vg.createImageData(512, 512), d = img.data; for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) { const v = 128 + 70 * (fbm(x / 1.3, y / 1.3, 51, 2) - 0.5) + 60 * (fbm(x / 70, y / 22, 53, 3) - 0.5); const i = (y * 512 + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } vg.putImageData(img, 0, 0); }
    const velTex = new T3.CanvasTexture(velC); velTex.wrapS = velTex.wrapT = T3.RepeatWrapping; velTex.repeat.set(3, 3);
    M.velvet = new T3.MeshPhysicalMaterial({ color: 0x2a0a1b, roughness: 0.92, sheen: 1, sheenRoughness: 0.5, sheenColor: new T3.Color(0x8c3f6c), side: T3.DoubleSide, bumpMap: velTex, bumpScale: 1.4 });
    M.silk = new T3.MeshPhysicalMaterial({ color: 0xe8dcc2, roughness: 0.55, sheen: 0.8, sheenRoughness: 0.3, sheenColor: new T3.Color(0xfff2d8), bumpMap: engrFine, bumpScale: 0.6 });
    M.lace = new T3.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.75, side: T3.DoubleSide });
    M.glass = new T3.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.11, envMapIntensity: 2.2, specularIntensity: 1, depthWrite: false, side: T3.DoubleSide });
    M.eye = new T3.MeshPhysicalMaterial({ color: 0x3a2412, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0 });
    M.eyeWhite = new T3.MeshPhysicalMaterial({ color: 0xf3eee6, roughness: 0.1, clearcoat: 1 });
    M.black = new T3.MeshStandardMaterial({ color: 0x0b0809, roughness: 0.5 });
    M.ribbon = new T3.MeshPhysicalMaterial({ color: 0x0c0a0c, roughness: 0.4, sheen: 1, sheenColor: new T3.Color(0x6a5a70) });
    M.inkPool = new T3.MeshPhysicalMaterial({ color: 0x030205, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0 });
    const woodTex = new T3.CanvasTexture(woodCanvas(3, [82, 44, 30], 1024, 1024, 30)); woodTex.colorSpace = T3.SRGBColorSpace; woodTex.wrapS = woodTex.wrapT = T3.RepeatWrapping; woodTex.anisotropy = 8;
    M.wood = new T3.MeshStandardMaterial({ map: woodTex, roughness: 0.4 });
    const wallTex = new T3.CanvasTexture(woodCanvas(13, [44, 30, 22], 512, 512, 18)); wallTex.colorSpace = T3.SRGBColorSpace; wallTex.wrapS = wallTex.wrapT = T3.RepeatWrapping; wallTex.repeat.set(3, 2);
    M.wall = new T3.MeshStandardMaterial({ map: wallTex, roughness: 0.8 });
    M.wax = new T3.MeshStandardMaterial({ color: 0xf0dfc0, roughness: 0.6, emissive: new T3.Color(0xff9a40), emissiveIntensity: 0.0 });
    const paperTex = new T3.CanvasTexture(paperCanvas()); paperTex.colorSpace = T3.SRGBColorSpace; paperTex.anisotropy = 16;
    const pbC = canvas(1024, 1024), pbg = pbC.getContext('2d');
    { const img = pbg.createImageData(1024, 1024), d = img.data; for (let y = 0; y < 1024; y++) for (let x = 0; x < 1024; x++) { const v = 128 + 46 * (fbm(x / 2.2, y / 7, 61, 3) - 0.5) + 36 * (fbm(x / 30, y / 30, 63, 3) - 0.5) + 6 * Math.sin(y * 1.1); const i = (y * 1024 + x) * 4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } pbg.putImageData(img, 0, 0); }
    const paperBump = new T3.CanvasTexture(pbC);
    M.paper = new T3.MeshStandardMaterial({ map: paperTex, roughness: 0.86, alphaTest: 0.5, bumpMap: paperBump, bumpScale: 0.5 });

    const root = new T3.Group(); scene.add(root);
    const add = (geo, mat, x, y, z, parent, shadow) => { const m = new T3.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = shadow !== false; m.receiveShadow = true; (parent || root).add(m); return m; };

    // ---------------- room
    const floor = add(new T3.PlaneGeometry(6, 6), M.wall, 0, -0.74, 0, root, false); floor.rotation.x = -Math.PI / 2;
    add(new T3.PlaneGeometry(4, 2.4), M.wall, 0, 0.3, -1.25, root, false);
    const wb = add(new T3.PlaneGeometry(4, 2.4), M.wall, 0, 0.3, 1.6, root, false); wb.rotation.y = Math.PI;
    const wl = add(new T3.PlaneGeometry(4, 2.4), M.wall, -1.4, 0.3, 0, root, false); wl.rotation.y = Math.PI / 2;
    const wr = add(new T3.PlaneGeometry(4, 2.4), M.wall, 1.4, 0.3, 0, root, false); wr.rotation.y = -Math.PI / 2;
    const winG = new T3.Group(); winG.position.set(-0.7, 0.45, 1.59); winG.rotation.y = Math.PI; root.add(winG);
    const pane = new T3.MeshBasicMaterial({ color: new T3.Color(0x7c8aa6).multiplyScalar(0.3) });
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const m = new T3.Mesh(new T3.PlaneGeometry(0.19, 0.17), pane); m.position.set(-0.21 + i * 0.21, -0.3 + j * 0.19, 0.001); winG.add(m); }
    add(new T3.BoxGeometry(1.7, 0.025, 0.22), M.wood, 0.1, 0.36, -1.13, root, false);
    const r1 = rng(41);
    for (let k = 0; k < 13; k++) {
      const x = -0.62 + k * 0.11 + r1() * 0.03, hgt = 0.06 + r1() * 0.16;
      const isG = k % 3 === 0;
      const m = add(isG ? gearGeo(18 + ((r1() * 20) | 0), 0.04 + r1() * 0.03, 0.006) : lathe([[0.0001, 0], [0.03 + r1() * 0.02, 0.002], [0.035, hgt * 0.4], [0.02, hgt * 0.8], [0.012, hgt], [0.0001, hgt]], 18), k % 2 ? M.brass : M.brassDark, x, 0.373 + (isG ? 0.065 : 0), -1.1 + r1() * 0.06, root, false);
      if (isG) m.rotation.y = 0.3;
    }
    add(new T3.SphereGeometry(0.007, 10, 8), new T3.MeshBasicMaterial({ color: new T3.Color(0xffb060).multiplyScalar(10) }), 0.58, 0.45, -1.05, root, false);
    add(new T3.SphereGeometry(0.006, 10, 8), new T3.MeshBasicMaterial({ color: new T3.Color(0xffb060).multiplyScalar(8) }), -0.95, 0.5, 0.9, root, false);

    // ---------------- desk
    const deskTop = add(new T3.BoxGeometry(0.62, 0.028, 0.39), M.wood, 0.01, -0.014, -0.03);
    const trim = (w, x, z, ry) => { const m = add(new T3.CylinderGeometry(0.0035, 0.0035, w, 8), M.brass, x, -0.004, z, root, false); m.rotation.z = Math.PI / 2; m.rotation.y = ry || 0; };
    trim(0.62, 0.01, 0.161); trim(0.62, 0.01, -0.221); trim(0.39, -0.302, -0.03, Math.PI / 2); trim(0.39, 0.322, -0.03, Math.PI / 2);
    add(new T3.BoxGeometry(0.58, 0.07, 0.36), M.wood, 0.01, -0.063, -0.03, root, false);
    for (const [x, z] of [[-0.27, 0.13], [0.29, 0.13], [-0.27, -0.19], [0.29, -0.19]]) add(lathe([[0.022, 0], [0.016, -0.1], [0.024, -0.22], [0.012, -0.5], [0.018, -0.62], [0.0001, -0.64]], 16), M.wood, x, -0.09, z, root, false);

    // ---------------- the sheet & the ink
    const sheet = new T3.Group();
    sheet.position.set(P.PAGE_C[0], P.PAGE_C[1], P.PAGE_C[2]);
    sheet.rotation.y = P.PAGE_PSI;
    root.add(sheet);
    const paperGeo = new T3.PlaneGeometry(P.PAGE.w, P.PAGE.h, 1, 1); paperGeo.rotateX(-Math.PI / 2);
    const paper = new T3.Mesh(paperGeo, M.paper); paper.receiveShadow = true; sheet.add(paper);
    const under = new T3.Mesh(paperGeo, M.paper); under.position.set(0.004, -0.0003, 0.003); under.rotation.y = -0.045; under.receiveShadow = true; sheet.add(under);
    const ink = buildInk();
    sheet.add(ink.mesh); sheet.add(ink.blots);

    // ---------------- the inkwell (brass encrier) at the programme's well position
    const wellW = P.pageToWorld(P.WELL.x, P.WELL.y, 0);
    const well = new T3.Group(); well.position.set(wellW[0], 0, wellW[2]); root.add(well);
    add(lathe([[0.0001, 0], [0.034, 0], [0.036, 0.003], [0.033, 0.007], [0.025, 0.011], [0.023, 0.025], [0.02, 0.03], [0.0158, P.WELL.zRim], [0.0124, P.WELL.zRim], [0.0122, 0.024], [0.0001, 0.02]], 36), M.brass, 0, 0, 0, well);
    add(new T3.TorusGeometry(0.0145, 0.0017, 8, 36), M.brass, 0, P.WELL.zRim, 0, well).rotation.x = Math.PI / 2;
    const inkSurf = add(new T3.CircleGeometry(0.0123, 28), M.inkPool, 0, P.WELL.zInk, 0, well, false); inkSurf.rotation.x = -Math.PI / 2;

    // ---------------- the candle
    const cand = new T3.Group(); cand.position.set(-0.2, 0, -0.16); root.add(cand);
    add(lathe([[0.0001, 0], [0.042, 0], [0.043, 0.004], [0.028, 0.009], [0.011, 0.015], [0.008, 0.04], [0.013, 0.046], [0.01, 0.05], [0.016, 0.056], [0.0165, 0.06], [0.0001, 0.06]], 32), M.brass, 0, 0, 0, cand);
    const candleH = 0.07;
    add(lathe([[0.0001, 0.0], [0.0102, 0], [0.0102, candleH - 0.004], [0.0092, candleH], [0.003, candleH - 0.0015], [0.0001, candleH - 0.002]], 24), M.wax, 0, 0.06, 0, cand);
    add(lathe([[0.0103, candleH - 0.012], [0.0108, candleH - 0.018], [0.0104, candleH - 0.03]], 20), M.wax, 0, 0.06, 0, cand);
    add(new T3.CylinderGeometry(0.0005, 0.0006, 0.007, 6), M.black, 0, 0.06 + candleH + 0.002, 0, cand);
    const flameMat = new T3.ShaderMaterial({
      vertexShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ vP = position; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'varying vec3 vP; varying vec3 vN; varying vec3 vV; void main(){ float h = clamp(vP.y/0.026,0.,1.); float rim = pow(max(dot(vN,vV),0.),1.3); vec3 base = mix(vec3(0.25,0.35,1.6), vec3(6.,3.4,1.2), smoothstep(0.04,0.28,h)); vec3 core = mix(base, vec3(16.,10.,5.), smoothstep(0.15,0.6,h)*rim); gl_FragColor = vec4(core*(0.25+0.75*rim)*(1.0 - smoothstep(0.8,1.0,h)*0.5), 1.); }',
    });
    const flame = new T3.Mesh(lathe([[0.0001, 0], [0.003, 0.003], [0.0042, 0.009], [0.0034, 0.016], [0.0015, 0.023], [0.0001, 0.027]], 16), flameMat);
    flame.position.set(0, 0.06 + candleH + 0.001, 0); cand.add(flame);
    const flamePos = new T3.Vector3(cand.position.x, 0.06 + candleH + 0.012, cand.position.z);

    // ---------------- lights
    const candleSpot = new T3.SpotLight(0xffcf9c, 0.5, 0, 0.95, 1.0, 1.2);
    candleSpot.position.copy(flamePos);
    candleSpot.target.position.set(0.04, 0, 0.06);
    candleSpot.castShadow = true;
    candleSpot.shadow.mapSize.set(2048, 2048);
    candleSpot.shadow.camera.near = 0.03; candleSpot.shadow.camera.far = 1.0;
    candleSpot.shadow.bias = -0.0006; candleSpot.shadow.normalBias = 0.004; candleSpot.shadow.radius = 4;
    root.add(candleSpot); root.add(candleSpot.target);
    const candleFill = new T3.PointLight(0xffb070, 0.12, 0, 1); candleFill.position.copy(flamePos).add(new T3.Vector3(0, 0.02, 0)); root.add(candleFill);
    const moon = new T3.DirectionalLight(0x9eb2ff, 0.55); moon.position.set(-0.9, 1.0, 1.3); moon.target.position.set(0, 0, 0.1); root.add(moon); root.add(moon.target);
    const inner = new T3.PointLight(0xffc890, 0.02, 0.25, 2); root.add(inner);
    const backLamp = new T3.SpotLight(0xffc488, 0.0, 0, 0.2, 1.0, 2); backLamp.position.set(0.06, 0.52, 0.72); backLamp.target.position.set(0.0, 0.0, 0.3); root.add(backLamp); root.add(backLamp.target);

    const fig = buildFigure(M, add, root);
    const quill = buildQuill(M, add, root);
    scene.traverse((o) => { if (o.isMesh) envify(o.material); });
    // only what can catch the candle's shadow samples it
    scene.traverse((o) => { if (o.isMesh && o.receiveShadow && !o.userData.keepShadow) o.receiveShadow = false; });
    [paper, under, ink.mesh, ink.blots, deskTop].forEach((m) => (m.receiveShadow = true));
    fig.shadowReceivers.forEach((m) => (m.receiveShadow = true));
    fig.mech.traverse((o) => { if (o.isMesh) o.receiveShadow = true; });
    fig.tor.children.forEach((o) => { if (o.isMesh) o.receiveShadow = true; });

    // ---------------- post
    const rts = {};
    function targets(rs) {
      const key = rs.toFixed(3);
      if (rts[key]) return rts[key];
      const w = Math.round(Wpx * rs), h = Math.round(Hpx * rs), hw = Math.round(w / 2), hh = Math.round(h / 2);
      return (rts[key] = {
        w, h,
        scene: new T3.WebGLRenderTarget(w, h, { type: T3.HalfFloatType, depthTexture: new T3.DepthTexture(w, h) }),
        half: new T3.WebGLRenderTarget(hw, hh, { type: T3.HalfFloatType }),
        bloomRT: new T3.WebGLRenderTarget(hw, hh, { type: T3.HalfFloatType }),
        bloom: new T3.UnrealBloomPass(new T3.Vector2(hw, hh), 0.45, 0.6, 2.4),
      });
    }
    const quad = new T3.Mesh(new T3.PlaneGeometry(2, 2));
    const qScene = new T3.Scene(); qScene.add(quad);
    const qCam = new T3.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.,1.); }';
    const LIN = 'float lin(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); } float coc(float z){ return clamp(uAper * abs(z - uFocus) / z * uRes.y, 0., uMax); }';
    const dofMat = new T3.ShaderMaterial({
      uniforms: { tC: { value: null }, tD: { value: null }, uRes: { value: new T3.Vector2(Wpx, Hpx) }, uNear: { value: 0.01 }, uFar: { value: 12 }, uFocus: { value: 0.5 }, uAper: { value: 0.01 }, uMax: { value: 16 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tC; uniform sampler2D tD; uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAper, uMax; varying vec2 vUv; ${LIN}
        void main(){
          float zc = lin(texture2D(tD, vUv).x);
          float cc = coc(zc);
          vec3 acc = min(texture2D(tC, vUv).rgb, vec3(5.0)); float wsum = 1.;
          float R = max(cc, 0.5);
          for (int i = 1; i < 28; i++) {
            float fi = float(i);
            float r = sqrt(fi / 28.) * R;
            float a = fi * 2.39996323;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
            float zs = lin(texture2D(tD, uv).x);
            float cs = coc(zs);
            if (zs > zc) cs = min(cs, cc);
            float w = clamp(cs - r + 1., 0., 1.);
            acc += min(texture2D(tC, uv).rgb, vec3(5.0)) * w; wsum += w;
          }
          gl_FragColor = vec4(acc / wsum, 1.);
        }`,
      depthTest: false, depthWrite: false,
    });
    const copyMat = new T3.ShaderMaterial({ uniforms: { tC: { value: null } }, vertexShader: VS, fragmentShader: 'uniform sampler2D tC; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tC, vUv).rgb, 1.); }', depthTest: false, depthWrite: false });
    const finalMat = new T3.ShaderMaterial({
      uniforms: { tC: { value: null }, tD: { value: null }, tHalf: { value: null }, tBloom: { value: null }, uExp: { value: 1 }, uFrame: { value: 0 }, uRes: { value: new T3.Vector2(Wpx, Hpx) }, uVig: { value: 0.55 }, uFade: { value: 1 }, uNear: { value: 0.01 }, uFar: { value: 12 }, uFocus: { value: 0.5 }, uAper: { value: 0.01 }, uMax: { value: 16 }, uWarm: { value: 0 } },
      vertexShader: VS,
      fragmentShader: `uniform sampler2D tC; uniform sampler2D tD; uniform sampler2D tHalf; uniform sampler2D tBloom; uniform float uExp, uFrame, uVig, uFade, uNear, uFar, uFocus, uAper, uMax, uWarm; uniform vec2 uRes; varying vec2 vUv; ${LIN}
        vec3 aces(vec3 x){ x *= 0.6; return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.,1.); }
        float luma(vec3 c){ float l = dot(c*uExp, vec3(0.299,0.587,0.114)); return l / (1.0 + l); }
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
        vec3 fxaa(vec2 uv){
          vec2 px = 1.0/uRes;
          vec3 cM = texture2D(tC, uv).rgb;
          float lM = luma(cM), lN = luma(texture2D(tC, uv+vec2(0.,px.y)).rgb), lS = luma(texture2D(tC, uv-vec2(0.,px.y)).rgb);
          float lE = luma(texture2D(tC, uv+vec2(px.x,0.)).rgb), lW = luma(texture2D(tC, uv-vec2(px.x,0.)).rgb);
          float mn = min(lM, min(min(lN,lS), min(lE,lW))), mx = max(lM, max(max(lN,lS), max(lE,lW)));
          if (mx - mn < max(0.04, mx*0.15)) return cM;
          vec2 dir = vec2(-(lN - lS), lE - lW);
          float dmin = 1.0/(min(abs(dir.x), abs(dir.y)) + 0.05);
          dir = clamp(dir*dmin, -2.0, 2.0) * px;
          vec3 a = 0.5*(texture2D(tC, uv + dir*(1./3.-0.5)).rgb + texture2D(tC, uv + dir*(2./3.-0.5)).rgb);
          vec3 b = a*0.5 + 0.25*(texture2D(tC, uv - dir*0.5).rgb + texture2D(tC, uv + dir*0.5).rgb);
          float lb = luma(b);
          return (lb < mn || lb > mx) ? a : b;
        }
        void main(){
          float z = lin(texture2D(tD, vUv).x);
          float cc = coc(z);
          vec3 sharp = fxaa(vUv);
          vec3 half_ = texture2D(tHalf, vUv).rgb;
          vec3 bl = texture2D(tBloom, vUv).rgb - half_;
          vec3 c = mix(sharp, half_, smoothstep(0.8, 2.6, cc)) + max(bl, vec3(0.));
          c *= uExp;
          vec2 q = vUv - 0.5; q.x *= uRes.x/uRes.y;
          c *= 1. - uVig * smoothstep(0.3, 1.05, length(q));
          c = aces(c);
          c = pow(c, vec3(1./2.2));
          c = mix(c, c*c*(3.-2.*c), 0.2);
          c = mix(c, c*vec3(1.04,1.0,0.94), uWarm);
          float lu = dot(c, vec3(0.3,0.59,0.11));
          c = mix(c * vec3(0.9, 0.97, 1.08), c, smoothstep(0.05, 0.45, lu));
          float g = hash(floor(gl_FragCoord.xy) + vec2(uFrame*17.31, uFrame*7.77)) - 0.5;
          c += g * 0.03;
          gl_FragColor = vec4(c * uFade, 1.);
        }`,
      depthTest: false, depthWrite: false,
    });

    R = { cvs, renderer, scene, cam, root, fig, quill, ink, sheet, flame, flamePos, candleSpot, candleFill, moon, inner, backLamp, M, targets, quad, qScene, qCam, dofMat, copyMat, finalMat, W: Wpx, H: Hpx, cand, well };
  }

  // ------------------------------------------------------------------ the ink mesh
  function buildInk() {
    const pos = [], aT = [], aSide = [], aLoad = [], aAcross = [], aHW = [], idx = [];
    let v = 0;
    const PAD = 0.00012;
    for (const run of P.INKRUNS) {
      const pts = run.pts, n = pts.length;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
        const nx = -ty, ny = tx;
        const p = pts[i];
        const pool = 0.00014 * clamp(1 - (p.speed || 0) / 0.05, 0, 1);
        const hw = 0.5 * (0.0002 + 0.00118 * p.press + pool) * (0.86 + 0.14 * p.load);
        const gw = hw + PAD;
        let ox = 0, oy = 0;
        if (i === 0) { ox = -tx * hw; oy = -ty * hw; }
        if (i === n - 1) { ox = tx * hw; oy = ty * hw; }
        for (const s of [-1, 1]) {
          const x = p.x + nx * s * gw + ox, y = p.y + ny * s * gw + oy;
          pos.push(x, 0.00006, -y);
          aT.push(p.t); aSide.push(s); aLoad.push(p.load); aAcross.push(nx * s, 0, -ny * s); aHW.push(hw / gw);
        }
        if (i > 0) { const k = v + i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
      }
      v += n * 2;
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T3.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setAttribute('aT', new T3.Float32BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new T3.Float32BufferAttribute(aSide, 1));
    geo.setAttribute('aLoad', new T3.Float32BufferAttribute(aLoad, 1));
    geo.setAttribute('aAcross', new T3.Float32BufferAttribute(aAcross, 3));
    geo.setAttribute('aHW', new T3.Float32BufferAttribute(aHW, 1));
    geo.setIndex(idx);
    const uT = { value: 0 };
    const mesh = new T3.Mesh(geo, inkMaterial(uT, false));
    mesh.renderOrder = 2; mesh.receiveShadow = true; mesh.frustumCulled = false;

    const bp = [], bt = [], bc = [], bl = [], bi = [], bs = [];
    let bv = 0;
    P.LANDINGS.forEach((L, li) => {
      const R0 = L.big ? 0.0007 : 0.00016 + 0.00008 * L.load;
      const seg = 20;
      bp.push(L.x, 0.00007, -L.y); bt.push(L.t); bc.push(L.x, -L.y); bl.push(L.load); bs.push(0);
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * TAU;
        const rr = (R0 + 0.00012) * (0.84 + 0.28 * h2(li, k % seg, 5) + (L.big && (k % seg === 3 || k % seg === 4) ? 0.45 : 0));
        bp.push(L.x + Math.cos(a) * rr, 0.00007, -L.y + Math.sin(a) * rr);
        bt.push(L.t); bc.push(L.x, -L.y); bl.push(L.load); bs.push(1);
        if (k > 0) bi.push(bv, bv + k, bv + k + 1);
      }
      bv += seg + 2;
    });
    const bgeo = new T3.BufferGeometry();
    bgeo.setAttribute('position', new T3.Float32BufferAttribute(bp, 3));
    bgeo.setAttribute('normal', new T3.Float32BufferAttribute(new Float32Array(bp.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    bgeo.setAttribute('aT', new T3.Float32BufferAttribute(bt, 1));
    bgeo.setAttribute('aC', new T3.Float32BufferAttribute(bc, 2));
    bgeo.setAttribute('aLoad', new T3.Float32BufferAttribute(bl, 1));
    bgeo.setAttribute('aSide', new T3.Float32BufferAttribute(bs, 1));
    bgeo.setIndex(bi);
    const blots = new T3.Mesh(bgeo, inkMaterial(uT, true));
    blots.renderOrder = 3; blots.receiveShadow = true; blots.frustumCulled = false;
    return { mesh, blots, uT };
  }

  const DRY = 1.7;
  function inkMaterial(uT, blot) {
    const m = new T3.MeshStandardMaterial({ color: 0x15121c, roughness: 0.5, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false, transparent: true, side: T3.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uT = uT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aT; attribute float aLoad; attribute float aSide; varying float vT; varying float vLoad; varying float vSide; uniform float uT; varying vec2 vPg;
          ${blot ? 'attribute vec2 aC;' : 'attribute vec3 aAcross; attribute float aHW; varying vec3 vAcross; varying float vHW;'}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vT = aT; vLoad = aLoad; vPg = position.xz; vSide = aSide;
          ${blot ? 'float gr = smoothstep(0.0, 0.12, uT - aT); transformed.xz = aC + (position.xz - aC) * (0.2 + 0.8*gr);' : 'vAcross = normalize(normalMatrix * aAcross); vHW = aHW;'}`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uT; varying float vT; varying float vLoad; varying vec2 vPg; varying float vSide;
          ${blot ? '' : 'varying vec3 vAcross; varying float vHW;'}
          float ihash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
          float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(ihash(i),ihash(i+vec2(1,0)),f.x), mix(ihash(i+vec2(0,1)),ihash(i+vec2(1,1)),f.x), f.y); }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          if (vT > uT) discard;
          float age = uT - vT;
          float wet = 1.0 - smoothstep(0.0, ${DRY.toFixed(2)}, age);
          float fib = vn(vPg * 9000.0) * 0.6 + vn(vPg * 2600.0) * 0.4;
          float d = abs(vSide);
          float spread = 0.9 + 0.1 * smoothstep(0.0, 0.35, age);
          ${blot ? 'float lim = (0.86 - 0.1*fib) * spread;' : 'float lim = vHW * spread * (1.0 - 0.13*fib*(1.0-wet));'}
          float aa = fwidth(d) * 1.2 + 1e-5;
          float cover = 1.0 - smoothstep(lim - aa, lim + aa, d);
          if (cover < 0.01) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 wetC = vec3(0.008, 0.009, 0.03);
          vec3 dryC = vec3(0.060, 0.040, 0.032);
          float dens = mix(0.6, 1.0, smoothstep(0.35, 0.9, vLoad));
          float edge = smoothstep(0.55, 1.0, d / max(lim, 0.01));
          vec3 ic = mix(dryC * (1.0 - 0.3*edge), wetC, wet);
          ic = mix(vec3(0.36,0.3,0.25), ic, dens + (1.0-dens)*fib*0.7);
          diffuseColor.rgb = ic;
          diffuseColor.a = cover;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(0.62 + 0.15*fib, 0.16, wet);`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          ${blot ? '' : 'normal = normalize(normal + vAcross * vSide * (0.1 + 1.3 * wet));'}`);
    };
    m.customProgramCacheKey = () => 'ink2' + (blot ? 'b' : 'r');
    return m;
  }

  // ------------------------------------------------------------------ the quill
  function buildQuill(M, add, root) {
    const g = new T3.Group(); root.add(g);
    const L = P.FIG.quillLen;
    const shaftGeo = lathe([[0.0001, 0.006], [0.0011, 0.012], [0.0017, 0.024], [0.002, 0.045], [0.0021, 0.08], [0.0017, L * 0.85], [0.0008, L], [0.0001, L + 0.002]], 12);
    add(shaftGeo, new T3.MeshPhysicalMaterial({ color: 0xe9dcb8, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.1, sheen: 0.4, sheenColor: new T3.Color(0xfff0d0) }), 0, 0, 0, g);
    // the cut nib: a slim horn point, slit, its last 4 mm stained with ink
    add(lathe([[0.0001, 0.0], [0.00035, 0.0015], [0.0007, 0.004], [0.0011, 0.0062]], 12), new T3.MeshPhysicalMaterial({ color: 0x0a0709, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }), 0, 0, 0, g);
    add(lathe([[0.0009, 0.004], [0.00125, 0.0075], [0.00135, 0.0095], [0.0012, 0.0115]], 12), new T3.MeshPhysicalMaterial({ color: 0x2a2018, roughness: 0.25, clearcoat: 0.8 }), 0, 0, 0, g);
    add(new T3.BoxGeometry(0.00012, 0.006, 0.0016), M.black, 0, 0.004, 0, g); // the slit
    const featherTex = new T3.CanvasTexture(featherCanvas()); featherTex.colorSpace = T3.SRGBColorSpace;
    const vaneGeo = new T3.PlaneGeometry(0.036, 0.135, 2, 10);
    { const pa = vaneGeo.attributes.position; for (let i = 0; i < pa.count; i++) { const y = pa.getY(i), x = pa.getX(i); pa.setZ(i, 0.005 * Math.sin((y / 0.135 + 0.5) * Math.PI) + x * x * 4); } vaneGeo.computeVertexNormals(); }
    const vane = add(vaneGeo, new T3.MeshStandardMaterial({ map: featherTex, alphaTest: 0.4, side: T3.DoubleSide, roughness: 0.7 }), 0, L - 0.07, 0, g);
    vane.rotation.y = 0.5;
    return g;
  }

  // ------------------------------------------------------------------ the figure & its mechanism
  function buildFigure(M, add, root) {
    const F = P.FIG;
    const hipG = new T3.Group(); hipG.position.set(F.hip[0], F.hip[1], F.hip[2]); root.add(hipG);
    const tor = new T3.Group(); hipG.add(tor);
    const at = (p) => [p[0] - F.hip[0], p[1] - F.hip[1], p[2] - F.hip[2]];
    const ctrl = [[0.0, 0.074, 0.062, 0.0], [0.05, 0.07, 0.058, 0.002], [0.11, 0.072, 0.06, 0.0], [0.18, 0.08, 0.064, -0.002], [0.24, 0.088, 0.064, -0.002], [0.28, 0.09, 0.06, 0.0], [0.305, 0.075, 0.05, 0.002], [0.325, 0.045, 0.038, 0.004], [0.338, 0.026, 0.026, 0.004]];
    const rows = rowsFrom(ctrl, 120);
    const rowAt = (y) => { let i = 0; while (i < rows.length - 2 && rows[i + 1][0] < y) i++; const a = rows[i], b = rows[i + 1]; const t = clamp((y - a[0]) / (b[0] - a[0]), 0, 1); return [y, lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)]; };
    const surf = (ph, y, out) => { const r = rowAt(y); return [Math.sin(ph) * (r[1] + out), y, Math.cos(ph) * (r[2] + out) + r[3]]; };
    const WIN = { y: 0.168, hy: 0.112, hph: 0.86 };
    const inWin = (ph, y) => Math.pow(ph / WIN.hph, 2) + Math.pow((y - WIN.y) / WIN.hy, 2) < 1;
    const FRONT = 0.42;
    const openW = (y) => FRONT * (y > 0.22 ? Math.max(0, 1 - (y - 0.22) / 0.1) : 1) * (y < 0.09 ? 0.6 + 0.4 * clamp((y - 0.04) / 0.05, 0, 1) : 1);
    const coatOpen = (ph, y) => y > 0.04 && y < 0.3 && Math.abs(ph - Math.PI) < openW(y);
    add(bodyGeo(rows, 240, 0, TAU, (ph, y) => inWin(ph > Math.PI ? ph - TAU : ph, y) || coatOpen(ph, y)), M.velvet, 0, 0, 0, tor);
    const vest = add(bodyGeo(rows.map((r) => [r[0], r[1] - 0.003, r[2] - 0.003, r[3]]), 40, Math.PI - FRONT - 0.05, Math.PI + FRONT + 0.05, (ph, y) => y < 0.035 || y > 0.305), M.silk, 0, 0, 0, tor);
    vest.castShadow = false;
    const glassG = bodyGeo(rows.map((r) => [r[0], r[1] + 0.0015, r[2] + 0.0015, r[3]]), 48, -WIN.hph * 1.02, WIN.hph * 1.02, (ph, y) => !inWin(ph * 0.985, y));
    const glass = new T3.Mesh(glassG, M.glass); glass.renderOrder = 6; tor.add(glass);
    const bez = [], bead = [];
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * TAU;
      bez.push(V(surf(Math.cos(a) * WIN.hph, WIN.y + Math.sin(a) * WIN.hy, 0.002)));
      bead.push(surf(Math.cos(a) * WIN.hph * 0.94, WIN.y + Math.sin(a) * WIN.hy * 0.955, 0.0008));
    }
    add(new T3.TubeGeometry(new T3.CatmullRomCurve3(bez, true), 240, 0.0042, 10, true), M.brass, 0, 0, 0, tor);
    const beadGeo = new T3.SphereGeometry(0.0017, 8, 6);
    for (let k = 0; k < bead.length; k += 2) add(beadGeo, M.brass, ...bead[k], tor, false);
    const edgeL = [], edgeR = [];
    for (let k = 0; k <= 40; k++) {
      const y = lerp(0.005, 0.31, k / 40);
      let w = openW(y);
      if (y < 0.04) w = 0.6 * FRONT * (y / 0.04) + 0.02;
      edgeL.push(V(surf(Math.PI - Math.max(0.02, w), y, 0.0015)));
      edgeR.push(V(surf(Math.PI + Math.max(0.02, w), y, 0.0015)));
    }
    add(new T3.TubeGeometry(new T3.CatmullRomCurve3(edgeL), 80, 0.0024, 6), M.brass, 0, 0, 0, tor);
    add(new T3.TubeGeometry(new T3.CatmullRomCurve3(edgeR), 80, 0.0024, 6), M.brass, 0, 0, 0, tor);
    const btn = new T3.SphereGeometry(0.0034, 12, 8);
    for (let k = 0; k < 6; k++) { const y = 0.1 + k * 0.03; add(btn, M.brass, ...surf(Math.PI, y, 0.0), tor, false); }
    const skirt = add(lathe([[0.078, 0.02], [0.086, -0.01], [0.1, -0.05], [0.106, -0.075], [0.104, -0.08]], 64, 0.55, TAU - 1.1), M.velvet, 0, 0, 0.0, tor);
    skirt.scale.z = 0.88;
    // a white silk cravat at the throat
    for (let k = 0; k < 2; k++) {
      const sp = surf(Math.PI, 0.318 - k * 0.022, 0.003);
      const cr = add(new T3.SphereGeometry(1, 20, 14), M.silk, sp[0], sp[1], sp[2] - 0.002, tor, false);
      cr.scale.set(0.017 - k * 0.003, 0.016 - k * 0.002, 0.0065); cr.rotation.x = 0.35;
    }
    const plinth = add(lathe([[0.0001, -0.12], [0.1, -0.12], [0.104, -0.112], [0.096, -0.1], [0.094, -0.085], [0.0001, -0.085]], 48), M.brassDark, 0, 0, 0, tor);
    plinth.scale.z = 0.86;

    // ---------------- mechanism inside (torso-local, the cam shaft on the torso axis)
    const mech = new T3.Group(); tor.add(mech);
    const SH = { x: 0, z: 0.004 };
    const HF = 0.142;
    const CT = 0.0021, CG = 0.0033, TRIP = 3 * (CT + CG) + 0.0042;
    const noSh = (m) => { m.castShadow = false; return m; };
    noSh(add(new T3.CylinderGeometry(0.0024, 0.0024, 0.27, 10), M.steel, SH.x, 0.16, SH.z, mech));
    const stack = new T3.Group(); stack.position.set(SH.x, 0, SH.z); mech.add(stack);
    const FOLL = [
      { key: 'X', dir: v3.norm([-0.97, 0, 0.26]) },
      { key: 'Y', dir: v3.norm([0.75, 0, 0.66]) },
      { key: 'Z', dir: v3.norm([0.9, 0, -0.43]) },
    ];
    FOLL.forEach((f) => (f.alpha = Math.atan2(-f.dir[2], f.dir[0])));
    P.CAMS.forEach((cm, r) => {
      FOLL.forEach((f, j) => noSh(add(camGeo(cm[f.key], f.alpha, CT), M.camBrass, 0, r * TRIP + j * (CT + CG), 0, stack)));
      noSh(add(new T3.CylinderGeometry(0.0062, 0.0062, 0.0042, 18), M.brassDark, 0, r * TRIP + 3 * (CT + CG) - CG + 0.0021, 0, stack));
      for (let k = 0; k <= r; k++) noSh(add(new T3.SphereGeometry(0.0011, 8, 6), M.ruby, Math.cos(k * 0.5) * 0.0063, r * TRIP + 3 * (CT + CG) - CG + 0.0021, -Math.sin(k * 0.5) * 0.0063, stack));
    });
    noSh(add(new T3.CylinderGeometry(0.0072, 0.0072, 0.012, 18), M.brassDark, 0, -0.008, 0, stack));
    const followers = FOLL.map((f, j) => {
      const y = HF + j * (CT + CG) + CT * 0.5;
      const rod = noSh(add(new T3.CylinderGeometry(0.001, 0.001, 1, 8), M.steel, 0, 0, 0, mech)); rod.geometry.translate(0, 0.5, 0);
      const tip = noSh(add(new T3.ConeGeometry(0.0016, 0.0045, 8), M.steel, 0, 0, 0, mech));
      const guide = noSh(add(new T3.BoxGeometry(0.0075, 0.0065, 0.009), M.brass, 0, 0, 0, mech));
      const springC = new T3.CatmullRomCurve3(Array.from({ length: 50 }, (_, k) => new T3.Vector3(Math.cos(k * 1.1) * 0.0022, k / 49, Math.sin(k * 1.1) * 0.0022)));
      const spring = noSh(add(new T3.TubeGeometry(springC, 100, 0.0003, 4, false), M.steel, 0, 0, 0, mech));
      const crank = noSh(add(new T3.BoxGeometry(0.002, 0.018, 0.002), M.blued, 0, 0, 0, mech));
      const pull = noSh(add(new T3.CylinderGeometry(0.0006, 0.0006, 1, 6), M.steel, 0, 0, 0, mech)); pull.geometry.translate(0, 0.5, 0);
      const screw = noSh(add(new T3.CylinderGeometry(0.0013, 0.0013, 0.0016, 10), M.blued, 0, 0, 0, mech));
      return { f, y, rod, tip, guide, spring, crank, pull, screw };
    });
    const esc = new T3.Group(); esc.position.set(-0.019, 0.252, 0.03); mech.add(esc);
    const escW = noSh(add(gearGeo(15, 0.0092, 0.0014, { pointed: true, spokes: 4 }), M.camBrass, 0, 0, 0, esc));
    const anchor = noSh(add(new T3.TorusGeometry(0.0078, 0.0009, 6, 20, Math.PI * 0.75), M.blued, 0, 0.0105, 0.0016, esc));
    const pallets = [-1, 1].map((s) => noSh(add(new T3.BoxGeometry(0.0016, 0.0026, 0.0016), M.ruby, s * 0.0064, 0.0068, 0.0016, esc)));
    const bal = new T3.Group(); bal.position.set(0.034, 0.002, 0.004); esc.add(bal);
    noSh(add(new T3.TorusGeometry(0.0118, 0.0012, 8, 40), M.camBrass, 0, 0, 0, bal));
    for (let s = 0; s < 3; s++) { const sp = noSh(add(new T3.BoxGeometry(0.0008, 0.0236, 0.0008), M.camBrass, 0, 0, 0, bal)); sp.rotation.z = (s / 3) * Math.PI; }
    for (let s = 0; s < 8; s++) { const a = (s / 8) * TAU; noSh(add(new T3.SphereGeometry(0.0009, 6, 4), M.camBrass, Math.cos(a) * 0.0124, Math.sin(a) * 0.0124, 0, bal)); }
    const hs = []; for (let k = 0; k <= 140; k++) { const a = k * 0.2, r = 0.0012 + k * 0.000055; hs.push(new T3.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.0018)); }
    noSh(add(new T3.TubeGeometry(new T3.CatmullRomCurve3(hs), 280, 0.00017, 4, false), M.blued, 0, 0, 0, bal));
    noSh(add(new T3.BoxGeometry(0.06, 0.004, 0.002), M.brassEngr, 0.017, 0.0, 0.0045, esc));
    const train = new T3.Group(); mech.add(train);
    const gB = noSh(add(gearGeo(64, 0.026, 0.0035), M.brass, -0.024, 0.04, 0.03, train));
    const barrel = noSh(add(new T3.CylinderGeometry(0.021, 0.021, 0.016, 32), M.brassEngr, -0.024, 0.04, 0.02, train)); barrel.rotation.x = Math.PI / 2;
    const g2 = noSh(add(gearGeo(40, 0.0162, 0.003), M.camBrass, 0, 0, 0.03, train));
    g2.position.set(-0.024 + (0.026 + 0.0162) * Math.cos(0.55), 0.04 + (0.026 + 0.0162) * Math.sin(0.55), 0.03);
    const crown = noSh(add(gearGeo(36, 0.016, 0.0028), M.camBrass, SH.x, 0.078, SH.z, mech)); crown.rotation.x = -Math.PI / 2;
    const plate = noSh(add(new T3.CircleGeometry(0.075, 48), M.brassEngr, 0, 0.165, -0.04, mech)); plate.scale.set(1, 1.6, 1);
    for (const [x, y] of [[-0.058, 0.08], [0.058, 0.08], [-0.058, 0.25], [0.058, 0.25]]) { const pl = noSh(add(new T3.CylinderGeometry(0.002, 0.002, 0.075, 10), M.brassDark, x, y, -0.004, mech)); pl.rotation.x = Math.PI / 2; noSh(add(new T3.CylinderGeometry(0.0022, 0.0022, 0.0015, 10), M.blued, x, y, 0.034, mech)).rotation.x = Math.PI / 2; }
    const kp = surf(0, 0.04, 0.0);
    const esc2 = add(new T3.CylinderGeometry(0.0095, 0.0105, 0.0022, 32), M.brassEngr, kp[0], kp[1], kp[2] + 0.0006, tor); esc2.rotation.x = Math.PI / 2;
    add(new T3.TorusGeometry(0.0098, 0.0011, 8, 32), M.brass, kp[0], kp[1], kp[2] + 0.0017, tor);
    const keyG = new T3.Group(); keyG.position.set(kp[0], kp[1], kp[2] + 0.001); tor.add(keyG);
    add(new T3.CylinderGeometry(0.0021, 0.0021, 0.016, 12), M.steel, 0, 0, 0.008, keyG).rotation.x = Math.PI / 2; // the stem
    add(new T3.CylinderGeometry(0.0034, 0.0034, 0.003, 16), M.brass, 0, 0, 0.0035, keyG).rotation.x = Math.PI / 2; // collar
    add(new T3.SphereGeometry(0.0036, 14, 10), M.brass, 0, 0, 0.0165, keyG);
    for (const sd of [-1, 1]) {
      // each wing: a rounded lobe with a pierced hole, set edge-on to the coat (perpendicular to it)
      const wing = new T3.Shape();
      wing.moveTo(0, -0.0028); wing.bezierCurveTo(0.006, -0.0055, 0.0145, -0.0075, 0.0158, 0); wing.bezierCurveTo(0.0145, 0.0075, 0.006, 0.0055, 0, 0.0028); wing.lineTo(0, -0.0028);
      const hp = new T3.Path(); hp.absellipse(0.0102, 0, 0.0028, 0.0028, 0, TAU, true); wing.holes.push(hp);
      const wm = add(new T3.ExtrudeGeometry(wing, { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2 }), M.brass, 0, 0, 0.0185, keyG);
      wm.geometry.translate(0, 0, -0.0011); wm.rotation.set(Math.PI / 2, sd > 0 ? 0 : Math.PI, 0);
    }
    // ---------------- shoulders, neck, head
    for (const s of [-1, 1]) {
      const sp = at(s > 0 ? F.shoulderR : F.shoulderL);
      const sh = add(new T3.SphereGeometry(0.022, 24, 16), M.velvet, sp[0] - s * 0.004, sp[1] - 0.002, sp[2], tor);
      sh.scale.set(1.0, 0.85, 1.05);
    }
    const neckG = new T3.Group(); neckG.position.set(...at(F.neck)); tor.add(neckG);
    add(new T3.CylinderGeometry(0.0165, 0.018, 0.026, 20), M.porcelain, 0, 0.004, 0, neckG);
    add(new T3.CylinderGeometry(0.0195, 0.0195, 0.011, 20), M.ribbon, 0, -0.006, 0, neckG);
    const headG = new T3.Group(); headG.position.set(0, -0.002, 0.002); neckG.add(headG);
    const head = buildHead(M); headG.add(head.g);

    // ---------------- arms (world-space, posed each frame)
    const armRoot = new T3.Group(); root.add(armRoot);
    const sleeveU = lathe([[0.0001, 0], [0.0165, 0.0], [0.017, 0.12], [0.0152, 0.6], [0.0135, 0.92], [0.013, 1.0], [0.0001, 1.0]], 20);
    const sleeveF = lathe([[0.0001, 0], [0.0128, 0.0], [0.0122, 0.5], [0.0155, 0.6], [0.0185, 0.66], [0.019, 0.86], [0.017, 0.9], [0.0001, 0.9]], 20);
    const cuffBraid = new T3.TorusGeometry(0.0188, 0.0014, 6, 24);
    const ruff = lathe([[0.0098, -0.002], [0.0118, 0.004], [0.0142, 0.0105], [0.0152, 0.0145], [0.0138, 0.0142], [0.0098, 0.009]], 72);
    { const pa = ruff.attributes.position; for (let i = 0; i < pa.count; i++) { const x = pa.getX(i), z = pa.getZ(i), y = pa.getY(i); const a = Math.atan2(z, x); const k = 1 + 0.045 * Math.sin(a * 18) * clamp(y / 0.014, 0, 1); pa.setXYZ(i, x * k, y + 0.0008 * Math.sin(a * 18 + 1.0) * clamp(y / 0.014, 0, 1), z * k); } ruff.computeVertexNormals(); }
    const mk = (geo, mat) => add(geo, mat, 0, 0, 0, armRoot);
    const arm = () => ({
      upper: mk(sleeveU, M.velvet), fore: mk(sleeveF, M.velvet), elbow: mk(new T3.SphereGeometry(0.0138, 16, 12), M.velvet),
      braid: mk(cuffBraid, M.brass), ruff: mk(ruff, M.lace), wrist: mk(new T3.CylinderGeometry(0.0072, 0.0078, 1, 14).translate(0, 0.5, 0), M.porcelain),
    });
    const armR = arm(), armL = arm();
    const handR = buildHand(M, true); armRoot.add(handR.g);
    const handL = buildHand(M, false); armRoot.add(handL.g);
    return { shadowReceivers: [], tor, torG: hipG, mech, stack, followers, FOLL, SH, HF, CT, CG, TRIP, escW, anchor, pallets, bal, gB, g2, crown, barrel, keyG, neckG, headG, head, armR, armL, handR, handL, glass };
  }

  function buildHead(M) {
    const g = new T3.Group();
    const R0 = 0.06, CY = 0.06;
    const geo = new T3.SphereGeometry(R0, 64, 44);
    const pa = geo.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      const ny = y / R0;
      x *= 0.9; y *= 1.05;
      if (ny < 0) { const t = -ny; x *= 1 - 0.22 * t * t; z *= 1 - 0.12 * t * t; }
      if (z < 0 && ny > -0.55 && ny < 0.25) z *= 1.015;
      pa.setXYZ(i, x, y, z);
    }
    geo.computeVertexNormals();
    const face = new T3.Mesh(geo, M.face); face.castShadow = true; face.receiveShadow = true; face.position.y = CY; g.add(face);
    // eyes: glass beads under fixed porcelain lids; the beads turn toward the nib
    const eyes = [];
    const phiE = 0.36, thE = 0.075;
    for (const s of [-1, 1]) {
      const dphi = s * phiE;
      const p = new T3.Vector3(Math.sin(dphi) * Math.cos(thE) * R0 * 0.9, -Math.sin(thE) * R0 * 1.05, -Math.cos(dphi) * Math.cos(thE) * R0).multiplyScalar(0.9);
      const eg = new T3.Group(); eg.position.set(p.x, p.y + CY, p.z); eg.rotation.y = -dphi * 0.6; g.add(eg);
      const ball = new T3.Group(); eg.add(ball);
      ball.add(new T3.Mesh(new T3.SphereGeometry(0.0072, 20, 14), M.eyeWhite));
      const iris = new T3.Mesh(new T3.SphereGeometry(0.0054, 20, 12, 0, TAU, 0, 0.9), M.eye); iris.rotation.x = -Math.PI / 2; iris.position.z = -0.0024; ball.add(iris);
      const lid = new T3.Mesh(new T3.SphereGeometry(0.0078, 24, 12, 0, TAU, 0, 1.3), M.porcelain); lid.rotation.x = -0.62; eg.add(lid);
      const lidLo = new T3.Mesh(new T3.SphereGeometry(0.0076, 24, 8, 0, TAU, 0, 0.75), M.porcelain); lidLo.rotation.x = Math.PI + 0.55; eg.add(lidLo);
      eyes.push(ball);
    }
    const nose = new T3.Mesh(new T3.SphereGeometry(0.006, 14, 10), M.face); nose.scale.set(0.72, 1.1, 0.85); nose.position.set(0, CY - 0.014, -R0 * 1.005); g.add(nose);
    // the brass wig: an engraved cap, two rolls over each ear, a queue tied with a black bow
    const RC = R0 * 1.05;
    const capGeo = new T3.SphereGeometry(RC, 56, 30, 0, TAU, 0, 2.05);
    { const cp = capGeo.attributes.position; for (let i = 0; i < cp.count; i++) { let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i); x *= 0.93; y *= 1.04;
        const front = Math.max(0, -z / RC); const yy = y / (RC * 1.04);
        if (yy < 0.62) { const lift = front * front * (0.62 - yy) * 0.06; y += lift; z *= 1 - front * 0.06; }
        if (z > 0 && yy < 0.1) { z *= 1.05; }
        cp.setXYZ(i, x, y, z); } capGeo.computeVertexNormals(); }
    { const cp = capGeo.attributes.position; for (let i = 0; i < cp.count; i++) { let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
        const ang = Math.atan2(x / 0.93, -z); // 0 = straight ahead
        const fr = Math.cos(ang);
        // the hairline: high over the forehead, sweeping down to the temples and behind the ears
        const hl = RC * (fr > 0 ? lerp(0.12, 0.6, Math.pow(fr, 1.6)) : lerp(0.12, -0.5, Math.min(1, -fr * 1.6)));
        if (y < hl) { const yy = hl; const rr = Math.sqrt(Math.max(1e-8, RC * RC * 1.0 - (yy / 1.04) * (yy / 1.04))); const k = rr / Math.max(1e-6, Math.hypot(x / 0.93, z)); cp.setXYZ(i, x * k, yy, z * k); } }
      capGeo.computeVertexNormals(); }
    const cap = new T3.Mesh(capGeo, M.brassHair); cap.position.y = CY + 0.002; cap.castShadow = true; g.add(cap);
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const roll = new T3.Mesh(new T3.CapsuleGeometry(0.0098 - k * 0.0012, 0.03 - k * 0.004, 6, 14), M.brassHair); roll.rotation.x = Math.PI / 2; roll.position.set(s * (R0 * 0.86 + 0.002 - k * 0.002), CY - 0.006 - k * 0.019, 0.01); roll.castShadow = true; g.add(roll);
    }
    const queue = new T3.Mesh(lathe([[0.0001, 0.006], [0.0105, 0.0], [0.0095, -0.04], [0.004, -0.056], [0.0001, -0.058]], 16), M.brassHair); queue.position.set(0, CY - 0.03, R0 * 0.98); queue.rotation.x = 0.22; g.add(queue);
    const wrap = new T3.Mesh(new T3.CylinderGeometry(0.0115, 0.0115, 0.008, 20), M.ribbon); wrap.position.set(0, CY - 0.03, R0 * 0.98); wrap.rotation.x = 0.22; g.add(wrap);
    for (const s of [-1, 1]) { const tail = new T3.Mesh(new T3.BoxGeometry(0.007, 0.03, 0.0012), M.ribbon); tail.position.set(s * 0.004, CY - 0.05, R0 * 1.03); tail.rotation.set(0.25, 0, s * 0.18); g.add(tail); }
    return { g, eyes };
  }

  // the writing hand is authored in the quill frame (x = scribe's right, y = along the quill, z = under it)
  function buildHand(M, holdsQuill) {
    const g = new T3.Group();
    const mat = M.porcelain;
    const ell = (c, r, rot) => { const m = new T3.Mesh(new T3.SphereGeometry(1, 22, 16), mat); m.scale.set(...r); m.position.set(...c); if (rot) m.rotation.set(...rot); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
    const pin = new T3.SphereGeometry(1, 10, 8);
    const fing = (pts, r0, r1) => {
      for (let k = 0; k < pts.length - 1; k++) capsule(pts[k], pts[k + 1], lerp(r0, r1, k / Math.max(1, pts.length - 2)), mat, g);
      if (holdsQuill) for (let k = 0; k < pts.length - 1; k++) { const m = new T3.Mesh(pin, M.brass); const rr = lerp(r0, r1, k / Math.max(1, pts.length - 2)) * 0.62; m.scale.set(rr, rr, rr); m.position.set(...pts[k]); g.add(m); }
    };
    if (holdsQuill) {
      ell([0.015, 0.038, 0.009], [0.0145, 0.0175, 0.0082], [0.25, 0.1, -0.3]);
      fing([[0.011, 0.03, -0.005], [0.004, 0.016, -0.0085], [-0.0008, 0.002, -0.006]], 0.0041, 0.0035); // index on top of the quill
      fing([[-0.002, 0.033, 0.014], [-0.0085, 0.019, 0.0065], [-0.0062, 0.006, 0.0005]], 0.0046, 0.0039); // thumb on its left
      fing([[0.016, 0.027, 0.004], [0.0125, 0.013, 0.0095], [0.0045, 0.003, 0.0045]], 0.004, 0.0034); // middle under it
      fing([[0.02, 0.027, 0.008], [0.0205, 0.018, 0.0145], [0.015, 0.012, 0.017]], 0.0038, 0.0032); // ring, curled
      fing([[0.022, 0.027, 0.012], [0.0235, 0.02, 0.0175], [0.0185, 0.016, 0.022]], 0.0033, 0.0029); // little, curled
    } else {
      // resting palm-down on the desk: local y up, fingers toward -z, thumb toward +x
      ell([0, 0.0065, 0], [0.0135, 0.0068, 0.0165]);
      [[-0.0102, 0.018], [-0.0034, 0.021], [0.0034, 0.0205], [0.0102, 0.0165]].forEach(([x, l], k) => {
        fing([[x, 0.0064, -0.011], [x * 1.02, 0.0052, -0.011 - l * 0.55], [x * 1.04, 0.0036, -0.011 - l]], 0.0036, 0.0032);
      });
      fing([[0.013, 0.0064, 0.0], [0.0185, 0.0048, -0.009], [0.0185, 0.0036, -0.017]], 0.0038, 0.0034);
    }
    return { g };
  }

  // ------------------------------------------------------------------ posing at T
  const _m = new T3.Matrix4();
  // candle flicker: periodic in the bar (1.6 s) so the last bar loops
  function flicker(T) {
    const w = TAU / P.BAR;
    return 1 + 0.05 * Math.sin(w * 3 * T + 0.4) + 0.04 * Math.sin(w * 7 * T + 1.3) + 0.025 * Math.sin(w * 13 * T + 2.1) + 0.015 * Math.sin(w * 23 * T);
  }
  function poseArm(A, S, E, W, HP) {
    between(A.upper, S, E);
    const d = v3.sub(W, E), L = v3.len(d), u = v3.mul(d, 1 / L);
    between(A.fore, E, v3.add(E, v3.mul(u, (L / 0.9) * 0.9)));
    A.elbow.position.set(...E);
    const qd = new T3.Quaternion().setFromUnitVectors(_up, V(u));
    A.braid.position.set(...v3.add(E, v3.mul(u, L * 0.63)));
    A.braid.quaternion.copy(qd).multiply(new T3.Quaternion().setFromAxisAngle(new T3.Vector3(1, 0, 0), Math.PI / 2));
    A.ruff.position.set(...v3.add(E, v3.mul(u, L * 0.875)));
    A.ruff.quaternion.copy(qd);
    const w0 = v3.add(E, v3.mul(u, L * 0.88));
    between(A.wrist, w0, HP || v3.add(W, v3.mul(u, 0.012)));
  }

  function update(T) {
    const F = R.fig;
    const st = P.state(T);
    const ps = P.pose(st);
    F.torG.rotation.set(0, 0, 0);
    F.torG.rotateY(ps.yaw);
    F.torG.rotateX(ps.lean);
    const theta = TAU * P.shaft(T);
    const lvl = P.stackLevel(T);
    F.stack.rotation.y = theta;
    F.stack.position.y = F.HF - lvl * F.TRIP;
    const rr = { X: st.rX, Y: st.rY, Z: st.rZ };
    F.followers.forEach((fo) => {
      const d = fo.f.dir, r = rr[fo.f.key], y = fo.y;
      const pt = (rad) => [F.SH.x + d[0] * rad, y, F.SH.z + d[2] * rad];
      const L = fo.f.key === 'Y' ? 0.028 : 0.034;
      between(fo.rod, pt(r + 0.0035), pt(r + L));
      fo.tip.position.set(...pt(r + 0.00225));
      fo.tip.quaternion.setFromUnitVectors(_up, new T3.Vector3(-d[0], 0, -d[2]));
      const gR = fo.f.key === 'Y' ? 0.045 : 0.05;
      fo.guide.position.set(...pt(gR));
      fo.guide.quaternion.setFromUnitVectors(new T3.Vector3(0, 0, 1), new T3.Vector3(d[0], 0, d[2]));
      between(fo.spring, pt(gR + 0.0045), pt(r + L - 0.001));
      const o = pt(r + L);
      const lift = (r - 0.031) * 1.4;
      fo.crank.position.set(o[0], y + 0.007, o[2]);
      fo.crank.rotation.set(0, Math.atan2(d[0], d[2]), (r - 0.031) * 14);
      fo.screw.position.set(o[0], y, o[2]);
      between(fo.pull, [o[0], y + 0.015 + lift, o[2]], [o[0] * 0.7, 0.3, o[2] * 0.7 + 0.004]);
    });
    const ticks = P.tickCount(T);
    F.escW.rotation.z = -ticks * (TAU / 30);
    const runE = T > P.T_RUN && T < P.T_STOP + 0.35;
    const amp = T < P.T_STOP ? sstep(P.T_RUN, P.T_RUN + 0.2, T) : Math.max(0, 1 - (T - P.T_STOP) / 0.35);
    const swing = runE ? Math.sin(((T - P.T_RUN) / (2 * P.E8)) * TAU) * amp : 0;
    F.bal.rotation.z = swing * 2.4;
    const rock = Math.max(-1, Math.min(1, swing * 3)) * 0.13;
    F.anchor.rotation.z = rock;
    F.pallets.forEach((p, k) => { const s = k ? 1 : -1; p.position.set(s * 0.0064 * Math.cos(rock) - 0.0068 * Math.sin(rock), 0.0068 * Math.cos(rock) + s * 0.0064 * Math.sin(rock), 0.0016); p.rotation.z = rock; });
    F.crown.rotation.z = theta;
    F.g2.rotation.z = theta * (36 / 40) * 3;
    F.gB.rotation.z = -F.g2.rotation.z * (40 / 64) + 0.05;
    F.barrel.rotation.y = F.gB.rotation.z;
    F.keyG.rotation.z = P.keyAngle(T);
    F.torG.updateMatrixWorld(true);
    const headW = new T3.Vector3(); F.headG.getWorldPosition(headW);
    const toNib = V(ps.P).sub(headW);
    const yaw = Math.atan2(-toNib.x, -toNib.z);
    const pitch = Math.atan2(-toNib.y, Math.hypot(toNib.x, toNib.z));
    F.headG.rotation.set(-(pitch * 0.55) + 0.12 - ps.lean, yaw * 0.55 - ps.yaw, 0, 'YXZ');
    F.head.eyes.forEach((e) => e.rotation.set(-0.25 - pitch * 0.35, yaw * 0.35, 0));
    _m.makeBasis(V(ps.X), V(ps.q), V(ps.Z));
    F.handR.g.quaternion.setFromRotationMatrix(_m);
    F.handR.g.position.set(...ps.G);
    poseArm(F.armR, ps.S, ps.E, ps.W, P.fromHand(ps.G, { q: ps.q, X: ps.X, Z: ps.Z }, [0.016, 0.05, 0.013]));
    R.quill.position.set(...ps.P);
    R.quill.quaternion.setFromRotationMatrix(_m);
    const SL = P.torsoXf(P.FIG.shoulderL, ps.lean, ps.yaw);
    const WL = [-0.146, 0.016, 0.124];
    const ikL = P.ik2(SL, WL, P.FIG.upper, P.FIG.fore, v3.norm([-0.9, -0.5, 0.2]));
    poseArm(F.armL, SL, ikL.E, ikL.W);
    F.handL.g.position.set(-0.142, 0.0, 0.1);
    F.handL.g.rotation.set(0, -0.35, 0);
    R.ink.uT.value = T;
    const fl = flicker(T);
    R.candleSpot.intensity = 0.95 * fl;
    R.candleFill.intensity = 0.025 * fl;
    R.flame.scale.set(1, 0.94 + 0.1 * (fl - 1) * 4, 1);
    R.flame.rotation.z = 0.06 * Math.sin((TAU / P.BAR) * 5 * T);
    return { st, ps };
  }

  // ------------------------------------------------------------------ render
  function render(ctx, T, cs) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (!R || R.W !== cw || R.H !== ch) build(cw, ch);
    const out = update(T);
    const c = R.cam;
    c.fov = cs.fov || 30;
    c.aspect = cw / ch;
    c.position.set(...cs.pos);
    if (cs.up) c.up.set(cs.up[0], cs.up[1], cs.up[2]); else c.up.set(0, 1, 0);
    c.lookAt(V(cs.look));
    if (cs.roll) c.rotateZ(cs.roll);
    c.near = cs.near || 0.01; c.far = 12;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
    let focus = cs.focus;
    if (focus === 'nib') focus = out.ps.P;
    if (Array.isArray(focus)) { const v = V(focus).applyMatrix4(c.matrixWorldInverse); focus = -v.z; }
    R.inner.intensity = cs.inner == null ? 0.0 : cs.inner;
    R.backLamp.intensity = cs.back == null ? 0.0 : cs.back;
    if (cs.backAt) R.backLamp.target.position.set(cs.backAt[0], cs.backAt[1], cs.backAt[2]); else R.backLamp.target.position.set(0.0, 0.0, 0.3);
    if (cs.backFrom) R.backLamp.position.set(cs.backFrom[0], cs.backFrom[1], cs.backFrom[2]); else R.backLamp.position.set(0.06, 0.52, 0.72);
    R.backLamp.target.updateMatrixWorld();
    const td = cs.envTop || [0.15, 1.0, 0.35]; ENV.topDir.value.set(td[0], td[1], td[2]).normalize(); ENV.topI.value = cs.envTopI == null ? 1 : cs.envTopI; ENV.candI.value = cs.envCand == null ? 1 : cs.envCand;
    R.inner.position.set(0, 0.05, 0.33);
    const rd = R.renderer;
    const TG = R.targets(cs.rscale || 0.8);
    rd.setRenderTarget(TG.scene);
    rd.render(R.scene, c);
    const aper = (cs.fstop == null ? 1 : cs.fstop) * 0.01;
    const setDof = (u) => { u.uNear.value = c.near; u.uFar.value = c.far; u.uFocus.value = focus || 0.5; u.uAper.value = aper; u.uMax.value = (cs.maxBlur || 18) * TG.h / ch; u.uRes.value.set(TG.w, TG.h); };
    const dm = R.dofMat;
    dm.uniforms.tC.value = TG.scene.texture; dm.uniforms.tD.value = TG.scene.depthTexture; setDof(dm.uniforms);
    R.quad.material = dm; rd.setRenderTarget(TG.half); rd.render(R.qScene, R.qCam);
    R.copyMat.uniforms.tC.value = TG.half.texture;
    R.quad.material = R.copyMat; rd.setRenderTarget(TG.bloomRT); rd.render(R.qScene, R.qCam);
    TG.bloom.strength = cs.bloom == null ? 0.45 : cs.bloom;
    TG.bloom.render(rd, null, TG.bloomRT, 0, false);
    const fm = R.finalMat;
    fm.uniforms.tC.value = TG.scene.texture; fm.uniforms.tD.value = TG.scene.depthTexture; fm.uniforms.tHalf.value = TG.half.texture; fm.uniforms.tBloom.value = TG.bloomRT.texture;
    setDof(fm.uniforms);
    fm.uniforms.uExp.value = cs.exposure || 1;
    fm.uniforms.uFrame.value = Math.floor(T * 30 + 1e-6) % 997;
    fm.uniforms.uVig.value = cs.vignette == null ? 0.55 : cs.vignette;
    fm.uniforms.uFade.value = cs.fade == null ? 1 : cs.fade;
    fm.uniforms.uWarm.value = cs.warm || 0;
    R.quad.material = fm; rd.setRenderTarget(null); rd.render(R.qScene, R.qCam);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(R.cvs, 0, 0, cw, ch);
    ctx.restore();
    return out;
  }

  // ------------------------------------------------------------------ camera helpers for the scenes
  // the nib position averaged over a window (a steadier aim for the camera than the raw nib)
  function nibAvg(T, win, n) {
    n = n || 9; win = win || 0.4;
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < n; k++) { const t = T + (k / (n - 1) - 0.5) * win; const p = P.pose(P.state(t)).P; x += p[0]; y += p[1]; z += p[2]; }
    return [x / n, y / n, z / n];
  }
  function nib(T) { return P.pose(P.state(T)).P; }
  // Catmull-Rom through key vectors at times ts (clamped), eased per segment by 'ease' (0 = linear)
  function spline(keys, ts, t) {
    const n = keys.length;
    if (t <= ts[0]) return keys[0].slice();
    if (t >= ts[n - 1]) return keys[n - 1].slice();
    let i = 0; while (i < n - 2 && t > ts[i + 1]) i++;
    let u = (t - ts[i]) / (ts[i + 1] - ts[i]);
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(n - 1, i + 2)];
    return p1.map((_, c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * u + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * u * u + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * u * u * u));
  }
  const mixv = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
  const ease5 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * t * (t * (t * 6 - 15) + 10));
  const PAGE_UP = [-Math.sin(P.PAGE_PSI), 0, -Math.cos(P.PAGE_PSI)];

  // world anchors (after posing at T): the key, the cam stack at the follower height, the escapement, the head
  function ensure(ctx) { const cw = ctx.canvas.width, ch = ctx.canvas.height; if (!R || R.W !== cw || R.H !== ch) build(cw, ch); }
  function anchor(T, name) {
    update(T);
    const F = R.fig; F.torG.updateMatrixWorld(true);
    const v = new T3.Vector3();
    if (name === 'key') F.keyG.getWorldPosition(v);
    else if (name === 'stack') { v.set(F.SH.x, F.HF + 0.006, F.SH.z); F.mech.localToWorld(v); }
    else if (name === 'escape') { F.bal.getWorldPosition(v); }
    else if (name === 'head') { F.headG.getWorldPosition(v); v.y += 0.06; }
    else if (name === 'window') { v.set(0, 0.168, 0.06); F.tor.localToWorld(v); }
    return [v.x, v.y, v.z];
  }
  FILM.cast = { render, update, ensure, anchor, nib, nibAvg, spline, mixv, ease, ease5, PAGE_UP, get R() { return R; } };
})();
