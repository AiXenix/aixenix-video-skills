/*
 * 03-gear — «Шестерня» (T 3.200 .. 6.400 s, beats 6..12).
 * Teeth pleat in pairs from the middle on 8ths; the strip curls shut into an 8-tooth gear; it lifts and ticks one full turn on 16ths.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'gear';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
