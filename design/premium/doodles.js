// Hand-drawn brush-pen doodles (Tokek the gecko + icon set), canvas 2D.
// Stroke language adapted from the hand-drawn-canvas-animation skill: tapered brush ribbons,
// offset watercolour washes, seeded wobble, strokes that draw themselves on.
(function () {
  if (customElements.get('doodle-art')) return;
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
  class DoodleArt extends HTMLElement {
    static get observedAttributes() { return ['kind', 'pose', 'size', 'ink', 'fill', 'accent', 'spot', 'eye', 'pupil', 'belly', 'seed', 'blend', 'sticker', 'locked']; }
    connectedCallback() {
      if (!this.cv) {
        this.cv = document.createElement('canvas'); this.cv.style.display = 'block';
        this.appendChild(this.cv); this.style.display = 'inline-block'; this.style.lineHeight = '0'; this.style.flex = 'none';
        this.addEventListener('click', () => this.play(0));
      }
      this.box();
      const go = () => { if (!this.ready) { this.ready = true; this.setup(); const r = this.getBoundingClientRect(); if (r.width < 44) this.draw(1); else this.play(+this.getAttribute('delay') || 0); } this.startBlink(); };
      if ('IntersectionObserver' in window) {
        this.io && this.io.disconnect();
        this.io = new IntersectionObserver(es => { const v = es.some(e => e.isIntersecting); this.vis = v; if (v) go(); }, { rootMargin: '150px' });
        this.io.observe(this);
      } else go();
    }
    startBlink() {
      if (this.bt || !this.opsClosed) return;
      const loop = () => { this.bt = setTimeout(() => { if (!this.anim && this.vis) { this.useClosed = true; this.draw(1); setTimeout(() => { this.useClosed = false; this.draw(1); }, 150); } loop(); }, 2600 + Math.random() * 3600); };
      loop();
    }
    box() {
      const A = n => this.getAttribute(n), fn = K[A('kind') || 'gecko'] || K.spark, vb = fn.vb || [100, 100];
      const pad = A('sticker') ? (+A('sticker-w') || 5) + 4 : 0, Wd = +A('size') || 48, Ht = Wd * (vb[1] + 2 * pad) / (vb[0] + 2 * pad);
      this.cv.style.width = Wd + 'px'; this.cv.style.height = Ht + 'px';
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); clearTimeout(this.bt); this.bt = null; this.io && this.io.disconnect(); }
    attributeChangedCallback() { if (!this.cv) return; if (this.ready) { this.setup(); this.draw(1); } else this.box(); }
    setup() {
      const A = n => this.getAttribute(n);
      const kind = A('kind') || 'gecko', fn = K[kind] || K.spark, vb = fn.vb || [100, 100];
      this.stk = A('sticker'); this.stkW = +A('sticker-w') || 5; const pad = this.stk ? this.stkW + 4 : 0; this.pad = pad;
      const Wd = +A('size') || 48, Ht = Wd * (vb[1] + 2 * pad) / (vb[0] + 2 * pad), dpr = Math.min(2, window.devicePixelRatio || 1) * 1.25;
      this.cv.width = Math.round(Wd * dpr); this.cv.height = Math.round(Ht * dpr);
      this.cv.style.width = Wd + 'px'; this.cv.style.height = Ht + 'px';
      this.k = Wd * dpr / (vb[0] + 2 * pad); this.dpr = dpr;
      const ink = A('ink') || '#221e19';
      const o = { ink, fill: A('fill'), accent: A('accent'), spot: A('spot'), belly: A('belly'), leaf: A('leaf'), eye: A('eye') || '#fffdf6', pupil: A('pupil') || ink, pose: A('pose'), closed: false };
      const build = () => { const ops = []; let sid = +A('seed') || 7;
      const d = {
        line: (pts, x = {}) => { const P = spl(pts, x.close); ops.push({ t: 'line', P, L: len(P), close: !!x.close, o: { w: x.w || 3, color: x.color || o.ink, taper: x.taper !== false && !x.close, close: !!x.close, seed: sid++, amp: .45 } }); },
        stroke: (pts, color, w) => { const P = spl(pts, false); ops.push({ t: 'under', P, o: { w, color, taper: true, seed: sid++, amp: .3 } }); },
        wash: (pts, color, x = {}) => ops.push({ t: 'wash', P: spl(pts, true), color, al: x.al ?? .9, off: x.off ?? 1.6, seed: sid++ }),
        fill: (pts, color) => ops.push({ t: 'fill', P: spl(pts, true), color }),
        dot: (x, y, r, color, al = 1) => ops.push({ t: 'fill', P: E(x, y, r, r, 10), color, al }),
      };
      fn(d, o); return ops; };
      this.blend = A('blend') || 'multiply';
      const lk = A('locked'), lock = ops => { if (lk !== null) { const col = lk || '#3a3466'; ops.forEach(q => { if (q.o) q.o.color = col; q.color = col; q.al = 1; }); } return ops; };
      if (lk !== null) this.blend = 'source-over';
      this.opsOpen = lock(build());
      this.opsClosed = null;
      if (CREATURES[kind] && lk === null && A('blink') !== 'false') { o.closed = true; this.opsClosed = build(); }
      this.ops = this.opsOpen; this.total = this.ops.reduce((s, q) => s + (q.t === 'line' ? q.L : 0), 0) || 1;
      this.oc = null;
      if (this.stk) {
        const oc = this.oc = document.createElement('canvas'); oc.width = this.cv.width; oc.height = this.cv.height;
        const x = oc.getContext('2d'), k = this.k; x.setTransform(k, 0, 0, k, pad * k, pad * k); x.strokeStyle = x.fillStyle = this.stk; x.lineJoin = x.lineCap = 'round';
        for (const q of this.ops) {
          if (q.t === 'wash' || q.t === 'fill') { polyline(x, q.P, true); x.lineWidth = this.stkW * 2; x.stroke(); x.fill(); }
          else { polyline(x, q.P, q.close); x.lineWidth = this.stkW * 2 + q.o.w; x.stroke(); }
        }
      }
    }
    draw(p) {
      const c = this.cv.getContext('2d'), k = this.k, pad = this.pad;
      c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, this.cv.width, this.cv.height);
      if (p <= 0) return;
      const ops = this.useClosed && this.opsClosed ? this.opsClosed : this.opsOpen;
      if (this.oc) {
        const oc = this.oc;
        c.save(); c.globalAlpha = Math.min(1, p * 4); c.shadowColor = 'rgba(0,0,0,.32)'; c.shadowBlur = 5 * this.dpr; c.shadowOffsetY = 2.5 * this.dpr; c.drawImage(oc, 0, 0); c.restore();
      }
      c.setTransform(k, 0, 0, k, pad * k, pad * k);
      const minW = 1.05 * this.dpr / k;
      const fa = Math.max(0, Math.min(1, (p - .25) / .55));
      for (const q of ops) {
        if (q.t === 'wash') {
          const r = rng(q.seed), ox = (r() - .5) * 2 * q.off, oy = (r() - .2) * q.off;
          c.save(); c.globalCompositeOperation = this.blend; c.translate(ox, oy); polyline(c, q.P, true);
          c.globalAlpha = q.al * fa; c.fillStyle = q.color; c.fill();
          c.globalAlpha = .28 * fa; c.strokeStyle = q.color; c.lineWidth = 1.4; c.stroke(); c.restore();
        } else if (q.t === 'under') {
          c.save(); c.globalCompositeOperation = this.blend; c.globalAlpha = .9 * fa; c.fillStyle = q.o.color; ribbon(c, q.P, q.P.length, { ...q.o, minW }); c.restore();
        }
      }
      let budget = p * this.total * 1.02;
      for (const q of ops) {
        if (q.t === 'fill') { c.save(); c.globalAlpha = (q.al ?? 1) * (p >= 1 ? 1 : fa); c.fillStyle = q.color; polyline(c, q.P, true); c.fill(); c.restore(); }
        else if (q.t === 'line') {
          if (budget <= 0) continue;
          let P = q.P;
          if (budget < q.L) { let s = 0, i = 1; for (; i < P.length; i++) { s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (s > budget) break; } P = P.slice(0, i + 1); }
          budget -= q.L;
          c.fillStyle = q.o.color; ribbon(c, P, q.P.length, { ...q.o, minW });
        }
      }
    }
    play(delay) {
      if (this.getAttribute('anim') === 'none' || matchMedia('(prefers-reduced-motion: reduce)').matches) { this.draw(1); return; }
      cancelAnimationFrame(this.raf); const dur = CREATURES[this.getAttribute('kind') || 'gecko'] ? 1500 : 700;
      const t0 = performance.now() + delay; this.anim = true;
      const tick = now => { const t = Math.max(0, Math.min(1, (now - t0) / dur)); const e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; this.draw(e); if (t < 1) this.raf = requestAnimationFrame(tick); else this.anim = false; };
      this.raf = requestAnimationFrame(tick);
    }
  }
  customElements.define('doodle-art', DoodleArt);

  // <tg-motion> — looping choreography on the global clock, so loops stay in sync across elements.
  // kf mini-syntax: "0:tx0 o1; .3:tx120 e=back; 1:tx0"  tokens: tx ty (px or %), s sx sy r(deg) o, e=in|out|io|lin|back
  const EASE = { in: 'cubic-bezier(.55,0,1,.45)', out: 'cubic-bezier(0,.55,.45,1)', io: 'cubic-bezier(.65,0,.35,1)', lin: 'linear', back: 'cubic-bezier(.34,1.56,.64,1)' };
  const PRESETS = {
    bob: ['0:ty0;.5:ty-6;1:ty0', 2400], float: ['0:ty0 r-2;.5:ty-9 r2;1:ty0 r-2', 4200], wiggle: ['0:r-4;.5:r4;1:r-4', 1600],
    pulse: ['0:s1;.5:s1.07;1:s1', 1600], ping: ['0:s.6 o.8 e=out;1:s1.5 o0', 1800], spin: ['0:r0 e=lin;1:r360', 9000],
    marquee: ['0:tx0 e=lin;1:tx-50%', 16000], rise: ['0:ty14 o0 e=out;.08:ty0 o1;.8:ty0 o1;.9:ty-6 o0;1:ty-6 o0', 6000],
    blink: ['0:o1;.5:o.25;1:o1', 1200], hop: ['0:ty0 sy1;.1:ty0 sy.9 e=out;.22:ty-14 sy1.05 e=in;.34:ty0 sy.94 e=out;.42:ty0 sy1;1:ty0 sy1', 2600],
    grow: ['0:sx0 e=out;.4:sx1;1:sx1', 4000], tug: ['0:tx-8;.5:tx8;1:tx-8', 1800]
  };
  function parseKF(s, ease) {
    const cur = { tx: '0px', ty: '0px', r: 0, sx: 1, sy: 1, o: 1 }, out = [];
    s.split(';').map(x => x.trim()).filter(Boolean).forEach(seg => {
      const i = seg.indexOf(':'), off = +seg.slice(0, i); let e = ease;
      seg.slice(i + 1).trim().split(/\s+/).filter(Boolean).forEach(t => {
        if (t.startsWith('e=')) { e = EASE[t.slice(2)] || t.slice(2); return; }
        const m = t.match(/^(tx|ty|sx|sy|s|r|o)(-?[\d.]+%?)$/); if (!m) return;
        const key = m[1], v = m[2];
        if (key === 's') cur.sx = cur.sy = parseFloat(v);
        else if (key === 'tx' || key === 'ty') cur[key] = v.endsWith('%') ? v : parseFloat(v) + 'px';
        else cur[key] = parseFloat(v);
      });
      out.push({ offset: off, transform: 'translate(' + cur.tx + ',' + cur.ty + ') rotate(' + cur.r + 'deg) scale(' + cur.sx + ',' + cur.sy + ')', opacity: cur.o, easing: e });
    });
    return out;
  }
  class TgMotion extends HTMLElement {
    connectedCallback() { if (!this.style.display) this.style.display = this.hasAttribute('block') ? 'block' : 'inline-block'; requestAnimationFrame(() => this.start()); }
    disconnectedCallback() { (this.anims || []).forEach(a => a.cancel()); }
    start() {
      (this.anims || []).forEach(a => a.cancel()); this.anims = [];
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const A = n => this.getAttribute(n), P = PRESETS[A('fx')] || ['0:o1;1:o1', 2000];
      const kf = parseKF(A('kf') || P[0], EASE[A('ease')] || A('ease') || EASE.io);
      const dur = +(A('dur')) > 0 ? +A('dur') : P[1], delay = +(A('delay') || 0), once = A('iter') === '1', st = A('stagger');
      const targets = st !== null ? Array.from(this.children) : [this];
      targets.forEach((t, i) => {
        if (A('origin')) t.style.transformOrigin = A('origin');
        const a = t.animate(kf, { duration: dur, delay: delay + i * (+st || 0), iterations: once ? 1 : Infinity, easing: 'linear', fill: 'both' });
        if (!once) a.startTime = 0;
        this.anims.push(a);
      });
    }
  }
  customElements.define('tg-motion', TgMotion);

  // <tg-confetti period="6000" at=".45" ox=".5" oy=".6"> — paper burst on the same global clock
  class TgConfetti extends HTMLElement {
    connectedCallback() {
      Object.assign(this.style, { position: 'absolute', inset: '0', pointerEvents: 'none', display: 'block', zIndex: this.getAttribute('z') || '25' });
      if (!this.cv) { this.cv = document.createElement('canvas'); Object.assign(this.cv.style, { width: '100%', height: '100%', display: 'block' }); this.appendChild(this.cv); }
      this.parts = []; this.last = -1; this.vis = false;
      if (!this.io) { this.io = new IntersectionObserver(es => { this.vis = es.some(e => e.isIntersecting); }); this.io.observe(this); }
      const tick = now => { this.frame(now); this.raf = requestAnimationFrame(tick); }; this.raf = requestAnimationFrame(tick);
    }
    disconnectedCallback() { cancelAnimationFrame(this.raf); }
    burst(w, h) {
      const cols = (this.getAttribute('colors') || '#ffd84a,#ff5fa8,#4f86ff,#54d6a4,#f4efe4,#ff9a4d').split(','), n = +(this.getAttribute('count') || 70);
      const ox = +(this.getAttribute('ox') || .5) * w, oy = +(this.getAttribute('oy') || .6) * h;
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = 5 + Math.random() * 9; this.parts.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: Math.random() * 6, vr: (Math.random() - .5) * .4, w: 5 + Math.random() * 6, h: 3 + Math.random() * 4, c: cols[i % cols.length], life: 1 }); }
    }
    frame(now) {
      const dpr = Math.min(2, window.devicePixelRatio || 1), W = this.clientWidth, H = this.clientHeight; if (!W) return;
      if (!this.vis && !this.parts.length) { this.last = -1; return; } const cw = Math.round(W * dpr), ch = Math.round(H * dpr); if (this.cv.width !== cw) { this.cv.width = cw; this.cv.height = ch; }
      const per = +(this.getAttribute('period') || 4000), at = +(this.getAttribute('at') || 0);
      const ph = (((now - at * per) % per) + per) % per; if (this.vis && this.last >= 0 && ph < this.last) this.burst(W, H); this.last = ph;
      const c = this.cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
      this.parts = this.parts.filter(p => p.life > 0);
      for (const p of this.parts) { p.vy += .32; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.r += p.vr; p.life -= .009; c.save(); c.globalAlpha = Math.min(1, p.life * 2); c.translate(p.x, p.y); c.rotate(p.r); c.scale(1, Math.cos(p.r * 2)); c.fillStyle = p.c; c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore(); }
    }
  }
  customElements.define('tg-confetti', TgConfetti);

  // <tg-type text="…"> — types, holds, retypes. Reserves the full text's space so layout never jumps.
  class TgType extends HTMLElement {
    connectedCallback() {
      if (!this.sh) {
        this.sh = this.attachShadow({ mode: 'open' });
        this.sh.innerHTML = '<div style="position:relative"><div style="visibility:hidden"></div><div style="position:absolute;inset:0"><span></span><span style="display:inline-block;width:2px;height:.9em;margin-left:2px;vertical-align:-.1em;background:currentColor"></span></div></div>';
        this.ghost = this.sh.querySelector('div > div'); this.txt = this.sh.querySelector('span'); this.caret = this.sh.querySelectorAll('span')[1];
        this.caret.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 480, iterations: Infinity, direction: 'alternate' });
      }
      this.style.display = 'block'; this.loop();
    }
    disconnectedCallback() { clearTimeout(this.to); }
    loop() {
      clearTimeout(this.to);
      const s = this.getAttribute('text') || '', sp = +(this.getAttribute('speed') || 40), hold = +(this.getAttribute('hold') || 2800);
      this.ghost.textContent = s; let i = 0;
      const step = () => { this.txt.textContent = s.slice(0, i); if (i < s.length) { const ch = s[i]; i++; this.to = setTimeout(step, sp + (ch === ',' || ch === '.' || ch === '?' ? 260 : 0)); } else this.to = setTimeout(() => { i = 0; step(); }, hold); };
      step();
    }
  }
  customElements.define('tg-type', TgType);

  // <tg-count from="342728" format="dhms|hms|ms"> — live countdown
  class TgCount extends HTMLElement {
    connectedCallback() {
      if (!this.sh) { this.sh = this.attachShadow({ mode: 'open' }); this.sp = document.createElement('span'); this.sh.appendChild(this.sp); }
      let s = +(this.getAttribute('from') || 0); const f = this.getAttribute('format') || 'dhms', z = n => String(n).padStart(2, '0');
      const r = () => { const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; this.sp.textContent = f === 'hms' ? z(h) + ':' + z(m) + ':' + z(x) : f === 'ms' ? z(m) + ':' + z(x) : d + 'D ' + z(h) + ':' + z(m) + ':' + z(x); s = Math.max(0, s - 1); };
      clearInterval(this.iv); r(); this.iv = setInterval(r, 1000);
    }
    disconnectedCallback() { clearInterval(this.iv); }
  }
  customElements.define('tg-count', TgCount);
})();
