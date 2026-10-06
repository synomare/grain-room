import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {heatStitchDefaults as defaults,stitchBits,stitchPattern,heatKernel,heatField,rotatedHeat,heatScene,heatSourceCoordinates,stitchCoverage,heatStitches} from '../src/heat-stitches.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w);return [255*x/Math.max(1,w-1),255*y/Math.max(1,h-1),128+90*Math.sin(x/23+y/29),255][i%4];});
const byte=v=>new Uint8ClampedArray([v])[0];

// Numerical radial integration avoids the implementation's closed-form self term.
function selfIntegral(K,lambda){
 const N=4096,R=1/(Math.sqrt(Math.PI)*K),step=R/N,out=[0,0];
 for(let j=0;j<=N;j++){const r=j*step,weight=j===0||j===N?1:j%2?4:2,e=2*Math.PI*Math.exp(-r/lambda);out[0]+=weight*e*Math.cos(r/lambda);out[1]-=weight*e*Math.sin(r/lambda);}
 return out.map(v=>v*step/3);
}
function kernel(dx,dy,K,lambda){const d=Math.sqrt(dx*dx+dy*dy)/K;if(!d)return selfIntegral(K,lambda);const amplitude=Math.exp(-d/lambda)/(K*K*d);return [amplitude*Math.cos(d/lambda),-amplitude*Math.sin(d/lambda)];}

test('correlated bit runs have declared limits and independent axis reflection',()=>{
 for(const seed of [1,17,91])for(const axis of [0,1]){
  const constant=stitchBits(11,{...defaults,seed,flip:0,mirror:0},axis),alternating=stitchBits(11,{...defaults,seed,flip:100,mirror:0},axis);assert.ok(constant.every(v=>v===constant[0]));alternating.forEach((v,i)=>assert.equal(v,alternating[0]^(i%2)));
  for(const mirror of [1,2,3]){const bits=stitchBits(11,{...defaults,seed,mirror},axis);assert.deepEqual(bits,stitchBits(11,{...defaults,seed,mirror},axis));if(mirror&(axis?2:1))assert.deepEqual([...bits],[...bits].reverse());}
 }
});

test('every interior node has degree two and adjacent cell colours flip exactly across stitches',()=>{
 for(const [n,m] of [[3,3],[7,5],[11,17]])for(const seed of [1,17,91])for(const mirror of [0,3]){
  const g=stitchPattern(n,m,{...defaults,seed,mirror});assert.equal(g.activity[0],1);
  for(let y=1;y<m;y++)for(let x=1;x<n;x++)assert.equal(Number(g.xb[x]===y%2)+Number(g.xb[x]===(y-1)%2)+Number(g.yb[y]===x%2)+Number(g.yb[y]===(x-1)%2),2);
  for(let y=0;y<m;y++)for(let x=0;x<n;x++){if(x)assert.equal(g.activity[y*n+x]^g.activity[y*n+x-1],Number(g.xb[x]===y%2));if(y)assert.equal(g.activity[y*n+x]^g.activity[(y-1)*n+x],Number(g.yb[y]===x%2));}
  const dual=stitchPattern(n,m,{...defaults,seed,mirror,dual:1});g.activity.forEach((v,i)=>assert.equal(v+dual.activity[i],1));
 }
});

test('odd reflected domains have reflected activities and image-aspect grids stay bounded',()=>{
 for(const [w,h] of [[320,180],[180,320],[1,1703],[1703,1]])for(const aspect of [-100,0,100]){
  const g=heatScene(w,h,{...defaults,aspect,cells:7}).pattern;assert.ok(g.n>=3&&g.n<=25&&g.m>=3&&g.m<=25);assert.equal(g.n%2,1);assert.equal(g.m%2,1);
  for(let y=0;y<g.m;y++)for(let x=0;x<g.n;x++){assert.equal(g.activity[y*g.n+x],g.activity[y*g.n+g.n-1-x]);assert.equal(g.activity[y*g.n+x],g.activity[(g.m-1-y)*g.n+x]);}
 }
});

test('weighted half-space kernels match the Green function and a numerically integrated self disk',()=>{
 for(const K of [1,2,12])for(const lambda of [.2,2,5])for(const [dx,dy] of [[0,0],[1,0],[3,4],[-2,5]]){
  const a=heatKernel(dx,dy,K,lambda),b=kernel(dx,dy,K,lambda);a.forEach((v,c)=>near(v,b[c],1e-10));assert.ok(a.every(Number.isFinite));assert.deepEqual(a,heatKernel(-dx,-dy,K,lambda));
 }
});

test('zero-padded FFT fields equal direct finite-rectangle source superposition',()=>{
 for(const lambda of [.2,2,5]){
  const K=2,g=stitchPattern(3,5,{...defaults,mirror:0}),copy=g.activity.slice(),f=heatField(g,K,lambda),self=selfIntegral(K,lambda);
  for(let y=0;y<f.h;y++)for(let x=0;x<f.w;x++){
   const sum=[0,0];for(let sy=0;sy<f.h;sy++)for(let sx=0;sx<f.w;sx++)if(g.activity[Math.floor(sy/K)*g.n+Math.floor(sx/K)]){const q=x===sx&&y===sy?self:kernel(x-sx,y-sy,K,lambda);q.forEach((v,c)=>sum[c]+=v);}
   near(f.re[y*f.w+x],sum[0],1e-10);near(f.im[y*f.w+x],sum[1],1e-10);
  }
  assert.deepEqual(g.activity,copy);
 }
});

test('a single edge source does not wrap to the opposite side of the domain',()=>{
 const g={n:7,m:3,activity:new Uint8Array(21)};g.activity[0]=1;const f=heatField(g,1,.2),copy=g.activity.slice();
 for(let y=0;y<3;y++)for(let x=0;x<7;x++){const q=kernel(x,y,1,.2);near(f.re[y*7+x],q[0],1e-10);near(f.im[y*7+x],q[1],1e-10);}
 assert.ok(Math.hypot(f.re[6],f.im[6])<1e-12);assert.deepEqual(g.activity,copy);
});

test('phase rotates the complex field and normalizes each component without modifying it',()=>{
 const f={w:2,h:2,re:Float64Array.from([1,2,3,4]),im:Float64Array.from([-2,-1,0,1])},copy={re:f.re.slice(),im:f.im.slice()},q=rotatedHeat(f,90);q.re.forEach((v,i)=>near(v,-f.im[i]));q.im.forEach((v,i)=>near(v,f.re[i]));near(q.rmin,-1);near(q.rmax,2);near(q.imin,1);near(q.imax,4);assert.deepEqual(f.re,copy.re);assert.deepEqual(f.im,copy.im);
 const a=heatField({n:3,m:3,activity:Uint8Array.from([1,0,0,0,0,0,0,0,0])},2,2),b=heatField({n:3,m:3,activity:Uint8Array.from([1,0,0,0,0,0,0,0,1])},2,2);assert.ok(b.re[0]>a.re[0]);assert.ok(rotatedHeat(a,7).rmin!==rotatedHeat(b,7).rmin);
});

test('source coordinates use both original axes, all reversals and stable constant-field fallback',()=>{
 const f={w:2,h:2,re:Float64Array.from([0,1,0,1]),im:Float64Array.from([0,0,1,1]),rmin:0,rmax:1,imin:0,imax:1};
 for(const axes of [0,1,2,3])assert.deepEqual(heatSourceCoordinates(.25,.25,1537,7,f,axes),[axes&1?1536:0,axes&2?6:0]);
 assert.deepEqual(heatSourceCoordinates(.5,.5,1537,7,f,0),[768,3]);assert.deepEqual(heatSourceCoordinates(0,1,1537,7,{...f,re:new Float64Array(4),im:new Float64Array(4),rmin:0,rmax:0,imin:0,imax:0},3),[768,3]);
});

test('pruned native stitch capsules equal independent distance to all finite segments',()=>{
 const g=stitchPattern(7,5,defaults);
 for(const [w,h,repeat,width] of [[91,65,1,2.5],[31,19,5,8],[1,19,5,8]])for(const [u,v] of [[0,0],[.02,.09],[.499,.501],[.93,.77],[.999,.999]]){
  const p={...defaults,repeat,width},cw=w/(g.n*repeat),ch=h/(g.m*repeat),X=u*g.n*cw,Y=v*g.m*ch;let distance=Infinity;
  function segment(ax,ay,bx,by){const dx=bx-ax,dy=by-ay,dot=(X-ax)*dx+(Y-ay)*dy,L=dx*dx+dy*dy;const d=dot<=0?Math.hypot(X-ax,Y-ay):dot>=L?Math.hypot(X-bx,Y-by):Math.abs(dx*(Y-ay)-dy*(X-ax))/Math.sqrt(L);distance=Math.min(distance,d);}
  for(let x=0;x<=g.n;x++)for(let y=0;y<g.m;y++)if(g.xb[x]===y%2)segment(x*cw,y*ch,x*cw,(y+1)*ch);for(let y=0;y<=g.m;y++)for(let x=0;x<g.n;x++)if(g.yb[y]===x%2)segment(x*cw,y*ch,(x+1)*cw,y*ch);
  near(stitchCoverage(u,v,w,h,g,p),Math.min(1,Math.max(0,Math.max(w,h)*width/2000+.5-distance)));
 }
});

test('thirteen controls and the shared seed change active native views',()=>{
 const w=160,h=120,a=image(w,h),p={...defaults,stitches:60},out=heatStitches(a,w,h,p);
 for(const [key,value] of Object.entries({cells:21,aspect:70,flip:30,mirror:0,dual:1,diffusion:400,phase:50,axes:3,repeat:2,angle:37,retain:60,stitches:100,width:6,seed:91}))assert.ok(heatStitches(a,w,h,{...p,[key]:value}).some((v,i)=>v!==out[i]),key);
});

test('invisible stitches, restored photo geometry and rounded grids have declared neutral settings',()=>{
 const w=60,h=90,a=image(w,h),render=p=>heatStitches(a,w,h,{...defaults,...p});
 assert.deepEqual(render({stitches:0,width:.5}),render({stitches:0,width:8}));assert.deepEqual(render({retain:100,stitches:0}),a);assert.deepEqual(render({retain:100,stitches:0,seed:91,dual:1,phase:80,repeat:5,angle:90}),a);
 assert.deepEqual(render({cells:18}),render({cells:19}));assert.deepEqual(render({aspect:-1}),render({aspect:0}));assert.deepEqual(render({phase:-180}),render({phase:180}));
});

test('tiny axes, rotated repeated extremes and image replacement remain finite opaque repeatable',()=>{
 for(const [w,h] of [[1,1],[1,17],[19,1],[27,21]]){
  const a=image(w,h),copy=a.slice(),p={...defaults,cells:7,aspect:100,flip:100,mirror:0,dual:1,diffusion:20,phase:-180,axes:3,repeat:5,angle:90,retain:50,stitches:100,width:8},out=heatStitches(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));heatStitches(image(h,w),h,w,p);assert.deepEqual(out,heatStitches(a,w,h,p));assert.deepEqual(a,copy);
 }
});

test('original source detail beyond 1536, engine transparency mono inverse mix and looks replay survive',()=>{
 const w=1537,h=7,a=image(w,h),l=makeLayer('heatstitches'),out=applyFilter(a,w,h,l);assert.deepEqual(out,heatStitches(a,w,h,l.params));const b=a.slice();for(let y=0;y<h;y++)for(let x=w-16;x<w;x++)b[(y*w+x)*4]=0;assert.ok(applyFilter(b,w,h,l).some((v,i)=>v!==out[i]));
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray([1,73,201,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));
 for(const look of looks.filter(l=>l.heatstitches))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});

test('0.56 gates heat stitches, accepts 0.55 orbits and validates all controls and public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.heatstitches),l=makeLayer(f.id);assert.equal(f.controls.length,13);assert.equal(f.random,true);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=55;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('ellipticorbits');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.55'})),[old]);
 for(const [key,value] of [['cells',6],['cells',25.5],['aspect',101],['flip',-1],['mirror',4],['dual',2],['diffusion',19],['phase',181],['axes',-1],['repeat',6],['angle',181],['retain',101],['stitches',-1],['width',8.5],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])),key);
 const files=fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'));assert.equal(files.length,234);for(const file of files){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);}
});
