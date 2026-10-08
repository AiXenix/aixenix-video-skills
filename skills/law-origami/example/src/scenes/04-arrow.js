/*
 * 04-arrow — «Стрела» (T 6.400 .. 9.600 s, beats 12..18).
 * The gear unrolls flat; keel crease, corners, edges fold in: a long arrow that stands up and hops — growth.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'arrow';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
