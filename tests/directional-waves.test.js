import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{makeWaveProfile,makeWaveBank,compileWaveBank,periodicWave,waveField,waveDirections,waveweft}from'../src/aperiodic-wave.js';
import{fft}from'../src/research-spectral.js';import{makeLayer,filters}from'../src/filters.js';import{looks}from'../src/looks.js';import{applyFilter}from'../src/engine.js';import{encodeRecipe,decodeRecipe,ENGINE_VERSION}from'../src/recipes.js';
const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`),image=(w,h)=>Uint8ClampedArray.from({length:w*h*4},(_,i)=>i%4===3?255:(i*37+Math.floor(i/(w*4))*13)%256);
const moments=p=>{let mean=0,variance=0;for(const[k,a]of p.terms)mean+=k*a*a;for(const[k,a]of p.terms)variance+=(k-mean)**2*a*a;return{mean,variance};};

test('Neutral directional controls use exactly the legacy table and field, with omitted controls also neutral',()=>{
 const p=makeLayer('waveweft').params,legacy=makeWaveProfile(24,1+p.band/7,p.seed),bank=makeWaveBank(p.band,100,100,p.seed);assert.ok(!bank.cross);assert.deepEqual(bank,legacy);
 const dirs=waveDirections(p,bank);assert.ok(dirs.every(d=>d.length===4));for(const mode of[1,2,3])assert.deepEqual(waveField(bank,.213,.317,dirs,mode,true),waveField(legacy,.213,.317,dirs,mode,true));
 const w=47,h=61,a=image(w,h),old={...p};delete old.crossfreq;delete old.crossband;assert.deepEqual(waveweft(a,w,h,old),waveweft(a,w,h,p));
});

test('Two spectra share phases per frequency; interpolation is a coherent amplitude sum rather than unrelated noise',()=>{
 const p=makeWaveBank(35,145,220,31),terms=new Map(p.cross.terms.map(t=>[t[0],t]));let shared=0;
 for(const[k,,phase]of p.terms)if(terms.has(k)){near(terms.get(k)[2],phase);shared++;}assert.ok(shared>20);
 const b=.37,gain=1/Math.sqrt((1-b)**2+b*b+2*b*(1-b)*p.correlation),d=[[.6,.8,.12,1,b,gain]],x=.127,y=-.043,t=x*.6+y*.8+.12,q=waveField(p,x,y,d);
 for(let c=0;c<2;c++){const key=c?'im':'re';near(q[c],((1-b)*periodicWave(p[key],t)+b*periodicWave(p.cross[key],t))*gain);}
 // Verify the frequency-domain coefficients independently with a DFT.
 const re=Float64Array.from(p.re,(v,i)=>((1-b)*v+b*p.cross.re[i])*gain),im=Float64Array.from(p.im,(v,i)=>((1-b)*v+b*p.cross.im[i])*gain);fft(re,im);
 const source=new Map(p.terms.map(t=>[t[0],t]));for(const k of[17,24,31,37,49]){const main=source.get(k),cross=terms.get(k),amplitude=((1-b)*(main?.[1]||0)+b*(cross?.[1]||0))*gain,phase=main?.[2]??cross?.[2]??0;near(re[k]/p.size,amplitude*Math.cos(phase));near(im[k]/p.size,amplitude*Math.sin(phase));}
});

test('Frequency and bandwidth controls alter radial distributions while angular strength and primary spectrum stay fixed',()=>{
 const neutral=makeWaveBank(7,100,100,17),dense=makeWaveBank(7,300,100,17),broad=makeWaveBank(7,100,350,17),p=makeLayer('waveweft').params;
 assert.deepEqual(dense.re,neutral.re);assert.deepEqual(broad.re,neutral.re);assert.ok(moments(dense.cross).mean>2.8*moments(neutral).mean);assert.ok(moments(broad.cross).variance>8*moments(neutral).variance);
 const d=waveDirections(p,dense),strong=waveDirections({...p,align:95},dense),other=waveDirections(p,broad);for(let i=0;i<d.length;i++){assert.deepEqual(d[i].slice(0,4),other[i].slice(0,4));near(d[i][4],other[i][4]);near(d[i][4],strong[i][4]);}assert.ok(d.some((v,i)=>v[3]!==strong[i][3]));
});

test('A blended profile has unit complex power for every angular weight, including disjoint spectra',()=>{
 for(const[freq,band]of[[25,25],[100,350],[400,400]]){const p=makeWaveBank(30,freq,band,17);assert.ok(p.correlation>=0&&p.correlation<=1+1e-12);
  for(const b of[0,.13,.5,.89,1]){const gain=1/Math.sqrt((1-b)**2+b*b+2*b*(1-b)*p.correlation);let power=0;for(let i=0;i<p.size;i++)power+=(((1-b)*p.re[i]+b*p.cross.re[i])*gain)**2+(((1-b)*p.im[i]+b*p.cross.im[i])*gain)**2;near(power/p.size,1,1e-10);}
 }
});

test('Angular blending rotates with the axes and uses unit projection vectors, independently of wave amplitudes',()=>{
 const p={...makeLayer('waveweft').params,crossfreq:250,crossband:60},bank=makeWaveBank(p.band,p.crossfreq,p.crossband,p.seed),a=waveDirections(p,bank),b=waveDirections({...p,angle:p.angle+90},bank);
 for(let i=0;i<a.length;i++){near(Math.hypot(a[i][0],a[i][1]),1);near(b[i][0],-a[i][1]);near(b[i][1],a[i][0]);assert.deepEqual(a[i].slice(2),b[i].slice(2));assert.ok(a[i][4]>=0&&a[i][4]<=1&&Number.isFinite(a[i][5]));}
});

test('Directional complex gradients and nearest-wave gradients agree with finite differences',()=>{
 const p={...makeLayer('waveweft').params,crossfreq:250,crossband:65},bank=makeWaveBank(p.band,p.crossfreq,p.crossband,p.seed),d=waveDirections(p,bank),x=.21317,y=.31123,e=1e-7;
 for(const mode of[1,2,3]){const q=waveField(bank,x,y,d,mode,true),xp=waveField(bank,x+e,y,d,mode),xm=waveField(bank,x-e,y,d,mode),yp=waveField(bank,x,y+e,d,mode),ym=waveField(bank,x,y-e,d,mode);near(q[3],(xp[0]-xm[0])/(2*e),2e-5);near(q[4],(yp[0]-ym[0])/(2*e),2e-5);if(mode!==3){near(q[5],(xp[1]-xm[1])/(2*e),2e-5);near(q[6],(yp[1]-ym[1])/(2*e),2e-5);}else{assert.equal(q[2],xp[2]);assert.equal(q[2],yp[2]);}}
});

test('Precompiled directional tables preserve the coherent field, its gradients and nearest-wave owner',()=>{
 for(const mode of[1,2,3]){const p={...makeLayer('waveweft').params,mode,crossfreq:35,crossband:400},bank=makeWaveBank(p.band,p.crossfreq,p.crossband,p.seed),directions=waveDirections(p,bank),compiled=compileWaveBank(bank,directions);
  for(let i=0;i<100;i++){const x=Math.sin(i*.713)*1.4,y=Math.cos(i*.991)*2.3,a=waveField(bank,x,y,directions,mode,true),b=waveField(compiled,x,y,directions,mode,true);for(let j=0;j<a.length;j++)near(a[j],b[j],1e-10);}
 }
 const neutral=makeWaveBank(30,100,100,17);assert.equal(compileWaveBank(neutral,[]),neutral);
});

test('All structural modes retain deterministic restoration, native color sampling and input ownership',()=>{
 const w=47,h=61,a=image(w,h),saved=a.slice(),l=makeLayer('waveweft');
 for(const mode of[1,2,3]){const p={...l.params,mode,crossfreq:35,crossband:180},out=waveweft(a,w,h,p);assert.deepEqual(waveweft(a,w,h,p),out);assert.notDeepEqual(waveweft(a,w,h,{...p,crossfreq:250}),out);assert.notDeepEqual(waveweft(a,w,h,{...p,crossband:400}),out);assert.notDeepEqual(waveweft(a,w,h,{...p,seed:71}),out);assert.deepEqual(waveweft(a,w,h,p),out);assert.ok(out.some((v,i)=>i%4===0&&v!==out[i+1]));for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);}
 assert.deepEqual(a,saved);
 // Two-pixel bars exceed the 384px guide. They still reach the output from
 // original pixels when source displacement is zero and texture is 100.
 const W=768,H=48,bars=new Uint8ClampedArray(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++)bars.set([x%4<2?20:250,x%4<2?20:250,x%4<2?20:250,255],(y*W+x)*4);
 const p={...l.params,mode:3,crossfreq:160,crossband:400,bend:0,memory:0,shift:0,width:10,paper:100},black=new Uint8ClampedArray(bars.length);for(let i=3;i<black.length;i+=4)black[i]=255;
 const out=waveweft(bars,W,H,p),mask=waveweft(black,W,H,p);for(let i=0;i<out.length;i+=4){const expected=Math.round(bars[i]*(1-mask[i]/255)+mask[i]);assert.ok(Math.abs(out[i]-expected)<=1,'native bar modulated by the same wave coverage');}
 let strong=0;for(let y=0;y<H;y++)for(let x=0;x<W-3;x+=4){const i=(y*W+x)*4;if(out[i+8]-out[i]>100)strong++;}assert.ok(strong>.9*W*H/4);
});

test('Thin inputs and extreme supported controls yield finite uncoerced fields and opaque rasters',()=>{
 const l=makeLayer('waveweft');for(const mode of[1,2,3])for(const[freq,band]of[[25,25],[400,400]]){const p={...l.params,mode,crossfreq:freq,crossband:band,frequency:140,band:100,waves:40},bank=makeWaveBank(p.band,freq,band,p.seed),d=waveDirections(p,bank);for(const[x,y]of[[0,0],[.123,.567],[-2.73,3.39]])assert.ok(waveField(bank,x,y,d,mode,true).every(Number.isFinite));for(const[w,h]of[[1,1],[1,31],[37,1]]){const a=Buffer.from(image(w,h)),saved=Buffer.from(a),out=waveweft(a,w,h,p);assert.equal(out.length,a.length);assert.deepEqual(a,saved);for(let i=3;i<out.length;i+=4)assert.equal(out[i],255);}}
});

test('Common alpha, mix and monochrome retain their engine behavior for directional waves',()=>{
 const w=41,h=55,a=image(w,h),l=makeLayer('waveweft');l.params.crossfreq=35;l.params.crossband=180;for(let i=3;i<a.length;i+=4)a[i]=i*19%256;
 const full=applyFilter(a,w,h,l),half=applyFilter(a,w,h,{...l,params:{...l.params,mix:50}}),mono=applyFilter(a,w,h,{...l,params:{...l.params,colorMode:'mono'}});for(let i=0;i<a.length;i+=4){assert.equal(full[i+3],255);assert.equal(mono[i],mono[i+1]);assert.equal(mono[i],mono[i+2]);for(let c=0;c<3;c++){const original=a[i+c]*a[i+3]/255+255-a[i+3];near(half[i+c],(original+full[i+c])/2,.501);}}
 const zero=applyFilter(a,w,h,{...l,params:{...l.params,mix:0}});for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++)near(zero[i+c],a[i+c]*a[i+3]/255+255-a[i+3],.501);
});

test('0.28 gates altered directional settings, upgrades old recipes neutrally and restores all public recipes',()=>{
 assert.equal(ENGINE_VERSION,'0.77');assert.equal(filters.length,129);assert.equal(looks.length,261);const l=makeLayer('waveweft');
 for(let n=11;n<=27;n++){const old={...l.params};delete old.crossfreq;delete old.crossband;assert.deepEqual(decodeRecipe(JSON.stringify({app:'grain-room',version:1,engine:'0.'+n,layers:[{id:l.id,params:old}]})),[l]);for(const change of[{crossfreq:35},{crossband:180}])assert.throws(()=>decodeRecipe(JSON.stringify({app:'grain-room',version:1,engine:'0.'+n,layers:[{id:l.id,params:{...old,...change}}]})));}
 for(const[key,value]of[['crossfreq',24],['crossfreq',401],['crossband',24],['crossband',401],['crossfreq',35.5],['crossband',NaN]])assert.throws(()=>decodeRecipe(encodeRecipe([{...l,params:{...l.params,[key]:value}}])));
 for(const look of looks.filter(l=>l.directionalwaves))assert.deepEqual(decodeRecipe(encodeRecipe(look.layers)),look.layers);
 const g=makeLayer('graphplates');assert.deepEqual(decodeRecipe(JSON.stringify({...JSON.parse(encodeRecipe([g])),engine:'0.27'})),[g]);let count=0;for(const look of looks){const path=new URL('../public/recipes/'+look.id+'.json',import.meta.url);if(fs.existsSync(path)){assert.deepEqual(decodeRecipe(fs.readFileSync(path,'utf8')),look.layers);count++;}}assert.equal(count,234);
});
