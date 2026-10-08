/*
 * 02-fold — «Пополам» (T 2.133 .. 3.200 s, beats 4..6).
 * The page folds its top half back behind itself (the reverse side is sealed inside from now on), lies down, turns.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'fold';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
