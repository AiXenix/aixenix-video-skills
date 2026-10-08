(function () {
  'use strict';
  let R = null;
  function init(w, h) {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false); renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0012);
    const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100); cam.position.set(0, 1.2, 5);
    const geo = new THREE.RoundedBoxGeometry(1.4, 1.4, 1.4, 6, 0.18);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff2bd6, metalness: 0.3, roughness: 0.35 });
    const mesh = new THREE.Mesh(geo, mat); scene.add(mesh);
    scene.add(new THREE.HemisphereLight(0x00f0ff, 0x220022, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2.5); d.position.set(3, 4, 2); scene.add(d);
    const composer = new THREE.EffectComposer(renderer); composer.addPass(new THREE.RenderPass(scene, cam));
    composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(w, h), 0.8, 0.4, 0.6)); composer.addPass(new THREE.OutputPass());
    R = { canvas, renderer, scene, cam, mesh, composer, w, h };
  }
  FILM.scene({ id: 'cube', draw(ctx, t, info) {
    const W = FILM.W || 1920, H = FILM.H || 1080;
    if (!R) init(W, H);
    R.mesh.rotation.set(t * 0.9, t * 1.3, 0); R.cam.lookAt(0, 0, 0);
    R.composer.render();
    ctx.save(); FILM.baseTransform ? FILM.baseTransform(ctx) : null; ctx.drawImage(R.canvas, 0, 0, W, H); ctx.restore();
  } });
})();
