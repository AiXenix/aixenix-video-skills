// Shot 02 'hook', global T 2.4–4.8. One continuous physical set: the frame is the ferrofluid engine
// (src/props.js) rendering the director's state (src/cast.js) at global T. Nothing is drawn here.
(function () {
  'use strict';
  const ID = 'hook';
  FILM.scene({ id: ID, draw(ctx, t, info) {
    FILM.ferro.render(ctx, FILM.ferroState(info.T));
  } });
})();
