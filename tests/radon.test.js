import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {projectField,projectionAt,backproject} from '../src/radon.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const historical=JSON.parse(fs.readFileSync(new URL('./v017-catalog.json',import.meta.url),'utf8'));
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pixels=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*19+Math.floor(i/37)*11)%256);
test('Radon axis projections equal independent row and column sums',()=>{
 const a=Float64Array.from([1,2,3,4,5,6,7,8,9]),s=projectField(a,3,3,[0,Math.PI/2],7);
 assert.deepEqual(Array.from(s.data.slice(2,5)),[12,15,18]);
 for(let j=0;j<3;j++)near(s.data[7+2+j],[6,15,24][j]);
});
test('Radon oblique splats conserve mass, first moment and linearity',()=>{
 const w=7,h=4,a=Float64Array.from({length:w*h},(_,i)=>i%5),b=Float64Array.from(a,v=>v*.3+1),angles=[.13,.7,1.9,3.8];
 const s=projectField(a,w,h,angles),t=projectField(b,w,h,angles),u=projectField(Float64Array.from(a,(v,i)=>2*v+b[i]),w,h,angles);
 for(let k=0;k<angles.length;k++){let sum=0,moment=0,reference=0;for(let j=0;j<s.bins;j++){sum+=s.data[k*s.bins+j];moment+=(j-(s.bins-1)/2)*s.data[k*s.bins+j];near(u.data[k*s.bins+j],2*s.data[k*s.bins+j]+t.data[k*s.bins+j]);}for(let y=0;y<h;y++)for(let x=0;x<w;x++)reference+=a[y*w+x]*((x-3)*Math.cos(angles[k])+(y-1.5)*Math.sin(angles[k]));near(sum,a.reduce((x,y)=>x+y,0));near(moment,reference);}
});
test('Angular seam reverses the detector, including negative indices; outside support is zero',()=>{
 const s=projectField(Float64Array.from([1,0,3,4,0,2]),3,2,[0,Math.PI/3,2*Math.PI/3]);
 for(const t of [0,1.7,3,s.bins-1]){near(projectionAt(s,3,t),projectionAt(s,0,s.bins-1-t));near(projectionAt(s,-1,t),projectionAt(s,2,s.bins-1-t));near(projectionAt(s,2.5,t),.5*(projectionAt(s,2,t)+projectionAt(s,0,s.bins-1-t)));}
 assert.equal(projectionAt(s,1,-.01),0);assert.equal(projectionAt(s,0,s.bins),0);
});
test('Backprojection agrees with an independent linear interpolation reference',()=>{
 const s=projectField(Float64Array.from([1,2,0,4,3,2,1,0,1]),3,3,[.2,.9,1.7]);
 for(const [x,y] of [[0,0],[.3,-.8],[-1,1]]){let expected=0;for(let k=0;k<3;k++){const t=x*Math.cos(s.angles[k])+y*Math.sin(s.angles[k])+(s.bins-1)/2,j=Math.floor(t);expected+=s.data[k*s.bins+j]+(s.data[k*s.bins+j+1]-s.data[k*s.bins+j])*(t-j);}near(backproject(s,x,y),expected/3);}
});
test('Radon determinism, input immutability, seed and three distinct spatial layouts',()=>{
 const a=pixels(40,51),copy=a.slice(),l=makeLayer('radon'),out=applyFilter(a,40,51,l);assert.deepEqual(a,copy);assert.deepEqual(applyFilter(a,40,51,l),out);l.params.seed=219;assert.notDeepEqual(applyFilter(a,40,51,l),out);
 const outputs=[0,1,2].map(layout=>applyFilter(a,40,51,{...l,params:{...l.params,layout}}));for(let k=0;k<3;k++)assert.notDeepEqual(outputs[k],outputs[(k+1)%3]);
});
test('0.17 catalog and assets roundtrip; all 69 old effects remain accepted by 0.16',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=17);assert.equal(historical.effects.length,70);assert.equal(historical.looks.length,84);for(const id of historical.looks)assert.ok(looks.some(l=>l.id===id));
 for(const f of historical.effects.map(id=>filters.find(f=>f.id===id))){const layers=[makeLayer(f.id)],j=JSON.parse(encodeRecipe(layers));assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);j.engine='0.16';if(f.radon)assert.throws(()=>decodeRecipe(JSON.stringify(j)));else assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);}
 for(let n=2;n<=16;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([makeLayer('radon')])),engine:'0.'+n})));
 for(const l of looks.filter(l=>l.radon))assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+l.id+'.json',import.meta.url),'utf8')),l.layers);
});
test('Radon extrema, thin images, all layouts, monochrome and exact zero mix',()=>{
 const f=filters.find(f=>f.radon);for(const [w,h] of [[1,1],[1,23],[29,1],[23,31]])for(const end of [2,3])for(const layout of [0,1,2]){const a=pixels(w,h),l=makeLayer('radon');for(const c of f.controls)l.params[c[0]]=c[end];l.params.layout=layout;const out=applyFilter(a,w,h,l);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);l.params.colorMode='mono';const mono=applyFilter(a,w,h,l);for(let i=0;i<mono.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);}l.params.mix=0;assert.deepEqual(applyFilter(a,w,h,l),a);}
});
