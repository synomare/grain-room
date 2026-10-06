import test from 'node:test';
import assert from 'node:assert/strict';
import {gaussianScratchLine,scratchLineTable,sampleScratchLine,scratchProfile,scratchGeometry,scratchLightPlan,renderScratchLightPlan,scratchLight} from '../src/scratch-light.js';
import {toLinear,toEncoded,linearSpeckleGuide} from '../src/speckle-field.js';
import {makeLayer,filters} from '../src/filters.js';
import {looks} from '../src/looks.js';
import {applyFilter} from '../src/engine.js';
import {encodeRecipe,decodeRecipe,ENGINE_VERSION} from '../src/recipes.js';
import fs from 'node:fs';
const base={count:160,length:180,width:200,depth:170,direction:25,scatter:70,coherence:20,light:135,tilt:25,photo:100,amount:60,follow:75,seed:17};
const image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,a+' differs from '+b+'; tolerance '+t);
function directLine(L,s,f,u,N=262144){
 let r=0,q=0;const step=L/N;
 for(let i=0;i<N;i++){const x=-L/2+(i+.5)*step-u,g=Math.exp(-x*x/(2*s*s))*step,p=-2*Math.PI*f*x;r+=g*Math.cos(p);q+=g*Math.sin(p);}
 return [r,q];
}
test('Gaussian line quadrature agrees with independent midpoint integration and the infinite-line limit',()=>{
 for(const [L,s,f,u] of [[2,.6,0,0],[18,.6,.7,0],[18,1.2,.37,7],[40,.25,1.5,19.7],[10,3,.1,8],[3,1,.4,-2]]){
  const a=gaussianScratchLine(L,s,f,u),b=directLine(L,s,f,u);near(a[0],b[0],2e-7);near(a[1],b[1],2e-7);
 }
 near(gaussianScratchLine(30,1,.2)[0],Math.sqrt(2*Math.PI)*Math.exp(-2*Math.PI*Math.PI*.2*.2),6e-9);
 near(gaussianScratchLine(30,1,.2)[1],0,1e-12);
 const pos=gaussianScratchLine(8,1,.4,2),neg=gaussianScratchLine(8,1,.4,-2);near(pos[0],neg[0],1e-12);near(pos[1],-neg[1],1e-12);
 assert.deepEqual(gaussianScratchLine(4,1,.4,12),[0,0]);
});
test('line tables track direct finite integrals at centers, ends and outside the footprint',()=>{
 for(const [L,s,f] of [[18,.6,.7],[40,.25,1.5],[5,2,0],[40,2,.5]]){
  const table=scratchLineTable(L,s,f);
  for(const u of [-table.extent,-L/2-.17,-L/2+.13,-.29,0,L/2-.13,L/2+.17,table.extent]){
   const a=sampleScratchLine(table,u),b=directLine(L,s,f,u);near(a[0],b[0],.003*s);near(a[1],b[1],.003*s);
  }
  assert.deepEqual(sampleScratchLine(table,table.extent+.01),[0,0]);
 }
});
test('rectangular profiles subtract the base mask and match direct transverse complex integration',()=>{
 for(const [W,D,f,l,path] of [[.2,.17,.6,.44,1.9],[.8,.36,1.7,.7,1.5],[.2,0,.3,.52,2],[0,.3,.3,.52,2]]){
  const a=scratchProfile(W,D,f,l,path);let r=0,q=0;const N=8192,step=W/N,phase=2*Math.PI*path*D/l;
  for(let j=0;j<N;j++){const x=-W/2+(j+.5)*step,p=-2*Math.PI*f*x,dr=1-Math.cos(phase),di=-Math.sin(phase);r+=step*(dr*Math.cos(p)-di*Math.sin(p));q+=step*(dr*Math.sin(p)+di*Math.cos(p));}
  near(a[0],r,1e-7);near(a[1],q,1e-7);
 }
 near(scratchProfile(1,.2,1,.52,2)[0],0,1e-15);near(scratchProfile(1,.2,1,.52,2)[1],0,1e-15);
});
function directPixel(plan,x,y,coherent=true,steps=8192){
 const rgb=[0,0,0],total=[0,0,0],path=1+plan.gamma,n=plan.spatialSamples;
 for(let k=0;k<9;k++){
  const l=.4+k*.0375,sensor=[Math.exp(-.5*((l-.625)/.052)**2),Math.exp(-.5*((l-.535)/.047)**2),Math.exp(-.5*((l-.445)/.043)**2)];let average=0;
  for(let sy=0;sy<n;sy++)for(let sx=0;sx<n;sx++){
   const X=(x+(sx+.5)/n)/plan.w*plan.geometry.W,Y=(y+(sy+.5)/n)/plan.h*plan.geometry.H;
   const B=2*Math.PI*plan.sigma**2*Math.exp(-2*Math.PI**2*plan.sigma**2*(plan.qx**2+plan.qy**2)/l**2);
   let re=B,im=0,isolated=B*B;
   for(const s of plan.geometry.scratches){
    const dx=X-s.x,dy=Y-s.y,u=dx*s.tx+dy*s.ty,v=-dx*s.ty+dy*s.tx;
    if(Math.abs(v)>4*plan.sigma||Math.abs(u)>s.length/2+4*plan.sigma)continue;
    let r=0,q=0,step=s.length/steps;
    for(let j=0;j<steps;j++){
     const t=-s.length/2+(j+.5)*step,rx=s.x+t*s.tx-X,ry=s.y+t*s.ty-Y,g=Math.exp(-(rx*rx+ry*ry)/(2*plan.sigma**2)),p=-2*Math.PI*(plan.qx*rx+plan.qy*ry)/l;
     r+=step*g*Math.cos(p);q+=step*g*Math.sin(p);
    }
    const b=(-plan.qx*s.ty+plan.qy*s.tx)/l,z=Math.PI*s.width*b,A=s.width*(Math.abs(z)<1e-12?1:Math.sin(z)/z),p=2*Math.PI*path*s.depth/l;
    const dr=A*(1-Math.cos(p)),di=-A*Math.sin(p),R=dr*r-di*q,I=dr*q+di*r;re-=R;im-=I;isolated+=R*R+I*I;
   }
   average+=plan.gamma/(Math.PI*plan.sigma**2*l*l)*(coherent?re*re+im*im:isolated)/(n*n);
  }
  for(let c=0;c<3;c++){rgb[c]+=average*sensor[c];total[c]+=sensor[c];}
 }
 return rgb.map((v,c)=>v/total[c]);
}
test('coherent fields and pixel intensity averages agree with independent direct geometry integration',()=>{
 const p={...base,count:24,coherence:50,tilt:15},plan=scratchLightPlan(image(64,64),64,64,p);
 let peak=0;for(let i=1;i<plan.fields[1].length;i++)if(plan.fields[1][i]>plan.fields[1][peak])peak=i;
 assert.ok(plan.fields[1][peak]>.01);const direct=directPixel(plan,peak%plan.w,Math.floor(peak/plan.w));
 for(let c=0;c<3;c++)near(plan.fields[c][peak],direct[c],Math.max(1e-5,Math.abs(direct[c])*.015));
 const center=scratchLightPlan(image(64,64),64,64,p,{spatialSamples:1});assert.ok(center.fields[1].some((v,i)=>Math.abs(v-plan.fields[1][i])>.02));
});
test('interference uses a complex sum including the base rather than separate scratch intensities',()=>{
 const a=image(48,48),p={...base,count:100,coherence:60,tilt:12},co=scratchLightPlan(a,48,48,p),inc=scratchLightPlan(a,48,48,p,{coherent:false});
 assert.deepEqual(co.geometry,inc.geometry);assert.ok(co.fields[1].some((v,i)=>Math.abs(v-inc.fields[1][i])>.03));
 let peak=0;for(let i=1;i<inc.fields[1].length;i++)if(inc.fields[1][i]>inc.fields[1][peak])peak=i;
 const direct=directPixel(inc,peak%inc.w,Math.floor(peak/inc.w),false);
 for(let c=0;c<3;c++)near(inc.fields[c][peak],direct[c],Math.max(1e-5,Math.abs(direct[c])*.015));
 const flat=scratchLightPlan(a,48,48,{...p,depth:0});for(const f of flat.fields)assert.ok(f.every(v=>Math.abs(v-f[0])<1e-14));
});
test('one deterministic geometry is shared across wavelengths, footprint samples and illumination controls',()=>{
 const g=linearSpeckleGuide(image(40,60),40,60),p={...base,count:30},geometry=scratchGeometry(g,p);
 assert.equal(geometry.scratches.length,30);assert.deepEqual(geometry,scratchGeometry(g,p));
 assert.deepEqual(geometry,scratchGeometry(g,{...p,light:25,tilt:40,coherence:90}));
 assert.deepEqual(geometry.scratches,scratchGeometry(g,{...p,count:50}).scratches.slice(0,30));assert.notDeepEqual(geometry,scratchGeometry(g,{...p,seed:18}));
 assert.ok(geometry.scratches.every(s=>s.x>=0&&s.x<geometry.W&&s.y>=0&&s.y<geometry.H&&s.width>0&&s.depth>0&&Math.abs(s.tx*s.tx+s.ty*s.ty-1)<1e-14));
 const black={...g,rgb:g.rgb.map(()=>0)},white={...g,rgb:g.rgb.map(()=>1)};
 assert.deepEqual(scratchGeometry(black,{...p,follow:0}),scratchGeometry(white,{...p,follow:0}));assert.notDeepEqual(scratchGeometry(black,{...p,follow:100}),scratchGeometry(white,{...p,follow:100}));
});
test('native detail stays independent of the optical guide and photo attenuation uses linear light',()=>{
 const w=768,h=2,a=image(w,h),plan={w:1,h:1,fields:[new Float64Array(1),new Float64Array(1),new Float64Array(1)]};
 assert.deepEqual(renderScratchLightPlan(a,w,h,plan,{amount:100,photo:100}),a);
 const out=renderScratchLightPlan(a,w,h,plan,{amount:100,photo:50});
 for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(out[i+c],255*toEncoded(toLinear(a[i+c]/255)*.5),.501);
});
test('narrow and black images keep finite fields at extremes and neutral Buffers are owned copies',()=>{
 for(const [w,h] of [[1,1],[1,37],[35,1]]){
  const a=image(w,h).map((v,i)=>i%4===3?255:0),p={...base,count:20,length:400,width:800,depth:600,coherence:0,tilt:60,scatter:100};
  const plan=scratchLightPlan(a,w,h,p);assert.ok(plan.fields.every(f=>f.every(v=>Number.isFinite(v)&&v>=0)));
  const out=renderScratchLightPlan(a,w,h,plan,p);assert.equal(out.length,a.length);assert.ok(out.every((v,i)=>i%4!==3||v===255));
 }
 const input=Buffer.from(image(7,5)),out=scratchLight(input,7,5,{...base,amount:0});assert.deepEqual(out,new Uint8ClampedArray(input));out[0]^=255;assert.notEqual(input[0],out[0]);
});

test('all twelve controls and the seed change the actual image and restore deterministically',()=>{
 const a=image(64,64),saved=a.slice(),p=makeLayer('scratchlight').params,original=scratchLight(a,64,64,p);
 for(const change of [{count:260},{length:300},{width:600},{depth:400},{direction:115},{scatter:5},{coherence:75},{light:30},{tilt:10},{photo:20},{amount:90},{follow:0},{seed:914}])assert.notDeepEqual(scratchLight(a,64,64,{...p,...change}),original,JSON.stringify(change));
 assert.deepEqual(scratchLight(a,64,64,p),original);assert.deepEqual(a,saved);
});
test('the common pipeline preserves alpha composition, mix and true monochrome output',()=>{
 const w=21,h=29,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('scratchlight');l.params.count=30;
 const full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}assert.deepEqual(a,saved);
});
test('0.34 introduces scratch light while keeping speckle, free characters and every public recipe',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('scratchlight');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);
 for(let n=2;n<=33;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const bad of [{unknown:1},{count:401},{count:20.5},{depth:Infinity},{light:'30'}])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,...bad}}])));
 const speckle=makeLayer('specklefield');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([speckle])),engine:'0.33'})),[speckle]);
 const glyph=makeLayer('glyphcontours');glyph.params.alphabet=3;glyph.params.characters='光/ e\u0301';assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([glyph])),engine:'0.32'})),[glyph]);
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
