import test from 'node:test';
import assert from 'node:assert/strict';
import {siteMetric,siteLogit,softWeights,candidateField,fitSiteColors} from '../src/microstructure-sad.js';
import {noiseMetric,steerNoise} from '../src/microstructure-steer.js';
import {harmonicBlend} from '../src/microstructure-gabor.js';
import {phaseValue,phaseDerivative} from '../src/microstructure-phasor.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {decodeRecipe,encodeRecipe} from '../src/recipes.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('anisotropic site metrics preserve determinant one and positive norms',()=>{
 for(const angle of [0,.3,1.2,2.7])for(const aspect of [1,3,10]){
  const G=siteMetric(angle,aspect);near(G[0]*G[2]-G[1]*G[1],1);assert.ok(G[0]>0&&G[2]>0);
  const score=siteLogit({x:2,y:3,G,radius:1,tau:2},2,3);near(score,2);
 }
 const w=softWeights([1000,999,-1000]);near(w.reduce((a,b)=>a+b,0),1);assert.ok(w.every(Number.isFinite));assert.ok(w[0]>w[1]);
});
test('top-K propagation recovers at least 97 percent of exhaustive anisotropic candidates',()=>{
 const w=43,h=31,K=4,sites=Array.from({length:18},(_,i)=>({x:(i*17+3)%w,y:(i*11+5)%h,G:siteMetric(i*.61,1+i%5),radius:i%3,tau:.5+i%4*.1})),ids=candidateField(sites,w,h,K);let hits=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const expected=sites.map((s,i)=>({i,v:siteLogit(s,x,y)})).sort((a,b)=>b.v-a.v||a.i-b.i).slice(0,K).map(v=>v.i),actual=Array.from(ids.slice((y*w+x)*K,(y*w+x+1)*K));
  assert.equal(new Set(actual).size,K);hits+=actual.filter(i=>expected.includes(i)).length;
 }assert.ok(hits/(w*h*K)>.97,String(hits/(w*h*K)));
});
test('color fitting decreases squared residual and recovers a known soft mixture',()=>{
 const K=2,ids=Int32Array.from({length:64*2},(_,i)=>i%2),weights=Float64Array.from({length:128},(_,i)=>i%2?1-Math.floor(i/2)/63:Math.floor(i/2)/63);
 const truth=[[.2,.8],[.7,.1],[.3,.55]],target=truth.map(pair=>Float64Array.from({length:64},(_,i)=>weights[i*2]*pair[0]+weights[i*2+1]*pair[1])),initial=truth.map(()=>Float64Array.from([.5,.5]));
 const error=colors=>target.reduce((total,channel,c)=>total+channel.reduce((sum,v,i)=>sum+(v-weights[i*2]*colors[c][0]-weights[i*2+1]*colors[c][1])**2,0),0);
 const one=fitSiteColors(ids,weights,target,2,K,initial,1),many=fitSiteColors(ids,weights,target,2,K,initial,30);
 assert.ok(error(one)<error(initial));assert.ok(error(many)<error(one)*1e-8);
 truth.forEach((pair,c)=>pair.forEach((v,i)=>near(many[c][i],v,2e-6)));
});
test('steerable metric maintains positive corner coverage and continuous noise',()=>{
 for(const strength of [0,.5,1])for(const angle of [0,.37,1.9]){
  const G=noiseMetric(angle,strength);assert.ok(G[0]+G[2]<4);assert.ok(G[0]*G[2]-G[1]*G[1]>0);
  for(let y=0;y<=20;y++)for(let x=0;x<=20;x++){const n=steerNoise(x/20,y/20,G);assert.ok(n.mass>0);assert.ok(Number.isFinite(n.value));}
  for(const y of [.15,.5,.88])near(steerNoise(1-1e-7,y,G).value,steerNoise(1+1e-7,y,G).value,1e-6);
 }
});
test('Gabor harmonics preserve phase shifts, weighted bounds, and frequency attenuation',()=>{
 const f=[1,2,3,4],phase=[.2,.3,.4,.5],weights=[.08,.2,1,.15];
 for(let i=0;i<60;i++){const a=harmonicBlend(i*.07,i*.13,f,phase,weights),b=harmonicBlend(i*.07,i*.13,f,phase.map(v=>v+Math.PI),weights);near(a,-b);assert.ok(Math.abs(a)<=1);near(harmonicBlend(i*.07,i*.13,f,phase,weights.map(v=>v*.2),1.43),a*.2);}
});
test('phasor phase rejects amplitude scaling and its derivative matches finite differences',()=>{
 for(const theta of [-2.8,-1,.3,2]){
  const r=Math.cos(theta)*2,s=Math.sin(theta)*2;near(phaseValue(r,s),theta);near(phaseValue(r*7,s*7),theta);
  const e=1e-6,dre=.7,dim=-.3,fd=(phaseValue(r+e*dre,s+e*dim)-phaseValue(r-e*dre,s-e*dim))/(2*e);near(phaseDerivative(r,s,dre,dim),fd);
 }assert.equal(phaseDerivative(0,0,1,1),0);
});
test('new recipe version accepts existing frontier and rejects microstructure in older engines',()=>{
 for(const id of ['softcells','steergrain','gaborcloth','phasorweave']){
  const recipe=JSON.parse(encodeRecipe([makeLayer(id)]));assert.equal(decodeRecipe(JSON.stringify(recipe))[0].id,id);recipe.engine='0.8';assert.throws(()=>decodeRecipe(JSON.stringify(recipe)));
 }
 const previous=JSON.parse(encodeRecipe([makeLayer('deposition')]));previous.engine='0.8';assert.equal(decodeRecipe(JSON.stringify(previous))[0].id,'deposition');
});
test('microrelief with zero lighting and displacement preserves exact source',()=>{
 const w=23,h=31,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:i*13%256),layer=makeLayer('steergrain');layer.params.relief=0;layer.params.displace=0;assert.deepEqual(applyFilter(a,w,h,layer),a);
});
