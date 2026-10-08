// «Мурмурация» — AiXenix ad 09. THE LAW: nothing is drawn; every shape and every letter is the silhouette
// of a living flock of 30 000 starlings at sunset (src/cast.js simulates them, deterministically, from T = -2 s).
// 90 bpm, 8 bars = 21.333 s at 30 fps, 1920 x 1080. One continuous take: the eight shots are one sky and one
// flock seen at global T (the cuts are invisible). Bar 8 is the seamless loop (drift-corrected flock, wrapped
// waves, whole-bar wing beats). Formation calls land on beats; see FILM.flock.SCRIPT.
(function () {
  const b = (n) => (n * 60) / 90;
  FILM.TIMELINE = {
    title: 'Мурмурация — Бизнес на автопилоте',
    bpm: 90,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: b(32),
    shots: [
      { id: 'dusk', file: '01-dusk.js', start: 0, end: b(2), mode: 'none', title: 'Закат', brief: 'Golden hour over the city; a murmuration of 30 000 starlings folds and turns, dark banking waves run through it.' },
      { id: 'hook', file: '02-hook.js', start: b(2), end: b(7), mode: 'none', title: '30 000 птиц', brief: 'The flock streams into «30 000 ПТИЦ / НИ ОДНОГО ПИЛОТА»; two waves cross the words; loose mini-flocks above.' },
      { id: 'gears', file: '03-gears.js', start: b(7), end: b(11), mode: 'none', title: 'Шестерни', brief: 'The words dissolve and swing round into two meshing gears that turn — every tooth is birds circling.' },
      { id: 'growth', file: '04-growth.js', start: b(11), end: b(14), mode: 'none', title: 'Рост', brief: 'The gears unspool into a rising arrow drawn left to right; a wave races up the arrow to its tip on the beat.' },
      { id: 'autopilot', file: '05-autopilot.js', start: b(14), end: b(19), mode: 'none', title: 'Автопилот', brief: '«БИЗНЕС НА / АВТОПИЛОТЕ» — huge, readable for 2.5 s; dark waves sweep it both ways.' },
      { id: 'plane', file: '06-plane.js', start: b(19), end: b(22), mode: 'none', title: 'Самолётик', brief: 'The words fold into a giant paper plane (dense keel, airy wing) that launches across the sky.' },
      { id: 'card', file: '07-card.js', start: b(22), end: b(28), mode: 'none', title: 'Плашка', brief: 'The plane sheds its birds as it flies, writing «AiXenix», «БИЗНЕС НА АВТОПИЛОТЕ», «aixenix.com», plane + «t.me/aixenix».' },
      { id: 'loop', file: '08-loop.js', start: b(28), end: b(32), mode: 'none', title: 'Петля', brief: 'The card holds, alive: wings beat, outlines breathe, one slow wave crosses; one bar, seamless loop.' },
    ],
    cues: [
      { t: 0, kind: 'open', note: 'pad, wind, wings' },
      { t: b(2), kind: 'swell', note: 'the call: the flock streams into words' },
      { t: b(4), kind: 'hit', note: 'hook readable, wave' },
      { t: b(6), kind: 'pop', note: 'wave back' },
      { t: b(7), kind: 'swell', note: 'to the gears' },
      { t: b(8), kind: 'hit', note: 'gears mesh' },
      { t: b(9), kind: 'pop', note: 'wave' },
      { t: b(11), kind: 'swell', note: 'to the arrow' },
      { t: b(12), kind: 'hit', note: 'arrow tip' },
      { t: b(14), kind: 'swell', note: 'to the words' },
      { t: b(16), kind: 'hit', note: 'БИЗНЕС НА АВТОПИЛОТЕ — the drop' },
      { t: b(18), kind: 'pop', note: 'wave back' },
      { t: b(19), kind: 'swell', note: 'the fold into a plane' },
      { t: b(20), kind: 'hit', note: 'launch' },
      { t: b(22), kind: 'swell', note: 'the plane writes the card' },
      { t: b(24), kind: 'hit', note: 'card formed' },
      { t: b(26), kind: 'pop', note: 'wave' },
      { t: b(28), kind: 'cut', note: 'loop bar: one slow wave' },
    ],
  };
})();
