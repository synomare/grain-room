import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceFlux,crystalForce,crystalEnergy,crystalStep,evolveCrystal,latentPotential} from '../src/crystal-growth.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('crystal interfacial flux is the derivative of anisotropic energy',()=>{
 const energy=(x,y,s,m,angle)=>.5*(1+s*Math.cos(m*(Math.atan2(y,x)-angle)))**2*(x*x+y*y),eps=1e-6;
 for(const m of [4,5,6])for(const s of [0,.03,.1])for(const [x,y] of [[.2,.7],[-.6,.15],[.33,-.51]]){
  const [fx,fy]=interfaceFlux(x,y,s,m,.27);
  near(fx,(energy(x+eps,y,s,m,.27)-energy(x-eps,y,s,m,.27))/(2*eps));
  near(fy,(energy(x,y+eps,s,m,.27)-energy(x,y-eps,s,m,.27))/(2*eps));
 }
 assert.deepEqual(interfaceFlux(0,0),[0,0]);
});
test('discrete crystal force matches the energy gradient including edges and corners',()=>{
 const w=7,h=9,a=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.71)*.8),p={strength:.08,folds:6,angle:.4},force=crystalForce(a,w,h,p),eps=1e-6;
 for(const i of [0,6,18,31,56,62]){const plus=a.slice(),minus=a.slice();plus[i]+=eps;minus[i]-=eps;near(force[i],-(crystalEnergy(plus,w,h,p)-crystalEnergy(minus,w,h,p))/(2*eps),1e-6);}
 const next=crystalStep(a,new Float64Array(a.length),w,h,{...p,dt:.001});
 assert.ok(crystalEnergy(next.phi,w,h,p)<crystalEnergy(a,w,h,p));
});
test('no-flux heat and exact latent increment preserve total discrete enthalpy',()=>{
 for(const [w,h] of [[1,1],[1,11],[13,1],[7,9]]){
  let phi=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.5)*.6),temperature=Float64Array.from(phi,(_,i)=>-.4+Math.cos(i)*.1);const latent=.9;
  const total=(p,t)=>t.reduce((s,v,i)=>s+v-latent*latentPotential(p[i]),0),before=total(phi,temperature);
  for(let i=0;i<20;i++)({phi,temperature}=crystalStep(phi,temperature,w,h,{latent,dt:.02}));
  near(total(phi,temperature),before,1e-9);
 }
});
test('crystal growth is deterministic, remains bounded, and latent heat slows growth',()=>{
 const w=32,h=40,photo=new Float32Array(w*h).fill(.8),opts={steps:300,nuclei:4,cold:.6,strength:.07};
 const a=evolveCrystal(photo,w,h,{...opts,latent:.3}),b=evolveCrystal(photo,w,h,{...opts,latent:1.3});
 assert.deepEqual(a,evolveCrystal(photo,w,h,{...opts,latent:.3}));
 for(const r of [a,b]){assert.ok(r.phi.every(v=>Number.isFinite(v)&&v>=-1&&v<=1));assert.ok(r.temperature.every(Number.isFinite));}
 assert.ok(a.phi.reduce((s,v)=>s+v,0)>b.phi.reduce((s,v)=>s+v,0));
 assert.notDeepEqual(a,evolveCrystal(photo,w,h,{...opts,latent:.3,seed:311}));
});
test('crystal recipes preserve 0.13 compatibility while rejecting legacy claims for the new effect',()=>{
 const layers=[makeLayer('crystallize')],r=JSON.parse(encodeRecipe(layers));assert.equal(r.engine,ENGINE_VERSION);assert.deepEqual(decodeRecipe(JSON.stringify(r)),layers);
 for(const engine of ['0.2','0.8','0.12','0.13'])assert.throws(()=>decodeRecipe(JSON.stringify({...r,engine})));
 for(const id of ['inksearch','metametric','fungal','porous','waveweft','flow']){const old=[makeLayer(id)];assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe(old)),engine:'0.13'})),old);}
 for(const value of [NaN,-1,225]){const bad=structuredClone(r);bad.layers[0].params.scale=value;assert.throws(()=>decodeRecipe(JSON.stringify(bad)));}
});
test('crystal rendering supports slender images, real monochrome and exact zero mix',()=>{
 for(const [w,h] of [[1,1],[1,23],[29,1],[23,31]]){
  const a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*19)%256),original=a.slice(),layer=makeLayer('crystallize');layer.params.time=5;layer.params.scale=64;
  const out=applyFilter(a,w,h,layer);assert.equal(out.length,a.length);assert.deepEqual(a,original);
  for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
  layer.params.colorMode='mono';const mono=applyFilter(a,w,h,layer);for(let i=0;i<mono.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);}
  layer.params.mix=0;assert.deepEqual(applyFilter(a,w,h,layer),a);
 }
});