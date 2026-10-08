/*
 * 01-world.js : the office desk and the machine on it, built once with three.js (global THREE),
 * posed every frame from FILM.CR physics (00-phys.js). Nothing here keeps time state:
 * W.update(T) sets every transform and material value from T alone.
 *
 * Materials: walnut + beech wood, ivory dominoes with lacquered painted backs, anodised xylophone
 * keys, glass marble, brass coin, glazed piggy bank, paper, a phone. Textures are canvases drawn
 * at build time from seeded hash noise (no images, no randomness).
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const CR = FILM.CR;
  const W = (CR.W = {});
  const PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const sstep = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

  // ------------------------------------------------------------------ palette (art bible)
  const PAL = (CR.PAL = {
    bg: '#0a0012', magenta: '#ff2bd6', cyan: '#00f0ff', violet: '#bf00ff',
    ivory: '#f1e5cc', pip: '#1c1430', walnut: '#5b3a24', beech: '#d9b48a', felt: '#16111c',
    paper: '#f3efe6', ink: '#1a1426', sticky: '#ffd84a', brass: '#d9a441', skin: '#d79c80',
    lacquerDark: '#14081f', lacquerMag: '#ff2bd6',
  });

  // ------------------------------------------------------------------ deterministic noise
  function h3(x, y, s) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
    h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = h3(xi, yi, s), b = h3(xi + 1, yi, s), c = h3(xi, yi + 1, s), d = h3(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  }
  function fbm(x, y, s, o) { let a = 0, f = 1, w = 0.5, n = 0; for (let i = 0; i < (o || 4); i++) { a += w * vnoise(x * f, y * f, s + i * 17); n += w; f *= 2.03; w *= 0.5; } return a / n; }
  const hex2rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, o) {
    const t = new THREE.CanvasTexture(c);
    o = o || {};
    t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
    t.anisotropy = 8;
    if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
    t.needsUpdate = true;
    return t;
  }
  const FONT = '"Futura", "Avenir Next", "Helvetica Neue", sans-serif';
  const FONT_H = '"Helvetica Neue", "Avenir Next", sans-serif';

  // wood: grain runs along canvas x (long fibres, soft growth bands, pores)
  function woodCanvas(w, h, seed, base, dark, light, o) {
    o = o || {};
    const c = canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const B = hex2rgb(base), D = hex2rgb(dark), Lt = hex2rgb(light);
    const fy = o.freq || 26, con = o.contrast || 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = x / w, ny = y / h;
        const warp = fbm(nx * 1.6, ny * 2.0, seed, 4) * 0.55 + fbm(nx * 0.5, ny * 7, seed + 5, 3) * 0.25;
        const band = 0.5 + 0.5 * Math.sin((ny * fy + warp * 2.0) * PI * 2);
        const fibre = fbm(nx * 6, ny * fy * 22, seed + 9, 3);
        const pore = h3(Math.floor(x / 9), Math.floor(ny * fy * 60), seed + 3) > 0.93 ? 0.35 : 0;
        const streak = fbm(nx * 2.5, ny * fy * 60, seed + 13, 2);
        let k = (Math.pow(band, 2.6) * 0.3 + fibre * 0.35 + streak * 0.3 + pore * 0.35) * con;
        k = clamp(k, 0, 1);
        const m = fbm(nx * 1.5, ny * 1.2, seed + 21, 3);
        const i = (y * w + x) * 4;
        for (let ch = 0; ch < 3; ch++) {
          let v = lerp(B[ch], D[ch], k);
          v = lerp(v, Lt[ch], clamp((m - 0.5) * 1.2, 0, 0.3));
          d[i + ch] = v;
        }
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function feltCanvas(w, h, seed) {
    const c = canvas(w, h), g = c.getContext('2d');
    const img = g.createImageData(w, h), d = img.data;
    const B = hex2rgb(PAL.felt);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const n = fbm(x / 9, y / 9, seed, 3) * 0.6 + h3(x, y, seed + 1) * 0.4;
      const i = (y * w + x) * 4;
      for (let ch = 0; ch < 3; ch++) d[i + ch] = B[ch] * (0.82 + n * 0.36);
      d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // a Dymo-style embossed label tape
  function dymo(text, o) {
    o = o || {};
    const c = canvas(o.w || 512, o.h || 104), g = c.getContext('2d');
    g.fillStyle = o.bg || '#141016'; g.fillRect(0, 0, c.width, c.height);
    // tape sheen
    const gr = g.createLinearGradient(0, 0, 0, c.height); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.02)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
    g.font = `700 ${o.size || 64}px ${FONT_H}`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if ('letterSpacing' in g) g.letterSpacing = (o.ls || 6) + 'px';
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillText(text, c.width / 2 + 2, c.height / 2 + 3);
    g.fillStyle = o.fg || '#f4f0ea'; g.fillText(text, c.width / 2, c.height / 2);
    return c;
  }

  // ------------------------------------------------------------------ AiXenix pixel font -> the mosaic
  const GLYPH = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    i: ['#', '.', '#', '#', '#', '#', '#'],
    X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    e: ['....', '....', '.##.', '#..#', '####', '#...', '.###'],
    n: ['....', '....', '###.', '#..#', '#..#', '#..#', '#..#'],
    x: ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  };
  function mosaic() {
    const word = 'AiXenix';
    const cols = CR.FD.cols, rows = CR.FD.rows;
    const grid = Array.from({ length: rows }, () => new Array(cols).fill(0));
    let width = 0; for (const ch of word) width += GLYPH[ch][0].length; width += word.length - 1;
    let x = Math.floor((cols - width) / 2);
    for (const ch of word) {
      const gl = GLYPH[ch];
      for (let r = 0; r < 7; r++) for (let c = 0; c < gl[r].length; c++) if (gl[r][c] === '#') grid[r + 1][x + c] = 1;
      x += gl[0].length + 1;
    }
    return grid;
  }
  CR.mosaic = mosaic;

  // ------------------------------------------------------------------ geometry helpers
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3();
  // pivot-frame matrix for a hinged box: front normal F (unit, horizontal), angle th (tips toward F)
  function hingeMatrix(out, px, py, pz, fx, fz, th) {
    // basis: X = Y x F, Y = up, Z = F
    const X = V3(fz, 0, -fx); // (0,1,0) x (fx,0,fz) = (1*fz - 0, 0*fx - 0*fz, 0 - 1*fx)
    const B = new THREE.Matrix4().makeBasis(X, V3(0, 1, 0), V3(fx, 0, fz));
    const R = new THREE.Matrix4().makeRotationAxis(X.clone().normalize(), th);
    out.copy(R).multiply(B);
    out.setPosition(px, py, pz);
    return out;
  }
  W.hingeMatrix = hingeMatrix;

  // ================================================================== BUILD
  W.build = function (renderer) {
    const S = (W.S = {});
    const scene = (S.scene = new THREE.Scene());
    scene.background = new THREE.Color(PAL.bg);
    scene.fog = new THREE.Fog(new THREE.Color('#07020c'), 140, 360);
    const pmrem = new THREE.PMREMGenerator(renderer);
    S.env = pmrem.fromScene(new THREE.RoomEnvironment(), 0.035).texture;
    scene.environment = S.env;
    scene.environmentIntensity = 0.32;
    pmrem.dispose();

    // ---------------------------------------------------------------- lights
    S.key = new THREE.DirectionalLight(new THREE.Color('#ffcf9c'), 3.6);
    S.key.castShadow = true;
    S.key.shadow.mapSize.set(1024, 1024);
    S.key.shadow.bias = -0.00025; S.key.shadow.normalBias = 0.02;
    S.key.shadow.radius = 3;
    scene.add(S.key); scene.add(S.key.target);
    S.hemi = new THREE.HemisphereLight(new THREE.Color('#e4dcf0'), new THREE.Color('#4a2814'), 0.12);
    scene.add(S.hemi);
    S.rim = new THREE.DirectionalLight(new THREE.Color('#d48cff'), 0.25);
    S.rim.position.set(120, 60, -160); scene.add(S.rim);
    S.rim2 = new THREE.DirectionalLight(new THREE.Color('#38d8ff'), 0.25);
    S.rim2.position.set(-160, 40, -60); scene.add(S.rim2);
    S.fill = new THREE.DirectionalLight(new THREE.Color('#ffe6cc'), 0.75);
    scene.add(S.fill); scene.add(S.fill.target);
    S.phoneLight = new THREE.PointLight(new THREE.Color('#7fe8ff'), 0, 22, 2);
    scene.add(S.phoneLight);

    // ---------------------------------------------------------------- textures
    const walnutC = woodCanvas(1024, 512, 11, '#6e472d', '#3a2316', '#8a5a36', { freq: 10, contrast: 0.85 });
    const walnut = tex(walnutC, { repeat: [1, 1] });
    const deskC = woodCanvas(2048, 1024, 13, '#74492c', '#3c2416', '#93613c', { freq: 16, contrast: 0.8 });
    { const g = deskC.getContext('2d'); g.fillStyle = 'rgba(20,10,5,0.55)'; for (const y of [0, 341, 683]) g.fillRect(0, y, 2048, 3); g.fillStyle = 'rgba(255,220,180,0.06)'; for (const y of [3, 344, 686]) g.fillRect(0, y, 2048, 2); }
    const deskTex = tex(deskC); deskTex.wrapS = deskTex.wrapT = THREE.RepeatWrapping; deskTex.repeat.set(2.4, 2.4);
    const beechC = woodCanvas(1024, 128, 23, '#d8b083', '#b48a5e', '#ecc99c', { freq: 4, contrast: 0.7 });
    const felt = tex(feltCanvas(256, 256, 5), { repeat: [10, 6] });

    // ruler faces: beech with cm ticks
    function rulerCanvas(lenCm, wCm, o) {
      o = o || {};
      const pxPerCm = o.ppc || 24;
      const c = canvas(Math.min(4096, Math.round(lenCm * pxPerCm)), Math.round(wCm * pxPerCm)), g = c.getContext('2d');
      g.drawImage(o.base || beechC, 0, 0, c.width, c.height);
      g.fillStyle = o.tick || 'rgba(30,18,10,0.85)';
      const ppc = c.width / lenCm;
      for (let mm = 0; mm <= lenCm * 10; mm++) {
        const x = mm * ppc / 10;
        const L = mm % 10 === 0 ? 0.36 : mm % 5 === 0 ? 0.24 : 0.14;
        g.fillRect(x, 0, Math.max(1, ppc * 0.018), c.height * L);
        if (mm % 10 === 0 && mm > 0 && mm < lenCm * 10) {
          g.font = `600 ${Math.round(c.height * 0.22)}px ${FONT_H}`; g.textAlign = 'center'; g.textBaseline = 'top';
          g.fillText(String(mm / 10), x, c.height * 0.4);
        }
      }
      return c;
    }

    // ---------------------------------------------------------------- materials
    const M = (S.mat = {});
    M.desk = new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.52, metalness: 0 });
    M.walnut = new THREE.MeshStandardMaterial({ map: walnut, roughness: 0.58 });
    M.beech = new THREE.MeshStandardMaterial({ map: tex(beechC), roughness: 0.55 });
    M.felt = new THREE.MeshStandardMaterial({ map: felt, roughness: 0.97 });
    M.ivory = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.ivory), roughness: 0.32 });
    M.brass = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e0aa4a'), metalness: 1, roughness: 0.28 });
    M.steel = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9ccd4'), metalness: 1, roughness: 0.3 });
    M.blackPlastic = new THREE.MeshStandardMaterial({ color: new THREE.Color('#141218'), roughness: 0.45 });
    M.whitePlastic = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ece9ef'), roughness: 0.38 });
    M.paper = new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.paper), roughness: 0.85, side: THREE.DoubleSide });

    // ---------------------------------------------------------------- desk, mat, background
    const desk = new THREE.Mesh(new THREE.BoxGeometry(260, 4, 150), M.desk);
    desk.position.set(0, -2, -5); desk.receiveShadow = true; scene.add(desk);
    const mat = new THREE.Mesh(new THREE.BoxGeometry(124, 0.25, 66), M.felt);
    mat.position.set(0, 0.125, 9.5); mat.receiveShadow = true; scene.add(mat);
    S.matY = 0.25;
    // bokeh lights far around the desk (city/office practicals out of focus)
    {
      const g = new THREE.SphereGeometry(1, 10, 8);
      const cols = ['#ffb35c', '#ff7ad9', '#ffd08a', '#7fe8ff', '#c77dff', '#ffa040'];
      const nb = 46;
      const bk = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), nb);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < nb; i++) {
        const a = h3(i, 1, 77) * PI * 2;
        const r = 380 + h3(i, 2, 77) * 160;
        const sc = 2.2 + h3(i, 5, 77) * 3.5;
        m4.makeScale(sc, sc, sc); m4.setPosition(Math.cos(a) * r, 25 + h3(i, 4, 77) * 150, Math.sin(a) * r - 40);
        bk.setMatrixAt(i, m4);
        bk.setColorAt(i, new THREE.Color(cols[i % cols.length]).multiplyScalar(2.2 + 2 * h3(i, 3, 77)));
      }
      bk.frustumCulled = false; scene.add(bk);
      // a dim back wall gradient so the darkness has depth
      const wallC = canvas(64, 256), wg = wallC.getContext('2d');
      const gr = wg.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#030006'); gr.addColorStop(0.55, '#0b0414'); gr.addColorStop(1, '#0e0612');
      wg.fillStyle = gr; wg.fillRect(0, 0, 64, 256);
      const wall = new THREE.Mesh(new THREE.CylinderGeometry(600, 600, 500, 48, 1, true), new THREE.MeshBasicMaterial({ map: tex(wallC), side: THREE.BackSide, fog: false }));
      wall.position.set(0, 180, -40); scene.add(wall);
    }

    // ---------------------------------------------------------------- dominoes (instanced)
    const D = CR.L.dom;
    // pip atlas: 4x4 cells, each a domino face (ivory, divider, pips)
    const AT = { cols: 4, rows: 4, cw: 256, ch: 512 };
    const atlasC = canvas(AT.cols * AT.cw, AT.rows * AT.ch);
    const bumpC = canvas(AT.cols * AT.cw, AT.rows * AT.ch);
    {
      const g = atlasC.getContext('2d'), b = bumpC.getContext('2d');
      b.fillStyle = '#ffffff'; b.fillRect(0, 0, bumpC.width, bumpC.height);
      const PIPS = { 0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
      for (let cy = 0; cy < AT.rows; cy++) for (let cx = 0; cx < AT.cols; cx++) {
        const ox = cx * AT.cw, oy = cy * AT.ch;
        g.fillStyle = PAL.ivory; g.fillRect(ox, oy, AT.cw, AT.ch);
        // faint ivory grain
        for (let k = 0; k < 140; k++) { g.fillStyle = `rgba(150,120,80,${0.03 + 0.04 * h3(k, cx + cy * 4, 3)})`; g.fillRect(ox + h3(k, 1, cx + 9 * cy) * AT.cw, oy + h3(k, 2, cx + 9 * cy) * AT.ch, 1 + 10 * h3(k, 4, 1), 1); }
        const idx = cy * AT.cols + cx;
        const top = Math.floor(h3(idx, 7, 41) * 7), bot = Math.floor(h3(idx, 8, 41) * 7);
        // divider
        g.fillStyle = PAL.pip; g.fillRect(ox + AT.cw * 0.18, oy + AT.ch / 2 - 4, AT.cw * 0.64, 8);
        b.fillStyle = '#000'; b.fillRect(ox + AT.cw * 0.18, oy + AT.ch / 2 - 4, AT.cw * 0.64, 8);
        const half = (n, cyy) => {
          for (const [px, py] of PIPS[n]) {
            const X = ox + AT.cw / 2 + px * AT.cw * 0.25, Y = oy + cyy + py * AT.ch * 0.125;
            g.fillStyle = PAL.pip; g.beginPath(); g.arc(X, Y, AT.cw * 0.085, 0, PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(X - 4, Y - 4, AT.cw * 0.03, 0, PI * 2); g.fill();
            b.fillStyle = '#000'; b.beginPath(); b.arc(X, Y, AT.cw * 0.085, 0, PI * 2); b.fill();
          }
        };
        half(top, AT.ch * 0.25); half(bot, AT.ch * 0.75);
      }
    }
    const atlas = tex(atlasC), atlasBump = tex(bumpC, { linear: true });
    // black set (the painted field): same layout, inverted inks
    const atlasK = canvas(atlasC.width, atlasC.height);
    {
      const g = atlasK.getContext('2d');
      g.fillStyle = '#16131b'; g.fillRect(0, 0, atlasK.width, atlasK.height);
      const id = atlasC.getContext('2d').getImageData(0, 0, atlasC.width, atlasC.height);
      const out = g.getImageData(0, 0, atlasK.width, atlasK.height);
      for (let i = 0; i < id.data.length; i += 4) {
        const l = (id.data[i] + id.data[i + 1] + id.data[i + 2]) / 765; // ivory ~0.9, pip ~0.1
        const k = clamp((0.75 - l) / 0.5, 0, 1); // 1 on pips
        out.data[i] = lerp(24, 236, k); out.data[i + 1] = lerp(20, 228, k); out.data[i + 2] = lerp(28, 214, k); out.data[i + 3] = 255;
      }
      g.putImageData(out, 0, 0);
    }
    const atlasBlack = tex(atlasK);
    function domGeo(w, h, t, rad, seg) {
      const geo = new THREE.RoundedBoxGeometry(w, h, t, seg, rad);
      geo.translate(0, h / 2, -t / 2);
      // UVs: the front face (+z) maps onto a cell; every other face samples the cell's plain margin
      const pos = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        if (nrm.getZ(i) > 0.7 && z > -0.02) uv.setXY(i, 0.04 + 0.92 * (x / w + 0.5), 0.04 + 0.92 * (y / h));
        else uv.setXY(i, 0.02, 0.5);
      }
      return geo;
    }
    function cellMaterial(base, map, key) {
      const m = base.clone();
      m.map = map; m.bumpMap = atlasBump; m.bumpScale = 0.6;
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
          .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * vec2(0.25, 0.25) + aCell;\n#endif\n#ifdef USE_BUMPMAP\nvBumpMapUv = uv * vec2(0.25, 0.25) + aCell;\n#endif');
      };
      m.customProgramCacheKey = () => 'cellmat-' + key;
      return m;
    }
    const nField = CR.FD.cols * CR.FD.rows;
    const nLine = CR.line.n - 1; // 13 standard line dominoes
    const domG = domGeo(D.w, D.h, D.t, 0.11, 2);
    const domGF = domGeo(D.w, D.h, D.t, 0.1, 1);
    const mkCells = (n, seed) => { const a = new Float32Array(n * 2); for (let i = 0; i < n; i++) { const c = Math.floor(h3(i, 5, seed) * 16); a[i * 2] = (c % 4) * 0.25; a[i * 2 + 1] = Math.floor(c / 4) * 0.25; } return a; };
    const gIv = domG.clone(); gIv.setAttribute('aCell', new THREE.InstancedBufferAttribute(mkCells(nLine + 1, 99), 2));
    const gBk = domGF.clone(); gBk.setAttribute('aCell', new THREE.InstancedBufferAttribute(mkCells(nField, 98), 2));
    S.domLine = new THREE.InstancedMesh(gIv, cellMaterial(M.ivory, atlas, 'iv'), nLine + 1);
    S.domField = new THREE.InstancedMesh(gBk, cellMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.26 }), atlasBlack, 'bk'), nField);
    for (const m of [S.domLine, S.domField]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    // painted backs of the field: one lacquer plate per field domino
    const plateG = new THREE.PlaneGeometry(D.w - 0.16, D.h - 0.16);
    plateG.rotateY(PI); plateG.translate(0, D.h / 2, -D.t - 0.006);
    S.plates = new THREE.InstancedMesh(plateG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0.0, emissive: new THREE.Color('#ff2bd6'), emissiveIntensity: 0.0 }), nField);
    S.plates.receiveShadow = true; S.plates.frustumCulled = false;
    const grid = mosaic();
    const cMag = new THREE.Color(PAL.lacquerMag), cDark = new THREE.Color(PAL.lacquerDark);
    for (let r = 0; r < CR.FD.rows; r++) for (let c = 0; c < CR.FD.cols; c++) S.plates.setColorAt(r * CR.FD.cols + c, grid[r][c] ? cMag : cDark);
    S.plates.instanceColor.needsUpdate = true;
    scene.add(S.plates);

    // hero domino «ОДИН КЛИК»: the text is on its back face (it faces the camera and falls away)
    {
      const H = CR.L.hero;
      const c = canvas(512, 1024), g = c.getContext('2d');
      g.fillStyle = PAL.ivory; g.fillRect(0, 0, 512, 1024);
      for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(150,120,80,${0.03 + 0.05 * h3(k, 1, 5)})`; g.fillRect(h3(k, 2, 5) * 512, h3(k, 3, 5) * 1024, 2 + 18 * h3(k, 4, 5), 2); }
      g.fillStyle = PAL.pip; g.fillRect(70, 508, 372, 10);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `700 112px ${FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = '2px';
      g.fillStyle = PAL.ink; g.fillText('ОДИН', 256, 318);
      g.fillStyle = '#c4169f'; g.fillText('КЛИК', 256, 742);
      // a small "touch here" ring under the word, like a button
      g.strokeStyle = 'rgba(28,20,48,0.55)'; g.lineWidth = 6; g.beginPath(); g.arc(256, 140, 30, 0, PI * 2); g.stroke();
      g.beginPath(); g.arc(256, 140, 11, 0, PI * 2); g.fillStyle = 'rgba(28,20,48,0.55)'; g.fill();
      const ht = tex(c);
      const geo = new THREE.RoundedBoxGeometry(H.w, H.h, H.t, 3, 0.2);
      geo.translate(0, H.h / 2, -H.t / 2);
      const pos = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
      for (let i = 0; i < pos.count; i++) {
        if (nrm.getZ(i) < -0.7 && pos.getZ(i) < -H.t + 0.02) uv.setXY(i, 1 - (0.03 + 0.94 * (pos.getX(i) / H.w + 0.5)), 0.03 + 0.94 * (pos.getY(i) / H.h));
        else uv.setXY(i, 0.01, 0.01);
      }
      S.hero = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: ht, roughness: 0.3 }));
      S.hero.castShadow = true; S.hero.receiveShadow = true; S.hero.matrixAutoUpdate = false;
      scene.add(S.hero);
    }

    // ---------------------------------------------------------------- the riser (monitor stand) + «ЗАЯВКА»
    {
      const R = CR.L.riser;
      const top = new THREE.Mesh(new THREE.BoxGeometry(R.x1 - R.x0, R.th, R.z1 - R.z0), M.walnut);
      top.position.set((R.x0 + R.x1) / 2, R.y - R.th / 2, (R.z0 + R.z1) / 2);
      top.castShadow = top.receiveShadow = true; scene.add(top);
      for (const x of [R.x0 + 3, R.x1 - 3]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(5, R.y - R.th, R.z1 - R.z0 - 1), M.walnut);
        leg.position.set(x, (R.y - R.th) / 2, (R.z0 + R.z1) / 2); leg.castShadow = leg.receiveShadow = true; scene.add(leg);
      }
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 1.9), new THREE.MeshStandardMaterial({ map: tex(dymo('ЗАЯВКА')), roughness: 0.35 }));
      lab.position.set(50, R.y - R.th / 2, R.z1 + 0.02); void lab; // (the placard below carries the label)
      // a folded tent card in front of the line: «ЗАЯВКА» (incoming request)
      const tc = canvas(512, 200), tg = tc.getContext('2d');
      tg.fillStyle = '#f6f2ea'; tg.fillRect(0, 0, 512, 200);
      tg.fillStyle = PAL.magenta; tg.fillRect(0, 0, 512, 16);
      tg.fillStyle = PAL.ink; tg.font = `700 104px ${FONT}`; tg.textAlign = 'center'; tg.textBaseline = 'middle';
      if ('letterSpacing' in tg) tg.letterSpacing = '6px';
      tg.fillText('ЗАЯВКА', 256, 112);
      // a placard on a brass card-holder behind the line, above the dominoes, facing the camera's path
      const tcard = new THREE.Group(); tcard.position.set(49, R.y, R.z0 + 3.2); tcard.rotation.y = 0.6; scene.add(tcard);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.9, 8), M.brass); stem.position.y = 2.45; tcard.add(stem);
      const base2 = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 0.35, 20), M.brass); base2.position.y = 0.17; tcard.add(base2);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.8), new THREE.MeshStandardMaterial({ map: tex(tc), roughness: 0.7, side: THREE.DoubleSide }));
      face.position.set(0, 4.85 + 1.4, 0.05); face.rotation.x = -0.12; face.castShadow = true; tcard.add(face);

    }

    // ---------------------------------------------------------------- xylophone ramp
    {
      const Mk = CR.M;
      const grp = (S.ramp = new THREE.Group());
      grp.position.set(Mk.x0, Mk.y0 + Mk.R, CR.L.lineZ);
      grp.rotation.z = Mk.slope; // local -x = down the ramp
      scene.add(grp);
      const len = Mk.sEnd + 1.5;
      const back = CR.TEE.uLand - CR.TEE.u + 1.8; // rails run back under the tee
      const RM = Mk.R;
      // frame: two walnut beams with felt strips under the bars (like a glockenspiel)
      for (const zs of [-1, 1]) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(len, 1.3, 1.1), M.walnut);
        beam.position.set(-len / 2 + 0.8, -RM - 0.5 - 0.65 - 0.1, zs * 2.6); beam.castShadow = beam.receiveShadow = true; grp.add(beam);
        const feltS = new THREE.Mesh(new THREE.BoxGeometry(len, 0.16, 0.8), new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a1a55'), roughness: 0.95 }));
        feltS.position.set(-len / 2 + 0.8, -RM - 0.5 - 0.08, zs * 2.6); grp.add(feltS);
      }
      // the brass rail track the marble rolls on (marble centre at local y = 0)
      const railY = -Math.sqrt(RM * RM - 0.55 * 0.55);
      for (const zs of [-1, 1]) {
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 10), M.brass);
        rod.scale.y = (len + back) / len;
        rod.rotation.z = PI / 2; rod.position.set((back - len) / 2, railY - 0.1, zs * 0.55); rod.castShadow = true; grp.add(rod);
      }
      // rail posts between bars, standing on a thin centre spine
      const spine = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.9), M.walnut);
      spine.position.set(-len / 2 + 0.8, -RM - 0.5 - 0.6 - 0.25 - 0.9, 0); spine.castShadow = true; grp.add(spine);
      S.keys = [];
      // brushed anodised aluminium: fine streaks across the bar (roughness map)
      const brC = canvas(256, 64), bg2 = brC.getContext('2d'), bimg = bg2.createImageData(256, 64);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 256; x++) { const v = 150 + 70 * fbm(x / 60, y * 3, 71, 2) + 20 * h3(x, y, 72); const i = (y * 256 + x) * 4; bimg.data[i] = bimg.data[i + 1] = bimg.data[i + 2] = v; bimg.data[i + 3] = 255; }
      bg2.putImageData(bimg, 0, 0);
      const brushed = tex(brC, { linear: true });
      const keyCol = (i) => { const c = new THREE.Color(); const k = i / (Mk.keys.length - 1); c.setHSL(lerp(0.9, 0.52, k), 0.9, lerp(0.58, 0.52, k)); return c; };
      for (const k of Mk.keys) {
        const geo = new THREE.RoundedBoxGeometry(k.w, 0.5, k.len, 2, 0.14);
        const m = new THREE.MeshStandardMaterial({ color: keyCol(k.i), metalness: 0.8, roughness: 0.24, emissive: keyCol(k.i), emissiveIntensity: 0 });
        const mesh = new THREE.Mesh(geo, m);
        // its top sits just under the marble's bottom
        mesh.position.set(-(k.s + k.w / 2), -RM - 0.25 - 0.02, 0);
        mesh.castShadow = mesh.receiveShadow = true;
        grp.add(mesh);
        S.keys.push({ mesh, m, k, y0: mesh.position.y });
      }
      for (let s2 = 1.0; s2 < len - 1; s2 += 3.2) {
        // posts avoid the bars
        if (Mk.keys.some((k) => s2 > k.s - 0.35 && s2 < k.s + k.w + 0.35)) continue;
        for (const zs of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), M.brass);
          post.position.set(-s2, railY - 1.25, zs * 0.55); grp.add(post);
        }
      }
      // posts holding the ramp beyond the riser
      const R = CR.L.riser;
      for (let s = 6; s < len; s += 9) {
        const x = Mk.x0 - s * Math.cos(Mk.slope);
        if (x > R.x0 - 1) continue;
        const y = Mk.y0 - s * Math.sin(Mk.slope) - 1.7;
        for (const zs of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, y, 10), M.walnut);
          post.position.set(x, y / 2, CR.L.lineZ + zs * 3.1); post.castShadow = post.receiveShadow = true; scene.add(post);
        }
      }
      // marble: glass with a magenta-cyan twist inside
      const mg = new THREE.Group(); S.marble = mg; scene.add(mg);
      const glass = new THREE.Mesh(new THREE.SphereGeometry(CR.M.R, 40, 28), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#d8fbff'), roughness: 0.03, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 3.4, specularIntensity: 1 }));
      glass.castShadow = true; mg.add(glass);
      const swirl = new THREE.Mesh(new THREE.TorusKnotGeometry(0.4, 0.13, 64, 8, 2, 3), new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.magenta), emissive: new THREE.Color('#ff2bd6'), emissiveIntensity: 0.35, roughness: 0.3 }));
      mg.add(swirl);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.cyan), emissive: new THREE.Color('#004a55'), roughness: 0.2 }));
      mg.add(core);
      // the tee: a brass post with a little cup holding the marble in front of the last domino
      {
        const TE = CR.TEE, ry = CR.L.riser.y;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, TE.cupTop - 0.22, 10), M.brass);
        post.position.set(TE.x, ry + (TE.cupTop - 0.22) / 2, CR.L.lineZ); post.castShadow = true; scene.add(post);
        const cupP = [[0.05, 0], [0.18, 0.02], [0.45, 0.12], [TE.cupR, 0.22], [TE.cupR - 0.06, 0.24], [0.05, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
        const cup = new THREE.Mesh(new THREE.LatheGeometry(cupP, 20), M.brass);
        cup.position.set(TE.x, ry + TE.cupTop - 0.22, CR.L.lineZ); cup.castShadow = true; scene.add(cup);
        const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.25, 20), M.brass);
        foot.position.set(TE.x, ry + 0.125, CR.L.lineZ); foot.castShadow = foot.receiveShadow = true; scene.add(foot);
      }
    }

    // ---------------------------------------------------------------- lever: pivot block, arm, CRM tray, binder clip, stamp
    {
      const LV = CR.LV;
      S.pivotBlock = new THREE.Mesh(new THREE.BoxGeometry(3.0, LV.py - 0.3, 4.6), M.beech);
      S.pivotBlock.position.set(LV.px, (LV.py - 0.3) / 2, LV.z); S.pivotBlock.castShadow = S.pivotBlock.receiveShadow = true; scene.add(S.pivotBlock);
      const arm = (S.arm = new THREE.Group()); arm.position.set(LV.px, LV.py, LV.z); scene.add(arm);
      const armLen = LV.arm + 7.5;
      const rc = rulerCanvas(armLen, 3);
      const am = new THREE.MeshStandardMaterial({ map: tex(rc), roughness: 0.5 });
      void am;
      const armBox = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.6, 2.6), M.walnut);
      armBox.position.set(-(armLen / 2) + 6.5, 0, 0); armBox.castShadow = armBox.receiveShadow = true; arm.add(armBox);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 5.6, 14), M.brass); pin.rotation.x = PI / 2; arm.add(pin);
      for (const zs of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.25, 16), M.brass); cap.rotation.x = PI / 2; cap.position.z = zs * 2.8; arm.add(cap); }
      // CRM tray: a little matte-black letter tray
      const tray = new THREE.Group(); tray.position.set(-LV.rTray, 0.25, 0); arm.add(tray);
      const tb = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M.blackPlastic); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; tray.add(m); };
      tb(5.2, 0.25, 4.2, 0, 0.125, 0); tb(5.2, 1.5, 0.22, 0, 0.75, 2.0); tb(5.2, 1.5, 0.22, 0, 0.75, -2.0); tb(0.22, 1.5, 4.2, 2.5, 0.75, 0); tb(0.22, 1.0, 4.2, -2.5, 0.5, 0);
      const crm = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.9), new THREE.MeshStandardMaterial({ map: tex(dymo('CRM', { bg: '#ff2bd6', fg: '#ffffff', size: 70, ls: 10 })), roughness: 0.35 }));
      crm.position.set(0, 0.8, 2.13); tray.add(crm);
      // binder clip counterweight on the short end
      // counterweight: a brass calibration weight on the short arm
      const clip = new THREE.Group(); clip.position.set(4.6, 0.3, 0); arm.add(clip);
      const wP = [[0.01, 0], [1.25, 0], [1.3, 0.1], [1.3, 2.0], [1.2, 2.15], [0.5, 2.25], [0.45, 2.7], [0.75, 2.85], [0.8, 3.1], [0.01, 3.2]].map(([r, y]) => new THREE.Vector2(r, y));
      const cb = new THREE.Mesh(new THREE.LatheGeometry(wP, 28), M.brass); cb.castShadow = true; clip.add(cb);
      // stamp: hangs from a pin at the arm tip
      const st = (S.stamp = new THREE.Group()); st.position.set(-LV.arm, 0, 0); arm.add(st);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a1e5c'), roughness: 0.35 })); knob.position.y = -1.0; st.add(knob);
      const prof = [[0.01, 0], [0.55, 0], [0.62, 0.4], [0.5, 1.2], [0.42, 2.2], [0.5, 2.9], [0.75, 3.3], [0.01, 3.3]].map(([r, y]) => new THREE.Vector2(r, y));
      const handle = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), M.walnut); handle.rotation.x = PI; handle.position.y = -1.6; handle.castShadow = true; st.add(handle);
      const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 2.6), M.walnut); base.position.y = -LV.stampLen + 0.75; base.castShadow = true; st.add(base);
      const rub = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.25, 2.4), new THREE.MeshStandardMaterial({ color: new THREE.Color('#8a1268'), roughness: 0.8 })); rub.position.y = -LV.stampLen + 0.125; st.add(rub);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8), M.brass); rope.position.y = -0.3; st.add(rope);
    }

    // ---------------------------------------------------------------- catapult: glue stick fulcrum + steel ruler + sticky-note invoice + coin
    {
      const CP = CR.CP;
      const glue = new THREE.Group(); glue.position.set(CP.x, 1.15, CP.fz); scene.add(glue);
      const gs = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 8.5, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color('#7b2bd6'), roughness: 0.35 }));
      gs.rotation.z = PI / 2; gs.castShadow = gs.receiveShadow = true; glue.add(gs);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.18, 2.4, 28), M.whitePlastic); cap.rotation.z = PI / 2; cap.position.x = 5.4; cap.castShadow = true; glue.add(cap);
      const rul = (S.cat = new THREE.Group()); rul.position.set(CP.x, CP.fy + CP.th / 2, CP.fz); scene.add(rul);
      const rc = rulerCanvas(CP.short + CP.long, 2.6, { base: woodCanvas(512, 64, 31, '#b9bcc4', '#8d9099', '#d9dbe0', { freq: 2 }) });
      const rm = new THREE.MeshStandardMaterial({ map: tex(rc), metalness: 0.85, roughness: 0.32 });
      const rb = new THREE.Mesh(new THREE.BoxGeometry(2.6, CP.th, CP.short + CP.long), [M.steel, M.steel, rm, M.steel, M.steel, M.steel]);
      rb.position.set(0, 0, (CP.long - CP.short) / 2); rb.castShadow = rb.receiveShadow = true; rul.add(rb);
      // sticky note «СЧЁТ» on the short (raised) end
      const sc = canvas(256, 256), sg = sc.getContext('2d');
      sg.fillStyle = PAL.sticky; sg.fillRect(0, 0, 256, 256);
      sg.fillStyle = 'rgba(0,0,0,0.06)'; sg.fillRect(0, 0, 256, 34);
      sg.fillStyle = PAL.ink; sg.font = `700 54px ${FONT}`; sg.textAlign = 'center'; sg.fillText('СЧЁТ', 128, 100);
      sg.font = `500 26px ${FONT_H}`; sg.fillText('№ 0001', 128, 140);
      sg.fillStyle = 'rgba(26,20,38,0.35)'; for (let k = 0; k < 3; k++) sg.fillRect(40, 168 + k * 22, 176 - k * 40, 5);
      const note = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshStandardMaterial({ map: tex(sc), roughness: 0.8, side: THREE.DoubleSide }));
      note.rotation.x = -PI / 2; note.rotation.z = -PI / 2; note.position.set(-0.6, CP.th / 2 + 0.02, -CP.short + 2.6); note.castShadow = true; rul.add(note);
      // the stamp's imprint (ink appears on contact)
      const ic = canvas(256, 256), ig = ic.getContext('2d');
      ig.strokeStyle = PAL.magenta; ig.lineWidth = 12; ig.beginPath(); ig.arc(128, 128, 104, 0, PI * 2); ig.stroke();
      ig.lineWidth = 5; ig.beginPath(); ig.arc(128, 128, 84, 0, PI * 2); ig.stroke();
      ig.lineWidth = 22; ig.lineCap = 'round'; ig.lineJoin = 'round'; ig.beginPath(); ig.moveTo(78, 132); ig.lineTo(114, 168); ig.lineTo(182, 92); ig.stroke();
      for (let k = 0; k < 400; k++) { ig.clearRect(h3(k, 1, 8) * 256, h3(k, 2, 8) * 256, 2 + 5 * h3(k, 3, 8), 2); }
      S.seal = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial({ map: tex(ic), transparent: true, opacity: 0, roughness: 0.6, depthWrite: false }));
      S.seal.rotation.x = -PI / 2; S.seal.rotation.z = 0.25; S.seal.position.set(0.1, CP.th / 2 + 0.05, -CP.short + 1.5); rul.add(S.seal);
      // coin
      const cc = canvas(256, 256), cg = cc.getContext('2d');
      cg.fillStyle = '#d6a04a'; cg.fillRect(0, 0, 256, 256);
      cg.strokeStyle = '#8a5a1e'; cg.lineWidth = 10; cg.beginPath(); cg.arc(128, 128, 112, 0, PI * 2); cg.stroke();
      cg.fillStyle = '#9a6824'; cg.font = `700 120px ${FONT}`; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText('₽', 128, 136);
      const coinM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ffd27a'), metalness: 1, roughness: 0.18, map: tex(cc), emissive: new THREE.Color('#ffb020'), emissiveIntensity: 0.25 });
      const coinG = new THREE.CylinderGeometry(CR.COIN.r, CR.COIN.r, CR.COIN.th, 40);
      S.coin = new THREE.Mesh(coinG, [M.brass, coinM, coinM]); S.coin.castShadow = true; scene.add(S.coin);
    }

    // ---------------------------------------------------------------- balance plank + piggy bank «оплата» + tape roll
    {
      const BL = CR.BL;
      const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 2.2, BL.fy - 0.3, 3, 1), M.walnut);
      wedge.rotation.y = PI / 6; wedge.scale.set(1, 1, 1.6); wedge.rotation.x = 0;
      const wg = new THREE.Group(); wg.position.set(BL.x, (BL.fy - 0.3) / 2, BL.fz); wg.add(wedge); wedge.rotation.set(0, 0, 0);
      const prism = new THREE.Shape(); prism.moveTo(-1.8, 0); prism.lineTo(1.8, 0); prism.lineTo(0, BL.fy - 0.3); prism.lineTo(-1.8, 0);
      const pg = new THREE.ExtrudeGeometry(prism, { depth: 5, bevelEnabled: false }); pg.translate(0, 0, -2.5); pg.rotateY(PI / 2);
      const pm = new THREE.Mesh(pg, M.walnut); pm.position.set(BL.x, 0, BL.fz); pm.castShadow = pm.receiveShadow = true; scene.add(pm);
      const plank = (S.plank = new THREE.Group()); plank.position.set(BL.x, BL.fy, BL.fz); scene.add(plank);
      const L0 = BL.len0, L1 = BL.len1;
      const pb = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, L0 + L1 + 1), M.beech); pb.position.set(0, 0.3, (L1 - L0) / 2); pb.castShadow = pb.receiveShadow = true; plank.add(pb);
      // tape roll counterweight
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 1.9, 32, 1, true), new THREE.MeshStandardMaterial({ color: new THREE.Color('#e9e2c9'), roughness: 0.25, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      tr.position.set(0, 0.6 + 0.95, -L0 + 2.6); tr.castShadow = true; plank.add(tr);
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1.95, 28, 1, true), new THREE.MeshStandardMaterial({ color: new THREE.Color('#c7a77a'), roughness: 0.8, side: THREE.DoubleSide }));
      core.position.copy(tr.position); plank.add(core);
      // piggy: glazed magenta ceramic
      const pig = (S.pig = new THREE.Group()); pig.position.set(0, 0.6, BL.piggyR); plank.add(pig);
      const glaze = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff3fd8'), roughness: 0.16, envMapIntensity: 1.3 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), glaze); body.scale.set(3.4, 3.5, 4.6); body.position.y = 1.3 + 3.5; body.castShadow = body.receiveShadow = true; pig.add(body);
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.45, 1.4, 28), glaze); snout.rotation.x = PI / 2; snout.position.set(0, 4.4, 4.75); snout.castShadow = true; pig.add(snout);
      const nose = new THREE.Mesh(new THREE.CircleGeometry(1.25, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color('#ff7be6'), roughness: 0.3 })); nose.position.set(0, 4.4, 5.46); pig.add(nose);
      for (const xs of [-1, 1]) {
        const nh = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), M.blackPlastic); nh.position.set(xs * 0.45, 4.4, 5.47); pig.add(nh);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), new THREE.MeshStandardMaterial({ color: 0x0a0610, roughness: 0.1 })); eye.position.set(xs * 1.55, 5.9, 3.55); pig.add(eye);
        const ear = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.6, 4), glaze); ear.position.set(xs * 1.6, 7.95, 1.8); ear.rotation.set(0.35, 0, xs * -0.35); ear.castShadow = true; pig.add(ear);
        for (const zs of [-1, 1]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.85, 1.6, 16), glaze); leg.position.set(xs * 1.7, 0.8, zs * 2.4); leg.castShadow = true; pig.add(leg); }
      }
      const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 2.8), new THREE.MeshBasicMaterial({ color: 0x050208 })); slot.position.set(0, 8.22, -0.5); pig.add(slot);
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.13, 8, 20, PI * 1.6), glaze); tail.position.set(0, 5.4, -4.7); tail.rotation.set(0, PI / 2, 0); pig.add(tail);
      // «ОПЛАТА» label on the piggy's flank (decal)
      const lab = new THREE.DecalGeometry(body, V3(BL.x + 3.4, 0, 0), new THREE.Euler(0, PI / 2, 0), V3(4.6, 1.1, 3));
      S.pigLabelGeo = lab;
      const lm = new THREE.MeshStandardMaterial({ map: tex(dymo('ОПЛАТА', { bg: '#141016' })), roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -4, transparent: false });
      // decal projection needs world matrices: compute once with the plank at rest
      plank.updateMatrixWorld(true);
      const dGeo = new THREE.DecalGeometry(body, body.getWorldPosition(new THREE.Vector3()).add(V3(-3.35, 0.4, 0.4)), new THREE.Euler(0, -PI / 2, 0), V3(5.6, 1.35, 3));
      // decal geometry is in world space: bring it into the pig's local frame
      const inv = new THREE.Matrix4().copy(pig.matrixWorld).invert();
      dGeo.applyMatrix4(inv);
      const dm = new THREE.Mesh(dGeo, lm); pig.add(dm);
      lab.dispose();
    }

    // ---------------------------------------------------------------- desk fan
    {
      const F = CR.FAN;
      const fan = (S.fan = new THREE.Group()); fan.position.set(F.x, 0, F.z); scene.add(fan);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 5.4, 1.5, 48), M.whitePlastic); base.position.y = 0.75; base.castShadow = base.receiveShadow = true; fan.add(base);
      S.fanBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.9, 0.7, 24), new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.magenta), roughness: 0.3, emissive: new THREE.Color('#ff2bd6'), emissiveIntensity: 0 }));
      S.fanBtn.position.set(0, 1.5 + 0.35, CR.BL.fz + CR.BL.len1 - F.z + 0.3); fan.add(S.fanBtn);
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, F.headY - 1.5, 16), M.whitePlastic); neck.position.y = 1.5 + (F.headY - 1.5) / 2; neck.castShadow = true; fan.add(neck);
      const head = (S.fanHead = new THREE.Group()); head.position.set(0, F.headY, 0); fan.add(head);
      const motor = new THREE.Mesh(new THREE.SphereGeometry(2.0, 28, 18), M.whitePlastic); motor.scale.set(1.3, 1, 1); motor.position.x = -2.3; motor.castShadow = true; head.add(motor);
      // cage: rings + spokes (front and back)
      const cageM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f1eef4'), roughness: 0.3, metalness: 0.2 });
      for (const [x, r] of [[1.2, F.R], [-0.9, F.R * 0.98]]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 8, 64), cageM); ring.rotation.y = PI / 2; ring.position.x = x; ring.castShadow = true; head.add(ring);
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(r * 0.55, 0.08, 6, 48), cageM); ring2.rotation.y = PI / 2; ring2.position.x = x + (x > 0 ? 0.6 : -0.3); head.add(ring2);
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * PI * 2;
          const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, r, 4), cageM);
          sp.position.set(x + (x > 0 ? 0.35 : -0.15), Math.cos(a) * r / 2, Math.sin(a) * r / 2); sp.rotation.x = a; head.add(sp);
        }
      }
      const badge = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.3, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.magenta), roughness: 0.3 })); badge.rotation.z = PI / 2; badge.position.x = 1.9; head.add(badge);
      // blades
      const blades = (S.blades = new THREE.Group()); blades.position.x = 0.15; head.add(blades);
      const sh = new THREE.Shape(); sh.moveTo(0.4, -0.5); sh.bezierCurveTo(2.5, -2.2, 5.6, -1.6, 5.4, 0.4); sh.bezierCurveTo(5.2, 1.8, 2.6, 1.6, 0.4, 0.6); sh.lineTo(0.4, -0.5);
      const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: false, curveSegments: 12 });
      const bm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9fe9ff'), roughness: 0.15, transparent: true, opacity: 0.78, side: THREE.DoubleSide });
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(bg, bm); b.rotation.y = PI / 2; const piv = new THREE.Group(); piv.rotation.x = (k / 3) * PI * 2; b.rotation.z = 0.0; b.rotation.x = 0.35; piv.add(b); blades.add(piv); }
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 0.9, 24), M.whitePlastic); hub.rotation.z = PI / 2; blades.add(hub);
      // motion blur disc (opacity follows the spin)
      S.blur = new THREE.Mesh(new THREE.CircleGeometry(F.R - 0.5, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color('#bfeeff'), transparent: true, opacity: 0, depthWrite: false }));
      S.blur.rotation.y = PI / 2; S.blur.position.x = 0.2; head.add(S.blur);
      // sticky-pad stack: the paper plane's launch stand
      const cols = ['#ff7be6', '#7fe8ff', '#ffd84a'];
      for (let k = 0; k < 3; k++) {
        const pad = new THREE.Mesh(new THREE.BoxGeometry(6.4, 2.6, 6.4), new THREE.MeshStandardMaterial({ color: new THREE.Color(cols[k]), roughness: 0.85 }));
        pad.position.set(F.x + 9.8, 1.3 + k * 2.62, F.z); pad.rotation.y = (k - 1) * 0.12; pad.castShadow = pad.receiveShadow = true; scene.add(pad);
      }
    }

    // ---------------------------------------------------------------- paper plane
    {
      const g = new THREE.BufferGeometry();
      // forward +z, up +y; span 7.5, length 9, slight dihedral
      const L = 9, Wd = 3.6, K = 1.7;
      // dart: two wings with dihedral, each folded once more along a crease, and a deep keel
      const nose = [0, -0.15, L / 2], tl = [-Wd, 1.05, -L / 2], tr = [Wd, 1.05, -L / 2], bt = [0, 0, -L / 2], kb = [0, -K, -L / 2 + 0.4];
      const fl = [-Wd * 0.3, 0.45, -L / 2], fr = [Wd * 0.3, 0.45, -L / 2];
      const tris = [nose, tl, fl, nose, fl, bt, nose, bt, fr, nose, fr, tr, nose, kb, bt, nose, bt, kb];
      const pos = new Float32Array(tris.flat());
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.computeVertexNormals();
      const pm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#f7f4ee'), roughness: 0.7, side: THREE.DoubleSide, flatShading: true });
      S.plane = new THREE.Mesh(g, pm); S.plane.castShadow = true; S.plane.receiveShadow = true;
      S.planeG = new THREE.Group(); S.planeG.add(S.plane); scene.add(S.planeG);
      // a magenta fold stripe on the wing (printed edge)
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -0.1, L / 2 - 0.2, -Wd * 0.98, 1.08, -L / 2 + 0.05, -Wd * 0.86, 1.0, -L / 2 + 0.05, 0, -0.1, L / 2 - 0.2, Wd * 0.86, 1.0, -L / 2 + 0.05, Wd * 0.98, 1.08, -L / 2 + 0.05]), 3));
      sg.computeVertexNormals();
      S.plane.add(new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: new THREE.Color(PAL.magenta), roughness: 0.6, side: THREE.DoubleSide })));
    }

    // ---------------------------------------------------------------- phone on a stand
    {
      const PH = CR.PH;
      const grp = (S.phone = new THREE.Group()); grp.position.set(PH.x, 0, PH.z); grp.rotation.y = PH.yaw; scene.add(grp);
      // stand: a walnut base + a slanted back
      const sb = new THREE.Mesh(new THREE.BoxGeometry(9, PH.baseY, 8), M.walnut); sb.position.set(0, PH.baseY / 2, -1.5); sb.castShadow = sb.receiveShadow = true; grp.add(sb);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 0.8), M.walnut); lip.position.set(0, PH.baseY + 0.4, 1.9); lip.castShadow = true; grp.add(lip);
      const back = new THREE.Mesh(new THREE.BoxGeometry(6, 11, 0.8), M.walnut);
      back.position.set(0, PH.baseY + 5.2 * Math.cos(PH.tilt), -0.9 - 5.2 * Math.sin(PH.tilt) - 0.9); back.rotation.x = -PH.tilt; back.castShadow = true; grp.add(back);
      const ph = (S.phoneBody = new THREE.Group()); ph.position.set(0, PH.baseY + 0.4, 1.0); ph.rotation.x = -PH.tilt; grp.add(ph);
      const body = new THREE.Mesh(new THREE.RoundedBoxGeometry(PH.w, PH.h, PH.d, 4, 0.7), new THREE.MeshStandardMaterial({ color: new THREE.Color('#1b1a22'), metalness: 0.7, roughness: 0.3 }));
      body.position.set(0, PH.h / 2, -PH.d / 2); body.castShadow = true; ph.add(body);
      // screen
      const c = canvas(720, 1500), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 1500); gr.addColorStop(0, '#2a0a3e'); gr.addColorStop(0.55, '#12052a'); gr.addColorStop(1, '#0a0012');
      g.fillStyle = gr; g.fillRect(0, 0, 720, 1500);
      const rg = g.createRadialGradient(360, 520, 20, 360, 520, 520); rg.addColorStop(0, 'rgba(255,43,214,0.35)'); rg.addColorStop(1, 'rgba(255,43,214,0)');
      g.fillStyle = rg; g.fillRect(0, 0, 720, 1500);
      g.fillStyle = '#ffffff'; g.textAlign = 'center';
      g.font = `300 150px ${FONT_H}`; g.fillText('09:41', 360, 300);
      // paper plane glyph (plain folded plane, not a logo)
      g.save(); g.translate(360, 640); g.scale(2.3, 2.3);
      g.fillStyle = '#00f0ff'; g.beginPath(); g.moveTo(-70, 6); g.lineTo(78, -52); g.lineTo(-22, 22); g.closePath(); g.fill();
      g.fillStyle = '#7ff7ff'; g.beginPath(); g.moveTo(-22, 22); g.lineTo(78, -52); g.lineTo(18, 62); g.closePath(); g.fill();
      g.fillStyle = '#00a9c4'; g.beginPath(); g.moveTo(-22, 22); g.lineTo(78, -52); g.lineTo(-8, 52); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = '#ffffff'; g.font = `700 92px ${FONT}`; g.fillText('t.me/aixenix', 360, 1000);
      g.fillStyle = 'rgba(255,255,255,0.78)'; g.font = `500 44px ${FONT_H}`; g.fillText('ИИ-инструменты', 360, 1090); g.fillText('каждый день', 360, 1145);
      g.fillStyle = PAL.magenta; g.beginPath(); if (g.roundRect) g.roundRect(150, 1250, 420, 96, 48); else g.rect(150, 1250, 420, 96); g.fill();
      g.fillStyle = '#ffffff'; g.font = `700 46px ${FONT_H}`; g.fillText('Подписаться', 360, 1313);
      const st = tex(c);
      S.screenM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#050507'), emissive: new THREE.Color('#ffffff'), emissiveMap: st, emissiveIntensity: 0, roughness: 0.08, metalness: 0.1 });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(PH.w - 0.5, PH.h - 0.6), S.screenM);
      scr.position.set(0, PH.h / 2, 0.012); ph.add(scr);
    }

    // ---------------------------------------------------------------- the «АВТОПИЛОТ» bar (a beech batten on its edge)
    {
      const B = CR.FD.bar;
      const rc = rulerCanvas(B.len, B.h, { ppc: 32 });
      const front = new THREE.MeshStandardMaterial({ map: tex(rc), roughness: 0.5 });
      const bc = canvas(4096, 212), bgx = bc.getContext('2d');
      bgx.drawImage(beechC, 0, 0, 4096, 212);
      // the label tape, centred on the back face (this face ends up on top when the bar falls)
      const lab = dymo('АВТОПИЛОТ', { w: 900, h: 150, size: 96, ls: 14, bg: '#141016' });
      bgx.save(); bgx.translate(2048, 106); bgx.rotate(PI); bgx.drawImage(lab, -450, -75); bgx.restore();
      const backM = new THREE.MeshStandardMaterial({ map: tex(bc), roughness: 0.5 });
      // box faces: px, nx, py, ny, pz(front), nz(back)
      const geo = new THREE.BoxGeometry(B.len, B.h, B.t);
      geo.translate(0, B.h / 2, -B.t / 2);
      S.bar = new THREE.Mesh(geo, [M.beech, M.beech, M.beech, M.beech, front, backM]);
      S.bar.castShadow = S.bar.receiveShadow = true; S.bar.matrixAutoUpdate = false; scene.add(S.bar);
    }

    // ---------------------------------------------------------------- banner roll «Бизнес на автопилоте»
    {
      const BN = CR.BN;
      const len = BN.dist + 3.5; // paper length
      const pxPerCm = 4096 / BN.w;
      const c = canvas(4096, Math.round(len * pxPerCm)), g = c.getContext('2d');
      g.fillStyle = PAL.paper; g.fillRect(0, 0, c.width, c.height);
      for (let k = 0; k < 2200; k++) { g.fillStyle = `rgba(120,100,70,${0.02 + 0.03 * h3(k, 1, 12)})`; g.fillRect(h3(k, 2, 12) * c.width, h3(k, 3, 12) * c.height, 1 + 3 * h3(k, 4, 12), 1 + 3 * h3(k, 5, 12)); }
      // v runs along the unrolled length (0 = the start, under the dominoes)
      const yAt = (cm) => cm * pxPerCm;
      g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = PAL.ink; g.font = `700 ${Math.round(5.4 * pxPerCm)}px ${FONT}`;
      if ('letterSpacing' in g) g.letterSpacing = '6px';
      g.fillText('Бизнес на автопилоте', 2048, yAt(8.0));
      if ('letterSpacing' in g) g.letterSpacing = '4px';
      g.font = `700 ${Math.round(4.5 * pxPerCm)}px ${FONT}`;
      g.fillStyle = '#c4169f'; g.textAlign = 'right'; g.fillText('aixenix.com', 2048 - 80, yAt(15.2));
      // paper plane pictogram + t.me/aixenix
      g.textAlign = 'left'; g.fillStyle = PAL.ink;
      const px = 2048 + 110, py = yAt(15.2) - 1.55 * pxPerCm;
      g.save(); g.translate(px + 1.9 * pxPerCm, py); g.scale(pxPerCm / 20, pxPerCm / 20);
      g.fillStyle = '#0096b4'; g.beginPath(); g.moveTo(-70, 6); g.lineTo(78, -52); g.lineTo(-22, 22); g.closePath(); g.fill();
      g.fillStyle = '#00c6e0'; g.beginPath(); g.moveTo(-22, 22); g.lineTo(78, -52); g.lineTo(18, 62); g.closePath(); g.fill();
      g.fillStyle = '#006f86'; g.beginPath(); g.moveTo(-22, 22); g.lineTo(78, -52); g.lineTo(-8, 52); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = PAL.ink; g.fillText('t.me/aixenix', px + 5.6 * pxPerCm, yAt(15.2));
      // a thin rule between the lines
      g.fillStyle = 'rgba(26,20,38,0.25)'; g.fillRect(2048 - 1.2 * pxPerCm * 10, yAt(10.3), 2.4 * pxPerCm * 10, 4);
      const bt = tex(c);
      S.bannerTex = bt; S.bannerLen = len;
      // flat part: a plane whose length and uv follow the travel
      const fg = new THREE.PlaneGeometry(BN.w, 1, 48, 12); fg.rotateX(-PI / 2);
      S.bannerBase = Float32Array.from(fg.attributes.position.array);
      S.bannerFlat = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.82 }));
      S.bannerFlat.receiveShadow = true; scene.add(S.bannerFlat);
      // roll: cylinder along x
      const rg = new THREE.CylinderGeometry(1, 1, BN.w, 48, 1, false); rg.rotateZ(PI / 2);
      const rollM = new THREE.MeshStandardMaterial({ color: new THREE.Color('#ece6d8'), roughness: 0.8 });
      S.roll = new THREE.Mesh(rg, rollM); S.roll.castShadow = true; S.roll.receiveShadow = true; scene.add(S.roll);
      // spiral end caps (paper layers)
      const ec = canvas(256, 256), eg = ec.getContext('2d'); eg.fillStyle = '#efe9db'; eg.fillRect(0, 0, 256, 256);
      eg.strokeStyle = 'rgba(120,100,70,0.5)'; eg.lineWidth = 2; eg.beginPath();
      for (let a = 0; a < PI * 2 * 9; a += 0.05) { const r = 20 + a * 1.9; eg.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); } eg.stroke();
      S.rollCapM = new THREE.MeshStandardMaterial({ map: tex(ec), roughness: 0.85 });
      S.rollCaps = [];
      for (const xs of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 40), S.rollCapM); cap.rotation.y = xs * PI / 2; scene.add(cap); S.rollCaps.push({ cap, xs }); }
    }

    // ---------------------------------------------------------------- the finger
    {
      const g = (S.finger = new THREE.Group()); scene.add(g);
      const prof = [];
      for (let i = 0; i <= 24; i++) { const a = (i / 24) * PI / 2; prof.push(new THREE.Vector2(Math.sin(a) * 0.9, 0.9 - Math.cos(a) * 0.9)); }
      prof.push(new THREE.Vector2(0.95, 3.0), new THREE.Vector2(1.02, 5.2), new THREE.Vector2(1.06, 6.4), new THREE.Vector2(1.0, 7.6), new THREE.Vector2(1.08, 9.0), new THREE.Vector2(1.18, 14), new THREE.Vector2(1.3, 22));
      const fg2 = new THREE.LatheGeometry(prof, 40);
      fg2.scale(1, 1, 0.82);
      const skin = new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e3a68c'), roughness: 0.46, sheen: 1.0, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ff9a86'), clearcoat: 0.3, clearcoatRoughness: 0.45 });
      // light through skin: a warm red rim where the surface turns away (cheap subsurface look)
      skin.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'float sssR = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.2);\noutgoingLight += vec3(0.55, 0.12, 0.07) * sssR * 0.55 + vec3(0.05, 0.012, 0.008);\n#include <opaque_fragment>');
      };
      skin.customProgramCacheKey = () => 'skin-sss';
      const fm = new THREE.Mesh(fg2, skin); fm.castShadow = true; g.add(fm);
      // nail
      const ng = new THREE.SphereGeometry(1, 32, 16, 0, PI * 2, 0, PI * 0.42); ng.scale(0.72, 0.18, 1.15);
      const nail = new THREE.Mesh(ng, new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#f3cfc4'), roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }));
      nail.rotation.x = -PI / 2; nail.position.set(0, 1.75, -0.6); g.add(nail);
      // knuckle crease hint
      // the nail's free edge: a thin pale crescent at the tip

    }

    // ---------------------------------------------------------------- set dressing (out of focus depth)
    {
      // a coffee mug back-left, a pencil cup back-right
      const mugP = [[0.01, 0], [3.6, 0], [3.9, 0.4], [4.0, 9.5], [3.7, 9.6], [3.6, 0.8], [0.01, 0.8]].map(([r, y]) => new THREE.Vector2(r, y));
      const mug = new THREE.Mesh(new THREE.LatheGeometry(mugP, 40), new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#2b2236'), roughness: 0.3, clearcoat: 0.8 }));
      mug.position.set(-104, 0, -62); mug.castShadow = mug.receiveShadow = true; scene.add(mug);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.55, 12, 24, PI * 1.2), mug.material); handle.position.set(-104 + 4.1, 5, -62); handle.rotation.z = -PI * 0.6; scene.add(handle);
      const cupP = [[0.01, 0], [3.2, 0], [3.3, 11], [3.0, 11], [2.9, 0.6], [0.01, 0.6]].map(([r, y]) => new THREE.Vector2(r, y));
      const cup = new THREE.Mesh(new THREE.LatheGeometry(cupP, 6), M.blackPlastic); cup.position.set(92, 0, -38); cup.castShadow = true; scene.add(cup);
      const pc = ['#e8b02a', '#d9a520', '#e0b84a', '#c8962a'];
      for (let k = 0; k < 6; k++) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 17, 6), new THREE.MeshStandardMaterial({ color: new THREE.Color(pc[k % 4]), roughness: 0.5 }));
        p.position.set(92 + Math.cos(k) * 1.6, 9.5, -38 + Math.sin(k * 1.7) * 1.6); p.rotation.set(0.12 * Math.sin(k * 2.1), 0, 0.14 * Math.cos(k * 1.3)); p.castShadow = true; scene.add(p);
      }
      // the office: a monitor on its stand behind the machine, its screen a soft out-of-focus dashboard glow
      {
        const mc = canvas(512, 288), mg2 = mc.getContext('2d');
        const gr2 = mg2.createLinearGradient(0, 0, 512, 288); gr2.addColorStop(0, '#1a0b33'); gr2.addColorStop(1, '#0b1630');
        mg2.fillStyle = gr2; mg2.fillRect(0, 0, 512, 288);
        for (let k = 0; k < 8; k++) { mg2.fillStyle = 'rgba(120,150,255,0.18)'; mg2.fillRect(40 + (k % 4) * 112, 60 + Math.floor(k / 4) * 110, 90, 80); }
        mg2.fillStyle = 'rgba(200,210,255,0.22)'; mg2.fillRect(40, 24, 300, 10);
        const mon = new THREE.Group(); mon.position.set(-8, -12, -84); scene.add(mon);
        const scrM = new THREE.MeshStandardMaterial({ color: 0x050508, emissive: 0xffffff, emissiveMap: tex(mc), emissiveIntensity: 0.9, roughness: 0.2 });
        const bezel = new THREE.Mesh(new THREE.BoxGeometry(78, 46, 1.6), M.blackPlastic); bezel.position.set(0, 44, 0); mon.add(bezel);
        const scr = new THREE.Mesh(new THREE.PlaneGeometry(75, 42.5), scrM); scr.position.set(0, 44, 0.82); mon.add(scr);
        const neck = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 2.2), M.blackPlastic); neck.position.set(0, 11, -2); mon.add(neck);
        
        S.monLight = new THREE.PointLight(new THREE.Color('#8fb0ff'), 70, 90, 2); S.monLight.position.set(-8, 40, -66); scene.add(S.monLight);
      }
      // a notebook under the phone side
      const nb = new THREE.Mesh(new THREE.BoxGeometry(22, 1.2, 28), new THREE.MeshStandardMaterial({ color: new THREE.Color('#3a1550'), roughness: 0.7 }));
      nb.position.set(86, 0.6, 18); nb.rotation.y = -0.2; nb.castShadow = nb.receiveShadow = true; scene.add(nb);
    }

    // ---------------------------------------------------------------- merge inside moving rigs (local space)
    const mergeLocal = (grp, keep) => {
      grp.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert();
      const by = new Map(); const vic = [];
      grp.traverse((o) => {
        if (o === grp || !o.isMesh || Array.isArray(o.material) || o.material.transparent || (keep && keep.has(o))) return;
        for (let p = o.parent; p && p !== grp; p = p.parent) if (keep && keep.has(p)) return;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        g.clearGroups();
        g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        const k = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
        if (!by.has(k)) by.set(k, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
        by.get(k).geos.push(g); vic.push(o);
      });
      for (const o of vic) o.parent.remove(o);
      for (const g of by.values()) { const m = new THREE.Mesh(THREE.BufferGeometryUtils.mergeGeometries(g.geos, false), g.mat); m.castShadow = g.cast; m.receiveShadow = g.recv; grp.add(m); }
    };
    mergeLocal(S.plank);
    mergeLocal(S.arm, new Set([S.stamp]));
    mergeLocal(S.stamp);
    mergeLocal(S.finger);
    mergeLocal(S.phoneBody, new Set([S.phoneBody.children.find((c) => c.material === S.screenM)]));

    // ---------------------------------------------------------------- merge every static mesh per material
    // (one draw call per material instead of hundreds; animated subtrees are left alone)
    {
      const dyn = new Set([S.marble, S.arm, S.cat, S.coin, S.plank, S.fanBtn, S.blades, S.blur, S.planeG, S.bar, S.hero,
        S.domLine, S.domField, S.plates, S.bannerFlat, S.roll, S.finger, S.phoneBody, S.key, S.key.target].concat(S.rollCaps.map((c) => c.cap), S.keys.map((k) => k.mesh)));
      scene.updateMatrixWorld(true);
      const groups = new Map();
      const victims = [];
      scene.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || Array.isArray(o.material) || o.material.transparent) return;
        for (let p = o; p; p = p.parent) if (dyn.has(p)) return;
        const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        if (!g.attributes.normal) g.computeVertexNormals();
        g.clearGroups();
        g.applyMatrix4(o.matrixWorld);
        if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, geos: [] });
        groups.get(key).geos.push(g);
        victims.push(o);
      });
      for (const o of victims) o.parent.remove(o);
      for (const g of groups.values()) {
        const merged = THREE.BufferGeometryUtils.mergeGeometries(g.geos, false);
        const m = new THREE.Mesh(merged, g.mat); m.castShadow = g.cast; m.receiveShadow = g.recv; m.matrixAutoUpdate = false;
        scene.add(m);
      }
      S.merged = groups.size; S.mergedFrom = victims.length;
    }
    return S;
  };

  // ================================================================== UPDATE (pure function of T)
  const mtx = new THREE.Matrix4();
  W.update = function (T) {
    const S = W.S;
    const L = CR.L;
    // ---- the «заявка» line (hero + 13)
    const la = CR.line.angles(T);
    const lineY = L.riser.y;
    // hero: falls toward -x; its pivot is the front-bottom edge at x = heroX
    hingeMatrix(mtx, L.heroX, lineY, L.lineZ, -1, 0, la[0]);
    S.hero.matrix.copy(mtx); S.hero.matrixWorldNeedsUpdate = true;
    for (let k = 1; k < CR.line.n; k++) {
      const x = L.heroX - CR.line.d[k].p;
      hingeMatrix(mtx, x, lineY, L.lineZ, -1, 0, la[k]);
      S.domLine.setMatrixAt(k - 1, mtx);
    }
    S.domLine.instanceMatrix.needsUpdate = true;
    let di = 0;
    // ---- the field chain: trigger, bar, rows
    const fa = CR.field.angles(T);
    const FD = CR.FD, my = S.matY;
    // the trigger is an ivory domino (the plane's light step onto the heavy batten)
    hingeMatrix(mtx, FD.trigX, my, FD.zOff + CR.field.d[0].p, 0, 1, fa[0]);
    S.domLine.setMatrixAt(CR.line.n - 1, mtx); S.domLine.instanceMatrix.needsUpdate = true;
    hingeMatrix(mtx, 0, my, FD.zOff + CR.field.d[1].p, 0, 1, fa[1]);
    S.bar.matrix.copy(mtx); S.bar.matrixWorldNeedsUpdate = true;
    let pi = 0;
    for (let r = 0; r < FD.rows; r++) {
      const z = FD.zOff + CR.field.d[2 + r].p;
      let th = fa[2 + r];
      // the last row is stopped by the roll for a moment, then lies down on the paper
      for (let c = 0; c < FD.cols; c++) {
        const x = FD.x0 + c * FD.pitchX;
        hingeMatrix(mtx, x, my, z, 0, 1, th);
        S.domField.setMatrixAt(di++, mtx);
        S.plates.setMatrixAt(pi++, mtx);
      }
    }
    S.domField.instanceMatrix.needsUpdate = true; S.plates.instanceMatrix.needsUpdate = true;

    // ---- marble + keys
    const mp = CR.M.pos(T);
    let mx = mp.x, myy = mp.y, mz = mp.z;
    if (mp.phase === 'tray') {
      // ride the lever: the tray point (-rTray, 0.5 + R) in the arm frame, rotated by -phi
      const LV = CR.LV, ph = LV.phi(T), yl = 0.5 + CR.M.R;
      mx = LV.px - LV.rTray * Math.cos(ph) + yl * Math.sin(ph);
      myy = LV.py + LV.rTray * Math.sin(ph) + yl * Math.cos(ph);
      const u = T - CR.M.tLand;
      myy += 0.35 * Math.exp(-u * 9) * Math.abs(Math.sin(u * 26));
    }
    S.marble.position.set(mx, myy, mz);
    S.marble.rotation.set(0, 0, mp.roll);
    for (const K of S.keys) {
      const dt = T - K.k.t;
      const on = dt >= 0 ? Math.exp(-dt * 9) : 0;
      K.m.emissiveIntensity = 0.9 * on;
      K.mesh.rotation.x = dt >= 0 ? 0.035 * Math.exp(-dt * 10) * Math.sin(dt * 95) : 0;
      K.mesh.position.y = K.y0 - (dt >= 0 ? 0.06 * Math.exp(-dt * 14) : 0);
    }
    // ---- lever + stamp + seal
    const LV = CR.LV;
    const phi = LV.phi(T);
    S.arm.rotation.set(0, 0, -phi); // tip at -x goes up for phi > 0
    S.stamp.rotation.set(0, 0, phi + LV.stampSwing(T));
    S.seal.material.opacity = T >= LV.tImp ? 0.92 : 0;
    // ---- catapult + coin
    const CP = CR.CP;
    S.cat.rotation.set(CR.CP.psi(T), 0, 0);
    S.cat.position.set(CP.x, CP.fy + CP.th / 2, CP.fz);
    const cp = CR.COIN.pos(T);
    S.coin.visible = !cp.inside;
    S.coin.position.set(cp.x, cp.y, cp.z);
    S.coin.rotation.set(cp.flip, 0.3, 0);
    // ---- balance
    S.plank.rotation.set(-CR.BL.beta(T), 0, 0);
    // ---- fan
    const FAN = CR.FAN;
    S.blades.rotation.x = FAN.angle(T);
    const spin = FAN.omega(T) / FAN.W;
    S.blur.material.opacity = 0.32 * sstep(0.15, 0.9, spin);
    S.fanBtn.position.y = 1.5 + 0.35 - (T >= CR.BL.tBtn ? 0.32 : 0);
    S.fanBtn.material.emissiveIntensity = T >= CR.BL.tBtn ? 0.9 : 0;
    // ---- plane
    const pp = CR.PL.pose(T);
    S.planeG.position.set(pp.p[0], pp.p[1], pp.p[2]);
    const f = new THREE.Vector3(pp.fwd[0], pp.fwd[1], pp.fwd[2]).normalize();
    const yaw = Math.atan2(f.x, f.z), pitch = -Math.asin(clamp(f.y, -1, 1)) + (pp.pitch ? -pp.pitch : 0);
    S.planeG.rotation.set(0, 0, 0); S.planeG.rotation.order = 'YXZ';
    S.planeG.rotation.set(pitch, yaw, -pp.bank);
    // ---- phone: wakes on the tap
    const on = T >= CR.PL.tHit ? sstep(0, 0.12, T - CR.PL.tHit) : 0;
    S.screenM.emissiveIntensity = 1.15 * on;
    S.phoneLight.intensity = 90 * on;
    S.phoneLight.position.set(CR.PH.center.x + 2, CR.PH.center.y, CR.PH.center.z + 6);
    // ---- banner
    const BN = CR.BN;
    const tr = BN.travel(T), r = BN.radius(T);
    const rz = BN.z0 + tr;
    S.roll.position.set(0, my + r, rz); S.roll.scale.set(1, r, r);
    S.roll.rotation.set(tr / Math.max(0.6, r), 0, 0);
    for (const { cap, xs } of S.rollCaps) { cap.position.set(xs * (BN.w / 2 + 0.01), my + r, rz); cap.scale.set(r, r, 1); cap.rotation.set(0, xs * PI / 2, 0); cap.rotateZ(tr / Math.max(0.6, r)); }
    const flatLen = Math.max(0.001, tr);
    S.bannerFlat.visible = tr > 0.01;
    S.bannerFlat.scale.set(1, 1, flatLen);
    const startZ = BN.z0 - BN.r0 * 0.2;
    S.bannerFlat.position.set(0, my + 0.03, startZ + flatLen / 2 - BN.r0 * 0.0);
    const tx = S.bannerTex; tx.repeat.set(1, flatLen / S.bannerLen); tx.offset.set(0, 1 - flatLen / S.bannerLen);
    // the fan's breeze lifts the banner's left end: periodic with the bar, so the last bar loops
    {
      const pos = S.bannerFlat.geometry.attributes.position, base = S.bannerBase;
      const BAR = 16 * CR.S16;
      const on = sstep(BN.tStop, BN.tStop + 0.8, T);
      const ph = (T / BAR) * PI * 2;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        const ex = clamp((-x - BN.w * 0.22) / (BN.w * 0.28), 0, 1); // 0 in the middle -> 1 at the left end
        const ez = 0.5 + z; // 0 at the start (under the dominoes) -> 1 at the roll
        const lift = on * ex * ex * Math.sin(ez * PI) * (0.55 + 0.35 * Math.sin(ph * 2 + ex * 2.2 + ez * 1.5) + 0.15 * Math.sin(ph * 4 + ex * 4));
        pos.setY(i, base[i * 3 + 1] + lift * 1.7);
      }
      pos.needsUpdate = true;
      S.bannerFlat.geometry.computeVertexNormals();
    }
    // ---- finger
    W.finger(T);
  };

  // the finger: comes in, flicks the hero domino over its tipping point, withdraws
  W.finger = function (T) {
    const S = W.S, L = CR.L, H = L.hero;
    const t0 = CR.tn(CR.N.tap);
    const push = CR.line.push;
    const vis = T > t0 - 1.2 && T < t0 + 0.75;
    S.finger.visible = vis;
    if (!vis) return;
    // contact point on the hero's text face (back face, +x side) near the top
    const th = CR.line.angles(T)[0];
    const yC = 7.7;
    const cxp = L.heroX + H.t; // back face x when standing
    // rotate the contact point with the domino (about the pivot edge at heroX)
    const px = L.heroX + (H.t) * Math.cos(th) - yC * Math.sin(th);
    const py = L.riser.y + (H.t) * Math.sin(th) + yC * Math.cos(th);
    void cxp;
    // approach path (from the camera side) before the tap, follow during the push, retreat after
    const u = T - t0;
    let off;
    if (u < 0) {
      const k = sstep(-1.2, 0, u);
      off = [lerp(9, 0.0, k), lerp(5, 0.1, k), lerp(6.5, 0.4, k)];
    } else if (u < push.dur + 0.05) {
      off = [0.0, 0.1, 0.4];
    } else {
      const k = sstep(push.dur + 0.05, push.dur + 0.55, u);
      off = [lerp(0.0, 10, k), lerp(0.1, 11, k), lerp(0.4, -6, k)];
    }
    const contactX = u < push.dur + 0.05 ? px : L.heroX + H.t * Math.cos(Math.min(th, 0.28)) - yC * Math.sin(Math.min(th, 0.28));
    const contactY = u < push.dur + 0.05 ? py : L.riser.y + H.t * Math.sin(Math.min(th, 0.28)) + yC * Math.cos(Math.min(th, 0.28));
    // fingertip pad touches the face; the finger comes from screen-right / toward the lens, nail up
    const Y = new THREE.Vector3(0.67, 0.2, -0.62).normalize();
    const Zt = new THREE.Vector3(-1, -0.15, 0); // pad (local +z) faces the domino
    const Z = Zt.sub(Y.clone().multiplyScalar(Zt.dot(Y))).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    const B = new THREE.Matrix4().makeBasis(X, Y, Z);
    S.finger.quaternion.setFromRotationMatrix(B);
    // the pad sits ~0.85 off the axis toward local +z: put the axis so the pad touches the face
    S.finger.position.set(contactX + 0.85 + off[0], contactY + 0.9 + off[1], L.lineZ + 0.6 + off[2]);
  };
})();
