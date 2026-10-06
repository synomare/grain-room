import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeLayer,filters} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
import {createContactSurface,createContactTool,exchangeContact,finishContactPath,walkContactPath,contactTotals,simulateContactTransport,renderContactTransport,contactTransport} from '../src/contact-transport.js';
const near=(a,b,e=1e-11)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const guide=(w,h,color=[.8,.1,.2])=>({w,h,rgb:Float64Array.from({length:w*h*3},(_,i)=>color[i%3])});
const p={width:110,capacity:60,pressure:65,tooth:50,release:45,separate:100,travel:65,angle:105,strokes:3,seed:17};
function load(t,s,amount,color){t.queues[s].push({amount,color});t.mass[s]+=amount;}
function conserved(s,t,initial){const q=contactTotals(s,t);near(q.volume,initial.volume);q.components.forEach((v,c)=>near(v,initial.components[c]));assert.ok(s.mass.every(v=>v>=-1e-14));assert.ok(t.mass.every(v=>v>=-1e-14&&v<=t.capacity+1e-14));return q;}

test('Finite capacity binds a single analytical contact without losing amount or RGB moments',()=>{
 const s=createContactSurface(guide(1,1,[1,0,0]),{tooth:0}),t=createContactTool(s,{width:2000,capacity:60,pressure:100,tooth:0,release:0});t.capacity=.25;const initial=contactTotals(s,t);
 exchangeContact(s,t,.5,.5,1,0,t.length*.2);near(s.mass[0],.75);near(s.native[0],.75);near(t.mass[0],.25);near(s.color[0],.75);assert.equal(s.stats.capacityHits,1);conserved(s,t,initial);
 exchangeContact(s,t,.5,.5,1,0,t.length*.2);near(s.mass[0],.75);near(t.mass[0],.25);conserved(s,t,initial);
});

test('A simultaneous step deposits only old cargo; newly picked color waits for a later step',()=>{
 const s=createContactSurface(guide(1,1,[1,0,0]),{tooth:0}),t=createContactTool(s,{width:2000,capacity:60,pressure:100,tooth:0,release:50});t.capacity=.5;load(t,0,.25,[0,0,1]);const initial=contactTotals(s,t),released=.2;
 exchangeContact(s,t,.5,.5,1,0,t.length*.2);near(s.freshMass[0],released);near(s.freshColor[0],0);near(s.freshColor[2],released);near(s.mass[0],1-(.5-(.25-released)));near(t.mass[0],.5);conserved(s,t,initial);
});

test('Freshly deposited paint is unavailable within a path and becomes exchangeable at the next path',()=>{
 const s=createContactSurface(guide(1,1,[0,0,0]),{tooth:0}),t=createContactTool(s,{width:2000,capacity:60,pressure:100,tooth:0,release:50});s.mass[0]=s.native[0]=0;s.paper[0]=5;t.capacity=1;load(t,0,.8,[0,0,1]);const initial=contactTotals(s,t);
 exchangeContact(s,t,.5,.5,1,0,.05);exchangeContact(s,t,.5,.5,1,0,.05);near(s.stats.picked,0);assert.ok(s.freshMass[0]>0);conserved(s,t,initial);
 finishContactPath(s);assert.equal(s.freshMass[0],0);exchangeContact(s,t,.5,.5,1,0,.05);assert.ok(s.stats.picked>0);conserved(s,t,initial);
});

test('FIFO carries the original order of separate color packets rather than their pooled mean',()=>{
 const s=createContactSurface(guide(1,1,[0,0,0]),{tooth:0}),t=createContactTool(s,{width:2000,capacity:60,pressure:100,tooth:0,release:50});s.mass[0]=s.native[0]=0;s.paper[0]=5;t.capacity=1;load(t,0,.2,[1,0,0]);load(t,0,.3,[0,0,1]);const initial=contactTotals(s,t);
 exchangeContact(s,t,.5,.5,1,0,t.length*.1);near(s.freshMass[0],.1);near(s.freshColor[0],.1);near(s.freshColor[2],0);conserved(s,t,initial);
 exchangeContact(s,t,.5,.5,1,0,t.length*.2);near(s.freshMass[0],.3);near(s.freshColor[0],.2);near(s.freshColor[2],.1);conserved(s,t,initial);
});

test('Rates use traveled distance: subdividing constant contact gives the analytical exponential pickup and linear release',()=>{
 for(const steps of [1,2,4,16]){
  const s=createContactSurface(guide(1,1,[.2,.4,.6]),{tooth:0}),t=createContactTool(s,{width:2000,capacity:60,pressure:100,tooth:0,release:0});s.paper[0]=5;t.capacity=2;const initial=contactTotals(s,t),distance=.03;
  for(let k=0;k<steps;k++)exchangeContact(s,t,.5,.5,1,0,distance/steps);near(s.mass[0],Math.exp(-6*distance/t.length));conserved(s,t,initial);
  const a=createContactSurface(guide(1,1,[0,0,0]),{tooth:0}),b=createContactTool(a,{width:2000,capacity:60,pressure:100,tooth:0,release:50});a.mass[0]=a.native[0]=0;a.paper[0]=5;b.capacity=2;load(b,0,.8,[.7,.4,.2]);const old=contactTotals(a,b);
  for(let k=0;k<steps;k++)exchangeContact(a,b,.5,.5,1,0,distance/steps);near(b.mass[0],.8-distance/b.length);conserved(a,b,old);
 }
});

test('Pressure changes contact eligibility as height changes, beyond a post-render opacity scale',()=>{
 function run(pressure){const s=createContactSurface(guide(20,20),{tooth:0});for(let i=0;i<400;i++)s.paper[i]=i%20<10?0:.42;const t=createContactTool(s,{width:1500,capacity:60,pressure,tooth:100,release:0}),initial=contactTotals(s,t);exchangeContact(s,t,.5,.5,0,1,.03);conserved(s,t,initial);return s;}
 const low=run(20),high=run(60);let lowLeft=0,lowRight=0,highLeft=0;
 for(let i=0;i<400;i++)if(i%20<10){lowLeft+=low.touched[i];highLeft+=high.touched[i];}else lowRight+=low.touched[i];
 assert.equal(lowLeft,0);assert.ok(lowRight>0);assert.ok(highLeft>0);
});

test('Capacity changes the picked amount and leftover tool load; an exit outside the canvas retains its cargo',()=>{
 const results=[];for(const capacity of [10,90]){const s=createContactSurface(guide(96,32),{tooth:0}),t=createContactTool(s,{...p,width:120,tooth:0,release:0,capacity});const initial=contactTotals(s,t);walkContactPath(s,t,[[.05,.16],[1.3,.16]]);const q=conserved(s,t,initial);assert.ok(s.stats.capacityHits>0);near(q.cargo,s.stats.picked);results.push(q.cargo);}
 assert.ok(results[1]>results[0]*20);
});

test('Bright protection blocks the entire contacted cells from pickup and deposition',()=>{
 const g=guide(32,24);for(let y=0;y<24;y++)for(let x=12;x<23;x++)for(let c=0;c<3;c++)g.rgb[(y*32+x)*3+c]=1;
 const s=createContactSurface(g,{tooth:50,protect:100}),t=createContactTool(s,{...p,width:180,pressure:100}),initial=contactTotals(s,t);walkContactPath(s,t,[[0,.35],[1,.35]]);assert.ok(s.stats.picked>0);conserved(s,t,initial);
 for(let y=0;y<24;y++)for(let x=12;x<23;x++){const i=y*32+x;near(s.mass[i],1);near(s.native[i],1);assert.equal(s.touched[i],0);for(let c=0;c<3;c++)near(s.color[i*3+c],1);}
});

test('Arbitrary angled paths, partial footprints and self-crossings preserve positive bounded finite material',()=>{
 const g=guide(45,33);for(let i=0;i<g.rgb.length;i++)g.rgb[i]=(i*37%101)/100;
 const s=createContactSurface(g,{tooth:90,protect:35}),t=createContactTool(s,{...p,width:180,pressure:85,capacity:70}),initial=contactTotals(s,t);
 for(const path of [[[-.1,.2],[.7,.6],[.2,-.1]],[[.8,.1],[.1,.5],[.8,.1]]]){walkContactPath(s,t,path);conserved(s,t,initial);}
 assert.ok(s.stats.deposited>0);assert.ok(s.stats.capacityHits>0);assert.ok(s.native.every(v=>v>=0&&v<=1));
 for(let i=0;i<s.mass.length;i++)for(let c=0;c<3;c++)assert.ok(s.color[i*3+c]>=-1e-13&&s.color[i*3+c]<=s.mass[i]+1e-13);
});

test('Input ownership and unchanged high-resolution areas are preserved, including Node buffers and zero controls',()=>{
 const w=90,h=60,a=Buffer.from(Uint8Array.from({length:w*h*4},(_,i)=>i%4===3?255:i*29%256)),saved=Buffer.from(a);
 const q=simulateContactTransport(a,w,h,{...p,strokes:1,width:50,travel:40}),out=renderContactTransport(a,w,h,q);assert.deepEqual(a,saved);assert.ok(out instanceof Uint8ClampedArray);assert.notDeepEqual(out,new Uint8ClampedArray(a));
 // At equal source/state sizes, untouched cells preserve every original byte.
 for(let i=0;i<q.surface.mass.length;i++)if(!q.surface.touched[i])for(let c=0;c<4;c++)assert.equal(out[i*4+c],a[i*4+c]);
 for(const [key,value]of [['capacity',0],['pressure',0],['travel',0],['strokes',0]]){const b=contactTransport(a,w,h,{...p,[key]:value});assert.deepEqual(b,new Uint8ClampedArray(a));b[0]^=255;assert.deepEqual(a,saved);}
 for(const [ww,hh]of [[1,1],[1,21],[19,1]]){const b=Uint8ClampedArray.from({length:ww*hh*4},(_,i)=>[180,90,30,255][i%4]),r=simulateContactTransport(b,ww,hh,p);conserved(r.surface,r.tool,r.initial);assert.ok(renderContactTransport(b,ww,hh,r).every(Number.isFinite));}
});

test('Width compartments retain different colors across the tool instead of pooling the whole footprint',()=>{
 const g=guide(96,48);for(let y=0;y<48;y++)for(let x=0;x<96;x++)for(let c=0;c<3;c++)g.rgb[(y*96+x)*3+c]=(y<24?[1,0,0]:[0,0,1])[c];
 function run(separate){const s=createContactSurface(g,{tooth:0}),t=createContactTool(s,{...p,width:240,pressure:100,tooth:0,release:0,separate}),old=contactTotals(s,t);walkContactPath(s,t,[[.05,.25],[.8,.25]]);conserved(s,t,old);return t;}
 const pooled=run(0),ribs=run(100);assert.equal(pooled.slots,1);assert.ok(ribs.slots>1);
 assert.ok(pooled.queues[0].some(q=>q.color[0]>.2&&q.color[2]>.2));
 const colors=ribs.queues.flat().map(q=>q.color);assert.ok(colors.some(q=>q[0]>.99&&q[2]<.01));assert.ok(colors.some(q=>q[2]>.99&&q[0]<.01));
});

test('Lifting the tool changes physical exchange; temporal refinement of a tapered crossing converges',()=>{
 const runs=[];for(const spacing of [.5,.25,.125]){const s=createContactSurface(guide(128,96),{tooth:0}),t=createContactTool(s,{...p,width:140,capacity:65,pressure:55,tooth:0,release:50}),old=contactTotals(s,t);walkContactPath(s,t,[[.05,.18],[.95,.63],[.3,.12]],{spacing,taper:true});conserved(s,t,old);runs.push(s.mass);}
 const errors=[0,1].map(k=>runs[k].reduce((s,v,i)=>s+Math.abs(v-runs[2][i]),0)/runs[2].length);assert.ok(errors[1]<errors[0]);assert.ok(errors[1]<.005);
 const s=createContactSurface(guide(32,32),{tooth:0}),t=createContactTool(s,{...p,pressure:100,tooth:0}),old=contactTotals(s,t);exchangeContact(s,t,.5,.5,1,0,.02,0);assert.equal(s.stats.picked,0);conserved(s,t,old);exchangeContact(s,t,.5,.5,1,0,.02,1);assert.ok(s.stats.picked>0);conserved(s,t,old);
});

test('Engine preserves alpha/mix/monochrome, deterministic edits and exact restoration',()=>{
 const w=35,h=41,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i*37%256),saved=a.slice(),l=makeLayer('contactcarry'),full=applyFilter(a,w,h,l),mixed=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const original=a[i+c]*a[i+3]/255+255-a[i+3];near(mixed[i+c],(original+full[i+c])/2,.501);}}
 assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...l.params,capacity:90}}),full);assert.deepEqual(applyFilter(a,w,h,l),full);assert.deepEqual(a,saved);
});

test('0.24 recipes gate the effect, accept prior operators and reproduce every public preset',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=24);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,77);assert.equal(looks.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.directionalwaves&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,103);const l=makeLayer('contactcarry');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=23;n++){assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('mono');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.'+n})),[old]);}
 const previous=makeLayer('diffusioncurves');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([previous])),engine:'0.23'})),[previous]);
 for(const [key,value]of [['width',19],['capacity',101],['pressure',.5],['travel',101],['strokes',9],['release',-1],['separate',101],['protect',101]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 for(const look of looks.filter(l=>l.contactcarry))assert.deepEqual(decodeRecipe(readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8')),look.layers);
});
