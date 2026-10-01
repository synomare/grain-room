import test from 'node:test';
import assert from 'node:assert/strict';
import {fft,fft2} from '../src/research-spectral.js';
import {project,divergence} from '../src/research-fluid.js';
import {filmSpectrum} from '../src/research-optics.js';
import {makeLayer,filters} from '../src/filters.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const pixels=(w,h)=>{const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;a[i]=(x*7+y*3)%256;a[i+1]=(y*8)%256;a[i+2]=(x*y)%256;a[i+3]=255;}return a;};
test('FFT round trips complex data and preserves Parseval energy',()=>{
 const n=64,re=Float64Array.from({length:n},(_,i)=>Math.sin(i*.35)+i/100),im=Float64Array.from({length:n},(_,i)=>Math.cos(i*.19)),r=re.slice(),q=im.slice();
 const energy=re.reduce((sum,v,i)=>sum+v*v+im[i]*im[i],0);fft(re,im);
 const frequencyEnergy=re.reduce((sum,v,i)=>sum+v*v+im[i]*im[i],0)/n;
 assert.ok(Math.abs(energy-frequencyEnergy)<1e-8);fft(re,im,true);
 for(let i=0;i<n;i++){assert.ok(Math.abs(re[i]-r[i])<1e-10);assert.ok(Math.abs(im[i]-q[i])<1e-10);}
 assert.throws(()=>fft(new Float64Array(3),new Float64Array(3)));
});
test('rectangular 2D FFT recovers both real and imaginary input',()=>{
 const w=32,h=16,re=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.4)),im=Float64Array.from({length:w*h},(_,i)=>Math.cos(i*.11)),a=re.slice(),b=im.slice();
 fft2(re,im,w,h);fft2(re,im,w,h,true);
 for(let i=0;i<re.length;i++){assert.ok(Math.abs(re[i]-a[i])<1e-10);assert.ok(Math.abs(im[i]-b[i])<1e-10);}
});
test('pressure projection reduces divergence of a smooth bounded velocity field',()=>{
 const w=40,h=36,u=new Float32Array(w*h),v=u.slice();
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;u[i]=Math.sin(x/(w-1)*Math.PI)*Math.sin(y/(h-1)*Math.PI*2);v[i]=Math.sin(y/(h-1)*Math.PI)*Math.cos(x/(w-1)*Math.PI*2);}
 const norm=a=>Math.sqrt(a.reduce((s,v)=>s+v*v,0)/a.length),before=norm(divergence(u,v,w,h));
 project(u,v,w,h,160);const after=norm(divergence(u,v,w,h));
 assert.ok(after<before*.55,'Divergence '+before+' -> '+after);
 for(let x=0;x<w;x++){assert.equal(v[x],0);assert.equal(v[(h-1)*w+x],0);}
});
test('multiwavelength film is bounded and responds to thickness and view angle',()=>{
 for(const t of [80,420,1200])for(const cosine of [.05,.5,1])for(const v of filmSpectrum(t,cosine))assert.ok(Number.isFinite(v)&&v>=0&&v<=1);
 assert.notDeepEqual(filmSpectrum(200,.8),filmSpectrum(450,.8));assert.notDeepEqual(filmSpectrum(200,.8),filmSpectrum(200,.2));
 const zero=filmSpectrum(0,1);for(const value of zero)assert.ok(Math.abs(value-((1-2.4)/(1+2.4))**2)<1e-10);
});
test('neutral physical controls retain exact source pixels',()=>{
 const a=pixels(48,64);
 for(const [id,key] of [['fluid','force'],['spectral','shift'],['diffraction','distance'],['caustic','focus']]){const layer=makeLayer(id);layer.params[key]=0;assert.deepEqual(applyFilter(a,48,64,layer),a,id);}
});
test('all seeded research operators change with seed and preserve deterministic replay',()=>{
 const a=pixels(60,80);
 for(const f of filters.filter(f=>f.research&&f.random)){const one=makeLayer(f.id),two=makeLayer(f.id);two.params.seed=311;const result=applyFilter(a,60,80,one);assert.notDeepEqual(result,applyFilter(a,60,80,two),f.id);assert.deepEqual(result,applyFilter(a,60,80,one),f.id);}
});
test('all curated looks round trip, preserve their order, and replay exact output',()=>{
 const a=pixels(36,48);
 for(const look of looks){const restored=decodeRecipe(encodeRecipe(look.layers));assert.deepEqual(restored,look.layers);assert.deepEqual(renderPipeline(a,36,48,restored),renderPipeline(a,36,48,look.layers));}
});
test('legacy 0.2 recipes load while incompatible research claims are rejected',()=>{
 const old=[makeLayer('flow'),makeLayer('prism')],json=JSON.parse(encodeRecipe(old));json.engine='0.2';assert.deepEqual(decodeRecipe(JSON.stringify(json)),old);
 json.layers=[makeLayer('fluid')];assert.throws(()=>decodeRecipe(JSON.stringify(json)));
});
