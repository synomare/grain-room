import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {roughPlane,specklePupil,illuminationModes,coherentIntensity,incoherentIntensity,linearSpeckleGuide,specklePlan,renderSpecklePlan,speckleField,toLinear,toEncoded,reflectIndex} from '../src/speckle-field.js';
import {makeLayer,filters} from '../src/filters.js';import {looks} from '../src/looks.js';import {applyFilter} from '../src/engine.js';import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
const p=makeLayer('specklefield').params,near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
function directKernel(pupil,n){const re=new Float64Array(n*n),im=re.slice();for(let y=0;y<n;y++)for(let x=0;x<n;x++)for(let ky=0;ky<n;ky++)for(let kx=0;kx<n;kx++){const phi=2*Math.PI*(kx*x+ky*y)/n,value=pupil[ky*n+kx]/(n*n);re[y*n+x]+=value*Math.cos(phi);im[y*n+x]+=value*Math.sin(phi);}return {re,im};}

test('Coherent convolution matches independent direct DFT and mode intensities are averaged rather than fields',()=>{
 const n=8,height=Float64Array.from({length:n*n},(_,i)=>Math.sin(i*1.7)),amplitude=Float64Array.from(height,(_,i)=>.3+(i%9)/12),pupil=specklePupil(2.2,40,23,n),modes=[{x:0,y:0,weight:.3},{x:1,y:-1,weight:.7}],phase=2.3,K=directKernel(pupil,n),out=coherentIntensity(amplitude,height,pupil,modes,phase,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let expected=0;for(const mode of modes){let re=0,im=0;for(let v=0;v<n;v++)for(let u=0;u<n;u++){const xx=(x-u+n)%n,yy=(y-v+n)%n,i=yy*n+xx,j=v*n+u,theta=phase*height[i]+2*Math.PI*(mode.x*xx+mode.y*yy)/n,r=amplitude[i]*Math.cos(theta),s=amplitude[i]*Math.sin(theta);re+=r*K.re[j]-s*K.im[j];im+=r*K.im[j]+s*K.re[j];}expected+=mode.weight*(re*re+im*im);}near(out[y*n+x],expected);}
 const first=coherentIntensity(amplitude,height,pupil,[{...modes[0],weight:1}],phase,n),second=coherentIntensity(amplitude,height,pupil,[{...modes[1],weight:1}],phase,n);for(let i=0;i<out.length;i++)near(out[i],.3*first[i]+.7*second[i]);
});

test('The incoherent reference is an independently checked normalized intensity convolution with positive energy',()=>{
 const n=8,pupil=specklePupil(3,50,43,n),K=directKernel(pupil,n),power=Float64Array.from(K.re,(v,i)=>v*v+K.im[i]**2),sum=power.reduce((s,v)=>s+v,0),source=Float64Array.from({length:n*n},(_,i)=>(i%7)/8),out=incoherentIntensity(source,pupil,n);
 for(let y=0;y<n;y++)for(let x=0;x<n;x++){let expected=0;for(let yy=0;yy<n;yy++)for(let xx=0;xx<n;xx++)expected+=source[yy*n+xx]*power[((y-yy+n)%n)*n+(x-xx+n)%n]/sum;near(out[y*n+x],expected);assert.ok(out[y*n+x]>=0);}
 near(out.reduce((s,v)=>s+v,0),source.reduce((s,v)=>s+v,0));const constant=new Float64Array(n*n).fill(.31);incoherentIntensity(constant,pupil,n).forEach(v=>near(v,.31));
});

test('Gaussian rough planes are repeatable with measured zero mean/unit RMS and their correlation changes the spectrum',()=>{
 const a=roughPlane(17,.6,64),b=roughPlane(17,.6,64),large=roughPlane(17,4,64);assert.deepEqual(a,b);assert.notDeepEqual(a,roughPlane(914,.6,64));near(a.reduce((s,v)=>s+v,0)/a.length,0);near(a.reduce((s,v)=>s+v*v,0)/a.length,1);assert.ok(a.every(Number.isFinite));
 const gradient=q=>{let total=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++)total+=(q[y*64+x]-q[y*64+(x+1)%64])**2;return total/q.length;};assert.ok(gradient(large)<gradient(a)/5);
});

test('Pupil shape and illumination directions share one surface; all weights are positive and zero spread is one coherent mode',()=>{
 const pupil=specklePupil(3,90,32,64),other=specklePupil(3,90,87,64);assert.ok(pupil.every(v=>v>=0&&v<=1));assert.equal(pupil[0],1);assert.notDeepEqual(pupil,other);const modes=illuminationModes(80,pupil,64);near(modes.reduce((s,v)=>s+v.weight,0),1);assert.ok(modes.every(v=>Number.isInteger(v.x)&&Number.isInteger(v.y)&&v.weight>0));assert.deepEqual(illuminationModes(0,pupil,64),[{x:0,y:0,weight:1}]);
 const height=roughPlane(17,.8,64),amp=new Float64Array(64*64).fill(1),many=coherentIntensity(amp,height,pupil,modes,5,64),average=new Float64Array(many.length);for(const m of modes){const one=coherentIntensity(amp,height,pupil,[{...m,weight:1}],5,64);for(let i=0;i<one.length;i++)average[i]+=m.weight*one[i];}many.forEach((v,i)=>near(v,average[i]));
});

test('Linear-light area averaging does not average encoded sRGB and reflection maintains a finite edge extension',()=>{
 const a=new Uint8ClampedArray([0,0,0,255,255,255,255,255]),g=linearSpeckleGuide(a,2,1,1);assert.equal(g.w,1);assert.equal(g.h,1);g.rgb.forEach(v=>near(v,.5));near(toEncoded(.5),.7353569830524495);for(const v of [0,.02,.2,.7,1])near(toLinear(toEncoded(v)),v);
 assert.equal(reflectIndex(-1,4),0);assert.equal(reflectIndex(-2,4),1);assert.equal(reflectIndex(4,4),3);assert.equal(reflectIndex(8,4),0);assert.equal(reflectIndex(10000,1),0);
});

test('The RGB wavelength proxies retain the same rough plane and guide; neutral color is one intensity field',()=>{
 const a=image(21,29),plan=specklePlan(a,21,29,p,{n:64,edge:24}),mono=specklePlan(a,21,29,{...p,color:0},{n:64,edge:24});assert.equal(plan.fields.length,3);assert.equal(mono.fields.length,1);assert.deepEqual(plan.height,mono.height);assert.deepEqual(plan.modes,mono.modes);assert.notDeepEqual(plan.fields[0],plan.fields[2]);
 for(const q of [plan,mono]){assert.ok(q.fields.every(a=>a.every(v=>Number.isFinite(v)&&v>=0)));assert.ok(q.references.every(a=>a.every(v=>Number.isFinite(v)&&v>=0)));assert.ok(q.gain.every(a=>a.every(v=>Number.isFinite(v)&&v>=0)));}
});

test('Native two-pixel detail is retained through gain compositing and physical intensity view follows its field',()=>{
 const w=768,h=4,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set(Math.floor((i/4)%w/2)%2?[160,100,70,255]:[80,60,40,255],i);const plan={w:2,h:2,gain:[new Float64Array(4).fill(1)],fields:[new Float64Array(4).fill(.25)]};assert.deepEqual(renderSpecklePlan(a,w,h,plan,{...p,amount:100,structure:100,color:0}),a);
 const out=renderSpecklePlan(a,w,h,plan,{...p,amount:100,structure:0,color:0}),encoded=Math.round(toEncoded(.25)*255);for(let i=0;i<out.length;i+=4)assert.deepEqual([...out.slice(i,i+4)],[encoded,encoded,encoded,255]);
});

test('Black, tiny, narrow and extreme plans are finite before byte conversion; neutral mode owns its Buffer copy',()=>{
 for(const [w,h]of[[1,1],[1,37],[35,1],[9,13]])for(const black of [false,true]){const a=black?new Uint8ClampedArray(w*h*4):image(w,h);for(let i=3;i<a.length;i+=4)a[i]=255;const saved=a.slice(),q={...p,size:70,surface:30,roughness:100,stretch:100,spread:100,structure:0,color:100},plan=specklePlan(a,w,h,q,{n:64,edge:24});assert.ok(plan.fields.every(a=>a.every(Number.isFinite)));assert.ok(plan.references.every(a=>a.every(Number.isFinite)));assert.ok(plan.gain.every(a=>a.every(Number.isFinite)));const out=renderSpecklePlan(a,w,h,plan,q);assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);}
 const a=Buffer.from(image(7,9)),saved=Buffer.from(a),out=speckleField(a,7,9,{...p,amount:0});assert.deepEqual(Buffer.from(out),a);out[0]=255-a[0];assert.deepEqual(a,saved);
});

test('All nine controls and seed change a nonconstant image and restore deterministic pixels',()=>{
 const a=image(37,49),base=speckleField(a,37,49,p);for(const change of [{amount:90},{size:55},{surface:23},{roughness:30},{spread:90},{stretch:90},{angle:125},{structure:0},{color:95},{seed:914}]){assert.notDeepEqual(speckleField(a,37,49,{...p,...change}),base,JSON.stringify(change));assert.deepEqual(speckleField(a,37,49,p),base);}
});

test('Common alpha/mix/monochrome keep their meaning and no active render mutates an owned input',()=>{
 const w=21,h=29,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('specklefield'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...p,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono'}});for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}assert.deepEqual(a,saved);
});

test('0.33 gates the new effect and retains free-character 0.32 recipes and all public examples',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('specklefield');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=32;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 const glyph=makeLayer('glyphcontours');glyph.params.alphabet=3;glyph.params.characters='光/ e\u0301';assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([glyph])),engine:'0.32'})),[glyph]);
 for(const [key,value]of[['amount',101],['size',9],['surface',31],['roughness',-1],['spread',101],['stretch',101],['angle',181],['structure',101],['color',101],['seed',1.5],['angle',12.5],['unknown',1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...p,[key]:value}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
