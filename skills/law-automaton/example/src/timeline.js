// AiXenix ad 02 «Автоматон 1774». Law: nothing appears that the machine does not physically make —
// a clockwork scribe writes every mark with a goose quill, its arm driven by cams whose profiles ARE
// the letters (src/props.js computes them from the stroke data; src/cast.js extrudes and reads them).
// 150 bpm (8th = 0.2 s = one escapement tick), bar = 1.6 s, one cam revolution = 3 bars = 4.8 s,
// 15 bars = 24.0 s at 30 fps. The last bar is the seamless loop.
const BAR = 1.6;
FILM.TIMELINE = {
  title: 'AiXenix — Автоматон 1774',
  bpm: 150,
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 15 * BAR,
  shots: [
    { id: 'wind', file: '01-wind.js', start: 0, end: BAR, mode: 'none', title: 'Завод', brief: 'Dark workshop, moonlight on the scribe\'s back; the brass key turns three clicks on beats 2-4; the cams wait behind the oval glass.' },
    { id: 'wake', file: '02-wake.js', start: BAR, end: 1.5 * BAR, mode: 'none', title: 'Пуск', brief: 'Release on the downbeat: the escapement starts ticking, the porcelain head bows, the hand lifts the quill out of the ink and wipes it on the rim.' },
    { id: 'hook', file: '03-hook.js', start: 1.5 * BAR, end: 4 * BAR, mode: 'none', title: 'Автоматизация с 1774', brief: 'Over the right shoulder, tracking the nib: the quill writes «Автоматизация с 1774» — wet, glossy, a blot where it lands.' },
    { id: 'reveal', file: '04-reveal.js', start: 4 * BAR, end: 7 * BAR, mode: 'none', title: 'Механизм', brief: 'Cut on the clunk: behind the glass the cam stack drops to the next triplet; the camera glides along the turning cams and riding followers, up past the escapement and over the shoulder to «Бизнес на автопилоте».' },
    { id: 'sign', file: '05-sign.js', start: 7 * BAR, end: 10 * BAR, mode: 'none', title: 'AiXenix — теперь с ИИ', brief: 'Macro on the nib as it writes «AiXenix», wet ink glinting; the camera rises to read «AiXenix — теперь с ИИ».' },
    { id: 'urls', file: '06-urls.js', start: 10 * BAR, end: 13 * BAR, mode: 'none', title: 'aixenix.com / t.me/aixenix', brief: 'The camera climbs to a top-down view as the last card writes «aixenix.com» and a paper plane with «t.me/aixenix»; the quill returns to the well.' },
    { id: 'card', file: '07-card.js', start: 13 * BAR, end: 14 * BAR, mode: 'none', title: 'Плашка', brief: 'The machine stops. The finished sheet is the final card; the last line is still wet and gleams, then dries.' },
    { id: 'loop', file: '08-loop.js', start: 14 * BAR, end: 15 * BAR, mode: 'none', title: 'Петля', brief: 'The same card, ink dry, the candle breathing on a one-bar cycle: a seamless loop.' },
  ],
  cues: [
    { t: 0, kind: 'open', note: 'workshop, a held breath' },
    { t: 0.4, kind: 'click', note: 'key click 1' },
    { t: 0.8, kind: 'click', note: 'key click 2' },
    { t: 1.2, kind: 'click', note: 'key click 3' },
    { t: 1.6, kind: 'release', note: 'escapement starts; ticks on every 8th to 20.8' },
    { t: 2.4, kind: 'cut', note: 'writing begins' },
    { t: 6.4, kind: 'clunk', note: 'cam stack drops to card 2' },
    { t: 11.2, kind: 'clunk', note: 'cam stack drops to card 3' },
    { t: 16.0, kind: 'clunk', note: 'cam stack drops to card 4' },
    { t: 20.8, kind: 'stop', note: 'the spring runs down; the escapement stops' },
    { t: 22.4, kind: 'loop', note: 'loop bar' },
  ],
};
