// Fixture: the origami engine at any global time (one shot spanning the whole film).
FILM.TIMELINE = {
  title: 'origami fixture', bpm: 112.5, fps: 30, width: 1920, height: 1080, duration: 40 * 60 / 112.5,
  shots: [{ id: 'hero', file: '01-hero.js', start: 0, end: 40 * 60 / 112.5, mode: 'none', title: 'hero', brief: 'engine at global T' }],
  cues: [{ t: 0, kind: 'open' }],
};
