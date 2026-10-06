import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeLayer,filters} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {ENGINE_VERSION,encodeRecipe,decodeRecipe} from '../src/recipes.js';
import {bandGeometry,createBandColumn,bandPrimitive,integrateEncodedBand,createBandSweep,bandApertureCoverage,bandMoire} from '../src/band-moire.js';
const near=(a,b,e=1e-10)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:i*37%256);
const linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
const p={compression:128,repeats:1,aperture:1.5,phase:0,tilt:0,soften:100,view:2};

test('Geometry distinguishes source enlargement from the opposite travel of the revealed image',()=>{
 const g=bandGeometry(624,{compression:13,repeats:1,phase:0}),m=g.revealer/(g.revealer-g.base),beat=g.base*m;
 near(g.base,48);near(g.revealer,52);near(m,13);near(beat,624);near(-g.base/(g.revealer-g.base),-12);
 const shifted=bandGeometry(624,{compression:13,phase:25}),delta=shifted.offset-g.offset;near(delta,13);
 // At every transparent-line center, encoded source phase equals the beat
 // phase, modulo an integer. Moving the grating is not moving the base image.
 for(let n=0;n<12;n++){const y=n*g.revealer+delta,a=y/g.base,b=y/beat+delta/g.revealer;near(a-b,Math.round(a-b));}
 near(-12*delta,-156);
});

test('Area-averaged column means and first moments have analytical periodic extensions, including negatives',()=>{
 const a=Uint8ClampedArray.from([255,0,0,255,0,255,0,255]),q=createBandColumn(a,1,2,0);
 near(bandPrimitive(q,1.25,0),.75);near(bandPrimitive(q,1.25,0,true),.40625);near(bandPrimitive(q,-.25,0),0);near(bandPrimitive(q,-.25,0,true),0);
 near(bandPrimitive(q,-.25,1),-.25);near(bandPrimitive(q,-.25,1,true),.03125);near(integrateEncodedBand(q,3,-6,3,0),4.5);
 const w=3,h=713,b=image(w,h);for(const rows of [1,7,64,512]){const col=createBandColumn(b,w,h,1,{rows});for(let c=0;c<3;c++){let sum=0;for(let y=0;y<h;y++)sum+=linear(b[(y*w+1)*4+c]/255);near(col.prefix[col.n*3+c],sum/h,1e-12);}}
});

test('Encode then reveal is the integral of the product, rather than independently averaged colors and openings',()=>{
 const a=Uint8ClampedArray.from([255,0,0,255,0,255,0,255]),column=createBandColumn(a,1,2,0),g={base:1,revealer:1,duty:.2,offset:.25,sin:0,cos:1},s=createBandSweep(column,0,1,g,0,1);
 near(s.integrate(0,1,0),.2);near(s.integrate(0,1,1),0);near(s.mask(0,1),.2);near(column.prefix[6]*s.mask(0,1),.1);
 assert.ok(s.integrate(0,1,0)>column.prefix[6]*s.mask(0,1));
});

test('Finite angled apertures agree with an independent dense 2D integration of the source and mask',()=>{
 const w=7,h=13,a=image(w,h),column=createBandColumn(a,w,h,3),n=12000,m=48;
 for(const tilt of [0,-3,.1,1,3]){
  const g=bandGeometry(h,{compression:24,repeats:2,aperture:13,phase:17,tilt}),s=createBandSweep(column,3,w,g,-1,h+1);
  for(const [y0,y1]of [[.7,1.1],[2.8,4.2]]){
   const numeric=[0,0,0];let mask=0;
   for(let j=0;j<n;j++){const y=y0+(j+.5)/n*(y1-y0),phase=((y/g.base)%1+1)%1,k=Math.min(h-1,Math.floor(phase*h));for(let z=0;z<m;z++){
    const x=3+(z+.5)/m,t=(g.cos*y+g.sin*(x-w/2)-g.offset)/g.revealer+g.duty/2,open=t-Math.floor(t)<g.duty?1:0;mask+=open;
    for(let c=0;c<3;c++)numeric[c]+=linear(a[(k*w+3)*4+c]/255)*open;
   }}
   near(s.mask(y0,y1),mask/(n*m)*(y1-y0),.00045);for(let c=0;c<3;c++)near(s.integrate(y0,y1,c),numeric[c]/(n*m)*(y1-y0),.00045);
  }
 }
});

test('Sweeps are additive across arbitrary aperture crossings and axis limits remain finite',()=>{
 const w=9,h=21,a=image(w,h),column=createBandColumn(a,w,h,4);
 for(const tilt of [-4,-.1,0,.1,4])for(const aperture of [.5,1.5,30]){
  const g=bandGeometry(h,{...p,compression:256,repeats:4,phase:99.5,tilt,aperture}),s=createBandSweep(column,4,w,g,-.7,h+.7);
  for(let c=0;c<3;c++){const full=s.integrate(-.6,h+.6,c),split=s.integrate(-.6,7.2,c)+s.integrate(7.2,h+.6,c);near(full,split,1e-10);assert.ok(Number.isFinite(full)&&full>=0);}
  for(const y of [-.1,.2,3.5,h-.1])assert.ok(bandApertureCoverage(4,y,w,g)>=0&&bandApertureCoverage(4,y,w,g)<=1);
 }
});

test('One full grating period preserves a constant linear-light source after exposure compensation',()=>{
 const w=13,h=256,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[80,150,220,255][i%4]);
 for(const tilt of [-4,0,4])for(const phase of [0,17.5,99.5])assert.deepEqual(bandMoire(a,w,h,{...p,tilt,phase}),a);
 // The physical layer product is dark. Exposure compensation is separate.
 const raw=bandMoire(a,w,h,{...p,view:1});assert.notDeepEqual(raw,a);assert.ok(raw.some((v,i)=>i%4!==3&&v===0));
});

test('A stored encoding is independent of the grating and the mask is independent of source colors',()=>{
 const w=23,h=45,a=image(w,h),saved=a.slice(),base=bandMoire(a,w,h,{...p,view:0});
 assert.deepEqual(bandMoire(a,w,h,{...p,view:0,aperture:30,phase:70,spacing:98,tilt:4,soften:10}),base);
 const mask=bandMoire(a,w,h,{...p,view:3}),b=a.slice();for(let i=0;i<b.length;i++)if(i%4!==3)b[i]=255-b[i];assert.deepEqual(bandMoire(b,w,h,{...p,view:3}),mask);
 assert.deepEqual(a,saved);assert.notDeepEqual(bandMoire(a,w,h,{...p,phase:25}),bandMoire(a,w,h,p));
 assert.deepEqual(bandMoire(a,w,h,{...p,phase:100}),bandMoire(a,w,h,p));assert.deepEqual(bandMoire(a,w,h,{...p,seed:99999}),bandMoire(a,w,h,p));
});

test('Changing only the revealing period changes image scale and reversal, including coincident periods',()=>{
 const g=bandGeometry(624,{compression:13}),same=bandGeometry(624,{compression:13,spacing:1200/13}),reversed=bandGeometry(624,{compression:13,spacing:90});
 near(g.base,same.base);near(g.base,reversed.base);near(same.revealer,same.base);assert.ok(reversed.revealer<reversed.base);
 const a=image(17,33);for(const spacing of [95,100,105,1200/13]){const out=bandMoire(a,17,33,{...p,compression:13,spacing});assert.ok(out.every(Number.isFinite));}
 assert.notDeepEqual(bandMoire(a,17,33,{...p,spacing:98}),bandMoire(a,17,33,{...p,spacing:102}));
});

test('Subpixel gratings, extreme aspect ratios and all views stay defined and retain input ownership',()=>{
 for(const [w,h]of [[1,1],[1,31],[29,1],[3,7]])for(const view of [0,1,2,3]){
  const a=Buffer.from(image(w,h)),saved=Buffer.from(a),out=bandMoire(a,w,h,{...p,compression:256,repeats:4,aperture:.5,tilt:4,phase:99.5,view});
  assert.deepEqual(a,saved);assert.ok(out instanceof Uint8ClampedArray);assert.equal(out.length,w*h*4);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.ok(out.every(Number.isFinite));
 }
});

test('Engine keeps exact alpha/mix/monochrome rules and restores phase, spacing and view edits',()=>{
 const w=25,h=37,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('bandmoire'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const raw=a[i+c]*a[i+3]/255+255-a[i+3];near(half[i+c],(raw+full[i+c])/2,.501);}}
 for(const edit of [{phase:25},{spacing:98},{view:0},{tilt:-.25}]){assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...l.params,...edit}}),full);assert.deepEqual(applyFilter(a,w,h,l),full);}assert.deepEqual(a,saved);
});

test('0.25 recipes gate the new effect, accept every prior operator tag and reproduce public presets',()=>{
 assert.ok(Number(ENGINE_VERSION.split('.')[1])>=25);assert.equal(filters.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.curlsheet&&!f.graphplates).length,78);assert.equal(looks.filter(f=>!f.entangledphotorefined&&!f.entangledmatter&&!f.twistedphoto&&!f.fanphoto&&!f.wovenphoto&&!f.puffedphoto&&!f.knottedphoto&&!f.nestedphoto&&!f.sweptphoto&&!f.entangledphoto&&!f.colourpeel&&!f.embroideredphoto&&!f.photomirrors&&!f.miuraphoto&&!f.transmittedfilm&&!f.rasterrelief&&!f.hybridimage&&!f.contextwindows&&!f.pinnedfilm&&!f.edgeownership&&!f.heatstitches&&!f.ellipticorbits&&!f.addressrecords&&!f.polarizedpair&&!f.meromorphic&&!f.resistfronts&&!f.logicglyphs&&!f.closedroute&&!f.stereorelief&&!f.researchgraphics&&!f.sandavalanches&&!f.lbgdots&&!f.flowplates&&!f.flockthreads&&!f.componentislands&&!f.shocklines&&!f.domaincolour&&!f.seamfold&&!f.wovencloth&&!f.graphcut&&!f.watercolour&&!f.painterly&&!f.scratchlight&&!f.speckle&&!f.glyphcontours&&!f.lightsheet&&!f.jointtexture&&!f.monogenic&&!f.directionalwaves&&!f.curlsheet&&!f.graphplates).length,106);const l=makeLayer('bandmoire');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=24;n++){assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('mono');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.'+n})),[old]);}
 const previous=makeLayer('contactcarry');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([previous])),engine:'0.24'})),[previous]);
 for(const [key,value]of [['compression',15],['compression',256.5],['repeats',.5],['aperture',0],['spacing',94.9],['phase',100.1],['tilt',4.1],['view',4],['soften',101]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 for(const look of looks.filter(l=>l.bandmoire))assert.deepEqual(decodeRecipe(readFileSync(new URL('../public/recipes/'+look.id+'.json',import.meta.url),'utf8')),look.layers);
});
