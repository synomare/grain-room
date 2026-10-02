import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {haarTransform,remapHaar,reflectIndex,softThreshold} from '../src/haar.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const pixels=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*19+Math.floor(i/37)*11)%256);
const energy=a=>a.reduce((s,v)=>s+v*v,0);
test('Haar 2x2 coefficients agree with independent orthonormal matrix products',()=>{
 const input=[1,2,3,5],basis=[[1,1,1,1],[1,-1,1,-1],[1,1,-1,-1],[1,-1,-1,1]],out=haarTransform(input,2,2);
 for(let k=0;k<4;k++)near(out[k],basis[k].reduce((s,v,i)=>s+v*input[i]/2,0));assert.deepEqual(haarTransform(out,2,2,true),Float64Array.from(input));
 assert.throws(()=>haarTransform([1,2,3],3,1));
});
test('Multilevel Haar conserves energy and reconstructs odd content padded to rectangular powers',()=>{
 for(const [w,h] of [[1,1],[2,16],[16,4],[8,8]]){const a=Float64Array.from({length:w*h},(_,i)=>Math.sin(i*.7)+i*.03),copy=a.slice(),out=haarTransform(a,w,h),back=haarTransform(out,w,h,true);assert.deepEqual(a,copy);near(energy(out),energy(a),1e-7);for(let i=0;i<a.length;i++)near(back[i],a[i]);}
 const c=haarTransform(new Float64Array(64).fill(.75),8,8);near(c[0],6);for(let i=1;i<64;i++)near(c[i],0);
});
test('Detail rotation conserves energy without movement and never edits the mean',()=>{
 const a=Float64Array.from({length:64},(_,i)=>Math.cos(i*.47)),c=haarTransform(a,8,8),p={...makeLayer('haar').params,scale:1,depth:4,shift:0,split:0,gain:100,cut:0,turn:37,texture:100},d=remapHaar(c,8,8,p);
 near(d[0],c[0]);near(energy(d),energy(c));assert.notDeepEqual(d,c);const neutral=remapHaar(c,8,8,{...p,turn:0});for(let i=0;i<c.length;i++)near(neutral[i],c[i]);
});
test('Reflected boundaries, soft threshold and fine-band removal have analytic limits',()=>{
 assert.deepEqual(Array.from({length:10},(_,i)=>reflectIndex(i-2,4)),[2,1,0,1,2,3,2,1,0,1]);assert.equal(reflectIndex(-100,1),0);
 near(softThreshold(-3,1),-2);near(softThreshold(.5,1),0);near(softThreshold(3,0),3);
 const c=haarTransform(Float64Array.from({length:64},(_,i)=>i%2),8,8),d=remapHaar(c,8,8,{...makeLayer('haar').params,scale:3,depth:1,shift:0,split:0,turn:0,gain:100,cut:0,texture:0}),out=haarTransform(d,8,8,true);for(const v of out)near(v,.5);
});
test('Haar photo output is deterministic, seed sensitive, nonmutating and exact at neutral',()=>{
 const a=pixels(39,51),copy=a.slice(),l=makeLayer('haar'),out=applyFilter(a,39,51,l);assert.deepEqual(a,copy);assert.deepEqual(applyFilter(a,39,51,l),out);l.params.seed=299;assert.notDeepEqual(applyFilter(a,39,51,l),out);
 Object.assign(l.params,{shift:0,split:0,turn:0,gain:100,cut:0,texture:100});assert.deepEqual(applyFilter(a,39,51,l),a);
});
test('0.18 catalog/assets roundtrip and every historical 0.17 effect stays compatible',()=>{
 assert.equal(ENGINE_VERSION,'0.18');assert.equal(filters.length,71);assert.equal(looks.length,87);
 for(const f of filters){const layers=[makeLayer(f.id)],j=JSON.parse(encodeRecipe(layers));assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);j.engine='0.17';if(f.haar)assert.throws(()=>decodeRecipe(JSON.stringify(j)));else assert.deepEqual(decodeRecipe(JSON.stringify(j)),layers);}
 for(let n=2;n<=17;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([makeLayer('haar')])),engine:'0.'+n})));
 for(const l of looks.filter(l=>l.haar))assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+l.id+'.json',import.meta.url),'utf8')),l.layers);
});
test('Haar thin images, extremes, monochrome and zero mix stay well-defined',()=>{
 const f=filters.find(f=>f.haar);for(const [w,h] of [[1,1],[1,23],[29,1],[23,31]])for(const end of [2,3]){const a=pixels(w,h),l=makeLayer('haar');for(const c of f.controls)l.params[c[0]]=c[end];const out=applyFilter(a,w,h,l);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);l.params.colorMode='mono';const mono=applyFilter(a,w,h,l);for(let i=0;i<mono.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);}l.params.mix=0;assert.deepEqual(applyFilter(a,w,h,l),a);}
});
