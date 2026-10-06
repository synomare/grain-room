import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pinnedDefaults as D,pinnedSelection,pinnedPoint,clipPinnedTriangle,pinnedScene,pinnedFilm} from '../src/pinned-film.js';
import {renderPeelScene} from '../src/curl-sheet.js';
import {filters,makeLayer} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter,renderPipeline} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),byte=v=>new Uint8ClampedArray([v])[0];
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>{const j=i>>2,x=j%w,y=Math.floor(j/w),b=(Math.floor(x/24)+Math.floor(y/24))%2?190:35;return [b+x*.2,b+y*.15,b+15*Math.sin(x/7),255][i%4];});
const fixture=()=>Uint8ClampedArray.from({length:7*5*4},(_,i)=>i%4===3?255:((Math.floor(i/4)%7<=1&&Math.floor(i/28)<=2)||(Math.floor(i/4)%7>=5&&Math.floor(i/28)>=3)?255:0));
const area=v=>Math.abs((v[1].u-v[0].u)*(v[2].v-v[0].v)-(v[1].v-v[0].v)*(v[2].u-v[0].u))/2;

test('all native input pixels contribute to bounded selection means and luminance rank',()=>{
 const w=1537,h=5,a=image(w,h),p={...D,smooth:0},g=pinnedSelection(a,w,h,p),sum=new Float64Array(g.w*g.h),count=new Uint32Array(sum.length);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const j=Math.floor((y+.5)*g.h/h)*g.w+Math.floor((x+.5)*g.w/w),i=(y*w+x)*4;sum[j]+=(.2126*a[i]+.7152*a[i+1]+.0722*a[i+2])/255;count[j]++;}
 assert.equal(g.w,128);assert.equal(g.h,1);g.means.forEach((v,i)=>near(v,sum[i]/count[i],1e-7));assert.equal(g.cut,[...g.means].sort((a,b)=>a-b)[Math.floor((g.means.length-1)*p.threshold/100)]);
 const b=a.slice();b[(w-1)*4]^=255;assert.ok(pinnedSelection(b,w,h,p).means.some((v,i)=>v!==g.means[i]));
});

test('selection matches an independent four-neighbour traversal and excludes another bright island',()=>{
 const a=fixture(),p={...D,smooth:0,threshold:75,pickX:0,pickY:0},g=pinnedSelection(a,7,5,p),expected=new Set();
 const visit=(x,y)=>{if(x<0||x>=7||y<0||y>=5||!a[(y*7+x)*4]||expected.has(y*7+x))return;expected.add(y*7+x);visit(x-1,y);visit(x+1,y);visit(x,y-1);visit(x,y+1);};visit(0,0);
 assert.deepEqual([...g.mask.entries()].filter(([,v])=>v).map(([i])=>i),[...expected].sort((a,b)=>a-b));assert.equal(g.count,6);
 const other=pinnedSelection(a,7,5,{...p,pickX:100,pickY:100});assert.equal(other.count,4);assert.ok(other.mask.some((v,i)=>v!==g.mask[i]));
});

test('nearest eligible seed and nearest selected pin use physical distance with stable ties',()=>{
 const a=fixture(),p={...D,smooth:0,threshold:75,pickX:50,pickY:40,pinX:100,pinY:100},g=pinnedSelection(a,7,5,p);let nearest=-1,best=Infinity;
 for(let i=0;i<35;i++)if(a[i*4]){const x=i%7+.5,y=Math.floor(i/7)+.5,d=(x-3.5)**2+(y-2)**2;if(d<best){best=d;nearest=i;}}
 assert.equal(g.start,nearest);let pin=null;best=Infinity;for(let i=0;i<35;i++)if(g.mask[i]){const x=i%7+.5,y=Math.floor(i/7)+.5,d=(x-7)**2+(y-5)**2;if(d<best){best=d;pin={x,y};}}assert.deepEqual(g.pin,pin);
 assert.deepEqual(pinnedSelection(a,7,5,{...p,pickX:0,pickY:0}).mask,pinnedSelection(a,7,5,{...p,pickX:10,pickY:10}).mask);
});

test('the pin disk remains exactly fixed and the free portion follows the declared transform',()=>{
 const pin={x:100,y:200},p={...D,hold:50,pull:100,gather:40,twist:90,lift:100,direction:0},S=1000;
 for(const [x,y]of [[100,200],[130,220],[150,200]]){const q=pinnedPoint(x,y,pin,S,p);near(q.x,x);near(q.y,y);near(q.z,0);}
 const q=pinnedPoint(500,200,pin,S,p);near(q.x,200);near(q.y,440);near(q.z,55);near(q.weight,1);
 const m=pinnedPoint(310,200,pin,S,p),t=.5,s=.5;near(m.weight,s);near(m.x,100+210*.8*Math.cos(Math.PI/4)+50);near(m.y,200+210*.8*Math.sin(Math.PI/4));near(m.z,100*s*(1-.45*s));
});

test('attachment and the end of the release ramp have continuous first derivatives',()=>{
 const pin={x:0,y:0},p={...D,hold:50},S=1000,e=.01;
 for(const d of [50,370]){const a=pinnedPoint(d-e,0,pin,S,p),b=pinnedPoint(d,0,pin,S,p),c=pinnedPoint(d+e,0,pin,S,p);for(const k of ['x','y','z'])near((b[k]-a[k])/e,(c[k]-b[k])/e,.01);}
});

test('scalar triangle clipping has independently known area and interpolated source attributes',()=>{
 const v=[{u:0,v:0,label:1,z:4},{u:4,v:0,label:-1,z:8},{u:0,v:4,label:-1,z:12}],out=clipPinnedTriangle(v);near(out.reduce((s,t)=>s+area(t),0),2);
 const points=out.flat();assert.ok(points.some(p=>p.u===2&&p.v===0&&p.z===6));assert.ok(points.some(p=>p.u===0&&p.v===2&&p.z===8));assert.equal(clipPinnedTriangle(v.map(p=>({...p,label:-1}))).length,0);near(clipPinnedTriangle(v.map(p=>({...p,label:1}))).reduce((s,t)=>s+area(t),0),8);
});

test('source holes remain fixed across pin and motion changes and removal omits the surface',()=>{
 const w=40,h=32,p={...D,smooth:0},g=pinnedSelection(image(w,h),w,h,p),A=pinnedScene(g,w,h,p),B=pinnedScene(g,w,h,{...p,pull:240,twist:-120,lift:200,gather:70}),C=pinnedScene(g,w,h,{...p,mode:1}),footprint=s=>s.holes.map(t=>t.v.map(q=>[q.u,q.v,q.x,q.y,q.z]));
 assert.deepEqual(footprint(A),footprint(B));assert.deepEqual(footprint(A),footprint(C));assert.equal(C.triangles.length,0);assert.ok(A.triangles.length>0);assert.ok(B.triangles.some((t,i)=>t.v.some((v,k)=>v.x!==A.triangles[i].v[k].x||v.y!==A.triangles[i].v[k].y)));
});

test('new mesh rasterization agrees with an independent all-triangle native reference',()=>{
 const w=17,h=13,a=image(w,h),p={...D,threshold:30,smooth:0,pull:30,gather:0,twist:0,lift:0,shadow:0},g=pinnedSelection(a,w,h,p),scene=pinnedScene(g,w,h,p),actual=renderPeelScene(a,w,h,scene,{paper:p.paper,shadow:0,view:20,light:315},{tileSize:8,samples:1}),expected=a.slice();
 const weights=(v,x,y)=>{const A=v[0],B=v[1],C=v[2],det=(B.y-C.y)*(A.x-C.x)+(C.x-B.x)*(A.y-C.y);if(Math.abs(det)<1e-14)return null;const aa=((B.y-C.y)*(x-C.x)+(C.x-B.x)*(y-C.y))/det,bb=((C.y-A.y)*(x-C.x)+(A.x-C.x)*(y-C.y))/det,cc=1-aa-bb;return Math.min(aa,bb,cc)<-1e-10?null:[aa,bb,cc];};
 const source=(x,y,c)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const X=Math.floor(x),Y=Math.floor(y),dx=x-X,dy=y-Y;return a[(Y*w+X)*4+c]*(1-dx)*(1-dy)+a[(Y*w+Math.min(w-1,X+1))*4+c]*dx*(1-dy)+a[(Math.min(h-1,Y+1)*w+X)*4+c]*(1-dx)*dy+a[(Math.min(h-1,Y+1)*w+Math.min(w-1,X+1))*4+c]*dx*dy;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;for(const t of scene.holes)if(weights(t.v,x+.5,y+.5))for(let c=0;c<3;c++)expected[i+c]=[255,253,246][c]*p.paper/100;for(const t of scene.triangles){const q=weights(t.v,x+.5,y+.5);if(q){const u=t.v.reduce((s,v,k)=>s+v.u*q[k],0)-.5,v=t.v.reduce((s,v,k)=>s+v.v*q[k],0)-.5;for(let c=0;c<3;c++)expected[i+c]=source(u,v,c);}}}
 assert.deepEqual(actual,expected);
});

test('all seventeen controls have active reachable changes on a separated photographic fixture',()=>{
 const w=160,h=120,a=image(w,h),base=pinnedFilm(a,w,h),values={threshold:85,smooth:60,side:0,pickX:90,pickY:90,pinX:10,pinY:90,hold:100,pull:220,direction:40,gather:75,twist:90,lift:200,mode:1,paper:20,shadow:0,light:90};
 for(const [key,value]of Object.entries(values))assert.ok(pinnedFilm(a,w,h,{[key]:value}).some((v,i)=>v!==base[i]),key);
});

test('removal ignores pin, all motion and lighting while the neutral motion returns an owned original',()=>{
 const w=60,h=45,a=image(w,h),copy=a.slice(),A=pinnedFilm(a,w,h,{mode:1}),B=pinnedFilm(a,w,h,{mode:1,pinX:100,pinY:0,hold:160,pull:240,direction:360,gather:80,twist:-180,lift:240,shadow:0,light:0});assert.deepEqual(A,B);
 const neutral=pinnedFilm(a,w,h,{pull:0,gather:0,twist:0,lift:0});assert.notEqual(neutral,a);assert.deepEqual(neutral,a);assert.deepEqual(a,copy);assert.deepEqual(pinnedFilm(a,w,h,{seed:1}),pinnedFilm(a,w,h,{seed:99}));
});

test('tiny axes, empty dark selection and maximal motion remain finite and protect Buffer input',()=>{
 for(const[w,h]of [[1,1],[1,13],[19,1],[23,17]]){const a=image(w,h),copy=a.slice(),p={smooth:80,pull:240,gather:80,twist:180,lift:240,hold:0},out=pinnedFilm(a,w,h,p);assert.equal(out.length,a.length);assert.ok(out.every(Number.isFinite));assert.deepEqual(out,pinnedFilm(Buffer.from(a),w,h,p));assert.deepEqual(a,copy);assert.ok(out instanceof Uint8ClampedArray);}
 const a=image(19,11);assert.deepEqual(pinnedFilm(a,19,11,{side:0,threshold:0}),a);
});

test('native photographs beyond 1536 contribute to both selection and film texture',()=>{
 const w=1537,h=7,a=image(w,h),p={...D,smooth:0,pickX:98,pinX:98,pickY:50,pinY:50,hold:160,pull:20,lift:0,gather:0,twist:0},out=pinnedFilm(a,w,h,p),b=a.slice();for(let y=0;y<h;y++)for(let x=w-16;x<w;x++)b[(y*w+x)*4]^=255;assert.ok(pinnedFilm(b,w,h,p).some((v,i)=>v!==out[i]));
});

test('engine common operations, alpha flattening and complete look replays retain their behavior',()=>{
 const w=37,h=29,a=image(w,h),l=makeLayer('pinnedfilm'),out=applyFilter(a,w,h,l);assert.deepEqual(out,pinnedFilm(a,w,h,l.params));const mixed=applyFilter(a,w,h,{...l,params:{...l.params,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),a);const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray([1,73,201,0]),1,1,l),applyFilter(new Uint8ClampedArray([255,255,255,255]),1,1,l));for(const look of looks.filter(l=>l.pinnedfilm))assert.deepEqual(renderPipeline(a,w,h,look.layers),renderPipeline(a,w,h,decodeRecipe(encodeRecipe(look.layers))));
});

test('0.58 gates pinned film, accepts 0.57 rolling sides and validates controls and every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.pinnedfilm),l=makeLayer(f.id);assert.equal(f.controls.length,17);assert.equal(f.random,false);for(let n=2;n<=57;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('edgeownership');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.57'})),[old]);
 for(const [key,value]of [['threshold',101],['smooth',81],['side',2],['pickX',-1],['pickY',101],['pinX',.5],['pinY',101],['hold',161],['pull',241],['direction',361],['gather',81],['twist',-181],['lift',241],['mode',2],['paper',101],['shadow',-1],['light',361]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])),key);const files=fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(n=>n.endsWith('.json'));assert.equal(files.length,234);for(const file of files){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);}
});
