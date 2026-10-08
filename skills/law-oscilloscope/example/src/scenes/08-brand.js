// 08 brand : the oscilloscope at global time T. Every lit pixel is the beam of FILM.osc
// (src/cast.js); this shot only names a stretch of the one continuous take (src/timeline.js).
(function () {
  'use strict';
  FILM.scene({ id: 'brand', draw(ctx, t, info) { FILM.scope.draw(ctx, info.T); } });
})();
