/*
 * 07-open — «Раскрытие» (T 14.400 .. 17.067 s, beats 27..32).
 * Wings up, the body falls open, the flaps swing back like doors; the folded card opens like a book: the inside is the message.
 * One continuous take: the sheet, its folds, the camera and the light are all computed by the
 * origami engine (src/cast.js) as a pure function of global time, so a cut is invisible.
 */
(function () {
  'use strict';
  const ID = 'open';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.origami.render(ctx, info.shot.start + Math.min(t, info.dur));
    },
  });
})();
