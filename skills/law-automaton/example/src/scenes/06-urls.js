// 06 urls [16.0, 20.8] — the last card: «aixenix.com», a paper plane and «t.me/aixenix»; the camera
// climbs from three-quarter to the top-down card framing; the quill goes back to the well.
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'urls', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const T = info.shot.start + t;
    const k = C().ease5(t / info.dur);
    const card = FILM.CARD_CAM;
    const pos = C().mixv([0.13, 0.26, 0.26], card.pos, k);
    const look = C().mixv([0.0, 0.0, 0.01], card.look, k);
    const up = C().mixv([0, 1, 0], card.up, C().ease((t - 2.0) / 2.6));
    C().render(ctx, T, { pos, look, up, fov: 30 + (card.fov - 30) * k, focus: 'nib', fstop: 0.35 - 0.2 * k, exposure: 1.0 });
  } });
})();
