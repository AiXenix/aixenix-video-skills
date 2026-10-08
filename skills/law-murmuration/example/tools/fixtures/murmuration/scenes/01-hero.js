(function () {
  'use strict';
  const FL = FILM.flock;
  const SCRIPT = {
    key: 'fixture', N: 30000, duration: 16 / 3, loopStart: null,
    formations: [
      { id: 'swirl', t0: -2, kind: 'swirl', swirl: { cx: 940, cy: 440 } },
      {
        id: 'auto', t0: 1.0, kind: 'pts', groups: [{ cx: 0, cy: 0 }],
        build: (n) => FL.sampleClasses(1920, 1080, [
          { paint: FL.textPainter('БИЗНЕС НА', 960, 430, 220, { spacing: 8 }), spine: 0.5, edgeSize: 0.35 },
          { paint: FL.textPainter('АВТОПИЛОТЕ', 960, 690, 220, { spacing: 8 }), spine: 0.5, edgeSize: 0.35 },
        ], n, 101),
        halo: [[200, 150, 80], [1720, 150, 80]], size: 0.68,
        stagger: (qx) => ((qx - 200) / 1500) * 0.5,
      },
    ],
    waves: [{ t: 3.4, x: 0, y: 540, ang: 0.15, speed: 1100, width: 80, life: 1.8 }, { t: 0.2, x: 400, y: 200, ang: 0.6, speed: 900, width: 70, life: 1.6 }],
  };
  FILM.scene({ id: 'hero', draw(ctx, t, info) { FL.render(ctx, info.T, SCRIPT); } });
})();
