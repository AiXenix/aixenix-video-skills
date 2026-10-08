/*
 * cast.js : the cast of this film is 504 split-flap modules. This file is the board's MECHANICS:
 * the drum, the flip physics, the planner and the per-film scripts that schedule every flap.
 * It is a prelude (loaded before the timeline) so that both the picture (src/scenes/01-board.js)
 * and the score (src/music.js, which renders without the scene files) read ONE schedule:
 * every flap the viewer sees fall is a click the listener hears.
 *
 * Law of the drum: 75 flaps per module, cyclic —
 *   [blank, 62 printed glyphs, 11 takeoff-picture flaps P1..P11, 1 card flap]  (75 flaps)
 * A module advances one flap at a time (RATE per second). To go from A to Z it must clatter
 * through everything in between; a picture flap carries only this module's tile of the picture.
 *
 * Deterministic: no Math.random / Date / performance.now; jitter comes from FILM.lib.hash.
 * The plan is built lazily on first use (FILM.TIMELINE does not exist yet when this file loads).
 */
(function () {
  'use strict';
  const FILM = window.FILM;
  const LIB = FILM.lib;
  const PI = Math.PI;
  const h01 = (...k) => LIB.hash('splitflap', ...k) / 4294967296;

  // ------------------------------------------------------------------ board geometry (world units)
  const COLS = 36;
  const ROWS = 14;
  const NMOD = COLS * ROWS;
  const PX = 1.1; // module pitch
  const PY = 1.58;
  const FW = 0.92; // flap width
  const FH = 0.632; // flap length, hinge to free edge
  const HG = 0.014; // half of the hinge gap: the print starts this far from the axle
  const FACE_H = 2 * (HG + FH);
  const TH_TOP = -0.075; // resting top flap leans back
  const TH_BOT = PI + 0.07; // resting bottom stack hangs slightly back (faces a little down)
  const TH_END = TH_BOT - 0.016; // a landing flap rests just in front of the stack
  const TH_REL = TH_TOP + 0.012; // a released flap starts just in front of the next one
  const mx = (c) => (c - (COLS - 1) / 2) * PX;
  const my = (r) => ((ROWS - 1) / 2 - r) * PY;
  const IX0 = mx(0) - FW / 2;
  const IX1 = mx(COLS - 1) + FW / 2;
  const IY0 = my(ROWS - 1) - FACE_H / 2;
  const IY1 = my(0) + FACE_H / 2;
  const IASP = (IX1 - IX0) / (IY1 - IY0);

  // ------------------------------------------------------------------ the drum
  const CHARS = ' АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯDFGIJLNQRSUVWZ0123456789.:-/·';
  const NG = CHARS.length; // 63 printed flaps (0 = blank)
  const P0 = NG; // takeoff picture flaps P1..P8
  const NP = 11; // takeoff picture flaps P1..P11
  const CARD = P0 + NP; // the final card flap
  const NF = CARD + 1; // 72 flaps per drum
  const HOMO = { A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У' };
  function gi(ch) {
    const c = HOMO[ch] || ch;
    const i = CHARS.indexOf(c);
    if (i < 0) throw new Error('no flap printed with ' + JSON.stringify(ch));
    return i;
  }
  const fwd = (a, b) => (((b - a) % NF) + NF) % NF; // flips needed to go from flap a to flap b

  // ------------------------------------------------------------------ flip mechanics
  const RATE = 30; // flaps per second (one per frame at 30 fps)
  const DT = 1 / RATE;
  const FALL = 0.068; // release to first impact
  const LIFE_MID = FALL + 0.045; // a flap in a run: small hop, then the next one lands on it
  const LIFE_LAST = FALL + 0.21; // the last flap of a run bounces freely
  function theta(tau, last) {
    if (tau <= 0) return TH_REL;
    if (tau < FALL) {
      const u = tau / FALL;
      return TH_REL + (TH_END - TH_REL) * u * u * (0.3 + 0.7 * u);
    }
    let tb = tau - FALL;
    let d = last ? 0.085 : 0.03;
    let h = last ? 0.34 : 0.075;
    for (let k = 0; k < 4; k++) {
      if (tb < d) {
        const q = tb / d;
        return TH_END - h * 4 * q * (1 - q);
      }
      tb -= d;
      d *= 0.52;
      h *= 0.28;
    }
    return TH_END;
  }

  // ------------------------------------------------------------------ the planner
  // Every module keeps a flat list of flips (release times). Commands append runs of flips.
  const MODS = [];
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) MODS.push({ c, r, i: r * COLS + c, f0: 0, cur: 0, free: -1e9, tr: [], last: [] });
  const MOD = (c, r) => MODS[r * COLS + c];
  // run n flips starting at release time t0
  function run(M, n, t0) {
    if (n <= 0) return;
    if (t0 < M.free - 1e-9) throw new Error(`module ${M.c},${M.r}: run at ${t0.toFixed(3)} overlaps the previous run (free at ${M.free.toFixed(3)})`);
    for (let j = 0; j < n; j++) {
      M.tr.push(t0 + j * DT);
      M.last.push(j === n - 1 ? 1 : 0);
    }
    M.cur = (M.cur + n) % NF;
    M.free = t0 + (n - 1) * DT + FALL + 0.03;
  }
  // Each module's motor is a little out of phase with its neighbours (and with the camera's 30 fps):
  // a deterministic per-run offset inside one flap period, so falling flaps are caught at every angle.
  const jit = (M) => h01('jit', M.i, M.tr.length) * 0.95 * DT;
  // arrive on flap `face` with the last impact at tLand (+ the module's phase offset)
  function land(M, face, tLand, extra, exact) {
    const n = fwd(M.cur, face) + NF * (extra || 0);
    run(M, n, tLand - FALL - (n - 1) * DT + (exact ? 0 : 0.5 * jit(M)));
    return n;
  }
  // start flipping toward `face` at tStart
  function go(M, face, tStart) {
    const n = fwd(M.cur, face);
    run(M, n, tStart + jit(M));
    return n;
  }
  function setFace(M, face) {
    M.f0 = face;
    M.cur = face;
  }
  // text helpers: write a string on row r from column c (each char one module)
  function textCells(str, c0, r) {
    const out = [];
    for (let k = 0; k < str.length; k++) out.push({ M: MOD(c0 + k, r), face: gi(str[k]) });
    return out;
  }

  const LAYOUT = {
    head: [['ВЫЛЕТ', 4, 1], ['23:40', 28, 1]],
    hook: [
      ['23:40', 'РУЧНОЙ ВВОД', 'ОТМЕНЁН'],
      ['23:55', 'EXCEL-ХАОС', 'ЗАДЕРЖАН'],
      ['00:10', 'НОЧНЫЕ ЗАЯВКИ', 'ПРОПУЩЕН'],
      ['00:25', 'ОТЧЁТЫ ВРУЧНУЮ', 'ОТМЕНЁН'],
    ],
    motto: ['БИЗНЕС НА АВТОПИЛОТЕ', 8, 6],
    flight: ['РЕЙС AIXENIX · ВЫЛЕТ: СЕЙЧАС', 4, 8],
    site: ['AIXENIX.COM', 12, 7],
    gate: ['ВЫХОД: T.ME/AIXENIX', 10, 8],
    mark: [2, 4], // wordmark rows on the card
    plane: [7, 9, 7, 9], // paper plane: cols 7..9, rows 7..9 (left of the gate row)
  };

  let planned = false;
  let beatTime = null;
  function plan() {
    if (planned) return;
    planned = true;
    const TL = FILM.TIMELINE || {};
    // The film: 112.5 bpm, a bar is 64 frames. b(bar, beat) is global time (bar 1-based, beat 0-based).
    const BPM = TL.bpm || 112.5;
    const BEAT = 60 / BPM;
    const BAR = 4 * BEAT;
    const b = (bar, beat) => (bar - 1) * BAR + (beat || 0) * BEAT;

    // ------------------------------------------------------------------ scripts
    const SCRIPTS = {};
    // Fixture: the hook rows are up; a landing wave sweeps the board into the runway picture.
    SCRIPTS.fixture = function () {
      const rows = [
        ['ВЫЛЕТ', 3, 1],
        ['DEPARTURES', 9, 1],
        ['23:40', 28, 1],
        ['23:40 РУЧНОЙ ВВОД      ОТМЕНЁН', 3, 3],
        ['23:55 EXCEL-ХАОС       ЗАДЕРЖАН', 3, 4],
        ['00:10 НОЧНЫЕ ЗАЯВКИ    ПРОПУЩЕН', 3, 5],
        ['00:25 ОТЧЁТЫ ВРУЧНУЮ   ОТМЕНЁН', 3, 6],
      ];
      for (const [s, c, r] of rows) for (const { M, face } of textCells(s, c, r)) setFace(M, face);
      // the storm front: each module starts rolling toward P1 as a diagonal front passes it
      for (const M of MODS) {
        const w = (M.c / (COLS - 1)) * 1.7 + (1 - M.r / (ROWS - 1)) * 0.25 + h01('fx', M.i) * 0.06;
        go(M, P0, 0.2 + w);
      }
    };

    SCRIPTS.film = function () {
      // bar 1 — the hook rolls in: the header (after one homing turn, so it is already spinning on
      // frame 0) on beat 2, the four rows on the 8ths of beats 3-4 ...
      for (const [str, c, r] of LAYOUT.head) for (const { M, face } of textCells(str, c, r)) land(M, face, b(1, 1), 1, true);
      LAYOUT.hook.forEach(([tm, dest, st], i) => {
        const r = 3 + i;
        const tl = b(1, 2 + i * 0.5);
        // the rows roll up from blank (a homing turn here would flash picture flaps mid-word)
        for (const { M, face } of textCells(tm, 4, r)) land(M, face, tl);
        for (const { M, face } of textCells(dest, 10, r)) land(M, face, tl);
        // ... and every status slams down together on the downbeat of bar 2
        for (const { M, face } of textCells(st, 25, r)) land(M, face, b(2, 0));
      });
      // bar 2 beat 3: the clock ticks 23:40 -> 23:41 (one flap)
      land(MOD(32, 1), gi('1'), b(2, 2), 0, true);
      // bar 2, the 8th after beat 3 — the storm: a tide rises from the empty bottom rows; every blank
      // module it reaches starts rolling through its whole drum toward the first picture flap. A
      // module still holding a letter waits and rolls so that it lands together with its blank
      // neighbours, so the hook text dissolves last and the picture settles as one rising front.
      // the rows that carry the hook (header + 4 rows, cols 4..32) are reached a little later, blanks
      // between the words included, so the words never merge while they are being read
      const inHook = (M) => (M.r === 1 || (M.r >= 3 && M.r <= 6)) && M.c >= 4 && M.c <= 32;
      const tide = (M) => b(2, 2.5) + (1 - M.r / (ROWS - 1)) * 1.45 + (M.c / (COLS - 1)) * 0.3 + h01('storm', M.i) * 0.06 + (inHook(M) ? 0.42 : 0);
      for (const M of MODS) {
        if (M.cur === 0) go(M, P0, tide(M));
        else land(M, P0, tide(M) + (P0 - 1) * DT + FALL);
      }
      // bars 4-5 — the takeoff: ten single flips on the 16ths, each a ripple left to right (a flip-book)
      for (let k = 1; k < NP; k++) {
        const tk = b(4, 3) + (k - 1) * (BEAT / 4);
        for (const M of MODS) land(M, P0 + k, tk + (M.c / (COLS - 1)) * 0.1 + (M.r / (ROWS - 1)) * 0.025, 0, true);
      }
      // bar 6 — БИЗНЕС НА АВТОПИЛОТЕ lands on the downbeat, over the empty sky
      {
        const [str, c, r] = LAYOUT.motto;
        for (const { M, face } of textCells(str, c, r)) land(M, face, b(6, 0));
      }
      // bar 7 — РЕЙС AIXENIX · ВЫЛЕТ: СЕЙЧАС lands on the downbeat; it may not start rolling before
      // the motto has had half a beat, so the one or two long rolls (the · and the :) land a little late
      {
        const [str, c, r] = LAYOUT.flight;
        for (const { M, face } of textCells(str, c, r)) {
          const n = fwd(M.cur, face);
          if (b(7, 0) - FALL - (n - 1) * DT < b(6, 0.5)) go(M, face, b(6, 0.5));
          else land(M, face, b(7, 0));
        }
      }
      // bar 8 — the card: the gate row and the site row will hold glyphs, the motto row stays;
      // every other module flips once (sky -> card) in a sweep from the left
      const keep = new Set();
      const site = textCells(...LAYOUT.site);
      const gate = textCells(...LAYOUT.gate);
      {
        const [str, c, r] = LAYOUT.motto;
        for (const { M } of textCells(str, c, r)) keep.add(M.i);
      }
      for (const { M } of site) keep.add(M.i);
      for (const { M } of gate) keep.add(M.i);
      const sweep = (M) => b(8, 0) + (M.c / (COLS - 1)) * 0.5 + (M.r / (ROWS - 1)) * 0.12;
      for (const M of MODS) {
        if (keep.has(M.i)) continue;
        // the sky flips once to the card; the old flight row has to roll all the way round
        go(M, CARD, sweep(M));
      }
      // the site and gate rows start as the sweep passes and settle one by one, like a real board
      for (const { M, face } of site) go(M, face, sweep(M));
      for (const { M, face } of gate) go(M, face, sweep(M));
    };
    beatTime = b;
    SCRIPTS[TL.boardScript || 'film']();
    // flatten for fast lookup
    for (const M of MODS) {
      M.trA = Float64Array.from(M.tr);
      M.lastA = Uint8Array.from(M.last);
    }
  }

  // ------------------------------------------------------------------ module state at time t
  // fills S with: top face, bottom face, falling flaps [theta, faceFront, faceBack, last], shadows
  const S = { top: 0, bot: 0, nf: 0, fall: new Float32Array(32), shTop: 0, shBot: 0 };
  const KSH = 1.25; // key light: tan(elevation) as seen in the module's y/z plane
  function stateAt(M, t) {
    const tr = M.trA;
    let lo = 0;
    let hi = tr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tr[mid] <= t) lo = mid + 1;
      else hi = mid;
    }
    const R = lo; // released flips
    S.top = (M.f0 + R) % NF;
    S.nf = 0;
    S.shTop = 0;
    S.shBot = 0;
    // walk back from the newest released flap: flaps in flight, then at most one landed flap still
    // hopping on top of the stack; everything older has settled into the bottom stack
    let botIdx = R;
    let newestTau = -1;
    for (let j = R - 1; j >= Math.max(0, R - 12); j--) {
      const tau = t - tr[j];
      const last = M.lastA[j] === 1;
      let th;
      if (tau < FALL) {
        th = theta(tau, last);
        botIdx = j;
        if (newestTau < 0 || tau > newestTau) newestTau = tau;
      } else {
        // the newest landed flap hops until the next one lands on it
        const life = last ? LIFE_LAST : LIFE_MID;
        const covered = newestTau > FALL * 0.8;
        if (tau < life && !covered) {
          th = theta(tau, last);
          botIdx = j;
        } else {
          botIdx = j + 1;
          break;
        }
      }
      const k = S.nf * 4;
      S.fall[k] = th;
      S.fall[k + 1] = (M.f0 + j) % NF;
      S.fall[k + 2] = (M.f0 + j + 1) % NF;
      S.fall[k + 3] = last ? 1 : 0;
      S.nf++;
      // shadow of this flap's free edge on the board plane
      const ys = Math.cos(th) - Math.sin(th) * KSH;
      if (ys > 0) S.shTop = Math.max(S.shTop, Math.min(1.2, ys));
      else S.shBot = Math.max(S.shBot, Math.min(1.2, -ys));
      if (tau >= FALL || S.nf >= 7) break;
    }
    S.bot = (M.f0 + botIdx) % NF;
    return S;
  }

  FILM.board = {
    COLS, ROWS, NMOD, PX, PY, FW, FH, HG, FACE_H, TH_TOP, TH_BOT, mx, my, IX0, IX1, IY0, IY1, IASP,
    CHARS, NG, P0, NP, CARD, NF, RATE, DT, FALL, LAYOUT, MODS,
    plan,
    stateAt(M, t) {
      plan();
      return stateAt(M, t);
    },
    beatTime: (bar, beat) => {
      plan();
      return beatTime(bar, beat);
    },
    // every flap impact { t, c, r, last } in time order — the score's percussion
    impacts() {
      plan();
      const out = [];
      for (const M of MODS) for (let j = 0; j < M.trA.length; j++) out.push({ t: M.trA[j] + FALL, c: M.c, r: M.r, last: M.lastA[j] === 1 });
      out.sort((a, b2) => a.t - b2.t || a.c - b2.c || a.r - b2.r);
      return out;
    },
  };
})();
