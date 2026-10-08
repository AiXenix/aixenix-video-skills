// 08 loop [22.4, 24.0] — the same card, the ink dry, the candle breathing on a one-bar cycle.
(function () {
  'use strict';
  const C = () => FILM.cast;
  const PC = FILM.prog.PAGE_C;
  FILM.scene({ id: 'loop', draw(ctx, tIn, info) {
    const cc = FILM.CARD_CAM;
    C().render(ctx, info.T, { pos: cc.pos, look: cc.look, up: cc.up, fov: cc.fov, focus: FILM.prog.pageToWorld(-0.0005, -0.0152, 0), fstop: 0.1, exposure: 1.0, rscale: 1 });
  } });
})();
