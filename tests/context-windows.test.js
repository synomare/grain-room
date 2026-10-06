import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {contextDefaults as D,contextField,contextGeometry,contextCoverage,contextWindows} from '../src/context-windows.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:((i>>2)*37+(i%4)*53+Math.floor((i>>2)/w)*17)%256);
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),byte=v=>new Uint8ClampedArray([v])[0];
test('fractional area means conserve native luminance and respond beyond 1536 pixels',()=>{
 const w=1537,h=7,a=image(w,h),g=contextField(a,w,h,{smooth:0});assert.equal(g.w,384);assert.equal(g.h,2);
 let expected=0;for(let i=0;i<a.length;i+=4)expected+=(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255;
 near([...g.raw].reduce((s,v)=>s+v,0)/(g.w*g.h),expected/(w*h),1e-7);
 const b=a.slice();b[(w-1)*4]^=255;assert.notDeepEqual(contextField(b,w,h,{smooth:0}).raw,g.raw);
 const flat=new Uint8ClampedArray(w*h*4);for(let i=0;i<flat.length;i+=4)flat[i]=flat[i+1]=flat[i+2]=100,flat[i+3]=255;assert.ok(contextField(flat,w,h,{smooth:40}).l.every(v=>Math.abs(v-100/255)<1e-7));
});
test('straight periodic bands have known interior, exterior and subpixel boundary coverage',()=>{
 const g=contextGeometry(100,100,{columns:5,rows:1,bend:0,angle:0,size:50});
 for(const x of [9,10,29,30])assert.equal(contextCoverage(x,50,g).coverage,1);
 for(const x of [0,19,20,39])assert.equal(contextCoverage(x,50,g).coverage,0);
 const a=contextCoverage(14.1,50,g);near(a.coverage,.9);const b=contextCoverage(14.9,50,g);near(b.coverage,.1);
});
test('ellipse windows form a union across cell edges and rotate with a known axis',()=>{
 const g=contextGeometry(100,100,{shape:0,columns:2,rows:2,size:90,stretch:200,angle:0});assert.equal(contextCoverage(49,24,g).coverage,1);assert.equal(contextCoverage(24,49,g).coverage,0);
 const b=contextGeometry(100,100,{shape:0,columns:2,rows:2,size:90,stretch:200,angle:90});assert.equal(contextCoverage(24,49,b).coverage,1);assert.equal(contextCoverage(49,24,b).coverage,0);
});
test('surround brightness, range and rotation leave every fully covered target byte unchanged',()=>{
 const w=96,h=80,a=image(w,h),p={colour:100,detail:100,smooth:0},A=contextWindows(a,w,h,p),B=contextWindows(a,w,h,{...p,ground:0,range:5,turn:90}),g=contextGeometry(w,h,p);let inside=0,outside=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(contextCoverage(x,y,g).coverage===1){for(let c=0;c<4;c++)assert.equal(A[i+c],B[i+c]),assert.equal(A[i+c],a[i+c]);inside++;}else if(A[i]!==B[i])outside++;}
 assert.ok(inside>3000);assert.ok(outside>1000);
});
test('a shared grayscale field obeys an independently specified affine surround range',()=>{
 const w=40,h=30,a=image(w,h),p={detail:100,smooth:0,colour:0,ground:80,range:25,bend:0,angle:0},out=contextWindows(a,w,h,p),g=contextGeometry(w,h,p);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,L=(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255,cov=contextCoverage(x,y,g).coverage,expected=byte((L*cov+(.6+.25*L)*(1-cov))*255);assert.equal(out[i],expected);assert.equal(out[i+1],expected);assert.equal(out[i+2],expected);}
});
test('comparison panels repeat identical target bytes from the central crop with unchanged aspect',()=>{
 for(const [w,h,mode]of [[80,60,1],[81,61,1],[80,60,2],[81,61,2]]){
  const a=image(w,h),p={compare:mode,detail:100,colour:100,smooth:0},out=contextWindows(a,w,h,p),g=contextGeometry(w,h,p);assert.equal(g.ratio,1);let n=0;
  for(let y=0;y<g.ph;y++)for(let x=0;x<g.pw;x++)if(contextCoverage(x,y,g).coverage===1){const j=(y*w+x)*4,k=((mode===2?y+h-g.ph:y)*w+(mode===1?x+w-g.pw:x))*4;for(let c=0;c<4;c++)assert.equal(out[j+c],out[k+c]);n++;}assert.ok(n>500);
  if(mode===1&&w%2)for(let y=0;y<h;y++)assert.equal(out[(y*w+g.pw)*4],128);
  if(mode===2&&h%2)for(let x=0;x<w;x++)assert.equal(out[(g.ph*w+x)*4],128);
 }
});
test('ring coverage intentionally changes the edge while ring tone is neutral with zero width',()=>{
 const w=70,h=60,a=image(w,h),A=contextWindows(a,w,h),B=contextWindows(a,w,h,{ring:40,ringTone:0}),C=contextWindows(a,w,h,{ring:40,ringTone:100});assert.notDeepEqual(A,B);assert.notDeepEqual(B,C);assert.deepEqual(A,contextWindows(a,w,h,{ringTone:0}));
});
test('categorical controls have explicit neutral domains and the filter does not use its own seed',()=>{
 const w=80,h=60,a=image(w,h),A=contextWindows(a,w,h);assert.deepEqual(A,contextWindows(a,w,h,{stretch:200}));assert.deepEqual(contextWindows(a,w,h,{shape:0}),contextWindows(a,w,h,{shape:0,bend:100}));assert.deepEqual(contextWindows(a,w,h,{detail:100,smooth:0}),contextWindows(a,w,h,{detail:100,smooth:40}));assert.deepEqual(A,contextWindows(a,w,h,{seed:998}));
});
test('zero window width shows only the surround and full surround range cancels brightness',()=>{
 const w=60,h=40,a=image(w,h),A=contextWindows(a,w,h,{size:0,range:0,ground:75,ring:40});for(let i=0;i<A.length;i+=4)assert.equal(A[i],191),assert.equal(A[i+1],191),assert.equal(A[i+2],191);
 assert.deepEqual(contextWindows(a,w,h,{range:100,ground:0}),contextWindows(a,w,h,{range:100,ground:100}));
});
test('all sixteen controls have reachable, distinct changes on a photographic fixture',()=>{
 const w=100,h=80,a=image(w,h),values={shape:0,columns:7,rows:5,size:40,stretch:180,bend:95,angle:70,smooth:40,detail:100,colour:100,ground:0,range:80,turn:90,ring:40,ringTone:0,compare:1};
 for(const[k,v]of Object.entries(values)){const p=k==='stretch'?{shape:0}:k==='ringTone'?{ring:40}:{};assert.notDeepEqual(contextWindows(a,w,h,p),contextWindows(a,w,h,{...p,[k]:v}),k);}
});
test('tiny axes, odd panels and every bounded control extreme retain owned finite opaque pixels',()=>{
 for(const[w,h]of [[1,1],[1,17],[19,1],[23,17]])for(const shape of [0,1])for(const compare of [0,1,2]){
  const a=image(w,h),copy=a.slice(),p={shape,compare,columns:8,rows:8,size:100,stretch:200,bend:100,angle:180,smooth:40,detail:0,colour:100,range:100,turn:180,ring:40},out=contextWindows(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every(Number.isFinite));assert.notEqual(out,a);assert.deepEqual(a,copy);assert.deepEqual(out,contextWindows(Buffer.from(a),w,h,p));for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
 }
});
test('native colour detail remains sensitive to pixels beyond 1536 and is not a stretched analysis grid',()=>{
 const w=1537,h=9,a=image(w,h),p={columns:1,size:90,bend:0,angle:90,detail:100,colour:100},out=contextWindows(a,w,h,p),b=a.slice();for(let x=w-16;x<w;x++)b[(4*w+x)*4]^=255;assert.notDeepEqual(out,contextWindows(b,w,h,p));
});
test('common engine mix, inversion, monochrome, alpha flattening and exact look replays remain supported',()=>{
 const w=37,h=29,a=image(w,h),l=makeLayer('contextwindows'),out=applyFilter(a,w,h,l);assert.deepEqual(out,contextWindows(a,w,h,l.params));const m=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(m[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono',colour:100}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray([30,60,70,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));for(const look of looks.filter(l=>l.contextwindows))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});
test('0.59 gates new windows, retains 0.58 film and checks controls and every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.contextwindows),l=makeLayer(f.id);assert.equal(f.controls.length,16);assert.equal(f.random,false);assert.equal(looks.filter(l=>l.contextwindows).length,3);
 for(let n=2;n<=58;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('pinnedfilm');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.58'})),[old]);
 for(const[k,,lo,hi,step]of f.controls){for(const v of [lo-step,hi+step,lo+step*.5])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[k]:v}}])),k);}
 const files=fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'));assert.equal(files.length,234);for(const file of files){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);}
});
