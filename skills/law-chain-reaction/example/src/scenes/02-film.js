/*
 * 02-film.js : ONE continuous camera take over the desk, the render pipeline and the shot registry.
 *
 * Camera: the target is the physics' "action point" (where the cause is right now), smoothed with a
 * Gaussian over time and led slightly ahead (anticipation); the eye sits on a keyframed offset from it.
 * Pipeline: scene -> HDR target (MSAA, depth) -> half-res gather depth of field -> composite
 * (DOF mix, neutral tone map, warm grade, vignette, grain) -> 2D canvas 1:1.
 * Shots in the timeline are bar-long labels on the same take (cuts are invisible: one camera).
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const CR = FILM.CR;
  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
  const tn = CR.tn, N = CR.N;

  // ================================================================== the action point A(T)
  const L = CR.L;
  const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  function waveX(T) {
    // x of the domino being knocked right now (between grid hits)
    const H = CR.line.hits;
    if (T <= H[1]) return L.heroX - 1;
    for (let k = 1; k < H.length - 1; k++) if (T < H[k + 1]) return L.heroX - lerp(CR.line.d[k].p, CR.line.d[k + 1].p, (T - H[k]) / (H[k + 1] - H[k]));
    return L.heroX - CR.line.d[CR.line.n - 1].p - (T - H[H.length - 1]) * 6;
  }
  function action(T) {
    const y0 = L.riser.y;
    const heroC = [L.heroX + 1.0, y0 + 5.2, L.lineZ];
    if (T < tn(N.tap) + 0.2) return heroC;
    if (T < tn(N.marble)) return lerp3(heroC, [waveX(T), y0 + 4.4, L.lineZ - 1.5], sstep(tn(N.tap) + 0.2, tn(N.heroHit) + 0.3, T));
    if (T < CR.M.tLand) { const m = CR.M.pos(T); return [m.x, m.y, m.z]; }
    const LV = CR.LV;
    const leverMid = [LV.px - LV.arm * 0.55, LV.py + 3.0, LV.z + 2];
    const catC = [CR.CP.x, 4.5, -24];
    if (T < LV.tImp) return lerp3(leverMid, catC, sstep(6.75, 7.3, T));
    const cpEnd = [CR.CP.x, 4, CR.CP.fz + CR.CP.long];
    const slot = CR.PG.slot();
    const mid = [(cpEnd[0] + slot.x) / 2, (cpEnd[1] + slot.y) / 2, (cpEnd[2] + slot.z) / 2];
    if (T < CR.COIN.tA + 0.1) { const c = CR.COIN.pos(Math.max(T, CR.COIN.tL)); return lerp3(mid, [c.x, c.y, c.z], 0.25); }
    if (T < tn(N.plane)) {
      const pig = [CR.PG.x, 7, (CR.PG.z + CR.FAN.z) / 2];
      const fan = [CR.FAN.x + 6, 9, CR.FAN.z];
      return lerp3(pig, fan, sstep(tn(N.button) - 0.1, tn(N.plane), T));
    }
    if (T < tn(N.phone)) { const p = CR.PL.pose(T).p; return [p[0], p[1], p[2]]; }
    if (T < tn(N.stick)) { const tr = [CR.FD.trigX, 3.5, CR.FD.zOff + CR.field.d[0].p]; return lerp3([CR.PH.center.x, CR.PH.center.y + 1.5, CR.PH.center.z], tr, sstep(tn(N.phone) + 0.25, tn(N.trigger) + 0.1, T)); }
    const fc = [0, 2, CR.FD.rowZ(4)];
    const trig = [CR.FD.trigX - 6, 3, CR.FD.zOff + CR.field.d[1].p];
    if (T < tn(N.row0)) return lerp3(trig, fc, sstep(tn(N.stick), tn(N.row0), T));
    const fin = [0, 0, 9.5];
    return lerp3(fc, fin, sstep(tn(N.row0 + 4), CR.BN.tStop, T));
  }
  // Gaussian-smoothed, slightly anticipating
  function smoothAction(T, sigma, lead) {
    const n = 15; let sx = 0, sy = 0, sz = 0, ws = 0;
    for (let i = -n; i <= n; i++) {
      const u = (i / n) * 2.5 * sigma;
      const w = Math.exp(-0.5 * (u / sigma) * (u / sigma));
      const a = action(clamp(T + lead + u, 0, CR.DUR));
      sx += a[0] * w; sy += a[1] * w; sz += a[2] * w; ws += w;
    }
    return [sx / ws, sy / ws, sz / ws];
  }

  // ================================================================== camera keyframes: offset eye - target, focus, aperture
  // t, offset [dx, dy, dz], aperture (px of blur at infinity), sigma (s), lead (s)
  const K = [
    [0.0, [19.0, 2.5, 9.5], 30, 0.10, 0.0],
    [1.0, [18.0, 2.6, 9.0], 30, 0.10, 0.0],
    [1.6, [8.0, 8.0, 11.0], 28, 0.25, 0.15],
    [2.5, [-10.0, 9.0, 11.5], 26, 0.3, 0.2],
    [3.3, [-13.0, 10.0, 14.0], 24, 0.3, 0.2],
    [4.6, [-11.0, 14.0, 27.0], 22, 0.35, 0.2],
    [5.9, [-8.0, 13.0, 27.0], 22, 0.3, 0.15],
    [6.6, [-2.0, 17.0, 50.0], 18, 0.3, 0.0],
    [7.25, [-44.0, 24.0, 42.0], 12, 0.22, 0.0],
    [7.75, [-44.0, 22.0, 38.0], 12, 0.2, 0.0],
    [8.3, [-34.0, 12.0, 6.0], 18, 0.22, 0.0],
    [8.56, [-14.0, 17.0, 36.0], 18, 0.2, 0.0],
    [8.82, [12.0, 11.0, 30.0], 20, 0.2, 0.0],
    [9.3, [-4.0, 10.0, 26.0], 20, 0.16, 0.0],
    [9.9, [-16.0, 10.0, 24.0], 18, 0.14, 0.0],
    [10.4, [-18.0, 10.0, 22.0], 18, 0.14, 0.0],
    [10.9, [-11.0, 9.0, 25.0], 22, 0.13, 0.0],
    [11.4, [-5.0, 11.0, 27.0], 22, 0.15, 0.0],
    [11.85, [-5.0, 30.0, 25.0], 16, 0.18, 0.0],
    [12.25, [-3.0, 38.0, 42.0], 14, 0.25, 0.1],
    [12.8, [0.0, 55.0, 72.0], 10, 0.3, 0.1],
    [14.0, [0.0, 94.0, 86.0], 5, 0.35, 0.05],
    [15.6, [0.0, 100.0, 84.0], 3, 0.4, 0.0],
    [16.3, [0.0, 100.0, 84.0], 3, 0.4, 0.0],
    [16.9, [0.0, 100.0, 84.0], 3, 0.4, 0.0],
    [19.3, [0.0, 100.0, 84.0], 3, 0.4, 0.0],
  ];




  function catmullScalar(vals, ts, T) {
    let i = 0;
    while (i < ts.length - 2 && T > ts[i + 1]) i++;
    const t0 = ts[i], t1 = ts[i + 1];
    const u = clamp((T - t0) / (t1 - t0), 0, 1);
    const e = u * u * (3 - 2 * u) * 0.5 + u * 0.5; // gentle ease inside each segment
    const p0 = vals[Math.max(0, i - 1)], p1 = vals[i], p2 = vals[i + 1], p3 = vals[Math.min(vals.length - 1, i + 2)];
    const r = e;
    return 0.5 * (2 * p1 + (-p0 + p2) * r + (2 * p0 - 5 * p1 + 4 * p2 - p3) * r * r + (-p0 + 3 * p1 - 3 * p2 + p3) * r * r * r);
  }
  const KT = K.map((k) => k[0]);
  const kv = (f) => K.map(f);
  const OX = kv((k) => k[1][0]), OY = kv((k) => k[1][1]), OZ = kv((k) => k[1][2]), AP = kv((k) => k[2]), SG = kv((k) => k[3]), LD = kv((k) => k[4]);
  function cameraAt(T) {
    const sigma = catmullScalar(SG, KT, T), lead = catmullScalar(LD, KT, T);
    const tgt = smoothAction(T, Math.max(0.05, sigma), lead);
    // after the banner stops the take settles: target and eye freeze (the last bar loops)
    const off = [catmullScalar(OX, KT, T), catmullScalar(OY, KT, T), catmullScalar(OZ, KT, T)];
    const eye = [tgt[0] + off[0], tgt[1] + off[1], tgt[2] + off[2]];
    return { eye, tgt, ap: catmullScalar(AP, KT, T) };
  }
  CR.cameraAt = cameraAt; CR.action = action;

  // ================================================================== renderer
  let R = null;
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const DOF_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tColor; uniform sampler2D tDepth;
    uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAp, uMaxR;
    float vdist(vec2 uv){ float d = texture2D(tDepth, uv).x; return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
    float coc(float z){ return min(uMaxR, uAp * abs(1.0 - uFocus / z)); }
    void main(){
      float zc = vdist(vUv); float cc = coc(zc);
      vec3 acc = texture2D(tColor, vUv).rgb; float ws = 1.0; float cw = cc;
      // interleaved gradient noise: an even, low-discrepancy rotation per pixel (no blotches, no speckle)
      float rot = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715)))) * 2.39996323;
      for (int i = 0; i < 30; i++) {
        float fi = float(i) + 0.5;
        float r = sqrt(fi / 30.0) * uMaxR;
        float a = fi * 2.39996323 + rot;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uRes;
        vec3 c = texture2D(tColor, uv).rgb;
        float zs = vdist(uv); float cs = coc(zs);
        float ce = zs > zc ? min(cs, cc) : cs;
        float w = clamp(ce - r + 1.0, 0.0, 1.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        w *= 1.0 + 1.2 * smoothstep(1.0, 3.5, l);
        acc += c * w; ws += w; cw += cs * w;
      }
      // coverage: a blurred foreground spilling over a sharp pixel switches it to the blurred image
      gl_FragColor = vec4(acc / ws, max(cc, cw / ws));
    }`;
  const COMP_FS = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D tSharp; uniform sampler2D tBlur; uniform sampler2D tDepth;
    uniform vec2 uRes; uniform float uNear, uFar, uFocus, uAp, uMaxR, uExp, uFrame, uVig;
    float vdist(vec2 uv){ float d = texture2D(tDepth, uv).x; return (uNear * uFar) / (uFar - d * (uFar - uNear)); }
    vec3 neutral(vec3 color){
      const float startCompression = 0.8 - 0.04; const float desaturation = 0.15;
      float x = min(color.r, min(color.g, color.b));
      float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
      color -= offset;
      float peak = max(color.r, max(color.g, color.b));
      if (peak < startCompression) return color;
      float d = 1.0 - startCompression;
      float newPeak = 1.0 - d * d / (peak + d - startCompression);
      color *= newPeak / peak;
      float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
      return mix(color, vec3(newPeak), g);
    }
    vec3 aces(vec3 x){ x *= 0.6; return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    float luma(vec3 c){ return sqrt(dot(c, vec3(0.299, 0.587, 0.114)) * 1.4); }
    vec3 fxaa(vec2 uv){
      vec2 px = 1.0 / uRes;
      vec3 nw = texture2D(tSharp, uv + vec2(-0.5, -0.5) * px).rgb, ne = texture2D(tSharp, uv + vec2(0.5, -0.5) * px).rgb;
      vec3 sw = texture2D(tSharp, uv + vec2(-0.5, 0.5) * px).rgb, se = texture2D(tSharp, uv + vec2(0.5, 0.5) * px).rgb;
      vec3 m = texture2D(tSharp, uv).rgb;
      float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(m);
      float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
      float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
      if (lMax - lMin < max(0.0312, lMax * 0.125)) return m;
      vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
      float red = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
      float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);
      dir = clamp(dir * rcp, -8.0, 8.0) * px;
      vec3 a = 0.5 * (texture2D(tSharp, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tSharp, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
      vec3 b = a * 0.5 + 0.25 * (texture2D(tSharp, uv - dir * 0.5).rgb + texture2D(tSharp, uv + dir * 0.5).rgb);
      float lb = luma(b);
      return (lb < lMin || lb > lMax) ? a : b;
    }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    vec3 srgb(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main(){
      vec2 d = vUv - 0.5;
      vec3 sharp = fxaa(vUv);
      vec4 bl = texture2D(tBlur, vUv);
      float z = vdist(vUv);
      float c = min(uMaxR, uAp * abs(1.0 - uFocus / z));
      float k = smoothstep(0.35, 1.6, max(c, bl.a));
      vec3 col = mix(sharp, bl.rgb, k);
      // soft glow: bright parts of the half-res image spread in two rings (phone screen, glints)
      vec3 glow = vec3(0.0);
      for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5236 + 0.26;
        vec2 o = vec2(cos(a), sin(a)) / uRes;
        vec3 g1 = texture2D(tBlur, vUv + o * (i < 6 ? 7.0 : 16.0)).rgb;
        glow += max(g1 - 0.85, 0.0) * 1.0;
      }
      col = (col + glow * 0.045) * uExp;
      col = aces(col);
      // grade: warm highlights, violet-lifted shadows (brand night)
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(1.04, 0.99, 0.93), smoothstep(0.3, 0.9, lum));
      col += vec3(0.010, 0.0, 0.022) * (1.0 - smoothstep(0.0, 0.25, lum));
      // vignette
      float v = 1.0 - uVig * smoothstep(0.25, 0.95, length(d * vec2(1.25, 1.0)));
      col *= v;
      // grain
      float g = h(vUv * uRes + vec2(uFrame * 17.0, uFrame * 31.0)) - 0.5;
      col += g * 0.018 * (0.4 + 0.6 * (1.0 - lum));
      gl_FragColor = vec4(srgb(clamp(col, 0.0, 1.0)), 1.0);
    }`;

  function init(w, h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, alpha: false });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    const S = CR.W.build(renderer);
    const cam = new THREE.PerspectiveCamera(30, w / h, 1, 1500);
    const depthTexture = new THREE.DepthTexture(w, h); depthTexture.type = THREE.UnsignedIntType;
    const rtMain = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0, depthTexture });
    const hw = Math.max(2, Math.round(w / 2)), hh = Math.max(2, Math.round(h / 2));
    const rtHalf = new THREE.WebGLRenderTarget(hw, hh, { type: THREE.HalfFloatType, depthBuffer: false });
    const quadG = new THREE.PlaneGeometry(2, 2);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const dofM = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: DOF_FS, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: rtMain.texture }, tDepth: { value: depthTexture }, uRes: { value: new THREE.Vector2(hw, hh) }, uNear: { value: 1 }, uFar: { value: 1500 }, uFocus: { value: 30 }, uAp: { value: 10 }, uMaxR: { value: 16 } } });
    const compM = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: COMP_FS, depthTest: false, depthWrite: false,
      uniforms: { tSharp: { value: rtMain.texture }, tBlur: { value: rtHalf.texture }, tDepth: { value: depthTexture }, uRes: { value: new THREE.Vector2(w, h) }, uNear: { value: 1 }, uFar: { value: 1500 }, uFocus: { value: 30 }, uAp: { value: 10 }, uMaxR: { value: 32 }, uExp: { value: 1.45 }, uFrame: { value: 0 }, uVig: { value: 0.42 } } });
    const dofScene = new THREE.Scene(); dofScene.add(new THREE.Mesh(quadG, dofM));
    const compScene = new THREE.Scene(); compScene.add(new THREE.Mesh(quadG, compM));
    // compile every program up front (no first-touch stalls mid-film)
    renderer.compile(S.scene, cam);
    R = { canvas, renderer, S, cam, rtMain, rtHalf, dofM, compM, dofScene, compScene, ortho, w, h };
    CR._R = R;
    renderer.info.autoReset = false;
  }

  function render(T) {
    const c = FILM.canvas;
    const w = c.width, h = c.height;
    if (!R || R.w !== w || R.h !== h) init(w, h);
    const { renderer, S, cam } = R;
    renderer.info.reset();
    CR.W.update(T);
    const cv = cameraAt(T);
    cam.position.set(cv.eye[0], cv.eye[1], cv.eye[2]);
    cam.up.set(0, 1, 0);
    cam.lookAt(cv.tgt[0], cv.tgt[1], cv.tgt[2]);
    cam.updateMatrixWorld(true);
    const focus = Math.hypot(cv.eye[0] - cv.tgt[0], cv.eye[1] - cv.tgt[1], cv.eye[2] - cv.tgt[2]);
    // key light + shadow frustum fitted around the target (deterministic per T)
    const span = clamp(focus * 1.1, 26, 150);
    S.key.position.set(cv.tgt[0] + 0.5 * 200, cv.tgt[1] + 200, cv.tgt[2] + 0.62 * 200);
    S.key.target.position.set(cv.tgt[0], cv.tgt[1], cv.tgt[2]);
    S.key.target.updateMatrixWorld();
    // soft frontal fill riding with the camera (product-shot fill), slightly above the lens
    S.fill.position.set(cv.eye[0] * 2 - cv.tgt[0], cv.eye[1] * 2 - cv.tgt[1] + 30, cv.eye[2] * 2 - cv.tgt[2]);
    S.fill.target.position.set(cv.tgt[0], cv.tgt[1], cv.tgt[2]); S.fill.target.updateMatrixWorld();
    const sc = S.key.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 20; sc.far = 520;
    sc.updateProjectionMatrix();
    // scale the PCF softness with the frustum so close-ups get crisp contact shadows
    S.key.shadow.radius = clamp(span / 18, 1.5, 4);
    renderer.setRenderTarget(R.rtMain);
    renderer.render(S.scene, cam);
    // depth of field (half res) + composite
    const sx = h / 1080;
    const ap = cv.ap * sx;
    const maxR = clamp(ap, 2, 40 * sx);
    const du = R.dofM.uniforms;
    du.uFocus.value = focus; du.uAp.value = ap / 2; du.uMaxR.value = Math.max(1, maxR / 2);
    renderer.setRenderTarget(R.rtHalf);
    renderer.render(R.dofScene, R.ortho);
    const cu = R.compM.uniforms;
    cu.uFocus.value = focus; cu.uAp.value = ap; cu.uMaxR.value = maxR;
    cu.uFrame.value = Math.floor(T * 30 + 1e-6) % 997;
    renderer.setRenderTarget(null);
    renderer.render(R.compScene, R.ortho);
    return R.canvas;
  }
  CR.render = render;

  function draw(ctx, t, info) {
    const cv = render((FILM.TIMELINE.heroT || 0) + info.T);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  }
  for (const s of FILM.TIMELINE.shots) FILM.scene({ id: s.id, draw });
})();
