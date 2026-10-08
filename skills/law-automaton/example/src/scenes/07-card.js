// 07 card [20.8, 22.4] — the machine stops; the finished sheet is the final card; the last line dries.
// Owns FILM.CARD_CAM (the card framing shared with 06 and 08).
(function () {
  'use strict';
  const C = () => FILM.cast;
  const PC = FILM.prog.PAGE_C;
  // framing: the four card lines (Бизнес на автопилоте .. t.me/aixenix) fill the frame; the hook line runs off
  // the top edge like a letter held close; the camera leans in from the scribe's side (~12 deg) so the
  // sheet reads as paper on a desk, not a flat title card.
  const ctr = FILM.prog.pageToWorld(-0.0005, -0.0152, 0);
  FILM.CARD_CAM = { pos: [ctr[0] - 0.002, 0.224, ctr[2] + 0.05], look: [ctr[0], 0.0, ctr[2] + 0.002], up: [-Math.sin(FILM.prog.PAGE_PSI), 0, -Math.cos(FILM.prog.PAGE_PSI)], fov: 27 };
  FILM.scene({ id: 'card', draw(ctx, tIn, info) {
    const cc = FILM.CARD_CAM;
    C().render(ctx, info.T, { pos: cc.pos, look: cc.look, up: cc.up, fov: cc.fov, focus: ctr, fstop: 0.1, exposure: 1.0, rscale: 1 });
  } });
})();
