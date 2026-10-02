import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newtonStep,rootOrbit,basinRoots} from '../src/newton.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const historical=JSON.parse(fs.readFileSync(new URL('./v016-catalog.json',import.meta.url),'utf8'));
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pixels=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*19+Math.floor(i/37)*11)%256);
const cubic=[[1,0],[-.5,Math.sqrt(3)/2],[-.5,-Math.sqrt(3)/2]];
test('factored Newton step agrees with independent z cubed minus one quotient',()=>{
 for(const [x,y] of [[.4,.7],[-1.2,.3],[2,-.8]])for(const relax of [.5,.85,1]){
  const pr=x*x*x-3*x*y*y-1,pi=3*x*x*y-y*y*y,dr=3*(x*x-y*y),di=6*x*y,d=dr*dr+di*di;
  const q=newtonStep(x,y,cubic,relax);near(q.x,x-relax*(pr*dr+pi*di)/d);near(q.y,y-relax*(pi*dr-pr*di)/d);assert.equal(q.pole,false);
 }
});
test('root fixed points, derivative pole and affine covariance have analytic limits',()=>{
 for(const [x,y] of cubic){const q=newtonStep(x,y,cubic);near(q.x,x);near(q.y,y);}
 assert.equal(newtonStep(0,0,cubic).pole,true);assert.equal(rootOrbit(0,0,cubic).root,-1);
 const roots=basinRoots(6,17),q=newtonStep(.3,.7,roots),scaled=roots.map(([x,y])=>[2*x+3,2*y-4]),r=newtonStep(3.6,-2.6,scaled);near(r.x,2*q.x+3);near(r.y,2*q.y-4);
});
test('basin classification converges and finite iteration limits do not invent a root',()=>{
 for(let k=0;k<3;k++){const [x,y]=cubic[k],q=rootOrbit(x+.05,y+.02,cubic,30);assert.equal(q.root,k);assert.ok(Math.hypot(q.x-x,q.y-y)<1e-5);assert.ok(q.smoothIteration>=0&&q.smoothIteration<=q.iteration);}
 assert.equal(rootOrbit(.4,.7,cubic,0).root,-1);assert.equal(rootOrbit(.4,.7,cubic,1).root,-1);
 assert.equal(rootOrbit(2,0,[[1,0]],1).root,0);
 for(const n of [3,8])for(const relax of [.5,1])for(const [x,y] of [[1e-12,0],[1e4,-1e4],[.4,.7]]){const q=rootOrbit(x,y,basinRoots(n,99999),40,relax);assert.ok(Object.values(q).every(v=>typeof v!=='number'||Number.isFinite(v)));}
});
test('Newton photo mapping is deterministic, seed-sensitive and does not mutate input',()=>{
 const a=pixels(48,64),before=a.slice(),l=makeLayer('newton'),out=applyFilter(a,48,64,l);assert.deepEqual(a,before);assert.deepEqual(applyFilter(a,48,64,l),out);
 l.params.seed=311;assert.notDeepEqual(applyFilter(a,48,64,l),out);l.params.seed=17;l.params.follow=0;assert.notDeepEqual(applyFilter(a,48,64,l),out);
});
test('0.16 accepts all 68 previous effects as 0.15 and assets match every new look',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=16);assert.equal(historical.effects.length,69);assert.equal(historical.looks.length,81);for(const id of historical.looks)assert.ok(looks.some(l=>l.id===id));
 for(const f of historical.effects.map(id=>filters.find(f=>f.id===id))){const layers=[makeLayer(f.id)],j=JSON.parse(encodeRecipe(layers));assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);j.engine='0.15';if(f.newton)assert.throws(()=>decodeRecipe(JSON.stringify(j)));else assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);}
 for(let n=2;n<=15;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([makeLayer('newton')])),engine:'0.'+n})));
 for(const l of looks.filter(l=>l.newton))assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+l.id+'.json',import.meta.url),'utf8')),l.layers);
});
test('Newton control extremes support thin images, true monochrome and exact zero mix',()=>{
 const f=filters.find(f=>f.newton);
 for(const [w,h] of [[1,1],[1,23],[29,1],[23,31]])for(const end of [2,3]){
  const a=pixels(w,h),l=makeLayer('newton');for(const c of f.controls)l.params[c[0]]=c[end];
  const out=applyFilter(a,w,h,l);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
  l.params.colorMode='mono';const mono=applyFilter(a,w,h,l);for(let i=0;i<mono.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);}
  l.params.mix=0;assert.deepEqual(applyFilter(a,w,h,l),a);
 }
});
