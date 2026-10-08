/*
 * cast.js : the choreography of the AiXenix ad «Граффити» (prelude, loads after props.js).
 *
 * Law of the method: the wall is painted live by a crew of cans, a roller on a pole and stencil
 * cards. Every image and every word on screen is sprayed, rolled or cut; drips run by gravity;
 * stencils peel off. 90 bpm, beat 0.6667 s, bar 2.6667 s, 9 bars = 24 s; bar 9 loops.
 *
 *   bar 1  a grey wall of old routine words (РУЧНОЙ ВВОД, EXCEL, ЗВОНКИ…); the crew crosses them out
 *   bar 2  the hook, a chrome throw-up over them: «РУТИНУ — РОБОТАМ»
 *   bar 3  whip to the bare panel; the roller pole lays a giant cyan field, one stroke per beat
 *   bar 4  the roller finishes the field; tension
 *   bar 5  DROP: «AiXenix» by four cans at once; the field's drips race down
 *   bar 6  stencil peels on the beats: БИЗНЕС · НА · АВТОПИЛОТЕ · aixenix.com
 *   bar 7  a paper plane held to the wall, sprayed around, peels off and flies; t.me/aixenix, ИИ-ИНСТРУМЕНТЫ КАЖДЫЙ ДЕНЬ
 *   bar 8  a train wipes the frame; behind it the camera has pulled back to the whole wall
 *   bar 9  the whole wall = the final card, breathing; seamless loop
 *
 * FILM.G.frame(ctx, T) draws a frame; FILM.G.sprays()/cards()/rolls()/trainT() feed the score.
 */
(function () {
  'use strict';

  const FILM = window.FILM;
  const SP = FILM.spray;
  const PAL = SP.PAL;
  const L = FILM.lib;
  const TAU = Math.PI * 2;
  const clamp = SP.clamp, lerp = SP.lerp, sstep = SP.sstep;
  const G = (FILM.G = {});

  const BPM = 90;
  const BEAT = 60 / BPM;
  const BAR = 4 * BEAT;
  /** global seconds of bar (0-based) and beat (0-based, may be fractional), frame-exact */
  const b = (bar, beat) => ((bar * 4 + (beat || 0)) * 20) / 30;
  G.BEAT = BEAT;
  G.BAR = BAR;
  G.b = b;
  const NBARS = 9;
  const LOOP0 = b(NBARS - 1, 0); // 21.333: the last bar loops from here
  G.LOOP0 = LOOP0;
  SP.DRIP_DEADLINE = LOOP0 - 0.06;

  // local colours (cast.js is a prelude: not scanned for literals)
  const C = {
    word1: '#1f1d1b', word2: '#27303d', word3: '#3a2a1e', word4: '#1d2a22',
    chromeDark: '#8d96a4', field: '#00e8f6',
    trainBody: '#c9ccd0', trainDark: '#5d6168', trainStripe: '#1d3f73', glass: '#1a2230',
    ballast: '#5d5850', rail: '#b9bcc0', sleeper: '#3a332c',
  };

  // ---------------------------------------------------------------------------
  // Shapes
  // ---------------------------------------------------------------------------
  const star4 = (cx, cy, R, k) => {
    const out = [];
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 ? R * (k || 0.36) : R;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return out;
  };
  const arrowHead = (tx, ty, dx, dy, len, half) => {
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    const bx = tx - dx * len, by = ty - dy * len;
    return [[tx, ty], [bx - dy * half, by + dx * half], [bx + dy * half, by - dx * half]];
  };

  // the brand word (Latin, cap height 1, baseline y = 1)
  const GLYPH = {
    A: { w: 0.8, strokes: [{ pts: [[0.0, 1.0], [0.37, 0.0], [0.74, 1.0]], smooth: false }, { pts: [[0.19, 0.64], [0.57, 0.64]], smooth: false, hl: false }, { pts: [[0.74, 1.0], [0.93, 0.88]], smooth: false, w: 0.75, hl: false }] },
    i: { w: 0.24, strokes: [{ pts: [[0.1, 0.46], [0.1, 1.0]], smooth: false }], polys: [star4(0.1, 0.17, 0.2, 0.34)] },
    X: { w: 0.74, strokes: [{ pts: [[0.0, 0.0], [0.68, 1.0]], smooth: false }, { pts: [[0.68, 0.0], [0.0, 1.0]], smooth: false }, { pts: [[0.66, 0.02], [0.8, -0.14]], smooth: false, w: 0.7 }], polys: [arrowHead(0.92, -0.27, 0.14, -0.16, 0.2, 0.15)] },
    e: { w: 0.68, strokes: [{ pts: [[0.04, 0.765], [0.62, 0.765]], smooth: false, hl: false, w: 0.78 }, { pts: SP.arc(0.33, 0.72, 0.31, 0.12, -1.7 * Math.PI, 28, 0.315), smooth: true, w: 0.86 }] },
    n: { w: 0.62, strokes: [{ pts: [[0.06, 0.45], [0.06, 1.0]], smooth: false }, { pts: [[0.06, 0.66], [0.18, 0.49], [0.36, 0.45], [0.52, 0.56], [0.56, 0.74], [0.56, 1.0]], smooth: true }] },
    x: { w: 0.64, strokes: [{ pts: [[0.0, 0.45], [0.52, 1.0]], smooth: false }, { pts: [[0.52, 0.45], [0.0, 1.0]], smooth: false }, { pts: [[0.5, 0.98], [0.62, 1.1]], smooth: false, w: 0.7 }], polys: [arrowHead(0.74, 1.23, 0.12, 0.13, 0.19, 0.14)] },
  };
  // the hook (Cyrillic caps, skeletons for bubble letters)
  const CYR = {
    Р: { w: 0.62, strokes: [{ pts: [[0.08, 1.0], [0.08, 0.0]], smooth: false }, { pts: [[0.08, 0.03], [0.36, 0.03], [0.55, 0.13], [0.6, 0.29], [0.5, 0.44], [0.3, 0.5], [0.08, 0.5]], smooth: true }] },
    У: { w: 0.66, strokes: [{ pts: [[0.0, 0.0], [0.31, 0.6]], smooth: false }, { pts: [[0.64, 0.0], [0.34, 0.66], [0.2, 0.9], [0.02, 1.0]], smooth: true }] },
    Т: { w: 0.66, strokes: [{ pts: [[0.0, 0.03], [0.66, 0.03]], smooth: false, hl: false }, { pts: [[0.33, 0.03], [0.33, 1.0]], smooth: false }] },
    И: { w: 0.68, strokes: [{ pts: [[0.06, 0.0], [0.06, 1.0], [0.62, 0.0], [0.62, 1.0]], smooth: false }] },
    Н: { w: 0.68, strokes: [{ pts: [[0.06, 0.0], [0.06, 1.0]], smooth: false }, { pts: [[0.62, 0.0], [0.62, 1.0]], smooth: false }, { pts: [[0.06, 0.5], [0.62, 0.5]], smooth: false, hl: false }] },
    О: { w: 0.72, strokes: [{ pts: SP.arc(0.35, 0.5, 0.3, -Math.PI / 2, 1.5 * Math.PI, 32, 0.47), smooth: true }] },
    Б: { w: 0.66, strokes: [{ pts: [[0.6, 0.03], [0.08, 0.03]], smooth: false, hl: false }, { pts: [[0.08, 0.03], [0.08, 1.0]], smooth: false }, { pts: [[0.08, 0.46], [0.36, 0.46], [0.56, 0.58], [0.6, 0.76], [0.5, 0.93], [0.3, 1.0], [0.08, 1.0]], smooth: true }] },
    А: { w: 0.74, strokes: [{ pts: [[0.0, 1.0], [0.35, 0.0], [0.7, 1.0]], smooth: false }, { pts: [[0.17, 0.64], [0.53, 0.64]], smooth: false, hl: false }] },
    М: { w: 0.82, strokes: [{ pts: [[0.04, 1.0], [0.08, 0.0], [0.39, 0.64], [0.7, 0.0], [0.74, 1.0]], smooth: false }] },
    '—': { w: 0.5, strokes: [{ pts: [[0.04, 0.54], [0.46, 0.54]], smooth: false, hl: false }] },
  };

  // ---------------------------------------------------------------------------
  // The wall and its history: routine words stencilled long ago, ghosts, buffs
  // ---------------------------------------------------------------------------
  // [text, size, x, top, colour, tilt, cross]: x = strike, s = strike-through
  const WORDS = [
    ['РУЧНОЙ ВВОД', 90, 90, -450, C.word1, -0.02, 's'],
    ['EXCEL', 150, 1010, -490, C.word2, 0.03, 'x'],
    ['ЗВОНКИ', 116, 120, -240, C.word3, 0.02, 'x'],
    ['ОТЧЁТЫ', 124, 740, -250, C.word1, -0.03, 'x'],
    ['ТАБЛИЦЫ', 100, 160, 10, C.word4, 0.0, 's'],
    ['КОПИПАСТ', 96, 830, 30, C.word2, 0.02, 's'],
    ['СВЕРКИ', 108, 100, 280, C.word3, -0.02, 'x'],
    ['ДЕДЛАЙНЫ', 108, 650, 290, C.word1, 0.03, 's'],
  ];
  G.WORDS = WORDS;
  const ZONE = { x0: 1400, x1: 3150, y0: -560, y1: 900 }; // the rolled field
  const WALL = (() => {
    const seams = [300, 1480, 2660];
    const ties = [];
    for (let k = 0; k < 15; k++) {
      const x = -310 + 295 * k;
      if (seams.some((s) => Math.abs(s - x) < 40)) continue;
      for (const y of [-640, -230, 180, 600, 880]) {
        if (x > ZONE.x0 - 40 && x < ZONE.x1 + 40 && y > ZONE.y0 - 40 && y < ZONE.y1 + 40) continue;
        if (x > 60 && x < 1330 && y > -120 && y < 560) continue; // under the hook
        ties.push([x + (k % 2) * 6, y]);
      }
    }
    const ghosts = [];
    const R = L.rng(L.hash('ghosts-ad'));
    const gcols = [PAL.ghostRed, PAL.ghostBlue, PAL.ghostInk, PAL.ghostGreen, PAL.ghostInk];
    for (let i = 0; i < 30; i++) {
      const x = R.range(-380, 3600), y = R.range(-760, 860), h = R.range(55, 170);
      const col = gcols[i % gcols.length];
      const sk = SP.tagSkeleton(2000 + i, R.int(3, 5));
      for (const part of sk) ghosts.push({ pts: part.pts.map((p) => [x + p[0] * h, y + p[1] * h]), smooth: true, t0: 0, dur: 0.6, color: col, sigma: R.range(3.5, 6.5), opacity: 0.9, seed: 700 + i * 7 + ghosts.length, fade: R.range(0.25, 0.55), speck: 0.6 });
    }
    for (let i = 0; i < 8; i++) {
      const x = R.range(-300, 3500), y = R.range(-700, 760), w = R.range(220, 480);
      const col = [PAL.ghostRed, PAL.ghostBlue, PAL.ghostGreen][i % 3];
      ghosts.push({ pts: [[x, y + 40], [x + w * 0.3, y - 20], [x + w * 0.6, y + 60], [x + w, y]], smooth: true, t0: 0, dur: 0.7, color: col, sigma: R.range(26, 40), opacity: 0.9, seed: 990 + i, fade: R.range(0.25, 0.45), speck: 0.1 });
    }
    const buffs = [];
    const bcols = [PAL.buffDark, PAL.concreteCool, PAL.buffGrey, PAL.buffDark, PAL.buffBeige];
    const BR = L.rng(L.hash('buffs-ad'));
    for (let i = 0; i < 14; i++) buffs.push({ x: BR.range(-380, 3500), y: BR.range(-760, 760), w: BR.range(200, 560), h: BR.range(90, 300), color: bcols[i % bcols.length], a: BR.range(0.5, 0.78) });
    return {
      key: 'ad-wall', x0: -420, y0: -800, w: 4160, h: 1795, seams, lift: 300, base: 990, ties, v: 0.47, relief: 0.6,
      cracks: [[2280, -780, 1.62, 90], [560, 690, 1.25, 50], [3420, 280, 1.9, 60], [1250, 930, -1.3, 26], [150, -760, 1.4, 60], [3000, -700, 1.7, 70]],
      ghosts, buffs,
      words: WORDS.map(([str, size, x, y, color, rot]) => ({ str, size, x, y, color, rot, a: 0.9 })),
      streak: 0.6,
    };
  })();
  G.WALL = WALL;
  G.wall = () => SP.wall(WALL);

  // ---------------------------------------------------------------------------
  // Piece helpers
  // ---------------------------------------------------------------------------
  function asGlyphs(items) {
    return items.map((it) => {
      const sh = it.shape;
      return { x: it.x, y: it.y, s: it.s, rot: it.rot || 0, shear: it.shear || 0, sy: it.sy || 1, strokes: (sh.strokes || []).map((q) => ({ pts: q.pts, smooth: q.smooth, w: q.w, hl: q.hl })), polys: sh.polys || [] };
    });
  }
  /** a line of glyphs from a table: chars, x0, baseline, cap height, gap, wild tilts */
  function wordGlyphs(table, chars, x0, base, s, gap, tilt) {
    const out = [];
    let ux = 0;
    Array.from(chars).forEach((ch, i) => {
      const sh = table[ch];
      if (!sh) {
        ux += 0.35;
        return;
      }
      const rot = (tilt || 0) * Math.sin(i * 2.3 + 0.7);
      const dy = 0.025 * Math.sin(i * 1.7);
      out.push({ shape: sh, x: x0 + ux * s, y: base - s + dy * s, s, rot, shear: 0.08 });
      ux += sh.w + gap;
    });
    return { glyphs: asGlyphs(out), width: ux * s };
  }

  function tagPiece(id, x, y, h, color, t0, o) {
    o = o || {};
    const tg = SP.tag({ seed: o.seed != null ? o.seed : L.hash(id) & 0xffff, x, y, h, t0, color, sigma: o.sigma || Math.max(3.4, h * 0.035), canId: 'tag', speed: o.speed || 1600, letters: o.letters, rot: o.rot, drip: o.drip, dripRoom: o.dripRoom });
    return SP.piece({ id, box: tg.box, groups: [{ strokes: tg.strokes, drip: tg.drip }] });
  }

  /** a word crossed out: an X (or a strike) of fat paint over its ink box */
  function crossPiece(id, word, t0, kind, color, canId) {
    const [str, size, x, y] = word;
    const m = SP.stencilText(str, size, { track: 0.05 });
    const ix0 = x + size * 0.1, ix1 = x + m.w - size * 0.1, iy0 = y + size * 0.3, iy1 = y + size * 1.02;
    const sig = size * 0.075 + 5;
    const strokes = [];
    if (kind === 'x') {
      const R2 = L.rng(L.hash(id));
      const wob = () => R2.range(-1, 1) * size * 0.07;
      strokes.push({ pts: [[ix0 - 6, iy0 - 10], [lerp(ix0, ix1, 0.33), lerp(iy0, iy1, 0.33) + wob()], [lerp(ix0, ix1, 0.66), lerp(iy0, iy1, 0.66) + wob()], [ix1 + 10, iy1 + 10]], smooth: true, t0, dur: 0.17, d0: 0.06, d1: 0, color, sigma: sig * 1.15, taper: 0.55, opacity: 0.97, speck: 0.7, kc: 0.2, tremor: 1.0, ease: 0.15, canId, drip: 1 });
      strokes.push({ pts: [[ix1 + 6, iy0 - 12], [lerp(ix1, ix0, 0.33), lerp(iy0, iy1, 0.33) + wob()], [lerp(ix1, ix0, 0.66), lerp(iy0, iy1, 0.66) + wob()], [ix0 - 10, iy1 + 12]], smooth: true, t0: t0 + 0.24, dur: 0.17, d0: 0.06, d1: 0, color, sigma: sig * 1.15, taper: 0.55, opacity: 0.97, speck: 0.7, kc: 0.2, tremor: 1.0, ease: 0.15, canId, drip: 1 });
    } else {
      const ym = (iy0 + iy1) / 2;
      const R2 = L.rng(L.hash(id));
      strokes.push({ pts: [[ix0 - 14, ym + 10], [lerp(ix0, ix1, 0.3), ym - 6 + R2.range(-6, 6)], [lerp(ix0, ix1, 0.65), ym + 4 + R2.range(-6, 6)], [ix1 + 18, ym - 2]], smooth: true, t0, dur: 0.24, d0: 0.06, d1: 0, color, sigma: sig * 1.25, taper: 0.6, opacity: 0.97, speck: 0.7, kc: 0.3, tremor: 1.0, ease: 0.15, canId, drip: 1 });
    }
    return SP.piece({ id, box: [ix0 - 80, iy0 - 80, ix1 + 80, iy1 + 260], groups: [{ strokes, drip: { thr: 5.6, max: 9, len: 1.1 } }] });
  }

  /** one stencil card with one line of text */
  function textStencil(id, x, top, str, size, colors, tPlace, tSpray, tLift, o) {
    o = o || {};
    const m = SP.stencilText(str, size, { track: o.track || 0.05 });
    const padX = o.padX || 34, padY = o.padY || 16;
    const card = { x: Math.round(x - padX), y: Math.round(top - padY), w: Math.round(m.w + 2 * padX), h: Math.round(m.h + 2 * padY) };
    const yc = top + m.base - size * 0.36;
    const x0 = card.x + Math.min(40, card.w * 0.05), x1 = card.x + card.w - Math.min(40, card.w * 0.05);
    const [s0, s1] = tSpray;
    const dir = o.dir || 1;
    const a = dir > 0 ? x0 : x1, z = dir > 0 ? x1 : x0;
    const strokes = [];
    if (colors[1]) {
      const mid = s0 + (s1 - s0) * 0.52;
      strokes.push({ pts: [[a, yc - size * 0.15], [z, yc - size * 0.19]], smooth: false, t0: s0, dur: mid - s0 - 0.02, d0: 0.03, color: colors[0], sigma: size * 0.33, opacity: 0.97, kc: 0, tremor: 0.7, canId: o.canId || 'st', drip: 1 });
      strokes.push({ pts: [[z, yc + size * 0.25], [a, yc + size * 0.23]], smooth: false, t0: mid, dur: s1 - mid, d0: 0.02, color: colors[1], sigma: size * 0.26, opacity: 0.9, kc: 0, tremor: 0.7, canId: o.canId || 'st', drip: 1 });
    } else {
      strokes.push({ pts: [[a, yc], [z, yc - 4]], smooth: false, t0: s0, dur: s1 - s0, d0: 0.03, color: colors[0], sigma: size * 0.42, opacity: 0.97, kc: 0, tremor: 0.7, canId: o.canId || 'st', drip: 1 });
    }
    const st = SP.stencil({
      id, card, strokes, tPlace, tLift, lift: o.lift || { dx: 0.35, dy: -0.9, rot: 0.1 }, drip: o.drip || { thr: 9, max: 6, len: 0.6 }, over: o.over || 70, shield: o.shield, halo: o.halo != null ? o.halo : 0.35,
      cut: (g) => g.drawImage(m.c, Math.round(x), Math.round(top)),
    });
    st.text = { x, top, w: m.w, h: m.h };
    return st;
  }

  // ---------------------------------------------------------------------------
  // Layout (wall coordinates)
  // ---------------------------------------------------------------------------
  const HOOK = { x: 132, base1: 150, base2: 430, s: 212 };
  const HERO = { cx: 2275, base: 110, s: 360 };
  const HERO_WORD = [
    ['A', 0.0, -0.05, 0.0], ['i', 0.86, 0.04, -0.02], ['X', 1.12, 0.05, 0.02], ['e', 1.9, -0.04, -0.02],
    ['n', 2.6, 0.03, 0.01], ['i', 3.23, -0.03, -0.02], ['x', 3.47, 0.07, 0.02],
  ];
  const HERO_W = 4.11;
  function heroGlyphs() {
    const s = HERO.s;
    const x0 = HERO.cx - (HERO_W * s) / 2;
    return asGlyphs(HERO_WORD.map(([ch, ux, rot, dy]) => ({ shape: GLYPH[ch], x: x0 + ux * s, y: HERO.base - s + dy * s, s, rot, shear: 0.1 })));
  }
  // the plane: nose, upper wing tip, tail notch, lower wing tip
  // the plane: nose, upper wing tip, tail notch, lower wing tip (an elongated dart, nose up-right)
  const PLANE = (() => {
    const U = [[1, 0], [0, -0.38], [0.3, 0.02], [0.13, 0.34]];
    const s = 250, a = -0.42, cx = 1452, cy = 712;
    return U.map(([u, v]) => [cx + (u * Math.cos(a) - v * Math.sin(a)) * s, cy + (u * Math.sin(a) + v * Math.cos(a)) * s]);
  })();
  G.PLANE = PLANE;

  // ---------------------------------------------------------------------------
  // Build everything (pure, once)
  // ---------------------------------------------------------------------------
  let BUILT = null;
  G.build = function build() {
    if (BUILT) return BUILT;
    const pieces = [], stencils = [], planes = [];
    const add = (pc) => (pieces.push(pc), pc);
    const addSt = (st) => (stencils.push(st), pieces.push(st.pc), st);

    // ---- bar 1: the crew crosses the routine out, on the beats (four cans)
    const W = WORDS;
    const crossAt = [b(0, 1), b(0, 1.5), b(0, 2), b(0, 2.5), b(0, 3), b(0, 3), b(0, 3.5), b(0, 3.5)];
    const crossCan = ['k1', 'k2', 'k3', 'k4', 'k1', 'k2', 'k3', 'k4'];
    [1, 0, 2, 3, 4, 5, 6, 7].forEach((wi, k) => add(crossPiece('x-' + wi, W[wi], crossAt[k], W[wi][6], PAL.magenta, crossCan[k])));

    // ---- bar 2: the hook, a chrome throw-up in two lines
    const l1 = wordGlyphs(CYR, 'РУТИНУ —', HOOK.x, HOOK.base1, HOOK.s, 0.06, 0.05);
    const l2 = wordGlyphs(CYR, 'РОБОТАМ', HOOK.x + 30, HOOK.base2, HOOK.s, 0.05, 0.05);
    const hookCol = {
      fill: '#b8bec7', block: PAL.magenta, blockDark: null, line: PAL.black, line2: PAL.white, hl: PAL.white,
    };
    const T2 = b(1, 0);
    add(SP.throwup({
      id: 'hook-1', glyphs: l1.glyphs, fat: HOOK.s * 0.24, ow: 13, ow2: 8, ext: [16, 20], canPrefix: 'h1', cans: ['a', 'b'], passes2: true, fillFeather: 0.9, fillReach: 0.85,
      col: Object.assign({ fades: [{ color: PAL.white, y: HOOK.base1 - HOOK.s * 0.85, h: HOOK.s * 0.3, opacity: 0.6, passes: 1 }, { color: C.chromeDark, y: HOOK.base1 - HOOK.s * 0.12, h: HOOK.s * 0.34, opacity: 0.6, passes: 1 }] }, hookCol),
      time: { fill: [T2, 0.17, 0.35], fades: [T2 + 0.66, 0.2], block: [T2 + 0.78, 0.22], line: [T2 + 0.98, 9000, 2], line2: [T2 + 1.45, 11000, 2], hl: [T2 + 1.62, 0.16] },
      lineDrip: { thr: 7.5, max: 12, len: 0.8 }, dripRoom: 140,
    }));
    add(SP.throwup({
      id: 'hook-2', glyphs: l2.glyphs, fat: HOOK.s * 0.24, ow: 13, ow2: 8, ext: [16, 20], canPrefix: 'h2', cans: ['c', 'd'], passes2: true, fillFeather: 0.9, fillReach: 0.85,
      col: Object.assign({ fades: [{ color: PAL.white, y: HOOK.base2 - HOOK.s * 0.85, h: HOOK.s * 0.3, opacity: 0.6, passes: 1 }, { color: C.chromeDark, y: HOOK.base2 - HOOK.s * 0.12, h: HOOK.s * 0.34, opacity: 0.6, passes: 1 }] }, hookCol),
      time: { fill: [T2 + 0.15, 0.17, 0.35], fades: [T2 + 0.74, 0.2], block: [T2 + 0.86, 0.22], line: [T2 + 1.04, 9000, 2], line2: [T2 + 1.5, 11000, 2], hl: [T2 + 1.66, 0.16] },
      lineDrip: { thr: 7.5, max: 12, len: 0.8 }, dripRoom: 160,
    }));

    // ---- bars 3-4: the roller field, one stroke per beat; its drips are held for the drop
    const RW = 260, STEP = 248;
    const rolls = [];
    for (let k = 0; k < 7; k++) {
      const t = b(2, 1 + k);
      const down = k % 2 === 0;
      const jy = (q) => Math.round((L.h3(k, q, 77) - 0.5) * 26);
      rolls.push({ roller: true, x: ZONE.x0 + RW / 2 + k * STEP, y0: (down ? ZONE.y0 : ZONE.y1) + jy(1), y1: (down ? ZONE.y1 : ZONE.y0) + jy(2), W: RW, t0: t - 0.06, d0: 0.06, dur: 0.46, d1: 0.04, color: C.field, load0: 1.0, load1: k % 3 === 1 ? 0.5 : 0.68, canId: 'roller', seed: 300 + k, dripLoad: down ? 1.4 : 0.5 });
    }
    add(SP.piece({ id: 'field', box: [ZONE.x0 - 70, ZONE.y0 - 40, ZONE.x1 + 70, 990], groups: [{ strokes: rolls, drip: { thr: 6.5, max: 9, len: 1.2, vary: true, startAt: b(4, 0), spread: 0.4, runK: 0.42, allow: (pc, x, y) => y + pc.y0 > ZONE.y1 - 60 } }] }));
    G.ROLLS = rolls;

    // ---- bar 5: the drop, AiXenix by four cans at once
    const T5 = b(4, 0);
    add(SP.throwup({
      id: 'hero', glyphs: heroGlyphs(), fat: HERO.s * 0.23, ow: 19, ow2: 13, ext: [30, 36], canPrefix: 'hero', cans: ['a', 'b', 'c', 'd'],
      col: {
        fill: PAL.magenta, block: PAL.deep, blockDark: null, line: PAL.black, line2: PAL.white, hl: PAL.white,
        fades: [{ color: PAL.violet, y: HERO.base - HERO.s * 0.12, h: HERO.s * 0.42, opacity: 0.85 }, { color: PAL.white, y: HERO.base - HERO.s * 0.86, h: HERO.s * 0.3, opacity: 0.55, passes: 1 }],
      },
      time: { sketch: [b(3, 0), 2600, 2, '#efeadd', 2.6, (mx) => b(2, 1 + clamp(Math.floor((mx - ZONE.x0) / STEP), 0, 6)) + 0.52], fill: [T5, 0.26, 0.6], fades: [T5 + 0.78, 0.3], block: [T5 + 0.9, 0.3], line: [T5 + 1.12, 8000, 4], line2: [b(4, 2.9), 10000, 3], hl: [b(4, 3.2), 0.18] },
      lineDrip: { thr: 7, max: 22, len: 0.75, runK: 0.6, floorY: 228 }, dripRoom: 260,
      fillDrip: { thr: 3.7, max: 26, len: 0.7, runK: 0.42, colors: [PAL.magenta, PAL.violet], floorY: 228 },
    }));

    // ---- bar 6: stencil peels on the beats
    const T6 = b(5, 0);
    const SZ = 104, TOP = 250;
    const words6 = [['БИЗНЕС', 0], ['НА', 1], ['АВТОПИЛОТЕ', 2]];
    const ms = words6.map(([w]) => SP.stencilText(w, SZ, { track: 0.05 }));
    const space = SZ * 0.5, PADX = 24, PADY = 16;
    const totalW = ms.reduce((a, m) => a + m.w, 0) + space * 2;
    const x0w = HERO.cx - totalW / 2;
    const xs = [];
    let xx = x0w;
    for (const m of ms) {
      xs.push(xx);
      xx += m.w + space;
    }
    // card rects, widened so neighbours abut: no bare wall between them
    const rects = ms.map((m, i) => {
      const l = i === 0 ? xs[i] - PADX : (xs[i - 1] + ms[i - 1].w + xs[i]) / 2 - 1;
      const r = i === ms.length - 1 ? xs[i] + m.w + PADX : (xs[i] + m.w + xs[i + 1]) / 2 + 1;
      return { x: Math.round(l), y: Math.round(TOP - PADY), w: Math.round(r - l), h: Math.round(m.h + 2 * PADY) };
    });
    const sweepT0 = T6 + 0.42, sweepT1 = b(5, 1.75);
    words6.forEach(([w, i]) => {
      const m = ms[i];
      const f0 = (rects[i].x - rects[0].x) / (rects[2].x + rects[2].w - rects[0].x), f1 = (rects[i].x + rects[i].w - rects[0].x) / (rects[2].x + rects[2].w - rects[0].x);
      const ta = lerp(sweepT0, sweepT1, f0), tb = lerp(sweepT0, sweepT1, f1);
      const padL = xs[i] - rects[i].x, padR = rects[i].x + rects[i].w - (xs[i] + m.w);
      const st = textStencil('st-' + i, xs[i], TOP, w, SZ, [PAL.black], T6 + i * BEAT * 0.25 - 0.02, [ta, Math.max(ta + 0.08, tb)], b(5, 2 + 0.5 * i), {
        canId: 'sb', padX: Math.max(padL, padR), padY: PADY, shield: rects.filter((_, k) => k !== i), lift: { dx: 0.1 + 0.2 * i, dy: -1.1, rot: 0.06 * (i - 1) },
      });
      // the card takes the exact abutting rect
      st.card.x = rects[i].x;
      st.card.w = rects[i].w;
      addSt(st);
    });
    const siteW = SP.stencilText('aixenix.com', 136, { track: 0.05 }).w;
    addSt(textStencil('st-site', HERO.cx - siteW / 2, 400, 'aixenix.com', 136, [PAL.deep], b(5, 1.5), [b(5, 1.75), b(5, 3)], b(5, 3.5), { canId: 'ss', padY: 12, lift: { dx: -0.4, dy: -1.0, rot: -0.1 } }));

    // ---- bar 7: the paper plane (a reverse stencil that flies off), the channel
    const T7 = b(6, 0);
    // the overspray around the card: speed streaks along its flight line, thin far behind, fat at the plane
    const dirx = Math.cos(-0.42), diry = Math.sin(-0.42), nrx = -diry, nry = dirx;
    const nose = PLANE[0];
    const streak = (off, back, t0, dur, col, sig, op, can) => ({
      pts: [[nose[0] - dirx * back + nrx * off, nose[1] - diry * back + nry * off], [nose[0] - dirx * back * 0.45 + nrx * off * 1.05, nose[1] - diry * back * 0.45 + nry * off * 1.05], [nose[0] + dirx * 70 + nrx * off * 0.6, nose[1] + diry * 70 + nry * off * 0.6]],
      smooth: true, t0, dur, d0: 0.0, d1: 0.04, color: col, sigma: sig, taper: 2.1, opacity: op, speck: 0.6, kc: 0.1, tremor: 0.5, ease: -0.3, canId: can, drip: 1,
    });
    const plane = SP.planeStencil({
      id: 'plane', pts: PLANE, tPlace: T7, tLift: b(6, 1.5), fly: { dx: 2100, dy: -1400, rot: -0.5, s: 3.2, dur: 0.85 }, over: 440,
      slits: [[PLANE[0], PLANE[2], 6]],
      strokes: [
        streak(-62, 520, T7 + 0.12, 0.34, PAL.violet, 22, 0.92, 'p1'),
        streak(10, 600, T7 + 0.3, 0.36, PAL.violet, 26, 0.94, 'p1'),
        streak(80, 480, T7 + 0.5, 0.32, PAL.magenta, 20, 0.85, 'p2'),
        streak(-130, 300, T7 + 0.66, 0.26, PAL.magenta, 14, 0.75, 'p2'),
      ],
    });
    planes.push(plane);
    pieces.push(plane.pc);
    // where it came from: a dashed loop sprayed behind its tail
    const trail = [];
    const tail = PLANE[2];
    const path = (u) => [tail[0] - 60 - u * 260 + Math.sin(u * 5.2) * 50, tail[1] + 70 + u * 60 - Math.sin(u * 4.1) * 60];
    for (let k = 0; k < 6; k++) {
      const u0 = 0.04 + k * 0.165, u1 = u0 + 0.09;
      trail.push({ pts: [path(u0), path((u0 + u1) / 2), path(u1)], smooth: true, t0: b(6, 1.0) + k * 0.05, dur: 0.045, d0: 0.012, color: PAL.white, sigma: 6, opacity: 0.95, speck: 0.8, kc: 0, tremor: 0.2, canId: 'tr', drip: 0 });
    }
    add(SP.piece({ id: 'trail', box: [tail[0] - 420, tail[1] - 120, tail[0] + 20, tail[1] + 220], groups: [{ strokes: trail }] }));
    addSt(textStencil('st-tme', 1770, 600, 't.me/aixenix', 108, [PAL.deep], b(6, 1), [b(6, 1.25), b(6, 2.1)], b(6, 2.5), { canId: 'st2', padX: 26, padY: 10, lift: { dx: 0.5, dy: -1.0, rot: 0.12 } }));
    addSt(textStencil('st-daily', 1770, 760, 'ИИ-ИНСТРУМЕНТЫ КАЖДЫЙ ДЕНЬ', 68, [PAL.black], b(6, 1.75), [b(6, 2), b(6, 2.85)], b(6, 3.25), { canId: 'st3', padX: 22, padY: 8, lift: { dx: -0.3, dy: -1.2, rot: -0.08 } }));

    // ---- glints for the loop (beat-locked twinkles on the finished wall)
    G.BEADS = [[2966, ZONE.y1 + 4, 0.0, C.field], [1708, ZONE.y1 + 6, 0.5, C.field]];
    BUILT = { pieces, stencils, planes };
    return BUILT;
  };

  // ---------------------------------------------------------------------------
  // Camera: keys on x, y, zoom (monotone cubic), a hidden cut under the train, handheld + breathing
  // ---------------------------------------------------------------------------
  const TCUT = b(7, 0.75); // frame 575: the train covers the whole frame, no car gap in view
  G.TCUT = TCUT;
  const KEYS_A = [
    // t, x, y, zoom
    [0, 640, -20, 0.95], [b(0, 3), 680, 0, 0.93], [b(1, 0), 690, 30, 0.91], [b(1, 3.2), 680, 50, 0.89],
    [b(2, 0.35), 820, 60, 0.86], [b(2, 1.05), 1950, 130, 0.8], [b(2, 2.2), 2230, 150, 0.78], [b(3, 3), 2290, 150, 0.77],
    [b(4, 0), 2275, -20, 0.88], [b(4, 3), 2275, -60, 0.9], [b(5, 0.5), 2275, 200, 0.87], [b(5, 3.3), 2275, 250, 0.86],
    [b(6, 0.4), 2130, 430, 0.8], [b(6, 3.5), 2150, 440, 0.82], [TCUT, 2160, 440, 0.83],
  ];
  const KEYS_B = [[TCUT, 1615, 280, 0.66], [b(7, 2.6), 1615, 288, 0.59], [LOOP0, 1615, 290, 0.575]];
  function pchip(keys, idx, T) {
    const n = keys.length;
    if (T <= keys[0][0]) return keys[0][idx];
    if (T >= keys[n - 1][0]) return keys[n - 1][idx];
    let i = 0;
    while (i < n - 2 && T > keys[i + 1][0]) i++;
    const d = (k) => (keys[k + 1][idx] - keys[k][idx]) / (keys[k + 1][0] - keys[k][0]);
    const slope = (k) => {
      if (k === 0 || k === n - 1) return 0;
      const a = d(k - 1), c = d(k);
      if (a * c <= 0) return 0;
      const h0 = keys[k][0] - keys[k - 1][0], h1 = keys[k + 1][0] - keys[k][0];
      return (3 * (h0 + h1)) / ((2 * h1 + h0) / a + (h1 + 2 * h0) / c);
    };
    const t0 = keys[i][0], t1 = keys[i + 1][0], h = t1 - t0, u = (T - t0) / h;
    const p0 = keys[i][idx], p1 = keys[i + 1][idx], m0 = slope(i), m1 = slope(i + 1);
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * p0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * p1 + (u3 - u2) * h * m1;
  }
  G.camera = function camera(T) {
    const K = T < TCUT ? KEYS_A : KEYS_B;
    const x = pchip(K, 1, T), y = pchip(K, 2, T), z = pchip(K, 3, T);
    // aperiodic handheld, a kick when the train passes, gone before the loop bar
    const w = 1 - sstep(b(7, 2.2), LOOP0 - 0.05, T);
    const kick = Math.exp(-Math.pow((T - b(7, 0.9)) / 0.35, 2)) * 1.8;
    const nx = (4.4 * L.noise1(T * 1.25, 11) + 1.5 * L.noise1(T * 5.3, 12) + 6 * kick * L.noise1(T * 14, 16)) * w;
    const ny = (3.2 * L.noise1(T * 1.05, 13) + 1.2 * L.noise1(T * 4.6, 14) + 5 * kick * L.noise1(T * 13, 17)) * w;
    const nr = (0.002 * L.noise1(T * 0.85, 15) + 0.002 * kick * L.noise1(T * 9, 18)) * w;
    // periodic breathing (period one bar) everywhere, so the loop bar repeats exactly
    const u = (T - LOOP0) / BAR;
    const px = 4.0 * Math.sin(TAU * u) + 1.5 * Math.sin(2 * TAU * u + 1.3);
    const py = 2.8 * Math.sin(TAU * u + 0.7) + 1.1 * Math.sin(3 * TAU * u + 2.1);
    const pr = 0.0012 * Math.sin(TAU * u + 2.2);
    return { x: x + nx / z + px, y: y + ny / z + py, zoom: z, rot: nr + pr };
  };

  // ---------------------------------------------------------------------------
  // Ground: railway ballast, sleepers and two rails in front of the wall (sheared parallax)
  // ---------------------------------------------------------------------------
  const GROUND = { x0: -1600, w: 7600, y0: 988, h: 260 };
  let groundC = null;
  function groundTex() {
    if (groundC) return groundC;
    const { x0, w, y0, h } = GROUND;
    const c = SP.mk(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const d = img.data;
    const [br, bg, bb] = SP.rgb(C.ballast);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const x = i + x0, y = j + y0;
        // gravel: cells of stones, light tops, dark gaps
        const st = SP.vnoise(x / 5.5 + 3, y / 4.2 + 9);
        const st2 = SP.vnoise(x / 2.1 + 1, y / 1.8 + 5);
        let v = 0.55 + (st - 0.5) * 0.7 + (st2 - 0.5) * 0.35;
        v *= 0.82 + 0.25 * SP.fbm(x / 220, y / 90, 2);
        v -= j < 16 ? (16 - j) * 0.03 : 0;
        const k = (j * w + i) * 4;
        d[k] = clamp((br / 255) * v) * 255;
        d[k + 1] = clamp((bg / 255) * v) * 255;
        d[k + 2] = clamp((bb / 255) * v) * 255;
        d[k + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // sleepers (perpendicular to the wall: they shear into perspective)
    for (let x = -1600; x < 6000; x += 92) {
      g.fillStyle = 'rgba(30,26,22,0.85)';
      g.fillRect(x - x0, 52, 34, h - 52);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x - x0, 52, 34, 3);
    }
    // two rails
    for (const [ry, rw] of [[96, 9], [196, 13]]) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, ry + rw, w, rw * 0.9);
      g.fillStyle = C.rail;
      g.fillRect(0, ry, w, rw * 0.5);
      g.fillStyle = '#e9ecef';
      g.fillRect(0, ry, w, 2);
      g.fillStyle = '#6d6f73';
      g.fillRect(0, ry + rw * 0.5, w, rw * 0.5);
    }
    // the foot of the wall
    const grd = g.createLinearGradient(0, 0, 0, 30);
    grd.addColorStop(0, 'rgba(0,0,0,0.65)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, 30);
    // empty cans and caps in the gravel
    const R = L.rng(L.hash('litter-ad'));
    const cols = [PAL.magenta, PAL.cyan, PAL.black, PAL.violet, PAL.white, PAL.chrome];
    for (let i = 0; i < 34; i++) {
      const x = R.range(0, w), y = R.range(6, 46), r = R.range(5, 16);
      g.fillStyle = SP.rgba(cols[i % cols.length], R.range(0.25, 0.6));
      g.beginPath();
      g.ellipse(x, y, r, r * 0.45, 0, 0, TAU);
      g.fill();
    }
    groundC = c;
    return c;
  }
  const PAR = 0.0042;
  const LITTER = [[180, 1018, PAL.magenta, 1.35], [980, 1024, PAL.cyan, -1.25], [1700, 1014, PAL.black, 1.5], [2600, 1026, PAL.violet, -1.42], [3300, 1016, PAL.chrome, 1.3]];
  function drawGround(ctx, cam) {
    const tex = groundTex();
    const k = -cam.x * PAR;
    ctx.save();
    SP.camApply(ctx, cam);
    ctx.transform(1, 0, k, 1, -k * GROUND.y0, 0);
    ctx.drawImage(tex, GROUND.x0, GROUND.y0);
    ctx.restore();
    ctx.save();
    SP.camApply(ctx, cam);
    for (const [x, y, col, rot] of LITTER) {
      const xs = x - cam.x * PAR * (y - GROUND.y0);
      ctx.save();
      ctx.translate(xs, y);
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = PAL.grime;
      ctx.beginPath();
      ctx.ellipse(6, 14, 60, 10, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.rotate(rot);
      ctx.scale(0.5, 0.5);
      ctx.drawImage(SP.canSprite(col), -60, -165);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // The train: three commuter cars right on top of the camera, motion-smeared, a wipe
  // ---------------------------------------------------------------------------
  const CAR = { w: 2500, h: 1300, gap: 40 };
  /** the train's piece: chrome AiXenix with black outline and magenta block, in car pixels */
  function carPiece() {
    const s = 420, base = 960;
    const x0 = CAR.w / 2 - (HERO_W * s) / 2;
    const glyphs = asGlyphs(HERO_WORD.map(([ch, ux, rot, dy]) => ({ shape: GLYPH[ch], x: x0 + ux * s, y: base - s + dy * s, s, rot, shear: 0.1 })));
    const pc = SP.throwup({
      id: 'train-piece', glyphs, fat: s * 0.23, ow: 20, ow2: 12, ext: [30, 34], canPrefix: 'tp',
      col: { fill: '#c9ced6', block: PAL.magenta, blockDark: null, line: PAL.black, line2: PAL.cyan, hl: PAL.white, fades: [{ color: PAL.white, y: base - s * 0.86, h: s * 0.3, opacity: 0.6, passes: 1 }, { color: '#7d8694', y: base - s * 0.12, h: s * 0.4, opacity: 0.6 }] },
      time: { fill: [0, 0.2, 0.3], fades: [1.0, 0.2], block: [1.3, 0.2], line: [1.6, 9000, 3], line2: [2.4, 9000, 3], hl: [3.0, 0.2] },
      lineDrip: { thr: 9, max: 8, len: 0.6, deadline: 100 }, dripRoom: 120,
    });
    SP.computeDrips(pc);
    const c = SP.finalLayer(pc);
    return { c, x0: pc.x0, y0: pc.y0 };
  }
  let carC = null;
  function carTex() {
    if (carC) return carC;
    const { w, h } = CAR;
    const raw = SP.mk(w, h);
    const g = raw.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#9da1a7');
    bg.addColorStop(0.08, C.trainBody);
    bg.addColorStop(0.55, '#b9bdc2');
    bg.addColorStop(0.78, '#8e9298');
    bg.addColorStop(0.86, C.trainDark);
    bg.addColorStop(1, '#202226');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    // ribs
    g.fillStyle = 'rgba(0,0,0,0.08)';
    for (let x = 0; x < w; x += 22) g.fillRect(x, h * 0.62, 6, h * 0.2);
    // stripe
    g.fillStyle = C.trainStripe;
    g.fillRect(0, h * 0.56, w, h * 0.05);
    // windows and doors
    for (let k = 0; k < 7; k++) {
      const x = 90 + k * 345;
      const isDoor = k % 3 === 1;
      g.fillStyle = C.glass;
      if (isDoor) {
        g.fillRect(x, h * 0.16, 250, h * 0.7);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(x + 122, h * 0.16, 6, h * 0.7);
      } else g.fillRect(x, h * 0.18, 260, h * 0.3);
      const rg = g.createLinearGradient(x, 0, x + 260, h * 0.5);
      rg.addColorStop(0, 'rgba(255,255,255,0.0)');
      rg.addColorStop(0.5, 'rgba(255,255,255,0.18)');
      rg.addColorStop(1, 'rgba(255,255,255,0.0)');
      g.fillStyle = rg;
      g.fillRect(x, h * 0.16, 260, h * 0.32);
    }
    // somebody already bombed this car: a couple of tags, sprayed with the same engine
    const tgs = [[200, h * 0.62, 150, PAL.black], [1300, h * 0.66, 120, PAL.white], [1900, h * 0.6, 130, PAL.magenta]];
    tgs.forEach(([x, y, hh, col], i) => {
      for (const part of SP.tagSkeleton(4000 + i, 4)) {
        const st = SP.stroke({ pts: part.pts.map((p) => [x + p[0] * hh, y + p[1] * hh]), smooth: true, t0: 0, dur: 0.5, color: col, sigma: 5, opacity: 0.95, speck: 0.6, seed: 4100 + i });
        SP.drawStroke(g, st, 1e9);
      }
    });
    // the crew got here first: a whole-car AiXenix piece (sprayed with the same engine)
    const pieceC = carPiece();
    if (pieceC) g.drawImage(pieceC.c, pieceC.x0, pieceC.y0);
    // bogies
    g.fillStyle = '#0d0e10';
    g.fillRect(0, h * 0.9, w, h * 0.1);
    for (const x of [380, 2050]) {
      g.fillStyle = '#26282c';
      g.beginPath();
      g.arc(x, h * 0.95, 70, 0, TAU);
      g.arc(x + 230, h * 0.95, 70, 0, TAU);
      g.fill();
    }
    // horizontal motion smear (the car does ~6000 px/s): stacked offset copies, then a soft blur
    const sm = SP.mk(w, h);
    const sg = sm.getContext('2d');
    const N = 7;
    for (let i = 0; i < N; i++) {
      sg.globalAlpha = 1 / (i + 1);
      sg.drawImage(raw, i * 11 - 33, 0);
    }
    carC = SP.mk(w, h);
    const f = carC.getContext('2d');
    f.filter = 'blur(4px)';
    f.drawImage(sm, 0, 0);
    f.filter = 'none';
    return carC;
  }
  const TRAIN = { t0: b(7, 0) - 0.05, t1: b(7, 0) - 0.05 + 1.1, x0: 1920 + 60, x1: -(3 * CAR.w + 2 * CAR.gap) - 60 };
  G.trainT = () => ({ t0: TRAIN.t0, t1: TRAIN.t1, cut: TCUT });
  function trainX(T) {
    const u = clamp((T - TRAIN.t0) / (TRAIN.t1 - TRAIN.t0));
    return lerp(TRAIN.x0, TRAIN.x1, u);
  }
  function drawTrain(ctx, T) {
    if (T < TRAIN.t0 || T > TRAIN.t1) return;
    const x = trainX(T);
    const tex = carTex();
    const y = -200 + 6 * L.noise1(T * 20, 3);
    for (let k = 0; k < 3; k++) {
      const cx = x + k * (CAR.w + CAR.gap);
      if (cx > FILM.W || cx + CAR.w < 0) continue;
      ctx.drawImage(tex, cx, y);
    }
    // the gaps between cars flicker the wall through; soft dark couplings
    for (let k = 0; k < 2; k++) {
      const gx = x + (k + 1) * CAR.w + k * CAR.gap;
      const gg = ctx.createLinearGradient(gx - 30, 0, gx + CAR.gap + 30, 0);
      gg.addColorStop(0, 'rgba(0,0,0,0)');
      gg.addColorStop(0.4, 'rgba(0,0,0,0.6)');
      gg.addColorStop(0.6, 'rgba(0,0,0,0.6)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(gx - 30, y, CAR.gap + 60, CAR.h);
    }
  }

  // ---------------------------------------------------------------------------
  // Tools: cans and the roller, one per tool id per piece, travelling between their strokes
  // ---------------------------------------------------------------------------
  let TRACKS = null;
  function tracks() {
    if (TRACKS) return TRACKS;
    const B = G.build();
    const m = new Map();
    for (const pc of B.pieces) {
      for (const g of pc.groups) {
        for (const st of g.strokes) {
          if (!st.can) continue;
          const key = (st.tool === 'roller' ? 'R' : pc.id) + ':' + (st.canId || 'x');
          if (!m.has(key)) m.set(key, []);
          m.get(key).push(st);
        }
      }
    }
    TRACKS = [];
    for (const [key, list] of m) {
      list.sort((a, c) => a.t0 - c.t0);
      TRACKS.push({ key, list, roller: list[0].tool === 'roller', t0: list[0].t0, t1: Math.max(...list.map((s) => s.t1)), seed: L.hash(key) & 0xffff });
    }
    return TRACKS;
  }
  G.tracks = tracks;
  const IN = 0.2, OUT = 0.22;
  function toolAt(tr, T) {
    if (T < tr.t0 - IN || T > tr.t1 + OUT) return null;
    let cur = null, prev = null, next = null;
    for (const st of tr.list) {
      if (T >= st.t0 && T <= st.t1) {
        cur = st;
        break;
      }
      if (st.t1 < T) prev = !prev || st.t1 > prev.t1 ? st : prev;
      if (st.t0 > T && (!next || st.t0 < next.t0)) next = st;
    }
    let x, y, on = 0, vis = 1, tilt = 0.14, col, sig;
    if (cur) {
      const p = SP.strokePos(cur, T);
      x = p.x;
      y = p.y;
      on = sstep(cur.t0, cur.t0 + 0.03, T) * (1 - sstep(cur.t1 - 0.03, cur.t1, T));
      const l = Math.hypot(p.dx, p.dy) || 1;
      tilt = 0.14 + 0.22 * (p.dx / l);
      col = cur.color;
      sig = cur.sigma;
    } else if (prev && next && next.t0 - prev.t1 < 0.8) {
      const a = SP.strokePos(prev, prev.t1), z = SP.strokePos(next, next.t0);
      const u = sstep(prev.t1, next.t0, T);
      x = lerp(a.x, z.x, u);
      y = lerp(a.y, z.y, u) - Math.sin(u * Math.PI) * (tr.roller ? 10 : 30);
      col = u < 0.5 ? prev.color : next.color;
      sig = next.sigma;
      tilt = 0.14 + 0.2 * Math.sign(z.x - a.x) * Math.sin(u * Math.PI);
    } else if (next && next.t0 - T <= IN) {
      const z = SP.strokePos(next, next.t0);
      const u = 1 - (next.t0 - T) / IN;
      x = z.x + (1 - u) * 90;
      y = z.y + (1 - u) * 140;
      vis = sstep(0, 0.7, u);
      col = next.color;
      sig = next.sigma;
    } else if (prev && T - prev.t1 <= OUT) {
      const a = SP.strokePos(prev, prev.t1);
      const u = (T - prev.t1) / OUT;
      x = a.x + u * 110;
      y = a.y + u * 160;
      vis = 1 - sstep(0.3, 1, u);
      col = prev.color;
      sig = prev.sigma;
    } else return null;
    return { x, y, on, vis, tilt, col, sig };
  }
  function drawTools(ctx, T) {
    for (const tr of tracks()) {
      const c = toolAt(tr, T);
      if (!c) continue;
      if (tr.roller) {
        SP.drawRoller(ctx, c.x, c.y, tr.list[0].W, c.col, c.vis);
        continue;
      }
      // a shake of the can (the ball rattles) whenever it is not spraying
      const shake = (1 - c.on) * 0.06 * Math.sin(T * 47 + tr.seed) * Math.exp(-(((T / BEAT) % 1) * 5));
      SP.drawCan(ctx, c.x, c.y, c.col, c.sig, c.tilt + shake, c.on, c.vis, T, tr.seed);
    }
  }

  // ---------------------------------------------------------------------------
  // The frame
  // ---------------------------------------------------------------------------
  G.frame = function frame(ctx, T) {
    const B = G.build();
    const wl = G.wall();
    const cam = G.camera(T);
    SP.render(ctx, { T, cam, wall: wl, pieces: B.pieces, pores: 0.6 });
    drawGround(ctx, cam);
    ctx.save();
    SP.camApply(ctx, cam);
    for (const st of B.stencils) SP.drawCard(ctx, st, T);
    for (const ps of B.planes) SP.drawPlane(ctx, ps, T);
    drawTools(ctx, T);
    // the loop bar: paint gathers at the foot of the field into a bead, lets go and falls (period = one bar)
    if (T >= LOOP0) {
      for (const [bx, by, ph, col] of G.BEADS) {
        const u = (((T - LOOP0) / BAR + ph) % 1 + 1) % 1;
        ctx.fillStyle = col;
        if (u < 0.72) {
          const r = 7.5 * sstep(0, 0.72, u);
          ctx.beginPath();
          ctx.ellipse(bx, by + r * 0.9, r * 0.85, r * 1.15, 0, 0, TAU);
          ctx.fill();
        } else {
          const tf = (u - 0.72) * BAR;
          const y = by + 8 + 0.5 * 1400 * tf * tf;
          const ground = WALL.base + 18;
          if (y < ground) {
            ctx.beginPath();
            ctx.ellipse(bx, y, 6, 8.5, 0, 0, TAU);
            ctx.fill();
          } else {
            const k = clamp((y - ground) / 300);
            ctx.globalAlpha = 1 - k;
            ctx.beginPath();
            ctx.ellipse(bx, ground + 2, 6 + 22 * k, 2 + 3 * k, 0, 0, TAU);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }
    }
    ctx.restore();
    drawTrain(ctx, T);
    const Tg = T >= LOOP0 ? LOOP0 + ((((T - LOOP0) % BAR) + BAR) % BAR) : T;
    SP.grade(ctx, Tg, { vig: 0.48, grain: 0.13 });
  };

  // ---------------------------------------------------------------------------
  // For the score
  // ---------------------------------------------------------------------------
  G.sprays = function sprays() {
    const out = [];
    for (const tr of tracks()) {
      if (tr.roller) continue;
      let cur = null;
      for (const st of tr.list) {
        if (cur && st.t0 - cur.t1 < 0.06) {
          cur.t1 = Math.max(cur.t1, st.t1);
          continue;
        }
        if (cur) out.push(cur);
        const p = SP.strokePos(st, st.t0);
        const cam = G.camera(st.t0);
        cur = { t0: st.t0, t1: st.t1, sigma: st.sigma, key: tr.key, pan: clamp(((p.x - cam.x) * cam.zoom) / 960, -1, 1) * 0.75 };
      }
      if (cur) out.push(cur);
    }
    out.sort((a, c) => a.t0 - c.t0);
    return out;
  };
  G.rolls = () => G.build() && G.ROLLS.map((r) => ({ t0: r.t0 + r.d0, t1: r.t0 + r.d0 + r.dur }));
  G.cards = function cards() {
    const B = G.build();
    return B.stencils.map((st) => ({ place: st.o.tPlace, lift: st.o.tLift, w: st.card.w })).concat(B.planes.map((p) => ({ place: p.o.tPlace, lift: p.o.tLift, plane: true })));
  };
})();
