/*
 * timeline.js : «Цепная реакция» (AiXenix ad 03). 112.5 bpm, 16th = 4 frames at 30 fps, 9 bars = 19.2 s.
 * ONE continuous take: the shots are bar-long labels on the same camera move (cuts are invisible).
 * The cue times below are the physics' impacts (00-phys.js solves the machine from these numbers).
 */
(function () {
  const S16 = 60 / 112.5 / 4;
  const bar = (b) => b * 16 * S16;
  const shots = [
    ['hook', 'Один клик: палец, домино «ОДИН КЛИК»'],
    ['line', 'волна «заявка» — тик на каждую 16-ю, домино сбивает шарик'],
    ['xylo', 'шарик катится по ксилофону и играет мелодию'],
    ['stamp', 'лоток CRM -> рычаг -> печать на счёт -> монета летит в копилку'],
    ['fan', 'весы жмут кнопку вентилятора, самолётик срывается'],
    ['flight', 'самолётик через стол, тап по телефону: t.me/aixenix'],
    ['mosaic', 'планка АВТОПИЛОТ валит поле: ряды открывают AiXenix'],
    ['banner', 'последний ряд толкает рулон: «Бизнес на автопилоте»'],
    ['loop', 'финальная плашка, бесшовный такт'],
  ];
  FILM.TIMELINE = {
    title: 'AiXenix — Цепная реакция',
    slug: '03-chain-reaction',
    bpm: 112.5,
    fps: 30,
    width: 1920,
    height: 1080,
    duration: bar(9),
    shots: shots.map(([id, brief], i) => ({ id, file: '02-film.js', start: bar(i), end: bar(i + 1), mode: 'none', title: id, transitionIn: 'cut', brief })),
    cues: [
      { t: 8 * S16, kind: 'tap' },
      { t: 16 * S16, kind: 'downbeat' },
      { t: 24 * S16, kind: 'knock' },
      { t: 48 * S16, kind: 'tray' },
      { t: 56 * S16, kind: 'stamp' },
      { t: 60 * S16, kind: 'coin' },
      { t: 64 * S16, kind: 'button' },
      { t: 68 * S16, kind: 'plane' },
      { t: 84 * S16, kind: 'phone' },
      { t: 88 * S16, kind: 'trigger' },
      { t: 90 * S16, kind: 'bar' },
      { t: 96 * S16, kind: 'row0' },
      { t: 104 * S16, kind: 'row8' },
      { t: 112 * S16, kind: 'reveal' },
      { t: 128 * S16, kind: 'loop' },
    ],
  };
})();
