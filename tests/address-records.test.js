import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {addressDefaults as defaults,addressGrid,addressPlan,recordColour,addressRecords} from '../src/address-records.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);

// Independently bucket pixel centers and evaluate thresholds in 0..255 units.
function oracle(a,w,h,nx,ny,select,threshold,coverage){
 const cells=Array.from({length:nx*ny},()=>({count:0,chosen:0,rgb:[0,0,0]}));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,rgb=[...a.slice(i,i+3)],j=Math.floor((2*x+1)*nx/(2*w))+nx*Math.floor((2*y+1)*ny/(2*h)),cell=cells[j],l=.2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2];
  const signal=[l,255-l,Math.max(...rgb)-Math.min(...rgb)][select];cell.count++;if(signal+1e-10>=255*threshold/100)cell.chosen++;rgb.forEach((v,c)=>cell.rgb[c]+=v);
 }
 return cells.map(cell=>({...cell,rgb:cell.rgb.map(v=>v/cell.count),occupied:cell.chosen>0&&100*cell.chosen>=cell.count*coverage}));
}

test('all native pixels and RGB means agree with independent non-divisible cell buckets',()=>{
 const w=37,h=19,a=image(w,h),copy=a.slice();
 for(const select of [0,1,2])for(const threshold of [0,37,100])for(const coverage of [0,43,100]){
  const p={...defaults,size:93,select,threshold,coverage},g=addressGrid(a,w,h,p),q=oracle(a,w,h,g.nx,g.ny,select,threshold,coverage);assert.equal(g.counts.reduce((s,n)=>s+n,0),w*h);
  q.forEach((cell,j)=>{assert.equal(g.counts[j],cell.count);assert.equal(g.chosen[j],cell.chosen);assert.equal(!!g.occupancy[j],cell.occupied);cell.rgb.forEach((v,c)=>near(g.colour[c][j],v));});
 }
 assert.deepEqual(a,copy);
});

test('empty selection remains empty at zero area and the threshold endpoint is inclusive',()=>{
 const a=new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,0,0,255]);
 const grid=p=>addressGrid(a,3,1,{...defaults,size:100,...p});
 assert.deepEqual([...grid({select:0,threshold:100,coverage:0}).occupancy],[0,1,0]);
 assert.deepEqual([...grid({select:1,threshold:100,coverage:100}).occupancy],[1,0,0]);
 assert.deepEqual([...grid({select:2,threshold:100,coverage:100}).occupancy],[0,0,1]);
 assert.deepEqual([...grid({threshold:0,coverage:100}).occupancy],[1,1,1]);
});

test('one-pixel contribution beyond 1536 changes the correct native mean and occupancy',()=>{
 const w=1537,h=3,a=new Uint8ClampedArray(w*h*4);for(let i=3;i<a.length;i+=4)a[i]=255;
 const p={...defaults,size:10,select:0,threshold:100,coverage:0},b=a.slice(),i=(w-1)*4;b.set([255,255,255,255],i);
 const first=addressGrid(a,w,h,p),second=addressGrid(b,w,h,p);assert.equal(second.chosen.reduce((s,v)=>s+v,0),1);assert.equal(second.occupancy.reduce((s,v)=>s+v,0),1);assert.equal(second.occupancy[second.n-1],1);near(second.colour[0][second.n-1],255/second.counts[second.n-1]);assert.equal(first.colour[0][first.n-1],0);assert.deepEqual(second.colour[0].slice(0,-1),first.colour[0].slice(0,-1));
});

test('integer cyclic records preserve cell identity and selected cardinality without packing',()=>{
 const a=image(41,23),p={...defaults,size:100,records:5,spread:71,angle:39},plan=addressPlan(a,41,23,p),{g,r}=plan;
 for(const record of r){
  assert.deepEqual(record.entries.map(e=>e.sourceIndex).sort((a,b)=>a-b),Array.from({length:g.n},(_,i)=>i));assert.equal(record.entries.filter(e=>e.occupied).length,g.occupancy.reduce((s,v)=>s+v,0));
  record.entries.forEach(e=>{assert.equal(e.occupied,!!g.occupancy[e.sourceIndex]);assert.equal(Number(e.label),e.sourceIndex-plan.origin);});
 }
 const line=addressPlan(a,41,23,{...p,records:3,spread:20,angle:0});assert.deepEqual(line.r.map(r=>r.dx),[-2,0,2]);assert.deepEqual(line.r.map(r=>r.dy),[0,0,0]);
});

test('column, row and row-major addresses measure differences from the declared origin',()=>{
 const a=image(40,30);
 for(const basis of [0,1,2]){
  const p={...defaults,size:100,records:1,originX:0,originY:100,basis},q=addressPlan(a,40,30,p);assert.equal(q.g.nx,10);assert.equal(q.g.ny,8);assert.equal(q.origin,70);
  for(const [j,want] of [[0,[0,-7,-70]],[9,[9,-7,-61]],[70,[0,0,0]],[79,[9,0,9]]])assert.equal(Number(q.r[0].entries[j].label),want[basis]);
 }
});

test('record palette is deterministic, periodic and bounded',()=>{
 assert.deepEqual(recordColour(0),[234,28,28]);assert.deepEqual(recordColour(120),[28,234,28]);assert.deepEqual(recordColour(240),[28,28,234]);assert.deepEqual(recordColour(-25),recordColour(335));assert.deepEqual(recordColour(695),recordColour(335));
 for(let h=0;h<360;h++)assert.ok(recordColour(h).every(v=>v>=28&&v<=234));
});

test('15 controls have visible effects in appropriate active contexts',()=>{
 const w=480,h=360,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w);return [255*x/(w-1),255*y/(h-1),128+90*Math.sin(x/23+y/29),255][i%4];}),p={...defaults,size:60,select:0,threshold:60,coverage:30},out=addressRecords(a,w,h,p),changes={size:40,select:1,threshold:45,coverage:100,records:2,spread:19,angle:73,originX:0,originY:0,basis:0,mode:1,fill:20,source:0,paper:78,text:40};
 for(const [key,value] of Object.entries(changes)){const changed=addressRecords(a,w,h,{...p,[key]:value});assert.ok(changed.some((v,i)=>v!==out[i]),key);}
});

test('neutral controls follow record count, grid rounding, address basis and colour mode',()=>{
 const w=160,h=120,a=image(w,h),render=p=>addressRecords(a,w,h,{...defaults,...p});
 assert.deepEqual(render({records:1,spread:0,angle:0}),render({records:1,spread:100,angle:83}));assert.deepEqual(render({spread:0,angle:0}),render({spread:0,angle:97}));
 assert.deepEqual(render({basis:0,originY:0}),render({basis:0,originY:100}));assert.deepEqual(render({basis:1,originX:0}),render({basis:1,originX:100}));
 assert.deepEqual(render({mode:2,fill:0}),render({mode:2,fill:100}));assert.deepEqual(render({fill:0,mode:0}),render({fill:0,mode:1}));assert.deepEqual(render({seed:1}),render({seed:9999}));
});

test('strip backgrounds retain individual ink; transparent overlap multiplies all occupied records',()=>{
 const w=200,h=200,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[255,255,255,255][i%4]),p={...defaults,size:100,select:0,threshold:0,source:0,records:3,spread:0,fill:60,text:10},stripe=addressRecords(a,w,h,p),overlap=addressRecords(a,w,h,{...p,mode:1}),numbers=addressRecords(a,w,h,{...p,mode:2});
 // Pixel (3,2) is inside the first band, away from grid lines and glyphs.
 const i=(2*w+3)*4,paper=p.paper*2.55,inks=[0,1,2].map(k=>recordColour(335+k*120));
 for(let c=0;c<3;c++){
  assert.equal(stripe[i+c],new Uint8ClampedArray([paper*(1-.6*(1-inks[0][c]/255))])[0]);assert.equal(overlap[i+c],new Uint8ClampedArray([inks.reduce((v,ink)=>v*(1-.6*(1-ink[c]/255)),paper)])[0]);assert.equal(numbers[i+c],new Uint8ClampedArray([paper])[0]);
 }
});

test('tiny axes and maximal settings remain finite opaque repeatable and protect the input',()=>{
 for(const [w,h] of [[1,1],[1,13],[19,1],[7,5]])for(const mode of [0,1,2]){
  const a=image(w,h),copy=a.slice(),p={...defaults,size:10,records:5,spread:100,angle:180,originX:100,originY:100,threshold:100,coverage:100,mode,fill:100,source:100,paper:0,text:100},out=addressRecords(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));assert.deepEqual(out,addressRecords(a,w,h,p));assert.deepEqual(a,copy);
 }
});

test('engine transparency, mixing, inverse and mono keep their established behavior; looks replay',()=>{
 const w=37,h=29,a=image(w,h),copy=a.slice(),l=makeLayer('addressrecords'),out=applyFilter(a,w,h,l);assert.deepEqual(out,addressRecords(a,w,h,l.params));assert.deepEqual(a,copy);assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],new Uint8ClampedArray([a[i]+(255-out[i]-a[i])*.25])[0]);
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);
 assert.deepEqual(applyFilter(new Uint8ClampedArray([17,83,201,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));
 for(const look of looks.filter(l=>l.addressrecords))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});

test('0.54 gates addresses, accepts historical operators and rejects invalid controls',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.addressrecords);assert.equal(f.controls.length,15);assert.equal(f.random,false);const l=makeLayer('addressrecords');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=53;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [id,engine] of [['polarizedpair','0.53'],['meromorphic','0.52']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine})),[old]);}
 for(const [key,value] of [['size',9],['select',3],['threshold',101],['coverage',-1],['records',2.5],['spread',101],['angle',181],['originX',-1],['originY',101],['basis',1.5],['mode',3],['fill',-1],['source',101],['paper',-1],['text',9],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])),key);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
