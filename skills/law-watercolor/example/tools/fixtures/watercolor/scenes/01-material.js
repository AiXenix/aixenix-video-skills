// Material test sheet for the watercolour engine. Every phenomenon on one page.
(function () {
  'use strict';
  const ID = 'material';
  const WC = FILM.wc;
  const P = WC.PIG;
  function def() {
    const L0 = [], L1 = [];
    // 1 wet-on-wet violet bloom into a pre-wetted circle, stopped early (soft feather), salt
    const grains = [];
    for (let k = 0; k < 26; k++) {
      const a = WC.hh(k, 1, 5) * Math.PI * 2, rr = Math.sqrt(WC.hh(k, 2, 5)) * 150;
      grains.push([330 + Math.cos(a) * rr, 330 + Math.sin(a) * rr, 9 + WC.hh(k, 3, 5) * 14]);
    }
    L0.push({ bbox: [100, 100, 560, 560], shape: (g) => WC.blobPath(g, 330, 330, 215, 11, 0.12), drops: [[330, 330, 0.5, 10]], pig: 'violet', v: 150, sigma: 1.2, tFlow: 2.1, featherStop: 0.5, conc: 0.7, wet: [0.1, 2.6, 4.6], salt: { t: 1.9, dur: 1.6, grains } });
    // 3 yellow + cerulean meeting wet-in-wet
    L0.push({ bbox: [1250, 140, 1560, 480], shape: (g) => WC.blobPath(g, 1400, 310, 150, 21, 0.15), drops: [[1330, 300, 0.8, 8]], pig: 'yellow', v: 190, merge: true, tFlow: 2.8, conc: 0.95, wet: [0.5, 3.0, 4.8] });
    L0.push({ bbox: [1450, 140, 1800, 480], shape: (g) => WC.blobPath(g, 1630, 310, 150, 23, 0.15), drops: [[1700, 320, 1.1, 8]], pig: 'cerulean', v: 190, merge: true, tFlow: 2.8, conc: 0.9, wet: [0.8, 3.0, 4.8] });
    // 4 ultramarine granulating wash
    L0.push({ bbox: [120, 640, 640, 980], shape: (g) => WC.blobPath(g, 380, 810, 190, 31, 0.2), drops: [[300, 780, 1.0, 10], [470, 850, 1.3, 10]], pig: 'ultramarine', v: 240, tFlow: 3.2, gran: 0.75, floc: 0.25, conc: 0.85, wet: [0.7, 3.2, 5.2] });
    // 5 glaze base yellow
    L0.push({ bbox: [760, 640, 1080, 960], shape: (g) => WC.blobPath(g, 900, 800, 140, 41, 0.12), drops: [[900, 800, 0.6, 8]], pig: 'gold', v: 200, tFlow: 2.0, conc: 0.8, wet: [0.3, 2.0, 3.4] });
    // 7 dots
    const dc = ['rose', 'teal', 'orange', 'opera', 'sap', 'cerulean', 'scarlet', 'yellow', 'lilac', 'violet'];
    for (let k = 0; k < 10; k++) {
      const x = 640 + k * 40, y = 560 + Math.sin(k) * 30, r = 7 + (k % 3) * 4;
      L0.push({ bbox: [x - r - 4, y - r - 4, x + r + 4, y + r + 4], shape: (g) => WC.blobPath(g, x, y, r, 50 + k, 0.2, 20), drops: [[x, y, 1.5 + k * 0.12, 3]], pig: dc[k], v: 60, tFlow: 3.5 + k * 0.12, conc: 1.1, wet: [1.3 + k * 0.12, 3.6 + k * 0.1, 5.2] });
    }
    // 2 rose flower: 5 petals with dry gaps, a backrun in one petal
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      const cx = 900, cy = 300;
      const bx = cx + Math.cos(a) * 14, by = cy + Math.sin(a) * 14;
      const reg = { bbox: [cx - 170, cy - 170, cx + 170, cy + 170], shape: (g) => WC.petalPath(g, cx, cy, a, 150, 78, 60 + k, 0.16), drops: [[cx + Math.cos(a) * 34, cy + Math.sin(a) * 34, 0.9 + k * 0.15, 6]], pig: k % 2 ? 'rose' : 'opera', v: 230, tFlow: 2.6 + k * 0.15, conc: 0.9, srcBoost: 1.0, wet: [0.6 + k * 0.15, 2.6 + k * 0.15, 4.2 + k * 0.15] };
      if (k === 1) reg.backruns = [{ x: cx + Math.cos(a) * 105, y: cy + Math.sin(a) * 105, t: 2.4, v: 80, stop: 3.4, sigma: 1.8 }];
      L1.push(reg);
    }
    L1.push({ bbox: [860, 260, 940, 340], shape: (g) => WC.blobPath(g, 900, 300, 26, 70, 0.2, 24), drops: [[900, 300, 1.8, 6]], pig: 'sienna', v: 60, bleed: 0.25, tFlow: 3.0, gran: 0.8, conc: 1.2, wet: [1.7, 3.0, 4.6] });
    // 5 glaze over: rose
    L1.push({ bbox: [880, 660, 1200, 980], shape: (g) => WC.blobPath(g, 1030, 820, 135, 43, 0.12), drops: [[1030, 820, 2.2, 8]], pig: 'rose', v: 200, tFlow: 3.6, conc: 0.75, wet: [2.0, 3.6, 5.0] });
    // 6 lettering
    const grad = (x) => { const u = WC.clamp((x - 1260) / 520, 0, 1); return u < 0.5 ? WC.mixAbs(P.magenta, P.bviolet, u * 2) : WC.mixAbs(P.bviolet, P.cyan, (u - 0.5) * 2); };
    L1.push({ bbox: [1200, 680, 1900, 900], warp: 1.6, shape: (g) => { g.font = '700 128px Futura'; g.textBaseline = 'alphabetic'; g.fillText('Акварель', 1230, 850); }, sweep: { t0: 3.0, x0: 1230, v: 900 }, pig: (x, y) => grad(x), v: 260, sigma: 1.0, bleed: 0.05, tFlow: 4.6, merge: true, conc: 0.8, rim: 1.1, wet: [2.7, 7.6, 9] });
    return { seed: 'fixture-material', layers: [{ name: 'under', regions: L0 }, { name: 'over', regions: L1 }] };
  }
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      const pnt = WC.build('fixture-material', def());
      WC.render(ctx, pnt, info.T, {});
    },
  });
})();
