// Page-side helpers for the doodle-art render benchmark. Loaded after the design scripts.
window.P = (() => {
  const GUIDES = ['gecko', 'tanuki', 'puffin', 'axolotl', 'sardine', 'alpaca'];
  const ICONS = Object.keys(DoodleKit.K).filter(k => !k.startsWith('cp-') && !GUIDES.includes(k));
  const median = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

  function mk(attrs, parent = document.body) {
    const el = document.createElement('doodle-art');
    Object.entries(attrs).forEach(([k, v]) => v != null && el.setAttribute(k, String(v)));
    parent.appendChild(el);
    el.ready = true; // stop IntersectionObserver go() from re-running setup/play
    el.bt = -1;      // stop blink loop during timing
    return el;
  }
  function opsStats(el) {
    const s = { ops: 0, line: 0, under: 0, wash: 0, fill: 0, pts: 0, ribbonVerts: 0, fillVerts: 0, washVerts: 0 };
    for (const q of el.opsOpen) {
      s.ops++; s[q.t]++; s.pts += q.P.length;
      if (q.t === 'line' || q.t === 'under') s.ribbonVerts += q.P.length * 2;
      else if (q.t === 'wash') s.washVerts += q.P.length; else s.fillVerts += q.P.length;
    }
    s.closedOps = el.opsClosed ? el.opsClosed.length : 0;
    return s;
  }
  const flush = el => el.cv.getContext('2d').getImageData(0, 0, 1, 1);

  // time fn over n iterations, return ms per iteration
  function per(fn, n) { const t0 = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t0) / n; }

  function benchKind(kind, size, reps = 8) {
    const attrs = { kind, size, sticker: GUIDES.includes(kind) || kind.startsWith('cp-') ? '#f4efe4' : null, anim: 'none', seed: 7 };
    const el = mk(attrs);
    el.setup(); el.draw(1); flush(el); // warm
    const setup = per(() => el.setup(), reps);
    const drawJs = per(() => el.draw(1), reps);
    const drawFlush = per(() => { el.draw(1); flush(el); }, reps);
    const frame = per(i => { el.draw(.15 + .7 * (i / reps)); flush(el); }, reps);
    const st = opsStats(el);
    const bytes = el.cv.width * el.cv.height * 4 * (el.oc ? 2 : 1);
    const out = { kind, size, setup, drawJs, drawFlush, frame, bw: el.cv.width, bh: el.cv.height, bytes, ...st };
    el.remove();
    return out;
  }

  function benchAll(size, reps) {
    const kinds = GUIDES.concat(CritterDex.list.filter(c => !c.spec.k).map(c => c.id)).concat(ICONS);
    return kinds.map(k => benchKind(k, size, reps));
  }

  // count every Canvas2D call/property set during one fn()
  function countApi(fn) {
    const C = CanvasRenderingContext2D.prototype, counts = {}, restore = [];
    for (const name of Object.getOwnPropertyNames(C)) {
      const d = Object.getOwnPropertyDescriptor(C, name);
      if (typeof d.value === 'function' && name !== 'constructor') {
        const orig = d.value; C[name] = function (...a) { counts[name] = (counts[name] || 0) + 1; return orig.apply(this, a); };
        restore.push(() => { C[name] = orig; });
      } else if (d.set) {
        const orig = d; Object.defineProperty(C, name, { configurable: true, get: d.get, set(v) { const key = name + '=' + (name === 'globalCompositeOperation' || name === 'lineJoin' || name === 'lineCap' ? v : '*'); counts[key] = (counts[key] || 0) + 1; orig.set.call(this, v); } });
        restore.push(() => Object.defineProperty(C, name, orig));
      }
    }
    try { fn(); } finally { restore.forEach(r => r()); }
    return counts;
  }

  // page-level animation: N critters playing the draw-on at once; record rAF intervals
  async function animTest(n, size, kinds, ms = 1800) {
    const box = document.createElement('div'); box.style.cssText = 'position:fixed;left:0;top:0;display:flex;flex-wrap:wrap;gap:4px;width:1400px;z-index:5;background:#17142a';
    document.body.appendChild(box);
    const els = [];
    for (let i = 0; i < n; i++) { const el = document.createElement('doodle-art'); el.setAttribute('kind', kinds[i % kinds.length]); el.setAttribute('size', size); el.setAttribute('sticker', '#f4efe4'); el.setAttribute('blink', 'false'); box.appendChild(el); els.push(el); }
    const iv = []; let last = performance.now(); const t0 = last;
    await new Promise(res => { const tick = now => { iv.push(now - last); last = now; if (now - t0 < ms) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
    const busy = els.filter(e => e.anim).length;
    box.remove();
    iv.shift();
    const avg = iv.reduce((a, b) => a + b, 0) / iv.length;
    return { n, size, frames: iv.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95: +iv.slice().sort((a, b) => a - b)[Math.floor(iv.length * .95)].toFixed(1), max: +Math.max(...iv).toFixed(1), over17: iv.filter(x => x > 17.5).length, over34: iv.filter(x => x > 34).length, stillAnimating: busy };
  }

  // one-shot: time from element creation to first full paint (setup + draw(1)), like a list cell appearing
  function firstPaint(kind, size, n = 20) {
    const t = [];
    for (let i = 0; i < n; i++) { const t0 = performance.now(); const el = mk({ kind, size, sticker: '#f4efe4', anim: 'none' }); el.setup(); el.draw(1); flush(el); t.push(performance.now() - t0); el.remove(); }
    return { kind, size, medianMs: +median(t).toFixed(3), minMs: +Math.min(...t).toFixed(3) };
  }

  return { GUIDES, ICONS, mk, opsStats, benchKind, benchAll, countApi, animTest, firstPaint, flush, median };
})();
