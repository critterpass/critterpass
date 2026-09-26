// Check whether palette attrs fully recolour a CritterDex local (mono widget variant) vs locked mask.
import fs from 'node:fs'; import vm from 'node:vm'; import { createCanvas } from '@napi-rs/canvas';
const D = '/Users/quocs/Projects/critterpass/design/';
class H { constructor(){this._a={};this.style={};} getAttribute(n){return n in this._a?this._a[n]:null} setAttribute(n,v){this._a[n]=String(v)} hasAttribute(n){return n in this._a} appendChild(){} addEventListener(){} getBoundingClientRect(){return {width:+this._a.size||48}} }
const reg={}; const g={HTMLElement:H,customElements:{get:n=>reg[n],define:(n,c)=>{reg[n]=c}},document:{createElement:()=>{const c=createCanvas(1,1);c.style={};return c},querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),devicePixelRatio:3,performance,setTimeout,clearTimeout,console,Math,Event,dispatchEvent:()=>true};
g.window=g; vm.createContext(g); for (const f of ['doodles.js','critters-data.js','critters-draw-1.js','critters-draw-2.js']) vm.runInContext(fs.readFileSync(D+f,'utf8'),g);
const DA=reg['doodle-art']; const R=a=>{const e=new DA(); Object.entries({anim:'none',blink:'false',...a}).forEach(([k,v])=>e.setAttribute(k,v)); e.connectedCallback(); return e.cv;};
const mono={ink:'#3a4720',fill:'#dfe5cc',spot:'#dfe5cc',belly:'#dfe5cc',accent:'#dfe5cc',eye:'#dfe5cc',pupil:'#3a4720'};
const out=createCanvas(1000,300),c=out.getContext('2d'); c.fillStyle='#dfe5cc'; c.fillRect(0,0,1000,300);
[['cp-013',{}],['cp-013',mono],['cp-055',mono],['gecko',mono]].forEach(([k,a],i)=>c.drawImage(R({kind:k,size:100,...a}),10+i*245,10,240,240));
// count distinct hues in mono cp-013 render
const cv=R({kind:'cp-013',size:100,...mono}); const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data; let off=0,tot=0;
for(let i=0;i<d.length;i+=4){ if(d[i+3]<200) continue; tot++; const r=d[i],gg=d[i+1],b=d[i+2]; if(!(Math.abs(r-gg)<60 && gg>=r-5)) off++; }
console.log('cp-013 mono: opaque px',tot,'px off-palette',off, (100*off/tot).toFixed(1)+'%');
fs.writeFileSync('mono-check.png', await out.encode('png'));
