// 04 reveal [6.4, 11.2] — cut on the clunk to the cam stack seen from above through the oval glass:
// the wavy cam profiles read like contour lines, the followers ride them; the camera orbits low to
// the followers, rises past the escapement and goes over the shoulder to «Бизнес на автопилоте».
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'reveal', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const T = info.shot.start + t;
    const st = C().anchor(T, 'stack');
    const es = C().anchor(T, 'escape');
    const ts = [0, 1.6, 2.8, 3.9, 4.8];
    const rel = (o) => [st[0] + o[0], st[1] + o[1], st[2] + o[2]];
    const P0 = [rel([0.0, 0.2, 0.13]), rel([0.075, 0.16, 0.11]), [es[0] + 0.022, es[1] + 0.012, es[2] + 0.09], [0.2, 0.235, 0.53], [0.185, 0.245, 0.49]];
    const L0 = [rel([0, -0.012, 0.0]), rel([0.0, 0.0, 0.0]), [es[0] - 0.006, es[1] - 0.004, es[2] - 0.01], [0.03, 0.0, 0.03], [0.03, 0.0, 0.01]];
    const pos = C().spline(P0, ts, t), look = C().spline(L0, ts, t);
    const k = C().ease((t - 2.9) / 1.1);
    const nib = C().nib(T);
    const fp = t < 2.8 ? C().mixv(rel([0.0, 0.0, 0.03]), es, C().ease((t - 1.6) / 1.2)) : C().mixv(es, nib, k);
    const escLit = C().ease((t - 1.9) / 0.5) * (1 - C().ease((t - 3.3) / 0.4));
    C().render(ctx, T, { pos, look, fov: 31, focus: fp, fstop: 0.36, exposure: 1.15 + 0.6 * k + 0.35 * escLit, back: 0.55 * escLit + 0.5 * k, backAt: C().mixv(es, st, k), backFrom: [es[0] + 0.15, es[1] + 0.25, es[2] + 0.32], bloom: 0.3, envTop: C().mixv([0, 0.6, -0.8], [0.15, 1, 0.35], k), envTopI: 2.4 - 1.4 * k, envCand: k });
  } });
})();
