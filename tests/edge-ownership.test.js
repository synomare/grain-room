import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {edgeDefaults as defaults,edgeField,edgeGeometry,edgeFrame,edgeLight,edgeTexture,edgeOwnership} from '../src/edge-ownership.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w);return [255*x/Math.max(1,w-1),255*y/Math.max(1,h-1),128+90*Math.sin(x/23+y/29),255][i%4];});
const byte=v=>new Uint8ClampedArray([v])[0];
const binary=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=Math.floor(i/4),x=j%w,y=Math.floor(j/w);return i%4===3?255:((x>=2&&x<=4&&y>=1&&y<=5)||(x===6&&y===6)?255:0);});

test('all native pixels contribute to analysis means and the declared luminance rank',()=>{
 const w=1537,h=5,a=image(w,h),g=edgeField(a,w,h,{...defaults,smooth:0}),sum=new Float64Array(g.w*g.h),count=new Uint32Array(sum.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const gx=Math.floor((x+.5)*g.w/w),gy=Math.floor((y+.5)*g.h/h),j=gy*g.w+gx,i=(y*w+x)*4;sum[j]+=(a[i]*.2126+a[i+1]*.7152+a[i+2]*.0722)/255;count[j]++;}
 assert.equal(g.w,512);assert.equal(g.h,2);g.means.forEach((v,i)=>near(v,sum[i]/count[i],1e-7));const sorted=[...g.means].sort((a,b)=>a-b);assert.equal(g.threshold,sorted[Math.floor((sorted.length-1)*defaults.threshold/100)]);g.mask.forEach((v,i)=>assert.equal(v,Number(g.means[i]>=g.threshold)));
 const b=a.slice();b[(w-1)*4]^=255;assert.ok(edgeField(b,w,h,{...defaults,smooth:0}).means.some((v,i)=>v!==g.means[i]));
});

test('two-sided signed distances match brute opposite-site distances with half-cell correction',()=>{
 const w=9,h=8,a=binary(w,h),g=edgeField(a,w,h,{...defaults,threshold:85,smooth:0});assert.equal(g.empty,false);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x,inside=a[i*4]>0;assert.equal(g.mask[i],Number(inside));let best=Infinity;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if((a[(yy*w+xx)*4]>0)!==inside)best=Math.min(best,(x-xx)**2+(y-yy)**2);near(g.distance[i],(inside?1:-1)*(Math.sqrt(best)-.5));}
});

test('ownership changes complement coverage and normals while keeping the exact same boundary',()=>{
 const w=9,h=8,a=binary(w,h),p={...defaults,threshold:85,smooth:0},g=edgeField(a,w,h,p),h2=edgeField(a,w,h,{...p,side:1,light:70,texture:2,paper:100});assert.deepEqual(g.distance,h2.distance);assert.deepEqual(g.mask,h2.mask);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=edgeFrame(g,x,y,w,h,0),b=edgeFrame(g,x,y,w,h,1);near(a.d,-b.d);near(a.coverage+b.coverage,1);near(a.nx,-b.nx);near(a.ny,-b.ny);}
 const left=edgeFrame(g,2.5,2,9,8,0),right=edgeFrame(g,2.5,2,9,8,1);near(left.d,-right.d);
});

test('uniform and extreme-rank domains stay finite and preserve photographs without a boundary',()=>{
 for(const value of [0,128,255])for(const [w,h] of [[1,1],[1,19],[31,1],[17,13]]){const a=new Uint8ClampedArray(w*h*4).fill(value);for(let i=3;i<a.length;i+=4)a[i]=255;for(const threshold of [0,50,100]){const g=edgeField(a,w,h,{...defaults,threshold});assert.equal(g.empty,true);assert.deepEqual(edgeOwnership(a,w,h,{threshold}),a);}}
 const a=image(19,13);assert.equal(edgeField(a,19,13,{...defaults,threshold:0}).empty,true);
});

test('smoothed normals match an independently normalized two-dimensional Gaussian convolution',()=>{
 const w=9,h=8,g=edgeField(binary(w,h),w,h,{...defaults,threshold:85,smooth:0}),K=Array.from({length:13},(_,i)=>Math.exp(-((i-6)**2)/8)),sum=K.reduce((a,b)=>a+b,0),smoothed=new Float64Array(w*h);for(let i=0;i<K.length;i++)K[i]/=sum;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const xx=Math.max(0,Math.min(w-1,x+dx)),yy=Math.max(0,Math.min(h-1,y+dy));smoothed[y*w+x]+=g.distance[yy*w+xx]*K[dx+6]*K[dy+6];}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){near(g.nx[y*w+x],smoothed[y*w+Math.min(w-1,x+1)]-smoothed[y*w+Math.max(0,x-1)]);near(g.ny[y*w+x],smoothed[Math.min(h-1,y+1)*w+x]-smoothed[Math.max(0,y-1)*w+x]);}
});

test('normalized quarter-circle arcs have declared endpoints, projection and near-edge compression',()=>{
 for(const radius of [.5,10,123])for(const t of [0,.01,.1,.5,.9,1,2]){const q=edgeGeometry(t*radius,radius),angle=Math.PI*q.arc/(2*radius);near(Math.cos(angle),Math.max(0,1-t));near(q.s,Math.max(0,1-t));near(q.z,Math.sin(angle));assert.ok(q.arc>=0&&q.arc<=radius);}
 const a=edgeGeometry(.01,10),b=edgeGeometry(.02,10);assert.ok(b.arc-a.arc>.01);near(edgeGeometry(0,10).arc,0);near(edgeGeometry(10,10).arc,10);
});

test('a vertical analytic boundary displaces native photo coordinates only on the selected side',()=>{
 const w=80,h=7,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:3*(Math.floor(i/4)%w)),p={...defaults,threshold:50,smooth:0,reach:100,curve:100,shade:0,gloss:0,texture:0,paper:0},out=edgeOwnership(a,w,h,p),R=8;
 // Rank floor((560-1)/2)=279 selects x=39, so the half-cell border is 38.5.
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const d=x-38.5;let sx=x;if(d>0&&d<R){const angle=2*Math.atan(Math.sqrt((d/R)/(2-d/R))),arc=2*R/Math.PI*angle;sx+=arc-d;}const expected=byte(3*Math.max(0,Math.min(w-1,sx)));for(let c=0;c<3;c++)assert.equal(out[(y*w+x)*4+c],expected);}
 const reverse=edgeOwnership(a,w,h,{...p,side:1});for(let y=0;y<h;y++)for(let x=39;x<w;x++)assert.equal(reverse[(y*w+x)*4],a[(y*w+x)*4]);
});

test('directional diffuse light and the highlight agree with independent three-dimensional dot products',()=>{
 for(const light of [0,73,225])for(const elevation of [10,45,90])for(const d of [0,2,10]){
  const frame={nx:Math.cos(.7),ny:Math.sin(.7)},geom=edgeGeometry(d,10),p={...defaults,light,elevation},q=edgeLight(frame,geom,p),az=light*Math.PI/180,el=elevation*Math.PI/180,L=[Math.cos(az)*Math.cos(el),Math.sin(az)*Math.cos(el),Math.sin(el)],N=[-frame.nx*geom.s,-frame.ny*geom.s,geom.z],dot=Math.max(0,L.reduce((s,v,i)=>s+v*N[i],0)),H=[L[0],L[1],L[2]+1],length=Math.hypot(...H),spec=Math.max(0,H.reduce((s,v,i)=>s+v/length*N[i],0))**32,flat=(H[2]/length)**32;
  near(q.shade,1+p.shade/100*((.25+.75*dot)/(.25+.75*L[2])-1));near(q.highlight,Math.max(0,spec-flat)*p.gloss/100*150);
 }
});

test('stripe and lattice patterns keep their surface period, angle and declared ink limits',()=>{
 const p={...defaults,angle:0,pitch:20,ink:100};near(edgeTexture(0,0,1000,p),1);near(edgeTexture(10,0,1000,p),0);near(edgeTexture(20,7,1000,p),1);near(edgeTexture(10,10,1000,{...p,texture:2}),1);near(edgeTexture(10,0,1000,{...p,texture:2}),0);
 for(const texture of [1,2])for(const [x,y] of [[3,9],[33,7],[91,123]]){near(edgeTexture(x,y,1000,{...p,texture,angle:90}),edgeTexture(y,-x,1000,{...p,texture}));near(edgeTexture(x,y,1000,{...p,texture,angle:180}),edgeTexture(x,y,1000,{...p,texture}));}
 assert.equal(edgeTexture(10,9,1000,{...p,texture:0}),1);assert.equal(edgeTexture(10,9,1000,{...p,ink:0}),1);
});

test('all fourteen active native controls change the rendered photograph',()=>{
 const w=160,h=120,a=image(w,h),out=edgeOwnership(a,w,h);
 for(const [key,value] of Object.entries({threshold:75,smooth:70,reach:150,side:1,curve:35,shade:30,light:70,elevation:70,gloss:90,texture:2,pitch:45,ink:90,angle:80,paper:75}))assert.ok(edgeOwnership(a,w,h,{[key]:value}).some((v,i)=>v!==out[i]),key);
});

test('zero width and inactive pattern, lighting, coordinate and seed settings preserve declared neutral views',()=>{
 const w=60,h=90,a=image(w,h),render=p=>edgeOwnership(a,w,h,p);assert.deepEqual(render({reach:0}),a);assert.deepEqual(render({texture:0,pitch:5,ink:0,angle:0}),render({texture:0,pitch:80,ink:100,angle:180}));assert.deepEqual(render({ink:0,texture:1,pitch:5,angle:0}),render({ink:0,texture:2,pitch:80,angle:180}));assert.deepEqual(render({shade:0,gloss:0,light:0,elevation:10}),render({shade:0,gloss:0,light:360,elevation:90}));assert.deepEqual(render({paper:100,texture:0,curve:0}),render({paper:100,texture:0,curve:100}));assert.deepEqual(render({seed:1}),render({seed:91}));assert.deepEqual(render({light:0}),render({light:360}));assert.deepEqual(render({angle:0}),render({angle:180}));
});

test('tiny axes and maximal settings stay repeatable and protect input, including unclamped byte buffers',()=>{
 for(const [w,h] of [[1,1],[1,17],[19,1],[27,21]]){const a=image(w,h),copy=a.slice(),p={smooth:100,reach:240,side:1,curve:100,shade:100,elevation:10,gloss:100,texture:2,pitch:5,ink:100,angle:180,paper:100},out=edgeOwnership(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));edgeOwnership(image(h,w),h,w,p);assert.deepEqual(out,edgeOwnership(a,w,h,p));assert.deepEqual(a,copy);assert.deepEqual(out,edgeOwnership(Buffer.from(a),w,h,p));assert.ok(out instanceof Uint8ClampedArray);}
});

test('native source detail beyond 1536, common engine operations and look replays remain valid',()=>{
 const w=1537,h=7,a=image(w,h),l=makeLayer('edgeownership'),out=applyFilter(a,w,h,l),b=a.slice();assert.deepEqual(out,edgeOwnership(a,w,h,l.params));for(let y=0;y<h;y++)for(let x=w-16;x<w;x++)b[(y*w+x)*4]=0;assert.ok(applyFilter(b,w,h,l).some((v,i)=>v!==out[i]));
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray([1,73,201,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));for(const look of looks.filter(l=>l.edgeownership))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});

test('0.57 gates ownership, accepts 0.56 stitches and validates all controls and public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.edgeownership),l=makeLayer(f.id);assert.equal(f.controls.length,14);assert.equal(f.random,false);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=56;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('heatstitches');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.56'})),[old]);
 for(const [key,value] of [['threshold',101],['smooth',-1],['reach',241],['side',2],['curve',100.5],['shade',-1],['light',361],['elevation',9],['gloss',101],['texture',3],['pitch',4],['ink',101],['angle',181],['paper',-1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])),key);const files=fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'));assert.equal(files.length,234);for(const file of files){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);}
});
