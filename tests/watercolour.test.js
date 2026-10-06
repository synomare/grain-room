import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {separateWashPigments,washPaper,washGraph,limitWashFlux,applyWashFlux,moveWashWater,moveCapillaryWater,transferWashPigment,washBoundary,washRewet,simulateWash,kmWashLayer,kmWashComposite,watercolourPlan,renderWatercolourPlan,watercolour,clearWatercolourCache,watercolourCacheInfo} from '../src/watercolour.js';
import {toLinear} from '../src/speckle-field.js';import {makeLayer,filters} from '../src/filters.js';import {looks} from '../src/looks.js';import {applyFilter} from '../src/engine.js';import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const base=makeLayer('watercolour').params,sum=a=>a.reduce((s,v)=>s+v,0),near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:15+(i*37+Math.floor(i/(w*4))*13)%220);
const solid=(w,h,rgb)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:rgb[i%4]);

test('synthetic pigment separation reconstructs the three absorption densities and removes only neutral ink',()=>{
 const rgb=Float64Array.from([.1,.5,.8,.4,.4,.4,1,1,1,0,0,0]),saved=rgb.slice(),a=separateWashPigments(rgb,0),b=separateWashPigments(rgb,100);
 for(let i=0;i<4;i++)for(let c=0;c<3;c++){near(a[c][i]+a[3][i],-.5*Math.log(Math.max(.002,rgb[i*3+c])));near(a[c][i],b[c][i]);near(b[3][i],0);}
 for(let c=0;c<3;c++)near(a[c][1],0);assert.deepEqual(rgb,saved);
});

test('surface flux limits simultaneous donors and receivers without traversal order or negative water',()=>{
 const graph={a:Int32Array.from([0,0,3]),b:Int32Array.from([1,2,0]),n:4},v=Float64Array.from([1,0,0,.2]),q=Float64Array.from([10,10,-10]),cap=Float64Array.from([2,.1,.3,1]);
 const flux=limitWashFlux(v,graph,q,cap),out=applyWashFlux(v,graph,flux);near(sum(out),sum(v));assert.deepEqual(v,Float64Array.from([1,0,0,.2]));
 for(let i=0;i<4;i++){assert.ok(out[i]>=0);assert.ok(out[i]<=cap[i]);}assert.ok(out[0]>=.35);
 const reversed={a:Int32Array.from(graph.a).reverse(),b:Int32Array.from(graph.b).reverse(),n:4},other=applyWashFlux(v,reversed,limitWashFlux(v,reversed,Float64Array.from(q).reverse(),cap));for(let i=0;i<4;i++)near(out[i],other[i]);
});

test('upwind pigment transport uses the donor water concentration and immutable snapshots',()=>{
 const graph=washGraph(2,1),mask=Uint8Array.from([1,1]),bed=Float64Array.from([.5,.5]),water=Float64Array.from([2,1]),pigment=Float64Array.from([4,9]),a=moveWashWater(water,pigment,mask,bed,graph,.5);
 assert.deepEqual(a.water,Float64Array.from([1.5,1.5]));assert.deepEqual(a.pigment,Float64Array.from([3,10]));near(sum(a.pigment),13);
 const b=moveWashWater(Float64Array.from([1,2]),Float64Array.from([9,4]),mask,bed,graph,.5);assert.deepEqual(b.pigment,Float64Array.from([10,3]));
 const stopped=moveWashWater(water,pigment,Uint8Array.from([1,0]),bed,graph,.5);assert.deepEqual(stopped.water,water);assert.deepEqual(stopped.pigment,pigment);assert.deepEqual(water,Float64Array.from([2,1]));
});

test('capillary water equilibrates by fractional saturation and respects each capacity',()=>{
 const cap=Float64Array.from([.2,.4,.7]),graph=washGraph(3,1),equilibrium=Float64Array.from(cap,c=>c*.3);assert.deepEqual(moveCapillaryWater(equilibrium,cap,graph,.25),equilibrium);
 let a=Float64Array.from([.2,.4,0]);for(let t=0;t<250;t++){a=moveCapillaryWater(a,cap,graph,.25);near(sum(a),.6);for(let i=0;i<3;i++)assert.ok(a[i]>=0&&a[i]<=cap[i]);}
 near(a[0]/cap[0],a[2]/cap[2],1e-8);
});

test('pigment deposition favours valleys, rewetting releases settled pigment, and a dry cell deposits its remainder',()=>{
 const g=Float64Array.from([1,1,1,1]),d=Float64Array.from([.5,.5,.5,.5]),a=transferWashPigment(g,d,Uint8Array.from([1,1,1,0]),Float64Array.from([0,1,.5,.5]),Float64Array.from([1,1,0,1]),{rho:.1,stain:2,granulation:1});
 near(a.deposited[0],.6);near(a.deposited[1],.5-.025/1.2);near(a.floating[2],0);near(a.deposited[2],1.5);near(a.floating[3],1);
 for(let i=0;i<4;i++)near(a.floating[i]+a.deposited[i],1.5);assert.deepEqual(g,Float64Array.from([1,1,1,1]));
});

test('a full wet image has no artificial drying frame and a real internal mask has a boundary',()=>{
 for(const [w,h] of [[1,1],[1,17],[19,1],[25,31]])assert.ok(washBoundary(new Uint8Array(w*h).fill(1),w,h,3).every(v=>v===0));
 const w=15,h=15,m=new Uint8Array(w*h);for(let y=3;y<12;y++)for(let x=3;x<12;x++)m[y*w+x]=1;const b=washBoundary(m,w,h,2);near(b[7*w+7],0);assert.ok(b[3*w+3]>.5);near(b[0],0);
});

const patchFixture=()=>{const w=65,h=65,target=new Float64Array(w*h),paper={height:new Float64Array(w*h).fill(.5),capacity:new Float64Array(w*h).fill(.3)};for(let y=15;y<50;y++)for(let x=15;x<50;x++)target[y*w+x]=1;return {w,h,target,paper};};
test('drying an isolated wash concentrates pigment at its edge while conserving pigment and accounting for water',()=>{
 const {w,h,target,paper}=patchFixture(),p={...base,time:120,water:50,damp:0,absorb:0,spread:0,granulation:0,rim:100,stain:0},plain=simulateWash(target,w,h,{...p,rim:0},{paper}),rim=simulateWash(target,w,h,p,{paper});let outside=0,inside=0,no=0,ni=0;
 for(let y=15;y<50;y++)for(let x=15;x<50;x++){const edge=Math.min(x-15,49-x,y-15,49-y);if(edge<3){outside+=rim.mass[y*w+x];no++;}if(edge>8){inside+=rim.mass[y*w+x];ni++;}near(plain.mass[y*w+x],1);}
 assert.ok(outside/no>inside/ni*1.15);near(rim.pigmentError,0,1e-8);near(rim.waterError,0,1e-8);assert.ok(rim.evaporated>plain.evaporated);assert.ok(rim.mass.every(v=>v>=0));
});

test('adding water produces a bloom and wet-mask growth without injecting or deleting pigment',()=>{
 const {w,h,target,paper}=patchFixture(),p={...base,time:150,water:25,damp:90,absorb:30,spread:100,granulation:0,rim:100,stain:0,rewet:100},rewet=washRewet(target,w,h,p),dry=simulateWash(target,w,h,{...p,rewet:0},{paper}),wet=simulateWash(target,w,h,p,{paper});
 let center=0;for(let i=1;i<rewet.length;i++)if(rewet[i]>rewet[center])center=i;assert.ok(wet.mass[center]<dry.mass[center]);assert.ok(sum(wet.mask)>sum(dry.mask));assert.ok(wet.addedWater>0);near(wet.addedWater,sum(rewet),1e-8);near(wet.pigment,dry.pigment,1e-8);near(wet.waterError,0,1e-8);
 assert.ok(washRewet(new Float64Array(w*h),w,h,p).every(v=>v===0));for(let i=0;i<wet.saturation.length;i++)assert.ok(wet.saturation[i]>=0&&wet.saturation[i]<=paper.capacity[i]+1e-12);
});

// Independent Runge-Kutta integration of the two-flux boundary-value ODE.
function slabTransfer(K,S,t){let m=[1,0,0,1];const n=1600,dt=t/n,derivative=v=>[-(K+S)*v[0]+S*v[2],-(K+S)*v[1]+S*v[3],-S*v[0]+(K+S)*v[2],-S*v[1]+(K+S)*v[3]],shift=(a,b,s)=>a.map((v,i)=>v+b[i]*s);for(let i=0;i<n;i++){const a=derivative(m),b=derivative(shift(m,a,dt/2)),c=derivative(shift(m,b,dt/2)),d=derivative(shift(m,c,dt));m=m.map((v,k)=>v+dt*(a[k]+2*b[k]+2*c[k]+d[k])/6);}return m;}
test('Kubelka-Munk reflection and transmission match an independent two-flux ODE and paper boundary',()=>{
 for(const [K,S,t] of [[0,0,1],[0,.4,2],[.8,0,1.7],[.3,.5,.4],[1,.018,3],[2,1.5,.8]]){const m=slabTransfer(K,S,t),R=-m[2]/m[3],T=m[0]+m[1]*R,actual=kmWashLayer(K,S,t);near(actual[0],R,1e-8);near(actual[1],T,1e-8);assert.ok(actual.every(v=>v>=0&&v<=1));for(const paper of [.2,.9,1])near(kmWashComposite(actual[0],actual[1],paper),(paper*m[0]-m[2])/(m[3]-paper*m[1]),1e-8);}
 assert.ok(kmWashLayer(1000,.03,1).every(Number.isFinite));
});

test('half the photo optical density accounts for both passes through a wash over white paper',()=>{
 for(const byte of [12,48,96,160,220,255]){const v=toLinear(byte/255),[R,T]=kmWashLayer(1,0,-.5*Math.log(v));near(kmWashComposite(R,T,1),v);}
 const [R,T]=kmWashLayer(0,.2,2);near(R+T,1);near(kmWashComposite(R,T,1),1);
});

test('paper and four independently transported pigments remain deterministic, positive and finite at extreme settings',()=>{
 for(const [w,h] of [[1,1],[1,19],[19,1],[23,31]]){
  const a=solid(w,h,[0,0,0]),p={...base,time:180,water:100,damp:100,rim:100,absorb:100,spread:100,granulation:100,scale:1,stain:0,rewet:100,softness:100,key:0,density:150},plan=watercolourPlan(a,w,h,p,{diagnostics:true}),out=renderWatercolourPlan(a,w,h,p,plan);
  assert.equal(out.length,a.length);for(const s of plan.states){near(s.pigmentError,0,1e-8);near(s.waterError,0,1e-8);for(const f of [s.mass,s.water,s.saturation,s.deposited,s.floating])assert.ok(f.every(v=>Number.isFinite(v)&&v>=-1e-12));}
  for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
 }
 const a=washPaper(19,23,base);assert.deepEqual(a,washPaper(19,23,base));assert.notDeepEqual(a,washPaper(19,23,{...base,seed:901}));for(let i=0;i<a.height.length;i++)assert.ok(a.height[i]>=0&&a.height[i]<=1&&a.capacity[i]>.17);
});

test('native detail changes sub-guide features without changing the water and pigment simulation',()=>{
 const w=600,h=8,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:Math.floor(i/4)%2?190:70),p={...base,softness:0,key:0,density:100,time:20},plan=watercolourPlan(a,w,h,p),saved=plan.fields.map(f=>f.slice()),coarse=renderWatercolourPlan(a,w,h,{...p,detail:0},plan),native=renderWatercolourPlan(a,w,h,{...p,detail:100},plan);let coarseChange=0,nativeChange=0;
 assert.equal(plan.w,256);for(let x=3;x<w-3;x++){coarseChange+=Math.abs(coarse[x*4]-coarse[(x+1)*4]);nativeChange+=Math.abs(native[x*4]-native[(x+1)*4]);}assert.ok(nativeChange>coarseChange*4);assert.deepEqual(plan.fields,saved);
});

test('zero amount or zero simulation steps returns an owned copy for typed arrays and Buffers',()=>{
 const a=Buffer.from(image(7,11));for(const p of [{...base,amount:0},{...base,time:0}]){const out=watercolour(a,7,11,p);assert.deepEqual(out,new Uint8ClampedArray(a));out[0]^=255;assert.notEqual(out[0],a[0]);}
});

test('all fifteen watercolour controls and the seed change pixels and restore deterministically',()=>{
 const a=image(43,57),saved=a.slice(),original=watercolour(a,43,57,base);assert.equal(filters.find(f=>f.watercolour).controls.length,15);
 for(const change of [{time:180},{water:0},{damp:100},{rim:0},{absorb:100},{spread:100},{granulation:0},{scale:20},{stain:0},{rewet:100},{softness:0},{density:30},{detail:100},{key:0},{amount:50},{seed:914}])assert.notDeepEqual(watercolour(a,43,57,{...base,...change}),original,JSON.stringify(change));
 assert.deepEqual(watercolour(a,43,57,base),original);assert.deepEqual(a,saved);
});

test('composition reuses exact fields, invalidates water, paper, source and shape changes, and never shares its output',()=>{
 clearWatercolourCache();const w=31,h=43,a=image(w,h),plan=watercolourPlan(a,w,h,base),first=watercolour(a,w,h,base);assert.equal(watercolourCacheInfo().misses,1);
 const changed={...base,amount:50,density:80,detail:90};assert.deepEqual(watercolour(a,w,h,changed),renderWatercolourPlan(a,w,h,changed,plan));assert.equal(watercolourCacheInfo().hits,1);
 const saved=first.slice();first[0]^=255;assert.deepEqual(watercolour(a,w,h,base),saved);
 let misses=1;for(const change of [{water:10},{damp:0},{softness:0},{key:10},{seed:914}]){watercolour(a,w,h,{...base,...change});assert.equal(watercolourCacheInfo().misses,++misses);}
 const altered=a.slice();altered[91]^=255;watercolour(altered,w,h,base);assert.equal(watercolourCacheInfo().misses,++misses);watercolour(altered,h,w,base);assert.equal(watercolourCacheInfo().misses,++misses);clearWatercolourCache();assert.equal(watercolourCacheInfo().bytes,0);
});

test('common alpha composition, mix, inversion and monochrome remain correct',()=>{
 const w=21,h=29,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('watercolour'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);assert.equal(inverted[i+c],255-full[i+c]);}}assert.deepEqual(a,saved);
});

test('0.36 introduces watercolour and retains every previous version and public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('watercolour');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=35;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const bad of [{unknown:1},{time:19},{time:100.5},{density:151},{rewet:-1},{water:'45'},{softness:Infinity}])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,...bad}}])));
 for(const [id,version] of [['painterly','0.35'],['scratchlight','0.34'],['specklefield','0.33']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:version})),[old]);}
 const g=makeLayer('glyphcontours');g.params.alphabet=3;g.params.characters='光/ e\u0301';assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([g])),engine:'0.32'})),[g]);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
