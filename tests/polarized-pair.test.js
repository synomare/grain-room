import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {polarizedPairDefaults as defaults,polarizedBands,doubleRetarderIntensity,polarizedColour,polarizedPalette,closestPolarizedColour,polarizedPhotoField,polarizedPartner,makePolarizedTable,samplePolarizedTable,polarizedPair} from '../src/polarized-pair.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,e=1e-11)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const rad=d=>d*Math.PI/180;
const add=(a,b)=>[a[0]+b[0],a[1]+b[1]],multiply=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]],scale=(a,s)=>a.map(v=>v*s);
// Independent full 2x2 complex Jones matrices, rather than production's
// closed expression for its real antisymmetric and imaginary symmetric terms.
function matrix(axis,retardance,wavelength){
 const c=Math.cos(axis),s=Math.sin(axis),phase=Math.PI*retardance/wavelength,A=[Math.cos(phase),Math.sin(phase)],B=[Math.cos(phase),-Math.sin(phase)];
 return [[add(scale(A,c*c),scale(B,s*s)),scale(add(A,scale(B,-1)),c*s)],[scale(add(A,scale(B,-1)),c*s),add(scale(A,s*s),scale(B,c*c))]];
}
function oracle(first,second,wavelength,angle,gate,axes,reverse=false){
 let e=[[Math.cos(angle),0],[Math.sin(angle),0]],layers=[[0,first],[axes,second]];if(reverse)layers.reverse();
 for(const [axis,retardance] of layers){const J=matrix(axis,retardance,wavelength);e=J.map(row=>add(multiply(row[0],e[0]),multiply(row[1],e[1])));}
 const amp=add(scale(e[0],Math.cos(angle+gate)),scale(e[1],Math.sin(angle+gate)));return {intensity:amp[0]**2+amp[1]**2,norm:e.flat().reduce((s,v)=>s+v*v,0)};
}
const srgb=v=>v>.0031308?1.055*Math.pow(v,1/2.4)-.055:12.92*v;
function oracleColour(first,second,angle,gate=90,axes=45,reverse=false){return polarizedBands.map(band=>255*srgb(band.reduce((s,w)=>s+oracle(first,second,w,rad(angle),rad(gate),rad(axes),reverse).intensity,0)/band.length));}
const reference=Float64Array.from({length:768},(_,i)=>oracleColour(0,Math.floor(i/3)*1800/255,0)[i%3]);
function nearest(rgb){let best=Infinity,result=0;for(let i=0;i<256;i++){let d=0;for(let c=0;c<3;c++)d+=(rgb[c]-reference[i*3+c])**2;if(d<best){best=d;result=i;}}return result;}

test('two-layer transmission matches independent complex Jones multiplication and layer order',()=>{
 for(const first of [0,183,1400,4400])for(const second of [0,317,1900])for(const wavelength of [420,530,670])for(const angle of [0,.21,.7])for(const gate of [0,.37,Math.PI/2])for(const reverse of [false,true]){
  const axes=.63,q=oracle(first,second,wavelength,angle,gate,axes,reverse);near(doubleRetarderIntensity(first,second,wavelength,angle,gate,axes,reverse),q.intensity);near(q.norm,1);
 }
});

test('ideal transmission stays bounded, complementary analyzers sum to one, and rotations repeat',()=>{
 for(let i=0;i<80;i++){
  const first=i*73.13,second=i*39.7,wavelength=410+i*3.11,angle=i*.071,gate=i*.17,axes=i*.032,T=doubleRetarderIntensity(first,second,wavelength,angle,gate,axes,i%2===1);
  assert.ok(T>=-1e-13&&T<=1+1e-13);near(T+doubleRetarderIntensity(first,second,wavelength,angle,gate+Math.PI/2,axes,i%2===1),1);near(doubleRetarderIntensity(first,second,wavelength,angle+Math.PI,gate,axes,i%2===1),T);
 }
});

test('single layers and co-aligned or orthogonal layers reduce to independent analytic laws',()=>{
 for(const [r1,r2,w] of [[0,310,420],[137,941,530],[830,50,670]])for(const angle of [.13,.71]){
  near(doubleRetarderIntensity(0,r2,w,angle,Math.PI/2,.6),Math.sin(2*(.6-angle))**2*Math.sin(Math.PI*r2/w)**2);
  near(doubleRetarderIntensity(r1,r2,w,angle,Math.PI/2,0),Math.sin(2*angle)**2*Math.sin(Math.PI*(r1+r2)/w)**2);
  near(doubleRetarderIntensity(r1,r2,w,angle,Math.PI/2,Math.PI/2),Math.sin(2*angle)**2*Math.sin(Math.PI*(r1-r2)/w)**2);
 }
});

test('reference endpoint angles select the second and first fields; the midpoint is not an RGBA crossfade',()=>{
 for(const r1 of [0,400,1800])for(const r2 of [17,723,1550])for(const w of [420,530,670]){
  near(doubleRetarderIntensity(r1,r2,w,0,Math.PI/2),Math.sin(Math.PI*r2/w)**2);near(doubleRetarderIntensity(r1,r2,w,Math.PI/4,Math.PI/2),Math.sin(Math.PI*r1/w)**2);
 }
 const c0=polarizedColour(500,1000,0),c1=polarizedColour(500,1000,45),mid=polarizedColour(500,1000,22.5);assert.ok(mid.some((v,c)=>Math.abs(v-(c0[c]+c1[c])/2)>10));
});

test('layer ordering changes oblique analyzers and stays neutral at open and crossed gates',()=>{
 const r1=183,r2=427,w=530,angle=.29,axes=.57;
 assert.ok(Math.abs(doubleRetarderIntensity(r1,r2,w,angle,.53,axes,false)-doubleRetarderIntensity(r1,r2,w,angle,.53,axes,true))>.01);
 for(const gate of [0,Math.PI/2,Math.PI])near(doubleRetarderIntensity(r1,r2,w,angle,gate,axes,false),doubleRetarderIntensity(r1,r2,w,angle,gate,axes,true));
 for(const axes0 of [0,Math.PI/2])near(doubleRetarderIntensity(r1,r2,w,angle,.53,axes0,false),doubleRetarderIntensity(r1,r2,w,angle,.53,axes0,true));
});

test('nine-band colour and all 256 palette samples match independent spectral projection',()=>{
 for(const [first,second,angle,gate,axes,reverse] of [[0,0,17,32,45,false],[227,915,22.5,90,45,false],[1300,2700,35,29,71,true]]){const actual=polarizedColour(first,second,angle,gate,axes,reverse),expected=oracleColour(first,second,angle,gate,axes,reverse);actual.forEach((v,c)=>near(v,expected[c],1e-9));}
 const palette=polarizedPalette();palette.forEach((v,i)=>near(v,reference[i],1e-9));
 // cos(pi/2) leaves a floating-point residual at the analytic black endpoint.
 for(const v of palette.slice(0,3))near(v,0,1e-25);
 for(const rgb of [[0,0,0],[255,255,255],[17,83,212],[51,99,180],[53,102,181],[223,74,37]])assert.equal(closestPolarizedColour(...rgb),nearest(rgb));
});

test('photo fields query original RGB at every native pixel and preserve their source',()=>{
 const a=image(1537,3),copy=a.slice(),field=polarizedPhotoField(a,0),luma=polarizedPhotoField(a,1);assert.equal(field.length,1537*3);
 for(const i of [0,1536,1607,4608]){assert.equal(field[i],nearest([...a.slice(i*4,i*4+3)]));assert.equal(luma[i],Math.fround((.2126*a[i*4]+.7152*a[i*4+1]+.0722*a[i*4+2])/255));}
 assert.deepEqual(a,copy);
 const repeated=new Uint8ClampedArray([0,0,0,255,17,83,212,255,0,0,0,255,17,83,212,255]);assert.deepEqual([...polarizedPhotoField(repeated,0)],[0,nearest([17,83,212]),0,nearest([17,83,212])]);
});

test('parameter-space lookup agrees at nodes and interpolation averages linear intensity',()=>{
 for(const p of [defaults,{...defaults,mapping:1,first:200,second:47,bias:800,angle:113.5,gate:31,axes:77,order:1}]){
  const table=makePolarizedTable(p,17);
  for(const [x,y] of [[0,0],[3,11],[16,7],[16,16]])for(let c=0;c<3;c++){
   const first=p.bias+(p.mapping===1?80+1350*x/16:1800*x/16)*p.first/100,second=p.bias+(p.mapping===1?80+1350*y/16:1800*y/16)*p.second/100,expected=polarizedBands[c].reduce((s,w)=>s+oracle(first,second,w,rad(p.angle),rad(p.gate),rad(p.axes),p.order===1).intensity,0)/3;
   near(samplePolarizedTable(table,x,y,c),expected,4e-8);
  }
 }
 const table={resolution:2,a:new Float32Array([0,.1,.2,.4,.5,.6,.8,.9,1,1,.8,.4])};near(samplePolarizedTable(table,.25,.75,0),0*.75*.25+.4*.25*.25+.8*.75*.75+1*.25*.75,2e-8);near(samplePolarizedTable(table,100,-1,0),.4,2e-8);
});

test('native partner addressing has explicit flips, cyclic offsets and tiny-axis behavior',()=>{
 const p={...defaults,offsetX:0,offsetY:0};
 for(const [partner,want] of [[0,[2,1,0,5,4,3]],[1,[3,4,5,0,1,2]],[2,[5,4,3,2,1,0]],[3,[0,1,2,3,4,5]]])assert.deepEqual(Array.from({length:6},(_,i)=>polarizedPartner(i%3,Math.floor(i/3),3,2,{...p,partner})),want);
 assert.deepEqual(Array.from({length:6},(_,i)=>polarizedPartner(i%3,Math.floor(i/3),3,2,{...p,partner:3,offsetX:-33,offsetY:50})),[5,3,4,2,0,1]);
 assert.equal(polarizedPartner(0,0,1,1,{...p,offsetX:-100,offsetY:100}),0);
});

test('endpoint raster uses full native colour, including a changed pixel beyond 1536',()=>{
 const w=1537,h=3,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[17,83,212,255][i%4]),p={...defaults,angle:45},out=polarizedPair(a,w,h,p),b=a.slice(),k=(w-1)*4;b.set([0,0,0,255],k);const changed=polarizedPair(b,w,h,p);
 assert.notDeepEqual(changed.slice(k,k+4),out.slice(k,k+4));assert.deepEqual(changed.slice(k,k+4),new Uint8ClampedArray([0,0,0,255]));assert.deepEqual(changed.slice(0,4),out.slice(0,4));
 const expectedIndex=nearest([17,83,212]),expected=polarizedBands.map(band=>255*srgb(Math.fround(band.reduce((s,wavelength)=>s+Math.sin(Math.PI*(expectedIndex*1800/255)/wavelength)**2,0)/3)));expected.forEach((v,c)=>assert.equal(out[c],new Uint8ClampedArray([Math.round(v*1e9)/1e9])[0]));
});

test('13 controls change active fixtures and optical neutral conditions remain neutral',()=>{
 const w=37,h=29,a=image(w,h),base=polarizedPair(a,w,h,defaults),changes={mapping:1,angle:9,gate:31,axes:32,first:70,second:130,bias:210,partner:1,offsetX:27,offsetY:-19,share:80,keep:35};
 for(const [key,value] of Object.entries(changes))assert.notDeepEqual(polarizedPair(a,w,h,{...defaults,[key]:value}),base,key);
 const oblique={...defaults,gate:31};assert.notDeepEqual(polarizedPair(a,w,h,{...oblique,order:1}),polarizedPair(a,w,h,oblique));assert.deepEqual(polarizedPair(a,w,h,{...defaults,order:1}),base);assert.deepEqual(polarizedPair(a,w,h,{...defaults,seed:9999}),base);
 const shared={...defaults,share:100};assert.deepEqual(polarizedPair(a,w,h,{...shared,partner:2,offsetX:27,offsetY:-19}),polarizedPair(a,w,h,shared));assert.deepEqual(polarizedPair(a,w,h,{...defaults,keep:100,angle:107,gate:37,axes:9,order:1}),a);
 const noFilm={...defaults,first:0,second:0,bias:0};assert.deepEqual(polarizedPair(a,w,h,{...noFilm,mapping:1,share:89,partner:2}),polarizedPair(a,w,h,noFilm));
});

test('tiny and extreme settings are finite, opaque, deterministic and leave inputs untouched',()=>{
 const variants=[defaults,{...defaults,mapping:1,first:200,second:200,bias:800,gate:180,angle:180,axes:90,offsetX:-100,offsetY:100,share:100,order:1},{...defaults,first:0,second:0,gate:0,axes:0,partner:3,keep:100}];
 for(const [w,h] of [[1,1],[1,11],[17,1],[5,3]])for(const p of variants){const a=image(w,h),copy=a.slice(),out=polarizedPair(a,w,h,p);assert.equal(out.length,a.length);assert.deepEqual(polarizedPair(a,w,h,p),out);assert.deepEqual(a,copy);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));}
});

test('engine alpha, mono, inverse and fractional mixing preserve common behavior and look replay',()=>{
 const w=23,h=17,a=image(w,h),copy=a.slice(),l=makeLayer('polarizedpair'),out=applyFilter(a,w,h,l);assert.deepEqual(out,polarizedPair(a,w,h,l.params));assert.deepEqual(a,copy);assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],new Uint8ClampedArray([a[i]+(255-out[i]-a[i])*.25])[0]);
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);
 assert.deepEqual(applyFilter(new Uint8ClampedArray([32,97,185,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));
 for(const look of looks.filter(l=>l.polarizedpair))assert.deepEqual(renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))),renderPipeline(a,w,h,look.layers));
});

test('0.53 gates this operator, preserves earlier versions and round-trips all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.polarizedpair);assert.equal(f.controls.length,13);assert.equal(f.random,false);
 const l=makeLayer('polarizedpair');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=52;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [id,engine] of [['meromorphic','0.52'],['resistfronts','0.51']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine})),[old]);}
 for(const [key,value] of [['mapping',2],['partner',1.5],['gate',181],['axes',-1],['first',201],['bias',801],['order',2],['offsetX',101],['share',101],['keep',-1],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 assert.equal(decodeRecipe(encodeRecipe([{...l,params:{...l.params,angle:22.5,gate:31.5}}]))[0].params.gate,31.5);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
