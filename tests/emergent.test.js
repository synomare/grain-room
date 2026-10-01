import test from 'node:test';
import assert from 'node:assert/strict';
import {triangleDomain,circleReflect,foldTriangle,kleinBarycentric,diskTranslate,stripToDisk} from '../src/emergent-hyperbolic.js';
import {evolvePhase,latticeSymbols,phaseEnergy} from '../src/emergent-phase.js';
import {coherentReflectance,gratingSpectrum,spectrumReflectance} from '../src/emergent-wavebrdf.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
import {makeLayer} from '../src/filters.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('hyperbolic mirror is orthogonal to the disk and is an involution',()=>{
 for(const a of [3,5,9,12])for(const b of [3,5,8]){
  const d=triangleDomain(a,b,4);near(d.cx*d.cx+d.cy*d.cy-d.r2,1);
  for(const [x,y] of [[.1,.2],[-.6,.3],[.8,-.1]]){const q=circleReflect(x,y,d),r=circleReflect(...q,d);near(r[0],x);near(r[1],y);assert.ok(Math.hypot(...q)<1);}
 }assert.throws(()=>triangleDomain(3,3,3));
});
test('hyperbolic folding reaches its fundamental triangle and preserves reflection equivalence',()=>{
 const d=triangleDomain(5,3,4);
 for(let i=0;i<300;i++){
  const r=Math.sqrt((i+.5)/301)*.999,theta=i*2.399963,q=foldTriangle(r*Math.cos(theta),r*Math.sin(theta),d);assert.ok(q[3]);
  const b=kleinBarycentric(q[0],q[1],d);near(b.reduce((a,v)=>a+v,0),1);assert.ok(b.every(v=>v>=-1e-8&&v<=1+1e-8));
  const reflected=circleReflect(r*Math.cos(theta),r*Math.sin(theta),d),other=foldTriangle(...reflected,d);near(q[0],other[0],1e-7);near(q[1],other[1],1e-7);
 }
});
test('disk translation is invertible and strip maps stay in the unit disk',()=>{
 for(let i=0;i<50;i++){const x=Math.cos(i)*.9,y=Math.sin(i)*.9,q=diskTranslate(x,y,.3,-.4),r=diskTranslate(...q,-.3,.4);near(x,r[0]);near(y,r[1]);assert.ok(Math.hypot(...q)<1);assert.ok(Math.hypot(...stripToDisk(i/10-2.5,.98))<1);}
});
test('Cahn-Hilliard conserves mass, leaves uniform phases stationary and lowers free energy',()=>{
 const w=32,h=32,u=Float64Array.from({length:w*h},(_,i)=>.15+.08*Math.sin(i*.781)+.15*Math.cos((i%w)*2*Math.PI/w));
 const next=evolvePhase(u,w,h,{steps:50,epsilon:1});near(u.reduce((a,b)=>a+b,0),next.reduce((a,b)=>a+b,0),1e-8);assert.ok(phaseEnergy(next,w,h)<phaseEnergy(u,w,h));assert.ok(next.every(Number.isFinite));
 const uniform=evolvePhase(new Float64Array(w*h).fill(.25),w,h,{steps:10});uniform.forEach(v=>near(v,.25));
});
test('oblique lattice symbols are positive and conjugate symmetric, including Nyquist axes',()=>{
 const w=32,h=16,k=latticeSymbols(w,h,4,.74,.7);assert.equal(k[0],0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){assert.ok(k[y*w+x]>=0);near(k[y*w+x],k[((h-y)%h)*w+(w-x)%w]);}
});
test('Kirchhoff quadrature matches a flat Gaussian and separates constructive and destructive orders',()=>{
 for(const q of [0,.04,.12]){const wave=.55,sigma=.8,value=coherentReflectance(0,wave,q,0,sigma,1.8,0);near(value,Math.exp(-4*Math.PI*Math.PI*sigma*sigma*q*q/(wave*wave)),.006);}
 const red=coherentReflectance(.45,.63,.3,0,.9,1.8,.3),blue=coherentReflectance(.45,.45,.3,0,.9,1.8,.3);assert.ok(Math.abs(red-blue)>.005);
 for(const depth of [0,.3,.8])for(const q of [-.5,0,.4]){const v=coherentReflectance(depth,.55,q,.07,.8,1.7,.3);assert.ok(v>=0&&v<=1);}
});
test('engine 0.10 gates new operators and preserves 0.9 microstructure plus 0.8 frontier loading',()=>{
 for(const id of ['hyperbolic','spinodal','wavebrdf']){const r=JSON.parse(encodeRecipe([makeLayer(id)]));assert.equal(decodeRecipe(JSON.stringify(r))[0].id,id);r.engine='0.9';assert.throws(()=>decodeRecipe(JSON.stringify(r)));}
 for(const [id,engine] of [['softcells','0.9'],['deposition','0.9'],['deposition','0.8']]){const r=JSON.parse(encodeRecipe([makeLayer(id)]));r.engine=engine;assert.equal(decodeRecipe(JSON.stringify(r))[0].id,id);}
});
test('periodic Fourier reflection agrees with dense quadrature and converges at deep fine grooves',()=>{
 for(const [depth,wave,pitch,shape,sigma] of [[.6,.55,1.7,.3,.8],[1.98,.42,.7,.65,2.64]]){
  const s=gratingSpectrum(depth,wave,pitch,shape,.7),fine=gratingSpectrum(depth,wave,pitch,shape,.7,512);
  for(const q of [-.8,-.3,0,.27,.65]){const v=spectrumReflectance(s,wave,q,0,sigma);near(v,spectrumReflectance(fine,wave,q,0,sigma),1e-8);near(v,coherentReflectance(depth,wave,q,0,sigma,pitch,shape,.7,8192),.005);}
 }
});
