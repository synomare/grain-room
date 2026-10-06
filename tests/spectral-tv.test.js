import test from 'node:test';
import assert from 'node:assert/strict';
import {rofProx,totalVariation,tvFlow,selectTVBand,spectralDecompose,luminanceGuide,renderTVBand,spectralTV,bandCenter,bandWeight} from '../src/spectral-tv.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
import {looks} from '../src/looks.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} vs ${b}`);
const image=(w,h,value=130)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:value);
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;

test('ROF dual solution agrees with analytical two-pixel shrinkage and 2D stripe solutions',()=>{
 for(const alpha of [0,.01,.1,.4,.5,.6,1])for(const [f,w,h] of [[Float64Array.of(0,1),2,1],[Float64Array.of(0,1,0,1),2,2],[Float64Array.of(0,0,1,1),2,2]]){
  const q=rofProx(f,w,h,alpha,{iterations:4096,tolerance:1e-13}),a=Math.min(alpha,.5);
  for(let i=0;i<f.length;i++)near(q.u[i],f[i]?1-a:a,1e-6);near(mean(q.u),.5,1e-14);assert.ok(q.gap<1e-12);
 }
});
test('ROF independently satisfies dual feasibility, stationarity and small KKT gap on a nonseparable image',()=>{
 const w=7,h=9,f=Float64Array.from({length:w*h},(_,i)=>(i*37%101)/100),alpha=.12,q=rofProx(f,w,h,alpha,{iterations:8192,tolerance:1e-12});let complement=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,dx=x+1<w?q.u[i+1]-q.u[i]:0,dy=y+1<h?q.u[i+w]-q.u[i]:0;
  const div=q.px[i]-(x?q.px[i-1]:0)+q.py[i]-(y?q.py[i-w]:0);
  near(q.u[i]-f[i],div,1e-13);assert.ok(Math.hypot(q.px[i],q.py[i])<=alpha+1e-14);
  if(x===w-1)near(q.px[i],0,1e-14);if(y===h-1)near(q.py[i],0,1e-14);
  complement+=alpha*Math.hypot(dx,dy)-q.px[i]*dx-q.py[i]*dy;
 }
 near(complement/f.length,q.gap,1e-13);assert.ok(q.gap<1e-10);near(mean(q.u),mean(f),1e-13);
 assert.ok(totalVariation(q.u,w,h)<totalVariation(f,w,h));assert.ok(q.u.every(v=>v>=-1e-6&&v<=1+1e-6));
 const energy=u=>.5*u.reduce((s,v,i)=>s+(v-f[i])**2,0)+alpha*totalVariation(u,w,h);
 assert.ok(energy(q.u)<energy(f));assert.ok(energy(q.u)<energy(Float64Array.from(f,()=>mean(f))));
});
test('Implicit TV flow has analytical linear decay and an extinction impulse, shifted with contrast',()=>{
 for(const contrast of [1,.5]){
  const f=Float64Array.of(.5-.5*contrast,.5+.5*contrast),times=[.05,.1,.15,.2,.25,.3].map(t=>t*contrast),flow=tvFlow(f,2,1,{times,tolerance:1e-13});
  for(let k=0;k<times.length;k++){const q=tvFlow(f,2,1,{times:times.slice(0,k+1),tolerance:1e-13});near(q.last[0],Math.min(.5,f[0]+times[k]*2),1e-6);}
  const strongest=flow.spectrum.reduce((a,b)=>b.amplitude>a.amplitude?b:a);near(strongest.time,.25*contrast);near(strongest.amplitude,.5*contrast,1e-5);
  for(let i=0;i<2;i++){near(flow.sum[i],f[i]-.5,1e-5);near(flow.remainder[i],.5,1e-5);}
 }
});
test('Finite endpoint residue includes velocity; all integrated masses reconstruct and preserve mean',()=>{
 const f=Float64Array.of(0,1),q=tvFlow(f,2,1,{times:[.05,.1,.15],tolerance:1e-13});
 near(q.last[0],.3);near(q.last[1],.7);near(q.remainder[0],0);near(q.remainder[1],1);
 assert.ok(Math.abs(q.remainder[0]-q.last[0])>.2);
 const g=Float64Array.from({length:11*13},(_,i)=>i*43%101/100),flow=tvFlow(g,11,13);
 for(let i=0;i<g.length;i++)near(flow.sum[i]+flow.remainder[i],g[i],2e-14);
 for(const band of flow.bands)near(mean(band),0,1e-13);near(mean(flow.last),mean(g),1e-13);
 assert.throws(()=>tvFlow(f,2,1,{times:[]}));assert.throws(()=>tvFlow(f,2,1,{times:[.1,.1]}));
});
test('Selection edits fixed signed masses without changing flow; logarithmic weights have a defined center',()=>{
 const f=Float64Array.from({length:63},(_,i)=>i*29%100/100),flow=tvFlow(f,7,9),before=structuredClone(flow);
 const selected=selectTVBand(flow,60,40),again=selectTVBand(flow,60,40);
 assert.deepEqual(selected,again);assert.deepEqual(flow,before);near(mean(selected.band),0,1e-12);
 for(let i=0;i<f.length;i++)near(selected.band[i],flow.bands.reduce((s,b,k)=>s+b[i]*bandWeight(flow.spectrum[k].time,60,40),0),1e-15);
 assert.notDeepEqual(selectTVBand(flow,20,40).band,selected.band);near(bandWeight(bandCenter(60),60,40),1);
});
test('Area guide covers every input pixel, preserves mean and handles noninteger bins and thin inputs',()=>{
 const a=image(17,11);for(let i=0;i<a.length;i+=4)a[i]=a[i+1]=a[i+2]=i*37%256;
 const g=luminanceGuide(a,17,11,7);near(mean(g.u),mean(Float64Array.from({length:17*11},(_,i)=>a[i*4]/255)),1e-14);
 const checker=image(8,4);for(let y=0;y<4;y++)for(let x=0;x<8;x++)for(let c=0;c<3;c++)checker[(y*8+x)*4+c]=(x+y)%2*255;
 assert.ok(luminanceGuide(checker,8,4,2).u.every(v=>Math.abs(v-.5)<1e-15));
 for(const [w,h] of [[1,1],[1,31],[29,1]]){const q=luminanceGuide(image(w,h),w,h,10);assert.ok(q.u.every(v=>Math.abs(v-130/255)<1e-14));}
});
test('Full-resolution reconstruction changes only the selected band; unity gain is exact',()=>{
 const a=image(5,3),d={w:1,h:1,band:Float64Array.of(.1)},p={view:0,gain:20,reveal:70};
 assert.deepEqual(renderTVBand(a,5,3,d,{...p,gain:100}),a);
 const out=renderTVBand(a,5,3,d,p);for(let i=0;i<out.length;i+=4){near(out[i],110,1);assert.equal(out[i+3],255);}
 const zero=renderTVBand(a,5,3,{...d,band:Float64Array.of(0)},{...p,view:1});assert.deepEqual(Array.from(zero.slice(0,4)),[245,240,230,255]);
});
test('Guide cache is independent of selection and gain, and invalidates on changed source contents',()=>{
 const w=19,h=23,a=image(w,h);for(let i=0;i<a.length;i+=4)a[i]=a[i+1]=a[i+2]=i*53%256;
 const p={scale:40,width:50,gain:10,view:0,reveal:70},saved=a.slice(),g=luminanceGuide(a,w,h),d=spectralDecompose(g.u,g.w,g.h,p);
 const initial=spectralTV(a,w,h,p);assert.deepEqual(initial,renderTVBand(a,w,h,d,p));
 spectralTV(a,w,h,{...p,view:1,scale:70});assert.deepEqual(spectralTV(a,w,h,p),initial);
 const b=a.slice();b[0]=b[1]=b[2]=255-b[0];assert.notDeepEqual(spectralTV(b,w,h,p),initial);assert.deepEqual(spectralTV(a,w,h,p),initial);assert.deepEqual(a,saved);
});
test('Engine applies common alpha, monochrome and mix rules; constants and thin inputs are defined',()=>{
 const w=13,h=17,a=image(w,h,90),l=makeLayer('spectraltv');for(let i=3;i<a.length;i+=4)a[i]=i*7%256;
 l.params.gain=100;const neutral=applyFilter(a,w,h,l);for(let i=0;i<a.length;i+=4){assert.equal(neutral[i],Math.round(90*a[i+3]/255+255-a[i+3]));assert.equal(neutral[i+3],255);}
 l.params.view=1;const full=applyFilter(a,w,h,l);l.params.mix=50;const mixed=applyFilter(a,w,h,l);for(let i=0;i<a.length;i+=4){const raw=90*a[i+3]/255+255-a[i+3];assert.ok(Math.abs(mixed[i]-(raw+full[i])/2)<=.5);}
 l.params.mix=100;l.params.colorMode='mono';const mono=applyFilter(a,w,h,l);for(let i=0;i<mono.length;i+=4)assert.ok(mono[i]===mono[i+1]&&mono[i]===mono[i+2]);
 for(const [ww,hh] of [[1,1],[1,31],[29,1]]){const input=image(ww,hh),p={...makeLayer('spectraltv').params,gain:0};assert.deepEqual(spectralTV(input,ww,hh,p),input);const paper=spectralTV(input,ww,hh,{...p,view:1});for(let i=0;i<paper.length;i+=4)assert.deepEqual(Array.from(paper.slice(i,i+4)),[245,240,230,255]);}
});
test('0.22 recipes accept all prior engine tags, gate new TV controls and reproduce three public looks',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=22);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.diffusioncurves&&!f.contactcarry&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,75);assert.equal(looks.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.directionalwaves&&!f.diffusioncurves&&!f.contactcarry&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,97);const l=makeLayer('spectraltv');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.22'})),[l]);
 for(let n=2;n<=21;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [id,version] of [['paletteplates','0.21'],['pupilpsf','0.20'],['artisticscreen','0.19']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:version})),[old]);}
 for(const [key,value] of [['scale',101],['scale',.5],['width',-1],['gain',251],['view',2],['reveal',101]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 for(const look of looks.filter(l=>l.spectraltv))assert.deepEqual(decodeRecipe(encodeRecipe(look.layers)),look.layers);
});
