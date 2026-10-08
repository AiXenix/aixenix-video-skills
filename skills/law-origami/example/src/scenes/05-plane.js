/*
 * 05-plane — «Самолётик» (T 9.600 .. 10.667 s, beats 18..20).
 * The arrow lies down, folds in half, the wings fold out: a paper plane.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'plane';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
