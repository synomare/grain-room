import test from 'node:test';
import assert from 'node:assert/strict';
import {multigridTiles,barycentric} from '../src/aperiodic-tiles.js';
import {makeWaveProfile,periodicWave,waveField} from '../src/aperiodic-wave.js';
import {evolveResonance} from '../src/aperiodic-resonance.js';
import {fft2} from '../src/research-spectral.js';
import {makeLayer} from '../src/filters.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('multigrid prototiles have unit edges, correct area and cover the interior exactly once',()=>{
 for(const N of [4,5,7]){
  const tiles=multigridTiles(N,6,17),keys=new Set();
  for(const t of tiles){assert.ok(!keys.has(t.key+':'+t.i+':'+t.j));keys.add(t.key+':'+t.i+':'+t.j);for(let k=0;k<4;k++){const a=t.vertices[k],b=t.vertices[(k+1)%4];near(Math.hypot(a[0]-b[0],a[1]-b[1]),1);}assert.ok(t.area>.4);}
  for(let k=0;k<100;k++){
   const x=Math.sin(k*12.7)*3.7+.0123,y=Math.cos(k*8.13)*3.7+.047;let count=0;
   for(const t of tiles)if([[0,1,2],[0,2,3]].some(ids=>{const b=barycentric(x,y,...ids.map(i=>t.vertices[i]));return b&&Math.min(...b)>-1e-10;}))count++;
   assert.equal(count,1,`N=${N} point ${x},${y} coverage`);
  }
 }
});
test('precomputed complex wave matches direct spectral synthesis and has unit average power',()=>{
 const p=makeWaveProfile(24,7,17),size=p.size;let power=0;
 for(let i=0;i<size;i++)power+=p.re[i]**2+p.im[i]**2;near(power/size,1,1e-10);
 for(const t of [.123,.519,-.035,2.829]){
  let real=0,imag=0;for(const [k,a,phase] of p.terms){real+=a*Math.cos(2*Math.PI*k*t+phase);imag+=a*Math.sin(2*Math.PI*k*t+phase);}
  near(periodicWave(p.re,t),real,.004);near(periodicWave(p.im,t),imag,.004);near(periodicWave(p.re,t),periodicWave(p.re,t+3));
 }
});
test('wave combination agrees with a single direction and minimum ordering',()=>{
 const p=makeWaveProfile(24,5,22),d=[[1,0,.12,1]],t=.31,q=waveField(p,t,.4,d);
 near(q[0],periodicWave(p.re,t+.12));near(q[1],periodicWave(p.im,t+.12));
 const m=waveField(p,.3,.7,[[1,0,0,1],[0,1,.3,1],[.6,.8,.6,1]],3);assert.ok(m[0]>=0&&m[1]>=m[0]&&m[2]>=0&&m[2]<3);
});
test('complex wave spatial gradients agree with a finite-difference reference',()=>{
 const p=makeWaveProfile(24,6,18),d=[[1,0,.12,1],[0,1,.2,.6],[.6,.8,.7,.7]],x=.23,y=.371,e=1e-7,q=waveField(p,x,y,d,1,true),xp=waveField(p,x+e,y,d),xm=waveField(p,x-e,y,d),yp=waveField(p,x,y+e,d),ym=waveField(p,x,y-e,d);
 near(q[3],(xp[0]-xm[0])/(2*e),1e-5);near(q[4],(yp[0]-ym[0])/(2*e),1e-5);near(q[5],(xp[1]-xm[1])/(2*e),1e-5);near(q[6],(yp[1]-ym[1])/(2*e),1e-5);
});
test('Swift-Hohenberg semi-implicit step has the correct Fourier amplification',()=>{
 const w=32,h=16,A=.2,mode=3,k=2*Math.PI*mode/w,k0=.7,dt=.35,growth=.4,u=Float64Array.from({length:w*h},(_,i)=>A*Math.cos(2*Math.PI*mode*(i%w)/w));
 const r=evolveResonance(u,w,h,{steps:1,k0,dt,growth});let amplitude=0,third=0;
 for(let i=0;i<r.length;i++){amplitude+=r[i]*Math.cos(k*(i%w))*2/r.length;third+=r[i]*Math.cos(3*k*(i%w))*2/r.length;}
 near(amplitude,(A+dt*(growth*A-.75*A**3))/(1+dt*(k0*k0-k*k)**2));near(third,(-dt*.25*A**3)/(1+dt*(k0*k0-9*k*k)**2));
});
test('Swift-Hohenberg zero state is fixed and constant coefficient energy decreases',()=>{
 const w=32,h=32,n=w*h,u=Float64Array.from({length:n},(_,i)=>.1*Math.sin(i*.193)+.09*Math.cos(i*.871)),k0=.7,growth=.35;
 const energy=a=>{const r=Float64Array.from(a),im=new Float64Array(n);fft2(r,im,w,h);let e=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,kx=2*Math.PI*(x<=w/2?x:x-w)/w,ky=2*Math.PI*(y<=h/2?y:y-h)/h;e+=(k0*k0-kx*kx-ky*ky)**2*(r[i]**2+im[i]**2)/(2*n);}for(const v of a)e+=v**4/4-growth*v*v/2;return e;};
 const next=evolveResonance(u,w,h,{steps:50,k0,growth});assert.ok(energy(next)<energy(u));assert.ok(next.every(Number.isFinite));assert.ok(evolveResonance(new Float64Array(n),w,h).every(v=>v===0));
});
test('new engine preserves every recent generation and rejects older tags on new operators',()=>{
 for(const [id,version] of [['hyperbolic','0.10'],['wavebrdf','0.10'],['softcells','0.9'],['deposition','0.8']]){const r=JSON.parse(encodeRecipe([makeLayer(id)]));r.engine=version;assert.equal(decodeRecipe(JSON.stringify(r))[0].id,id);}
 for(const id of ['quasicut','waveweft','resonant']){const r=JSON.parse(encodeRecipe([makeLayer(id)]));r.engine='0.11';assert.equal(decodeRecipe(JSON.stringify(r))[0].id,id);r.engine='0.10';assert.throws(()=>decodeRecipe(JSON.stringify(r)));}
});
