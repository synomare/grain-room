import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {screenFamily,artisticScreen,coverageColor,linear,srgb} from '../src/artistic-screen.js';
import {filters,makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {looks} from '../src/looks.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const historical=JSON.parse(fs.readFileSync(new URL('./v018-catalog.json',import.meta.url),'utf8'));
const image=(w,h,v=188)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:v);
const sum=a=>a.reduce((s,v)=>s+v,0);
test('Every authored step has measured increasing area; ink disappears before a denser state',()=>{
 for(const t of [20,50,80]){const f=screenFamily(t);let prev=-1,removed=0;
  for(let k=0;k<=256;k++){const area=sum(f.masks[k]);assert.equal(area,k*16);assert.ok(area>prev);prev=area;
   if(k)for(let i=0;i<4096;i++)if(f.masks[k-1][i]&&!f.masks[k][i])removed++;
  }assert.ok(removed>0,`transition ${t} must relocate ink`);
 }
 const low=screenFamily(50).masks[51],high=screenFamily(50).masks[128];assert.ok(sum(high)>sum(low));assert.ok(low.some((v,i)=>v&&!high[i]));
});
test('Transition changes geometry at equal area, not its tone or a selector preset',()=>{
 const a=screenFamily(20).masks[128],b=screenFamily(80).masks[128];assert.equal(sum(a),sum(b));assert.ok(a.reduce((s,v,i)=>s+(v!==b[i]),0)>1000);
});
test('Coverage composites ink over paper in linear light, including half coverage',()=>{
 assert.equal(coverageColor(0),255);assert.equal(coverageColor(1),0);assert.equal(coverageColor(.5),188);
 const expected=.5*linear(51/255)+.5*linear(230/255);assert.ok(Math.abs(linear(coverageColor(.5,51,230)/255)-expected)<.004);
});
test('Unclamped color calculations stay finite for source bytes and endpoint ink/paper palettes',()=>{
 // Check Number results before typed-array coercion can turn NaN into zero.
 // This is not a check of every geometric intermediate or output-tone monotonicity.
 for(let v=0;v<256;v++){const l=linear(v/255),encoded=srgb(l);assert.ok(Number.isFinite(l)&&l>=0&&l<=1);assert.ok(Number.isFinite(encoded));assert.ok(Math.abs(encoded-v/255)<1e-12);}
 for(const ink of [0,102])for(const paper of [153,255])for(let k=0;k<=16;k++){
  const value=coverageColor(k/16,ink,paper);assert.ok(Number.isFinite(value));assert.ok(value>=ink&&value<=paper);assert.equal(value,Math.round(value));
 }
});
test('Partial cells use visible linear average and a boundary pixel composites both cells',()=>{
 // Three source pixels: black, white, white; cell pitch 1.5px.
 // Left cell gets one black pixel + half a white pixel: L=1/3, state 171.
 // In the shared pixel, the eight left-cell probes hit four ink texels;
 // the eight right-cell probes are paper. Therefore coverage=4/16, byte=225.
 const source=new Uint8ClampedArray([0,0,0,255,255,255,255,255,255,255,255,255]);
 const out=artisticScreen(source,3,1,{...makeLayer('artisticscreen').params,size:500,angle:0});
 assert.deepEqual([...out.slice(4,8)],[225,225,225,255]);assert.deepEqual([...out.slice(8)],[255,255,255,255]);
});
test('Linear cell average is preserved on an aligned full cell and accepts colored input',()=>{
 const a=image(64,64);for(let i=0;i<a.length;i+=4){a[i]=255;a[i+1]=0;a[i+2]=0;}
 const p={...makeLayer('artisticscreen').params,size:1000,angle:0},out=artisticScreen(a,64,64,p);let mean=0;for(let i=0;i<out.length;i+=4)mean+=linear(out[i]/255);mean/=4096;
 assert.ok(Math.abs(mean-.2126)<1/256);assert.equal(out.filter((_,i)=>i%4===3&&out[i]!==255).length,0);
 // Whole-cell tone is the mean of half black and half white, not encoded-gray 128.
 for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4;a[i]=a[i+1]=a[i+2]=x<32?0:255;}
 const averaged=artisticScreen(a,64,64,p);let white=0;for(let i=0;i<averaged.length;i+=4)white+=averaged[i]/255;assert.equal(white/4096,.5);
});
test('Same-size output and parameter restoration are exact; the effect does not use seed',()=>{
 const a=image(67,91);for(let i=0;i<a.length;i+=4)a[i]=a[i+1]=a[i+2]=(i*17)%256;const copy=a.slice(),l=makeLayer('artisticscreen'),out=applyFilter(a,67,91,l);
 assert.deepEqual(applyFilter(a,67,91,l),out);l.params.seed=999;assert.deepEqual(applyFilter(a,67,91,l),out);
 l.params.transition=20;assert.notDeepEqual(applyFilter(a,67,91,l),out);l.params.transition=50;assert.deepEqual(applyFilter(a,67,91,l),out);assert.deepEqual(a,copy);
});
test('Tiny, partial and rotated boundary cells stay opaque; endpoints have no seams',()=>{
 for(const [w,h] of [[1,1],[1,23],[29,1],[31,47]])for(const size of [8,22,48])for(const angle of [0,37,180]){
  const p={...makeLayer('artisticscreen').params,size,angle};for(const v of [0,255])assert.deepEqual(artisticScreen(image(w,h,v),w,h,p),image(w,h,v));
  const out=artisticScreen(image(w,h),w,h,p);assert.equal(out.length,w*h*4);for(let i=0;i<out.length;i+=4){assert.equal(out[i],out[i+1]);assert.equal(out[i],out[i+2]);assert.equal(out[i+3],255);}
 }
 // Subpixel screens lose authored thin apertures: finite quadrature is not a shape guarantee.
 const p={...makeLayer('artisticscreen').params,size:1000,angle:0};
 const tiny=artisticScreen(image(1,1,13),1,1,p),large=artisticScreen(image(64,64,13),64,64,p);
 assert.equal(tiny[0],0);assert.ok(large.some((v,i)=>i%4!==3&&v===255),'small paper cutout exists at readable scale');
});
test('Engine honors alpha, mix and monochrome without extending effect linear-light claims',()=>{
 const a=image(35,27,80),l=makeLayer('artisticscreen');for(let i=3;i<a.length;i+=4)a[i]=(i*13)%256;
 l.params.mix=0;const base=applyFilter(a,35,27,l);for(let i=0;i<a.length;i+=4){assert.equal(base[i],Math.round(a[i]*a[i+3]/255+255-a[i+3]));assert.equal(base[i+3],255);}
 l.params.mix=100;const full=applyFilter(a,35,27,l);l.params.mix=50;const mixed=applyFilter(a,35,27,l);for(let i=0;i<a.length;i+=4){const raw=a[i]*a[i+3]/255+255-a[i+3];assert.ok(Math.abs(mixed[i]-(raw+full[i])/2)<=.5);assert.equal(mixed[i+3],255);}
 l.params.colorMode='mono';const mono=applyFilter(a,35,27,l);for(let i=0;i<mono.length;i+=4)assert.ok(mono[i]===mono[i+1]&&mono[i]===mono[i+2]);
});
test('0.19 roundtrip, strict old-version rejection and 0.18 historical defaults/assets',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);
 const l=makeLayer('artisticscreen');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=18;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const id of historical.effects){const current={...makeLayer(id).params};if(id==='waveweft'){assert.equal(current.crossfreq,100);assert.equal(current.crossband,100);delete current.crossfreq;delete current.crossband;}assert.deepEqual(current,historical.defaults[id]);assert.deepEqual(decodeRecipe(JSON.stringify({app:'grain-room',version:1,engine:'0.18',layers:[{id,params:{}}]})),[makeLayer(id)]);}
 for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const recipe=decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look,file);assert.deepEqual(recipe,look.layers,file);}
});
