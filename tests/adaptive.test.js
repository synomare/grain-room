import test from 'node:test';
import assert from 'node:assert/strict';
import {dct1,dct2,halftoneLossGradient,optimizeHalftone,gaussianSelection,gaussianSelectionDerivative} from '../src/adaptive-halftone.js';
import {metricStretch,rescaledNoise} from '../src/adaptive-texture.js';
import {decayDiffusion,evolveDecay,moistureActivity} from '../src/adaptive-decay.js';
import {makeLayer} from '../src/filters.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('orthonormal DCT agrees with direct cosine reference and its inverse',()=>{
 const n=16,a=Float64Array.from({length:n},(_,i)=>Math.sin(i*.53)),b=dct1(a);
 for(let k=0;k<n;k++)near(b[k],a.reduce((s,v,j)=>s+v*Math.cos(Math.PI/n*(j+.5)*k),0)*Math.sqrt((k?2:1)/n));
 const c=dct1(b,true);for(let i=0;i<n;i++)near(a[i],c[i]);
 const image=Float64Array.from({length:128},(_,i)=>Math.cos(i*.71)),r=dct2(dct2(image,8,16),8,16,true);for(let i=0;i<128;i++)near(r[i],image[i]);
});
test('H-DCT and blur chain gradient matches finite differences including boundary pixels',()=>{
 const w=8,h=8,a=Float64Array.from({length:64},(_,i)=>Math.sin(i)*.3+.5),target=Float64Array.from(a,(_,i)=>i/64),eps=1e-5;
 for(const cutoff of [.25,.65,1]){const g=halftoneLossGradient(a,target,w,h,cutoff,1.2);for(const i of [0,7,13,32,63]){const plus=a.slice(),minus=a.slice();plus[i]+=eps;minus[i]-=eps;near(g.gradient[i],(halftoneLossGradient(plus,target,w,h,cutoff,1.2).loss-halftoneLossGradient(minus,target,w,h,cutoff,1.2).loss)/(2*eps),1e-6);}}
 near(gaussianSelectionDerivative(.2),(gaussianSelection(.20001)-gaussianSelection(.19999))/.00002);
});
test('binary search improves a nonuniform tone target and stays deterministic',()=>{
 const w=16,h=16,target=Float64Array.from({length:w*h},(_,i)=>.15+.7*(i%w)/(w-1)),initial=optimizeHalftone(target,w,h,{steps:0}),r=optimizeHalftone(target,w,h,{steps:50});
 assert.ok(r.loss<initial.loss*.8,`${r.loss} / ${initial.loss}`);assert.ok(r.binary.every(v=>v===0||v===1));assert.deepEqual(r,optimizeHalftone(target,w,h,{steps:50}));
});
test('inverse metric uses J J transpose and spectral rescaling remains finite under extreme dilation',()=>{
 near(metricStretch([2,3,5,7],.6,.8),Math.hypot(5.2,7.4));
 near(metricStretch([0,-1,1,0],.6,.8),1);
 // Different realization phases are allowed; all finite under large regular compression or stretch.
 for(const scale of [.01,.1,1,10,100])assert.ok(Number.isFinite(rescaledNoise(.3,.7,[scale,0,0,scale])));
});
test('decay diffusion conserves mass and moisture gates growth outside the viable interval',()=>{
 const w=7,h=9,a=Float32Array.from({length:w*h},(_,i)=>Math.sin(i)),cx=Float32Array.from(a,(_,i)=>.1+i/100),cy=new Float32Array(a.length).fill(.5),d=decayDiffusion(a,w,h,cx,cy);
 near(d.reduce((s,v)=>s+v,0),0,1e-5);near(decayDiffusion(new Float32Array(a.length).fill(.4),w,h,cx,cy).reduce((s,v)=>s+Math.abs(v),0),0);
 assert.equal(moistureActivity(.15),0);assert.equal(moistureActivity(.95),0);assert.equal(moistureActivity(.5),1);
});
test('six-field decay stays bounded, consumes substrate, and separates white from brown decay',()=>{
 const w=16,h=20,photo=new Float32Array(w*h).fill(.5),opts={steps:180,colonies:6,defense:0},white=evolveDecay(w,h,photo,{...opts,balance:1}),brown=evolveDecay(w,h,photo,{...opts,balance:0});
 for(const f of Object.values(white))assert.ok(f.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
 assert.ok(white.Hl.some(v=>v<.9));assert.ok(brown.Hl.every(v=>v===1));assert.ok(brown.Hc.some(v=>v<.9));assert.deepEqual(white,evolveDecay(w,h,photo,{...opts,balance:1}));
});
test('adaptive recipes round trip and previous volume recipes load with their original engine tag',()=>{
 for(const id of ['inksearch','metametric','fungal']){const layers=[makeLayer(id)],r=JSON.parse(encodeRecipe(layers));assert.equal(r.engine,'0.13');assert.deepEqual(decodeRecipe(JSON.stringify(r)),layers);r.engine='0.12';assert.throws(()=>decodeRecipe(JSON.stringify(r)));}
 for(const id of ['porous','dendrite','quasicut','sharpflow']){const r=JSON.parse(encodeRecipe([makeLayer(id)]));r.engine='0.12';assert.equal(decodeRecipe(JSON.stringify(r))[0].id,id);}
});
