import test from 'node:test';
import assert from 'node:assert/strict';
import {pupilProfile,pupilKernel,convolveAxis,pupilPSF} from '../src/pupil-psf.js';
import {makeLayer} from '../src/filters.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe} from '../src/recipes.js';
const near=(a,b,eps=1e-6)=>assert.ok(Math.abs(a-b)<eps,`${a} versus ${b}`);
const sum=a=>a.reduce((s,v)=>s+v,0);
const image=(w,h,v=130)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:v);
const p=makeLayer('pupilpsf').params;

test('Finite pupil gives unit, nonnegative intensity; zero phase retains diffraction',()=>{
 for(const c of [-35,0,35])for(const focus of [-35,0,35])for(const aperture of [40,100]){
  const profile=pupilProfile(c,focus,aperture);near(sum(profile),1,1e-12);assert.ok(profile.every(v=>Number.isFinite(v)&&v>=0));
  for(const radius of [.01,2,45,368.64]){const k=pupilKernel(radius,c,focus,aperture);near(sum(k.weights),1,1e-12);assert.ok(k.retained>0&&k.retained<=1+1e-12);assert.ok(k.weights.every(v=>Number.isFinite(v)&&v>=0));}
 }
 const k=pupilKernel(45,0,0);assert.ok(k.weights[k.radius]<.9);
});

test('Cubic phase sign mirrors the asymmetric PSF; quadratic phase changes the profile',()=>{
 const a=pupilKernel(40,20,4).weights,b=pupilKernel(40,-20,4).weights;
 for(let i=0;i<a.length;i++)near(a[i],b[a.length-1-i],1e-12);
 assert.ok(a.reduce((s,v,i)=>s+Math.abs(v-a[a.length-1-i]),0)>.5);
 assert.notDeepEqual(pupilKernel(40,0,0).weights,pupilKernel(40,0,15).weights);
});

test('FFT convolution matches direct convolution, including asymmetric kernels and reflected edges',()=>{
 for(const [w,h] of [[1,1],[1,93],[89,1],[93,71]])for(const vertical of [false,true]){
  const input=Float32Array.from({length:w*h},(_,i)=>((i*17)%97)/97),a=input.slice(),b=input.slice(),k=pupilKernel(17,23,-7).weights;
  convolveAxis(input,a,w,h,k,vertical,'direct');convolveAxis(input,b,w,h,k,vertical,'fft');
  for(let i=0;i<a.length;i++)near(a[i],b[i],2e-7);
 }
});

test('Impulse response has the kernel orientation and unit energy away from boundaries',()=>{
 const w=129,h=129,n=w*h,input=new Float32Array(n),tmp=input.slice(),out=input.slice();input[64*w+64]=1;
 const kx=pupilKernel(19,21,4),ky=pupilKernel(19,-11,2);
 convolveAxis(input,tmp,w,h,kx.weights);convolveAxis(tmp,out,w,h,ky.weights,true);
 near(sum(out),1);
 for(let y=-19;y<=19;y++)for(let x=-19;x<=19;x++)near(out[(64+y)*w+64+x],kx.weights[x+19]*ky.weights[y+19],1e-8);
 input.fill(0);input[0]=1;convolveAxis(input,tmp,w,h,kx.weights);assert.ok(Math.abs(tmp[w-1])<1e-10);
});

test('Constants including black and white remain constant; tiny images remain finite',()=>{
 for(const [w,h] of [[1,1],[1,27],[31,1],[79,91]])for(const v of [0,73,188,255]){
  const a=image(w,h,v);assert.deepEqual(pupilPSF(a,w,h,{...p,spread:90,light:100}),a);
 }
});

test('Photon mixing uses linear intensity, not the average of encoded bytes',()=>{
 const w=91,h=1,a=image(w,h,0);for(let x=45;x<w;x++)a[x*4]=a[x*4+1]=a[x*4+2]=255;
 const params={...p,spread:90,tailX:0,tailY:0,focus:0,astig:0,light:100};
 const k=pupilKernel(90*w/1000,0,0).weights,input=Float32Array.from({length:w},(_,x)=>x>=45?1:0),expected=new Float32Array(w);
 convolveAxis(input,expected,w,h,k);const out=pupilPSF(a,w,h,params);
 for(let x=0;x<w;x++){const v=expected[x],encoded=255*(v<=.0031308?12.92*v:1.055*v**(1/2.4)-.055);assert.ok(Math.abs(out[x*4]-encoded)<.501);}
 assert.ok(out[44*4]>expected[44]*255+10);
});

test('Zero, deterministic restoration, input immutability, alpha and mono respect the engine contract',()=>{
 const a=image(91,73);for(let i=0;i<a.length;i+=4){a[i]=i%256;a[i+1]=(i*17)%256;a[i+2]=(i*3)%256;}
 const saved=a.slice(),l=makeLayer('pupilpsf'),out=applyFilter(a,91,73,l);
 l.params.tailX=-20;assert.notDeepEqual(applyFilter(a,91,73,l),out);l.params.tailX=p.tailX;l.params.seed=44;assert.deepEqual(applyFilter(a,91,73,l),out);assert.deepEqual(a,saved);
 for(const key of ['spread','light','mix'])assert.deepEqual(applyFilter(a,91,73,{...l,params:{...l.params,[key]:0}}),a);
 l.params.colorMode='mono';const mono=applyFilter(a,91,73,l);for(let i=0;i<mono.length;i+=4)assert.ok(mono[i]===mono[i+1]&&mono[i]===mono[i+2]&&mono[i+3]===255);
 const transparent=image(13,17,0);for(let i=3;i<transparent.length;i+=4)transparent[i]=0;assert.deepEqual(applyFilter(transparent,13,17,l),image(13,17,255));
});

test('Recipe 0.20 round trips; prior engines reject the new effect and 0.19 hook recipes still load',()=>{
 const l=makeLayer('pupilpsf');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let v=2;v<20;v++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+v})));
 const old=makeLayer('artisticscreen');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine:'0.19'})),[old]);
 for(const [key,value] of [['spread',91],['tailX',36],['light',-1],['aperture',39]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
});
