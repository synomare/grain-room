import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {ENGINE_VERSION,encodeRecipe,decodeRecipe} from '../src/recipes.js';
import {curveGuide,colorEdges,traceEdgeChains,roundCurvePolyline,extractCurves,editCurveColors,rasterizeCurves,solveCurvePoisson,reconstructCurves,prepareDiffusionCurves,diffusionCurves} from '../src/diffusion-curves.js';
const near=(a,b,e=1e-5)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const line=(x,a,b,y0=0,y1=1)=>({points:[{x,y:y0,left:a,right:b},{x,y:y1,left:a,right:b}]});
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:Math.floor(i/4)%w<w/2?[210,50,80][i%4]:[30,150,90][i%4]);
function residual(q,grid){
 const {w,h,fixed,colors,gx,gy}=grid;let count=0,sum=[0,0,0];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x;if(fixed[i]){for(let c=0;c<3;c++)near(q.rgb[i*3+c],colors[i*3+c],1e-13);continue;}count++;
  for(let c=0;c<3;c++){
   let r=0;const u=q.rgb[i*3+c];
   if(x+1<w)r+=u-q.rgb[(i+1)*3+c]+gx[i*3+c];if(x)r+=u-q.rgb[(i-1)*3+c]-gx[(i-1)*3+c];
   if(y+1<h)r+=u-q.rgb[(i+w)*3+c]+gy[i*3+c];if(y)r+=u-q.rgb[(i-w)*3+c]-gy[(i-w)*3+c];sum[c]+=r*r;
  }
 }
 return sum.map(s=>Math.sqrt(s/Math.max(1,count)));
}
test('Poisson satisfies independently computed equations and the analytical linear Dirichlet solution',()=>{
 const w=17,h=11,n=w*h,g={w,h,fixed:new Uint8Array(n),colors:new Float64Array(n*3),gx:new Float64Array(n*3),gy:new Float64Array(n*3)};
 for(let y=0;y<h;y++)for(const x of [0,w-1]){g.fixed[y*w+x]=1;for(let c=0;c<3;c++)g.colors[(y*w+x)*3+c]=x/(w-1);}
 const q=solveCurvePoisson(g,[.1,.2,.3],null,{tolerance:1e-11});
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)near(q.rgb[(y*w+x)*3+c],x/(w-1),1e-9);
 residual(q,g).forEach((r,c)=>{assert.ok(r<1e-11);near(r,q.diagnostics[c].rmsResidual,1e-13);});
 const short=solveCurvePoisson(g,[0,0,0],null,{iterations:1,tolerance:1e-12});assert.ok(short.diagnostics.some(d=>!d.converged));
});
test('Two-sided jump preserves a sharp analytical step and reversal preserves the same geometry/colors',()=>{
 const curves=[line(.5,[1,0,0],[0,0,1])],g=rasterizeCurves(curves,32,32,32),q=solveCurvePoisson(g);
 for(let y=0;y<32;y++)for(let x=0;x<32;x++){near(q.rgb[(y*32+x)*3],x<16?0:1);near(q.rgb[(y*32+x)*3+2],x<16?1:0);}
 assert.ok(residual(q,g).every(v=>v<1.01e-7));
 const reversed=curves.map(c=>({points:c.points.slice().reverse().map(p=>({...p,left:p.right,right:p.left}))})),r=solveCurvePoisson(rasterizeCurves(reversed,32,32,32));
 q.rgb.forEach((v,i)=>near(v,r.rgb[i],1e-10));
 const noJump=editCurveColors(curves,{jump:0}),soft=solveCurvePoisson(rasterizeCurves(noJump,32,32,32));assert.ok(soft.rgb.every((v,i)=>Math.abs(v-(i%3===1?0:.5))<1e-5));
});
test('Closed curves define interior/exterior colors without leaking original photo samples into the solve',()=>{
 const points=[];for(let k=0;k<=128;k++){const t=k/128*Math.PI*2;points.push({x:.5+.25*Math.cos(t),y:.5+.25*Math.sin(t),left:[1,.2,0],right:[0,.4,1]});}
 const grid=rasterizeCurves([{points}],48,48,48),q=solveCurvePoisson(grid,[.3,.3,.3]);
 for(const [x,y,expected] of [[24,24,[0,.4,1]],[0,0,[1,.2,0]],[47,47,[1,.2,0]]])for(let c=0;c<3;c++)near(q.rgb[(y*48+x)*3+c],expected[c],2e-5);
 assert.ok(residual(q,grid).every(r=>r<1.01e-7));
});
test('Open curves spread edits beyond the line and narrow parallel constraints remain finite',()=>{
 const curves=[line(.5,[1,0,0],[0,0,1],.25,.75)],grid=rasterizeCurves(curves,48,48,48),q=solveCurvePoisson(grid);
 near(q.rgb[(24*48+26)*3],1);assert.ok(q.rgb[(24*48+40)*3]>.8);assert.ok(q.rgb[24*3]>.1&&q.rgb[24*3]<.9);
 const thin=[line(.48,[1,0,0],[0,1,0]),line(.52,[0,0,1],[1,0,0])],g=rasterizeCurves(thin,48,48,48),r=solveCurvePoisson(g);
 assert.ok(r.rgb.every(Number.isFinite));assert.ok(residual(r,g).every(v=>v<1.01e-7));assert.ok(g.fixed.some(v=>v));
});
test('Harmonic boundary data alone cannot recover an internal highlight; RGB affine edits obey linearity',()=>{
 const curves=[line(.5,[.2,.3,.4],[.2,.3,.4])],q=solveCurvePoisson(rasterizeCurves(curves,25,25,25));
 for(let i=0;i<q.rgb.length;i++)near(q.rgb[i],[.2,.3,.4][i%3]);
 const a=[line(.5,[.8,.1,.4],[.1,.7,.2])],b=a.map(c=>({points:c.points.map(p=>({...p,left:p.left.map(v=>v*.4+.2),right:p.right.map(v=>v*.4+.2)}))})),aa=solveCurvePoisson(rasterizeCurves(a,25,25,25)),bb=solveCurvePoisson(rasterizeCurves(b,25,25,25));
 aa.rgb.forEach((v,i)=>near(bb.rgb[i],v*.4+.2,1e-5));
});
test('Curve colors edit independently of source and geometry; zero/reversed contrast have exact attributes',()=>{
 const a=[line(.5,[.8,.2,.4],[.2,.6,.1])],saved=structuredClone(a),zero=editCurveColors(a,{jump:0,paper:0}),reverse=editCurveColors(a,{jump:-100,paper:0}),paper=editCurveColors(a,{jump:100,paper:100});
 assert.deepEqual(a,saved);assert.deepEqual(zero[0].points[0].left,zero[0].points[0].right);
 for(const q of [zero,reverse,paper])assert.deepEqual(q[0].points.map(p=>[p.x,p.y]),a[0].points.map(p=>[p.x,p.y]));
 reverse[0].points[0].left.forEach((v,c)=>near(v,a[0].points[0].right[c],1e-14));assert.deepEqual(paper[0].points[0].left,[1,1,1]);
});
test('Color-gradient extraction detects equal-luma boundaries; chains retain junctions and closed loops',()=>{
 const w=40,h=35,rgb=Float64Array.from({length:w*h*3},(_,i)=>Math.floor(i/3)%w<w/2?[1,0,0][i%3]:[0,.2126/.7152,0][i%3]),e=colorEdges(rgb,w,h,55);
 assert.ok(e.mask.reduce((s,v)=>s+v,0)>=h-5);assert.ok(extractCurves({rgb,w,h},{detail:55,length:0,smooth:10}).curves.length>0);
 const mask=new Uint8Array(7*7);for(const [x,y] of [[2,2],[3,2],[4,2],[4,3],[4,4],[3,4],[2,4],[2,3]])mask[y*7+x]=1;
 const chains=traceEdgeChains(mask,7,7);assert.equal(chains.length,1);assert.equal(chains[0][0],chains[0].at(-1));assert.equal(new Set(chains[0]).size,8);
 const ring=roundCurvePolyline([[0,0],[2,0],[2,2],[0,2],[0,0]]);assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(p=>p.every(Number.isFinite)));
});
test('Area guide preserves RGB averages across fractional bins and constants/thin inputs remain defined',()=>{
 const a=image(17,11),g=curveGuide(a,17,11,7);for(let c=0;c<3;c++){let v=0,s=0;for(let i=c;i<g.rgb.length;i+=3)v+=g.rgb[i];for(let i=c;i<a.length;i+=4)s+=a[i]/255;near(v/(g.w*g.h),s/(17*11),1e-13);}
 for(const [w,h]of [[1,1],[1,31],[29,1]]){const b=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[90,100,120,255][i%4]);assert.deepEqual(diffusionCurves(b,w,h,{}),b);}
});
test('Cached geometry ignores color edits, invalidates extraction controls/source and preserves inputs',()=>{
 const a=image(35,41),saved=a.slice(),p={detail:55,length:15,smooth:10,jump:100,paper:0},q=prepareDiffusionCurves(a,35,41,p),out=diffusionCurves(a,35,41,p);
 const changed=prepareDiffusionCurves(a,35,41,{...p,paper:50});assert.equal(changed.model,q.model);assert.notEqual(changed.solution,q.solution);assert.deepEqual(diffusionCurves(a,35,41,p),out);
 assert.notEqual(prepareDiffusionCurves(a,35,41,{...p,detail:65}).model,q.model);
 const b=a.slice();b[0]=250;assert.notDeepEqual(prepareDiffusionCurves(b,35,41,p).model.mean,q.model.mean);assert.deepEqual(a,saved);
 const model=extractCurves(curveGuide(a,35,41),p);for(const size of [80,160]){const s=reconstructCurves(model,size,size*41/35,p);assert.ok(s.rgb.every(Number.isFinite));assert.ok(s.diagnostics.every(d=>d.converged));}
});
test('Softening changes only display of the solved field; common alpha/mix/mono rules remain exact',()=>{
 const w=25,h=31,a=image(w,h),p=makeLayer('diffusioncurves').params,q=prepareDiffusionCurves(a,w,h,p),soft=prepareDiffusionCurves(a,w,h,{...p,soften:80});assert.equal(soft.model,q.model);assert.equal(soft.solution,q.solution);assert.notDeepEqual(diffusionCurves(a,w,h,{...p,soften:80}),diffusionCurves(a,w,h,{...p,soften:0}));
 for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const layer=makeLayer('diffusioncurves'),full=applyFilter(a,w,h,layer),mixed=applyFilter(a,w,h,{...layer,params:{...layer.params,mix:50}}),mono=applyFilter(a,w,h,{...layer,params:{...layer.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const original=a[i+c]*a[i+3]/255+255-a[i+3];near(mixed[i+c],(original+full[i+c])/2,.501);}}
 const empty=applyFilter(a,w,h,{...layer,params:{...layer.params,mix:0}});for(let i=0;i<a.length;i+=4)near(empty[i],a[i]*a[i+3]/255+255-a[i+3],.501);
});
test('0.23 recipes gate the new effect, accept every prior tag and validate controls/public presets',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=23);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.contactcarry&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,76);assert.equal(looks.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.directionalwaves&&!f.contactcarry&&!f.bandmoire&&!f.curlsheet&&!f.graphplates).length,100);const l=makeLayer('diffusioncurves');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=22;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [key,v] of [['detail',101],['length',-.5],['smooth',101],['jump',-101],['jump',151],['paper',101],['soften',101],['jump',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:v}}])));
 for(const look of looks.filter(l=>l.diffusioncurves)){const publicRecipe=readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8');assert.deepEqual(decodeRecipe(publicRecipe),look.layers);}
 for(let n=2;n<=22;n++){const classic=makeLayer('mono');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([classic])),engine:'0.'+n})),[classic]);}
});
