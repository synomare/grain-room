import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{rowDefaults,rowStreamRead,rowFrameIndex,rowReinterpretation}from'../src/row-reinterpretation.js';
import{curlicueDefaults,curlicueCoefficient,curlicuePath,drawCurlicues}from'../src/curlicues.js';
import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{decodeRecipe,encodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
test('stream reads match separately serialized RGB and planar bytes in either axis, including wraparound',()=>{
 const w=13,h=7,a=image(w,h),saved=a.slice();for(const axis of[0,1]){const pixels=[];if(axis)for(let x=0;x<w;x++)for(let y=0;y<h;y++)pixels.push((y*w+x)*4);else for(let j=0;j<w*h;j++)pixels.push(j*4);const interleaved=pixels.flatMap(i=>[a[i],a[i+1],a[i+2]]),planar=[0,1,2].flatMap(c=>pixels.map(i=>a[i+c]));for(const[kind,bytes]of[[false,interleaved],[true,planar]])for(let k=-3;k<bytes.length+3;k++)assert.equal(rowStreamRead(a,w,h,k,kind,axis),bytes[(k+bytes.length)%bytes.length]);}assert.deepEqual(a,saved);
});
test('row reinterpretation equals independent virtual-frame decoding and nearest-neighbour display',()=>{
 const w=13,h=7,a=image(w,h);for(const delta of[-12,-2,0,3,20])for(const layout of[0,1,2])for(const axis of[0,1])for(const reverse of[0,1]){
  const p={...rowDefaults,delta,layout,axis,reverse,offset:17},sw=axis?h:w,sh=axis?w:h,n=w*h,columns=Math.max(1,sw+delta),rows=Math.ceil(n/columns),pixels=[];
  if(axis)for(let x=0;x<w;x++)for(let y=0;y<h;y++)pixels.push((y*w+x)*4);else for(let j=0;j<n;j++)pixels.push(j*4);
  const stream=layout===2?[0,1,2].flatMap(c=>pixels.map(i=>a[i+c])):pixels.flatMap(i=>[a[i],a[i+1],a[i+2]]),virtual=Array.from({length:columns*rows},(_,j)=>{let q=j%n;if(reverse)q=n-1-q;q=(q+Math.round(.17*n))%n;return[0,1,2].map(c=>stream[layout===1?c*n+q:q*3+c]);}),expected=new Uint8ClampedArray(a.length);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const rgba=virtual[Math.floor(y*rows/sh)*columns+Math.floor(x*columns/sw)],i=axis?(x*w+y)*4:(y*w+x)*4;expected.set([...rgba,255],i);}assert.deepEqual(rowReinterpretation(a,w,h,p),expected,JSON.stringify(p));
 }
});
test('zero row-width change retains an opaque photo exactly in both axes, and one-column change actually alters framing',()=>{
 const w=1537,h=5,a=image(w,h);for(const axis of[0,1])assert.deepEqual(rowReinterpretation(a,w,h,{...rowDefaults,delta:0,axis}),a);assert.notDeepEqual(rowReinterpretation(a,w,h,{...rowDefaults,delta:-1}),a);assert.equal(rowFrameIndex(12,0,13,7,12,91),11);
});
test('curlicue positions match an independent successive complex rotation, and each step is of unit length',()=>{
 for(const[a,b,n]of[[0,0,137],[.0199501246882793,0,1200],[Math.sqrt(101)-10,.0037,1200],[Math.SQRT2-1,-.01,400]]){const path=curlicuePath(n,a,b);let dx=1,dy=0,x=0,y=0;for(let j=1;j<=n;j++){const phase=Math.PI*a*(2*j-1)+2*Math.PI*b,co=Math.cos(phase),si=Math.sin(phase),nx=dx*co-dy*si;dy=dx*si+dy*co;dx=nx;x+=dx;y+=dy;near(path[j*2],x,2e-8);near(path[j*2+1],y,2e-8);near(Math.hypot(path[j*2]-path[(j-1)*2],path[j*2+1]-path[(j-1)*2+1]),1,1e-12);}assert.deepEqual(curlicuePath(n+31,a,b).slice(0,path.length),path);}
});
test('rational coefficients retain the proper signed direction period rather than assuming every path closes',()=>{
 for(const[p,q]of[[2,5],[1,3],[40,2001]]){const path=curlicuePath(2*q+5,p/q),sign=p*q%2?-1:1;for(let n=1;n<5;n++)for(let c=0;c<2;c++)near(path[(n+q)*2+c]-path[(n+q-1)*2+c],sign*(path[n*2+c]-path[(n-1)*2+c]),2e-9);}assert.equal(curlicueCoefficient(0,512),40/2001);near(curlicueCoefficient(2,512),(8*512+1)/(401*512+50));assert.notEqual(curlicueCoefficient(2,1),curlicueCoefficient(2,4096));
});
test('every control changes its relevant native view and restoring settings reproduces that view',()=>{
 const w=311,h=229,a=image(w,h);for(const[id,fn,base,changes]of[
  ['rowreinterpret',rowReinterpretation,rowDefaults,{delta:12,layout:1,axis:1,offset:17,reverse:1,amount:35}],
  ['curlicue',drawCurlicues,curlicueDefaults,{motif:1,steps:2400,detune:1,drift:37,angle:125,zoom:220,width:3,copies:5,ink:35,mode:1,paper:100,photo:70,amount:35}],
 ]){const initial=fn(a,w,h,base);for(const[key,value]of Object.entries(changes))assert.notDeepEqual(fn(a,w,h,{...base,[key]:value}),initial,id+' '+key);assert.deepEqual(fn(a,w,h,base),initial);}
 const p={...curlicueDefaults,motif:1};assert.deepEqual(drawCurlicues(a,w,h,p),drawCurlicues(a,w,h,{...p,detune:1}));
});
test('native colours influence coils without altering the photo-independent curve geometry',()=>{
 const w=67,h=53,a=image(w,h),b=a.slice();for(let i=0;i<b.length;i+=4){b[i]^=255;b[i+1]^=255;b[i+2]^=255;}assert.notDeepEqual(drawCurlicues(a,w,h,curlicueDefaults),drawCurlicues(b,w,h,curlicueDefaults));assert.deepEqual(drawCurlicues(a,w,h,{...curlicueDefaults,photo:100}),a);
});
test('zero amount owns unchanged input, all axes and modes stay in bounds, and source data is never mutated',()=>{
 for(const[w,h]of[[1,1],[1,31],[31,1],[67,53]]){const a=image(w,h),saved=a.slice();for(const fn of[rowReinterpretation,drawCurlicues]){const base=fn===rowReinterpretation?rowDefaults:curlicueDefaults,out=fn(a,w,h,{...base,amount:0});assert.notEqual(out,a);assert.deepEqual(out,a);}
  for(const delta of[-512,512])for(const axis of[0,1])for(const layout of[0,1,2]){const out=rowReinterpretation(a,w,h,{...rowDefaults,delta,axis,layout,reverse:1,offset:-100});assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);}
  for(const motif of[0,1,2,3]){const out=drawCurlicues(a,w,h,{...curlicueDefaults,motif,steps:100,zoom:400,width:6,copies:16});assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);}assert.deepEqual(a,saved);
 }
});
test('independent photos and settings cannot contaminate later renders, and partial mixing stays within one quantization step',()=>{
 const w=71,h=53,a=image(w,h);for(const[fn,base]of[[rowReinterpretation,rowDefaults],[drawCurlicues,curlicueDefaults]]){const full=fn(a,w,h,base);fn(image(h,w),h,w,{...base,amount:35});assert.deepEqual(fn(a,w,h,base),full);const partial=fn(a,w,h,{...base,amount:35});for(let i=0;i<a.length;i++)if(i%4!==3)near(partial[i],a[i]+.35*(full[i]-a[i]),1);}
});
test('engine integrates both effects with full-resolution colour, transparency, monochrome and inverse output',()=>{
 const w=71,h=53,a=image(w,h);for(const[id,fn]of[['rowreinterpret',rowReinterpretation],['curlicue',drawCurlicues]]){const l=makeLayer(id);assert.deepEqual(applyFilter(a,w,h,l),fn(a,w,h,l.params));const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),full=applyFilter(a,w,h,l),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);for(let c=0;c<3;c++)assert.equal(inverted[i+c],255-full[i+c]);}}
 const t=a.slice();for(let i=3;i<t.length;i+=4)t[i]=i%256;const zero=applyFilter(t,w,h,{...makeLayer('rowreinterpret'),params:{...makeLayer('rowreinterpret').params,mix:0}});for(let i=0;i<t.length;i+=4)for(let c=0;c<3;c++)near(zero[i+c],t[i+c]*t[i+3]/255+255-t[i+3],.5);
});
test('0.47 gates both new effects, accepts 0.46 avalanches and round-trips every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);for(const id of['rowreinterpret','curlicue']){const l=makeLayer(id);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=46;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));}
 const old=makeLayer('sandavalanches');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.46'})),[old]);
 for(const[id,key,value]of[['rowreinterpret','delta',.5],['rowreinterpret','layout',3],['rowreinterpret','axis',.5],['curlicue','steps',100.5],['curlicue','copies',17],['curlicue','zoom',401],['curlicue','motif',4]]){const l=makeLayer(id);assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));}
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const l=looks.find(l=>l.id===file.slice(0,-5));assert.ok(l);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),l.layers);count++;}assert.equal(count,234);
});
