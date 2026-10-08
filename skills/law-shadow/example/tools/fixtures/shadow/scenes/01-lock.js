(function () {
  'use strict';
  // fixture: film time 1.0 .. 3.67 (chaos → «ХАОС?» lock at film 2.0)
  FILM.scene({ id: 'lock', draw(ctx, t, info) { FILM.shadow.draw(ctx, 1.0 + t); } });
})();
