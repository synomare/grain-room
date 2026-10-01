import test from 'node:test';
import assert from 'node:assert/strict';
import {distance1D,distanceTransform} from '../src/field-distance.js';
import {rakePoint,vortexPoint,marbleStages,mirror,footprint} from '../src/field-marbling.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {decodeRecipe,encodeRecipe} from '../src/recipes.js';
test('quadratic distance lower envelope agrees with exhaustive costs including missing sites',()=>{
 for(const f of [[Infinity,Infinity],[3],[2,-4,7,Infinity,0],Array.from({length:73},(_,i)=>i%7?Math.sin(i)*20:Infinity)]){
  const {d,arg}=distance1D(f);for(let x=0;x<f.length;x++){const expected=Math.min(...f.map((v,j)=>v+(j-x)**2));assert.equal(d[x],expected);if(Number.isFinite(expected))assert.equal(d[x],f[arg[x]]+(arg[x]-x)**2);else assert.equal(arg[x],-1);}
 }
});
test('2D exact distances and nearest-site coordinates agree with brute force',()=>{
 for(const [w,h] of [[17,13],[1,9],[9,1],[1,1]])for(const empty of [true,false]){
  const sites=Uint8Array.from({length:w*h},(_,i)=>!empty&&(i%13===0||i%23===0)?1:0),{distance,nearest}=distanceTransform(sites,w,h),ids=Array.from(sites.keys()).filter(i=>sites[i]);
  for(let i=0;i<w*h;i++){const metric=j=>(i%w-j%w)**2+(Math.floor(i/w)-Math.floor(j/w))**2,expected=Math.min(...ids.map(metric));assert.equal(distance[i],expected);if(ids.length){assert.equal(sites[nearest[i]],1);assert.equal(metric(nearest[i]),expected);}else assert.equal(nearest[i],-1);}
 }
});
test('marbling coordinate primitives and their composition are reversible with unit area Jacobian',()=>{
 const stages=marbleStages(makeLayer('marble').params,600,900),move=(x,y,s,sign)=>s.type==='rake'?rakePoint(x,y,s,sign):vortexPoint(x,y,s,sign);
 for(const [x,y] of [[11,18],[231,409],[582,791]]){
  let u=x,v=y;for(const s of stages)[u,v]=move(u,v,s,1);for(const s of stages.toReversed())[u,v]=move(u,v,s,-1);assert.ok(Math.hypot(u-x,v-y)<1e-8);
  for(const s of stages){const e=1e-4,c=move(x,y,s,1),a=move(x+e,y,s,1),b=move(x,y+e,s,1),det=((a[0]-c[0])*(b[1]-c[1])-(a[1]-c[1])*(b[0]-c[0]))/(e*e);assert.ok(Math.abs(det-1)<1e-3);}
 }
 assert.equal(mirror(-1,4),1);assert.equal(mirror(4,4),2);assert.equal(mirror(3.5,4),2.5);assert.equal(mirror(1.5,2),.5);assert.equal(mirror(3,1),0);
});
test('new neutral controls are exact identities; 0.6 retains structure and rejects new mechanisms',()=>{
 const w=28,h=19,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:i*19%256);
 for(const [id,params] of [['marble',{pull:0,swirl:0}],['marble',{passes:0}],['accrete',{reach:0}]]){const layer=makeLayer(id);Object.assign(layer.params,params);assert.deepEqual(applyFilter(a,w,h,layer),a);}
 const value=JSON.parse(encodeRecipe([makeLayer('ribbons')]));value.engine='0.6';assert.equal(decodeRecipe(JSON.stringify(value))[0].id,'ribbons');
 for(const id of ['marble','accrete']){value.layers=[makeLayer(id)];assert.throws(()=>decodeRecipe(JSON.stringify(value)));}
 const flat=new Uint8ClampedArray(w*h*4).fill(128);for(let i=3;i<flat.length;i+=4)flat[i]=255;assert.deepEqual(applyFilter(flat,w,h,makeLayer('accrete')),flat);
});
test('sampling footprint detects shear compression without blurring both axes equally',()=>{
 const a=footprint([16,0],[16,0]);assert.equal(a.minor,1);assert.ok(Math.abs(a.major-Math.sqrt(512))<1e-10);assert.equal(a.axis[1],0);
 const b=footprint([3,4],[-4,3]);assert.equal(b.major,5);assert.equal(b.minor,5);
 const c=footprint([0,0],[0,0]);assert.equal(c.major,0);assert.equal(c.minor,1);
});
