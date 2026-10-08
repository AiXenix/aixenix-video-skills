/*
 * 09-loop — «Петля» (T 19.200 .. 21.333 s, beats 36..40).
 * The card holds; only the raking light breathes, period one bar: a seamless loop.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'loop';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
