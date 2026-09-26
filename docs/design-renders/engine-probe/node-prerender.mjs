// Build-time prerender feasibility: run the UNMODIFIED design scripts in Node against @napi-rs/canvas
// (Skia) through a tiny DOM shim, render the same attrs as the Chromium raw renders, pixel-diff them,
// and time a full 150-critter x 4-size sweep.
import fs from 'node:fs';
import vm from 'node:vm';
import { createCanvas, loadImage } from '@napi-rs/canvas';
const dir = new URL('.', import.meta.url).pathname;
const D = '/Users/quocs/Projects/critterpass/design/';

class HTMLElementShim {
  constructor() { this._a = {}; this.style = {}; }
  getAttribute(n) { return n in this._a ? this._a[n] : null; }
  setAttribute(n, v) { this._a[n] = String(v); }
  hasAttribute(n) { return n in this._a; }
  appendChild() {} addEventListener() {}
  getBoundingClientRect() { return { width: +this._a.size || 48 }; }
}
const registry = {};
const g = {
  HTMLElement: HTMLElementShim,
  customElements: { get: n => registry[n], define: (n, c) => { registry[n] = c; } },
  document: { createElement: t => { const c = createCanvas(1, 1); c.style = {}; return c; }, querySelectorAll: () => [] },
  matchMedia: () => ({ matches: false }),
  devicePixelRatio: 3, performance, setTimeout, clearTimeout, console, Math, Event,
  requestAnimationFrame: () => 0, cancelAnimationFrame: () => {},
  dispatchEvent: () => true,
};
g.window = g;
vm.createContext(g);
for (const f of ['doodles.js', 'critters-data.js', 'critters-draw-1.js', 'critters-draw-2.js']) vm.runInContext(fs.readFileSync(D + f, 'utf8'), g, { filename: f });
if (!g.CritterDex.ready) throw new Error('boot did not complete');
const DA = registry['doodle-art'];

function render(attrs) {
  const el = new DA();
  Object.entries(Object.assign({ anim: 'none', blink: 'false' }, attrs)).forEach(([k, v]) => el.setAttribute(k, v));
  el.connectedCallback(); // no IntersectionObserver in shim -> setup() + draw(1) synchronously
  return el.cv;
}

// 1) pixel diff vs Chromium for identical attrs
const attrsById = JSON.parse(fs.readFileSync(dir + 'raw-chromium/attrs.json', 'utf8'));
fs.mkdirSync(dir + 'raw-node', { recursive: true });
const diffs = {};
for (const [id, attrs] of Object.entries(attrsById)) {
  const cv = render(attrs);
  const buf = await cv.encode('png'); fs.writeFileSync(dir + 'raw-node/' + id + '.png', buf);
  const ref = await loadImage(dir + 'raw-chromium/' + id + '.png');
  if (ref.width !== cv.width || ref.height !== cv.height) { diffs[id] = { sizeMismatch: [ref.width, ref.height, cv.width, cv.height] }; continue; }
  const rc = createCanvas(ref.width, ref.height), rx = rc.getContext('2d'); rx.drawImage(ref, 0, 0);
  const a = rx.getImageData(0, 0, ref.width, ref.height).data, b = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  let sum = 0, over8 = 0, over32 = 0, max = 0, n = a.length / 4, cover = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0; for (let k = 0; k < 4; k++) { const d = Math.abs(a[i + k] - b[i + k]); sum += d; if (d > m) m = d; }
    if (m > 8) over8++; if (m > 32) over32++; if (m > max) max = m; if (a[i + 3] > 0) cover++;
  }
  diffs[id] = { px: `${cv.width}x${cv.height}`, meanAbsPerChannel: +(sum / (n * 4)).toFixed(3), pctPxDiffGt8: +(100 * over8 / cover).toFixed(2), pctPxDiffGt32: +(100 * over32 / cover).toFixed(2), maxChannelDiff: max };
}

// 2) throughput: 150 critters x common/locked x 4 sizes, PNG encode included
const ids = g.CritterDex.list.map(c => c.kind);
const sizes = [48, 96, 232, 512];
const t0 = performance.now(); let files = 0, bytes = 0;
const tRender = {}, tEncode = {};
for (const s of sizes) { tRender[s] = 0; tEncode[s] = 0; }
for (const kind of ids) for (const s of sizes) for (const locked of [null, '#3a3466']) {
  const a = { kind, size: s, sticker: locked ? '#2c2750' : '#f4efe4' }; if (locked) a.locked = locked;
  const r0 = performance.now(); const cv = render(a); const r1 = performance.now();
  const png = await cv.encode('png'); const r2 = performance.now();
  tRender[s] += r1 - r0; tEncode[s] += r2 - r1; files++; bytes += png.length;
  if (kind === 'cp-013' && s === 96) fs.writeFileSync(dir + 'raw-node/sweep-cp-013-96' + (locked ? '-locked' : '') + '.png', png);
}
const total = performance.now() - t0;
const perSize = Object.fromEntries(sizes.map(s => [s, { renderMsEach: +(tRender[s] / (ids.length * 2)).toFixed(2), encodeMsEach: +(tEncode[s] / (ids.length * 2)).toFixed(2) }]));
console.log(JSON.stringify({ diffs, sweep: { files, totalSec: +(total / 1000).toFixed(1), avgPngKB: +(bytes / files / 1024).toFixed(1), totalMB: +(bytes / 1048576).toFixed(1), perSize } }, null, 1));
