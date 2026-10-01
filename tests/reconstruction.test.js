import test from 'node:test';
import assert from 'node:assert/strict';
import {minimumSeam} from '../src/reconstruction-quilt.js';
import {similarityPoint} from '../src/reconstruction-elastic.js';
import {transport,diffuseMass} from '../src/reconstruction-mass.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';

test('minimum seam matches exhaustive optimal path and stays connected',()=>{
 const w=4,h=5,cost=Float32Array.from({length:w*h},(_,i)=>(i*13%19)/19),path=minimumSeam(cost,w,h);
 let best=Infinity;
 function visit(x,y,sum){sum+=cost[y*w+x];if(y===h-1){best=Math.min(best,sum);return;}for(let k=Math.max(0,x-1);k<=Math.min(w-1,x+1);k++)visit(k,y+1,sum);}
 for(let x=0;x<w;x++)visit(x,0,0);
 assert.ok(Math.abs(path.reduce((s,x,y)=>s+cost[y*w+x],0)-best)<1e-12);
 for(let y=1;y<h;y++)assert.ok(Math.abs(path[y]-path[y-1])<=1);
 assert.deepEqual([...minimumSeam(new Float32Array(4),1,4)],[0,0,0,0]);
});
test('MLS interpolates handles and reproduces identity, translation, rotation and scale',()=>{
 const points=[[0,0],[1,0],[0,1],[1,1],[.4,.3]],map=([x,y])=>[2+1.5*(-y),-1+1.5*x],target=points.map(map);
 for(const v of [[.21,.72],[.6,.8],...points]){
  const q=similarityPoint(...v,points,target),expected=map(v),identity=similarityPoint(...v,points,points);
  for(let k=0;k<2;k++){assert.ok(Math.abs(q[k]-expected[k])<1e-9);assert.ok(Math.abs(identity[k]-v[k])<1e-9);}
 }
});
test('closed-boundary transport and diffusion preserve each color mass and positivity',()=>{
 for(const [w,h] of [[13,9],[1,7],[7,1],[1,1]]){
  const n=w*h,planes=[1,2,3,4].map(c=>Float32Array.from({length:n},(_,i)=>.01+(i*c%17)/17)),vx=Float32Array.from({length:n},(_,i)=>Math.sin(i)*12),vy=Float32Array.from({length:n},(_,i)=>Math.cos(i)*15),sum=a=>a.reduce((s,v)=>s+v,0);
  let moved=planes;
  for(let t=0;t<30;t++)moved=transport(moved,vx,vy,w,h).map(v=>diffuseMass(v,w,h));
  moved.forEach((v,c)=>{assert.ok(Math.abs(sum(v)-sum(planes[c]))<1e-4);assert.ok(v.every(x=>Number.isFinite(x)&&x>=0));});
 }
});
test('reconstruction zero controls are exact, and 0.4 recipes remain compatible',()=>{
 const a=Uint8ClampedArray.from({length:31*43*4},(_,i)=>i%4===3?255:i*17%256);
 for(const [id,key] of [['quilt','scatter'],['elastic','pull'],['massbloom','time']]){const layer=makeLayer(id);layer.params[key]=0;assert.deepEqual(applyFilter(a,31,43,layer),a);}
 const value=JSON.parse(encodeRecipe([makeLayer('wetprint')]));value.engine='0.4';assert.equal(decodeRecipe(JSON.stringify(value))[0].id,'wetprint');
 for(const id of ['quilt','elastic','massbloom']){value.layers=[makeLayer(id)];assert.throws(()=>decodeRecipe(JSON.stringify(value)));}
});
