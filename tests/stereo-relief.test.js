import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stereoDefaults,smoothStereoHeight,stereoDepth,stereoSeparation,stereoVisible,stereoRowLinks,stereoGuideBand,stereoRelief} from '../src/stereo-relief.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);

// A separate geometric construction: intersect the two eye rays with the screen.
function projectedSeparation(z,far,mu){
 const objectDistance=2-mu*z,screenFraction=1/objectDistance;
 return Math.max(1,Math.floor(2*far*(1-screenFraction)+.5+1e-10));
}
function rayVisible(row,x,far,mu){
 if(mu===0)return true;
 const distance=2-mu*row[x];
 for(let t=1;t<far;t++){
  const rayDistance=distance*(1-t/far);
  if(rayDistance<2-mu)break;
  for(const j of [x-t,x+t])if(j>=0&&j<row.length&&2-mu*row[j]<=rayDistance)return false;
 }
 return true;
}
function independentLinks(row,far,mu,y=0){
 const edges=[],adj=Array.from({length:row.length},()=>[]),labels=new Int32Array(row.length).fill(-1);
 for(let x=0;x<row.length;x++){
  const gap=projectedSeparation(row[x],far,mu),left=(y%2?Math.floor(x-gap/2):Math.ceil(x-gap/2))+0,right=left+gap;
  if(left<0||right>=row.length||!rayVisible(row,x,far,mu))continue;
  edges.push([left,right,x,gap]);adj[left].push(right);adj[right].push(left);
 }
 for(let x=0;x<row.length;x++)if(labels[x]===-1){
  const todo=[x],component=[];labels[x]=-2;
  for(let k=0;k<todo.length;k++){const j=todo[k];component.push(j);for(const next of adj[j])if(labels[next]===-1){labels[next]=-2;todo.push(next);}}
  const representative=Math.max(...component);for(const j of component)labels[j]=representative;
 }
 return {labels,edges};
}

test('depth smoothing equals an independently evaluated replicated-edge square kernel',()=>{
 for(const [w,h] of [[1,7],[7,1],[13,9]])for(const radius of [0,1,3,11]){
  const a=Float32Array.from({length:w*h},(_,j)=>(j*37%101)/100),actual=smoothStereoHeight(a,w,h,radius),den=(2*radius+1)**2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let sum=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++)sum+=a[Math.min(h-1,Math.max(0,y+dy))*w+Math.min(w-1,Math.max(0,x+dx))];
   near(actual[y*w+x],sum/den);
  }
 }
});

test('height is planned from every native RGB pixel and inversion changes only height',()=>{
 const w=1537,h=5,a=image(w,h),p={...stereoDefaults,smooth:0,gamma:100},z=stereoDepth(a,w,h,p),reversed=stereoDepth(a,w,h,{...p,reverse:1});
 for(let j=0;j<w*h;j++){near(z[j],(a[j*4]*.2126+a[j*4+1]*.7152+a[j*4+2]*.0722)/255);near(reversed[j],1-z[j]);}
 const b=a.slice();b[997*4]^=255;assert.notEqual(stereoDepth(b,w,h,p)[997],z[997]);
});

test('separation and both-eye occlusion agree with independently intersected physical rays',()=>{
 assert.equal(stereoSeparation(1,4,.4),2);
 assert.equal(stereoSeparation(1-1e-7,4,.4),2);
 for(const far of [2,5,17,24])for(const mu of [0,.2,.4,.85]){
  const rows=[Float32Array.from({length:83},()=>0),Float32Array.from({length:83},()=>1),Float32Array.from({length:83},(_,x)=>x>31&&x<45?1:0),Float32Array.from({length:83},(_,x)=>(x*43%97)/96)];
  for(const row of rows)for(let x=0;x<row.length;x++){
   assert.equal(stereoSeparation(row[x],far*2,mu),projectedSeparation(row[x],far,mu));
   assert.equal(stereoVisible(row,x,far*2,mu),rayVisible(row,x,far,mu),JSON.stringify({far,mu,x}));
  }
 }
 const row=new Float32Array(61);row[31]=1;assert.equal(stereoVisible(row,29,32,.4),false);
});

test('row constraint components match a separate graph flood-fill including transitive joins and odd gaps',()=>{
 for(const mu of [0,.4,.85])for(const far of [5,13,23])for(const y of [0,1]){
  const row=Float32Array.from({length:83},(_,x)=>x<23?.1:x<55?.83:(x*37%97)/100),expected=independentLinks(row,far,mu,y),actual=stereoRowLinks(row,far,mu,y,true);
  assert.deepEqual(actual.pairs,expected.edges);assert.deepEqual(actual.links,expected.labels);
  for(let x=0;x<row.length;x++){assert.equal(actual.links[actual.links[x]],actual.links[x]);assert.ok(actual.links[x]>=x&&actual.links[x]<row.length);}
 }
});

test('every accepted visible pair has exactly the same RGB in all three texture modes',()=>{
 const w=157,h=101,a=image(w,h);
 for(const pattern of [0,1,2])for(const reverse of [0,1]){
  const p={...stereoDefaults,pattern,reverse,pitch:20,phase:31,texture:67,smooth:0},out=stereoRelief(a,w,h,p),z=stereoDepth(a,w,h,p),far=Math.round(w*p.pitch/100);
  for(let y=0;y<h;y++)for(const [left,right] of independentLinks(z.subarray(y*w,(y+1)*w),far,p.depth/100,y).edges)
   for(let c=0;c<3;c++)assert.equal(out[(y*w+left)*4+c],out[(y*w+right)*4+c]);
 }
});

test('the random-dot image can be independently decoded into near and far slabs',()=>{
 const w=161,h=81,a=new Uint8ClampedArray(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=x>=55&&x<=105?255:0;a[i]=a[i+1]=a[i+2]=v;a[i+3]=255;}
 const p={...stereoDefaults,pattern:2,pitch:20,depth:40,size:.5,smooth:0,gamma:100},out=stereoRelief(a,w,h,p),far=Math.round(w*.2),nearGap=projectedSeparation(1,far,.4);
 let matched=0,total=0;
 for(const x of [24,34,73,87,127,137])for(let y=12;y<h-12;y+=7){
  const expected=x>=55&&x<=105?nearGap:far,scores=[];
  for(let s=nearGap;s<=far;s++){
   let loss=0;const left=Math.ceil(x-s/2);
   for(let dy=-2;dy<=2;dy++)for(let dx=-3;dx<=3;dx++)loss+=Math.abs(out[((y+dy)*w+left+dx)*4]-out[((y+dy)*w+left+dx+s)*4]);
   scores.push({s,loss});
  }
  scores.sort((a,b)=>a.loss-b.loss);assert.equal(scores[0].loss,0);total++;if(scores[0].s===expected)matched++;
 }
 assert.equal(matched,total);
});

test('flat depth gives a true periodic image while depth and contrast change independent parts of the construction',()=>{
 const w=201,h=67,a=image(w,h),p={...stereoDefaults,depth:0,pitch:20},out=stereoRelief(a,w,h,p),far=Math.round(w*.2);
 for(let y=0;y<h;y++)for(let x=0;x<w-far;x++)for(let c=0;c<3;c++)assert.equal(out[(y*w+x)*4+c],out[(y*w+x+far)*4+c]);
 assert.notDeepEqual(stereoRelief(a,w,h,stereoDefaults),out);
 const flat=stereoRelief(a,w,h,{...p,texture:0});for(let j=0;j<w*h;j++)assert.deepEqual(Array.from(flat.slice(j*4,j*4+4)),[128,128,128,255]);
});

test('all eleven controls and seed affect their relevant views and restore reproducibly',()=>{
 const w=311,h=229,a=image(w,h),p={...stereoDefaults,seed:17},initial=stereoRelief(a,w,h,p);
 for(const [key,value] of Object.entries({pitch:25,depth:65,smooth:18,gamma:220,reverse:1,pattern:1,size:9,phase:41,texture:45,guide:1,display:1,seed:87}))
  assert.notDeepEqual(stereoRelief(a,w,h,{...p,[key]:value}),initial,key);
 assert.deepEqual(stereoRelief(a,w,h,p),initial);
});

test('guide marks occupy only their reserved band and the displayed height map is the actual planned depth',()=>{
 const w=211,h=151,a=image(w,h),base=stereoRelief(a,w,h,stereoDefaults),guided=stereoRelief(a,w,h,{...stereoDefaults,guide:1}),band=stereoGuideBand(h,1);
 assert.deepEqual(guided.slice(0,(h-band)*w*4),base.slice(0,(h-band)*w*4));assert.notDeepEqual(guided,base);
 const z=stereoDepth(a,w,h,stereoDefaults),out=stereoRelief(a,w,h,{...stereoDefaults,display:1});for(let j=0;j<z.length;j++)for(let c=0;c<3;c++)near(out[j*4+c],255*z[j],.5);
});

test('source ownership, tiny axes and extreme valid controls do not contaminate later renders',()=>{
 for(const [w,h] of [[1,1],[1,31],[31,1],[71,53]]){
  const a=image(w,h),copy=a.slice(),initial=stereoRelief(a,w,h,stereoDefaults);
  for(const p of [{...stereoDefaults,pitch:5,depth:85,smooth:40,pattern:2,size:.5,phase:100,guide:1},{...stereoDefaults,pitch:35,depth:0,smooth:0,gamma:30,reverse:1,pattern:1,texture:0,display:1}]){
   const out=stereoRelief(a,w,h,p);assert.equal(out.length,a.length);for(let j=3;j<out.length;j+=4)assert.equal(out[j],255);
  }
  stereoRelief(image(h,w),h,w,{...stereoDefaults,guide:1});assert.deepEqual(stereoRelief(a,w,h,stereoDefaults),initial);assert.deepEqual(a,copy);
 }
});

test('the engine preserves stereo constraints at full mixing, while original mixing can visibly break them',()=>{
 const w=157,h=101,a=image(w,h),layer=makeLayer('stereorelief'),full=applyFilter(a,w,h,layer);
 assert.deepEqual(full,stereoRelief(a,w,h,layer.params));
 const mono=applyFilter(a,w,h,{...layer,params:{...layer.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...layer,params:{...layer.params,invert:true}});
 for(let j=0;j<w*h;j++){assert.equal(mono[j*4],mono[j*4+1]);assert.equal(mono[j*4+1],mono[j*4+2]);for(let c=0;c<3;c++)assert.equal(inverted[j*4+c],255-full[j*4+c]);}
 const z=stereoDepth(a,w,h,layer.params),far=Math.round(w*layer.params.pitch/100),mixed=applyFilter(a,w,h,{...layer,params:{...layer.params,mix:40}});let broken=0;
 for(let y=0;y<h;y++)for(const [l,r] of independentLinks(z.subarray(y*w,(y+1)*w),far,layer.params.depth/100,y).edges)if(mixed[(y*w+l)*4]!==mixed[(y*w+r)*4])broken++;
 assert.ok(broken>0);assert.deepEqual(applyFilter(a,w,h,{...layer,params:{...layer.params,mix:0}}),a);
});

test('stereo recipes require 0.48, older 0.47 effects remain compatible and every public JSON round-trips',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);
 const layer=makeLayer('stereorelief');assert.deepEqual(decodeRecipe(encodeRecipe([layer])),[layer]);
 for(let n=2;n<=47;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([layer])),engine:'0.'+n})));
 for(const id of ['rowreinterpret','curlicue']){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.47'})),[old]);}
 for(const [key,value] of [['pitch',36],['depth',86],['pattern',3],['guide',.5],['display',2],['smooth',-1],['gamma',301]])assert.throws(()=>decodeRecipe(encodeRecipe([{...layer,params:{...layer.params,[key]:value}}])));
 let count=0;for(const name of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===name.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+name,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
