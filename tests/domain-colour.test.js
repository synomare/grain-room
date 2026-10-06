import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{domainDefaults,domainSigmas,domainPositions,domainBoxLine,domainRecursiveLine,filterDomain,domainStylePixel,domainColour}from'../src/domain-colour.js';
import{filters,makeLayer}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const base=makeLayer('domaincolour').params,near=(a,b,e=1e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
test('pass widths halve and preserve the requested sum of variances',()=>{
 for(const n of[1,2,3,5]){const widths=domainSigmas(12,n);near(widths.reduce((s,v)=>s+v*v,0),144);for(let i=1;i<n;i++)near(widths[i-1],widths[i]*2);}assert.deepEqual(domainSigmas(0,3),[0,0,0]);
});
test('RGB differences stretch one shared increasing coordinate, including near equal-luminance colours',()=>{
 const a=Uint8ClampedArray.from([255,0,0,255,0,76,0,255,0,76,0,255]),saved=a.slice(),p=domainPositions(a,3,1,true,0,2,.5);near(p[1],1+4*331/255);near(p[2]-p[1],1);assert.deepEqual(p,domainPositions(a,1,3,false,0,2,.5));assert.deepEqual(a,saved);assert.ok(p[1]>6);
});
test('moving windows match an independent search on nonuniform positions and exact endpoints',()=>{
 const positions=Float64Array.from([0,1,2,7,7.5,8,19]),values=Float64Array.from({length:21},(_,i)=>(i*23+i*i)%41),saved=values.slice();
 for(const radius of[0,.5,1,2,5,50]){const counts=new Uint16Array(7),out=domainBoxLine(values,positions,radius,undefined,counts);for(let k=0;k<7;k++){const selected=Array.from(positions,(_,i)=>i).filter(i=>Math.abs(positions[i]-positions[k])<=radius);assert.equal(counts[k],selected.length);for(let c=0;c<3;c++)near(out[k*3+c],selected.reduce((s,i)=>s+values[i*3+c],0)/selected.length);}}assert.deepEqual(values,saved);
});
test('recursive coefficients and finite endpoint initialization match an analytic impulse',()=>{
 const values=Float64Array.from([0,0,0,1,1,1,0,0,0]),saved=values.slice(),sigma=Math.sqrt(2)/Math.log(2),out=domainRecursiveLine(values,Float64Array.from([0,1,2]),sigma);for(let c=0;c<3;c++){near(out[c],.1875);near(out[3+c],.375);near(out[6+c],.25);}assert.deepEqual(values,saved);
 const stretched=domainRecursiveLine(values,Float64Array.from([0,1,101]),sigma);assert.ok(stretched[3]>.49);assert.ok(stretched[6]<1e-29);
});
test('both native filters preserve constants and remain convex on bounded RGB input',()=>{
 const w=17,h=13,guide=image(w,h),rgb=Float32Array.from({length:w*h*3},(_,i)=>(i*29%101)/100),saved=rgb.slice(),gs=guide.slice();for(const method of[0,1]){const out=filterDomain(rgb,guide,w,h,4,.4,3,method);assert.notEqual(out,rgb);assert.ok(out.every(v=>v>=0&&v<=1));const constant=Float32Array.from({length:rgb.length},(_,i)=>[.125,.5,.875][i%3]);assert.deepEqual(filterDomain(constant,guide,w,h,4,.4,5,method),constant);}assert.deepEqual(rgb,saved);assert.deepEqual(guide,gs);
});
test('original RGB guidance prevents a strong step from being averaged across its boundary',()=>{
 const w=41,h=9,guide=new Uint8ClampedArray(w*h*4),rgb=new Float32Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const v=x<20?0:1;for(let c=0;c<3;c++){guide[(y*w+x)*4+c]=255*v;rgb[(y*w+x)*3+c]=v;}guide[(y*w+x)*4+3]=255;}
 for(const method of[0,1]){const kept=filterDomain(rgb,guide,w,h,8,.01,3,method),flat=filterDomain(rgb,new Uint8ClampedArray(guide.length),w,h,8,.01,3,method);assert.ok(kept[(4*w+19)*3]<1e-4);assert.ok(kept[(4*w+20)*3]>.9999);assert.ok(flat[(4*w+19)*3]>.2);assert.ok(flat[(4*w+20)*3]<.8);}
});
test('detail, mean-centred tone and contour darkness match a literal colour calculation',()=>{
 const out=domainStylePixel([.8,.4,.2],[.6,.5,.3],[.4,.4,.4],{...domainDefaults,detail:150,tone:50,edge:50},.1);for(let c=0;c<3;c++)near(out[c],[.8,.3,.2][c]*.88);
});
test('native 1537px high-frequency pixels recover exactly without a reduced reference',()=>{
 const w=1537,h=67,a=image(w,h),saved=a.slice();for(const method of[0,1])assert.deepEqual(domainColour(a,w,h,{...base,size:100,range:100,passes:5,method,detail:100}),a);assert.deepEqual(a,saved);
});
test('all eight controls change the image and restore exactly; there is no random layout control',()=>{
 const w=239,h=167,a=Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:125+40*Math.sin(Math.floor(i/4)%w/17+i%4)+35*Math.cos(Math.floor(i/(4*w))/23)+(i*13%17)),saved=a.slice(),initial=domainColour(a,w,h,base),changes={size:90,range:95,passes:5,method:1,detail:190,tone:65,edge:90,amount:45};for(const[key,value]of Object.entries(changes)){assert.notDeepEqual(domainColour(a,w,h,{...base,[key]:value}),initial,key);assert.deepEqual(domainColour(a,w,h,base),initial,key+' restores');}assert.deepEqual(a,saved);assert.equal(filters.find(f=>f.domaincolour).random,false);
});
test('zero processing owns the original and partial blending uses its actual colour',()=>{
 const w=47,h=31,a=image(w,h);a[3]=42;const zero=domainColour(a,w,h,{...base,amount:0});assert.notEqual(zero,a);assert.deepEqual(zero,a);const full=domainColour(a,w,h,base),half=domainColour(a,w,h,{...base,amount:50});for(let i=0;i<a.length;i++)if(i%4!==3)near(half[i],(a[i]+full[i])/2,1);const opaque=image(w,h);assert.deepEqual(domainColour(opaque,w,h,{...base,size:0}),opaque);
});
test('tiny axes, extremes and fresh image dimensions retain ownership and finite opaque output',()=>{
 for(const[w,h]of[[1,1],[1,17],[17,1],[3,7],[79,101]])for(const method of[0,1]){const a=image(w,h),saved=a.slice(),out=domainColour(a,w,h,{...base,size:100,range:1,passes:5,method,detail:250,tone:180,edge:100});assert.equal(out.length,a.length);assert.notEqual(out,a);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);}
 const a=image(47,31),expected=domainColour(a,47,31,base);domainColour(image(39,57),39,57,{...base,method:1});const b=a.slice();for(let i=0;i<b.length;i++)if(i%4!==3)b[i]^=255;assert.notDeepEqual(domainColour(b,47,31,base),expected);assert.deepEqual(domainColour(a,47,31,base),expected);
});
test('engine applies transparency, mix, monochrome and inversion around domain filtering',()=>{
 const w=31,h=47,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=(i*7)%256;const saved=a.slice(),l=makeLayer('domaincolour'),full=applyFilter(a,w,h,l),zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}}),inverted=applyFilter(a,w,h,{...l,params:{...l.params,invert:true}});for(let i=0;i<a.length;i+=4){for(let c=0;c<3;c++){near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.5);assert.equal(inverted[i+c],255-full[i+c]);}assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i+1],mono[i+2]);}assert.deepEqual(a,saved);
});
test('0.40 introduces domain colour, preserves 0.39 seams and round-trips every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);assert.equal(filters.find(f=>f.domaincolour).controls.length,8);const l=makeLayer('domaincolour');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=39;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));const old=makeLayer('seamfold');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.39'})),[old]);for(const key of['passes','method'])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:1.5}}])));for(const[key,value]of[['range',0],['passes',6],['method',2],['detail',251]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
