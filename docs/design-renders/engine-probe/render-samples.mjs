// Render sample critters (forms, guides, widget variants, draw-on frames, small-size behaviour) to PNG
// using the unmodified design scripts in headless Chromium at iPhone DPR 3.
import { chromium } from '/opt/homebrew/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const dir = new URL('.', import.meta.url).pathname;
const outDir = dir + 'renders/';
fs.mkdirSync(outDir, { recursive: true });

const EDGE = (px, c) => `filter:drop-shadow(${px}px 0 0 ${c}) drop-shadow(-${px}px 0 0 ${c}) drop-shadow(0 ${px}px 0 ${c}) drop-shadow(0 -${px}px 0 ${c})`;
const S = '#f4efe4';
// [file, label, attrs, wrapperStyle, cellClass]
const rows = [
  ['Tokek (gecko) forms: design-specified (3l-2/3l-3/3m-2); legendary unlocked art not in design', [
    ['tokek-1-common', 'COMMON (design)', { kind: 'gecko', sticker: S }],
    ['tokek-2-rare', 'RARE fill #54d6a4 (design)', { kind: 'gecko', sticker: S, fill: '#54d6a4', spot: '#2e9a74' }],
    ['tokek-3-epic', 'EPIC #ff9a4d + cheer + pink edge (design)', { kind: 'gecko', sticker: S, fill: '#ff9a4d', spot: '#c4623e', pose: 'cheer' }, EDGE(2, '#ff5fa8')],
    ['tokek-4-legendary-locked', 'LEGENDARY locked gold (design)', { kind: 'gecko', sticker: '#3a2f14', locked: '#6b5a24' }],
    ['tokek-4-legendary-probe', 'LEGENDARY unlocked: PROBE palette (4a-3 gold gecko) + gold edge', { kind: 'gecko', sticker: S, fill: '#ffe89a', spot: '#e0a92a', accent: '#c89221', pose: 'cheer' }, EDGE(3, '#ffd84a')],
  ]],
  ['Pon (tanuki): common + designed legendary (Sakura Pon 3l-10); rare/epic not designed', [
    ['pon-1-common', 'COMMON (design)', { kind: 'tanuki', sticker: S, seed: 42 }],
    ['pon-4-legendary-sakura', 'LEGENDARY Sakura Pon (design)', { kind: 'tanuki', sticker: S, fill: '#ffc2d9', spot: '#c94f86', belly: '#fff1f6', pose: 'cheer', seed: 391 }, EDGE(3, '#ffd84a')],
    ['pon-legendary-locked', 'LEGENDARY locked (design)', { kind: 'tanuki', sticker: '#3a2f14', locked: '#6b5a24' }],
  ]],
  ['CritterDex local Léon (cp-013, sit): form rule APPLIED BY PROBE (no per-form data exists)', [
    ['leon-1-common', 'COMMON (data colours)', { kind: 'cp-013', sticker: S, seed: 13 }],
    ['leon-2-rare-probe', 'RARE probe recolour', { kind: 'cp-013', sticker: S, seed: 13, fill: '#ffd84a', spot: '#c4623e', belly: '#fff6cc' }],
    ['leon-3-epic-probe', 'EPIC probe: recolour + cheer + pink edge', { kind: 'cp-013', sticker: S, seed: 13, fill: '#ff9cc8', spot: '#c94f86', belly: '#ffe0ee', pose: 'cheer' }, EDGE(2, '#ff5fa8')],
    ['leon-4-legendary-probe', 'LEGENDARY probe: gold + gold edge', { kind: 'cp-013', sticker: S, seed: 13, fill: '#ffe89a', spot: '#e0a92a', belly: '#fff6cc', pose: 'wave' }, EDGE(3, '#ffd84a')],
    ['chep-epic-probe', 'cp-005 fish + pose=cheer: fish has no arms -> only spark lines', { kind: 'cp-005', sticker: S, seed: 5, fill: '#ff9cc8', spot: '#c94f86', pose: 'cheer' }, EDGE(2, '#ff5fa8')],
  ]],
  ['Six live guides (canonical seeds 41-46, site/social kit)', [
    ['guide-gecko', 'Tokek gecko', { kind: 'gecko', sticker: S, seed: 41, pose: 'wave' }],
    ['guide-tanuki', 'Pon tanuki', { kind: 'tanuki', sticker: S, seed: 42 }],
    ['guide-puffin', 'Lundi puffin', { kind: 'puffin', sticker: S, seed: 43 }],
    ['guide-axolotl', 'Ajo axolotl', { kind: 'axolotl', sticker: S, seed: 44 }],
    ['guide-sardine', 'Sardi sardine', { kind: 'sardine', sticker: S, seed: 45 }],
    ['guide-alpaca', 'Paco alpaca', { kind: 'alpaca', sticker: S, seed: 46 }],
  ]],
  ['Widget / lock-screen / icon variants of the same renderer (attrs only)', [
    ['var-locked-mask', 'locked = 1-colour alpha mask (tinted/vibrant widgets)', { kind: 'gecko', locked: '#ffffff' }, '', 'grey'],
    ['var-appicon-tinted', 'App Icon "tinted" palette', { kind: 'gecko', ink: '#141414', fill: '#8a8a8a', spot: '#6e6e6e', accent: '#9a9a9a', eye: '#e6e6e6', pupil: '#141414' }, '', 'light'],
    ['var-appicon-mono', 'App Icon "mono" palette', { kind: 'gecko', ink: '#3a4720', fill: '#dfe5cc', spot: '#dfe5cc', accent: '#dfe5cc', eye: '#dfe5cc', pupil: '#3a4720' }, '', 'grey'],
    ['var-stamp', 'stamp (3m-8): ink only, transparent fills', { kind: 'gecko', ink: '#c4623e', fill: 'transparent', spot: 'transparent', accent: 'transparent', eye: '#f4efe4' }, '', 'light'],
    ['var-guide-fab', 'guide FAB on yellow (no sticker, multiply)', { kind: 'gecko', fill: '#fff3c4', spot: '#e0a92a', accent: '#ff5fa8' }, '', 'yellow'],
  ]],
];

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1600, height: 4000 }, deviceScaleFactor: 3 });
const page = await ctx.newPage();
await page.route('http://localhost:8765/__probe.html', r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(dir + 'probe.html', 'utf8') }));
await page.goto('http://localhost:8765/__probe.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.CritterDex && window.CritterDex.ready);

await page.evaluate(rows => {
  const sheet = document.getElementById('sheet');
  for (const [title, cells] of rows) {
    const h = document.createElement('h2'); h.textContent = title; sheet.appendChild(h);
    const row = document.createElement('div'); row.className = 'row'; sheet.appendChild(row);
    for (const [file, label, attrs, wrap, cls] of cells) {
      const cell = document.createElement('div'); cell.className = 'cell ' + (cls || '');
      const w = document.createElement('div'); w.id = 'w-' + file; w.style.cssText = 'padding:6px;line-height:0;' + (wrap || '');
      const el = document.createElement('doodle-art');
      Object.entries(Object.assign({ size: 150, anim: 'none', blink: 'false', seed: 7 }, attrs)).forEach(([k, v]) => el.setAttribute(k, v));
      w.appendChild(el); cell.appendChild(w);
      const l = document.createElement('div'); l.className = 'lab'; l.textContent = label; cell.appendChild(l); row.appendChild(cell);
    }
  }
  // draw-on frames + blink + small-size behaviour
  const h = document.createElement('h2'); h.textContent = 'Draw-on progress p=.15/.35/.55/.75/1, blink (closed ops), 24px native vs 300px downscaled'; sheet.appendChild(h);
  const row = document.createElement('div'); row.className = 'row'; sheet.appendChild(row);
  const add = (id, label, attrs, css = '') => { const cell = document.createElement('div'); cell.className = 'cell'; const w = document.createElement('div'); w.id = 'w-' + id; w.style.cssText = 'padding:6px;line-height:0;' + css; const el = document.createElement('doodle-art'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); w.appendChild(el); cell.appendChild(w); const l = document.createElement('div'); l.className = 'lab'; l.textContent = label; cell.appendChild(l); row.appendChild(cell); return el; };
  window.frames = [.15, .35, .55, .75, 1].map(p => [p, add('drawon-' + String(p).replace('.', 'p'), 'p=' + p, { kind: 'cp-013', size: 120, sticker: '#f4efe4', anim: 'none', seed: 13 })]);
  window.blinkEl = add('blink-closed', 'blink: closed-eye ops', { kind: 'cp-013', size: 120, sticker: '#f4efe4', anim: 'none', seed: 13 });
  add('small-24-native', '24px native (minW clamp)', { kind: 'gecko', size: 24, anim: 'none', blink: 'false' });
  add('small-300-scaled', '300px scaled to 24px', { kind: 'gecko', size: 300, anim: 'none', blink: 'false' }, 'zoom:.08');
}, rows);
await page.waitForTimeout(800);
await page.evaluate(() => {
  for (const [p, el] of window.frames) { el.draw(p); }
  const e = window.blinkEl; clearTimeout(e.bt); e.bt = -1; e.useClosed = true; e.draw(1);
});
await page.waitForTimeout(200);

const ids = await page.$$eval('[id^="w-"]', els => els.map(e => e.id));
for (const id of ids) await page.locator('#' + id).screenshot({ path: outDir + id.slice(2) + '.png', omitBackground: true });
await page.locator('#sheet').screenshot({ path: dir + 'contact-sheet.png' });

// raw canvas bitmaps (no CSS filter) for the node pixel-diff check
const raw = await page.evaluate(() => {
  const out = {};
  const mk = (id, attrs) => { const el = document.createElement('doodle-art'); Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v)); document.body.appendChild(el); el.ready = true; el.bt = -1; el.setup(); el.draw(1); out[id] = { attrs, png: el.cv.toDataURL('image/png') }; el.remove(); };
  mk('gecko-150-sticker', { kind: 'gecko', size: 150, sticker: '#f4efe4', seed: 41, anim: 'none', blink: 'false' });
  mk('cp-013-150-sticker', { kind: 'cp-013', size: 150, sticker: '#f4efe4', seed: 13, anim: 'none', blink: 'false' });
  mk('cp-118-96', { kind: 'cp-118', size: 96, seed: 7, anim: 'none', blink: 'false' });
  mk('tanuki-300-sticker', { kind: 'tanuki', size: 300, sticker: '#f4efe4', seed: 42, anim: 'none', blink: 'false' });
  mk('pin-48', { kind: 'pin', size: 48, anim: 'none' });
  return out;
});
fs.mkdirSync(dir + 'raw-chromium', { recursive: true });
for (const [id, v] of Object.entries(raw)) fs.writeFileSync(dir + 'raw-chromium/' + id + '.png', Buffer.from(v.png.split(',')[1], 'base64'));
fs.writeFileSync(dir + 'raw-chromium/attrs.json', JSON.stringify(Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v.attrs]))));
console.log('rendered', ids.length, 'cells');
await b.close();
