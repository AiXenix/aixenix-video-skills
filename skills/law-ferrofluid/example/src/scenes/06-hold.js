// Shot 06 'hold', global T 10.2–12.0. One continuous physical set: the frame is the ferrofluid engine
// (src/props.js) rendering the director's state (src/cast.js) at global T. Nothing is drawn here.
(function () {
  'use strict';
  const ID = 'hold';
  FILM.scene({ id: ID, draw(ctx, t, info) {
    FILM.ferro.render(ctx, FILM.ferroState(info.T));
  } });
})();
