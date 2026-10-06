import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {resistDefaults as base,box,arrival,resistPlan,bathState,resistFronts} from '../src/resist-fronts.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);

test('native box means match a direct clamped two-dimensional sum, including thin axes',()=>{
 for(const [w,h] of [[1,7],[8,1],[11,9]])for(const r of [0,1,5,14]){
  const a=Float32Array.from({length:w*h},(_,i)=>(i*731%997)/997),out=box(a,w,h,r);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let sum=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)sum+=a[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))];
   near(out[y*w+x],sum/(2*r+1)**2,1e-7);
  }
 }
});

test('front arrival matches independent Bellman-Ford on the eight-neighbour weighted graph',()=>{
 const w=9,h=7,n=w*h,cost=Float32Array.from({length:n},(_,i)=>1+(i*73%31)/7),seeds=Uint8Array.from({length:n},(_,i)=>[0,27,62].includes(i)?1:0),actual=arrival(cost,seeds,w,h),expected=Float64Array.from(seeds,v=>v?0:Infinity),edges=[];
 for(let j=0;j<n;j++)for(let k=0;k<n;k++){
  const dx=Math.abs(j%w-k%w),dy=Math.abs(Math.floor(j/w)-Math.floor(k/w));if(dx<=1&&dy<=1&&dx+dy)edges.push([j,k,Math.hypot(dx,dy)*(cost[j]+cost[k])/2]);
 }
 for(let pass=0;pass<n;pass++){let changed=false;for(const [j,k,c] of edges)if(expected[j]+c<expected[k]){expected[k]=expected[j]+c;changed=true;}if(!changed)break;}
 for(let j=0;j<n;j++)near(actual[j],expected[j],1e-12);
 const all=new Uint8Array(n).fill(1);assert.ok(arrival(cost,all,w,h).every(v=>v===0));
});

test('constant-cost front uses the documented octile graph metric and has no row wrap',()=>{
 const w=17,h=13,seeds=new Uint8Array(w*h);seeds[0]=1;const out=arrival(new Float32Array(w*h).fill(3),seeds,w,h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)near(out[y*w+x],3*(Math.min(x,y)*Math.SQRT2+Math.abs(x-y)),1e-10);
 const missing=arrival(new Float32Array(4).fill(1),new Uint8Array(4),2,2);assert.ok(missing.every(v=>v===Infinity));
});

test('opening masks, positive costs, fallback and native dimensions remain explicit',()=>{
 const w=151,h=97,a=image(w,h),q=resistPlan(a,w,h,{smooth:0,opening:0,threshold:120});
 assert.equal(q.arrival.length,w*h);assert.equal(q.cost.length,w*h);
 for(let j=0;j<w*h;j++){const l=(.2126*a[j*4]+.7152*a[j*4+1]+.0722*a[j*4+2])/255;assert.equal(q.seeds[j],q.guide[j]*255>=120?1:0);near(q.guide[j],l,4e-8);assert.ok(q.cost[j]>=1&&Number.isFinite(q.arrival[j]));}
 const dark=new Uint8ClampedArray(7*5*4),none=resistPlan(dark,7,5,{opening:0,threshold:240});assert.equal(none.count,1);assert.equal(none.seeds[0],1);
 const white=new Uint8ClampedArray(7*5*4).fill(255),all=resistPlan(white,7,5,{opening:0});assert.equal(all.count,35);assert.ok(all.arrival.every(v=>v===0));
});

function stepBath(t,p){
 let R=1,D=0,F=0;
 for(let k=0;k<p.cycles;k++){
  const duration=Math.max(0,(k+1)-Math.max(t/p.period,k));if(!duration)continue;
  const dev=(k+p.first)%2===0,remaining=R*Math.exp(-duration*(dev?p.develop:p.fix)),used=R-remaining;R=remaining;if(dev)D+=used;else F+=used;
 }
 return [R,D,F];
}
test('closed-form alternating baths match sequential independent reservoir updates and conserve mass',()=>{
 for(const cycles of [1,2,3,7,28,48])for(const first of [0,1])for(const [develop,fix] of [[.5,.5],[.5,20],[20,.5],[8,8],[4,13]]){
  const p={...base,cycles,first,develop,fix};for(const fraction of [0,.03,.5,.999,1,1.73,cycles-.001,cycles,cycles+1]){
   const a=bathState(fraction*p.period,p),b=stepBath(fraction*p.period,p);for(let j=0;j<3;j++){near(a[j],b[j],2e-14);assert.ok(a[j]>=-1e-14&&a[j]<=1+1e-14);}near(a.reduce((sum,v)=>sum+v,0),1,2e-14);
  }
 }
});

test('fixing cannot remove already developed material and processing order matters',()=>{
 const p={...base,cycles:1},developed=bathState(0,p),laterFixed=bathState(0,{...p,cycles:2});near(developed[1],laterFixed[1]);assert.ok(laterFixed[2]>developed[2]);assert.ok(laterFixed[0]<developed[0]);
 assert.notDeepEqual(bathState(2,p),bathState(2,{...p,first:1}));
 assert.deepEqual(bathState(p.period,p),[1,0,0]);
});

test('all seventeen controls and seed affect relevant views, with documented inactive controls',()=>{
 const w=311,h=229,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>{
  const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w),c=i%4;return c===3?255:128+110*Math.sin(c===0?x*.044:c===1?y*.031:(x+y)*.025);
 }),p={...base,opening:2,threshold:105,hold:20,keep:60},initial=resistFronts(a,w,h,p);
 const changes={opening:1,threshold:150,lines:9,angle:60,smooth:0,resist:25,texture:95,scale:140,period:9,cycles:9,first:1,develop:1,fix:1,colour:0,paper:25,keep:0,hold:50,seed:93};
 for(const [key,value] of Object.entries(changes))assert.notDeepEqual(resistFronts(a,w,h,{...p,[key]:value}),initial,key);
 assert.deepEqual(resistFronts(a,w,h,p),initial);
 assert.deepEqual(resistFronts(a,w,h,{...p,opening:1,threshold:30}),resistFronts(a,w,h,{...p,opening:1,threshold:240}));
 assert.deepEqual(resistFronts(a,w,h,{...p,opening:0,lines:1,angle:0}),resistFronts(a,w,h,{...p,opening:0,lines:16,angle:180}));
 assert.deepEqual(resistFronts(a,w,h,{...p,resist:0,texture:0,scale:10,seed:17}),resistFronts(a,w,h,{...p,resist:0,texture:100,scale:150,seed:93}));
});

test('held lower pixels open simultaneously in the final bath and retain native photo colour',()=>{
 const w=1537,h=7,a=image(w,h),p={...base,hold:80,cycles:7,colour:100,paper:41,keep:65},out=resistFronts(a,w,h,p),[R,D,F]=stepBath(p.period*(p.cycles-1),p),paper=[p.paper*2.55,p.paper*2.52,p.paper*2.45];
 for(let y=0;y<h;y++)if(y+.25>=h*.2)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  const i=(y*w+x)*4,expected=R*(.65*a[i+c]+.35*paper[c])+D*(255-a[i+c])*.65+F*paper[c];assert.equal(out[i+c],new Uint8ClampedArray([Number(expected.toFixed(9))])[0]);
 }
});

test('quarter-pixel bath integration matches independent bilinear sampling and sequential chemistry',()=>{
 const w=43,h=31,a=image(w,h),p={...base,opening:0,smooth:0,hold:47,cycles:4,period:9,develop:3,fix:7,keep:37},q=resistPlan(a,w,h,p),out=resistFronts(a,w,h,p),paper=[p.paper*2.55,p.paper*2.52,p.paper*2.45];
 const sample=(x,y)=>{
  x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;let value=0;
  for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)value+=q.arrival[Math.min(h-1,y0+dy)*w+Math.min(w-1,x0+dx)]*(dx?fx:1-fx)*(dy?fy:1-fy);return value/q.S;
 };
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const states=[];for(const dy of [-.25,.25])for(const dx of [-.25,.25])states.push(stepBath(y+.5+dy>=h*(1-p.hold/100)?p.period*(p.cycles-1):sample(x+dx,y+dy),p));
  const [R,D,F]=[0,1,2].map(k=>states.reduce((sum,v)=>sum+v[k],0)/4),i=(y*w+x)*4;near(R+D+F,1,1e-14);
  for(let c=0;c<3;c++){const ink=(1-p.colour/100)*[18,13,9][c]+p.colour/100*(255-a[i+c])*.65,value=R*(p.keep/100*a[i+c]+(1-p.keep/100)*paper[c])+D*ink+F*paper[c];assert.equal(out[i+c],new Uint8ClampedArray([Number(value.toFixed(9))])[0]);}
 }
});

test('protected source colour, native state and extreme thin images preserve ownership and determinism',()=>{
 for(const [w,h] of [[1,1],[1,37],[35,1],[83,59]]){
  const a=image(w,h),copy=a.slice(),p={...base,opening:0,threshold:240,period:3,cycles:1,keep:100},q=resistPlan(a,w,h,p),out=resistFronts(a,w,h,p);
  for(let j=0;j<w*h;j++){
   const x=j%w,y=Math.floor(j/w);let untouched=true;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(q.arrival[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))]/q.S<3)untouched=false;
   if(untouched)for(let c=0;c<3;c++)assert.equal(out[j*4+c],a[j*4+c]);
  }
  const extreme={...base,opening:2,threshold:240,smooth:30,resist:100,texture:100,scale:10,lines:16,angle:180,period:60,cycles:48,first:1,develop:.5,fix:20,colour:0,paper:0,keep:100,hold:80};
  const first=resistFronts(a,w,h,extreme);resistFronts(image(h,w),h,w,base);assert.deepEqual(resistFronts(a,w,h,extreme),first);assert.deepEqual(a,copy);for(let i=3;i<first.length;i+=4)assert.equal(first[i],255);
 }
});

test('native engine integration preserves monochrome, transparent compositing, inversion and mix',()=>{
 const w=97,h=71,a=image(w,h),l=makeLayer('resistfronts'),full=applyFilter(a,w,h,l);assert.deepEqual(full,resistFronts(a,w,h,l.params));
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inv=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}}),mix=applyFilter(a,w,h,{...l,params:{...l.params,mix:40}});
 for(let j=0;j<w*h;j++)for(let c=0;c<3;c++){assert.equal(mono[j*4+c],mono[j*4]);assert.equal(inv[j*4+c],255-full[j*4+c]);assert.equal(mix[j*4+c],new Uint8ClampedArray([a[j*4+c]+(full[j*4+c]-a[j*4+c])*.4])[0]);}
 assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const transparent=new Uint8ClampedArray([17,38,210,0]),flattened=new Uint8ClampedArray([255,255,255,255]);assert.deepEqual(applyFilter(transparent,1,1,l),applyFilter(flattened,1,1,l));
});

test('resist recipes require 0.51, glyphs retain 0.50, and all public JSON round-trip',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.resistfronts).controls.length,17);
 const l=makeLayer('resistfronts');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=50;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('logicglyphs');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.50'})),[old]);
 for(const [key,value] of [['opening',3],['opening',.5],['period',2],['cycles',49],['cycles',.5],['first',2],['develop',.4],['fix',21],['hold',81],['lines',17],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const name of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===name.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+name,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
