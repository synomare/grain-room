import test from 'node:test';
import assert from 'node:assert/strict';
import {pointTree,nearestPair,lloydStep} from '../src/structure-voronoi.js';
import {screenedPoisson} from '../src/structure-poisson.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
test('KD nearest two matches exhaustive search, including ties and narrow arrangements',()=>{
 for(const points of [[[0,0]],[[0,0],[0,0],[1,1]],Array.from({length:31},(_,i)=>[i*13%29,i*7%23])]){
  const tree=pointTree(points);for(let x=-2;x<33;x+=1.7)for(let y=-1;y<28;y+=2.1){const sorted=points.map((p,i)=>({i,d:(p[0]-x)**2+(p[1]-y)**2})).sort((a,b)=>a.d-b.d||a.i-b.i),actual=nearestPair(tree,x,y);assert.equal(actual.first,sorted[0].i);assert.equal(actual.second,sorted[1]?.i??-1);}
 }
});
test('weighted Lloyd iterations do not increase discrete quantization energy',()=>{
 const w=23,h=19,rho=Float32Array.from({length:w*h},(_,i)=>.1+(i%17)/17),energy=points=>{const tree=pointTree(points);return rho.reduce((s,v,i)=>s+v*nearestPair(tree,i%w,Math.floor(i/w)).d1,0);};
 let points=[[1,1],[7,3],[12,10],[21,15],[8,17]],previous=energy(points);
 for(let k=0;k<8;k++){points=lloydStep(points,rho,w,h);const next=energy(points);assert.ok(next<=previous+1e-9);previous=next;}
});
test('screened Poisson reconstructs integrable fields and satisfies the linear system',()=>{
 for(const [w,h] of [[17,13],[1,11],[11,1],[1,1]]){
  const source=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.31)),gx=new Float64Array(w*h),gy=gx.slice();
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(x+1<w)gx[i]=source[i+1]-source[i];if(y+1<h)gy[i]=source[i+w]-source[i];}
  const solved=screenedPoisson(gx,gy,source,w,h);solved.forEach((v,i)=>assert.ok(Math.abs(v-source[i])<1e-8));
  gx.forEach((v,i)=>gx[i]=v*Math.cos(i*.2));gy.forEach((v,i)=>gy[i]=v*Math.sin(i*.4));const lambda=.06,u=screenedPoisson(gx,gy,source,w,h,lambda,300,1e-10);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let lhs=lambda*u[i],rhs=lambda*source[i];if(x>0){lhs+=u[i]-u[i-1];rhs+=gx[i-1];}if(x+1<w){lhs+=u[i]-u[i+1];rhs-=gx[i];}if(y>0){lhs+=u[i]-u[i-w];rhs+=gy[i-w];}if(y+1<h){lhs+=u[i]-u[i+w];rhs-=gy[i];}assert.ok(Math.abs(lhs-rhs)<1e-7);}
 }
});
test('zero casting strength is identity and old reconstruction recipes retain their version boundary',()=>{
 const a=Uint8ClampedArray.from({length:20*24*4},(_,i)=>i%4===3?255:i*17%256),l=makeLayer('gradientcast');l.params.amount=0;assert.deepEqual(applyFilter(a,20,24,l),a);
 const value=JSON.parse(encodeRecipe([makeLayer('elastic')]));value.engine='0.5';assert.equal(decodeRecipe(JSON.stringify(value))[0].id,'elastic');
 for(const id of ['ribbons','fault','gradientcast']){value.layers=[makeLayer(id)];assert.throws(()=>decodeRecipe(JSON.stringify(value)));}
});
