import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {CutNetwork,reflectCutCoordinate,cutSourcePoint,cutMatchingCost,cutPatchRegion,applyCutPatch,graphcutPlan,renderGraphcutPlan,graphcut,clearGraphcutCache,graphcutCacheInfo,GRAPHCUT_EDGE} from '../src/graphcut-textures.js';
import {makeLayer,filters} from '../src/filters.js';import {looks} from '../src/looks.js';import {applyFilter} from '../src/engine.js';import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const base=makeLayer('graphcut').params,near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),dist=(a,b)=>Math.sqrt(a.reduce((s,v,c)=>s+(v-b[c])**2,0));
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const identity={dx:0,dy:0,sx:0,sy:0,co:1,si:0,zoom:1};

test('owned max flow agrees with exhaustive directed cuts, including zero and fractional capacities',()=>{
 for(let k=0;k<9;k++){
  const n=6,edges=[];for(let u=0;u<n;u++)for(let v=0;v<n;v++)if(u!==v&&((u*7+v*13+k)%3===0))edges.push([u,v,((u+1)*(v+3)+k)%11/7]);
  const graph=new CutNetwork(n);for(const e of edges)graph.add(...e);const result=graph.solve(0,n-1);let best=Infinity;
  for(let mask=0;mask<1<<(n-2);mask++){const sides=[true,...Array.from({length:n-2},(_,i)=>Boolean(mask>>i&1)),false];best=Math.min(best,edges.reduce((s,[u,v,c])=>s+(sides[u]&&!sides[v]?c:0),0));}
  near(result.flow,best);near(edges.reduce((s,[u,v,c])=>s+(result.reachable[u]&&!result.reachable[v]?c:0),0),best);
 }
});

test('source transforms and half-pixel reflection agree with analytic coordinates',()=>{
 const patch={dx:2,dy:3,sx:11,sy:13,co:0,si:1,zoom:2};assert.deepEqual(cutSourcePoint(patch,4,7),[13,12]);
 for(const [x,n,v] of [[-.5,5,-.5],[4.5,5,4.5],[5,5,4],[-1,5,0],[10,5,0],[-11,5,0],[123,1,0]])near(reflectCutCoordinate(x,n),v);
});

test('old-seam auxiliary nodes match all binary assignments under independent RGB energy',()=>{
 const W=9,H=8,rgb=new Float32Array(W*H*3),patches=[identity,{...identity,sx:.5,sy:.25},{...identity,sx:.25,sy:.5}],analytic=(patch,x,y)=>[20+12*(x+patch.sx)+6*(y+patch.sy),30+7*(x+patch.sx)+3*(y+patch.sy),10+5*(x+patch.sx)+11*(y+patch.sy)];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++)rgb.set(analytic(patches[0],x,y),(y*W+x)*3);
 let cases=0;
 for(const pattern of [[0,1,0,1],[1,0,0,1],[0,0,1,1],[1,1,1,1],[0,-1,1,-1],[0,1,0,1,1,0,0,0,1]])for(const follow of [0,50,100])for(const seam of [0,30]){
  const bw=pattern.length===9?3:2,bh=bw,rect={x:2,y:2,w:bw,h:bh},labels=new Int32Array(W*H).fill(-1),canvas=new Float32Array(rgb.length);labels[2*W+1]=0;
  for(let i=0;i<pattern.length;i++){const x=2+i%bw,y=2+Math.floor(i/bw),j=y*W+x;labels[j]=pattern[i];if(pattern[i]>=0)canvas.set(analytic(patches[pattern[i]],x,y),j*3);}
  const scene={guide:{w:W,h:H,rgb},labels,canvas,patches},result=cutPatchRegion(scene,2,rect,{follow,seam},{forceCenter:true});
  function energy(mask){let e=0;const owners=[];for(let i=0;i<pattern.length;i++){const fresh=mask>>i&1;if(i===0&&fresh||pattern[i]<0&&!fresh||i===Math.floor(bh/2)*bw+Math.floor(bw/2)&&!fresh)return Infinity;owners[i]=fresh?2:pattern[i];const x=2+i%bw,y=2+Math.floor(i/bw);e+=follow/100*.06*dist(analytic(patches[owners[i]],x,y),analytic(patches[0],x,y));}
   for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){const i=y*bw+x;for(const j of [x+1<bw?i+1:-1,y+1<bh?i+bw:-1])if(j>=0&&owners[i]!==owners[j]){const X=2+j%bw,Y=2+Math.floor(j/bw);e+=dist(analytic(patches[owners[i]],2+x,2+y),analytic(patches[owners[j]],2+x,2+y))+dist(analytic(patches[owners[i]],X,Y),analytic(patches[owners[j]],X,Y))+seam*.2;}}
   return e;
  }
  const best=Math.min(...Array.from({length:1<<pattern.length},(_,mask)=>energy(mask))),chosen=result.mask.reduce((s,v,i)=>s+(v<<i),0);near(result.flow,best);near(energy(chosen),best);cases++;
 }
 assert.equal(cases,36);
});

test('old patch seam costs remain a metric after the constant boundary charge',()=>{
 const w=9,h=7,guide={w,h,rgb:Float32Array.from({length:w*h*3},(_,i)=>(i*73)%256)},patches=[identity,{...identity,sx:.31,sy:.72},{...identity,sx:2.1,zoom:1.4}];
 for(const seam of [0,4,20])for(let y=0;y<h-1;y++)for(let x=0;x<w-1;x++){
  const m=(a,b)=>cutMatchingCost(guide,patches,a,b,x,y,x+1,y,seam);near(m(0,0),0);near(m(0,1),m(1,0));assert.ok(m(0,2)<=m(0,1)+m(1,2)+1e-8);
 }
});

test('a surrounded patch can create a closed replacement while retaining the outer rim',()=>{
 const w=31,h=13,rgb=new Float32Array(w*h*3);for(let y=4;y<=6;y++)for(let x=4;x<=6;x++)rgb[(y*w+x)*3]=255;
 const scene={guide:{w,h,rgb},labels:new Int32Array(w*h),canvas:new Float32Array(rgb.length),patches:[{...identity,sx:15},identity]},rect={x:1,y:1,w:9,h:9},p={follow:100,seam:0};
 const result=cutPatchRegion(scene,1,rect,p);assert.ok(result.copied>0&&result.flow<result.before);assert.equal(result.mask[4*9+4],1);
 for(let y=0;y<9;y++)for(let x=0;x<9;x++)if(x===0||y===0||x===8||y===8)assert.equal(result.mask[y*9+x],0);
 const prior=scene.labels.slice();applyCutPatch(scene,1,rect,result);for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<1||y<1||x>9||y>9)assert.equal(scene.labels[y*w+x],prior[y*w+x]);
});

test('all initial regions are covered and every accepted refinement strictly lowers its frozen local objective',()=>{
 const w=57,h=73,a=image(w,h),saved=a.slice(),plan=graphcutPlan(a,w,h,{...base,size:220,follow:0,refine:16},{diagnostics:true});assert.deepEqual(a,saved);const refined=renderGraphcutPlan(a,w,h,base,plan),unrefined=renderGraphcutPlan(a,w,h,base,graphcutPlan(a,w,h,{...base,size:220,follow:0,refine:0}));assert.ok(refined.some((v,i)=>v!==unrefined[i]));assert.ok(plan.labels.every(v=>v>=0&&v<plan.patches.length));
 const refinements=plan.stages.filter(s=>s.stage==='refine');assert.ok(refinements.some(s=>s.accepted&&s.copied>0));for(const s of refinements){assert.ok(s.after<=s.before+1e-8);if(s.accepted)assert.ok(s.after<s.before-1e-7*(1+s.before));else assert.equal(s.copied,0);}
});

test('guide size never enlarges a source and handles single rows, columns and flat colour',()=>{
 for(const [w,h] of [[1,1],[1,47],[51,1],[31,43],[517,3]]){
  const a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set([73,127,188,255],i);const p={...base,size:400,scatter:160,magnify:50,turn:90,refine:16},plan=graphcutPlan(a,w,h,p),out=renderGraphcutPlan(a,w,h,p,plan);assert.ok(plan.w<=w&&plan.h<=h&&Math.max(plan.w,plan.h)<=GRAPHCUT_EDGE);assert.deepEqual(out,a);
 }
});

test('native inverse mapping preserves alternating detail above guide resolution',()=>{
 const w=769,h=7,a=image(w,h),plan={w:17,h:3,patches:[identity],labels:new Int32Array(51)};for(const feather of [0,50,100])assert.deepEqual(renderGraphcutPlan(a,w,h,{...base,feather},plan),a);
});

test('hard ownership, narrow feathering and amount agree with explicit native colour blends',()=>{
 const w=20,h=4,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set([x*10,y*30,73,255],(y*w+x)*4);
 const plan={w:2,h:1,patches:[identity,{...identity,sx:.4}],labels:new Int32Array([0,1])},hard=renderGraphcutPlan(a,w,h,{...base,feather:0},plan),soft=renderGraphcutPlan(a,w,h,{...base,feather:100},plan),half=renderGraphcutPlan(a,w,h,{...base,feather:0,amount:50},plan);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,X=(x+.5)/10-.5,owner=X<.5?0:1,sx=reflectCutCoordinate(x+owner*4,w),r=Math.min(190,Math.max(0,sx*10)),fraction=Math.min(1,Math.max(0,X)),r0=x*10,r1=Math.min(190,Math.max(0,reflectCutCoordinate(x+4,w)*10));near(hard[i],r,.501);near(soft[i],r0*(1-fraction)+r1*fraction,.501);near(half[i],(r+a[i])/2,.501);assert.equal(soft[i+1],a[i+1]);assert.equal(soft[i+3],255);}
});

test('patch selection and native-composition controls affect representative pixels and restore exactly',()=>{
 const w=417,h=61,a=image(w,h),saved=a.slice(),p={...base,size:200,follow:25,scatter:100,turn:15},original=graphcut(a,w,h,p);
 for(const change of [{size:350},{scatter:0},{follow:100},{magnify:180},{turn:75},{seam:100},{feather:0},{amount:50},{seed:914}])assert.ok(graphcut(a,w,h,{...p,...change}).some((v,i)=>v!==original[i]),JSON.stringify(change));assert.deepEqual(graphcut(a,w,h,p),original);assert.deepEqual(a,saved);
});

test('zero amount returns an owned identity copy and does not plan or cache',()=>{
 clearGraphcutCache();const a=Buffer.from(image(7,11)),out=graphcut(a,7,11,{...base,amount:0});assert.deepEqual(out,new Uint8ClampedArray(a));out[0]^=255;assert.notEqual(out[0],a[0]);assert.equal(graphcutCacheInfo().misses,0);
});

test('one exact-source cache reuses only amount and feather, invalidating every geometry control and source byte',()=>{
 clearGraphcutCache();const w=31,h=43,a=image(w,h),plan=graphcutPlan(a,w,h,base),first=graphcut(a,w,h,base);assert.equal(graphcutCacheInfo().misses,1);
 const changed={...base,amount:50,feather:10};assert.deepEqual(graphcut(a,w,h,changed),renderGraphcutPlan(a,w,h,changed,plan));assert.equal(graphcutCacheInfo().hits,1);first[0]^=255;assert.deepEqual(graphcut(a,w,h,base),renderGraphcutPlan(a,w,h,base,plan));
 let misses=1;for(const change of [{size:220},{scatter:0},{follow:0},{magnify:180},{turn:30},{refine:0},{seam:100},{seed:914}]){graphcut(a,w,h,{...base,...change});assert.equal(graphcutCacheInfo().misses,++misses);}
 const altered=a.slice();altered[91]^=255;graphcut(altered,w,h,base);assert.equal(graphcutCacheInfo().misses,++misses);graphcut(altered,h,w,base);assert.equal(graphcutCacheInfo().misses,++misses);clearGraphcutCache();assert.equal(graphcutCacheInfo().bytes,0);
});

test('common alpha composition, mix, inversion and monochrome remain correct',()=>{
 const w=21,h=29,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('graphcut'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);assert.equal(inverted[i+c],255-full[i+c]);}}assert.deepEqual(a,saved);
});

test('0.37 introduces graphcut and retains every previous engine and public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('graphcut');assert.equal(filters.find(f=>f.graphcut).controls.length,9);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=36;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const bad of [{unknown:1},{refine:17},{refine:2.5},{magnify:49},{turn:91},{scatter:'45'},{feather:Infinity}])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,...bad}}])));
 for(const [id,version] of [['watercolour','0.36'],['painterly','0.35'],['scratchlight','0.34'],['specklefield','0.33']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:version})),[old]);}
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
