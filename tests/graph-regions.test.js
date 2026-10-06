import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {graphMesh,graphDiffuse,graphCells,graphImportance,graphImage,graphRegions,graphPrimitives,polygonArea,renderGraphPrimitives,graphPlates,graphColors} from '../src/graph-regions.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const p=makeLayer('graphplates').params,near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const chain=n=>({points:Array.from({length:n},(_,i)=>[i,0]),adj:Array.from({length:n},(_,i)=>[i-1,i+1].filter(j=>j>=0&&j<n))});
function ring(){const points=[];for(let y=0;y<=8;y+=2)for(let x=0;x<=8;x+=2)points.push([x,y]);const graph=graphMesh(points),labels=Int8Array.from(points,([x,y])=>x===0||x===8||y===0||y===8||x===4&&y===4?0:1);return {graph,labels};}

test('Delaunay adjacency is symmetric and retains the full rectangle without a diagonal crossing',()=>{
 const g=graphMesh([[0,0],[8,0],[8,8],[0,8],[4,4]]);assert.equal(g.triangles.length,12);assert.deepEqual(g.adj[4],[0,1,2,3]);
 for(let i=0;i<g.points.length;i++)for(const j of g.adj[i])assert.ok(g.adj[j].includes(i));
 let area=0;for(let k=0;k<g.triangles.length;k+=3)area+=Math.abs(polygonArea(Array.from(g.triangles.subarray(k,k+3),j=>g.points[j])));near(area,64);
});

test('Almost collinear frame triangles keep the same boundary winding for every label pattern',()=>{
 // This near-duplicate hull case caused a shoelace area of zero and reversed
 // only some pieces, breaking a real 36x48 recipe replay before the repair.
 const points=[[0,0],[36,0],[36,48],[0,48],[35.99999999999997,0],[36,.7794228634059948],[35.99999999999997,48],[35.91302587786873,47.955],[18,24]],g=graphMesh(points);
 assert.ok(Array.from({length:g.triangles.length/3},(_,k)=>Math.abs(polygonArea(Array.from(g.triangles.subarray(k*3,k*3+3),j=>points[j])))).some(v=>v<1e-10));
 for(let bits=0;bits<512;bits++){const labels=Int8Array.from(points,(_,i)=>bits>>i&1),regions=graphRegions(g,labels);near(regions.reduce((s,r)=>s+r.area,0),36*48,1e-8);}
});

test('Graph diffusion re-prioritizes changed intensities and accounts for the final node-value sink',()=>{
 const values=[.9,.45,.7,.6],q=graphDiffuse(chain(4),values,{base:1,detail:0});assert.deepEqual(q.order,[0,2,1,3]);assert.deepEqual(Array.from(q.labels),[1,0,1,0]);near(q.discarded,values.reduce((a,b)=>a+b,0)-q.labels.reduce((a,b)=>a+b,0));assert.deepEqual(values,[.9,.45,.7,.6]);
 const zero=graphDiffuse(chain(4),values,{base:0,detail:0});assert.deepEqual(Array.from(zero.labels),[1,0,1,1]);
 // The third node originally lies below grey but crosses it after receiving
 // error. Its conditional detail gain changes the error passed to the tail.
 const plain=graphDiffuse(chain(4),[.1,.4,.49,.48],{base:.5,detail:0}),boosted=graphDiffuse(chain(4),[.1,.4,.49,.48],{base:.5,detail:6});assert.deepEqual(boosted.order,[0,1,2,3]);near(plain.current[3],.3375);near(boosted.current[3],.2805);
});

test('Normalized node-error transfer does not claim conservation for unequal cell areas',()=>{
 const q=graphDiffuse(chain(2),[.3,.4],{base:1,detail:0});near(q.current[1],.7);assert.deepEqual(Array.from(q.labels),[0,1]);
 const areas=[9,1],originalMass=.3*areas[0]+.4*areas[1],resultMass=q.labels[0]*areas[0]+q.labels[1]*areas[1];near(originalMass,3.1);near(resultMass,1);assert.notEqual(originalMass,resultMass);
});

test('Voronoi quadrature measures field means and one unweighted centroid step',()=>{
 const q=graphCells([[1,1],[3,1]],[.1,.1,.9,.9,.1,.1,.9,.9],4,2);assert.deepEqual(Array.from(q.areas),[4,4]);near(q.values[0],.1);near(q.values[1],.9);assert.deepEqual(q.centroids,[[1,1],[3,1]]);
 const flat=graphImportance(new Float64Array(9*7).fill(.4),9,7,100);for(const v of flat)near(v,.3);
 const contrast=Float64Array.from({length:9*7},(_,i)=>i%9<4?.1:.9),importance=graphImportance(contrast,9,7,100);assert.ok(importance[3*9+3]>importance[3*9]);
});

test('Connected components retain nested holes, reverse-color islands and a complete exterior',()=>{
 const {graph,labels}=ring(),regions=graphRegions(graph,labels);assert.equal(regions.length,3);assert.deepEqual(regions.map(r=>r.nodes.length).sort((a,b)=>a-b),[1,8,16]);
 const outer=regions.find(r=>r.nodes.length===16),inner=regions.find(r=>r.nodes.length===8);assert.equal(outer.loops.length,2);assert.equal(inner.loops.length,2);assert.equal(outer.loops.filter(l=>polygonArea(l)<0).length,1);near(regions.reduce((s,r)=>s+r.area,0),64);assert.ok(regions.every(r=>r.area>0));
 const primitives=graphPrimitives(regions,graph.points,{...p,round:65},8,8),out=renderGraphPrimitives(primitives,80,80,8,8,p),at=(x,y)=>out[(y*80+x)*4];assert.equal(at(40,40),0);assert.equal(at(22,40),255);assert.equal(at(3,40),0);assert.deepEqual(renderGraphPrimitives([...primitives].reverse(),80,80,8,8,p),out);
});

test('Black and white singletons use opposite ground and complement each other without covering holes',()=>{
 const {graph,labels}=ring();for(const round of [0,65,100]){
  const q={...p,round},a=renderGraphPrimitives(graphPrimitives(graphRegions(graph,labels),graph.points,q,8,8),80,80,8,8,q),flipped=Int8Array.from(labels,v=>1-v),b=renderGraphPrimitives(graphPrimitives(graphRegions(graph,flipped),graph.points,q,8,8),80,80,8,8,q);
  for(let i=0;i<a.length;i+=4)near(a[i]+b[i],255,1);
 }
});

test('Singletons on the image edge retain a clipped dot instead of vanishing at zero boundary distance',()=>{
 const g=graphMesh([[0,0],[8,0],[8,8],[0,8],[4,4]]),regions=graphRegions(g,[0,1,1,1,1]),primitives=graphPrimitives(regions,g.points,p,8,8),dot=primitives.find(q=>q.center);assert.ok(dot.radius>0);const out=renderGraphPrimitives(primitives,80,80,8,8,p);assert.equal(out[0],0);assert.equal(out[(79*80+79)*4],255);
});

test('Native path rasterization keeps an exact rectangle and only four subpixel coverage levels',()=>{
 const rectangle={label:0,nodes:[0,1],loops:[[[0,0],[.3,0],[.3,1],[0,1]]]},out=renderGraphPrimitives([rectangle],3,4,1,1,p);for(let y=0;y<4;y++)assert.deepEqual(Array.from(out.subarray(y*12,y*12+12)),[0,0,0,255,255,255,255,255,255,255,255,255]);
 const triangle={label:0,nodes:[0,1],loops:[[[0,0],[1,0],[0,1]]]},diagonal=renderGraphPrimitives([triangle],257,257,1,1,p);assert.ok(diagonal.some((v,i)=>i%4===0&&v>0&&v<255));for(let i=0;i<diagonal.length;i+=4)assert.ok([0,64,128,191,255].includes(diagonal[i]));
 // A geometric circle has a sharp boundary even at a size above the guide cap.
 const circle={label:0,nodes:[0],loops:[],center:[.5,.5],radius:.3},large=renderGraphPrimitives([circle],1024,1024,1,1,p),row=Array.from({length:1024},(_,x)=>large[(512*1024+x)*4]);assert.ok(row.filter(v=>v>0&&v<255).length<=4);assert.equal(row[512],0);assert.equal(row[100],255);
});

test('Two-ink controls leave the graph, labels and material boundaries fixed',()=>{
 const a=image(48,64),saved=a.slice(),base=graphImage(a,48,64,p),edited=graphImage(a,48,64,{...p,tint:100,hue:310,paper:80,round:0,dot:40});assert.deepEqual(base.graph.points,edited.graph.points);assert.deepEqual(base.labels,edited.labels);assert.deepEqual(base.regions,edited.regions);assert.deepEqual(a,saved);
 assert.deepEqual(graphColors(p),[[0,0,0],[255,255,255]]);const colors=graphColors({...p,tint:100});assert.ok(colors[0][2]>colors[0][0]);assert.ok(colors[1][0]>colors[1][2]);assert.notDeepEqual(graphPlates(a,48,64,p),graphPlates(a,48,64,{...p,tint:100}));
});

test('Seed and density edits change sites; detail and diffusion edit the fixed graph labeling',()=>{
 const a=image(64,96),base=graphImage(a,64,96,p),seed=graphImage(a,64,96,{...p,seed:23}),density=graphImage(a,64,96,{...p,adapt:0});assert.notDeepEqual(base.graph.points,seed.graph.points);assert.notDeepEqual(base.graph.points,density.graph.points);
 const threshold=graphImage(a,64,96,{...p,diffusion:0,detail:0}),full=graphImage(a,64,96,{...p,diffusion:100,detail:0});assert.deepEqual(base.graph.points,threshold.graph.points);assert.notDeepEqual(base.labels,threshold.labels);assert.notDeepEqual(base.labels,full.labels);assert.deepEqual(graphPlates(a,64,96,p),graphPlates(a,64,96,p));
});

test('Finite tiny and narrow images keep input ownership and exact black and white endpoints',()=>{
 for(const [w,h] of [[1,1],[1,41],[31,1],[3,7],[32,48]]){
  const a=Buffer.from(image(w,h)),saved=Buffer.from(a),out=graphPlates(a,w,h,p);assert.ok(out instanceof Uint8ClampedArray);assert.equal(out.length,w*h*4);for(let i=0;i<out.length;i+=4){assert.equal(out[i],out[i+1]);assert.equal(out[i],out[i+2]);assert.equal(out[i+3],255);}assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);
  for(const v of [0,255]){const flat=new Uint8ClampedArray(w*h*4);for(let i=0;i<flat.length;i+=4)flat.set([v,v,v,255],i);assert.deepEqual(graphPlates(flat,w,h,p),flat);}
 }
});

test('Common alpha, mixing and monochrome work with generated inks and recipe restoration',()=>{
 const w=32,h=48,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l={id:'graphplates',params:{...p,tint:100}},full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const original=a[i+c]*a[i+3]/255+255-a[i+3];near(half[i+c],(original+full[i+c])/2,.501);}}
 assert.deepEqual(a,saved);for(const edit of [{diffusion:0},{size:36},{dot:0},{round:0}]){assert.ok(!Buffer.from(applyFilter(a,w,h,{...l,params:{...l.params,...edit}})).equals(Buffer.from(full)),JSON.stringify(edit));assert.deepEqual(applyFilter(a,w,h,l),full);}
 const zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}});for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.501);
});

test('0.27 recipes gate graph plates, preserve previous tags and restore every public recipe',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=27);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.seamfold&&!f.domaincolour&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic).length,80);assert.equal(looks.filter(l=>!l.entangledphotorefined&&!l.entangledmatter&&!l.twistedphoto&&!l.fanphoto&&!l.wovenphoto&&!l.puffedphoto&&!l.knottedphoto&&!l.nestedphoto&&!l.sweptphoto&&!l.entangledphoto&&!l.colourpeel&&!l.embroideredphoto&&!l.photomirrors&&!l.miuraphoto&&!l.transmittedfilm&&!l.rasterrelief&&!l.hybridimage&&!l.contextwindows&&!l.pinnedfilm&&!l.edgeownership&&!l.heatstitches&&!l.ellipticorbits&&!l.addressrecords&&!l.polarizedpair&&!l.meromorphic&&!l.resistfronts&&!l.logicglyphs&&!l.closedroute&&!l.stereorelief&&!l.researchgraphics&&!l.sandavalanches&&!l.lbgdots&&!l.flowplates&&!l.flockthreads&&!l.componentislands&&!l.shocklines&&!l.domaincolour&&!l.seamfold&&!l.wovencloth&&!l.graphcut&&!l.watercolour&&!l.painterly&&!l.scratchlight&&!l.speckle&&!l.glyphcontours&&!l.lightsheet&&!l.jointtexture&&!l.monogenic&&!l.directionalwaves).length,112);const l=makeLayer('graphplates');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=26;n++){assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('mono');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.'+n})),[old]);}
 const previous=makeLayer('curlsheet');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([previous])),engine:'0.26'})),[previous]);
 for(const [key,value]of [['size',2],['size',37],['diffusion',101],['adapt',-1],['dot',101],['round',101],['detail',-1],['tint',101],['hue',361],['hue',1.5],['paper',-1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const look of looks){let text;try{text=fs.readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8');}catch{continue;}assert.deepEqual(decodeRecipe(text),look.layers);count++;}assert.equal(count,234);
});
