import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {logicGlyphDefaults as base,cubeEdges,combineEdges,projectCube,logicGlyphPlan,logicGlyphMask,logicGlyphs} from '../src/logic-glyphs.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function setOperation(a,b,rule){
 const A=new Set(Array.from({length:12},(_,j)=>j).filter(j=>a&2**j)),B=new Set(Array.from({length:12},(_,j)=>j).filter(j=>b&2**j));
 return Array.from({length:12},(_,j)=>j).filter(j=>{
  const x=A.has(j),y=B.has(j);return [x||y,x&&y,x!==y,x&&!y,!(x||y),!(x&&y)][rule];
 }).reduce((sum,j)=>sum+2**j,0);
}

test('cube alphabet consists of twelve distinct edges of a three-regular eight-vertex graph',()=>{
 assert.equal(cubeEdges.length,12);assert.equal(new Set(cubeEdges.map(([a,b])=>a+','+b)).size,12);
 const degree=new Uint8Array(8);
 for(const [a,b] of cubeEdges){assert.ok([1,2,4].includes(a^b));assert.ok(a<b);degree[a]++;degree[b]++;}
 assert.deepEqual([...degree],Array(8).fill(3));
});

test('all 4096 edge sets obey six operations against an independent set-membership oracle',()=>{
 for(let a=0;a<4096;a++)for(const b of [0,4095,1365,2730,(a*997+731)&4095])for(let rule=0;rule<6;rule++)assert.equal(combineEdges(a,b,rule),setOperation(a,b,rule));
 for(const a of [0,1,731,4095]){assert.equal(combineEdges(a,a,2),0);assert.equal(combineEdges(a,a,3),0);assert.equal(combineEdges(a,a,0),a);assert.equal(combineEdges(a,0,5),4095);}
});

test('projected vertices agree with independent rotation and normalized extents at special and extreme angles',()=>{
 for(const yaw of [0,38,90,180])for(const pitch of [-80,0,25,80]){
  const a=yaw*Math.PI/180,b=pitch*Math.PI/180,raw=[];
  for(let j=0;j<8;j++){
   const x=j%2?1:-1,y=Math.floor(j/2)%2?1:-1,z=Math.floor(j/4)?1:-1;
   raw.push([x*Math.cos(a)+z*Math.sin(a),x*Math.sin(a)*Math.sin(b)+y*Math.cos(b)-z*Math.cos(a)*Math.sin(b)]);
  }
  const extent=[0,1].map(c=>Math.max(...raw.map(v=>v[c]))),p=projectCube(yaw,pitch);
  for(let j=0;j<8;j++)for(let c=0;c<2;c++){near(p[j][c],raw[j][c]/(2*extent[c]),1e-12);assert.ok(p[j][c]>=-.5-1e-12&&p[j][c]<=.5+1e-12);}
 }
});

test('neighbour pairing wraps within its own row for positive, zero and negative distances',()=>{
 const w=181,h=139,a=image(w,h);
 for(const offset of [-12,-2,0,2,12])for(const rule of [0,1,2,3,4,5]){
  const q=logicGlyphPlan(a,w,h,{...base,offset,rule,carry:0,flow:1});
  for(let y=0;y<q.g.ny;y++)for(let x=0;x<q.g.nx;x++){
   const j=y*q.g.nx+x;let at=x+offset;while(at<0)at+=q.g.nx;while(at>=q.g.nx)at-=q.g.nx;
   assert.equal(q.left[j],q.masks[j]);assert.equal(q.right[j],q.masks[y*q.g.nx+at]);assert.equal(q.result[j],setOperation(q.left[j],q.right[j],rule));
  }
  if(offset===0&&(rule===2||rule===3))assert.ok(q.result.every(v=>v===0));
 }
});

test('full carry and row resets match an independent recurrence, including cross-row propagation',()=>{
 const w=181,h=139,a=image(w,h);
 for(const flow of [0,1])for(const rule of [0,1,2,3,4,5]){
  const q=logicGlyphPlan(a,w,h,{...base,rule,carry:100,flow}),expected=[];
  for(let j=0;j<q.g.n;j++){
   const x=j%q.g.nx,y=Math.floor(j/q.g.nx),before=j===0||(!flow&&x===0)?0:expected[j-1],neighbour=q.masks[y*q.g.nx+(x+2)%q.g.nx];
   const B=setOperation(neighbour,before,0);assert.equal(q.right[j],B);expected.push(setOperation(q.masks[j],B,rule));
  }
  assert.deepEqual([...q.result],expected);
 }
 const low=logicGlyphPlan(a,w,h,{carry:35}),high=logicGlyphPlan(a,w,h,{carry:70});
 for(const q of [low,high])for(let j=0;j<q.g.n;j++){
  const x=j%q.g.nx,y=Math.floor(j/q.g.nx),neighbor=q.masks[y*q.g.nx+(x+2)%q.g.nx],before=x?q.result[j-1]:0;
  assert.equal(q.right[j]&neighbor,neighbor);assert.equal(q.right[j]&~(neighbor|before),0);
 }
});

test('native coverage agrees with an independent distance-to-segment union for projected overlapping edges',()=>{
 const w=23,h=17,q=logicGlyphMask(image(w,h),w,h,{...base,size:80,edges:12,rule:5,offset:0,pitch:0,yaw:0,width:15,stretch:160}),segments=[];
 for(let j=0;j<q.g.n;j++)for(let e=0;e<12;e++)if(q.result[j]&(1<<e)){
  const [a,b]=cubeEdges[e],cx=(j%q.g.nx+.5)*q.g.cw,cy=(Math.floor(j/q.g.nx)+.5)*q.g.ch;
  segments.push([cx+q.points[a][0]*q.g.cw*.82,cy+q.points[a][1]*q.g.ch*.82*1.6,cx+q.points[b][0]*q.g.cw*.82,cy+q.points[b][1]*q.g.ch*.82*1.6]);
 }
 // Complement of each source set keeps nonempty projected segments.
 assert.ok(segments.length>0);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let coverage=0;
  for(const [ax,ay,bx,by] of segments){
   const dx=bx-ax,dy=by-ay,px=x+.5-ax,py=y+.5-ay,dot=px*dx+py*dy,length=dx*dx+dy*dy;
   const d=dot<=0?Math.hypot(px,py):dot>=length?Math.hypot(x+.5-bx,y+.5-by):Math.abs(dx*py-dy*px)/Math.sqrt(length);
   coverage=Math.max(coverage,Math.max(0,Math.min(1,15*Math.max(w,h)/2000+.5-d)));
  }
  near(q.mask[y*w+x],coverage,3e-8);
 }
});

test('four ink modes preserve every covered native RGB value rather than a cell average',()=>{
 const w=1537,h=9,a=image(w,h),p={...base,size:8,edges:12,width:15,mode:0,paper:31,lift:0},q=logicGlyphMask(a,w,h,p);
 assert.ok(q.mask.some(v=>v>.99));
 for(const mode of [0,1,2,3]){
  const out=logicGlyphs(a,w,h,{...p,mode});
  for(let j=0;j<w*h;j++)for(let c=0;c<3;c++){
   const ink=mode===0?a[j*4+c]:mode===1?255:mode===2?255-a[j*4+c]:0;
   assert.equal(out[j*4+c],new Uint8ClampedArray([p.paper*2.55+(ink-p.paper*2.55)*q.mask[j]])[0]);
  }
 }
});

test('all fourteen controls and seed change relevant views and restore; inactive cases remain explicit',()=>{
 const w=311,h=229,a=image(w,h),p={...base,carry:65,rule:2,seed:17},initial=logicGlyphs(a,w,h,p);
 for(const [key,value] of Object.entries({size:48,edges:9,rule:1,offset:-5,carry:0,flow:1,random:100,yaw:80,pitch:-40,stretch:50,width:12,mode:2,paper:100,lift:90,seed:93}))assert.notDeepEqual(logicGlyphs(a,w,h,{...p,[key]:value}),initial,key);
 assert.deepEqual(logicGlyphs(a,w,h,p),initial);
 assert.deepEqual(logicGlyphs(a,w,h,{...p,carry:0,flow:0}),logicGlyphs(a,w,h,{...p,carry:0,flow:1}));
 assert.deepEqual(logicGlyphs(a,w,h,{...p,mode:1,lift:0}),logicGlyphs(a,w,h,{...p,mode:1,lift:100}));
 const empty={...base,rule:2,offset:0,carry:0};assert.ok(logicGlyphMask(a,w,h,empty).mask.every(v=>v===0));
});

test('tiny axes and control extremes preserve source ownership and deterministic repeated sizes',()=>{
 for(const [w,h] of [[1,1],[1,37],[35,1],[71,53]]){
  const a=image(w,h),copy=a.slice(),initial=logicGlyphs(a,w,h,base);
  for(const p of [{...base,size:8,edges:12,rule:5,offset:-12,carry:100,flow:1,random:100,yaw:180,pitch:80,stretch:160,width:15,mode:3,paper:100,lift:100},{...base,size:80,edges:1,rule:2,offset:12,carry:0,random:0,yaw:0,pitch:-80,stretch:30,width:1,mode:1}]){
   const out=logicGlyphs(a,w,h,p);assert.equal(out.length,a.length);for(let j=3;j<out.length;j+=4)assert.equal(out[j],255);
  }
  logicGlyphs(image(h,w),h,w,base);assert.deepEqual(logicGlyphs(a,w,h,base),initial);assert.deepEqual(a,copy);
 }
});

test('engine integration retains common monochrome, inversion and source mixing',()=>{
 const w=97,h=71,a=image(w,h),l=makeLayer('logicglyphs'),full=applyFilter(a,w,h,l);
 assert.deepEqual(full,logicGlyphs(a,w,h,l.params));
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inv=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}}),mix=applyFilter(a,w,h,{...l,params:{...l.params,mix:40}});
 for(let j=0;j<w*h;j++)for(let c=0;c<3;c++){
  assert.equal(mono[j*4+c],mono[j*4]);assert.equal(inv[j*4+c],255-full[j*4+c]);assert.equal(mix[j*4+c],new Uint8ClampedArray([a[j*4+c]+(full[j*4+c]-a[j*4+c])*.4])[0]);
 }
 assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
});

test('glyph recipes require 0.50, closed routes retain 0.49 support, and all public JSON round-trip',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.logicglyphs).controls.length,14);
 const l=makeLayer('logicglyphs');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=49;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('closedroute');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.49'})),[old]);
 for(const [key,value] of [['size',7],['edges',13],['rule',6],['rule',.5],['offset',13],['offset',.5],['carry',101],['flow',2],['flow',.5],['yaw',181],['pitch',-81],['stretch',29],['width',15.5],['mode',4],['mode',.5],['paper',-1],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const name of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===name.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+name,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
