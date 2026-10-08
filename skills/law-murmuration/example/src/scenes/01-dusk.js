// shot 1 'dusk' — one continuous take: the shared sky and the flock at global T (src/cast.js, FILM.flock.SCRIPT).
(function () {
  'use strict';
  FILM.scene({
    id: 'dusk',
    draw(ctx, t, info) {
      FILM.flock.render(ctx, info.T, FILM.flock.SCRIPT);
    },
  });
})();
