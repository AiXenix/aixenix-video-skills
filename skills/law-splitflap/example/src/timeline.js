// «Табло вылетов» — AiXenix ad 05. ONE continuous take of a giant Solari split-flap departure board
// (36 x 14 = 504 modules). Everything on screen is a flap: text is glyph flaps, pictures are mosaics
// of per-module picture flaps, and every module can only step through its drum one flap at a time.
// 112.5 bpm: a beat is 16 frames, a bar 64 frames (2.1333 s); 10 bars = 21.333 s at 30 fps.
// All shots draw the same board (src/scenes/01-board.js) at global T; they are chapters, not cuts.
// Bar 10 is the seamless loop. Times are written as frames / 30 so every event sits on a frame.
FILM.TIMELINE = {
  title: 'Табло вылетов — Бизнес на автопилоте',
  bpm: 112.5,
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 640 / 30,
  boardScript: 'film',
  shots: [
    { id: 'hook', file: '01-board.js', start: 0, end: 128 / 30, mode: 'none', title: 'Табло', brief: 'Night terminal. The departures roll in row by row on the 8ths; the four statuses slam down on bar 2: РУЧНОЙ ВВОД — ОТМЕНЁН, EXCEL-ХАОС — ЗАДЕРЖАН, НОЧНЫЕ ЗАЯВКИ — ПРОПУЩЕН, ОТЧЁТЫ ВРУЧНУЮ — ОТМЕНЁН. The clock ticks 23:40 -> 23:41. Slow push. On the 8th after beat 3 the storm tide starts in the empty bottom rows.' },
    { id: 'storm', file: '01-board.js', start: 128 / 30, end: 192 / 30, mode: 'none', title: 'Шторм', brief: 'A tide rises from the bottom rows: every blank module clatters through its whole drum (the alphabet runs in bands), the hook text dissolves last. The camera pulls back as the runway half of the picture settles from the bottom up.' },
    { id: 'takeoff', file: '01-board.js', start: 192 / 30, end: 320 / 30, mode: 'none', title: 'Взлёт', brief: 'The mosaic completes: a night runway, skyline, moon, an airliner with the AiXenix fin. After a beat of hold, ten single-flap ripples on the 16ths advance the picture like a flip-book: the plane rolls, rotates, lifts off and climbs past the moon, leaving a contrail; it stays small in the upper right.' },
    { id: 'motto', file: '01-board.js', start: 320 / 30, end: 384 / 30, mode: 'none', title: 'Автопилот', brief: 'Over the empty sky one row rolls in and lands on the downbeat: БИЗНЕС НА АВТОПИЛОТЕ. Push in.' },
    { id: 'flight', file: '01-board.js', start: 384 / 30, end: 448 / 30, mode: 'none', title: 'Рейс', brief: 'Below it the departure row: РЕЙС AIXENIX · ВЫЛЕТ: СЕЙЧАС lands on the downbeat.' },
    { id: 'card', file: '01-board.js', start: 448 / 30, end: 576 / 30, mode: 'none', title: 'Посадка', brief: 'A single-flap sweep turns the sky into the card: the AiXenix wordmark mosaic and a paper plane; the AIXENIX.COM and ВЫХОД: T.ME/AIXENIX rows (with the paper plane) start rolling as the sweep passes and settle module by module, like a real board. Hold.' },
    { id: 'loop', file: '01-board.js', start: 576 / 30, end: 640 / 30, mode: 'none', title: 'Петля', brief: 'The finished card; nothing flips, only the camera breathes (period one bar): the seamless loop.' },
  ],
  cues: [
    { t: 16 / 30, kind: 'land', note: 'header ВЫЛЕТ + clock lands' },
    { t: 32 / 30, kind: 'land', note: 'row 1 lands' },
    { t: 40 / 30, kind: 'land', note: 'row 2 lands' },
    { t: 48 / 30, kind: 'land', note: 'row 3 lands' },
    { t: 56 / 30, kind: 'land', note: 'row 4 lands' },
    { t: 64 / 30, kind: 'slam', note: 'all four statuses slam down' },
    { t: 96 / 30, kind: 'tick', note: 'clock 23:40 -> 23:41' },
    { t: 104 / 30, kind: 'storm', note: 'the storm tide starts in the bottom rows' },
    { t: 192 / 30, kind: 'impact', note: 'the runway half of the picture has settled' },
    { t: 240 / 30, kind: 'flip', note: 'takeoff frame 2' },
    { t: 244 / 30, kind: 'flip', note: 'takeoff frame 3' },
    { t: 248 / 30, kind: 'flip', note: 'takeoff frame 4' },
    { t: 252 / 30, kind: 'flip', note: 'takeoff frame 5' },
    { t: 256 / 30, kind: 'flip', note: 'takeoff frame 6' },
    { t: 260 / 30, kind: 'flip', note: 'takeoff frame 7' },
    { t: 264 / 30, kind: 'flip', note: 'takeoff frame 8' },
    { t: 268 / 30, kind: 'flip', note: 'takeoff frame 9' },
    { t: 272 / 30, kind: 'flip', note: 'takeoff frame 10' },
    { t: 276 / 30, kind: 'flip', note: 'takeoff frame 11' },
    { t: 320 / 30, kind: 'land', note: 'БИЗНЕС НА АВТОПИЛОТЕ lands' },
    { t: 384 / 30, kind: 'land', note: 'РЕЙС AIXENIX · ВЫЛЕТ: СЕЙЧАС lands' },
    { t: 448 / 30, kind: 'wave', note: 'the card sweep starts' },
    { t: 512 / 30, kind: 'hold', note: 'the card holds (the last CTA rolls settle by 17.95 s)' },
    { t: 576 / 30, kind: 'loop', note: 'loop bar' },
  ],
};
