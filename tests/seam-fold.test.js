import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{seamDefaults,seamCosts,findForwardSeam,removeGuideSeam,planSeams,seamCoordinate,seamfold,SEAM_EDGE}from'../src/seam-fold.js';
import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const base=makeLayer('seamfold').params,near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const transpose=(a,w,h,stride=4)=>{const b=new a.constructor(a.length);for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<stride;c++)b[(x*h+y)*stride+c]=a[(y*w+x)*stride+c];return b;};
test('forward costs charge the newly joined colours and previous-row diagonal edges',()=>{
 const rgb=Float32Array.from([0,10,50,5,30,60].flatMap(v=>[v,v,v]));assert.deepEqual(seamCosts(rgb,3,2,1,1),{importance:75,up:55,left:60,right:105});assert.deepEqual(seamCosts(rgb,3,2,1,1,0,0),{importance:0,up:0,left:0,right:0});
});
test('DP matches independently enumerated connected paths, including boundaries and first row',()=>{
 for(const[w,h]of[[1,5],[4,1],[3,5],[5,4]])for(const join of[0,100])for(const protect of[0,100,200]){
  const rgb=Float32Array.from({length:w*h*3},(_,i)=>(i*47+i*i*11)%256),p={...base,scatter:0,join,protect},D=(x,y,X,Y)=>{let s=0;for(let c=0;c<3;c++)s+=Math.abs(rgb[(y*w+x)*3+c]-rgb[(Y*w+X)*3+c]);return s/3;};
  const cost=path=>{let s=0;for(let y=0;y<h;y++){const x=path[y],l=Math.max(0,x-1),r=Math.min(w-1,x+1),u=Math.max(0,y-1),d=Math.min(h-1,y+1);s+=(D(l,y,r,y)+D(x,u,x,d))*protect/100+D(l,y,r,y)*join/100;if(y&&path[y-1]!==x)s+=D(x,u,path[y-1]<x?l:r,y)*join/100;}return s;};
  let best=Infinity;const walk=path=>{if(path.length===h){best=Math.min(best,cost(path));return;}for(let x=0;x<w;x++)if(!path.length||Math.abs(x-path.at(-1))<=1)walk([...path,x]);};walk([]);const result=findForwardSeam(rgb,w,h,p);near(result.cost,best);near(cost(result.path),best);for(let y=1;y<h;y++)assert.ok(Math.abs(result.path[y]-result.path[y-1])<=1);
 }
});
test('one removal owns new arrays and retains exact colour and source-coordinate order',()=>{
 const w=4,h=3,rgb=Float32Array.from({length:w*h*3},(_,i)=>i),map=Int32Array.from({length:w*h},(_,i)=>100+i),saved=rgb.slice(),path=Int32Array.from([1,2,1]),out=removeGuideSeam(rgb,map,w,h,path);assert.equal(out.w,3);for(let y=0;y<h;y++){const expected=[0,1,2,3].filter(x=>x!==path[y]);assert.deepEqual(Array.from(out.coordinates.slice(y*3,y*3+3)),expected.map(x=>100+y*4+x));for(let x=0;x<3;x++)assert.deepEqual(out.rgb.slice((y*3+x)*3,(y*3+x+1)*3),rgb.slice((y*4+expected[x])*3,(y*4+expected[x]+1)*3));}assert.deepEqual(rgb,saved);
});
test('repeated paths remove unique original cells; insertion duplicates that same selected set',()=>{
 const w=37,h=23,a=image(w,h),saved=a.slice(),cut=planSeams(a,w,h,base),repeat=planSeams(a,w,h,{...base,operation:1});assert.equal(cut.count,Math.round(w*base.cut/100));assert.equal(cut.w,w-cut.count);assert.equal(repeat.w,w+cut.count);assert.deepEqual(cut.removed,repeat.removed);
 for(let y=0;y<h;y++){const mask=cut.removed.slice(y*w,(y+1)*w),kept=Array.from(cut.coordinates.slice(y*cut.w,(y+1)*cut.w));assert.equal(mask.reduce((s,v)=>s+v,0),cut.count);assert.deepEqual(kept,Array.from({length:w},(_,x)=>x).filter(x=>!mask[x]));const counts=new Uint8Array(w);for(const x of repeat.coordinates.slice(y*repeat.w,(y+1)*repeat.w))counts[x]++;for(let x=0;x<w;x++)assert.equal(counts[x],mask[x]?2:1);}assert.deepEqual(a,saved);
});
test('native interval mapping skips removed cells instead of blending their pixels back in',()=>{
 const plan={w:2,h:1,originalWidth:4,coordinates:Int32Array.from([0,3])};near(seamCoordinate(plan,1,1,8,4)[0],0);near(seamCoordinate(plan,3,1,8,4)[0],1);near(seamCoordinate(plan,5,1,8,4)[0],6);near(seamCoordinate(plan,7,1,8,4)[0],7);assert.equal(seamCoordinate(plan,.5,.5,8,4,0),null);assert.equal(seamCoordinate(plan,7.5,.5,8,4,0),null);
 const wide={...plan,w:5,coordinates:Int32Array.from([0,1,1,2,3])};assert.equal(seamCoordinate(wide,.5,.5,8,4,0),null);assert.ok(seamCoordinate(wide,4,.5,8,4,0));
});
test('horizontal processing equals transposed vertical processing at full guide resolution',()=>{
 const w=37,h=23,a=image(w,h);for(const operation of[0,1])for(const spread of[0,100])assert.deepEqual(seamfold(a,w,h,{...base,direction:1,operation,spread}),transpose(seamfold(transpose(a,w,h),h,w,{...base,direction:0,operation,spread}),h,w));
});
test('planning is bounded while native high-frequency cross-axis rows remain exact',()=>{
 const w=1537,h=67,a=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;a[i]=a[i+1]=a[i+2]=y%2?210:35;a[i+3]=255;}const saved=a.slice(),plan=planSeams(a,w,h,{...base,cut:75});assert.ok(Math.max(plan.guideWidth,plan.guideHeight)<=SEAM_EDGE);assert.deepEqual(seamfold(a,w,h,{...base,cut:75}),a);assert.deepEqual(a,saved);
});
test('all eight controls and seed change native output and restore exactly',()=>{
 const w=113,h=79,a=image(w,h),saved=a.slice(),original=seamfold(a,w,h,base),changes={cut:70,direction:1,operation:1,protect:0,join:0,scatter:100,spread:0,amount:45,seed:914};for(const[key,value]of Object.entries(changes)){assert.notDeepEqual(seamfold(a,w,h,{...base,[key]:value}),original,key);assert.deepEqual(seamfold(a,w,h,base),original,key+' restores');}assert.deepEqual(a,saved);
});
test('zero cut and zero amount return owned originals; partial blend uses original pixels',()=>{
 const w=47,h=31,a=image(w,h);a[3]=42;for(const p of[{...base,amount:0},{...base,cut:0}]){const out=seamfold(a,w,h,p);assert.notEqual(out,a);assert.deepEqual(out,a);}const full=seamfold(a,w,h,base),half=seamfold(a,w,h,{...base,amount:50});for(let i=0;i<a.length;i++)if(i%4!==3)near(half[i],(a[i]+full[i])/2,1);
});
test('one-pixel axes and extreme parameters keep dimensions, ownership and opaque processed output',()=>{
 for(const[w,h]of[[1,1],[1,17],[17,1],[3,7],[79,101]])for(const direction of[0,1])for(const operation of[0,1]){const a=image(w,h),saved=a.slice(),out=seamfold(a,w,h,{...base,cut:75,direction,operation,protect:200,join:0,scatter:100,spread:0});assert.equal(out.length,a.length);assert.notEqual(out,a);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);}
});
test('fresh photo and changed dimensions are planned without retained image state',()=>{
 const a=image(47,31),expected=seamfold(a,47,31,base);seamfold(image(39,57),39,57,{...base,direction:1,operation:1});const b=a.slice();for(let i=0;i<b.length;i++)if(i%4!==3)b[i]^=255;assert.notDeepEqual(seamfold(b,47,31,base),expected);assert.deepEqual(seamfold(a,47,31,base),expected);
});
test('engine handles transparency, mix, monochrome and inversion around the seam operation',()=>{
 const w=31,h=47,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*7)%256;const saved=a.slice(),l=makeLayer('seamfold'),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++){near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(inverted[i+c],255-full[i+c]);}assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);}assert.deepEqual(a,saved);
});
test('0.39 introduces seams, preserves 0.38 cloth and round-trips all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.seamfold).controls.length,8);const l=makeLayer('seamfold');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=38;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('wovencloth');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.38'})),[old]);for(const key of['cut','direction','operation','seed'])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:1.5}}])));assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,cut:76}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
