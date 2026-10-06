import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {closedRouteDefaults,routeGrid,routeEdges,routeTree,stitchRoute,roundRoute,strokeRouteMask,routeMask,closedRoute} from '../src/closed-route.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const orient=(ax,ay,bx,by,cx,cy)=>(bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
function properCrossings(points){
 const n=points.length/2-1;
 for(let a=0;a<n;a++)for(let b=a+2;b<n;b++){
  if(a===0&&b===n-1)continue;
  const i=a*2,j=b*2,A=orient(points[i],points[i+1],points[i+2],points[i+3],points[j],points[j+1]),B=orient(points[i],points[i+1],points[i+2],points[i+3],points[j+2],points[j+3]),C=orient(points[j],points[j+1],points[j+2],points[j+3],points[i],points[i+1]),D=orient(points[j],points[j+1],points[j+2],points[j+3],points[i+2],points[i+3]);
  assert.ok(!(A*B<-1e-12&&C*D<-1e-12),`crossing segments ${a}, ${b}`);
 }
}
function connected(n,edges){
 const adj=Array.from({length:n},()=>[]),seen=new Set([0]),todo=[0];
 for(const {a,b} of edges){adj[a].push(b);adj[b].push(a);}
 for(let k=0;k<todo.length;k++)for(const j of adj[todo[k]])if(!seen.has(j)){seen.add(j);todo.push(j);}
 return seen.size===n;
}
function exhaustiveTreeCost(n,edges){
 let best=Infinity;
 const choose=(start,selected,sum)=>{
  if(selected.length===n-1){if(connected(n,selected))best=Math.min(best,sum);return;}
  for(let j=start;j<=edges.length-(n-1-selected.length);j++)choose(j+1,[...selected,edges[j]],sum+edges[j].weight);
 };
 choose(0,[],0);return best;
}

test('every cell mean agrees with independent native-pixel membership including thin 1537px inputs',()=>{
 for(const [w,h,size] of [[1,17,26],[17,1,26],[13,9,80],[22,19,50],[25,17,45],[61,47,26],[1537,5,26]]){
  const a=image(w,h),g=routeGrid(a,w,h,size);let total=0;
  for(let j=0;j<g.n;j++){
   const cellX=j%g.nx,cellY=Math.floor(j/g.nx),sums=[0,0,0];let count=0;
   // Compare integer cross-products instead of rounded floating boundaries.
   for(let y=0;y<h;y++)for(let x=0;x<w;x++)if((2*x+1)*g.nx>=2*cellX*w&&(2*x+1)*g.nx<2*(cellX+1)*w&&(2*y+1)*g.ny>=2*cellY*h&&(2*y+1)*g.ny<2*(cellY+1)*h){
    count++;for(let c=0;c<3;c++)sums[c]+=a[(y*w+x)*4+c];
   }
   assert.equal(g.counts[j],count);assert.ok(count>0);total+=count;for(let c=0;c<3;c++)near(g.colour[c][j],sums[c]/count);
  }
  assert.equal(total,w*h);
 }
 const a=image(1537,5),b=a.slice();b[997*4]^=255;
 assert.notDeepEqual(routeGrid(a,1537,5).colour,routeGrid(b,1537,5).colour);
});

test('chosen grid tree has the globally minimum total cost against exhaustive independent enumeration',()=>{
 for(const [nx,ny] of [[1,1],[1,6],[3,2],[3,3]])for(const seed of [1,17,93]){
  const g=routeGrid(image(nx,ny),nx,ny,8),p={...closedRouteDefaults,seed},edges=routeEdges(g,p),tree=routeTree(g,p);
  assert.equal(g.n,nx*ny);assert.equal(tree.length,g.n-1);assert.ok(connected(g.n,tree));
  assert.ok(edges.every(e=>Number.isFinite(e.weight)&&e.weight>=0));
  near(tree.reduce((sum,e)=>sum+e.weight,0),exhaustiveTreeCost(g.n,edges),1e-9);
 }
});

test('all four cell ports have reciprocal degree two and form exactly one simple closed cycle',()=>{
 for(const [w,h] of [[1,1],[1,6],[6,1],[6,5]])for(const seed of [1,17,93]){
  const g=routeGrid(image(w,h),w,h,8),r=stitchRoute(g,routeTree(g,{...closedRouteDefaults,seed})),count=g.n*4;
  assert.equal(new Set(r.ids).size,count);
  for(let j=0;j<count;j++){
   assert.notEqual(r.first[j],r.second[j]);
   for(const next of [r.first[j],r.second[j]])assert.ok(r.first[next]===j||r.second[next]===j);
   const at=r.ids[j],next=r.ids[(j+1)%count];assert.ok(r.first[at]===next||r.second[at]===next);
  }
  for(const round of [0,50,100]){
   const points=roundRoute(r.points,round);assert.deepEqual(points.slice(-2),points.slice(0,2));properCrossings(points);
   for(let j=0;j<points.length;j+=2){assert.ok(points[j]>=0&&points[j]<=w);assert.ok(points[j+1]>=0&&points[j+1]<=h);}
  }
 }
});

test('incomplete, duplicated and non-neighbour joins cannot masquerade as a closed route',()=>{
 const g=routeGrid(image(3,2),3,2,8),tree=routeTree(g);
 assert.throws(()=>stitchRoute(g,tree.slice(1)));
 assert.throws(()=>stitchRoute(g,[tree[0],tree[0],...tree.slice(2)]));
 assert.throws(()=>stitchRoute(g,[{a:0,b:5},...tree.slice(1)]));
 assert.throws(()=>stitchRoute(g,[{a:-1,b:0},...tree.slice(1)]));
});

test('local fillets agree with independent de Casteljau evaluation and leave straight connectors',()=>{
 const points=Float64Array.from([2,2,14,2,14,8,2,8]),amount=73,out=roundRoute(points,amount);
 for(let j=0;j<4;j++){
  const i=j*2,b=((j+3)%4)*2,a=((j+1)%4)*2,P=[points[i],points[i+1]],lengthBefore=Math.hypot(P[0]-points[b],P[1]-points[b+1]),lengthAfter=Math.hypot(points[a]-P[0],points[a+1]-P[1]),r=Math.min(lengthBefore,lengthAfter)*.44*amount/100;
  const E=P.map((v,c)=>v+(points[b+c]-v)*r/lengthBefore),L=P.map((v,c)=>v+(points[a+c]-v)*r/lengthAfter);
  for(let k=0;k<=6;k++)for(let c=0;c<2;c++){
   const t=k/6,u=E[c]+(P[c]-E[c])*t,v=P[c]+(L[c]-P[c])*t;
   near(out[(j*7+k)*2+c],u+(v-u)*t);
  }
 }
});

test('coverage equals independent capsule distance union without dark or opaque double joins',()=>{
 const w=19,h=13,mask=new Float32Array(w*h),segments=[[1.3,2.8,12.4,7.1,2.2],[12.4,7.1,13.9,11.6,1.3],[4,4,4,4,.7],[-5,-2,2,1,1]];
 for(const s of segments)strokeRouteMask(mask,w,h,...s);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let expected=0;
  for(const [ax,ay,bx,by,r] of segments){
   const dx=bx-ax,dy=by-ay,px=x+.5-ax,py=y+.5-ay,length=dx*dx+dy*dy,dot=px*dx+py*dy;
   const distance=!length||dot<=0?Math.hypot(px,py):dot>=length?Math.hypot(x+.5-bx,y+.5-by):Math.abs(dx*py-dy*px)/Math.sqrt(length);
   expected=Math.max(expected,Math.min(1,Math.max(0,r+.5-distance)));
  }
  near(mask[y*w+x],expected,3e-8);
 }
 const before=mask.slice();for(const s of segments)strokeRouteMask(mask,w,h,...s);assert.deepEqual(mask,before);
});

test('all four ink modes use native covered RGB pixels and their declared background',()=>{
 const w=1537,h=5,a=image(w,h),p={...closedRouteDefaults,size:8,paper:31,width:100,weight:0,lift:0},mask=routeMask(a,w,h,p).mask;
 for(const mode of [0,1,2,3]){
  const out=closedRoute(a,w,h,{...p,mode});let covered=0;
  for(let j=0;j<w*h;j++){
   if(mask[j]>.99)covered++;
   for(let c=0;c<3;c++){
    const ink=mode===0?a[j*4+c]:mode===1?0:mode===2?255:255-a[j*4+c],expected=new Uint8ClampedArray([p.paper*2.55+(ink-p.paper*2.55)*mask[j]])[0];
    assert.equal(out[j*4+c],expected);
   }
   assert.equal(out[j*4+3],255);
  }
  assert.ok(covered>0);
 }
});

test('all twelve dedicated controls and seed affect relevant native views and restore reproducibly',()=>{
 const w=311,h=229,a=image(w,h),p={...closedRouteDefaults,seed:17},initial=closedRoute(a,w,h,p);
 for(const [key,value] of Object.entries({size:48,follow:0,random:90,angle:90,round:0,width:23,weight:0,gamma:240,reverse:1,mode:2,paper:100,lift:75,seed:87}))
  assert.notDeepEqual(closedRoute(a,w,h,{...p,[key]:value}),initial,key);
 assert.deepEqual(closedRoute(a,w,h,p),initial);
 assert.deepEqual(closedRoute(a,w,h,{...p,weight:0,gamma:30,reverse:1}),closedRoute(a,w,h,{...p,weight:0,gamma:300,reverse:0}));
 assert.deepEqual(closedRoute(a,w,h,{...p,mode:2,lift:0}),closedRoute(a,w,h,{...p,mode:2,lift:100}));
 assert.deepEqual(routeTree(routeGrid(a,w,h),{...p,random:0,seed:1}),routeTree(routeGrid(a,w,h),{...p,random:0,seed:90}));
});

test('tiny axes, extreme valid controls and repeated image sizes preserve ownership and reproducibility',()=>{
 for(const [w,h] of [[1,1],[1,31],[31,1],[71,53]]){
  const a=image(w,h),copy=a.slice(),initial=closedRoute(a,w,h,closedRouteDefaults);
  for(const p of [{...closedRouteDefaults,size:8,follow:100,random:0,round:100,width:100,gamma:300,reverse:1,mode:3,paper:100,lift:100},{...closedRouteDefaults,size:80,follow:0,random:100,angle:180,round:0,width:1,weight:100,gamma:30,mode:1,paper:0}]){
   const out=closedRoute(a,w,h,p);assert.equal(out.length,a.length);for(let j=3;j<out.length;j+=4)assert.equal(out[j],255);
  }
  closedRoute(image(h,w),h,w,closedRouteDefaults);assert.deepEqual(closedRoute(a,w,h,closedRouteDefaults),initial);assert.deepEqual(a,copy);
 }
});

test('engine integration preserves native rendering and common monochrome, inversion and mixing',()=>{
 const w=97,h=71,a=image(w,h),layer=makeLayer('closedroute'),full=applyFilter(a,w,h,layer);
 assert.deepEqual(full,closedRoute(a,w,h,layer.params));
 const mono=applyFilter(a,w,h,{...layer,params:{...layer.params,colorMode:'mono'}}),inv=applyFilter(a,w,h,{...layer,params:{...layer.params,invert:true}}),mixed=applyFilter(a,w,h,{...layer,params:{...layer.params,mix:40}});
 for(let j=0;j<w*h;j++)for(let c=0;c<3;c++){
  assert.equal(mono[j*4+c],mono[j*4]);assert.equal(inv[j*4+c],255-full[j*4+c]);
  assert.equal(mixed[j*4+c],new Uint8ClampedArray([a[j*4+c]+(full[j*4+c]-a[j*4+c])*.4])[0]);
 }
 assert.deepEqual(applyFilter(a,w,h,{...layer,params:{...layer.params,mix:0}}),a);
});

test('closed paths require 0.49, stereo retains 0.48 support, and all public JSON recipes round-trip',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);
 const layer=makeLayer('closedroute');assert.deepEqual(decodeRecipe(encodeRecipe([layer])),[layer]);
 for(let n=2;n<=48;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([layer])),engine:'0.'+n})));
 const stereo=makeLayer('stereorelief');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([stereo])),engine:'0.48'})),[stereo]);
 for(const [key,value] of [['size',7],['size',26.5],['round',101],['mode',4],['mode',.5],['paper',-1],['gamma',301],['reverse',2],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...layer,params:{...layer.params,[key]:value}}])));
 let count=0;for(const name of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){
  const look=looks.find(l=>l.id===name.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+name,import.meta.url),'utf8')),look.layers);count++;
 }assert.equal(count,234);
});
