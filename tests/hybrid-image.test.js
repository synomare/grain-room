import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {nativeBoxPass,nativeGaussian,gaussianBoxes,hybridMapping,hybridImage,hybridDefaults as D} from '../src/hybrid-image.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),byte=v=>new Uint8ClampedArray([v])[0];
const close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i-1:2*n-i-1;return i;};
test('rolling box blur matches a direct reflected-edge oracle, including radius beyond an axis',()=>{
 for(const [w,h]of [[1,1],[1,7],[8,1],[11,9]])for(const r of [0,1,5,19])for(const horizontal of [true,false]){
  const a=Float32Array.from({length:w*h},(_,i)=>Math.sin(i*1.7)),out=new Float32Array(a.length);nativeBoxPass(a,out,w,h,r,horizontal);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let s=0;for(let k=-r;k<=r;k++)s+=a[(horizontal?y:reflect(y+k,h))*w+(horizontal?reflect(x+k,w):x)];close(out[y*w+x],s/(2*r+1));}
 }
});
test('three-box Gaussian approximation preserves DC and finite normalized impulse mass',()=>{
 for(const sigma of [.1,1,3,8]){const w=101,h=101,a=new Float32Array(w*h).fill(.27),scratch=a.slice();nativeGaussian(a,scratch,w,h,sigma);assert.ok(a.every(v=>Math.abs(v-.27)<1e-7));a.fill(0);a[50*w+50]=1;nativeGaussian(a,scratch,w,h,sigma);close(a.reduce((s,v)=>s+v,0),1);assert.ok(a.every(v=>Number.isFinite(v)&&v>=0));const r=gaussianBoxes(sigma);assert.equal(r.length,3);assert.ok(r.every(Number.isInteger));}
});
test('blur suppresses fine cosine structure more than broad structure on an interior crop',()=>{
 const w=512,h=1,scratch=new Float32Array(w),ratio=cycles=>{const a=Float32Array.from({length:w},(_,x)=>.5+.2*Math.cos(2*Math.PI*cycles*x/w)),b=a.slice();nativeGaussian(b,scratch,w,h,6);let n=0,d=0;for(let x=64;x<w-64;x++){n+=(b[x]-.5)**2;d+=(a[x]-.5)**2;}return Math.sqrt(n/d);};assert.ok(ratio(2)>.97);assert.ok(ratio(48)<.05);
});
test('secondary sampling centre-covers different aspect ratios, with mirror before rotation',()=>{
 const p={...D,mirror:0},s={w:200,h:100};assert.deepEqual(hybridMapping(0,0,100,100,s,p),{x:50,y:0});assert.deepEqual(hybridMapping(99,99,100,100,s,p),{x:149,y:99});assert.deepEqual(hybridMapping(0,0,100,100,s,{...p,mirror:1}),{x:149,y:0});const q=hybridMapping(60,50,100,100,s,{...p,mirror:1,turn:90});close(q.x,99);close(q.y,39);
});
test('matching low and high cuts reconstruct the aligned original within one byte',()=>{
 const w=127,h=103,a=image(w,h),out=hybridImage(a,w,h,{mirror:0,nearColour:100,farGain:100,nearGain:100,farCut:16,nearCut:16});for(let i=0;i<a.length;i++)assert.ok(Math.abs(a[i]-out[i])<=1);
});
test('flat near photos have no fine component, and band isolation ignores the unused source',()=>{
 const w=128,h=96,a=image(w,h),b=new Uint8ClampedArray(21*17*4).fill(255),near={pixels:b,w:21,h:17},p={mirror:0};assert.deepEqual(hybridImage(a,w,h,p,near),hybridImage(a,w,h,{...p,viewBand:1},near));assert.deepEqual(hybridImage(a,w,h,{viewBand:1}),hybridImage(a,w,h,{viewBand:1,turn:73,zoom:200,nearColour:100},near));assert.deepEqual(hybridImage(a,w,h,{viewBand:2},near),hybridImage(a.map((v,i)=>i%4===3?255:255-v),w,h,{viewBand:2},near));
});
test('all twelve controls have reachable visible effects on the native output grid',()=>{
 const w=320,h=256,a=image(w,h),base=hybridImage(a,w,h),changes={farCut:4,nearCut:16,farGain:100,nearGain:200,farColour:0,nearColour:100,zoom:150,turn:23,offsetX:20,offsetY:20,mirror:0,viewBand:2};for(const[k,v]of Object.entries(changes))assert.notDeepEqual(base,hybridImage(a,w,h,{[k]:v}),k);assert.deepEqual(base,hybridImage(a,w,h,{seed:992}));
});
test('fine native pixels beyond 1536 remain observable, without mutating either source or Buffers',()=>{
 const w=1537,h=7,a=image(w,h),b=a.slice(),p={mirror:0,viewBand:2,nearColour:100},A=hybridImage(a,w,h,p);b[(3*w+w-2)*4]^=255;assert.notDeepEqual(A,hybridImage(a,w,h,p,{pixels:b,w,h}));const copy=b.slice();assert.deepEqual(hybridImage(a,w,h,p,{pixels:Buffer.from(b),w,h}),hybridImage(a,w,h,p,{pixels:b,w,h}));assert.deepEqual(b,copy);assert.deepEqual(a,image(w,h));
});
test('tiny axes and every bounded extreme return finite owned opaque pixels',()=>{
 for(const[w,h]of [[1,1],[1,19],[23,1],[31,29]])for(const extreme of [2,3]){const a=image(w,h),p=Object.fromEntries(filters.find(f=>f.hybridimage).controls.map(c=>[c[0],c[extreme]])),out=hybridImage(a,w,h,p,{pixels:image(7,11),w:7,h:11});assert.equal(out.length,a.length);assert.notEqual(out,a);assert.ok(out.every(Number.isFinite));for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);}
});
test('common colour processing applies independently to both photos, with final mix and inversion once',()=>{
 const w=71,h=53,a=image(w,h),b=image(43,61),l=makeLayer('hybridimage'),resources={near:{pixels:b,width:43,height:61}},p={...l.params,brightness:17,contrast:120,saturation:40},prep=(data,w,h)=>applyFilter(data,w,h,{id:'mono',params:{...p,mix:100,invert:false}}),out=applyFilter(a,w,h,{...l,params:p},resources);assert.deepEqual(out,hybridImage(prep(a,w,h),w,h,p,{pixels:prep(b,43,61),w:43,h:61}));const mixed=applyFilter(a,w,h,{...l,params:{...p,invert:true,mix:25}},resources);for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...p,mix:0}},resources),a);
 const mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono',nearColour:100}},resources);for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);
});
test('secondary alpha is flattened to white and malformed secondary sizes give a specific error',()=>{
 const a=image(47,31),l=makeLayer('hybridimage'),r=pixels=>({near:{pixels,width:2,height:2}});assert.deepEqual(applyFilter(a,47,31,l,r(new Uint8ClampedArray(16))),applyFilter(a,47,31,l,r(new Uint8ClampedArray(16).fill(255))));assert.throws(()=>applyFilter(a,47,31,l,{near:{width:3,height:2}}),/近くの写真/);assert.throws(()=>applyFilter(a,47,31,l,r(new Uint8ClampedArray(12))),/近くの写真/);
});
test('resources pass through stacks and cannot affect old filters',()=>{
 const w=71,h=53,a=image(w,h),r={near:{pixels:image(43,61),width:43,height:61}},old=makeLayer('mono'),l=makeLayer('hybridimage');l.params.nearCut=16;assert.deepEqual(applyFilter(a,w,h,old,r),applyFilter(a,w,h,old));assert.deepEqual(renderPipeline(a,w,h,[old,l],r),applyFilter(applyFilter(a,w,h,old),w,h,l,r));assert.notDeepEqual(renderPipeline(a,w,h,[l],r),renderPipeline(a,w,h,[l]));
});
test('0.60 gates the effect, preserves 0.59 windows, and recipes contain settings only',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.hybridimage),l=makeLayer(f.id);assert.equal(f.controls.length,12);assert.equal(f.random,false);assert.equal(looks.filter(l=>l.hybridimage).length,3);for(let n=2;n<60;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('contextwindows');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.59'})),[old]);assert.deepEqual(Object.keys(JSON.parse(encodeRecipe([l]))).sort(),['app','engine','layers','version']);
 for(const[k,,lo,hi,step]of f.controls)for(const v of [lo-step,hi+step,lo+step*.5])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[k]:v}}])),k);
 for(const look of looks.filter(l=>l.hybridimage)){assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8')),look.layers);assert.deepEqual(decodeRecipe(encodeRecipe(look.layers)),look.layers);}
});
