import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {painterlyGuide,gaussianPaintReference,paintGradient,choosePaintSeeds,makePaintStroke,splinePolyline,rasterPaintStrokes,painterlyPlan,renderPainterlyPlan,painterly,clearPainterlyCache,painterlyCacheInfo} from '../src/painterly-strokes.js';
import {makeLayer,filters} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
import {hash} from '../src/pixels.js';

const base={size:4,levels:4,threshold:22,length:12,curve:85,blur:40,opacity:95,jitter:0,photo:15,amount:100,paper:100,spacing:100,seed:17};
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const solid=(w,h,colour)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:colour[i%4]);
const near=(a,b,t=1e-5)=>assert.ok(Math.abs(a-b)<=t,a+' differs from '+b+'; tolerance '+t);
const mirror=(v,n)=>{while(v<0||v>=n)v=v<0?-v-1:2*n-v-1;return v;};

test('encoded RGB guides equal direct rectangle integration, including partial pixels and thin images',()=>{
 for(const [w,h,edge] of [[7,5,4],[1,17,6],[17,1,6],[1,1,8]]){
  const a=image(w,h),saved=a.slice(),g=painterlyGuide(a,w,h,edge),dx=w/g.w,dy=h/g.h;
  for(let y=0;y<g.h;y++)for(let x=0;x<g.w;x++)for(let c=0;c<3;c++){
   let v=0;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)v+=a[(yy*w+xx)*4+c]*Math.max(0,Math.min((x+1)*dx,xx+1)-Math.max(x*dx,xx))*Math.max(0,Math.min((y+1)*dy,yy+1)-Math.max(y*dy,yy))/(dx*dy);
   near(g.rgb[(y*g.w+x)*3+c],v,4e-5);
  }assert.deepEqual(a,saved);
 }
 const g=painterlyGuide(solid(19,11,[40,120,220]),19,11,7);for(let i=0;i<g.rgb.length;i++)near(g.rgb[i],[40,120,220][i%3],4e-5);
});

test('separable Gaussian references match independent two-dimensional reflected convolution',()=>{
 const w=9,h=7,rgb=Float32Array.from({length:w*h*3},(_,i)=>i*37%256),sigma=1.25,R=Math.ceil(3*sigma),g=gaussianPaintReference(rgb,w,h,sigma);
 let norm=0;for(let v=-R;v<=R;v++)for(let u=-R;u<=R;u++)norm+=Math.exp(-(u*u+v*v)/(2*sigma*sigma));
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){
  let v=0;for(let j=-R;j<=R;j++)for(let i=-R;i<=R;i++)v+=rgb[(mirror(y+j,h)*w+mirror(x+i,w))*3+c]*Math.exp(-(i*i+j*j)/(2*sigma*sigma))/norm;
  near(g[(y*w+x)*3+c],v,2e-5);
 }
 const zero=gaussianPaintReference(rgb,w,h,0);assert.deepEqual(zero,rgb);assert.notEqual(zero.buffer,rgb.buffer);
 const constant=Float32Array.from({length:4*3*3},(_,i)=>[40,120,220][i%3]);assert.deepEqual(gaussianPaintReference(constant,4,3,3.3),constant);
});

test('Sobel directions recover an analytic ramp and stroke normals do not reverse when the gradient sign flips',()=>{
 const w=9,h=21,rgb=Float32Array.from({length:w*h*3},(_,i)=>40+3*(Math.floor(i/3)%w)+2*Math.floor(Math.floor(i/3)/w)),gradient=paintGradient(rgb,w,h);
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){near(gradient.gx[y*w+x],3);near(gradient.gy[y*w+x],2);}
 const ref=new Float32Array(w*h*3).fill(100),gx=Float32Array.from({length:w*h},(_,i)=>Math.floor(i/w)%2?1:-1),gy=new Float32Array(w*h);
 const s=makePaintStroke({x:4,y:10},1,ref,{gx,gy},solid(w,h,[0,0,0]),w,h,{...base,length:6,curve:100});
 assert.equal(s.points.length,7);
 const sign=Math.sign(s.points[1][1]-s.points[0][1]);for(let i=1;i<s.points.length;i++){near(s.points[i][0],4);near(s.points[i][1]-s.points[i-1][1],sign);}
 assert.equal(makePaintStroke({x:4,y:10},1,ref,{gx:gy,gy},solid(w,h,[0,0,0]),w,h,base).points.length,1);
});

test('tile means choose actual residual maxima and partition partial boundary cells without mutation',()=>{
 const w=7,h=5,canvas=solid(w,h,[30,60,90]),saved=canvas.slice(),ref=Float32Array.from({length:w*h*3},(_,i)=>i*23%256),step=2.4,T=100,{seeds}=choosePaintSeeds(canvas,ref,w,h,step,T);
 const expected=[];for(let by=0;by<Math.ceil(h/step);by++)for(let bx=0;bx<Math.ceil(w/step);bx++){
  const x0=Math.floor(bx*step),x1=Math.min(w,Math.floor((bx+1)*step)),y0=Math.floor(by*step),y1=Math.min(h,Math.floor((by+1)*step)),values=[];
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const j=(y*w+x)*3;values.push({x,y,v:Math.sqrt((ref[j]-30)**2+(ref[j+1]-60)**2+(ref[j+2]-90)**2)});}
  const mean=values.reduce((s,v)=>s+v.v,0)/values.length,max=values.reduce((a,b)=>a.v>=b.v?a:b);
  if(mean>T)expected.push({x:max.x,y:max.y,mean,max:max.v,region:[x0,y0,x1,y1]});
 }
 assert.equal(seeds.length,expected.length);for(let i=0;i<seeds.length;i++){assert.deepEqual(seeds[i].region,expected[i].region);assert.equal(seeds[i].x,expected[i].x);assert.equal(seeds[i].y,expected[i].y);near(seeds[i].mean,expected[i].mean,2e-5);near(seeds[i].max,expected[i].max,2e-5);}
 assert.deepEqual(canvas,saved);
 const first=choosePaintSeeds(canvas,ref,w,h,step,500,true);assert.equal(first.seeds.length,Math.ceil(w/step)*Math.ceil(h/step));
 assert.equal(choosePaintSeeds(canvas,Float32Array.from({length:w*h*3},(_,i)=>[30,60,90][i%3]),w,h,step,0).seeds.length,0);
});

test('a stroke stops where existing paint matches the target better after the minimum length',()=>{
 const w=3,h=20,ref=Float32Array.from({length:w*h*3},(_,i)=>Math.floor(i/3/w)<5?80:160),canvas=solid(w,h,[160,160,160]),gx=new Float32Array(w*h).fill(1),gy=new Float32Array(w*h);
 for(let y=0;y<5;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)canvas[(y*w+x)*4+c]=0;
 let seed=0;while(hash(0,801,seed)<.5)seed++;
 const s=makePaintStroke({x:1,y:1},1,ref,{gx,gy},canvas,w,h,{...base,length:12,curve:100,seed});
 assert.deepEqual(s.points,[[1,1],[1,2],[1,3],[1,4],[1,5]]);
 const dot=makePaintStroke({x:1,y:1},1,ref,{gx,gy},canvas,w,h,{...base,length:0,seed});assert.equal(dot.points.length,1);
});

test('adaptive curve flattening follows an independently evaluated cubic B-spline and retains its endpoints',()=>{
 const points=[[3,2],[8,16],[15,5],[22,20],[29,6]],tolerance=.02,line=splinePolyline(points,tolerance),at=i=>points[Math.max(0,Math.min(points.length-1,i))];
 assert.deepEqual(line[0],points[0]);assert.deepEqual(line.at(-1),points.at(-1));
 for(let k=-1;k<points.length;k++)for(let j=0;j<=40;j++){
  const t=j/40,basis=[(1-t)**3/6,(3*t**3-6*t*t+4)/6,(-3*t**3+3*t*t+3*t+1)/6,t**3/6],p=[0,0];for(let c=0;c<2;c++)for(let v=0;v<4;v++)p[c]+=at(k+v-1)[c]*basis[v];
  let distance=Infinity;for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],dx=b[0]-a[0],dy=b[1]-a[1],q=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));distance=Math.min(distance,Math.hypot(p[0]-a[0]-q*dx,p[1]-a[1]-q*dy));}
  assert.ok(distance<=tolerance+1e-8,'spline chord error '+distance);
 }
});

test('a swept stroke equals analytic capsule coverage and accumulates opacity only between distinct strokes',()=>{
 const w=21,h=17,canvas=solid(w,h,[20,40,60]),stroke={points:[[3,8],[17,8]],radius:2,colour:[200,80,40],opacity:.5};
 rasterPaintStrokes(canvas,w,h,[stroke]);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const dx=x<3?3-x:x>17?x-17:0,d=Math.hypot(dx,y-8),coverage=Math.round(255*Math.max(0,Math.min(1,2.5-d))),alpha=.5*coverage/255;
  const expected=Uint8ClampedArray.from([20*(1-alpha)+200*alpha,40*(1-alpha)+80*alpha,60*(1-alpha)+40*alpha]);for(let c=0;c<3;c++)assert.equal(canvas[(y*w+x)*4+c],expected[c]);
 }
 const loop=solid(w,h,[20,40,60]);rasterPaintStrokes(loop,w,h,[{...stroke,points:[[3,8],[17,8],[3,8]]}]);assert.deepEqual([...loop.slice((8*w+7)*4,(8*w+7)*4+3)],[110,60,50]);
 const twice=solid(w,h,[20,40,60]);rasterPaintStrokes(twice,w,h,[stroke,stroke]);assert.deepEqual([...twice.slice((8*w+7)*4,(8*w+7)*4+3)],[155,70,45]);
});

test('scanline capsule unions match exhaustive distance coverage for tilted, vertical, curved and degenerate strokes',()=>{
 const w=43,h=39,curves=[[[5.25,4.25],[35.75,30.5]],[[13.5,3.5],[13.5,34.5]],[[4.5,4.5],[35.1,30.2],[3.9,32.5],[35.2,4.2]],[[21.2,19.7]]];
 for(const points of curves)for(const radius of [.3,.65,1.5,4,8,16]){
  const canvas=solid(w,h,[0,0,0]),line=splinePolyline(points),colour=[255,96,0],opacity=.7;
  rasterPaintStrokes(canvas,w,h,[{points,radius,colour,opacity}]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
   let distance=Infinity;
   for(let k=0;k<Math.max(1,line.length-1);k++){
    const a=line[k],b=line[Math.min(k+1,line.length-1)],vx=b[0]-a[0],vy=b[1]-a[1],length=Math.hypot(vx,vy);
    const along=length?Math.max(0,Math.min(length,((x-a[0])*vx+(y-a[1])*vy)/length)):0;
    const qx=a[0]+(length?vx/length*along:0),qy=a[1]+(length?vy/length*along:0);
    distance=Math.min(distance,Math.hypot(x-qx,y-qy));
   }
   const coverage=Math.round(255*Math.max(0,Math.min(1,radius+.5-distance)));
   // Compare to the continuous colour: different floating-point operation
   // orders can land on opposite sides of an exact half-byte rounding tie.
   for(let c=0;c<3;c++)near(canvas[(y*w+x)*4+c],colour[c]*opacity*coverage/255,.500001);
  }
 }
});

test('small-brush refinements concentrate on unresolved detail and the whole native stroke sequence replays the planned canvas',()=>{
 const w=96,h=64,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>{if(i%4===3)return 255;const x=Math.floor(i/4)%w,y=Math.floor(i/4/w);return x<48?70:((Math.floor(x/3)+Math.floor(y/3))%2?220:40);}),p={...base,size:20,levels:3,threshold:15,photo:0,jitter:0,opacity:100},plan=painterlyPlan(a,w,h,p);
 assert.deepEqual(plan.stages.map(s=>s.radius),[7.68,3.84,1.92]);const fine=plan.strokes.slice(plan.stages.at(-1).start),left=fine.filter(s=>s.points[0][0]<40).length,right=fine.filter(s=>s.points[0][0]>55).length;
 assert.ok(right>left*2&&right>50,{left,right});assert.deepEqual(renderPainterlyPlan(a,w,h,p,plan),plan.canvas);
 const restored=painterlyPlan(a,w,h,p);assert.deepEqual(restored,plan);
});

test('native source details are mixed directly and native curve coverage is rerasterized rather than magnified from the guide',()=>{
 const w=768,h=2,a=image(w,h),saved=a.slice(),empty={guide:{w:32,h:1},strokes:[]},p={...base,paper:40,photo:50,amount:100},out=renderPainterlyPlan(a,w,h,p,empty);
 for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(out[i+c],(a[i+c]+102)/2,.501);
 const plan={guide:{w:32,h:32},strokes:[{points:[[3,15],[28,15]],radius:.3,colour:[255,255,255],opacity:1}]},black=solid(320,320,[0,0,0]),stroke=renderPainterlyPlan(black,320,320,{...base,photo:0,paper:0},plan);
 assert.equal(stroke[(155*320+150)*4],255);assert.equal(stroke[(150*320+150)*4],0);assert.equal(stroke[(159*320+150)*4],0);
 assert.deepEqual(a,saved);
});

test('identity modes own their buffers and extreme, thin and black images keep finite plans',()=>{
 const input=Buffer.from(image(7,5));for(const p of [{...base,amount:0},{...base,photo:100}]){const out=painterly(input,7,5,p);assert.deepEqual(out,new Uint8ClampedArray(input));out[0]^=255;assert.notEqual(input[0],out[0]);}
 for(const [w,h] of [[1,1],[1,27],[25,1],[2,3]]){
  const a=solid(w,h,[0,0,0]),p={...base,size:16,levels:4,threshold:0,length:20,curve:0,blur:100,opacity:20,jitter:100,photo:0,spacing:75,paper:100},plan=painterlyPlan(a,w,h,p),out=renderPainterlyPlan(a,w,h,p,plan);
  assert.equal(out.length,a.length);for(const s of plan.strokes){assert.ok(s.points.flat().every(Number.isFinite));assert.ok(s.colour.every(Number.isFinite));assert.ok(Number.isFinite(s.radius));}
  for(const s of plan.stages)assert.ok(Object.values(s).every(Number.isFinite));assert.ok(plan.guide.rgb.every(Number.isFinite));for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);
 }
});

test('all twelve controls and the seed change actual rendering and restore deterministically',()=>{
 const a=image(64,80),saved=a.slice(),p=makeLayer('painterly').params,original=painterly(a,64,80,p);
 assert.equal(filters.find(f=>f.id==='painterly').controls.length,12);
 for(const change of [{size:16},{levels:2},{threshold:80},{length:0},{curve:0},{blur:0},{opacity:40},{jitter:70},{photo:80},{amount:50},{paper:0},{spacing:150},{seed:914}])assert.notDeepEqual(painterly(a,64,80,{...p,...change}),original,JSON.stringify(change));
 assert.deepEqual(painterly(a,64,80,p),original);assert.deepEqual(a,saved);
});

test('composition reuses the same exact painting, invalidates changed source and brush settings, and never aliases it',()=>{
 clearPainterlyCache();const w=48,h=64,a=image(w,h),saved=a.slice(),full=painterly(a,w,h,{...base,photo:0,amount:100});
 assert.deepEqual(painterlyCacheInfo(),{hits:0,misses:1,bytes:a.length*2});
 const half=painterly(a,w,h,{...base,photo:50,amount:100});assert.equal(painterlyCacheInfo().hits,1);
 for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(half[i+c],(a[i+c]+full[i+c])/2,.501);
 const expected=full.slice();full[0]^=255;assert.deepEqual(painterly(a,w,h,{...base,photo:0,amount:100}),expected);
 const changed=a.slice();changed[91]^=255;painterly(changed,w,h,base);assert.equal(painterlyCacheInfo().misses,2);
 painterly(changed,w,h,{...base,length:0});assert.equal(painterlyCacheInfo().misses,3);
 painterly(changed,h,w,{...base,length:0});assert.equal(painterlyCacheInfo().misses,4);
 assert.deepEqual(a,saved);clearPainterlyCache();assert.equal(painterlyCacheInfo().bytes,0);
});

test('the common pipeline retains alpha composition, mix and true monochrome output',()=>{
 const w=21,h=29,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('painterly');
 const full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}assert.deepEqual(a,saved);
});

test('0.35 introduces painterly strokes while retaining scratches, speckle, free characters and every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('painterly');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=34;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const bad of [{unknown:1},{levels:5},{levels:2.5},{length:21},{size:'4'},{jitter:Infinity}])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,...bad}}])));
 for(const [id,version] of [['scratchlight','0.34'],['specklefield','0.33']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:version})),[old]);}
 const glyph=makeLayer('glyphcontours');glyph.params.alphabet=3;glyph.params.characters='光/ e\u0301';assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([glyph])),engine:'0.32'})),[glyph]);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
