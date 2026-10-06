import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import{filmDefaults,filmDensityTable,filmDensity,filmPlan,filmMapping,filmThickness,filmReadout,filmRender,transmittedFilm}from'../src/transmitted-film.js';
import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter,renderPipeline}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),q=(p={})=>({...filmDefaults,...p}),close=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<e,`${a} / ${b}`),byte=v=>new Uint8ClampedArray([v])[0],linear=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4,encoded=v=>v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055;
const neutral=q({cells:2,scale:100,scatter:0,turn:0,shape:0,edge:0,negative:0,clear:0,density:100,exposure:100,readout:0});
const part=(w,h)=>({cx:w/2,cy:h/2,x:w/2,y:h/2,c:1,s:0,scale:1,rx:w/2,ry:h/2,bounds:[0,0,w,h]});
test('native RGB density agrees with independent linear light, polarity, clearance and logarithm',()=>{
 const w=17,h=11,a=image(w,h);for(const negative of[0,1]){const p=q({negative,density:173,clear:27}),table=filmDensityTable(p),f=filmDensity(a,w,h,p);assert.equal(f.length,w*h*3);for(let v=0;v<256;v++){const t=.27+.73*(negative?1-linear(v/255):linear(v/255));close(table[v],-Math.log(Math.max(1e-6,t))*1.73);}for(let j=0;j<w*h;j++)for(let c=0;c<3;c++)assert.equal(f[j*3+c],Math.fround(table[a[j*4+c]]));}assert.deepEqual(a,image(w,h));
 const b=a.slice();for(let i=3;i<b.length;i+=4)b[i]=0;assert.deepEqual(filmDensity(a,w,h,neutral),filmDensity(b,w,h,neutral));assert.ok(filmDensity(a,w,h,q({density:0})).every(v=>v===0));
});
test('optical depths multiply transmittances and exposure clamps before the optional complement',()=>{
 for(const readout of[0,1])for(const exposure of[40,100,200]){const p=q({readout,exposure});for(const[t1,t2]of[[1,1],[.8,.4],[.01,.03]]){const light=Math.min(1,t1*t2*exposure/100);close(filmReadout(-Math.log(t1)-Math.log(t2),p),readout?1-light:light);}close(filmReadout(0,p),readout?1-Math.min(1,exposure/100):Math.min(1,exposure/100));}
});
test('inverse geometry undoes a known quarter-turn, translation and scale at pixel centres',()=>{
 const a={cx:13,cy:7,x:20,y:30,c:0,s:1,scale:2,rx:6,ry:4},m=filmMapping(24,36,a);assert.deepEqual(m,{x:15.5,y:4.5,u:1,v:-1});close(filmMapping(20,30,a).x,12.5);close(filmMapping(20,30,a).y,6.5);
});
test('plans cover complete source intervals, expand soft-edge support and reproduce a seed',()=>{
 const w=31,h=19,p=q({cells:5,turn:0,scatter:0,scale:100,edge:40}),plan=filmPlan(w,h,p);assert.equal(plan.length,20);assert.deepEqual(plan,filmPlan(w,h,p));assert.notDeepEqual(filmPlan(w,h,q({seed:17})),filmPlan(w,h,q({seed:154})));
 close(plan.at(-1).cx+plan.at(-1).cw/2,w);close(plan.at(-1).cy+plan.at(-1).ch/2,h);for(const a of plan){close(a.bounds[0],a.x-a.rx*1.2);close(a.bounds[3],a.y+a.ry*1.2);}assert.ok(filmThickness(1.1,0,p)>0);
});
test('three shapes have distinct support and soft edges are thickness tapers',()=>{
 assert.equal(filmThickness(.8,.8,q({shape:0,edge:0})),1);assert.equal(filmThickness(.8,.8,q({shape:1,edge:0})),0);assert.equal(filmThickness(.6,.6,q({shape:2,edge:0})),0);assert.equal(filmThickness(.6,.6,q({shape:1,edge:0})),1);
 for(const shape of[0,1,2]){close(filmThickness(1,0,q({shape,edge:40})),.5);close(filmThickness(1.1,0,q({shape,edge:40})),.25);assert.equal(filmThickness(1.21,0,q({shape,edge:40})),0);}
});
test('four rays bilinearly interpolate native optical density before exponential and encoding',()=>{
 const w=7,h=5,a=image(w,h),out=filmRender(filmDensity(a,w,h,neutral),w,h,[part(w,h)],neutral),field=Array.from({length:w*h*3},(_,j)=>Math.fround(-Math.log(Math.max(1e-6,linear(a[Math.floor(j/3)*4+j%3]/255)))));
 const at=(x,y,c)=>{x=Math.max(0,Math.min(w-1,x));y=Math.max(0,Math.min(h-1,y));const X=Math.floor(x),Y=Math.floor(y),fx=x-X,fy=y-Y;let sum=0;for(let yy=0;yy<2;yy++)for(let xx=0;xx<2;xx++)sum+=field[(Math.min(h-1,Y+yy)*w+Math.min(w-1,X+xx))*3+c]*(xx?fx:1-fx)*(yy?fy:1-fy);return sum;};
 for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){let sum=0;for(const yy of[-.25,.25])for(const xx of[-.25,.25])sum+=Math.exp(-at(x+xx,y+yy,c));assert.equal(out[(y*w+x)*4+c],byte(encoded(sum/4)*255));}
});
test('half-pixel overlapping sheets multiply along each ray before coverage averaging',()=>{
 const field=Float32Array.from([Math.log(2),Math.log(4),Math.log(8)]),a={...part(1,1),x:.25,rx:.25,bounds:[0,0,.5,1]},out=filmRender(field,1,1,[a,a],neutral);for(let c=0;c<3;c++)assert.equal(out[c],byte(encoded((Math.exp(-2*field[c])+1)/2)*255));assert.equal(out[3],255);
});
test('overlapping different materials transmit equally in reversed stack order',()=>{
 const w=4,h=3,field=Float32Array.from({length:w*h*3},(_,j)=>Math.floor(j/3)%w===0?.2+j%3:.7+j%3),a={...part(w,h),cx:-10},b={...part(w,h),cx:12},A=filmRender(field,w,h,[a,b],neutral),B=filmRender(field,w,h,[b,a],neutral);assert.deepEqual(A,B);for(let i=0;i<A.length;i+=4)for(let c=0;c<3;c++)assert.equal(A[i+c],byte(encoded(Math.exp(-field[c]-field[9+c]))*255));
});
test('tile boundaries preserve rotated geometry, tapered edges and native density interpolation',()=>{
 const w=119,h=83,p=q({cells:11,turn:113,scatter:87,scale:225,edge:40}),f=filmDensity(image(w,h),w,h,p),plan=filmPlan(w,h,p);assert.deepEqual(filmRender(f,w,h,plan,p,{tile:96}),filmRender(f,w,h,plan,p,{tile:13}));
});
test('all eleven controls and the common placement seed change and restore deterministic output',()=>{
 const w=320,h=256,a=image(w,h),base=transmittedFilm(a,w,h),values={cells:12,scale:90,scatter:95,turn:113,shape:2,density:173,clear:33,exposure:65,negative:0,edge:37,readout:1,seed:154};for(const[k,v]of Object.entries(values))assert.notDeepEqual(transmittedFilm(a,w,h,{[k]:v}),base,k);assert.deepEqual(transmittedFilm(a,w,h),base);assert.equal(filters.find(f=>f.transmittedfilm).random,true);
});
test('a native single-pixel change beyond 1536 survives without a reduced analysis grid',()=>{
 const w=1537,h=7,a=new Uint8ClampedArray(w*h*4).fill(90),b=a.slice();b[(3*w+1535)*4]=240;const A=filmDensity(a,w,h,neutral),B=filmDensity(b,w,h,neutral);assert.equal(A.length,w*h*3);assert.equal(A.filter((v,i)=>v!==B[i]).length,1);assert.notDeepEqual(filmRender(A,w,h,[part(w,h)],neutral),filmRender(B,w,h,[part(w,h)],neutral));
});
test('tiny axes and bounded extremes return finite opaque owned pixels including Buffers',()=>{
 for(const[w,h]of[[1,1],[1,19],[23,1],[31,29]])for(const end of[2,3]){const a=image(w,h),saved=a.slice(),p=Object.fromEntries(filters.find(f=>f.transmittedfilm).controls.map(c=>[c[0],c[end]])),A=transmittedFilm(a,w,h,p),B=transmittedFilm(Buffer.from(a),w,h,p);assert.deepEqual(A,B);assert.notEqual(A,a);assert.equal(A.length,a.length);assert.ok(A.every(Number.isFinite));for(let i=3;i<A.length;i+=4)assert.equal(A[i],255);assert.deepEqual(a,saved);}
});
test('common colour preparation, transparency, inverse and mix apply once without extra-photo state',()=>{
 const w=73,h=61,a=image(w,h),l=makeLayer('transmittedfilm'),p={...l.params,brightness:17,contrast:120,saturation:40},prep=applyFilter(a,w,h,{id:'mono',params:{...p,mix:100,invert:false}}),out=applyFilter(a,w,h,{...l,params:p});assert.deepEqual(out,transmittedFilm(prep,w,h,p));const mixed=applyFilter(a,w,h,{...l,params:{...p,invert:true,mix:25}});for(let i=0;i<a.length;i++)if(i%4!==3)assert.equal(mixed[i],byte(a[i]+(255-out[i]-a[i])*.25));assert.deepEqual(applyFilter(a,w,h,{...l,params:{...p,mix:0}}),a);
 const mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono'}});for(let i=0;i<mono.length;i+=4)assert.equal(mono[i],mono[i+1]),assert.equal(mono[i+1],mono[i+2]);assert.deepEqual(applyFilter(new Uint8ClampedArray(a.length),w,h,l),applyFilter(new Uint8ClampedArray(a.length).fill(255),w,h,l));
 const old=makeLayer('mono'),r={near:{pixels:image(19,23),width:19,height:23}};assert.deepEqual(renderPipeline(a,w,h,[old,l],r),applyFilter(applyFilter(a,w,h,old),w,h,l));
});
test('0.62 gates photo film while preserving previous engines and all 193 public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const f=filters.find(f=>f.transmittedfilm),l=makeLayer(f.id);assert.equal(f.controls.length,11);assert.equal(looks.filter(l=>l.transmittedfilm).length,3);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=61;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const[id,engine]of[['rasterrelief','0.61'],['hybridimage','0.60']]){const old=makeLayer(id);assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine})),[old]);}for(const[k,,lo,hi,step]of[...f.controls,['seed','',0,99999,1]])for(const v of[lo-step,hi+step,lo+step*.5])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[k]:v}}])),k);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
