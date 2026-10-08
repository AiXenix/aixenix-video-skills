// shared fixture views (id, film time, camera)
window.__VIEWS = [
  ['v-wind', 0.9, { pos: [-0.09, -0.04, 0.5], look: [0.0, -0.08, 0.345], fov: 30, focus: [0, -0.11, 0.35], fstop: 0.6, exposure: 1.2 }],
  ['v-wake', 2.0, { pos: [-0.16, 0.25, -0.06], look: [0.0, 0.235, 0.25], fov: 26, focus: [0.0, 0.25, 0.22], fstop: 0.7 }],
  ['v-hook', 4.6, { pos: [0.16, 0.3, 0.33], look: [-0.03, 0.0, -0.01], fov: 30, focus: 'nib', fstop: 0.45 }],
  ['v-revA', 6.55, { pos: [0.07, 0.035, 0.46], look: [0.0, -0.012, 0.29], fov: 34, focus: [0.0, -0.008, 0.33], fstop: 0.5, inner: 0.01 }],
  ['v-revB', 10.0, { pos: [0.2, 0.2, 0.52], look: [0.0, 0.0, 0.05], fov: 30, focus: 'nib', fstop: 0.5, inner: 0.01 }],
  ['v-sign', 12.5, { pos: [0.08, 0.06, 0.07], look: [-0.02, 0.0, 0.0], fov: 32, focus: 'nib', fstop: 0.5 }],
  ['v-card', 23.0, { pos: [0.012, 0.4, 0.04], look: [0.012, 0.0, 0.006], fov: 26, focus: [0.012, 0, 0.012], fstop: 0.15 }],
];

FILM.TIMELINE = { title: 'automaton fixture', bpm: 150, fps: 30, width: 1920, height: 1080, duration: 7,
  shots: [
    { id: 'v-wind', file: '01-fx.js', start: 0, end: 1, mode: 'none', title: 'v-wind', brief: 'fixture view' },
    { id: 'v-wake', file: '01-fx.js', start: 1, end: 2, mode: 'none', title: 'v-wake', brief: 'fixture view' },
    { id: 'v-hook', file: '01-fx.js', start: 2, end: 3, mode: 'none', title: 'v-hook', brief: 'fixture view' },
    { id: 'v-revA', file: '01-fx.js', start: 3, end: 4, mode: 'none', title: 'v-revA', brief: 'fixture view' },
    { id: 'v-revB', file: '01-fx.js', start: 4, end: 5, mode: 'none', title: 'v-revB', brief: 'fixture view' },
    { id: 'v-sign', file: '01-fx.js', start: 5, end: 6, mode: 'none', title: 'v-sign', brief: 'fixture view' },
    { id: 'v-card', file: '01-fx.js', start: 6, end: 7, mode: 'none', title: 'v-card', brief: 'fixture view' }
  ],
  cues: [ { t: 0, kind: 'impact' } ] };
