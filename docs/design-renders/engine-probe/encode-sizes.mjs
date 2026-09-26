// Measure encoded asset sizes (png / webp / avif) per render size, sampled over 20 critters.
import fs from 'node:fs'; import vm from 'node:vm'; import { createCanvas } from '@napi-rs/canvas';
const D = '/Users/quocs/Projects/critterpass/design/';
class H { constructor(){this._a={};this.style={};} getAttribute(n){return n in this._a?this._a[n]:null} setAttribute(n,v){this._a[n]=String(v)} hasAttribute(n){return n in this._a} appendChild(){} addEventListener(){} getBoundingClientRect(){return {width:+this._a.size||48}} }
const reg={}; const g={HTMLElement:H,customElements:{get:n=>reg[n],define:(n,c)=>{reg[n]=c}},document:{createElement:()=>{const c=createCanvas(1,1);c.style={};return c},querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),devicePixelRatio:3,performance,setTimeout,clearTimeout,console,Math,Event,dispatchEvent:()=>true};
g.window=g; vm.createContext(g); for (const f of ['doodles.js','critters-data.js','critters-draw-1.js','critters-draw-2.js']) vm.runInContext(fs.readFileSync(D+f,'utf8'),g);
const DA=reg['doodle-art']; const R=a=>{const e=new DA(); Object.entries({anim:'none',blink:'false',...a}).forEach(([k,v])=>e.setAttribute(k,v)); e.connectedCallback(); return e.cv;};
const kinds=g.CritterDex.list.filter((_,i)=>i%7===0).map(c=>c.kind);
for (const s of [24,48,96,232,512]) { const acc={png:0,webp90:0,webp100:0,avif80:0,px:''};
  for (const k of kinds){ const cv=R({kind:k,size:s,sticker:'#f4efe4'}); acc.px=cv.width+'x'+cv.height; acc.png+=(await cv.encode('png')).length; acc.webp90+=(await cv.encode('webp',90)).length; acc.webp100+=(await cv.encode('webp',100)).length; acc.avif80+=(await cv.encode('avif',{quality:80})).length; }
  const n=kinds.length; console.log(`size ${s}pt (${acc.px} @2.5x): png ${(acc.png/n/1024).toFixed(1)}KB  webp90 ${(acc.webp90/n/1024).toFixed(1)}KB  webp100 ${(acc.webp100/n/1024).toFixed(1)}KB  avif80 ${(acc.avif80/n/1024).toFixed(1)}KB  (n=${n})`); }
// alpha-mask (locked) single-channel candidate
const cv=R({kind:'cp-013',size:96,locked:'#ffffff'}); console.log('locked mask 96 png', ((await cv.encode('png')).length/1024).toFixed(1),'KB');
