// AiXenix ad «Растёт само» — watercolour, wet-on-wet. One top-down take of a sheet on which nothing is
// painted by hand: water is laid, a drop lands, and the colour runs along the wet paths by itself.
// 90 bpm, 8 bars, 21.333 s at 30 fps. Eight shots = eight bars of the same take. Bar 8 is the loop.
const B = 8 / 3; // one bar in seconds
FILM.TIMELINE = {
  title: 'AiXenix — Бизнес на автопилоте (акварель)',
  bpm: 90,
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 8 * B,
  shots: [
    { id: 'hook', file: '01-hook.js', start: 0, end: B, mode: 'none', title: 'Растёт само', brief: 'Close on wet, glistening letters; one drop lands at 0.667 and the colour runs along the thread through «Растёт само».' },
    { id: 'hub', file: '02-hub.js', start: B, end: 2 * B, mode: 'none', title: 'Ствол', brief: 'The thread climbs on as a trunk; a big drop lands on the hub (3.333) and blooms; the camera eases back; branches run out.' },
    { id: 'flowchart', file: '03-flowchart.js', start: 2 * B, end: 3 * B, mode: 'none', title: 'Схема', brief: 'Rain on the beats: document, chat, chart (bars grow up), robot bloom at branch ends; salt on the hub at 6.0.' },
    { id: 'garden', file: '04-garden.js', start: 3 * B, end: 4 * B, mode: 'none', title: 'Сад', brief: 'Lightning, check, gear, mail bloom on the beats; small flowers and buds wave out along the branches.' },
    { id: 'slogan', file: '05-slogan.js', start: 4 * B, end: 5 * B, mode: 'none', title: 'Бизнес на автопилоте', brief: 'A branch runs from the mail icon into the wet slogan «Бизнес на автопилоте», which fills along its thread.' },
    { id: 'tilt', file: '06-tilt.js', start: 5 * B, end: 6 * B, mode: 'none', title: 'Наклон', brief: 'The sheet tilts on the dark desk: wet pigment runs in streams into the logo; drops rain into «AiXenix» on the 8ths and 16ths.' },
    { id: 'card', file: '07-card.js', start: 6 * B, end: 7 * B, mode: 'none', title: 'Плашка', brief: 'Flat again: a running drop draws a looping flight trail and blooms into a paper plane; aixenix.com and t.me/aixenix fill.' },
    { id: 'loop', file: '08-loop.js', start: 7 * B, end: 8 * B, mode: 'none', title: 'Петля', brief: 'The final card holds; the paint is frozen and a glint crosses the wet logo once a bar: a seamless loop.' },
  ],
  cues: [
    { t: 0, kind: 'open', note: 'wet paper' },
    { t: 2 / 3, kind: 'hit', note: 'first drop' },
    { t: B, kind: 'cut', note: 'trunk climbs' },
    { t: B + 2 / 3, kind: 'hit', note: 'hub drop' },
    { t: 2 * B, kind: 'cut', note: 'document' },
    { t: 2 * B + 2 / 3, kind: 'hit', note: 'chat + salt' },
    { t: 2 * B + 4 / 3, kind: 'pop', note: 'chart' },
    { t: 2 * B + 2, kind: 'pop', note: 'robot' },
    { t: 3 * B, kind: 'cut', note: 'lightning' },
    { t: 3 * B + 2 / 3, kind: 'pop', note: 'check' },
    { t: 3 * B + 4 / 3, kind: 'pop', note: 'gear' },
    { t: 3 * B + 2, kind: 'pop', note: 'mail' },
    { t: 4 * B, kind: 'cut', note: 'slogan' },
    { t: 5 * B, kind: 'cut', note: 'tilt' },
    { t: 5 * B + 4 / 3, kind: 'pop', note: 'drop i' },
    { t: 5 * B + 5 / 3, kind: 'pop', note: 'drop X' },
    { t: 5 * B + 2, kind: 'pop', note: 'drop e' },
    { t: 6 * B, kind: 'cut', note: 'card: plane trail' },
    { t: 6 * B + 2 / 3, kind: 'pop', note: 'aixenix.com' },
    { t: 7 * B, kind: 'cut', note: 'loop bar' },
  ],
};
