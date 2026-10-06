import test from'node:test';import assert from'node:assert/strict';
import{readFileSync}from'node:fs';import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{ENGINE_VERSION,encodeRecipe,decodeRecipe}from'../src/recipes.js';
import{curlSection,selectPeelPaths,peelFootprint,buildPeelScene,renderPeelScene,peelProjection,curlSheet}from'../src/curl-sheet.js';
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const p={pieces:4,width:85,length:320,curl:220,paper:85,back:95,view:25,shadow:55,light:315,seed:17};
function image(w,h){const a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,z=Math.hypot((x-w*.45)/w,(y-h*.45)/h);a.set(x<w*.3?[200,40,30,255]:z<.24?[245,210,80,255]:[30,70,155,255],i);}return a;}
const area=v=>(v[1].x-v[0].x)*(v[2].y-v[0].y)-(v[1].y-v[0].y)*(v[2].x-v[0].x);
function straight(side=1){return [{points:[{x:.1,y:.45,nx:0,ny:side,width:.3,t:.5},{x:.9,y:.45,nx:0,ny:side,width:.3,t:.5}]}];}
function vertex(x,y,z,u,v,nz=1){return {x,y,z,u,v,nx:0,ny:0,nz};}
function triangle(z,u=0,back=false){const v=[vertex(10,10,z,u,0,back?-1:1),vertex(30,10,z,u+10,0,back?-1:1),vertex(10,30,z,u,10,back?-1:1)];if(back)[v[1].u,v[1].v,v[2].u,v[2].v]=[v[2].u,v[2].v,v[1].u,v[1].v];return {v,id:0};}

test('Circular cross sections preserve arc length and keep the attachment fixed',()=>{
 for(const angle of [0,Math.PI/3,Math.PI/2,Math.PI,250*Math.PI/180]){
  const q=curlSection(0,.3,angle);near(q.u,0);near(q.z,0);
  for(const s of [.02,.15,.28]){const a=curlSection(s-1e-6,.3,angle),b=curlSection(s+1e-6,.3,angle);near(Math.hypot(b.u-a.u,b.z-a.z)/2e-6,1,1e-8);assert.ok(a.z>=0);}
 }
 near(curlSection(.3,.3,Math.PI/2).u,.6/Math.PI);near(curlSection(.3,.3,Math.PI/2).z,.6/Math.PI);near(curlSection(.3,.3,Math.PI).u,0);near(curlSection(.3,.3,Math.PI).z,.6/Math.PI);
 assert.deepEqual(curlSection(.12,.3,0),{u:.12,z:0});
});

test('Material coordinates and the planar hole do not change when a sheet curls',()=>{
 const a=buildPeelScene(straight(),64,64,{curl:60}),b=buildPeelScene(straight(),64,64,{curl:250});
 assert.deepEqual(a.holes,b.holes);for(const q of b.triangles)for(const v of q.v){assert.ok(v.u>=0&&v.u<=64&&v.v>=0&&v.v<=64);assert.ok(v.z>=-1e-10);assert.ok(Object.values(v).every(Number.isFinite));if(v.v===.45*64){near(v.x,v.u);near(v.y,v.v);near(v.z,0);}}
 const sourceArea=b.holes.reduce((s,t)=>s+Math.abs(area(t.v))/2,0);near(sourceArea,.8*.3*64**2,1e-8);
 assert.ok(b.triangles.some(t=>t.back)&&b.triangles.some(t=>!t.back));
});

test('Opposite sides of a boundary both start with the photographed front facing up',()=>{
 for(const side of [-1,1]){
  const flat=buildPeelScene(straight(side),64,64,{curl:0});assert.ok(flat.triangles.length>0);assert.ok(flat.triangles.every(t=>!t.back));for(const q of flat.triangles)for(const v of q.v)near(v.nz,1);
  const rolled=buildPeelScene(straight(side),64,64,{curl:250});assert.ok(rolled.triangles.some(t=>t.back));assert.ok(rolled.triangles.some(t=>!t.back));
 }
});

test('The source sheet is clipped before projection, rather than inventing color outside the photograph',()=>{
 const path=[{points:[{x:-.2,y:.2,nx:0,ny:1,width:.3,t:.5},{x:1.2,y:.2,nx:0,ny:1,width:.3,t:.5}]}],scene=buildPeelScene(path,48,32,{curl:180});
 assert.ok(scene.triangles.length);for(const q of [...scene.triangles,...scene.holes])for(const v of q.v){assert.ok(v.u>=-1e-9&&v.u<=48+1e-9&&v.v>=-1e-9&&v.v<=32+1e-9);assert.ok(Object.values(v).every(Number.isFinite));}
});

test('Oblique viewing moves raised geometry while leaving the source plane fixed',()=>{
 const ground=vertex(12,18,0,12,18),raised=vertex(12,18,8,12,18);assert.deepEqual(peelProjection(ground,55),ground);near(peelProjection(raised,45).x,12+8/Math.sqrt(2));near(peelProjection(raised,45).y,18+8/Math.sqrt(2));
 const scene=buildPeelScene(straight(),64,64,{curl:250}),a=image(64,64);assert.notDeepEqual(renderPeelScene(a,64,64,scene,{view:0,shadow:0}),renderPeelScene(a,64,64,scene,{view:50,shadow:0}));
});

test('Depth resolves overlapping sheets independently of drawing order',()=>{
 const w=40,h=40,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set(x<20?[255,0,0,255]:[0,255,0,255],(y*w+x)*4);
 const red=triangle(2,0),green=triangle(5,22),options={view:0,shadow:0},one=renderPeelScene(a,w,h,{holes:[],triangles:[red,green]},options),two=renderPeelScene(a,w,h,{holes:[],triangles:[green,red]},options);
 assert.deepEqual(one,two);assert.deepEqual([...one.slice((15*w+15)*4,(15*w+15)*4+4)],[0,255,0,255]);
});

test('A visible underside uses its own material instead of mirroring source texture',()=>{
 const w=40,h=40,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set([20,80,200,255],i);
 const out=renderPeelScene(a,w,h,{holes:[],triangles:[triangle(3,0,true)]},{view:0,shadow:0,back:80});assert.deepEqual([...out.slice((15*w+15)*4,(15*w+15)*4+4)],[204,201,190,255]);
});

test('Surface color follows native source coordinates, while untouched pixels remain byte exact',()=>{
 const w=48,h=48,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)a.set([x*4,y*5,140,255],(y*w+x)*4);
 const v=[vertex(20,20,2,2,3),vertex(44,20,2,26,3),vertex(20,44,2,2,27)],out=renderPeelScene(a,w,h,{holes:[],triangles:[{v,id:0}]},{view:0,shadow:0});
 assert.deepEqual([...out.slice((24*w+24)*4,(24*w+24)*4+4)],[24,35,140,255]);for(const [x,y] of [[0,0],[47,47],[2,20]])assert.deepEqual(out.slice((y*w+x)*4,(y*w+x)*4+4),a.slice((y*w+x)*4,(y*w+x)*4+4));
 // Two-pixel bars in a 768px source are finer than the 256px boundary guide.
 // They must still be present on a moved face; only its shape uses the guide.
 const W=768,H=128,fine=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++)fine.set([x%4<2?250:20,100,180,255],(y*W+x)*4);
 const mesh=[vertex(300,10,2,100,10),vertex(500,10,2,300,10),vertex(300,110,2,100,110)],native=renderPeelScene(fine,W,H,{holes:[],triangles:[{v:mesh,id:0}]},{view:0,shadow:0});
 assert.equal(native[(20*W+349)*4],221);assert.equal(native[(20*W+350)*4],49);assert.deepEqual(native.slice(0,4),fine.slice(0,4));
});

test('Tile boundaries, triangle duplication and shadow union do not create seams or repeated darkness',()=>{
 const w=64,h=64,a=image(w,h),scene=buildPeelScene(straight(),w,h,{curl:250}),options={view:25,shadow:70},one=renderPeelScene(a,w,h,scene,options,{tileSize:96}),two=renderPeelScene(a,w,h,scene,options,{tileSize:13});assert.deepEqual(two,one);
 const duplicate={...scene,triangles:[...scene.triangles,...scene.triangles]};assert.deepEqual(renderPeelScene(a,w,h,duplicate,options),one);
 const noShadow=renderPeelScene(a,w,h,scene,{...options,shadow:0});assert.notDeepEqual(noShadow,one);
});

test('Photo-derived cuts are deterministic, regular and independent of geometry and lighting edits',()=>{
 const w=96,h=128,a=image(w,h),paths=selectPeelPaths(a,w,h,p);assert.ok(paths.length>0&&paths.length<=p.pieces);assert.deepEqual(selectPeelPaths(a,w,h,{...p,curl:60,view:-55,shadow:0,paper:0,back:0,light:90}),paths);
 for(const q of paths)for(let i=1;i<q.points.length;i++){const a=q.points[i-1],b=q.points[i];assert.ok(Math.abs(a.width-b.width)<=.7*Math.hypot(a.x-b.x,a.y-b.y)+1e-12);assert.ok(q.points.every(p=>p.width>=0));}
 assert.notDeepEqual(selectPeelPaths(a,w,h,{...p,seed:331}),paths);
 // Dense footprint inspection catches duplicated source regions on this
 // diagnostic input; the selector also rejects polygon intersections.
 const polys=paths.map(peelFootprint),pointIn=(x,y,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a.y>y)!==(b.y>y)&&x<(b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;};
 for(let y=0;y<128;y++)for(let x=0;x<96;x++)assert.ok(polys.filter(poly=>pointIn((x+.5)/128,(y+.5)/128,poly)).length<=1);
});

test('Zero geometry, tiny images and empty boundaries retain input ownership and remain defined',()=>{
 for(const [w,h]of [[1,1],[1,41],[31,1],[3,7],[32,48]]){
  const a=Buffer.from(image(w,h)),saved=Buffer.from(a);for(const edit of [{curl:0},{width:0},{pieces:0},{curl:280,view:55}]){const out=curlSheet(a,w,h,{...p,...edit});assert.ok(out instanceof Uint8ClampedArray);assert.equal(out.length,a.length);assert.ok(out.every(Number.isFinite));assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);}
 }
 const flat=new Uint8ClampedArray(64*64*4);for(let i=0;i<flat.length;i+=4)flat.set([60,100,140,255],i);assert.deepEqual(curlSheet(flat,64,64,p),flat);
});

test('The common engine composites alpha, mixes and restores geometric edits exactly',()=>{
 const w=64,h=96,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('curlsheet'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const original=a[i+c]*a[i+3]/255+255-a[i+3];near(half[i+c],(original+full[i+c])/2,.501);}}
 for(const edit of [{curl:65},{view:-30},{paper:20},{shadow:0}]){assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...l.params,...edit}}),full);assert.deepEqual(applyFilter(a,w,h,l),full);}assert.deepEqual(a,saved);
 const zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}});for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.501);
});

test('0.26 recipes gate new sheets, keep earlier operator tags and reproduce every public recipe',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=26);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.graphplates).length,79);assert.equal(looks.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.directionalwaves&&!f.graphplates).length,109);const l=makeLayer('curlsheet');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=25;n++){assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('mono');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.'+n})),[old]);}
 const previous=makeLayer('bandmoire');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([previous])),engine:'0.25'})),[previous]);
 for(const [key,value]of [['curl',281],['width',-1],['pieces',11],['pieces',1.5],['view',56],['length',59],['paper',101],['back',-1],['shadow',101],['light',361]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const look of looks){let text;try{text=readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8');}catch{continue;}assert.deepEqual(decodeRecipe(text),look.layers);count++;}assert.equal(count,234);
});
