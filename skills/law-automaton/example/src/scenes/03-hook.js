// 03 hook [2.4, 6.4] — over the right shoulder, tracking the nib along «Автоматизация с 1774».
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'hook', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const T = info.shot.start + t;
    const n = C().nibAvg(T, 0.7, 9);
    const xs = Math.max(-0.05, Math.min(0.07, n[0]));
    C().render(ctx, T, {
      pos: [xs + 0.095, 0.2, 0.15 - t * 0.004],
      look: [xs - 0.014, 0.0, -0.036],
      fov: 28, focus: 'nib', fstop: 0.4, exposure: 1.0,
    });
  } });
})();
