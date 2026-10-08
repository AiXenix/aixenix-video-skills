// 05 sign [11.2, 16.0] — macro on the nib writing «AiXenix», then the camera rises to read the line.
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'sign', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const T = info.shot.start + t;
    const n = C().nibAvg(T, 0.5, 9);
    const k = C().ease((t - 2.6) / 1.8);
    const near = { pos: [n[0] - 0.03, 0.095, n[2] + 0.085], look: [n[0] - 0.008, 0.0, n[2] - 0.002] };
    const far = { pos: [0.05, 0.27, 0.2], look: [0.01, 0.0, 0.0] };
    C().render(ctx, T, {
      pos: C().mixv(near.pos, far.pos, k), look: C().mixv(near.look, far.look, k),
      fov: 30, focus: 'nib', fstop: 0.5 - 0.3 * k, exposure: 1.0,
    });
  } });
})();
