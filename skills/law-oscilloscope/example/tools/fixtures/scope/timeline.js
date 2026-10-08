// fixture «scope»: one look-development frame per stretch of the real score (FILM.osc), drawn by the
// real instrument. Each shot shows the beam at a fixed global time of the film plus t.
FILM.TIMELINE = { title: 'scope fixture', bpm: 900 / 7, fps: 30, width: 1920, height: 1080, duration: 28 / 15,
  shots: [ { id: 'scope', file: '01-scope.js', start: 0, end: 28 / 15, mode: 'none', title: 'scope', brief: 'the gear train, bar 4 of the film' } ],
  cues: [ { t: 0, kind: 'gear' } ] };
