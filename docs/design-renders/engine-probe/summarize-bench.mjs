// Summarise bench JSON: per-archetype medians, top-cost kinds, animation fps, api counts, memory.
import fs from 'node:fs';
const f = process.argv[2];
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const dex = JSON.parse(fs.readFileSync(new URL('./dex.json', import.meta.url), 'utf8'));
const arch = k => (dex[k] ? dex[k] : (['gecko', 'tanuki', 'puffin', 'axolotl', 'sardine', 'alpaca'].includes(k) ? 'guide' : 'icon'));
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const r3 = x => +x.toFixed(3);
console.log('env', JSON.stringify(d.env));
for (const cpu of ['cpu1', 'cpu4']) {
  const R = d[cpu];
  for (const key of ['all96', 'all300']) {
    const rows = R[key];
    const groups = {};
    rows.forEach(r => (groups[arch(r.kind)] = groups[arch(r.kind)] || []).push(r));
    console.log(`\n== ${cpu} ${key}  n=${rows.length}`);
    console.log('group'.padEnd(8), 'n'.padStart(3), 'setup', 'drawJs', 'drawFlush', 'frame', 'ops', 'pts', 'ribV', 'backing');
    const crit = rows.filter(r => arch(r.kind) !== 'icon');
    const show = (g, rs) => console.log(g.padEnd(8), String(rs.length).padStart(3), r3(med(rs.map(r => r.setup))), r3(med(rs.map(r => r.drawJs))), r3(med(rs.map(r => r.drawFlush))), r3(med(rs.map(r => r.frame))), med(rs.map(r => r.ops)), med(rs.map(r => r.pts)), med(rs.map(r => r.ribbonVerts)), `${rs[0].bw}x${rs[0].bh}`);
    Object.entries(groups).sort().forEach(([g, rs]) => show(g, rs));
    show('ALLCRIT', crit);
    const mx = k => crit.reduce((a, b) => (b[k] > a[k] ? b : a));
    console.log('max drawFlush', mx('drawFlush').kind, r3(mx('drawFlush').drawFlush), 'max setup', mx('setup').kind, r3(mx('setup').setup), 'max pts', mx('pts').kind, mx('pts').pts, 'min pts', crit.reduce((a, b) => (b.pts < a.pts ? b : a)).kind, crit.reduce((a, b) => (b.pts < a.pts ? b : a)).pts);
    console.log('sum drawFlush all critters (ms):', r3(crit.reduce((s, r) => s + r.drawFlush, 0)), ' sum setup:', r3(crit.reduce((s, r) => s + r.setup, 0)));
  }
  console.log(`\n== ${cpu} firstPaint`); R.firstPaint.forEach(x => console.log(x.kind.padEnd(8), String(x.size).padStart(4), x.medianMs));
  console.log(`\n== ${cpu} anim`); R.anim.forEach(x => console.log(JSON.stringify(x)));
}
console.log('\n== api'); for (const [k, v] of Object.entries(d.api)) console.log(k, JSON.stringify(v));
console.log('\n== mem', JSON.stringify(d.mem));
