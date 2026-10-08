#!/usr/bin/env node
// coverage.cjs : ground-truth check of the shadow art, independent of the GPU.
// Builds the sculpture exactly as the film does (src/cast.js), then projects EVERY scrap and junk item
// through each reveal's light at that reveal's yaw onto its wall panel (CPU, canvas 2D) and compares the
// result with the target silhouette.
//
//   node tools/coverage.cjs            per target: hole % (target pixels left lit) and extra % (shadow
//                                      outside the target), both measured away from 2-px anti-aliased edges
//   node tools/coverage.cjs --png      also writes .tmp/coverage/<target>.png (top: target, bottom: shadow)
//
// Run it after ANY change to CFG.lights, CFG.targets, the cloud (CFG.R / RY / O) or the junk plan.
// Healthy: hole 0.0 % and extra < 0.1 % for every target; zones "ok"; slab with a from/to flight.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { chromium } = require(path.join(__dirname, 'node_modules', 'playwright'));
const png = process.argv.includes('--png');

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-cov-'));
  const url = (f) => 'file://' + path.join(ROOT, 'src', f);
  fs.writeFileSync(path.join(tmp, 'c.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body>
<script src="${url('vendor.js')}"></script><script src="${url('cast.js')}"></script></body></html>`);
  const net = process.env.FILM_NO_NET === '1' ? ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost'] : [];
  const b = await chromium.launch({ args: ['--allow-file-access-from-files', ...net] });
  const p = await b.newPage();
  p.on('pageerror', (e) => console.log('[page error]', e.message));
  await p.goto('file://' + path.join(tmp, 'c.html'));
  const r = await p.evaluate((png) => {
    const B = FILM.shadow.build();
    const out = { scraps: B.scraps.length, decor: (B.decor || []).length, zones: B.zoneStats, slab: B.stats.slab, rows: [] };
    for (let i = 0; i < B.cons.length; i++) {
      const pr = FILM.shadow.project(i);
      let img = null;
      if (png) {
        const M = B.cons[i].M, c = document.createElement('canvas');
        c.width = M.W; c.height = M.H * 2 + 4;
        const g = c.getContext('2d');
        g.drawImage(M.canvas, 0, 0); g.drawImage(pr.canvas, 0, M.H + 4);
        img = c.toDataURL();
      }
      out.rows.push({ id: B.cons[i].id, hole: (100 * pr.hole) / pr.area, extra: (100 * pr.extra) / pr.area, img });
    }
    return out;
  }, png);
  await b.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`scraps ${r.scraps}, junk items ${r.decor}`);
  console.log('zones', JSON.stringify(r.zones || []), ' slab', JSON.stringify(r.slab || null));
  let bad = 0;
  for (const row of r.rows) {
    const ok = row.hole < 0.05 && row.extra < 0.1;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'BAD '} ${row.id.padEnd(8)} hole ${row.hole.toFixed(2)} %  extra ${row.extra.toFixed(2)} %`);
    if (png && row.img) {
      const dir = path.join(ROOT, '.tmp', 'coverage');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, row.id + '.png'), Buffer.from(row.img.split(',')[1], 'base64'));
    }
  }
  process.exit(bad ? 1 : 0);
})();
