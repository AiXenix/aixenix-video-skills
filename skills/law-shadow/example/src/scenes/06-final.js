/*
 * Shot 06 — final. Global T: see src/timeline.js.
 * Layers (back to front) are rendered by the shared rig in src/cast.js:
 *   1 room (wall + floor with glossy reflection)  2 projector occlusion maps of the junk
 *   3 the junk cloud (scraps + office junk)        4 light fixtures, dust motes
 *   5 volumetric haze in the three framed beams    6 bloom, grade, grain
 * Nothing on the wall is drawn: every mark is the shadow-mapped junk.
 */
(function () {
  'use strict';
  const ID = 'final';
  FILM.scene({
    id: ID,
    draw(ctx, t, info) {
      FILM.shadow.draw(ctx, info.T);
    },
  });
})();
