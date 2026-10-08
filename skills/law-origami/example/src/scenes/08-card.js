/*
 * 08-card — «Карта» (T 17.067 .. 19.200 s, beats 32..36).
 * AiXenix · Бизнес на автопилоте · aixenix.com · t.me/aixenix on the opened sheet; a raking light makes every crease it ever made glow.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'card';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
