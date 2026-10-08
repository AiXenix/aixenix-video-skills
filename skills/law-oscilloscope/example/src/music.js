// music.js : the soundtrack IS the picture.
// Owner: music. Contract: docs/CONTRACT.md, section Audio.
//
// 01 «Осциллограф». There is no synthesiser here and no mixer: the score is composed in
// src/cast.js as the deflection signal of the oscilloscope's single electron beam (FILM.osc).
// LEFT channel = X deflection, RIGHT channel = Y deflection. This file only plays those exact
// samples at a fixed gain (the scope's volts/div), so whoever routes this audio into a real
// oscilloscope in X-Y mode sees the film being drawn.
//
// No EQ, compressor, limiter or reverb may touch the signal: any filter would bend the picture.
// The shapes are sized so the peaks stay under the ceiling by construction; tools/audio/peaks.cjs
// and an ebur128 pass verify it. The only processing is a 3 ms fade-in when playback starts
// mid-film (a seek) and a 10 ms fade-out at the very end of the file.
(function () {
  'use strict';
  const FILM = window.FILM;
  // scope units -> full scale. x spans [-1, 1] across the graticule: at GAIN 0.4 the widest
  // shapes peak near -6 dBFS and the master integrates near -16 LUFS (measured, see shots.md).
  const GAIN = 0.4;

  FILM.audio = {
    GAIN,
    render(ctx, opts) {
      const o = opts || {};
      const start = Math.max(0, Number(o.start) || 0);
      const dest = o.dest || ctx.destination;
      const osc = FILM.osc.get();
      const i0 = Math.min(osc.n, Math.round(start * osc.sr));
      const n = osc.n - i0;
      if (n <= 1) return;
      const buf = ctx.createBuffer(2, n, osc.sr);
      const L = buf.getChannelData(0);
      const R = buf.getChannelData(1);
      for (let i = 0; i < n; i++) {
        L[i] = osc.X[i0 + i] * GAIN;
        R[i] = osc.Y[i0 + i] * GAIN;
      }
      if (i0 > 0) {
        const m = Math.min(n, Math.round(0.003 * osc.sr));
        for (let i = 0; i < m; i++) {
          L[i] *= i / m;
          R[i] *= i / m;
        }
      }
      const m = Math.min(n, Math.round(0.01 * osc.sr));
      for (let i = 0; i < m; i++) {
        const g = i / m;
        L[n - 1 - i] *= g;
        R[n - 1 - i] *= g;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.start(ctx.currentTime);
    },
  };
})();
