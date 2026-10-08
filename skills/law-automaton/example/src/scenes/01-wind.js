// 01 wind [0.0, 1.6] — the key on the scribe's back turns three clicks (beats 2-4); fade in from black.
// Layers: the world (cast.js). Camera behind-left, the key low in frame, the dark oval window above.
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'wind', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const key = C().anchor(info.T, 'key');
    const u = C().ease(t / info.dur);
    const off = C().mixv([-0.06, 0.03, 0.12], [-0.045, 0.024, 0.095], u);
    C().render(ctx, info.T, {
      pos: [key[0] + off[0], key[1] + off[1], key[2] + off[2]],
      look: [key[0] + 0.003, key[1] + 0.024, key[2] - 0.01],
      fov: 30, focus: key, fstop: 0.5, exposure: 1.8, back: 0.55, backAt: key, backFrom: [key[0] - 0.25, key[1] + 0.3, key[2] + 0.35], envTop: [-0.3, 0.6, 0.75], envTopI: 2.2, envCand: 0,
      fade: 0.3 + 0.7 * C().ease(t / 0.4), vignette: 0.65,
    });
  } });
})();
