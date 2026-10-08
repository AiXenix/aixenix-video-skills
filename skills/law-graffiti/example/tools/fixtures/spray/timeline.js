// Material fixture: one wall section, every spray behaviour on one frame (tag, throw-up, stencil, drips, cans).
FILM.TIMELINE = {
  title: 'spray-material',
  bpm: 90,
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 5,
  shots: [{ id: 'spray-test', file: '01-spray.js', start: 0, end: 5, mode: 'none', brief: 'Material proof.' }],
  cues: [{ t: 0, kind: 'open' }],
};
