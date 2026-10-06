import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{phaseScreen,phaseBasis,phaseSlope,apertureProjector,projectAperture,screenAt,lightCoefficientField,coefficientAt,apertureRays,localLightKernel,reflectPosition,renderLightSheet,lightSheet}from'../src/light-sheet.js';
import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{decodeRecipe,encodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const p=makeLayer('lightsheet').params,near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256),constantField=(coeff,w=2,h=2,radius=13)=>({w,h,radius,fields:coeff.map(v=>new Float64Array(w*h).fill(v))});

test('The shared finite phase screen has zero mean, unit RMS, deterministic seeds and periodic bilinear samples',()=>{
 const a=phaseScreen(17,18,64),b=phaseScreen(17,18,64),other=phaseScreen(18,18,64);assert.deepEqual(a,b);assert.notDeepEqual(a,other);near(a.value.reduce((s,v)=>s+v,0)/a.value.length,0);near(a.value.reduce((s,v)=>s+v*v,0)/a.value.length,1);assert.ok(a.value.every(Number.isFinite));near(screenAt(a,-.25,5.7),screenAt(a,63.75,5.7));near(screenAt(a,9.25,-3.2),screenAt(a,9.25,60.8));
});

test('Disk least squares separates piston, tip/tilt, focus, astigmatism and coma without discrete-basis leakage',()=>{
 const projector=apertureProjector(),expected=[.7,-.4,.1,.3,.2,-.15,.09,-.06],sample=(x,y)=>phaseBasis(x,y).reduce((s,v,i)=>s+v*expected[i],0),c=projectAperture(sample,0,0,1,projector);for(let i=0;i<c.length;i++)near(c[i],expected[i]);
 const a=2,b=.3,d=.11,e=.13,f=-.04,cross=-.07,cx=4,cy=7,r=3,poly=(x,y)=>a+b*x+cross*y+d*x*x+e*x*y+f*y*y,q=projectAperture(poly,cx,cy,r,projector),known=[poly(cx,cy)+(d+f)*r*r/4,(b+2*d*cx+e*cy)*r/2,(cross+e*cx+2*f*cy)*r/2,(d+f)*r*r/(4*Math.sqrt(3)),e*r*r/(2*Math.sqrt(6)),(d-f)*r*r/(2*Math.sqrt(6)),0,0];for(let i=0;i<q.length;i++)near(q[i],known[i],1e-8);
 const piston=projectAperture(()=>5,11,-4,15,projector);near(piston[0],5);assert.ok(piston.slice(1).every(v=>Math.abs(v)<1e-10));
});

test('Geometric ray displacement is the derivative of the same projected phase, including aperture coordinate scale',()=>{
 const coeff=[.8,.13,-.23,.3,.1,.05,-.02,.04],u=.23,v=-.17,epsilon=1e-6,value=(x,y)=>phaseBasis(x,y).reduce((s,b,i)=>s+b*coeff[i],0),slope=phaseSlope(coeff,u,v);near(slope[0],(value(u+epsilon,v)-value(u-epsilon,v))/(2*epsilon),1e-8);near(slope[1],(value(u,v+epsilon)-value(u,v-epsilon))/(2*epsilon),1e-8);
 const pure=localLightKernel([100,.5,-.2,0,0,0,0,0],{...p,strength:100,tilt:100,blur:100},10,1000);for(const ray of pure){near(ray.x,26);near(ray.y,-10.4);}near(pure.reduce((s,q)=>s+q.weight,0),1);assert.ok(apertureRays(64).every(q=>q.u*q.u+q.v*q.v<1));
 const out=localLightKernel(coeff,{...p,strength:100,tilt:100,blur:100},13,500);const large=localLightKernel(coeff,{...p,strength:100,tilt:100,blur:100},13,1000);for(let i=0;i<out.length;i++){near(out[i].x*2,large[i].x);near(out[i].y*2,large[i].y);}
});

test('Tilt and defocus at neighboring apertures retain the phase relation of one screen rather than independent fields',()=>{
 const k=.035,r=10,projector=apertureProjector(),sample=x=>Math.cos(k*x),at0=projectAperture(sample,0,0,r,projector),quarter=projectAperture(sample,Math.PI/(2*k),0,r,projector),half=projectAperture(sample,Math.PI/k,0,r,projector);near(at0[1],0);assert.ok(Math.abs(at0[3])>.005);assert.ok(Math.abs(quarter[1])>.1);near(quarter[3],0);near(half[3],-at0[3]);near(quarter[2],0);
 const screen=phaseScreen(17,18,64),field=lightCoefficientField(600,900,p,{screen,longNodes:7}),node=2+3*field.w,cx=32+(2/(field.w-1)-.5)*32*600/900,cy=32+(3/(field.h-1)-.5)*32,reference=projectAperture((x,y)=>screenAt(screen,x,y),cx,cy,field.radius,projector);for(let j=0;j<8;j++)near(field.fields[j][node],reference[j]);
 const fields2=lightCoefficientField(1200,1800,p,{screen,longNodes:7});assert.deepEqual(field.fields,fields2.fields);assert.equal(field.w,5);assert.equal(field.h,7);
});

test('Output-coordinate modal interpolation is continuous and the ray kernel preserves piston neutrality',()=>{
 const expected=[3,.4,-.1,.2,.3,-.05,.06,.04],f=constantField(expected);for(const x of [0,.2,.5,1])for(const y of [0,.3,1])coefficientAt(f,x,y).forEach((v,i)=>near(v,expected[i]));
 f.fields[1].set([0,2,4,6]);near(coefficientAt(f,.25,.75)[1],3.5);const before=localLightKernel(coefficientAt(f,.25,.75),p,13);f.fields[0].fill(999);assert.deepEqual(localLightKernel(coefficientAt(f,.25,.75),p,13),before);
 const same=coefficientAt(f,.5-1e-8,.7),across=coefficientAt(f,.5+1e-8,.7);assert.ok(Math.abs(same[1]-across[1])<1e-6);
});

test('Native two-pixel bars survive neutral phase; constant tilt translates the original instead of a coarse photograph',()=>{
 const w=768,h=4,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4){const v=Math.floor((i/4)%w/2)%2?160:80;a.set([v+10,v,v-10,255],i);}const f=constantField([0,0,0,0,0,0,0,0]);assert.deepEqual(renderLightSheet(a,w,h,f,p),a);
 const dx=2,gain=260*1*w/1000/f.radius;f.fields[1].fill(dx/(2*gain));const shifted=renderLightSheet(a,w,h,f,{...p,strength:100,tilt:100,blur:0});for(let x=2;x<w;x++)for(let c=0;c<3;c++)assert.equal(shifted[x*4+c],a[(x-2)*4+c]);
 const tiny=new Uint8ClampedArray(9*9*4);for(let i=3;i<tiny.length;i+=4)tiny[i]=255;tiny.set([255,255,255,255],(4*9+4)*4);const tilt=constantField([0,1/(2*(260*.009/13)),0,0,0,0,0,0]),out=renderLightSheet(tiny,9,9,tilt,{...p,strength:100,blur:0});assert.equal(out[(4*9+5)*4],255);assert.equal(out[(4*9+4)*4],0);
});

test('Disk integration uses linear RGB for real focus blur, preserves constants and reflects edges without wrapping',()=>{
 const f=constantField([0,0,0,.2,.04,.03,0,0]),w=19,h=17,a=new Uint8ClampedArray(w*h*4);for(let i=0;i<a.length;i+=4)a.set([73,127,188,255],i);assert.deepEqual(renderLightSheet(a,w,h,f,{...p,strength:180,blur:180,rays:64}),a);
 near(reflectPosition(-1,7),0);near(reflectPosition(-2,7),1);near(reflectPosition(7,7),6);near(reflectPosition(8,7),5);near(reflectPosition(10000,1),0);
 const edge=new Uint8ClampedArray(51*51*4);for(let i=3;i<edge.length;i+=4)edge[i]=255;for(let y=0;y<51;y++)for(let x=0;x<25;x++)edge.set([255,255,255,255],(y*51+x)*4);const settings={...p,strength:100,tilt:0,blur:100,rays:64},blurred=renderLightSheet(edge,51,51,f,settings);assert.equal(blurred[0],255);assert.equal(blurred[(25*51+50)*4],0);assert.ok(blurred[(25*51+25)*4]>0);assert.ok(blurred[(25*51+25)*4]<255);
 const energy=localLightKernel(coefficientAt(f,.5,.5),settings,13,51).reduce((s,q)=>s+Math.max(0,Math.min(1,25-reflectPosition(25-q.x,51)))*q.weight,0),encoded=energy<=.0031308?12.92*energy:1.055*energy**(1/2.4)-.055;near(blurred[(25*51+25)*4],encoded*255,.501);assert.ok(Math.abs(blurred[(25*51+25)*4]-energy*255)>20);
});

test('Tiny, narrow and extreme projected coefficients and ray coordinates remain finite before byte conversion',()=>{
 for(const [w,h]of[[1,1],[1,37],[35,1],[5,7],[32,48]])for(const scale of [4,70]){
  const q={...p,scale,aperture:100,strength:180,tilt:150,blur:180,rays:8},a=Buffer.from(image(w,h)),saved=Buffer.from(a),field=lightCoefficientField(w,h,q);assert.ok(field.fields.every(a=>a.every(Number.isFinite)));for(const coord of [[0,0],[.5,.5],[1,1]])assert.ok(localLightKernel(coefficientAt(field,...coord),q,field.radius,Math.max(w,h)).every(q=>Number.isFinite(q.x)&&Number.isFinite(q.y)));
  const out=lightSheet(a,w,h,q);assert.equal(out.length,a.length);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);assert.deepEqual(a,saved);out[0]=255-a[0];assert.deepEqual(a,saved);
 }
 const a=Buffer.from(image(7,9)),saved=Buffer.from(a);for(const q of [{...p,strength:0},{...p,tilt:0,blur:0}]){const out=lightSheet(a,7,9,q);assert.deepEqual(Buffer.from(out),a);out[0]=255-a[0];assert.deepEqual(a,saved);}
});

test('All controls and seed change pixels and restore deterministic output with common alpha/mix/monochrome',()=>{
 const w=48,h=64,a=image(w,h);for(let i=3;i<a.length;i+=4)a[i]=i*19%256;const saved=a.slice(),l=makeLayer('lightsheet'),full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...p,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...p,colorMode:'mono'}});
 for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++)near(half[i+c],(a[i+c]*a[i+3]/255+255-a[i+3]+full[i+c])/2,.501);}
 for(const change of [{strength:120},{scale:60},{aperture:90},{tilt:0},{blur:75},{rays:8},{seed:914}]){assert.notDeepEqual(applyFilter(a,w,h,{...l,params:{...p,...change}}),full,JSON.stringify(change));assert.deepEqual(applyFilter(a,w,h,l),full);}assert.deepEqual(a,saved);
});

test('0.31 recipes gate new light modes and retain 0.30 joint, 0.29 phase, 0.28 waves and every public example',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('lightsheet');assert.deepEqual(decodeRecipe(encodeRecipe([l])),[l]);for(let n=2;n<=30;n++)assert.throws(()=>decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([l])),engine:'0.'+n})));
 for(const [id,engine]of[['jointtexture','0.30'],['phasefold','0.29'],['waveweft','0.28']]){const old=makeLayer(id);if(id==='waveweft')old.params.crossfreq=35;assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([old])),engine})),[old]);}
 for(const [key,v]of[['strength',181],['scale',3],['aperture',101],['tilt',151],['blur',181],['rays',7],['rays',65],['rays',12.5],['unknown',1]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...p,[key]:v}}])));
 let count=0;for(const file of fs.readdirSync(new URL('../public/recipes/',import.meta.url)).filter(f=>f.endsWith('.json'))){const look=looks.find(l=>l.id===file.slice(0,-5));assert.ok(look);assert.deepEqual(decodeRecipe(fs.readFileSync(new URL('../public/recipes/'+file,import.meta.url),'utf8')),look.layers);count++;}assert.equal(count,234);
});
