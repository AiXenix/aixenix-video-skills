// shot 6 'plane' — one continuous take: the shared sky and the flock at global T (src/cast.js, FILM.flock.SCRIPT).
(function () {
  'use strict';
  FILM.scene({
    id: 'plane',
    draw(ctx, t, info) {
      FILM.flock.render(ctx, info.T, FILM.flock.SCRIPT);
    },
  });
})();
