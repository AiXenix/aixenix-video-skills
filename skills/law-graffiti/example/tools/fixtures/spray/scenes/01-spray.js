// Material fixture: concrete wall section with a tag, a three-letter throw-up and a stencil.
(function () {
  'use strict';
  const SP = FILM.spray, PAL = SP.PAL;
  const WALL = {
    key: 'fx', x0: -60, y0: -90, w: 2040, h: 1200, seams: [640, 1820], lift: 430, base: 1000,
    ties: [[340, 150], [340, 640], [940, 150], [940, 640], [1530, 150], [1530, 640]],
    cracks: [[1210, -80, 1.75, 70], [260, 760, 1.1, 30]],
    ghosts: [
      { pts: [[90, 520], [180, 430], [260, 520], [330, 430], [420, 520]], t0: 0, dur: 0.5, color: PAL.ghostRed, sigma: 9, seed: 1 },
      { pts: [[1300, 820], [1420, 760], [1520, 860], [1640, 780]], t0: 0, dur: 0.5, color: PAL.ghostInk, sigma: 5, seed: 2 },
    ],
    buffs: [{ x: 60, y: 440, w: 420, h: 150, color: PAL.buffGrey }, { x: 1260, y: 740, w: 300, h: 110, color: PAL.buffDark, a: 0.9 }],
  };
  let P = null;
  function build() {
    if (P) return P;
    const tg = SP.tag({ seed: 7, x: 90, y: 120, h: 130, t0: 0.15, color: PAL.black, sigma: 4.2, canId: 't', speed: 1300 });
    const tagPc = SP.piece({ id: 'fx-tag', box: tg.box, groups: [{ strokes: tg.strokes, drip: tg.drip }] });
    const s = 330;
    const glyphs = [
      { x: 620, y: 150, s, rot: -0.05, shear: 0.12, strokes: [{ pts: [[0, 1], [0.34, 0], [0.7, 1]], smooth: false }, { pts: [[0.17, 0.64], [0.55, 0.64]], smooth: false }] },
      { x: 905, y: 150, s, rot: 0.03, shear: 0.1, strokes: [{ pts: [[0.1, 0.42], [0.1, 1.0]], smooth: false }, { pts: [[0.1, 0.13], [0.11, 0.14]], smooth: false }] },
      { x: 1010, y: 150, s, rot: 0.06, shear: 0.1, strokes: [{ pts: [[0, 0], [0.64, 1]], smooth: false }, { pts: [[0.64, 0], [0, 1]], smooth: false }] },
    ];
    const tu = SP.throwup({
      id: 'fx-aix', glyphs, fat: 70, ow: 14, ext: [18, 22],
      col: { fill: PAL.magenta, fades: [{ color: PAL.violet, y: 150 + s * 0.92, h: 120, opacity: 0.8 }, { color: PAL.white, y: 150 + s * 0.08, h: 70, opacity: 0.45 }], block: PAL.cyan, blockDark: PAL.deep, line: PAL.black, hl: PAL.white },
      time: { fill: [0.9, 0.42, 0.25], fades: [1.95, 0.45], block: [2.35, 0.45], line: [2.75, 3200, 3], hl: [3.75, 0.35] },
    });
    const txt = SP.stencilText('БЕЗ КУРСОВ', 112, {});
    const cx = 1240, cy = 650;
    const card = { x: cx - 40, y: cy - 30, w: Math.ceil(txt.w + 80), h: Math.ceil(txt.h + 60) };
    const sw = [];
    const yA = card.y + card.h * 0.38, yB = card.y + card.h * 0.72;
    sw.push({ pts: [[card.x - 40, yA], [card.x + card.w + 40, yA - 6]], smooth: false, t0: 1.4, dur: 0.55, d0: 0.05, color: PAL.cyan, sigma: 34, opacity: 0.93, kc: 0, tremor: 0.8, canId: 'st' });
    sw.push({ pts: [[card.x + card.w + 40, yB], [card.x - 40, yB + 8]], smooth: false, t0: 2.05, dur: 0.55, d0: 0.03, color: PAL.magenta, sigma: 30, opacity: 0.8, kc: 0, tremor: 0.8, canId: 'st' });
    const stn = SP.stencil({ id: 'fx-st', card, cut: (g) => g.drawImage(txt.c, cx, cy), strokes: sw, tPlace: 1.2, tLift: 2.8 });
    P = { tagPc, tu, stn, pieces: [tagPc, tu, stn.pc] };
    return P;
  }
  FILM.scene({
    id: 'spray-test',
    draw(ctx, t, info) {
      const B = build();
      const wl = SP.wall(WALL);
      const T = info.T;
      const cam = { x: 960, y: 520, zoom: 1, rot: 0 };
      SP.render(ctx, {
        T, cam, wall: wl, pieces: B.pieces,
        objects: (g) => {
          SP.drawCard(g, B.stn, T);
          // cans: every stroke that is spraying now
          const act = [];
          for (const pc of B.pieces) SP.activeCans(pc, T, act);
          const seen = new Set();
          for (const a of act) {
            const st = a.st;
            if (T < st.t0 || T > st.t1) continue;
            const key = st.canId || st.seed;
            if (seen.has(key)) continue;
            seen.add(key);
            const pos = SP.strokePos(st, T);
            if (!pos) continue;
            SP.drawCan(g, pos.x, pos.y, st.color, st.sigma, 0.18 + SP.clamp(pos.dx * 0.01, -0.25, 0.25), 1, 1, T, st.seed & 0xffff);
          }
        },
      });
      SP.grade(ctx, T, {});
    },
  });
})();
