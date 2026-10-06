import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{shockDefaults,shockBox,shockRadius,shockGuide,shockStep,shockLines}from'../src/shock-lines.js';import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const base=makeLayer('shocklines').params,near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const smooth=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:125+40*Math.sin(Math.floor(i/4)%w/17+i%4)+35*Math.cos(Math.floor(i/(4*w))/23)+(i*13%17));
test('native box averaging matches an independent square-neighbour sum, including clamped boundaries',()=>{
 for(const[w,h]of[[1,1],[1,5],[5,1],[7,5]])for(const r of[0,1,3,8]){const original=Float32Array.from({length:w*h},(_,i)=>(i*17%29)/29),out=shockBox(original.slice(),w,h,r,new Float32Array(w*h));for(let y=0;y<h;y++)for(let x=0;x<w;x++){let sum=0;for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++)sum+=original[Math.max(0,Math.min(h-1,y+dy))*w+Math.max(0,Math.min(w-1,x+dx))];near(out[y*w+x],sum/(2*r+1)**2);}}
 assert.equal(shockRadius(0),0);assert.equal(shockRadius(3),3);assert.equal(shockRadius(10),10);
});
test('Godunov erosion, dilation and a softened sign match literal one-step slopes',()=>{
 const a=Float32Array.from([.5,.3,.5,.2,.5,.8,.5,.7,.5].flatMap(v=>[v,v*.8,v*.6]));for(const dir of[-1,-.75,0,.75,1]){const out=shockStep(a,Float32Array.from({length:9},()=>dir),3,3);for(let c=0;c<3;c++)near(out[12+c],(.5-.4*dir*Math.sqrt(.3**2+.2**2))*[1,.8,.6][c]);}
});
test('a local peak spreads during dilation and shrinks during erosion without overshooting',()=>{
 const a=new Float32Array(3*3*3);a[12]=a[13]=a[14]=1;const grown=shockStep(a,Float32Array.from({length:9},()=>-1),3,3),cut=shockStep(a,Float32Array.from({length:9},()=>1),3,3);near(grown[12],1);near(grown[3],.4);near(cut[12],1-.4*Math.sqrt(2));near(cut[3],0);
});
test('each update obeys its five-point local minimum and maximum for arbitrary bounded signs',()=>{
 for(const[w,h]of[[1,1],[1,17],[17,1],[19,13]]){let a=Float32Array.from({length:w*h*3},(_,i)=>(i*47%211)/19-4),sign=Float32Array.from({length:w*h},(_,i)=>Math.sin(i*1.9));for(let k=0;k<20;k++){const saved=a.slice(),out=shockStep(a,sign,w,h);assert.deepEqual(a,saved);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<3;c++){const n=[y*w+x,y*w+Math.max(0,x-1),y*w+Math.min(w-1,x+1),Math.max(0,y-1)*w+x,Math.min(h-1,y+1)*w+x].map(i=>a[i*3+c]);assert.ok(out[(y*w+x)*3+c]>=Math.min(...n)-1e-6);assert.ok(out[(y*w+x)*3+c]<=Math.max(...n)+1e-6);}a=out;}}
});
test('the fixed-sign update is monotone in every independent neighbour value',()=>{
 const a=Float32Array.from({length:5*5*3},(_,i)=>(i*13%37)/37),sign=Float32Array.from({length:25},(_,i)=>Math.sin(i)),before=shockStep(a,sign,5,5);for(let i=0;i<a.length;i++){const b=a.slice();b[i]+=.2;const after=shockStep(b,sign,5,5);for(let j=0;j<a.length;j++)assert.ok(after[j]>=before[j]-1e-6);}
});
test('zero guide signs and constant RGB retain every native value',()=>{
 const a=Float32Array.from({length:37*23*3},(_,i)=>(i*19%41)/41);assert.deepEqual(shockStep(a,new Float32Array(37*23),37,23),a);const image=Uint8ClampedArray.from({length:37*23*4},(_,i)=>[31,129,214,255][i%4]),saved=image.slice();assert.ok(shockGuide(image,37,23,base).every(v=>v===0));assert.deepEqual(shockLines(image,37,23,{...base,time:64}),image);assert.deepEqual(image,saved);
});
test('a shared RGB guide stays bounded and detects curved intensity even on one-dimensional axes',()=>{
 const w=97,h=3,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:110+90*Math.sin(Math.floor(i/4)%w/11)),saved=a.slice(),g=shockGuide(a,w,h,{...base,scale:1,softness:0});assert.ok(g.some(v=>v===1));assert.ok(g.some(v=>v===-1));assert.ok(g.every(v=>v>=-1&&v<=1));assert.deepEqual(a,saved);const rotated=shockGuide(a,w,h,{...base,scale:1,turn:90});assert.ok(rotated.every(v=>Math.abs(v)<1e-10));
});
test('native 1537px alternating colour differences are evolved from their actual adjacent pixels',()=>{
 const w=1537,h=3,a=Float32Array.from({length:w*h*3},(_,i)=>Math.floor(i/3)%w%2?.75:.25),sign=Float32Array.from({length:w*h},()=>1),out=shockStep(a,sign,w,h);for(let y=0;y<h;y++)for(let x=1;x<w-1;x++)for(let c=0;c<3;c++)near(out[(y*w+x)*3+c],x%2?.55:.25);
});
test('all eight controls alter the image and restore it exactly without a random layout',()=>{
 const w=239,h=167,a=smooth(w,h),saved=a.slice(),initial=shockLines(a,w,h,base),changes={time:48,scale:9,integration:30,follow:0,turn:65,bias:45,softness:100,amount:45};for(const[key,value]of Object.entries(changes)){assert.notDeepEqual(shockLines(a,w,h,{...base,[key]:value}),initial,key);assert.deepEqual(shockLines(a,w,h,base),initial,key+' restores');}assert.deepEqual(a,saved);assert.equal(filters.find(f=>f.shocklines).random,false);
});
test('zero time or amount owns the original and partial blending uses the actual source',()=>{
 const w=47,h=31,a=image(w,h);a[3]=42;for(const p of[{...base,time:0},{...base,amount:0}]){const out=shockLines(a,w,h,p);assert.notEqual(out,a);assert.deepEqual(out,a);}const full=shockLines(a,w,h,base),half=shockLines(a,w,h,{...base,amount:50});for(let i=0;i<a.length;i++)if(i%4!==3)near(half[i],(full[i]+a[i])/2,1);
});
test('tiny axes and extreme guidance preserve dimensions, ownership and opaque processed output',()=>{
 for(const[w,h]of[[1,1],[1,17],[17,1],[3,7],[79,101]]){const a=image(w,h),saved=a.slice(),out=shockLines(a,w,h,{...base,time:64,scale:16,integration:40,follow:0,turn:-90,bias:-100,softness:0});assert.equal(out.length,a.length);assert.notEqual(out,a);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);}
});
test('changing photographs and dimensions does not reuse a previous guide',()=>{
 const a=smooth(47,31),expected=shockLines(a,47,31,base);shockLines(image(39,57),39,57,{...base,turn:65,bias:30});const b=a.slice();for(let i=0;i<b.length;i++)if(i%4!==3)b[i]^=255;assert.notDeepEqual(shockLines(b,47,31,base),expected);assert.deepEqual(shockLines(a,47,31,base),expected);
});
test('engine handles alpha, mix, monochrome and inversion around the growth',()=>{
 const w=31,h=47,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*7)%256;const saved=a.slice(),l=makeLayer('shocklines'),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++){near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(inverted[i+c],255-full[i+c]);}assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);}assert.deepEqual(a,saved);
});
test('0.41 adds shock lines, keeps 0.40 colour planes and round-trips every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.shocklines).controls.length,8);const l=makeLayer('shocklines');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=40;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('domaincolour');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.40'})),[old]);assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,time:1.5}}])));for(const[key,value]of[['time',65],['scale',.5],['integration',41],['turn',91],['bias',-101],['amount',101]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
