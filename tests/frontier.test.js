import test from 'node:test';
import assert from 'node:assert/strict';
import {capsuleChart,capsulePoint,capsuleMap} from '../src/frontier-capsule.js';
import {brushVelocity,brushReverse} from '../src/frontier-mixwell.js';
import {momentTables,momentRect,rectAdvect} from '../src/frontier-transport.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {decodeRecipe,encodeRecipe} from '../src/recipes.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('capsule charts round trip flanks, caps, quadrants and circle limit',()=>{
 for(const L of [0,1,47])for(let k=0;k<300;k++){
  const x=Math.sin(k*1.13)*80,y=Math.cos(k*.77)*90,q=capsuleChart(x,y,L),p=capsulePoint(q.s,q.v,L);near(x,p[0]);near(y,p[1]);
  const f=capsuleMap(x,y,L,8),r=capsuleMap(...f,L,8,true);near(x,r[0]);near(y,r[1]);
 }
 assert.equal(capsuleMap(0,2,20,5,true),null);
});
test('capsule insertion conserves local area outside insertion singularity',()=>{
 const e=1e-4;
 for(const [x,y] of [[4,7],[-31,22],[31,-22],[-8,-17],[41,50]]){
  const xp=capsuleMap(x+e,y,35,9),xm=capsuleMap(x-e,y,35,9),yp=capsuleMap(x,y+e,35,9),ym=capsuleMap(x,y-e,35,9);
  const det=((xp[0]-xm[0])*(yp[1]-ym[1])-(xp[1]-xm[1])*(yp[0]-ym[0]))/(4*e*e);near(det,1,2e-6);
 }
});
test('Mixwell brush velocity is divergence free away from its cusp',()=>{
 const e=1e-4;
 for(const [x,y] of [[1,3],[12,6],[-9,-17],[33,-2]]){
  const dx=(brushVelocity(x+e,y,8,2,3)[0]-brushVelocity(x-e,y,8,2,3)[0])/(2*e),dy=(brushVelocity(x,y+e,8,2,3)[1]-brushVelocity(x,y-e,8,2,3)[1])/(2*e);near(dx+dy,0,2e-6);
 }
});
test('adaptive midpoint brush integration converges as steps shrink',()=>{
 const run=s=>brushReverse(13,11,7,-25,-10,30,8,s),reference=run(.003),error=q=>Math.hypot(q[0]-reference[0],q[1]-reference[1]);
 assert.ok(error(run(.05))<error(run(.1))*.4);
});
test('summed density and exact partial-cell first moments match brute integrals',()=>{
 const w=9,h=7,d=Float64Array.from({length:w*h},(_,i)=>.1+(i*17%31)/31),T=momentTables(d,w,h);
 for(let k=0;k<50;k++){
  const x0=(k*13%37)/70,x1=.55+(k*7%37)/90,y0=(k*11%31)/64,y1=.5+(k*3%29)/60,actual=momentRect(T,x0,y0,x1,y1),expected=[0,0,0];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   const a=Math.max(x0,x/w),b=Math.min(x1,(x+1)/w),c=Math.max(y0,y/h),e=Math.min(y1,(y+1)/h);
   if(b<=a||e<=c)continue;const mass=d[y*w+x]*(b-a)*(e-c)*w*h;expected[0]+=mass;expected[1]+=mass*(a+b)/2;expected[2]+=mass*(c+e)/2;
  }actual.forEach((v,i)=>near(v,expected[i],1e-10));
 }
});
test('uniform rectified transport returns points to their initial distribution',()=>{
 const T=momentTables(new Float64Array(64).fill(1),8,8);
 for(const [x,y] of [[.13,.31],[.8,.7],[.5,.5]]){const q=rectAdvect(T,x,y,384);near(q[0],x,.002);near(q[1],y,.002);}
});
test('frontier neutral settings are pixel exact and old engine claims are rejected',()=>{
 const a=Uint8ClampedArray.from({length:32*48*4},(_,i)=>i%4===3?255:i*13%256);
 for(const [id,key] of [['sharpflow','length'],['deposition','radius'],['transport','pull']]){
  const layer=makeLayer(id);layer.params[key]=0;assert.deepEqual(applyFilter(a,32,48,layer),a);
  const recipe=JSON.parse(encodeRecipe([layer]));recipe.engine='0.7';assert.throws(()=>decodeRecipe(JSON.stringify(recipe)));
 }
 for(const engine of ['0.2','0.3','0.4','0.5','0.6','0.7']){const layers=[makeLayer('flow')],recipe=JSON.parse(encodeRecipe(layers));recipe.engine=engine;assert.deepEqual(decodeRecipe(JSON.stringify(recipe)),layers);}
});
