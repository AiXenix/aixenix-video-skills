// shot 7 'card' — one continuous take: the shared sky and the flock at global T (src/cast.js, FILM.flock.SCRIPT).
(function () {
  'use strict';
  FILM.scene({
    id: 'card',
    draw(ctx, t, info) {
      FILM.flock.render(ctx, info.T, FILM.flock.SCRIPT);
    },
  });
})();
