// Generate geometry-bench.js: the design's geometry (ops build + ribbon/polygon emission to a no-op ctx),
// without DOM classes, so the same file runs in Node (V8 JIT) and the Hermes CLI (bytecode interpreter).
import fs from 'node:fs';
const D = '/Users/quocs/Projects/critterpass/design/';
const dir = new URL('.', import.meta.url).pathname;
let dk = fs.readFileSync(D + 'doodles.js', 'utf8');
const start = dk.indexOf('const rng =');
const end = dk.indexOf('class DoodleArt');
if (start < 0 || end < 0) throw new Error('markers not found');
// geometry core + K registry + DoodleKit export + polyline helper, verbatim from the design
const core = dk.slice(start, end);
const harness = `
var window = globalThis; var document = { querySelectorAll: function () { return []; } };
function Event(n) { this.type = n; } window.dispatchEvent = function () {};
(function () {
${core}
  // setup()/draw() bodies adapted from DoodleArt (lines 259-328) as plain functions
  function build(kind, attrs) {
    var fn = K[kind], ink = attrs.ink || '#221e19';
    var mk = function (closed) { var ops = []; var sid = +attrs.seed || 7;
      var o = { ink: ink, fill: attrs.fill, accent: attrs.accent, spot: attrs.spot, belly: attrs.belly, leaf: attrs.leaf, eye: attrs.eye || '#fffdf6', pupil: attrs.pupil || ink, pose: attrs.pose, closed: closed };
      var d = {
        line: (pts, x = {}) => { const P = spl(pts, x.close); ops.push({ t: 'line', P, L: len(P), close: !!x.close, o: { w: x.w || 3, color: x.color || o.ink, taper: x.taper !== false && !x.close, close: !!x.close, seed: sid++, amp: .45 } }); },
        stroke: (pts, color, w) => { const P = spl(pts, false); ops.push({ t: 'under', P, o: { w, color, taper: true, seed: sid++, amp: .3 } }); },
        wash: (pts, color, x = {}) => ops.push({ t: 'wash', P: spl(pts, true), color, al: x.al ?? .9, off: x.off ?? 1.6, seed: sid++ }),
        fill: (pts, color) => ops.push({ t: 'fill', P: spl(pts, true), color }),
        dot: (x, y, r, color, al = 1) => ops.push({ t: 'fill', P: E(x, y, r, r, 10), color, al }),
      };
      fn(d, o); return ops; };
    var open = mk(false), closedOps = CREATURES[kind] ? mk(true) : null;
    return { open: open, closed: closedOps, total: open.reduce((s, q) => s + (q.t === 'line' ? q.L : 0), 0) || 1 };
  }
  var nop = function () {}, verts = 0;
  var ctx = { beginPath: nop, closePath: nop, fill: nop, stroke: nop, save: nop, restore: nop, translate: nop, setTransform: nop, clearRect: nop,
    moveTo: function () { verts++; }, lineTo: function () { verts++; } };
  function draw(B, p, k) {
    var c = ctx, minW = 1.05 * 2.5 / k, fa = Math.max(0, Math.min(1, (p - .25) / .55)), ops = B.open;
    for (const q of ops) {
      if (q.t === 'wash') { const r = rng(q.seed), ox = (r() - .5) * 2 * q.off, oy = (r() - .2) * q.off; c.translate(ox, oy); polyline(c, q.P, true); c.fill(); c.stroke(); }
      else if (q.t === 'under') { ribbon(c, q.P, q.P.length, Object.assign({}, q.o, { minW: minW })); }
    }
    let budget = p * B.total * 1.02;
    for (const q of ops) {
      if (q.t === 'fill') { polyline(c, q.P, true); c.fill(); }
      else if (q.t === 'line') {
        if (budget <= 0) continue;
        let P = q.P;
        if (budget < q.L) { let s = 0, i = 1; for (; i < P.length; i++) { s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (s > budget) break; } P = P.slice(0, i + 1); }
        budget -= q.L; ribbon(c, P, q.P.length, Object.assign({}, q.o, { minW: minW }));
      }
    }
  }
  window.GEO = { build: build, draw: draw, K: K, CREATURES: CREATURES, verts: function () { return verts; } };
})();
`;
const tail = `
(function () {
  var now = typeof performance !== 'undefined' ? function () { return performance.now(); } : function () { return Date.now(); };
  var out = typeof print === 'function' ? print : console.log;
  var kinds = CritterDex.list.map(function (c) { return c.kind; });
  // warm
  kinds.forEach(function (k) { var B = GEO.build(k, { seed: 7 }); GEO.draw(B, 1, 2.5 * 96 / 118); });
  var R = 20;
  var t0 = now(); for (var r = 0; r < R; r++) kinds.forEach(function (k) { GEO.build(k, { seed: 7 }); }); var tb = now() - t0;
  var built = kinds.map(function (k) { return GEO.build(k, { seed: 7 }); });
  t0 = now(); for (var r2 = 0; r2 < R; r2++) built.forEach(function (B) { GEO.draw(B, 1, 2.5 * 96 / 118); }); var td = now() - t0;
  t0 = now(); for (var r3 = 0; r3 < R; r3++) built.forEach(function (B) { GEO.draw(B, .5, 2.5 * 96 / 118); }); var th = now() - t0;
  out(JSON.stringify({ critters: kinds.length, buildMsPerCritter: +(tb / R / kinds.length).toFixed(3), drawFullMsPerCritter: +(td / R / kinds.length).toFixed(3), drawHalfMsPerCritter: +(th / R / kinds.length).toFixed(3), vertsPerFullDraw: Math.round(GEO.verts() / (kinds.length * (3 * R + 1))) }));
})();
`;
const src = harness + fs.readFileSync(D + 'critters-data.js', 'utf8') + '\n' + fs.readFileSync(D + 'critters-draw-1.js', 'utf8') + '\n' + fs.readFileSync(D + 'critters-draw-2.js', 'utf8') + '\n' + tail;
fs.writeFileSync(dir + 'geometry-bench.js', src);
console.log('wrote geometry-bench.js', src.length, 'bytes');
