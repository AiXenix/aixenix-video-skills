/* chain-hero fixture: ONE hero frame of the machine mid-chain (the field reveal), rendered by the
 * film's own scene files (copied into scenes/). heroT shifts the take: fixture t=0 is film T=13.4. */
FILM.TIMELINE = {
  title: 'chain-hero fixture', bpm: 112.5, fps: 30, width: 1920, height: 1080, duration: 32 / 15, heroT: 13.4,
  shots: [{ id: 'hero', file: '02-film.js', start: 0, end: 32 / 15, mode: 'none', title: 'hero', brief: 'mid-chain hero frame: rows falling, AiXenix appearing' }],
  cues: [{ t: 0, kind: 'row' }],
};
