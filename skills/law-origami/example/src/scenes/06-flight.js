/*
 * 06-flight — «Полёт» (T 10.667 .. 14.400 s, beats 20..27).
 * Takes off, flies one loop through the frame, glides, touches down and slides to a stop.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'flight';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
