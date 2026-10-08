// Shot 'hook' (bar 2). One bar of the single take: the wall, the paint, the tools and the camera
// all come from FILM.G (src/cast.js) at global time, so the bars join without a seam.
(function () {
  'use strict';
  FILM.scene({
    id: 'hook',
    draw(ctx, t, info) {
      FILM.G.frame(ctx, info.shot.start + Math.min(t, info.dur - 1e-6));
    },
  });
})();
