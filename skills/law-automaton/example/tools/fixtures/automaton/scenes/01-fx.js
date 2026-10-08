(function () {
  'use strict';
  const O = (typeof window !== 'undefined' && window.__FXV) || {};
  for (const [id, T0, cam] of window.__VIEWS) FILM.scene({ id, draw(ctx, t) { FILM.cast.render(ctx, T0 + t * 0.2, Object.assign({}, cam, O[id] || {})); } });
})();
