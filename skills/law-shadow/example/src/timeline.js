// «Тень» — AiXenix ad 04. 90 bpm: beat 2/3 s, bar 8/3 s; 8 bars = 21.333 s = 640 frames at 30 fps.
// One continuous take: one hovering sculpture of office junk turns under three projector spots;
// at exact yaws its shadows lock into words. Every shot calls the same rig (src/cast.js).
const B = 2 / 3; // beat
FILM.TIMELINE = {
  title: 'AiXenix — Тень',
  bpm: 90,
  fps: 30,
  width: 1920,
  height: 1080,
  duration: 32 * B,
  shots: [
    { id: 'mess', file: '01-mess.js', start: 0, end: 2 * B, mode: 'none', title: 'Spot A clacks on a hovering mess', brief: 'From beside spot A: its beam runs through the junk cloud; on the wall the shadow is chaos, converging as the cloud turns.' },
    { id: 'hook-haos', file: '02-hook-haos.js', start: 2 * B, end: 5 * B, mode: 'none', title: 'The shadow says ХАОС?', brief: 'At 1.333 s the junk shadow locks into «ХАОС?»; hold.' },
    { id: 'gear', file: '03-gear.js', start: 5 * B, end: 9 * B, mode: 'none', title: 'Turn — spot C — a gear', brief: 'Turn away; spot C clacks on; at 5.333 s the right panel locks into a gear.' },
    { id: 'slogan', file: '04-slogan.js', start: 9 * B, end: 16 * B, mode: 'none', title: 'БИЗНЕС НА | АВТОПИЛОТЕ', brief: 'Spot B on; at 8.0 s left and right panels lock into the slogan; hold.' },
    { id: 'plane', file: '05-plane.js', start: 16 * B, end: 20 * B, mode: 'none', title: 'A paper plane flies in', brief: 'Turn toward the final yaw; a flat slab of scraps casts a paper plane gliding across panel C.' },
    { id: 'final', file: '06-final.js', start: 20 * B, end: 28 * B, mode: 'none', title: 'Final card in shadows', brief: 'All three panels lock: AiXenix / БИЗНЕС НА АВТОПИЛОТЕ, aixenix.com, plane + t.me/aixenix.' },
    { id: 'loop', file: '07-loop.js', start: 28 * B, end: 32 * B, mode: 'none', title: 'Loop bar', brief: 'Static final card; dust and haze cycle once per bar.' },
  ],
  cues: [
    { t: 0, kind: 'clack', light: 'A' },
    { t: 2 * B, kind: 'lock', id: 'haos' },
    { t: 5 * B, kind: 'turn' },
    { t: 7 * B, kind: 'clack', light: 'C' },
    { t: 8 * B, kind: 'lock', id: 'gear' },
    { t: 9.5 * B, kind: 'turn' },
    { t: 11 * B, kind: 'clack', light: 'B' },
    { t: 12 * B, kind: 'lock', id: 'slogan' },
    { t: 16 * B, kind: 'turn' },
    { t: 18.25 * B, kind: 'plane' },
    { t: 20 * B, kind: 'lock', id: 'final' },
    { t: 28 * B, kind: 'loop' },
  ],
};
