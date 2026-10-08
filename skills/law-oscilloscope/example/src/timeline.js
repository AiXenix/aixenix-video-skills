// 01 «Осциллограф: звук рисует картинку» — AiXenix. One electron beam; X = LEFT channel, Y = RIGHT
// channel of the film's own soundtrack. 900/7 bpm (beat 7/15 s = 14 frames at 30 fps), 12 bars of
// 28/15 s = 22.4 s; the last bar is sample-identical to the one before it: a seamless loop.
// The score (what the beam draws and plays, when) lives in src/cast.js; every scene draws the same
// instrument at its global time (src/props.js, FILM.scope). Shots name the story beats.
(function () {
  const b = (bar, beat) => ((bar * 4 + (beat || 0)) * 14) / 30; // frame-exact grid
  FILM.TIMELINE = {
    title: '01 Осциллограф — AiXenix',
    bpm: 900 / 7,
    fps: 30,
    width: 1920,
    height: 1080,
    duration: b(12),
    shots: [
      { id: 'hook', file: '01-hook.js', start: 0, end: b(1, 2), mode: 'none', title: 'Слушайте картинку', brief: 'A dot hums at 60 Hz, then writes СЛУШАЙТЕ КАРТИНКУ in 16th-note bursts; the words pump 30/60 Hz.' },
      { id: 'sine', file: '02-sine.js', start: b(1, 2), end: b(2), mode: 'none', title: 'Синусоида', brief: 'The words fold flat into the time-base sweep; a sine wave rises on it.' },
      { id: 'knots', file: '03-knots.js', start: b(2), end: b(3, 2), mode: 'none', title: 'Узлы Лиссажу', brief: 'Kick in. The sine folds into Lissajous knots 1:2, 2:3, 3:4, 5:6, 5:8, 5:9, 8:9, 9:10: each knot is the interval you hear.' },
      { id: 'gear', file: '04-gear.js', start: b(3, 2), end: b(5), mode: 'none', title: 'Шестерня', brief: 'The knot unwinds into a circle (unison), grows teeth, and a gear train ticks a tooth per beat.' },
      { id: 'deal', file: '05-deal.js', start: b(5), end: b(6), mode: 'none', title: 'Сделка', brief: 'The gears melt into two hands that reach and clasp; the handshake rings a high note.' },
      { id: 'chart', file: '06-chart.js', start: b(6), end: b(7), mode: 'none', title: 'Рост', brief: 'A chart rises bar by bar on a rising minor scale, the trace frizzing; the beam parks for a 16th.' },
      { id: 'slogan', file: '07-slogan.js', start: b(7), end: b(8, 2), mode: 'none', title: 'Бизнес на автопилоте', brief: 'DROP: БИЗНЕС / НА АВТОПИЛОТЕ written in four 16ths, held while the bass pumps 30/60 Hz.' },
      { id: 'brand', file: '08-brand.js', start: b(8, 2), end: b(9), mode: 'none', title: 'AiXenix', brief: 'The slogan flows into AiXenix; the phosphor turns brand cyan/magenta.' },
      { id: 'plane', file: '09-plane.js', start: b(9), end: b(10), mode: 'none', title: 'Самолётик', brief: 'A paper plane flies in, loops the loop over the name and lands by the address while the card writes itself.' },
      { id: 'card', file: '10-card.js', start: b(10), end: b(11), mode: 'none', title: 'Финальная карточка', brief: 'AiXenix · БИЗНЕС НА АВТОПИЛОТЕ · aixenix.com · t.me/aixenix + plane, traced at 30/60 Hz.' },
      { id: 'loop', file: '11-loop.js', start: b(11), end: b(12), mode: 'none', title: 'Петля', brief: 'Sample-identical repeat of the card bar: the seamless loop.' },
    ],
    cues: [
      { t: b(0, 1), kind: 'write', note: 'the dot starts writing' },
      { t: b(2), kind: 'drop', note: 'kick in, sine folds into the 1:2 knot' },
      { t: b(2, 1), kind: 'knot', note: '2:3' },
      { t: b(2, 2), kind: 'knot', note: '3:4' },
      { t: b(2, 3), kind: 'knot', note: '5:6' },
      { t: b(3), kind: 'knot', note: '5:8' },
      { t: b(4), kind: 'gear', note: 'gear train' },
      { t: b(5, 2.5), kind: 'deal', note: 'clasp + ring (off-beat)' },
      { t: b(7), kind: 'drop', note: 'slogan written' },
    ],
  };
})();
