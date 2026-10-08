# Third-party notices

## procedural-film
`skills/procedural-film/` and the project foundation copied into every `example/` and `skills/aixenix-video/engine/`
(`src/core.js`, `src/lib.js`, `src/player.js`, `tools/*`) come from https://github.com/kuhnhomeuk-cell/procedural-film.
MIT License, Copyright (c) 2026 Dean Kuhn — full text in `skills/procedural-film/LICENSE-procedural-film`.
Some tools were patched in this repo (a `vendor.js` prelude, scan exemptions, optional ANGLE Metal on macOS).

## three.js
`src/vendor.js` (in `skills/aixenix-video/engine/` and the three.js-based examples) is an esbuild IIFE bundle of
three.js r180 and selected `examples/jsm` addons. https://github.com/mrdoob/three.js —
MIT License, Copyright (c) 2010-2025 three.js authors. The license header is kept inside the bundle.

## Fonts
No font files are shipped. Text is drawn with system fonts available to Chromium or with each law's own stroke geometry.
