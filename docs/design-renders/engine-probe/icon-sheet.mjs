// Render the 28 non-creature doodle kinds (icon set) at 48pt, ink on cream, accent where the design uses it.
import fs from 'node:fs'; import vm from 'node:vm'; import { createCanvas } from '@napi-rs/canvas';
const D = '/Users/quocs/Projects/critterpass/design/';
class H { constructor(){this._a={};this.style={};} getAttribute(n){return n in this._a?this._a[n]:null} setAttribute(n,v){this._a[n]=String(v)} hasAttribute(n){return n in this._a} appendChild(){} addEventListener(){} getBoundingClientRect(){return {width:+this._a.size||48}} }
const reg={}; const g={HTMLElement:H,customElements:{get:n=>reg[n],define:(n,c)=>{reg[n]=c}},document:{createElement:()=>{const c=createCanvas(1,1);c.style={};return c},querySelectorAll:()=>[]},matchMedia:()=>({matches:false}),devicePixelRatio:2,performance,setTimeout,clearTimeout,console,Math,Event,dispatchEvent:()=>true};
g.window=g; vm.createContext(g); for (const f of ['doodles.js','critters-data.js','critters-draw-1.js','critters-draw-2.js']) vm.runInContext(fs.readFileSync(D+f,'utf8'),g);
const DA=reg['doodle-art']; const R=a=>{const e=new DA(); Object.entries({anim:'none',blink:'false',...a}).forEach(([k,v])=>e.setAttribute(k,v)); e.connectedCallback(); return e.cv;};
const kinds=Object.keys(g.DoodleKit.K).filter(k=>!k.startsWith('cp-')&&!g.DoodleKit.CREATURES[k]);
const cols=14, cell=150, out=createCanvas(cols*cell, Math.ceil(kinds.length/cols)*cell), c=out.getContext('2d'); c.fillStyle='#f4efe4'; c.fillRect(0,0,out.width,out.height); c.fillStyle='#17142a'; c.font='14px monospace';
kinds.forEach((k,i)=>{ const cv=R({kind:k,size:48,accent:'#ffd84a'}); const x=(i%cols)*cell, y=Math.floor(i/cols)*cell; const w=100, h=w*cv.height/cv.width; c.drawImage(cv,x+25,y+10+(100-h)/2,w,h); c.fillText(k,x+10,y+135); });
fs.writeFileSync('icon-sheet.png', await out.encode('png')); console.log(kinds.length, kinds.join(' '));
