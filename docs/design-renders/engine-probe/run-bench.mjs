// Benchmark the design's <doodle-art> renderer in headless Chromium.
// usage: node run-bench.mjs [shell|gpu] > out.json
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const mode = process.argv[2] || 'shell';
const launch = mode === 'gpu'
  ? { channel: 'chromium', args: ['--enable-gpu', '--use-angle=metal', '--enable-gpu-rasterization'] }
  : {};
const b = await chromium.launch(launch);
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.route('http://localhost:8765/__probe.html', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(dir + 'probe.html', 'utf8') }));
await page.goto('http://localhost:8765/__probe.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.CritterDex && window.CritterDex.ready, null, { timeout: 20000 });
await page.addScriptTag({ path: dir + 'bench-page-helpers.js' });
const cdp = await ctx.newCDPSession(page);
const out = { mode };
out.env = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl'); const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  return { ua: navigator.userAgent, dpr: devicePixelRatio, canvasDpr: Math.min(2, devicePixelRatio) * 1.25, webgl: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null, kinds: Object.keys(DoodleKit.K).length, creatures: Object.keys(DoodleKit.CREATURES).length, icons: P.ICONS };
});

const heap = async () => { await cdp.send('HeapProfiler.collectGarbage'); return (await cdp.send('Runtime.getHeapUsage')).usedSize; };

for (const rate of [1, 4]) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  const r = {};
  r.all96 = await page.evaluate(() => P.benchAll(96, 6));
  r.all300 = await page.evaluate(() => P.benchAll(300, 4));
  r.firstPaint = await page.evaluate(() => ['gecko', 'tanuki', 'cp-005', 'cp-013', 'cp-099', 'pin'].flatMap(k => [24, 56, 96, 232, 300].map(s => P.firstPaint(k, s, 10))));
  r.anim = [];
  for (const [n, s] of [[1, 300], [6, 96], [12, 96], [40, 96], [88, 96], [4, 232]]) r.anim.push(await page.evaluate(([n, s]) => P.animTest(n, s, P.GUIDES.concat(CritterDex.list.slice(0, 40).map(c => c.kind))), [n, s]));
  out['cpu' + rate] = r;
}
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

// Canvas2D API calls for one full frame
out.api = await page.evaluate(() => {
  const res = {};
  for (const [k, stk] of [['gecko', '#f4efe4'], ['cp-013', '#f4efe4'], ['cp-013', null], ['pin', null]]) {
    const el = P.mk({ kind: k, size: 96, sticker: stk, anim: 'none' });
    res[k + (stk ? '+sticker' : '') + ':setup'] = P.countApi(() => el.setup());
    res[k + (stk ? '+sticker' : '') + ':draw1'] = P.countApi(() => el.draw(1));
    res[k + (stk ? '+sticker' : '') + ':draw.5'] = P.countApi(() => el.draw(.5));
    el.remove();
  }
  return res;
});

// memory: JS heap for ops + canvas backing stores for a 150-sticker bestiary at 96px
const h0 = await heap();
const mem = await page.evaluate(() => {
  const box = document.createElement('div'); box.id = 'membox'; document.body.appendChild(box);
  let bytes = 0; const kinds = P.GUIDES.concat(CritterDex.list.filter(c => !c.spec.k).map(c => c.id));
  for (const k of kinds) { const el = P.mk({ kind: k, size: 96, sticker: '#f4efe4', anim: 'none' }, box); el.setup(); el.draw(1); bytes += el.cv.width * el.cv.height * 4 * (el.oc ? 2 : 1); }
  return { n: kinds.length, canvasBytes: bytes };
});
const h1 = await heap();
mem.jsHeapDeltaBytes = h1 - h0;
out.mem = mem;
await page.evaluate(() => document.getElementById('membox').remove());
console.log(JSON.stringify(out));
await b.close();
