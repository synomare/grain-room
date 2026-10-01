import test from 'node:test';
import assert from 'node:assert/strict';
import {tpms,firstSurface} from '../src/volume-porous.js';
import {chargePotential,normalizedWeights,growDischarge} from '../src/volume-growth.js';
import {makeLayer} from '../src/filters.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('TPMS nodal fields are periodic and blends preserve their endpoints',()=>{
 for(let j=0;j<30;j++)for(const m of [0,.3,1,1.7,2]){const x=j*.319,y=j*.271,z=j*.107;near(tpms(x,y,z,m),tpms(x+2*Math.PI,y,z,m));near(tpms(x,y,z,m),tpms(x,y+2*Math.PI,z,m));near(tpms(x,y,z,m),tpms(x,y,z+2*Math.PI,m));}
 near(tpms(0,0,0,0),0);near(tpms(0,0,0,1),0);near(tpms(0,0,0,2),3);near(tpms(.7,.9,.4,.4),.6*tpms(.7,.9,.4,0)+.4*tpms(.7,.9,.4,1));
});
test('conservative surface search agrees with dense reference on thin, tilted shells',()=>{
 for(let j=0;j<20;j++){const f=z=>Math.abs(tpms(j*.38+z*.975,j*.31+z*.45,z+.3,j%3))-.08;let ref=null;for(let z=0;z<=8;z+=.0005)if(f(z)<=0){ref=z;break;}const q=firstSurface(f,0,8);if(ref===null)assert.equal(q,null);else {assert.notEqual(q,null);near(q,ref,.003);}}
 assert.equal(firstSurface(()=>1,0,2),null);assert.equal(firstSurface(()=>-1,0,2),0);
});
test('charge sum and incremental update equal the direct potential modulo the common count',()=>{
 const pts=[{x:0,y:0},{x:2,y:3},{x:-1,y:4}],x=5,y=2;const sum=pts.reduce((v,p)=>v+1-.5/Math.hypot(x-p.x,y-p.y),0);
 near(chargePotential(x,y,pts)+pts.length,sum);near(chargePotential(x,y,pts.slice(0,2))-.5/Math.hypot(x-pts[2].x,y-pts[2].y),chargePotential(x,y,pts));
 assert.deepEqual(normalizedWeights([1,2,3],2),[0,.25,1]);assert.deepEqual(normalizedWeights([5,6,7],2),[0,.25,1]);assert.deepEqual(normalizedWeights([2,2],2),[1,1]);
});
test('grown forest has unique adjacent sites, conservative subtree mass and a deterministic seed',()=>{
 const w=50,h=70,photo=Float32Array.from({length:w*h},(_,i)=>(i%w)/w),options={steps:650,seeds:6,seed:35},p=growDischarge(w,h,photo,options);
 assert.equal(p.length,650);assert.deepEqual(p,growDischarge(w,h,photo,options));assert.notDeepEqual(p,growDischarge(w,h,photo,{...options,seed:36}));
 const cells=new Set();let total=0;for(let i=0;i<p.length;i++){const q=p[i],key=q.y*w+q.x;assert.ok(!cells.has(key));cells.add(key);assert.ok(q.x>=0&&q.x<w&&q.y>=0&&q.y<h);if(q.parent<0){total+=q.mass;continue;}assert.ok(q.parent<i);const r=p[q.parent];assert.equal(Math.max(Math.abs(q.x-r.x),Math.abs(q.y-r.y)),1);assert.ok(r.mass>q.mass);}
 assert.equal(total,p.length);
});
test('0.12 recipes round trip and keep 0.11 operators while rejecting false old tags',()=>{
 for(const id of ['porous','dendrite']){const layers=[makeLayer(id)],r=JSON.parse(encodeRecipe(layers));assert.equal(r.engine,ENGINE_VERSION);assert.deepEqual(decodeRecipe(JSON.stringify(r)),layers);r.engine='0.11';assert.throws(()=>decodeRecipe(JSON.stringify(r)));}
 const r=JSON.parse(encodeRecipe([makeLayer('quasicut')]));r.engine='0.11';assert.equal(decodeRecipe(JSON.stringify(r))[0].id,'quasicut');
});
