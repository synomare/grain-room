import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{rasterDefaults,rasterHeight,rasterProjection,rasterMesh,rasterRender,rasterRelief}from'../src/raster-relief.js';
import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter,renderPipeline}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),q=(p={})=>({...rasterDefaults,...p}),close=(a,b,e=1e-4)=>assert.ok(Math.abs(a-b)<e,`${a} / ${b}`),byte=v=>new Uint8ClampedArray([v])[0];
const flat=q({height:0,smooth:0,band:100,tilt:0,turn:0,size:100,light:0,lift:0});
test('native heights follow independent luminance, gamma, short-side scale and polarity',()=>{
 const w=17,h=11,a=image(w,h),p=q({smooth:0,gamma:200,height:60}),f=rasterHeight(a,w,h,p),inverse=rasterHeight(a,w,h,{...p,reverse:1});assert.equal(f.length,w*h);
 for(let j=0;j<f.length;j++){const i=j*4,l=(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;close(f[j],(l*l-.5)*h*.6);close(inverse[j],-f[j]);}assert.deepEqual(a,image(w,h));
});
test('smoothing retains DC heights, and zero-height does not depend on image or bias',()=>{
 const w=97,h=53,a=new Uint8ClampedArray(w*h*4).fill(128),p=q({smooth:30,gamma:100,height:80}),f=rasterHeight(a,w,h,p);for(const z of f)close(z,(128/255-.5)*h*.8);assert.ok(rasterHeight(image(w,h),w,h,q({height:0,gamma:40,reverse:1})).every(z=>z===0));
});
test('camera rotation matches known orthographic axes and preserves distances',()=>{
 const w=20,h=10,p=q({turn:90,tilt:90}),A=rasterProjection(13,7,5,w,h,p);close(A[0],-2);close(A[1],-5);close(A[2],3);const B=rasterProjection(8,1,-4,w,h,p);close(Math.hypot(...A.map((v,i)=>v-B[i])),Math.hypot(5,6,9));
 const C=rasterProjection(13,7,5,w,h,q({turn:0,tilt:0}));assert.deepEqual(C,[3,2,5]);
});
test('strip geometry clips the final interval, excludes gaps and uses two-native-pixel segments',()=>{
 const w=13,h=11,p=q({spacing:300,band:50,turn:0,tilt:0,height:0,size:100}),m=rasterMesh(new Float32Array(w*h),w,h,p);assert.equal(m.period,3.9);assert.equal(m.rows,3);assert.equal(m.nx,7);assert.equal(m.indices.length,3*7*6);
 // The texture coordinate plus .5 is a source boundary coordinate.
 close(m.vertices[4]+.5,.975);close(m.vertices[(m.nx+1)*6+4]+.5,2.925);close(m.vertices[((m.rows-1)*(m.nx+1)*2)*6+4]+.5,8.6);close(m.vertices[((m.rows-1)*(m.nx+1)*2+m.nx+1)*6+4]+.5,10.2);
 const n=rasterMesh(new Float32Array(w*h),w,h,{...p,direction:1});assert.equal(n.nx,6);close(n.vertices[3]+.5,.975);close(n.vertices[4]+.5,0);assert.ok(n.indices.every(v=>v<n.vertices.length/6));
});
test('zero-height full strips reconstruct independently known native affine colours',()=>{
 const w=61,h=47,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:i%4===0?Math.floor(i/4)%w*3:i%4===1?Math.floor(i/4/w)*4:79),m=rasterMesh(rasterHeight(a,w,h,flat),w,h,flat),out=rasterRender(a,w,h,m,flat,{samples:1,tile:11});for(let i=0;i<a.length;i++)assert.ok(Math.abs(out[i]-a[i])<=1,i);assert.deepEqual(a,Uint8ClampedArray.from(a));
});
function quad(w,h,z,u,v){return [0,0,z,u,v,1,w,0,z,u,v,1,0,h,z,u,v,1,w,h,z,u,v,1];}
test('negative depths render and nearer overlapping surfaces win regardless of triangle order',()=>{
 const w=4,h=4,a=new Uint8ClampedArray(w*h*4);a.set([201,43,71,255]);a.set([17,162,221,255],4);const vertices=Float32Array.from([...quad(w,h,-20,0,0),...quad(w,h,-10,1,0)]),indices=Uint32Array.from([0,1,2,1,3,2,4,5,6,5,7,6]),mesh={vertices,indices,stride:6},p=q({paper:0,light:0,lift:0}),A=rasterRender(a,w,h,mesh,p),B=rasterRender(a,w,h,{...mesh,indices:Uint32Array.from([4,5,6,5,7,6,0,1,2,1,3,2])},p);assert.deepEqual(A,B);for(let j=0;j<A.length;j+=4)assert.deepEqual([...A.slice(j,j+4)],[17,162,221,255]);
});
test('four-sample native bilinear texture matches an independent quarter-pixel oracle',()=>{
 const w=7,h=5,a=image(w,h),vertices=Float32Array.from([0,0,0,-.5,-.5,1,w,0,0,w-.5,-.5,1,0,h,0,-.5,h-.5,1,w,h,0,w-.5,h-.5,1]),mesh={vertices,indices:Uint32Array.from([0,1,2,1,3,2]),stride:6},p=q({paper:0,light:0,lift:0}),out=rasterRender(a,w,h,mesh,p);
 const at=(x,y,c)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const X=Math.floor(x),Y=Math.floor(y),fx=x-X,fy=y-Y;let sum=0;for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)sum+=a[(Math.min(h-1,Y+yy)*w+Math.min(w-1,X+xx))*4+c]*(xx?fx:1-fx)*(yy?fy:1-fy);return sum;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let sum=0;for(const yy of[-.25,.25])for(const xx of[-.25,.25])sum+=at(x+xx,y+yy,c);assert.equal(out[(y*w+x)*4+c],byte(sum/4));}
});
test('tile boundaries do not change subpixel coverage, depths or source colour',()=>{
 const w=119,h=83,a=image(w,h),p=q({height:70,tilt:65,turn:33,size:150}),m=rasterMesh(rasterHeight(a,w,h,p),w,h,p);assert.deepEqual(rasterRender(a,w,h,m,p,{tile:96}),rasterRender(a,w,h,m,p,{tile:13}));
});
test('all thirteen controls change the output and restoring parameters is deterministic',()=>{
 const w=320,h=256,a=image(w,h),base=rasterRelief(a,w,h),values={spacing:20,band:90,height:70,smooth:20,gamma:200,reverse:1,tilt:65,turn:23,direction:1,size:130,light:90,paper:90,lift:80};for(const[k,v]of Object.entries(values))assert.notDeepEqual(rasterRelief(a,w,h,{[k]:v}),base,k);assert.deepEqual(rasterRelief(a,w,h),base);assert.deepEqual(rasterRelief(a,w,h,{seed:917}),base);
});
test('native fields and texture retain a single-pixel change beyond 1536 without fixed reduction',()=>{
 const w=1537,h=7,a=new Uint8ClampedArray(w*h*4).fill(90),b=a.slice();b[(3*w+1535)*4]=240;const A=rasterHeight(a,w,h,q({smooth:0,gamma:100})),B=rasterHeight(b,w,h,q({smooth:0,gamma:100}));assert.equal(A.length,w*h);let changed=0;for(let i=0;i<A.length;i++)if(A[i]!==B[i])changed++;assert.equal(changed,1);assert.notDeepEqual(rasterRelief(a,w,h,flat),rasterRelief(b,w,h,flat));
});
test('tiny axes and bounded extremes return finite opaque owned pixels, including Buffers',()=>{
 for(const[w,h]of[[1,1],[1,19],[23,1],[31,29]])for(const end of[2,3]){const a=image(w,h),saved=a.slice(),p=Object.fromEntries(filters.find(f=>f.rasterrelief).controls.map(c=>[c[0],c[end]])),A=rasterRelief(a,w,h,p),B=rasterRelief(Buffer.from(a),w,h,p);assert.deepEqual(A,B);assert.notEqual(A,a);assert.equal(A.length,a.length);assert.ok(A.every(Number.isFinite));for(let i=3;i<A.length;i+=4)assert.equal(A[i],255);assert.deepEqual(a,saved);}
});
test('common colour preparation, transparency, final inverse and mix apply once',()=>{
 const w=73,h=61,a=image(w,h),l=makeLayer('rasterrelief'),p={...l.params,brightness:17,contrast:120,saturation:40},prep=applyFilter(a,w,h,{id:'mono',params:{...p,mix:100,invert:false}}),out=applyFilter(a,w,h,{...l,params:p});assert.deepEqual(out,rasterRelief(prep,w,h,p));const mixed=applyFilter(a,w,h,{...l,params:{...p,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...p,mix:0}}),a);
 const mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);const transparent=new Uint8ClampedArray(a.length);assert.deepEqual(applyFilter(transparent,w,h,l),applyFilter(new Uint8ClampedArray(a.length).fill(255),w,h,l));
 const old=makeLayer('mono'),r={near:{pixels:image(19,23),width:19,height:23}};assert.deepEqual(renderPipeline(a,w,h,[old,l],r),applyFilter(applyFilter(a,w,h,old),w,h,l));
});
test('0.61 gates relief, reads 0.60 hybrids, validates controls and reads all 190 public settings',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.rasterrelief),l=makeLayer(f.id);assert.equal(f.controls.length,13);assert.equal(f.random,false);assert.equal(looks.filter(l=>l.rasterrelief).length,3);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=60;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('hybridimage');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.60'})),[old]);for(const[k,,lo,hi,step]of f.controls)for(const v of[lo-step,hi+step,lo+step*.5])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[k]:v}}])),k);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
