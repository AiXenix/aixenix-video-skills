// 02 wake [1.6, 2.4] — release on the downbeat: the hand lifts the quill out of the ink (a drop falls
// back), wipes it on the rim; behind, soft, the porcelain head bows toward the sheet.
// Camera low beside the inkwell, focus on the rising nib, the face out of focus beyond.
(function () {
  'use strict';
  const C = () => FILM.cast;
  FILM.scene({ id: 'wake', draw(ctx, tIn, info) {
    const t = Math.max(0, Math.min(tIn, info.dur));
    C().ensure(ctx);
    const u = C().ease(t / info.dur);
    const well = FILM.prog.pageToWorld(FILM.prog.WELL.x, FILM.prog.WELL.y, 0);
    const head = C().anchor(info.T, 'head');
    const pos = C().mixv([well[0] + 0.05, 0.045, well[2] - 0.085], [well[0] + 0.045, 0.05, well[2] - 0.075], u);
    const look = C().mixv([well[0] - 0.012, 0.05, well[2] + 0.03], [well[0] - 0.018, 0.058, well[2] + 0.03], u);
    C().render(ctx, info.T, { pos, look, fov: 34, focus: 'nib', fstop: 0.7, exposure: 1.2 });
  } });
})();
