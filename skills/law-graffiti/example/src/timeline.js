// AiXenix ad «Граффити». One handheld take along a railway wall that a crew paints live:
// cans, a roller on a pole, stencil cards; 90 bpm, beat 0.6667 s, bar 2.6667 s, 9 bars = 24 s.
// The choreography lives in src/cast.js; each shot is one bar of the same take. Bar 9 loops.
(function () {
  // frame-exact grid: a beat is 20 frames at 30 fps
  const b = (bar, beat) => ((bar * 4 + (beat || 0)) * 20) / 30;
  FILM.TIMELINE = {
    title: 'AiXenix — Граффити',
    bpm: 90,
    fps: 30,
    width: 1920,
    height: 1080,
    duration: 24,
    shots: [
      { id: 'routine', file: '01-routine.js', start: 0, end: b(1), mode: 'none', title: 'Рутина', brief: 'A grey wall of old stencilled routine words; four cans cross them out on the beats.' },
      { id: 'hook', file: '02-hook.js', start: b(1), end: b(2), mode: 'none', title: 'Рутину — роботам', brief: 'The crew throws up a chrome piece over them: РУТИНУ — РОБОТАМ.' },
      { id: 'roller', file: '03-roller.js', start: b(2), end: b(3), mode: 'none', title: 'Валик', brief: 'Whip to the bare panel; the roller pole lays a cyan field, one stroke per beat.' },
      { id: 'field', file: '04-field.js', start: b(3), end: b(4), mode: 'none', title: 'Поле', brief: 'The roller finishes the field; the beat builds.' },
      { id: 'drop', file: '05-drop.js', start: b(4), end: b(5), mode: 'none', title: 'AiXenix', brief: 'Drop: four cans at once spray AiXenix; the field drips race down.' },
      { id: 'peel', file: '06-peel.js', start: b(5), end: b(6), mode: 'none', title: 'Бизнес на автопилоте', brief: 'Stencil cards peel on the beats: БИЗНЕС, НА, АВТОПИЛОТЕ, aixenix.com.' },
      { id: 'plane', file: '07-plane.js', start: b(6), end: b(7), mode: 'none', title: 'Самолётик', brief: 'A paper plane held to the wall, sprayed around, peels off and flies; t.me/aixenix and ИИ-ИНСТРУМЕНТЫ КАЖДЫЙ ДЕНЬ.' },
      { id: 'train', file: '08-train.js', start: b(7), end: b(8), mode: 'none', title: 'Поезд', brief: 'A train wipes the frame; behind it the camera has pulled back to the whole wall.' },
      { id: 'card', file: '09-card.js', start: b(8), end: 24, mode: 'none', title: 'Финал', brief: 'The whole wall is the final card; breathing camera, glints; seamless loop.' },
    ],
    cues: [
      { t: 0, kind: 'open' },
      { t: b(0, 1), kind: 'cross' },
      { t: b(1), kind: 'hook' },
      { t: b(2, 1), kind: 'roll' },
      { t: b(3), kind: 'bar' },
      { t: b(4), kind: 'drop' },
      { t: b(5, 2), kind: 'peel' },
      { t: b(5, 2.5), kind: 'peel' },
      { t: b(5, 3), kind: 'peel' },
      { t: b(6, 1.5), kind: 'plane' },
      { t: b(7), kind: 'train' },
      { t: b(8), kind: 'loop' },
    ],
  };
})();
