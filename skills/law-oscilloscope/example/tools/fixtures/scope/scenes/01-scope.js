(function () {
  'use strict';
  // bar 4 of the film (the gear train): a shape, its pitch pattern, kicks and snares
  FILM.scene({ id: 'scope', draw(ctx, t) { FILM.scope.draw(ctx, FILM.osc.at(4, 0) + t); } });
})();
