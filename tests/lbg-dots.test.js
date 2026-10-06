import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dotDefaults,dotUnique,dotCells,dotMoments,dotField,dotRadius,dotStep,dotPlan,dotCoverage,dotDraw,lbgDots} from '../src/lbg-dots.js';
import {makeLayer,filters} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const near=(a,b,e=1e-7)=>assert.ok(Math.abs(a-b)<=e*Math.max(1,Math.abs(b)),`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const base={...dotDefaults,seed:17};
let state=29;const random=()=>{state=(Math.imul(state,1103515245)+12345)>>>0;return state/2**32;};
function sample(a,w,h,x,y,stride=1,c=0){const xx=Math.max(0,Math.min(w-1,x)),yy=Math.max(0,Math.min(h-1,y)),fx=xx-Math.floor(xx),fy=yy-Math.floor(yy);let value=0;for(let sy=0;sy<2;sy++)for(let sx=0;sx<2;sx++)value+=a[(Math.min(h-1,Math.floor(yy)+sy)*w+Math.min(w-1,Math.floor(xx)+sx))*stride+c]*(sx?fx:1-fx)*(sy?fy:1-fy);return value;}
function nearest(points,x,y){let id=-1,best=Infinity;for(let j=0;j<points.length;j++){const d=(x-points[j][0])**2+(y-points[j][1])**2;if(d<best){best=d;id=j;}}return id;}
test('native Voronoi ownership matches all-pairs distance, including omitted nearly-collinear generators and one-pixel axes',()=>{
 for(const[w,h]of[[1,1],[1,79],[79,1],[93,71],[1537,3]])for(const type of[0,1,2,3]){const pts=type===0?[[0,0],[w,0],[0,h],[w,h],[w/2,h/2]]:type===1?Array.from({length:17},(_,i)=>[w*(i+1)/18,h*(i+1)/18]):type===2?[[w/4,h/2],[w/2,h/2],[w*3/4,h/2]]:Array.from({length:97},()=>[random()*w,random()*h]),g=dotCells(pts,w,h),rho=new Float32Array(w*h).fill(1),labels=new Int32Array(w*h),m=dotMoments(g,rho,rho,w,h,null,labels);for(let y=0;y<h;y++)for(let x=0;x<w;x++)assert.equal(labels[y*w+x],nearest(g.points,x+.5,y+.5));assert.equal(m.area.reduce((a,b)=>a+b,0),w*h);assert.equal(m.mass.reduce((a,b)=>a+b,0),w*h);}
 assert.deepEqual(dotUnique([[1,2],[1,2],[-1,999]],4,5),[[1,2],[0,5]]);
 // A vertex tie may involve cells without an edge; test every index order.
 const orders=a=>a.length?a.flatMap((x,i)=>orders(a.filter((_,j)=>i!==j)).map(rest=>[x,...rest])):[[]];
 for(const ids of orders([0,1,2,3]))for(const sampling of[1,2]){const shift=sampling===1?1:.25,pts=[[shift,shift],[shift+1,shift],[shift,shift+1],[shift+1,shift+1]],g=dotCells(ids.map(i=>pts[i]),3,3),a=new Float32Array(9).fill(1),labels=new Int32Array(9*sampling*sampling),m=dotMoments(g,a,a,3,3,null,labels,sampling);for(let y=0;y<3*sampling;y++)for(let x=0;x<3*sampling;x++)assert.equal(labels[y*3*sampling+x],nearest(g.points,(x+.5)/sampling,(y+.5)/sampling));assert.equal(m.area.reduce((a,b)=>a+b,0),9);}
});
test('four native quadrature samples conserve density and match independent all-pairs ownership, bilinear colour and moments',()=>{
 for(const[w,h]of[[1,1],[1,43],[43,1],[89,67],[1537,3]])for(const variant of[0,1,2]){const pts=variant===0?[[0,0],[w,0],[0,h],[w,h],[w/2,h/2]]:variant===1?Array.from({length:17},(_,i)=>[w*(i+1)/18,h*(i+1)/18]):Array.from({length:83},()=>[random()*w,random()*h]),g=dotCells(pts,w,h),rho=Float32Array.from({length:w*h},random),lum=Float32Array.from({length:w*h},random),rgb=image(w,h),labels=new Int32Array(w*h*4),actual=dotMoments(g,rho,lum,w,h,rgb,labels,2),expected=Array.from({length:g.points.length},()=>Object.fromEntries(Object.keys(actual).map(k=>[k,0])));
 for(let y=0;y<h*2;y++)for(let x=0;x<w*2;x++){const xx=(x+.5)/2,yy=(y+.5)/2,id=nearest(g.points,xx,yy);assert.equal(labels[y*w*2+x],id);const v=sample(rho,w,h,xx-.5,yy-.5)/4,l=sample(lum,w,h,xx-.5,yy-.5),e=expected[id];e.area+=.25;e.mass+=v;e.x+=v*xx;e.y+=v*yy;e.xx+=v*xx*xx;e.yy+=v*yy*yy;e.xy+=v*xx*yy;e.l+=v*l;e.ll+=v*l*l;e.r+=v*sample(rgb,w,h,xx-.5,yy-.5,4,0);e.green+=v*sample(rgb,w,h,xx-.5,yy-.5,4,1);e.b+=v*sample(rgb,w,h,xx-.5,yy-.5,4,2);}
 for(let j=0;j<g.points.length;j++)for(const key of Object.keys(actual))near(actual[key][j],expected[j][key]);assert.equal(actual.area.reduce((a,b)=>a+b,0),w*h);near(actual.mass.reduce((a,b)=>a+b,0),rho.reduce((a,b)=>a+b,0));}
});
test('analytic circle coverage matches independent vertical integration and preserves area for subpixel circles',()=>{
 for(const[cx,cy,r]of[[.13,.29,.05],[.43,.71,.2],[.23,.31,.6],[-.2,1.3,1.4],[.13,.29,3.7]]){let total=0;for(let y=Math.floor(cy-r);y<Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<Math.ceil(cx+r);x++){const a=dotCoverage(cx,cy,r,x,y);assert.ok(a>=0&&a<=1);let sum=0;const lo=Math.max(x,cx-r),hi=Math.min(x+1,cx+r),steps=12000;for(let k=0;k<steps;k++){const xx=lo+(hi-lo)*(k+.5)/steps,dy=Math.sqrt(Math.max(0,r*r-(xx-cx)**2));sum+=Math.max(0,Math.min(y+1,cy+dy)-Math.max(y,cy-dy));}near(a,sum*(hi-lo)/steps,2e-6);total+=a;}near(total,Math.PI*r*r,1e-11);}
});
test('split, keep and remove obey density thresholds and move retained points to independently calculated weighted centroids',()=>{
 const g=dotCells([[2,2],[6,2],[10,2]],12,4),rho=Float32Array.from({length:48},(_,i)=>[.01,.5,2][Math.floor((i%12)/4)]),lum=new Float32Array(48).fill(.4),m=dotMoments(g,rho,lum,12,4),p={...base,size:1,detail:0,iterations:10,tolerance:100,jitter:0},next=dotStep(g,m,p,1,9),target=Math.PI;
 assert.equal(next.lower,.5);assert.equal(next.upper,1.5);assert.equal(next.removed,1);assert.equal(next.split,2);assert.equal(next.kept,0);for(const point of next.points)assert.ok(point[0]>=0&&point[0]<=12&&point[1]>=0&&point[1]<=4);
 const q={...p,size:Math.sqrt(8/Math.PI)},keep=dotStep(g,m,q,1,9);assert.equal(keep.kept,1);const kept=keep.points[0];near(kept[0],m.x[1]/m.mass[1]);near(kept[1],m.y[1]/m.mass[1]);assert.ok(target>0);
});
test('native density uses every encoded source pixel, luminance polarity, power and a positive floor',()=>{
 const w=1537,h=3,a=image(w,h),saved=a.slice();for(const mode of[0,2])for(const power of[40,240]){const f=dotField(a,w,h,{...base,mode,power});assert.equal(f.rho.length,w*h);for(let i=0;i<w*h;i++){const l=(.2126*a[i*4]+.7152*a[i*4+1]+.0722*a[i*4+2])/255;near(f.luma[i],l);near(f.rho[i],Math.max(1e-4,(mode===2?l:1-l)**(power/100)));}assert.ok(f.centroid.every(Number.isFinite));}assert.deepEqual(a,saved);
});
test('detail makes high-variance dots smaller while uniform regions keep the requested radius',()=>{
 const m={mass:[2,2],l:[1,1],ll:[.5,1]};near(dotRadius(m,0,{...base,size:4,detail:100},2),8);near(dotRadius(m,1,{...base,size:4,detail:100},2),3.6);near(dotRadius(m,1,{...base,size:4,detail:0},2),8);
});
test('point populations adapt to dark and light density without an arbitrary point cap',()=>{
 const uniform=v=>Uint8ClampedArray.from({length:121*89*4},(_,i)=>i%4===3?255:v),dark=dotPlan(uniform(20),121,89,base),light=dotPlan(uniform(230),121,89,base);assert.ok(dark.dots.length>light.dots.length*2);assert.ok(dark.trace.some(x=>x.split)&&light.trace.some(x=>x.removed));assert.equal(dark.trace.length,base.iterations);assert.ok(dark.dots.length>64);near(dark.m.area.reduce((a,b)=>a+b,0),121*89);near(dark.m.mass.reduce((a,b)=>a+b,0),dark.field.mass);const inverse=dotPlan(uniform(230),121,89,{...base,mode:2});assert.ok(inverse.dots.length>light.dots.length);
});
test('drawing uses independent circular area, source colours, black ink and hollow rings',()=>{
 const a=new Uint8ClampedArray(9*9*4).fill(255),dot={point:[4.5,4.5],radius:2,colour:[40,100,220],mass:10,area:20,mean:.5},p={...base,spread:100,paper:100,photo:0};const colour=dotDraw(a,9,9,[dot],p),black=dotDraw(a,9,9,[dot],{...p,mode:1}),ring=dotDraw(a,9,9,[dot],{...p,hollow:60});assert.deepEqual(Array.from(colour.slice(4*9*4+4*4,4*9*4+4*4+3)),dot.colour);assert.equal(black[(4*9+4)*4],0);assert.equal(ring[(4*9+4)*4],255);assert.ok(ring[(4*9+6)*4]<255);
});
test('amount zero returns an owned original and empty-white colour or empty-black light fields remain their backgrounds',()=>{
 const a=image(61,47),saved=a.slice(),out=lbgDots(a,61,47,{...base,amount:0});assert.notEqual(out,a);assert.deepEqual(out,a);assert.deepEqual(a,saved);const white=new Uint8ClampedArray(61*47*4).fill(255);assert.deepEqual(lbgDots(white,61,47,base),white);const black=Uint8ClampedArray.from(white,(_,i)=>i%4===3?255:0);assert.deepEqual(lbgDots(black,61,47,{...base,mode:2,paper:0}),black);
});
test('all twelve controls and seed change the rendered image and restore reproducibly',()=>{
 const w=311,h=229,a=image(w,h),saved=a.slice(),initial=lbgDots(a,w,h,base),changes={size:6,iterations:0,tolerance:0,power:240,detail:0,spread:170,hollow:70,jitter:0,mode:1,paper:20,photo:80,amount:40,seed:123};for(const[key,value]of Object.entries(changes))assert.notDeepEqual(lbgDots(a,w,h,{...base,[key]:value}),initial,key);assert.deepEqual(lbgDots(a,w,h,base),initial);assert.deepEqual(a,saved);
});
test('native one-pixel changes, tiny axes and extreme settings remain finite and preserve ownership',()=>{
 const w=1537,h=7,a=image(w,h),b=a.slice();for(let y=0;y<h;y++)b[(y*w+1201)*4]^=255;assert.notDeepEqual(lbgDots(a,w,h,base),lbgDots(b,w,h,base));for(const[W,H]of[[1,1],[1,31],[31,1],[19,13]]){const input=image(W,H),saved=input.slice(),p={...base,size:2,iterations:24,detail:100,hollow:70,power:240,spread:180,mode:2,paper:0},plan=dotPlan(input,W,H,p),out=dotDraw(input,W,H,plan.dots,p);assert.equal(out.length,input.length);assert.ok(plan.dots.every(d=>[...d.point,d.radius,d.mass,d.area,d.mean,...d.colour].every(Number.isFinite)));for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(input,saved);}
});
test('seeded rendering avoids ambient randomness, separates photos and blends partial amount from floating colours',()=>{
 const w=83,h=61,a=image(w,h),b=image(h,w),original=Math.random;Math.random=()=>{throw Error('ambient randomness');};try{const full=lbgDots(a,w,h,base);lbgDots(b,h,w,{...base,mode:2,paper:0});assert.deepEqual(lbgDots(a,w,h,base),full);const partial=lbgDots(a,w,h,{...base,amount:35});for(let i=0;i<a.length;i++)if(i%4!==3)near(partial[i],a[i]+.35*(full[i]-a[i]),1);}finally{Math.random=original;}
});
test('engine integrates native colour dots and common transparency, mix, monochrome and inversion',()=>{
 const w=67,h=53,a=image(w,h),l=makeLayer('lbgdots');assert.deepEqual(applyFilter(a,w,h,l),lbgDots(a,w,h,l.params));for(let i=3;i<a.length;i+=4)a[i]=i*7%256;const saved=a.slice(),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),invert=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++){near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(invert[i+c],255-full[i+c]);}assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);}assert.deepEqual(a,saved);
});
test('0.45 gates adaptive dots, accepts older flow plates and round-trips every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.lbgdots).controls.length,12);const l=makeLayer('lbgdots');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=44;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('flowplates');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.44'})),[old]);for(const[key,value]of[['size',1.9],['iterations',1.5],['tolerance',-1],['power',241],['hollow',71],['mode',1.5],['seed',.5]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));assert.doesNotThrow(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,size:3.7}}])));let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
