import {test} from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';
import{wovencloth,wovenDefaults,weavePeriod,warpAbove,yarnCrimp,dielectricFresnel,cylinderReflection,wovenPoint,periodicBox,createWovenTile,sampleWovenTile,clearWovenCache,wovenCacheInfo}from'../src/woven-cloth.js';
import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';import{hash}from'../src/pixels.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),base=makeLayer('wovencloth').params;
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const flat=(w,h,v=128)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:v);

test('plain, twill and satin agree with explicit crossing tables, even with zero crimp',()=>{
 const matrices=[[[1,0],[0,1]],[[1,1,0],[0,1,1],[1,0,1]],[[0,1,1,1,1],[1,1,0,1,1],[1,1,1,1,0],[1,0,1,1,1],[1,1,1,0,1]]];
 for(const[mode,rows]of matrices.entries()){const n=rows.length;assert.equal(weavePeriod(mode),n);for(let j=0;j<n;j++)for(let i=0;i<n;i++)for(const shift of[-2,0,3]){assert.equal(warpAbove(i+shift*n,j-shift*n,mode),Boolean(rows[j][i]));const q=wovenPoint(i+.5,j+.5,{...base,weave:mode,crimp:0,gloss:0,coverage:100});assert.ok((rows[j][i]?q[0]:q[2])>0);assert.equal(rows[j][i]?q[2]:q[0],0);near(q[4],0);}}
});

test('crimp stays continuous and its slope agrees with independent finite differences',()=>{
 for(const mode of[0,1,2])for(const vertical of[false,true])for(const x of[.11,.5,.9,1.3,2.5,3.9]){const u=vertical?.5:x,v=vertical?x:.5,eps=1e-6,q=yarnCrimp(u,v,vertical,mode,.18),a=yarnCrimp(u-(vertical?0:eps),v-(vertical?eps:0),vertical,mode,.18),b=yarnCrimp(u+(vertical?0:eps),v+(vertical?eps:0),vertical,mode,.18);near(q.slope,(b.height-a.height)/(2*eps),1e-6);assert.ok(Math.abs(q.height)<=.18+1e-8);}
 for(const mode of[0,1,2])for(let j=0;j<5;j++){const q=yarnCrimp(.5,j+.5,true,mode,.18);near(q.height,warpAbove(0,j,mode)?.18:-.18);near(q.slope,0);}
 near(yarnCrimp(.5,1.2,true,2,0).slope,0);
});

test('dielectric reflectance and cylindrical cone match independent analytic cases',()=>{
 near(dielectricFresnel(1,1.5),.04);near(dielectricFresnel(0,1.5),1);near(cylinderReflection([1,0,0],[0,0,1],[0,0,1],.2),.07978845608028654);
 const theta=.4,ci=Math.cos(theta),eta=1.5,ct=Math.sqrt(1-Math.sin(theta)**2/eta**2),F=.5*((ci-eta*ct)**2/(ci+eta*ct)**2+(eta*ci-ct)**2/(eta*ci+ct)**2);
 near(cylinderReflection([1,0,0],[Math.sin(theta),0,ci],[-Math.sin(theta),0,ci],.12),F/(Math.sqrt(2*Math.PI)*.12));
 near(cylinderReflection([1,0,0],[1,0,0],[0,0,1],.2),0);
});

test('surface cone is reciprocal, tangent-sign invariant and retains normalized lobe area',()=>{
 const t=[0,1,0],wi=[.6,0,.8],wr=[.3,.4,Math.sqrt(.75)];near(cylinderReflection(t,wi,wr,.25),cylinderReflection(t,wr,wi,.25));near(cylinderReflection(t,wi,wr,.25),cylinderReflection([0,-1,0],wi,wr,.25));
 for(const sigma of[.08,.18,.3]){const N=10000,step=Math.PI/N;let integral=0;for(let k=0;k<N;k++){const theta=-Math.PI/2+(k+.5)*step,w=[Math.sin(theta),0,Math.cos(theta)];integral+=cylinderReflection([1,0,0],w,w,sigma)*step;}near(integral,.04,1e-7);}
 near(cylinderReflection(t,[0,0,1],[0,0,1],.1),2*cylinderReflection(t,[0,0,1],[0,0,1],.2));
});

test('periodic footprint agrees with brute box sums, including several wraparounds',()=>{
 const W=7,H=3,C=2,a=Float32Array.from({length:W*H*C},(_,i)=>(i*19%31)/11);
 for(const radius of[0,1,3,8,12]){const out=periodicBox(a,W,H,C,radius),span=2*radius+1;for(let y=0;y<H;y++)for(let x=0;x<W;x++)for(let c=0;c<C;c++){let s=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=((x+dx)%W+W)%W,yy=((y+dy)%H+H)%H;s+=a[(yy*W+xx)*C+c];}near(out[(y*W+x)*C+c],s/span**2,3e-7);}}
 const out=periodicBox(a,W,H,C,100000);for(let c=0;c<C;c++){let mean=0;for(let i=c;i<a.length;i+=C)mean+=a[i]/(W*H);for(let i=c;i<out.length;i+=C)near(out[i],mean,5e-5);}
});

test('tile sampling is periodic and interpolates all material fields across the seam',()=>{
 const tile={w:2,n:2,res:1,v:Float32Array.from({length:20},(_,i)=>Math.floor(i/5)*10+i%5)},out=new Float64Array(5);assert.equal(sampleWovenTile(tile,1,1,out),out);for(let c=0;c<5;c++)near(out[c],15+c);
 for(const u of[-3.7,-.51,.12,1.9])for(const v of[-2.1,.5,2.2]){const a=sampleWovenTile(tile,u,v,new Float64Array(5)),b=sampleWovenTile(tile,u+6,v-4,new Float64Array(5));for(let c=0;c<5;c++)near(a[c],b[c]);}
 const a=sampleWovenTile(tile,-1e-7,.37,new Float64Array(5)),b=sampleWovenTile(tile,1e-7,.37,new Float64Array(5));for(let c=0;c<5;c++)near(a[c],b[c],3e-6);
});

test('subpixel yarns converge to material averages while the photograph keeps native fine detail',()=>{
 const tile=createWovenTile({...base,weave:2,angle:37},.003);for(let c=0;c<5;c++){let min=Infinity,max=-Infinity;for(let i=c;i<tile.v.length;i+=5){min=Math.min(min,tile.v[i]);max=Math.max(max,tile.v[i]);}assert.ok(max-min<.001);}
 const w=1537,h=3,a=flat(w,h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++)a[(y*w+x)*4+c]=x%2?190:60;const saved=a.slice(),out=wovencloth(a,w,h,{...base,size:3,dye:0,gloss:0});let kept=0;for(let x=2;x<w-2;x+=2)if(out[(w+x+1)*4]-out[(w+x)*4]>70)kept++;assert.ok(kept>700);assert.deepEqual(a,saved);
});

test('every material control and seed changes pixels and restores exactly',()=>{
 const w=257,h=193,a=image(w,h),before=a.slice(),original=wovencloth(a,w,h,base),changes={size:25,weave:2,angle:69,coverage:61,crimp:0,gloss:150,roughness:5,light:290,elevation:12,dye:0,split:90,amount:30,seed:914};
 for(const[key,value]of Object.entries(changes)){assert.notDeepEqual(wovencloth(a,w,h,{...base,[key]:value}),original,key);assert.deepEqual(wovencloth(a,w,h,base),original,key+' restores');}assert.deepEqual(a,before);
});

test('opposing thread dyes swap warm and cool colours without needing photo chroma',()=>{
 const w=600,h=600,p={...base,size:30,weave:0,angle:0,light:45,elevation:80,gloss:0,crimp:0,dye:0,split:90},a=flat(w,h),plus=wovencloth(a,w,h,p),minus=wovencloth(a,w,h,{...p,split:-90}),pitch=18,phaseU=hash(13,7,p.seed)*2,phaseV=hash(17,11,p.seed)*2;
 for(const[i,j,vertical]of[[4,4,true],[5,4,false]]){const x=Math.round((i+.5-phaseU)*pitch),y=Math.round((j+.5-phaseV)*pitch),k=(y*w+x)*4;assert.ok(vertical?plus[k]>plus[k+2]:plus[k]<plus[k+2]);assert.ok(vertical?minus[k]<minus[k+2]:minus[k]>minus[k+2]);}
});

test('zero amount returns an owned exact copy and partial amount is a linear encoded blend',()=>{
 clearWovenCache();const w=73,h=47,a=image(w,h),zero=wovencloth(a,w,h,{...base,amount:0});assert.notEqual(zero,a);assert.deepEqual(zero,a);assert.equal(wovenCacheInfo().entries,0);const full=wovencloth(a,w,h,base),half=wovencloth(a,w,h,{...base,amount:50});for(let i=0;i<a.length;i++)if(i%4!==3)near(half[i],(a[i]+full[i])/2,1);
});

test('single pixels, rows, columns and extreme settings return finite opaque owned arrays',()=>{
 for(const[w,h]of[[1,1],[1,17],[17,1],[3,7],[79,101]])for(const weave of[0,1,2]){const a=image(w,h),saved=a.slice(),out=wovencloth(a,w,h,{...base,weave,size:3,coverage:100,crimp:100,roughness:5,gloss:160,light:360,elevation:10,split:-100});assert.equal(out.length,a.length);assert.notEqual(out,a);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);}
});

test('bounded source-free tile cache agrees with fresh renders after every shader and input change',()=>{
 const w=89,h=67,a=image(w,h),changes={size:31,weave:2,angle:29,coverage:70,crimp:11,roughness:9,gloss:144,light:5,elevation:80,dye:0,split:77,seed:713};clearWovenCache();wovencloth(a,w,h,base);assert.ok(wovenCacheInfo().bytes<=320*320*5*4);
 for(const[key,value]of Object.entries(changes)){wovencloth(a,w,h,base);const p={...base,[key]:value},cached=wovencloth(a,w,h,p);clearWovenCache();assert.deepEqual(wovencloth(a,w,h,p),cached,key);assert.equal(wovenCacheInfo().entries,1);}
 for(const[W,H]of[[89,67],[67,89],[97,53]]){const b=image(W,H);b[12]^=255;const cached=wovencloth(b,W,H,base);clearWovenCache();assert.deepEqual(wovencloth(b,W,H,base),cached);}
});

test('common alpha, mix, mono and inversion compose around the cloth operator',()=>{
 const w=31,h=47,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*7)%256;const before=a.slice(),l=makeLayer('wovencloth'),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++)near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(full[i+3],255);}
 const mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inv=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}}),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}});for(let i=0;i<a.length;i+=4){assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){assert.equal(inv[i+c],255-full[i+c]);near(half[i+c],(zero[i+c]+full[i+c])/2,1);}}assert.deepEqual(a,before);
});

test('0.38 introduces cloth, preserves 0.37 graphcut and round-trips all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('wovencloth');assert.equal(filters.find(f=>f.wovencloth).controls.length,12);assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=37;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const old=makeLayer('graphcut');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.37'})),[old]);for(const key of['weave','size','seed'])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:1.5}}])));assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,gloss:161}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
