// Material fixture: one 8 s shot that proves the watercolour engine (src/props.js) on a test sheet.
FILM.TIMELINE = {
  title: 'watercolor-material',
  bpm: 90,
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 8,
  shots: [{ id: 'material', file: '01-material.js', start: 0, end: 8, mode: 'none', brief: 'Test sheet: bloom+salt, petals+backrun, wet-in-wet mixing, granulation, glaze, lettering.' }],
  cues: [{ t: 0, kind: 'open' }],
};
