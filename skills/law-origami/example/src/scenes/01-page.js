/*
 * 01-page — «Лист» (T 0.000 .. 2.133 s, beats 0..4).
 * A printed page lies on the desk: «Один лист. Ни одного разреза.» — routine. It breathes, then stands up to face us.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'page';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
