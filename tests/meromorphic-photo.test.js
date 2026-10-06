import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {meromorphicDefaults as defaults,rationalShape,rationalField,divideComplex,photoPyramid,mirrorPhoto,photoMap,mappedPhoto,pyramidPhoto,meromorphicPhoto} from '../src/meromorphic-photo.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {ENGINE_VERSION,encodeRecipe,decodeRecipe} from '../src/recipes.js';

const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,epsilon=1e-9)=>assert.ok(Math.abs(a-b)<=epsilon*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
const subtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const product=(a,b)=>[a[0]*b[0]-a[1]*b[1],a[0]*b[1]+a[1]*b[0]];
const quotient=(a,b)=>{const d=b[0]**2+b[1]**2;return [(a[0]*b[0]+a[1]*b[1])/d,(a[1]*b[0]-a[0]*b[1])/d];};
// Polar powers, direct quotient and the quotient rule provide an independent
// oracle for production's compiled coefficients, Horner pass and Smith division.
const power=(z,n)=>{const r=Math.hypot(...z)**n,t=Math.atan2(z[1],z[0])*n;return [r*Math.cos(t),r*Math.sin(t)];};
function oracle(z,p){
 const a=power([p.zeroRadius/100*Math.cos(p.zeroAngle*Math.PI/180),p.zeroRadius/100*Math.sin(p.zeroAngle*Math.PI/180)],p.order);
 const b=power([p.poleRadius/100*Math.cos(p.poleAngle*Math.PI/180),p.poleRadius/100*Math.sin(p.poleAngle*Math.PI/180)],p.poles);
 const N=subtract(power(z,p.order),a),D=p.poles?subtract(power(z,p.poles),b):[1,0],Np=power(z,p.order-1).map(v=>v*p.order),Dp=p.poles?power(z,p.poles-1).map(v=>v*p.poles):[0,0];
 return {value:quotient(N,D),derivative:quotient(subtract(product(Np,D),product(N,Dp)),product(D,D))};
}
function oracleMap(x,y,w,h,p){
 const s=Math.min(w,h),cx=(w-1)/2,cy=(h-1)/2,t=p.angle*Math.PI/180,X=(x-cx)*2/s*100/p.zoom,Y=(y-cy)*2/s*100/p.zoom,z=[X*Math.cos(t)-Y*Math.sin(t)+p.offsetX/100,X*Math.sin(t)+Y*Math.cos(t)+p.offsetY/100],q=oracle(z,p);
 return [cx+q.value[0]*s/2*p.crop/100,cy+q.value[1]*s/2*p.crop/100,Math.hypot(...q.derivative)*p.crop/p.zoom];
}

test('scaled complex division retains tiny and huge finite ratios and reports zero denominators',()=>{
 for(const [a,b] of [[[3,4],[2,-7]],[[1e-200,2e-200],[3e-200,-4e-200]],[[1e200,-2e200],[3e200,4e200]]]){const q=new Float64Array(2);assert.ok(divideComplex(...a,...b,q));const scale=Math.max(...b.map(Math.abs)),expected=quotient(a.map(v=>v/scale),b.map(v=>v/scale));near(q[0],expected[0]);near(q[1],expected[1]);}
 assert.equal(divideComplex(1,2,0,0),false);
});

test('all finite degree pairs agree with polar powers and the independent quotient rule',()=>{
 for(let m=1;m<=6;m++)for(let n=0;n<=6;n++)for(const z of [[.17,.31],[-1.2,.87],[2.4,-.73],[-.61,-.45]]){
  const p={...defaults,order:m,poles:n,zeroRadius:83,poleRadius:67,zeroAngle:27,poleAngle:311},q=rationalField(...z,rationalShape(p)),r=oracle(z,p);assert.equal(q[4],0);near(q[0],r.value[0]);near(q[1],r.value[1]);near(q[2],r.derivative[0]);near(q[3],r.derivative[1]);
 }
});

test('common factors extend shared roots, including origin multiplicities and a full cancellation',()=>{
 const p={...defaults,order:4,poles:2,zeroRadius:75,poleRadius:75,zeroAngle:90,poleAngle:0},s=rationalShape(p);assert.equal(s.cancelled,2);
 for(const [x,y] of [[.75,0],[-.75,0],[0,0],[.3,-.4]]){const q=rationalField(x,y,s);assert.equal(q[4],0);near(q[0],x*x-y*y+.75**2);near(q[1],2*x*y);near(q[2],2*x);near(q[3],2*y);}
 const shared=rationalField(.8,0,rationalShape({...p,order:3,poles:2,zeroRadius:80,poleRadius:80,zeroAngle:0}));assert.equal(shared[4],0);near(shared[0],1.2);near(shared[2],.75);
 for(const [m,n,expected] of [[5,2,3],[2,5,-3]]){const s=rationalShape({...defaults,order:m,poles:n,zeroRadius:0,poleRadius:0});for(const z of [[.2,.3],[-.6,.4]]){const q=rationalField(...z,s),r=expected>0?power(z,expected):quotient([1,0],power(z,-expected));near(q[0],r[0]);near(q[1],r[1]);}assert.equal(rationalField(0,0,s)[4],expected<0?1:0);}
 const equal=rationalShape({...defaults,order:3,poles:3,zeroRadius:80,poleRadius:80,zeroAngle:20,poleAngle:140});assert.ok(equal.cancel);assert.deepEqual(Array.from(rationalField(0,0,equal)),[1,0,0,0,0]);assert.deepEqual(Array.from(rationalField(.8,0,equal)),[1,0,0,0,0]);
 // A nearby radius is not silently converted to an exact cancellation.
 assert.equal(rationalShape({...defaults,order:3,poles:3,zeroRadius:80,poleRadius:80.00001,zeroAngle:20,poleAngle:140}).cancel,false);
});

test('phase winding distinguishes zeros, poles, and the remaining order at a coincident origin',()=>{
 function winding(s,c,r){let previous=null,sum=0;for(let k=0;k<=256;k++){const t=k*Math.PI*2/256,q=rationalField(c[0]+r*Math.cos(t),c[1]+r*Math.sin(t),s);assert.equal(q[4],0);const phi=Math.atan2(q[1],q[0]);if(previous!==null){let delta=phi-previous;while(delta>Math.PI)delta-=2*Math.PI;while(delta<-Math.PI)delta+=2*Math.PI;sum+=delta;}previous=phi;}return sum/(2*Math.PI);}
 const s=rationalShape(defaults),zero=[.9*Math.cos(6*Math.PI/180),.9*Math.sin(6*Math.PI/180)],pole=[.74*Math.cos(332*Math.PI/180),.74*Math.sin(332*Math.PI/180)];near(winding(s,zero,.01),1);near(winding(s,pole,.01),-1);
 near(winding(rationalShape({...defaults,order:5,poles:2,zeroRadius:0,poleRadius:0}),[0,0],.1),3);near(winding(rationalShape({...defaults,order:2,poles:5,zeroRadius:0,poleRadius:0}),[0,0],.1),-3);
});

test('native coordinate and analytic footprint agree with independent mapping and finite differences',()=>{
 const w=117,h=83,p={...defaults,angle:31,offsetX:17,offsetY:-23,crop:84,zoom:145},map=photoMap(w,h,p);
 for(const [x,y] of [[15,13],[60,43],[81,65]]){const q=mappedPhoto(x,y,map),r=oracleMap(x,y,w,h,p);assert.equal(q[4],0);for(let i=0;i<3;i++)near(q[i],r[i]);const epsilon=1e-4,left=oracleMap(x-epsilon,y,w,h,p),right=oracleMap(x+epsilon,y,w,h,p),dx=(right[0]-left[0])/(2*epsilon),dy=(right[1]-left[1])/(2*epsilon);near(q[2],Math.hypot(dx,dy),1e-7);}
});

test('pyramid block averages, clamped odd edges, and powers-of-two origins retain source alignment',()=>{
 const w=5,h=3,a=image(w,h),levels=photoPyramid(a,w,h);assert.deepEqual(levels.map(l=>[l.w,l.h,l.scale]),[[5,3,1],[3,2,2],[2,1,4],[1,1,8]]);assert.equal(levels[0].a,a);
 const first=levels[1];for(let y=0;y<first.h;y++)for(let x=0;x<first.w;x++)for(let c=0;c<4;c++){const expected=new Uint8ClampedArray([([0,1].flatMap(dy=>[0,1].map(dx=>a[(Math.min(h-1,y*2+dy)*w+Math.min(w-1,x*2+dx))*4+c])).reduce((s,v)=>s+v,0))/4])[0];assert.equal(first.a[(y*first.w+x)*4+c],expected);}
 // q=.5 is the centre of the first 2x2 block even for an odd-width image.
 for(let c=0;c<3;c++)near(pyramidPhoto(levels,w,h,.5,.5,2,c,false),first.a[c]);
 for(let c=0;c<3;c++)near(pyramidPhoto(levels,w,h,2.5,.5,2,c,false),first.a[4+c]);
});

test('texture reflection folds before level sampling and true minification removes a checkerboard',()=>{
 for(const [x,size,want] of [[-1,5,1],[5,5,3],[11,5,3],[-9,5,1],[1000,1,0]])assert.equal(mirrorPhoto(x,size),want);
 const w=16,h=16,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:((Math.floor(i/4)%w+Math.floor(Math.floor(i/4)/w))%2)*255),levels=photoPyramid(a,w,h);for(const footprint of [2,4,8,16])for(const [x,y] of [[4.5,4.5],[-7.5,21.5]])near(pyramidPhoto(levels,w,h,x,y,footprint,0),128);
 const odd=photoPyramid(image(5,3),5,3);near(pyramidPhoto(odd,5,3,-.5,.5,2,0),pyramidPhoto(odd,5,3,.5,.5,2,0));
});

test('identity preserves all native source bytes on a 1537px axis and thin images',()=>{
 for(const [w,h] of [[1537,3],[1,17],[19,1]]){const a=image(w,h),p={...defaults,order:1,poles:0,zeroRadius:0,zoom:100,crop:100,angle:0,offsetX:0,offsetY:0};for(const edge of [0,1])assert.deepEqual(meromorphicPhoto(a,w,h,{...p,edge}),a);}
});

test('paper edge coverage matches independent four-point clipping of the rational map',()=>{
 const w=23,h=17,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[23,84,193,255][i%4]),p={...defaults,edge:1,crop:140,zoom:110,paper:92},out=meromorphicPhoto(a,w,h,p);let mixed=0;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  let count=0;for(const dy of [-.25,.25])for(const dx of [-.25,.25]){const q=oracleMap(x+dx,y+dy,w,h,p);if(q[0]>=-.5&&q[0]<=w-.5&&q[1]>=-.5&&q[1]<=h-.5)count++;}
  if(count>0&&count<4)mixed++;
  for(let c=0;c<3;c++){const value=([23,84,193][c]*count+92*2.55*(4-count))/4,expected=new Uint8ClampedArray([Math.round(value*1e9)/1e9])[0];assert.equal(out[(y*w+x)*4+c],expected);}
 }assert.ok(mixed>0);
});

test('all 13 controls alter an active fixture and documented inactive parameters remain neutral',()=>{
 const w=97,h=71,a=image(w,h),base=meromorphicPhoto(a,w,h,defaults),changes={order:5,poles:4,zeroRadius:65,zeroAngle:44,poleRadius:49,poleAngle:281,zoom:145,angle:35,offsetX:31,offsetY:-27,crop:110,edge:1};
 for(const [key,value] of Object.entries(changes))assert.notDeepEqual(meromorphicPhoto(a,w,h,{...defaults,[key]:value}),base,key);
 const paper={...defaults,edge:1};assert.notDeepEqual(meromorphicPhoto(a,w,h,{...paper,paper:12}),meromorphicPhoto(a,w,h,paper));assert.deepEqual(meromorphicPhoto(a,w,h,{...defaults,paper:0}),base);
 const noPole={...defaults,poles:0};assert.deepEqual(meromorphicPhoto(a,w,h,{...noPole,poleAngle:16,poleRadius:12}),meromorphicPhoto(a,w,h,noPole));const noZero={...defaults,zeroRadius:0};assert.deepEqual(meromorphicPhoto(a,w,h,{...noZero,zeroAngle:180}),meromorphicPhoto(a,w,h,noZero));assert.deepEqual(meromorphicPhoto(a,w,h,{...defaults,seed:999}),base);
});

test('tiny and extreme shapes are finite, opaque, deterministic and preserve input',()=>{
 const variants=[defaults,{...defaults,order:6,poles:6,zeroRadius:160,poleRadius:159,zoom:35,crop:200,offsetX:150,offsetY:-150,edge:1,angle:360},{...defaults,order:2,poles:6,zeroRadius:0,poleRadius:0,zoom:300,crop:30},{...defaults,order:6,poles:0,zeroRadius:160,zeroAngle:360,crop:200}];
 for(const [w,h] of [[1,1],[1,13],[17,1],[2,3],[19,23]])for(const p of variants){const a=image(w,h),copy=a.slice(),out=meromorphicPhoto(a,w,h,p);assert.equal(out.length,a.length);assert.deepEqual(meromorphicPhoto(a,w,h,p),out);assert.deepEqual(a,copy);assert.ok(out.every((v,i)=>Number.isFinite(v)&&(i%4!==3||v===255)));}
 // A real denominator zero is not mistaken for a removable shared root.
 const q=rationalField(1,0,rationalShape({...defaults,order:2,poles:1,zeroRadius:0,poleRadius:100,poleAngle:0}));assert.equal(q[4],1);
});

test('engine common processing and the three looks replay without changing source input',()=>{
 const w=47,h=33,a=image(w,h),copy=a.slice(),l=makeLayer('meromorphic'),out=applyFilter(a,w,h,l);assert.deepEqual(out,meromorphicPhoto(a,w,h,l.params));assert.deepEqual(a,copy);assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);
 const mixed=applyFilter(a,w,h,{...l,params:{...l.params,mix:25,invert:true}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],new Uint8ClampedArray([a[i]+(255-out[i]-a[i])*.25])[0]);
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);
 const transparent=new Uint8ClampedArray([32,97,185,0]);assert.deepEqual(applyFilter(transparent,1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));
 for(const look of looks.filter(l=>l.meromorphic))assert.deepEqual(renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))),renderPipeline(a,w,h,look.layers));
});

test('0.52 gates the new operator, retains 0.51 resist, and round-trips all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.meromorphic).controls.length,13);
 const l=makeLayer('meromorphic');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=51;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('resistfronts');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.51'})),[old]);
 for(const [key,value] of [['order',0],['order',1.5],['poles',7],['zeroRadius',161],['poleAngle',361],['zoom',34],['edge',2],['offsetX',151],['paper',101],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
