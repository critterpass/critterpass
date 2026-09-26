
var window = globalThis; var document = { querySelectorAll: function () { return []; } };
function Event(n) { this.type = n; } window.dispatchEvent = function () {};
(function () {
const rng = s => { let a = (s * 1000003) >>> 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
  function spl(pts, close, step = 1.1) {
    const n = pts.length, out = [];
    if (n < 2) return pts.slice();
    const g = i => close ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
    const segs = close ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
      const k = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        const f = d => .5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        out.push([f(0), f(1)]);
      }
    }
    out.push(close ? pts[0] : pts[n - 1]);
    return out;
  }
  const E = (cx, cy, rx, ry, n = 12, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + i / n * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
  const len = P => { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); return s; };

  function ribbon(c, P, nFull, o) {
    const n = P.length; if (n < 2) return;
    const r = rng(o.seed), ph = r() * 6.28, ph2 = r() * 6.28, amp = o.amp;
    const Q = P.map((p, i) => [p[0] + Math.sin(i * .07 + ph) * amp, p[1] + Math.cos(i * .061 + ph2) * amp]);
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = Q[Math.max(0, i - 1)], b = Q[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, nx = -dy / m, ny = dx / m;
      const t = i / Math.max(1, nFull - 1);
      const press = o.close ? (.78 + .22 * Math.sin(t * 6.28 * 2 + ph)) : (o.taper ? Math.pow(Math.max(.02, Math.sin(Math.PI * (.06 + .88 * t))), .5) : 1);
      const ww = Math.max(o.minW, o.w * press * (.9 + .2 * Math.sin(i * .19 + ph2))) / 2;
      L.push([Q[i][0] + nx * ww, Q[i][1] + ny * ww]); R.push([Q[i][0] - nx * ww, Q[i][1] - ny * ww]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i < n; i++) c.lineTo(L[i][0], L[i][1]);
    for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath(); c.fill();
  }

  const K = {};
  const toes = (d, a, b, ink) => { const dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, ux = dx / m, uy = dy / m, px = -uy, py = ux;
    [[-1, 1], [0, 2], [1, 1]].forEach(([s, f]) => d.dot(b[0] + ux * f * 1.7 + px * s * 2.9, b[1] + uy * f * 1.7 + py * s * 2.9, 2.2, ink)); };

  K.gecko = (d, o) => {
    const ink = o.ink, body = o.fill || '#a9d08c', cheek = o.accent || '#ec8f72', pose = o.pose || 'idle';
    const bodyP = [[44, 41], [40, 53], [40, 67], [45, 77], [55, 77], [60, 67], [60, 53], [56, 41]];
    const head = [[29, 29], [34, 19], [50, 13.5], [66, 19], [71, 29], [65, 38.5], [50, 42.5], [35, 38.5]];
    const tail = [[52, 76], [56, 87], [66, 93.5], [79, 91], [87, 81], [84, 70], [76, 67.5], [71, 73], [75, 79]];
    let armL = [[43, 49], [33, 50], [25, 43]], armR = [[57, 49], [67, 50], [75, 43]];
    if (pose === 'wave') armR = [[57, 49], [69, 43], [73, 30]];
    if (pose === 'cheer') { armL = [[43, 48], [32, 40], [28, 28]]; armR = [[57, 48], [68, 40], [72, 28]]; }
    if (pose === 'think') armR = [[57, 49], [65, 45], [60, 38.5]];
    if (pose === 'point') armR = [[57, 49], [70, 49], [83, 45]];
    const legL = [[43, 70], [33, 74], [27, 84]], legR = [[57, 70], [67, 74], [73, 84]];
    d.wash(bodyP, body); d.wash(head, body); d.stroke(tail, body, 9);
    const sp = o.spot || '#6f9f5a';
    [[[44, 55], [50, 57], [56, 55]], [[43, 63], [50, 65.5], [57, 63]], [[45, 71], [50, 73], [55, 71]], [[60, 91], [62, 86]], [[74, 92], [73, 86]], [[84, 83], [79, 81]]].forEach(b => d.stroke(b, sp, 2.6));
    d.line(head, { w: 2.7, close: true });
    d.line(bodyP.slice(0, 4).concat([[50, 77.5]]), { w: 2.5 }); d.line([[50, 77.5]].concat(bodyP.slice(4)), { w: 2.5 });
    d.line(tail, { w: 2.5, taper: true });
    [armL, armR, legL, legR].forEach(l => { d.line(l, { w: 2.5, taper: false }); toes(d, l[l.length - 2], l[l.length - 1], ink); });
    const closed = o.closed || pose === 'sleep';
    [[31, 24], [69, 24]].forEach(([x, y]) => {
      if (closed) { d.line([[x - 5, y + 1], [x, y + 3.6], [x + 5, y + 1]], { w: 2.4 }); return; }
      d.fill(E(x, y, 7.4, 7.4, 14), o.eye || '#fffdf6'); d.line(E(x, y, 7.4, 7.4, 14), { w: 2.3, close: true });
      const lx = pose === 'think' ? 2 : pose === 'point' ? 2.4 : 0, ly = pose === 'think' ? -1.8 : 0;
      d.fill(E(x + lx, y + .5 + ly, 1.9, 4.6, 10), o.pupil); d.dot(x + lx - 1.6, y - 2 + ly, 1.2, o.eye || '#fffdf6');
    });
    d.dot(46.5, 20.5, .9, ink); d.dot(53.5, 20.5, .9, ink);
    d.dot(36, 35, 3.2, cheek, .5); d.dot(64, 35, 3.2, cheek, .5);
    if (pose === 'cheer') d.fill([[41, 31.5], [50, 38.5], [59, 31.5], [50, 33.5]], ink);
    else d.line([[40, 32], [50, 36], [60, 32]], { w: 2.1 });
    if (pose === 'think') { d.dot(80, 12, 1.8, ink); d.dot(87, 5, 2.6, ink); }
    if (pose === 'wave') { d.line([[80, 26], [84, 20]], { w: 1.8 }); d.line([[82, 34], [88, 31]], { w: 1.8 }); }
    if (pose === 'cheer') { d.line([[16, 22], [11, 18]], { w: 2 }); d.line([[20, 14], [18, 7]], { w: 2 }); d.line([[84, 22], [89, 18]], { w: 2 }); d.line([[80, 14], [82, 7]], { w: 2 }); }
    if (pose === 'sleep') { d.line([[78, 8], [86, 8], [78, 16], [86, 16]], { w: 2 }); }
  };
  const I = (fn, vb) => { fn.vb = vb; return fn; };
  const W7 = { w: 7 };
  const eyes = (d, o, pts, r) => pts.forEach(([x, y]) => {
    if (o.closed || o.pose === 'sleep') { d.line([[x - r * .75, y + .5], [x, y + r * .5], [x + r * .75, y + .5]], { w: 2.2 }); return; }
    const lx = o.pose === 'think' ? r * .3 : 0, ly = o.pose === 'think' ? -r * .25 : 0;
    d.fill(E(x, y, r, r, 14), o.eye); d.line(E(x, y, r, r, 14), { w: 2.1, close: true });
    d.fill(E(x + lx, y + .3 + ly, r * .46, r * .52, 10), o.pupil); d.dot(x + lx - r * .22, y - r * .26 + ly, r * .17, o.eye);
  });
  const cheeks = (d, o, pts, r) => pts.forEach(([x, y]) => d.dot(x, y, r, o.accent || '#ff7fa8', .5));
  const extras = (d, o) => {
    if (o.pose === 'cheer') [[[14, 24], [9, 20]], [[18, 15], [16, 8]], [[86, 24], [91, 20]], [[82, 15], [84, 8]]].forEach(l => d.line(l, { w: 2 }));
    if (o.pose === 'sleep') d.line([[80, 6], [88, 6], [80, 14], [88, 14]], { w: 2 });
    if (o.pose === 'think') { d.dot(86, 12, 1.8, o.ink); d.dot(92, 5, 2.6, o.ink); }
  };
  K.tanuki = (d, o) => {
    const f = o.fill || '#ff9a4d', dk = o.spot || '#6b3a24', bl = o.belly || '#fff1dc', pose = o.pose || 'idle';
    const tail = [[66, 80], [77, 87.5], [88, 82], [92, 70], [87, 61], [79, 62], [74, 70]];
    const tailL = [[71.5, 84.5], [78, 87.5], [88, 82], [92, 70], [87, 61], [79, 62], [73, 68]];
    const body = [[37, 49], [29, 61], [28, 77], [37, 88], [63, 88], [72, 77], [71, 61], [63, 49]];
    const head = [[24, 33], [28, 20], [40, 13], [60, 13], [72, 20], [76, 33], [70, 45], [50, 50], [30, 45]];
    const eL = [[30, 23], [27, 8], [42, 15]], eR = [[70, 23], [73, 8], [58, 15]];
    let aL = [[35, 58], [27, 66]], aR = [[65, 58], [73, 66]];
    if (pose === 'wave') aR = [[65, 56], [74, 47], [77, 38]];
    if (pose === 'cheer') { aL = [[35, 56], [26, 47], [23, 38]]; aR = [[65, 56], [74, 47], [77, 38]]; }
    if (pose === 'think') aR = [[65, 58], [71, 52], [66, 46]];
    d.wash(tail, f); d.stroke([[85, 62], [80, 70]], dk, 3.4); d.stroke([[91, 73], [82, 77]], dk, 3.4);
    d.wash(body, f); d.fill(E(50, 71, 12.5, 13.5, 12), bl);
    d.wash(eL, dk); d.wash(eR, dk); d.wash(head, f);
    d.fill(E(37, 31, 11, 7.8, 14, -.35), dk); d.fill(E(63, 31, 11, 7.8, 14, .35), dk);
    d.line(tailL, { w: 2.4 }); d.line(body, { w: 2.4 }); d.line(eL, { w: 2.4 }); d.line(eR, { w: 2.4 }); d.line(head, { w: 2.6, close: true });
    [aL, aR].forEach(a => d.line(a, { w: 2.4 }));
    d.fill(E(40, 89.5, 6.5, 3.2, 10), dk); d.fill(E(60, 89.5, 6.5, 3.2, 10), dk);
    eyes(d, o, [[38, 31], [62, 31]], 5.2);
    d.fill(E(50, 39.5, 3.8, 2.7, 10), o.ink); d.line([[45, 43.5], [50, 46], [55, 43.5]], { w: 2 });
    cheeks(d, o, [[29, 40], [71, 40]], 3);
    const lf = [[50, 13.5], [44, 6], [50, 1.5], [57, 5]]; d.wash(lf, o.leaf || '#54d6a4', { off: .4 }); d.line(lf, { w: 2, close: true });
    extras(d, o);
  };
  K.puffin = (d, o) => {
    const f = o.fill || '#3d6fe0', cr = o.belly || '#fff6e6', bk = o.spot || '#ff9a4d', pose = o.pose || 'idle';
    const body = [[50, 15], [33, 23], [25, 43], [26, 66], [36, 85], [64, 85], [74, 66], [75, 43], [67, 23]];
    const face = [[36, 28], [50, 23.5], [64, 28], [69, 40], [63, 50], [50, 54], [37, 50], [31, 40]];
    let wL = [[28, 47], [19, 61], [25, 75]], wR = [[72, 47], [81, 61], [75, 75]];
    if (pose === 'wave') wR = [[72, 46], [84, 37], [88, 26]];
    if (pose === 'cheer') { wL = [[28, 46], [16, 37], [12, 26]]; wR = [[72, 46], [84, 37], [88, 26]]; }
    const fL = [[35, 93], [41, 85], [47, 93]], fR = [[53, 93], [59, 85], [65, 93]];
    d.wash(fL, bk); d.wash(fR, bk);
    d.wash(body, f); d.fill(face, cr); d.fill(E(50, 70, 14, 14, 12), cr);
    d.stroke(wL, f, 7); d.stroke(wR, f, 7);
    d.line(body, { w: 2.6, close: true }); d.line(wL, { w: 2.3 }); d.line(wR, { w: 2.3 }); d.line(fL, { w: 2, close: true }); d.line(fR, { w: 2, close: true });
    eyes(d, o, [[42, 36], [58, 36]], 4.5);
    const b = [[43, 44], [50, 41.5], [57, 44], [58.5, 50], [50, 61], [41.5, 50]];
    d.fill(b, bk); d.fill([[43.5, 44.2], [50, 42], [56.5, 44.2], [57, 46.5], [43, 46.5]], o.beak2 || '#ffd84a');
    d.line(b, { w: 2.2, close: true }); d.line([[44, 51], [56, 51]], { w: 1.5 });
    cheeks(d, o, [[35, 45], [65, 45]], 2.8);
    extras(d, o);
  };
  K.axolotl = (d, o) => {
    const f = o.fill || '#ff9cc8', g = o.spot || '#ff4f9a', bl = o.belly || '#ffe0ee', pose = o.pose || 'idle';
    const head = [[20, 40], [26, 27], [40, 20], [60, 20], [74, 27], [80, 40], [74, 53], [50, 58], [26, 53]];
    const body = [[38, 55], [33, 68], [38, 81], [50, 86], [62, 81], [67, 68], [62, 55]];
    const tail = [[60, 83], [71, 91], [84, 88], [91, 78]];
    const G = [[[25, 31], [16, 22], [9, 16]], [[22, 39], [12, 37], [4, 35]], [[23, 47], [13, 53], [7, 58]]];
    const GM = G.map(b => b.map(([x, y]) => [100 - x, y]));
    G.concat(GM).forEach(b => d.stroke(b, g, 6.5));
    d.stroke(tail, f, 9); d.wash(body, f); d.wash(E(50, 71, 9, 10, 10), bl, { off: .5 }); d.wash(head, f);
    G.concat(GM).forEach(b => d.line(b, { w: 1.8 }));
    d.line(head, { w: 2.6, close: true }); d.line(body, { w: 2.4 }); d.line(tail, { w: 2.4 });
    let aL = [[39, 62], [30, 68]], aR = [[61, 62], [70, 68]];
    if (pose === 'wave') aR = [[61, 60], [70, 52], [72, 44]];
    if (pose === 'cheer') { aL = [[39, 60], [30, 52], [28, 44]]; aR = [[61, 60], [70, 52], [72, 44]]; }
    [aL, aR, [[43, 80], [37, 88]], [[57, 80], [63, 88]]].forEach(l => { d.line(l, { w: 2.2 }); toes(d, l[l.length - 2], l[l.length - 1], o.ink); });
    [[36, 37], [64, 37]].forEach(([x, y]) => { if (o.closed || pose === 'sleep') d.line([[x - 3.5, y], [x, y + 2.4], [x + 3.5, y]], { w: 2 }); else { d.fill(E(x, y, 3.6, 3.9, 10), o.pupil); d.dot(x - 1.2, y - 1.4, 1.2, o.eye); } });
    d.line([[34, 45], [50, 51.5], [66, 45]], { w: 2.2 });
    cheeks(d, o, [[29, 47], [71, 47]], 3.2);
    extras(d, o);
  };
  K.sardine = (d, o) => {
    const f = o.fill || '#9fe0ee', bk = o.spot || '#3d6fe0', bl = o.belly || '#f2fbff';
    const body = [[13, 52], [24, 40], [46, 33], [68, 35], [84, 44], [89, 52], [83, 60], [64, 67], [42, 68], [22, 62]];
    const tl = [[16, 52], [4, 37], [9, 52], [4, 67]];
    const fT = [[44, 35], [51, 23], [59, 35]], fB = [[47, 67], [53, 77], [60, 66]];
    d.wash(tl, f); d.wash(fT, bk); d.wash(fB, f); d.wash(body, f);
    d.stroke([[22, 45], [44, 37.5], [68, 39], [80, 45]], bk, 6.5);
    d.wash([[26, 60], [44, 64.5], [64, 63.5], [79, 57], [62, 58], [42, 58.5]], bl, { off: .4 });
    d.line(tl, { w: 2.4, close: true }); d.line(fT, { w: 2.2 }); d.line(fB, { w: 2.2 }); d.line(body, { w: 2.6, close: true });
    d.line([[64, 40], [60, 52], [64, 63]], { w: 2 });
    [[37, 52], [44, 51], [51, 50]].forEach(([x, y]) => d.dot(x, y, 1.9, o.ink, .85));
    eyes(d, o, [[73, 46.5]], 6.4);
    d.line([[80, 57], [84, 59], [88, 56.5]], { w: 1.9 });
    cheeks(d, o, [[75, 56.5]], 2.6);
    extras(d, o);
  };
  K.alpaca = (d, o) => {
    const f = o.fill || '#fff1d6', fl = o.belly || '#fffaf0', sc = o.spot || '#ff5fa8';
    const body = []; for (let i = 0; i < 22; i++) { const a = i / 22 * 6.283, r = 1 + .07 * Math.abs(Math.sin(a * 5)); body.push([50 + Math.cos(a) * 27 * r, 72 + Math.sin(a) * 14 * r]); }
    const bodyL = body.slice(20).concat(body.slice(0, 14));
    const head = [[37, 22], [35, 38], [40, 52], [60, 52], [65, 38], [63, 22]];
    const pom = []; for (let i = 0; i < 16; i++) { const a = Math.PI + i / 15 * Math.PI, r = 1 + .1 * Math.abs(Math.sin(a * 4)); pom.push([50 + Math.cos(a) * 16 * r, 22 + Math.sin(a) * 12 * r]); }
    pom.push([60, 26], [40, 26]);
    const eL = [[38, 18], [31, 4], [43, 11]], eR = [[62, 18], [69, 4], [57, 11]];
    const legs = [[[34, 83], [34, 95]], [[44, 85], [44, 96]], [[56, 85], [56, 96]], [[66, 83], [66, 95]]];
    legs.forEach(l => d.stroke(l, f, 6));
    d.wash(body, f); d.wash(eL, f); d.wash(eR, f); d.wash(head, f); d.wash(pom, fl, { off: .5 });
    d.wash(E(50, 45, 8, 5.5, 10), '#ffe0c2', { off: .3 });
    const scarf = [[38, 51], [62, 51], [64, 59], [36, 59]], tS = [[55, 57], [59, 72], [66, 70], [62, 57]];
    d.wash(tS, sc, { off: .4 }); d.wash(scarf, sc, { off: .4 });
    legs.forEach(l => d.line(l, { w: 2.3 }));
    d.line(bodyL, { w: 2.4 }); d.line(eL, { w: 2.2 }); d.line(eR, { w: 2.2 }); d.line(head, { w: 2.5 }); d.line(pom, { w: 2.3, close: true });
    d.line(scarf, { w: 2, close: true }); d.line(tS, { w: 2 }); d.line([[37.5, 55], [62.5, 55]], { w: 1.6, color: o.stripe || '#ffd84a' });
    eyes(d, o, [[43, 33], [57, 33]], 4.6);
    d.line([[47, 44], [50, 46.5], [53, 44]], { w: 1.8 }); d.line([[50, 46.5], [50, 49]], { w: 1.6 });
    cheeks(d, o, [[38.5, 42.5], [61.5, 42.5]], 2.8);
    extras(d, o);
  };
  K.egg = (d, o) => { const p = [[50, 8], [31, 22], [22, 48], [27, 74], [50, 91], [73, 74], [78, 48], [69, 22]]; d.wash(p, o.fill || '#fff1d6'); [[40, 36, 7, 5], [62, 58, 9, 6.5], [58, 26, 4.5, 3.5], [36, 66, 5.5, 4.2]].forEach(([x, y, a, b]) => d.wash(E(x, y, a, b, 10), o.spot || '#ff9a4d', { off: .4 })); d.line(p, { w: 3, close: true }); if (o.pose === 'crack') d.line([[25, 50], [35, 44], [42, 53], [50, 43], [58, 53], [65, 44], [75, 50]], { w: 2.6 }); };
  K.star = (d, o) => { const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 19 : 42; p.push([50 + Math.cos(a) * r, 54 + Math.sin(a) * r]); } d.wash(p, o.accent || '#ffd84a'); d.line(p, { w: 6, close: true }); };
  K.flame = (d, o) => { const p = [[50, 6], [66, 28], [76, 52], [71, 75], [50, 92], [29, 75], [24, 52], [36, 34], [44, 46]]; d.wash(p, o.accent || '#ff9a4d'); d.wash([[50, 48], [59, 63], [57, 78], [50, 83], [43, 78], [41, 63]], o.fill || '#ffd84a', { off: .4 }); d.line(p, { w: 6, close: true }); };
  K.lock = (d, o) => { if (o.accent) d.wash([[22, 46], [78, 46], [78, 88], [22, 88]], o.accent); d.line([[22, 46], [78, 46], [78, 88], [22, 88]], { ...W7, close: true }); d.line([[34, 46], [34, 30], [50, 16], [66, 30], [66, 46]], W7); d.dot(50, 64, 6, o.ink); };
  K.chat = (d, o) => { const p = [[12, 20], [88, 20], [88, 66], [46, 66], [26, 84], [30, 66], [12, 66]]; if (o.accent) d.wash(p, o.accent); d.line(p, { ...W7, close: true }); [34, 50, 66].forEach(x => d.dot(x, 43, 5, o.ink)); };
  K.cal = (d, o) => { if (o.accent) d.wash([[12, 22], [88, 22], [88, 86], [12, 86]], o.accent); d.line([[12, 22], [88, 22], [88, 86], [12, 86]], { ...W7, close: true }); d.line([[12, 40], [88, 40]], { w: 6 }); d.line([[32, 10], [32, 28]], { w: 6 }); d.line([[68, 10], [68, 28]], { w: 6 }); [[32, 56], [50, 56], [68, 56], [32, 72], [50, 72]].forEach(([x, y]) => d.dot(x, y, 4.5, o.ink)); };
  K.pin = (d, o) => { const p = [[50, 91], [30, 58], [26, 36], [36, 17], [50, 11], [64, 17], [74, 36], [70, 58]]; if (o.accent) d.wash(p, o.accent); d.line(p, { ...W7, close: true }); d.line(E(50, 37, 9, 9, 10), { w: 6, close: true }); };
  K.bed = (d, o) => { if (o.accent) d.wash([[40, 62], [42, 48], [86, 50], [88, 62]], o.accent); d.line([[12, 80], [12, 36]], W7); d.line([[12, 62], [88, 62], [88, 80]], W7); d.line(E(28, 53, 9, 6, 10), { w: 6, close: true }); d.line([[40, 62], [42, 48], [86, 50], [88, 62]], W7); };
  K.ticket = (d, o) => { const p = [[10, 28], [90, 28], [90, 43], [84, 50], [90, 57], [90, 72], [10, 72], [10, 57], [16, 50], [10, 43]]; if (o.accent) d.wash(p, o.accent); d.line(p, { ...W7, close: true }); d.line([[62, 34], [62, 42]], { w: 5 }); d.line([[62, 48], [62, 54]], { w: 5 }); d.line([[62, 60], [62, 66]], { w: 5 }); };
  K.boat = (d, o) => { if (o.accent) d.wash([[50, 24], [76, 52], [50, 52]], o.accent); d.line([[8, 60], [92, 60], [78, 80], [22, 80]], { ...W7, close: true }); d.line([[50, 60], [50, 16]], W7); d.line([[50, 22], [76, 52], [50, 52]], W7); };
  K.wallet = (d, o) => { if (o.accent) d.wash([[12, 30], [84, 30], [84, 78], [12, 78]], o.accent); d.line([[12, 30], [84, 30], [84, 78], [12, 78]], { ...W7, close: true }); d.line([[58, 44], [92, 44], [92, 64], [58, 64]], { w: 6, close: true }); d.dot(68, 54, 4, o.ink); };
  K.bell = (d, o) => { if (o.accent) d.wash([[30, 70], [32, 40], [50, 24], [68, 40], [70, 70]], o.accent); d.line([[28, 72], [32, 40], [50, 24], [68, 40], [72, 72]], W7); d.line([[18, 72], [82, 72]], W7); d.dot(50, 84, 6, o.ink); d.line([[50, 24], [50, 14]], { w: 6 }); };
  K.sun = (d, o) => { d.wash(E(50, 50, 18, 18, 12), o.accent || '#f2c14e'); d.line(E(50, 50, 18, 18, 12), { ...W7, close: true }); for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; d.line([[50 + Math.cos(a) * 29, 50 + Math.sin(a) * 29], [50 + Math.cos(a) * 41, 50 + Math.sin(a) * 41]], { w: 6 }); } };
  K.rain = (d, o) => { const cl = [[20, 58], [18, 44], [32, 36], [42, 22], [62, 24], [70, 36], [84, 40], [84, 56]]; if (o.accent) d.wash(cl, o.accent); d.line(cl, { ...W7, close: true }); [[30, 70], [50, 72], [70, 70]].forEach(([x, y]) => d.line([[x, y], [x - 5, y + 16]], { w: 6 })); };
  K.spark = (d, o) => { const p = [[50, 8], [58, 42], [92, 50], [58, 58], [50, 92], [42, 58], [8, 50], [42, 42]]; d.wash(p, o.accent || '#f2c14e'); d.line(p, { w: 6, close: true }); };
  K.plane = (d, o) => { if (o.accent) d.wash([[10, 52], [88, 28], [62, 86], [50, 60]], o.accent); d.line([[10, 52], [88, 28], [62, 86], [50, 60]], { ...W7, close: true }); d.line([[50, 60], [88, 28]], { w: 6 }); };
  K.car = (d, o) => { if (o.accent) d.wash([[10, 64], [20, 42], [76, 42], [90, 64], [90, 74], [10, 74]], o.accent); d.line([[10, 64], [20, 42], [76, 42], [90, 64], [90, 74], [10, 74]], { ...W7, close: true }); d.fill(E(28, 76, 8, 8, 10), o.ink); d.fill(E(72, 76, 8, 8, 10), o.ink); };
  K.volcano = (d, o) => { const p = [[8, 84], [36, 36], [48, 44], [62, 34], [92, 84]]; if (o.accent) d.wash(p, o.accent); d.line(p, W7); d.line([[46, 26], [40, 18], [50, 12], [44, 4]], { w: 5, taper: true }); d.line([[60, 26], [66, 16], [60, 8]], { w: 5, taper: true }); };
  K.wave = (d, o) => { d.line([[6, 44], [20, 32], [34, 44], [48, 32], [62, 44], [76, 32], [94, 44]], W7); d.line([[6, 68], [20, 56], [34, 68], [48, 56], [62, 68], [76, 56], [94, 68]], W7); };
  K.temple = (d, o) => { if (o.accent) d.wash([[26, 40], [74, 40], [66, 26], [34, 26]], o.accent); d.line([[50, 8], [50, 18]], { w: 6 }); d.line([[34, 26], [66, 26], [74, 40], [26, 40]], { ...W7, close: true }); d.line([[20, 56], [80, 56], [70, 42]], W7); d.line([[30, 42], [20, 56]], W7); d.line([[28, 58], [28, 88]], W7); d.line([[72, 58], [72, 88]], W7); d.line([[14, 88], [86, 88]], W7); };
  K.camera = (d, o) => { if (o.accent) d.wash(E(50, 56, 14, 14, 10), o.accent); d.line([[10, 34], [34, 34], [40, 22], [60, 22], [66, 34], [90, 34], [90, 80], [10, 80]], { ...W7, close: true }); d.line(E(50, 56, 15, 15, 12), { w: 6, close: true }); };
  K.food = (d, o) => { const bowl = [[10, 50], [90, 50], [78, 76], [22, 76]]; if (o.accent) d.wash(bowl, o.accent); d.line(bowl, { ...W7, close: true }); d.line([[30, 84], [70, 84]], W7); d.line([[40, 40], [36, 22], [42, 12]], { w: 5, taper: true }); d.line([[58, 40], [62, 22], [56, 12]], { w: 5, taper: true }); };
  K.check = (d, o) => { d.line([[14, 52], [40, 78], [88, 20]], { w: 10, taper: true }); };
  K.heart = (d, o) => { const p = [[50, 86], [16, 54], [12, 32], [28, 16], [50, 30], [72, 16], [88, 32], [84, 54]]; d.wash(p, o.accent || '#ec8f72'); d.line(p, { w: 6, close: true }); };
  K.underline = I((d, o) => { d.line([[2, 10], [40, 6.5], [98, 8]], { w: 3.4, taper: true, color: o.accent || o.ink }); }, [100, 14]);
  K.circle = I((d, o) => { const p = []; for (let i = 0; i <= 26; i++) { const a = -2.4 + i / 24 * 6.283 * 1.02; p.push([50 + Math.cos(a) * (46 - i * .12), 25 + Math.sin(a) * (19 + i * .06)]); } d.line(p, { w: 2.6, taper: true, color: o.accent || o.ink }); }, [100, 50]);
  K.arrow = I((d, o) => { d.line([[4, 30], [30, 10], [66, 12], [92, 26]], { w: 3.6, taper: true, color: o.accent || o.ink }); d.line([[80, 14], [93, 26], [78, 33]], { w: 3.6, color: o.accent || o.ink }); }, [100, 40]);
  K.squiggle = I((d, o) => { const p = []; for (let i = 0; i <= 40; i++) p.push([2 + i * 2.4, 10 + Math.sin(i * .9) * 5]); d.line(p, { w: 2.6, color: o.accent || o.ink }); }, [100, 20]);

  const CREATURES = { gecko: 1, tanuki: 1, puffin: 1, axolotl: 1, sardine: 1, alpaca: 1 };
  window.DoodleKit = { K, E, eyes, cheeks, extras, toes, CREATURES };
  const polyline = (c, P, close) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); if (close) c.closePath(); };
  
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
// Critterpass collection data: 61 places, 150 locals. One critter per city.
// tier 0 = Vietnam (home set), 1 = ranks 1–10 (5 each), 2 = ranks 11–30 (3 each), 3 = ranks 31–60 (1 each).
// Ranking: 2024 international arrivals (UN Tourism). Macau left out (mostly same-day trips); all six live guides are in.
(function () {
  if (window.CritterDex) return;
  const PL = [
    ['vn', 'Vietnam', 0, [
      ['Hà Nội', 'Cụ Rùa', 'Hoàn Kiếm turtle', { b: 'turtle', c: ['#b5d68f', '#5f9a55', '#eef5d6'], acc: 'sword' }],
      ['Hạ Long', 'Rồng', 'Bay dragon', { b: 'lizard', v: 'dragon', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
      ['Sa Pa', 'Trâu', 'Water buffalo', { b: 'stand', v: 'buffalo', c: ['#948eb0', '#57517a', '#cfcae0'], horns: 'bull', ears: 'side2', acc: 'scarf', sc: '#4f86ff' }],
      ['Huế', 'Sao La', 'Saola', { b: 'stand', c: ['#b8744d', '#5a3424', '#fff1dc'], horns: 'straight', ears: 'deer', mask: 'saola' }],
      ['Hội An', 'Chép', 'Lantern carp', { b: 'fish', v: 'carp', c: ['#ff8a4d', '#e0502e', '#fff1dc'], pat: 'scales', acc: 'lantern' }],
      ['Đà Lạt', 'Ngựa', 'Flower pony', { b: 'stand', v: 'horse', c: ['#fff1d6', '#ff8fbf', '#fffaf0'], acc: 'flowers' }],
      ['Sài Gòn', 'Chào Mào', 'Red-whiskered bulbul', { b: 'bird', v: 'bulbul', c: ['#c9a882', '#3a3466', '#fffaf0'] }],
      ['Mekong', 'Cò', 'Egret', { b: 'wader', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'long', bc: '#ffd84a', lc: '#3a3466', acc: 'nonla' }],
      ['Phú Quốc', 'Xoáy', 'Phú Quốc ridgeback', { b: 'sit', c: ['#dba06a', '#a3683a', '#f6dcb4'], ears: 'cat', muz: 'dog', tail: 'thin', pat: 'ridge' }],
      ['Phong Nha', 'Dơi', 'Cave bat', { b: 'sit', v: 'bat', c: ['#a497dc', '#5d509e', '#ddd6f6'], ears: 'bat', ic: '#ffc2d6', tail: 'none' }],
    ]],
    ['fr', 'France', 1, [
      ['Paris', 'Roucou', 'Pigeon', { b: 'bird', v: 'pigeon', c: ['#bcc2da', '#7c84a8', '#dfe2ee'], acc: 'beret' }],
      ['Nice', 'Cigalou', 'Cicada', { b: 'bug', v: 'cicada', c: ['#ffd84a', '#c99a2a', '#fff3c4'] }],
      ['Lyon', 'Léon', 'Lion', { b: 'sit', c: ['#ffc46b', '#d0703a', '#fff1dc'], ears: 'round', mane: 1, muz: 'cat', tail: 'tuft' }],
      ['Marseille', 'Rascasse', 'Scorpionfish', { b: 'fish', v: 'tall', c: ['#ff6f5c', '#c63f3f', '#ffd9cc'], fins: 'spiky', pat: 'dots' }],
      ['Strasbourg', 'Stori', 'White stork', { b: 'wader', c: ['#fffaf0', '#3a3466', '#fffaf0'], beak: 'long', bc: '#ff5a3d', lc: '#ff5a3d' }],
    ]],
    ['es', 'Spain', 1, [
      ['Barcelona', 'Drac', 'Mosaic salamander', { b: 'lizard', c: ['#7fb8ff', '#3d6fe0', '#eef4ff'], pat: 'mosaic' }],
      ['Madrid', 'Osito', 'Brown bear', { b: 'sit', c: ['#bf7c52', '#6b3a24', '#f4d9b0'], ears: 'round', muz: 'dog', tail: 'stub', acc: 'berries' }],
      ['Seville', 'Lince', 'Iberian lynx', { b: 'sit', c: ['#e8b87a', '#8f5a3a', '#fff1dc'], ears: 'tuft', muz: 'cat', pat: 'spots', mask: 'beard', tail: 'stub' }],
      ['Mallorca', 'Ferreret', 'Midwife toad', { b: 'frog', c: ['#e3cc6c', '#6b5a24', '#fff6d0'], pat: 'spots' }],
      ['Tenerife', 'Canario', 'Canary', { b: 'bird', c: ['#ffd84a', '#e0a92a', '#fff6cc'], beak: 'cone' }],
    ]],
    ['us', 'United States', 1, [
      ['New York', 'Pizza', 'Subway rat', { b: 'sit', c: ['#bab4ca', '#7c75a0', '#e6e2f2'], ears: 'mouse', ic: '#ffc2d6', muz: 'rat', tail: 'rat', hy: 33, hw: .9, acc: 'pizza' }],
      ['Los Angeles', 'Coyo', 'Coyote', { b: 'sit', c: ['#dba06a', '#8f5a3a', '#fff1dc'], ears: 'fox', muz: 'long', tail: 'bushy', acc: 'shades' }],
      ['Las Vegas', 'Lucky', 'Jackrabbit', { b: 'sit', c: ['#e3c49c', '#9c7a5a', '#fffaf0'], ears: 'long', ic: '#ffb8c8', muz: 'bunny', tail: 'puff', hy: 40, hh: .9, acc: 'dice' }],
      ['Orlando', 'Gator', 'Alligator', { b: 'lizard', v: 'croc', c: ['#78b35e', '#3f7a3a', '#e2f2b8'] }],
      ['Honolulu', 'Humu', 'Reef triggerfish', { b: 'fish', v: 'tall', c: ['#ffd84a', '#3a3466', '#fff6cc'], pat: 'humu' }],
    ]],
    ['cn', 'China', 1, [
      ['Beijing', 'Jingba', 'Pekingese', { b: 'sit', c: ['#f2c98a', '#9c6a3f', '#fff1dc'], ears: 'flop', ec: '#c98a52', muz: 'flat', tail: 'plume', acc: 'knot' }],
      ['Shanghai', 'Xiexie', 'Hairy crab', { b: 'crab', c: ['#b0925e', '#5a4a2a', '#eadcb4'] }],
      ["Xi'an", 'Jinsi', 'Golden snub-nosed monkey', { b: 'sit', v: 'monkey', c: ['#ffc46b', '#d9703a', '#fff1dc'], ears: 'side', muz: 'snub', fcol: '#a8d4ff', tail: 'long', arms: 'long' }],
      ['Chengdu', 'Huahua', 'Giant panda', { b: 'sit', c: ['#fffaf0', '#3a3466', '#fffaf0'], ears: 'round', ec: '#3a3466', mask: 'panda', arms: 'dark', acc: 'bamboo', belly: 0 }],
      ['Guilin', 'Luci', 'Cormorant', { b: 'wader', v: 'float', c: ['#5d5780', '#3a3466', '#8d87a8'], beak: 'hook', bc: '#ffd84a' }],
    ]],
    ['tr', 'Türkiye', 1, [
      ['Istanbul', 'Tombili', 'Street cat', { b: 'sit', c: ['#c9cde0', '#8d93b0', '#fffaf0'], ears: 'cat', ic: '#ffb8c8', muz: 'cat', tail: 'thin', pat: 'tabby', bw: 24 }],
      ['Antalya', 'Caretta', 'Loggerhead turtle', { b: 'turtle', v: 'sea', c: ['#e8c29a', '#c4623e', '#fff1dc'] }],
      ['Cappadocia', 'Peri', 'Horse', { b: 'stand', v: 'horse', c: ['#c98a5a', '#5a3424', '#f4d9b0'], acc: 'balloon' }],
      ['Bodrum', 'Yunus', 'Bottlenose dolphin', { b: 'whale', v: 'dolphin', c: ['#86bdfb', '#3d6fe0', '#e6f2ff'] }],
      ['Izmir', 'Pembe', 'Flamingo', { b: 'wader', v: 'flamingo', c: ['#ff9cc8', '#ff5fa8', '#ffd9e8'], beak: 'flamingo', bc: '#fff1dc', lc: '#ff5fa8' }],
    ]],
    ['it', 'Italy', 1, [
      ['Rome', 'Lupa', 'She-wolf', { b: 'sit', c: ['#c9a27a', '#7a5a3f', '#f4e3c8'], ears: 'fox', muz: 'long', tail: 'bushy', acc: 'laurel' }],
      ['Venice', 'Seppia', 'Cuttlefish', { b: 'octo', c: ['#c9a6f0', '#7f5ac9', '#f0e6ff'], acc: 'boater' }],
      ['Florence', 'Porcellino', 'Bronze boar', { b: 'sit', c: ['#8f9a6a', '#5a6440', '#c9cc9a'], ears: 'pig', muz: 'snout', snc: '#ffd84a', tusks: 1, tail: 'curl', pat: 'bristle' }],
      ['Milan', 'Biscio', 'Crowned serpent', { b: 'snake', c: ['#54d6a4', '#2e9a74', '#dff7ea'], acc: 'crown' }],
      ['Capri', 'Azzurra', 'Blue lizard', { b: 'lizard', v: 'slim', c: ['#5b8fff', '#2f5fc9', '#dbe8ff'], pat: 'dots' }],
    ]],
    ['mx', 'Mexico', 1, [
      ['Mexico City', 'Ajo', 'Axolotl', { k: 'axolotl' }],
      ['Cancún', 'Tibu', 'Whale shark', { b: 'fish', v: 'shark', c: ['#7494d4', '#3d5fa8', '#e6eeff'], pat: 'wspots' }],
      ['Oaxaca', 'Chapulín', 'Grasshopper', { b: 'bug', v: 'hopper', c: ['#9cd66a', '#5a9a3a', '#e8f6c8'] }],
      ['Tulum', 'Coati', 'White-nosed coati', { b: 'sit', c: ['#c98a5a', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'longnose', tail: 'ring' }],
      ['Guadalajara', 'Xolo', 'Xoloitzcuintli', { b: 'sit', c: ['#8a83ad', '#4a4466', '#b3acd0'], ears: 'bat', ic: '#ffc2d6', muz: 'dog', tail: 'thin', acc: 'marigold', belly: 0 }],
    ]],
    ['hk', 'Hong Kong', 1, [
      ['Victoria Peak', 'Maying', 'Black kite', { b: 'bird', v: 'raptor', c: ['#a8764f', '#6b3a24', '#dcbc9c'], tail: 'fork' }],
      ['Kowloon', 'Malau', 'Rhesus macaque', { b: 'sit', v: 'monkey', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'], ears: 'side', muz: 'monkey', fcol: '#ffb8a8', tail: 'stub' }],
      ['Mong Kok', 'Gamyu', 'Goldfish', { b: 'fish', v: 'gold', c: ['#ff9a4d', '#ff5a3d', '#fff1dc'], acc: 'bag' }],
      ['Lantau', 'Hoitun', 'Pink dolphin', { b: 'whale', v: 'dolphin', c: ['#ffb3cf', '#ff7fae', '#ffe6f0'] }],
      ['Lamma', 'Romer', "Romer's tree frog", { b: 'frog', v: 'tree', c: ['#cfa66e', '#8f6a3a', '#f4e3c8'] }],
    ]],
    ['gb', 'United Kingdom', 1, [
      ['London', 'Merlina', 'Tower raven', { b: 'bird', v: 'raven', c: ['#5d5780', '#2c2750', '#7a7399'], beak: 'raven', bc: '#3a3466', acc: 'crown' }],
      ['Edinburgh', 'Bobby', 'Skye terrier', { b: 'sit', c: ['#bcc2da', '#7c84a8', '#e2e5f0'], ears: 'flop', ec: '#9aa0bd', mask: 'fringe', muz: 'dog', tail: 'plume', acc: 'tartan' }],
      ['Loch Ness', 'Nessie', 'Loch Ness monster', { b: 'nessie', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
      ['Manchester', 'Buzz', 'Worker bee', { b: 'bug', v: 'bee', c: ['#ffd84a', '#3a3466', '#fff6cc'] }],
      ['Lake District', 'Herdy', 'Herdwick lamb', { b: 'sit', v: 'sheep', c: ['#aaa4c2', '#6f698c', '#fffaf0'], hc: '#fffaf0', ears: 'sheep', ec: '#fffaf0' }],
    ]],
    ['de', 'Germany', 1, [
      ['Berlin', 'Buddy', 'Buddy bear', { b: 'sit', c: ['#ff8fbf', '#c94f86', '#ffd9e8'], ears: 'round', pose: 'cheer', pat: 'stars' }],
      ['Munich', 'Waldi', 'Dachshund', { b: 'stand', v: 'dachshund', c: ['#86bdfb', '#3d6fe0', '#fffaf0'], ears: 'flop', ec: '#3d6fe0', pat: 'waldi', tail: 'dog' }],
      ['Hamburg', 'Hein', 'Harbour seal', { b: 'seal', c: ['#bcc2da', '#7c84a8', '#e2e5f0'], pat: 'speckle', acc: 'sailor' }],
      ['Black Forest', 'Kucki', 'Cuckoo', { b: 'bird', c: ['#aaa4c2', '#6f698c', '#fffaf0'], pat: 'barred', acc: 'bollen' }],
      ['Neuschwanstein', 'Ludwig', 'Mute swan', { b: 'wader', v: 'swan', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'swan', bc: '#ff9a4d', acc: 'crown' }],
    ]],
    ['jp', 'Japan', 2, [
      ['Kyoto', 'Pon', 'Tanuki', { k: 'tanuki' }],
      ['Tokyo', 'Hachi', 'Akita', { b: 'sit', c: ['#ffb46b', '#c97a3a', '#fffaf0'], ears: 'cat', muz: 'dog', mask: 'akita', tail: 'curlup' }],
      ['Osaka', 'Fugu', 'Pufferfish', { b: 'fish', v: 'puffer', c: ['#ffe08a', '#c99a2a', '#fffaf0'], pat: 'dots' }],
    ]],
    ['gr', 'Greece', 2, [
      ['Athens', 'Koukou', 'Little owl', { b: 'bird', v: 'owl', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'] }],
      ['Crete', 'Kri-kri', 'Cretan wild goat', { b: 'stand', c: ['#dba06a', '#8f5a3a', '#f4e3c8'], horns: 'back', ears: 'deer', beard: 1 }],
      ['Mykonos', 'Petros', 'Pelican', { b: 'wader', v: 'pelican', c: ['#fff1e6', '#e6d6c6', '#fffaf0'], beak: 'pouch', bc: '#ff9a4d', lc: '#ff9a4d' }],
    ]],
    ['th', 'Thailand', 2, [
      ['Bangkok', 'Plakad', 'Siamese fighting fish', { b: 'fish', v: 'betta', c: ['#ff5fa8', '#c42f7a', '#ffd9e8'] }],
      ['Chiang Mai', 'Chang', 'Asian elephant', { b: 'stand', v: 'elephant', c: ['#bab4ca', '#7c75a0', '#e6e2f2'] }],
      ['Phuket', 'Chanee', 'White-handed gibbon', { b: 'sit', v: 'monkey', c: ['#e8d9b0', '#8f7a4d', '#fffaf0'], muz: 'monkey', fcol: '#4a4466', ring: 1, arms: 'long', tail: 'none' }],
    ]],
    ['at', 'Austria', 2, [
      ['Vienna', 'Lipi', 'Lipizzaner', { b: 'stand', v: 'horse', c: ['#f4efe4', '#bcc2da', '#fffaf0'], acc: 'bridle' }],
      ['Salzburg', 'Murmeli', 'Alpine marmot', { b: 'sit', c: ['#c98a5a', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'teeth', tail: 'stub', bw: 23, acc: 'edelweiss' }],
      ['Innsbruck', 'Gamsi', 'Chamois', { b: 'stand', c: ['#a8764f', '#3a3466', '#f4e3c8'], horns: 'hook', ears: 'horse', mask: 'chamois' }],
    ]],
    ['sa', 'Saudi Arabia', 2, [
      ['Riyadh', 'Jamal', 'Dromedary', { b: 'stand', v: 'camel', c: ['#e8c290', '#b8905a', '#fff1dc'], ears: 'tiny', acc: 'tassel' }],
      ['AlUla', 'Hudhud', 'Hoopoe', { b: 'bird', v: 'hoopoe', c: ['#ffb07a', '#3a3466', '#fff1dc'], beak: 'long' }],
      ['Jeddah', 'Marjan', 'Clownfish', { b: 'fish', v: 'tall', c: ['#ff9a4d', '#3a3466', '#fffaf0'], pat: 'bands' }],
    ]],
    ['pt', 'Portugal', 2, [
      ['Lisbon', 'Sardi', 'Sardine', { k: 'sardine' }],
      ['Porto', 'Galo', 'Barcelos rooster', { b: 'bird', v: 'rooster', c: ['#5d5780', '#2c2750', '#7a7399'], pat: 'hearts' }],
      ['Algarve', 'Faro', 'Portuguese water dog', { b: 'sit', c: ['#a07c5c', '#5a4030', '#fff1dc'], ears: 'flop', muz: 'dog', coat: 'curly', tail: 'plume' }],
    ]],
    ['my', 'Malaysia', 2, [
      ['Kuala Lumpur', 'Rimau', 'Malayan tiger', { b: 'sit', c: ['#ff9a4d', '#3a3466', '#fffaf0'], ears: 'round', muz: 'cat', pat: 'stripes', tail: 'ringthin' }],
      ['Langkawi', 'Helang', 'Brahminy kite', { b: 'bird', v: 'raptor', c: ['#d9703a', '#8f4a2a', '#fffaf0'], pat: 'whitehead' }],
      ['Borneo', 'Utan', 'Orangutan', { b: 'sit', v: 'monkey', c: ['#e0703a', '#a0482a', '#ffb88a'], muz: 'monkey', fcol: '#f4c9a0', arms: 'long', tail: 'none', hair: 1 }],
    ]],
    ['nl', 'Netherlands', 2, [
      ['Amsterdam', 'Reiger', 'Grey heron', { b: 'wader', c: ['#bcc2da', '#6f698c', '#fffaf0'], beak: 'long', bc: '#ffd84a', lc: '#c9a02a', crest: 1 }],
      ['Keukenhof', 'Lieve', 'Ladybird', { b: 'bug', v: 'ladybug', c: ['#ff5a4d', '#3a3466', '#ffd9cc'], acc: 'tulip' }],
      ['Giethoorn', 'Eendje', 'Mallard', { b: 'bird', v: 'duck', c: ['#d9c9b0', '#8f7a5a', '#fff1dc'], beak: 'duck', pat: 'mallard' }],
    ]],
    ['ca', 'Canada', 2, [
      ['Toronto', 'Bandit', 'Raccoon', { b: 'sit', c: ['#aaa4c2', '#3a3466', '#e6e2f2'], ears: 'round', mask: 'raccoon', tail: 'ring' }],
      ['Vancouver', 'Skaana', 'Orca', { b: 'whale', v: 'orca', c: ['#4a4466', '#2c2750', '#fffaf0'] }],
      ['Banff', 'Wapiti', 'Elk', { b: 'stand', c: ['#c98a5a', '#5a3424', '#f4e3c8'], horns: 'antler', ears: 'deer', mane: 'ruff' }],
    ]],
    ['pl', 'Poland', 2, [
      ['Kraków', 'Smok', 'Wawel dragon', { b: 'lizard', v: 'smok', c: ['#8fd06a', '#4f9a3a', '#e8f6c8'] }],
      ['Warsaw', 'Wiewi', 'Red squirrel', { b: 'sit', c: ['#e0703a', '#a0482a', '#fff1dc'], ears: 'tuft', muz: 'bunny', tail: 'big', acc: 'acorn' }],
      ['Gdańsk', 'Foka', 'Grey seal', { b: 'seal', c: ['#aaa4c2', '#6f698c', '#e6e2f2'], pat: 'blotch', acc: 'amber' }],
    ]],
    ['hr', 'Croatia', 2, [
      ['Dubrovnik', 'Paun', 'Peacock', { b: 'bird', v: 'peacock', c: ['#4f86ff', '#2f5fc9', '#dbe8ff'] }],
      ['Split', 'Pjega', 'Dalmatian', { b: 'sit', c: ['#fffaf0', '#3a3466', '#fffaf0'], ears: 'flop', ec: '#3a3466', muz: 'dog', pat: 'dalmatian', tail: 'thin' }],
      ['Plitvice', 'Vilin', 'Dragonfly', { b: 'bug', v: 'dragonfly', c: ['#54d6a4', '#2e9a74', '#dff7ea'] }],
    ]],
    ['ae', 'United Arab Emirates', 2, [
      ['Dubai', 'Saqr', 'Falcon', { b: 'bird', v: 'raptor', c: ['#c9b8a0', '#6b5a4a', '#fffaf0'], acc: 'hood' }],
      ['Abu Dhabi', 'Arus', 'Dugong', { b: 'seal', v: 'dugong', c: ['#c9b3c9', '#8f7a9a', '#efe4f0'] }],
      ['Sharjah', 'Ramli', 'Sand cat', { b: 'sit', c: ['#ecd09a', '#b8905a', '#fffaf0'], ears: 'big', ic: '#ffc9b0', muz: 'cat', tail: 'ringthin', bw: 19, hw: 1.05 }],
    ]],
    ['ma', 'Morocco', 2, [
      ['Marrakech', 'Belarj', 'White stork', { b: 'wader', c: ['#fffaf0', '#3a3466', '#fffaf0'], beak: 'long', bc: '#ff5a3d', lc: '#ff5a3d', acc: 'fez' }],
      ['Chefchaouen', 'Magot', 'Barbary macaque', { b: 'sit', v: 'monkey', c: ['#d9b48a', '#9c7a5a', '#f4e3c8'], ears: 'side', muz: 'monkey', fcol: '#ffc9b8', tail: 'none' }],
      ['Merzouga', 'Fanak', 'Fennec fox', { b: 'sit', c: ['#ffe0b0', '#d9a066', '#fffaf0'], ears: 'fen', ic: '#ffc2a8', muz: 'long', tail: 'bushy', tt: '#3a3466', bw: 19 }],
    ]],
    ['hu', 'Hungary', 2, [
      ['Budapest', 'Puli', 'Puli', { b: 'sit', v: 'puli', c: ['#fff1d6', '#d6c498', '#fffaf0'] }],
      ['Balaton', 'Fogas', 'Zander', { b: 'fish', v: 'long', c: ['#acd0a4', '#5a7a5a', '#eef6e8'], pat: 'bars', teeth: 1 }],
      ['Hortobágy', 'Mangalica', 'Woolly pig', { b: 'sit', c: ['#f4d9a0', '#c9a06a', '#fff1dc'], ears: 'pig', muz: 'snout', coat: 'curly', tail: 'curl' }],
    ]],
    ['sg', 'Singapore', 2, [
      ['Marina Bay', 'Merang', 'Smooth-coated otter', { b: 'sit', c: ['#b8744d', '#6b3a24', '#f4d9b0'], ears: 'tiny', muz: 'otter', mask: 'face', fcol: '#f4d9b0', tail: 'otter', hw: .95 }],
      ['Sentosa', 'Enggang', 'Oriental pied hornbill', { b: 'bird', v: 'hornbill', c: ['#5d5780', '#2c2750', '#fffaf0'] }],
      ['Sungei Buloh', 'Belacak', 'Mudskipper', { b: 'fish', v: 'mud', c: ['#bdb48c', '#7a704a', '#eee8d0'], pat: 'bluedots' }],
    ]],
    ['kr', 'South Korea', 2, [
      ['Seoul', 'Kkachi', 'Magpie', { b: 'bird', v: 'magpie', c: ['#4a4466', '#2c2750', '#fffaf0'] }],
      ['Busan', 'Galmaegi', 'Black-tailed gull', { b: 'bird', v: 'gull', c: ['#fffaf0', '#aaa4c2', '#fffaf0'], beak: 'gull' }],
      ['Jeju', 'Dwaeji', 'Jeju black pig', { b: 'sit', c: ['#6a6490', '#3a3466', '#8d87a8'], ears: 'pig', muz: 'snout', snc: '#ffb8c8', tail: 'curl', belly: 0 }],
    ]],
    ['eg', 'Egypt', 2, [
      ['Cairo', 'Bastet', 'Egyptian Mau', { b: 'sit', c: ['#e8c290', '#8f6a4d', '#fff1dc'], ears: 'fox', ic: '#ffc2a8', muz: 'cat', pat: 'spots', tail: 'thin', acc: 'collar', bw: 18, hw: .92 }],
      ['Luxor', 'Khepri', 'Scarab', { b: 'bug', v: 'scarab', c: ['#4f86ff', '#2f5fc9', '#dbe8ff'] }],
      ['Aswan', 'Sobek', 'Nile crocodile', { b: 'lizard', v: 'croc', c: ['#a9b06a', '#6a7a3a', '#eef0c8'], acc: 'collar' }],
    ]],
    ['id', 'Indonesia', 2, [
      ['Bali', 'Tokek', 'Tokay gecko', { k: 'gecko' }],
      ['Labuan Bajo', 'Ora', 'Komodo dragon', { b: 'lizard', v: 'komodo', c: ['#aea78f', '#6f6a5a', '#e8e4d4'] }],
      ['Yogyakarta', 'Kukang', 'Slow loris', { b: 'sit', v: 'loris', c: ['#ead3b3', '#8f6a4d', '#fffaf0'], ears: 'tiny', mask: 'loris', er: 7, tail: 'none' }],
    ]],
    ['ch', 'Switzerland', 2, [
      ['Lucerne', 'Chüeli', 'Alpine cow', { b: 'stand', v: 'cow', c: ['#fffaf0', '#b8744d', '#ffd9e0'], horns: 'nub', ears: 'side2', pat: 'cow', acc: 'bell' }],
      ['Zermatt', 'Näsli', 'Valais blacknose sheep', { b: 'sit', v: 'sheep', c: ['#fffaf0', '#3a3466', '#fffaf0'], hc: '#5d5780', ears: 'sheep', ec: '#5d5780', horns: 'curl' }],
      ['Interlaken', 'Barry', 'St. Bernard', { b: 'sit', c: ['#fffaf0', '#c4623e', '#fffaf0'], ears: 'flop', ec: '#c4623e', mask: 'stb', muz: 'dog', tail: 'plume', acc: 'barrel' }],
    ]],
    ['cz', 'Czechia', 2, [
      ['Prague', 'Lev', 'Two-tailed lion', { b: 'sit', c: ['#fffaf0', '#c9cde0', '#fffaf0'], ears: 'round', mane: 1, mc: '#dfe2ee', muz: 'cat', tail: 'twin', acc: 'crown' }],
      ['Český Krumlov', 'Méďa', 'Brown bear', { b: 'sit', c: ['#dba06a', '#8f5a3a', '#f4e3c8'], ears: 'round', muz: 'dog', tail: 'stub', acc: 'rose' }],
      ['Karlovy Vary', 'Jelen', 'Red deer stag', { b: 'stand', c: ['#c9a27a', '#7a5a3f', '#f4e3c8'], horns: 'antler', ears: 'deer' }],
    ]],
    ['al', 'Albania', 3, [['Tirana', 'Shqipe', 'Golden eagle', { b: 'bird', v: 'raptor', c: ['#8f6a4d', '#5a4030', '#d9b89a'], acc: 'redscarf' }]]],
    ['tn', 'Tunisia', 3, [['Sidi Bou Said', 'Maknine', 'Goldfinch', { b: 'bird', v: 'goldfinch', c: ['#e8d0b0', '#3a3466', '#fffaf0'], beak: 'cone' }]]],
    ['in', 'India', 3, [['Jaipur', 'Hathi', 'Painted elephant', { b: 'stand', v: 'elephant', c: ['#aaa4c2', '#6f698c', '#e6e2f2'], pat: 'painted' }]]],
    ['be', 'Belgium', 3, [['Bruges', 'Lanchals', 'Mute swan', { b: 'wader', v: 'swan', c: ['#fffaf0', '#e6dfcf', '#fffaf0'], beak: 'swan', bc: '#ff9a4d' }]]],
    ['za', 'South Africa', 3, [['Cape Town', 'Pikkie', 'African penguin', { b: 'bird', v: 'penguin', c: ['#4a4466', '#2c2750', '#fffaf0'], beak: 'pen', bc: '#2c2750' }]]],
    ['do', 'Dominican Republic', 3, [['Samaná', 'Yubarta', 'Humpback whale', { b: 'whale', v: 'humpback', c: ['#7494d4', '#3d5fa8', '#e6eeff'] }]]],
    ['uz', 'Uzbekistan', 3, [['Samarkand', 'Sher', 'Tile tiger', { b: 'sit', c: ['#ffc46b', '#2f8fa8', '#fff1dc'], ears: 'round', muz: 'cat', pat: 'stripes', tail: 'ringthin' }]]],
    ['tw', 'Taiwan', 3, [['Taipei', 'Chuan', 'Formosan pangolin', { b: 'sit', v: 'pangolin', c: ['#c98a5a', '#8f5a3a', '#f4d9b0'], tail: 'pango' }]]],
    ['au', 'Australia', 3, [['Sydney', 'Gula', 'Koala', { b: 'sit', c: ['#bab4ca', '#7c75a0', '#fffaf0'], ears: 'koala', muz: 'big', acc: 'gumleaf' }]]],
    ['ie', 'Ireland', 3, [['Dublin', 'Fia', 'Fallow deer', { b: 'stand', c: ['#dba06a', '#8f5a3a', '#fff1dc'], horns: 'palm', ears: 'deer', pat: 'spots' }]]],
    ['se', 'Sweden', 3, [['Stockholm', 'Älgis', 'Moose', { b: 'stand', v: 'moose', c: ['#8f6a4d', '#5a4030', '#c9a27a'], horns: 'moose', ears: 'deer' }]]],
    ['kh', 'Cambodia', 3, [['Siem Reap', 'Neak', 'Naga', { b: 'snake', v: 'naga', c: ['#ffd84a', '#c99a2a', '#fff6cc'] }]]],
    ['br', 'Brazil', 3, [['Rio de Janeiro', 'Capivara', 'Capybara', { b: 'sit', v: 'capy', c: ['#c9a27a', '#8f6a4d', '#e8d0b0'], ears: 'tiny', muz: 'capy', tail: 'none', acc: 'orange' }]]],
    ['ar', 'Argentina', 3, [['Buenos Aires', 'Hornero', 'Rufous hornero', { b: 'bird', c: ['#dba06a', '#a0703a', '#fff1dc'] }]]],
    ['co', 'Colombia', 3, [['Cartagena', 'Perezoso', 'Brown-throated sloth', { b: 'sit', v: 'sloth', c: ['#c9b08a', '#6b5a3a', '#f4e8d0'], mask: 'sloth', arms: 'claws', tail: 'none' }]]],
    ['ph', 'Philippines', 3, [['Bohol', 'Mamag', 'Philippine tarsier', { b: 'sit', v: 'tarsier', c: ['#c9a27a', '#8f6a4d', '#f4e3c8'], ears: 'mouse', ic: '#ffc2a8', er: 8.5, eg: 11.5, tail: 'rat', tc: '#c9a27a' }]]],
    ['jo', 'Jordan', 3, [['Petra', 'Wardi', 'Sinai rosefinch', { b: 'bird', c: ['#ff9cc8', '#c94f86', '#ffe0ee'], beak: 'cone' }]]],
    ['cl', 'Chile', 3, [['Torres del Paine', 'Chulengo', 'Guanaco', { b: 'stand', v: 'guanaco', c: ['#dba06a', '#8f5a3a', '#fffaf0'], ears: 'llama' }]]],
    ['qa', 'Qatar', 3, [['Doha', 'Orry', 'Arabian oryx', { b: 'stand', c: ['#fffaf0', '#3a3466', '#fffaf0'], horns: 'straight', hc2: '#3a3466', ears: 'deer', mask: 'oryx' }]]],
    ['ge', 'Georgia', 3, [['Tbilisi', 'Khokhobi', 'Common pheasant', { b: 'bird', v: 'pheasant', c: ['#e0703a', '#8f4a2a', '#ffd0a0'] }]]],
    ['no', 'Norway', 3, [['Tromsø', 'Fjellrev', 'Arctic fox', { b: 'sit', c: ['#fffaf0', '#c9cde0', '#fffaf0'], ears: 'round', muz: 'long', tail: 'bushy', coat: 'fluffy' }]]],
    ['la', 'Laos', 3, [['Luang Prabang', 'Mee', 'Moon bear', { b: 'sit', c: ['#5d5780', '#2c2750', '#7a7399'], ears: 'round', muz: 'dog', pat: 'moon', belly: 0, tail: 'stub' }]]],
    ['om', 'Oman', 3, [['Muscat', 'Nimr', 'Arabian leopard', { b: 'sit', c: ['#f4d9a0', '#8f6a4d', '#fffaf0'], ears: 'round', muz: 'cat', pat: 'rosettes', tail: 'thin' }]]],
    ['nz', 'New Zealand', 3, [['Queenstown', 'Kiwi', 'Kiwi', { b: 'bird', v: 'kiwi', c: ['#b8905a', '#6b5a3a', '#d9b89a'], beak: 'kiwi', bc: '#c9a06a' }]]],
    ['pe', 'Peru', 3, [['Cusco', 'Paco', 'Alpaca', { k: 'alpaca' }]]],
    ['cr', 'Costa Rica', 3, [['La Fortuna', 'Ranita', 'Red-eyed tree frog', { b: 'frog', v: 'tree', c: ['#6fd66a', '#2e9a4a', '#fff6cc'], red: 1 }]]],
    ['ke', 'Kenya', 3, [['Nairobi', 'Twiga', 'Giraffe', { b: 'stand', v: 'giraffe', c: ['#ffd08a', '#c97a3a', '#fff1dc'], horns: 'ossi', ears: 'deer', pat: 'giraffe' }]]],
    ['is', 'Iceland', 3, [['Reykjavík', 'Lundi', 'Atlantic puffin', { k: 'puffin' }]]],
    ['cu', 'Cuba', 3, [['Havana', 'Zunzún', 'Bee hummingbird', { b: 'bird', v: 'humming', c: ['#54d6a4', '#2e9a74', '#dff7ea'], beak: 'needle', bc: '#3a3466' }]]],
    ['tz', 'Tanzania', 3, [['Serengeti', 'Milia', 'Plains zebra', { b: 'stand', v: 'horse', c: ['#fffaf0', '#3a3466', '#fffaf0'], pat: 'zebra', mc: '#3a3466' }]]],
  ];
  const pad = (n, w) => String(n).padStart(w, '0');
  const list = [];
  const places = PL.map(([code, name, tier, cs], i) => {
    const p = { code, name, tier, rank: tier ? i : null, rk: tier ? pad(i, 2) : '', critters: [] };
    cs.forEach(([city, nm, species, spec]) => {
      const n = list.length + 1, id = 'cp-' + pad(n, 3);
      const c = { id, no: n, num: '#' + pad(n, 3), name: nm, species, city, place: name, code, tier, rank: p.rank, spec, kind: spec.k || id };
      list.push(c); p.critters.push(c);
    });
    return p;
  });
  window.CritterDex = { places, list, byId: Object.fromEntries(list.map(c => [c.id, c])) };
})();

// Critter drawing, part 1: shared brush helpers, accessories, and the four-legged archetypes (sit, stand).
// Same stroke language as doodles.js: ink ribbons (d.line), watercolour washes (d.wash), solid fills, under-strokes.
(window.__cp = window.__cp || []).push([1, function (DK, X) {
  const { E, eyes } = DK;
  const INK = '#221e19', CR = '#fffaf0';
  const MIR = p => p.map(([x, y]) => [100 - x, y]);
  const TR = (p, H, m) => p.map(([x, y]) => [H.x + (m ? -x : x) * H.k, H.y + y * H.k]);
  const arcB = (cx, cy, rx, ry, e, a0, a1, n = 14) => { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a); o.push([cx + rx * Math.sign(c) * Math.abs(c) ** e, cy + ry * Math.sign(s) * Math.abs(s) ** e]); } return o; };
  const blob = (cx, cy, rx, ry, e = .8, n = 16) => arcB(cx, cy, rx, ry, e, 0, 6.2832 * (n - 1) / n, n - 1);
  const fluff = (cx, cy, rx, ry, n, amp) => Array.from({ length: n * 2 }, (_, i) => { const a = i / (n * 2) * 6.2832 - 1.5708, r = i % 2 ? 1 : 1 + amp; return [cx + Math.cos(a) * rx * r, cy + Math.sin(a) * ry * r]; });
  const bez = (p0, p1, p2, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]; });
  const crs = (P, per = 4) => { const out = []; for (let i = 0; i < P.length - 1; i++) { const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)]; for (let j = 0; j < per; j++) { const t = j / per, t2 = t * t, t3 = t2 * t; out.push([0, 1].map(k => .5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))); } } out.push(P[P.length - 1]); return out; };
  const tube = (P, w0, w1) => { const L = [], R = []; P.forEach((p, i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * i / (P.length - 1)) / 2; L.push([p[0] + dy / m * w, p[1] - dx / m * w]); R.push([p[0] - dy / m * w, p[1] + dx / m * w]); }); return { L, R, P: L.concat(R.slice().reverse()) }; };
  const star = (x, y, r) => Array.from({ length: 10 }, (_, i) => { const a = -1.5708 + i * Math.PI / 5, q = i % 2 ? r * .45 : r; return [x + Math.cos(a) * q, y + Math.sin(a) * q]; });
  const heart = (x, y, r) => [[x, y + r], [x - r, y - r * .1], [x - r * .8, y - r * .8], [x - r * .3, y - r * .9], [x, y - r * .45], [x + r * .3, y - r * .9], [x + r * .8, y - r * .8], [x + r, y - r * .1]];
  const shut = o => o.closed || o.pose === 'sleep';
  const nose = (d, x, y, rx = 3.8, ry = 2.7) => d.fill(E(x, y, rx, ry, 10), INK);
  const smile = (d, x, y, w = 5, h = 2.5, color) => d.line([[x - w, y], [x, y + h], [x + w, y]], { w: 2, color });
  const cheek = (d, P, r = 3) => P.forEach(([x, y]) => d.dot(x, y, r, '#ff7fa8', .5));
  const dotEyes = (d, o, P, r) => P.forEach(([x, y]) => { if (shut(o)) { d.line([[x - r, y], [x, y + r * .7], [x + r, y]], { w: 2 }); return; } d.fill(E(x, y, r, r * 1.1, 10), o.pupil); d.dot(x - r * .35, y - r * .42, r * .36, o.eye); });
  const iris = (d, o, P, r, col) => P.forEach(([x, y]) => { if (shut(o)) { d.line([[x - r * .8, y + .5], [x, y + r * .5], [x + r * .8, y + .5]], { w: 2.2 }); return; } d.fill(E(x, y, r, r, 14), col); d.line(E(x, y, r, r, 14), { w: 2.1, close: true }); d.fill(E(x, y + .3, r * .42, r * .5, 10), o.pupil); d.dot(x - r * .24, y - r * .3, r * .18, o.eye); });
  const W = (d, P, col, lw = 2.3, close = true) => { d.wash(P, col); d.line(P, { w: lw, close }); };
  const F = (d, P, col, lw = 1.9) => { d.fill(P, col); d.line(P, { w: lw, close: true }); };
  const bloom = (d, x, y, col, ctr) => { F(d, fluff(x, y, 3.4, 3.4, 5, .45), col, 1.4); d.dot(x, y, 1.3, ctr); };
  X.h = { INK, CR, MIR, TR, arcB, blob, fluff, bez, crs, tube, star, heart, shut, nose, smile, cheek, dotEyes, iris, W, F, bloom };

  // accessories — anchor a: { x, y: head top, w: head half-width, cy: head centre, ny: neck y, nw: neck half-width, hx, hy: hand }
  const band = (d, a, col, check) => { const { x, ny, nw } = a, p = [[x - nw, ny - 2], [x, ny + 3], [x + nw, ny - 2], [x + nw * 1.02, ny + 3], [x, ny + 8.5], [x - nw * 1.02, ny + 3]]; F(d, p, col, 2); if (check) { d.line([[x - nw, ny + .6], [x, ny + 5.6], [x + nw, ny + .6]], { w: 1.1, color: '#2c2750' }); [-.5, .5].forEach(u => d.line([[x + nw * u, ny + .8], [x + nw * u * .92, ny + 6]], { w: 1.2, color: '#ffd84a' })); } F(d, [[x + nw * .35, ny + 5], [x + nw * .62, ny + 16], [x + nw * .2, ny + 15]], col, 1.8); };
  const ACC = {
    beret: (d, a) => { F(d, blob(a.x + a.w * .12, a.y + 1.5, a.w * .64, a.w * .2, .75, 12), '#3a3466', 2); d.line([[a.x + a.w * .12, a.y - a.w * .16], [a.x + a.w * .2, a.y - a.w * .34]], { w: 2.2 }); },
    crown: (d, a) => { const w = a.w * .42, y = a.y + 2.5; F(d, [[a.x - w, y], [a.x - w * 1.12, y - w * .95], [a.x - w * .5, y - w * .42], [a.x, y - w * 1.15], [a.x + w * .5, y - w * .42], [a.x + w * 1.12, y - w * .95], [a.x + w, y]], '#ffd84a', 2); d.dot(a.x, y - w * .36, 1.7, '#ff5fa8'); },
    nonla: (d, a) => { const w = a.w * 1.35; W(d, [[a.x - w, a.y + 5], [a.x, a.y - w * .72], [a.x + w, a.y + 5], [a.x, a.y + 7.5]], '#f2d58a', 2.1); [-.42, .42].forEach(u => d.line([[a.x, a.y - w * .72], [a.x + w * u, a.y + 6.2]], { w: 1.2 })); },
    boater: (d, a) => { const w = a.w * .85, y = a.y + 3, cr = [[a.x - w * .58, y], [a.x - w * .54, y - w * .52], [a.x + w * .54, y - w * .52], [a.x + w * .58, y]]; F(d, blob(a.x, y, w, w * .2, .8, 12), '#f2d58a', 2); d.fill(cr, '#f2d58a'); d.fill([[a.x - w * .575, y - w * .1], [a.x + w * .575, y - w * .1], [a.x + w * .565, y - w * .26], [a.x - w * .565, y - w * .26]], '#ff5a4d'); d.line(cr, { w: 2 }); },
    sailor: (d, a) => { const w = a.w * .72, y = a.y + 4; F(d, [[a.x - w, y], [a.x - w * .92, y - w * .55], [a.x, y - w * .72], [a.x + w * .92, y - w * .55], [a.x + w, y]], '#33407a', 2); F(d, [[a.x - w * .95, y], [a.x + w * .95, y], [a.x + w * .7, y + w * .28], [a.x - w * .7, y + w * .28]], '#2c2750', 1.8); d.dot(a.x, y - w * .25, 1.8, '#ffd84a'); },
    bollen: (d, a) => { const w = a.w * .82, y = a.y + 3; F(d, blob(a.x, y, w, w * .22, .8, 12), CR, 2); [[-.5, -.28], [0, -.4], [.5, -.28], [-.25, -.62], [.25, -.62]].forEach(([u, v]) => F(d, E(a.x + u * w, y + v * w, w * .21, w * .21, 10), '#ff4a3d', 1.6)); },
    fez: (d, a) => { const w = a.w * .45, y = a.y + 3; F(d, [[a.x - w, y], [a.x - w * .78, y - w * 1.25], [a.x + w * .78, y - w * 1.25], [a.x + w, y]], '#e8453c', 2); d.line([[a.x, y - w * 1.25], [a.x + w * .9, y - w * .7], [a.x + w, y - w * .1]], { w: 1.6 }); d.dot(a.x + w, y, 1.6, INK); },
    laurel: (d, a) => { for (let i = 0; i < 4; i++) [3.55 + i * .26, 5.87 - i * .26].forEach(t => { const x = a.x + Math.cos(t) * a.w * .95, y = a.cy + Math.sin(t) * a.w * .78; F(d, E(x, y, 4, 1.9, 8, t + 1.57), '#6cc46a', 1.3); }); },
    flowers: (d, a) => [[-.62, .2, '#ff8fbf'], [-.3, -.1, '#ffd84a'], [0, -.18, CR], [.3, -.1, '#ff8fbf'], [.62, .2, '#ffd84a']].forEach(([u, v, c]) => bloom(d, a.x + u * a.w, a.y + 3 + v * a.w * .5, c, '#ff9a4d')),
    hood: (d, a) => { const w = a.w * .6, y = a.y + 6; F(d, [[a.x - w, y + w * .2], [a.x - w * .82, y - w * .45], [a.x, y - w * .72], [a.x + w * .82, y - w * .45], [a.x + w, y + w * .2], [a.x, y + w * .05]], '#a0602f', 2); d.line([[a.x, y - w * .72], [a.x - .5, y - w * 1.2]], { w: 1.8 }); F(d, fluff(a.x - .5, y - w * 1.35, 2.8, 3.4, 4, .4), '#ffd84a', 1.4); },
    shades: (d, a) => { const y = a.y + 5.5; [-7, 7].forEach(u => F(d, blob(a.x + u, y, 6, 3.6, .7, 10), '#3a3466', 1.6)); d.line([[a.x - 1.5, y - .5], [a.x + 1.5, y - .5]], { w: 1.6 }); d.dot(a.x - 9, y - 1.2, 1, '#9fd0ff'); d.dot(a.x + 5, y - 1.2, 1, '#9fd0ff'); },
    orange: (d, a) => { F(d, E(a.x + 2, a.y - 3, 6.5, 6, 12), '#ffa42e', 2); F(d, E(a.x + 4.5, a.y - 9.5, 3.2, 1.5, 8, -.4), '#54b86a', 1.2); },
    edelweiss: (d, a) => { const x = a.x + a.w * .74, y = a.y + a.w * .3; F(d, star(x, y, 4.8), CR, 1.4); d.dot(x, y, 1.4, '#ffd84a'); },
    rose: (d, a) => bloom(d, a.x + a.w * .74, a.y + a.w * .3, '#ff5a6e', '#c42f4a'),
    marigold: (d, a) => { const x = a.x + a.w * .74, y = a.y + a.w * .3; F(d, fluff(x, y, 4, 4, 8, .3), '#ff9a2e', 1.4); d.dot(x, y, 1.5, '#e0602a'); },
    scarf: (d, a, s) => band(d, a, s.sc || '#ff5a4d'),
    tartan: (d, a) => band(d, a, '#e8453c', 1),
    redscarf: (d, a) => band(d, a, '#e8453c'),
    collar: (d, a) => { const { x, ny, nw } = a; F(d, [[x - nw, ny - 2], [x, ny + 4], [x + nw, ny - 2], [x + nw * .9, ny + 4], [x, ny + 10], [x - nw * .9, ny + 4]], '#ffd84a', 2); d.line([[x - nw * .9, ny + 1.5], [x, ny + 7], [x + nw * .9, ny + 1.5]], { w: 1.6, color: '#3d6fe0' }); },
    knot: (d, a) => { const { x, ny } = a; F(d, [[x, ny], [x - 4, ny + 4], [x, ny + 8], [x + 4, ny + 4]], '#e8453c', 1.6); [-1, 1].forEach(u => d.line([[x, ny + 8], [x + u, ny + 14]], { w: 1.6, color: '#e8453c' })); },
    bell: (d, a) => { const { x, ny } = a; d.line([[x - 6, ny - 1], [x, ny + 2], [x + 6, ny - 1]], { w: 2.4, color: '#e8453c' }); F(d, [[x - 4.5, ny + 10], [x - 3.5, ny + 3.5], [x, ny + 2], [x + 3.5, ny + 3.5], [x + 4.5, ny + 10]], '#ffd84a', 1.8); d.dot(x, ny + 11, 1.5, INK); },
    barrel: (d, a) => { const { x, ny } = a; F(d, blob(x, ny + 6, 6.5, 4.5, .7, 12), '#c98a52', 1.8); [-2.5, 2.5].forEach(u => d.line([[x + u, ny + 1.8], [x + u, ny + 10.2]], { w: 1.2 })); },
    amber: (d, a) => { const { x, ny, nw } = a; d.line([[x - nw * .7, ny + 1], [x, ny + 6], [x + nw * .7, ny + 1]], { w: 1.4 }); F(d, E(x, ny + 9, 3.3, 4, 10), '#ffb84d', 1.6); },
    tassel: (d, a) => { const { x, ny, nw } = a; d.line([[x - nw, ny], [x, ny + 4], [x + nw, ny]], { w: 2, color: '#e8453c' }); [[-.6, '#ffd84a'], [0, '#4f86ff'], [.6, '#54d6a4']].forEach(([u, c]) => { const px = x + u * nw, py = ny + 3.5 - Math.abs(u) * 2; F(d, [[px - 1.6, py], [px + 1.6, py], [px + 2.4, py + 7], [px - 2.4, py + 7]], c, 1.3); }); },
    bridle: (d, a) => { const { x, cy } = a; d.line([[x - 11, cy + 2], [x - 7, cy + 7], [x + 7, cy + 7], [x + 11, cy + 2]], { w: 2, color: '#e8453c' }); d.dot(x - 10, cy + 3, 1.6, '#ffd84a'); d.dot(x + 10, cy + 3, 1.6, '#ffd84a'); },
    pizza: (d, a) => { const x = a.hx, y = a.hy; F(d, [[x - 5, y - 6], [x + 6, y - 5], [x + 1, y + 8]], '#ffd84a', 1.8); d.stroke([[x - 5, y - 6], [x + 6, y - 5]], '#e0a060', 3); [[x - 1, y - 2], [x + 2.5, y + 1]].forEach(([u, v]) => d.dot(u, v, 1.5, '#e8453c')); },
    dice: (d) => { const x = 81, y = 86; F(d, [[x - 5, y - 5], [x + 5, y - 5], [x + 5, y + 5], [x - 5, y + 5]], '#ff5a4d', 1.8); [[x - 2.2, y - 2.2], [x, y], [x + 2.2, y + 2.2]].forEach(([u, v]) => d.dot(u, v, 1, CR)); },
    berries: (d, a) => { const x = a.hx, y = a.hy; d.fill(E(x + 1, y - 5, 4, 2, 8, -.6), '#54b86a'); [[x - 2, y], [x + 2, y + 1], [x, y + 3.5]].forEach(([u, v]) => F(d, E(u, v, 2.4, 2.4, 8), '#e8453c', 1.3)); },
    bamboo: (d, a) => { const x = a.hx + 1, y = a.hy; d.stroke([[x, y + 14], [x + 2, y - 18]], '#7cc46a', 4.5); d.line([[x, y + 14], [x + 2, y - 18]], { w: 2 }); [4, -7].forEach(v => d.line([[x - .4 + (4 - v) * .06, y + v], [x + 3 + (4 - v) * .06, y + v]], { w: 1.4 })); F(d, E(x + 7, y - 15, 5, 2, 8, -.5), '#7cc46a', 1.4); },
    acorn: (d) => { F(d, E(50, 68, 4.5, 5, 10), '#c98a52', 1.6); F(d, blob(50, 63.5, 5.5, 2.8, .7, 10), '#8f5a3a', 1.6); d.line([[50, 61], [51, 58]], { w: 1.6 }); },
    gumleaf: (d, a) => { const x = a.hx, y = a.hy; F(d, E(x + 2, y - 3, 6.5, 2.6, 10, -.8), '#7cc46a', 1.5); d.line([[x - 2, y + 1], [x + 6, y - 7]], { w: 1.1 }); },
    tulip: (d) => { d.line([[86, 93], [86, 70]], { w: 2, color: '#3f9a55' }); F(d, E(82.5, 83, 4, 1.8, 8, -.9), '#54b86a', 1.3); F(d, [[81, 70], [81.5, 62], [84, 65], [86, 60], [88, 65], [90.5, 62], [91, 70], [86, 73]], '#ff8fbf', 1.6); },
    balloon: (d) => { const x = 82, y = 16; F(d, [[x - 9, y], [x - 7.5, y - 8.5], [x, y - 12], [x + 7.5, y - 8.5], [x + 9, y], [x + 4, y + 8], [x - 4, y + 8]], '#ff5a4d', 2); d.stroke([[x, y - 11.5], [x, y + 7.5]], '#ffd84a', 4); d.line([[x - 4, y + 8], [x - 2.5, y + 13]], { w: 1.2 }); d.line([[x + 4, y + 8], [x + 2.5, y + 13]], { w: 1.2 }); F(d, [[x - 3, y + 13], [x + 3, y + 13], [x + 2.5, y + 17], [x - 2.5, y + 17]], '#c98a52', 1.4); },
  };
  X.acc = (d, s, C, a) => { const f = ACC[s.acc]; if (f) f(d, a, s, C); };
  X.ACC = ACC;

  // heads: ears / horns in head-local coordinates (head radius ≈ 25 × 18.5 at k = 1)
  const EAR = {
    cat: { o: [[-19, -8], [-21, -26], [-6, -17]], i: [[-16.5, -12], [-18, -21.5], [-10.5, -16.5]] },
    fox: { o: [[-20, -6], [-26, -30], [-5, -17]], i: [[-17, -10], [-21.5, -24], [-9.5, -16]] },
    fen: { o: [[-19, -5], [-37, -31], [-4, -17]], i: [[-16, -10], [-30.5, -26], [-8.5, -16]] },
    bat: { o: [[-18, -8], [-34, -29], [-7, -17]], i: [[-16, -12], [-28, -24], [-10.5, -16]] },
    big: { o: [[-21, -3], [-37, -18], [-9, -16]], i: [[-18.5, -6], [-30.5, -16], [-12, -14.5]] },
    pig: { o: [[-17, -12], [-25, -29], [-5, -18]], i: [[-15, -15.5], [-20, -24], [-9, -18]] },
    tuft: { o: [[-19, -8], [-21, -27], [-6, -17]], i: [[-16.5, -12], [-18, -22], [-10.5, -16.5]], tuft: 1 },
    long: { o: [[-10, -14], [-16, -26], [-16, -38], [-11, -42], [-5, -35], [-4, -17]], i: [[-9, -19], [-12.5, -28], [-12.5, -36], [-10, -38.5], [-7.5, -32.5], [-7, -20]] },
    sheep: { o: [[-22, -5], [-37, -10], [-39, -3], [-24, 2]], cl: 1 },
    deer: { o: [[-19, -9], [-36, -19], [-32, -9], [-22, -3]], cl: 1 },
    side2: { o: [[-22, -6], [-36, -14], [-34, -5], [-24, 0]], cl: 1 },
    horse: { o: [[-11, -15], [-15, -31], [-4, -18]] },
    llama: { o: [[-11, -15], [-17, -31], [-13, -38], [-7, -31], [-5, -17]] },
    round: { e: [-19, -15, 8, 8] },
    mouse: { e: [-21, -14, 12, 12] },
    tiny: { e: [-17, -16, 4.8, 4.2] },
    koala: { e: [-24, -11, 12, 11], fl: 1 },
    side: { e: [-26, 1, 5.5, 7] },
    flop: { o: [[-19, -14], [-29, -10], [-31, 6], [-26, 14], [-19, 6]], front: 1 },
  };
  const ears = (d, t, H, C, s, ph) => {
    const e = EAR[t]; if (!e) return;
    [0, 1].forEach(m => {
      if (e.e) {
        const [ex, ey, rx, ry] = e.e, c = TR([[ex, ey]], H, m)[0], a = rx * H.k, b = ry * H.k;
        if (ph === 0) d.wash(E(c[0], c[1], a, b, 12), s.ec || C.f);
        if (ph === 1) { const th = Math.atan2(H.y - c[1], H.x - c[0]), q = [c[0] - Math.cos(th) * a * .15, c[1] - Math.sin(th) * b * .15]; if (e.fl) d.fill(fluff(q[0], q[1], a * .58, b * .58, 5, .2), C.bl); else d.fill(E(q[0], q[1], a * .5, b * .5, 10), s.ic || C.bl); d.line(arcB(c[0], c[1], a, b, 1, th + 1.15, th + 5.13, 12), { w: 2.3 }); }
      } else if (e.front) { if (ph === 2) F(d, TR(e.o, H, m), s.ec || C.dk, 2.2); }
      else {
        const p = TR(e.o, H, m);
        if (ph === 0) d.wash(p, s.ec || C.f);
        if (ph === 1) { if (e.i) d.fill(TR(e.i, H, m), s.ic || C.bl); d.line(p, { w: 2.3, close: !!e.cl }); if (e.tuft) d.line(TR([[-21, -27], [-22, -34]], H, m), { w: 2 }); }
      }
    });
  };
  const HORN = {
    back: { s: [[-8, -16], [-11, -28], [-19, -34], [-26, -30]], w: 6 },
    straight: { s: [[-7, -16], [-15, -42]], w: 4.6 },
    hook: { s: [[-6, -16], [-6, -28], [-10, -32], [-13.5, -29]], w: 4.2, dark: 1 },
    nub: { s: [[-9, -15], [-13, -22]], w: 5 },
    ossi: { s: [[-6, -17], [-7, -28]], w: 3.6, knob: 1 },
    bull: { p: [[-13, -13], [-28, -15], [-41, -25], [-43, -35], [-36, -28], [-25, -22], [-11, -18]] },
    antler: { a: [[[-8, -16], [-14, -31], [-22, -42]], [[-13, -28], [-5, -37]], [[-18, -37], [-27, -38]]] },
    palm: { p: [[-8, -16], [-14, -27], [-25, -31], [-31, -41], [-25, -39], [-21, -45], [-17, -39], [-13, -43], [-11, -35], [-6, -30]] },
    moose: { p: [[-12, -13], [-22, -15], [-33, -13], [-42, -21], [-41, -28], [-37, -24], [-35, -32], [-31, -26], [-29, -34], [-25, -26], [-21, -30], [-19, -22], [-12, -19]] },
    curl: { c: 1 },
  };
  const horns = (d, t, H, C, s) => {
    const h = HORN[t]; if (!h) return; const hc = s.hc2 || (h.dark ? C.dk : '#f4e3c8');
    [0, 1].forEach(m => {
      if (h.s) { const p = TR(h.s, H, m); d.stroke(p, hc, h.w * H.k); d.line(p, { w: 2.1 }); if (h.knob) d.dot(p[p.length - 1][0], p[p.length - 1][1], 2.8 * H.k, C.dk); }
      if (h.p) W(d, TR(h.p, H, m), hc, 2.1);
      if (h.a) h.a.forEach(l => { const p = TR(l, H, m); d.stroke(p, hc, 3.6 * H.k); d.line(p, { w: 2.1 }); });
      if (h.c) { const sp = []; for (let i = 0; i <= 14; i++) { const a = -1.4 + i * .42, r = 9 - i * .45; sp.push([-22 + Math.cos(a) * r, -6 + Math.sin(a) * r]); } const p = TR(sp, H, m); d.stroke(p, hc, 5.2 * H.k); d.line(p, { w: 2 }); }
    });
  };
  X.ears = ears; X.horns = horns;

  const TAIL = {
    bushy: { w: [[68, 84], [80, 89], [91, 81], [94, 67], [87, 59], [79, 63], [74, 72]], tip: [90.5, 63.5] },
    big: { w: [[67, 85], [82, 86], [92, 72], [88, 54], [93, 38], [85, 27], [74, 32], [77, 48], [71, 62]] },
    plume: { w: [[67, 68], [74, 57], [85, 55], [91, 63], [86, 72], [75, 76]] },
    pango: { w: [[64, 86], [80, 92], [93, 84], [95, 70], [88, 64], [84, 74], [74, 80]], sc: 1 },
    thin: { s: [[68, 84], [81, 88], [90, 79], [89, 66]], sw: 6 },
    ringthin: { s: [[68, 84], [81, 88], [90, 79], [89, 66]], sw: 6, ring: 3 },
    ring: { s: [[67, 84], [81, 89], [92, 78], [92, 62], [87, 52]], sw: 9, ring: 4 },
    long: { s: [[68, 84], [84, 89], [94, 77], [92, 59], [84, 53], [81, 59]], sw: 5 },
    otter: { s: [[66, 85], [80, 91], [94, 87]], sw: 9 },
    rat: { s: [[66, 86], [80, 93], [93, 88], [96, 76]], sw: 3.4, col: '#ffb8c8' },
    tuft: { l: [[68, 84], [82, 87], [88, 75]], tf: [89, 71] },
    twin: { l: [[68, 84], [82, 87], [88, 75]], tf: [89, 71], l2: [[67, 80], [77, 76], [79, 63]], tf2: [79.5, 59] },
    curl: { c: [[69, 82], [77, 80], [79, 74], [74.5, 72], [73, 77]] },
    puff: { pf: [72, 84, 6] },
    stub: { pf: [71.5, 82.5, 4.5] },
    curlup: { cu: 1 },
  };
  const tail = (d, t, C, s, bw) => {
    const q = TAIL[t]; if (!q) return; const dx = (bw - 21) * .9, sh = p => p.map(([x, y]) => [x + dx, y]);
    if (q.w) { const p = sh(q.w); d.wash(p, C.f); if (q.tip) d.wash(E(q.tip[0] + dx, q.tip[1], 5, 6, 10, .5), s.tt || C.bl); if (q.sc) [[84, 86], [90, 76], [78, 88]].forEach(([x, y]) => d.line(arcB(x + dx, y, 3.6, 3, 1, .3, 2.84, 5), { w: 1.4, color: C.dk })); d.line(p, { w: 2.3 }); }
    if (q.s) { const p = sh(q.s); d.stroke(p, s.tc || q.col || C.f, q.sw); if (q.ring) for (let i = 1; i < p.length; i++) { const a = p[i - 1], b = p[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx2 = b[0] - a[0], dy2 = b[1] - a[1], m = Math.hypot(dx2, dy2) || 1, h = q.sw * .55; d.stroke([[mx - dy2 / m * h, my + dx2 / m * h], [mx + dy2 / m * h, my - dx2 / m * h]], C.dk, q.ring); } d.line(p, { w: 2.2, taper: true }); }
    if (q.l) { d.line(sh(q.l), { w: 2.2 }); W(d, E(q.tf[0] + dx, q.tf[1], 4.3, 5.3, 10), s.mc || C.dk, 2); if (q.l2) { d.line(sh(q.l2), { w: 2.2 }); W(d, E(q.tf2[0] + dx, q.tf2[1], 4, 5, 10), s.mc || C.dk, 2); } }
    if (q.c) d.line(sh(q.c), { w: 2.2 });
    if (q.pf) W(d, fluff(q.pf[0] + dx, q.pf[1], q.pf[2], q.pf[2], 5, .15), t === 'puff' ? C.bl : C.f, 2);
    if (q.cu) { W(d, E(74 + dx, 66, 8.5, 8, 12), C.f, 2.2); d.line([[70 + dx, 66], [74 + dx, 62], [78 + dx, 66], [74 + dx, 69]], { w: 1.6 }); }
  };

  const MASK = {
    raccoon: (d, hy, C) => d.fill([[27, hy - 3], [38, hy - 7], [50, hy - 2.5], [62, hy - 7], [73, hy - 3], [71, hy + 5], [60, hy + 6.5], [50, hy + 2.5], [40, hy + 6.5], [29, hy + 5]], C.dk),
    panda: (d, hy, C) => { d.fill(E(37.5, hy + 1.5, 7.2, 9.5, 12, .55), C.dk); d.fill(E(62.5, hy + 1.5, 7.2, 9.5, 12, -.55), C.dk); },
    loris: (d, hy, C) => { d.fill(E(37.5, hy, 10.5, 11, 12), C.dk); d.fill(E(62.5, hy, 10.5, 11, 12), C.dk); d.fill([[48, hy - 18], [52, hy - 18], [52.6, hy + 7], [47.4, hy + 7]], CR); },
    sloth: (d, hy, C) => { d.fill(blob(50, hy + 2, 20, 14.5, .85, 14), C.bl); const p = [[27, hy - 2], [38, hy - 5], [45.5, hy + 1], [43, hy + 5.5], [32, hy + 6]]; d.fill(p, C.dk); d.fill(MIR(p), C.dk); },
    face: (d, hy, C, s) => d.fill(blob(50, hy + 4, 17, 12.5, .85, 14), s.fcol || C.bl),
    akita: (d, hy) => { d.fill(blob(50, hy + 8, 19, 9, .8, 14), CR); d.dot(38, hy - 7.5, 2.6, CR); d.dot(62, hy - 7.5, 2.6, CR); },
    stb: (d, hy, C) => { d.fill(E(37, hy - 1, 10, 9, 12, .3), C.dk); d.fill(E(63, hy - 1, 10, 9, 12, -.3), C.dk); },
    beard: (d, hy, C) => [1, -1].forEach(m => F(d, [[50 - 22 * m, hy + 4], [50 - 29 * m, hy + 11], [50 - 24 * m, hy + 11], [50 - 27 * m, hy + 16], [50 - 19 * m, hy + 12]], C.bl, 1.8)),
    fringe: (d, hy, C) => { const p = [[27, hy - 6], [33, hy - 1], [38.5, hy - 6], [44, hy - 1.5], [50, hy - 6.5], [56, hy - 1.5], [61.5, hy - 6], [67, hy - 1], [73, hy - 6], [70, hy - 15], [50, hy - 19], [30, hy - 15]]; d.fill(p, C.dk); d.line(p.slice(0, 9), { w: 1.8 }); },
  };
  const MUZ = {
    plain: (d, hy) => { nose(d, 50, hy + 8.5); smile(d, 50, hy + 12.5); },
    dog: (d, hy, C) => { d.fill(E(50, hy + 10.5, 10.5, 7, 12), C.bl); nose(d, 50, hy + 7.5, 4.4, 3.1); d.line([[50, hy + 9.5], [50, hy + 12.5]], { w: 1.8 }); d.line([[45, hy + 12], [47.5, hy + 14], [50, hy + 12.5], [52.5, hy + 14], [55, hy + 12]], { w: 1.9 }); },
    cat: (d, hy) => { d.fill([[47, hy + 7.5], [53, hy + 7.5], [50, hy + 10.2]], '#ff8fae'); d.line([[45, hy + 11.5], [47.5, hy + 13.5], [50, hy + 11], [52.5, hy + 13.5], [55, hy + 11.5]], { w: 1.9 }); [[[35, hy + 9], [25, hy + 7]], [[35, hy + 12], [26, hy + 13.5]]].forEach(l => { d.line(l, { w: 1.3 }); d.line(MIR(l), { w: 1.3 }); }); },
    long: (d, hy, C) => { d.fill([[39, hy + 2], [50, hy], [61, hy + 2], [58, hy + 11], [50, hy + 16.5], [42, hy + 11]], C.bl); nose(d, 50, hy + 12, 3.6, 2.6); d.line([[47, hy + 15.5], [50, hy + 17], [53, hy + 15.5]], { w: 1.7 }); },
    snout: (d, hy, C, s) => { const p = E(50, hy + 10, 8.5, 6, 12); F(d, p, s.snc || '#ffb8c8', 2); d.dot(47, hy + 10, 1.5, INK); d.dot(53, hy + 10, 1.5, INK); smile(d, 50, hy + 16.5, 3.5, 1.6); if (s.tusks) [1, -1].forEach(m => F(d, [[50 - 9.5 * m, hy + 13], [50 - 12 * m, hy + 5], [50 - 7.5 * m, hy + 12]], CR, 1.4)); },
    big: (d, hy) => { d.fill(blob(50, hy + 6, 5.5, 7.5, .9, 12), INK); d.dot(48.4, hy + 3.5, 1.3, '#fffdf6'); smile(d, 50, hy + 15, 4, 2); },
    flat: (d, hy, C) => { d.fill(E(50, hy + 10, 9.5, 6.5, 12), C.dk); nose(d, 50, hy + 8, 3.6, 2.5); d.line([[45.5, hy + 13], [50, hy + 14.5], [54.5, hy + 13]], { w: 1.8, color: CR }); },
    capy: (d, hy, C) => { d.fill(blob(50, hy + 9, 12, 8, .7, 14), C.dk); d.dot(45.5, hy + 7.5, 1.5, INK); d.dot(54.5, hy + 7.5, 1.5, INK); d.line([[46, hy + 12.5], [50, hy + 14], [54, hy + 12.5]], { w: 1.8 }); },
    otter: (d, hy, C) => { d.fill(E(45.5, hy + 10, 5.8, 4.6, 10), C.bl); d.fill(E(54.5, hy + 10, 5.8, 4.6, 10), C.bl); d.fill([[46.5, hy + 5.5], [53.5, hy + 5.5], [50, hy + 9]], INK); [[44, hy + 10], [42, hy + 12], [56, hy + 10], [58, hy + 12]].forEach(([x, y]) => d.dot(x, y, .8, INK)); },
    rat: (d, hy) => { d.dot(50, hy + 9, 2.6, '#ff8fae'); d.line([[47, hy + 12.5], [50, hy + 13.8], [53, hy + 12.5]], { w: 1.7 }); [[[40, hy + 9], [30, hy + 7]], [[40, hy + 11.5], [31, hy + 13]]].forEach(l => { d.line(l, { w: 1.2 }); d.line(MIR(l), { w: 1.2 }); }); },
    bunny: (d, hy) => { d.fill(E(50, hy + 8, 2.8, 2, 10), '#ff8fae'); d.line([[50, hy + 10], [50, hy + 12]], { w: 1.6 }); d.line([[46.5, hy + 12], [48.3, hy + 13.8], [50, hy + 12], [51.7, hy + 13.8], [53.5, hy + 12]], { w: 1.7 }); },
    teeth: (d, hy) => { nose(d, 50, hy + 8.5, 3.6, 2.6); d.line([[45.5, hy + 11.5], [50, hy + 13], [54.5, hy + 11.5]], { w: 1.9 }); F(d, [[47.6, hy + 12.6], [52.4, hy + 12.6], [52.2, hy + 17], [47.8, hy + 17]], CR, 1.5); d.line([[50, hy + 13], [50, hy + 17]], { w: 1.1 }); },
    snub: (d, hy, C, s) => { d.fill(blob(50, hy + 2, 17, 13, .85, 14), s.fcol); d.dot(48.3, hy + 7.5, 1.3, INK); d.dot(51.7, hy + 7.5, 1.3, INK); smile(d, 50, hy + 11, 4, 2); },
    monkey: (d, hy, C, s) => { if (s.ring) d.fill(blob(50, hy + 2, 18.5, 16, .85, 14), CR); [[41, hy - .5, 9.5, 9], [59, hy - .5, 9.5, 9], [50, hy + 7.5, 12, 8]].forEach(([x, y, a, b]) => d.fill(E(x, y, a, b, 12), s.fcol)); const lc = s.ring ? CR : INK; d.dot(48.2, hy + 7, 1.2, lc); d.dot(51.8, hy + 7, 1.2, lc); d.line([[46, hy + 11], [50, hy + 13], [54, hy + 11]], { w: 1.8, color: lc }); },
    longnose: (d, hy, C) => { F(d, [[45.5, hy + 3], [54.5, hy + 3], [53.5, hy + 14], [50, hy + 17.5], [46.5, hy + 14]], C.bl, 1.9); d.fill(E(50, hy + 15.5, 3.2, 2.3, 10), INK); },
  };
  const PAT = {
    tabby: (d, C, hy, bw) => { [[[44, hy - 17.5], [45, hy - 11]], [[50, hy - 18.5], [50, hy - 11.5]], [[56, hy - 17.5], [55, hy - 11]]].forEach(l => d.stroke(l, C.dk, 3)); [[[51 - bw, 63], [57 - bw, 65]], [[50 - bw, 72], [57 - bw, 73]]].forEach(l => { d.stroke(l, C.dk, 3); d.stroke(MIR(l), C.dk, 3); }); },
    stripes: (d, C, hy, bw) => { PAT.tabby(d, C, hy, bw); [[[26, hy + 1], [33, hy + 2.5]], [[27, hy + 7], [33, hy + 7]], [[51 - bw, 80], [56 - bw, 81]]].forEach(l => { d.stroke(l, C.dk, 2.8); d.stroke(MIR(l), C.dk, 2.8); }); },
    spots: (d, C, hy) => [[37, 60], [63, 58], [36, 74], [64, 72], [41, hy - 12], [59, hy - 12], [31, hy + 3], [69, hy + 3]].forEach(([x, y]) => d.dot(x, y, 1.8, C.dk, .9)),
    dalmatian: (d, C, hy) => [[36, 60, 3], [63, 62, 2.4], [33, 76, 2.6], [67, 75, 3], [58, 85, 2], [42, 85, 2.2], [40, hy - 11, 2.6], [62, hy - 13, 2], [31, hy + 3, 2.2], [69, hy + 5, 2.8]].forEach(([x, y, r]) => d.fill(E(x, y, r, r * .9, 10), C.dk)),
    rosettes: (d, C, hy) => [[36, 61], [64, 59], [34, 75], [66, 73], [41, hy - 12], [59, hy - 12], [31, hy + 4], [69, hy + 4]].forEach(([x, y]) => d.line(E(x, y, 2.3, 2, 8), { w: 1.5, close: true, color: C.dk })),
    stars: (d) => [[36, 63], [63, 66], [44, 82], [58, 80]].forEach(([x, y]) => F(d, star(x, y, 3.6), '#ffd84a', 1.4)),
    moon: (d) => d.fill([[37, 53], [50, 61], [63, 53], [61.5, 58], [50, 66.5], [38.5, 58]], '#efe6d2'),
    ridge: (d, C, hy) => d.stroke([[50, hy - 18.5], [50, hy - 8]], C.dk, 4.5),
    bristle: (d, C, hy) => [[44, hy - 17.5], [50, hy - 18.8], [56, hy - 17.5]].forEach(([x, y]) => d.line([[x, y], [x + (x - 50) * .12, y - 4.5]], { w: 1.8 })),
  };
  const curls = (d, C, hy, bw, kind) => [[37, 59], [45, 56], [55, 56], [63, 59], [34, 70], [66, 70], [38, 80], [62, 80], [40, hy - 13], [50, hy - 16], [60, hy - 13]].forEach(([x, y]) => d.line(kind === 'fluffy' ? [[x - 2.5, y], [x, y - 2], [x + 2.5, y]] : E(x, y, 2.1, 2, 8), { w: 1.4, color: C.dk, close: kind !== 'fluffy' }));
  const puli = (d, o, C) => {
    const mop = blob(50, 57, 28, 34, .88, 18); d.wash(mop, C.f);
    for (let i = 0; i < 10; i++) { const x = 29 + i * 4.7, t = Math.abs(x - 50) / 28; d.stroke([[x, 28 + t * 14], [x + 1.6, 46], [x - 1, 64], [x + 1.2, 88 - t * 10]], C.dk, 2.4); }
    d.line(mop, { w: 2.5, close: true }); d.line([[31, 44], [36, 49], [41, 45], [46, 50], [50, 46], [54, 50], [59, 45], [64, 49], [69, 44]], { w: 1.8 });
    eyes(d, o, [[41, 50], [59, 50]], 4.8); nose(d, 50, 57, 3.6, 2.6); smile(d, 50, 61, 4, 2); cheek(d, [[33, 58], [67, 58]], 3);
    [[40, 91.5], [60, 91.5]].forEach(([x, y]) => F(d, E(x, y, 6, 3, 10), C.dk, 1.6)); DK.extras(d, o);
  };

  X.A = X.A || {};
  X.A.sit = (d, o, s, C) => {
    const v = s.v || '', hy = s.hy || (v === 'capy' ? 33 : 31), bw = s.bw || 21, H = { x: 50, y: hy, k: 1 }, pose = o.pose || s.pose || 'idle';
    if (v === 'puli') return puli(d, o, C);
    const rx = 25 * (s.hw || 1), ry = 18.5 * (s.hh || 1), top = hy + ry * .62;
    const body = v === 'sheep' ? fluff(50, 71, bw + 3, 18, 9, .09) : [[50 - bw * .6, top], [50 - bw * .97, 63], [50 - bw, 77], [50 - bw * .64, 88], [50 + bw * .64, 88], [50 + bw, 77], [50 + bw * .97, 63], [50 + bw * .6, top]];
    const head = blob(50, hy, rx, ry, v === 'capy' ? .62 : .8, 16);
    if (v === 'bat') { const wg = [[31, 56], [15, 44], [4, 52], [7, 62], [13, 60], [15, 70], [23, 66], [27, 74], [33, 68]]; [wg, MIR(wg)].forEach(p => W(d, p, C.dk, 2.2)); }
    tail(d, s.tail, C, s, bw);
    const mane = s.mane && fluff(50, hy + 3, rx + 6, ry + 7.5, 10, .13);
    if (mane) d.wash(mane, s.mc || C.dk);
    d.wash(body, C.f);
    ears(d, s.ears, H, C, s, 0); horns(d, s.horns, H, C, s);
    d.wash(head, s.hc || C.f);
    if (s.belly !== 0 && v !== 'sheep') d.fill(E(50, 73, bw * .56, 12, 12), C.bl);
    if (PAT[s.pat]) PAT[s.pat](d, C, hy, bw, s);
    if (MASK[s.mask]) MASK[s.mask](d, hy, C, s);
    d.line(body, { w: 2.4, close: v === 'sheep' });
    if (mane) d.line(mane, { w: 2.2, close: true });
    ears(d, s.ears, H, C, s, 1);
    d.line(head, { w: 2.6, close: true });
    if (v === 'sheep') F(d, fluff(50, hy - 14, 16, 7, 6, .18), C.f, 2);
    if (v === 'pangolin') { for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - (r % 2); i++) d.line(arcB(36 + i * 9 + (r % 2) * 4.5, 56 + r * 8, 4.5, 3.6, 1, .2, 2.94, 6), { w: 1.6, color: C.dk }); [[42, hy - 12], [50, hy - 14], [58, hy - 12]].forEach(([x, y]) => d.line(arcB(x, y, 4.2, 3.2, 1, .2, 2.94, 6), { w: 1.5, color: C.dk })); }
    if (s.coat === 'curly' || s.coat === 'fluffy') curls(d, C, hy, bw, s.coat);
    if (s.hair) [[44, hy - 18], [50, hy - 19], [56, hy - 18]].forEach(([x, y]) => d.line([[x, y], [x + (x - 50) * .3, y - 5]], { w: 2 }));
    ears(d, s.ears, H, C, s, 2);
    const sx = 50 - bw * .7, sy = 58 + (hy - 31) * .35, LA = s.arms === 'long';
    let aL = LA ? [[sx + 1, sy - 1], [sx - 9, sy + 10], [sx - 9, sy + 22]] : [[sx, sy], [sx - 8, sy + 8]], aR = MIR(aL);
    const up = [[100 - sx, sy - 2], [109 - sx, sy - 11], [112 - sx, sy - 20]];
    if (pose === 'wave') aR = up;
    if (pose === 'cheer') { aR = up; aL = MIR(up); }
    if (pose === 'think') aR = [[100 - sx, sy], [106 - sx, sy - 6], [101 - sx, sy - 12]];
    if (v !== 'bat') [aL, aR].forEach(a => { if (s.arms === 'dark' || LA) d.stroke(a, s.arms === 'dark' ? C.dk : C.f, LA ? 6 : 7); d.line(a, { w: 2.4 }); const e = a[a.length - 1]; if (s.arms === 'claws') [-2.5, 0, 2.5].forEach(k => d.line([[e[0] + k, e[1]], [e[0] + k * 1.3, e[1] + 5]], { w: 1.6 })); if (LA) d.dot(e[0], e[1], 2.6, C.dk); });
    [[40, 89.5], [60, 89.5]].forEach(([x, y]) => F(d, E(x, y, 6.5, 3.3, 10), s.fc || C.dk, 1.6));
    const eg = s.eg || 12, er = s.er || 5.2;
    (MUZ[s.muz || 'plain'] || MUZ.plain)(d, hy, C, s);
    eyes(d, o, [[50 - eg, hy], [50 + eg, hy]], er);
    cheek(d, [[50 - eg - 9, hy + 9], [50 + eg + 9, hy + 9]], 3);
    X.acc(d, s, C, { x: 50, y: hy - ry, w: rx, cy: hy, ny: hy + ry - 2, nw: bw * .62, hx: 100 - sx + 11, hy: sy + 8 });
    DK.extras(d, o);
  };

  X.A.stand = (d, o, s, C) => {
    const v = s.v || '', G = v === 'giraffe', D = v === 'dachshund', EL = v === 'elephant', CA = v === 'camel', GU = v === 'guanaco', HO = v === 'horse', MO = v === 'moose';
    const bx = D ? 61 : 58, by = D ? 70 : 63, brx = D ? 27 : 24, bry = D ? 10 : 13, e = .85;
    const hx = D ? 28 : EL ? 31 : 30, hy = G ? 16 : GU ? 21 : D ? 53 : EL ? 35 : 32, k = EL ? .8 : .7, H = { x: hx, y: hy, k };
    const hrx = 25 * k * (EL ? 1 : .9), hry = 18.5 * k * (EL ? 1 : .95), lb = D ? 88 : (G || GU || HO) ? 94 : 91;
    const LX = D ? [42, 49, 73, 80] : [41, 48, 67, 74];
    const yE = (x, sg) => by + sg * bry * Math.max(0, 1 - Math.abs((x - bx) / brx) ** (1 / e)) ** e;
    const tx = bx + brx - 2, ty = by - bry * .45, tl = s.tail || (D ? 'dog' : HO || G || CA || v === 'cow' || v === 'buffalo' || s.horns === 'straight' ? 'tuft' : 'short');
    if (HO) W(d, [[tx - 1, ty - 1], [tx + 9, ty + 2], [tx + 13, ty + 14], [tx + 8, ty + 26], [tx + 6, ty + 14], [tx + 1, ty + 7]], s.mc || C.dk, 2.1);
    else if (tl === 'tuft') { d.line([[tx, ty], [tx + 7, ty + 7], [tx + 8, ty + 17]], { w: 2.1 }); W(d, E(tx + 8.5, ty + 19.5, 3.2, 4.4, 10), C.dk, 1.8); }
    else if (tl === 'short') W(d, E(tx + 2, ty + 1, 4.2, 3.6, 10), C.bl, 2);
    else if (tl === 'dog') { const p = [[tx - 1, ty + 2], [tx + 8, ty - 4], [tx + 11, ty - 13]]; d.stroke(p, C.f, 5); d.line(p, { w: 2.1 }); }
    [1, 3, 0, 2].forEach(i => { const x = LX[i], bot = [x + (i > 1 ? .8 : -.8), lb]; d.stroke([[x, by], bot], C.f, EL ? 9 : D ? 6 : 7); d.line([[x, yE(x, 1) - .5], bot], { w: 2.2, taper: false }); if (v === 'zebra' || s.pat === 'zebra') [lb - 10, lb - 5].forEach(y => d.stroke([[x - 3, y], [x + 3, y - 1]], C.dk, 2.2)); F(d, E(bot[0], lb + .8, EL ? 5 : 4, 2.1, 8), s.fc || C.dk, 1.5); });
    if (CA) d.wash(blob(bx + 3, by - bry + 1, 11, 9, .8, 14), C.f);
    d.wash(blob(bx, by, brx, bry, e, 16), C.f);
    const n0 = [bx - brx * .6, by - bry * .4], n2 = [hx + 3, hy + hry * .6], n1 = G ? [hx + 9, (n0[1] + n2[1]) / 2] : [(n0[0] + n2[0]) / 2 + 3, (n0[1] + n2[1]) / 2];
    const nc = bez(n0, n1, n2, 6), nk = tube(nc, G || GU ? 10 : D ? 13 : EL ? 16 : 14, G || GU ? 8 : D ? 12 : EL ? 14 : 11);
    if (s.mane === 'ruff') d.wash(tube(nc, 17, 14).P, C.dk);
    d.wash(nk.P, C.f);
    const mn = HO ? tube(nk.R.slice(1).map(([x, y]) => [x + 1.6, y - 1]), 7, 5) : null;
    if (mn) d.wash(mn.P, s.mc || C.dk);
    ears(d, s.ears || (EL ? '' : 'horse'), H, C, s, 0); horns(d, s.horns, H, C, s);
    if (EL) [-1, 1].forEach(m => d.wash(E(hx + m * 16, hy + 2, 11, 14, 12), C.f));
    const head = blob(hx, hy, hrx, hry, .8, 16); d.wash(head, C.f);
    const P2 = s.pat;
    if (P2 === 'spots') [[50, 57], [58, 54], [66, 57], [62, 64], [52, 65], [72, 62], [45, 62]].forEach(([x, y]) => d.dot(x, y, 1.9, CR));
    if (P2 === 'cow') [[52, 59, 6, 4.5], [69, 66, 5, 4], [hx - 7, hy - 7, 4, 3.5]].forEach(([x, y, a, b]) => d.fill(blob(x, y, a, b, .8, 10), C.dk));
    if (P2 === 'giraffe') [[48, 58], [57, 55], [66, 58], [74, 62], [55, 64], [64, 66], [44, 65]].concat([nc[1], nc[3], nc[5]]).forEach(([x, y]) => d.fill(blob(x, y, 3.2, 2.7, .7, 8), C.dk));
    if (P2 === 'zebra') { for (let i = 0; i < 7; i++) { const x = 42 + i * 5.5; d.stroke([[x - 1, yE(x, -1) + 1.5], [x + 1, yE(x, 1) - 2]], C.dk, 2.6); } [1, 3, 5].forEach(i => { const a = nk.L[i], b = nk.R[i]; d.stroke([a, b], C.dk, 2.4); }); [[hx - 6, hy - 9], [hx + 6, hy - 9]].forEach(([x, y]) => d.stroke([[x, y], [x + (x - hx) * .3, y + 5]], C.dk, 2)); }
    if (P2 === 'waldi') ['#ffd84a', '#54d6a4', '#ff9a4d', '#ffd84a', '#54d6a4', '#ff9a4d'].forEach((c, i) => { const x = 44 + i * 7.5; d.stroke([[x, yE(x, -1) + 1.5], [x, yE(x, 1) - 1.5]], c, 5.5); });
    d.line(arcB(bx, by, brx, bry, e, 4.3, 9.65, 22), { w: 2.4 });
    if (CA) d.line(arcB(bx + 3, by - bry + 1, 11, 9, .8, 3.35, 6.07, 10), { w: 2.3 });
    d.line(nk.L.slice(1, -1), { w: 2.3 }); d.line(nk.R.slice(1, -1), { w: 2.3 });
    if (mn) d.line(mn.R, { w: 2 });
    ears(d, s.ears || (EL ? '' : 'horse'), H, C, s, 1);
    if (EL) [-1, 1].forEach(m => { const c = [hx + m * 16, hy + 2]; d.line(m < 0 ? arcB(c[0], c[1], 11, 14, 1, 1.2, 5.1, 14) : arcB(c[0], c[1], 11, 14, 1, -1.95, 1.95, 14), { w: 2.3 }); d.fill(E(c[0] + m * 2, c[1] + 1, 6, 8.5, 10), '#ffc2d0'); });
    d.line(head, { w: 2.5, close: true });
    if (HO) W(d, [[hx - 5, hy - hry + 3], [hx - 1, hy - hry - 4], [hx + 4, hy - hry - 2], [hx + 5, hy - hry + 3.5], [hx, hy - hry + 5.5]], s.mc || C.dk, 1.8);
    if (s.mask === 'saola') [[hx - 7.5, hy + 4.5, 2.6], [hx + 7.5, hy + 4.5, 2.6], [hx - 6, hy - 9, 1.8], [hx + 6, hy - 9, 1.8]].forEach(([x, y, r]) => d.dot(x, y, r, CR));
    if (s.mask === 'chamois') { d.fill(blob(hx, hy + 1, hrx * .78, hry * .82, .8, 12), CR); [-1, 1].forEach(m => d.stroke([[hx + m * 9, hy - 11], [hx + m * 7.8, hy - 2.5], [hx + m * 4.5, hy + 7]], C.dk, 4)); }
    if (s.mask === 'oryx') { [-1, 1].forEach(m => d.stroke([[hx + m * 9, hy - 10], [hx + m * 7.8, hy - 2.5], [hx + m * 6, hy + 6]], C.dk, 3.8)); d.fill(blob(hx, hy - 3, 3.2, 5, .8, 8), C.dk); }
    if (P2 === 'painted') { F(d, [[hx, hy - 12.5], [hx - 5, hy - 6.5], [hx, hy - .5], [hx + 5, hy - 6.5]], '#ff8fbf', 1.6); [[hx - 9, hy - 8], [hx + 9, hy - 8], [hx - 11, hy + 3], [hx + 11, hy + 3]].forEach(([x, y]) => d.dot(x, y, 1.5, '#ffb84d')); }
    const ey = hy - 2.5, eg = EL ? 8.5 : 7.8;
    if (EL) {
      const tc = [[hx, hy + 5], [hx - .5, hy + 13], [hx - 2, hy + 20], [hx - 6.5, hy + 25], [hx - 10.5, hy + 23]], tb = tube(tc, 10, 5);
      d.wash(tb.P, C.f); if (P2 === 'painted') [1, 2, 3].forEach(i => d.stroke([tb.L[i], tb.R[i]], i === 2 ? '#ffb84d' : '#ff8fbf', 2.2));
      d.line(tb.L.slice(1), { w: 2.2 }); d.line(tb.R.slice(1), { w: 2.2 }); d.line([tb.L[4], tb.R[4]], { w: 2 });
      d.line([[hx + 5, hy + 9], [hx + 8, hy + 11], [hx + 11, hy + 9]], { w: 1.8 });
    } else if (D) {
      d.fill(blob(hx, hy + 7, 9, 7.5, .8, 12), C.bl); nose(d, hx, hy + 5, 4, 2.8); d.line([[hx - 4, hy + 10], [hx, hy + 12], [hx + 4, hy + 10]], { w: 1.8 });
    } else if (HO || CA || MO || v === 'cow' || v === 'buffalo' || G) {
      const mz = blob(hx, hy + hry * .5, hrx * (MO ? .78 : .66), hry * (MO ? .5 : .42), .8, 12); F(d, mz, v === 'cow' ? '#ffc2cf' : (s.mzc || C.bl), 1.8);
      d.dot(hx - 3.6, hy + hry * .45, 1.2, INK); d.dot(hx + 3.6, hy + hry * .45, 1.2, INK); smile(d, hx, hy + hry * .72, 3, 1.4);
      if (MO) W(d, [[hx - 3, hy + hry - .5], [hx - 1, hy + hry + 7], [hx + 2, hy + hry + 7.5], [hx + 3, hy + hry - .5]], C.f, 1.8);
    } else { d.fill([[hx - 2.6, hy + 5], [hx + 2.6, hy + 5], [hx, hy + 7.4]], INK); smile(d, hx, hy + 8.6, 3.2, 1.6); }
    eyes(d, o, [[hx - eg, ey], [hx + eg, ey]], 4.2);
    cheek(d, [[hx - 11.5, hy + 4.5], [hx + 11.5, hy + 4.5]], 2.4);
    if (s.beard) W(d, [[hx - 3, hy + hry - 1.5], [hx, hy + hry + 7], [hx + 3, hy + hry - 1.5]], C.bl, 1.8);
    X.acc(d, s, C, { x: hx, y: hy - hry, w: hrx, cy: hy, ny: hy + hry, nw: 7.5, hx: 20, hy: 70 });
    DK.extras(d, o);
  };
}]);

// Critter drawing, part 2: birds, water, reptiles, bugs and the rest. Registers every critter as a <doodle-art> kind.
(window.__cp = window.__cp || []).push([2, function (DK, X) {
  const { E, eyes, toes } = DK;
  const { INK, CR, MIR, arcB, blob, fluff, crs, tube, heart, shut, nose, smile, cheek, dotEyes, iris, W, F } = X.h;
  const A = X.A;

  const BEAK = {
    short: [[44.5, 43], [55.5, 43], [50, 50.5]], cone: [[44, 42], [56, 42], [50, 51.5]], pen: [[46, 43], [54, 43], [50, 51]],
    hook: [[44, 41.5], [56, 41.5], [55.5, 47], [51, 53.5], [49.5, 48.5], [44.5, 46.5]], duck: blob(50, 46, 9.5, 4.6, .7, 12),
    long: [[46, 42.5], [54, 42.5], [52.5, 50], [48, 63], [46.2, 62.5], [47.5, 50]], kiwi: [[47.5, 44], [52.5, 44], [51.2, 73], [49.2, 73.5]],
    gull: [[44.5, 42.5], [55.5, 42.5], [54.5, 48], [50, 53], [45.5, 48]], owl: [[46.5, 44], [53.5, 44], [50, 49.5]],
    raven: [[43.5, 42], [56.5, 42], [55, 48], [50, 55], [45, 48]], needle: [[47.5, 44], [52, 44], [42, 70], [40.5, 69.5]],
  };
  A.bird = (d, o, s, C) => {
    const v = s.v || '', pose = o.pose || 'idle', R = v === 'raptor';
    let body = [[50, 15], [33, 23], [25, 43], [26, 66], [36, 85], [64, 85], [74, 66], [75, 43], [67, 23]], ex = 8.5, ey = 36, er = 4.6, by = 0;
    if (v === 'owl') { body = blob(50, 54, 28, 34, .82, 16); ey = 41; er = 7; by = 5; }
    if (v === 'kiwi') { body = blob(52, 62, 32, 26, .86, 16); ey = 51; er = 4; by = 14; ex = 9; }
    if (v === 'penguin') body = [[50, 12], [34, 20], [27, 42], [27, 68], [35, 87], [65, 87], [73, 68], [73, 42], [66, 20]];
    if (v === 'humming') { body = blob(50, 56, 19, 26, .9, 14); ey = 42; er = 4.3; by = 5; ex = 7.5; }
    let wc = s.wc || C.dk; if (v === 'magpie') wc = '#5b8fff'; if (v === 'goldfinch') wc = INK;
    if (v === 'peacock') { const fan = arcB(50, 62, 47, 46, 1, 3.3, 6.12, 16).concat([[50, 64]]); W(d, fan, '#54d6a4', 2.2); for (let i = 0; i < 9; i++) { const a = 3.45 + i * .31, x = 50 + Math.cos(a) * 38, y = 62 + Math.sin(a) * 37; F(d, E(x, y, 4.2, 5, 10, a + 1.57), '#4f86ff', 1.4); d.dot(x, y, 1.8, '#ffd84a'); } }
    if (v === 'rooster') [[[68, 60], [84, 46], [95, 54]], [[70, 66], [89, 60], [95, 70]], [[70, 72], [86, 74], [90, 84]]].forEach((p, i) => { d.stroke(p, ['#e8453c', '#3a3466', '#ffd84a'][i], 6); d.line(p, { w: 2 }); });
    if (s.tail === 'fork' || R) W(d, [[45, 80], [41, 95], [50, 89], [59, 95], [55, 80]], C.dk, 2.1);
    if (v === 'magpie' || v === 'pheasant') { const p = [[60, 78], [75, 90], [95, 96], [80, 85], [66, 74]]; W(d, p, v === 'magpie' ? '#3a3466' : '#c4623e', 2.1); if (v === 'pheasant') d.line([[66, 82], [80, 89], [90, 92]], { w: 1.4 }); }
    if (v === 'hoopoe') for (let i = 0; i < 5; i++) { const a = -2.5 + i * .42, tip = [50 + Math.cos(a) * 19, 20 + Math.sin(a) * 19]; W(d, [[50 + Math.cos(a - .5) * 4, 20 + Math.sin(a - .5) * 4], tip, [50 + Math.cos(a + .5) * 4, 20 + Math.sin(a + .5) * 4]], C.f, 1.8); d.dot(tip[0] - Math.cos(a) * 1.6, tip[1] - Math.sin(a) * 1.6, 2.2, INK); }
    if (v === 'owl') [[31, 27], [69, 27]].forEach(([x, y], i) => W(d, i ? MIR([[31, 27], [27, 13], [40, 22]]) : [[31, 27], [27, 13], [40, 22]], C.f, 2.1));
    if (v === 'humming') [[36, 46], [60, 46]].forEach((_, i) => { const p = [[37, 48], [16, 30], [12, 40], [30, 54]]; W(d, i ? MIR(p) : p, '#e6fbff', 1.8); d.line(i ? MIR([[10, 30], [6, 34]]) : [[10, 30], [6, 34]], { w: 1.4 }); });
    d.wash(body, C.f);
    if (!['penguin', 'magpie', 'owl', 'kiwi', 'humming', 'hornbill'].includes(v)) d.fill(E(50, 66, 15, 16, 12), C.bl);
    if (v === 'penguin') { d.fill(blob(50, 62, 17, 23, .85, 14), C.bl); d.fill(E(41, 36, 8.5, 8, 12), C.bl); d.fill(E(59, 36, 8.5, 8, 12), C.bl); d.line(arcB(50, 58, 16, 9, 1, 3.5, 5.92, 10), { w: 2.4, color: C.f }); d.dot(35.5, 31, 2.4, '#ff8fae', .9); d.dot(64.5, 31, 2.4, '#ff8fae', .9); }
    if (v === 'magpie' || v === 'hornbill') { d.fill(blob(50, 68, 14, 15, .85, 12), C.bl); if (v === 'magpie') [[29, 55], [71, 55]].forEach(([x, y]) => d.fill(E(x, y, 3.6, 7, 10), CR)); else { d.fill(E(41, 36, 6.4, 6, 10), CR); d.fill(E(59, 36, 6.4, 6, 10), CR); } }
    if (v === 'kiwi') [[36, 52], [44, 44], [60, 42], [70, 50], [74, 64], [66, 76], [38, 74], [30, 64], [52, 36]].forEach(([x, y]) => d.line([[x, y], [x + 1.6, y + 3]], { w: 1.3, color: C.dk }));
    if (v === 'owl') { d.fill(E(40, 41, 10.5, 10.5, 12), C.bl); d.fill(E(60, 41, 10.5, 10.5, 12), C.bl); [[34, 62], [44, 70], [58, 64], [66, 72], [40, 80], [60, 80], [50, 20], [42, 24], [58, 24]].forEach(([x, y]) => d.dot(x, y, 1.6, CR)); }
    if (v === 'pigeon') { d.fill([[31, 47], [50, 53], [69, 47], [70, 54], [50, 60], [30, 54]], '#7fd3ae'); d.fill([[32, 53], [50, 59.5], [68, 53], [66, 58], [50, 64], [34, 58]], '#b99ae8'); }
    if (v === 'bulbul') { W(d, [[41, 22], [45, 3], [50, 12], [57, 20]], C.dk, 1.8); d.fill(E(35.5, 44, 3.4, 2.8, 10), '#ff4a3d'); d.fill(E(64.5, 44, 3.4, 2.8, 10), '#ff4a3d'); d.fill(E(50, 80, 7, 4, 10), '#ff6a5a'); }
    if (v === 'goldfinch') { d.fill(blob(50, 43, 13, 8.5, .85, 12), '#ff4a3d'); d.fill([[34, 25], [50, 17], [66, 25], [62, 30], [50, 27.5], [38, 30]], INK); }
    if (v === 'duck' || s.pat === 'mallard') { d.fill(blob(50, 31, 21, 15.5, .85, 14), '#3fae7a'); d.stroke([[32, 45], [50, 49.5], [68, 45]], CR, 2.4); d.fill(E(50, 57, 13, 6.5, 10), '#b86a3f'); }
    if (v === 'pheasant') { d.fill(blob(50, 31, 21, 15.5, .85, 14), '#3fae7a'); d.fill(E(41.5, 36, 6.8, 6.2, 10), '#ff4a3d'); d.fill(E(58.5, 36, 6.8, 6.2, 10), '#ff4a3d'); d.stroke([[33, 46], [50, 50.5], [67, 46]], CR, 2.6); [[40, 62], [50, 70], [60, 62], [44, 78], [56, 78]].forEach(([x, y]) => d.line(arcB(x, y, 3, 2.4, 1, .3, 2.84, 5), { w: 1.3, color: C.dk })); }
    if (s.pat === 'whitehead') d.fill(blob(50, 35, 21, 17, .85, 14), CR);
    if (s.pat === 'barred') [58, 64, 70, 76].forEach(y => d.line([[41, y], [50, y + 1.5], [59, y]], { w: 1.4, color: C.dk }));
    if (s.pat === 'hearts') [[39, 62, 4, '#ff5a4d'], [60, 67, 3.6, '#ffd84a'], [49, 77, 3.2, '#ff8fbf']].forEach(([x, y, r, c]) => F(d, heart(x, y, r), c, 1.3));
    if (v === 'gull') { wc = C.dk; }
    let wL = [[28, 47], [19, 61], [25, 75]], wR = MIR(wL);
    if (pose === 'wave') wR = [[72, 46], [84, 37], [88, 26]];
    if (pose === 'cheer') { wR = [[72, 46], [84, 37], [88, 26]]; wL = MIR(wR); }
    const hasW = !['kiwi', 'humming', 'peacock'].includes(v);
    if (hasW) { d.stroke(wL, wc, 7); d.stroke(wR, wc, 7); if (v === 'goldfinch') { d.stroke(wL.slice(0, 2), '#ffd84a', 3.4); d.stroke(wR.slice(0, 2), '#ffd84a', 3.4); } if (v === 'hoopoe') [wL, wR].forEach(w => [.3, .6].forEach(t => { const x = w[0][0] + (w[2][0] - w[0][0]) * t, y = w[0][1] + (w[2][1] - w[0][1]) * t; d.stroke([[x - 3, y], [x + 3, y]], CR, 2); })); }
    d.line(body, { w: 2.6, close: true });
    if (hasW) { d.line(wL, { w: 2.3 }); d.line(wR, { w: 2.3 }); }
    if (v === 'owl') { d.line([[31, 27], [27, 13], [40, 22]], { w: 2 }); d.line(MIR([[31, 27], [27, 13], [40, 22]]), { w: 2 }); }
    const fc = R ? '#ffd84a' : v === 'penguin' ? '#ffb8c8' : s.lc || '#ff9a4d';
    if (v === 'kiwi') [[42, 86], [60, 86]].forEach(([x, y]) => { d.line([[x, y], [x - 1, y + 9]], { w: 3, color: '#c9a06a', taper: false }); toes(d, [x, y], [x - 1, y + 9], INK); });
    else if (v !== 'humming' && v !== 'owl') [[[35, 93], [41, 85], [47, 93]], [[53, 93], [59, 85], [65, 93]]].forEach(p => F(d, p, fc, 2));
    else [[43, 88], [57, 88]].forEach(([x, y]) => d.line([[x - 2.5, y], [x, y + 3], [x + 2.5, y]], { w: 2, color: '#c99a2a' }));
    if (v === 'owl') { iris(d, o, [[40, 41], [60, 41]], 7, '#ffd84a'); }
    else eyes(d, o, [[50 - ex, ey], [50 + ex, ey]], er);
    if (R && !shut(o)) { d.line([[36, 30.5], [45, 32.5]], { w: 2.2 }); d.line([[64, 30.5], [55, 32.5]], { w: 2.2 }); }
    if (v === 'hornbill') { F(d, [[43, 40], [44, 33.5], [50, 31], [56, 33.5], [57, 40]], '#ffe89a', 1.8); F(d, [[43, 40], [57, 40], [58, 47], [52, 60], [50, 62], [48, 60], [42, 47]], '#ffd84a', 2); }
    else if (v === 'rooster') { W(d, [[42, 19], [44, 8], [48, 14], [51, 5], [54, 13], [58, 8], [59, 19]], '#ff4a3d', 1.8); F(d, BEAK.short, '#ffd84a', 2); F(d, [[47, 50], [53, 50], [52.5, 57], [50, 59], [47.5, 57]], '#ff4a3d', 1.6); }
    else { const bk = BEAK[s.beak || (R ? 'hook' : v === 'owl' ? 'owl' : v === 'duck' ? 'duck' : 'short')] || BEAK.short, dy = by; F(d, bk.map(([x, y]) => [x, y + dy]), s.bc || (v === 'gull' ? '#ffd84a' : R ? '#ffd84a' : '#ff9a4d'), 2); if (v === 'gull') d.dot(52.5, 48.5, 1.5, '#ff4a3d'); if (v === 'pigeon') d.fill(E(50, 42.5, 3, 1.8, 8), CR); }
    if (v === 'peacock') [[50, 15, 50, 5], [45, 16, 41, 7], [55, 16, 59, 7]].forEach(([a, b, c, e]) => { d.line([[a, b], [c, e]], { w: 1.6 }); d.dot(c, e, 2, C.f); });
    if (v === 'humming') d.fill(blob(50, 52, 9, 5.5, .85, 10), '#ff5fa8');
    cheek(d, [[50 - ex - 7, ey + 8], [50 + ex + 7, ey + 8]], 2.8);
    X.acc(d, s, C, { x: 50, y: (v === 'owl' ? 22 : v === 'kiwi' ? 38 : 16), w: 17, cy: 30, ny: 49, nw: 21, hx: 78, hy: 58 });
    DK.extras(d, o);
  };

  A.wader = (d, o, s, C) => {
    const v = s.v || '', FL = v === 'swan' || v === 'float', PE = v === 'pelican', FM = v === 'flamingo';
    const hx = PE ? 37 : 35, hy = FL ? (v === 'swan' ? 25 : 33) : PE ? 30 : 21, hr = PE ? 11.5 : 10;
    if (FL) { d.line([[14, 83], [24, 80], [34, 83], [44, 80], [54, 83], [64, 80], [74, 83], [84, 80], [92, 83]], { w: 2, color: '#6fa8ff' }); d.line([[30, 90], [40, 88], [50, 90], [60, 88], [70, 90]], { w: 1.6, color: '#6fa8ff' }); }
    else { const lc = s.lc || '#ff9a4d', L2 = FM ? [[[53, 71], [52, 84], [53, 96]], [[58, 71], [66, 79], [57, 82]]] : [[[51, 70], [49, 83], [51, 95]], [[59, 70], [61, 83], [59, 95]]]; L2.forEach(l => d.line(l, { w: 2.3, color: lc, taper: false })); (FM ? [[53, 96]] : [[51, 95], [59, 95]]).forEach(([x, y]) => d.line([[x - 4.5, y + .5], [x, y - .5], [x + 4.5, y + .5]], { w: 2, color: lc, taper: false })); }
    const body = FL ? [[24, 72], [28, 60], [42, 54], [62, 54], [80, 47], [88, 50], [85, 63], [74, 74], [54, 78], [34, 78]] : [[31, 62], [37, 52], [53, 48], [70, 50], [87, 42], [84, 55], [75, 66], [58, 72], [42, 71]];
    const nc = v === 'swan' ? [[42, 58], [33, 50], [29, 41], [32, 33], [hx + 1, hy + 7]] : PE ? [[46, 54], [41, 45], [hx + 2, hy + 9]] : v === 'float' ? [[46, 58], [40, 49], [hx + 2, hy + 8]] : FM ? [[42, 54], [33, 46], [35, 36], [41, 30], [hx + 2, hy + 8]] : [[42, 54], [36, 45], [37, 36], [hx + 2, hy + 8]];
    const nw = PE ? [13, 11] : v === 'swan' ? [9, 7.5] : v === 'float' ? [10, 8.5] : [8, 6.5];
    const nk = tube(crs(nc, 3), nw[0], nw[1]);
    if (!FL) W(d, [[82, 45], [94, 42], [89, 51]], C.dk, 1.9);
    d.wash(body, C.f); d.wash(nk.P, C.f);
    const head = blob(hx, hy, hr, hr * .92, .85, 14); d.wash(head, C.f);
    const wg = FL ? [[44, 60], [60, 56], [78, 54], [74, 66], [56, 70]] : [[44, 57], [60, 53], [80, 50], [74, 62], [58, 66]];
    d.fill(wg, C.dk);
    d.line(body.slice(2).concat(body.slice(0, 2)), { w: 2.5 });
    d.line(wg, { w: 1.8, close: true });
    const n = nk.L.length; d.line(nk.L.slice(1, n - 1), { w: 2.3 }); d.line(nk.R.slice(1, n - 1), { w: 2.3 });
    d.line(head, { w: 2.4, close: true });
    if (s.crest) { d.line([[hx + 7, hy - 5], [hx + 16, hy - 4], [hx + 22, hy]], { w: 1.8 }); d.line([[hx + 7, hy - 3], [hx + 14, hy], [hx + 19, hy + 4]], { w: 1.5 }); }
    const bc = s.bc || '#ff9a4d', B = { long: [[hx - 8, hy], [hx - 28, hy + 4.5], [hx - 8, hy + 5]], swan: [[hx - 8, hy + .5], [hx - 18, hy + 4], [hx - 8, hy + 6]], hook: [[hx - 8, hy], [hx - 21, hy + 1.5], [hx - 23.5, hy + 5.5], [hx - 20, hy + 4.2], [hx - 8, hy + 5]], flamingo: [[hx - 7, hy - 1.5], [hx - 15, hy + .5], [hx - 19.5, hy + 8], [hx - 16.5, hy + 12.5], [hx - 12.5, hy + 6.5], [hx - 6.5, hy + 5]] };
    if (s.beak === 'pouch') { F(d, [[hx - 9, hy + 4.5], [hx - 31, hy + 5.5], [hx - 23, hy + 14], [hx - 11, hy + 11]], '#ffc46b', 2); F(d, [[hx - 9, hy + .5], [hx - 32, hy + 2.5], [hx - 32, hy + 5.5], [hx - 9, hy + 4.5]], bc, 2); }
    else { F(d, B[s.beak] || B.long, bc, 2); if (s.beak === 'flamingo') d.fill([[hx - 19.5, hy + 8], [hx - 16.5, hy + 12.5], [hx - 14.6, hy + 9]], '#2c2750'); if (s.beak === 'swan') d.fill(E(hx - 8.8, hy + 2, 2.4, 2.8, 8), '#2c2750'); }
    eyes(d, o, [[hx - 3.9, hy - 1.5], [hx + 4.3, hy - 1.5]], 3.3);
    cheek(d, [[hx + 7.5, hy + 4]], 2.2);
    X.acc(d, s, C, { x: hx + 1, y: hy - hr, w: hr, cy: hy, ny: hy + hr, nw: 5 });
    DK.extras(d, o);
  };

  const FSH = {
    long: { b: [[13, 52], [24, 40], [46, 33], [68, 35], [84, 44], [89, 52], [83, 60], [64, 67], [42, 68], [22, 62]], e: [73, 46.5, 6.4], t: [[16, 52], [4, 37], [9, 52], [4, 67]], fT: [[44, 35], [51, 23], [59, 35]], fB: [[47, 67], [53, 77], [60, 66]], m: [[80, 57], [84, 59], [88, 56.5]], g: [[64, 40], [60, 52], [64, 63]] },
    tall: { b: [[14, 52], [24, 34], [42, 24], [62, 24], [78, 33], [88, 50], [80, 65], [62, 76], [42, 78], [24, 68]], e: [70, 42, 6.6], t: [[17, 52], [4, 36], [9, 52], [4, 68]], fT: [[40, 26], [50, 10], [64, 26]], fB: [[42, 76], [50, 90], [62, 74]], m: [[80, 56], [84, 58.5], [88, 55]], g: [[60, 30], [56, 50], [60, 70]] },
    carp: { b: [[12, 54], [22, 40], [42, 31], [64, 31], [80, 38], [90, 50], [84, 62], [64, 70], [42, 71], [22, 65]], e: [74, 45, 6], t: [[15, 54], [2, 38], [8, 54], [2, 70]], fT: [[36, 33], [46, 21], [64, 31]], fB: [[46, 70], [52, 80], [60, 69]], m: [[82, 58], [86, 60], [90, 57]], g: [[62, 36], [58, 51], [62, 66]] },
    shark: { b: [[6, 52], [18, 42], [42, 36], [68, 36], [86, 42], [94, 52], [88, 62], [68, 66], [40, 66], [16, 60]], e: [80, 46, 4.4], t: [[10, 52], [0, 32], [4, 52], [0, 71]], fT: [[44, 36], [52, 22], [60, 36]], fB: [[58, 65], [54, 76], [66, 66]], m: [[80, 58], [87, 60], [94, 55.5]] },
    puffer: { b: blob(54, 52, 32, 29, .95, 18), e: [70, 44, 7], t: [[24, 52], [8, 42], [12, 52], [8, 62]], fT: [[50, 24], [56, 16], [62, 24]] },
    gold: { b: blob(60, 48, 25, 20, .9, 16), e: [72, 42, 6.6], t: [[38, 48], [16, 28], [5, 42], [12, 54], [4, 70], [20, 68], [38, 56]], fT: [[48, 30], [57, 19], [66, 29]], fB: [[58, 67], [60, 76], [68, 66]], m: [[82, 52], [85.5, 53.5], [85, 50]] },
    betta: { b: [[26, 50], [36, 40], [56, 36], [74, 40], [85, 48], [77, 58], [56, 62], [36, 60]], e: [72, 45, 5.6], t: [[30, 50], [10, 24], [2, 46], [8, 60], [3, 78], [12, 82]], fT: [[40, 40], [44, 16], [64, 18], [68, 38]], fB: [[42, 60], [40, 88], [60, 80], [64, 60]], m: [[80, 53], [83, 54.5], [86, 52]] },
    mud: { b: [[14, 72], [26, 64], [50, 60], [70, 55], [80, 47], [90, 50], [90, 62], [74, 72], [48, 77], [22, 78]], t: [[17, 73], [5, 64], [8, 74], [5, 83]], fT: [[36, 62], [44, 52], [54, 60]], m: [[86, 60], [89, 62], [92, 59]] },
  };
  A.fish = (d, o, s, C) => {
    const v = s.v || 'long', S = FSH[v];
    if (s.acc === 'bag') { const bag = [[50, 12], [30, 22], [20, 50], [24, 80], [50, 92], [76, 80], [80, 50], [70, 22]]; d.wash(bag, '#e6f4ff', { al: .5 }); d.line(bag, { w: 1.8, close: true }); d.line([[46, 12], [50, 6], [54, 12]], { w: 1.8 }); d.line([[24, 58], [36, 56], [50, 58], [64, 56], [78, 58]], { w: 1.4, color: '#6fa8ff' }); }
    const fT = s.fins === 'spiky' ? [[34, 29], [38, 11], [43, 26], [48, 8], [53, 24], [58, 9], [62, 25], [67, 13], [70, 30]] : S.fT;
    d.wash(S.t, C.f); if (fT) d.wash(fT, C.dk); if (S.fB) d.wash(S.fB, C.f);
    if (v === 'mud') [[80, 45, 5.5], [88, 47, 5]].forEach(([x, y, r]) => d.wash(E(x, y, r, r, 10), C.f));
    d.wash(S.b, C.f);
    if (v === 'long' || v === 'carp' || v === 'shark') d.fill(v === 'shark' ? [[18, 58], [40, 63], [68, 63], [86, 58], [66, 60], [40, 60]] : [[26, 60], [44, 64.5], [64, 63.5], [79, 57], [62, 58], [42, 58.5]], C.bl);
    const P = s.pat;
    if (P === 'scales') for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) d.line(arcB(30 + i * 9 + (r % 2) * 4.5, 42 + r * 8, 3.8, 3.4, 1, -1.2, 1.2, 5), { w: 1.4, color: C.dk });
    if (P === 'bands') [[[62, 25], [68, 27.5], [67, 73], [61, 76.5]], [[43, 23.5], [51, 23.5], [51, 78.5], [43, 78.5]], [[24, 36], [29, 31], [29, 72], [24, 67]]].forEach(p => { d.fill(p, CR); d.line([p[0], p[3]], { w: 1.8 }); d.line([p[1], p[2]], { w: 1.8 }); });
    if (P === 'dots') [[40, 40], [52, 36], [46, 52], [58, 58], [34, 58], [64, 46], [30, 46]].forEach(([x, y]) => d.dot(x, y, 1.7, C.dk, .9));
    if (P === 'wspots') for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) d.dot(22 + i * 10 + (j % 2) * 5, 44 + j * 6, 1.4, CR);
    if (P === 'humu') { d.fill([[44, 24], [54, 24], [42, 78], [32, 74]], C.dk); d.line([[74, 50], [86, 47]], { w: 1.8, color: '#4f86ff' }); d.line([[72, 56], [84, 56]], { w: 1.8, color: '#4f86ff' }); d.fill([[62, 30], [70, 34], [66, 40]], '#ff5a4d'); }
    if (P === 'bars') [30, 40, 50, 60].forEach(x => d.stroke([[x, 38], [x - 2, 60]], C.dk, 3.2));
    if (P === 'bluedots') [[30, 70], [42, 66], [56, 64], [66, 60], [36, 74], [50, 71]].forEach(([x, y]) => d.dot(x, y, 1.3, '#4f86ff'));
    d.line(S.t, { w: 2.3, close: true }); if (fT) d.line(fT, { w: 2.1 }); if (S.fB) d.line(S.fB, { w: 2.1 });
    d.line(S.b, { w: 2.6, close: true });
    if (v === 'betta' || v === 'gold') [[[26, 50], [10, 34]], [[26, 52], [6, 54]], [[26, 54], [10, 72]]].forEach(l => d.line(l, { w: 1.3, color: C.dk }));
    if (S.g) d.line(S.g, { w: 2 });
    if (v === 'shark') [[70, 45], [73, 45], [76, 46]].forEach(([x, y]) => d.line([[x, y], [x - 1, y + 9]], { w: 1.5 }));
    if (v === 'puffer') for (let i = 0; i < 14; i++) { const a = i / 14 * 6.2832, x = 54 + Math.cos(a) * 32, y = 52 + Math.sin(a) * 29; if (x > 26) d.line([[x, y], [x + Math.cos(a) * 4, y + Math.sin(a) * 4]], { w: 1.8 }); }
    if (v === 'mud') { [[80, 45, 5.5], [88, 47, 5]].forEach(([x, y, r]) => d.line(arcB(x, y, r, r, 1, 2.6, 6.8, 10), { w: 2 })); eyes(d, o, [[80, 44.5], [88, 46.5]], 3.8); W(d, [[62, 73], [58, 83], [69, 80]], C.f, 1.9); d.line([[2, 86], [30, 83], [60, 85], [98, 83]], { w: 2.4, color: '#8f6a4d' }); }
    else eyes(d, o, [[S.e[0], S.e[1]]], S.e[2]);
    if (v === 'puffer') F(d, E(86.5, 55, 2.6, 3, 8), '#ff8fae', 1.6);
    else if (S.m) d.line(S.m, { w: 1.9 });
    if (s.teeth) [[84, 57.5], [86.5, 58.5]].forEach(([x, y]) => d.fill([[x - 1, y], [x + 1, y], [x, y + 2.4]], CR));
    if (v === 'carp') { d.line([[88, 58], [94, 64], [96, 70]], { w: 1.5 }); d.line([[86, 60], [89, 67]], { w: 1.4 }); }
    const ce = S.e || [84, 50]; d.dot(ce[0] + 2, ce[1] + 10, 2.6, '#ff7fa8', .5);
    if (s.acc === 'lantern') { d.line([[90, 55], [94, 42], [92, 30]], { w: 1.2 }); F(d, blob(91, 22, 5.5, 7, .7, 12), '#ff4a3d', 1.8); d.line([[86, 16.5], [96, 16.5]], { w: 2, color: '#ffd84a' }); d.line([[86, 27.5], [96, 27.5]], { w: 2, color: '#ffd84a' }); d.line([[91, 29], [91, 34]], { w: 1.4, color: '#ffd84a' }); }
    DK.extras(d, o);
  };

  A.lizard = (d, o, s, C) => {
    const v = s.v || '', CRC = v === 'croc', DR = v === 'dragon', SM = v === 'smok', KO = v === 'komodo', SL = v === 'slim', pose = o.pose || 'idle';
    let body = [[44, 41], [40, 53], [40, 67], [45, 77], [55, 77], [60, 67], [60, 53], [56, 41]], head = [[29, 29], [34, 19], [50, 13.5], [66, 19], [71, 29], [65, 38.5], [50, 42.5], [35, 38.5]];
    let tail = [[52, 76], [56, 87], [66, 93.5], [79, 91], [87, 81], [84, 70], [76, 67.5], [71, 73], [75, 79]], tw = 9;
    if (CRC || KO) { body = [[42, 42], [37, 55], [37, 68], [43, 79], [57, 79], [63, 68], [63, 55], [58, 42]]; tail = [[54, 77], [60, 88], [72, 93], [85, 88], [92, 76], [93, 64]]; tw = 12; }
    if (CRC) head = [[26, 27], [32, 16], [50, 12.5], [68, 16], [74, 27], [73, 38], [64, 45], [50, 47], [36, 45], [27, 38]];
    if (KO) head = [[28, 29], [33, 18], [50, 14], [67, 18], [72, 29], [68, 40], [50, 45], [32, 40]];
    if (SL) { body = [[45, 42], [42, 54], [42, 67], [46, 76], [54, 76], [58, 67], [58, 54], [55, 42]]; tail = [[52, 75], [55, 86], [64, 93], [77, 93], [87, 86], [91, 74], [87, 62]]; tw = 7; }
    if (DR) tail = [[53, 75], [58, 86], [70, 92], [82, 87], [87, 75], [82, 63], [87, 52], [94, 49]];
    if (SM) { const wg = [[44, 50], [27, 35], [12, 36], [17, 44], [9, 50], [20, 53], [17, 61], [41, 58]]; [wg, MIR(wg)].forEach(p => W(d, p, C.dk, 2.1)); }
    if (DR) { [[[40, 17], [35, 7], [30, 3]], [[37, 10], [42, 4]]].forEach(l => [l, MIR(l)].forEach(p => { d.stroke(p, '#ffd84a', 3.4); d.line(p, { w: 1.9 }); })); W(d, fluff(94, 49, 5, 4, 5, .4), C.dk, 1.8); }
    if (CRC) [[38, 17], [62, 17]].forEach(([x, y]) => d.wash(E(x, y, 8.5, 7.5, 12), C.f));
    d.wash(body, C.f); d.wash(head, C.f); d.stroke(tail, C.f, tw);
    if (DR || SM) [[44, 15], [50, 12], [56, 15]].forEach(([x, y]) => W(d, [[x - 2.5, y + 2], [x, y - 5], [x + 2.5, y + 2]], C.dk, 1.6));
    if (s.pat === 'mosaic') [[40, 24, '#ffd84a'], [50, 20, '#ff9a4d'], [60, 24, '#54d6a4'], [45, 33, '#ff8fbf'], [56, 33, '#ffd84a'], [46, 50, '#54d6a4'], [54, 50, '#ffd84a'], [50, 58, '#ff9a4d'], [45, 66, '#ff8fbf'], [55, 66, '#54d6a4'], [50, 73, '#ffd84a'], [62, 90, '#ff9a4d'], [76, 91, '#54d6a4'], [85, 80, '#ff8fbf']].forEach(([x, y, c], i) => F(d, E(x, y, 3.2, 2.5, 6, i), c, 1.2));
    else if (s.pat === 'dots') [[44, 52], [56, 56], [46, 64], [54, 70], [62, 88], [76, 90], [42, 24], [58, 24]].forEach(([x, y]) => d.dot(x, y, 1.5, CR));
    else if (!CRC && !KO) [[[44, 55], [50, 57], [56, 55]], [[43, 63], [50, 65.5], [57, 63]], [[45, 71], [50, 73], [55, 71]]].forEach(b => d.stroke(b, C.dk, 2.6));
    if (CRC) [[[43, 52], [57, 52]], [[42, 60], [58, 60]], [[43, 68], [57, 68]], [[70, 90], [72, 85]], [[82, 87], [80, 82]]].forEach(l => d.stroke(l, C.dk, 2.4));
    if (SM) [[45, 54], [44, 61], [45, 68]].forEach(([x, y]) => d.line([[x, y], [100 - x, y]], { w: 1.4 }));
    d.line(head, { w: 2.7, close: true });
    const bb = body[3][1] + .5; d.line(body.slice(0, 4).concat([[50, bb]]), { w: 2.5 }); d.line([[50, bb]].concat(body.slice(4)), { w: 2.5 });
    d.line(tail, { w: 2.5, taper: true });
    if (CRC) [[38, 17], [62, 17]].forEach(([x, y]) => d.line(arcB(x, y, 8.5, 7.5, 1, 3.3, 6.12, 10), { w: 2.3 }));
    const big = CRC || KO;
    let armL = big ? [[41, 50], [32, 53], [27, 49]] : [[43, 49], [33, 50], [25, 43]], armR = MIR(armL);
    if (pose === 'wave' || DR) armR = [[57, 49], [69, 43], [74, 32]];
    if (pose === 'cheer') { armR = [[57, 48], [68, 40], [72, 28]]; armL = MIR(armR); }
    const legL = big ? [[41, 71], [32, 76], [29, 84]] : [[43, 70], [33, 74], [27, 84]], legR = MIR(legL);
    [armL, armR, legL, legR].forEach(l => { d.line(l, { w: 2.5, taper: false }); toes(d, l[l.length - 2], l[l.length - 1], INK); });
    if (CRC) eyes(d, o, [[38, 17], [62, 17]], 5.6);
    else if (DR || SM || KO) eyes(d, o, [[35.5, 25], [64.5, 25]], KO ? 5.4 : 6.4);
    else [[31, 24], [69, 24]].forEach(([x, y]) => { if (shut(o)) { d.line([[x - 5, y + 1], [x, y + 3.6], [x + 5, y + 1]], { w: 2.4 }); return; } const r = SL ? 6.6 : 7.4; d.fill(E(x, y, r, r, 14), o.eye); d.line(E(x, y, r, r, 14), { w: 2.3, close: true }); d.fill(E(x, y + .5, 1.9, r * .62, 10), o.pupil); d.dot(x - 1.6, y - 2, 1.2, o.eye); });
    if (CRC) { [[45, 33], [55, 33]].forEach(([x, y]) => d.dot(x, y, 1.3, INK)); d.line([[30, 38], [40, 42.5], [50, 43.5], [60, 42.5], [70, 38]], { w: 2.2 }); [[36, 40.3], [44, 42.6], [56, 42.6], [64, 40.3]].forEach(([x, y]) => d.fill([[x - 1.6, y], [x + 1.6, y], [x, y + 2.8]], CR)); }
    else { d.dot(46.5, 20.5, .9, INK); d.dot(53.5, 20.5, .9, INK); d.line([[40, 33], [50, 37], [60, 33]], { w: 2.1 }); }
    if (KO) F(d, [[48.5, 38.5], [51.5, 38.5], [51.5, 45], [54, 49], [50, 46.5], [46, 49], [48.5, 45]], '#ff5a6e', 1.3);
    if (DR) { d.line([[36, 35], [24, 37], [14, 33], [8, 37]], { w: 1.7 }); d.line(MIR([[36, 35], [24, 37], [14, 33], [8, 37]]), { w: 1.7 }); F(d, E(77, 27, 5.5, 5.5, 12), '#e6f2ff', 1.9); d.dot(75.5, 25.2, 1.4, CR); }
    if (SM) { [[38, 18], [62, 18]].forEach(([x, y], i) => W(d, i ? MIR([[38, 18], [34, 8], [42, 15]]) : [[38, 18], [34, 8], [42, 15]], '#fff1d6', 1.7)); W(d, fluff(80, 14, 5, 4, 5, .3), '#ece8f4', 1.6); W(d, fluff(88, 7, 3, 2.6, 4, .3), '#ece8f4', 1.4); }
    if (s.acc === 'collar') { F(d, [[37, 41], [50, 47], [63, 41], [64, 46], [50, 53], [36, 46]], '#ffd84a', 1.9); d.line([[37, 44], [50, 50], [63, 44]], { w: 1.4, color: '#3d6fe0' }); }
    cheek(d, [[36, 35], [64, 35]], 3.2);
    DK.extras(d, o);
  };

  A.frog = (d, o, s, C) => {
    const T = s.v === 'tree', bl = [[22, 71], [12, 74], [9, 81], [17, 88], [30, 87]];
    [bl, MIR(bl)].forEach(p => d.wash(p, C.f));
    const sil = [[18, 64], [20, 48], [23, 36], [28, 28], [36, 26.5], [43, 30.5], [50, 32.5], [57, 30.5], [64, 26.5], [72, 28], [77, 36], [80, 48], [82, 64], [76, 79], [62, 86], [38, 86], [24, 79]];
    d.wash(sil, C.f); d.fill(E(50, 72, 17, 11.5, 12), C.bl);
    if (s.pat === 'spots') [[30, 50], [70, 50], [40, 44], [60, 44], [26, 64], [74, 64], [50, 40]].forEach(([x, y]) => d.dot(x, y, 2, C.dk, .8));
    if (T && s.red) [[20, 60], [80, 60]].forEach(([x, y]) => d.stroke([[x, y - 6], [x, y + 8]], '#4f86ff', 3));
    d.line(sil, { w: 2.6, close: true });
    [bl, MIR(bl)].forEach(p => d.line(p, { w: 2.3 }));
    [[[36, 77], [32, 89]], [[64, 77], [68, 89]]].forEach(l => { d.line(l, { w: 2.3, taper: false }); if (T) [-3, 0, 3].forEach(k => d.dot(l[1][0] + k, l[1][1] + 1.5, 1.9, s.red ? '#ff9a4d' : C.bl)); else toes(d, l[0], l[1], INK); });
    [[13, 89], [87, 89]].forEach(([x, y]) => T ? [-3, 0, 3].forEach(k => d.dot(x + k, y, 1.9, s.red ? '#ff9a4d' : C.bl)) : toes(d, [x + (x < 50 ? 4 : -4), y - 5], [x, y], INK));
    if (s.red) iris(d, o, [[33, 36], [67, 36]], 7, '#ff4a3d'); else eyes(d, o, [[33, 36], [67, 36]], 7);
    d.line([[30, 55], [40, 59.5], [50, 60.5], [60, 59.5], [70, 55]], { w: 2.2 });
    cheek(d, [[26, 58], [74, 58]], 3.4);
    DK.extras(d, o);
  };

  A.turtle = (d, o, s, C) => {
    const SEA = s.v === 'sea', fl = SEA ? [[26, 60], [10, 52], [3, 57], [11, 66], [26, 68]] : [[24, 70], [15, 70], [13, 78], [20, 81], [27, 78]], bl = SEA ? [[30, 80], [20, 88], [30, 92], [36, 84]] : [[30, 82], [26, 91], [34, 92], [37, 84]];
    [fl, MIR(fl), bl, MIR(bl)].forEach(p => d.wash(p, C.f));
    d.wash(blob(50, 31, 14.5, 12.5, .85, 14), C.f);
    const shell = [[15, 76], [19, 60], [31, 47], [50, 42.5], [69, 47], [81, 60], [85, 76], [72, 82.5], [50, 84.5], [28, 82.5]];
    d.wash(shell, C.dk);
    const hx6 = [[42, 56], [50, 51], [58, 56], [58, 66], [50, 71], [42, 66]]; d.fill(hx6, C.f);
    d.line(shell, { w: 2.6, close: true }); d.line(hx6, { w: 1.8, close: true });
    [[[42, 56], [30, 51]], [[58, 56], [70, 51]], [[42, 66], [24, 70]], [[58, 66], [76, 70]], [[50, 51], [50, 43.5]], [[50, 71], [50, 79.5]]].forEach(l => d.line(l, { w: 1.6 }));
    d.line([[16, 76], [50, 80.5], [84, 76]], { w: 1.8 });
    [fl, MIR(fl), bl, MIR(bl)].forEach(p => d.line(p, { w: 2.2 }));
    d.line(arcB(50, 31, 14.5, 12.5, .85, 2.3, 7.12, 16), { w: 2.5 });
    eyes(d, o, [[44, 30], [56, 30]], 4.4); smile(d, 50, 35.5, 4, 2); cheek(d, [[38.5, 35.5], [61.5, 35.5]], 2.6);
    if (s.acc === 'sword') { F(d, [[86.5, 24], [89.5, 24], [89.5, 64], [88, 69], [86.5, 64]], '#e2e8f4', 1.8); d.stroke([[82.5, 24], [93.5, 24]], '#ffd84a', 3.4); d.line([[82.5, 24], [93.5, 24]], { w: 1.8 }); d.stroke([[88, 24], [88, 15]], '#b86a3f', 3.6); d.line([[88, 24], [88, 15]], { w: 1.8 }); d.dot(88, 13.5, 2.2, '#ffd84a'); }
    DK.extras(d, o);
  };

  A.snake = (d, o, s, C) => {
    const NA = s.v === 'naga', c1 = blob(50, 84, 31, 9.5, .85, 16), c2 = blob(52, 73, 25, 8.5, .85, 16);
    d.wash(c1, C.f); d.wash(c2, C.f);
    const nk = tube(crs([[62, 71], [68, 60], [63, 50], [55, 44]], 3), 12, 11); d.wash(nk.P, C.f);
    if (NA) { W(d, [[28, 46], [23, 30], [31, 17], [50, 11], [69, 17], [77, 30], [72, 46], [50, 50]], C.dk, 2.3); [[28, 31], [72, 31]].forEach(([x, y]) => { W(d, blob(x, y, 8, 7, .85, 12), C.f, 2.2); dotEyes(d, o, [[x - 2.8, y - .5], [x + 2.8, y - .5]], 1.6); }); }
    d.wash(blob(50, 34, 15, 12, .85, 14), C.f);
    [[26, 84], [38, 88], [52, 89], [66, 88], [76, 83], [34, 73], [46, 77], [58, 77], [70, 72]].forEach(([x, y]) => d.stroke([[x, y - 3.5], [x + 1, y + 3.5]], C.dk, 3));
    d.line(arcB(50, 84, 31, 9.5, .85, -.35, 3.49, 16), { w: 2.4 }); d.line(c2, { w: 2.4, close: true });
    const n = nk.L.length; d.line(nk.L.slice(1, n - 1), { w: 2.3 }); d.line(nk.R.slice(1, n - 1), { w: 2.3 });
    d.line(blob(50, 34, 15, 12, .85, 14), { w: 2.5, close: true });
    eyes(d, o, [[44, 33], [56, 33]], 4.6); smile(d, 50, 38.5, 3.5, 1.8); cheek(d, [[38, 38], [62, 38]], 2.6);
    F(d, [[49, 41.5], [51, 41.5], [51, 46], [53.5, 49.5], [50, 47.5], [46.5, 49.5], [49, 46]], '#ff5a6e', 1.3);
    if (s.acc === 'crown') X.ACC.crown(d, { x: 50, y: 23, w: 15 });
    if (NA) d.dot(50, 26, 2, '#ff5fa8');
    DK.extras(d, o);
  };

  A.bug = (d, o, s, C) => {
    const v = s.v;
    if (v === 'ladybug') {
      [[26, 58], [24, 70], [28, 80]].forEach(([x, y]) => { d.line([[x + 4, y], [x - 4, y + 3]], { w: 2 }); d.line([[104 - x - 4, y], [104 - x + 4 - 8 + 8, y + 3]], { w: 2 }); });
      const b = blob(50, 62, 29, 25, .85, 16); d.wash(b, C.f); d.wash(blob(50, 36, 16, 12, .85, 14), C.dk);
      [[38, 56, 4.5], [62, 56, 4.5], [36, 72, 4], [64, 72, 4], [50, 81, 3.5]].forEach(([x, y, r]) => d.fill(E(x, y, r, r, 10), C.dk));
      d.line(b, { w: 2.6, close: true }); d.line([[50, 48], [50, 86]], { w: 2 }); d.line(blob(50, 36, 16, 12, .85, 14), { w: 2.3, close: true });
      [[[44, 26], [40, 15], [36, 13]], [[56, 26], [60, 15], [64, 13]]].forEach(l => { d.line(l, { w: 1.8 }); d.dot(l[2][0], l[2][1], 2, INK); });
      eyes(d, o, [[44, 35], [56, 35]], 4.4); smile(d, 50, 40.5, 3.2, 1.6, CR); cheek(d, [[39, 41], [61, 41]], 2.4);
      X.acc(d, s, C, {}); return DK.extras(d, o);
    }
    if (v === 'bee') {
      [[31, 36, -.5], [69, 36, .5]].forEach(([x, y, r]) => W(d, E(x, y, 12, 8, 12, r), '#eaf6ff', 1.9));
      const b = blob(50, 60, 24, 27, .85, 16); d.wash(b, C.f);
      d.fill(E(50, 68, 20, 4.2, 12), C.dk); d.fill(E(50, 79, 12, 3.6, 10), C.dk);
      d.line(b, { w: 2.6, close: true }); F(d, [[47, 86.5], [53, 86.5], [50, 93]], INK, 1.5);
      [[[44, 34], [40, 22], [35, 19]], [[56, 34], [60, 22], [65, 19]]].forEach(l => { d.line(l, { w: 1.8 }); d.dot(l[2][0], l[2][1], 2.2, INK); });
      [[36, 84], [64, 84]].forEach(([x, y]) => d.line([[x, y], [x + (x < 50 ? -4 : 4), y + 5]], { w: 2 }));
      eyes(d, o, [[42, 49], [58, 49]], 5); smile(d, 50, 55.5, 4, 2); cheek(d, [[35, 57], [65, 57]], 3);
      return DK.extras(d, o);
    }
    if (v === 'cicada') {
      const wl = [[42, 44], [26, 52], [19, 72], [25, 93], [36, 91], [45, 70]]; [wl, MIR(wl)].forEach(p => { W(d, p, '#e2f4ff', 2); d.line([[40, 50], [30, 70], [30, 88]], { w: 1.1 }); });
      d.line(MIR([[40, 50], [30, 70], [30, 88]]), { w: 1.1 });
      const b = blob(50, 64, 13, 23, .9, 14), h = blob(50, 36, 21, 12, .8, 16); d.wash(b, C.f); d.wash(h, C.f);
      [70, 77, 84].forEach(y => d.line([[44, y], [50, y + 1.5], [56, y]], { w: 1.4, color: C.dk }));
      d.line(b, { w: 2.4, close: true }); d.line(h, { w: 2.6, close: true });
      eyes(d, o, [[35, 33], [65, 33]], 5.6); smile(d, 50, 40, 4, 2); cheek(d, [[42, 42], [58, 42]], 2.4);
      return DK.extras(d, o);
    }
    if (v === 'hopper') {
      const lc = '#ff5a3d', hl = [[36, 64], [18, 46], [13, 62], [11, 90]];
      [hl, MIR(hl)].forEach(p => { d.stroke(p, C.f, 6); d.line(p, { w: 2.2 }); });
      const b = blob(50, 66, 17, 22, .9, 14), h = blob(50, 37, 19, 16, .85, 16); d.wash(b, C.f); d.wash(h, C.f); d.fill(E(50, 70, 9, 13, 10), C.bl);
      [62, 70, 78].forEach(y => d.line([[42, y], [50, y + 1.5], [58, y]], { w: 1.3, color: C.dk }));
      d.line(b, { w: 2.4, close: true }); d.line(h, { w: 2.6, close: true });
      [[[44, 23], [38, 8], [30, 3]], [[56, 23], [62, 8], [70, 3]]].forEach(l => d.line(l, { w: 1.7 }));
      [[[40, 60], [32, 70]], [[60, 60], [68, 70]]].forEach(l => d.line(l, { w: 2, color: lc }));
      eyes(d, o, [[41, 35], [59, 35]], 5.6); smile(d, 50, 44, 4, 2); cheek(d, [[34, 43], [66, 43]], 2.8);
      return DK.extras(d, o);
    }
    if (v === 'dragonfly') {
      [[27, 42, 20, 6.5, -.22], [73, 42, 20, 6.5, .22], [28, 55, 18, 6, .14], [72, 55, 18, 6, -.14]].forEach(([x, y, a, b, r]) => { W(d, E(x, y, a, b, 14, r), '#dff6ff', 1.9); d.line([[x - a * .8, y - Math.sin(r) * a * .8], [x + a * .8, y + Math.sin(r) * a * .8]], { w: 1 }); });
      const tb = tube([[50, 50], [50, 70], [50, 94]], 8, 5); d.wash(tb.P, C.f); d.wash(blob(50, 49, 9, 8, .85, 12), C.f);
      d.line(tb.L, { w: 2.2 }); d.line(tb.R, { w: 2.2 }); [62, 70, 78, 86].forEach(y => d.line([[46.5, y], [53.5, y]], { w: 1.4 }));
      d.line(blob(50, 49, 9, 8, .85, 12), { w: 2.2, close: true });
      const h = blob(50, 32, 17, 12, .85, 14); d.wash(h, C.f); d.line(h, { w: 2.5, close: true });
      eyes(d, o, [[40, 30], [60, 30]], 6.6); smile(d, 50, 36, 3.5, 1.8); cheek(d, [[36, 38], [64, 38]], 2.4);
      return DK.extras(d, o);
    }
    if (v === 'scarab') {
      [[30, 62], [28, 74], [32, 84]].forEach(([x, y]) => { d.line([[x + 3, y], [x - 5, y + 4]], { w: 2 }); d.line(MIR([[x + 3, y], [x - 5, y + 4]]), { w: 2 }); });
      [[[38, 44], [30, 34], [36, 26]], [[62, 44], [70, 34], [64, 26]]].forEach(l => d.line(l, { w: 2.1 }));
      F(d, E(50, 18, 12, 11, 14), '#ffb84d', 2.2); [[36, 12], [64, 12], [50, 4]].forEach(([x, y]) => d.line([[x, y], [x + (x - 50) * .2, y - 3]], { w: 1.8, color: '#ff9a2e' }));
      const b = blob(50, 65, 24, 22, .85, 16), h = blob(50, 41, 15, 9.5, .85, 14); d.wash(b, C.f); d.wash(h, C.dk);
      d.stroke([[38, 56], [36, 68]], '#9fd0ff', 3); d.line(b, { w: 2.6, close: true }); d.line([[50, 48], [50, 86]], { w: 2 }); d.line(h, { w: 2.3, close: true });
      eyes(d, o, [[44, 41], [56, 41]], 3.9); smile(d, 50, 45, 3, 1.4, CR); cheek(d, [[39, 46], [61, 46]], 2.2);
      return DK.extras(d, o);
    }
  };

  A.octo = (d, o, s, C) => {
    d.wash(blob(50, 43, 30, 27, .9, 18), C.bl);
    for (let i = 0; i < 8; i++) { const x = 31 + i * 5.4, m = i < 4 ? -1 : 1, p = [[x, 60], [x + m * 2, 74], [x + m * 5, 83], [x + m * 2.5, 88]]; d.stroke(p, C.f, 5.2); d.line(p, { w: 1.8 }); }
    const m = blob(50, 42, 25, 23, .9, 18); d.wash(m, C.f);
    [[[34, 28], [40, 25], [46, 28]], [[54, 28], [60, 25], [66, 28]], [[30, 38], [36, 36]], [[64, 36], [70, 38]], [[44, 22], [50, 20], [56, 22]]].forEach(l => d.stroke(l, C.dk, 2.6));
    d.line(blob(50, 43, 30, 27, .9, 18), { w: 1.6, close: true }); d.line(m, { w: 2.6, close: true });
    [[38, 48], [62, 48]].forEach(([x, y]) => { if (shut(o)) { d.line([[x - 4.5, y], [x, y + 3], [x + 4.5, y]], { w: 2.2 }); return; } F(d, E(x, y, 6, 6, 14), o.eye, 2.1); d.line([[x - 3.6, y - 1], [x - 1.8, y + 2], [x, y], [x + 1.8, y + 2], [x + 3.6, y - 1]], { w: 2 }); });
    smile(d, 50, 57, 4, 2); cheek(d, [[31, 54], [69, 54]], 3);
    X.acc(d, s, C, { x: 50, y: 20, w: 20 }); DK.extras(d, o);
  };

  A.crab = (d, o, s, C) => {
    const lg = [[[28, 66], [16, 72], [12, 82]], [[30, 72], [20, 80], [18, 90]], [[34, 76], [28, 86], [28, 94]]];
    lg.forEach(l => [l, MIR(l)].forEach(p => { d.stroke(p, C.f, 4.5); d.line(p, { w: 2 }); }));
    const arm = [[30, 58], [20, 50], [18, 43]], claw = [[10, 40], [12, 26], [22, 24], [26, 32], [20, 34], [24, 40], [16, 44]];
    [0, 1].forEach(mm => { const a = mm ? MIR(arm) : arm, c = mm ? MIR(claw) : claw; d.stroke(a, C.f, 5); d.line(a, { w: 2.1 }); W(d, c, C.f, 2.2); d.fill(fluff(mm ? 80 : 20, 46, 6, 4.5, 6, .3), C.dk); });
    [[[43, 50], [41, 39]], [[57, 50], [59, 39]]].forEach(l => d.line(l, { w: 2.2 }));
    const b = blob(50, 62, 27, 17, .8, 16); d.wash(b, C.f); d.fill(E(50, 67, 15, 8, 12), C.bl); d.line(b, { w: 2.6, close: true });
    eyes(d, o, [[41, 35], [59, 35]], 5); smile(d, 50, 62, 4.5, 2.2); cheek(d, [[36, 62], [64, 62]], 3);
    DK.extras(d, o);
  };

  A.seal = (d, o, s, C) => {
    const DG = s.v === 'dugong';
    if (DG) W(d, [[40, 86], [22, 96], [50, 92], [78, 96], [60, 86]], C.f, 2.2); else [[[40, 88], [28, 96], [44, 96]], [[60, 88], [72, 96], [56, 96]]].forEach(p => W(d, p, C.dk, 2));
    const body = [[50, 20], [34, 26], [27, 44], [26, 66], [31, 82], [42, 90], [58, 90], [69, 82], [74, 66], [73, 44], [66, 26]];
    d.wash(body, C.f); d.fill(E(50, 68, 15, 16, 12), C.bl);
    if (s.pat === 'speckle') [[36, 34], [64, 32], [32, 52], [68, 54], [40, 80], [62, 82], [30, 66], [70, 70]].forEach(([x, y]) => d.dot(x, y, 1.4, C.dk));
    if (s.pat === 'blotch') [[34, 36, 3], [66, 40, 2.4], [30, 60, 2.6], [70, 64, 3]].forEach(([x, y, r]) => d.fill(blob(x, y, r, r * .8, .8, 8), C.dk));
    const fl = [[28, 56], [15, 67], [18, 72], [29, 66]]; [fl, MIR(fl)].forEach(p => d.wash(p, C.f));
    d.line(body, { w: 2.6, close: true }); [fl, MIR(fl)].forEach(p => d.line(p, { w: 2.2 }));
    if (DG) { F(d, blob(50, 51, 13, 8, .75, 12), C.bl, 2); d.dot(46, 47, 1.2, INK); d.dot(54, 47, 1.2, INK); [[42, 53], [45, 55], [55, 55], [58, 53]].forEach(([x, y]) => d.dot(x, y, .8, INK)); dotEyes(d, o, [[40, 40], [60, 40]], 3); }
    else { d.fill(E(45, 50, 6, 4.6, 10), C.bl); d.fill(E(55, 50, 6, 4.6, 10), C.bl); d.fill([[46.8, 45], [53.2, 45], [50, 48.2]], INK); [[42, 50], [44, 52.5], [58, 50], [56, 52.5]].forEach(([x, y]) => d.dot(x, y, .8, INK)); dotEyes(d, o, [[40.5, 39], [59.5, 39]], 4.3); }
    cheek(d, [[34, 47], [66, 47]], 3);
    X.acc(d, s, C, { x: 50, y: 20, w: 20, cy: 36, ny: 60, nw: 16 }); DK.extras(d, o);
  };

  A.whale = (d, o, s, C) => {
    const v = s.v, DO = v === 'dolphin', OR = v === 'orca', HB = v === 'humpback';
    const body = OR ? [[8, 56], [12, 44], [26, 37], [46, 35], [64, 37], [78, 44], [88, 53], [88, 58], [76, 62], [56, 67], [34, 69], [18, 66]] : HB ? [[8, 54], [12, 42], [28, 35], [50, 34], [68, 38], [82, 46], [90, 54], [86, 60], [70, 64], [48, 70], [26, 70], [12, 64]] : [[10, 56], [16, 47], [28, 41], [46, 37], [62, 38], [76, 44], [86, 52], [88, 57], [78, 60], [60, 64], [40, 67], [24, 66], [14, 62]];
    const fluke = [[84, 52], [90, 40], [97, 37], [94, 48], [90, 54], [95, 62], [98, 71], [90, 68], [84, 58]];
    const dor = OR ? [[46, 36], [53, 13], [62, 37]] : HB ? [[64, 38], [69, 31], [74, 40]] : [[48, 38], [57, 24], [64, 39]];
    const fin = HB ? [[30, 66], [22, 87], [30, 89], [40, 70]] : [[34, 64], [30, 76], [42, 67]];
    d.wash(fluke, C.f); d.wash(dor, C.f); if (!HB) d.wash(fin, C.f);
    if (DO) d.wash([[12, 55], [3, 57], [4, 60], [14, 61]], C.f);
    d.wash(body, C.f);
    if (OR) { d.fill(E(30, 46, 7, 3.4, 10, -.2), CR); d.fill([[14, 60], [30, 66], [50, 67], [40, 62], [24, 60]], CR); }
    else d.fill(blob(40, 62, 24, 4.6, .8, 12), C.bl);
    if (HB) { [[18, 60, 40, 66], [20, 63, 42, 68.5]].forEach(([a, b, c, e]) => d.line([[a, b], [c, e]], { w: 1.3 })); [[20, 42], [26, 39], [32, 37.5]].forEach(([x, y]) => d.dot(x, y, 1.4, C.dk)); W(d, fin, C.bl, 2.1); d.line([[20, 30], [18, 20]], { w: 1.8, color: '#6fa8ff' }); d.line([[23, 30], [27, 20]], { w: 1.8, color: '#6fa8ff' }); }
    d.line(fluke, { w: 2.3, close: true }); d.line(dor, { w: 2.2 }); if (!HB) d.line(fin, { w: 2.1 });
    if (DO) d.line([[12, 55], [3, 57], [4, 60], [14, 61]], { w: 2.2 });
    d.line(body, { w: 2.6, close: true });
    eyes(d, o, [[DO ? 26 : 25, OR ? 50 : 50]], OR ? 3.8 : 4.4);
    d.line(DO ? [[13, 60], [20, 62.5], [27, 60.5]] : [[11, 58], [20, 61.5], [30, 59.5]], { w: 1.9 });
    d.dot(34, 57, 2.8, '#ff7fa8', .5);
    DK.extras(d, o);
  };

  A.nessie = (d, o, s, C) => {
    const h1 = [[46, 81], [52, 68], [62, 62], [72, 66], [78, 81]], h2 = [[81, 81], [85.5, 73], [91, 72], [95, 81]];
    d.wash(h1, C.f); d.wash(h2, C.f);
    const nk = tube(crs([[42, 81], [37, 64], [31, 48], [31, 36]], 3), 12, 10); d.wash(nk.P, C.f);
    const head = blob(34, 28, 13, 10.5, .85, 14); d.wash(head, C.f);
    [[58, 70], [66, 68], [88, 76], [34, 58], [36, 70]].forEach(([x, y]) => d.dot(x, y, 1.9, C.dk, .9));
    d.line(h1, { w: 2.4 }); d.line(h2, { w: 2.3 });
    const n = nk.L.length; d.line(nk.L.slice(0, n - 1), { w: 2.3 }); d.line(nk.R.slice(0, n - 1), { w: 2.3 });
    d.line(head, { w: 2.5, close: true });
    [[29, 19], [39, 19]].forEach(([x, y]) => { d.line([[x, y], [x, y - 4]], { w: 2.2 }); d.dot(x, y - 5, 2, C.dk); });
    eyes(d, o, [[29, 27], [40, 27]], 3.8); smile(d, 34.5, 32.5, 3.2, 1.6); cheek(d, [[24.5, 32], [44, 32]], 2.2);
    d.line([[10, 82], [20, 79.5], [30, 82], [40, 79.5], [50, 82], [60, 79.5], [70, 82], [80, 79.5], [90, 82], [98, 80]], { w: 2.1, color: '#6fa8ff' });
    d.line([[24, 90], [36, 88], [48, 90], [60, 88], [72, 90]], { w: 1.6, color: '#6fa8ff' });
    DK.extras(d, o);
  };
}]);

// boot: wait for DoodleKit, the data and both parts, then register one <doodle-art> kind per critter
(function boot() {
  const DK = window.DoodleKit, dex = window.CritterDex, parts = window.__cp || [];
  if (!DK || !dex || parts.length < 2) return setTimeout(boot, 30);
  if (dex.ready) return;
  const X = { A: {} };
  parts.slice().sort((a, b) => a[0] - b[0]).forEach(p => p[1](DK, X));
  dex.list.forEach(c => {
    if (c.spec.k) return;
    const fn = X.A[c.spec.b], s = c.spec;
    DK.K[c.id] = (d, o) => { const C = { f: o.fill || s.c[0], dk: o.spot || s.c[1], bl: o.belly || s.c[2] }; try { fn(d, o, s, C); } catch (e) { console.warn('critter', c.id, e); } };
    DK.CREATURES[c.id] = 1;
  });
  dex.ready = true;
  document.querySelectorAll('doodle-art').forEach(el => { const k = el.getAttribute('kind') || ''; if (k.startsWith('cp-') && el.ready) { el.setup(); el.draw(1); } });
  window.dispatchEvent(new Event('critterdex-ready'));
})();


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
