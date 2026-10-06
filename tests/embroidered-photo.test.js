import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{embroideryDefaults,embroideryColour,regions,rip,embroideryScene,embroideredPhoto}from'../src/embroidered-photo.js';
import{quadraticThread,threadPolyline,nearestThread,drawThread,clothShade}from'../src/embroidery-yarn.js';
import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter,renderPipeline}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const p=(q={})=>({...embroideryDefaults,...q}),close=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a}/${b}`),byte=v=>new Uint8ClampedArray([v])[0],image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
test('quadratic yarns preserve anchors, bend orientation and uniform scaling including a zero-length yarn',()=>{
 assert.deepEqual(quadraticThread(2,3,12,3,4),[2,3,7,7,12,3]);const q=quadraticThread(2,3,12,3,4),a=threadPolyline(q),b=threadPolyline(q,3);assert.deepEqual(a.points[0],[2,3]);assert.deepEqual(a.points.at(-1),[12,3]);for(let i=0;i<a.points.length;i++)for(let j=0;j<2;j++)close(b.points[i][j],a.points[i][j]*3);assert.deepEqual(threadPolyline(quadraticThread(4,5,4,5)).points,[[4,5],[4,5]]);
});
test('nearest yarn points have independent known distances, signs and cumulative arc lengths',()=>{
 const path=threadPolyline([2,5,8,5,14,5]);for(const x of[-2,4,8,18])for(const y of[1,5,9]){const r=nearestThread(x,y,path),cx=Math.max(2,Math.min(14,x));close(r.distance,Math.hypot(x-cx,y-5));close(r.along,cx-2);close(r.side,y-5);}const v=nearestThread(5,4,threadPolyline([2,1,2,6,2,11]));close(v.distance,3);close(v.side,-3);
});
test('flat straight yarns match an independent antialiased capsule oracle across every pixel and internal join',()=>{
 const w=17,h=13,a=new Uint8ClampedArray(w*h*4).fill(70),b=a.slice(),colour=[213,104,44],q=[2,5,7,5,12,5];drawThread(b,w,h,q,4,colour,p({relief:0}));for(let y=0;y<h;y++)for(let x=0;x<w;x++){const X=x+.5,Y=y+.5,cx=Math.max(2,Math.min(12,X)),coverage=Math.max(0,Math.min(1,2.5-Math.hypot(X-cx,Y-5)));for(let c=0;c<3;c++)assert.equal(b[(y*w+x)*4+c],byte(70+(colour[c]-70)*coverage));assert.equal(b[(y*w+x)*4+3],70);}assert.deepEqual(a,new Uint8ClampedArray(a.length).fill(70));
});
test('light direction changes yarn relief and shadow while every write stays within the local support',()=>{
 const w=40,h=31,base=new Uint8ClampedArray(w*h*4).fill(160),q=quadraticThread(8,15,30,15,3),A=base.slice(),B=base.slice();drawThread(A,w,h,q,4,[180,150,120],p({light:90}));drawThread(B,w,h,q,4,[180,150,120],p({light:270}));assert.notDeepEqual(A,B);for(const a of[A,B])for(let y=0;y<h;y++)for(let x=0;x<w;x++)if(x<3||x>35||y<9||y>24)assert.deepEqual(a.slice((y*w+x)*4,(y*w+x)*4+4),base.slice((y*w+x)*4,(y*w+x)*4+4));
});

test('native yarn colour matches an independent bilinear oracle with clamped coordinates',()=>{
 const w=5,h=3,a=image(w,h);for(const X of[-2,.25,2.7,6])for(const Y of[-1,.4,2.8]){const x=Math.max(0,Math.min(w-1,X)),y=Math.max(0,Math.min(h-1,Y)),ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,c=embroideryColour(a,w,h,X,Y,p({dye:100}));for(let k=0;k<3;k++){let sum=0;for(let dx=0;dx<2;dx++)for(let dy=0;dy<2;dy++)sum+=a[(Math.min(h-1,iy+dy)*w+Math.min(w-1,ix+dx))*4+k]*(dx?fx:1-fx)*(dy?fy:1-fy);close(c[k],sum);}}
});
test('stitch directions follow independently constructed horizontal and vertical colour boundaries',()=>{
 const w=160,h=160,gradient=axis=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:30+((axis==='x'?Math.floor(i/4)%w:Math.floor(i/(w*4)))%40)*5);
 for(const axis of['x','y']){const f=regions(gradient(axis),w,h,p()),relevant=f.sites.filter(s=>s.energy>7&&s.x>50&&s.x<950&&s.y>50&&s.y<950);assert.ok(relevant.length>10);for(const s of relevant)assert.ok(axis==='x'?Math.abs(s.co)<.09:Math.abs(s.si)<.09);}
});
test('a shifted high-contrast boundary moves the derived tear rather than keeping a fixed opening',()=>{
 const w=180,h=240,edge=X=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:Math.floor(i/4)%w<X?25:235),f={W:750,H:1000,scale:.24};
 const A=rip(edge(68),w,h,f,p()),B=rip(edge(108),w,h,f,p());assert.ok(B.at(500)-A.at(500)>80);
});
test('a bright subject on grey leaves no isolated stitch blocks in the distant quiet background',()=>{
 const w=200,h=240,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const x=Math.floor(i/4)%w,y=Math.floor(i/(w*4));return i%4===3?255:x>=65&&x<135&&y>=50&&y<160?220:65;});
 const s=embroideryScene(a,w,h,p({open:62,fill:100,photo:3})),stitches=s.threads.filter(t=>t.kind==='satin');assert.ok(stitches.length>100);
 for(const t of stitches){const x=t.source[0]*s.f.scale,y=t.source[1]*s.f.scale;assert.ok(x>=61&&x<=139&&y>=46&&y<=164,`background yarn at ${x},${y}`);}
});
test('tear forward and inverse mappings agree independently across controls and recover both banks',()=>{
 const w=100,h=150,a=image(w,h),f={W:1000*w/h,H:1000,scale:h/1000};
 for(const open of[0,1,50,100]){const r=rip(a,w,h,f,p({open}));for(const y of[1,40,260,500,899,999]){for(const d of[-300,-50,-.001,.001,50,300]){const A=[r.at(y)+d,y],B=r.forward(...A),C=r.inverse(...B);assert.ok(C);close(C[0],A[0],1e-5);close(C[1],A[1]);}if(open)assert.equal(r.inverse(r.at(y),y),null);else close(r.inverse(100,y)[0],100);}}
});
test('stitches stay on one side of the tear and bridging yarns start and end on its two banks',()=>{
 const s=embroideryScene(image(240,300),240,300,p({loose:100,open:80,fill:100})),r=s.f.rip,bridges=s.threads.filter(t=>t.kind==='bridge');assert.ok(bridges.length>10);
 for(const t of bridges){close(t.q[0],r.at(t.q[1])-r.width(t.q[1])-1);close(t.q[4],r.at(t.q[5])+r.width(t.q[5])+1);}
 for(const t of s.threads.filter(t=>t.kind==='satin'))assert.ok((t.q[0]-r.at(t.q[1]))*(t.q[4]-r.at(t.q[5]))>=0);
 const dry=embroideryScene(image(120,150),120,150,p({loose:0}));assert.ok(dry.threads.every(t=>t.kind==='satin'));
});
test('all twelve controls and seed alter native output and restore deterministically',()=>{
 const w=300,h=210,a=image(w,h),base=embroideredPhoto(a,w,h),values={size:130,density:20,width:3.8,relief:15,dye:40,tint:2,fill:30,cloth:100,open:80,loose:100,photo:25,light:120,seed:83};for(const[k,v]of Object.entries(values))assert.ok(!Buffer.from(embroideredPhoto(a,w,h,{[k]:v})).equals(Buffer.from(base)),k);assert.ok(Buffer.from(embroideredPhoto(a,w,h)).equals(Buffer.from(base)));assert.equal(filters.find(f=>f.embroideredphoto).random,true);
});
test('the native texel beneath a yarn beyond 1536 changes that yarn colour and rendered pixels',()=>{
 const w=1601,h=101,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>[210,90,45,255][i%4]),q=p({open:0,fill:100,photo:0,cloth:0,loose:0,width:4,size:50}),s=embroideryScene(a,w,h,q),t=s.threads.find(t=>t.source&&t.source[0]*s.f.scale>1540),sx=Math.floor(t.source[0]*s.f.scale-.5),sy=Math.floor(t.source[1]*s.f.scale-.5),b=a.slice();assert.ok(sx>=1536&&sx<w);b[(sy*w+sx)*4]=25;const u=embroideryScene(b,w,h,q).threads.find(u=>u.source&&Math.hypot(u.source[0]-t.source[0],u.source[1]-t.source[1])<1e-8);assert.ok(u);assert.notDeepEqual(u.colour,t.colour);assert.ok(!Buffer.from(embroideredPhoto(a,w,h,q)).equals(Buffer.from(embroideredPhoto(b,w,h,q))));assert.equal(a[(sy*w+sx)*4],210);
});
test('disabled marks preserve the photograph and tiny axes with extreme controls return owned opaque buffers',()=>{
 const controls=filters.find(f=>f.embroideredphoto).controls;for(const[w,h]of[[1,1],[1,13],[17,1],[29,23]]){const a=image(w,h);assert.deepEqual(embroideredPhoto(a,w,h,{density:0,fill:0,cloth:0,open:0,loose:0,photo:100}),a);for(const end of[2,3]){const q=Object.fromEntries(controls.map(c=>[c[0],c[end]])),out=embroideredPhoto(a,w,h,q);assert.notEqual(out,a);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(embroideredPhoto(Buffer.from(a),w,h,q),out);}assert.deepEqual(a,image(w,h));}close(clothShade(.3,.5,.1),1);
});
test('shared colour, opacity flattening, monochrome, inverse, mix and stacked filters apply once',()=>{
 const w=73,h=61,a=image(w,h),l=makeLayer('embroideredphoto'),q={...l.params,brightness:17,contrast:120,saturation:40},prep=applyFilter(a,w,h,{id:'mono',params:{...q,mix:100,invert:false}}),out=applyFilter(a,w,h,{...l,params:q});assert.deepEqual(out,embroideredPhoto(prep,w,h,q));const mixed=applyFilter(a,w,h,{...l,params:{...q,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...q,mix:0}}),a);const mono=applyFilter(a,w,h,{...l,params:{...q,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray(a.length),w,h,l),applyFilter(new Uint8ClampedArray(a.length).fill(255),w,h,l));const old=makeLayer('mono');assert.deepEqual(renderPipeline(a,w,h,[old,l]),applyFilter(applyFilter(a,w,h,old),w,h,l));
});
test('0.66 gates rewritten embroidery, accepts 0.65 mirrors and round-trips all 202 recipes with bounded controls',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.embroideredphoto),l=makeLayer(f.id);assert.equal(f.controls.length,12);assert.equal(looks.filter(l=>l.embroideredphoto).length,3);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=65;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('photomirrors');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.65'})),[old]);for(const[k,,lo,hi,step]of f.controls)for(const v of[lo-step,hi+step,...(step>=1?[lo+step*.5]:[])])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[k]:v}}])),k);let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
