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
