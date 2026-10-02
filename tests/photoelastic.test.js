import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {airyStress,principalStress,polarizedIntensity} from '../src/photoelastic.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pixels=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*19)%256);

test('Airy stress recovers the analytic Hessian of a quadratic potential',()=>{
 const w=11,h=13,p=Float32Array.from({length:w*h},(_,i)=>{const x=i%w,y=Math.floor(i/w);return 3*x*x+2*x*y+5*y*y;});
 const s=airyStress(p,w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;near(s.xx[i],10);near(s.yy[i],6);near(s.xy[i],-2);}
 for(const a of Object.values(s))assert.ok(a.every(Number.isFinite));
});
test('principal stress difference is rotation and hydrostatic invariant',()=>{
 for(const angle of [0,.3,1.2,2.8]){
  const c=Math.cos(angle),s=Math.sin(angle),xx=7*c*c+2*s*s,yy=7*s*s+2*c*c,xy=5*s*c;
  const q=principalStress(xx,yy,xy);near(q.difference,5);near(principalStress(xx+91,yy+91,xy).difference,5);
  near(Math.cos(2*q.angle),Math.cos(2*angle));near(Math.sin(2*q.angle),Math.sin(2*angle));
 }near(principalStress(5,5,0).difference,0);
});
test('crossed polarization matches independent complex Jones propagation',()=>{
 // Rotate input into retarder axes, phase both amplitudes, rotate back,
 // then project onto the crossed analyzer. This is not the sin-squared formula.
 for(const delta of [0,120,430,970])for(const angle of [0,.21,.74,1.3]){
  const c=Math.cos(angle),s=Math.sin(angle),phase=Math.PI*delta/550;
  const real=c*s*Math.cos(phase)-s*c*Math.cos(-phase);
  const imag=c*s*Math.sin(phase)-s*c*Math.sin(-phase);
  near(polarizedIntensity(delta,550,angle),real*real+imag*imag);
 }
 near(polarizedIntensity(275,550,Math.PI/4),1);near(polarizedIntensity(550,550,.4),0);
 near(polarizedIntensity(100,550,0),0);
 for(const a of [0,.2,1])near(polarizedIntensity(275,550,a,0,1),1);
});
test('photoelastic seed replay, angle response and zero-stress limits',()=>{
 const a=pixels(48,64),l=makeLayer('photoelastic'),before=a.slice(),one=applyFilter(a,48,64,l);
 assert.deepEqual(applyFilter(a,48,64,l),one);assert.deepEqual(a,before);
 l.params.seed=311;assert.notDeepEqual(applyFilter(a,48,64,l),one);
 l.params.seed=17;l.params.angle+=37;assert.notDeepEqual(applyFilter(a,48,64,l),one);
 l.params.pressure=0;l.params.dye=0;
 for(const backing of [0,100]){l.params.backing=backing;const out=applyFilter(a,48,64,l);for(let i=0;i<out.length;i++)assert.equal(out[i],i%4===3?255:backing===100?255:0);}
});
test('new generation accepts every 0.14 effect and rejects photoelastic in every old generation',()=>{
 for(const f of JSON.parse(fs.readFileSync(new URL('./v016-catalog.json',import.meta.url),'utf8')).effects.map(id=>filters.find(f=>f.id===id))){const layers=[makeLayer(f.id)],j=JSON.parse(encodeRecipe(layers));assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);j.engine='0.14';if(f.photoelastic||f.newton||f.radon)assert.throws(()=>decodeRecipe(JSON.stringify(j)));else assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);}
 const j=JSON.parse(encodeRecipe([makeLayer('photoelastic')]));for(let n=2;n<=14;n++){j.engine='0.'+n;assert.throws(()=>decodeRecipe(JSON.stringify(j)));}
 for(const look of looks.filter(l=>l.photoelastic))assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8')),look.layers);
});
test('photoelastic renders thin images and control extremes with true monochrome and exact zero mix',()=>{
 const f=filters.find(f=>f.id==='photoelastic');
 for(const [w,h] of [[1,1],[1,23],[29,1],[23,31]])for(const end of [2,3]){
  const a=pixels(w,h),l=makeLayer(f.id);for(const c of f.controls)l.params[c[0]]=c[end];
  const out=applyFilter(a,w,h,l);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
  l.params.colorMode='mono';const mono=applyFilter(a,w,h,l);for(let i=0;i<mono.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);}
  l.params.mix=0;assert.deepEqual(applyFilter(a,w,h,l),a);
 }
});
