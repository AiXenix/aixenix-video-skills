// Shot 6 'tilt' — bar 6 of the single take of the AiXenix watercolour ad. The whole picture is
// FILM.cast.frame(ctx, T): the painting (src/cast.js on the engine src/props.js) at global T, the
// falling drops, and the camera (zoom / tilt). Every shot draws the same sheet, so the cuts are invisible.
(function () {
  'use strict';
  FILM.scene({
    id: 'tilt',
    draw(ctx, t, info) {
      FILM.cast.frame(ctx, info.shot.start + Math.min(Math.max(t, 0), info.dur));
    },
  });
})();
