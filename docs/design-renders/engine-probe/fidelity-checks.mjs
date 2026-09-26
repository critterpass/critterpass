// Visual checks: multiply vs source-over washes; 24pt native render vs 300pt downscaled (minW clamp); tessellation facets at 512pt.
import fs from 'node:fs'; import vm from 'node:vm'; import { createCanvas } from '@napi-rs/canvas';
const D = '/Users/quocs/Projects/critterpass/design/';
class H { constructor(){this._a={};this.style={};} getAttribute(n){return n in this._a?this._a[n]:null} setAttribute(n,v){this._a[n]=String(v)} hasAttribute(n){return n in this._a} appendChild(){} addEventListener(){} getBoundingClientRect(){return {width:+this._a.size||48}} }
const reg={}; const g={HTMLElement:H,customElements:{get:n=>reg[n],define:(n,c)=>{reg[n]=c}},document:{createElement:()=>{const c=createCanvas(1,1);c.style={};return c},querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),devicePixelRatio:3,performance,setTimeout,clearTimeout,console,Math,Event,dispatchEvent:()=>true};
g.window=g; vm.createContext(g); for (const f of ['doodles.js','critters-data.js','critters-draw-1.js','critters-draw-2.js']) vm.runInContext(fs.readFileSync(D+f,'utf8'),g);
const DA=reg['doodle-art']; const R=a=>{const e=new DA(); Object.entries({anim:'none',blink:'false',...a}).forEach(([k,v])=>e.setAttribute(k,v)); e.connectedCallback(); return e.cv;};
const W=1500,Hh=900, out=createCanvas(W,Hh), c=out.getContext('2d'); c.fillStyle='#1f1b38'; c.fillRect(0,0,W,Hh);
c.fillStyle='#f4efe4'; c.font='bold 18px sans-serif';
const put=(cv,x,y,w,label)=>{ const h=w*cv.height/cv.width; c.imageSmoothingQuality='high'; c.drawImage(cv,x,y,w,h); c.fillText(label,x,y+h+22); };
put(R({kind:'cp-013',size:120,sticker:'#f4efe4',seed:13}),20,20,300,'multiply (design default)');
put(R({kind:'cp-013',size:120,sticker:'#f4efe4',seed:13,blend:'source-over'}),340,20,300,'source-over (naive port)');
put(R({kind:'tanuki',size:120,seed:42}),660,20,300,'no sticker, multiply');
put(R({kind:'tanuki',size:120,seed:42,blend:'source-over'}),980,20,300,'no sticker, source-over');
// small size: 24pt native vs 300 downscaled, both shown enlarged 6x with nearest-neighbour
const n24=R({kind:'gecko',size:24}), big=R({kind:'gecko',size:300});
const d24=createCanvas(n24.width,n24.height); const dx=d24.getContext('2d'); dx.imageSmoothingQuality='high'; dx.drawImage(big,0,0,n24.width,n24.height);
c.imageSmoothingEnabled=false; c.drawImage(n24,20,440,360,360); c.drawImage(d24,420,440,360,360); c.imageSmoothingEnabled=true;
c.fillText('24pt native (60px @2.5x), minW clamp',20,830); c.fillText('300pt render downscaled to 60px',420,830);
// facets at 512pt: crop tail region of gecko at 512
const b512=R({kind:'gecko',size:512}); c.drawImage(b512, b512.width*.5, b512.height*.62, b512.width*.36, b512.height*.36, 820, 440, 400, 400); c.fillText('512pt tail crop (1.1-unit polyline step)',820,870);
fs.writeFileSync('fidelity-checks.png', await out.encode('png'));
