import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {phaseGuide,phaseBand,phaseStyle,phaseValue,phaseEdit,renderPhase,monogenic} from '../src/monogenic.js';
import {filters,makeLayer} from '../src/filters.js';import {looks} from '../src/looks.js';import {applyFilter} from '../src/engine.js';import {decodeRecipe,encodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const p=makeLayer('phasefold').params,near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const band=(e,x,y,w=e.length,h=1)=>({even:Float64Array.from(e),rx:Float64Array.from(x),ry:Float64Array.from(y),w,h});

test('Area guide retains partial-pixel averages and exact aspect-dependent pixel spacing',()=>{
 const a=new Uint8ClampedArray(5*2*4);for(let y=0;y<2;y++)for(let x=0;x<5;x++)a.set([x*40,x*40,x*40,255],(y*5+x)*4);
 const g=phaseGuide(a,5,2,3);assert.equal(g.w,3);assert.equal(g.h,1);near(g.dx,5/3);near(g.dy,2);near(g.l[0],16/255);near(g.l[1],80/255);near(g.l[2],144/255);
 const narrow=phaseGuide(image(1,768),1,768);assert.equal(narrow.w,1);assert.equal(narrow.h,384);assert.equal(narrow.dx,1);assert.equal(narrow.dy,2);
});

test('Periodic analytic plane wave gives the Poisson band and both Riesz quadratures',()=>{
 const w=32,h=32,kx=2*Math.PI*3/w,ky=2*Math.PI*4/h,r=Math.hypot(kx,ky),sigma=2,b=4*(Math.exp(-sigma*r)-Math.exp(-2*sigma*r)),a=Float64Array.from({length:w*h},(_,i)=>.7+Math.cos(kx*(i%w)+ky*Math.floor(i/w))),q=phaseBand(a,w,h,sigma,1,1,{pad:false});
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,t=kx*x+ky*y;near(q.even[i],b*Math.cos(t));near(q.rx[i],-b*kx/r*Math.sin(t));near(q.ry[i],-b*ky/r*Math.sin(t));near(Math.hypot(q.even[i],q.rx[i],q.ry[i]),b);}
 const uneven=phaseBand(a,w,h,sigma,2,1,{pad:false}),r2=Math.hypot(kx/2,ky),b2=4*(Math.exp(-sigma*r2)-Math.exp(-2*sigma*r2));near(uneven.even[0],b2);near(uneven.rx[1],-b2*(kx/2)/r2*Math.sin(kx));
});

test('DC vanishes, Nyquist quadratures stay real and zero, and the resolved band obeys energy identity',()=>{
 const flat=phaseBand(new Float64Array(16*8).fill(.3),16,8,2,1,1,{pad:false});assert.ok([...flat.even,...flat.rx,...flat.ry].every(v=>Math.abs(v)<1e-12));
 const nyquist=phaseBand(Float64Array.from({length:16*8},(_,i)=>(i%16)%2?1:-1),16,8,2,1,1,{pad:false});assert.ok([...nyquist.rx,...nyquist.ry].every(v=>Math.abs(v)<1e-12));assert.ok(nyquist.even.some(v=>Math.abs(v)>1e-4));
 const a=Float64Array.from({length:32*16},(_,i)=>Math.cos((i%32)*Math.PI/4)+.3*Math.sin(Math.floor(i/32)*Math.PI/4)),q=phaseBand(a,32,16,1,1,1,{pad:false});near(q.even.reduce((s,v)=>s+v*v,0),q.rx.reduce((s,v)=>s+v*v,0)+q.ry.reduce((s,v)=>s+v*v,0),1e-8);
});

test('Phase folds follow the analytic cosine and folded odd magnitude without a spatial displacement',()=>{
 const n=101,t=Float64Array.from({length:n},(_,i)=>2*Math.PI*i/(n-1)),q=band(Array.from(t,v=>.4*Math.cos(v)),Array.from(t,v=>-.4*Math.sin(v)),new Float64Array(n));
 for(const folds of [1,2,3,6]){const result=phaseEdit(q,{...p,folds,phase:0,equalize:0,gain:100,cut:0});for(let i=0;i<n;i++)near(result.response[i],.4*Math.cos(folds*t[i]));}
 const odd=phaseEdit(q,{...p,folds:1,phase:90,equalize:0,gain:100,cut:0});for(let i=0;i<n;i++)near(odd.response[i],-.4*Math.abs(Math.sin(t[i])));
});

test('Unoriented selection has 180-degree symmetry, suppresses orthogonal normals and keeps the unselected residual',()=>{
 const q=band([.1,.1],[.2,0],[0,.2]),s0=phaseEdit(q,{...p,select:100,direction:0,cut:0}),s180=phaseEdit(q,{...p,select:100,direction:180,cut:0}),s90=phaseEdit(q,{...p,select:100,direction:90,cut:0});
 near(s0.response[1],0);near(s90.response[0],0);near(s0.response[0],s180.response[0]);near(s0.response[0],s90.response[1]);near(s0.delta[1],0);
});

test('Riesz amplitude equalization boosts weak structure smoothly and cuts zero-energy background',()=>{
 const q=band([.01,.2,0],[0,0,0],[0,0,0]),unscaled=phaseEdit(q,{...p,folds:1,phase:0,equalize:0,gain:100,cut:0}),leveled=phaseEdit(q,{...p,folds:1,phase:0,equalize:100,gain:100,cut:0}),cut=phaseEdit(q,{...p,folds:1,phase:0,equalize:100,gain:100,cut:80});
 assert.ok(leveled.response[0]>unscaled.response[0]);assert.ok(leveled.response[1]<unscaled.response[1]);assert.ok(cut.response[0]<leveled.response[0]/10);near(cut.response[2],0);assert.ok(cut.response[1]>cut.response[0]);
 const style=phaseStyle(q,p);assert.equal(phaseValue(0,0,0,style),0);
});

test('Ninety-degree transpose rotates Riesz components; directional editing follows the rotated normal',()=>{
 const w=32,h=32,a=Float64Array.from({length:w*h},(_,i)=>Math.cos((i%w)*.29)+.4*Math.sin(Math.floor(i/w)*.71)),transpose=Float64Array.from({length:w*h},(_,i)=>a[(i%w)*w+Math.floor(i/w)]),left=phaseBand(a,w,h,2),right=phaseBand(transpose,w,h,2);
 const editL=phaseEdit(left,{...p,direction:20,select:100}),editR=phaseEdit(right,{...p,direction:70,select:100});
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,j=x*w+y;near(left.even[i],right.even[j]);near(left.rx[i],right.ry[j]);near(left.ry[i],right.rx[j]);near(editL.response[i],editR.response[j]);}
});

test('Native folding happens after field interpolation, retaining an interior line missed by map upsampling',()=>{
 const q=band([.1,-.1],[.1,.1],[0,0]),a=new Uint8ClampedArray(3*4).fill(255),out=renderPhase(a,3,1,q,{...p,folds:2,phase:0,equalize:0,gain:200,cut:0,view:1});
 assert.deepEqual(Array.from(out.subarray(0,3)),[246,240,226]);assert.deepEqual(Array.from(out.subarray(4,7)),[31,39,72]);assert.deepEqual(Array.from(out.subarray(8,11)),[246,240,226]);
});

test('Photograph reconstruction retains native two-pixel bars and only adds the band edit before clipping',()=>{
 const w=768,h=12,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4){const v=Math.floor((i/4)%w/2)%2?170:70;a.set([v,v,v,255],i);}
 const q=band([0,0],[.01,.01],[0,0]),out=renderPhase(a,w,h,q,{...p,folds:2,phase:0,equalize:0,gain:100,cut:0});for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;near(out[i],a[i]-2.55,.501);if(x%4===0)assert.equal(out[i+8]-out[i],100);}
 const neutral={...p,folds:1,phase:0,equalize:0,gain:100};assert.deepEqual(monogenic(a,w,h,neutral),a);const source=Buffer.from(a),copy=monogenic(source,w,h,neutral);copy[0]=255-a[0];assert.deepEqual(source,Buffer.from(a));
});

test('Tiny, narrow, constant and extreme inputs remain finite before coercion and leave caller memory intact',()=>{
 for(const [w,h]of[[1,1],[1,33],[35,1],[5,7],[48,64]])for(const scale of [2,64]){
  const a=Buffer.from(image(w,h)),saved=Buffer.from(a),g=phaseGuide(a,w,h),b=phaseBand(g.l,g.w,g.h,scale*Math.max(w,h)/1000,g.dx,g.dy),e=phaseEdit(b,{...p,scale,phase:180,folds:6,equalize:100,gain:250,select:100,cut:0});assert.ok([...e.even,...e.rx,...e.ry,...e.response,...e.delta].every(Number.isFinite));
  for(const view of [0,1]){const out=monogenic(a,w,h,{...p,scale,view});assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);}
 }
 for(const v of [0,127,255]){const a=new Uint8ClampedArray(9*7*4);for(let i=0;i<a.length;i+=4)a.set([v,v,v,255],i);assert.deepEqual(monogenic(a,9,7,p),a);const out=monogenic(a,9,7,{...p,view:1});for(let i=0;i<out.length;i+=4)assert.deepEqual(Array.from(out.subarray(i,i+4)),[246,240,226,255]);}
});

test('Common alpha, mix, monochrome and every visible edit are connected and restore deterministically',()=>{
 const w=32,h=48,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('phasefold'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...p,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...p,view:1,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}
 for(const change of [{scale:35},{folds:5},{phase:90},{equalize:0},{gain:20},{select:100},{select:100,direction:90},{cut:100},{view:1}]){assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...p,...change}}),full,JSON.stringify(change));assert.deepEqual(applyFilter(a,w,h,l),full);}
 assert.deepEqual(a,saved);assert.deepEqual(applyFilter(a,w,h,{...l,params:{...p,mix:0}}),applyFilter(a,w,h,{id:'mono',params:{...makeLayer('mono').params,mix:0}}));
});

test('0.29 schema keeps 0.28 directional recipes, rejects premature phase edits and restores all public examples',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('phasefold');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=28;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const wave=makeLayer('waveweft');wave.params.crossfreq=35;assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([wave])),engine:'0.28'})),[wave]);assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([wave])),engine:'0.27'})));
 for(const [key,v]of[['folds',0],['folds',7],['folds',2.5],['phase',181],['phase',-181],['view',2],['gain',251],['scale',1],['cut',-1],['select',101],['equalize',Infinity],['unknown',1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...p,[key]:v}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
