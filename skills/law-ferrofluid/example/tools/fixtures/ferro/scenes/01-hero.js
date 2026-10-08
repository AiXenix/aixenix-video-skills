(function () {
  'use strict';
  const MAG = [1.0, 0.17, 0.84], CYA = [0.0, 0.94, 1.0], WHT = [1, 0.97, 0.93], VIO = [0.75, 0.0, 1.0];
  function fitText(g, FD, str, x, z, maxW, sizeW, weight, family) {
    const px = FD.px;
    g.font = `${weight} ${(sizeW * px).toFixed(1)}px ${family}`;
    const w = g.measureText(str).width;
    const k = Math.min(1, (maxW * px) / w);
    g.save();
    g.translate((x - FD.x0) * px, (z - FD.z0) * px);
    g.scale(k, 1);
    g.fillText(str, 0, 0);
    g.restore();
  }
  function field(g, FD) {
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff';
    g.globalAlpha = 1 / 1.5;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    fitText(g, FD, 'АВТОПИЛОТ', 0, -0.6, 15.5, 2.9, 700, 'Futura');
    g.restore();
  }
  function engrave(e) {
    e.save();
    e.fillStyle = '#fff';
    e.font = '600 0.55px Futura';
    e.textAlign = 'center';
    e.textBaseline = 'middle';
    e.fillText('aixenix.com', 0, 7.2);
    e.restore();
  }
  const LT = (k) => [
      { az: -90, el: 10, w: 0.8, h: 0.3, soft: 0.15, power: 30, color: MAG },
      { az: 90, el: 10, w: 0.8, h: 0.3, soft: 0.15, power: 30, color: CYA },
      { az: 180, el: 25, w: 0.8, h: 0.25, soft: 0.1, power: 26, color: WHT },
      { az: 0, el: 30, w: 0.5, h: 0.006, soft: 0.003, power: 30 * k, color: WHT },
      { az: 0, el: 50, w: 1.5, h: 0.4, soft: 0.4, power: 0.1, color: WHT } ];
  const V = [
    { el: 58, D: 21, look: [0, 0, -0.1], aper: 0, sp: { a: 0.16, h: 0.26, fc: 0.3, mound: 0.1, kr: 0.85, coneK: 1.5 }, L: LT(0) },
    { el: 20, D: 4.5, look: [-2.2, 0.1, -0.2], aper: 40, sp: { a: 0.16, h: 0.26, fc: 0.3, mound: 0.1, kr: 0.85, coneK: 1.5 }, L: LT(0) },
    { el: 32, D: 6, look: [-2.2, 0.1, -0.4], aper: 30, sp: { a: 0.16, h: 0.26, fc: 0.3, mound: 0.1, kr: 0.85, coneK: 1.5 }, L: LT(0) },
    { el: 62, D: 21, look: [0, 0, -0.1], aper: 0, sp: { a: 0.16, h: 0.21, fc: 0.3, mound: 0.1, kr: 0.88, coneK: 1.4 }, L: LT(0) },
  ];
  FILM.scene({ id: 'hero', draw(ctx, t, info) {
    const T = info.T;
    const v = V[Math.min(V.length - 1, Math.floor(T / 0.5))];
    const el = v.el * Math.PI / 180, D = v.D, L0 = v.look;
    FILM.ferro.render(ctx, {
      T,
      cam: { pos: [L0[0], L0[1] + D * Math.sin(el), L0[2] + D * Math.cos(el)], look: L0, fov: 30, focus: D, aper: v.aper },
      field, engrave, engraveKey: 'fx',
      spike: v.sp, lights: v.L,
      amb: { top: [0.002, 0.0012, 0.004], bot: [0.0006, 0.0003, 0.001] },
      etch: { front: 99, soft: 1, bright: 0.25 },
      post: { bloom: 0.45, exposure: 1.0 },
    });
  } });
})();
